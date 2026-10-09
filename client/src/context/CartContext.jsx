import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api.js';
import { readJson, removeKey, writeJson } from '../lib/storage.js';
import { useAuth } from './AuthContext.jsx';
import { useToast } from './ToastContext.jsx';

const CartContext = createContext(null);
const GUEST_KEY = 'rs_guest_cart';

/**
 * Buyers have a server-side cart. Guests keep product ids + quantities in
 * the browser, priced by the server (/cart/preview) and merged on sign-in.
 * Prices are never stored or computed in the browser.
 */
export function CartProvider({ children }) {
  const { user, status } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isBuyer = user?.role === 'BUYER';
  const isGuest = status === 'anonymous';
  const [guestItems, setGuestItems] = useState(() => readJson(GUEST_KEY, []));
  const merging = useRef(false);

  const serverCart = useQuery({
    queryKey: ['cart'],
    queryFn: () => api('/cart'),
    enabled: isBuyer,
    staleTime: 15_000,
  });

  const guestCart = useQuery({
    queryKey: ['cart-preview', guestItems],
    queryFn: () => api('/cart/preview', { method: 'POST', body: { items: guestItems } }),
    enabled: isGuest && guestItems.length > 0,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  // Merge the guest cart into the account after a buyer signs in.
  useEffect(() => {
    if (!isBuyer || merging.current) return;
    const items = readJson(GUEST_KEY, []);
    if (!items.length) return;
    merging.current = true;
    api('/cart/merge', { method: 'POST', body: { items } })
      .then((cart) => {
        queryClient.setQueryData(['cart'], cart);
        removeKey(GUEST_KEY);
        setGuestItems([]);
      })
      .catch(() => {})
      .finally(() => {
        merging.current = false;
      });
  }, [isBuyer, queryClient]);

  const saveGuest = useCallback((items) => {
    writeJson(GUEST_KEY, items);
    setGuestItems(items);
  }, []);

  const setServerCart = useCallback((cart) => queryClient.setQueryData(['cart'], cart), [queryClient]);

  const add = useCallback(
    async (productId, quantity = 1, { silent = false, name } = {}) => {
      if (user && !isBuyer) {
        toast.error('Shopping is available with a buyer account. Sign in as a buyer to place orders.');
        return false;
      }
      try {
        if (isBuyer) {
          setServerCart(await api('/cart/items', { method: 'POST', body: { productId, quantity } }));
        } else {
          const items = readJson(GUEST_KEY, []);
          const existing = items.find((i) => i.productId === productId);
          if (existing) existing.quantity = Math.min(99, existing.quantity + quantity);
          else items.push({ productId, quantity });
          saveGuest(items.slice(0, 50));
        }
        if (!silent) toast.success(name ? `Added “${name}” to your cart` : 'Added to cart', { action: { label: 'View cart', to: '/cart' } });
        return true;
      } catch (err) {
        toast.error(err.message);
        return false;
      }
    },
    [user, isBuyer, setServerCart, saveGuest, toast],
  );

  const update = useCallback(
    async (productId, quantity) => {
      try {
        if (isBuyer) setServerCart(await api(`/cart/items/${productId}`, { method: 'PATCH', body: { quantity } }));
        else saveGuest(readJson(GUEST_KEY, []).map((i) => (i.productId === productId ? { ...i, quantity } : i)));
      } catch (err) {
        toast.error(err.message);
      }
    },
    [isBuyer, setServerCart, saveGuest, toast],
  );

  const remove = useCallback(
    async (productId) => {
      if (isBuyer) setServerCart(await api(`/cart/items/${productId}`, { method: 'DELETE' }));
      else saveGuest(readJson(GUEST_KEY, []).filter((i) => i.productId !== productId));
    },
    [isBuyer, setServerCart, saveGuest],
  );

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: isBuyer ? ['cart'] : ['cart-preview'] }), [queryClient, isBuyer]);

  const cart = isBuyer ? serverCart.data : guestItems.length ? guestCart.data : null;
  const value = useMemo(
    () => ({
      cart,
      count: cart?.itemCount ?? (isGuest ? guestItems.reduce((s, i) => s + i.quantity, 0) : 0),
      isLoading: isBuyer ? serverCart.isLoading : guestCart.isLoading && guestItems.length > 0,
      canShop: !user || isBuyer,
      add,
      update,
      remove,
      refresh,
    }),
    [cart, isGuest, guestItems, isBuyer, serverCart.isLoading, guestCart.isLoading, user, add, update, remove, refresh],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}
