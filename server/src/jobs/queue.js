import { prisma } from '../lib/prisma.js';

/**
 * Durable job queue stored in PostgreSQL. Works on any host that can run Node
 * and Postgres (no Redis needed). Pass a transaction client to enqueue jobs
 * atomically with the business change that triggers them.
 */
export function enqueue(type, payload, { runAt, maxAttempts = 5, db = prisma } = {}) {
  return db.job.create({
    data: { type, payload, runAt: runAt ?? new Date(), maxAttempts },
  });
}

/** Atomically claims up to `limit` due jobs (safe with multiple workers). */
export async function claimJobs(limit = 10) {
  return prisma.$queryRaw`
    UPDATE "Job" SET status = 'RUNNING', "lockedAt" = NOW(), attempts = attempts + 1, "updatedAt" = NOW()
    WHERE id IN (
      SELECT id FROM "Job"
      WHERE status = 'PENDING' AND "runAt" <= NOW()
      ORDER BY "runAt"
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, type, payload, attempts, "maxAttempts"`;
}

export async function completeJob(id) {
  await prisma.job.update({ where: { id }, data: { status: 'COMPLETED', lockedAt: null } });
}

export async function failJob(job, error) {
  const exhausted = job.attempts >= job.maxAttempts;
  const backoffMs = Math.min(60 * 60_000, 2 ** job.attempts * 5_000);
  await prisma.job.update({
    where: { id: job.id },
    data: {
      status: exhausted ? 'FAILED' : 'PENDING',
      lockedAt: null,
      lastError: String(error?.message ?? error).slice(0, 1000),
      runAt: exhausted ? undefined : new Date(Date.now() + backoffMs),
    },
  });
}

/** Re-queues jobs whose worker died mid-run. */
export async function recoverStaleJobs(staleAfterMs = 5 * 60_000) {
  await prisma.job.updateMany({
    where: { status: 'RUNNING', lockedAt: { lt: new Date(Date.now() - staleAfterMs) } },
    data: { status: 'PENDING', lockedAt: null },
  });
}
