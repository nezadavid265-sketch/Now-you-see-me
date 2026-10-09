import { Router } from 'express';
import { z } from 'zod';
import { id, imageUrl, money, optionalText, phone, text, email } from '../../lib/validators.js';
import { paginationSchema } from '../../lib/pagination.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { unprocessable } from '../../lib/errors.js';
import { loadSellerContext, requireShop, getOverview, saveProfile, createShop, updateShop, submitForReview } from './seller.shop.js';
import * as products from './seller.products.js';
import * as orders from './seller.orders.js';
import * as insights from './seller.insights.js';

const router = Router();
router.use(authenticate, requireRole('SELLER'), loadSellerContext);
const params = z.object({ id });

// ── Onboarding, profile & shop ──────────────────────────────────────

const profileSchema = z.object({
  businessName: text(120, 2),
  businessType: z.enum(['INDIVIDUAL', 'COMPANY', 'COOPERATIVE']).default('INDIVIDUAL'),
  registrationNumber: optionalText(40),
  businessAddress: text(200, 5),
  businessPhone: phone,
  businessEmail: email.optional().nullable(),
  payoutMethod: z.enum(['MTN_MOMO', 'AIRTEL_MONEY', 'BANK_TRANSFER']),
  payoutAccountName: optionalText(100),
  payoutAccountNumber: optionalText(40),
});

const shopSchema = z.object({
  name: text(60, 3),
  description: optionalText(2000),
  logoUrl: imageUrl.optional().nullable(),
  bannerUrl: imageUrl.optional().nullable(),
  email: email.optional().nullable(),
  phone: phone.optional().nullable(),
  city: optionalText(60),
  address: optionalText(200),
});

const availabilitySchema = z.object({
  isOpen: z.boolean().optional(),
  vacationMode: z.boolean().optional(),
  vacationMessage: optionalText(200),
});

router.get('/overview', async (req, res) => res.json(await getOverview(req)));
router.put('/profile', validate({ body: profileSchema }), async (req, res) => res.json({ profile: await saveProfile(req, req.valid.body) }));
router.post('/shop', validate({ body: shopSchema }), async (req, res) => res.status(201).json({ shop: await createShop(req, req.valid.body) }));
// Shop name changes keep the existing URL slug so links do not break.
router.patch('/shop', requireShop, validate({ body: shopSchema.partial() }), async (req, res) => res.json({ shop: await updateShop(req, req.valid.body) }));
router.patch('/shop/availability', requireShop, validate({ body: availabilitySchema }), async (req, res) => {
  res.json({ shop: await updateShop(req, req.valid.body) });
});
router.post('/submit', async (req, res) => res.json({ profile: await submitForReview(req) }));
router.get('/dashboard', async (req, res) => res.json(await insights.dashboard(req)));

// ── Products & inventory ───────────────────────────────────────────

const specification = z.object({ name: text(60, 1), value: text(200, 1) });
const productBase = z.object({
  name: text(150, 3),
  description: text(5000, 20),
  categoryId: id,
  brand: optionalText(60),
  sku: optionalText(60),
  price: money.refine((v) => v >= 1, 'Enter a price'),
  compareAtPrice: money.optional().nullable(),
  stock: z.coerce.number().int().min(0).max(1_000_000),
  lowStockThreshold: z.coerce.number().int().min(0).max(10_000).default(5),
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).default('DRAFT'),
  specifications: z.array(specification).max(30).default([]),
  tags: z.array(z.string().trim().toLowerCase().min(1).max(30)).max(15).default([]),
  images: z.array(z.object({ url: imageUrl, alt: optionalText(150) })).max(8).default([]),
});
const createProductSchema = productBase.refine((p) => !p.compareAtPrice || p.compareAtPrice > p.price, {
  message: 'The original price must be higher than the selling price',
  path: ['compareAtPrice'],
});
const updateProductSchema = productBase.partial();

