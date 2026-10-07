// LiteSpeed loads this entry with require(); keep its module graph synchronous.
// Asynchronous configuration/database initialization runs after import() resolves.
export const startup = import('./scripts/start-server.mjs')
  .then(({ startPortfolio }) => startPortfolio())
  .catch(error => {
    console.error('[portfolio-startup] failed:', error.code || 'STARTUP_ERROR', error.message);
    process.exitCode = 1;
  });
