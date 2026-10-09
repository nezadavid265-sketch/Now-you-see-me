import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { id, optionalText, text } from '../../lib/validators.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { STATUS_LABELS } from '../../domain/orderStatus.js';
import { changeSellerOrderStatus, verifyDeliveryCode } from '../../domain/orders.js';

/** Delivery staff portal: only deliveries assigned to the signed-in courier. */
const router = Router();
router.use(authenticate, requireRole('DELIVERY'));
const params = z.object({ id });

const ACTIVE = ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'];

function serialize(d) {
  const so = d.sellerOrder;
  return {
    id: d.id,
    status: d.status,
    assignedAt: d.assignedAt,
    pickedUpAt: d.pickedUpAt,
    deliveredAt: d.deliveredAt,
    failureReason: d.failureReason,
    order: {
      id: so.id,
      number: so.number,
      status: so.status,
      statusLabel: STATUS_LABELS[so.status],
      // Cash to collect on delivery (cash-on-delivery orders only).
      collectAmount: so.order.paymentMethod === 'CASH_ON_DELIVERY' && so.order.paymentStatus === 'PENDING' ? so.total : 0,
      itemCount: so.items.reduce((s, i) => s + i.quantity, 0),
      items: so.items.map((i) => ({ name: i.productName, quantity: i.quantity })),
    },
    pickup: { shop: so.shop.name, phone: so.shop.phone, address: so.shop.address, city: so.shop.city },
    dropoff: {
      name: so.order.shippingName,
      phone: so.order.shippingPhone,
      line1: so.order.shippingLine1,
      line2: so.order.shippingLine2,
      sector: so.order.shippingSector,
      district: so.order.shippingDistrict,
      city: so.order.shippingCity,
      latitude: so.order.shippingLat,
      longitude: so.order.shippingLng,
      instructions: so.order.shippingInstructions,
    },
    events: d.events,
  };
}

const INCLUDE = {
  sellerOrder: {
    include: {
      order: true,
      items: { select: { productName: true, quantity: true } },
      shop: { select: { name: true, phone: true, address: true, city: true } },
    },
  },
  events: { orderBy: { createdAt: 'asc' }, select: { status: true, note: true, createdAt: true } },
};

async function ownDelivery(staffId, deliveryId) {
  const d = await prisma.delivery.findFirst({ where: { id: deliveryId, staffId }, include: INCLUDE });
  if (!d) throw notFound('Delivery');
  return d;
}

router.get('/assignments', validate({ query: z.object({ scope: z.enum(['active', 'completed']).default('active') }) }), async (req, res) => {
  const where =
    req.valid.query.scope === 'active'
      ? { staffId: req.user.id, status: { in: ACTIVE } }
      : { staffId: req.user.id, status: { in: ['DELIVERED', 'FAILED'] } };
  const rows = await prisma.delivery.findMany({ where, include: INCLUDE, orderBy: { updatedAt: 'desc' }, take: 100 });
  res.json({ items: rows.map(serialize) });
});

router.get('/assignments/:id', validate({ params }), async (req, res) => {
  res.json({ delivery: serialize(await ownDelivery(req.user.id, req.valid.params.id)) });
});

router.post('/assignments/:id/pickup', validate({ params, body: z.object({ note: optionalText(200) }) }), async (req, res) => {
  const d = await ownDelivery(req.user.id, req.valid.params.id);
  if (d.sellerOrder.status !== 'READY') throw unprocessable('This package is not ready for pickup yet.');
  await changeSellerOrderStatus(d.sellerOrderId, 'IN_TRANSIT', { actor: { id: req.user.id, role: 'DELIVERY' }, note: req.valid.body.note ?? 'Picked up by courier' });
  await audit(req, 'delivery.picked_up', { entityType: 'Delivery', entityId: d.id });
  res.json({ delivery: serialize(await ownDelivery(req.user.id, d.id)) });
});

router.post(
  '/assignments/:id/deliver',
  validate({ params, body: z.object({ deliveryCode: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'), note: optionalText(200) }) }),
  async (req, res) => {
    const d = await ownDelivery(req.user.id, req.valid.params.id);
    if (d.sellerOrder.status !== 'IN_TRANSIT') throw unprocessable('Pick up the package before confirming delivery.');
    await verifyDeliveryCode(d.sellerOrderId, req.valid.body.deliveryCode);
    await changeSellerOrderStatus(d.sellerOrderId, 'DELIVERED', { actor: { id: req.user.id, role: 'DELIVERY' }, note: req.valid.body.note ?? 'Delivered' });
    await audit(req, 'delivery.delivered', { entityType: 'Delivery', entityId: d.id });
    res.json({ delivery: serialize(await ownDelivery(req.user.id, d.id)) });
  },
);

router.post('/assignments/:id/fail', validate({ params, body: z.object({ reason: text(200, 3) }) }), async (req, res) => {
  const d = await ownDelivery(req.user.id, req.valid.params.id);
  if (d.sellerOrder.status !== 'IN_TRANSIT') throw unprocessable('Only packages out for delivery can be marked as failed.');
  await changeSellerOrderStatus(d.sellerOrderId, 'READY', { actor: { id: req.user.id, role: 'DELIVERY' }, note: req.valid.body.reason });
  await audit(req, 'delivery.attempt_failed', { entityType: 'Delivery', entityId: d.id, metadata: { reason: req.valid.body.reason } });
  res.json({ delivery: serialize(await ownDelivery(req.user.id, d.id)) });
});

/** Location sharing from the courier's phone while deliveries are in progress. */
router.post(
  '/location',
  validate({ body: z.object({ latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) }) }),
  async (req, res) => {
    const { latitude, longitude } = req.valid.body;
    const { count } = await prisma.delivery.updateMany({
      where: { staffId: req.user.id, status: 'IN_TRANSIT' },
      data: { currentLat: latitude, currentLng: longitude, lastLocationAt: new Date() },
    });
    res.json({ updated: count });
  },
);

export default router;
