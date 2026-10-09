import { Router } from 'express';
import { prisma } from '../../lib/prisma.js';
import { sha256 } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';
import { config } from '../../config/env.js';
import { verifyTestWebhook } from '../../integrations/payments/test.js';
import {
  markEventProcessed,
  markPaymentFailed,
  markPaymentSucceeded,
  recordPaymentEvent,
  refreshPaymentStatus,
} from '../../domain/payments.js';

/**
 * Payment provider webhooks.
 *
 * Rules applied to every provider:
 *  • events are de-duplicated by (provider, eventId) — redelivery is harmless;
 *  • the TEST provider must carry a valid HMAC-SHA256 signature;
 *  • MTN MoMo and Airtel callbacks are never trusted on their own: they only
 *    trigger a server-to-server status query against the provider's API;
 *  • handlers always answer 2xx quickly once the event is recorded, so the
 *    provider does not retry forever; failures are retried by the poller.
 */
const router = Router();

router.post('/test', async (req, res) => {
  if (!config.PAYMENT_TEST_MODE) return res.status(404).end();
  const signatureValid = verifyTestWebhook(req.rawBody, req.get('x-rivo-signature'));
  if (!signatureValid) {
    logger.warn({ ip: req.ip }, 'Rejected test webhook with invalid signature');
    return res.status(401).json({ error: { code: 'INVALID_SIGNATURE', message: 'Invalid signature' } });
  }
  const { eventId, reference, status, reason } = req.body ?? {};
  if (!eventId || !reference || !['SUCCEEDED', 'FAILED'].includes(status)) {
    return res.status(400).json({ error: { code: 'BAD_EVENT', message: 'Malformed event' } });
  }
  const payment = await prisma.payment.findUnique({ where: { providerReference: String(reference) } });
  const fresh = await recordPaymentEvent({ provider: 'TEST', eventId, type: `payment.${status.toLowerCase()}`, payload: req.body, signatureValid, paymentId: payment?.id });
  if (!fresh) return res.json({ received: true, duplicate: true });
  if (!payment) return res.status(202).json({ received: true, matched: false });

  if (status === 'SUCCEEDED') await markPaymentSucceeded(payment.id, { providerTransactionId: String(eventId), raw: 'WEBHOOK_SUCCEEDED' });
  else await markPaymentFailed(payment.id, { reason: reason ? String(reason).slice(0, 200) : 'The payment was declined.', raw: 'WEBHOOK_FAILED' });
  await markEventProcessed('TEST', eventId);
  res.json({ received: true });
});

async function handleMomo(req, res) {
  const paymentId = String(req.query.payment ?? req.body?.externalId ?? '');
  const payment = paymentId ? await prisma.payment.findUnique({ where: { id: paymentId } }) : null;
  const eventId = `momo:${paymentId}:${req.body?.financialTransactionId ?? ''}:${req.body?.status ?? ''}:${sha256(req.rawBody ?? '').slice(0, 16)}`;
  const fresh = await recordPaymentEvent({ provider: 'MTN_MOMO', eventId, type: 'callback', payload: req.body ?? {}, signatureValid: false, paymentId: payment?.id });
  if (fresh && payment?.provider === 'MTN_MOMO') {
    try {
      await refreshPaymentStatus(payment.id);
      await markEventProcessed('MTN_MOMO', eventId);
    } catch (err) {
      logger.warn({ err, paymentId: payment.id }, 'MoMo callback verification failed; poller will retry');
    }
  }
  res.status(200).json({ received: true });
}
router.post('/momo', handleMomo);
router.put('/momo', handleMomo);

router.post('/airtel', async (req, res) => {
  const reference = String(req.body?.transaction?.id ?? '');
  const payment = reference ? await prisma.payment.findUnique({ where: { providerReference: reference } }) : null;
  const eventId = `airtel:${reference}:${req.body?.transaction?.status_code ?? ''}:${sha256(req.rawBody ?? '').slice(0, 16)}`;
  const fresh = await recordPaymentEvent({ provider: 'AIRTEL_MONEY', eventId, type: 'callback', payload: req.body ?? {}, signatureValid: false, paymentId: payment?.id });
  if (fresh && payment?.provider === 'AIRTEL_MONEY') {
    try {
      await refreshPaymentStatus(payment.id);
      await markEventProcessed('AIRTEL_MONEY', eventId);
    } catch (err) {
      logger.warn({ err, paymentId: payment.id }, 'Airtel callback verification failed; poller will retry');
    }
  }
  res.status(200).json({ received: true });
});

export default router;
