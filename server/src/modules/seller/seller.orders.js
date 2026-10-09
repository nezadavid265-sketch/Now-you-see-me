import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { pageResult, paginate } from '../../lib/pagination.js';
import { audit } from '../../services/audit.js';
import { canActorTransition, STATUS_LABELS } from '../../domain/orderStatus.js';
import { changeSellerOrderStatus, verifyDeliveryCode } from '../../domain/orders.js';

const TABS = {
  new: ['PLACED'],
  in_progress: ['ACCEPTED', 'PREPARING', 'READY'],
  shipped: ['IN_TRANSIT'],
  completed: ['DELIVERED', 'REFUNDED'],
  cancelled: ['CANCELLED'],
};
// Orders awaiting payment are hidden from sellers until paid (nothing to do yet).
const VISIBLE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'REFUNDED'];

/** Plain-language next steps shown as big buttons in the seller portal. */
const ACTION_COPY = {
  ACCEPTED: { label: 'Accept order', help: 'Confirm you can fulfil this order.' },
  PREPARING: { label: 'Start preparing', help: 'Let the buyer know you are packing the items.' },
  READY: { label: 'Mark as packed & ready', help: 'The package is ready to leave your shop.' },
  IN_TRANSIT: { label: 'Mark as out for delivery', help: 'The package is on its way to the buyer.' },
  DELIVERED: { label: 'Confirm delivery', help: 'Enter the 6-digit code the buyer gives you on delivery.', requiresCode: true },
  CANCELLED: { label: 'Reject / cancel order', help: 'Tell the buyer why. Stock is returned automatically.', requiresReason: true, danger: true, secondary: true },
};

const FAILED_ATTEMPT = {
  label: 'Delivery attempt failed',
  help: 'Could not reach the buyer? Move the order back to "ready" and try again later.',
  requiresReason: true,
  secondary: true,
};

export function availableActions(so) {
  return Object.keys(ACTION_COPY)
    .filter((to) => canActorTransition('SELLER', so.status, to, { fulfillmentMode: so.fulfillmentMode }))
    .map((to) => (so.status === 'IN_TRANSIT' && to === 'READY' ? { status: to, ...FAILED_ATTEMPT } : { status: to, ...ACTION_COPY[to] }));
}

export async function listOrders(shop, { tab, q, page, pageSize }) {
  const where = {
    shopId: shop.id,
    status: { in: TABS[tab] ?? VISIBLE },
    ...(q
      ? {
          OR: [
            { number: { contains: q, mode: 'insensitive' } },
            { order: { shippingName: { contains: q, mode: 'insensitive' } } },
            { items: { some: { productName: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [total, rows, counts] = await Promise.all([
    prisma.sellerOrder.count({ where }),
    prisma.sellerOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginate({ page, pageSize }),
      include: {
        order: { select: { shippingName: true, shippingCity: true, paymentMethod: true, paymentStatus: true } },
        items: { select: { productName: true, productImage: true, quantity: true } },
      },
    }),
    prisma.sellerOrder.groupBy({ by: ['status'], where: { shopId: shop.id, status: { in: VISIBLE } }, _count: { _all: true } }),
  ]);
  const countFor = (statuses) => counts.filter((c) => statuses.includes(c.status)).reduce((s, c) => s + c._count._all, 0);
  return {
    ...pageResult(
      rows.map((so) => ({
        id: so.id,
        number: so.number,
        status: so.status,
        statusLabel: STATUS_LABELS[so.status],
        total: so.total,
        subtotal: so.subtotal,
        sellerNet: so.sellerNet,
        createdAt: so.createdAt,
        buyerName: so.order.shippingName,
        city: so.order.shippingCity,
        paymentMethod: so.order.paymentMethod,
        itemCount: so.items.reduce((s, i) => s + i.quantity, 0),
        items: so.items.slice(0, 3),
        needsAction: so.status === 'PLACED',
      })),
      total,
      { page, pageSize },
    ),
    tabs: Object.fromEntries(Object.entries(TABS).map(([k, v]) => [k, countFor(v)])),
  };
}

export async function getOrder(shop, sellerOrderId) {
  const so = await prisma.sellerOrder.findFirst({
    where: { id: sellerOrderId, shopId: shop.id, status: { in: VISIBLE } },
    include: {
      order: true,
      items: true,
      events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, actorRole: true, createdAt: true } },
      delivery: { include: { staff: { select: { name: true, phone: true } } } },
      refunds: { orderBy: { createdAt: 'desc' }, include: { items: true } },
    },
  });
  if (!so) throw notFound('Order');
  const { order } = so;
  return {
    id: so.id,
    number: so.number,
    status: so.status,
    statusLabel: STATUS_LABELS[so.status],
    fulfillmentMode: so.fulfillmentMode,
    subtotal: so.subtotal,
    deliveryFee: so.deliveryFee,
    discount: so.discount,
    shopFundedDiscount: so.shopFundedDiscount,
    total: so.total,
    commissionAmount: so.commissionAmount,
    sellerNet: so.sellerNet,
    courierName: so.courierName,
    trackingNumber: so.trackingNumber,
    createdAt: so.createdAt,
    acceptedAt: so.acceptedAt,
    readyAt: so.readyAt,
    shippedAt: so.shippedAt,
    deliveredAt: so.deliveredAt,
    cancelledAt: so.cancelledAt,
    cancelReason: so.cancelReason,
    cancelledBy: so.cancelledBy,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    // Only what is needed to fulfil the order — no buyer e-mail or account details.
    shipping: {
      name: order.shippingName,
      phone: order.shippingPhone,
      line1: order.shippingLine1,
      line2: order.shippingLine2,
      sector: order.shippingSector,
      district: order.shippingDistrict,
      city: order.shippingCity,
      latitude: order.shippingLat,
      longitude: order.shippingLng,
      instructions: order.shippingInstructions,
    },
    items: so.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      productName: i.productName,
      productImage: i.productImage,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
      commissionAmount: i.commissionAmount,
      refundedQuantity: i.refundedQuantity,
    })),
    events: so.events,
    delivery: so.delivery
      ? { status: so.delivery.status, courier: so.delivery.staff ? { name: so.delivery.staff.name, phone: so.delivery.staff.phone } : null }
      : null,
    refunds: so.refunds.map((r) => ({
      id: r.id,
      amount: r.amount,
      status: r.status,
      reason: r.reason,
      details: r.details,
      sellerResponse: r.sellerResponse,
      createdAt: r.createdAt,
      items: r.items,
    })),
    actions: availableActions(so),
  };
}

export async function updateOrderStatus(req, sellerOrderId, { status, note, reason, deliveryCode, courierName, trackingNumber }) {
  const so = await prisma.sellerOrder.findFirst({ where: { id: sellerOrderId, shopId: req.shop.id }, select: { id: true, status: true } });
  if (!so) throw notFound('Order');
  if (status === 'CANCELLED' && !reason) throw unprocessable('Please tell the buyer why the order is cancelled.', { fieldErrors: { reason: 'Required' } });
  if (status === 'DELIVERED') await verifyDeliveryCode(so.id, deliveryCode);
  await changeSellerOrderStatus(so.id, status, {
    actor: { id: req.user.id, role: 'SELLER' },
    note,
    reason,
    courierName,
    trackingNumber,
  });
  await audit(req, 'seller.order_status', { entityType: 'SellerOrder', entityId: so.id, metadata: { from: so.status, to: status } });
  return getOrder(req.shop, so.id);
}
