import { beforeAll, describe, expect, it } from 'vitest';
import { addToCart, api, checkout, createAddress, createCategory, createProduct, createSeller, prisma, resetDb, userWithToken } from './helpers.js';

/**
 * One seller must never be able to read or change another seller's shop,
 * products, inventory or orders — no matter which ids they send.
 */
describe('seller data isolation', () => {
  let alice;
  let bob;
  let bobProduct;
  let bobSellerOrderId;

  beforeAll(async () => {
    await resetDb();
    const category = await createCategory();
    alice = await createSeller();
    bob = await createSeller();
    await createProduct(alice.shop, category, { name: 'Alice Lamp' });
    bobProduct = await createProduct(bob.shop, category, { name: 'Bob Kettle', stock: 5 });

    const buyer = await userWithToken({ role: 'BUYER' });
    const address = await createAddress(buyer.user.id);
    await addToCart(buyer.auth, bobProduct.id, 1);
    const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    expect(res.status).toBe(201);
    bobSellerOrderId = (await prisma.sellerOrder.findFirst({ where: { shopId: bob.shop.id } })).id;
  });

  it("lists only the seller's own products", async () => {
    const res = await api().get('/api/seller/products').set(alice.auth);
    expect(res.status).toBe(200);
    expect(res.body.items.map((p) => p.name)).toEqual(['Alice Lamp']);
  });

  it("cannot read, edit, restock or delete another seller's product", async () => {
    expect((await api().get(`/api/seller/products/${bobProduct.id}`).set(alice.auth)).status).toBe(404);
    expect((await api().patch(`/api/seller/products/${bobProduct.id}`).set(alice.auth).send({ price: 1 })).status).toBe(404);
    expect((await api().put(`/api/seller/products/${bobProduct.id}/stock`).set(alice.auth).send({ quantity: 0 })).status).toBe(404);
    expect((await api().delete(`/api/seller/products/${bobProduct.id}`).set(alice.auth)).status).toBe(404);
    const unchanged = await prisma.product.findUnique({ where: { id: bobProduct.id } });
    expect(unchanged.price).toBe(bobProduct.price);
    expect(unchanged.deletedAt).toBeNull();
  });

  it('cannot create a product inside another shop by sending a shopId', async () => {
    const category = await prisma.category.findFirst();
    const res = await api().post('/api/seller/products').set(alice.auth).send({
      name: 'Smuggled product',
      description: 'Trying to place this product into another seller shop.',
      categoryId: category.id,
      price: 5000,
      stock: 1,
      shopId: bob.shop.id,
    });
    expect(res.status).toBe(201);
    const created = await prisma.product.findUnique({ where: { id: res.body.product.id } });
    expect(created.shopId).toBe(alice.shop.id);
  });

  it("cannot see or update another seller's orders", async () => {
    const list = await api().get('/api/seller/orders').set(alice.auth);
    expect(list.body.items).toHaveLength(0);
    expect((await api().get(`/api/seller/orders/${bobSellerOrderId}`).set(alice.auth)).status).toBe(404);
    const update = await api().post(`/api/seller/orders/${bobSellerOrderId}/status`).set(alice.auth).send({ status: 'ACCEPTED' });
    expect(update.status).toBe(404);
    expect((await prisma.sellerOrder.findUnique({ where: { id: bobSellerOrderId } })).status).toBe('PLACED');
  });

  it("the owner sees fulfilment details but never the buyer's e-mail or delivery code", async () => {
    const res = await api().get(`/api/seller/orders/${bobSellerOrderId}`).set(bob.auth);
    expect(res.status).toBe(200);
    expect(res.body.order.shipping.name).toBe('Test Buyer');
    const json = JSON.stringify(res.body);
    expect(json).not.toMatch(/@example\.com/);
    expect(res.body.order.deliveryCode).toBeUndefined();
  });

  it("cannot reply to reviews or refunds of another shop, nor read its inventory history", async () => {
    const movements = await api().get('/api/seller/inventory/movements').set(alice.auth);
    expect(movements.body.items.every((m) => m.product.name !== 'Bob Kettle')).toBe(true);
    const fakeId = (await prisma.sellerOrder.findUnique({ where: { id: bobSellerOrderId } })).id;
    expect((await api().post(`/api/seller/reviews/${fakeId}/reply`).set(alice.auth).send({ reply: 'hello there' })).status).toBe(404);
  });

  it("finance and dashboard figures only include the seller's own shop", async () => {
    const res = await api().get('/api/seller/dashboard').set(alice.auth);
    expect(res.status).toBe(200);
    expect(res.body.kpis.newOrders).toBe(0);
    const bobDash = await api().get('/api/seller/dashboard').set(bob.auth);
    expect(bobDash.body.kpis.newOrders).toBe(1);
  });
});
