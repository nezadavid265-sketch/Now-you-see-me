import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { id } from '../../lib/validators.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { CARD_SELECT, PUBLIC_PRODUCT_WHERE, toCard } from '../catalog/catalog.service.js';

const router = Router();
router.use(authenticate, requireRole('BUYER'));

router.get('/', async (req, res) => {
  const rows = await prisma.wishlistItem.findMany({
    where: { userId: req.user.id, product: { deletedAt: null } },
    include: { product: { select: { ...CARD_SELECT, status: true, moderationStatus: true } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({
    items: rows.map((r) => ({
      addedAt: r.createdAt,
      product: { ...toCard(r.product), available: r.product.status === 'PUBLISHED' && r.product.moderationStatus === 'APPROVED' },
    })),
  });
});

router.get('/ids', async (req, res) => {
  const rows = await prisma.wishlistItem.findMany({ where: { userId: req.user.id }, select: { productId: true } });
  res.json({ ids: rows.map((r) => r.productId) });
});

router.post('/', validate({ body: z.object({ productId: id }) }), async (req, res) => {
  const product = await prisma.product.findFirst({ where: { id: req.valid.body.productId, ...PUBLIC_PRODUCT_WHERE }, select: { id: true } });
  if (!product) throw notFound('Product');
  const count = await prisma.wishlistItem.count({ where: { userId: req.user.id } });
  if (count >= 200) throw unprocessable('Your wishlist is full (200 items).');
  await prisma.wishlistItem.upsert({
    where: { userId_productId: { userId: req.user.id, productId: product.id } },
    create: { userId: req.user.id, productId: product.id },
    update: {},
  });
  res.status(201).json({ ok: true });
});

router.delete('/:productId', validate({ params: z.object({ productId: id }) }), async (req, res) => {
  await prisma.wishlistItem.deleteMany({ where: { userId: req.user.id, productId: req.valid.params.productId } });
  res.status(204).end();
});

export default router;
