import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createDefaultContent, migrateContent } from '../../scripts/content-model.js';
import { normalizeContent } from '../domain/portfolio.mjs';
import { detectFileType, mediaFile } from './LocalMediaStorage.mjs';
import { hashPassword } from './credentials.mjs';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value;
const fail = (status, message) => Object.assign(new Error(message), { status });
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf' };

export class MySqlContentRepository {
  constructor(pool) { this.pool = pool; }
  async initialize() {
    const initial = { revision: 1, content: normalizeContent(createDefaultContent()), savedAt: null };
    await this.pool.execute('INSERT IGNORE INTO portfolio_state (id, record) VALUES (1, ?)', [JSON.stringify(initial)]);
    await this.refresh();
    const migrated = normalizeContent(migrateContent(this.record.content));
    // MySQL JSON objects reorder keys; compare values to avoid a migration on every restart.
    if (!isDeepStrictEqual(migrated, this.record.content)) await this.save(migrated, this.record.revision);
    return this;
  }
  async refresh() {
    const [rows] = await this.pool.execute('SELECT record FROM portfolio_state WHERE id = 1');
    this.record = parse(rows[0].record);
  }
  read() { return structuredClone(this.record); }
  async save(content, revision) {
    if (!Number.isSafeInteger(revision) || revision !== this.record.revision) throw fail(409, 'Content changed in another tab. Discard unsaved changes to load the latest version.');
    const record = { revision: revision + 1, content: normalizeContent(content), savedAt: new Date().toISOString() };
    const [result] = await this.pool.execute("UPDATE portfolio_state SET record = ? WHERE id = 1 AND CAST(JSON_UNQUOTE(JSON_EXTRACT(record, '$.revision')) AS UNSIGNED) = ?", [JSON.stringify(record), revision]);
    if (!result.affectedRows) { await this.refresh(); throw fail(409, 'Content changed in another tab. Discard unsaved changes to load the latest version.'); }
    this.record = record;
    return this.read();
  }
}

export class MySqlMediaStorage {
  constructor(pool) { this.pool = pool; }
  async list(archived = false) {
    const [rows] = await this.pool.execute('SELECT metadata FROM portfolio_media WHERE archived = ? ORDER BY created DESC', [Number(archived)]);
    return rows.map(row => parse(row.metadata));
  }
  async info(file, archived = false) {
    if (!mediaFile.test(file)) throw fail(404, 'File not found.');
    const [rows] = await this.pool.execute('SELECT metadata FROM portfolio_media WHERE file = ? AND archived = ?', [file, Number(archived)]);
    if (!rows.length) throw fail(404, 'File not found.');
    return parse(rows[0].metadata);
  }
  async read(file) {
    if (!mediaFile.test(file)) throw fail(404, 'File not found.');
    const [rows] = await this.pool.execute('SELECT bytes FROM portfolio_media WHERE file = ? AND archived = 0', [file]);
    if (!rows.length) throw fail(404, 'File not found.');
    return rows[0].bytes;
  }
  async upload(bytes, declaredType, name, dimensions = {}) {
    const ext = detectFileType(bytes);
    if (!ext || bytes.length < 16 || declaredType !== types[ext]) throw fail(415, 'Upload a verified JPG, PNG, WebP, GIF, or PDF file.');
    if (bytes.length > 10 * 1024 * 1024) throw fail(413, 'File or request is too large.');
    const file = randomUUID() + ext;
    const dimension = n => Number.isInteger(Number(n)) && Number(n) > 0 && Number(n) <= 30000 ? Number(n) : null;
    const metadata = { url: `/uploads/${file}`, name: String(name).slice(0, 180), alt: '', type: declaredType, size: bytes.length, width: dimension(dimensions.width), height: dimension(dimensions.height), created: new Date().toISOString() };
    await this.pool.execute('INSERT INTO portfolio_media (file, metadata, bytes, created) VALUES (?, ?, ?, ?)', [file, JSON.stringify(metadata), bytes, metadata.created]);
    return metadata;
  }
  async update(file, input) {
    const row = await this.info(file);
    if (typeof input.name !== 'string' || !input.name.trim() || input.name.length > 180 || typeof input.alt !== 'string' || input.alt.length > 1200) throw fail(400, 'Enter a file name and a description of at most 1200 characters.');
    row.name = input.name.trim(); row.alt = input.alt.trim();
    await this.pool.execute('UPDATE portfolio_media SET metadata = ? WHERE file = ? AND archived = 0', [JSON.stringify(row), file]);
    return row;
  }
  async move(file, restore = false) {
    await this.info(file, restore);
    await this.pool.execute('UPDATE portfolio_media SET archived = ? WHERE file = ? AND archived = ?', [Number(!restore), file, Number(restore)]);
    return { ok: true };
  }
}

export async function initializeMySql(env) {
  const { default: mysql } = await import('mysql2/promise');
  const url = new URL(env.DATABASE_URL);
  if (url.protocol !== 'mysql:') throw new Error('DATABASE_URL must use mysql://.');
  const pool = mysql.createPool({ host: url.hostname, port: Number(url.port || 3306), user: decodeURIComponent(url.username), password: decodeURIComponent(url.password), database: url.pathname.slice(1), connectionLimit: 4, ssl: env.DATABASE_SSL === 'true' ? { rejectUnauthorized: true } : undefined });
  try {
    const [limits] = await pool.query('SELECT @@max_allowed_packet AS packet');
    if (Number(limits[0].packet) < 12 * 1024 * 1024) throw new Error('MySQL max_allowed_packet must be at least 12 MiB for uploads up to 10 MiB.');
    await pool.query('CREATE TABLE IF NOT EXISTS portfolio_state (id TINYINT PRIMARY KEY, record JSON NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS portfolio_admin (id TINYINT PRIMARY KEY, account JSON NOT NULL)');
    await pool.query('CREATE TABLE IF NOT EXISTS portfolio_media (file VARCHAR(45) PRIMARY KEY, metadata JSON NOT NULL, bytes LONGBLOB NOT NULL, archived TINYINT NOT NULL DEFAULT 0, created VARCHAR(30) NOT NULL)');
    let [accounts] = await pool.execute('SELECT account FROM portfolio_admin WHERE id = 1');
    if (!accounts.length) {
      const email = (env.PORTFOLIO_ADMIN_EMAIL || '').trim().toLowerCase(), password = env.PORTFOLIO_ADMIN_PASSWORD || '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256) throw new Error('Set the administrator email and a 12–256 character password for first startup.');
      await pool.execute('INSERT IGNORE INTO portfolio_admin (id, account) VALUES (1, ?)', [JSON.stringify({ email, ...await hashPassword(password) })]);
      [accounts] = await pool.execute('SELECT account FROM portfolio_admin WHERE id = 1');
    }
    return { pool, account: parse(accounts[0].account), repository: await new MySqlContentRepository(pool).initialize(), media: new MySqlMediaStorage(pool) };
  } catch (error) { await pool.end(); throw error; }
}
