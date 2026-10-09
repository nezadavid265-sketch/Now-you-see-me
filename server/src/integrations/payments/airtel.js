import crypto from 'node:crypto';
import { config } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

/**
 * Airtel Money — Africa Collection API (USSD push).
 * Docs: https://developers.airtel.africa/documentation
 *
 * The final transaction state is always confirmed by querying
 * GET /standard/v1/payments/{id}; callbacks only trigger that check.
 */
let cachedToken = null;

async function getAccessToken(fetchImpl = fetch) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const res = await fetchImpl(`${config.AIRTEL_BASE_URL}/auth/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: '*/*' },
    body: JSON.stringify({
      client_id: config.AIRTEL_CLIENT_ID,
      client_secret: config.AIRTEL_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Airtel token request failed (HTTP ${res.status})`);
  const body = await res.json();
  cachedToken = { value: body.access_token, expiresAt: Date.now() + Number(body.expires_in ?? 180) * 1000 };
  return cachedToken.value;
}

/** Airtel expects the subscriber number without the country code, e.g. 731234567. */
export function airtelMsisdn(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('250')) return digits.slice(3);
  if (digits.startsWith('0')) return digits.slice(1);
  return digits;
}

const headers = (token) => ({
  'Content-Type': 'application/json',
  Accept: '*/*',
  'X-Country': config.AIRTEL_COUNTRY,
  'X-Currency': config.AIRTEL_CURRENCY,
  Authorization: `Bearer ${token}`,
});

export const airtelProvider = {
  method: 'AIRTEL_MONEY',
  label: 'Airtel Money',
  get enabled() {
    return config.AIRTEL_ENABLED;
  },
  currency: () => config.AIRTEL_CURRENCY,
  newReference: () => `RS${Date.now().toString(36)}${crypto.randomBytes(4).toString('hex')}`.toUpperCase(),

  async initiate({ payment, order, phone }, { fetchImpl = fetch } = {}) {
    const transactionId = payment.providerReference;
    const token = await getAccessToken(fetchImpl);
    const res = await fetchImpl(`${config.AIRTEL_BASE_URL}/merchant/v1/payments/`, {
      method: 'POST',
      headers: headers(token),
      body: JSON.stringify({
        reference: `Rivoshoppa ${order.orderNumber}`.slice(0, 64),
        subscriber: { country: config.AIRTEL_COUNTRY, currency: config.AIRTEL_CURRENCY, msisdn: airtelMsisdn(phone) },
        transaction: { amount: payment.amount, country: config.AIRTEL_COUNTRY, currency: config.AIRTEL_CURRENCY, id: transactionId },
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body?.status?.success !== false) return { providerReference: transactionId, status: 'PENDING' };
    logger.warn({ status: res.status, code: body?.status?.response_code }, 'Airtel payment request rejected');
    return { providerReference: transactionId, status: 'FAILED', reason: 'Airtel Money could not start the payment. Check the number and try again.' };
  },

  async checkStatus(payment, { fetchImpl = fetch } = {}) {
    const token = await getAccessToken(fetchImpl);
    const res = await fetchImpl(`${config.AIRTEL_BASE_URL}/standard/v1/payments/${payment.providerReference}`, {
      headers: headers(token),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Airtel status request failed (HTTP ${res.status})`);
    const body = await res.json();
    const txn = body?.data?.transaction ?? {};
    const raw = String(txn.status ?? '').toUpperCase();
    // TS = success, TF = failed, TE = expired, TA = ambiguous, TIP = in progress
    if (raw === 'TS') return { status: 'SUCCEEDED', raw, providerTransactionId: txn.airtel_money_id ?? null };
    if (raw === 'TF' || raw === 'TE') return { status: 'FAILED', raw, reason: txn.message || 'The Airtel Money payment was not completed.' };
    return { status: 'PENDING', raw };
  },

  _resetTokenCache() {
    cachedToken = null;
  },
};
