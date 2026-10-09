import { prisma } from '../lib/prisma.js';
import { allocate } from '../lib/money.js';
import { conflict, notFound, unprocessable } from '../lib/errors.js';
import { getSettings } from '../services/settings.js';
import { notify, notifyAdmins, notifyShopOwner } from '../services/notifications.js';
import { changeStock } from './inventory.js';
import { transitionSellerOrder, afterTransition } from './orders.js';

const DAY = 86_400_000;

/**
 * Splits a shipment's discounts across its items so partial refunds return
 * exactly what the buyer paid and deduct exactly what the seller earned.
 */
export function refundAmounts(sellerOrder, orderItemId, quantity) {
  const items = sellerOrder.items;
  const idx = items.findIndex((i) => i.id === orderItemId);
  const item = items[idx];
  const discountShares = allocate(sellerOrder.discount, items.map((i) => i.lineTotal));
  const shopShares = allocate(sellerOrder.shopFundedDiscount, items.map((i) => i.lineTotal));
  const ratio = quantity / item.quantity;
  const gross = Math.round(item.lineTotal * ratio);
  const buyerAmount = gross - Math.round(discountShares[idx] * ratio);
  const commission = Math.round(item.commissionAmount * ratio);
  const sellerDeduction = gross - commission - Math.round(shopShares[idx] * ratio);
  return { buyerAmount, sellerDeduction };
}

export async function requestRefund(user, { sellerOrderId, items, reason, details }) {
  const settings = await getSettings();
  const so = await prisma.sellerOrder.findUnique({
    where: { id: sellerOrderId },
    include: { items: true, order: true, refunds: { include: { items: true } } },
  });
  if (!so || so.order.buyerId !== user.id) throw notFound('Order');
  if (so.status !== 'DELIVERED') {
    throw unprocessable('Refunds can be requested after delivery. To stop an order before it ships, cancel it instead.');
  }
  if (so.deliveredAt.getTime() + settings.refundWindowDays * DAY < Date.now()) {
    throw unprocessable(`The ${settings.refundWindowDays}-day refund window for this order has closed. Contact support if you need help.`);
  }
  if (!['PAID', 'PARTIALLY_REFUNDED'].includes(so.order.paymentStatus)) {
    throw unprocessable('There is no payment to refund for this order.');
  }

  const pendingQty = new Map();
  for (const r of so.refunds.filter((r) => r.status === 'REQUESTED')) {
    for (const ri of r.items) pendingQty.set(ri.orderItemId, (pendingQty.get(ri.orderItemId) ?? 0) + ri.quantity);
  }

  let amount = 0;
  const refundItems = [];
  for (const { orderItemId, quantity } of items) {
    const item = so.items.find((i) => i.id === orderItemId);
    if (!item) throw unprocessable('One of the selected items is not part of this order.');
    const refundable = item.quantity - item.refundedQuantity - (pendingQty.get(orderItemId) ?? 0);
    if (quantity > refundable) {
      throw unprocessable(`You can request a refund for at most ${Math.max(refundable, 0)} × ${item.productName}.`);
    }
    const { buyerAmount } = refundAmounts(so, orderItemId, quantity);
    amount += buyerAmount;
    refundItems.push({ orderItemId, quantity, amount: buyerAmount });
  }

  const refund = await prisma.refund.create({
    data: {
      orderId: so.orderId,
      sellerOrderId: so.id,
      buyerId: user.id,
      amount,
      reason,
      details,
      items: { create: refundItems },
    },
    include: { items: true },
  });

  await notifyShopOwner(so.shopId, {
    type: 'refund.requested',
    title: `Refund requested for ${so.number}`,
    body: `The buyer requested a refund: "${reason}". You can add your response before Rivoshoppa reviews it.`,
    link: `/seller/orders/${so.id}`,
  });
  await notifyAdmins('finance', {
    type: 'refund.requested',
    title: `Refund request for ${so.number}`,
    body: `${amount.toLocaleString('en-US')} ${so.order.currency} — ${reason}`,
    link: '/admin/refunds',
  });
  return refund;
}

