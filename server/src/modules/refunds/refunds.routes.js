import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { id, optionalText, text } from '../../lib/validators.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { requestRefund } from '../../domain/refunds.js';

const router = Router();
router.use(authenticate, requireRole('BUYER'));

const refundSchema = z.object({
  sellerOrderId: id,
  items: z
    .array(z.object({ orderItemId: id, quantity: z.coerce.number().int().min(1).max(99) }))
    .min(1, 'Select at least one item')
    .max(50)
    .refine((items) => new Set(items.map((i) => i.orderItemId)).size === items.length, 'Each item can only appear once'),
  reason: text(120, 3),
  details: optionalText(1000),
});

router.post('/', validate({ body: refundSchema }), async (req, res) => {
  const refund = await requestRefund(req.user, req.valid.body);
  res.status(201).json({ refund });
});

router.get('/', async (req, res) => {
  const items = await prisma.refund.findMany({
    where: { buyerId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { order: { select: { orderNumber: true } }, sellerOrder: { select: { number: true, shop: { select: { name: true } } } } },
  });
  res.json({
    items: items.map((r) => ({
      id: r.id,
      orderId: r.orderId,
      orderNumber: r.order.orderNumber,
      shipment: r.sellerOrder?.number ?? null,
      shop: r.sellerOrder?.shop.name ?? null,
      amount: r.amount,
      status: r.status,
      reason: r.reason,
      adminNote: r.adminNote,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    })),
  });
});

export default router;
