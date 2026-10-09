import { allocate, applyBps, MAX_ORDER_TOTAL } from '../lib/money.js';

/** Fields needed to price a product and check its availability. */
export const PRICING_INCLUDE = {
  shop: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      isOpen: true,
      vacationMode: true,
      vacationMessage: true,
      commissionRateBps: true,
      fulfillmentMode: true,
    },
  },
  category: { select: { id: true, commissionRateBps: true, parent: { select: { commissionRateBps: true } } } },
  images: { orderBy: { sortOrder: 'asc' }, take: 1, select: { url: true } },
};

/** Commission rule precedence: shop override → category → parent category → marketplace default. */
export function resolveCommissionBps(product, settings) {
  return (
    product.shop.commissionRateBps ??
    product.category?.commissionRateBps ??
    product.category?.parent?.commissionRateBps ??
    settings.defaultCommissionBps
  );
}

export function productAvailability(product, quantity = 1) {
  if (!product || product.deletedAt) return { available: false, reason: 'This product is no longer available.' };
  if (product.status !== 'PUBLISHED' || product.moderationStatus !== 'APPROVED') {
    return { available: false, reason: 'This product is not currently for sale.' };
  }
  if (product.shop.status !== 'ACTIVE') return { available: false, reason: 'This seller is not accepting orders right now.' };
  if (!product.shop.isOpen || product.shop.vacationMode) {
    return {
      available: false,
      reason: product.shop.vacationMessage
        ? `${product.shop.name} is temporarily closed: ${product.shop.vacationMessage}`
        : `${product.shop.name} is temporarily closed.`,
    };
  }
  if (product.stock <= 0) return { available: false, reason: 'Out of stock.' };
  if (quantity > product.stock) return { available: false, reason: `Only ${product.stock} left in stock.` };
  return { available: true };
}

export function deliveryFeeFor(subtotal, settings) {
  return subtotal >= settings.freeDeliveryThreshold ? 0 : settings.deliveryFeeBase;
}

/**
 * Validates a coupon against the priced groups. Returns the total discount
 * and how it is split between shops, or an error message for the buyer.
 */
export async function evaluateCoupon(db, { code, userId, groups, now = new Date() }) {
  const coupon = await db.coupon.findUnique({ where: { code: code.trim().toUpperCase() } });
  const fail = (error) => ({ coupon: null, discount: 0, perShop: {}, error });
  if (!coupon || !coupon.isActive) return fail('This promo code is not valid.');
  if (coupon.startsAt && coupon.startsAt > now) return fail('This promo code is not active yet.');
  if (coupon.endsAt && coupon.endsAt < now) return fail('This promo code has expired.');
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) return fail('This promo code has reached its usage limit.');
  if (userId && coupon.perUserLimit > 0) {
    const used = await db.couponRedemption.count({ where: { couponId: coupon.id, userId } });
    if (used >= coupon.perUserLimit) return fail('You have already used this promo code.');
  }

  const eligible = coupon.shopId ? groups.filter((g) => g.shop.id === coupon.shopId) : groups;
  const eligibleSubtotal = eligible.reduce((s, g) => s + g.subtotal, 0);
  if (!eligible.length) return fail('This promo code does not apply to the items in your cart.');
  if (eligibleSubtotal < coupon.minOrderAmount) {
    return fail(`Spend at least ${coupon.minOrderAmount.toLocaleString('en-US')} to use this promo code.`);
  }

  let discount = coupon.type === 'PERCENTAGE' ? Math.floor((eligibleSubtotal * coupon.value) / 100) : coupon.value;
  if (coupon.maxDiscount !== null) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.max(0, Math.min(discount, eligibleSubtotal));

  const parts = allocate(discount, eligible.map((g) => g.subtotal));
  const perShop = Object.fromEntries(eligible.map((g, i) => [g.shop.id, parts[i]]));
  return { coupon, discount, perShop, error: null };
}

/**
 * Builds an authoritative price quote from database records. Prices,
 * fees, discounts and commissions are always computed here on the server —
 * never taken from the client.
 *
 * @param lines  [{ product (with PRICING_INCLUDE), quantity }]
 */
export async function buildQuote(db, { lines, settings, couponCode, userId }) {
  const groupsByShop = new Map();
  const problems = [];

  for (const { product, quantity } of lines) {
    const availability = productAvailability(product, quantity);
    if (!availability.available) problems.push({ productId: product.id, name: product.name, reason: availability.reason });

    const commissionRateBps = resolveCommissionBps(product, settings);
    const lineTotal = product.price * quantity;
    const item = {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      image: product.images?.[0]?.url ?? null,
      sku: product.sku,
      unitPrice: product.price,
      compareAtPrice: product.compareAtPrice,
      quantity,
      stock: product.stock,
      lineTotal,
      commissionRateBps,
      commissionAmount: applyBps(lineTotal, commissionRateBps),
      available: availability.available,
      reason: availability.reason ?? null,
    };

    if (!groupsByShop.has(product.shop.id)) {
      groupsByShop.set(product.shop.id, {
        shop: { id: product.shop.id, name: product.shop.name, slug: product.shop.slug },
        // The marketplace can require its own couriers for every order.
        fulfillmentMode: settings.sellerCanSelfDeliver ? product.shop.fulfillmentMode : 'MARKETPLACE',
        items: [],
      });
    }
    groupsByShop.get(product.shop.id).items.push(item);
  }

  const groups = [...groupsByShop.values()].map((g) => {
    const subtotal = g.items.reduce((s, i) => s + i.lineTotal, 0);
    const commissionAmount = g.items.reduce((s, i) => s + i.commissionAmount, 0);
    return { ...g, subtotal, commissionAmount, deliveryFee: deliveryFeeFor(subtotal, settings) };
  });

  let couponResult = null;
  if (couponCode) couponResult = await evaluateCoupon(db, { code: couponCode, userId, groups });

  for (const g of groups) {
    g.discount = couponResult?.perShop?.[g.shop.id] ?? 0;
    g.shopFundedDiscount = couponResult?.coupon?.shopId ? g.discount : 0;
    g.total = g.subtotal + g.deliveryFee - g.discount;
    g.sellerNet = g.subtotal - g.commissionAmount - g.shopFundedDiscount + (g.fulfillmentMode === 'SELF' ? g.deliveryFee : 0);
  }

  const subtotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const deliveryFee = groups.reduce((s, g) => s + g.deliveryFee, 0);
  const discount = groups.reduce((s, g) => s + g.discount, 0);
  const total = subtotal + deliveryFee - discount;
  if (total > MAX_ORDER_TOTAL) {
    problems.push({ productId: null, name: 'Order total', reason: 'This order is too large to place online. Please contact support.' });
  }

  return {
    currency: settings.currency,
    groups,
    itemCount: lines.reduce((s, l) => s + l.quantity, 0),
    subtotal,
    deliveryFee,
    discount,
    total,
    coupon: couponResult?.coupon
      ? { id: couponResult.coupon.id, code: couponResult.coupon.code, description: couponResult.coupon.description, discount }
      : null,
    couponError: couponResult?.error ?? null,
    problems,
  };
}
