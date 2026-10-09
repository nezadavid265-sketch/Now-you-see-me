import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

export const memorySmsOutbox = [];

/** Normalises Rwandan numbers to E.164 (+2507XXXXXXXX). */
export function toE164(phone, defaultCountryCode = '250') {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith(defaultCountryCode)) return `+${digits}`;
  if (digits.startsWith('0')) return `+${defaultCountryCode}${digits.slice(1)}`;
  return `+${defaultCountryCode}${digits}`;
}

export async function sendSms({ to, message }) {
  const phone = toE164(to);
  if (config.SMS_PROVIDER === 'memory') {
    memorySmsOutbox.push({ to: phone, message });
    return;
  }
  if (config.SMS_PROVIDER === 'console') {
    logger.info({ to: phone.replace(/\d(?=\d{3})/g, '*') }, `SMS (console provider): ${message}`);
    return;
  }
  // Africa's Talking bulk SMS API
  const sandbox = config.AT_USERNAME === 'sandbox';
  const url = sandbox
    ? 'https://api.sandbox.africastalking.com/version1/messaging'
    : 'https://api.africastalking.com/version1/messaging';
  const body = new URLSearchParams({ username: config.AT_USERNAME, to: phone, message });
  if (config.AT_SENDER_ID) body.set('from', config.AT_SENDER_ID);
  const res = await fetch(url, {
    method: 'POST',
    headers: { apiKey: config.AT_API_KEY, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`SMS provider responded with HTTP ${res.status}`);
}
