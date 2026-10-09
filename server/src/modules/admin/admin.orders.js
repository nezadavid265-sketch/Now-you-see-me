import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { dateString, id, text } from '../../lib/validators.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { notify } from '../../services/notifications.js';
import { STATUS_LABELS } from '../../domain/orderStatus.js';
import { changeSellerOrderStatus } from '../../domain/orders.js';

const params = z.object({ id });

// ── Orders (all sellers) ───────────────────────────────────────────
export const ordersRouter = Router();

ordersRouter.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(100).optional(),
      status: z.enum(['PENDING_PAYMENT', 'PROCESSING', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED', 'REFUNDED']).optional(),
      paymentStatus: z.enum(['UNPAID', 'PENDING', 'PAID', 'FAILED', 'PARTIALLY_REFUNDED', 'REFUNDED']).optional(),
      from: dateString.optional(),
      to: dateString.optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => {
    const { q, status, paymentStatus, from, to, page, pageSize } = req.valid.query;
    const where = {
      ...(status ? { status } : {}),
      ...(paymentStatus ? { paymentStatus } : {}),
      ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: 'insensitive' } },
              { buyer: { email: { contains: q, mode: 'insensitive' } } },
              { buyer: { name: { contains: q, mode: 'insensitive' } } },
              { shippingPhone: { contains: q } },
            ],
          }
        : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate({ page, pageSize }),
        include: {
          buyer: { select: { name: true, email: true } },
          sellerOrders: { select: { id: true, number: true, status: true, shop: { select: { name: true } } } },
        },
      }),
    ]);
    res.json(pageResult(rows, total, { page, pageSize }));
  },
);

ordersRouter.get('/:id', validate({ params }), async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.valid.params.id },
    include: {
      buyer: { select: { id: true, name: true, email: true, phone: true } },
      sellerOrders: {
        orderBy: { number: 'asc' },
        include: {
          shop: { select: { id: true, name: true, slug: true } },
          items: true,
          events: { orderBy: { createdAt: 'asc' } },
          delivery: { include: { staff: { select: { id: true, name: true, phone: true } }, events: { orderBy: { createdAt: 'asc' } } } },
        },
      },
      payments: { orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { createdAt: 'desc' }, take: 10 } } },
      refunds: { orderBy: { createdAt: 'desc' } },
      events: { where: { sellerOrderId: null }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!order) throw notFound('Order');
  // Delivery codes stay private to the buyer, even for administrators.
  const sanitized = {
    ...order,
    sellerOrders: order.sellerOrders.map(({ deliveryCode: _code, ...so }) => ({ ...so, statusLabel: STATUS_LABELS[so.status] })),
  };
  res.json({ order: sanitized });
});

/** Administrative override of a shipment's status (any valid transition, reason required). */
export const sellerOrdersRouter = Router();
sellerOrdersRouter.post(
  '/:id/status',
  validate({
    params,
    body: z.object({
      status: z.enum(['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
      reason: text(300, 3),
    }),
  }),
  async (req, res) => {
    const so = await prisma.sellerOrder.findUnique({ where: { id: req.valid.params.id }, select: { id: true, status: true, orderId: true } });
    if (!so) throw notFound('Order');
    if (so.status === 'PENDING_PAYMENT' && req.valid.body.status === 'PLACED') {
      throw unprocessable('Payments must be confirmed through the payment record, not by changing the order status.');
    }
    await changeSellerOrderStatus(so.id, req.valid.body.status, {
      actor: { id: req.user.id, role: 'ADMIN' },
      reason: req.valid.body.reason,
      note: req.valid.body.reason,
    });
    await audit(req, 'admin.order_status_override', {
      entityType: 'SellerOrder',
      entityId: so.id,
      metadata: { from: so.status, to: req.valid.body.status, reason: req.valid.body.reason },
    });
    res.json({ ok: true });
  },
);

// ── Deliveries ─────────────────────────────────────────────────────
export const deliveriesRouter = Router();

deliveriesRouter.get(
  '/',
  validate({
    query: z.object({
      status: z.enum(['PENDING', 'ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED']).optional(),
      unassigned: z.enum(['true', 'false']).optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => {
    const { status, unassigned, page, pageSize } = req.valid.query;
    const where = { ...(status ? { status } : {}), ...(unassigned === 'true' ? { staffId: null } : {}) };
    const [total, rows] = await Promise.all([
      prisma.delivery.count({ where }),
      prisma.delivery.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...paginate({ page, pageSize }),
        include: {
          staff: { select: { id: true, name: true, phone: true } },
          sellerOrder: {
            select: {
              id: true, number: true, status: true, total: true, orderId: true,
              shop: { select: { name: true, city: true } },
              order: { select: { shippingCity: true, shippingDistrict: true, paymentMethod: true } },
            },
          },
        },
      }),
    ]);
    res.json(pageResult(rows, total, { page, pageSize }));
  },
);

deliveriesRouter.post('/:id/assign', validate({ params, body: z.object({ staffId: id }) }), async (req, res) => {
  const [delivery, staff] = await Promise.all([
    prisma.delivery.findUnique({ where: { id: req.valid.params.id }, include: { sellerOrder: { select: { number: true } } } }),
    prisma.user.findFirst({ where: { id: req.valid.body.staffId, role: 'DELIVERY', status: 'ACTIVE' } }),
  ]);
  if (!delivery) throw notFound('Delivery');
  if (!staff) throw unprocessable('Choose an active delivery staff member.');
  if (['DELIVERED', 'FAILED'].includes(delivery.status)) throw unprocessable('This delivery is already closed.');
  await prisma.delivery.update({
    where: { id: delivery.id },
    data: {
      staffId: staff.id,
      assignedAt: new Date(),
      status: delivery.status === 'PENDING' ? 'ASSIGNED' : delivery.status,
      events: { create: { status: 'ASSIGNED', note: `Assigned to ${staff.name}`, actorId: req.user.id } },
    },
  });
  await audit(req, 'admin.delivery_assigned', { entityType: 'Delivery', entityId: delivery.id, metadata: { staffId: staff.id } });
  await notify(staff.id, {
    type: 'delivery.assigned',
    title: `New delivery: ${delivery.sellerOrder.number}`,
    body: 'A package is waiting for pickup. Open the delivery app for details.',
    link: `/delivery/${delivery.id}`,
    sms: true,
  });
  res.json({ ok: true });
});

export const staffRouter = Router();
staffRouter.get('/', async (_req, res) => {
  const staff = await prisma.user.findMany({
    where: { role: 'DELIVERY' },
    select: {
      id: true, name: true, phone: true, email: true, status: true,
      _count: { select: { deliveries: { where: { status: { in: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } } } } },
    },
    orderBy: { name: 'asc' },
  });
  res.json({ items: staff.map((s) => ({ ...s, activeDeliveries: s._count.deliveries })) });
});
