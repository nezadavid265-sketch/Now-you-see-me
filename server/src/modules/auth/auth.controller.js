import { config } from '../../config/env.js';
import { forbidden } from '../../lib/errors.js';
import { clientInfo } from '../../lib/http.js';
import { REFRESH_COOKIE, refreshCookieOptions, revokeRefreshToken, rotateRefreshToken, signAccessToken } from '../../services/tokens.js';
import * as auth from './auth.service.js';

function setRefreshCookie(res, token) {
  res.cookie(REFRESH_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res) {
  const { maxAge: _maxAge, ...opts } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, opts);
}

/**
 * Cookie-authenticated endpoints (refresh/logout) require a custom header and
 * a trusted Origin. Browsers cannot send custom headers cross-site without a
 * CORS preflight, which our CORS policy rejects — this blocks CSRF in
 * addition to the SameSite=Strict cookie.
 */
function assertCsrfSafe(req) {
  if (req.get('x-requested-with') !== 'XMLHttpRequest') throw forbidden('Missing anti-CSRF header', { code: 'CSRF' });
  const origin = req.get('origin');
  if (origin) {
    const allowed = new Set([new URL(config.APP_URL).origin, ...config.corsOrigins, `${req.protocol}://${req.get('host')}`]);
    if (!allowed.has(origin)) throw forbidden('Untrusted origin', { code: 'CSRF' });
  }
}

async function respondWithSession(req, res, user, status = 200) {
  const session = await auth.createSession(user, clientInfo(req));
  setRefreshCookie(res, session.refreshToken);
  const full = await auth.getUserWithRelations(user.id);
  res.status(status).json({ accessToken: session.accessToken, user: auth.toUserDto(full) });
}

export const authController = {
  async register(req, res) {
    const user = await auth.register(req.valid.body, 'BUYER', req);
    await respondWithSession(req, res, user, 201);
  },

  async registerSeller(req, res) {
    const user = await auth.register(req.valid.body, 'SELLER', req);
    await respondWithSession(req, res, user, 201);
  },

  async login(req, res) {
    const user = await auth.login(req.valid.body, req);
    await respondWithSession(req, res, user);
  },

  async refresh(req, res) {
    assertCsrfSafe(req);
    try {
      const { user, raw } = await rotateRefreshToken(req.cookies?.[REFRESH_COOKIE], clientInfo(req));
      if (!user || user.status !== 'ACTIVE') {
        clearRefreshCookie(res);
        throw forbidden('This account has been suspended.', { code: 'ACCOUNT_SUSPENDED' });
      }
      setRefreshCookie(res, raw);
      const full = await auth.getUserWithRelations(user.id);
      res.json({ accessToken: signAccessToken(user), user: auth.toUserDto(full) });
    } catch (err) {
      clearRefreshCookie(res);
      throw err;
    }
  },

  async logout(req, res) {
    assertCsrfSafe(req);
    await revokeRefreshToken(req.cookies?.[REFRESH_COOKIE]);
    clearRefreshCookie(res);
    res.status(204).end();
  },

  async me(req, res) {
    const user = await auth.getUserWithRelations(req.user.id);
    res.json({ user: auth.toUserDto(user) });
  },

  async forgotPassword(req, res) {
    await auth.requestPasswordReset(req.valid.body, req);
    res.json({ message: 'If an account exists for that email, a reset link is on its way.' });
  },

  async resetPassword(req, res) {
    await auth.resetPassword(req.valid.body, req);
    clearRefreshCookie(res);
    res.json({ message: 'Your password has been updated. Please sign in with your new password.' });
  },

  async verifyEmail(req, res) {
    await auth.verifyEmail(req.valid.body, req);
    res.json({ message: 'Thanks! Your email address is confirmed.' });
  },

  async resendVerification(req, res) {
    await auth.resendVerification(req.user.id);
    res.json({ message: 'A new confirmation email is on its way.' });
  },
};
