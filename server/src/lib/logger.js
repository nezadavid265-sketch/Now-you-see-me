import pino from 'pino';
import { config } from '../config/env.js';

// Never log credentials, tokens, payment secrets or full personal data.
export const REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.passwordHash',
  '*.token',
  '*.refreshToken',
  '*.accessToken',
  '*.apiKey',
  '*.secret',
  '*.deliveryCode',
];

export const logger = pino({
  level: config.isTest ? 'silent' : config.LOG_LEVEL,
  redact: { paths: REDACT_PATHS, censor: '[REDACTED]' },
  base: { service: 'rivoshoppa-api' },
  transport:
    !config.isProd && !config.isTest
      ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,service' } }
      : undefined,
});
