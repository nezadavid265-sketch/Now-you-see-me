import { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.js';

const DEFAULTS = {
  marketplaceName: 'Rivoshoppa',
  currency: 'RWF',
  paymentMethods: [],
  deliveryFeeBase: 1500,
  freeDeliveryThreshold: 50000,
  refundWindowDays: 7,
  googleMapsKey: null,
  paymentTestMode: false,
};

const ConfigContext = createContext(DEFAULTS);

/** Public runtime configuration served by the API (no rebuild needed to change it). */
export function ConfigProvider({ children }) {
  const { data } = useQuery({ queryKey: ['config'], queryFn: () => api('/config'), staleTime: 5 * 60_000 });
  return <ConfigContext.Provider value={{ ...DEFAULTS, ...data }}>{children}</ConfigContext.Provider>;
}

export const useConfig = () => useContext(ConfigContext);
