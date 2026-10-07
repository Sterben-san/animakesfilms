import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderPortfolio, renderProjectsPage, renderProjectPage } from '../../scripts/render.mjs';
import { LocalContentRepository } from '../infrastructure/LocalContentRepository.mjs';
import { LocalMediaStorage } from '../infrastructure/LocalMediaStorage.mjs';
import { PortfolioService } from '../application/PortfolioService.mjs';
import { hashPassword } from '../infrastructure/credentials.mjs';
import { loadAdminAccount } from '../infrastructure/admin-account.mjs';
import { initializeMySql } from '../infrastructure/MySqlStorage.mjs';
export { hashPassword } from '../infrastructure/credentials.mjs';
export { atomicJson } from '../infrastructure/json-files.mjs';

const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ttf': 'font/ttf', '.pdf': 'application/pdf' };
const fail = (status, message) => Object.assign(new Error(message), { status });
async function body(req, max = 2 * 1024 * 1024) {
  if (Number(req.headers['content-length']) > max) throw fail(413, 'File or request is too large.');
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > max) throw fail(413, 'File or request is too large.'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) throw fail(415, 'Expected JSON.');
  try {
    const value = JSON.parse((await body(req)).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400, 'Expected a JSON object.');
    return value;
  } catch (error) { if (error.status) throw error; throw fail(400, 'Invalid JSON.'); }
}
export async function createPortfolioServer(options = {}) {
  const root = options.root || fileURLToPath(new URL('../../', import.meta.url));
  const dataDir = options.dataDir || resolve(root, '.local');
  const publicOrigin = options.publicOrigin || '';
  const publicHost = publicOrigin ? new URL(publicOrigin).host : '';
  const secureCookie = publicOrigin.startsWith('https://') ? '; Secure' : '';
  const uploadsDir = resolve(dataDir, 'uploads');
  const env = options.env || process.env;
  const database = env.DATABASE_URL ? await initializeMySql(env) : null;
  if (!database) await mkdir(uploadsDir, { recursive: true, mode: 0o700 });
  const account = database?.account || await loadAdminAccount(dataDir, env);
  const media = database?.media || await new LocalMediaStorage(dataDir).initialize();
  const repository = database?.repository || await new LocalContentRepository(dataDir).initialize();
  const service = new PortfolioService(repository, media);
  const sessions = new Map(), attempts = new Map();
  const sessionFor = req => {
    const token = /(?:^|;\s*)portfolio_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    const session = sessions.get(token);
    if (!session || session.expires < Date.now()) { if (token) sessions.delete(token); return null; }
    return { ...session, token };
  };
  const server = createServer(async (req, res) => {
    const started = performance.now();
    const logger = options.logger || (process.env.PORTFOLIO_DEBUG === '1' ? entry => console.info('[portfolio-http]', JSON.stringify(entry)) : null);
    if (logger) res.on('finish', () => logger({ method: req.method, path: String(req.url).split('?')[0], status: res.statusCode, milliseconds: Math.round(performance.now() - started) }));
    const send = (status, data, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...headers }); res.end(JSON.stringify(data)); };
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: http: blob:; font-src 'self'; frame-src https://www.youtube-nocookie.com; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'");
    try {
      const host = req.headers.host || '';
      if (req.url === '/health' && ['GET', 'HEAD'].includes(req.method)) { send(200, { status: 'ok' }); return; }
      if (publicHost ? host !== publicHost : !/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host)) throw fail(403, 'Website host is not allowed.');
      const origin = publicOrigin || `http://${host}`;
      const u = new URL(req.url, origin), path = decodeURIComponent(u.pathname);
      const session = sessionFor(req);
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (req.headers.origin !== origin) throw fail(403, 'Requests must come from this website.');
        if (path !== '/api/login') {
          if (!session) throw fail(401, 'Please sign in.');
          if (req.headers['x-csrf-token'] !== session.csrf) throw fail(403, 'Session validation failed. Refresh and try again.');
        }
      }
      if (path === '/api/login' && req.method === 'POST') {
        const key = req.socket.remoteAddress;
        const prior = attempts.get(key) || { count: 0, reset: 0 };
        const attempt = prior.reset > Date.now() ? prior : { count: 0, reset: Date.now() + 60000 };
        if (attempt.count >= 5) { send(429, { error: 'Too many attempts. Try again in one minute.' }, { 'Retry-After': '60' }); return; }
        attempt.count++; attempts.set(key, attempt);
        const input = await jsonBody(req);
        const password = typeof input.password === 'string' && input.password.length <= 256 ? input.password : '';
        const actual = await hashPassword(password, account.salt);
        if (typeof input.email !== 'string' || input.email.toLowerCase() !== account.email || !timingSafeEqual(Buffer.from(actual.hash, 'hex'), Buffer.from(account.hash, 'hex'))) throw fail(401, 'Email or password is incorrect.');
        attempts.delete(key);
        if (session) sessions.delete(session.token);
        for (const [token, entry] of sessions) if (entry.expires < Date.now()) sessions.delete(token);
        const token = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
        sessions.set(token, { csrf, expires: Date.now() + 12 * 60 * 60 * 1000 });
        send(200, { email: account.email, csrf }, { 'Set-Cookie': `portfolio_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secureCookie}` }); return;
      }
      if (path === '/api/session' && req.method === 'GET') { send(session ? 200 : 401, session ? { email: account.email, csrf: session.csrf } : { error: 'Please sign in.' }); return; }
      if (path === '/api/logout' && req.method === 'POST') { sessions.delete(session.token); send(200, { ok: true }, { 'Set-Cookie': `portfolio_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie}` }); return; }
      const adminRead = () => { if (!session) throw fail(401, 'Please sign in.'); };
      if (path === '/api/content' && req.method === 'GET') { send(200, service.publicContent()); return; }
      if (path === '/api/admin/content' && req.method === 'GET') { adminRead(); send(200, service.adminContent()); return; }
      if (['/api/content', '/api/admin/content'].includes(path) && req.method === 'PUT') {
        const input = await jsonBody(req);
        try { send(200, await service.save(input.content, input.revision)); }
        catch (error) { if (!error.status) error.status = 400; throw error; }
        return;
      }
      if (path === '/api/admin/summary' && req.method === 'GET') { adminRead(); send(200, await service.summary()); return; }
      if (path === '/api/projects' && req.method === 'GET') { send(200, service.publicContent().content.projects.items); return; }
      const projectApi = /^\/api\/projects\/([a-z0-9-]+)$/.exec(path);
      if (projectApi && req.method === 'GET') { const project = service.project(projectApi[1]); if (!project) throw fail(404, 'Project not found.'); send(200, project); return; }
      if (['/api/uploads', '/api/admin/media'].includes(path) && req.method === 'POST') {
        const bytes = await body(req, 10 * 1024 * 1024);
        const item = await media.upload(bytes, String(req.headers['content-type']).split(';')[0], decodeURIComponent(req.headers['x-file-name'] || 'Upload'), { width: req.headers['x-image-width'], height: req.headers['x-image-height'] });
        send(201, item); return;
      }
      if (['/api/uploads', '/api/admin/media'].includes(path) && req.method === 'GET') {
        adminRead(); const archived = u.searchParams.get('trash') === '1';
        const rows = await media.list(archived);
        send(200, rows.map(row => ({ ...row, references: archived ? [] : service.references(row.url) }))); return;
      }
      const mediaRoute = /^\/api\/admin\/media\/([a-f0-9-]+\.(?:png|jpg|webp|gif|pdf))(?:\/(archive|restore))?$/.exec(path);
      if (mediaRoute) {
        if (req.method === 'PATCH' && !mediaRoute[2]) { const input = await jsonBody(req); send(200, await service.mutate(() => media.update(mediaRoute[1], input))); return; }
        if (req.method === 'POST' && mediaRoute[2] === 'archive') { send(200, await service.archive(mediaRoute[1])); return; }
        if (req.method === 'POST' && mediaRoute[2] === 'restore') { send(200, await service.restore(mediaRoute[1])); return; }
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw fail(405, 'Method not allowed.');
      let bytes, type;
      if (path === '/' || path === '/index.html') { bytes = Buffer.from(renderPortfolio(service.publicContent().content)); type = mime['.html']; }
      else if (path === '/projects' || path === '/projects/') { bytes = Buffer.from(renderProjectsPage(service.publicContent().content)); type = mime['.html']; }
      else if (/^\/projects\/[a-z0-9-]+\/?$/.test(path)) { const slug = path.split('/')[2]; if (!service.project(slug)) throw fail(404, 'Project not found.'); bytes = Buffer.from(renderProjectPage(service.publicContent().content, slug)); type = mime['.html']; }
      else if (/^\/admin(?:\/(?:login|dashboard)(?:\/[a-z-]+)?)?\/?$/.test(path) || path === '/admin.html') { bytes = await readFile(resolve(root, 'admin.html')); type = mime['.html']; }
      else {
        let file;
        if (/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp|gif|pdf)$/.test(path)) {
          const name = path.slice('/uploads/'.length);
          file = resolve(uploadsDir, name);
          if (database) bytes = await media.read(name);
        }
        else {
          if (!/^\/(styles\/[^/]+\.css|assets\/[^.][\w./-]+|scripts\/(?:admin\/)?[a-z-]+\.js)$/.test(path) || path.split('/').includes('..')) throw fail(404, 'Not found.');
          file = resolve(root, `.${path}`); if (!file.startsWith(resolve(root) + sep)) throw fail(403, 'Forbidden.');
        }
        type = mime[extname(file)]; if (!type) throw fail(404, 'Not found.'); bytes ??= await readFile(file);
        if (extname(file) === '.pdf') res.setHeader('Content-Disposition', 'attachment; filename="resume.pdf"');
      }
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length }); res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch (error) {
      send(error.status || (error.code === 'ENOENT' ? 404 : 500), { error: error.status ? error.message : error.code === 'ENOENT' ? 'Not found.' : 'The server could not complete the request.' });
      if (!error.status && error.code !== 'ENOENT') console.error(error);
    }
  });
  if (database) server.once('close', () => { database.pool.end().catch(() => {}); });
  return server;
}
