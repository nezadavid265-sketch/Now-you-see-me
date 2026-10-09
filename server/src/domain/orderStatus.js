/**
 * Seller-order (shipment) lifecycle. Every status change in the system goes
 * through `assertTransition`, so invalid jumps (e.g. DELIVERED → PREPARING)
 * are impossible regardless of which portal requests them.
 */
export const SELLER_ORDER_TRANSITIONS = {
  PENDING_PAYMENT: ['PLACED', 'CANCELLED'],
  PLACED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY', 'CANCELLED'],
  READY: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'READY'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** Which actor may request which transition (admins may perform any valid one). */
export const ACTOR_TRANSITIONS = {
  BUYER: {
    PENDING_PAYMENT: ['CANCELLED'],
    PLACED: ['CANCELLED'],
    ACCEPTED: ['CANCELLED'],
  },
  SELLER: {
    PLACED: ['ACCEPTED', 'CANCELLED'],
    ACCEPTED: ['PREPARING', 'CANCELLED'],
    PREPARING: ['READY', 'CANCELLED'],
    // Shipping and delivery steps are only available to sellers who deliver themselves.
    READY: ['IN_TRANSIT'],
    IN_TRANSIT: ['DELIVERED', 'READY'],
  },
  DELIVERY: {
    READY: ['IN_TRANSIT'],
    IN_TRANSIT: ['DELIVERED', 'READY'],
  },
};

export const STATUS_LABELS = {
  PENDING_PAYMENT: 'Awaiting payment',
  PLACED: 'New order',
  ACCEPTED: 'Accepted',
  PREPARING: 'Preparing',
  READY: 'Ready for dispatch',
  IN_TRANSIT: 'Out for delivery',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
};

export const ACTIVE_SELLER_STATUSES = ['PLACED', 'ACCEPTED', 'PREPARING', 'READY', 'IN_TRANSIT'];

export function canTransition(from, to) {
  return SELLER_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canActorTransition(role, from, to, { fulfillmentMode } = {}) {
  if (!canTransition(from, to)) return false;
  if (role === 'ADMIN' || role === 'SYSTEM') return true;
  if (!(ACTOR_TRANSITIONS[role]?.[from]?.includes(to) ?? false)) return false;
  const deliveryStep = (from === 'READY' && to === 'IN_TRANSIT') || from === 'IN_TRANSIT';
  if (role === 'SELLER' && deliveryStep) return fulfillmentMode === 'SELF';
  if (role === 'DELIVERY') return fulfillmentMode === 'MARKETPLACE';
  return true;
}

/**
 * Derives the buyer-facing order status from its shipments.
 * Cancelled/refunded shipments are ignored unless every shipment is.
 */
export function deriveOrderStatus(sellerOrderStatuses) {
  const statuses = sellerOrderStatuses;
  if (statuses.some((s) => s === 'PENDING_PAYMENT')) return 'PENDING_PAYMENT';
  const active = statuses.filter((s) => s !== 'CANCELLED' && s !== 'REFUNDED');
  if (active.length === 0) {
    return statuses.some((s) => s === 'REFUNDED') ? 'REFUNDED' : 'CANCELLED';
  }
  if (active.every((s) => s === 'DELIVERED')) return 'DELIVERED';
  if (active.every((s) => s === 'IN_TRANSIT' || s === 'DELIVERED')) return 'IN_TRANSIT';
  return 'PROCESSING';
}
