import { prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { pageResult, paginate } from '../../lib/pagination.js';
import { dailySeries, startOfMarketDay, topProducts } from '../../lib/reporting.js';
import { shopBalance } from '../../domain/finance.js';
import { STATUS_LABELS } from '../../domain/orderStatus.js';
import { onboardingChecklist } from './seller.shop.js';

const COUNTED = { notIn: ['PENDING_PAYMENT', 'CANCELLED'] };

export async function dashboard(req) {
  const shop = req.shop;
  if (!shop) {
    return { shop: null, checklist: onboardingChecklist(req.sellerProfile, null, 0), announcements: await announcements() };
  }
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const startOfToday = startOfMarketDay();

  const [series, statusCounts, lowStock, publishedCount, recent, balance, revenueToday, revenue30, pendingRefunds, ann] = await Promise.all([
    dailySeries({ shopId: shop.id, days: 30 }),
    prisma.sellerOrder.groupBy({ by: ['status'], where: { shopId: shop.id }, _count: { _all: true } }),
    prisma.$queryRaw`SELECT id, name, stock, "lowStockThreshold" FROM "Product" WHERE "shopId" = ${shop.id} AND "deletedAt" IS NULL AND status = 'PUBLISHED' AND stock <= "lowStockThreshold" ORDER BY stock ASC LIMIT 8`,
    prisma.product.count({ where: { shopId: shop.id, status: 'PUBLISHED', deletedAt: null } }),
    prisma.sellerOrder.findMany({
      where: { shopId: shop.id, status: { not: 'PENDING_PAYMENT' } },
      orderBy: { createdAt: 'desc' },
      take: 6,
      include: { order: { select: { shippingName: true } } },
    }),
    shopBalance(shop.id),
    prisma.sellerOrder.aggregate({ where: { shopId: shop.id, status: COUNTED, createdAt: { gte: startOfToday } }, _sum: { subtotal: true }, _count: { _all: true } }),
    prisma.sellerOrder.aggregate({ where: { shopId: shop.id, status: COUNTED, createdAt: { gte: since30 } }, _sum: { subtotal: true }, _count: { _all: true } }),
    prisma.refund.count({ where: { sellerOrder: { shopId: shop.id }, status: 'REQUESTED' } }),
    announcements(),
  ]);
  const count = (s) => statusCounts.find((c) => c.status === s)?._count._all ?? 0;

  return {
    shop: { id: shop.id, name: shop.name, slug: shop.slug, status: shop.status, isOpen: shop.isOpen, vacationMode: shop.vacationMode, ratingAvg: shop.ratingAvg, ratingCount: shop.ratingCount },
    checklist: onboardingChecklist(req.sellerProfile, shop, publishedCount),
    kpis: {
      revenueToday: revenueToday._sum.subtotal ?? 0,
      ordersToday: revenueToday._count._all,
      revenue30: revenue30._sum.subtotal ?? 0,
      orders30: revenue30._count._all,
      avgOrderValue30: revenue30._count._all ? Math.round((revenue30._sum.subtotal ?? 0) / revenue30._count._all) : 0,
      newOrders: count('PLACED'),
      inProgress: count('ACCEPTED') + count('PREPARING') + count('READY'),
      inTransit: count('IN_TRANSIT'),
      publishedProducts: publishedCount,
      pendingRefunds,
    },
    balance,
    series,
    lowStock,
    recentOrders: recent.map((so) => ({
      id: so.id,
      number: so.number,
      status: so.status,
      statusLabel: STATUS_LABELS[so.status],
      total: so.total,
      buyerName: so.order.shippingName,
      createdAt: so.createdAt,
    })),
    announcements: ann,
  };
}

async function announcements() {
  return prisma.announcement.findMany({
    where: { isPublished: true, audience: { in: ['ALL', 'SELLERS'] } },
    orderBy: { publishedAt: 'desc' },
    take: 3,
    select: { id: true, title: true, body: true, publishedAt: true },
  });
}

export async function analytics(shop, { days }) {
  const since = new Date(Date.now() - days * 86_400_000);
  const [series, top, statusCounts, totals, ratingDist] = await Promise.all([
    dailySeries({ shopId: shop.id, days }),
    topProducts({ shopId: shop.id, days }),
    prisma.sellerOrder.groupBy({ by: ['status'], where: { shopId: shop.id, createdAt: { gte: since }, status: { not: 'PENDING_PAYMENT' } }, _count: { _all: true } }),
    prisma.sellerOrder.aggregate({
      where: { shopId: shop.id, createdAt: { gte: since }, status: COUNTED },
      _sum: { subtotal: true, commissionAmount: true, sellerNet: true },
      _count: { _all: true },
    }),
    prisma.review.groupBy({ by: ['rating'], where: { product: { shopId: shop.id }, isHidden: false }, _count: { _all: true } }),
  ]);
  const cancelled = statusCounts.find((s) => s.status === 'CANCELLED')?._count._all ?? 0;
  const all = statusCounts.reduce((s, c) => s + c._count._all, 0);
  return {
    days,
    series,
    topProducts: top,
    ordersByStatus: statusCounts.map((s) => ({ status: s.status, label: STATUS_LABELS[s.status], count: s._count._all })),
    totals: {
      revenue: totals._sum.subtotal ?? 0,
      commission: totals._sum.commissionAmount ?? 0,
      net: totals._sum.sellerNet ?? 0,
      orders: totals._count._all,
      avgOrderValue: totals._count._all ? Math.round((totals._sum.subtotal ?? 0) / totals._count._all) : 0,
      cancellationRate: all ? Math.round((cancelled / all) * 1000) / 10 : 0,
    },
    ratings: [5, 4, 3, 2, 1].map((r) => ({ rating: r, count: ratingDist.find((d) => d.rating === r)?._count._all ?? 0 })),
  };
}

export async function finance(req, { page, pageSize }) {
  const shop = req.shop;
  const [balance, total, entries, payouts] = await Promise.all([
    shopBalance(shop.id),
    prisma.sellerLedgerEntry.count({ where: { shopId: shop.id } }),
    prisma.sellerLedgerEntry.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: 'desc' }, ...paginate({ page, pageSize }) }),
    prisma.payout.findMany({ where: { shopId: shop.id }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  const profile = req.sellerProfile;
  return {
    balance,
    payoutAccount: profile
      ? { method: profile.payoutMethod, accountName: profile.payoutAccountName, accountNumber: profile.payoutAccountNumber }
      : null,
    ledger: pageResult(entries, total, { page, pageSize }),
    payouts,
  };
}

export async function listReviews(shop, { rating, page, pageSize }) {
  const where = { product: { shopId: shop.id }, ...(rating ? { rating } : {}) };
  const [total, rows] = await Promise.all([
    prisma.review.count({ where }),
    prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginate({ page, pageSize }),
      include: { product: { select: { name: true, slug: true } }, user: { select: { name: true } } },
    }),
  ]);
  return pageResult(
    rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      isHidden: r.isHidden,
      author: r.user.name.split(' ')[0],
      product: r.product,
      sellerReply: r.sellerReply,
      createdAt: r.createdAt,
    })),
    total,
    { page, pageSize },
  );
}

