import { beforeAll, describe, expect, it } from 'vitest';
import { api, createSeller, resetDb, userWithToken } from './helpers.js';

describe('role-based access control', () => {
  let buyer;
  let seller;
  let courier;
  let superAdmin;
  let supportAdmin;

  beforeAll(async () => {
    await resetDb();
    buyer = await userWithToken({ role: 'BUYER' });
    seller = await createSeller();
    courier = await userWithToken({ role: 'DELIVERY' });
    superAdmin = await userWithToken({ role: 'ADMIN', superAdmin: true });
    supportAdmin = await userWithToken({ role: 'ADMIN', permissions: ['support'] });
  });

  const protectedEndpoints = [
    ['get', '/api/auth/me'],
    ['get', '/api/cart'],
    ['get', '/api/orders'],
    ['get', '/api/wishlist'],
    ['post', '/api/checkout'],
    ['get', '/api/notifications'],
    ['get', '/api/seller/dashboard'],
    ['get', '/api/delivery/assignments'],
    ['get', '/api/admin/dashboard'],
    ['get', '/api/admin/users'],
    ['post', '/api/uploads/images'],
  ];

  it.each(protectedEndpoints)('%s %s requires authentication', async (method, url) => {
    const res = await api()[method](url);
    expect(res.status).toBe(401);
  });

  it('buyers cannot use seller, delivery or admin APIs', async () => {
    for (const url of ['/api/seller/dashboard', '/api/seller/products', '/api/delivery/assignments', '/api/admin/dashboard', '/api/admin/users']) {
      expect((await api().get(url).set(buyer.auth)).status, url).toBe(403);
    }
  });

  it('sellers cannot use buyer-only, delivery or admin APIs', async () => {
    for (const url of ['/api/cart', '/api/orders', '/api/delivery/assignments', '/api/admin/dashboard', '/api/admin/sellers']) {
      expect((await api().get(url).set(seller.auth)).status, url).toBe(403);
    }
  });

  it('delivery staff cannot use seller or admin APIs', async () => {
    for (const url of ['/api/seller/orders', '/api/admin/orders', '/api/cart']) {
      expect((await api().get(url).set(courier.auth)).status, url).toBe(403);
    }
    expect((await api().get('/api/delivery/assignments').set(courier.auth)).status).toBe(200);
  });

  it('administrators are limited to the areas they have permission for', async () => {
    expect((await api().get('/api/admin/dashboard').set(supportAdmin.auth)).status).toBe(200);
    expect((await api().get('/api/admin/tickets').set(supportAdmin.auth)).status).toBe(200);
    for (const url of ['/api/admin/payments', '/api/admin/settings', '/api/admin/sellers', '/api/admin/audit-logs', '/api/admin/users']) {
      expect((await api().get(url).set(supportAdmin.auth)).status, url).toBe(403);
    }
    expect((await api().patch('/api/admin/settings').set(supportAdmin.auth).send({ defaultCommissionBps: 0 })).status).toBe(403);
  });

  it('super administrators can access every admin area', async () => {
    for (const url of ['/api/admin/payments', '/api/admin/settings', '/api/admin/sellers', '/api/admin/audit-logs', '/api/admin/users', '/api/admin/security']) {
      expect((await api().get(url).set(superAdmin.auth)).status, url).toBe(200);
    }
  });

  it('only super administrators can create administrators or change permissions', async () => {
    const usersAdmin = await userWithToken({ role: 'ADMIN', permissions: ['users'] });
    const create = await api().post('/api/admin/users').set(usersAdmin.auth).send({
      name: 'New Admin',
      email: 'new-admin@example.com',
      password: 'StrongPass123',
      role: 'ADMIN',
      adminPermissions: ['settings'],
    });
    expect(create.status).toBe(403);

    // ...but they can create delivery staff.
    const staff = await api().post('/api/admin/users').set(usersAdmin.auth).send({ name: 'Courier Two', email: 'courier2@example.com', password: 'StrongPass123', role: 'DELIVERY' });
    expect(staff.status).toBe(201);

    const escalate = await api().patch(`/api/admin/users/${usersAdmin.user.id}/permissions`).set(usersAdmin.auth).send({ adminPermissions: ['settings', 'finance'] });
    expect(escalate.status).toBe(403);
  });

  it('an administrator cannot suspend themselves', async () => {
    const res = await api().patch(`/api/admin/users/${superAdmin.user.id}/status`).set(superAdmin.auth).send({ status: 'SUSPENDED' });
    expect(res.status).toBe(403);
  });

  it('public catalogue endpoints need no authentication', async () => {
    for (const url of ['/api/home', '/api/categories', '/api/products', '/api/config', '/api/health']) {
      expect((await api().get(url)).status, url).toBe(200);
    }
  });
});
