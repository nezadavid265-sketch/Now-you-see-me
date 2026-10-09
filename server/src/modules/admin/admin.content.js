import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { dateString, id, imageUrl, internalLink, optionalText, text } from '../../lib/validators.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { notify } from '../../services/notifications.js';

const params = z.object({ id });

// ── Coupons ────────────────────────────────────────────────────────
export const couponsRouter = Router();

const couponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{3,30}$/, 'Use 3–30 letters, numbers, dashes or underscores'),
    description: optionalText(200),
    type: z.enum(['PERCENTAGE', 'FIXED']),
    value: z.coerce.number().int().min(1),
    minOrderAmount: z.coerce.number().int().min(0).default(0),
    maxDiscount: z.coerce.number().int().min(1).nullable().optional(),
    usageLimit: z.coerce.number().int().min(1).nullable().optional(),
    perUserLimit: z.coerce.number().int().min(0).max(100).default(1),
    shopId: id.nullable().optional(),
    startsAt: dateString.nullable().optional(),
    endsAt: dateString.nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .refine((c) => c.type !== 'PERCENTAGE' || c.value <= 90, { message: 'Percentage discounts can be at most 90%', path: ['value'] })
  .refine((c) => !c.startsAt || !c.endsAt || c.endsAt > c.startsAt, { message: 'End date must be after start date', path: ['endsAt'] });

couponsRouter.get('/', validate({ query: z.object({ q: z.string().trim().max(40).optional(), ...paginationSchema }) }), async (req, res) => {
  const { q, page, pageSize } = req.valid.query;
  const where = q ? { code: { contains: q.toUpperCase() } } : {};
  const [total, items] = await Promise.all([
    prisma.coupon.count({ where }),
    prisma.coupon.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate({ page, pageSize }), include: { shop: { select: { name: true } } } }),
  ]);
  res.json(pageResult(items, total, { page, pageSize }));
});

couponsRouter.post('/', validate({ body: couponSchema }), async (req, res) => {
  const coupon = await prisma.coupon.create({ data: req.valid.body });
  await audit(req, 'admin.coupon_created', { entityType: 'Coupon', entityId: coupon.id, metadata: { code: coupon.code } });
  res.status(201).json({ coupon });
});

couponsRouter.patch('/:id', validate({ params, body: couponSchema.innerType().innerType().partial() }), async (req, res) => {
  const coupon = await prisma.coupon.update({ where: { id: req.valid.params.id }, data: req.valid.body });
  await audit(req, 'admin.coupon_updated', { entityType: 'Coupon', entityId: coupon.id, metadata: req.valid.body });
  res.json({ coupon });
});

couponsRouter.delete('/:id', validate({ params }), async (req, res) => {
  const used = await prisma.couponRedemption.count({ where: { couponId: req.valid.params.id } });
  if (used) {
    await prisma.coupon.update({ where: { id: req.valid.params.id }, data: { isActive: false } });
    await audit(req, 'admin.coupon_deactivated', { entityType: 'Coupon', entityId: req.valid.params.id });
    return res.json({ deactivated: true });
  }
  await prisma.coupon.delete({ where: { id: req.valid.params.id } });
  await audit(req, 'admin.coupon_deleted', { entityType: 'Coupon', entityId: req.valid.params.id });
  res.status(204).end();
});

// ── Banners ────────────────────────────────────────────────────────
export const bannersRouter = Router();

const bannerSchema = z.object({
  title: text(80, 2),
  subtitle: optionalText(160),
  imageUrl: imageUrl.optional().nullable(),
  linkUrl: internalLink.optional().nullable(),
  ctaLabel: optionalText(30),
  theme: z.enum(['brand', 'accent', 'dark', 'sunrise', 'forest']).default('brand'),
  position: z.enum(['HOME_HERO', 'HOME_STRIP']).default('HOME_HERO'),
  sortOrder: z.coerce.number().int().min(0).max(100).default(0),
  isActive: z.boolean().default(true),
  startsAt: dateString.nullable().optional(),
  endsAt: dateString.nullable().optional(),
});

bannersRouter.get('/', async (_req, res) => {
  res.json({ items: await prisma.banner.findMany({ orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }] }) });
});
bannersRouter.post('/', validate({ body: bannerSchema }), async (req, res) => {
  const banner = await prisma.banner.create({ data: req.valid.body });
  await audit(req, 'admin.banner_created', { entityType: 'Banner', entityId: banner.id });
  res.status(201).json({ banner });
});
bannersRouter.patch('/:id', validate({ params, body: bannerSchema.partial() }), async (req, res) => {
  const banner = await prisma.banner.update({ where: { id: req.valid.params.id }, data: req.valid.body });
  await audit(req, 'admin.banner_updated', { entityType: 'Banner', entityId: banner.id });
  res.json({ banner });
});
bannersRouter.delete('/:id', validate({ params }), async (req, res) => {
  await prisma.banner.delete({ where: { id: req.valid.params.id } });
  await audit(req, 'admin.banner_deleted', { entityType: 'Banner', entityId: req.valid.params.id });
  res.status(204).end();
});

