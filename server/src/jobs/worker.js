import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { sendEmail } from '../services/email.js';
import { sendSms } from '../services/sms.js';
import { expireUnpaidOrders, pollPendingPayments } from '../domain/payments.js';
import { claimJobs, completeJob, failJob, recoverStaleJobs } from './queue.js';

/** Handlers for queued jobs. Each must be idempotent-safe to retry. */
export const handlers = {
  'email.send': (payload) => sendEmail(payload),
  'sms.send': (payload) => sendSms(payload),
};

/** Periodic maintenance tasks: [name, intervalMs, fn]. */
const schedules = [
  ['payments.poll', 20_000, () => pollPendingPayments()],
  ['orders.expireUnpaid', 60_000, () => expireUnpaidOrders()],
  ['jobs.recoverStale', 5 * 60_000, () => recoverStaleJobs()],
  ['housekeeping', 6 * 60 * 60_000, () => housekeeping()],
];

async function housekeeping() {
  const monthAgo = new Date(Date.now() - 30 * 86_400_000);
  await prisma.refreshToken.deleteMany({ where: { OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { lt: monthAgo } }] } });
  await prisma.authToken.deleteMany({ where: { expiresAt: { lt: monthAgo } } });
  await prisma.job.deleteMany({ where: { status: 'COMPLETED', updatedAt: { lt: new Date(Date.now() - 14 * 86_400_000) } } });
}

export async function processDueJobs(limit = 10) {
  const jobs = await claimJobs(limit);
  for (const job of jobs) {
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler(job.payload);
      await completeJob(job.id);
    } catch (err) {
      logger.warn({ err, jobId: job.id, type: job.type, attempt: job.attempts }, 'Job failed');
      await failJob(job, err);
    }
  }
  return jobs.length;
}

export function startWorker({ pollMs = 2_000 } = {}) {
  let stopped = false;
  const timers = [];

  const loop = async () => {
    if (stopped) return;
    try {
      const processed = await processDueJobs();
      timers.push(setTimeout(loop, processed ? 50 : pollMs));
    } catch (err) {
      logger.error({ err }, 'Job loop error');
      timers.push(setTimeout(loop, pollMs * 5));
    }
  };
  loop();

  for (const [name, every, fn] of schedules) {
    let running = false;
    timers.push(
      setInterval(async () => {
        if (running || stopped) return;
        running = true;
        try {
          await fn();
        } catch (err) {
          logger.error({ err, task: name }, 'Scheduled task failed');
        } finally {
          running = false;
        }
      }, every),
    );
  }
  logger.info('Background worker started');

  return () => {
    stopped = true;
    timers.forEach((t) => clearTimeout(t));
  };
}
