import { prisma } from '../../lib/prisma.js';
import { notFound, unprocessable, forbidden } from '../../lib/errors.js';
import { pageResult, paginate } from '../../lib/pagination.js';
import { uniqueSlug } from '../../lib/slug.js';
import { audit } from '../../services/audit.js';
import { getSettings } from '../../services/settings.js';
import { removeStoredFile } from '../../services/storage.js';
import { notifyAdmins } from '../../services/notifications.js';
import { changeStock, alertLowStock, setStock } from '../../domain/inventory.js';

const LIST_SELECT = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  price: true,
  compareAtPrice: true,
  stock: true,
  lowStockThreshold: true,
  status: true,
  moderationStatus: true,
  moderationNote: true,
  soldCount: true,
  ratingAvg: true,
  ratingCount: true,
  updatedAt: true,
  category: { select: { name: true } },
  images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
};

/** Always scoped by shopId — a seller can only ever load their own products. */
async function ownProduct(shopId, productId, include) {
  const product = await prisma.product.findFirst({ where: { id: productId, shopId, deletedAt: null }, include });
  if (!product) throw notFound('Product');
  return product;
}

export async function listProducts(shop, { q, status, stock, page, pageSize }) {
  const where = {
    shopId: shop.id,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }] } : {}),
  };
  if (stock === 'low') {
    // Column-to-column comparison (stock <= threshold) needs raw SQL for the id list.
    const low = await prisma.$queryRaw`SELECT id FROM "Product" WHERE "shopId" = ${shop.id} AND "deletedAt" IS NULL AND stock <= "lowStockThreshold"`;
    where.id = { in: low.map((r) => r.id) };
  } else if (stock === 'out') {
    where.stock = 0;
  }
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, select: LIST_SELECT, orderBy: { updatedAt: 'desc' }, ...paginate({ page, pageSize }) }),
  ]);
  const items = rows.map((p) => ({
    ...p,
    image: p.images[0]?.url ?? null,
    category: p.category.name,
    lowStock: p.stock <= p.lowStockThreshold,
  }));
  return pageResult(items, total, { page, pageSize });
}

export async function getProduct(shop, productId) {
  const product = await ownProduct(shop.id, productId, { images: { orderBy: { sortOrder: 'asc' } }, category: { select: { id: true, name: true } } });
  return product;
}

async function assertCategory(categoryId) {
  const category = await prisma.category.findFirst({ where: { id: categoryId, isActive: true } });
  if (!category) throw unprocessable('Choose a valid category.', { fieldErrors: { categoryId: 'Invalid category' } });
}

function assertPublishable(shop, data, imageCount) {
  if (data.status !== 'PUBLISHED') return;
  if (shop.status !== 'ACTIVE') {
    throw unprocessable('Your shop must be approved before products can go live. You can save this product as a draft for now.', undefined, {
      code: 'SHOP_NOT_ACTIVE',
    });
  }
  if (imageCount < 1) throw unprocessable('Add at least one photo before publishing.', { fieldErrors: { images: 'At least one photo is required' } });
}

export async function createProduct(req, data) {
  const shop = req.shop;
  const settings = await getSettings();
  await assertCategory(data.categoryId);
  assertPublishable(shop, data, data.images.length);
  const { images, stock, ...fields } = data;
  const needsReview = settings.requireProductApproval;

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        ...fields,
        shopId: shop.id,
        slug: uniqueSlug(fields.name),
        stock: 0,
        moderationStatus: needsReview ? 'PENDING' : 'APPROVED',
        publishedAt: fields.status === 'PUBLISHED' ? new Date() : null,
        images: { create: images.map((img, i) => ({ url: img.url, alt: img.alt ?? fields.name, sortOrder: i })) },
      },
    });
    if (stock > 0) await changeStock(tx, { productId: created.id, change: stock, reason: 'INITIAL', actorId: req.user.id, note: 'Initial stock' });
    return created;
  });
  await audit(req, 'seller.product_created', { entityType: 'Product', entityId: product.id });
  if (needsReview && data.status === 'PUBLISHED') {
    await notifyAdmins('catalog', {
      type: 'product.review',
      title: 'Product waiting for approval',
      body: `${shop.name}: ${product.name}`,
      link: '/admin/products?moderation=PENDING',
    });
  }
  return getProduct(shop, product.id);
}

