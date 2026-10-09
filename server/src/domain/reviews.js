import { prisma } from '../lib/prisma.js';

/** Recomputes cached rating aggregates for a product and its shop. */
export async function refreshRatings(tx, productId) {
  const product = await tx.product.findUnique({ where: { id: productId }, select: { shopId: true } });
  const productAgg = await tx.review.aggregate({
    where: { productId, isHidden: false },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.product.update({
    where: { id: productId },
    data: { ratingAvg: productAgg._avg.rating ?? 0, ratingCount: productAgg._count._all },
  });
  const shopAgg = await tx.review.aggregate({
    where: { isHidden: false, product: { shopId: product.shopId } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  await tx.shop.update({
    where: { id: product.shopId },
    data: { ratingAvg: shopAgg._avg.rating ?? 0, ratingCount: shopAgg._count._all },
  });
}

export async function setReviewHidden(reviewId, isHidden) {
  return prisma.$transaction(async (tx) => {
    const review = await tx.review.update({ where: { id: reviewId }, data: { isHidden } });
    await refreshRatings(tx, review.productId);
    return review;
  });
}
