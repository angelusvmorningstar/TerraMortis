/**
 * Domain merit helpers and influence calculations.
 * Domain merits can be shared between characters (coterie resources).
 */

import { INFLUENCE_SPHERES } from '../data/constants.js';
import state from '../data/state.js';
import { getRulesCache } from './rule_engine/load-rules.js';
// N-1 (ADR-005 Rev 2): per-slug reads use the canonical map-fallback shape
// `freeOf(m, slug) = m.free_grants?.<slug> ?? m.free_<slug> ?? 0`. This keeps
// reads correct across the N-1 → N-2 transition (pre-N-2 legacy populates;
// post-N-2 the map populates). `meritFreeSum` delegates to the shared helper
// so the 14-channel enumeration lives in exactly one place.
import { meritFreeSum as _meritFreeSumHelper, freeOf, normaliseAttachedTo, applySuspensionTo } from '../data/rules-helpers.js';

/* ══════════════════════════════════════════════════════
   Multi-instance domain type sets
   ══════════════════════════════════════════════════════ */

/** Safe Place and Feeding Grounds can have multiple instances per character (distinguished by qualifier). */
const MULTI_INSTANCE_DOMAIN = new Set(['Safe Place', 'Feeding Grounds']);

/** Haven and Mandragora Garden are capped at their attached Safe Place's effective rating. */
const CAP_DOMAIN = new Set(['Haven', 'Mandragora Garden']);

/**
 * Canonical domain merit key: "Name" or "Name (qualifier)".
 * Used for attached_to lookup and partner-sharing keyed by (name, qualifier).
 */
export function domKey(m) {
  return m.name + (m.qualifier ? ' (' + m.qualifier + ')' : '');
}

/* ══════════════════════════════════════════════════════
   Domain merit contribution helpers
   ══════════════════════════════════════════════════════ */

/**
 * Contribution of a single merit instance (all sources: CP + free_* + XP).
 * Operates on the merit object directly — no name lookup.
 * Exported so export-character.js can use it per-instance.
 */
export function domMeritContribSingle(c, m) {
  if (!m) return 0;
  // Issue #834: m.free is deprecated — removed from the purchased sum.
  // Memory: feedback_m_free_deprecated.
  const purchased = (m.cp || 0) + freeOf(m, 'mci') + (m.xp || 0)
    + (m.bonus || 0);
  return purchased
    + (m.name === 'Herd' ? ssjHerdBonus(c) + flockHerdBonus(c) : 0)
    + freeOf(m, 'fwb') + freeOf(m, 'attache') + freeOf(m, 'carthian'); // #508

}

/** Partner-shareable dots for a specific merit instance (cp + free + xp, no auto-bonuses).
 *
 * N-1 (Concern #1 Rev 2 VERBATIM): the HARDCODED SUBSET (cp + free + free_mci + xp)
 * is preserved verbatim — DO NOT add bloodline/retainer/etc. here even though the
 * server's `characters.js` partner-enrichment includes them. The divergence between
 * this client read and that server read is deliberately preserved until the future
 * MNEC-prerequisite audit story decides whether to normalise it. The only change
 * vs pre-N-1: the `free_mci` read goes through `freeOf(m, 'mci')` so the value
 * survives the N-2 backfill when persisted data moves from `m.free_mci` to
 * `m.free_grants.mci`. Surgical, exact-behaviour-preserving map-fallback. */
function domMeritShareableSingle(m) {
  if (!m) return 0;
  // Issue #834: m.free is deprecated — removed from the shareable sum.
  // The N-1 verbatim-preservation comment above is now moot for the
  // `m.free` term specifically; remaining channels (cp, mci, xp) are
  // still preserved as-is per the deliberate-divergence note.
  return (m.cp || 0) + freeOf(m, 'mci') + (m.xp || 0);
}

/**
 * Effective total for one specific domain merit instance (own + partner dots for that instance).
 * Internal helper for cap calculation and per-instance rendering.
 * Capped at 5 (no Flock exception — Flock only applies to Herd via domMeritTotal).
 */
