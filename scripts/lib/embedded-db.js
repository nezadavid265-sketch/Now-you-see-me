import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './env.js';

/**
 * Starts a local PostgreSQL server bundled through the `embedded-postgres`
 * npm package. Development/test convenience only — production uses a real,
 * managed PostgreSQL instance referenced by DATABASE_URL.
 */
export async function startEmbeddedDb({
  port = 5433,
  password,
  dataDir = path.join(ROOT, '.data', 'postgres'),
  databases = [],
  persistent = true,
  quiet = true,
} = {}) {
  if (!password) throw new Error('EMBEDDED_PG_PASSWORD is required to start the embedded database');
  const { default: EmbeddedPostgres } = await import('embedded-postgres');
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password,
    port: Number(port),
    persistent,
    // Always UTF-8: the OS default on Windows (WIN1252) cannot store emoji or many names.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: quiet ? () => {} : console.log,
    onError: (err) => {
      const msg = String(err?.message ?? err);
      if (!quiet || /FATAL|PANIC/.test(msg)) console.error('[postgres]', msg.trim());
    },
  });

  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    fs.mkdirSync(path.dirname(dataDir), { recursive: true });
    await pg.initialise();
  }
  await pg.start();

  const client = pg.getPgClient();
  await client.connect();
  for (const db of databases) {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [db]);
    if (!rowCount) await client.query(`CREATE DATABASE "${db.replace(/"/g, '')}" ENCODING 'UTF8' TEMPLATE template0`);
  }
  await client.end();
  return pg;
}
