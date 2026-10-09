// Browser storage helpers that never throw (private mode, blocked storage…).

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
}

export function removeKey(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

const RECENT_KEY = 'rs_recently_viewed';

export function rememberViewed(slug) {
  const list = readJson(RECENT_KEY, []).filter((s) => s !== slug);
  writeJson(RECENT_KEY, [slug, ...list].slice(0, 12));
}

export function recentlyViewed() {
  return readJson(RECENT_KEY, []);
}
