import crypto from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { addToCart, api, checkout, createAddress, createCategory, createProduct, createSeller, prisma, resetDb, userWithToken } from './helpers.js';
import { signTestWebhook } from '../src/integrations/payments/test.js';
import { expireUnpaidOrders } from '../src/domain/payments.js';
import { momoMsisdn, momoProvider } from '../src/integrations/payments/momo.js';
import { airtelMsisdn, airtelProvider } from '../src/integrations/payments/airtel.js';

function sendWebhook(body, { signature } = {}) {
  const raw = JSON.stringify(body);
  return api()
    .post('/api/webhooks/test')
    .set('Content-Type', 'application/json')
    .set('X-Rivo-Signature', signature ?? signTestWebhook(raw))
    .send(raw);
}

describe('payments', () => {
  let category;
  let seller;

  beforeAll(async () => {
    await resetDb();
    category = await createCategory();
    seller = await createSeller();
  });

  async function pendingOrder({ stock = 5, quantity = 1 } = {}) {
    const buyer = await userWithToken({ role: 'BUYER' });
    const address = await createAddress(buyer.user.id);
    const product = await createProduct(seller.shop, category, { price: 15_000, stock });
    await addToCart(buyer.auth, product.id, quantity);
    const res = await checkout(buyer.auth, { addressId: address.id, paymentMethod: 'TEST', payerPhone: '0788123456' });
    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PENDING_PAYMENT');
    expect(res.body.payment.status).toBe('PENDING');
    const payment = await prisma.payment.findUnique({ where: { id: res.body.payment.id } });
    return { buyer, product, orderId: res.body.order.id, payment };
  }

  it('confirms an order only after a correctly signed provider event', async () => {
    const { orderId, payment, buyer } = await pendingOrder();
    expect(payment.amount).toBe(16_500); // 15,000 + delivery, from the server
    expect(payment.payerPhone).toBe('••••••3456');

    // Sellers do not see unpaid orders.
    expect((await api().get('/api/seller/orders').set(seller.auth)).body.items).toHaveLength(0);

    const forged = await sendWebhook({ eventId: 'evt_1', reference: payment.providerReference, status: 'SUCCEEDED' }, { signature: 'sha256=deadbeef' });
    expect(forged.status).toBe(401);
    expect((await prisma.order.findUnique({ where: { id: orderId } })).status).toBe('PENDING_PAYMENT');

    const ok = await sendWebhook({ eventId: 'evt_1', reference: payment.providerReference, status: 'SUCCEEDED' });
    expect(ok.status).toBe(200);
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { sellerOrders: true } });
    expect(order).toMatchObject({ status: 'PROCESSING', paymentStatus: 'PAID' });
    expect(order.sellerOrders[0].status).toBe('PLACED');
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: 'order.new' } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: buyer.user.id, type: 'payment.succeeded' } })).toBe(1);
  });

  it('processes duplicate webhook deliveries exactly once', async () => {
    const { orderId, payment } = await pendingOrder();
    const event = { eventId: `evt_${crypto.randomUUID()}`, reference: payment.providerReference, status: 'SUCCEEDED' };
    const results = await Promise.all([sendWebhook(event), sendWebhook(event), sendWebhook(event)]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(results.filter((r) => r.body.duplicate).length).toBe(2);
    expect(await prisma.orderStatusEvent.count({ where: { orderId, status: 'PLACED' } })).toBe(1);
    expect(await prisma.paymentEvent.count({ where: { eventId: event.eventId } })).toBe(1);
  });

  it('keeps the order payable after a failed payment and allows a retry', async () => {
    const { orderId, payment, buyer } = await pendingOrder();
    await sendWebhook({ eventId: `evt_${crypto.randomUUID()}`, reference: payment.providerReference, status: 'FAILED', reason: 'Insufficient balance' });
    let order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order).toMatchObject({ status: 'PENDING_PAYMENT', paymentStatus: 'FAILED' });

    const view = await api().get(`/api/orders/${orderId}`).set(buyer.auth);
    expect(view.body.order.canPay).toBe(true);
    expect(view.body.order.payments[0].failureReason).toBe('Insufficient balance');

    const retry = await api().post(`/api/orders/${orderId}/pay`).set(buyer.auth).send({ paymentMethod: 'TEST', payerPhone: '0788123456' });
    expect(retry.status).toBe(200);
    const sim = await api().post(`/api/payments/${retry.body.payment.id}/simulate`).set(buyer.auth).send({ outcome: 'success' });
    expect(sim.status).toBe(200);
    order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order.paymentStatus).toBe('PAID');
  });

  it('opens a refund when money arrives for an order that was already paid', async () => {
    const { orderId, payment, buyer } = await pendingOrder();
    const retry = await api().post(`/api/orders/${orderId}/pay`).set(buyer.auth).send({ paymentMethod: 'TEST', payerPhone: '0788123456' });
    await api().post(`/api/payments/${retry.body.payment.id}/simulate`).set(buyer.auth).send({ outcome: 'success' });
    // The first (superseded) attempt is approved late on the phone.
    await sendWebhook({ eventId: `evt_${crypto.randomUUID()}`, reference: payment.providerReference, status: 'SUCCEEDED' });
    const refund = await prisma.refund.findFirst({ where: { orderId, paymentId: payment.id } });
    expect(refund).toMatchObject({ status: 'APPROVED', isAutomatic: true, amount: payment.amount });
  });

  it('expires unpaid orders and returns the reserved stock', async () => {
    const { orderId, product } = await pendingOrder({ stock: 2, quantity: 2 });
    expect((await prisma.product.findUnique({ where: { id: product.id } })).stock).toBe(0);
    await prisma.order.update({ where: { id: orderId }, data: { paymentExpiresAt: new Date(Date.now() - 1000) } });
    expect(await expireUnpaidOrders()).toBe(1);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order.status).toBe('CANCELLED');
    expect((await prisma.product.findUnique({ where: { id: product.id } })).stock).toBe(2);
  });

  it('refunds paid orders automatically when they are cancelled', async () => {
    const { orderId, payment, buyer } = await pendingOrder();
    await sendWebhook({ eventId: `evt_${crypto.randomUUID()}`, reference: payment.providerReference, status: 'SUCCEEDED' });
    const res = await api().post(`/api/orders/${orderId}/cancel`).set(buyer.auth).send({ reason: 'Ordered by mistake' });
    expect(res.status).toBe(200);
    const refund = await prisma.refund.findFirst({ where: { orderId } });
    expect(refund).toMatchObject({ status: 'APPROVED', isAutomatic: true, amount: 16_500 });
  });

  it('does not allow simulating payments on orders of other buyers', async () => {
    const { payment } = await pendingOrder();
    const intruder = await userWithToken({ role: 'BUYER' });
    expect((await api().post(`/api/payments/${payment.id}/simulate`).set(intruder.auth).send({ outcome: 'success' })).status).toBe(404);
    expect((await api().get(`/api/payments/${payment.id}`).set(intruder.auth)).status).toBe(404);
  });
});