function domMeritTotalSingle(c, m) {
  const own = domMeritContribSingle(c, m);
    // OATH-B (#1111, ADR-010 Rev 4): TWO values, deliberately.
    //
    //   `own`    — UNSUSPENDED. The gate below asks "do you hold at least one
    //              dot of your own", which is an OWNERSHIP question.
    //   `ownEff` — SUSPENDED. The sum asks "how many dots do you have access
    //              to", which is an ACCESS question.
    //
    // A suspension does not unmake ownership: the dots are still owned and
    // the XP is still spent, which is exactly why suspension must not reach
    // meritRating or xpSpent. The source text removes access to the PLEDGED
    // dots — the owner's own — and says nothing about what a partner
    // provides, so partners keep contributing even when the owner's own dots
    // are suspended to zero.
    //
    // This is not a workaround for an awkward gate. It is the owned-vs-
    // effective distinction that D2's hard boundary rests on, appearing at
    // the one place both values are needed at once. Do not "simplify" them
    // back into a single variable.
    //
    // The subtraction happens HERE, on the own term, before combination and
    // before capping. It cannot be applied at meritEffectiveRating's exit
    // instead: `domMeritTotal` ends `Math.min(cap, total)` with cap 5, so
    // once own + partner exceeds 5 the total is compressed and subtracting
    // the full pledge from the compressed figure takes more than the owner
    // ever contributed (Safe Place own 4 + partner 3, pledge 4: the exit
    // gives 1, below the partner's own 3; here it gives the correct 3).
  const ownEff = applySuspensionTo(m, own);
  const partners = m.shared_with || [];
  const key = domKey(m);
  let partnerTotal = 0;
  if (own >= 1) {
    for (const pName of partners) {
      const p = (state.chars || []).find(ch => ch.name === pName);
      if (p) {
        const pm = (p.merits || []).find(pm2 =>
          pm2.category === 'domain' && pm2.name === m.name && domKey(pm2) === key
        );
        if (pm) partnerTotal += domMeritShareableSingle(pm);
      }
    }
    if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
      partnerTotal = m._partner_dots;
    }
  }
  return Math.min(5, ownEff + partnerTotal);
}

/**
 * Cap for Haven / Mandragora Garden: effective rating of the attached anchor.
 *
 * Haven anchors to a Safe Place only. Mandragora Garden anchors to either a
 * Safe Place or — per N-8 (issue #761, Peter decision B 2026-06-15) — a
 * Necropolis Sepulcher merit instance. Returns 0 if no anchor set or anchor
 * not found.
 */
function _havenCap(c, m) {
  // N-1 (Concern #11): every read of m.attached_to goes through the normaliser.
  // Single anchor (Haven / Mandragora Garden) → `.destination` carries the anchor key.
  const at = normaliseAttachedTo(m.attached_to);
  if (!at) return 0;
  const isMandragora = m.name === 'Mandragora Garden';
  const anchor = (c.merits || []).find(sp2 => {
    // Safe Place is the legacy anchor for both Haven and Mandragora.
    if (sp2.category === 'domain' && sp2.name === 'Safe Place' && domKey(sp2) === at.destination) return true;
    // N-8: Mandragora can additionally anchor to Necropolis Sepulcher. The
    // permissive `sp2.name` check (no category constraint) mirrors the
    // picker filter at sheet.js — Sepulcher could be in any category on
    // the character; matching by name is the canonical lookup.
    if (isMandragora && sp2.name === 'Necropolis Sepulcher' && domKey(sp2) === at.destination) return true;
    return false;
  });
  if (!anchor) return 0;
  return domMeritTotalSingle(c, anchor);
}

/**
 * This character's own contribution to a named domain merit (all sources: CP + free + XP).
 * For multi-instance types (Safe Place, Feeding Grounds), sums all instances.
 * For singleton types (Herd, Haven, Mandragora Garden), returns the single instance.
 * @param {object} c - character object
 * @param {string} name - merit name (e.g. "Safe Place")
 * @returns {number}
 */
export function domMeritContrib(c, name) {
  if (MULTI_INSTANCE_DOMAIN.has(name)) {
    return (c.merits || [])
      .filter(m => m.category === 'domain' && m.name === name)
      .reduce((s, m) => s + domMeritContribSingle(c, m), 0);
  }
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  return domMeritContribSingle(c, m);
}

