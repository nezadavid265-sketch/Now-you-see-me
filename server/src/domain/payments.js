import { prisma } from '../lib/prisma.js';
import { badRequest } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { getProvider } from '../integrations/payments/index.js';
import { notify, notifyAdmins, notifyShopOwner } from '../services/notifications.js';
import { transitionSellerOrder, afterTransition } from './orders.js';

const POLLABLE = ['MTN_MOMO', 'AIRTEL_MONEY'];

const maskPhone = (phone) => {
  const d = String(phone ?? '').replace(/\D/g, '');
  return d.length > 4 ? `${'•'.repeat(d.length - 4)}${d.slice(-4)}` : null;
};

/**
 * Creates a payment attempt for an order and asks the provider to collect it.
 * The amount always comes from the stored order total, never from the client.
 * Final state arrives through provider webhooks and the status poller.
 */
export async function startPayment({ order, method, phone }) {
  const provider = getProvider(method);
  if (!provider?.enabled) throw badRequest('This payment method is not available.');
  if (!phone) throw badRequest('A mobile money phone number is required.');

  // Older attempts that never completed are superseded (they keep being
  // polled, so money approved late is still detected and refunded).
  await prisma.payment.updateMany({
    where: { orderId: order.id, status: 'PENDING' },
    data: { status: 'EXPIRED', failedAt: new Date(), failureReason: 'Superseded by a new payment attempt' },
  });

  // The reference is stored before calling the provider so that an ambiguous
  // failure (e.g. a timeout) can still be reconciled by the status poller.
  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: method,
      amount: order.total,
      currency: provider.currency(),
      payerPhone: maskPhone(phone),
      providerReference: provider.newReference(),
    },
  });
  await prisma.order.update({ where: { id: order.id }, data: { paymentStatus: 'PENDING', paymentMethod: method } });

  let result;
  try {
    result = await provider.initiate({ payment, order, phone });
  } catch (err) {
    logger.error({ err, paymentId: payment.id, method }, 'Payment initiation failed');
    // The request may or may not have reached the provider: keep polling it.
    result = {
      status: 'FAILED',
      final: false,
      reason: 'The payment service did not respond. Please try again in a moment.',
    };
  }

  if (result.status === 'FAILED') {
    await markPaymentFailed(payment.id, { reason: result.reason, raw: 'INITIATION_FAILED', final: result.final !== false });
  }
  return prisma.payment.findUnique({ where: { id: payment.id } });
}

/**
 * Idempotent success handler. A payment can only succeed once (conditional
 * update), so duplicate webhooks, polling and retries are harmless. Money
 * that arrives for an order that is no longer awaiting payment (cancelled,
 * or already paid by another attempt) is never lost: a refund is opened.
 */
export async function markPaymentSucceeded(paymentId, { providerTransactionId = null, raw = 'SUCCEEDED' } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const outcome = await prisma.$transaction(
        async (tx) => {
          const now = new Date();
          const { count } = await tx.payment.updateMany({
            where: { id: paymentId, status: { in: ['PENDING', 'EXPIRED'] } },
            data: { status: 'SUCCEEDED', succeededAt: now, providerTransactionId, rawStatus: raw, providerFinal: true, failureReason: null },
          });
          if (count === 0) return { alreadyProcessed: true };

          const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: { include: { sellerOrders: true } } } });
          const { order } = payment;

          if (order.status === 'PENDING_PAYMENT') {
            await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', paidAt: now, paymentMethod: payment.provider } });
            const transitions = [];
            for (const so of order.sellerOrders.filter((s) => s.status === 'PENDING_PAYMENT')) {
              transitions.push(await transitionSellerOrder(tx, so.id, 'PLACED', { actor: { role: 'SYSTEM' }, note: 'Payment received' }));
            }
            return { placed: true, order, transitions };
          }

          const reason =
            order.status === 'CANCELLED' ? 'Payment received after the order was cancelled' : 'Duplicate payment for an order that was already paid';
          if (order.status === 'CANCELLED') {
            await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', paidAt: order.paidAt ?? now } });
          }
          await tx.refund.create({
            data: {
              orderId: order.id,
              paymentId,
              buyerId: order.buyerId,
              amount: payment.amount,
              includesDelivery: true,
              reason,
              status: 'APPROVED',
              isAutomatic: true,
              reviewedAt: now,
            },
          });
          return { extraPayment: true, order, reason };
        },
        { timeout: 20_000 },
      );

      if (outcome.placed) {
        const { order } = outcome;
        await notify(order.buyerId, {
          type: 'payment.succeeded',
          title: `Payment received for order ${order.orderNumber}`,
          body: `We received your payment of ${order.total.toLocaleString('en-US')} ${order.currency}. Your sellers are preparing your order.`,
          link: `/account/orders/${order.id}`,
          sms: true,
        });
        for (const t of outcome.transitions) {
          await afterTransition(t, { role: 'SYSTEM' });
          await notifyShopOwner(t.shopId, {
            type: 'order.new',
            title: `New order ${t.sellerOrder.number}`,
            body: 'A paid order is waiting for you. Accept it to start preparing.',
            link: `/seller/orders/${t.sellerOrder.id}`,
            sms: true,
          });
        }
      }
      if (outcome.extraPayment) {
        await notifyAdmins('finance', {
          type: 'payment.extra',
          title: `Refund needed for order ${outcome.order.orderNumber}`,
          body: `${outcome.reason}. An automatic refund was opened — please return the funds.`,
          link: '/admin/refunds',
        });
        await notify(outcome.order.buyerId, {
          type: 'payment.refund_pending',
          title: `Refund on the way for ${outcome.order.orderNumber}`,
          body: `${outcome.reason}. We have started a refund for that payment.`,
          link: `/account/orders/${outcome.order.id}`,
        });
      }
      return outcome;
    } catch (err) {
      if (err?.code === 'STALE_STATUS' && attempt < 2) continue;
      throw err;
    }
  }
}

