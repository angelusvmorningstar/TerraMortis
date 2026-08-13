/**
 * equipment-derivation.js — armour penalty + derived-defence materialisation.
 *
 * Issue #879 (ADR-006). Lifts EQ-1's "calcDefence does not read the equipment
 * array without an ADR" gate. ADR-006 specifies:
 *
 *   D1: armourDefencePenalty(c, catalogueLookup?) reads c.equipment[] filtered
 *       by state === 'worn' + bucket === 'combat_gear' with isCombatGearArmourShaped(entry);
 *       injectable catalogue lookup (default: the ECM-5 cache reader).
 *
 *       EQC-1 (issue #1152, epic #1038, 2026-08-13): the old `armour` bucket
 *       merged into `combat_gear` (which also covers weapons). "Armour-shaped"
 *       is identified by `isCombatGearArmourShaped` (armour_value OR
 *       defence_penalty populated - see that function's own comment for why
 *       a single-field check was wrong) rather than by bucket alone — the
 *       epic's own "distinct stat fields" distinction within the single
 *       combat_gear bucket.
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
 * EQC-1 review patch (issue #1152, Codex external review, 2026-08-13,
 * Pass 3b HIGH finding): the FIRST version of these predicates checked only
 * `armour_value != null` / `weapon_type != null`. That is too narrow - under
 * the OLD (pre-EQC-1) schema, bucket-specific fields were independently
 * nullable and never required as a set (ECM-1's own Non-Goal: "no per-bucket
 * schema validation"). A real legacy armour item could have `armour_value:
 * null` while still carrying a populated `defence_penalty`, or a legacy
 * weapon could have `weapon_type: null` while carrying `damage_mod`. A
 * single-field check silently drops such an item from armour/weapon
 * derivation the moment it is migrated to `combat_gear`, even though the
 * migration script reports success - the exact defect the review caught by
 * direct execution (`armour_value: null, defence_penalty: 2` -> penalty 0
 * instead of 2 after migration).
 *
 * These two predicates are the SINGLE SOURCE OF TRUTH for "is this
 * combat_gear entry armour-shaped / weapon-shaped" - every consumer
 * (armourDefencePenalty/wornArmourCount below, roll.js, roll-v2.js,
 * editor/sheet.js) imports and uses these rather than re-deriving its own
 * copy, so the discriminator can never drift out of sync between consumers
 * again the way it did in the first version of this story.
 */
export function isCombatGearArmourShaped(entry) {
  if (!entry) return false;
  return entry.armour_value != null || entry.defence_penalty != null;
}

export function isCombatGearWeaponShaped(entry) {
  if (!entry) return false;
  return entry.weapon_type != null || entry.damage_mod != null || entry.damage_type != null;
}

/**
 * EQC-2 (issue #1153, epic #1038) - "on me" (bonus applies in game) vs
 * "owned but elsewhere" (available in downtime only), per the epic's own
 * display distinction. Derived from the EXISTING `state` field, not a new
 * stored value - see the story's own Background for why a second
 * independent field was rejected (same "two things that can disagree" class
 * of bug the combat_gear shape check above needed fixing for).
 *
 * `carried`/`worn`/`active` = physically on the character = on me.
 * `stashed` = owned but elsewhere. `lost` = neither (the item is gone).
 *
 * NOTE: "on me" (possession) is BROADER than "bonus currently active" for
 * armour specifically, which additionally requires `state === 'worn'` (see
 * armourDefencePenalty above) - a carried-but-unworn breastplate is on you
 * but grants no AR. This predicate answers "is it near me right now", not
 * "is every possible bonus from it firing" - callers that need the latter
 * (armour) keep their own narrower check unchanged.
 *
 * Single source of truth for every consumer that previously re-derived this
 * exact three-state check inline (roll.js, roll-v2.js) - see EQC-1's own
 * isCombatGearArmourShaped/isCombatGearWeaponShaped for why duplicating this
 * kind of check per-consumer is the mistake to avoid.
 *
 * @param {object} item - a character's equipment[] entry (has `state`)
 * @returns {boolean}
 */
export function isEquipmentOnMe(item) {
  if (!item) return false;
  return item.state === 'carried' || item.state === 'worn' || item.state === 'active';
}

/**
 * EQC-2 review patch (issue #1153, Codex external review Low finding):
 * the player-facing "On you" / "Stored elsewhere" text label. The first
 * version of this treated ANY non-'lost' state as "elsewhere", including a
 * missing/malformed/unrecognised `state` value - a confident but
 * unsupported location claim for bad data. Only `'stashed'` is a genuinely
 * known "elsewhere" state; anything else that isn't on-me returns `null`
 * (no label) rather than guessing.
 *
 * Extracted as its own exported pure function (not left inline in
 * editor/sheet.js) so it is directly unit-testable, matching this module's
 * own "single shared predicate, not duplicated/embedded inline" convention.
 *
 * @param {object} item - a character's equipment[] entry (has `state`)
 * @returns {string|null} 'On you' | 'Stored elsewhere' | null
 */
export function equipmentLocationLabel(item) {
  if (isEquipmentOnMe(item)) return 'On you';
  if (item && item.state === 'stashed') return 'Stored elsewhere';
  return null;
}

/**
 * EQC-3 (issue #1154, epic #1038) - "(in: <container name>)" display label
 * for a contained item. Checks the CHARACTER's own equipment array for
 * another row still carrying this `container_id` as its `catalogue_id` -
 * NOT just whether the catalogue item globally exists. A container removed
 * from this character's own equipment (its row deleted via DELETE
 * /:id/equipment/:itemIndex) must render its former contents as loose, even
 * though the catalogue item itself may still exist for OTHER characters (the
 * catalogue-admin delete guard only blocks deleting a CATALOGUE item while
 * ANY character holds it - it does not know about container_id references
 * at all). This is EQC-1's own "display-inert on dangling reference"
 * contract, applied correctly.
 *
 * Extracted as its own exported pure function (not a closure inside
 * editor/sheet.js's shRenderEquipment) so it is directly unit-testable,
 * matching this module's established convention.
 *
 * @param {object} item - a character's equipment[] entry (has `container_id`)
 * @param {object[]} allEquipment - the SAME character's full equipment[] array
 * @param {function} [catalogueLookup] - (id) => catalogue entry | undefined
 * @returns {string|null} `in: <name>` | null
 */
export function equipmentContainerLabel(item, allEquipment, catalogueLookup = getCatalogueEntry) {
  if (!item || !item.container_id) return null;
  const list = Array.isArray(allEquipment) ? allEquipment : [];
  const stillOwned = list.some(e => e && e !== item && String(e.catalogue_id) === item.container_id);
  if (!stillOwned) return null;
  const containerEntry = catalogueLookup(item.container_id);
  // EQC-3 review patch (#1154, Codex external review Medium finding, Pass
  // 3a): AC #4's literal text specifies the parenthesised form "(in: X)",
  // not the bare "in: X" the first version rendered.
  return containerEntry ? `(in: ${containerEntry.name || item.container_id})` : null;
}

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
    if (!entry || entry.bucket !== 'combat_gear' || !isCombatGearArmourShaped(entry)) continue;
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
    if (entry?.bucket === 'combat_gear' && isCombatGearArmourShaped(entry)) n++;
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
