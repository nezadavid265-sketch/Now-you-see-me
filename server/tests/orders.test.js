import { beforeAll, describe, expect, it } from 'vitest';
import { addToCart, api, checkout, createAddress, createCategory, createProduct, createSeller, prisma, resetDb, userWithToken } from './helpers.js';
import { canActorTransition, deriveOrderStatus } from '../src/domain/orderStatus.js';

async function placeCodOrder(buyer, product, quantity = 1) {
  const address = await createAddress(buyer.user.id);
  await addToCart(buyer.auth, product.id, quantity);
  const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
  expect(res.status).toBe(201);
  return prisma.order.findUnique({ where: { id: res.body.order.id }, include: { sellerOrders: true } });
}

const step = (auth, id, body) => api().post(`/api/seller/orders/${id}/status`).set(auth).send(body);

describe('order status rules', () => {
  it('only allows valid transitions for each actor', () => {
    expect(canActorTransition('SELLER', 'PLACED', 'ACCEPTED', { fulfillmentMode: 'SELF' })).toBe(true);
    expect(canActorTransition('SELLER', 'PLACED', 'DELIVERED', { fulfillmentMode: 'SELF' })).toBe(false);
    expect(canActorTransition('SELLER', 'READY', 'IN_TRANSIT', { fulfillmentMode: 'MARKETPLACE' })).toBe(false);
    expect(canActorTransition('DELIVERY', 'READY', 'IN_TRANSIT', { fulfillmentMode: 'MARKETPLACE' })).toBe(true);
    expect(canActorTransition('BUYER', 'PREPARING', 'CANCELLED', {})).toBe(false);
    expect(canActorTransition('ADMIN', 'DELIVERED', 'PREPARING', {})).toBe(false);
    expect(canActorTransition('ADMIN', 'PREPARING', 'CANCELLED', {})).toBe(true);
  });

  it('derives the buyer-facing status from shipments', () => {
    expect(deriveOrderStatus(['PENDING_PAYMENT', 'PENDING_PAYMENT'])).toBe('PENDING_PAYMENT');
    expect(deriveOrderStatus(['PLACED', 'DELIVERED'])).toBe('PROCESSING');
    expect(deriveOrderStatus(['IN_TRANSIT', 'DELIVERED'])).toBe('IN_TRANSIT');
    expect(deriveOrderStatus(['DELIVERED', 'CANCELLED'])).toBe('DELIVERED');
    expect(deriveOrderStatus(['CANCELLED', 'CANCELLED'])).toBe('CANCELLED');
  });
});

