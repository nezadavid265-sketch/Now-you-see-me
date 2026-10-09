import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma.js';
import { conflict, notFound, unprocessable } from '../../lib/errors.js';
import { id, optionalText, text } from '../../lib/validators.js';
import { authenticate, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { refreshRatings } from '../../domain/reviews.js';
import { notifyShopOwner } from '../../services/notifications.js';

const router = Router();
router.use(authenticate, requireRole('BUYER'));

const reviewBody = z.object({
  rating: z.coerce.number().int().min(1, 'Choose a rating').max(5),
  title: optionalText(120),
  body: text(2000, 10).refine((v) => v.length >= 10, 'Tell other shoppers a bit more (at least 10 characters)'),
});

/** Only verified purchases can be reviewed: the buyer must own a delivered order item. */
router.post('/', validate({ body: reviewBody.extend({ orderItemId: id }) }), async (req, res) => {
  const { orderItemId, rating, title, body } = req.valid.body;
  const item = await prisma.orderItem.findFirst({
    where: { id: orderItemId, sellerOrder: { order: { buyerId: req.user.id } } },
    include: { sellerOrder: { select: { status: true, shopId: true } }, review: true },
  });
  if (!item) throw notFound('Order item');
  if (!['DELIVERED', 'REFUNDED'].includes(item.sellerOrder.status)) {
    throw unprocessable('You can review this product once it has been delivered.');
  }
  if (item.review) throw conflict('You have already reviewed this purchase.');
  const already = await prisma.review.findUnique({ where: { productId_userId: { productId: item.productId, userId: req.user.id } } });
  if (already) throw conflict('You have already reviewed this product.');

  const review = await prisma.$transaction(async (tx) => {
    const created = await tx.review.create({
      data: { productId: item.productId, userId: req.user.id, orderItemId, rating, title, body },
    });
    await refreshRatings(tx, item.productId);
    return created;
  });
  await notifyShopOwner(item.sellerOrder.shopId, {
    type: 'review.new',
    title: `New ${rating}-star review`,
    body: `A customer reviewed ${item.productName}.`,
    link: '/seller/reviews',
    email: false,
  });
  res.status(201).json({ review });
});

router.patch('/:id', validate({ params: z.object({ id }), body: reviewBody.partial() }), async (req, res) => {
  const existing = await prisma.review.findFirst({ where: { id: req.valid.params.id, userId: req.user.id } });
  if (!existing) throw notFound('Review');
  const review = await prisma.$transaction(async (tx) => {
    const updated = await tx.review.update({ where: { id: existing.id }, data: req.valid.body });
    await refreshRatings(tx, existing.productId);
    return updated;
  });
  res.json({ review });
});

router.get('/mine', async (req, res) => {
  const items = await prisma.review.findMany({
    where: { userId: req.user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { product: { select: { name: true, slug: true } } },
  });
  res.json({ items });
});

export default router;
