import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound } from '../../lib/errors.js';
import { boolish, id, imageUrl, optionalText, text } from '../../lib/validators.js';
import { pageResult, paginate, paginationSchema } from '../../lib/pagination.js';
import { slugify } from '../../lib/slug.js';
import { validate } from '../../middleware/validate.js';
import { audit } from '../../services/audit.js';
import { notifyShopOwner } from '../../services/notifications.js';
import { setReviewHidden } from '../../domain/reviews.js';
import { invalidateCategoryCache } from '../catalog/catalog.service.js';

const params = z.object({ id });

// ── Products ───────────────────────────────────────────────────────
export const productsRouter = Router();

productsRouter.get(
  '/',
  validate({
    query: z.object({
      q: z.string().trim().max(100).optional(),
      moderation: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'REMOVED']).optional(),
      status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
      shopId: id.optional(),
      featured: z.enum(['true', 'false']).optional(),
      ...paginationSchema,
    }),
  }),
  async (req, res) => {
    const { q, moderation, status, shopId, featured, page, pageSize } = req.valid.query;
    const where = {
      deletedAt: null,
      ...(moderation ? { moderationStatus: moderation } : {}),
      ...(status ? { status } : {}),
      ...(shopId ? { shopId } : {}),
      ...(featured ? { isFeatured: featured === 'true' } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { brand: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.product.count({ where }),
      prisma.product.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        ...paginate({ page, pageSize }),
        select: {
          id: true, name: true, slug: true, price: true, compareAtPrice: true, stock: true, status: true,
          moderationStatus: true, moderationNote: true, isFeatured: true, soldCount: true, ratingAvg: true, updatedAt: true,
          shop: { select: { id: true, name: true, slug: true } },
          category: { select: { name: true } },
          images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
        },
      }),
    ]);
    res.json(pageResult(items.map((p) => ({ ...p, image: p.images[0]?.url ?? null })), total, { page, pageSize }));
  },
);

productsRouter.get('/:id', validate({ params }), async (req, res) => {
  const product = await prisma.product.findUnique({
    where: { id: req.valid.params.id },
    include: { images: { orderBy: { sortOrder: 'asc' } }, shop: { select: { id: true, name: true, slug: true } }, category: { select: { name: true } } },
  });
  if (!product) throw notFound('Product');
  res.json({ product });
});

productsRouter.patch(
  '/:id/moderation',
  validate({ params, body: z.object({ moderationStatus: z.enum(['APPROVED', 'REJECTED', 'REMOVED']), note: optionalText(500) }) }),
  async (req, res) => {
    const { moderationStatus, note } = req.valid.body;
    const product = await prisma.product.update({
      where: { id: req.valid.params.id },
      data: { moderationStatus, moderationNote: note, ...(moderationStatus !== 'APPROVED' ? { isFeatured: false } : {}) },
    });
    if (moderationStatus !== 'APPROVED') await prisma.cartItem.deleteMany({ where: { productId: product.id } });
    await audit(req, 'admin.product_moderated', { entityType: 'Product', entityId: product.id, metadata: { moderationStatus, note } });
    const messages = {
      APPROVED: `${product.name} was approved and is visible to buyers.`,
      REJECTED: `${product.name} needs changes before it can be listed.${note ? ` Reason: ${note}` : ''}`,
      REMOVED: `${product.name} was removed from Rivoshoppa.${note ? ` Reason: ${note}` : ''}`,
    };
    await notifyShopOwner(product.shopId, {
      type: 'product.moderated',
      title: moderationStatus === 'APPROVED' ? 'Product approved' : 'Action needed on a product',
      body: messages[moderationStatus],
      link: `/seller/products/${product.id}`,
    });
    res.json({ product });
  },
);

productsRouter.patch('/:id/featured', validate({ params, body: z.object({ isFeatured: z.boolean() }) }), async (req, res) => {
  const existing = await prisma.product.findUnique({ where: { id: req.valid.params.id } });
  if (!existing) throw notFound('Product');
  if (req.valid.body.isFeatured && existing.moderationStatus !== 'APPROVED') throw conflict('Only approved products can be featured.');
  const product = await prisma.product.update({ where: { id: existing.id }, data: { isFeatured: req.valid.body.isFeatured } });
  await audit(req, 'admin.product_featured', { entityType: 'Product', entityId: product.id, metadata: { isFeatured: product.isFeatured } });
  res.json({ product });
});

