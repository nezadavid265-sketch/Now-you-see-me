import argon2 from 'argon2';
import { config } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { AppError, conflict, unauthorized, unprocessable } from '../../lib/errors.js';
import { randomToken, sha256 } from '../../lib/crypto.js';
import { enqueue } from '../../jobs/queue.js';
import { audit } from '../../services/audit.js';
import { issueRefreshToken, revokeAllUserTokens, signAccessToken } from '../../services/tokens.js';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
// Argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1).
const HASH_OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 };
// Used to equalise timing when the e-mail does not exist.
let dummyHash;

export const hashPassword = (plain) => argon2.hash(plain, HASH_OPTIONS);
export const verifyPassword = (hash, plain) => argon2.verify(hash, plain).catch(() => false);

export function toUserDto(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: user.status,
    emailVerified: Boolean(user.emailVerifiedAt),
    isSuperAdmin: user.isSuperAdmin,
    adminPermissions: user.role === 'ADMIN' ? user.adminPermissions : [],
    notifyEmail: user.notifyEmail,
    notifySms: user.notifySms,
    createdAt: user.createdAt,
    seller:
      user.role === 'SELLER'
        ? {
            status: user.sellerProfile?.status ?? 'DRAFT',
            hasProfile: Boolean(user.sellerProfile),
            shop: user.shop ? { id: user.shop.id, name: user.shop.name, slug: user.shop.slug, status: user.shop.status } : null,
          }
        : undefined,
  };
}

export async function getUserWithRelations(id) {
  return prisma.user.findUnique({
    where: { id },
    include: { sellerProfile: { select: { status: true } }, shop: { select: { id: true, name: true, slug: true, status: true } } },
  });
}

export async function createSession(user, meta) {
  const { raw } = await issueRefreshToken(user.id, meta);
  return { accessToken: signAccessToken(user), refreshToken: raw };
}

async function createAuthToken(userId, type, ttlMs) {
  const raw = randomToken(32);
  await prisma.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.authToken.create({ data: { userId, type, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + ttlMs) } });
  return raw;
}

async function sendVerificationEmail(user) {
  const token = await createAuthToken(user.id, 'EMAIL_VERIFY', 48 * 3_600_000);
  await enqueue('email.send', {
    to: user.email,
    subject: 'Confirm your Rivoshoppa email address',
    title: `Welcome to Rivoshoppa, ${user.name.split(' ')[0]}!`,
    paragraphs: ['Please confirm your email address so we can keep you updated about your orders.'],
    cta: { label: 'Confirm email', url: `${config.APP_URL}/verify-email?token=${token}` },
  });
}

export async function register({ name, email, phone, password }, role, req) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict('An account with this email already exists. Try signing in instead.', { details: { fieldErrors: { email: 'Already registered' } } });
  const user = await prisma.user.create({
    data: { name, email, phone, role, passwordHash: await hashPassword(password) },
  });
  await sendVerificationEmail(user);
  await audit(req, role === 'SELLER' ? 'auth.register_seller' : 'auth.register', { entityType: 'User', entityId: user.id, actorId: user.id });
  return user;
}

export async function login({ email, password }, req) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    dummyHash ??= await hashPassword('timing-equaliser-1');
    await verifyPassword(dummyHash, password);
    await audit(req, 'auth.login_failed', { metadata: { reason: 'unknown_email' } });
    throw unauthorized('Incorrect email or password.', { code: 'INVALID_CREDENTIALS' });
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60_000);
    throw new AppError(423, `Too many failed attempts. Try again in ${minutes} minute(s) or reset your password.`, { code: 'ACCOUNT_LOCKED' });
  }

  const valid = await verifyPassword(user.passwordHash, password);
  if (!valid) {
    const failed = user.failedLoginCount + 1;
    const lock = failed >= MAX_FAILED_LOGINS;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: lock ? 0 : failed,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : undefined,
      },
    });
    await audit(req, lock ? 'auth.account_locked' : 'auth.login_failed', { entityType: 'User', entityId: user.id, actorId: user.id });
    throw unauthorized('Incorrect email or password.', { code: 'INVALID_CREDENTIALS' });
  }
  if (user.status !== 'ACTIVE') {
    throw new AppError(403, 'This account has been suspended. Contact support for help.', { code: 'ACCOUNT_SUSPENDED' });
  }

  // Transparently upgrade hashes created with older parameters.
  const needsRehash = argon2.needsRehash(user.passwordHash, HASH_OPTIONS);
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      ...(needsRehash ? { passwordHash: await hashPassword(password) } : {}),
    },
  });
  await audit(req, 'auth.login', { entityType: 'User', entityId: user.id, actorId: user.id });
  return user;
}

/** Always succeeds from the caller's perspective to avoid account enumeration. */
export async function requestPasswordReset({ email }, req) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || user.status !== 'ACTIVE') return;
  const token = await createAuthToken(user.id, 'PASSWORD_RESET', 30 * 60_000);
  await enqueue('email.send', {
    to: user.email,
    subject: 'Reset your Rivoshoppa password',
    title: 'Password reset requested',
    paragraphs: [
      'Someone (hopefully you) asked to reset the password for your Rivoshoppa account.',
      'This link expires in 30 minutes. If you did not request it, you can ignore this email.',
    ],
    cta: { label: 'Choose a new password', url: `${config.APP_URL}/reset-password?token=${token}` },
  });
  await audit(req, 'auth.password_reset_requested', { entityType: 'User', entityId: user.id, actorId: user.id });
}

async function consumeToken(raw, type) {
  const record = await prisma.authToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
    throw unprocessable('This link is invalid or has expired. Please request a new one.', undefined, { code: 'INVALID_TOKEN' });
  }
  const { count } = await prisma.authToken.updateMany({ where: { id: record.id, usedAt: null }, data: { usedAt: new Date() } });
  if (!count) throw unprocessable('This link has already been used.', undefined, { code: 'INVALID_TOKEN' });
  return record;
}

export async function resetPassword({ token, password }, req) {
  const record = await consumeToken(token, 'PASSWORD_RESET');
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: record.userId },
      data: { passwordHash: await hashPassword(password), failedLoginCount: 0, lockedUntil: null },
    });
    await revokeAllUserTokens(record.userId, tx);
  });
  await audit(req, 'auth.password_reset', { entityType: 'User', entityId: record.userId, actorId: record.userId });
}

export async function verifyEmail({ token }, req) {
  const record = await consumeToken(token, 'EMAIL_VERIFY');
  await prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } });
  await audit(req, 'auth.email_verified', { entityType: 'User', entityId: record.userId, actorId: record.userId });
}

export async function resendVerification(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (user && !user.emailVerifiedAt) await sendVerificationEmail(user);
}

export async function changePassword(userId, { currentPassword, newPassword }, req) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw unprocessable('Your current password is incorrect.', { fieldErrors: { currentPassword: 'Incorrect password' } });
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(newPassword) } });
    await revokeAllUserTokens(userId, tx);
  });
  await audit(req, 'auth.password_changed', { entityType: 'User', entityId: userId });
  return user;
}
