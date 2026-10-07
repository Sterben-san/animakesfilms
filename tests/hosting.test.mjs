import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { hostingConfig } from '../server/config.mjs';
import { loadAdminAccount } from '../server/infrastructure/admin-account.mjs';
import { createPortfolioServer } from '../scripts/server.mjs';
import { populatedPortfolio } from './helpers/fixture.mjs';

test('production configuration requires HTTPS and durable storage; local mode stays loopback', () => {
  assert.equal(hostingConfig({}, '/app').host, '127.0.0.1');
  const valid = { NODE_ENV: 'production', APP_URL: 'https://film.example', PORTFOLIO_DATA_DIR: '/data', PORT: '4040' };
  assert.equal(hostingConfig(valid, '/app').host, '0.0.0.0');
  assert.equal(hostingConfig(valid, '/app').port, 4040);
  for (const override of [{ APP_URL: '' }, { APP_URL: 'http://film.example' }, { APP_URL: 'https://film.example/path' }, { PORT: 'NaN' }, { PORT: '0' }, { PORTFOLIO_DATA_DIR: '.local' }, { PORTFOLIO_DATA_DIR: '/app/data' }]) assert.throws(() => hostingConfig({ ...valid, ...override }, '/app'));
  assert.equal(hostingConfig({ ...valid, PORTFOLIO_DATA_DIR: '', DATABASE_URL: 'mysql://configured' }, '/app').publicOrigin, valid.APP_URL);
});

test('real MySQL: full portfolio, media recovery, conflicts and redeploy persistence', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  if (!new URL(process.env.TEST_DATABASE_URL).pathname.endsWith('_test')) throw new Error('The disposable database name must end in _test; refusing to delete tables.');
  const { default: mysql } = await import('mysql2/promise');
  const pool = mysql.createPool(process.env.TEST_DATABASE_URL);
  t.after(() => pool.end());
  // TEST_DATABASE_URL must refer to an isolated test database, never production.
  for (const table of ['portfolio_state', 'portfolio_admin', 'portfolio_media']) await pool.query(`DROP TABLE IF EXISTS ${table}`);
  const env = { DATABASE_URL: process.env.TEST_DATABASE_URL, PORTFOLIO_ADMIN_EMAIL: 'mysql-test@example.com', PORTFOLIO_ADMIN_PASSWORD: 'MySqlTestPassword123!' };
  const origin = 'https://mysql-film.example';
  let server, port;
  const start = async () => {
    server = await createPortfolioServer({ env, publicOrigin: origin });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); port = server.address().port;
  };
  const stop = async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); };
  t.after(async () => { if (server?.listening) await stop(); });
  const headers = { Host: 'mysql-film.example', Origin: origin, 'Content-Type': 'application/json' };
  const login = async () => {
    const res = await http(port, '/api/login', { method: 'POST', headers, body: JSON.stringify({ email: env.PORTFOLIO_ADMIN_EMAIL, password: 'MySqlTestPassword123!' }) });
    assert.equal(res.status, 200);
    return { ...headers, Cookie: res.headers['set-cookie'][0].split(';')[0], 'X-CSRF-Token': res.json().csrf };
  };
  await start(); let auth = await login();
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
  const upload = await http(port, '/api/admin/media', { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png', 'X-File-Name': 'portrait.png' }, body: png });
  assert.equal(upload.status, 201); const media = upload.json();
  assert.deepEqual((await http(port, media.url, { headers })).bytes, png);
  const initial = (await http(port, '/api/admin/content', { headers: auth })).json();
  const content = populatedPortfolio(media.url);
  assert.equal((await http(port, '/api/admin/content', { method: 'PUT', headers: auth, body: JSON.stringify({ revision: String(initial.revision), content }) })).status, 409);
  const save = () => http(port, '/api/admin/content', { method: 'PUT', headers: auth, body: JSON.stringify({ revision: initial.revision, content }) });
  const results = await Promise.all([save(), save()]); assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const fileRoute = '/api/admin/media/' + media.url.slice(9);
  assert.equal((await http(port, fileRoute + '/archive', { method: 'POST', headers: auth })).status, 409);
  const metadata = await http(port, fileRoute, { method: 'PATCH', headers: auth, body: JSON.stringify({ name: 'Hosted portrait', alt: 'Author portrait' }) });
  assert.equal(metadata.status, 200);
  const unused = (await http(port, '/api/admin/media', { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png' }, body: png })).json();
  const unusedRoute = '/api/admin/media/' + unused.url.slice(9);
  assert.equal((await http(port, unusedRoute + '/archive', { method: 'POST', headers: auth })).status, 200);
  assert.equal((await http(port, unused.url, { headers })).status, 404);
  assert.equal((await http(port, '/api/admin/media?trash=1', { headers: auth })).json().length, 1);
  await stop(); env.PORTFOLIO_ADMIN_PASSWORD = 'ChangedBootstrapPassword123!';
  await start(); auth = await login();
  const after = (await http(port, '/api/admin/content', { headers: auth })).json();
  assert.equal(after.revision, initial.revision + 1); assert.deepEqual(after.content, content);
  assert.equal((await http(port, '/api/admin/media', { headers: auth })).json()[0].name, 'Hosted portrait');
  assert.deepEqual((await http(port, media.url, { headers })).bytes, png);
  const publicPage = (await http(port, '/', { headers })).bytes.toString();
  assert.ok(publicPage.includes('Verification Author')); assert.ok(!publicPage.includes('PRIVATE PROJECT'));
  assert.equal((await http(port, '/projects/verification-film', { headers })).status, 200);
  assert.equal((await http(port, unusedRoute + '/restore', { method: 'POST', headers: auth })).status, 200);
  assert.deepEqual((await http(port, unused.url, { headers })).bytes, png);
  // Exercise the actual upload ceiling against database packet limits.
  const large = Buffer.alloc(10 * 1024 * 1024); png.copy(large);
  assert.equal((await http(port, '/api/admin/media', { method: 'POST', headers: { ...auth, 'Content-Type': 'image/png' }, body: large })).status, 201);
});

export function http(port, path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, bytes: Buffer.concat(chunks), json: () => JSON.parse(Buffer.concat(chunks).toString()) }));
    });
    req.on('error', reject); if (body) req.write(body); req.end();
  });
}

