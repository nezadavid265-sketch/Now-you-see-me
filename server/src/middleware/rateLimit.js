import { rateLimit } from 'express-rate-limit';
import { config } from '../config/env.js';

// Rate limits are skipped in automated tests unless a test opts in.
const skip = () => config.isTest && !process.env.TEST_RATE_LIMIT;

const handler = (_req, res, _next, options) =>
  res.status(options.statusCode).json({
    error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait a moment and try again.' },
  });

export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler,
});

/** Login, registration and password recovery — brute-force protection per IP. */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler,
});

export const sensitiveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip,
  handler,
});
