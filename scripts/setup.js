#!/usr/bin/env node
/**
 * One-time local setup:
 *  1. creates .env from .env.example with freshly generated secrets
 *  2. starts the bundled PostgreSQL (if USE_EMBEDDED_POSTGRES=true)
 *  3. applies database migrations
 *  4. seeds development data (skip with --no-seed)
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT, ENV_PATH, loadEnv } from './lib/env.js';
import { startEmbeddedDb } from './lib/embedded-db.js';

const args = new Set(process.argv.slice(2));
const secret = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
const readablePassword = () => `Rivo-${secret(6)}-${crypto.randomInt(10, 99)}`;

function createEnvFile() {
  if (fs.existsSync(ENV_PATH)) {
    console.log('• .env already exists — keeping it');
    return;
  }
  const dbPassword = secret(18);
  let content = fs.readFileSync(path.join(ROOT, '.env.example'), 'utf8');
  content = content
    .replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=postgresql://postgres:${dbPassword}@localhost:5433/rivoshoppa?schema=public`)
    .replace(/^EMBEDDED_PG_PASSWORD=.*$/m, `EMBEDDED_PG_PASSWORD=${dbPassword}`)
    .replace(/^JWT_ACCESS_SECRET=.*$/m, `JWT_ACCESS_SECRET=${secret(48)}`)
    .replace(/^TEST_WEBHOOK_SECRET=.*$/m, `TEST_WEBHOOK_SECRET=${secret(24)}`)
    .replace(/^SEED_DEFAULT_PASSWORD=.*$/m, `SEED_DEFAULT_PASSWORD=${readablePassword()}`);
  fs.writeFileSync(ENV_PATH, content);
  console.log('✔ Created .env with generated secrets (development settings)');
}

// Commands are fixed strings defined in this file (no user input), run through the shell
// so that npm resolves correctly on Windows.
function run(cmd, cmdArgs, opts = {}) {
  const res = spawnSync([cmd, ...cmdArgs].join(' '), { stdio: 'inherit', cwd: ROOT, shell: true, ...opts });
  if (res.status !== 0) {
    console.error(`✖ Command failed: ${cmd} ${cmdArgs.join(' ')}`);
    process.exit(res.status ?? 1);
  }
}

createEnvFile();
if (args.has('--env-only')) process.exit(0);
const env = loadEnv();

let pg;
if (String(env.USE_EMBEDDED_POSTGRES).toLowerCase() === 'true') {
  console.log('• Starting bundled PostgreSQL…');
  pg = await startEmbeddedDb({ port: env.EMBEDDED_PG_PORT || 5433, password: env.EMBEDDED_PG_PASSWORD, databases: ['rivoshoppa'] });
}

try {
  console.log('• Generating Prisma client…');
  run('npm', ['run', 'prisma:generate', '-w', 'server']);
  console.log('• Applying database migrations…');
  run('npm', ['run', 'prisma:deploy', '-w', 'server']);
  if (!args.has('--no-seed')) {
    console.log('• Seeding development data…');
    run('npm', ['run', 'seed', '-w', 'server']);
  }
} finally {
  if (pg) await pg.stop().catch(() => {});
}

console.log('\n✔ Setup complete. Start everything with:  npm run dev');
console.log('  Development account e-mails and the shared password are in your .env file (SEED_*).');