test('hosted HTTPS origin, secure cookies, CSRF, unknown hosts and first-start account preservation', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'hosted-portfolio-'));
  const env = { PORTFOLIO_ADMIN_EMAIL: 'hosted@example.com', PORTFOLIO_ADMIN_PASSWORD: 'TestHostedPassword123!' };
  t.after(() => rm(dir, { recursive: true, force: true }));
  await assert.rejects(loadAdminAccount(dir, {}), /Administrator missing/);
  const account = await loadAdminAccount(dir, env);
  assert.notEqual(account.hash, env.PORTFOLIO_ADMIN_PASSWORD);
  assert.ok(!(await readFile(join(dir, 'admin.json'), 'utf8')).includes(env.PORTFOLIO_ADMIN_PASSWORD));
  assert.deepEqual(await loadAdminAccount(dir, { ...env, PORTFOLIO_ADMIN_PASSWORD: 'DifferentPassword123!' }), account);
  const origin = 'https://film.example';
  const server = await createPortfolioServer({ dataDir: dir, env: {}, publicOrigin: origin });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const port = server.address().port;
  assert.equal((await http(port, '/health')).status, 200);
  assert.equal((await http(port, '/', { headers: { Host: 'attacker.example', 'X-Forwarded-Host': 'film.example' } })).status, 403);
  assert.equal((await http(port, '/', { headers: { Host: 'film.example' } })).status, 200);
  const headers = { Host: 'film.example', Origin: origin, 'Content-Type': 'application/json' };
  const body = JSON.stringify({ email: env.PORTFOLIO_ADMIN_EMAIL, password: env.PORTFOLIO_ADMIN_PASSWORD });
  assert.equal((await http(port, '/api/login', { method: 'POST', headers: { ...headers, Origin: 'http://film.example' }, body })).status, 403);
  const login = await http(port, '/api/login', { method: 'POST', headers, body });
  assert.equal(login.status, 200);
  assert.match(login.headers['set-cookie'][0], /; Secure/);
  const auth = { ...headers, Cookie: login.headers['set-cookie'][0].split(';')[0], 'X-CSRF-Token': login.json().csrf };
  const record = (await http(port, '/api/admin/content', { headers: auth })).json();
  record.content.site.name = 'Hosted filmmaker';
  assert.equal((await http(port, '/api/admin/content', { method: 'PUT', headers: auth, body: JSON.stringify(record) })).status, 200);
  assert.equal((await http(port, '/api/admin/content', { method: 'PUT', headers: { ...auth, 'X-CSRF-Token': 'wrong' }, body: JSON.stringify(record) })).status, 403);
  const logout = await http(port, '/api/logout', { method: 'POST', headers: auth });
  assert.equal(logout.status, 200); assert.match(logout.headers['set-cookie'][0], /; Secure/);
});
