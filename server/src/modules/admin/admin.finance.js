import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { dateString, id, optionalText, text } from '../../lib/validators.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { num } from '../../lib/reporting.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { refreshPaymentStatus } from '../../domain/payments.js';
import { approveRefund, completeRefund, rejectRefund } from '../../domain/refunds.js';
import { cancelPayout, createPayout, markPayoutPaid } from '../../domain/finance.js';

const params = z.object({ id });

// ── Payments ───────────────────────────────────────────────────────
export const paymentsRouter = Router();

paymentsRouter.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'EXPIRED']).optional(),
      provider: z.enum(['MTN_MOMO', 'AIRTEL_MONEY', 'CASH_ON_DELIVERY', 'TEST']).optional(),
      q: z.string().trim().max(100).optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => {
    const { status, provider, q, page, pageSize } = req.valid.query;
    const where = {
      ...(status ? { status } : {}),
      ...(provider ? { provider } : {}),
      ...(q
        ? { OR: [{ providerReference: { contains: q } }, { providerTransactionId: { contains: q } }, { order: { orderNumber: { contains: q, mode: 'insensitive' } } }] }
        : {}),
    };
    const [total, items, summary] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate({ page, pageSize }),
        include: { order: { select: { id: true, orderNumber: true, buyer: { select: { name: true } } } } },
      }),
      prisma.payment.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amount: true } }),
    ]);
    res.json({ ...pageResult(items, total, { page, pageSize }), summary });
  },
);

paymentsRouter.post('/:id/verify', validate({ params }), async (req, res) => {
  const payment = await refreshPaymentStatus(req.valid.params.id);
  if (!payment) throw notFound('Payment');
  await audit(req, 'admin.payment_verified', { entityType: 'Payment', entityId: payment.id, metadata: { status: payment.status } });
  res.json({ payment });
});

// ── Refunds ────────────────────────────────────────────────────────
export const refundsRouter = Router();

refundsRouter.get(
  '/',
  validate({ query: z.object({ status: z.enum(['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED']).optional(), ...paginationSchema }) }),
  async (req, res) => {
    const { status, page, pageSize } = req.valid.query;
    const where = status ? { status } : {};
    const [total, items] = await Promise.all([
      prisma.refund.count({ where }),
      prisma.refund.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate({ page, pageSize }),
        include: {
          order: { select: { id: true, orderNumber: true, paymentMethod: true } },
          buyer: { select: { name: true, email: true, phone: true } },
          sellerOrder: { select: { number: true, shop: { select: { name: true } } } },
          items: { include: { orderItem: { select: { productName: true } } } },
        },
      }),
    ]);
    res.json(pageResult(items, total, { page, pageSize }));
  },
);

refundsRouter.post('/:id/approve', validate({ params, body: z.object({ note: optionalText(500), restock: z.boolean().default(false) }) }), async (req, res) => {
  const refund = await approveRefund(req.user, req.valid.params.id, req.valid.body);
  await audit(req, 'admin.refund_approved', { entityType: 'Refund', entityId: refund.id, metadata: req.valid.body });
  res.json({ refund });
});

refundsRouter.post('/:id/reject', validate({ params, body: z.object({ note: text(500, 3) }) }), async (req, res) => {
  const refund = await rejectRefund(req.user, req.valid.params.id, req.valid.body);
  await audit(req, 'admin.refund_rejected', { entityType: 'Refund', entityId: refund.id, metadata: req.valid.body });
  res.json({ refund });
});

refundsRouter.post('/:id/complete', validate({ params, body: z.object({ reference: text(100, 2), note: optionalText(500) }) }), async (req, res) => {
  const refund = await completeRefund(req.user, req.valid.params.id, req.valid.body);
  await audit(req, 'admin.refund_completed', { entityType: 'Refund', entityId: refund.id, metadata: { reference: req.valid.body.reference } });
  res.json({ refund });
});

// ── Payouts, balances & commissions ────────────────────────────────
export const financeRouter = Router();

financeRouter.get('/summary', validate({ query: z.object({ from: dateString.optional(), to: dateString.optional() }) }), async (req, res) => {
  const { from, to } = req.valid.query;
  const range = from || to ? { gte: from, lte: to } : undefined;
  const [sales, delivered, refunds, paidOut, pendingPayouts, ledger] = await Promise.all([
    prisma.sellerOrder.aggregate({
      where: { status: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] }, ...(range ? { createdAt: range } : {}) },
      _sum: { total: true, subtotal: true, deliveryFee: true, discount: true },
      _count: { _all: true },
    }),
    prisma.sellerOrder.aggregate({
      where: { status: { in: ['DELIVERED', 'REFUNDED'] }, ...(range ? { deliveredAt: range } : {}) },
      _sum: { commissionAmount: true, sellerNet: true },
    }),
    prisma.refund.aggregate({ where: { status: 'COMPLETED', ...(range ? { completedAt: range } : {}) }, _sum: { amount: true }, _count: { _all: true } }),
    prisma.payout.aggregate({ where: { status: 'PAID', ...(range ? { paidAt: range } : {}) }, _sum: { amount: true } }),
    prisma.payout.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true } }),
    prisma.sellerLedgerEntry.aggregate({ _sum: { amount: true } }),
  ]);
  res.json({
    grossSales: sales._sum.total ?? 0,
    productSales: sales._sum.subtotal ?? 0,
    deliveryFees: sales._sum.deliveryFee ?? 0,
    discounts: sales._sum.discount ?? 0,
    orders: sales._count._all,
    commissionEarned: delivered._sum.commissionAmount ?? 0,
    sellerEarnings: delivered._sum.sellerNet ?? 0,
    refundsCompleted: refunds._sum.amount ?? 0,
    refundCount: refunds._count._all,
    paidOut: paidOut._sum.amount ?? 0,
    pendingPayouts: pendingPayouts._sum.amount ?? 0,
    owedToSellers: ledger._sum.amount ?? 0,
  });
});

