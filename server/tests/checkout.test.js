import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addToCart,
  api,
  checkout,
  createAddress,
  createCategory,
  createProduct,
  createSeller,
  prisma,
  resetDb,
  userWithToken,
} from './helpers.js';
import { setSetting } from './utils.js';

describe('checkout', () => {
  let category;
  let shopA;
  let shopB;
  let buyer;
  let address;

  beforeAll(async () => {
    await resetDb();
    category = await createCategory({ commissionRateBps: 1000 });
    shopA = await createSeller();
    shopB = await createSeller({ commissionRateBps: 500 });
    await setSetting('deliveryFeeBase', 1500);
    await setSetting('freeDeliveryThreshold', 50_000);
  });

  beforeEach(async () => {
    buyer = await userWithToken({ role: 'BUYER' });
    address = await createAddress(buyer.user.id);
  });

  it('computes every amount on the server and ignores client-supplied prices', async () => {
    const p = await createProduct(shopA.shop, category, { price: 20_000, stock: 5 });
    await api().post('/api/cart/items').set(buyer.auth).send({ productId: p.id, quantity: 2, price: 1, unitPrice: 1 });
    const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY', total: 1, subtotal: 1, deliveryFee: 0 });
    expect(res.status).toBe(201);
    const order = await prisma.order.findUnique({ where: { id: res.body.order.id }, include: { sellerOrders: { include: { items: true } } } });
    expect(order.subtotal).toBe(40_000);
    expect(order.deliveryFee).toBe(1500);
    expect(order.total).toBe(41_500);
    expect(order.sellerOrders[0].items[0].unitPrice).toBe(20_000);
  });

  it('splits a multi-seller cart into seller orders with commission and delivery per shop', async () => {
    const a = await createProduct(shopA.shop, category, { price: 30_000 });
    const b = await createProduct(shopB.shop, category, { price: 60_000 });
    await addToCart(buyer.auth, a.id, 1);
    await addToCart(buyer.auth, b.id, 1);
    const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(res.status).toBe(201);

    const order = await prisma.order.findUnique({ where: { id: res.body.order.id }, include: { sellerOrders: true } });
    expect(order.sellerOrders).toHaveLength(2);
    const soA = order.sellerOrders.find((s) => s.shopId === shopA.shop.id);
    const soB = order.sellerOrders.find((s) => s.shopId === shopB.shop.id);
    // Shop A: below free-delivery threshold, category commission 10%.
    expect(soA).toMatchObject({ subtotal: 30_000, deliveryFee: 1500, total: 31_500, commissionAmount: 3000, sellerNet: 30_000 - 3000 + 1500 });
    // Shop B: free delivery, shop override commission 5%.
    expect(soB).toMatchObject({ subtotal: 60_000, deliveryFee: 0, total: 60_000, commissionAmount: 3000, sellerNet: 57_000 });
    expect(order.total).toBe(91_500);
    expect(soA.number).toMatch(/^RS-\d{6}-[A-Z0-9]{6}-\d$/);
    expect(soA.deliveryCode).toMatch(/^\d{6}$/);

    // Stock was reserved and the cart emptied.
    expect((await prisma.product.findUnique({ where: { id: a.id } })).stock).toBe(9);
    expect(await prisma.cartItem.count({ where: { userId: buyer.user.id } })).toBe(0);
  });

  it('rejects quantities above available stock and unavailable products', async () => {
    const p = await createProduct(shopA.shop, category, { stock: 2 });
    const add = await api().post('/api/cart/items').set(buyer.auth).send({ productId: p.id, quantity: 5 });
    expect(add.status).toBe(201);
    const line = add.body.groups[0].items[0];
    expect(line.quantity).toBe(2); // clamped to stock

    await prisma.product.update({ where: { id: p.id }, data: { stock: 1 } });
    const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CART_PROBLEMS');
    expect(res.body.error.details.problems[0].reason).toMatch(/Only 1 left/);
  });

  it('does not sell products from a shop on vacation', async () => {
    const vacation = await createSeller();
    const p = await createProduct(vacation.shop, category);
    await addToCart(buyer.auth, p.id, 1);
    await prisma.shop.update({ where: { id: vacation.shop.id }, data: { vacationMode: true, vacationMessage: 'Back on Monday' } });
    const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(res.status).toBe(409);
    expect(res.body.error.details.problems[0].reason).toMatch(/Back on Monday/);
  });

  it('never oversells under concurrent checkouts', async () => {
    const p = await createProduct(shopA.shop, category, { stock: 3 });
    const buyers = [];
    for (let i = 0; i < 6; i++) {
      const b = await userWithToken({ role: 'BUYER' });
      const addr = await createAddress(b.user.id);
      await addToCart(b.auth, p.id, 1);
      buyers.push({ ...b, addr });
    }
    const results = await Promise.all(buyers.map((b) => checkout(b.auth, { addressId: b.addr.id, paymentMethod: 'CASH_ON_DELIVERY' })));
    const ok = results.filter((r) => r.status === 201).length;
    expect(ok).toBe(3);
    expect(results.filter((r) => r.status === 409).length).toBe(3);
    const product = await prisma.product.findUnique({ where: { id: p.id } });
    expect(product.stock).toBe(0);
    expect(product.soldCount).toBe(3);
  });

  it('returns the original order when the same Idempotency-Key is retried', async () => {
    const p = await createProduct(shopA.shop, category);
    await addToCart(buyer.auth, p.id, 1);
    const headers = { 'Idempotency-Key': 'checkout-attempt-12345' };
    const first = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' }, headers);
    const second = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' }, headers);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.order.id).toBe(first.body.order.id);
    expect(await prisma.order.count({ where: { buyerId: buyer.user.id } })).toBe(1);
  });

  it("refuses another buyer's address", async () => {
    const other = await userWithToken({ role: 'BUYER' });
    const otherAddress = await createAddress(other.user.id);
    const p = await createProduct(shopA.shop, category);
    await addToCart(buyer.auth, p.id, 1);
    const res = await checkout(buyer.auth, { addressId: otherAddress.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(res.status).toBe(404);
  });

  describe('promo codes', () => {
    beforeAll(async () => {
      await prisma.coupon.create({ data: { code: 'SAVE10', type: 'PERCENTAGE', value: 10, maxDiscount: 5000, minOrderAmount: 10_000, perUserLimit: 1 } });
      await prisma.coupon.create({ data: { code: 'ONCE', type: 'FIXED', value: 1000, usageLimit: 1, perUserLimit: 5 } });
      await prisma.coupon.create({ data: { code: 'OLD', type: 'FIXED', value: 1000, endsAt: new Date(Date.now() - 1000) } });
    });

    it('applies a valid code with caps, and only once per buyer', async () => {
      const p = await createProduct(shopA.shop, category, { price: 80_000 });
      await addToCart(buyer.auth, p.id, 1);
      const quote = await api().post('/api/checkout/quote').set(buyer.auth).send({ couponCode: 'save10' });
      expect(quote.body.discount).toBe(5000); // 10% capped at 5,000
      const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY', couponCode: 'SAVE10' });
      expect(res.status).toBe(201);
      expect(res.body.order.total).toBe(80_000 - 5000); // free delivery above threshold

      await addToCart(buyer.auth, p.id, 1);
      const again = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY', couponCode: 'SAVE10' });
      expect(again.status).toBe(422);
      expect(again.body.error.message).toMatch(/already used/);
    });

    it('rejects expired codes and enforces global usage limits', async () => {
      const p = await createProduct(shopA.shop, category, { price: 20_000 });
      await addToCart(buyer.auth, p.id, 1);
      const expired = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY', couponCode: 'OLD' });
      expect(expired.status).toBe(422);

      const used = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY', couponCode: 'ONCE' });
      expect(used.status).toBe(201);
      const other = await userWithToken({ role: 'BUYER' });
      const addr = await createAddress(other.user.id);
      await addToCart(other.auth, p.id, 1);
      const limit = await checkout(other.auth, { addressId: addr.id, paymentMethod: 'CASH_ON_DELIVERY', couponCode: 'ONCE' });
      expect(limit.status).toBe(422);
      expect((await prisma.coupon.findUnique({ where: { code: 'ONCE' } })).usedCount).toBe(1);
    });
  });

  it('prices a guest cart on the server without saving anything', async () => {
    const p = await createProduct(shopA.shop, category, { price: 7000 });
    const res = await api().post('/api/cart/preview').send({ items: [{ productId: p.id, quantity: 3 }] });
    expect(res.status).toBe(200);
    expect(res.body.subtotal).toBe(21_000);
    expect(res.body.total).toBe(22_500);
  });

  it('enforces the cash-on-delivery limit', async () => {
    await setSetting('codMaxOrderTotal', 10_000);
    const p = await createProduct(shopA.shop, category, { price: 20_000 });
    await addToCart(buyer.auth, p.id, 1);
    const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(res.status).toBe(422);
    await setSetting('codMaxOrderTotal', 500_000);
  });
});
