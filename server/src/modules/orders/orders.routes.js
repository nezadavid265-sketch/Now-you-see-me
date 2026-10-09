import { Router } from 'express';
import { z } from 'zod';
import { id, optionalPhone, optionalText } from '../../lib/validators.js';
import { paginationSchema } from '../../lib/pagination.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import { retryOrderPayment } from '../../domain/checkout.js';
import { serializePayment } from '../payments/payments.routes.js';
import * as orders from './orders.service.js';

const router = Router();
router.use(authenticate, requireRole('BUYER'));
const params = z.object({ id });

router.get(
  '/',
  validate({ query: z.object({ status: z.enum(['all', 'active', 'completed', 'cancelled']).default('all'), ...paginationSchema, pageSize: z.coerce.number().int().min(1).max(50).default(10) }) }),
  async (req, res) => res.json(await orders.listBuyerOrders(req.user.id, req.valid.query)),
);

router.get('/:id', validate({ params }), async (req, res) => {
  res.json({ order: await orders.getBuyerOrder(req.user.id, req.valid.params.id) });
});

router.get('/:id/tracking', validate({ params }), async (req, res) => {
  res.json(await orders.getTracking(req.user.id, req.valid.params.id));
});

router.post(
  '/:id/cancel',
  validate({ params, body: z.object({ reason: optionalText(300), sellerOrderId: id.optional() }) }),
  async (req, res) => {
    res.json({ order: await orders.cancelBuyerOrder(req.user, req.valid.params.id, req.valid.body) });
  },
);

router.post(
  '/:id/pay',
  sensitiveLimiter,
  validate({
    params,
    body: z.object({ paymentMethod: z.enum(['MTN_MOMO', 'AIRTEL_MONEY', 'CASH_ON_DELIVERY', 'TEST']), payerPhone: optionalPhone }),
  }),
  async (req, res) => {
    const { payment } = await retryOrderPayment(req.user, req.valid.params.id, req.valid.body);
    res.json({ payment: payment ? serializePayment(payment) : null, order: await orders.getBuyerOrder(req.user.id, req.valid.params.id) });
  },
);

export default router;
