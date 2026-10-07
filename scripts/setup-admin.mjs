import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { hashPassword, atomicJson } from './server.mjs';
import { initializeMySql } from '../server/infrastructure/MySqlStorage.mjs';

const input = createInterface({ input: stdin, output: stdout });
try {
  const email = (process.env.PORTFOLIO_ADMIN_EMAIL || await input.question('Admin email: ')).trim().toLowerCase();
  const password = process.env.PORTFOLIO_ADMIN_PASSWORD || await input.question('Local admin password: ');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256) throw new Error('Use a valid email and a password with 12–256 characters.');
  if (process.env.DATABASE_URL) {
    const database = await initializeMySql({ ...process.env, PORTFOLIO_ADMIN_EMAIL: email, PORTFOLIO_ADMIN_PASSWORD: password });
    try { await database.pool.execute('UPDATE portfolio_admin SET account = ? WHERE id = 1', [JSON.stringify({ email, ...await hashPassword(password) })]); }
    finally { await database.pool.end(); }
    console.log('Database administrator account saved. Restart the server to apply it.');
  } else {
  const dir = resolve(process.env.PORTFOLIO_DATA_DIR || fileURLToPath(new URL('../.local/', import.meta.url)));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  await atomicJson(resolve(dir, 'admin.json'), { email, ...await hashPassword(password) });
  console.log('Local administrator account saved. Restart the server to apply it.');
  }
} finally { input.close(); }