export async function replyToReview(shop, reviewId, reply) {
  const review = await prisma.review.findFirst({ where: { id: reviewId, product: { shopId: shop.id } } });
  if (!review) throw notFound('Review');
  return prisma.review.update({ where: { id: reviewId }, data: { sellerReply: reply, sellerRepliedAt: new Date() } });
}

export async function listRefunds(shop) {
  const rows = await prisma.refund.findMany({
    where: { sellerOrder: { shopId: shop.id } },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { sellerOrder: { select: { id: true, number: true } }, items: { include: { orderItem: { select: { productName: true } } } } },
  });
  return rows.map((r) => ({
    id: r.id,
    sellerOrderId: r.sellerOrder?.id,
    number: r.sellerOrder?.number,
    amount: r.amount,
    status: r.status,
    reason: r.reason,
    details: r.details,
    sellerResponse: r.sellerResponse,
    isAutomatic: r.isAutomatic,
    createdAt: r.createdAt,
    items: r.items.map((i) => ({ name: i.orderItem.productName, quantity: i.quantity, amount: i.amount })),
  }));
}

export async function respondToRefund(shop, refundId, response) {
  const refund = await prisma.refund.findFirst({ where: { id: refundId, sellerOrder: { shopId: shop.id } } });
  if (!refund) throw notFound('Refund');
  if (refund.status !== 'REQUESTED') throw conflict('This refund has already been reviewed.');
  return prisma.refund.update({ where: { id: refundId }, data: { sellerResponse: response } });
}