/**
 * @param final  false when the outcome is ambiguous (e.g. provider timeout):
 *               the attempt is then marked EXPIRED rather than FAILED so that a
 *               late success reported by the poller is still accounted for.
 */
export async function markPaymentFailed(paymentId, { reason = 'The payment was not completed.', raw = 'FAILED', final = true } = {}) {
  const outcome = await prisma.$transaction(async (tx) => {
    // An attempt that was already superseded just records the provider's final word.
    await tx.payment.updateMany({ where: { id: paymentId, status: 'EXPIRED' }, data: { providerFinal: final, rawStatus: raw } });
    const { count } = await tx.payment.updateMany({
      where: { id: paymentId, status: 'PENDING' },
      data: { status: final ? 'FAILED' : 'EXPIRED', failedAt: new Date(), failureReason: reason, rawStatus: raw, providerFinal: final },
    });
    if (count === 0) return null;
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
    const stillPending = await tx.payment.count({ where: { orderId: payment.orderId, status: 'PENDING' } });
    if (!stillPending && payment.order.status === 'PENDING_PAYMENT') {
      await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: 'FAILED' } });
    }
    return payment;
  });
  if (outcome && outcome.order.status === 'PENDING_PAYMENT') {
    await notify(outcome.order.buyerId, {
      type: 'payment.failed',
      title: `Payment failed for order ${outcome.order.orderNumber}`,
      body: `${reason} Your items are reserved for a short time — you can try again or choose another payment method.`,
      link: `/checkout/payment/${outcome.order.id}`,
      email: false,
    });
  }
  return outcome;
}

/** Applies an authoritative provider result to a payment. */
export async function applyProviderResult(paymentId, result) {
  if (result.status === 'SUCCEEDED') return markPaymentSucceeded(paymentId, result);
  if (result.status === 'FAILED') {
    await markPaymentFailed(paymentId, result);
    if (result.mismatch) {
      await notifyAdmins('finance', {
        type: 'payment.mismatch',
        title: 'Payment amount mismatch',
        body: `The provider reported a different amount for payment ${paymentId}. Investigate before taking action.`,
        link: '/admin/payments',
      });
    }
  }
  return null;
}

/** Asks the provider for the authoritative state of a payment that is not final yet. */
export async function refreshPaymentStatus(paymentId) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment || payment.providerFinal || !payment.providerReference || !POLLABLE.includes(payment.provider)) return payment;
  if (!['PENDING', 'EXPIRED'].includes(payment.status)) return payment;
  const provider = getProvider(payment.provider);
  if (!provider?.enabled) return payment;

  const result = await provider.checkStatus(payment);
  await prisma.payment.update({
    where: { id: paymentId },
    data: { checkCount: { increment: 1 }, lastCheckedAt: new Date(), rawStatus: result.raw ?? undefined },
  });
  await applyProviderResult(paymentId, result);
  return prisma.payment.findUnique({ where: { id: paymentId } });
}

