import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { dailySeries, num, startOfMarketDay } from '../../lib/reporting.js';
import { STATUS_LABELS } from '../../domain/orderStatus.js';

const router = Router();

router.get('/', async (_req, res) => {
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const today = startOfMarketDay();
  const counted = { status: { notIn: ['PENDING_PAYMENT', 'CANCELLED'] } };

  const [
    buyers, sellersByStatus, activeShops, publishedProducts, pendingProducts, ordersTotal, ordersToday,
    gmv30, commission30, refundsRequested, openTickets, unassignedDeliveries, pendingPayouts, series, recentOrders, topShops,
  ] = await Promise.all([
    prisma.user.count({ where: { role: 'BUYER' } }),
    prisma.sellerProfile.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.shop.count({ where: { status: 'ACTIVE' } }),
    prisma.product.count({ where: { status: 'PUBLISHED', moderationStatus: 'APPROVED', deletedAt: null } }),
    prisma.product.count({ where: { moderationStatus: 'PENDING', deletedAt: null } }),
    prisma.order.count({ where: { status: { not: 'PENDING_PAYMENT' } } }),
    prisma.order.count({ where: { createdAt: { gte: today }, status: { not: 'PENDING_PAYMENT' } } }),
    prisma.sellerOrder.aggregate({ where: { ...counted, createdAt: { gte: since30 } }, _sum: { total: true }, _count: { _all: true } }),
    prisma.sellerOrder.aggregate({ where: { status: { in: ['DELIVERED'] }, deliveredAt: { gte: since30 } }, _sum: { commissionAmount: true } }),
    prisma.refund.count({ where: { status: { in: ['REQUESTED', 'APPROVED'] } } }),
    prisma.supportTicket.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
    prisma.delivery.count({ where: { status: 'PENDING', staffId: null } }),
    prisma.payout.aggregate({ where: { status: 'PENDING' }, _sum: { amount: true }, _count: { _all: true } }),
    dailySeries({ days: 30 }),
    prisma.order.findMany({
      where: { status: { not: 'PENDING_PAYMENT' } },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, orderNumber: true, status: true, total: true, createdAt: true, buyer: { select: { name: true } } },
    }),
    prisma.$queryRaw`
      SELECT s.id, s.name, s.slug, COALESCE(SUM(so.subtotal), 0)::bigint AS revenue, COUNT(so.id)::bigint AS orders
      FROM "Shop" s JOIN "SellerOrder" so ON so."shopId" = s.id
      WHERE so."createdAt" >= ${since30} AND so.status NOT IN ('PENDING_PAYMENT', 'CANCELLED')
      GROUP BY s.id ORDER BY revenue DESC LIMIT 5`,
  ]);
  const sellerCount = (s) => sellersByStatus.find((x) => x.status === s)?._count._all ?? 0;

  res.json({
    totals: {
      buyers,
      sellers: sellersByStatus.reduce((s, x) => s + x._count._all, 0),
      approvedSellers: sellerCount('APPROVED'),
      activeShops,
      publishedProducts,
      orders: ordersTotal,
      ordersToday,
      gmv30: gmv30._sum.total ?? 0,
      orders30: gmv30._count._all,
      commission30: commission30._sum.commissionAmount ?? 0,
    },
    pending: {
      sellerApplications: sellerCount('PENDING'),
      productReviews: pendingProducts,
      refunds: refundsRequested,
      tickets: openTickets,
      unassignedDeliveries,
      payouts: pendingPayouts._count._all,
      payoutAmount: pendingPayouts._sum.amount ?? 0,
    },
    series,
    recentOrders: recentOrders.map((o) => ({ ...o, buyer: o.buyer.name, statusLabel: o.status })),
    topShops: topShops.map((s) => ({ id: s.id, name: s.name, slug: s.slug, revenue: num(s.revenue), orders: num(s.orders) })),
    statusLabels: STATUS_LABELS,
  });
});

export default router;