export async function updateProduct(req, productId, data) {
  const shop = req.shop;
  const existing = await ownProduct(shop.id, productId, { images: true });
  if (existing.moderationStatus === 'REMOVED') {
    throw forbidden(`This product was removed by Rivoshoppa${existing.moderationNote ? `: ${existing.moderationNote}` : ''}. Contact support if you believe this is a mistake.`);
  }
  if (data.categoryId) await assertCategory(data.categoryId);
  const merged = { ...existing, ...data };
  if (merged.compareAtPrice !== null && merged.compareAtPrice !== undefined && merged.compareAtPrice <= merged.price) {
    throw unprocessable('The original price must be higher than the selling price.', { fieldErrors: { compareAtPrice: 'Must be higher than the price' } });
  }
  const imageCount = data.images ? data.images.length : existing.images.length;
  assertPublishable(shop, { status: merged.status }, imageCount);

  const settings = await getSettings();
  const { images, stock, ...fields } = data;
  const goingLive = fields.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
  if (goingLive) fields.publishedAt = existing.publishedAt ?? new Date();
  // Rejected products (or any edit when approval is required for new listings) go back to review.
  if (existing.moderationStatus === 'REJECTED' || (settings.requireProductApproval && existing.moderationStatus === 'PENDING')) {
    fields.moderationStatus = 'PENDING';
    fields.moderationNote = null;
  }

  const removedUrls = [];
  const result = await prisma.$transaction(async (tx) => {
    if (images) {
      const keep = new Set(images.map((i) => i.url));
      removedUrls.push(...existing.images.filter((i) => !keep.has(i.url)).map((i) => i.url));
      await tx.productImage.deleteMany({ where: { productId } });
      await tx.productImage.createMany({
        data: images.map((img, i) => ({ productId, url: img.url, alt: img.alt ?? merged.name, sortOrder: i })),
      });
    }
    await tx.product.update({ where: { id: productId }, data: fields });
    if (stock !== undefined && stock !== existing.stock) {
      const [row] = await tx.$queryRaw`SELECT stock FROM "Product" WHERE id = ${productId} FOR UPDATE`;
      return changeStock(tx, { productId, change: stock - row.stock, reason: 'ADJUSTMENT', actorId: req.user.id, note: 'Updated from product form' });
    }
    return null;
  });
  if (result) await alertLowStock([result]);
  for (const url of removedUrls) {
    const stillUsed = await prisma.productImage.count({ where: { url } });
    if (!stillUsed) await removeStoredFile(url);
  }
  await audit(req, 'seller.product_updated', { entityType: 'Product', entityId: productId, metadata: { fields: Object.keys(data) } });
  if (fields.moderationStatus === 'PENDING' && merged.status === 'PUBLISHED') {
    await notifyAdmins('catalog', { type: 'product.review', title: 'Product waiting for approval', body: `${shop.name}: ${merged.name}`, link: '/admin/products?moderation=PENDING' });
  }
  return getProduct(shop, productId);
}

/** Products with order history are archived (kept for records); others are deleted. */
export async function deleteProduct(req, productId) {
  const product = await ownProduct(req.shop.id, productId, { images: true });
  const ordered = await prisma.orderItem.count({ where: { productId } });
  if (ordered) {
    await prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
  } else {
    await prisma.product.delete({ where: { id: productId } });
    for (const img of product.images) {
      if (!(await prisma.productImage.count({ where: { url: img.url } }))) await removeStoredFile(img.url);
    }
  }
  await prisma.cartItem.deleteMany({ where: { productId } });
  await audit(req, 'seller.product_deleted', { entityType: 'Product', entityId: productId, metadata: { archived: Boolean(ordered) } });
}

export async function updateStock(req, productId, { quantity, note }) {
  await ownProduct(req.shop.id, productId);
  return setStock({ productId, quantity, note, actorId: req.user.id, reason: 'RESTOCK' });
}

export async function listMovements(shop, { productId, page, pageSize }) {
  const where = { product: { shopId: shop.id }, ...(productId ? { productId } : {}) };
  const [total, items] = await Promise.all([
    prisma.inventoryMovement.count({ where }),
    prisma.inventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      ...paginate({ page, pageSize }),
      include: { product: { select: { name: true, sku: true } } },
    }),
  ]);
  return pageResult(items, total, { page, pageSize });
}
