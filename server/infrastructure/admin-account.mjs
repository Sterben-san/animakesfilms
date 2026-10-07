import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashPassword } from './credentials.mjs';

export async function loadAdminAccount(dataDir, env = process.env) {
  const file = resolve(dataDir, 'admin.json');
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const email = (env.PORTFOLIO_ADMIN_EMAIL || '').trim().toLowerCase();
  const password = env.PORTFOLIO_ADMIN_PASSWORD || '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12 || password.length > 256) throw new Error('Administrator missing: run npm run admin:setup, or set PORTFOLIO_ADMIN_EMAIL and PORTFOLIO_ADMIN_PASSWORD (12–256 characters) for first startup.');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const account = { email, ...await hashPassword(password) };
  try { await writeFile(file, JSON.stringify(account) + '\n', { mode: 0o600, flag: 'wx' }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; return JSON.parse(await readFile(file, 'utf8')); }
  return account;
}
