import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { randomToken, sha256 } from '../lib/crypto.js';
import { unauthorized } from '../lib/errors.js';
import { logger } from '../lib/logger.js';

const ISSUER = 'rivoshoppa';
const AUDIENCE = 'rivoshoppa-web';
export const REFRESH_COOKIE = 'rs_refresh';
// Two tabs refreshing at the same moment present the same token; tolerate that briefly.
const REUSE_GRACE_MS = 10_000;

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, config.JWT_ACCESS_SECRET, {
    subject: user.id,
    expiresIn: `${config.ACCESS_TOKEN_TTL_MINUTES}m`,
    issuer: ISSUER,
    audience: AUDIENCE,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, {
    algorithms: ['HS256'],
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

export async function issueRefreshToken(userId, { familyId, ip, userAgent } = {}, db = prisma) {
  const raw = randomToken(48);
  const record = await db.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(raw),
      familyId: familyId ?? randomToken(12),
      expiresAt: new Date(Date.now() + config.REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      ip,
      userAgent,
    },
  });
  return { raw, record };
}

/**
 * Refresh-token rotation with reuse detection: every refresh revokes the
 * presented token and issues a new one in the same family. Presenting an
 * already-rotated token (outside a short grace window) revokes the family.
 */
export async function rotateRefreshToken(raw, meta) {
  if (!raw) throw unauthorized('Session expired. Please sign in again.', { code: 'NO_SESSION' });
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!existing) throw unauthorized('Session expired. Please sign in again.', { code: 'INVALID_SESSION' });

  if (existing.revokedAt) {
    const withinGrace = existing.replacedById && Date.now() - existing.revokedAt.getTime() < REUSE_GRACE_MS;
    if (!withinGrace) {
      await prisma.refreshToken.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await prisma.auditLog.create({
        data: {
          actorId: existing.userId,
          action: 'auth.refresh_token_reuse',
          entityType: 'User',
          entityId: existing.userId,
          ip: meta?.ip,
          userAgent: meta?.userAgent,
        },
      });
      logger.warn({ userId: existing.userId }, 'Refresh token reuse detected; session family revoked');
      throw unauthorized('Session expired. Please sign in again.', { code: 'SESSION_REVOKED' });
    }
  }
  if (existing.expiresAt < new Date()) throw unauthorized('Session expired. Please sign in again.', { code: 'SESSION_EXPIRED' });

  return prisma.$transaction(async (tx) => {
    const { raw: newRaw, record } = await issueRefreshToken(existing.userId, { familyId: existing.familyId, ...meta }, tx);
    if (!existing.revokedAt) {
      // Conditional update guards against two concurrent rotations both succeeding.
      const { count } = await tx.refreshToken.updateMany({
        where: { id: existing.id, revokedAt: null },
        data: { revokedAt: new Date(), replacedById: record.id },
      });
      if (count === 0) throw unauthorized('Session expired. Please sign in again.', { code: 'SESSION_RACE' });
    }
    const user = await tx.user.findUnique({ where: { id: existing.userId } });
    return { user, raw: newRaw };
  });
}

export async function revokeRefreshToken(raw) {
  if (!raw) return;
  await prisma.refreshToken.updateMany({
    where: { tokenHash: sha256(raw), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserTokens(userId, db = prisma) {
  await db.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE,
    sameSite: 'strict',
    path: '/api/auth',
    domain: config.COOKIE_DOMAIN,
    maxAge: config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
  };
}
