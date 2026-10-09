// All money values are integers in the smallest currency unit.
export const MAX_ORDER_TOTAL = 2_000_000_000;

/** Commission for an amount at a rate in basis points, rounded half-up. */
export function applyBps(amount, bps) {
  return Math.round((amount * bps) / 10_000);
}

/**
 * Splits `total` across `weights` proportionally, guaranteeing the parts sum
 * exactly to `total` (largest-remainder method).
 */
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0 || total === 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / sum);
  const floors = raw.map(Math.floor);
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}
