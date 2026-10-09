import { prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { pageResult, paginate } from '../../lib/pagination.js';
import { getSettings } from '../../services/settings.js';
import { STATUS_LABELS } from '../../domain/orderStatus.js';
import { afterTransition, transitionSellerOrder } from '../../domain/orders.js';
import { serializePayment } from '../payments/payments.routes.js';

const DAY = 86_400_000;
const BUYER_CANCELLABLE = ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED'];
const CODE_VISIBLE = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT'];

const STATUS_FILTERS = {
  active: { status: { in: ['PENDING_PAYMENT', 'PROCESSING', 'IN_TRANSIT'] } },
  completed: { status: { in: ['DELIVERED', 'REFUNDED'] } },
  cancelled: { status: 'CANCELLED' },
};

export async function listBuyerOrders(userId, { status, page, pageSize }) {
  const where = { buyerId: userId, ...(STATUS_FILTERS[status] ?? {}) };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginate({ page, pageSize }),
      include: {
        sellerOrders: {
          select: { id: true, status: true, shop: { select: { name: true } }, items: { select: { productImage: true, productName: true, quantity: true } } },
        },
      },
    }),
  ]);
  const items = rows.map((o) => {
    const allItems = o.sellerOrders.flatMap((s) => s.items);
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      paymentStatus: o.paymentStatus,
      paymentMethod: o.paymentMethod,
      total: o.total,
      currency: o.currency,
      createdAt: o.createdAt,
      itemCount: allItems.reduce((s, i) => s + i.quantity, 0),
      shipmentCount: o.sellerOrders.length,
      shops: [...new Set(o.sellerOrders.map((s) => s.shop.name))],
      thumbnails: allItems.slice(0, 4).map((i) => ({ image: i.productImage, name: i.productName })),
    };
  });
  return pageResult(items, total, { page, pageSize });
}

const firstName = (name) => name?.split(' ')[0] ?? null;

export async function getBuyerOrder(userId, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: userId },
    include: {
      sellerOrders: {
        orderBy: { number: 'asc' },
        include: {
          shop: { select: { name: true, slug: true, logoUrl: true } },
          items: { include: { review: { select: { id: true, rating: true } } } },
          events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
          delivery: { include: { staff: { select: { name: true, phone: true } } } },
        },
      },
      events: { where: { sellerOrderId: null }, orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      refunds: { orderBy: { createdAt: 'desc' }, include: { items: true } },
    },
  });
  if (!order) throw notFound('Order');
  const settings = await getSettings();
  const now = Date.now();

  return {
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    currency: order.currency,
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    discount: order.discount,
    total: order.total,
    couponCode: order.couponCode,
    createdAt: order.createdAt,
    paidAt: order.paidAt,
    paymentExpiresAt: order.paymentExpiresAt,
    cancelledAt: order.cancelledAt,
    cancelReason: order.cancelReason,
    canPay: order.status === 'PENDING_PAYMENT' && (!order.paymentExpiresAt || order.paymentExpiresAt.getTime() > now),
    shipping: {
      name: order.shippingName,
      phone: order.shippingPhone,
      line1: order.shippingLine1,
      line2: order.shippingLine2,
      sector: order.shippingSector,
      district: order.shippingDistrict,
      city: order.shippingCity,
      country: order.shippingCountry,
      latitude: order.shippingLat,
      longitude: order.shippingLng,
      instructions: order.shippingInstructions,
    },
    shipments: order.sellerOrders.map((so) => {
      const refundDeadline = so.deliveredAt ? new Date(so.deliveredAt.getTime() + settings.refundWindowDays * DAY) : null;
      return {
        id: so.id,
        number: so.number,
        status: so.status,
        statusLabel: STATUS_LABELS[so.status],
        fulfillmentMode: so.fulfillmentMode,
        subtotal: so.subtotal,
        deliveryFee: so.deliveryFee,
        discount: so.discount,
        total: so.total,
        shop: so.shop,
        deliveryCode: CODE_VISIBLE.includes(so.status) ? so.deliveryCode : null,
        courierName: so.courierName,
        trackingNumber: so.trackingNumber,
        acceptedAt: so.acceptedAt,
        shippedAt: so.shippedAt,
        deliveredAt: so.deliveredAt,
        cancelledAt: so.cancelledAt,
        cancelReason: so.cancelReason,
        canCancel: BUYER_CANCELLABLE.includes(so.status),
        refundDeadline,
        canRequestRefund:
          so.status === 'DELIVERED' && refundDeadline && refundDeadline.getTime() > now && ['PAID', 'PARTIALLY_REFUNDED'].includes(order.paymentStatus),
        delivery: so.delivery
          ? {
              status: so.delivery.status,
              courier: so.delivery.staff ? { name: firstName(so.delivery.staff.name), phone: so.delivery.staff.phone } : null,
              lastLocationAt: so.delivery.lastLocationAt,
              currentLat: so.status === 'IN_TRANSIT' ? so.delivery.currentLat : null,
              currentLng: so.status === 'IN_TRANSIT' ? so.delivery.currentLng : null,
            }
          : null,
        items: so.items.map((i) => ({
          id: i.id,
          productId: i.productId,
          productName: i.productName,
          productSlug: i.productSlug,
          productImage: i.productImage,
          unitPrice: i.unitPrice,
          quantity: i.quantity,
          lineTotal: i.lineTotal,
          refundedQuantity: i.refundedQuantity,
          review: i.review,
          canReview: ['DELIVERED', 'REFUNDED'].includes(so.status) && !i.review,
        })),
        events: so.events,
      };
    }),
    events: order.events,
    payments: order.payments.map(serializePayment),
    refunds: order.refunds.map((r) => ({
      id: r.id,
      sellerOrderId: r.sellerOrderId,
      amount: r.amount,
      status: r.status,
      reason: r.reason,
      adminNote: r.adminNote,
      isAutomatic: r.isAutomatic,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      items: r.items.map((i) => ({ orderItemId: i.orderItemId, quantity: i.quantity, amount: i.amount })),
    })),
  };
}

