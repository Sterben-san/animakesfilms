import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { loadAdminAccount } from '../server/infrastructure/admin-account.mjs';
import { request } from 'node:http';

test('LiteSpeed-style require starts app, serves health/public/admin, and shuts down', async t => {
  const dataDir = await mkdtemp(join(tmpdir(), 'portfolio-entry-'));
  await loadAdminAccount(dataDir, { PORTFOLIO_ADMIN_EMAIL: 'entry@example.com', PORTFOLIO_ADMIN_PASSWORD: 'EntryTestPassword123!' });
  t.after(() => rm(dataDir, { recursive: true, force: true }));
  const entry = process.env.TEST_ENTRYPOINT || fileURLToPath(new URL('../app.js', import.meta.url));
  const code = `
    const http = require('node:http');
    const originalListen = http.Server.prototype.listen;
    // LiteSpeed owns the listener; bind an ephemeral loopback port for this test.
    http.Server.prototype.listen = function(port, host, callback) {
      return originalListen.call(this, 0, '127.0.0.1', callback);
    };
    const app = require(${JSON.stringify(entry)});
    app.startup.then(server => {
      if (!server) process.exit(1);
      process.send({ port: server.address().port });
    });
  `;
  const child = spawn(process.execPath, ['-e', code], {
    env: { ...process.env, NODE_ENV: 'production', APP_URL: 'https://entry.example', DATABASE_URL: '', PORTFOLIO_DATA_DIR: dataDir, PORT: '3000' },
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  let logs = '';
  child.stdout.on('data', bytes => { logs += bytes; });
  child.stderr.on('data', bytes => { logs += bytes; });
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error('Entry startup timed out: ' + logs)); }, 10000);
    child.once('message', message => { clearTimeout(timer); resolve(message.port); });
    child.once('exit', code => { clearTimeout(timer); reject(new Error('Entry exited before listening: ' + code + '\n' + logs)); });
    child.once('error', reject);
  });
  const fetchPage = path => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, headers: { Host: 'entry.example' } }, res => {
      let text = ''; res.on('data', bytes => { text += bytes; });
      res.on('end', () => resolve({ status: res.statusCode, text }));
    });
    req.on('error', reject); req.end();
  });
  let response = await fetchPage('/health');
  assert.equal(response.status, 200); assert.deepEqual(JSON.parse(response.text), { status: 'ok' });
  response = await fetchPage('/');
  assert.equal(response.status, 200); assert.match(response.text, /Your name/);
  response = await fetchPage('/admin/dashboard');
  assert.equal(response.status, 200); assert.match(response.text, /Portfolio Studio/);
  response = await fetchPage('/api/session');
  assert.equal(response.status, 401);
  assert.match(logs, /storage initialized/);
  assert.doesNotMatch(logs, /ERR_REQUIRE_ASYNC_MODULE/);
  const exited = new Promise(resolve => child.once('exit', resolve));
  child.kill('SIGTERM'); assert.equal(await exited, 0);
});

test('require-compatible entry reports a configuration failure without an unhandled rejection', async () => {
  const entry = process.env.TEST_ENTRYPOINT || fileURLToPath(new URL('../app.js', import.meta.url));
  const child = spawn(process.execPath, ['-e', `require(${JSON.stringify(entry)})`], { env: { ...process.env, NODE_ENV: 'production', APP_URL: '' } });
  let stderr = '';
  child.stderr.on('data', bytes => { stderr += bytes; });
  const code = await new Promise(resolve => child.once('exit', resolve));
  assert.equal(code, 1);
  assert.match(stderr, /\[portfolio-startup\] failed: STARTUP_ERROR Set APP_URL/);
  assert.doesNotMatch(stderr, /ERR_REQUIRE_ASYNC_MODULE|UnhandledPromiseRejection/);
});
