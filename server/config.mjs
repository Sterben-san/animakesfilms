import { resolve, isAbsolute } from 'node:path';

export function hostingConfig(env = process.env, root = process.cwd()) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be between 1 and 65535.');
  let publicOrigin = '';
  if (env.APP_URL) {
    const url = new URL(env.APP_URL);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('APP_URL must be a website origin without a path or credentials.');
    if (production && url.protocol !== 'https:') throw new Error('Production APP_URL must use HTTPS.');
    publicOrigin = url.origin;
  }
  if (production && !publicOrigin) throw new Error('Set APP_URL to the HTTPS website address.');
  if (production && !env.DATABASE_URL && (!env.PORTFOLIO_DATA_DIR || !isAbsolute(env.PORTFOLIO_DATA_DIR))) throw new Error('Set DATABASE_URL for managed hosting, or PORTFOLIO_DATA_DIR to an absolute persistent directory.');
  const dataDir = resolve(root, env.PORTFOLIO_DATA_DIR || '.local');
  if (production && !env.DATABASE_URL && (dataDir === resolve(root) || dataDir.startsWith(resolve(root) + '/'))) throw new Error('Production data must be outside the application deployment directory.');
  return { production, port, host: env.HOST || (production ? '0.0.0.0' : '127.0.0.1'), publicOrigin, dataDir };
}
