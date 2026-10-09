import { config } from './config/env.js';
import { logger } from './lib/logger.js';
import { prisma } from './lib/prisma.js';
import { createApp } from './app.js';
import { startWorker } from './jobs/worker.js';

const app = createApp();
const server = app.listen(config.PORT, () => {
  logger.info(`Rivoshoppa API listening on http://localhost:${config.PORT} (${config.NODE_ENV})`);
});
server.keepAliveTimeout = 65_000;

const stopWorker = config.RUN_WORKER ? startWorker() : null;

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down gracefully');
  stopWorker?.();
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled promise rejection'));