/** SSJ bonus Herd dots: one per MCI dot, auto-applied (not tracked inline). */
export function ssjHerdBonus(c) {
  if (!(c.merits || []).some(m => m.name === 'Secret Society Junkie')) return 0;
  return (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation')
    .reduce((s, m) => s + (m.rating || 0), 0);
}

/** Flock bonus Herd dots: equal to Flock rating, can exceed cap of 5. */
export function flockHerdBonus(c) {
  const flock = (c.merits || []).find(m => m.name === 'Flock');
  return flock ? (flock.rating || 0) : 0;
}

/**
 * Full dots contributed by a partner to a shared pool (CP + free + XP).
 * Free dots (e.g. MCI grants) represent real physical resources, so partners share them too.
 * For multi-instance types, sums all instances this character contributes.
 * @param {object} c - character object
 * @param {string} name - merit name
 * @returns {number}
 */
export function domMeritShareable(c, name) {
  if (MULTI_INSTANCE_DOMAIN.has(name)) {
    return (c.merits || [])
      .filter(m => m.category === 'domain' && m.name === name)
      .reduce((s, m) => s + domMeritShareableSingle(m), 0);
  }
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  return domMeritShareableSingle(m);
}

/**
 * Effective total = this char's full dots + partners' CP+XP only, capped at 5.
 * For multi-instance types (Safe Place, Feeding Grounds), sums all instances.
 * For singleton types (Herd), applies Flock cap override.
 * Looks up partner characters from the shared chars array via loader.
 * @param {object} c - character object
 * @param {string} name - merit name
 * @returns {number}
 */
export function domMeritTotal(c, name) {
  if (MULTI_INSTANCE_DOMAIN.has(name)) {
    return (c.merits || [])
      .filter(m => m.category === 'domain' && m.name === name)
      .reduce((s, m) => s + domMeritTotalSingle(c, m), 0);
  }
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  const own = domMeritContribSingle(c, m);
    // OATH-B (#1111, ADR-010 Rev 4): TWO values, deliberately.
    //
    //   `own`    — UNSUSPENDED. The gate below asks "do you hold at least one
    //              dot of your own", which is an OWNERSHIP question.
    //   `ownEff` — SUSPENDED. The sum asks "how many dots do you have access
    //              to", which is an ACCESS question.
    //
    // A suspension does not unmake ownership: the dots are still owned and
    // the XP is still spent, which is exactly why suspension must not reach
    // meritRating or xpSpent. The source text removes access to the PLEDGED
    // dots — the owner's own — and says nothing about what a partner
    // provides, so partners keep contributing even when the owner's own dots
    // are suspended to zero.
    //
    // This is not a workaround for an awkward gate. It is the owned-vs-
    // effective distinction that D2's hard boundary rests on, appearing at
    // the one place both values are needed at once. Do not "simplify" them
    // back into a single variable.
    //
    // The subtraction happens HERE, on the own term, before combination and
    // before capping. It cannot be applied at meritEffectiveRating's exit
    // instead: `domMeritTotal` ends `Math.min(cap, total)` with cap 5, so
    // once own + partner exceeds 5 the total is compressed and subtracting
    // the full pledge from the compressed figure takes more than the owner
    // ever contributed (Safe Place own 4 + partner 3, pledge 4: the exit
    // gives 1, below the partner's own 3; here it gives the correct 3).
  const ownEff = applySuspensionTo(m, own);
  const partners = m.shared_with || [];
  let partnerTotal = 0;
  if (own >= 1) {
    for (const pName of partners) {
      const p = (state.chars || []).find(ch => ch.name === pName);
      if (p) partnerTotal += domMeritShareable(p, name);
    }
    // Fallback: if no partner chars were found in state.chars (player portal
    // only has the player's own characters), use _partner_dots which the
    // server pre-computed on the ?mine=1 fetch path.
    if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
      partnerTotal = m._partner_dots;
    }
  }
  const total = ownEff + partnerTotal;
  // Herd can exceed 5 when Flock is present
  const cap = (name === 'Herd' && flockHerdBonus(c) > 0) ? Infinity : 5;
  return Math.min(cap, total);
}

/**
 * Sum of every free_* dot channel on a merit. The "bonus" half of the
 * purchased + bonus split that all dot-rendering code uses. Single source
 * of truth so adding a new free_X field updates the editor sheet, suite
 * sheet, sync, audits, and exports in one go.
 *
 * Excludes auto-bonuses computed elsewhere (SSJ/Flock for Herd, partner
 * contributions for shared domain merits). Those are summed in by
 * meritEffectiveRating, not by this helper.
 */
