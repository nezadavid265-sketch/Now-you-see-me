import { Router } from 'express';
import { z } from 'zod';
import { badRequest } from '../../lib/errors.js';
import { id, optionalPhone } from '../../lib/validators.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { sensitiveLimiter } from '../../middleware/rateLimit.js';
import { placeOrder, quoteCart } from '../../domain/checkout.js';
import { serializePayment } from '../payments/payments.routes.js';

const router = Router();
router.use(authenticate, requireRole('BUYER'));

const couponCode = z
  .string()
  .trim()
  .max(40)
  .optional()
  .transform((v) => (v ? v.toUpperCase() : undefined));

router.post('/quote', validate({ body: z.object({ couponCode }) }), async (req, res) => {
  res.json(await quoteCart(req.user.id, { couponCode: req.valid.body.couponCode }));
});

const checkoutSchema = z.object({
  addressId: id,
  couponCode,
  paymentMethod: z.enum(['MTN_MOMO', 'AIRTEL_MONEY', 'CASH_ON_DELIVERY', 'TEST']),
  payerPhone: optionalPhone,
});

router.post('/', sensitiveLimiter, validate({ body: checkoutSchema }), async (req, res) => {
  const key = req.get('idempotency-key');
  if (key && !/^[A-Za-z0-9_-]{8,100}$/.test(key)) throw badRequest('Invalid Idempotency-Key header');
  // Only the cart, address id, coupon code and payment choice come from the client;
  // every amount is recomputed on the server.
  const { order, payment, replay } = await placeOrder(req.user, { ...req.valid.body, idempotencyKey: key });
  res.status(replay ? 200 : 201).json({
    order: { id: order.id, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus, total: order.total, currency: order.currency },
    payment: payment ? serializePayment(payment) : null,
  });
});

export default router;
