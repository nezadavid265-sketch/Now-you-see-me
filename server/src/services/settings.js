import { z } from 'zod';
import { prisma } from '../lib/prisma.js';

/** Marketplace configuration, editable by administrators (no DB editing needed). */
export const settingsSchema = z.object({
  marketplaceName: z.string().min(2).max(60),
  currency: z.string().length(3),
  supportEmail: z.string().email(),
  supportPhone: z.string().max(30),
  defaultCommissionBps: z.number().int().min(0).max(5000),
  deliveryFeeBase: z.number().int().min(0).max(1_000_000),
  freeDeliveryThreshold: z.number().int().min(0).max(100_000_000),
  codEnabled: z.boolean(),
  codMaxOrderTotal: z.number().int().min(0),
  requireProductApproval: z.boolean(),
  refundWindowDays: z.number().int().min(0).max(90),
  payoutHoldDays: z.number().int().min(0).max(90),
  minPayoutAmount: z.number().int().min(0),
  paymentTimeoutMinutes: z.number().int().min(5).max(24 * 60),
  maxDeliveryCodeAttempts: z.number().int().min(3).max(20),
  sellerCanSelfDeliver: z.boolean(),
  announcementBar: z.string().max(200),
});

export const DEFAULT_SETTINGS = {
  marketplaceName: 'Rivoshoppa',
  currency: 'RWF',
  supportEmail: 'support@rivoshoppa.com',
  supportPhone: '+250 788 000 000',
  defaultCommissionBps: 1000,
  deliveryFeeBase: 1500,
  freeDeliveryThreshold: 50_000,
  codEnabled: true,
  codMaxOrderTotal: 500_000,
  requireProductApproval: false,
  refundWindowDays: 7,
  payoutHoldDays: 7,
  minPayoutAmount: 5_000,
  paymentTimeoutMinutes: 30,
  maxDeliveryCodeAttempts: 5,
  sellerCanSelfDeliver: true,
  announcementBar: 'Free delivery in Kigali on orders over 50,000 RWF from the same shop',
};

let cache = null;
let cacheAt = 0;
const TTL = 15_000;

export async function getSettings({ fresh = false } = {}) {
  if (!fresh && cache && Date.now() - cacheAt < TTL) return cache;
  const rows = await prisma.setting.findMany();
  const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  cache = { ...DEFAULT_SETTINGS, ...stored };
  cacheAt = Date.now();
  return cache;
}

export async function updateSettings(patch, userId) {
  const parsed = settingsSchema.partial().parse(patch);
  await prisma.$transaction(
    Object.entries(parsed).map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value, updatedById: userId },
        update: { value, updatedById: userId },
      }),
    ),
  );
  cache = null;
  return getSettings({ fresh: true });
}

export function invalidateSettingsCache() {
  cache = null;
}