// Issue #790: Necropolis target merit names — pool-funded only. meritFreeSum
// must categorically ignore m.free + every legacy flat free_<slug> + every
// non-necro entry in free_grants for these rows. The only legitimate funding
// channel is m.free_grants.necro. Same categorical-by-name pattern as N-7b's
// input suppression; static set is acceptable for v1 since the targets are
// stable from N-3 (matches N-7b's static set at sheet.js _necroTargets).
const NECRO_TARGETS_FOR_SUM = new Set([
  'Catacombs', 'Caldarium', 'Garbage Pit',
  'Labyrinth Guardians', 'Dark Temple', 'White Ants',
]);

export function meritFreeSum(m) {
  // Issue #790: Necropolis-target categorical exclusion. Without this gate,
  // any stray write to m.free or any legacy m.free_<slug> field on a target
  // merit silently double-counts on top of the legitimate pool allocation.
  // Yusuf hit this 2026-06-16 — 4 merits showed +1 too high because of legacy
  // m.free=1 contamination of unknown origin (no current main code path
  // writes m.free positive on these rows, but the cleanup script was one-shot
  // and the class needs a permanent gate).
  if (m && NECRO_TARGETS_FOR_SUM.has(m.name)) {
    return (m.free_grants && m.free_grants.necro) || 0;
  }
  // Issue #834 (2026-06-17): m.free is deprecated — delegate to the shared
  // helper, no longer adding `(m.free || 0)` back. The pre-#834 contract
  // historically included m.free in meritFreeSum; that contract is dead
  // along with the channel. See memory feedback_m_free_deprecated. Single
  // source of truth for the canonical channel enumeration lives in
  // rules-helpers.js.
  return _meritFreeSumHelper(m);
}

/**
 * Persisted-rating sum: cp + xp + every free_* channel. Use this anywhere
 * code writes to m.rating — never hand-roll or you WILL silently drop
 * newly-added free_* channels (that's how free_pt / free_mdb / free_sw /
 * free_fwb / free_attache got dropped on every edit before this helper).
 */
export function syncMeritRating(m) {
  return (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
}

/**
 * Issue #39 Task 2: when a Contacts merit's effective rating drops, trim
 * the spheres array to match. Contacts is the only influence merit using
 * spheres-per-dot semantics; the DT-form Contact-action picker reads
 * c.merits[].spheres directly, so a stale sphere array surfaces options
 * the character no longer owns. Truncate-only — increases leave the
 * existing array untouched so newly-added dots render as unselected.
 *
 * Call after any edit that mutates a Contacts merit's rating-source fields
 * (cp / xp / free_* channels, or a free-grant source removal).
 */
export function pruneContactsSpheres(m) {
  if (!m || m.name !== 'Contacts') return;
  if (!Array.isArray(m.spheres)) return;
  // Issue #249 (HOTFIX 2026-05-09): belt-and-braces guard — bail if the
  // rules cache is null. The primary guard lives at the top of
  // applyDerivedMerits (mci.js), so under normal call patterns this
  // branch is dead code. It exists to protect any future caller of
  // pruneContactsSpheres that bypasses applyDerivedMerits — without it,
  // a null-cache call would compute `r` with PT/free_* contributions
  // missing and physically truncate the spheres array (permanent data
  // loss on next save). Truncate-only never silently destroys data
  // again from this path.
  if (!getRulesCache()) {
    console.warn('pruneContactsSpheres: rules cache not loaded — skipping prune to avoid sphere data loss (issue #249)');
    return;
  }
  const r = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
  if (m.spheres.length > r) m.spheres.length = r;
}

/**
 * Effective merit rating: sum of every dot channel + dynamic bonuses.
 * Use this everywhere a calc references a merit's effective dots.
 * Do NOT read m.rating directly — it is unreliable post-import and post-edit.
 *
 * For Haven / Mandragora Garden: capped at attached Safe Place's effective rating.
 * For Safe Place / Feeding Grounds: per-instance total (own + partner for this instance).
 * For Herd: includes SSJ + Flock bonuses.
 */
export function meritEffectiveRating(c, m) {
  if (!c || !m) return 0;
  if (m.category === 'domain') {
    if (CAP_DOMAIN.has(m.name)) {
      const cap = _havenCap(c, m);
      const stored = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
      // #844: if own dots (excluding free_carthian) already meet the cap,
      // the Carthian dot cannot contribute -- ignore it in the effective calc.
      const ownDots = stored - freeOf(m, 'carthian');
      const effectiveStored = (cap > 0 && ownDots >= cap)
        ? ownDots
        : stored;
      // OATH-B (#1111): no partner term on this path, so the suspension
      // applies to the capped figure. The zero floor is REQUIRED rather than
      // defensive — a capped merit can already return fewer dots than the
      // character owns, so cap-minus-pledge is routinely negative.
      return applySuspensionTo(m, Math.min(effectiveStored, cap || stored));
    }
    if (MULTI_INSTANCE_DOMAIN.has(m.name)) {
      return domMeritTotalSingle(c, m);
    }
    if ((m.shared_with || []).length > 0) {
      return domMeritTotal(c, m.name);
    }
  }
  // Issue #790: route through meritFreeSum so the Necropolis-target
  // categorical exclusion applies here too (it would otherwise be bypassed by
  // the inline 14-channel sum). Pre-#790 this was hand-rolled as
  // `(m.cp||0) + (m.xp||0) + (m.free||0) + _meritFreeSumHelper(m)` — a
  // duplicate of meritFreeSum's body plus cp+xp — and silently summed every
  // free channel even on Necropolis target rows.
  const sum = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m);
  // OATH-B (#1111): no partner term here either. The MULTI_INSTANCE and
  // shared branches above subtract inside their own combining helpers and
  // return before reaching this point, so the suspension is applied exactly
  // once on every path — never twice.
  if (m.name === 'Herd') {
    return applySuspensionTo(m, sum + ssjHerdBonus(c) + flockHerdBonus(c));
  }
  return applySuspensionTo(m, sum);
}

