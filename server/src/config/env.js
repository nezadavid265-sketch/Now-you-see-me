import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

export const SERVER_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PROJECT_ROOT = path.resolve(SERVER_ROOT, '..');

// The root .env is shared by the server, scripts and client build.
dotenv.config({ path: path.join(PROJECT_ROOT, '.env'), quiet: true });

const bool = (def) =>
  z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((v) => (v === undefined || v === '' ? def : v === true || String(v).toLowerCase() === 'true'));

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  APP_URL: z.string().url().default('http://localhost:5173'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().min(1).max(60).default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  COOKIE_SECURE: bool(false),
  COOKIE_DOMAIN: optionalString,

  RUN_WORKER: bool(true),

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  UPLOAD_DIR: z.string().default('./uploads'),
  S3_BUCKET: optionalString,
  S3_REGION: z.string().default('auto'),
  S3_ENDPOINT: optionalString,
  S3_ACCESS_KEY_ID: optionalString,
  S3_SECRET_ACCESS_KEY: optionalString,
  S3_PUBLIC_BASE_URL: optionalString,

  EMAIL_TRANSPORT: z.enum(['console', 'smtp', 'memory']).default('console'),
  EMAIL_FROM: z.string().default('Rivoshoppa <no-reply@rivoshoppa.com>'),
  SMTP_HOST: optionalString,
  SMTP_PORT: z.coerce.number().int().default(587),
  SMTP_SECURE: bool(false),
  SMTP_USER: optionalString,
  SMTP_PASS: optionalString,

  SMS_PROVIDER: z.enum(['console', 'africastalking', 'memory']).default('console'),
  AT_USERNAME: optionalString,
  AT_API_KEY: optionalString,
  AT_SENDER_ID: optionalString,

  PAYMENT_TEST_MODE: bool(false),
  TEST_WEBHOOK_SECRET: optionalString,

  MOMO_ENABLED: bool(false),
  MOMO_BASE_URL: z.string().url().default('https://sandbox.momodeveloper.mtn.com'),
  MOMO_TARGET_ENVIRONMENT: z.string().default('sandbox'),
  MOMO_CURRENCY: z.string().default('EUR'),
  MOMO_SUBSCRIPTION_KEY: optionalString,
  MOMO_API_USER: optionalString,
  MOMO_API_KEY: optionalString,

  AIRTEL_ENABLED: bool(false),
  AIRTEL_BASE_URL: z.string().url().default('https://openapiuat.airtel.africa'),
  AIRTEL_CLIENT_ID: optionalString,
  AIRTEL_CLIENT_SECRET: optionalString,
  AIRTEL_COUNTRY: z.string().default('RW'),
  AIRTEL_CURRENCY: z.string().default('RWF'),
  AIRTEL_CALLBACK_SECRET: optionalString,

  GOOGLE_MAPS_BROWSER_KEY: optionalString,
});

function loadConfig() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}\nSee .env.example for reference.`);
  }
  const env = parsed.data;
  const isProd = env.NODE_ENV === 'production';

  // Production safety rails — fail fast instead of running insecurely.
  if (isProd) {
    const problems = [];
    if (env.PAYMENT_TEST_MODE) problems.push('PAYMENT_TEST_MODE must be false in production');
    if (!env.COOKIE_SECURE) problems.push('COOKIE_SECURE must be true in production (HTTPS)');
    if (/change[_-]?me/i.test(env.JWT_ACCESS_SECRET)) problems.push('JWT_ACCESS_SECRET still has the placeholder value');
    if (env.EMAIL_TRANSPORT === 'memory' || env.SMS_PROVIDER === 'memory') problems.push('memory transports are for tests only');
    if (problems.length) throw new Error(`Refusing to start in production:\n  • ${problems.join('\n  • ')}`);
  }
  if (env.PAYMENT_TEST_MODE && !env.TEST_WEBHOOK_SECRET) {
    throw new Error('TEST_WEBHOOK_SECRET is required when PAYMENT_TEST_MODE=true');
  }
  if (env.MOMO_ENABLED && !(env.MOMO_SUBSCRIPTION_KEY && env.MOMO_API_USER && env.MOMO_API_KEY)) {
    throw new Error('MOMO_ENABLED=true requires MOMO_SUBSCRIPTION_KEY, MOMO_API_USER and MOMO_API_KEY');
  }
  if (env.AIRTEL_ENABLED && !(env.AIRTEL_CLIENT_ID && env.AIRTEL_CLIENT_SECRET)) {
    throw new Error('AIRTEL_ENABLED=true requires AIRTEL_CLIENT_ID and AIRTEL_CLIENT_SECRET');
  }
  if (env.STORAGE_DRIVER === 's3' && !(env.S3_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY && env.S3_PUBLIC_BASE_URL)) {
    throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and S3_PUBLIC_BASE_URL');
  }

  return Object.freeze({
    ...env,
    isProd,
    isTest: env.NODE_ENV === 'test',
    corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    uploadDir: path.resolve(SERVER_ROOT, env.UPLOAD_DIR),
    clientDist: path.join(PROJECT_ROOT, 'client', 'dist'),
  });
}

export const config = loadConfig();
