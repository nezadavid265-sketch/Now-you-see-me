import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { dateString, id } from '../../lib/validators.js';
import { toCsv } from '../../lib/http.js';
import { num } from '../../lib/reporting.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { getSettings, settingsSchema, updateSettings } from '../../services/settings.js';

const MAX_ROWS = 50_000;

// ── Reports (CSV downloads) ────────────────────────────────────────
export const reportsRouter = Router();

const REPORTS = {
  orders: {
    filename: 'orders',
    async rows(range) {
      return prisma.order.findMany({
        where: range ? { createdAt: range } : {},
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        include: { buyer: { select: { name: true, email: true } } },
      });
    },
    columns: [
      { label: 'Order number', value: 'orderNumber' },
      { label: 'Date', value: 'createdAt' },
      { label: 'Buyer', value: (r) => r.buyer.name },
      { label: 'Buyer email', value: (r) => r.buyer.email },
      { label: 'Status', value: 'status' },
      { label: 'Payment status', value: 'paymentStatus' },
      { label: 'Payment method', value: 'paymentMethod' },
      { label: 'Subtotal', value: 'subtotal' },
      { label: 'Delivery fee', value: 'deliveryFee' },
      { label: 'Discount', value: 'discount' },
      { label: 'Total', value: 'total' },
      { label: 'Currency', value: 'currency' },
      { label: 'City', value: 'shippingCity' },
    ],
  },
  'sales-by-shop': {
    filename: 'sales-by-shop',
    async rows(range) {
      const from = range?.gte ?? new Date(0);
      const to = range?.lte ?? new Date();
      const rows = await prisma.$queryRaw`
        SELECT s.name AS shop, COUNT(so.id)::bigint AS orders, COALESCE(SUM(so.subtotal),0)::bigint AS sales,
               COALESCE(SUM(so."deliveryFee"),0)::bigint AS delivery, COALESCE(SUM(so."commissionAmount"),0)::bigint AS commission,
               COALESCE(SUM(so."sellerNet"),0)::bigint AS net
        FROM "SellerOrder" so JOIN "Shop" s ON s.id = so."shopId"
        WHERE so.status NOT IN ('PENDING_PAYMENT','CANCELLED') AND so."createdAt" BETWEEN ${from} AND ${to}
        GROUP BY s.name ORDER BY sales DESC`;
      return rows.map((r) => ({ shop: r.shop, orders: num(r.orders), sales: num(r.sales), delivery: num(r.delivery), commission: num(r.commission), net: num(r.net) }));
    },
    columns: [
      { label: 'Shop', value: 'shop' },
      { label: 'Orders', value: 'orders' },
      { label: 'Product sales', value: 'sales' },
      { label: 'Delivery fees', value: 'delivery' },
      { label: 'Commission', value: 'commission' },
      { label: 'Seller net', value: 'net' },
    ],
  },
  commissions: {
    filename: 'commissions',
    async rows(range) {
      return prisma.sellerOrder.findMany({
        where: { status: { in: ['DELIVERED', 'REFUNDED'] }, ...(range ? { deliveredAt: range } : {}) },
        orderBy: { deliveredAt: 'desc' },
        take: MAX_ROWS,
        include: { shop: { select: { name: true } } },
      });
    },
    columns: [
      { label: 'Shipment', value: 'number' },
      { label: 'Shop', value: (r) => r.shop.name },
      { label: 'Delivered at', value: 'deliveredAt' },
      { label: 'Product sales', value: 'subtotal' },
      { label: 'Commission', value: 'commissionAmount' },
      { label: 'Seller net', value: 'sellerNet' },
      { label: 'Status', value: 'status' },
    ],
  },
  payouts: {
    filename: 'payouts',
    async rows(range) {
      return prisma.payout.findMany({
        where: range ? { createdAt: range } : {},
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        include: { shop: { select: { name: true } } },
      });
    },
    columns: [
      { label: 'Created', value: 'createdAt' },
      { label: 'Shop', value: (r) => r.shop.name },
      { label: 'Amount', value: 'amount' },
      { label: 'Method', value: 'method' },
      { label: 'Account name', value: 'accountName' },
      { label: 'Account number', value: 'accountNumber' },
      { label: 'Status', value: 'status' },
      { label: 'Reference', value: 'reference' },
      { label: 'Paid at', value: 'paidAt' },
    ],
  },
  refunds: {
    filename: 'refunds',
    async rows(range) {
      return prisma.refund.findMany({
        where: range ? { createdAt: range } : {},
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        include: { order: { select: { orderNumber: true } }, buyer: { select: { name: true } }, sellerOrder: { select: { shop: { select: { name: true } } } } },
      });
    },
    columns: [
      { label: 'Requested', value: 'createdAt' },
      { label: 'Order', value: (r) => r.order.orderNumber },
      { label: 'Shop', value: (r) => r.sellerOrder?.shop.name ?? '' },
      { label: 'Buyer', value: (r) => r.buyer.name },
      { label: 'Amount', value: 'amount' },
      { label: 'Status', value: 'status' },
      { label: 'Reason', value: 'reason' },
      { label: 'Automatic', value: (r) => (r.isAutomatic ? 'yes' : 'no') },
      { label: 'Completed', value: 'completedAt' },
      { label: 'Reference', value: 'providerReference' },
    ],
  },
  products: {
    filename: 'products',
    async rows() {
      return prisma.product.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: MAX_ROWS,
        include: { shop: { select: { name: true } }, category: { select: { name: true } } },
      });
    },
    columns: [
      { label: 'Name', value: 'name' },
      { label: 'SKU', value: 'sku' },
      { label: 'Shop', value: (r) => r.shop.name },
      { label: 'Category', value: (r) => r.category.name },
      { label: 'Price', value: 'price' },
      { label: 'Stock', value: 'stock' },
      { label: 'Status', value: 'status' },
      { label: 'Moderation', value: 'moderationStatus' },
      { label: 'Units sold', value: 'soldCount' },
      { label: 'Rating', value: (r) => r.ratingAvg.toFixed(1) },
    ],
  },
};

