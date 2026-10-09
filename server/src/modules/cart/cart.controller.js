import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable } from '../../lib/errors.js';
import { getSettings } from '../../services/settings.js';
import { buildQuote, PRICING_INCLUDE } from '../../domain/pricing.js';
import { quoteCart } from '../../domain/checkout.js';
import { enabledMethods } from '../../integrations/payments/index.js';
import { PUBLIC_PRODUCT_WHERE } from '../catalog/catalog.service.js';

const MAX_LINES = 50;
const MAX_QTY = 99;

async function visibleProduct(productId) {
  const product = await prisma.product.findFirst({ where: { id: productId, ...PUBLIC_PRODUCT_WHERE }, include: PRICING_INCLUDE });
  if (!product) throw notFound('Product');
  return product;
}

function clampQuantity(product, quantity) {
  if (product.stock <= 0) throw unprocessable('This product is out of stock.', undefined, { code: 'OUT_OF_STOCK' });
  if (!product.shop.isOpen || product.shop.vacationMode) {
    throw unprocessable(`${product.shop.name} is temporarily closed and not accepting orders.`, undefined, { code: 'SHOP_CLOSED' });
  }
  return Math.min(quantity, product.stock, MAX_QTY);
}

export const cartController = {
  async get(req, res) {
    res.json(await quoteCart(req.user.id, { couponCode: req.valid.query.coupon }));
  },

  async addItem(req, res) {
    const { productId, quantity } = req.valid.body;
    const product = await visibleProduct(productId);
    const existing = await prisma.cartItem.findUnique({ where: { userId_productId: { userId: req.user.id, productId } } });
    if (!existing) {
      const lines = await prisma.cartItem.count({ where: { userId: req.user.id } });
      if (lines >= MAX_LINES) throw unprocessable(`Your cart can hold up to ${MAX_LINES} different products.`);
    }
    const desired = clampQuantity(product, (existing?.quantity ?? 0) + quantity);
    await prisma.cartItem.upsert({
      where: { userId_productId: { userId: req.user.id, productId } },
      create: { userId: req.user.id, productId, quantity: desired },
      update: { quantity: desired },
    });
    res.status(201).json(await quoteCart(req.user.id));
  },

  async updateItem(req, res) {
    const { productId } = req.valid.params;
    const item = await prisma.cartItem.findUnique({ where: { userId_productId: { userId: req.user.id, productId } } });
    if (!item) throw notFound('Cart item');
    const product = await visibleProduct(productId);
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: clampQuantity(product, req.valid.body.quantity) } });
    res.json(await quoteCart(req.user.id));
  },

  async removeItem(req, res) {
    await prisma.cartItem.deleteMany({ where: { userId: req.user.id, productId: req.valid.params.productId } });
    res.json(await quoteCart(req.user.id));
  },

  async clear(req, res) {
    await prisma.cartItem.deleteMany({ where: { userId: req.user.id } });
    res.json(await quoteCart(req.user.id));
  },

  /** Merges a guest (browser) cart into the account cart after sign-in. */
  async merge(req, res) {
    const items = req.valid.body.items;
    const products = await prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) }, ...PUBLIC_PRODUCT_WHERE, stock: { gt: 0 } },
      select: { id: true, stock: true },
    });
    const stock = new Map(products.map((p) => [p.id, p.stock]));
    const existing = await prisma.cartItem.findMany({ where: { userId: req.user.id } });
    const current = new Map(existing.map((e) => [e.productId, e.quantity]));
    for (const { productId, quantity } of items) {
      if (!stock.has(productId)) continue;
      if (!current.has(productId) && current.size >= MAX_LINES) break;
      const qty = Math.min(Math.max(current.get(productId) ?? 0, quantity), stock.get(productId), MAX_QTY);
      await prisma.cartItem.upsert({
        where: { userId_productId: { userId: req.user.id, productId } },
        create: { userId: req.user.id, productId, quantity: qty },
        update: { quantity: qty },
      });
      current.set(productId, qty);
    }
    res.json(await quoteCart(req.user.id));
  },

  /** Prices a guest cart without saving it (used before sign-in). */
  async preview(req, res) {
    const settings = await getSettings();
    const items = req.valid.body.items;
    const products = await prisma.product.findMany({
      where: { id: { in: items.map((i) => i.productId) }, deletedAt: null },
      include: PRICING_INCLUDE,
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    const lines = items.filter((i) => byId.has(i.productId)).map((i) => ({ product: byId.get(i.productId), quantity: i.quantity }));
    const quote = await buildQuote(prisma, { lines, settings });
    res.json({ ...quote, paymentMethods: enabledMethods(settings) });
  },
};
