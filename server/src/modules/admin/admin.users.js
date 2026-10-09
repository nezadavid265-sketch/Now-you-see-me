import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { conflict, forbidden, notFound } from '../../lib/errors.js';
import { email, id, optionalPhone, optionalText, password, personName } from '../../lib/validators.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { ADMIN_PERMISSIONS, requirePermission, requireSuperAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { enqueue } from '../../jobs/queue.js';
import { revokeAllUserTokens } from '../../services/tokens.js';
import { hashPassword } from '../auth/auth.service.js';

const router = Router();
const params = z.object({ id });

const USER_LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  status: true,
  isSuperAdmin: true,
  adminPermissions: true,
  emailVerifiedAt: true,
  lockedUntil: true,
  lastLoginAt: true,
  createdAt: true,
};

router.get(
  '/',
  requirePermission('users'),
  validate({
    query: z.object({
      role: z.enum(['BUYER', 'SELLER', 'DELIVERY', 'ADMIN']).optional(),
      status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
      q: z.string().trim().max(100).optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => {
    const { role, status, q, page, pageSize } = req.valid.query;
    const where = {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, select: USER_LIST_SELECT, orderBy: { createdAt: 'desc' }, ...paginate({ page, pageSize }) }),
    ]);
    res.json(pageResult(items, total, { page, pageSize }));
  },
);

router.get('/:id', requirePermission('users'), validate({ params }), async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.valid.params.id },
    select: {
      ...USER_LIST_SELECT,
      suspendedReason: true,
      failedLoginCount: true,
      notifyEmail: true,
      notifySms: true,
      addresses: { select: { id: true, label: true, city: true, district: true } },
      sellerProfile: { select: { id: true, status: true, businessName: true } },
      shop: { select: { id: true, name: true, slug: true, status: true } },
    },
  });
  if (!user) throw notFound('User');
  const [orders, spent, recentOrders, tickets] = await Promise.all([
    prisma.order.count({ where: { buyerId: user.id } }),
    prisma.order.aggregate({ where: { buyerId: user.id, paymentStatus: { in: ['PAID', 'PARTIALLY_REFUNDED'] } }, _sum: { total: true } }),
    prisma.order.findMany({
      where: { buyerId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, orderNumber: true, status: true, total: true, createdAt: true },
    }),
    prisma.supportTicket.count({ where: { userId: user.id } }),
  ]);
  res.json({ user, stats: { orders, totalSpent: spent._sum.total ?? 0, tickets }, recentOrders });
});

router.patch(
  '/:id/status',
  requirePermission('users'),
  validate({ params, body: z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']), reason: optionalText(300) }) }),
  async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.valid.params.id } });
    if (!target) throw notFound('User');
    if (target.id === req.user.id) throw forbidden('You cannot change your own account status.');
    if (target.role === 'ADMIN' && !req.user.isSuperAdmin) throw forbidden('Only super administrators can suspend administrators.');
    if (target.isSuperAdmin) throw forbidden('Super administrators cannot be suspended here.');
    const { status, reason } = req.valid.body;
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: target.id }, data: { status, suspendedReason: status === 'SUSPENDED' ? reason : null } });
      if (status === 'SUSPENDED') await revokeAllUserTokens(target.id, tx);
      await audit(req, status === 'SUSPENDED' ? 'admin.user_suspended' : 'admin.user_reactivated', {
        entityType: 'User',
        entityId: target.id,
        metadata: { reason },
        db: tx,
      });
    });
    await enqueue('email.send', {
      to: target.email,
      subject: status === 'SUSPENDED' ? 'Your Rivoshoppa account has been suspended' : 'Your Rivoshoppa account is active again',
      title: status === 'SUSPENDED' ? 'Account suspended' : 'Account reactivated',
      paragraphs: [
        status === 'SUSPENDED'
          ? `Your account has been suspended${reason ? ` for the following reason: ${reason}` : ''}. Contact support if you believe this is a mistake.`
          : 'Your account has been reactivated. You can sign in again.',
      ],
    });
    res.json({ ok: true });
  },
);

router.post('/:id/unlock', requirePermission('users'), validate({ params }), async (req, res) => {
  await prisma.user.update({ where: { id: req.valid.params.id }, data: { lockedUntil: null, failedLoginCount: 0 } });
  await audit(req, 'admin.user_unlocked', { entityType: 'User', entityId: req.valid.params.id });
  res.json({ ok: true });
});

/** Creates delivery staff (users permission) or administrators (super admin only). */
router.post(
  '/',
  requirePermission('users'),
  validate({
    body: z.object({
      name: personName,
      email,
      phone: optionalPhone,
      password,
      role: z.enum(['DELIVERY', 'ADMIN']),
      adminPermissions: z.array(z.enum(ADMIN_PERMISSIONS)).default([]),
    }),
  }),
  async (req, res) => {
    const body = req.valid.body;
    if (body.role === 'ADMIN' && !req.user.isSuperAdmin) throw forbidden('Only super administrators can create administrators.');
    if (await prisma.user.findUnique({ where: { email: body.email } })) throw conflict('A user with this email already exists.');
    const user = await prisma.user.create({
      data: {
        name: body.name,
        email: body.email,
        phone: body.phone,
        role: body.role,
        passwordHash: await hashPassword(body.password),
        adminPermissions: body.role === 'ADMIN' ? body.adminPermissions : [],
        emailVerifiedAt: new Date(),
      },
      select: USER_LIST_SELECT,
    });
    await audit(req, 'admin.staff_created', { entityType: 'User', entityId: user.id, metadata: { role: body.role, permissions: user.adminPermissions } });
    res.status(201).json({ user });
  },
);

router.patch(
  '/:id/permissions',
  requireSuperAdmin,
  validate({ params, body: z.object({ adminPermissions: z.array(z.enum(ADMIN_PERMISSIONS)), isSuperAdmin: z.boolean().optional() }) }),
  async (req, res) => {
    const target = await prisma.user.findUnique({ where: { id: req.valid.params.id } });
    if (!target || target.role !== 'ADMIN') throw notFound('Administrator');
    if (target.id === req.user.id && req.valid.body.isSuperAdmin === false) throw forbidden('You cannot remove your own super administrator role.');
    const user = await prisma.user.update({
      where: { id: target.id },
      data: { adminPermissions: req.valid.body.adminPermissions, ...(req.valid.body.isSuperAdmin !== undefined ? { isSuperAdmin: req.valid.body.isSuperAdmin } : {}) },
      select: USER_LIST_SELECT,
    });
    await audit(req, 'admin.permissions_changed', {
      entityType: 'User',
      entityId: target.id,
      metadata: { before: target.adminPermissions, after: user.adminPermissions, isSuperAdmin: user.isSuperAdmin },
    });
    res.json({ user });
  },
);

export default router;