reportsRouter.get('/', (_req, res) => {
  res.json({ items: Object.keys(REPORTS) });
});

reportsRouter.get(
  '/:type',
  validate({ params: z.object({ type: z.enum(Object.keys(REPORTS)) }), query: z.object({ from: dateString.optional(), to: dateString.optional() }) }),
  async (req, res) => {
    const report = REPORTS[req.valid.params.type];
    const { from, to } = req.valid.query;
    const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : undefined;
    const rows = await report.rows(range);
    await audit(req, 'admin.report_exported', { metadata: { type: req.valid.params.type, rows: rows.length, from, to } });
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="rivoshoppa-${report.filename}-${stamp}.csv"`);
    res.send(String.fromCharCode(0xfeff) + toCsv(rows, report.columns)); // BOM so Excel detects UTF-8
  },
);

// ── Audit logs & security monitoring ───────────────────────────────
export const auditRouter = Router();

auditRouter.get(
  '/',
  validate({
    query: z.object({
      action: z.string().trim().max(80).optional(),
      actorId: id.optional(),
      entityType: z.string().trim().max(40).optional(),
      entityId: id.optional(),
      from: dateString.optional(),
      to: dateString.optional(),
      ...paginationSchema,
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }),
  }),
  async (req, res) => {
    const { action, actorId, entityType, entityId, from, to, page, pageSize } = req.valid.query;
    const where = {
      ...(action ? { action: { startsWith: action } } : {}),
      ...(actorId ? { actorId } : {}),
      ...(entityType ? { entityType } : {}),
      ...(entityId ? { entityId } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate({ page, pageSize }), include: { actor: { select: { name: true, email: true } } } }),
    ]);
    res.json(pageResult(items, total, { page, pageSize }));
  },
);

export const securityRouter = Router();

securityRouter.get('/', async (_req, res) => {
  const since = new Date(Date.now() - 86_400_000);
  const [failedLogins, lockouts, tokenReuse, lockedAccounts, suspended, failedByIp, recentAdminActions] = await Promise.all([
    prisma.auditLog.count({ where: { action: 'auth.login_failed', createdAt: { gte: since } } }),
    prisma.auditLog.count({ where: { action: 'auth.account_locked', createdAt: { gte: since } } }),
    prisma.auditLog.findMany({ where: { action: 'auth.refresh_token_reuse' }, orderBy: { createdAt: 'desc' }, take: 10, include: { actor: { select: { email: true } } } }),
    prisma.user.findMany({ where: { lockedUntil: { gt: new Date() } }, select: { id: true, name: true, email: true, role: true, lockedUntil: true } }),
    prisma.user.count({ where: { status: 'SUSPENDED' } }),
    prisma.auditLog.groupBy({
      by: ['ip'],
      where: { action: 'auth.login_failed', createdAt: { gte: since } },
      _count: { _all: true },
      orderBy: { _count: { ip: 'desc' } },
      take: 10,
    }),
    prisma.auditLog.findMany({
      where: { action: { startsWith: 'admin.' } },
      orderBy: { createdAt: 'desc' },
      take: 15,
      include: { actor: { select: { name: true } } },
    }),
  ]);
  res.json({
    last24h: { failedLogins, lockouts },
    lockedAccounts,
    suspendedAccounts: suspended,
    suspiciousIps: failedByIp.map((r) => ({ ip: r.ip, failures: r._count._all })),
    tokenReuse,
    recentAdminActions,
  });
});

// ── Marketplace settings ───────────────────────────────────────────
export const settingsRouter = Router();

settingsRouter.get('/', async (_req, res) => {
  res.json({ settings: await getSettings({ fresh: true }) });
});

settingsRouter.patch('/', validate({ body: settingsSchema.partial() }), async (req, res) => {
  const before = await getSettings({ fresh: true });
  const settings = await updateSettings(req.valid.body, req.user.id);
  const changed = Object.fromEntries(Object.keys(req.valid.body).map((k) => [k, { from: before[k], to: settings[k] }]));
  await audit(req, 'admin.settings_updated', { entityType: 'Setting', metadata: changed });
  res.json({ settings });
});