describe('order fulfilment workflow', () => {
  let category;
  let seller;
  let marketplaceSeller;
  let courier;
  let admin;

  beforeAll(async () => {
    await resetDb();
    category = await createCategory({ commissionRateBps: 1000 });
    seller = await createSeller({ fulfillmentMode: 'SELF' });
    marketplaceSeller = await createSeller({ fulfillmentMode: 'MARKETPLACE' });
    courier = await userWithToken({ role: 'DELIVERY' });
    admin = await userWithToken({ role: 'ADMIN', superAdmin: true });
  });

  it('runs a self-delivered order to completion with the buyer delivery code', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const product = await createProduct(seller.shop, category, { price: 20_000, stock: 5 });
    const order = await placeCodOrder(buyer, product, 2);
    const so = order.sellerOrders[0];

    expect((await step(seller.auth, so.id, { status: 'DELIVERED', deliveryCode: so.deliveryCode })).status).toBe(409); // cannot skip steps
    for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT']) {
      const res = await step(seller.auth, so.id, { status });
      expect(res.status, status).toBe(200);
    }
    const wrong = await step(seller.auth, so.id, { status: 'DELIVERED', deliveryCode: '000000' === so.deliveryCode ? '111111' : '000000' });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('INVALID_DELIVERY_CODE');

    const done = await step(seller.auth, so.id, { status: 'DELIVERED', deliveryCode: so.deliveryCode });
    expect(done.status).toBe(200);
    expect(done.body.order.status).toBe('DELIVERED');

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' }); // COD collected

    // The seller held the cash, so the ledger records the commission they owe.
    const entry = await prisma.sellerLedgerEntry.findFirst({ where: { sellerOrderId: so.id } });
    expect(entry.type).toBe('EARNING');
    expect(entry.amount).toBe(so.sellerNet - so.total);
    expect(entry.availableAt.getTime()).toBeGreaterThan(Date.now());

    const events = await prisma.orderStatusEvent.findMany({ where: { sellerOrderId: so.id }, orderBy: { createdAt: 'asc' } });
    expect(events.map((e) => e.status)).toEqual(['ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT', 'DELIVERED']);

    const buyerView = await api().get(`/api/orders/${order.id}`).set(buyer.auth);
    expect(buyerView.body.order.shipments[0].deliveryCode).toBeNull(); // hidden once delivered
    expect(buyerView.body.order.shipments[0].items[0].canReview).toBe(true);
  });

  it('locks delivery confirmation after too many wrong codes', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const product = await createProduct(seller.shop, category);
    const order = await placeCodOrder(buyer, product);
    const so = order.sellerOrders[0];
    for (const status of ['ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT']) await step(seller.auth, so.id, { status });
    const bad = so.deliveryCode === '123456' ? '654321' : '123456';
    for (let i = 0; i < 5; i++) await step(seller.auth, so.id, { status: 'DELIVERED', deliveryCode: bad });
    const locked = await step(seller.auth, so.id, { status: 'DELIVERED', deliveryCode: so.deliveryCode });
    expect(locked.status).toBe(423);
  });

  it('uses marketplace couriers: assignment, pickup and delivery with code', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const product = await createProduct(marketplaceSeller.shop, category);
    const order = await placeCodOrder(buyer, product);
    const so = order.sellerOrders[0];
    for (const status of ['ACCEPTED', 'PREPARING', 'READY']) expect((await step(marketplaceSeller.auth, so.id, { status })).status).toBe(200);
    // The seller cannot ship marketplace-fulfilled orders themselves.
    expect((await step(marketplaceSeller.auth, so.id, { status: 'IN_TRANSIT' })).status).toBe(409);

    const delivery = await prisma.delivery.findUnique({ where: { sellerOrderId: so.id } });
    expect(delivery.status).toBe('PENDING');
    expect((await api().post(`/api/admin/deliveries/${delivery.id}/assign`).set(admin.auth).send({ staffId: courier.user.id })).status).toBe(200);

    const other = await userWithToken({ role: 'DELIVERY' });
    expect((await api().get(`/api/delivery/assignments/${delivery.id}`).set(other.auth)).status).toBe(404);

    const list = await api().get('/api/delivery/assignments').set(courier.auth);
    expect(list.body.items[0].order.collectAmount).toBe(so.total);
    expect((await api().post(`/api/delivery/assignments/${delivery.id}/pickup`).set(courier.auth).send({})).status).toBe(200);
    await api().post('/api/delivery/location').set(courier.auth).send({ latitude: -1.95, longitude: 30.06 });

    const tracking = await api().get(`/api/orders/${order.id}/tracking`).set(buyer.auth);
    expect(tracking.body.shipments[0].delivery.location).toMatchObject({ latitude: -1.95, longitude: 30.06 });

    const delivered = await api().post(`/api/delivery/assignments/${delivery.id}/deliver`).set(courier.auth).send({ deliveryCode: so.deliveryCode });
    expect(delivered.status).toBe(200);
    expect(delivered.body.delivery.status).toBe('DELIVERED');
    const entry = await prisma.sellerLedgerEntry.findFirst({ where: { sellerOrderId: so.id } });
    expect(entry.amount).toBe(so.sellerNet); // marketplace collected the cash
  });

  it('lets buyers cancel before preparation and restocks the items', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const product = await createProduct(seller.shop, category, { stock: 4 });
    const order = await placeCodOrder(buyer, product, 3);
    expect((await prisma.product.findUnique({ where: { id: product.id } })).stock).toBe(1);

    const res = await api().post(`/api/orders/${order.id}/cancel`).set(buyer.auth).send({ reason: 'Changed my mind' });
    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe('CANCELLED');
    const p = await prisma.product.findUnique({ where: { id: product.id } });
    expect(p.stock).toBe(4);
    expect(p.soldCount).toBe(0);
    const sellerNotice = await prisma.notification.findFirst({ where: { userId: seller.user.id, type: 'order.cancelled' } });
    expect(sellerNotice).toBeTruthy();
  });

  it('does not let buyers cancel once the seller is preparing', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const product = await createProduct(seller.shop, category);
    const order = await placeCodOrder(buyer, product);
    await step(seller.auth, order.sellerOrders[0].id, { status: 'ACCEPTED' });
    await step(seller.auth, order.sellerOrders[0].id, { status: 'PREPARING' });
    const res = await api().post(`/api/orders/${order.id}/cancel`).set(buyer.auth).send({});
    expect(res.status).toBe(409);
  });

  it('requires a reason when a seller rejects an order', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const product = await createProduct(seller.shop, category);
    const order = await placeCodOrder(buyer, product);
    const noReason = await step(seller.auth, order.sellerOrders[0].id, { status: 'CANCELLED' });
    expect(noReason.status).toBe(422);
    const ok = await step(seller.auth, order.sellerOrders[0].id, { status: 'CANCELLED', reason: 'Item damaged in storage' });
    expect(ok.status).toBe(200);
    const notice = await prisma.notification.findFirst({ where: { userId: buyer.user.id, type: 'order.cancelled' } });
    expect(notice.body).toContain('Item damaged in storage');
  });

  it("prevents buyers from reading each other's orders", async () => {
    const owner = await userWithToken({ role: 'BUYER' });
    const intruder = await userWithToken({ role: 'BUYER' });
    const product = await createProduct(seller.shop, category);
    const order = await placeCodOrder(owner, product);
    expect((await api().get(`/api/orders/${order.id}`).set(intruder.auth)).status).toBe(404);
    expect((await api().post(`/api/orders/${order.id}/cancel`).set(intruder.auth).send({})).status).toBe(404);
  });

  it('records administrator overrides in the audit log', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const product = await createProduct(seller.shop, category);
    const order = await placeCodOrder(buyer, product);
    const so = order.sellerOrders[0];
    const noReason = await api().post(`/api/admin/seller-orders/${so.id}/status`).set(admin.auth).send({ status: 'CANCELLED' });
    expect(noReason.status).toBe(422);
    const res = await api().post(`/api/admin/seller-orders/${so.id}/status`).set(admin.auth).send({ status: 'CANCELLED', reason: 'Fraud suspected' });
    expect(res.status).toBe(200);
    const log = await prisma.auditLog.findFirst({ where: { action: 'admin.order_status_override', entityId: so.id } });
    expect(log.metadata).toMatchObject({ from: 'PLACED', to: 'CANCELLED', reason: 'Fraud suspected' });
  });
});
