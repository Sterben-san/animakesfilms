import { fileURLToPath } from 'node:url';
import { hostingConfig } from '../server/config.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
try {
  hostingConfig({ ...process.env, NODE_ENV: 'production' }, root);
  if (process.env.DATABASE_URL) {
    const url = new URL(process.env.DATABASE_URL);
    if (url.protocol !== 'mysql:' || !url.hostname || !url.username || url.pathname.length < 2) throw new Error('Provide a complete mysql:// database connection URL.');
  }
  console.log('Production environment structure is valid. Start the app to verify database connectivity and first-time credentials.');
} catch (error) { console.error(error.message); process.exitCode = 1; }