financeRouter.get('/balances', validate({ query: z.object({ q: z.string().trim().max(100).optional(), ...paginationSchema }) }), async (req, res) => {
  const { q, page, pageSize } = req.valid.query;
  const now = new Date();
  const where = q ? { name: { contains: q, mode: 'insensitive' } } : {};
  const [total, shops] = await Promise.all([
    prisma.shop.count({ where }),
    prisma.shop.findMany({
      where,
      orderBy: { name: 'asc' },
      ...paginate({ page, pageSize }),
      select: { id: true, name: true, slug: true, status: true, seller: { select: { sellerProfile: { select: { payoutMethod: true, payoutAccountName: true, payoutAccountNumber: true } } } } },
    }),
  ]);
  const ids = shops.map((s) => s.id);
  const rows = ids.length
    ? await prisma.$queryRaw`
        SELECT "shopId",
               COALESCE(SUM(amount) FILTER (WHERE "availableAt" <= ${now}), 0)::bigint AS available,
               COALESCE(SUM(amount) FILTER (WHERE "availableAt" > ${now}), 0)::bigint AS pending
        FROM "SellerLedgerEntry" WHERE "shopId" = ANY(${ids}) GROUP BY "shopId"`
    : [];
  const map = new Map(rows.map((r) => [r.shopId, { available: num(r.available), pending: num(r.pending) }]));
  res.json(
    pageResult(
      shops.map((s) => ({ ...s, payoutAccount: s.seller.sellerProfile, seller: undefined, ...(map.get(s.id) ?? { available: 0, pending: 0 }) })),
      total,
      { page, pageSize },
    ),
  );
});

financeRouter.get(
  '/commissions',
  validate({ query: z.object({ from: dateString.optional(), to: dateString.optional(), shopId: id.optional(), ...paginationSchema }) }),
  async (req, res) => {
    const { from, to, shopId, page, pageSize } = req.valid.query;
    const where = {
      status: { in: ['DELIVERED', 'REFUNDED'] },
      ...(shopId ? { shopId } : {}),
      ...(from || to ? { deliveredAt: { gte: from, lte: to } } : {}),
    };
    const [total, items, sum] = await Promise.all([
      prisma.sellerOrder.count({ where }),
      prisma.sellerOrder.findMany({
        where,
        orderBy: { deliveredAt: 'desc' },
        ...paginate({ page, pageSize }),
        select: { id: true, number: true, subtotal: true, commissionAmount: true, sellerNet: true, deliveredAt: true, shop: { select: { name: true } } },
      }),
      prisma.sellerOrder.aggregate({ where, _sum: { subtotal: true, commissionAmount: true } }),
    ]);
    res.json({ ...pageResult(items, total, { page, pageSize }), totals: { sales: sum._sum.subtotal ?? 0, commission: sum._sum.commissionAmount ?? 0 } });
  },
);

export const payoutsRouter = Router();

payoutsRouter.get(
  '/',
  validate({ query: z.object({ status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional(), shopId: id.optional(), ...paginationSchema }) }),
  async (req, res) => {
    const { status, shopId, page, pageSize } = req.valid.query;
    const where = { ...(status ? { status } : {}), ...(shopId ? { shopId } : {}) };
    const [total, items] = await Promise.all([
      prisma.payout.count({ where }),
      prisma.payout.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate({ page, pageSize }), include: { shop: { select: { name: true, slug: true } } } }),
    ]);
    res.json(pageResult(items, total, { page, pageSize }));
  },
);

payoutsRouter.post(
  '/',
  validate({ body: z.object({ shopId: id, amount: z.coerce.number().int().min(1).optional(), note: optionalText(300) }) }),
  async (req, res) => {
    const payout = await createPayout(req.user, req.valid.body);
    await audit(req, 'admin.payout_created', { entityType: 'Payout', entityId: payout.id, metadata: { shopId: payout.shopId, amount: payout.amount } });
    res.status(201).json({ payout });
  },
);

payoutsRouter.post('/:id/paid', validate({ params, body: z.object({ reference: text(100, 2) }) }), async (req, res) => {
  const payout = await markPayoutPaid(req.user, req.valid.params.id, req.valid.body);
  await audit(req, 'admin.payout_paid', { entityType: 'Payout', entityId: payout.id, metadata: { reference: req.valid.body.reference } });
  res.json({ payout });
});

payoutsRouter.post('/:id/cancel', validate({ params, body: z.object({ note: optionalText(300) }) }), async (req, res) => {
  const payout = await cancelPayout(req.user, req.valid.params.id, req.valid.body);
  await audit(req, 'admin.payout_cancelled', { entityType: 'Payout', entityId: payout.id, metadata: req.valid.body });
  res.json({ payout });
});

