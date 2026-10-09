import { PrismaClient } from '@prisma/client';
import { config } from '../config/env.js';

const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__rivoPrisma ??
  new PrismaClient({
    log: config.isProd ? ['error'] : ['error', 'warn'],
  });

if (!config.isProd) globalForPrisma.__rivoPrisma = prisma;
