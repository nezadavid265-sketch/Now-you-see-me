import { prisma } from '../lib/prisma.js';
import { conflict } from '../lib/errors.js';
import { notifyShopOwner } from '../services/notifications.js';

/**
 * Changes stock atomically and records an inventory movement. Decrements use
 * a conditional update (`stock >= qty`) so concurrent orders can never
 * oversell, even without explicit row locks.
 */
export async function changeStock(tx, { productId, change, reason, note, actorId, referenceId, productName }) {
  if (change < 0) {
    const { count } = await tx.product.updateMany({
      where: { id: productId, stock: { gte: -change } },
      data: { stock: { increment: change } },
    });
    if (count === 0) {
      throw conflict(`${productName ?? 'A product in your order'} no longer has enough stock.`, { code: 'INSUFFICIENT_STOCK' });
    }
  } else if (change > 0) {
    await tx.product.update({ where: { id: productId }, data: { stock: { increment: change } } });
  }
  const product = await tx.product.findUnique({
    where: { id: productId },
    select: { id: true, name: true, stock: true, lowStockThreshold: true, shopId: true },
  });
  await tx.inventoryMovement.create({
    data: { productId, change, quantityAfter: product.stock, reason, note, actorId, referenceId },
  });
  return { ...product, previousStock: product.stock - change };
}

/** Sends a low-stock alert when a product crosses its threshold. Call after commit. */
export async function alertLowStock(products) {
  for (const p of products) {
    if (p.previousStock > p.lowStockThreshold && p.stock <= p.lowStockThreshold) {
      await notifyShopOwner(p.shopId, {
        type: 'inventory.low_stock',
        title: p.stock === 0 ? `Out of stock: ${p.name}` : `Low stock: ${p.name}`,
        body:
          p.stock === 0
            ? `${p.name} has sold out and is no longer purchasable. Restock it to keep selling.`
            : `Only ${p.stock} left of ${p.name}. Consider restocking soon.`,
        link: '/seller/inventory',
      });
    }
  }
}

export async function setStock({ productId, quantity, note, actorId, reason = 'ADJUSTMENT' }) {
  const result = await prisma.$transaction(async (tx) => {
    // Lock the row so an order placed concurrently cannot be lost in the arithmetic.
    const [current] = await tx.$queryRaw`SELECT stock FROM "Product" WHERE id = ${productId} FOR UPDATE`;
    return changeStock(tx, { productId, change: quantity - current.stock, reason, note, actorId });
  });
  await alertLowStock([result]);
  return result;
}
