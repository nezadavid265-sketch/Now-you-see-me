import { Router } from 'express';
import { z } from 'zod';
import { config } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';
import { paginationSchema } from '../../lib/pagination.js';
import { optionalAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { getSettings } from '../../services/settings.js';
import { enabledMethods } from '../../integrations/payments/index.js';
import * as catalog from './catalog.service.js';

const router = Router();

const slugParam = z.object({ slug: z.string().trim().min(1).max(120) });
const csv = z
  .string()
  .max(500)
  .optional()
  .transform((v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 20) : undefined));
const flag = z
  .enum(['true', 'false', '1', '0'])
  .optional()
  .transform((v) => v === 'true' || v === '1');

const searchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(120).optional(),
  shop: z.string().trim().max(120).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  rating: z.coerce.number().min(1).max(5).optional(),
  brands: csv,
  inStock: flag,
  onSale: flag,
  sort: z.enum(['relevance', 'popular', 'newest', 'price_asc', 'price_desc', 'rating']).default('relevance'),
  ...paginationSchema,
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

/** Public runtime configuration for the web app (no secrets). */
router.get('/config', async (_req, res) => {
  const s = await getSettings();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({
    marketplaceName: s.marketplaceName,
    currency: s.currency,
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
    deliveryFeeBase: s.deliveryFeeBase,
    freeDeliveryThreshold: s.freeDeliveryThreshold,
    refundWindowDays: s.refundWindowDays,
    announcementBar: s.announcementBar,
    paymentMethods: enabledMethods(s),
    paymentTestMode: config.PAYMENT_TEST_MODE,
    googleMapsKey: config.GOOGLE_MAPS_BROWSER_KEY ?? null,
  });
});

router.get('/home', async (_req, res) => {
  res.json(await catalog.getHome());
});

router.get(
  '/home/recommended',
  optionalAuth,
  validate({ query: z.object({ viewed: csv }) }),
  async (req, res) => {
    res.json({ items: await catalog.getRecommendations(req.user?.role === 'BUYER' ? req.user.id : null, req.valid.query.viewed ?? []) });
  },
);

router.get('/categories', async (_req, res) => {
  const tree = await catalog.getCategoryTree();
  res.json({ items: tree.roots });
});

router.get('/products', validate({ query: searchSchema }), async (req, res) => {
  res.json(await catalog.searchProducts(req.valid.query));
});

router.get('/products/suggest', validate({ query: z.object({ q: z.string().max(100).default('') }) }), async (req, res) => {
  res.json(await catalog.suggest(req.valid.query.q));
});

router.get('/products/:slug', validate({ params: slugParam }), async (req, res) => {
  res.json({ product: await catalog.getProductDetail(req.valid.params.slug) });
});

router.get(
  '/products/:slug/reviews',
  validate({
    params: slugParam,
    query: z.object({ ...paginationSchema, pageSize: z.coerce.number().int().min(1).max(50).default(10), sort: z.enum(['newest', 'highest', 'lowest']).default('newest') }),
  }),
  async (req, res) => {
    res.json(await catalog.getProductReviews(req.valid.params.slug, req.valid.query));
  },
);

router.get('/products/:slug/related', validate({ params: slugParam }), async (req, res) => {
  res.json({ items: await catalog.getRelatedProducts(req.valid.params.slug) });
});

router.get('/shops/:slug', validate({ params: slugParam }), async (req, res) => {
  res.json({ shop: await catalog.getShop(req.valid.params.slug) });
});

router.get('/content/:slug', validate({ params: slugParam }), async (req, res) => {
  const page = await prisma.contentPage.findFirst({
    where: { slug: req.valid.params.slug, isPublished: true },
    select: { slug: true, title: true, body: true, updatedAt: true },
  });
  if (!page) throw notFound('Page');
  res.json({ page });
});

router.get('/content', async (_req, res) => {
  const pages = await prisma.contentPage.findMany({ where: { isPublished: true }, select: { slug: true, title: true }, orderBy: { title: 'asc' } });
  res.json({ items: pages });
});

export default router;