/**
 * Returns true if a Carthian Pull bonus dot may be allocated to merit `m`
 * on character `c`. Cap-bound merits (Haven, Mandragora Garden) require that
 * the merit's own dots (all channels except free_carthian) are below the
 * anchor cap. Non-cap-bound merits always return true.
 *
 * #844: "own dots" = cp + xp + meritFreeSum(m) - freeOf(m, 'carthian').
 * This excludes any pre-existing Carthian dot from the room calculation,
 * so the question is: "does the merit have room for one more dot from
 * a non-Carthian source?" -- if yes, a Carthian dot also fits.
 */
export function canAllocateCarthianPull(c, m) {
  if (!CAP_DOMAIN.has(m.name)) return true;
  const cap = _havenCap(c, m);
  if (!cap) return true; // no anchor → no cap constraint
  const ownDots = (m.cp || 0) + (m.xp || 0) + meritFreeSum(m) - freeOf(m, 'carthian');
  return ownDots < cap;
}

/**
 * Effective domain merit access for a character — their own total, or the
 * total from any partner who lists this character in their shared_with.
 * Used by the prereq checker to validate access through shared resources.
 * @param {object} c - character object
 * @param {string} name - merit name (e.g. "Haven")
 * @returns {number}
 */
export function domMeritAccess(c, name) {
  const own = domMeritTotal(c, name);
  if (own > 0) return own;
  if (domMeritContrib(c, name) < 1) return 0;
  for (const partner of (state.chars || [])) {
    const pm = (partner.merits || []).find(m =>
      m.category === 'domain' && m.name === name &&
      (m.shared_with || []).includes(c.name)
    );
    if (pm) return domMeritTotal(partner, name);
  }
  return 0;
}

/* ══════════════════════════════════════════════════════
   Influence calculations
   ══════════════════════════════════════════════════════ */

/**
 * Calculate influence points from a single influence merit entry.
 * Contacts are handled separately via calcContactsInfluence.
 * Standard: 1 at 3 dots, 2 at 5 dots.
 * Narrow Status: 1 at 5 dots only.
 * @param {object} m - merit entry with name, rating, area
 * @returns {number}
 */
export function calcMeritInfluence(c, m, hwv = false) {
  if (m.name === 'Contacts') return 0;
  const r = meritEffectiveRating(c, m);
  // 2026-08-26 Sway merge: 'Sway' folds into the same branch 'Status' already used. This is
  // behaviour-preserving, not a new judgement call — Status's own branch already handled the
  // hwv case identically to Allies' separate one (same formula, line-for-line), so widening this
  // condition to include 'Sway' reproduces both predecessors' behaviour exactly: narrow-qualified
  // (1/0), hwv (2/1/0 at lowered thresholds), or the plain default (2/1/0) — the same three cases
  // that already existed, just reached through one merit name instead of two.
  if (m.name === 'Status' || m.name === 'Sway') {
    const hasNarrow = (m.narrow && typeof m.narrow === 'string' && m.narrow.trim()) ||
                      (m.area && !INFLUENCE_SPHERES.some(s => s.toLowerCase() === (m.area || '').trim().toLowerCase()));
    if (hasNarrow) return r >= 5 ? 1 : 0;
    if (hwv) return r >= 4 ? 2 : r >= 2 ? 1 : 0;
    return r >= 5 ? 2 : r >= 3 ? 1 : 0;
  }
  // Allies: Honey with Vinegar lowers threshold
  if (hwv && m.name === 'Allies') return r >= 4 ? 2 : r >= 2 ? 1 : 0;
  if (r >= 5) return 2;
  if (r >= 3) return 1;
  return 0;
}

