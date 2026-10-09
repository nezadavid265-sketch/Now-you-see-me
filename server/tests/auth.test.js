import { beforeAll, describe, expect, it } from 'vitest';
import { api, createUser, login, PASSWORD, prisma, resetDb } from './helpers.js';
import { memoryOutbox } from '../src/services/email.js';

const CSRF = { 'X-Requested-With': 'XMLHttpRequest' };

function cookieValue(setCookie) {
  return setCookie?.find((c) => c.startsWith('rs_refresh='))?.split(';')[0];
}

describe('authentication', () => {
  beforeAll(resetDb);

  it('registers a buyer, hashes the password with Argon2id and starts a session', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Ada Uwase', email: 'Ada@Example.com', password: 'GoodPass123' });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.user).toMatchObject({ email: 'ada@example.com', role: 'BUYER', emailVerified: false });
    expect(res.body.user.passwordHash).toBeUndefined();

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('rs_refresh='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/auth/);

    const stored = await prisma.user.findUnique({ where: { email: 'ada@example.com' } });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
    expect(memoryOutbox.some((m) => m.subject?.includes('Confirm'))).toBe(false); // queued as a job, not sent inline
  });

  it('rejects weak passwords and duplicate e-mails', async () => {
    const weak = await api().post('/api/auth/register').send({ name: 'Weak', email: 'weak@example.com', password: 'password1' });
    expect(weak.status).toBe(422);
    expect(weak.body.error.details.fieldErrors.password).toBeTruthy();

    const dup = await api().post('/api/auth/register').send({ name: 'Ada Two', email: 'ada@example.com', password: 'GoodPass123' });
    expect(dup.status).toBe(409);
  });

  it('cannot self-register as an administrator (role is not accepted from the client)', async () => {
    const res = await api().post('/api/auth/register').send({ name: 'Mallory', email: 'mallory@example.com', password: 'GoodPass123', role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe('BUYER');
  });

  it('uses the same error for unknown e-mail and wrong password', async () => {
    const user = await createUser();
    const wrong = await api().post('/api/auth/login').send({ email: user.email, password: 'Nope12345' });
    const unknown = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Nope12345' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('locks an account after 5 failed attempts', async () => {
    const user = await createUser();
    for (let i = 0; i < 5; i++) {
      await api().post('/api/auth/login').send({ email: user.email, password: 'Wrong-pass-1' });
    }
    const locked = await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD });
    expect(locked.status).toBe(423);
    expect(locked.body.error.code).toBe('ACCOUNT_LOCKED');
    const logs = await prisma.auditLog.count({ where: { action: 'auth.account_locked', entityId: user.id } });
    expect(logs).toBe(1);
  });

  it('blocks suspended users even with a valid token', async () => {
    const user = await createUser();
    const { token } = await login(user);
    await prisma.user.update({ where: { id: user.id }, data: { status: 'SUSPENDED' } });
    const res = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('rejects tampered or foreign access tokens', async () => {
    const user = await createUser();
    const { token } = await login(user);
    const [h, p, s] = token.split('.');
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    payload.role = 'ADMIN';
    const forged = `${h}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.${s}`;
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${forged}`)).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
  });

  describe('refresh tokens', () => {
    it('rotates the refresh token and requires the anti-CSRF header', async () => {
      const user = await createUser();
      const { cookie } = await login(user);
      const c1 = cookieValue(cookie);

      const noHeader = await api().post('/api/auth/refresh').set('Cookie', c1);
      expect(noHeader.status).toBe(403);

      const badOrigin = await api().post('/api/auth/refresh').set('Cookie', c1).set(CSRF).set('Origin', 'https://evil.example');
      expect(badOrigin.status).toBe(403);

      const ok = await api().post('/api/auth/refresh').set('Cookie', c1).set(CSRF);
      expect(ok.status).toBe(200);
      expect(ok.body.accessToken).toBeTruthy();
      const c2 = cookieValue(ok.headers['set-cookie']);
      expect(c2).toBeTruthy();
      expect(c2).not.toBe(c1);
    });

    it('detects reuse of a rotated refresh token and revokes the whole session family', async () => {
      const user = await createUser();
      const { cookie } = await login(user);
      const c1 = cookieValue(cookie);
      const r1 = await api().post('/api/auth/refresh').set('Cookie', c1).set(CSRF);
      const c2 = cookieValue(r1.headers['set-cookie']);

      // Simulate the old token being replayed after the grace window.
      await prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: { not: null } }, data: { revokedAt: new Date(Date.now() - 60_000) } });
      const replay = await api().post('/api/auth/refresh').set('Cookie', c1).set(CSRF);
      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('SESSION_REVOKED');

      // The legitimate newer token is now revoked too.
      const after = await api().post('/api/auth/refresh').set('Cookie', c2).set(CSRF);
      expect(after.status).toBe(401);
      // Each replay of a revoked token is recorded for security monitoring.
      expect(await prisma.auditLog.count({ where: { action: 'auth.refresh_token_reuse', actorId: user.id } })).toBeGreaterThanOrEqual(1);
    });

    it('logout revokes the refresh token', async () => {
      const user = await createUser();
      const { cookie } = await login(user);
      const c1 = cookieValue(cookie);
      expect((await api().post('/api/auth/logout').set('Cookie', c1).set(CSRF)).status).toBe(204);
      expect((await api().post('/api/auth/refresh').set('Cookie', c1).set(CSRF)).status).toBe(401);
    });
  });

  describe('password recovery', () => {
    it('does not reveal whether an account exists', async () => {
      const res = await api().post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
      expect(res.status).toBe(200);
      expect(await prisma.job.count({ where: { type: 'email.send', payload: { path: ['to'], equals: 'ghost@example.com' } } })).toBe(0);
    });

    it('resets the password with a single-use token and signs out other sessions', async () => {
      const user = await createUser();
      const { cookie } = await login(user);
      await api().post('/api/auth/forgot-password').send({ email: user.email });
      const job = await prisma.job.findFirst({ where: { type: 'email.send', payload: { path: ['to'], equals: user.email } }, orderBy: { createdAt: 'desc' } });
      const token = new URL(job.payload.cta.url).searchParams.get('token');
      expect(token).toBeTruthy();

      const reset = await api().post('/api/auth/reset-password').send({ token, password: 'BrandNew123' });
      expect(reset.status).toBe(200);
      const reused = await api().post('/api/auth/reset-password').send({ token, password: 'Another123' });
      expect(reused.status).toBe(422);

      expect((await api().post('/api/auth/refresh').set('Cookie', cookieValue(cookie)).set(CSRF)).status).toBe(401);
      expect((await api().post('/api/auth/login').send({ email: user.email, password: 'BrandNew123' })).status).toBe(200);
      expect((await api().post('/api/auth/login').send({ email: user.email, password: PASSWORD })).status).toBe(401);
    });

    it('verifies e-mail addresses with a token', async () => {
      const res = await api().post('/api/auth/register').send({ name: 'Eve Ishimwe', email: 'eve@example.com', password: 'GoodPass123' });
      const job = await prisma.job.findFirst({ where: { type: 'email.send', payload: { path: ['to'], equals: 'eve@example.com' } } });
      const token = new URL(job.payload.cta.url).searchParams.get('token');
      expect((await api().post('/api/auth/verify-email').send({ token })).status).toBe(200);
      const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${res.body.accessToken}`);
      expect(me.body.user.emailVerified).toBe(true);
    });
  });

  it('applies rate limiting to login attempts', async () => {
    process.env.TEST_RATE_LIMIT = '1';
    try {
      let limited = false;
      for (let i = 0; i < 40 && !limited; i++) {
        const res = await api().post('/api/auth/login').send({ email: `rl${i}@example.com`, password: 'Whatever123' });
        limited = res.status === 429;
      }
      expect(limited).toBe(true);
    } finally {
      delete process.env.TEST_RATE_LIMIT;
    }
  });
});
