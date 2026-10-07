import { fileURLToPath } from 'node:url';
import { createPortfolioServer } from './server.mjs';
import { hostingConfig } from '../server/config.mjs';

export async function startPortfolio(env = process.env) {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const config = hostingConfig(env, root);
  const server = await createPortfolioServer({ root, dataDir: config.dataDir, publicOrigin: config.publicOrigin, env });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, config.host, resolve); });
  console.info(`Portfolio listening on ${config.host}:${config.port}; public address ${config.publicOrigin || `http://localhost:${config.port}`}`);
  const shutdown = () => {
    server.close(() => process.exit(0));
    server.closeIdleConnections();
    setTimeout(() => { server.closeAllConnections(); process.exit(1); }, 10000).unref();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  return server;
}
