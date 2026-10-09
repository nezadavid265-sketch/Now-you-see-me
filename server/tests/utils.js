import { prisma } from '../src/lib/prisma.js';
import { invalidateSettingsCache } from '../src/services/settings.js';

export async function setSetting(key, value) {
  await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  invalidateSettingsCache();
}
