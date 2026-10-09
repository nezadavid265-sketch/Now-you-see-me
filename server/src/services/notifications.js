import { config } from '../config/env.js';
import { prisma } from '../lib/prisma.js';
import { enqueue } from '../jobs/queue.js';
import { logger } from '../lib/logger.js';

/**
 * Creates in-app notifications and queues email/SMS delivery according to
 * each user's preferences. Never throws — notifications are best-effort.
 */
export async function notify(userIds, { type, title, body, link, email = true, sms = false }) {
  const ids = [...new Set([userIds].flat().filter(Boolean))];
  if (!ids.length) return;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: ids }, status: 'ACTIVE' },
      select: { id: true, email: true, phone: true, notifyEmail: true, notifySms: true },
    });
    await prisma.notification.createMany({
      data: users.map((u) => ({ userId: u.id, type, title, body, link })),
    });
    const ctaUrl = link ? new URL(link, config.APP_URL).toString() : undefined;
    for (const u of users) {
      if (email && u.notifyEmail) {
        await enqueue('email.send', {
          to: u.email,
          subject: title,
          title,
          paragraphs: [body],
          cta: ctaUrl ? { label: 'View details', url: ctaUrl } : undefined,
        });
      }
      if (sms && u.notifySms && u.phone) {
        await enqueue('sms.send', { to: u.phone, message: `Rivoshoppa: ${title}. ${body}`.slice(0, 300) });
      }
    }
  } catch (err) {
    logger.error({ err, type }, 'Failed to create notifications');
  }
}

/** Notifies administrators holding a given permission (and super admins). */
export async function notifyAdmins(permission, payload) {
  const admins = await prisma.user.findMany({
    where: {
      role: 'ADMIN',
      status: 'ACTIVE',
      OR: [{ isSuperAdmin: true }, { adminPermissions: { has: permission } }],
    },
    select: { id: true },
  });
  await notify(
    admins.map((a) => a.id),
    { email: false, ...payload },
  );
}

export async function notifyShopOwner(shopId, payload) {
  const shop = await prisma.shop.findUnique({ where: { id: shopId }, select: { sellerId: true } });
  if (shop) await notify(shop.sellerId, payload);
}