export async function approveRefund(admin, refundId, { note, restock = false }) {
  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refund.updateMany({
      where: { id: refundId, status: 'REQUESTED' },
      data: { status: 'APPROVED', adminNote: note, reviewedById: admin.id, reviewedAt: new Date() },
    });
    if (count === 0) throw conflict('Only requested refunds can be approved.');
    const refund = await tx.refund.findUnique({
      where: { id: refundId },
      include: { items: true, sellerOrder: { include: { items: true } } },
    });
    const so = refund.sellerOrder;
    let deduction = 0;
    for (const ri of refund.items) {
      const item = so.items.find((i) => i.id === ri.orderItemId);
      const { count: ok } = await tx.orderItem.updateMany({
        where: { id: item.id, refundedQuantity: { lte: item.quantity - ri.quantity } },
        data: { refundedQuantity: { increment: ri.quantity } },
      });
      if (!ok) throw conflict(`${item.productName} has already been refunded.`);
      deduction += refundAmounts(so, item.id, ri.quantity).sellerDeduction;
      if (restock) {
        await changeStock(tx, {
          productId: item.productId,
          change: ri.quantity,
          reason: 'RETURN',
          referenceId: refund.id,
          note: `Returned items from ${so.number}`,
          actorId: admin.id,
        });
      }
    }
    const earning = await tx.sellerLedgerEntry.findFirst({ where: { type: 'EARNING', sellerOrderId: so.id } });
    if (earning && deduction > 0) {
      await tx.sellerLedgerEntry.create({
        data: {
          shopId: so.shopId,
          type: 'REFUND_DEDUCTION',
          amount: -deduction,
          description: `Refund for ${so.number}`,
          sellerOrderId: so.id,
          refundId: refund.id,
        },
      });
    }
    return { refund, so, deduction };
  });

  await notify(result.refund.buyerId, {
    type: 'refund.approved',
    title: `Refund approved for ${result.so.number}`,
    body: `Your refund of ${result.refund.amount.toLocaleString('en-US')} has been approved and will be sent to your original payment method shortly.`,
    link: `/account/orders/${result.refund.orderId}`,
  });
  await notifyShopOwner(result.so.shopId, {
    type: 'refund.approved',
    title: `Refund approved for ${result.so.number}`,
    body: result.deduction ? `${result.deduction.toLocaleString('en-US')} will be deducted from your balance.` : 'No balance deduction was needed.',
    link: `/seller/orders/${result.so.id}`,
    email: false,
  });
  return result.refund;
}

export async function rejectRefund(admin, refundId, { note }) {
  const { count } = await prisma.refund.updateMany({
    where: { id: refundId, status: 'REQUESTED' },
    data: { status: 'REJECTED', adminNote: note, reviewedById: admin.id, reviewedAt: new Date() },
  });
  if (count === 0) throw conflict('Only requested refunds can be rejected.');
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { sellerOrder: true } });
  await notify(refund.buyerId, {
    type: 'refund.rejected',
    title: `Refund request declined`,
    body: `Your refund request for ${refund.sellerOrder?.number ?? 'your order'} was declined. ${note ? `Reason: ${note}` : ''} Contact support if you disagree.`,
    link: `/account/orders/${refund.orderId}`,
  });
  return refund;
}

/** Marks money as returned to the buyer and updates order payment state. */
export async function completeRefund(admin, refundId, { reference, note }) {
  const result = await prisma.$transaction(async (tx) => {
    const { count } = await tx.refund.updateMany({
      where: { id: refundId, status: 'APPROVED' },
      data: { status: 'COMPLETED', completedAt: new Date(), providerReference: reference, adminNote: note ?? undefined },
    });
    if (count === 0) throw conflict('Only approved refunds can be marked as completed.');
    const refund = await tx.refund.findUnique({ where: { id: refundId }, include: { sellerOrder: { include: { items: true } }, order: true } });

    const refunded = await tx.refund.aggregate({ where: { orderId: refund.orderId, status: 'COMPLETED' }, _sum: { amount: true } });
    const paid = await tx.payment.aggregate({ where: { orderId: refund.orderId, status: 'SUCCEEDED' }, _sum: { amount: true } });
    const totalRefunded = refunded._sum.amount ?? 0;
    const totalPaid = paid._sum.amount ?? refund.order.total;
    await tx.order.update({
      where: { id: refund.orderId },
      data: { paymentStatus: totalRefunded >= totalPaid ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });

    let transition = null;
    const so = refund.sellerOrder;
    if (so && so.status === 'DELIVERED' && so.items.every((i) => i.refundedQuantity >= i.quantity)) {
      transition = await transitionSellerOrder(tx, so.id, 'REFUNDED', { actor: { id: admin.id, role: 'SYSTEM' }, note: 'All items refunded' });
    }
    return { refund, transition };
  });
  if (result.transition) await afterTransition(result.transition, { role: 'SYSTEM' });
  await notify(result.refund.buyerId, {
    type: 'refund.completed',
    title: 'Your refund has been sent',
    body: `${result.refund.amount.toLocaleString('en-US')} has been returned${reference ? ` (reference ${reference})` : ''}.`,
    link: `/account/orders/${result.refund.orderId}`,
    sms: true,
  });
  return result.refund;
}
