import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { id } from '../../lib/validators.js';
import { logger } from '../../lib/logger.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { markPaymentFailed, markPaymentSucceeded, refreshPaymentStatus } from '../../domain/payments.js';

export function serializePayment(p) {
  return {
    id: p.id,
    provider: p.provider,
    amount: p.amount,
    currency: p.currency,
    status: p.status,
    payerPhone: p.payerPhone,
    failureReason: p.failureReason,
    providerTransactionId: p.providerTransactionId,
    createdAt: p.createdAt,
    succeededAt: p.succeededAt,
  };
}

const router = Router();
router.use(authenticate, requireRole('BUYER'));

async function ownPayment(userId, paymentId) {
  const payment = await prisma.payment.findFirst({ where: { id: paymentId, order: { buyerId: userId } }, include: { order: true } });
  if (!payment) throw notFound('Payment');
  return payment;
}

/** Polled by the payment page. Also asks the provider directly when a check is due. */
router.get('/:id', validate({ params: z.object({ id }) }), async (req, res) => {
  let payment = await ownPayment(req.user.id, req.valid.params.id);
  const due = !payment.lastCheckedAt || Date.now() - payment.lastCheckedAt.getTime() > 10_000;
  if (payment.status === 'PENDING' && due) {
    try {
      await refreshPaymentStatus(payment.id);
    } catch (err) {
      logger.warn({ err, paymentId: payment.id }, 'On-demand payment check failed');
    }
    payment = await ownPayment(req.user.id, payment.id);
  }
  res.json({
    payment: serializePayment(payment),
    order: {
      id: payment.order.id,
      orderNumber: payment.order.orderNumber,
      status: payment.order.status,
      paymentStatus: payment.order.paymentStatus,
      total: payment.order.total,
      currency: payment.order.currency,
      paymentExpiresAt: payment.order.paymentExpiresAt,
    },
  });
});

/**
 * Sandbox only: approve or decline a TEST payment from the payment page,
 * standing in for the customer's phone. Unavailable in production.
 */
router.post(
  '/:id/simulate',
  validate({ params: z.object({ id }), body: z.object({ outcome: z.enum(['success', 'failure']) }) }),
  async (req, res) => {
    if (!config.PAYMENT_TEST_MODE) throw forbidden('Test payments are disabled.');
    const payment = await ownPayment(req.user.id, req.valid.params.id);
    if (payment.provider !== 'TEST') throw forbidden('Only test payments can be simulated.');
    if (req.valid.body.outcome === 'success') await markPaymentSucceeded(payment.id, { providerTransactionId: `SIM-${Date.now()}`, raw: 'SIMULATED_SUCCESS' });
    else await markPaymentFailed(payment.id, { reason: 'The test payment was declined.', raw: 'SIMULATED_FAILURE' });
    const fresh = await ownPayment(req.user.id, payment.id);
    res.json({ payment: serializePayment(fresh) });
  },
);

export default router;
