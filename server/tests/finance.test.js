import { beforeAll, describe, expect, it } from 'vitest';
import { addToCart, api, checkout, createAddress, createCategory, createProduct, createSeller, prisma, resetDb, userWithToken } from './helpers.js';

const step = (auth, id, body) => api().post(`/api/seller/orders/${id}/status`).set(auth).send(body);

describe('refunds, earnings and payouts', () => {
  let category;
  let seller;
  let finance;
  let buyer;
  let order;
  let so;

  beforeAll(async () => {
    await resetDb();
    category = await createCategory({ commissionRateBps: 1000 });
    seller = await createSeller({ fulfillmentMode: 'MARKETPLACE' });
    finance = await userWithToken({ role: 'ADMIN', permissions: ['finance', 'orders'] });
    buyer = await userWithToken({ role: 'BUYER' });
    const courier = await userWithToken({ role: 'DELIVERY' });
    const address = await createAddress(buyer.user.id);
    const product = await createProduct(seller.shop, category, { price: 10_000, stock: 10 });
    await addToCart(buyer.auth, product.id, 3);
    const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'CASH_ON_DELIVERY' });
    order = await prisma.order.findUnique({ where: { id: res.body.order.id }, include: { sellerOrders: { include: { items: true } } } });
    so = order.sellerOrders[0];
    for (const status of ['ACCEPTED', 'PREPARING', 'READY']) await step(seller.auth, so.id, { status });
    const delivery = await prisma.delivery.findUnique({ where: { sellerOrderId: so.id } });
    await api().post(`/api/admin/deliveries/${delivery.id}/assign`).set(finance.auth).send({ staffId: courier.user.id });
    await api().post(`/api/delivery/assignments/${delivery.id}/pickup`).set(courier.auth).send({});
    const done = await api().post(`/api/delivery/assignments/${delivery.id}/deliver`).set(courier.auth).send({ deliveryCode: so.deliveryCode });
    expect(done.status).toBe(200);
  });

  it('creates a held seller earning on delivery', async () => {
    const res = await api().get('/api/seller/finance').set(seller.auth);
    expect(res.status).toBe(200);
    // 3 × 10,000 = 30,000 − 10% commission = 27,000 (delivery fee kept by the marketplace courier)
    expect(res.body.balance).toMatchObject({ pending: 27_000, available: 0, totalEarned: 27_000 });
  });

  it('validates refund requests (quantity, ownership)', async () => {
    const item = so.items[0];
    const tooMany = await api().post('/api/refunds').set(buyer.auth).send({ sellerOrderId: so.id, items: [{ orderItemId: item.id, quantity: 4 }], reason: 'Damaged' });
    expect(tooMany.status).toBe(422);
    const other = await userWithToken({ role: 'BUYER' });
    const notMine = await api().post('/api/refunds').set(other.auth).send({ sellerOrderId: so.id, items: [{ orderItemId: item.id, quantity: 1 }], reason: 'Damaged' });
    expect(notMine.status).toBe(404);
  });

  it('approves a partial refund, deducts the seller balance and restocks', async () => {
    const item = so.items[0];
    const req = await api().post('/api/refunds').set(buyer.auth).send({ sellerOrderId: so.id, items: [{ orderItemId: item.id, quantity: 1 }], reason: 'Arrived damaged', details: 'Cracked screen' });
    expect(req.status).toBe(201);
    expect(req.body.refund.amount).toBe(10_000);

    // The seller can respond before the review…
    const respond = await api().post(`/api/seller/refunds/${req.body.refund.id}/respond`).set(seller.auth).send({ response: 'Packed carefully — happy to replace.' });
    expect(respond.status).toBe(200);

    const stockBefore = (await prisma.product.findUnique({ where: { id: item.productId } })).stock;
    const approve = await api().post(`/api/admin/refunds/${req.body.refund.id}/approve`).set(finance.auth).send({ note: 'Photo evidence provided', restock: true });
    expect(approve.status).toBe(200);
    expect((await prisma.product.findUnique({ where: { id: item.productId } })).stock).toBe(stockBefore + 1);

    const deduction = await prisma.sellerLedgerEntry.findFirst({ where: { refundId: req.body.refund.id } });
    expect(deduction).toMatchObject({ type: 'REFUND_DEDUCTION', amount: -9000 }); // 10,000 − 1,000 commission returned

    const again = await api().post(`/api/admin/refunds/${req.body.refund.id}/approve`).set(finance.auth).send({});
    expect(again.status).toBe(409);

    const complete = await api().post(`/api/admin/refunds/${req.body.refund.id}/complete`).set(finance.auth).send({ reference: 'MOMO-REF-778' });
    expect(complete.status).toBe(200);
    expect((await prisma.order.findUnique({ where: { id: order.id } })).paymentStatus).toBe('PARTIALLY_REFUNDED');
  });

  it('pays out only the available balance, once', async () => {
    // Make the earning available (as if the holding period had passed).
    await prisma.sellerLedgerEntry.updateMany({ where: { shopId: seller.shop.id }, data: { availableAt: new Date(Date.now() - 1000) } });
    const balance = (await api().get('/api/seller/finance').set(seller.auth)).body.balance;
    expect(balance.available).toBe(18_000);

    const tooMuch = await api().post('/api/admin/payouts').set(finance.auth).send({ shopId: seller.shop.id, amount: 50_000 });
    expect(tooMuch.status).toBe(422);

    const [p1, p2] = await Promise.all([
      api().post('/api/admin/payouts').set(finance.auth).send({ shopId: seller.shop.id }),
      api().post('/api/admin/payouts').set(finance.auth).send({ shopId: seller.shop.id }),
    ]);
    expect([p1.status, p2.status].sort()).toEqual([201, 422]);
    const payout = (p1.status === 201 ? p1 : p2).body.payout;
    expect(payout).toMatchObject({ amount: 18_000, method: 'MTN_MOMO', accountNumber: '0788000000' });

    expect((await api().post(`/api/admin/payouts/${payout.id}/paid`).set(finance.auth).send({ reference: 'TXN-1' })).status).toBe(200);
    const after = (await api().get('/api/seller/finance').set(seller.auth)).body;
    expect(after.balance.available).toBe(0);
    expect(after.balance.totalPaidOut).toBe(18_000);
    expect(after.payouts[0].status).toBe('PAID');
    expect(await prisma.auditLog.count({ where: { action: { in: ['admin.payout_created', 'admin.payout_paid'] } } })).toBe(2);
  });

  it('cancelling a payout returns the money to the seller balance', async () => {
    await prisma.sellerLedgerEntry.create({ data: { shopId: seller.shop.id, type: 'ADJUSTMENT', amount: 10_000, description: 'Test credit' } });
    const created = await api().post('/api/admin/payouts').set(finance.auth).send({ shopId: seller.shop.id });
    expect(created.status).toBe(201);
    expect((await api().post(`/api/admin/payouts/${created.body.payout.id}/cancel`).set(finance.auth).send({ note: 'Wrong number' })).status).toBe(200);
    expect((await api().get('/api/seller/finance').set(seller.auth)).body.balance.available).toBe(10_000);
  });

  it('lets buyers review delivered purchases only once (verified purchase)', async () => {
    const item = so.items[0];
    const review = await api().post('/api/reviews').set(buyer.auth).send({ orderItemId: item.id, rating: 4, body: 'Good product, fast delivery.' });
    expect(review.status).toBe(201);
    const product = await prisma.product.findUnique({ where: { id: item.productId } });
    expect(product).toMatchObject({ ratingAvg: 4, ratingCount: 1 });
    const dup = await api().post('/api/reviews').set(buyer.auth).send({ orderItemId: item.id, rating: 5, body: 'Trying to review twice here.' });
    expect(dup.status).toBe(409);

    const stranger = await userWithToken({ role: 'BUYER' });
    expect((await api().post('/api/reviews').set(stranger.auth).send({ orderItemId: item.id, rating: 1, body: 'Never bought this product.' })).status).toBe(404);

    const reply = await api().post(`/api/seller/reviews/${review.body.review.id}/reply`).set(seller.auth).send({ reply: 'Thank you for shopping with us!' });
    expect(reply.status).toBe(200);
    const pub = await api().get(`/api/products/${product.slug}/reviews`);
    expect(pub.body.items[0]).toMatchObject({ rating: 4, verifiedPurchase: true, sellerReply: 'Thank you for shopping with us!' });
    expect(pub.body.items[0].author).not.toContain('@');
  });
});
