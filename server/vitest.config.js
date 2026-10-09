import { defineConfig } from 'vitest/config';

// Tests run against a real PostgreSQL: an ephemeral embedded server by default,
// or the database in TEST_DATABASE_URL (e.g. a CI service container).
const TEST_DB_PORT = 54330;
const DATABASE_URL = process.env.TEST_DATABASE_URL || `postgresql://postgres:test@localhost:${TEST_DB_PORT}/rivoshoppa_test?schema=public`;

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./tests/global-setup.js'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL,
      TEST_DB_PORT: String(TEST_DB_PORT),
      JWT_ACCESS_SECRET: 'test-secret-that-is-definitely-longer-than-32-chars',
      EMAIL_TRANSPORT: 'memory',
      SMS_PROVIDER: 'memory',
      PAYMENT_TEST_MODE: 'true',
      TEST_WEBHOOK_SECRET: 'test-webhook-secret',
      MOMO_ENABLED: 'false',
      AIRTEL_ENABLED: 'false',
      RUN_WORKER: 'false',
      COOKIE_SECURE: 'false',
      APP_URL: 'http://localhost:5173',
      CORS_ORIGINS: 'http://localhost:5173',
      UPLOAD_DIR: '../.data/test-uploads',
      STORAGE_DRIVER: 'local',
      LOG_LEVEL: 'silent',
    },
  },
});
