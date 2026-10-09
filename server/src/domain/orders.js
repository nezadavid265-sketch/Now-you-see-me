import { prisma } from '../lib/prisma.js';
import { AppError, conflict, notFound } from '../lib/errors.js';
import { safeEqual } from '../lib/crypto.js';
import { getSettings } from '../services/settings.js';
import { notify, notifyAdmins, notifyShopOwner } from '../services/notifications.js';
import { changeStock, alertLowStock } from './inventory.js';
import { canActorTransition, deriveOrderStatus, STATUS_LABELS } from './orderStatus.js';

const DAY = 86_400_000;

/**
 * Verifies the buyer's delivery confirmation code. Runs outside the status
 * transaction so failed attempts are persisted and brute force is limited.
 */
export async function verifyDeliveryCode(sellerOrderId, code) {
  const settings = await getSettings();
  const so = await prisma.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    select: { deliveryCode: true, deliveryCodeAttempts: true },
  });
  if (!so) throw notFound('Order');
  if (so.deliveryCodeAttempts >= settings.maxDeliveryCodeAttempts) {
    throw new AppError(423, 'Too many incorrect codes. An administrator must confirm this delivery.', { code: 'CODE_LOCKED' });
  }
  if (!code || !safeEqual(code.trim(), so.deliveryCode)) {
    await prisma.sellerOrder.update({ where: { id: sellerOrderId }, data: { deliveryCodeAttempts: { increment: 1 } } });
    const left = settings.maxDeliveryCodeAttempts - so.deliveryCodeAttempts - 1;
    throw new AppError(422, `Incorrect delivery code. ${Math.max(left, 0)} attempt(s) left.`, { code: 'INVALID_DELIVERY_CODE' });
  }
}

/** Recomputes the buyer-facing order status (and COD payment state) from its shipments. */
export async function syncOrder(tx, orderId) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    include: { sellerOrders: { select: { status: true } }, redemption: true },
  });
  const status = deriveOrderStatus(order.sellerOrders.map((s) => s.status));
  const data = { status };
  if (status === 'CANCELLED' && !order.cancelledAt) data.cancelledAt = new Date();

  if (order.paymentMethod === 'CASH_ON_DELIVERY' && order.paymentStatus === 'PENDING') {
    const active = order.sellerOrders.filter((s) => !['CANCELLED', 'REFUNDED'].includes(s.status));
    if (active.length && active.every((s) => s.status === 'DELIVERED')) {
      data.paymentStatus = 'PAID';
      data.paidAt = new Date();
      await tx.payment.updateMany({
        where: { orderId, provider: 'CASH_ON_DELIVERY', status: 'PENDING' },
        data: { status: 'SUCCEEDED', succeededAt: new Date() },
      });
    } else if (!active.length) {
      data.paymentStatus = 'UNPAID';
      await tx.payment.updateMany({
        where: { orderId, provider: 'CASH_ON_DELIVERY', status: 'PENDING' },
        data: { status: 'EXPIRED', failedAt: new Date(), failureReason: 'Order cancelled' },
      });
    }
  }

  // Release the promo code if the whole order was cancelled before any money moved.
  if (status === 'CANCELLED' && order.redemption && !['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'].includes(order.paymentStatus)) {
    await tx.couponRedemption.delete({ where: { id: order.redemption.id } });
    await tx.coupon.update({ where: { id: order.redemption.couponId }, data: { usedCount: { decrement: 1 } } });
  }

  return tx.order.update({ where: { id: orderId }, data });
}

/**
 * The single entry point for shipment status changes. Validates the
 * transition for the acting role, applies it with optimistic concurrency,
 * records the timeline event and performs side effects (restock, delivery
 * records, seller earnings, automatic refunds).
 */