// ── Content pages ──────────────────────────────────────────────────
export const pagesRouter = Router();

const pageSchema = z.object({
  slug: z.string().trim().min(2).max(60).regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and dashes'),
  title: text(120, 2),
  body: text(50_000, 10),
  isPublished: z.boolean().default(true),
});

pagesRouter.get('/', async (_req, res) => {
  res.json({ items: await prisma.contentPage.findMany({ orderBy: { title: 'asc' } }) });
});
pagesRouter.post('/', validate({ body: pageSchema }), async (req, res) => {
  const page = await prisma.contentPage.create({ data: { ...req.valid.body, updatedById: req.user.id } });
  await audit(req, 'admin.page_created', { entityType: 'ContentPage', entityId: page.id, metadata: { slug: page.slug } });
  res.status(201).json({ page });
});
pagesRouter.patch('/:id', validate({ params, body: pageSchema.partial() }), async (req, res) => {
  const page = await prisma.contentPage.update({ where: { id: req.valid.params.id }, data: { ...req.valid.body, updatedById: req.user.id } });
  await audit(req, 'admin.page_updated', { entityType: 'ContentPage', entityId: page.id, metadata: { slug: page.slug } });
  res.json({ page });
});
pagesRouter.delete('/:id', validate({ params }), async (req, res) => {
  await prisma.contentPage.delete({ where: { id: req.valid.params.id } });
  await audit(req, 'admin.page_deleted', { entityType: 'ContentPage', entityId: req.valid.params.id });
  res.status(204).end();
});

// ── Announcements ──────────────────────────────────────────────────
export const announcementsRouter = Router();

const announcementSchema = z.object({
  title: text(120, 3),
  body: text(2000, 10),
  audience: z.enum(['ALL', 'BUYERS', 'SELLERS']).default('SELLERS'),
});

announcementsRouter.get('/', async (_req, res) => {
  res.json({ items: await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) });
});
announcementsRouter.post('/', validate({ body: announcementSchema }), async (req, res) => {
  const announcement = await prisma.announcement.create({ data: { ...req.valid.body, createdById: req.user.id } });
  await audit(req, 'admin.announcement_created', { entityType: 'Announcement', entityId: announcement.id });
  res.status(201).json({ announcement });
});
announcementsRouter.patch('/:id', validate({ params, body: announcementSchema.partial() }), async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.valid.params.id } });
  if (!existing) throw notFound('Announcement');
  if (existing.isPublished) throw conflict('Published announcements cannot be edited. Create a new one instead.');
  const announcement = await prisma.announcement.update({ where: { id: existing.id }, data: req.valid.body });
  res.json({ announcement });
});

/** Publishing sends an in-app notification to everyone in the audience. */
announcementsRouter.post('/:id/publish', validate({ params }), async (req, res) => {
  const { count } = await prisma.announcement.updateMany({
    where: { id: req.valid.params.id, isPublished: false },
    data: { isPublished: true, publishedAt: new Date() },
  });
  if (!count) throw conflict('This announcement is already published.');
  const announcement = await prisma.announcement.findUnique({ where: { id: req.valid.params.id } });
  const roles = { ALL: ['BUYER', 'SELLER'], BUYERS: ['BUYER'], SELLERS: ['SELLER'] }[announcement.audience];
  let cursor;
  let sent = 0;
  // Notify in batches so very large audiences do not load into memory at once.
  for (;;) {
    const users = await prisma.user.findMany({
      where: { role: { in: roles }, status: 'ACTIVE' },
      select: { id: true },
      take: 500,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (!users.length) break;
    await notify(
      users.map((u) => u.id),
      { type: 'announcement', title: announcement.title, body: announcement.body.slice(0, 300), link: roles.includes('SELLER') && roles.length === 1 ? '/seller' : '/account/notifications', email: false },
    );
    sent += users.length;
    cursor = users[users.length - 1].id;
  }
  await audit(req, 'admin.announcement_published', { entityType: 'Announcement', entityId: announcement.id, metadata: { audience: announcement.audience, recipients: sent } });
  res.json({ announcement, recipients: sent });
});

announcementsRouter.delete('/:id', validate({ params }), async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.valid.params.id } });
  await audit(req, 'admin.announcement_deleted', { entityType: 'Announcement', entityId: req.valid.params.id });
  res.status(204).end();
});
