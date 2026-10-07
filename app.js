import { startPortfolio } from './scripts/start-server.mjs';
try { await startPortfolio(); }
catch (error) { console.error(error.message); process.exitCode = 1; }
