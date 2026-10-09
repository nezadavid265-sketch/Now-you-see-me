#!/usr/bin/env node
/**
 * Development seed. Creates categories, accounts for every role, approved
 * shops with products and images, marketing content, and a few sample orders
 * that are pushed through the real order workflow (so ledgers, reviews and
 * analytics are consistent with how the application behaves).
 *
 *   npm run seed              # seed an empty database
 *   npm run seed -- --reset   # wipe and reseed (development only)
 *
 * All seeded accounts use SEED_DEFAULT_PASSWORD from .env.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../src/config/env.js';
import { prisma } from '../src/lib/prisma.js';
import { uniqueSlug } from '../src/lib/slug.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { storeImage } from '../src/services/storage.js';
import { changeStock } from '../src/domain/inventory.js';
import { placeOrder } from '../src/domain/checkout.js';
import { changeSellerOrderStatus } from '../src/domain/orders.js';
import { refreshRatings } from '../src/domain/reviews.js';
import { BANNERS, CATEGORIES, COUPONS, PAGES, PENDING_SELLER, PRODUCTS, SHOPS } from './seed-data.js';
import { productImage, shopBanner, shopLogo } from './seed-images.js';
import { ADMIN_PERMISSIONS } from '../src/middleware/auth.js';

const args = new Set(process.argv.slice(2));
const log = (msg) => console.log(`  ${msg}`);
const DAY = 86_400_000;

if (config.isProd && !args.has('--force')) {
  console.error('✖ Refusing to seed a production database. Seed data is for development only.');
  process.exit(1);
}
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD;
if (!PASSWORD || /change_me/i.test(PASSWORD) || PASSWORD.length < 8) {
  console.error('✖ Set SEED_DEFAULT_PASSWORD (8+ characters) in .env before seeding.');
  process.exit(1);
}
const ADMIN_EMAIL = (process.env.SEED_ADMIN_EMAIL || 'admin@rivoshoppa.local').toLowerCase();

async function resetDatabase() {
  const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"${t.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
  if (config.STORAGE_DRIVER === 'local') {
    for (const dir of ['products', 'shops', 'banners', 'categorys']) {
      await fs.rm(path.join(config.uploadDir, dir), { recursive: true, force: true });
    }
  }
  log('database wiped');
}

async function upload(buffer, folder, maxSize) {
  return storeImage(buffer, { folder, maxSize });
}

async function main() {
  console.log('🌱 Seeding Rivoshoppa development data');
  if (await prisma.user.count()) {
    if (!args.has('--reset')) {
      console.log('  Database already contains data. Run `npm run seed -- --reset` to wipe and reseed (development only).');
      return;
    }
    await resetDatabase();
  }
  const passwordHash = await hashPassword(PASSWORD);
  const verified = new Date();

  // ── Categories ──
  const categoryBySlug = new Map();
  const rootOf = new Map();
  let rootOrder = 0;
  for (const root of CATEGORIES) {
    const { children, ...data } = root;
    const parent = await prisma.category.create({ data: { ...data, sortOrder: rootOrder++ } });
    categoryBySlug.set(parent.slug, parent);
    rootOf.set(parent.slug, parent.slug);
    let childOrder = 0;
    for (const child of children) {
      const c = await prisma.category.create({ data: { ...child, parentId: parent.id, sortOrder: childOrder++ } });
      categoryBySlug.set(c.slug, c);
      rootOf.set(c.slug, parent.slug);
    }
  }
  log(`${categoryBySlug.size} categories`);

  // ── Staff & buyers ──
  const admin = await prisma.user.create({
    data: { name: 'Rivoshoppa Admin', email: ADMIN_EMAIL, phone: '+250788000001', role: 'ADMIN', isSuperAdmin: true, adminPermissions: ADMIN_PERMISSIONS, passwordHash, emailVerifiedAt: verified },
  });
  await prisma.user.create({
    data: { name: 'Grace Ingabire', email: 'ops@rivoshoppa.local', phone: '+250788000002', role: 'ADMIN', adminPermissions: ['orders', 'support', 'catalog'], passwordHash, emailVerifiedAt: verified },
  });
  const courier = await prisma.user.create({
    data: { name: 'Claude Nshimiyimana', email: 'courier@rivoshoppa.local', phone: '+250788000003', role: 'DELIVERY', passwordHash, emailVerifiedAt: verified },
  });
  const buyer = await prisma.user.create({
    data: {
      name: 'Sandrine Uwimana', email: 'buyer@rivoshoppa.local', phone: '+250788200001', role: 'BUYER', passwordHash, emailVerifiedAt: verified,
      addresses: {
        create: [
          { label: 'Home', recipientName: 'Sandrine Uwimana', phone: '+250788200001', line1: 'KG 9 Ave, House 24', sector: 'Kimihurura', district: 'Gasabo', city: 'Kigali', latitude: -1.9536, longitude: 30.0928, instructions: 'Blue gate opposite the pharmacy', isDefault: true },
          { label: 'Office', recipientName: 'Sandrine Uwimana', phone: '+250788200001', line1: 'KN 3 Rd, Grand Pension Plaza, 5th floor', sector: 'Nyarugenge', district: 'Nyarugenge', city: 'Kigali', latitude: -1.9469, longitude: 30.0596 },
        ],
      },
    },
    include: { addresses: true },
  });
  const buyer2 = await prisma.user.create({
    data: {
      name: 'Olivier Hakizimana', email: 'buyer2@rivoshoppa.local', phone: '+250788200002', role: 'BUYER', passwordHash, emailVerifiedAt: verified,
      addresses: { create: [{ label: 'Home', recipientName: 'Olivier Hakizimana', phone: '+250788200002', line1: 'Street 12, near Kicukiro Market', sector: 'Kicukiro', district: 'Kicukiro', city: 'Kigali', latitude: -1.9706, longitude: 30.1044, isDefault: true }] },
    },
    include: { addresses: true },
  });
  log('admin, operations admin, courier and 2 buyers');

  // ── Sellers & shops ──
  const shopByKey = new Map();
  for (const s of SHOPS) {
    const { colors, ...shopData } = s.shop;
    const user = await prisma.user.create({ data: { ...s.seller, role: 'SELLER', passwordHash, emailVerifiedAt: verified } });
    await prisma.sellerProfile.create({
      data: { ...s.profile, userId: user.id, status: 'APPROVED', submittedAt: new Date(Date.now() - 40 * DAY), reviewedAt: new Date(Date.now() - 39 * DAY), reviewedById: admin.id },
    });
    const shop = await prisma.shop.create({
      data: {
        ...shopData,
        sellerId: user.id,
        slug: uniqueSlug(shopData.name),
        status: 'ACTIVE',
        logoUrl: await upload(await shopLogo({ name: shopData.name, colors }), 'shops', 400),
        bannerUrl: await upload(await shopBanner({ colors }), 'shops', 1600),
        createdAt: new Date(Date.now() - 40 * DAY),
      },
    });
    shopByKey.set(s.key, { ...shop, user });
  }
  {
    const user = await prisma.user.create({ data: { ...PENDING_SELLER.seller, role: 'SELLER', passwordHash, emailVerifiedAt: verified } });
    await prisma.sellerProfile.create({ data: { ...PENDING_SELLER.profile, userId: user.id, status: 'PENDING', submittedAt: new Date(Date.now() - DAY) } });
    await prisma.shop.create({ data: { ...PENDING_SELLER.shop, sellerId: user.id, slug: uniqueSlug(PENDING_SELLER.shop.name), status: 'PENDING' } });
  }
  log(`${SHOPS.length} approved shops + 1 pending application`);

  // ── Products ──
  const productByName = new Map();
  for (const [i, p] of PRODUCTS.entries()) {
    const shop = shopByKey.get(p.shop);
    const category = categoryBySlug.get(p.category);
    const rootCategory = rootOf.get(p.category);
    const imageCount = p.featured ? 2 : 1;
    const images = [];
    for (let v = 0; v < imageCount; v++) {
      images.push(await upload(await productImage({ glyph: p.glyph, title: p.name, brand: p.brand, rootCategory, variant: v }), 'products', 1200));
    }
    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          shopId: shop.id,
          categoryId: category.id,
          name: p.name,
          slug: uniqueSlug(p.name),
          description: p.description,
          brand: p.brand,
          sku: `${p.shop.toUpperCase()}-${String(i + 1).padStart(3, '0')}`,
          price: p.price,
          compareAtPrice: p.compareAtPrice ?? null,
          status: 'PUBLISHED',
          moderationStatus: 'APPROVED',
          isFeatured: Boolean(p.featured),
          specifications: p.specs,
          tags: p.tags,
          lowStockThreshold: 5,
          publishedAt: new Date(Date.now() - (35 - (i % 30)) * DAY),
          createdAt: new Date(Date.now() - (35 - (i % 30)) * DAY),
          images: { create: images.map((url, idx) => ({ url, alt: p.name, sortOrder: idx })) },
        },
      });
      if (p.stock > 0) await changeStock(tx, { productId: product.id, change: p.stock, reason: 'INITIAL', note: 'Opening stock' });
      return product;
    });
    productByName.set(p.name, created);
  }
  log(`${PRODUCTS.length} products with generated images`);

  // ── Marketing & content ──
  await prisma.banner.createMany({ data: BANNERS });
  await prisma.contentPage.createMany({ data: PAGES.map((pg) => ({ ...pg, updatedById: admin.id })) });
  await prisma.coupon.createMany({ data: COUPONS });
  await prisma.announcement.create({
    data: {
      title: 'Welcome to the new seller dashboard',
      body: 'You can now manage inventory, follow orders step by step and see your earnings in one place. Questions? Open a support request any time.',
      audience: 'SELLERS',
      isPublished: true,
      publishedAt: new Date(),
      createdById: admin.id,
    },
  });
  log(`${BANNERS.length} banners, ${PAGES.length} content pages, ${COUPONS.length} promo codes`);

  // ── Sample orders through the real workflow ──
  const product = (name) => {
    const p = productByName.get(name);
    if (!p) throw new Error(`Seed product missing: ${name}`);
    return p;
  };
  async function order(user, addressId, lines) {
    await prisma.cartItem.deleteMany({ where: { userId: user.id } });
    for (const [name, quantity] of lines) await prisma.cartItem.create({ data: { userId: user.id, productId: product(name).id, quantity } });
    const { order: o } = await placeOrder(user, { addressId, paymentMethod: 'CASH_ON_DELIVERY' });
    return prisma.order.findUnique({ where: { id: o.id }, include: { sellerOrders: { include: { shop: true } } } });
  }
  async function advance(so, steps) {
    const shop = [...shopByKey.values()].find((s) => s.id === so.shopId);
    for (const to of steps) {
      if (to === 'IN_TRANSIT' && so.fulfillmentMode === 'MARKETPLACE') {
        await prisma.delivery.update({ where: { sellerOrderId: so.id }, data: { staffId: courier.id, status: 'ASSIGNED', assignedAt: new Date() } });
      }
      const marketplaceStep = so.fulfillmentMode === 'MARKETPLACE' && ['IN_TRANSIT', 'DELIVERED'].includes(to);
      const actor = marketplaceStep ? { id: courier.id, role: 'DELIVERY' } : { id: shop.user.id, role: 'SELLER' };
      await changeSellerOrderStatus(so.id, to, { actor, note: to === 'DELIVERED' ? 'Delivered and confirmed with code' : undefined });
    }
  }
  const DELIVER = ['ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED'];
  const home1 = buyer.addresses.find((a) => a.isDefault).id;
  const home2 = buyer2.addresses[0].id;

  const o1 = await order(buyer, home1, [['Tecno Spark 20 Pro (256GB, 8GB RAM)', 1], ['Oraimo FreePods 4 Wireless Earbuds', 1], ['Electric Kettle 1.8L (Stainless Steel)', 1]]);
  for (const so of o1.sellerOrders) await advance(so, DELIVER);
  const o2 = await order(buyer2, home2, [['Rwanda Arabica Coffee – Medium Roast 500g', 3], ['Rwandan Black Tea 250g', 4], ['Akabanga Chili Oil 100ml', 2]]);
  for (const so of o2.sellerOrders) await advance(so, DELIVER);
  const o3 = await order(buyer, home1, [["Men's Kitenge Shirt (Slim Fit)", 2], ['Natural Forest Honey 500g', 1]]);
  for (const so of o3.sellerOrders) await advance(so, so.shop.name === 'Umurage Fashion' ? ['ACCEPTED', 'PREPARING'] : []);
  const o4 = await order(buyer2, home2, [['JBL Flip 6 Portable Bluetooth Speaker', 1]]);
  void o4; // left as a new order waiting for the seller
  const o5 = await order(buyer2, home2, [['Imigongo Wall Art (Handmade, 60cm)', 1], ['Agaseke Peace Basket Set (3 pieces)', 2]]);
  for (const so of o5.sellerOrders) await advance(so, DELIVER);

  // Spread sample history over recent weeks and make older earnings available for payout.
  const history = [
    [o1, 18],
    [o2, 12],
    [o5, 9],
    [o3, 2],
  ];
  for (const [o, daysAgo] of history) {
    const at = new Date(Date.now() - daysAgo * DAY);
    await prisma.order.update({ where: { id: o.id }, data: { createdAt: at } });
    await prisma.sellerOrder.updateMany({ where: { orderId: o.id }, data: { createdAt: at } });
    if (daysAgo > 7) {
      const delivered = new Date(at.getTime() + 2 * DAY);
      await prisma.sellerOrder.updateMany({ where: { orderId: o.id, status: 'DELIVERED' }, data: { deliveredAt: delivered } });
      await prisma.sellerLedgerEntry.updateMany({
        where: { sellerOrder: { orderId: o.id }, type: 'EARNING' },
        data: { availableAt: new Date(delivered.getTime() + 7 * DAY), createdAt: delivered },
      });
    }
  }

  // Verified-purchase reviews on delivered items.
  const reviews = [
    [buyer, o1, 'Tecno Spark 20 Pro (256GB, 8GB RAM)', 5, 'Excellent value', 'Fast delivery to Kimihurura and the phone is genuine. Battery easily lasts a full day.'],
    [buyer, o1, 'Electric Kettle 1.8L (Stainless Steel)', 4, 'Does the job', 'Boils quickly and feels solid. A bit noisy but great for the price.'],
    [buyer2, o2, 'Rwanda Arabica Coffee – Medium Roast 500g', 5, 'Best coffee in Kigali', 'Fresh, aromatic and smooth. I have already ordered again for the office.'],
    [buyer2, o2, 'Akabanga Chili Oil 100ml', 5, null, 'Authentic Akabanga, well packed. Two drops is enough!'],
    [buyer2, o5, 'Imigongo Wall Art (Handmade, 60cm)', 5, 'Beautiful craftsmanship', 'Even more beautiful in person. It arrived well wrapped and the seller called before delivery.'],
  ];
  for (const [user, o, name, rating, title, body] of reviews) {
    const item = await prisma.orderItem.findFirst({ where: { productName: name, sellerOrder: { orderId: o.id } } });
    await prisma.$transaction(async (tx) => {
      await tx.review.create({ data: { productId: item.productId, userId: user.id, orderItemId: item.id, rating, title, body } });
      await refreshRatings(tx, item.productId);
    });
  }
  log('5 sample orders (delivered, in progress and new) with reviews');

  // Seed side effects queued e-mails; drop them so the first `npm run dev` stays quiet.
  await prisma.job.deleteMany();

  console.log('\n✔ Seed complete. Accounts (all use SEED_DEFAULT_PASSWORD from .env):');
  console.table([
    { role: 'Super admin', email: ADMIN_EMAIL },
    { role: 'Admin (orders, support, catalog)', email: 'ops@rivoshoppa.local' },
    { role: 'Delivery staff', email: 'courier@rivoshoppa.local' },
    { role: 'Buyer', email: 'buyer@rivoshoppa.local' },
    { role: 'Buyer', email: 'buyer2@rivoshoppa.local' },
    ...SHOPS.map((s) => ({ role: `Seller — ${s.shop.name}`, email: s.seller.email })),
    { role: 'Seller (pending approval)', email: PENDING_SELLER.seller.email },
  ]);
}

main()
  .catch((err) => {
    console.error('✖ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
