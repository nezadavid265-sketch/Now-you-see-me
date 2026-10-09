import { prisma } from '../lib/prisma.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../services/tokens.js';

export const ADMIN_PERMISSIONS = [
  'users',
  'sellers',
  'catalog',
  'orders',
  'finance',
  'marketing',
  'content',
  'support',
  'reports',
  'audit',
  'settings',
];

const USER_SELECT = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  status: true,
  isSuperAdmin: true,
  adminPermissions: true,
};

async function resolveUser(req) {
  const header = req.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  let payload;
  try {
    payload = verifyAccessToken(header.slice(7).trim());
  } catch (err) {
    const expired = err?.name === 'TokenExpiredError';
    throw unauthorized(expired ? 'Session expired' : 'Invalid access token', { code: expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN' });
  }
  // The user is re-read on every request so suspensions and role changes apply immediately.
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: USER_SELECT });
  if (!user) throw unauthorized('Account no longer exists', { code: 'INVALID_TOKEN' });
  if (user.status !== 'ACTIVE') throw forbidden('This account has been suspended. Contact support for help.', { code: 'ACCOUNT_SUSPENDED' });
  return user;
}

export async function authenticate(req, _res, next) {
  const user = await resolveUser(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
}

/** Attaches req.user when a valid token is present; anonymous otherwise. */
export async function optionalAuth(req, _res, next) {
  try {
    req.user = (await resolveUser(req)) ?? undefined;
  } catch {
    req.user = undefined;
  }
  next();
}

export const requireRole =
  (...roles) =>
  (req, _res, next) => {
    if (!req.user) throw unauthorized();
    if (!roles.includes(req.user.role)) throw forbidden();
    next();
  };

export function hasPermission(user, permission) {
  return user?.role === 'ADMIN' && (user.isSuperAdmin || user.adminPermissions.includes(permission));
}

export const requirePermission = (permission) => (req, _res, next) => {
  if (!hasPermission(req.user, permission)) throw forbidden(`Your administrator role does not include "${permission}" access.`);
  next();
};

export const requireSuperAdmin = (req, _res, next) => {
  if (req.user?.role !== 'ADMIN' || !req.user.isSuperAdmin) throw forbidden('Only super administrators can do this.');
  next();
};
