// Thin fetch wrapper: JSON in/out, bearer access token kept in memory only,
// transparent refresh (single-flight) using the httpOnly refresh cookie.

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

let accessToken = null;
let refreshPromise = null;
const listeners = { session: null, expired: null };

export function setAccessToken(token) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}
export function onSession(fn) {
  listeners.session = fn;
}
export function onSessionExpired(fn) {
  listeners.expired = fn;
}

export class ApiError extends Error {
  constructor(status, body) {
    const err = body?.error ?? {};
    super(err.message || (status === 0 ? 'Network error — check your connection.' : `Request failed (${status})`));
    this.status = status;
    this.code = err.code;
    this.details = err.details;
    this.fieldErrors = err.details?.fieldErrors ?? {};
  }
}

function toQuery(query) {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '' || v === false) continue;
    params.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

export function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new ApiError(res.status, data);
        accessToken = data.accessToken;
        listeners.session?.(data.user);
        return data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function api(path, { method = 'GET', body, query, headers = {}, form, retry = true, signal } = {}) {
  const init = {
    method,
    credentials: 'include',
    signal,
    headers: {
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body !== undefined && !form ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  };

  let res;
  try {
    res = await fetch(`${BASE}/api${path}${toQuery(query)}`, init);
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    throw new ApiError(0, null);
  }

  if (res.status === 401 && retry && accessToken) {
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      listeners.expired?.();
      throw new ApiError(401, { error: { message: 'Your session has expired. Please sign in again.', code: 'SESSION_EXPIRED' } });
    }
    return api(path, { method, body, query, headers, form, retry: false, signal });
  }

  if (res.status === 204) return null;
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new ApiError(res.status, isJson ? data : null);
  return data;
}

/** Downloads a protected file (e.g. CSV report) using the current session. */
export async function download(path, query, filename) {
  const res = await fetch(`${BASE}/api${path}${toQuery(query)}`, {
    credentials: 'include',
    headers: { Authorization: `Bearer ${accessToken}`, 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename ?? res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] ?? 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function uploadImages(files, purpose) {
  const form = new FormData();
  form.append('purpose', purpose);
  for (const f of files) form.append('files', f);
  const { urls } = await api('/uploads/images', { method: 'POST', form });
  return urls;
}
