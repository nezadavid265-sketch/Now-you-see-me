import { Router } from 'express';
import { prisma } from './lib/prisma.js';
import authRoutes from './modules/auth/auth.routes.js';
import accountRoutes from './modules/account/account.routes.js';
import catalogRoutes from './modules/catalog/catalog.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import wishlistRoutes from './modules/wishlist/wishlist.routes.js';
import checkoutRoutes from './modules/checkout/checkout.routes.js';
import orderRoutes from './modules/orders/orders.routes.js';
import paymentRoutes from './modules/payments/payments.routes.js';
import webhookRoutes from './modules/webhooks/webhooks.routes.js';
import refundRoutes from './modules/refunds/refunds.routes.js';
import reviewRoutes from './modules/reviews/reviews.routes.js';
import notificationRoutes from './modules/notifications/notifications.routes.js';
import supportRoutes from './modules/support/support.routes.js';
import uploadRoutes from './modules/uploads/uploads.routes.js';
import sellerRoutes from './modules/seller/seller.routes.js';
import deliveryRoutes from './modules/delivery/delivery.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';

const router = Router();
const startedAt = new Date();

/** Liveness: the process is up. */
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()), startedAt });
});

/** Readiness: the database is reachable and migrations have been applied. */
router.get('/health/ready', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1 FROM "Setting" LIMIT 1`;
    res.json({ status: 'ready', database: 'ok' });
  } catch {
    res.status(503).json({ status: 'unavailable', database: 'error' });
  }
});

router.use('/auth', authRoutes);
router.use('/account', accountRoutes);
router.use('/', catalogRoutes);
router.use('/cart', cartRoutes);
router.use('/wishlist', wishlistRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
router.use('/webhooks', webhookRoutes);
router.use('/refunds', refundRoutes);
router.use('/reviews', reviewRoutes);
router.use('/notifications', notificationRoutes);
router.use('/support', supportRoutes);
router.use('/uploads', uploadRoutes);
router.use('/seller', sellerRoutes);
router.use('/delivery', deliveryRoutes);
router.use('/admin', adminRoutes);

export default router;
