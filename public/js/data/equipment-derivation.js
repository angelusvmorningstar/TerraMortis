/**
 * equipment-derivation.js — armour penalty + derived-defence materialisation.
 *
 * Issue #879 (ADR-006). Lifts EQ-1's "calcDefence does not read the equipment
 * array without an ADR" gate. ADR-006 specifies:
 *
 *   D1: armourDefencePenalty(c, catalogueLookup?) reads c.equipment[] filtered
 *       by state === 'worn' + bucket === 'armour'; injectable catalogue
 *       lookup (default: the ECM-5 cache reader).
 *   D2: worst-case math — Math.max(...penalties). The editor surfaces a soft
 *       hint when >1 armour is worn (wording is concern #8 below).
 *   D2-FLOOR: floor at 0 lives ONLY at the helper composition site. STM overlay
 *       composes additively on top per ADR-004's no-bounds contract; the
 *       sheet renderer adds NO further clamp.
 *   D3: composition order — calcDefence(c) → subtract helper → floor → applyStMods.
 *   D4: STM overlay composes on top of c.derived.defence (the armour-adjusted
 *       base materialised by this module's materialiseDerivedDefence).
 *   D5: pure helper, symmetric with discAttrBonus.
 *
 * Concern #2 from ADR-006: the per-item armour annotation in editor/sheet.js:2240
 * must KEEP calling raw calcDefence(c). Its display intent is "if you wore only
 * this item, defence would be X" — a hypothetical pre-armour baseline, NOT the
 * live armour-adjusted value. Don't migrate that read site.
 *
 * Concern #9 from ADR-006: NO redundant floor clamps anywhere else (not in
 * applyStMods, not in the sheet renderer). The clamp lives in exactly one
 * place — the materialisation call below.
 */

import { calcDefence } from './accessors.js';
import { getCatalogueEntry } from './equipment-catalogue-cache.js';
// #896: meritEffectiveRating respects free dots / cp / xp / bonus channels.
// Used to detect Resources cap and Fixer presence without rewriting the
// accessor chain.
import { meritEffectiveRating } from '../editor/domain.js';

/**
 * Sum-by-worst-case of defence penalties from currently-worn armour.
 * Returns a non-negative integer (the magnitude — composition site subtracts).
 *
 * Per ADR-006 D2: worst-case stacking. Math.max of all qualifying penalties;
 * 0 when no qualifying armour is worn. Negative defence_penalty values are
 * non-sensical for armour and are filtered out before combination.
 *
 * Per ADR-006 D1: state === 'worn' is the only state that contributes. The
 * positive predicate is preferred over a not-stashed/not-lost shape because
 * a future state-enum addition would silently affect a negative predicate
 * (Concern #3).
 *
 * @param {object} c - character document
 * @param {function} [catalogueLookup] - (id) => catalogue entry | undefined.
 *   Default: the ECM-5 cache reader. Tests inject a synthetic map.
 * @returns {number} non-negative integer penalty magnitude
 */
export function armourDefencePenalty(c, catalogueLookup = getCatalogueEntry) {
  if (!c || !Array.isArray(c.equipment)) return 0;
  const penalties = [];
  for (const item of c.equipment) {
    if (!item || item.state !== 'worn') continue;
    const entry = catalogueLookup(item.catalogue_id);
    if (!entry || entry.bucket !== 'armour') continue;
    const p = Number.isInteger(entry.defence_penalty) ? entry.defence_penalty : 0;
    if (p > 0) penalties.push(p);
  }
  if (penalties.length === 0) return 0;
  return Math.max(...penalties);
}

/**
 * Count of armour items currently in state==='worn'. Drives the editor hint
 * surfaced when >1 armour is worn (ADR-006 D2 + Concern #8 — wording verbatim
 * in editor/sheet.js armour-section header).
 *
 * @param {object} c - character document
 * @param {function} [catalogueLookup]
 * @returns {number} count of worn armour items
 */
export function wornArmourCount(c, catalogueLookup = getCatalogueEntry) {
  if (!c || !Array.isArray(c.equipment)) return 0;
  let n = 0;
  for (const item of c.equipment) {
    if (!item || item.state !== 'worn') continue;
    const entry = catalogueLookup(item.catalogue_id);
    if (entry?.bucket === 'armour') n++;
  }
  return n;
}

/**
 * Compute and materialise `c.derived.defence` per ADR-006 D3 + D4.
 *
 *   c.derived.defence = max(0, calcDefence(c) - armourDefencePenalty(c))
 *
 * This is the armour-adjusted base. applyStMods (called AFTER this, per the
 * render-path orchestrator) reads `c.derived.defence` as base, applies the
 * STM delta on top, and writes back — no longer the pre-ADR-006 bug where
 * applyStMods treated missing base as 0 (so STM mods on derived.defence
 * silently composed against 0 instead of the real mechanical base).
 *
 * Per ADR-006 D2-FLOOR + Concern #9: floor lives HERE, only HERE. No
 * defensive clamp in applyStMods or the sheet renderer.
 *
 * @param {object} c - character document (mutated)
 * @param {function} [catalogueLookup]
 * @returns {number} the materialised armour-adjusted defence (pre-overlay)
 */
export function materialiseDerivedDefence(c, catalogueLookup = getCatalogueEntry) {
  if (!c) return 0;
  const base = calcDefence(c);
  const penalty = armourDefencePenalty(c, catalogueLookup);
  const adjusted = Math.max(0, base - penalty);
  c.derived = c.derived || {};
  c.derived.defence = adjusted;
  return adjusted;
}

