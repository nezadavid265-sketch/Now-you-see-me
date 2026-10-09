import crypto from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { badRequest, conflict, notFound, unprocessable } from '../lib/errors.js';
import { numericCode } from '../lib/crypto.js';
import { getSettings } from '../services/settings.js';
import { notify, notifyShopOwner } from '../services/notifications.js';
import { enabledMethods } from '../integrations/payments/index.js';
import { buildQuote, PRICING_INCLUDE } from './pricing.js';
import { changeStock, alertLowStock } from './inventory.js';
import { startPayment } from './payments.js';
import { transitionSellerOrder, afterTransition } from './orders.js';

const ORDER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateOrderNumber(now = new Date()) {
  const date = now.toISOString().slice(2, 10).replace(/-/g, '');
  const bytes = crypto.randomBytes(6);
  const suffix = Array.from(bytes, (b) => ORDER_ALPHABET[b % ORDER_ALPHABET.length]).join('');
  return `RS-${date}-${suffix}`;
}

export async function loadCartLines(db, userId) {
  const items = await db.cartItem.findMany({
    where: { userId },
    include: { product: { include: PRICING_INCLUDE } },
    orderBy: { createdAt: 'asc' },
  });
  return items.map((i) => ({ cartItemId: i.id, product: i.product, quantity: i.quantity }));
}

export async function quoteCart(userId, { couponCode } = {}) {
  const settings = await getSettings();
  const lines = await loadCartLines(prisma, userId);
  const quote = await buildQuote(prisma, { lines, settings, couponCode, userId });
  return { ...quote, paymentMethods: enabledMethods(settings) };
}

/**
 * Places an order from the buyer's server-side cart.
 *
 * Everything that matters is recomputed inside one transaction: product
 * availability, prices, delivery fees, coupon validity, commissions and
 * stock reservation (conditional decrements — no overselling). Checkouts for
 * the same buyer are serialised with an advisory lock, and an optional
 * Idempotency-Key makes retried submissions return the original order.
 */
