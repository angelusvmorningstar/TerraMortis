/**
 * payment-helpers.js — Read-side compatibility for pre-fin.2 attendance data.
 *
 * Pre-fin.2 sessions stored payment as `entry.payment_method: 'Cash'` (flat
 * string, varied capitalisation, no amount). fin.2 uses `entry.payment:
 * { method, amount }` with a lowercase enum.
 *
 * Check-In and Finance tabs read via these helpers so legacy rows surface
 * in the UI without requiring a data migration.
 */

/**
 * Normalise a legacy payment-method string to the fin.2 enum.
 * Returns empty string when no mapping applies (treated as "not recorded").
 */
export function normalisePaymentMethod(val) {
  if (!val) return '';
  const s = String(val).trim().toLowerCase();
  if (!s) return '';
  if (s === 'cash') return 'cash';
  if (s.startsWith('payid')) return 'payid';
  if (s.startsWith('paypal')) return 'paypal';
  if (s.startsWith('exiles')) return 'exiles';
  if (s.startsWith('waived')) return 'waived';
  // Legacy "did not attend" collapses to unrecorded — the attendance checkbox
  // is the canonical signal that a player wasn't there (FIN-6).
  if (s === 'did_not_attend' || s.startsWith('did not') || s === 'dna') return '';
  return '';
}

/**
 * Read an attendance entry's payment as a `{ method, amount }` pair.
 * Prefers the structured fin.2 `entry.payment` object; falls back to the
 * legacy `entry.payment_method` string with amount 0 (coordinator fills in
 * the amount when they next touch the row in Check-In).
 */
export function readPayment(entry) {
  const p = entry?.payment;
  if (p && p.method !== undefined) {
    return { method: p.method || '', amount: Number(p.amount) || 0 };
  }
  return { method: normalisePaymentMethod(entry?.payment_method), amount: 0 };
}
