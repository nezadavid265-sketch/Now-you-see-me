import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, '..');

/**
 * Starts an ephemeral PostgreSQL (unless TEST_DATABASE_URL is provided) and
 * applies the real migrations, so tests exercise the production schema.
 */
export default async function setup({ provide: _provide } = {}) {
  const databaseUrl = process.env.TEST_DATABASE_URL || `postgresql://postgres:test@localhost:54330/rivoshoppa_test?schema=public`;
  let pg;
  let dataDir;

  if (!process.env.TEST_DATABASE_URL) {
    const { default: EmbeddedPostgres } = await import('embedded-postgres');
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rivo-test-pg-'));
    pg = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: 'postgres',
      password: 'test',
      port: 54330,
      persistent: false,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      onLog: () => {},
      onError: () => {},
    });
    await pg.initialise();
    await pg.start();
    await pg.createDatabase('rivoshoppa_test');
  }

  const require = createRequire(import.meta.url);
  const cli = require.resolve('prisma/build/index.js');
  const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl, PRISMA_HIDE_UPDATE_MESSAGE: '1' },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    await pg?.stop();
    throw new Error(`Test migrations failed:\n${result.stdout}\n${result.stderr}`);
  }

  return async () => {
    if (pg) await pg.stop().catch(() => {});
    // Windows may keep files locked for a moment after PostgreSQL exits.
    if (dataDir) {
      try {
        fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
      } catch {
        /* temporary directory; the OS will clean it up */
      }
    }
  };
}
