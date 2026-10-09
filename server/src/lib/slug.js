import crypto from 'node:crypto';

export function slugify(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item';
}

/** Slug with a short random suffix — avoids enumeration and collisions. */
export function uniqueSlug(value) {
  return `${slugify(value).slice(0, 70)}-${crypto.randomBytes(3).toString('hex')}`;
}
