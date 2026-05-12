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
 *
 * Issue #257 (perf, 2026-05-11): collapsed the per-character fetch loop
 * into a single batch endpoint call. Pre-fix this looped over every
 * character and awaited /api/downtime_submissions?cycle_id=X&character_id=Y
 * — ~30 sequential MongoDB queries per ST/dev boot, 1–3 for a player.
 * Post-fix one call to /api/downtime_submissions/hold-flags returns the
 * full { <character_id>: bool } map.
 */

import { apiGet } from './api.js';

/**
 * @param {Array} chars - characters to annotate with `_dtHoldFlag`.
 * @param {object} [opts] - back-compat opts arg. The previous `isST`
 *   flag is no longer needed (server-side auth scopes the cohort);
 *   the signature stays the same so existing callers (app.js:543,
 *   player.js:188) don't have to change. The arg is currently ignored.
 */
// eslint-disable-next-line no-unused-vars
export async function loadDowntimeHoldFlag(chars, opts = {}) {
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

  // Single batched fetch — server returns { <character_id>: bool } map.
  // Auth-scoped server-side: player sees only own; ST sees all.
  let map = null;
  try {
    map = await apiGet(
      `/api/downtime_submissions/hold-flags?cycle_id=${encodeURIComponent(activeCycle._id)}`
    );
  } catch {
    // Best-effort — if the call fails, leave the prior flag values intact.
    return;
  }
  if (!map || typeof map !== 'object') return;

  for (const c of chars) {
    const key = String(c._id);
    // Server returns entries only for chars with a submission. Anything
    // absent from the map → no submission for this cycle ⇒ on hold (true).
    // Matches the pre-fix fallback at the old line 39.
    c._dtHoldFlag = Object.prototype.hasOwnProperty.call(map, key) ? !!map[key] : true;
  }
}