/**
 * Calculate influence from all Contacts merits combined.
 * Sums all Contact dots (capped at 5), then applies threshold.
 * @param {object} c - character object
 * @returns {number}
 */
export function calcContactsInfluence(c) {
  const hwv = hasHoneyWithVinegar(c);
  const total = Math.min(5, (c.merits || [])
    .filter(m => m.category === 'influence' && m.name === 'Contacts')
    .reduce((s, m) => s + meritEffectiveRating(c, m), 0));
  if (hwv) return total >= 4 ? 2 : total >= 2 ? 1 : 0;
  if (total >= 5) return 2;
  if (total >= 3) return 1;
  return 0;
}

/**
 * Calculate total influence for a character from all sources.
 * Includes clan/covenant status, influence merits, contacts, and MCI at 5.
 * @param {object} c - character object
 * @returns {number}
 */
/** Check if character has Honey with Vinegar merit. */
export function hasHoneyWithVinegar(c) {
  return (c.merits || []).some(m => m.name === 'Honey With Vinegar' || m.name === 'Honey with Vinegar');
}

/* ══════════════════════════════════════════════════════
   Viral Mythology helpers
   ══════════════════════════════════════════════════════ */

/** Check if character has Viral Mythology merit. */
export function hasViralMythology(c) {
  return (c.merits || []).some(m => m.name === 'Viral Mythology');
}

/**
 * Count purchased dots across non-VM Allies and Herd merits — single shared
 * VM pool spanning both target merits. Allies includes free_mci because MCI
 * grants count as real influence resources (preserves prior behaviour).
 * VM-generated Allies (granted_by: 'VM') are excluded to prevent feedback loop.
 */
// 2026-08-26 Sway merge: 'Allies' is becoming 'Sway' (Angelus's ruling). Every '|| m.name ===
// \'Sway\'' below is checking both names, tolerant of either side of the character-data
// migration. free_grants.mci/free_mci are unchanged — MCI's own free-grant channel key doesn't
// move when MCI is renamed to Organisation ("just a rebrand", per Angelus).
export function vmPool(c) {
  let total = 0;
  (c.merits || []).forEach((m) => {
    if (m.granted_by === 'VM') return;
    if (m.category === 'influence' && (m.name === 'Allies' || m.name === 'Sway')) {
      total += (m.cp || 0) + (m.xp || 0) + freeOf(m, 'mci');
    } else if (m.name === 'Herd') {
      if (m.derived) return;
      total += (m.cp || 0) + (m.xp || 0);
    }
  });
  return total;
}

/** Sum of free_vm allocated across Allies/Sway + Herd merits. */
export function vmUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m) => {
    if (m.granted_by === 'VM') return;
    if ((m.category === 'influence' && (m.name === 'Allies' || m.name === 'Sway')) || m.name === 'Herd') {
      total += freeOf(m, 'vm');
    }
  });
  return total;
}

/** Check if character has Oath of the Hard Motherfucker (stored as a pact in c.powers). */
export function hasOHM(c) {
  return (c.powers || []).some(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the hard motherfucker');
}

/** Count OHM bonus dots allocated via free_ohm on Allies/Sway, Contacts, and Resources entries. */
export function ohmUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.category !== 'influence') return;
    if (m.name !== 'Allies' && m.name !== 'Sway' && m.name !== 'Contacts' && m.name !== 'Resources') return;
    total += freeOf(m, 'ohm');
  });
  return total;
}

/** Check if character has the Invested merit. */
export function hasInvested(c) {
  return (c.merits || []).some(m => m.name === 'Invested');
}

/** Invested pool: dots equal to effective Invictus (covenant) Status (including OTS floor). */
export function investedPool(c) {
  if (!hasInvested(c)) return 0;
  return effectiveInvictusStatus(c);
}

