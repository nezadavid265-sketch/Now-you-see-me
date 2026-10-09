import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { authLimiter, sensitiveLimiter } from '../../middleware/rateLimit.js';
import { authController as c } from './auth.controller.js';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema, verifyEmailSchema } from './auth.schemas.js';

const router = Router();

router.post('/register', authLimiter, validate({ body: registerSchema }), c.register);
router.post('/register-seller', authLimiter, validate({ body: registerSchema }), c.registerSeller);
router.post('/login', authLimiter, validate({ body: loginSchema }), c.login);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);
router.get('/me', authenticate, c.me);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), c.forgotPassword);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), c.resetPassword);
router.post('/verify-email', sensitiveLimiter, validate({ body: verifyEmailSchema }), c.verifyEmail);
router.post('/resend-verification', authenticate, sensitiveLimiter, c.resendVerification);

export default router;
