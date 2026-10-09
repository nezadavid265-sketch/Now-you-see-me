import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/**
 * MTN Mobile Money — Collection API ("Request to Pay").
 * Docs: https://momodeveloper.mtn.com/api-documentation
 *
 * Flow: request-to-pay (202 Accepted) → customer approves on their phone →
 * we confirm the final state by querying GET /requesttopay/{referenceId}.
 * MoMo callbacks are NOT signed, so they are only treated as a hint to
 * re-query the status from MTN's API.
 */
let cachedToken = null;

function baseHeaders() {
  return {
    'Ocp-Apim-Subscription-Key': config.MOMO_SUBSCRIPTION_KEY,
    'X-Target-Environment': config.MOMO_TARGET_ENVIRONMENT,
  };
}

async function getAccessToken(fetchImpl = fetch) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const basic = Buffer.from(`${config.MOMO_API_USER}:${config.MOMO_API_KEY}`).toString('base64');
  const res = await fetchImpl(`${config.MOMO_BASE_URL}/collection/token/`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Ocp-Apim-Subscription-Key': config.MOMO_SUBSCRIPTION_KEY },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`MoMo token request failed (HTTP ${res.status})`);
  const body = await res.json();
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

/** MSISDN in international format without "+", e.g. 250788123456. */
export function momoMsisdn(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('250')) return digits;
  if (digits.startsWith('0')) return `250${digits.slice(1)}`;
  return digits.length === 9 ? `250${digits}` : digits;
}

export const momoProvider = {
  method: 'MTN_MOMO',
  label: 'MTN Mobile Money',
  get enabled() {
    return config.MOMO_ENABLED;
  },
  currency: () => config.MOMO_CURRENCY,
  newReference: () => crypto.randomUUID(),

  async initiate({ payment, order, phone }, { fetchImpl = fetch } = {}) {
    const referenceId = payment.providerReference;
    const token = await getAccessToken(fetchImpl);
    const headers = {
      ...baseHeaders(),
      Authorization: `Bearer ${token}`,
      'X-Reference-Id': referenceId,
      'Content-Type': 'application/json',
    };
    // MTN only calls back to HTTPS hosts registered for the API user.
    if (config.API_PUBLIC_URL.startsWith('https://')) {
      headers['X-Callback-Url'] = `${config.API_PUBLIC_URL}/api/webhooks/momo?payment=${payment.id}`;
    }
    const res = await fetchImpl(`${config.MOMO_BASE_URL}/collection/v1_0/requesttopay`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        amount: String(payment.amount),
        currency: config.MOMO_CURRENCY,
        externalId: payment.id,
        payer: { partyIdType: 'MSISDN', partyId: momoMsisdn(phone) },
        payerMessage: `Rivoshoppa order ${order.orderNumber}`.slice(0, 160),
        payeeNote: `Order ${order.orderNumber}`.slice(0, 160),
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 202) return { providerReference: referenceId, status: 'PENDING' };
    const text = await res.text().catch(() => '');
    logger.warn({ status: res.status, body: text.slice(0, 300) }, 'MoMo request-to-pay rejected');
    return { providerReference: referenceId, status: 'FAILED', reason: 'Mobile Money could not start the payment. Check the number and try again.' };
  },

  async checkStatus(payment, { fetchImpl = fetch } = {}) {
    const token = await getAccessToken(fetchImpl);
    const res = await fetchImpl(`${config.MOMO_BASE_URL}/collection/v1_0/requesttopay/${payment.providerReference}`, {
      headers: { ...baseHeaders(), Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(20_000),
    });
    if (res.status === 404) return { status: 'PENDING', raw: 'NOT_FOUND' };
    if (!res.ok) throw new Error(`MoMo status request failed (HTTP ${res.status})`);
    const body = await res.json();
    const raw = String(body.status ?? '').toUpperCase();
    if (raw === 'SUCCESSFUL') {
      // Defence in depth: the confirmed amount must match what we requested.
      if (Number(body.amount) !== payment.amount || (body.currency && body.currency !== config.MOMO_CURRENCY)) {
        return { status: 'FAILED', raw, reason: 'Amount mismatch reported by provider', mismatch: true };
      }
      return { status: 'SUCCEEDED', raw, providerTransactionId: body.financialTransactionId ?? null };
    }
    if (raw === 'FAILED' || raw === 'REJECTED' || raw === 'TIMEOUT') {
      return { status: 'FAILED', raw, reason: humanReason(body.reason) };
    }
    return { status: 'PENDING', raw };
  },

  _resetTokenCache() {
    cachedToken = null;
  },
};

function humanReason(reason) {
  const code = typeof reason === 'string' ? reason : reason?.code;
  const map = {
    APPROVAL_REJECTED: 'The payment was declined on the phone.',
    EXPIRED: 'The payment request expired before it was approved.',
    NOT_ENOUGH_FUNDS: 'Insufficient Mobile Money balance.',
    PAYER_NOT_FOUND: 'This number is not registered for Mobile Money.',
    PAYER_LIMIT_REACHED: 'The Mobile Money account limit was reached.',
  };
  return map[code] ?? 'The Mobile Money payment was not completed.';
}