/**
 * Polls mobile-money payments that have no final provider state yet, with
 * back-off: every ~20 s for the first 10 minutes, then every 5 minutes for
 * up to 24 hours. Complements (and protects against lost) webhooks.
 */
export async function pollPendingPayments(now = new Date()) {
  const candidates = await prisma.payment.findMany({
    where: {
      provider: { in: POLLABLE },
      providerFinal: false,
      providerReference: { not: null },
      status: { in: ['PENDING', 'EXPIRED'] },
      createdAt: { gt: new Date(now.getTime() - 86_400_000) },
      OR: [{ lastCheckedAt: null }, { lastCheckedAt: { lt: new Date(now.getTime() - 20_000) } }],
    },
    orderBy: { lastCheckedAt: { sort: 'asc', nulls: 'first' } },
    take: 25,
  });
  for (const p of candidates) {
    const age = now.getTime() - p.createdAt.getTime();
    if (age > 10 * 60_000 && p.lastCheckedAt && now.getTime() - p.lastCheckedAt.getTime() < 5 * 60_000) continue;
    try {
      await refreshPaymentStatus(p.id);
    } catch (err) {
      logger.warn({ err, paymentId: p.id }, 'Payment status poll failed');
      await prisma.payment.update({ where: { id: p.id }, data: { lastCheckedAt: new Date(), checkCount: { increment: 1 } } });
    }
  }
  return candidates.length;
}

/**
 * Records a webhook event exactly once. Returns false when the event was
 * already received (duplicate delivery), so processing can be skipped.
 */
export async function recordPaymentEvent({ provider, eventId, type, payload, signatureValid, paymentId }) {
  try {
    await prisma.paymentEvent.create({
      data: { provider, eventId: String(eventId).slice(0, 200), type, payload, signatureValid, paymentId: paymentId ?? null },
    });
    return true;
  } catch (err) {
    if (err?.code === 'P2002') return false;
    throw err;
  }
}

export async function markEventProcessed(provider, eventId) {
  await prisma.paymentEvent.updateMany({
    where: { provider, eventId: String(eventId).slice(0, 200) },
    data: { processedAt: new Date() },
  });
}

/**
 * Cancels orders whose payment window has closed, after a final status
 * check with the provider. Reserved stock is returned to inventory.
 */
export async function expireUnpaidOrders(now = new Date()) {
  const orders = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT', paymentExpiresAt: { lt: now } },
    include: { payments: { where: { status: 'PENDING' } }, sellerOrders: { select: { id: true, status: true } } },
    take: 50,
  });
  let expired = 0;
  for (const order of orders) {
    let paid = false;
    for (const p of order.payments) {
      try {
        const refreshed = await refreshPaymentStatus(p.id);
        if (refreshed?.status === 'SUCCEEDED') paid = true;
      } catch (err) {
        logger.warn({ err, paymentId: p.id }, 'Final payment status check failed');
      }
    }
    if (paid) continue;
    await prisma.payment.updateMany({
      where: { orderId: order.id, status: 'PENDING' },
      data: { status: 'EXPIRED', failedAt: now, failureReason: 'Payment window expired' },
    });
    try {
      const results = await prisma.$transaction(async (tx) => {
        const out = [];
        for (const so of order.sellerOrders.filter((s) => s.status === 'PENDING_PAYMENT')) {
          out.push(
            await transitionSellerOrder(tx, so.id, 'CANCELLED', {
              actor: { role: 'SYSTEM' },
              reason: 'Payment was not completed in time',
            }),
          );
        }
        await tx.order.update({
          where: { id: order.id },
          data: { paymentStatus: 'FAILED', cancelReason: 'Payment was not completed in time' },
        });
        return out;
      });
      // One buyer notification per order is enough: later shipments are notified without the buyer.
      if (results[0]) await afterTransition(results[0], { role: 'SYSTEM' });
      for (const r of results.slice(1)) await afterTransition({ ...r, order: { ...r.order, buyerId: null } }, { role: 'SYSTEM' });
      expired += 1;
    } catch (err) {
      logger.warn({ err, orderId: order.id }, 'Could not expire unpaid order');
    }
  }
  return expired;
}
