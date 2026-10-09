import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { uniqueSlug } from '../src/lib/slug.js';
import { hashPassword } from '../src/modules/auth/auth.service.js';
import { invalidateSettingsCache } from '../src/services/settings.js';
import { invalidateCategoryCache } from '../src/modules/catalog/catalog.service.js';
import { memoryOutbox } from '../src/services/email.js';
import { ADMIN_PERMISSIONS } from '../src/middleware/auth.js';

export const app = createApp();
export const api = () => request(app);
export const PASSWORD = 'Secur3-Passw0rd!';

let passwordHash;
let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Empties every table (keeps the migration history). */
export async function resetDb() {
  const tables = await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  invalidateSettingsCache();
  invalidateCategoryCache();
  memoryOutbox.length = 0;
}

export async function createUser({ role = 'BUYER', permissions, superAdmin = false, ...data } = {}) {
  passwordHash ??= await hashPassword(PASSWORD);
  return prisma.user.create({
    data: {
      name: data.name ?? `Test ${role.toLowerCase()} ${unique()}`,
      email: data.email ?? `${role.toLowerCase()}-${unique()}@example.com`,
      phone: data.phone ?? '+250788123456',
      role,
      passwordHash,
      emailVerifiedAt: new Date(),
      isSuperAdmin: superAdmin,
      adminPermissions: role === 'ADMIN' ? (permissions ?? (superAdmin ? ADMIN_PERMISSIONS : [])) : [],
      status: data.status ?? 'ACTIVE',
    },
  });
}

/** Signs in through the real API and returns an access token plus the refresh cookie. */
export async function login(user) {
  const res = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${user.email}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.accessToken, cookie: res.headers['set-cookie'], user: res.body.user };
}

export async function userWithToken(opts) {
  const user = await createUser(opts);
  const { token } = await login(user);
  return { user, token, auth: { Authorization: `Bearer ${token}` } };
}

export async function createCategory(data = {}) {
  return prisma.category.create({ data: { name: data.name ?? `Category ${unique()}`, slug: data.slug ?? `cat-${unique()}`, ...data } });
}

/** A seller account with an approved profile and an active shop (unless overridden). */
export async function createSeller({ status = 'APPROVED', shopStatus, fulfillmentMode = 'SELF', commissionRateBps = null, shop = {} } = {}) {
  const seller = await userWithToken({ role: 'SELLER' });
  const profile = await prisma.sellerProfile.create({
    data: {
      userId: seller.user.id,
      businessName: `Business ${unique()}`,
      businessAddress: 'KN 1 Rd, Kigali',
      businessPhone: '+250788000000',
      status,
      payoutMethod: 'MTN_MOMO',
      payoutAccountName: 'Test Seller',
      payoutAccountNumber: '0788000000',
    },
  });
  const created = await prisma.shop.create({
    data: {
      sellerId: seller.user.id,
      name: shop.name ?? `Shop ${unique()}`,
      slug: uniqueSlug('shop'),
      status: shopStatus ?? (status === 'APPROVED' ? 'ACTIVE' : 'PENDING'),
      fulfillmentMode,
      commissionRateBps,
      ...shop,
    },
  });
  return { ...seller, profile, shop: created };
}

export async function createProduct(shop, category, data = {}) {
  const { stock = 10, ...rest } = data;
  return prisma.product.create({
    data: {
      shopId: shop.id,
      categoryId: category.id,
      name: rest.name ?? `Product ${unique()}`,
      slug: uniqueSlug('product'),
      description: 'A perfectly good product used in automated tests.',
      price: 10_000,
      status: 'PUBLISHED',
      moderationStatus: 'APPROVED',
      stock,
      images: { create: [{ url: '/uploads/products/test.webp', sortOrder: 0 }] },
      ...rest,
    },
  });
}

export async function createAddress(userId, data = {}) {
  return prisma.address.create({
    data: {
      userId,
      recipientName: 'Test Buyer',
      phone: '+250788123456',
      line1: 'KG 9 Ave 24',
      district: 'Gasabo',
      city: 'Kigali',
      isDefault: true,
      ...data,
    },
  });
}

/** Puts items in a buyer's server-side cart through the API. */
export async function addToCart(auth, productId, quantity = 1) {
  const res = await api().post('/api/cart/items').set(auth).send({ productId, quantity });
  if (res.status !== 201) throw new Error(`Add to cart failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

export async function checkout(auth, body, headers = {}) {
  return api().post('/api/checkout').set(auth).set(headers).send(body);
}

/** A buyer with an address and a ready-made marketplace (category + seller + product). */
export async function marketplace({ productData = {}, sellerData = {} } = {}) {
  const category = await createCategory();
  const seller = await createSeller(sellerData);
  const product = await createProduct(seller.shop, category, productData);
  const buyer = await userWithToken({ role: 'BUYER' });
  const address = await createAddress(buyer.user.id);
  return { category, seller, product, buyer, address };
}

export { prisma };