export async function cancelBuyerOrder(user, orderId, { reason, sellerOrderId }) {
  const order = await prisma.order.findFirst({ where: { id: orderId, buyerId: user.id }, include: { sellerOrders: true } });
  if (!order) throw notFound('Order');
  const targets = order.sellerOrders.filter((so) => (sellerOrderId ? so.id === sellerOrderId : true) && BUYER_CANCELLABLE.includes(so.status));
  if (!targets.length) {
    throw conflict('This order can no longer be cancelled because the seller has started preparing it. You can request a refund after delivery or contact support.');
  }
  const results = await prisma.$transaction(
    async (tx) => {
      const out = [];
      for (const so of targets) {
        out.push(await transitionSellerOrder(tx, so.id, 'CANCELLED', { actor: { id: user.id, role: 'BUYER' }, reason: reason || 'Cancelled by buyer' }));
      }
      if (order.status === 'PENDING_PAYMENT') {
        await tx.payment.updateMany({
          where: { orderId: order.id, status: 'PENDING' },
          data: { status: 'EXPIRED', failedAt: new Date(), failureReason: 'Order cancelled by buyer' },
        });
      }
      return out;
    },
    { timeout: 20_000 },
  );
  for (const r of results) await afterTransition(r, { id: user.id, role: 'BUYER' });
  return getBuyerOrder(user.id, orderId);
}

export async function getTracking(userId, orderId) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, buyerId: userId },
    select: {
      shippingLat: true,
      shippingLng: true,
      shippingLine1: true,
      shippingCity: true,
      sellerOrders: {
        select: {
          id: true,
          number: true,
          status: true,
          shop: { select: { name: true } },
          delivery: {
            select: {
              status: true,
              currentLat: true,
              currentLng: true,
              lastLocationAt: true,
              staff: { select: { name: true, phone: true } },
              events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
            },
          },
        },
      },
    },
  });
  if (!order) throw notFound('Order');
  return {
    destination: { latitude: order.shippingLat, longitude: order.shippingLng, label: `${order.shippingLine1}, ${order.shippingCity}` },
    shipments: order.sellerOrders.map((so) => ({
      id: so.id,
      number: so.number,
      status: so.status,
      shop: so.shop.name,
      delivery: so.delivery
        ? {
            status: so.delivery.status,
            courier: so.delivery.staff ? { name: firstName(so.delivery.staff.name), phone: so.delivery.staff.phone } : null,
            location:
              so.status === 'IN_TRANSIT' && so.delivery.currentLat !== null
                ? { latitude: so.delivery.currentLat, longitude: so.delivery.currentLng, updatedAt: so.delivery.lastLocationAt }
                : null,
            events: so.delivery.events,
          }
        : null,
    })),
  };
}
