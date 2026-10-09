import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { hmacSha256, safeEqual } from '../../lib/crypto.js';

/**
 * Sandbox provider for development and automated tests. It behaves like a
 * mobile-money push payment: the payment stays PENDING until a signed
 * webhook (or the in-app simulator in test mode) reports the outcome.
 * Disabled — and refused at startup — in production.
 */
export const testProvider = {
  method: 'TEST',
  label: 'Test payment (sandbox)',
  get enabled() {
    return config.PAYMENT_TEST_MODE;
  },
  currency: () => 'RWF',
  newReference: () => `test_${crypto.randomUUID()}`,

  async initiate({ payment }) {
    return { providerReference: payment.providerReference, status: 'PENDING' };
  },

  // The outcome only arrives through the signed webhook.
  async checkStatus() {
    return { status: 'PENDING', raw: 'PENDING' };
  },
};

export function signTestWebhook(rawBody) {
  return `sha256=${hmacSha256(config.TEST_WEBHOOK_SECRET, rawBody)}`;
}

export function verifyTestWebhook(rawBody, signatureHeader) {
  if (!config.TEST_WEBHOOK_SECRET || !rawBody || !signatureHeader) return false;
  return safeEqual(signTestWebhook(rawBody), signatureHeader);
}