export async function placeOrder(user, { addressId, couponCode, paymentMethod, payerPhone, idempotencyKey }) {
  const settings = await getSettings();
  const methods = enabledMethods(settings);
  const method = methods.find((m) => m.method === paymentMethod);
  if (!method) throw badRequest('Please choose an available payment method.');
  if (method.requiresPhone && !payerPhone) {
    throw unprocessable('Enter the mobile money number to charge.', { fieldErrors: { payerPhone: 'Phone number is required' } });
  }

  const address = await prisma.address.findFirst({ where: { id: addressId, userId: user.id } });
  if (!address) throw notFound('Delivery address');

  const { order, lowStock, replay } = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`checkout:${user.id}`}))`;

      if (idempotencyKey) {
        const existing = await tx.order.findUnique({ where: { buyerId_idempotencyKey: { buyerId: user.id, idempotencyKey } } });
        if (existing) return { order: existing, lowStock: [], replay: true };
      }

      const lines = await loadCartLines(tx, user.id);
      if (!lines.length) throw unprocessable('Your cart is empty.');
      const quote = await buildQuote(tx, { lines, settings, couponCode, userId: user.id });
      if (quote.problems.length) {
        throw conflict('Some items in your cart need your attention before checkout.', {
          code: 'CART_PROBLEMS',
          details: { problems: quote.problems },
        });
      }
      if (couponCode && quote.couponError) {
        throw unprocessable(quote.couponError, { fieldErrors: { couponCode: quote.couponError } });
      }
      const isCod = paymentMethod === 'CASH_ON_DELIVERY';
      if (isCod && quote.total > settings.codMaxOrderTotal) {
        throw unprocessable(`Cash on delivery is available for orders up to ${settings.codMaxOrderTotal.toLocaleString('en-US')} ${settings.currency}.`);
      }

      // Reserve stock. Fails the whole transaction if anything sold out meanwhile.
      const touched = [];
      for (const line of lines) {
        touched.push(
          await changeStock(tx, {
            productId: line.product.id,
            change: -line.quantity,
            reason: 'ORDER',
            productName: line.product.name,
            actorId: user.id,
          }),
        );
        await tx.product.update({ where: { id: line.product.id }, data: { soldCount: { increment: line.quantity } } });
      }

      if (quote.coupon) {
        const used = await tx.$executeRaw`
          UPDATE "Coupon" SET "usedCount" = "usedCount" + 1, "updatedAt" = NOW()
          WHERE id = ${quote.coupon.id} AND "isActive" = true AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")`;
        if (!used) throw unprocessable('This promo code has just reached its usage limit.', { fieldErrors: { couponCode: 'No longer available' } });
      }

      const orderNumber = generateOrderNumber();
      const now = new Date();
      const created = await tx.order.create({
        data: {
          orderNumber,
          buyerId: user.id,
          status: isCod ? 'PROCESSING' : 'PENDING_PAYMENT',
          paymentStatus: isCod ? 'PENDING' : 'UNPAID',
          paymentMethod,
          currency: settings.currency,
          subtotal: quote.subtotal,
          deliveryFee: quote.deliveryFee,
          discount: quote.discount,
          total: quote.total,
          couponId: quote.coupon?.id ?? null,
          couponCode: quote.coupon?.code ?? null,
          idempotencyKey: idempotencyKey ?? null,
          shippingName: address.recipientName,
          shippingPhone: address.phone,
          shippingLine1: address.line1,
          shippingLine2: address.line2,
          shippingSector: address.sector,
          shippingDistrict: address.district,
          shippingCity: address.city,
          shippingCountry: address.country,
          shippingLat: address.latitude,
          shippingLng: address.longitude,
          shippingInstructions: address.instructions,
          paymentExpiresAt: isCod ? null : new Date(now.getTime() + settings.paymentTimeoutMinutes * 60_000),
          events: {
            create: { status: isCod ? 'PLACED' : 'PENDING_PAYMENT', note: 'Order placed', actorId: user.id, actorRole: 'BUYER' },
          },
          sellerOrders: {
            create: quote.groups.map((g, idx) => ({
              shopId: g.shop.id,
              number: `${orderNumber}-${idx + 1}`,
              status: isCod ? 'PLACED' : 'PENDING_PAYMENT',
              fulfillmentMode: g.fulfillmentMode,
              subtotal: g.subtotal,
              deliveryFee: g.deliveryFee,
              discount: g.discount,
              shopFundedDiscount: g.shopFundedDiscount,
              total: g.total,
              commissionAmount: g.commissionAmount,
              sellerNet: g.sellerNet,
              deliveryCode: numericCode(6),
              items: {
                create: g.items.map((i) => ({
                  productId: i.productId,
                  productName: i.name,
                  productSlug: i.slug,
                  productImage: i.image,
                  sku: i.sku,
                  unitPrice: i.unitPrice,
                  quantity: i.quantity,
                  lineTotal: i.lineTotal,
                  commissionRateBps: i.commissionRateBps,
                  commissionAmount: i.commissionAmount,
                })),
              },
            })),
          },
        },
        include: { sellerOrders: true },
      });

      if (quote.coupon) {
        await tx.couponRedemption.create({
          data: { couponId: quote.coupon.id, userId: user.id, orderId: created.id, amount: quote.discount },
        });
      }
      if (isCod) {
        await tx.payment.create({
          data: { orderId: created.id, provider: 'CASH_ON_DELIVERY', amount: created.total, currency: created.currency, providerFinal: true },
        });
      }
      await tx.cartItem.deleteMany({ where: { userId: user.id, id: { in: lines.map((l) => l.cartItemId) } } });
      return { order: created, lowStock: touched, replay: false };
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  if (replay) {
    return { order, payment: await prisma.payment.findFirst({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' } }), replay };
  }

  await alertLowStock(lowStock);

  if (paymentMethod === 'CASH_ON_DELIVERY') {
    await notify(user.id, {
      type: 'order.placed',
      title: `Order ${order.orderNumber} confirmed`,
      body: `Thank you! Pay ${order.total.toLocaleString('en-US')} ${order.currency} in cash when your order arrives.`,
      link: `/account/orders/${order.id}`,
      sms: true,
    });
    for (const so of order.sellerOrders) {
      await notifyShopOwner(so.shopId, {
        type: 'order.new',
        title: `New order ${so.number}`,
        body: 'A cash-on-delivery order is waiting for you. Accept it to start preparing.',
        link: `/seller/orders/${so.id}`,
        sms: true,
      });
    }
    return { order, payment: null };
  }

  const payment = await startPayment({ order, method: paymentMethod, phone: payerPhone });
  return { order, payment };
}

/** Starts a new payment attempt for an order that is still awaiting payment. */
export async function retryOrderPayment(user, orderId, { paymentMethod, payerPhone }) {
  const settings = await getSettings();
  const order = await prisma.order.findFirst({ where: { id: orderId, buyerId: user.id }, include: { sellerOrders: true } });
  if (!order) throw notFound('Order');
  if (order.status !== 'PENDING_PAYMENT') throw conflict('This order is no longer awaiting payment.');
  if (order.paymentExpiresAt && order.paymentExpiresAt < new Date()) {
    throw conflict('The payment window for this order has closed. Please place the order again.');
  }
  const method = enabledMethods(settings).find((m) => m.method === paymentMethod);
  if (!method) throw badRequest('Please choose an available payment method.');

  if (paymentMethod === 'CASH_ON_DELIVERY') {
    if (order.total > settings.codMaxOrderTotal) {
      throw unprocessable(`Cash on delivery is available for orders up to ${settings.codMaxOrderTotal.toLocaleString('en-US')} ${settings.currency}.`);
    }
    // Switch to cash on delivery: the order is confirmed immediately.
    const results = await prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: { orderId: order.id, status: 'PENDING' },
        data: { status: 'EXPIRED', failedAt: new Date(), failureReason: 'Buyer switched to cash on delivery' },
      });
      await tx.order.update({ where: { id: order.id }, data: { paymentMethod: 'CASH_ON_DELIVERY', paymentStatus: 'PENDING', paymentExpiresAt: null } });
      await tx.payment.create({
        data: { orderId: order.id, provider: 'CASH_ON_DELIVERY', amount: order.total, currency: order.currency, providerFinal: true },
      });
      const out = [];
      for (const so of order.sellerOrders.filter((s) => s.status === 'PENDING_PAYMENT')) {
        out.push(await transitionSellerOrder(tx, so.id, 'PLACED', { actor: { id: user.id, role: 'SYSTEM' }, note: 'Cash on delivery selected' }));
      }
      return out;
    });
    for (const r of results) {
      await afterTransition(r, { role: 'SYSTEM' });
      await notifyShopOwner(r.shopId, {
        type: 'order.new',
        title: `New order ${r.sellerOrder.number}`,
        body: 'A cash-on-delivery order is waiting for you. Accept it to start preparing.',
        link: `/seller/orders/${r.sellerOrder.id}`,
        sms: true,
      });
    }
    return { order: await prisma.order.findUnique({ where: { id: order.id } }), payment: null };
  }

  if (!payerPhone) throw unprocessable('Enter the mobile money number to charge.', { fieldErrors: { payerPhone: 'Phone number is required' } });
  const payment = await startPayment({ order, method: paymentMethod, phone: payerPhone });
  return { order, payment };
}