export async function transitionSellerOrder(tx, sellerOrderId, to, { actor, note, reason, courierName, trackingNumber }) {
  const so = await tx.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    include: { items: true, order: true, delivery: true },
  });
  if (!so) throw notFound('Order');
  if (!canActorTransition(actor.role, so.status, to, { fulfillmentMode: so.fulfillmentMode })) {
    throw conflict(`This order cannot move from "${STATUS_LABELS[so.status]}" to "${STATUS_LABELS[to]}".`, {
      code: 'INVALID_TRANSITION',
    });
  }

  const now = new Date();
  const data = { status: to };
  if (to === 'ACCEPTED') data.acceptedAt = now;
  if (to === 'READY') data.readyAt = so.readyAt ?? now;
  if (to === 'IN_TRANSIT') {
    data.shippedAt = now;
    if (courierName !== undefined) data.courierName = courierName;
    if (trackingNumber !== undefined) data.trackingNumber = trackingNumber;
  }
  if (to === 'DELIVERED') data.deliveredAt = now;
  if (to === 'CANCELLED') {
    data.cancelledAt = now;
    data.cancelReason = reason ?? note ?? null;
    data.cancelledBy = actor.role;
  }

  const { count } = await tx.sellerOrder.updateMany({ where: { id: so.id, status: so.status }, data });
  if (count === 0) throw conflict('This order was just updated by someone else. Refresh and try again.', { code: 'STALE_STATUS' });

  await tx.orderStatusEvent.create({
    data: {
      orderId: so.orderId,
      sellerOrderId: so.id,
      status: to,
      note: reason ?? note ?? null,
      actorId: actor.id ?? null,
      actorRole: actor.role,
    },
  });

  const effects = { lowStock: [] };

  if (to === 'CANCELLED') {
    for (const item of so.items) {
      const p = await changeStock(tx, {
        productId: item.productId,
        change: item.quantity,
        reason: 'CANCELLATION',
        referenceId: so.id,
        note: `Order ${so.number} cancelled`,
        actorId: actor.id,
      });
      await tx.product.update({ where: { id: item.productId }, data: { soldCount: { decrement: item.quantity } } });
      effects.lowStock.push(p);
    }
    if (so.delivery && !['DELIVERED', 'FAILED'].includes(so.delivery.status)) {
      await tx.delivery.update({ where: { id: so.delivery.id }, data: { status: 'FAILED', failureReason: 'Order cancelled' } });
    }
    // Money already captured for this shipment is returned automatically.
    if (['PAID', 'PARTIALLY_REFUNDED'].includes(so.order.paymentStatus)) {
      effects.refund = await tx.refund.create({
        data: {
          orderId: so.orderId,
          sellerOrderId: so.id,
          buyerId: so.order.buyerId,
          amount: so.total,
          includesDelivery: true,
          reason: 'Order cancelled',
          details: reason ?? note ?? null,
          status: 'APPROVED',
          isAutomatic: true,
          reviewedAt: now,
        },
      });
    }
  }

  if (to === 'READY' && so.fulfillmentMode === 'MARKETPLACE') {
    await tx.delivery.upsert({
      where: { sellerOrderId: so.id },
      create: { sellerOrderId: so.id, status: 'PENDING', events: { create: { status: 'PENDING', note: 'Ready for pickup', actorId: actor.id } } },
      update: {},
    });
    effects.needsCourier = !so.delivery?.staffId;
  }

  if (so.delivery && to === 'IN_TRANSIT') {
    await tx.delivery.update({
      where: { id: so.delivery.id },
      data: { status: 'IN_TRANSIT', pickedUpAt: so.delivery.pickedUpAt ?? now, events: { create: { status: 'IN_TRANSIT', actorId: actor.id, note } } },
    });
  }
  if (so.delivery && so.status === 'IN_TRANSIT' && to === 'READY') {
    await tx.delivery.update({
      where: { id: so.delivery.id },
      data: {
        status: so.delivery.staffId ? 'ASSIGNED' : 'PENDING',
        failureReason: note ?? 'Delivery attempt failed',
        events: { create: { status: 'ATTEMPT_FAILED', note: note ?? 'Delivery attempt failed', actorId: actor.id } },
      },
    });
  }

  if (to === 'DELIVERED') {
    if (so.delivery) {
      await tx.delivery.update({
        where: { id: so.delivery.id },
        data: { status: 'DELIVERED', deliveredAt: now, events: { create: { status: 'DELIVERED', actorId: actor.id, note } } },
      });
    }
    const settings = await getSettings();
    // When the seller delivers a cash-on-delivery order they already hold the cash,
    // so their ledger only records what they owe the marketplace (or are owed).
    const cashHeldBySeller = so.order.paymentMethod === 'CASH_ON_DELIVERY' && so.fulfillmentMode === 'SELF' ? so.total : 0;
    await tx.sellerLedgerEntry.create({
      data: {
        shopId: so.shopId,
        type: 'EARNING',
        amount: so.sellerNet - cashHeldBySeller,
        description: cashHeldBySeller
          ? `Order ${so.number} delivered (cash collected by shop: ${so.total})`
          : `Order ${so.number} delivered`,
        sellerOrderId: so.id,
        availableAt: new Date(now.getTime() + settings.payoutHoldDays * DAY),
      },
    });
  }

  const order = await syncOrder(tx, so.orderId);
  const updated = await tx.sellerOrder.findUnique({ where: { id: so.id } });
  return { sellerOrder: updated, previousStatus: so.status, order, effects, shopId: so.shopId };
}

