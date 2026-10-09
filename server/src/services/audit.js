import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { clientInfo } from '../lib/http.js';

/**
 * Records an important action. Audit failures must never break the main
 * operation, so errors are logged and swallowed (unless a transaction client
 * is passed, in which case the write is part of that transaction).
 */
export async function audit(req, action, { entityType, entityId, metadata, actorId, db } = {}) {
  const { ip, userAgent } = req ? clientInfo(req) : {};
  const data = {
    actorId: actorId ?? req?.user?.id ?? null,
    actorRole: req?.user?.role ?? null,
    action,
    entityType,
    entityId,
    metadata: metadata ?? undefined,
    ip,
    userAgent,
  };
  if (db) return db.auditLog.create({ data });
  try {
    await prisma.auditLog.create({ data });
  } catch (err) {
    logger.error({ err, action }, 'Failed to write audit log');
  }
}
