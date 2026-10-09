import { prisma } from '../../lib/prisma.js';
import { conflict, unprocessable } from '../../lib/errors.js';
import { uniqueSlug } from '../../lib/slug.js';
import { audit } from '../../services/audit.js';
import { notifyAdmins } from '../../services/notifications.js';

/**
 * Loads the signed-in seller's profile and shop. Every seller endpoint uses
 * `req.shop.id` from here — never an id supplied by the client — which is
 * what keeps one seller from ever touching another seller's data.
 */
export async function loadSellerContext(req, _res, next) {
  const [profile, shop] = await Promise.all([
    prisma.sellerProfile.findUnique({ where: { userId: req.user.id } }),
    prisma.shop.findUnique({ where: { sellerId: req.user.id } }),
  ]);
  req.sellerProfile = profile;
  req.shop = shop;
  next();
}

export function requireShop(req, _res, next) {
  if (!req.shop) throw unprocessable('Set up your shop first.', undefined, { code: 'NO_SHOP' });
  next();
}

export function onboardingChecklist(profile, shop, productCount) {
  return [
    { key: 'profile', label: 'Add your business details', done: Boolean(profile) },
    { key: 'shop', label: 'Create your shop', done: Boolean(shop) },
    { key: 'payout', label: 'Add payout details (so we can pay you)', done: Boolean(profile?.payoutAccountNumber) },
    { key: 'submit', label: 'Submit your shop for review', done: Boolean(profile && profile.status !== 'DRAFT') },
    { key: 'approved', label: 'Get approved by Rivoshoppa', done: profile?.status === 'APPROVED' },
    { key: 'product', label: 'Publish your first product', done: productCount > 0 },
  ];
}

export async function getOverview(req) {
  const productCount = req.shop
    ? await prisma.product.count({ where: { shopId: req.shop.id, status: 'PUBLISHED', deletedAt: null } })
    : 0;
  return {
    profile: req.sellerProfile,
    shop: req.shop,
    checklist: onboardingChecklist(req.sellerProfile, req.shop, productCount),
  };
}

export async function saveProfile(req, data) {
  const existing = req.sellerProfile;
  if (existing?.status === 'SUSPENDED') throw conflict('Your seller account is suspended. Contact support for help.');
  const payoutChanged =
    existing && (existing.payoutAccountNumber !== data.payoutAccountNumber || existing.payoutMethod !== data.payoutMethod);
  const profile = await prisma.sellerProfile.upsert({
    where: { userId: req.user.id },
    create: { ...data, userId: req.user.id },
    // A rejected application goes back to draft when edited, ready to resubmit.
    update: { ...data, ...(existing?.status === 'REJECTED' ? { status: 'DRAFT' } : {}) },
  });
  await audit(req, payoutChanged ? 'seller.payout_details_changed' : 'seller.profile_saved', { entityType: 'SellerProfile', entityId: profile.id });
  return profile;
}

export async function createShop(req, data) {
  if (req.shop) throw conflict('You already have a shop.');
  const shop = await prisma.shop.create({
    data: {
      ...data,
      sellerId: req.user.id,
      slug: uniqueSlug(data.name),
      status: req.sellerProfile?.status === 'APPROVED' ? 'ACTIVE' : 'PENDING',
    },
  });
  await audit(req, 'seller.shop_created', { entityType: 'Shop', entityId: shop.id });
  return shop;
}

export async function updateShop(req, data) {
  const shop = await prisma.shop.update({ where: { id: req.shop.id }, data });
  await audit(req, 'seller.shop_updated', { entityType: 'Shop', entityId: shop.id, metadata: { fields: Object.keys(data) } });
  return shop;
}

export async function submitForReview(req) {
  const profile = req.sellerProfile;
  if (!profile) throw unprocessable('Add your business details first.');
  if (!req.shop) throw unprocessable('Create your shop first.');
  if (!profile.payoutAccountNumber) throw unprocessable('Add your payout details first so we know where to send your earnings.');
  if (!['DRAFT', 'REJECTED'].includes(profile.status)) throw conflict('Your application has already been submitted.');
  const updated = await prisma.sellerProfile.update({
    where: { id: profile.id },
    data: { status: 'PENDING', submittedAt: new Date(), reviewNote: null },
  });
  await audit(req, 'seller.submitted_for_review', { entityType: 'SellerProfile', entityId: profile.id });
  await notifyAdmins('sellers', {
    type: 'seller.application',
    title: 'New seller application',
    body: `${profile.businessName} (${req.shop.name}) is waiting for review.`,
    link: `/admin/sellers/${profile.id}`,
  });
  return updated;
}