/**
 * Read-site helper: returns the modded c.derived.defence when it's been
 * materialised (the common case post-boot per the D8 cache-entry invariant);
 * falls back to a fresh armour-adjusted computation when not materialised
 * (edge cases — fresh chars, test contexts). The fallback is the same
 * computation materialiseDerivedDefence performs; the difference is whether
 * the result is cached on c.derived.defence or computed on the fly.
 *
 * Used by sheet.js, suite/sheet.js, roll calc, DT player pool, DT admin
 * resolution view — every consumer that previously called calcDefence(c)
 * directly migrates here.
 *
 * @param {object} c - character document
 * @param {function} [catalogueLookup]
 * @returns {number} displayed defence (overlay-modded if applicable)
 */
export function defenceForDisplay(c, catalogueLookup = getCatalogueEntry) {
  if (c && c.derived && typeof c.derived.defence === 'number') return c.derived.defence;
  if (!c) return 0;
  return Math.max(0, calcDefence(c) - armourDefencePenalty(c, catalogueLookup));
}

/**
 * Export-site helper: canonical mechanical defence (armour-adjusted, no
 * STM overlay). Always computes fresh — does NOT read c.derived.defence
 * which may carry an overlay-modded value at export time.
 *
 * Per ADR-004: STM overlays are scene-only adjustments and NOT canonical
 * character state. Character export (JSON / CSV / snapshot) captures the
 * mechanical baseline; overlays are a separate concern.
 *
 * @param {object} c - character document
 * @param {function} [catalogueLookup]
 * @returns {number} mechanical defence baseline (armour-adjusted)
 */
export function defenceMechanicalBase(c, catalogueLookup = getCatalogueEntry) {
  if (!c) return 0;
  return Math.max(0, calcDefence(c) - armourDefencePenalty(c, catalogueLookup));
}

// ─────────────────────────────────────────────────────────────────────────────
// #896 — Equipment availability filter + Fixer errata (Peter 2026-06-18).
//
// Composition is simple subtraction with no overlay/scene-state interaction
// (per Khepri dispatch — no ADR needed). The helpers below are pure: take
// (item, c) → number / boolean. Read sites use them at render time; DT form
// uses them to gate dropdown affordability.
//
// Fixer errata: the 2-dot Social merit Fixer reduces the availability cost
// of all items by 1. Applies in all usage and displays — dropdown, sheet
// held-items, admin editor row labels (the admin editor BYPASSES the
// affordability gate but still SHOWS the reduced number for consistency).
//
// Out of scope (Peter / Khepri): admin catalogue page (ECM-6) shows raw
// catalogue availability; it is character-agnostic.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resources cap = effective rating of the character's Resources merit, or 0
 * if absent. Uses meritEffectiveRating so cp / xp / free / bonus channels
 * compose correctly without re-walking the merit array.
 *
 * @param {object} c - character document
 * @returns {number} resources rating (0-5)
 */
export function availabilityCap(c) {
  if (!c) return 0;
  const m = (c.merits || []).find(x => x?.name === 'Resources');
  return m ? meritEffectiveRating(c, m) : 0;
}

/**
 * Fixer reduction = 1 if the character has Fixer merit with effective rating
 * >= 1, else 0. The Fixer merit is a fixed 2-dot Social merit per the rules,
 * but we gate on the effective-rating check rather than mere presence so a
 * suppressed / zeroed Fixer entry (edge case during merit editing) doesn't
 * spuriously grant the reduction.
 *
 * @param {object} c - character document
 * @returns {0 | 1} reduction magnitude
 */
export function fixerReduction(c) {
  if (!c) return 0;
  const m = (c.merits || []).find(x => x?.name === 'Fixer');
  if (!m) return 0;
  return meritEffectiveRating(c, m) >= 1 ? 1 : 0;
}

/**
 * Effective availability of a catalogue item for a specific character:
 *
 *   effectiveAvailability(item, c) = max(0, item.availability - fixerReduction(c))
 *
 * Floored at 0 so a level-0 item with Fixer doesn't surface as -1; the
 * floor lives here, no clamp needed at consumer sites (same single-floor
 * discipline as ADR-006 Concern #9).
 *
 * `item` may be a catalogue entry (post-ECM-1 shape with `availability` int
 * field) OR a partial; null/undefined item or missing availability defaults
 * to 0.
 *
 * @param {object} item - catalogue entry
 * @param {object} c - character document
 * @returns {number} effective availability (0-5)
 */
export function effectiveAvailability(item, c) {
  const raw = Number.isInteger(item?.availability) ? item.availability : 0;
  return Math.max(0, raw - fixerReduction(c));
}

/**
 * Convenience wrapper: is the item within the character's affordability gate?
 *
 *   isAffordable(item, c) = effectiveAvailability(item, c) <= availabilityCap(c)
 *
 * Used by the DT form dropdown to disable unaffordable options. The admin
 * character editor explicitly BYPASSES this gate (ST override) but still
 * displays the effective availability per Peter's dispatch.
 *
 * @param {object} item - catalogue entry
 * @param {object} c - character document
 * @returns {boolean}
 */
export function isAffordable(item, c) {
  return effectiveAvailability(item, c) <= availabilityCap(c);
}
