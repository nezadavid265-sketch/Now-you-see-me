#!/usr/bin/env node
// Starts the development stack: bundled PostgreSQL (optional), API (watch mode) and Vite.
import concurrently from 'concurrently';
import { loadEnv, readEnvFile } from './lib/env.js';
import { startEmbeddedDb } from './lib/embedded-db.js';

const env = loadEnv();
// The API port comes from .env (or 4000), never from an inherited PORT meant for the web dev server.
const apiPort = readEnvFile().PORT || '4000';
let pg;
if (String(env.USE_EMBEDDED_POSTGRES).toLowerCase() === 'true') {
  pg = await startEmbeddedDb({ port: env.EMBEDDED_PG_PORT || 5433, password: env.EMBEDDED_PG_PASSWORD, databases: ['rivoshoppa'] });
  console.log(`✔ Bundled PostgreSQL running on localhost:${env.EMBEDDED_PG_PORT || 5433}`);
}

const { result } = concurrently(
  [
    { command: 'npm run dev -w server', name: 'api', prefixColor: 'cyan', env: { PORT: apiPort } },
    { command: 'npm run dev -w client', name: 'web', prefixColor: 'magenta' },
  ],
  { killOthersOn: ['failure'], restartTries: 0 },
);

async function shutdown(code = 0) {
  if (pg) await pg.stop().catch(() => {});
  process.exit(code);
}
result.then(() => shutdown(0), () => shutdown(1));
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