/** Sends the notifications for a completed transition (call after commit). */
export async function afterTransition({ sellerOrder, previousStatus, order, effects, shopId }, actor) {
  const to = sellerOrder.status;
  const buyerLink = `/account/orders/${order.id}`;
  const sellerLink = `/seller/orders/${sellerOrder.id}`;

  if (to === 'ACCEPTED') {
    await notify(order.buyerId, {
      type: 'order.accepted',
      title: `Order ${sellerOrder.number} accepted`,
      body: 'The seller has accepted your order and will prepare it shortly.',
      link: buyerLink,
      email: false,
    });
  }
  if (to === 'IN_TRANSIT') {
    await notify(order.buyerId, {
      type: 'order.shipped',
      title: `Order ${sellerOrder.number} is on its way`,
      body: 'Your package is out for delivery. Keep your delivery code ready to give to the courier.',
      link: buyerLink,
      sms: true,
    });
  }
  if (to === 'READY' && previousStatus === 'IN_TRANSIT') {
    await notify(order.buyerId, {
      type: 'order.delivery_failed',
      title: `Delivery attempt for ${sellerOrder.number} was unsuccessful`,
      body: 'We could not complete the delivery. We will try again soon — contact support if you need to change details.',
      link: buyerLink,
      sms: true,
    });
  }
  if (to === 'DELIVERED') {
    await notify(order.buyerId, {
      type: 'order.delivered',
      title: `Order ${sellerOrder.number} delivered`,
      body: 'Your package has been delivered. Enjoy! You can now review the products you received.',
      link: buyerLink,
    });
    await notifyShopOwner(shopId, {
      type: 'order.delivered',
      title: `Order ${sellerOrder.number} delivered`,
      body: 'Delivery was confirmed by the buyer’s code. Your earnings will be available after the holding period.',
      link: sellerLink,
      email: false,
    });
  }
  if (to === 'CANCELLED') {
    if (actor.role !== 'BUYER') {
      await notify(order.buyerId, {
        type: 'order.cancelled',
        title: `Order ${sellerOrder.number} was cancelled`,
        body: `${sellerOrder.cancelReason ? `Reason: ${sellerOrder.cancelReason}. ` : ''}${
          effects.refund ? 'A refund for the amount paid has been started.' : 'You have not been charged for this order.'
        }`,
        link: buyerLink,
        sms: true,
      });
    }
    if (actor.role !== 'SELLER' && previousStatus !== 'PENDING_PAYMENT') {
      await notifyShopOwner(shopId, {
        type: 'order.cancelled',
        title: `Order ${sellerOrder.number} was cancelled`,
        body: `Cancelled by ${actor.role === 'BUYER' ? 'the buyer' : 'Rivoshoppa'}. Do not ship this order.`,
        link: sellerLink,
      });
    }
    if (effects.refund) {
      await notifyAdmins('finance', {
        type: 'refund.automatic',
        title: `Refund needed for ${sellerOrder.number}`,
        body: 'A paid order was cancelled. Return the funds to the buyer and mark the refund completed.',
        link: '/admin/refunds',
      });
    }
  }
  if (effects.needsCourier) {
    await notifyAdmins('orders', {
      type: 'delivery.unassigned',
      title: `Assign a courier for ${sellerOrder.number}`,
      body: 'A shipment is packed and waiting for marketplace pickup.',
      link: '/admin/deliveries',
    });
  }
  if (effects.lowStock?.length) await alertLowStock(effects.lowStock);
}

/** Convenience wrapper: transition in its own transaction, then notify. */
export async function changeSellerOrderStatus(sellerOrderId, to, options) {
  const result = await prisma.$transaction((tx) => transitionSellerOrder(tx, sellerOrderId, to, options), { timeout: 15_000 });
  await afterTransition(result, options.actor);
  return result;
}
