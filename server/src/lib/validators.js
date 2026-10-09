import { z } from 'zod';

// Shared field validators. Strings are trimmed and length-limited everywhere
// so oversized or whitespace-only input never reaches the database.

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '12345678', '123456789', '1234567890', 'qwerty123', 'iloveyou1',
  'admin123', 'welcome1', 'abc12345', 'letmein1', 'rivoshoppa1', 'passw0rd', 'qwertyuiop1', '11111111a',
]);

export const id = z.string().trim().min(1).max(40);
export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254);
export const password = z
  .string()
  .min(8, 'Use at least 8 characters')
  .max(128, 'Use at most 128 characters')
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), 'Use a mix of letters and numbers')
  .refine((v) => !COMMON_PASSWORDS.has(v.toLowerCase()), 'This password is too common — choose another');
export const personName = z.string().trim().min(2, 'Enter your full name').max(80);
export const phone = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9 ()-]{7,18}$/, 'Enter a valid phone number');
export const optionalPhone = z
  .union([phone, z.literal('')])
  .optional()
  .transform((v) => (v ? v : undefined));
export const text = (max, min = 0) => z.string().trim().min(min).max(max);
export const optionalText = (max) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
export const money = z.coerce.number().int('Use whole numbers').min(0).max(100_000_000);
export const imageUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith('/uploads/') || /^https:\/\//.test(v), 'Invalid image URL');
export const internalLink = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v.startsWith('/') && !v.startsWith('//'), 'Use a link within the site, e.g. /search?category=phones');
export const boolish = z.union([z.boolean(), z.enum(['true', 'false']).transform((v) => v === 'true')]);
export const dateString = z.coerce.date();
