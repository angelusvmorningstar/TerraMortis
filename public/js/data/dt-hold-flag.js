/**
 * Cache the "downtime credit on hold" flag on each character (ADR-003 §Q3,
 * story dt-form.17 UI affordance #2).
 *
 * The flag mirrors the player's most-recent submission's `_has_minimum`
 * derived bool for the currently-active cycle. When false, the player's
 * downtime XP credit is "on hold" — XP-Available renders a "(downtime
 * credit on hold)" annotation and `attendance.downtime` for that game
 * session is being held at false until the form clears the minimum bar.
 *
 * Browser-only. The pure rule encoder is in `dt-completeness.js`.
 */

import { apiGet } from './api.js';

export async function loadDowntimeHoldFlag(chars, { isST = false } = {}) {
  if (!Array.isArray(chars) || chars.length === 0) return;

  // Default flag to false (not on hold) before any async work, so renderers
  // don't show a stale `true` while the fetch is in flight.
  for (const c of chars) {
    if (c._dtHoldFlag === undefined) c._dtHoldFlag = false;
  }

  let activeCycle = null;
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    activeCycle = (cycles || []).find(c => c.status === 'active') || null;
  } catch { /* fall through — flag stays false */ }
  if (!activeCycle?._id) return;

  for (const c of chars) {
    try {
      const subs = await apiGet(
        `/api/downtime_submissions?cycle_id=${encodeURIComponent(activeCycle._id)}&character_id=${encodeURIComponent(c._id)}`
      );
      const sub = Array.isArray(subs) ? subs[0] : null;
      if (!sub) {
        // No submission yet for this cycle ⇒ definitely below-minimum.
        c._dtHoldFlag = true;
        continue;
      }
      const r = sub.responses || {};
      // Trust the persisted derived bool when present; otherwise fall back
      // to the submission's coarse status (mirrored by the lifecycle hook).
      if (typeof r._has_minimum === 'boolean') {
        c._dtHoldFlag = !r._has_minimum;
      } else {
        c._dtHoldFlag = sub.status !== 'submitted';
      }
    } catch {
      // Best-effort — if a single fetch fails, leave the prior flag value.
    }
  }
}
