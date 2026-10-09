import { Prisma } from '@prisma/client';
import { prisma } from './prisma.js';

// Reporting is grouped by the marketplace's local calendar day.
export const MARKET_TIMEZONE = process.env.MARKET_TIMEZONE || 'Africa/Kigali';

const num = (v) => Number(v ?? 0);

/**
 * Daily revenue/orders series for seller orders, optionally for one shop.
 * Counts orders that were paid or confirmed (excludes unpaid and cancelled).
 */
export async function dailySeries({ shopId, days }) {
  const since = new Date(Date.now() - days * 86_400_000);
  const shopFilter = shopId ? Prisma.sql`AND "shopId" = ${shopId}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT to_char(date_trunc('day', ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${MARKET_TIMEZONE}), 'YYYY-MM-DD') AS day,
           COUNT(*)::bigint AS orders,
           COALESCE(SUM(subtotal), 0)::bigint AS revenue,
           COALESCE(SUM("commissionAmount"), 0)::bigint AS commission
    FROM "SellerOrder"
    WHERE "createdAt" >= ${since} AND status NOT IN ('PENDING_PAYMENT', 'CANCELLED') ${shopFilter}
    GROUP BY 1 ORDER BY 1`;
  const map = new Map(rows.map((r) => [r.day, { orders: num(r.orders), revenue: num(r.revenue), commission: num(r.commission) }]));
  const out = [];
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: MARKET_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
  for (let i = days - 1; i >= 0; i--) {
    const day = fmt.format(new Date(Date.now() - i * 86_400_000));
    out.push({ day, ...(map.get(day) ?? { orders: 0, revenue: 0, commission: 0 }) });
  }
  return out;
}

export async function topProducts({ shopId, days, limit = 10 }) {
  const since = new Date(Date.now() - days * 86_400_000);
  const shopFilter = shopId ? Prisma.sql`AND so."shopId" = ${shopId}` : Prisma.empty;
  const rows = await prisma.$queryRaw`
    SELECT oi."productId" AS "productId", MAX(oi."productName") AS name, MAX(oi."productImage") AS image,
           SUM(oi.quantity - oi."refundedQuantity")::bigint AS units, SUM(oi."lineTotal")::bigint AS revenue
    FROM "OrderItem" oi JOIN "SellerOrder" so ON so.id = oi."sellerOrderId"
    WHERE so."createdAt" >= ${since} AND so.status NOT IN ('PENDING_PAYMENT', 'CANCELLED') ${shopFilter}
    GROUP BY oi."productId" ORDER BY revenue DESC LIMIT ${limit}`;
  return rows.map((r) => ({ productId: r.productId, name: r.name, image: r.image, units: num(r.units), revenue: num(r.revenue) }));
}

export { num };

/** Midnight (start of the current day) in the marketplace timezone, as a UTC Date. */
export function startOfMarketDay(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: MARKET_TIMEZONE,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, Number(x.value)]));
  const offset = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(date.getTime() / 1000) * 1000;
  return new Date(Date.UTC(p.year, p.month - 1, p.day) - offset);
}
