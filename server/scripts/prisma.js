#!/usr/bin/env node
// Runs the Prisma CLI with the project-level .env loaded (Prisma only looks
// next to its own package.json). In production the real environment wins.
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '..', '.env'), quiet: true });

const require = createRequire(import.meta.url);
const cli = require.resolve('prisma/build/index.js');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: path.resolve(here, '..'),
  env: process.env,
});
process.exit(result.status ?? 1);
