import { prisma } from '../lib/prisma.js';
import { conflict, notFound, unprocessable } from '../lib/errors.js';
import { getSettings } from '../services/settings.js';
import { notifyShopOwner } from '../services/notifications.js';

/**
 * Seller balances come from an append-only ledger:
 *  EARNING (+, available after the holding period), REFUND_DEDUCTION (−),
 *  PAYOUT (−), PAYOUT_REVERSAL (+), ADJUSTMENT (±).
 */
export async function shopBalance(shopId, now = new Date(), db = prisma) {
  const sum = async (where) => (await db.sellerLedgerEntry.aggregate({ where: { shopId, ...where }, _sum: { amount: true } }))._sum.amount ?? 0;
  const [available, pending, totalEarned, payouts, reversals] = await Promise.all([
    sum({ availableAt: { lte: now } }),
    sum({ availableAt: { gt: now } }),
    sum({ type: 'EARNING' }),
    sum({ type: 'PAYOUT' }),
    sum({ type: 'PAYOUT_REVERSAL' }),
  ]);
  return { available, pending, totalEarned, totalPaidOut: -(payouts + reversals) };
}

export async function createPayout(admin, { shopId, amount, note }) {
  const settings = await getSettings();
  const payout = await prisma.$transaction(async (tx) => {
    // Serialise payouts per shop so the same balance cannot be paid twice.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`payout:${shopId}`}))`;
    const shop = await tx.shop.findUnique({ where: { id: shopId }, include: { seller: { include: { sellerProfile: true } } } });
    if (!shop) throw notFound('Shop');
    const { available } = await shopBalance(shopId, new Date(), tx);
    const value = amount ?? available;
    if (value <= 0) throw unprocessable('This shop has no available balance to pay out.');
    if (value > available) throw unprocessable(`The amount exceeds the available balance (${available.toLocaleString('en-US')}).`);
    if (value < settings.minPayoutAmount) throw unprocessable(`The minimum payout is ${settings.minPayoutAmount.toLocaleString('en-US')}.`);
    const profile = shop.seller.sellerProfile;
    if (!profile?.payoutAccountNumber) throw unprocessable('The seller has not provided payout account details yet.');

    const created = await tx.payout.create({
      data: {
        shopId,
        amount: value,
        method: profile.payoutMethod,
        accountName: profile.payoutAccountName,
        accountNumber: profile.payoutAccountNumber,
        note,
        createdById: admin.id,
      },
    });
    await tx.sellerLedgerEntry.create({
      data: { shopId, type: 'PAYOUT', amount: -value, description: `Payout ${created.id.slice(-8).toUpperCase()}`, payoutId: created.id },
    });
    return created;
  });
  await notifyShopOwner(shopId, {
    type: 'payout.created',
    title: 'A payout is being processed',
    body: `${payout.amount.toLocaleString('en-US')} is being sent to your ${payout.method.replace('_', ' ').toLowerCase()} account.`,
    link: '/seller/finance',
  });
  return payout;
}

export async function markPayoutPaid(admin, payoutId, { reference }) {
  const { count } = await prisma.payout.updateMany({
    where: { id: payoutId, status: 'PENDING' },
    data: { status: 'PAID', reference, paidAt: new Date() },
  });
  if (!count) throw conflict('Only pending payouts can be marked as paid.');
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  await notifyShopOwner(payout.shopId, {
    type: 'payout.paid',
    title: 'Payout sent',
    body: `${payout.amount.toLocaleString('en-US')} was sent to your account (reference ${reference}).`,
    link: '/seller/finance',
    sms: true,
  });
  return payout;
}

export async function cancelPayout(admin, payoutId, { note }) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.payout.updateMany({
      where: { id: payoutId, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date(), note },
    });
    if (!count) throw conflict('Only pending payouts can be cancelled.');
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    await tx.sellerLedgerEntry.create({
      data: {
        shopId: payout.shopId,
        type: 'PAYOUT_REVERSAL',
        amount: payout.amount,
        description: `Payout ${payout.id.slice(-8).toUpperCase()} cancelled`,
        payoutId: payout.id,
      },
    });
    return payout;
  });
}
