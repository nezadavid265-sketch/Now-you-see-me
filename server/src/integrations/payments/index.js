import { momoProvider } from './momo.js';
import { airtelProvider } from './airtel.js';
import { testProvider } from './test.js';

export const providers = {
  MTN_MOMO: momoProvider,
  AIRTEL_MONEY: airtelProvider,
  TEST: testProvider,
};

export function getProvider(method) {
  return providers[method] ?? null;
}

/** Payment methods currently offered at checkout. */
export function enabledMethods(settings) {
  const methods = [];
  if (momoProvider.enabled) methods.push({ method: 'MTN_MOMO', label: 'MTN Mobile Money', requiresPhone: true });
  if (airtelProvider.enabled) methods.push({ method: 'AIRTEL_MONEY', label: 'Airtel Money', requiresPhone: true });
  if (settings.codEnabled) {
    methods.push({ method: 'CASH_ON_DELIVERY', label: 'Cash on delivery', requiresPhone: false, maxTotal: settings.codMaxOrderTotal });
  }
  if (testProvider.enabled) methods.push({ method: 'TEST', label: 'Test payment (sandbox)', requiresPhone: true });
  return methods;
}
