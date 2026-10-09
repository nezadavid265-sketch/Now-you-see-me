import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, onSession, onSessionExpired, refreshSession, setAccessToken } from '../lib/api.js';
import { readJson, removeKey, writeJson } from '../lib/storage.js';

// Non-sensitive hint that this browser has signed in before, so anonymous
// visitors don't trigger a pointless session-refresh request on every page load.
const SESSION_HINT = 'rs_session_hint';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading');

  useEffect(() => {
    onSession((u) => setUser(u));
    onSessionExpired(() => {
      removeKey(SESSION_HINT);
      setUser(null);
      setStatus('anonymous');
      queryClient.clear();
    });
    if (!readJson(SESSION_HINT, false)) {
      setStatus('anonymous');
      return;
    }
    // Restore the session from the httpOnly refresh cookie on page load.
    refreshSession()
      .then((data) => {
        setUser(data.user);
        setStatus('authenticated');
      })
      .catch(() => {
        removeKey(SESSION_HINT);
        setStatus('anonymous');
      });
  }, [queryClient]);

  const startSession = useCallback(
    (data) => {
      setAccessToken(data.accessToken);
      writeJson(SESSION_HINT, true);
      setUser(data.user);
      setStatus('authenticated');
      queryClient.removeQueries();
      return data.user;
    },
    [queryClient],
  );

  const login = useCallback((email, password) => api('/auth/login', { method: 'POST', body: { email, password } }).then(startSession), [startSession]);
  const register = useCallback((body) => api('/auth/register', { method: 'POST', body }).then(startSession), [startSession]);
  const registerSeller = useCallback((body) => api('/auth/register-seller', { method: 'POST', body }).then(startSession), [startSession]);

  const logout = useCallback(async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } finally {
      removeKey(SESSION_HINT);
      setAccessToken(null);
      setUser(null);
      setStatus('anonymous');
      queryClient.clear();
    }
  }, [queryClient]);

  const reloadUser = useCallback(async () => {
    const { user: u } = await api('/auth/me');
    setUser(u);
    return u;
  }, []);

  const value = useMemo(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated' && Boolean(user),
      login,
      register,
      registerSeller,
      logout,
      reloadUser,
      setUser,
      setAccessToken,
      can: (permission) => user?.role === 'ADMIN' && (user.isSuperAdmin || user.adminPermissions?.includes(permission)),
    }),
    [user, status, login, register, registerSeller, logout, reloadUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Where each role lands after signing in. */
export function homeFor(user) {
  return { SELLER: '/seller', ADMIN: '/admin', DELIVERY: '/delivery' }[user?.role] ?? '/';
}
