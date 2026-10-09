#!/usr/bin/env node
// Starts the bundled development PostgreSQL and keeps it running until Ctrl+C.
import { loadEnv } from './lib/env.js';
import { startEmbeddedDb } from './lib/embedded-db.js';

const env = loadEnv();
const port = Number(env.EMBEDDED_PG_PORT || 5433);
const pg = await startEmbeddedDb({ port, password: env.EMBEDDED_PG_PASSWORD, databases: ['rivoshoppa'] });
console.log(`✔ Embedded PostgreSQL running on localhost:${port} (database "rivoshoppa"). Press Ctrl+C to stop.`);

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping PostgreSQL…');
  await pg.stop().catch(() => {});
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
setInterval(() => {}, 1 << 30);
