import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { id, optionalText, text } from '../../lib/validators.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { notify } from '../../services/notifications.js';
import { shopBalance } from '../../domain/finance.js';

const router = Router();
const params = z.object({ id });

router.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
      q: z.string().trim().max(100).optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => {
    const { status, q, page, pageSize } = req.valid.query;
    const where = {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { businessName: { contains: q, mode: 'insensitive' } },
              { user: { email: { contains: q, mode: 'insensitive' } } },
              { user: { shop: { name: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.sellerProfile.count({ where }),
      prisma.sellerProfile.findMany({
        where,
        orderBy: [{ submittedAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
        ...paginate({ page, pageSize }),
        include: { user: { select: { id: true, name: true, email: true, phone: true, status: true, shop: { select: { id: true, name: true, slug: true, status: true } } } } },
      }),
    ]);
    res.json(pageResult(rows, total, { page, pageSize }));
  },
);

router.get('/:id', validate({ params }), async (req, res) => {
  const profile = await prisma.sellerProfile.findUnique({
    where: { id: req.valid.params.id },
    include: {
      user: {
        select: {
          id: true, name: true, email: true, phone: true, status: true, createdAt: true, lastLoginAt: true,
          shop: true,
        },
      },
    },
  });
  if (!profile) throw notFound('Seller');
  const shop = profile.user.shop;
  let stats = null;
  if (shop) {
    const [products, orders, revenue, balance] = await Promise.all([
      prisma.product.count({ where: { shopId: shop.id, deletedAt: null } }),
      prisma.sellerOrder.count({ where: { shopId: shop.id, status: { not: 'PENDING_PAYMENT' } } }),
      prisma.sellerOrder.aggregate({ where: { shopId: shop.id, status: 'DELIVERED' }, _sum: { subtotal: true, commissionAmount: true } }),
      shopBalance(shop.id),
    ]);
    stats = { products, orders, deliveredRevenue: revenue._sum.subtotal ?? 0, commission: revenue._sum.commissionAmount ?? 0, balance };
  }
  const history = await prisma.auditLog.findMany({
    where: { entityType: 'SellerProfile', entityId: profile.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { actor: { select: { name: true } } },
  });
  res.json({ profile, stats, history });
});

async function review(req, nextStatus, { allowedFrom, shopStatus, action, title, message }) {
  const profile = await prisma.sellerProfile.findUnique({ where: { id: req.valid.params.id }, include: { user: { include: { shop: true } } } });
  if (!profile) throw notFound('Seller');
  if (!allowedFrom.includes(profile.status)) throw conflict(`This seller is currently ${profile.status.toLowerCase()} and cannot be ${action}.`);
  const note = req.valid.body?.note ?? null;
  await prisma.$transaction(async (tx) => {
    await tx.sellerProfile.update({
      where: { id: profile.id },
      data: { status: nextStatus, reviewNote: note, reviewedById: req.user.id, reviewedAt: new Date() },
    });
    if (profile.user.shop && shopStatus) await tx.shop.update({ where: { id: profile.user.shop.id }, data: { status: shopStatus } });
    await audit(req, `admin.seller_${action}`, { entityType: 'SellerProfile', entityId: profile.id, metadata: { note }, db: tx });
  });
  await notify(profile.userId, { type: `seller.${action}`, title, body: message(note), link: '/seller' });
}

const noteBody = z.object({ note: optionalText(500) });
const requiredNote = z.object({ note: text(500, 3) });

router.post('/:id/approve', validate({ params, body: noteBody }), async (req, res) => {
  await review(req, 'APPROVED', {
    allowedFrom: ['PENDING', 'REJECTED', 'DRAFT'],
    shopStatus: 'ACTIVE',
    action: 'approved',
    title: 'Your shop has been approved 🎉',
    message: () => 'Welcome to Rivoshoppa! Your shop is now live. Publish products to start selling.',
  });
  res.json({ ok: true });
});

router.post('/:id/reject', validate({ params, body: requiredNote }), async (req, res) => {
  await review(req, 'REJECTED', {
    allowedFrom: ['PENDING'],
    shopStatus: 'PENDING',
    action: 'rejected',
    title: 'Your seller application needs changes',
    message: (note) => `Reason: ${note}. Update your details and submit again.`,
  });
  res.json({ ok: true });
});

router.post('/:id/suspend', validate({ params, body: requiredNote }), async (req, res) => {
  await review(req, 'SUSPENDED', {
    allowedFrom: ['APPROVED'],
    shopStatus: 'SUSPENDED',
    action: 'suspended',
    title: 'Your shop has been suspended',
    message: (note) => `Your products are hidden from buyers. Reason: ${note}. Contact support to resolve this.`,
  });
  res.json({ ok: true });
});

router.post('/:id/reinstate', validate({ params, body: noteBody }), async (req, res) => {
  await review(req, 'APPROVED', {
    allowedFrom: ['SUSPENDED'],
    shopStatus: 'ACTIVE',
    action: 'reinstated',
    title: 'Your shop is active again',
    message: () => 'Your shop and products are visible to buyers again.',
  });
  res.json({ ok: true });
});

/** Shop-level marketplace configuration: commission override and fulfilment mode. */
export const shopsRouter = Router();
shopsRouter.get(
  '/',
  validate({ query: z.object({ status: z.enum(['PENDING', 'ACTIVE', 'SUSPENDED']).optional(), q: z.string().trim().max(100).optional(), ...paginationSchema }) }),
  async (req, res) => {
    const { status, q, page, pageSize } = req.valid.query;
    const where = { ...(status ? { status } : {}), ...(q ? { name: { contains: q, mode: 'insensitive' } } : {}) };
    const [total, items] = await Promise.all([
      prisma.shop.count({ where }),
      prisma.shop.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate({ page, pageSize }),
        include: { seller: { select: { name: true, email: true, sellerProfile: { select: { id: true, status: true } } } }, _count: { select: { products: true } } },
      }),
    ]);
    res.json(pageResult(items, total, { page, pageSize }));
  },
);
shopsRouter.patch(
  '/:id',
  validate({
    params,
    body: z.object({
      commissionRateBps: z.number().int().min(0).max(5000).nullable().optional(),
      fulfillmentMode: z.enum(['SELF', 'MARKETPLACE']).optional(),
    }),
  }),
  async (req, res) => {
    const before = await prisma.shop.findUnique({ where: { id: req.valid.params.id } });
    if (!before) throw notFound('Shop');
    const shop = await prisma.shop.update({ where: { id: before.id }, data: req.valid.body });
    await audit(req, 'admin.shop_configured', {
      entityType: 'Shop',
      entityId: shop.id,
      metadata: { before: { commissionRateBps: before.commissionRateBps, fulfillmentMode: before.fulfillmentMode }, after: req.valid.body },
    });
    res.json({ shop });
  },
);

export default router;
