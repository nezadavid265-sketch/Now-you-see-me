import { Router } from 'express';
import { authenticate, requirePermission, requireRole } from '../../middleware/auth.js';
import dashboard from './admin.dashboard.js';
import users from './admin.users.js';
import sellers, { shopsRouter } from './admin.sellers.js';
import { categoriesRouter, productsRouter, reviewsRouter } from './admin.catalog.js';
import { deliveriesRouter, ordersRouter, sellerOrdersRouter, staffRouter } from './admin.orders.js';
import { financeRouter, paymentsRouter, payoutsRouter, refundsRouter } from './admin.finance.js';
import { announcementsRouter, bannersRouter, couponsRouter, pagesRouter } from './admin.content.js';
import support from './admin.support.js';
import { auditRouter, reportsRouter, securityRouter, settingsRouter } from './admin.system.js';

/**
 * Administrator API. Every route requires an ADMIN account; each area also
 * requires the matching permission (super administrators have them all).
 */
const router = Router();
router.use(authenticate, requireRole('ADMIN'));

router.use('/dashboard', dashboard);
router.use('/users', users); // permission checks are per-route (some need super admin)
router.use('/sellers', requirePermission('sellers'), sellers);
router.use('/shops', requirePermission('sellers'), shopsRouter);
router.use('/products', requirePermission('catalog'), productsRouter);
router.use('/categories', requirePermission('catalog'), categoriesRouter);
router.use('/reviews', requirePermission('catalog'), reviewsRouter);
router.use('/orders', requirePermission('orders'), ordersRouter);
router.use('/seller-orders', requirePermission('orders'), sellerOrdersRouter);
router.use('/deliveries', requirePermission('orders'), deliveriesRouter);
router.use('/delivery-staff', requirePermission('orders'), staffRouter);
router.use('/payments', requirePermission('finance'), paymentsRouter);
router.use('/refunds', requirePermission('finance'), refundsRouter);
router.use('/finance', requirePermission('finance'), financeRouter);
router.use('/payouts', requirePermission('finance'), payoutsRouter);
router.use('/coupons', requirePermission('marketing'), couponsRouter);
router.use('/banners', requirePermission('marketing'), bannersRouter);
router.use('/pages', requirePermission('content'), pagesRouter);
router.use('/announcements', requirePermission('content'), announcementsRouter);
router.use('/tickets', requirePermission('support'), support);
router.use('/reports', requirePermission('reports'), reportsRouter);
router.use('/audit-logs', requirePermission('audit'), auditRouter);
router.use('/security', requirePermission('audit'), securityRouter);
router.use('/settings', requirePermission('settings'), settingsRouter);

export default router;