router.get(
  '/products',
  requireShop,
  validate({
    query: z.object({
      q: z.string().trim().max(100).optional(),
      status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
      stock: z.enum(['low', 'out']).optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => res.json(await products.listProducts(req.shop, req.valid.query)),
);
router.post('/products', requireShop, validate({ body: createProductSchema }), async (req, res) => {
  res.status(201).json({ product: await products.createProduct(req, req.valid.body) });
});
router.get('/products/:id', requireShop, validate({ params }), async (req, res) => {
  res.json({ product: await products.getProduct(req.shop, req.valid.params.id) });
});
router.patch('/products/:id', requireShop, validate({ params, body: updateProductSchema }), async (req, res) => {
  res.json({ product: await products.updateProduct(req, req.valid.params.id, req.valid.body) });
});
router.delete('/products/:id', requireShop, validate({ params }), async (req, res) => {
  await products.deleteProduct(req, req.valid.params.id);
  res.status(204).end();
});
router.put(
  '/products/:id/stock',
  requireShop,
  validate({ params, body: z.object({ quantity: z.coerce.number().int().min(0).max(1_000_000), note: optionalText(200) }) }),
  async (req, res) => res.json({ product: await products.updateStock(req, req.valid.params.id, req.valid.body) }),
);
router.get(
  '/inventory/movements',
  requireShop,
  validate({ query: z.object({ productId: id.optional(), ...paginationSchema }) }),
  async (req, res) => res.json(await products.listMovements(req.shop, req.valid.query)),
);

// ── Orders ─────────────────────────────────────────────────────────

router.get(
  '/orders',
  requireShop,
  validate({
    query: z.object({
      tab: z.enum(['all', 'new', 'in_progress', 'shipped', 'completed', 'cancelled']).default('all'),
      q: z.string().trim().max(100).optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => res.json(await orders.listOrders(req.shop, req.valid.query)),
);
router.get('/orders/:id', requireShop, validate({ params }), async (req, res) => {
  res.json({ order: await orders.getOrder(req.shop, req.valid.params.id) });
});
router.post(
  '/orders/:id/status',
  requireShop,
  validate({
    params,
    body: z.object({
      status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED']),
      note: optionalText(300),
      reason: optionalText(300),
      deliveryCode: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code').optional(),
      courierName: optionalText(80),
      trackingNumber: optionalText(80),
    }),
  }),
  async (req, res) => {
    if (req.shop.status === 'SUSPENDED') throw unprocessable('Your shop is suspended. Contact support.');
    res.json({ order: await orders.updateOrderStatus(req, req.valid.params.id, req.valid.body) });
  },
);

// ── Insights, money, reviews, refunds ──────────────────────────────

router.get(
  '/analytics',
  requireShop,
  validate({ query: z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90, 365].includes(d)).default(30) }) }),
  async (req, res) => res.json(await insights.analytics(req.shop, req.valid.query)),
);
router.get('/finance', requireShop, validate({ query: z.object(paginationSchema) }), async (req, res) => {
  res.json(await insights.finance(req, req.valid.query));
});
router.get(
  '/reviews',
  requireShop,
  validate({ query: z.object({ rating: z.coerce.number().int().min(1).max(5).optional(), ...paginationSchema }) }),
  async (req, res) => res.json(await insights.listReviews(req.shop, req.valid.query)),
);
router.post('/reviews/:id/reply', requireShop, validate({ params, body: z.object({ reply: text(1000, 2) }) }), async (req, res) => {
  res.json({ review: await insights.replyToReview(req.shop, req.valid.params.id, req.valid.body.reply) });
});
router.get('/refunds', requireShop, async (req, res) => res.json({ items: await insights.listRefunds(req.shop) }));
router.post('/refunds/:id/respond', requireShop, validate({ params, body: z.object({ response: text(1000, 2) }) }), async (req, res) => {
  res.json({ refund: await insights.respondToRefund(req.shop, req.valid.params.id, req.valid.body.response) });
});

export default router;