// ── Categories ─────────────────────────────────────────────────────
export const categoriesRouter = Router();

const categorySchema = z.object({
  name: text(60, 2),
  slug: z
    .string()
    .trim()
    .max(80)
    .regex(/^[a-z0-9-]*$/, 'Use lowercase letters, numbers and dashes')
    .optional(),
  description: optionalText(300),
  icon: optionalText(40),
  imageUrl: imageUrl.optional().nullable(),
  parentId: id.optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  isActive: z.boolean().default(true),
  commissionRateBps: z.number().int().min(0).max(5000).nullable().optional(),
});

categoriesRouter.get('/', async (_req, res) => {
  const items = await prisma.category.findMany({
    orderBy: [{ parentId: { sort: 'asc', nulls: 'first' } }, { sortOrder: 'asc' }, { name: 'asc' }],
    include: { parent: { select: { name: true } }, _count: { select: { products: { where: { deletedAt: null } }, children: true } } },
  });
  res.json({ items });
});

async function assertParent(parentId, selfId) {
  if (!parentId) return;
  if (parentId === selfId) throw conflict('A category cannot be its own parent.');
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) throw notFound('Parent category');
  if (parent.parentId) throw conflict('Categories support two levels: choose a top-level category as parent.');
}

categoriesRouter.post('/', validate({ body: categorySchema }), async (req, res) => {
  const data = req.valid.body;
  await assertParent(data.parentId);
  const category = await prisma.category.create({ data: { ...data, slug: data.slug || slugify(data.name) } });
  invalidateCategoryCache();
  await audit(req, 'admin.category_created', { entityType: 'Category', entityId: category.id, metadata: { name: category.name } });
  res.status(201).json({ category });
});

categoriesRouter.patch('/:id', validate({ params, body: categorySchema.partial() }), async (req, res) => {
  const data = req.valid.body;
  if (data.parentId !== undefined) {
    await assertParent(data.parentId, req.valid.params.id);
    if (data.parentId) {
      const children = await prisma.category.count({ where: { parentId: req.valid.params.id } });
      if (children) throw conflict('This category has sub-categories, so it must stay at the top level.');
    }
  }
  const category = await prisma.category.update({ where: { id: req.valid.params.id }, data });
  invalidateCategoryCache();
  await audit(req, 'admin.category_updated', { entityType: 'Category', entityId: category.id, metadata: data });
  res.json({ category });
});

categoriesRouter.delete('/:id', validate({ params }), async (req, res) => {
  const [products, children] = await Promise.all([
    prisma.product.count({ where: { categoryId: req.valid.params.id } }),
    prisma.category.count({ where: { parentId: req.valid.params.id } }),
  ]);
  if (products || children) throw conflict('Move or remove its products and sub-categories first, or deactivate the category instead.');
  await prisma.category.delete({ where: { id: req.valid.params.id } });
  invalidateCategoryCache();
  await audit(req, 'admin.category_deleted', { entityType: 'Category', entityId: req.valid.params.id });
  res.status(204).end();
});

// ── Reviews ────────────────────────────────────────────────────────
export const reviewsRouter = Router();

reviewsRouter.get(
  '/',
  validate({ query: z.object({ rating: z.coerce.number().int().min(1).max(5).optional(), hidden: boolish.optional(), q: z.string().trim().max(100).optional(), ...paginationSchema }) }),
  async (req, res) => {
    const { rating, hidden, q, page, pageSize } = req.valid.query;
    const where = {
      ...(rating ? { rating } : {}),
      ...(hidden !== undefined ? { isHidden: hidden } : {}),
      ...(q ? { OR: [{ body: { contains: q, mode: 'insensitive' } }, { product: { name: { contains: q, mode: 'insensitive' } } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.review.count({ where }),
      prisma.review.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        ...paginate({ page, pageSize }),
        include: { product: { select: { name: true, slug: true, shop: { select: { name: true } } } }, user: { select: { name: true, email: true } } },
      }),
    ]);
    res.json(pageResult(items, total, { page, pageSize }));
  },
);

reviewsRouter.patch('/:id', validate({ params, body: z.object({ isHidden: z.boolean() }) }), async (req, res) => {
  const review = await setReviewHidden(req.valid.params.id, req.valid.body.isHidden);
  await audit(req, review.isHidden ? 'admin.review_hidden' : 'admin.review_restored', { entityType: 'Review', entityId: review.id });
  res.json({ review });
});
