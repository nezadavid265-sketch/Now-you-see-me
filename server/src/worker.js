// Standalone background worker (use with RUN_WORKER=false on the web process).
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { startWorker } from './jobs/worker.js';

const stop = startWorker();
logger.info('Rivoshoppa worker running');

async function shutdown() {
  stop();
  await prisma.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
