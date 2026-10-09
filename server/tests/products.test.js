import path from 'node:path';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, createCategory, createSeller, prisma, resetDb, userWithToken } from './helpers.js';
import { setSetting } from './utils.js';

const validProduct = (categoryId, overrides = {}) => ({
  name: 'Handwoven Agaseke Basket',
  description: 'A beautiful handwoven basket made by a local cooperative.',
  categoryId,
  price: 25_000,
  compareAtPrice: 30_000,
  stock: 12,
  status: 'PUBLISHED',
  images: [{ url: '/uploads/products/2026/10/basket.webp' }],
  specifications: [{ name: 'Material', value: 'Sisal' }],
  tags: ['Basket', 'made in rwanda'],
  ...overrides,
});

describe('seller product management', () => {
  let category;
  let seller;

  beforeAll(async () => {
    await resetDb();
    category = await createCategory({ name: 'Home Décor', slug: 'home-decor' });
    seller = await createSeller();
  });

  it('creates and publishes a product that becomes visible in search', async () => {
    const res = await api().post('/api/seller/products').set(seller.auth).send(validProduct(category.id));
    expect(res.status).toBe(201);
    expect(res.body.product).toMatchObject({ status: 'PUBLISHED', moderationStatus: 'APPROVED', stock: 12, tags: ['basket', 'made in rwanda'] });

    const movement = await prisma.inventoryMovement.findFirst({ where: { productId: res.body.product.id } });
    expect(movement).toMatchObject({ change: 12, reason: 'INITIAL', quantityAfter: 12 });

    const search = await api().get('/api/products').query({ q: 'agaseke' });
    expect(search.body.items.map((p) => p.id)).toContain(res.body.product.id);
    const byCategory = await api().get('/api/products').query({ category: 'home-decor', minPrice: 20000, maxPrice: 26000 });
    expect(byCategory.body.items).toHaveLength(1);
  });

  it('validates input on the server', async () => {
    const res = await api()
      .post('/api/seller/products')
      .set(seller.auth)
      .send(validProduct(category.id, { name: 'x', price: -5, compareAtPrice: 1, images: [{ url: 'javascript:alert(1)' }] }));
    expect(res.status).toBe(422);
    const fields = Object.keys(res.body.error.details.fieldErrors);
    expect(fields).toEqual(expect.arrayContaining(['name', 'price', 'images.0.url']));
  });

  it('requires an approved shop before products can go live (drafts are allowed)', async () => {
    const pending = await createSeller({ status: 'PENDING' });
    const live = await api().post('/api/seller/products').set(pending.auth).send(validProduct(category.id));
    expect(live.status).toBe(422);
    expect(live.body.error.code).toBe('SHOP_NOT_ACTIVE');
    const draft = await api().post('/api/seller/products').set(pending.auth).send(validProduct(category.id, { status: 'DRAFT' }));
    expect(draft.status).toBe(201);
  });

  it('requires a photo before publishing', async () => {
    const res = await api().post('/api/seller/products').set(seller.auth).send(validProduct(category.id, { images: [] }));
    expect(res.status).toBe(422);
  });

  it('records stock adjustments and raises low-stock alerts', async () => {
    const created = await api().post('/api/seller/products').set(seller.auth).send(validProduct(category.id, { name: 'Coffee Mug', stock: 10 }));
    const id = created.body.product.id;
    const res = await api().put(`/api/seller/products/${id}/stock`).set(seller.auth).send({ quantity: 2, note: 'Counted shelf' });
    expect(res.status).toBe(200);
    expect(res.body.product.stock).toBe(2);
    const movement = await prisma.inventoryMovement.findFirst({ where: { productId: id }, orderBy: { createdAt: 'desc' } });
    expect(movement).toMatchObject({ change: -8, quantityAfter: 2, reason: 'RESTOCK' });
    const alert = await prisma.notification.findFirst({ where: { userId: seller.user.id, type: 'inventory.low_stock' } });
    expect(alert?.title).toContain('Coffee Mug');

    const low = await api().get('/api/seller/products').query({ stock: 'low' }).set(seller.auth);
    expect(low.body.items.map((p) => p.id)).toContain(id);
  });

  it('archives products with order history instead of deleting them', async () => {
    const created = await api().post('/api/seller/products').set(seller.auth).send(validProduct(category.id, { name: 'To Delete' }));
    const id = created.body.product.id;
    expect((await api().delete(`/api/seller/products/${id}`).set(seller.auth)).status).toBe(204);
    expect(await prisma.product.findUnique({ where: { id } })).toBeNull();
  });

  it('honours the "require product approval" setting and admin moderation', async () => {
    const admin = await userWithToken({ role: 'ADMIN', permissions: ['catalog'] });
    await setSetting('requireProductApproval', true);
    const created = await api().post('/api/seller/products').set(seller.auth).send(validProduct(category.id, { name: 'Needs Review Lamp' }));
    expect(created.body.product.moderationStatus).toBe('PENDING');
    const slug = created.body.product.slug;
    expect((await api().get(`/api/products/${slug}`)).status).toBe(404);

    const approve = await api().patch(`/api/admin/products/${created.body.product.id}/moderation`).set(admin.auth).send({ moderationStatus: 'APPROVED' });
    expect(approve.status).toBe(200);
    expect((await api().get(`/api/products/${slug}`)).status).toBe(200);

    const remove = await api()
      .patch(`/api/admin/products/${created.body.product.id}/moderation`)
      .set(admin.auth)
      .send({ moderationStatus: 'REMOVED', note: 'Counterfeit' });
    expect(remove.status).toBe(200);
    expect((await api().get(`/api/products/${slug}`)).status).toBe(404);
    const edit = await api().patch(`/api/seller/products/${created.body.product.id}`).set(seller.auth).send({ name: 'Renamed lamp' });
    expect(edit.status).toBe(403);
    await setSetting('requireProductApproval', false);
  });

  it('hides products of suspended shops from the public catalogue', async () => {
    const other = await createSeller();
    const created = await api().post('/api/seller/products').set(other.auth).send(validProduct(category.id, { name: 'Soon Hidden' }));
    await prisma.shop.update({ where: { id: other.shop.id }, data: { status: 'SUSPENDED' } });
    expect((await api().get(`/api/products/${created.body.product.slug}`)).status).toBe(404);
  });

  describe('image uploads', () => {
    it('accepts real images, strips metadata and stores them as WebP', async () => {
      const png = await sharp({ create: { width: 64, height: 48, channels: 3, background: '#0b6e75' } })
        .withMetadata({ exif: { IFD0: { Copyright: 'secret-gps-owner' } } })
        .png()
        .toBuffer();
      const res = await api().post('/api/uploads/images').set(seller.auth).field('purpose', 'product').attach('files', png, 'photo.png');
      expect(res.status).toBe(201);
      expect(res.body.urls[0]).toMatch(/^\/uploads\/products\/.+\.webp$/);
      const stored = await sharp(path.resolve('../.data/test-uploads', res.body.urls[0].replace('/uploads/', ''))).metadata();
      expect(stored.format).toBe('webp');
      expect(stored.exif).toBeUndefined();
    });

    it('rejects files that are not images even with an image MIME type', async () => {
      const res = await api()
        .post('/api/uploads/images')
        .set(seller.auth)
        .field('purpose', 'product')
        .attach('files', Buffer.from('<script>alert(1)</script>'), { filename: 'evil.png', contentType: 'image/png' });
      expect(res.status).toBe(400);
    });

    it('rejects disallowed types and purposes', async () => {
      const exe = await api().post('/api/uploads/images').set(seller.auth).field('purpose', 'product').attach('files', Buffer.from('MZ'), { filename: 'a.exe', contentType: 'application/x-msdownload' });
      expect(exe.status).toBe(400);
      const banner = await api().post('/api/uploads/images').set(seller.auth).field('purpose', 'banner').attach('files', Buffer.from('x'), { filename: 'a.png', contentType: 'image/png' });
      expect(banner.status).toBe(403);
    });
  });
});