/** Count Invested bonus dots allocated via free_inv on eligible merits. */
export function investedUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m) => {
    const isInvictusTarget = ['Herd', 'Mentor', 'Resources', 'Retainer', 'Attach\u00e9'].includes(m.name)
      || (m.name && m.name.startsWith('Attach\u00e9 ('));  // variants count as Retainer-equivalent
    if (!isInvictusTarget) return;
    total += freeOf(m, 'inv');
  });
  return total;
}

/** Effective Invictus covenant status — purchased dots only. OTS no longer
 *  participates here (it's a notional social-check penalty, not a status floor). */
export function effectiveInvictusStatus(c) {
  if (c.covenant !== 'Invictus') return 0;
  return c.status?.covenant?.['Invictus'] || 0;
}

/** Dots granted by an Attaché merit linked to the named target merit. */
export function attacheBonusDots(c, meritName) {
  // N-1 (Concern #11): every read of m.attached_to goes through the normaliser.
  const att = (c.merits || []).find(m => {
    if (m.name !== 'Attach\u00e9') return false;
    const at = normaliseAttachedTo(m.attached_to);
    return !!(at && at.destination === meritName);
  });
  if (!att) return 0;
  return effectiveInvictusStatus(c);
}

/** Check if character has the Lorekeeper merit. */
export function hasLorekeeper(c) {
  return (c.merits || []).some(m => m.name === 'Lorekeeper');
}

/** Sum of Lorekeeper pool grants emitted by the rules engine into _grant_pools.
 *  Used to cap free_lk edits and to display the X/Y counter at the top of
 *  the merits section. Rule-driven; pool size comes from the LK rule_grant
 *  doc (currently Library + Esoteric Armoury purchased dots). */
export function lorekeeperPool(c) {
  return (c._grant_pools || [])
    .filter(p => p.category === 'lk')
    .reduce((s, p) => s + (p.amount || 0), 0);
}

/** Count Lorekeeper bonus dots allocated via free_lk on Herd/Retainer entries. */
export function lorekeeperUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.name !== 'Herd' && m.name !== 'Retainer') return;
    total += freeOf(m, 'lk');
  });
  return total;
}

export function calcTotalInfluence(c) {
  let total = 0;
  const hwv = hasHoneyWithVinegar(c);
  // Clan + Covenant status: 1 per dot each
  const st = c.status || {};
  total += (st.clan || 0) + (st.covenant?.[c.covenant] || 0);
  // Influence merits (Contacts excluded from per-entry calc)
  (c.merits || []).filter(m => m.category === 'influence').forEach(m => {
    total += calcMeritInfluence(c, m, hwv);
  });
  // Contacts: sum all dots, apply threshold to total
  total += calcContactsInfluence(c);
  // MCI at 5 dots: 1 influence
  const mci = (c.merits || []).find(m => m.name === 'Mystery Cult Initiation');
  if (mci && meritEffectiveRating(c, mci) >= 5) total += 1;
  return total;
}

/**
 * Return a line-by-line breakdown of influence sources for tooltip display.
 * Each entry: "Label: N" — only includes sources that contribute > 0.
 */
export function influenceBreakdown(c) {
  const lines = [];
  const st = c.status || {};
  const hwv = hasHoneyWithVinegar(c);
  if (st.clan) lines.push('Clan Status: ' + st.clan);
  const _covVal = st.covenant?.[c.covenant] || 0;
  if (_covVal) lines.push('Covenant Status: ' + _covVal);
  const inflM = (c.merits || []).filter(m => m.category === 'influence' && m.name !== 'Contacts');
  for (const m of inflM) {
    const inf = calcMeritInfluence(c, m, hwv);
    if (!inf) continue;
    const area = (m.area || m.qualifier || '').trim();
    const label = m.name + (area ? ' (' + area + ')' : '');
    lines.push(label + ': ' + inf + (hwv && (m.name === 'Allies' || m.name === 'Sway') ? ' (HWV)' : ''));
  }
  const cInf = calcContactsInfluence(c);
  if (cInf) lines.push('Contacts: ' + cInf + (hwv ? ' (HWV)' : ''));
  const mci = (c.merits || []).find(m => m.name === 'Mystery Cult Initiation');
  if (mci && meritEffectiveRating(c, mci) >= 5) lines.push('MCI 5: 1');
  return lines;
}
