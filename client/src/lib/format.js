export function money(amount, currency = 'RWF') {
  if (amount === null || amount === undefined) return '—';
  return `${Number(amount).toLocaleString('en-US')} ${currency}`;
}

export function compactMoney(amount, currency = 'RWF') {
  const n = Number(amount ?? 0);
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M ${currency}`;
  if (Math.abs(n) >= 10_000) return `${Math.round(n / 1000)}K ${currency}`;
  return money(n, currency);
}

export function percentOff(price, compareAt) {
  if (!compareAt || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

const dateFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const date = (d) => (d ? dateFmt.format(new Date(d)) : '—');
export const dateTime = (d) => (d ? dateTimeFmt.format(new Date(d)) : '—');

export function timeAgo(d) {
  if (!d) return '';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86_400) return `${Math.floor(s / 86_400)} d ago`;
  return date(d);
}

export function bpsToPercent(bps) {
  return bps === null || bps === undefined ? '' : `${(bps / 100).toFixed(bps % 100 ? 1 : 0)}%`;
}

export const titleCase = (s) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Status → label + colour, shared by every portal. */
export const STATUS = {
  // seller order / shipment
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'amber' },
  PLACED: { label: 'New order', tone: 'blue' },
  ACCEPTED: { label: 'Accepted', tone: 'blue' },
  PREPARING: { label: 'Preparing', tone: 'indigo' },
  READY: { label: 'Ready for dispatch', tone: 'violet' },
  IN_TRANSIT: { label: 'Out for delivery', tone: 'cyan' },
  DELIVERED: { label: 'Delivered', tone: 'green' },
  CANCELLED: { label: 'Cancelled', tone: 'red' },
  REFUNDED: { label: 'Refunded', tone: 'slate' },
  // order
  PROCESSING: { label: 'Processing', tone: 'blue' },
  // payments
  UNPAID: { label: 'Unpaid', tone: 'slate' },
  PENDING: { label: 'Pending', tone: 'amber' },
  PAID: { label: 'Paid', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
  SUCCEEDED: { label: 'Succeeded', tone: 'green' },
  EXPIRED: { label: 'Expired', tone: 'slate' },
  PARTIALLY_REFUNDED: { label: 'Partially refunded', tone: 'violet' },
  // products / moderation
  DRAFT: { label: 'Draft', tone: 'slate' },
  PUBLISHED: { label: 'Live', tone: 'green' },
  ARCHIVED: { label: 'Archived', tone: 'slate' },
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  REMOVED: { label: 'Removed', tone: 'red' },
  // sellers / shops / users
  ACTIVE: { label: 'Active', tone: 'green' },
  SUSPENDED: { label: 'Suspended', tone: 'red' },
  // refunds
  REQUESTED: { label: 'Requested', tone: 'amber' },
  COMPLETED: { label: 'Completed', tone: 'green' },
  // deliveries
  ASSIGNED: { label: 'Assigned', tone: 'blue' },
  PICKED_UP: { label: 'Picked up', tone: 'indigo' },
  // tickets
  OPEN: { label: 'Open', tone: 'amber' },
  RESOLVED: { label: 'Resolved', tone: 'green' },
  CLOSED: { label: 'Closed', tone: 'slate' },
};

export const PAYMENT_METHODS = {
  MTN_MOMO: 'MTN Mobile Money',
  AIRTEL_MONEY: 'Airtel Money',
  CASH_ON_DELIVERY: 'Cash on delivery',
  TEST: 'Test payment',
  BANK_TRANSFER: 'Bank transfer',
};