describe('mobile money adapters', () => {
  afterEach(() => {
    momoProvider._resetTokenCache();
    airtelProvider._resetTokenCache();
  });

  const json = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) });

  it('normalises Rwandan phone numbers for each provider', () => {
    expect(momoMsisdn('0788 123 456')).toBe('250788123456');
    expect(momoMsisdn('+250788123456')).toBe('250788123456');
    expect(airtelMsisdn('+250 731 234 567')).toBe('731234567');
    expect(airtelMsisdn('0731234567')).toBe('731234567');
  });

  it('MTN MoMo: sends request-to-pay and maps the verified status', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/collection/token/')) return json(200, { access_token: 'tok', expires_in: 3600 });
      if (url.endsWith('/requesttopay')) return json(202, {});
      return json(200, { status: 'SUCCESSFUL', amount: '16500', currency: 'EUR', financialTransactionId: 'FT123' });
    });
    const payment = { id: 'pay_1', amount: 16_500, providerReference: crypto.randomUUID() };
    const init = await momoProvider.initiate({ payment, order: { orderNumber: 'RS-1' }, phone: '0788123456' }, { fetchImpl });
    expect(init.status).toBe('PENDING');
    const rtp = calls.find((c) => c.url.endsWith('/requesttopay'));
    expect(rtp.init.headers['X-Reference-Id']).toBe(payment.providerReference);
    expect(JSON.parse(rtp.init.body)).toMatchObject({ amount: '16500', externalId: 'pay_1', payer: { partyIdType: 'MSISDN', partyId: '250788123456' } });

    const status = await momoProvider.checkStatus(payment, { fetchImpl });
    expect(status).toMatchObject({ status: 'SUCCEEDED', providerTransactionId: 'FT123' });
  });

  it('MTN MoMo: treats an amount mismatch as a failure', async () => {
    const fetchImpl = async (url) =>
      url.endsWith('/collection/token/') ? json(200, { access_token: 'tok', expires_in: 3600 }) : json(200, { status: 'SUCCESSFUL', amount: '100', currency: 'EUR' });
    const res = await momoProvider.checkStatus({ amount: 16_500, providerReference: 'x' }, { fetchImpl });
    expect(res).toMatchObject({ status: 'FAILED', mismatch: true });
  });

  it('Airtel Money: maps TS/TF/TIP transaction states', async () => {
    let state = 'TIP';
    const fetchImpl = async (url) =>
      url.endsWith('/auth/oauth2/token') ? json(200, { access_token: 'tok', expires_in: 180 }) : json(200, { data: { transaction: { status: state, airtel_money_id: 'AM1', message: 'Declined' } } });
    const p = { amount: 1000, providerReference: 'RS1' };
    expect((await airtelProvider.checkStatus(p, { fetchImpl })).status).toBe('PENDING');
    state = 'TS';
    expect(await airtelProvider.checkStatus(p, { fetchImpl })).toMatchObject({ status: 'SUCCEEDED', providerTransactionId: 'AM1' });
    state = 'TF';
    expect((await airtelProvider.checkStatus(p, { fetchImpl })).status).toBe('FAILED');
  });
});
