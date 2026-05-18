/* ST mods overlay — client-side composition layer (Epic STM, issue #372).
 *
 * Sequence at each renderSheet call site (D1 single composition site):
 *   1. tracker = await ensureLoaded(c)               // game/tracker.js cache
 *   2. spliceCurrent(c, tracker)                     // c.current = {damage_b/l/a, willpower, vitae}
 *   3. mods = await loadStMods(c._id)                // GET /api/st_mods
 *   4. applyStMods(c, mods, overlayEnabled)          // mutate c.<path> + populate c._st_mod_overlay
 *   5. renderSheet(c)
 *
 * Per ADR-004 §D6: the overlay is read-direction only. It never writes
 * back to tracker_state or to the characters collection. The in-memory
 * mutation in step 4 is a per-frame display detail; canonical character
 * docs stay untouched on the server.
 *
 * Edit-mode safety: applyStMods snapshots base values into c._st_mod_base
 * before mutating. stripOverlay(c) restores from that snapshot, used by the
 * helper when toggling into edit mode so the user always edits canonical
 * values, never modded ones. Both _st_mod_overlay and _st_mod_base are
 * `_`-prefixed so admin.js buildSaveBody strips them before PUT.
 */

const API_BASE = location.hostname === 'localhost' ? 'http://localhost:3000' : '';

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('tm_auth_token');
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

/** GET /api/st_mods?character_id=:id. Returns an array of mod docs, ordered
 *  by created_at ascending (per STM-1 AC#4). Returns [] on network failure
 *  rather than throwing — overlay is a display enhancement, not a hard dep. */
export async function loadStMods(characterId) {
  try {
    const res = await fetch(
      `${API_BASE}/api/st_mods?character_id=${encodeURIComponent(characterId)}`,
      { headers: authHeaders() },
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

/** Splice the synthetic `current.*` namespace onto the in-memory character
 *  from tracker_state (per ADR-004 §D5). Idempotent — overwrites c.current
 *  every call. Pass a falsy tracker to write sensible defaults.
 *
 *  Defaults follow the tracker's own `defaults()` in public/js/game/tracker.js:
 *  damage tracks default 0, willpower defaults to calcWillpowerMax, vitae
 *  to calcVitaeMax. Pass calcWillpowerMax / calcVitaeMax as the third arg
 *  so this module stays decoupled from accessors. */
export function spliceCurrent(c, tracker, { calcWillpowerMax, calcVitaeMax } = {}) {
  c.current = {
    damage_bashing:    tracker?.bashing    ?? 0,
    damage_lethal:     tracker?.lethal     ?? 0,
    damage_aggravated: tracker?.aggravated ?? 0,
    willpower:         tracker?.willpower  ?? (calcWillpowerMax ? calcWillpowerMax(c) : 0),
    vitae:             tracker?.vitae      ?? (calcVitaeMax ? calcVitaeMax(c) : 0),
  };
}

// ── Path walkers ───────────────────────────────────────────────────────

// Paths are validated server-side against STATIC_WHITELIST + the
// merits/disciplines regex (per ADR-004 §Concerns Item 2), so we don't
// re-validate here. Walks dotted keys including ones with spaces ('Animal Ken').
// Returns undefined if any segment is missing.
function getByPath(obj, path) {
  if (!obj || typeof path !== 'string') return undefined;
  const parts = path.split('.');
  let cur = obj;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

function setByPath(obj, path, value) {
  if (!obj || typeof path !== 'string') return;
  const parts = path.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i];
    if (cur[key] == null || typeof cur[key] !== 'object') cur[key] = {};
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
}

// ── Overlay composition ────────────────────────────────────────────────

/** Apply mods to the in-memory character. Mutates c:
 *    - c.<stat_path> ← base + sum of deltas (display value for this frame)
 *    - c._st_mod_overlay[path] = { base, delta, final, mods: [...] }
 *    - c._st_mod_base[path] = base  (used by stripOverlay to restore)
 *
 *  Short-circuits when overlayEnabled is false or mods is empty — leaves
 *  c untouched (or strips a prior overlay if present so a flipped kill-switch
 *  reverts cleanly).
 *
 *  Multiple mods on the same path are additive — deltas sum, all mods are
 *  retained in the overlay row for the popover (STM-4). */
export function applyStMods(c, mods, overlayEnabled) {
  if (!overlayEnabled || !Array.isArray(mods) || mods.length === 0) {
    stripOverlay(c);
    return c;
  }

  // Group by path, summing deltas, retaining each contributing mod
  const byPath = new Map();
  for (const m of mods) {
    if (!m || typeof m.stat_path !== 'string' || !Number.isInteger(m.delta)) continue;
    let entry = byPath.get(m.stat_path);
    if (!entry) {
      entry = { delta: 0, mods: [] };
      byPath.set(m.stat_path, entry);
    }
    entry.delta += m.delta;
    entry.mods.push(m);
  }

  // Restore any prior overlay before re-applying — successive renders pile
  // up modded-on-modded otherwise, drifting away from canonical.
  stripOverlay(c);

  c._st_mod_overlay = {};
  c._st_mod_base = {};
  for (const [path, { delta, mods: contributing }] of byPath) {
    const baseRaw = getByPath(c, path);
    // Treat missing leaf as 0 — for derived.* paths that the sheet derives
    // at render time but doesn't materialise on the char doc, and for sparse
    // merit dot slots. The whitelist guarantees the path shape is valid.
    const base = typeof baseRaw === 'number' ? baseRaw : 0;
    const final = base + delta;
    c._st_mod_base[path] = baseRaw;          // preserve original (may be undefined)
    setByPath(c, path, final);
    c._st_mod_overlay[path] = { base, delta, final, mods: contributing };
  }
  return c;
}

/** Restore canonical values from c._st_mod_base, then delete the overlay
 *  metadata. No-op if no prior overlay. Used by:
 *    - applyStMods itself (before each re-application, so successive renders
 *      don't compound)
 *    - the admin edit-mode helper (so editing always shows base values, and
 *      so a silent fresh-fetch failure can't leave modded canonical fields
 *      visible to the editor) */
export function stripOverlay(c) {
  if (!c || !c._st_mod_base) {
    if (c) delete c._st_mod_overlay;
    return;
  }
  for (const [path, baseRaw] of Object.entries(c._st_mod_base)) {
    if (baseRaw === undefined) {
      // The path didn't exist before overlay; clear what we created.
      // Best-effort — leaves any intermediate objects we materialised, which
      // is fine since they're empty / will be rebuilt on next splice.
      setByPath(c, path, undefined);
    } else {
      setByPath(c, path, baseRaw);
    }
  }
  delete c._st_mod_overlay;
  delete c._st_mod_base;
}
