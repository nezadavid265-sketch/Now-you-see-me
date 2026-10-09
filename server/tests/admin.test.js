import { beforeAll, describe, expect, it } from 'vitest';
import { api, createCategory, createProduct, createSeller, prisma, resetDb, userWithToken } from './helpers.js';

describe('administrator workflows', () => {
  let admin;

  beforeAll(async () => {
    await resetDb();
    admin = await userWithToken({ role: 'ADMIN', superAdmin: true });
  });

  it('takes a seller from registration to an approved, live shop', async () => {
    const reg = await api().post('/api/auth/register-seller').send({ name: 'Jean Paul', email: 'jp@example.com', password: 'Shop0wner123' });
    expect(reg.status).toBe(201);
    const auth = { Authorization: `Bearer ${reg.body.accessToken}` };
    expect(reg.body.user.seller.status).toBe('DRAFT');

    expect((await api().post('/api/seller/submit').set(auth)).status).toBe(422); // nothing filled yet

    const profile = await api().put('/api/seller/profile').set(auth).send({
      businessName: 'JP Electronics',
      businessType: 'INDIVIDUAL',
      businessAddress: 'KN 2 St, Kigali',
      businessPhone: '+250788555555',
      payoutMethod: 'MTN_MOMO',
      payoutAccountName: 'Jean Paul',
      payoutAccountNumber: '0788555555',
    });
    expect(profile.status).toBe(200);
    const shop = await api().post('/api/seller/shop').set(auth).send({ name: 'JP Electronics', description: 'Phones and accessories', city: 'Kigali' });
    expect(shop.status).toBe(201);
    expect(shop.body.shop.status).toBe('PENDING');
    expect((await api().post('/api/seller/submit').set(auth)).status).toBe(200);

    const pending = await api().get('/api/admin/sellers').query({ status: 'PENDING' }).set(admin.auth);
    expect(pending.body.items).toHaveLength(1);
    const profileId = pending.body.items[0].id;

    const reject = await api().post(`/api/admin/sellers/${profileId}/reject`).set(admin.auth).send({ note: 'Add your TIN number' });
    expect(reject.status).toBe(200);
    // Editing a rejected application returns it to draft so it can be resubmitted.
    await api().put('/api/seller/profile').set(auth).send({ ...profile.body.profile, registrationNumber: 'TIN 1234', businessEmail: null });
    expect((await api().post('/api/seller/submit').set(auth)).status).toBe(200);

    const approve = await api().post(`/api/admin/sellers/${profileId}/approve`).set(admin.auth).send({});
    expect(approve.status).toBe(200);
    const me = await api().get('/api/auth/me').set(auth);
    expect(me.body.user.seller).toMatchObject({ status: 'APPROVED', shop: { status: 'ACTIVE' } });
    const notice = await prisma.notification.findFirst({ where: { userId: reg.body.user.id, type: 'seller.approved' } });
    expect(notice).toBeTruthy();

    const history = await prisma.auditLog.findMany({ where: { entityType: 'SellerProfile', entityId: profileId }, orderBy: { createdAt: 'asc' } });
    expect(history.map((h) => h.action)).toEqual(expect.arrayContaining(['admin.seller_rejected', 'admin.seller_approved']));
  });

  it('suspending a seller hides the shop and its products', async () => {
    const category = await createCategory();
    const seller = await createSeller();
    const product = await createProduct(seller.shop, category);
    expect((await api().get(`/api/products/${product.slug}`)).status).toBe(200);
    const res = await api().post(`/api/admin/sellers/${seller.profile.id}/suspend`).set(admin.auth).send({ note: 'Repeated late deliveries' });
    expect(res.status).toBe(200);
    expect((await api().get(`/api/products/${product.slug}`)).status).toBe(404);
    expect((await api().post(`/api/admin/sellers/${seller.profile.id}/reinstate`).set(admin.auth).send({})).status).toBe(200);
    expect((await api().get(`/api/products/${product.slug}`)).status).toBe(200);
  });

  it('suspends users, revoking their sessions, with an audit trail', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const res = await api().patch(`/api/admin/users/${buyer.user.id}/status`).set(admin.auth).send({ status: 'SUSPENDED', reason: 'Chargeback fraud' });
    expect(res.status).toBe(200);
    expect((await api().get('/api/auth/me').set(buyer.auth)).status).toBe(403);
    expect(await prisma.refreshToken.count({ where: { userId: buyer.user.id, revokedAt: null } })).toBe(0);
    const log = await prisma.auditLog.findFirst({ where: { action: 'admin.user_suspended', entityId: buyer.user.id } });
    expect(log.actorId).toBe(admin.user.id);
  });

  it('manages categories and marketplace settings without touching the database', async () => {
    const cat = await api().post('/api/admin/categories').set(admin.auth).send({ name: 'Garden Tools', commissionRateBps: 700 });
    expect(cat.status).toBe(201);
    expect(cat.body.category.slug).toBe('garden-tools');
    const child = await api().post('/api/admin/categories').set(admin.auth).send({ name: 'Hoses', parentId: cat.body.category.id });
    expect(child.status).toBe(201);
    const grandChild = await api().post('/api/admin/categories').set(admin.auth).send({ name: 'Nozzles', parentId: child.body.category.id });
    expect(grandChild.status).toBe(409);
    expect((await api().delete(`/api/admin/categories/${cat.body.category.id}`).set(admin.auth)).status).toBe(409);
    const tree = await api().get('/api/categories');
    expect(tree.body.items.find((c) => c.slug === 'garden-tools').children[0].name).toBe('Hoses');

    const settings = await api().patch('/api/admin/settings').set(admin.auth).send({ deliveryFeeBase: 2000, refundWindowDays: 10 });
    expect(settings.status).toBe(200);
    expect(settings.body.settings).toMatchObject({ deliveryFeeBase: 2000, refundWindowDays: 10 });
    const invalid = await api().patch('/api/admin/settings').set(admin.auth).send({ defaultCommissionBps: 99_999 });
    expect(invalid.status).toBe(422);
    const config = await api().get('/api/config');
    expect(config.body.deliveryFeeBase).toBe(2000);
    const log = await prisma.auditLog.findFirst({ where: { action: 'admin.settings_updated' } });
    expect(log.metadata.deliveryFeeBase).toEqual({ from: 1500, to: 2000 });
  });

  it('manages coupons, banners and content pages', async () => {
    const coupon = await api().post('/api/admin/coupons').set(admin.auth).send({ code: 'rainy-day', type: 'PERCENTAGE', value: 15 });
    expect(coupon.status).toBe(201);
    expect(coupon.body.coupon.code).toBe('RAINY-DAY');
    expect((await api().post('/api/admin/coupons').set(admin.auth).send({ code: 'BIG', type: 'PERCENTAGE', value: 95 })).status).toBe(422);

    const banner = await api().post('/api/admin/banners').set(admin.auth).send({ title: 'Back to school', linkUrl: '/search?category=books', theme: 'accent' });
    expect(banner.status).toBe(201);
    expect((await api().post('/api/admin/banners').set(admin.auth).send({ title: 'Phish', linkUrl: 'https://evil.example' })).status).toBe(422);
    expect((await api().get('/api/home')).body.banners.map((b) => b.title)).toContain('Back to school');

    const page = await api().post('/api/admin/pages').set(admin.auth).send({ slug: 'faq', title: 'FAQ', body: 'Frequently asked questions and answers.' });
    expect(page.status).toBe(201);
    expect((await api().get('/api/content/faq')).body.page.title).toBe('FAQ');
  });

  it('publishes announcements to sellers as notifications', async () => {
    const seller = await createSeller();
    const created = await api().post('/api/admin/announcements').set(admin.auth).send({ title: 'New payout schedule', body: 'Payouts now run every Tuesday and Friday.', audience: 'SELLERS' });
    const published = await api().post(`/api/admin/announcements/${created.body.announcement.id}/publish`).set(admin.auth);
    expect(published.status).toBe(200);
    expect(published.body.recipients).toBeGreaterThanOrEqual(1);
    expect(await prisma.notification.count({ where: { userId: seller.user.id, type: 'announcement' } })).toBe(1);
  });

  it('exports CSV reports with formula-injection protection', async () => {
    const category = await createCategory();
    const seller = await createSeller();
    await createProduct(seller.shop, category, { name: '=HYPERLINK("http://evil")' });
    const res = await api().get('/api/admin/reports/products').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(await prisma.auditLog.count({ where: { action: 'admin.report_exported' } })).toBe(1);
  });

  it('handles support tickets between buyers, sellers and administrators', async () => {
    const buyer = await userWithToken({ role: 'BUYER' });
    const created = await api().post('/api/support/tickets').set(buyer.auth).send({ type: 'GENERAL', subject: 'Question about delivery', message: 'Do you deliver to Musanze district?' });
    expect(created.status).toBe(201);
    const id = created.body.ticket.id;
    const reply = await api().post(`/api/admin/tickets/${id}/messages`).set(admin.auth).send({ body: 'Yes, within 2–3 days.' });
    expect(reply.status).toBe(201);
    const note = await api().post(`/api/admin/tickets/${id}/messages`).set(admin.auth).send({ body: 'Internal: check courier coverage', isInternal: true });
    expect(note.status).toBe(201);
    const view = await api().get(`/api/support/tickets/${id}`).set(buyer.auth);
    expect(view.body.ticket.messages.map((m) => m.body)).toEqual(['Do you deliver to Musanze district?', 'Yes, within 2–3 days.']);
    const other = await userWithToken({ role: 'BUYER' });
    expect((await api().get(`/api/support/tickets/${id}`).set(other.auth)).status).toBe(404);
  });

  it('shows a security overview of failed logins and locked accounts', async () => {
    await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Wrong12345' });
    const res = await api().get('/api/admin/security').set(admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.last24h.failedLogins).toBeGreaterThanOrEqual(1);
  });
});
