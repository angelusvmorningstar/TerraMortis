/**
 * Grant pool system — MCI, PT, and other sources provide pools of free dots.
 * Users allocate from these pools into merit inline free fields (v3).
 * applyDerivedMerits computes available pools each render cycle.
 */

import { addMerit, ensureMeritSync } from './merits.js';
import { syncMeritRating, pruneContactsSpheres } from './domain.js';
// N-9 (issue #762): pool readers consume freeOf so they union-read map +
// legacy fields (post-N-2 backfill the persisted data lives in the map).
import { freeOf } from '../data/rules-helpers.js';
import { getRulesBySource, getRulesCache } from './rule_engine/load-rules.js';
import { applyPTRulesFromDb } from './rule_engine/pt-evaluator.js';
import { applyMCIRulesFromDb } from './rule_engine/mci-evaluator.js';
import { applyOHMRulesFromDb } from './rule_engine/ohm-evaluator.js';
import { applyBloodlineRulesFromDb } from './rule_engine/bloodline-evaluator.js';
import { applyPoolRulesFromDb } from './rule_engine/pool-evaluator.js';
import { applyStyleRetainerRulesFromDb } from './rule_engine/style-retainer-evaluator.js';
import { applyMDBRulesFromDb } from './rule_engine/mdb-evaluator.js';
import { applySafeWordRulesFromDb } from './rule_engine/safe-word-evaluator.js';
import { applyOTSRulesFromDb } from './rule_engine/ots-evaluator.js';
import { applyAutoBonusRulesFromDb } from './rule_engine/auto-bonus-evaluator.js';
// N-1 (ADR-005 Rev 2 §D3): Collective Compound sharing-scope synthesis.
// `resolveSharingScope` dispatches on `rule.sharing_scope.type`; for
// `collective_owners_of_merit` it returns the synthesised owner list which
// we write into the dedicated transient `_collective_shared_with` field on
// each target merit. NEVER mutate persisted `m.shared_with` for collective
// scope — see Concern #3.
import { resolveSharingScope } from '../data/rules-helpers.js';

/**
 * Compute grant pools and set ephemeral tracking data.
 * Does NOT modify merit ratings or free dots — those are user-controlled.
 * @param {object} c - character object (mutated in place)
 */
export function applyDerivedMerits(c, allChars = []) {
  if (!c) return;

  // Issue #249 (HOTFIX 2026-05-09): bail out when the rules cache is null.
  // Pre-fix sequence:
  //   1. line 42 below clears `m.free_pt = 0` on every merit
  //   2. line 52 calls applyPTRulesFromDb → no-ops when cache is null
  //      (getRulesBySource returns empty arrays per load-rules.js:43)
  //   3. line 102 calls pruneContactsSpheres → computes
  //      `r = cp + xp + meritFreeSum(m)` with PT contribution missing →
  //      truncates `m.spheres.length` to the deflated rating →
  //      PT-granted spheres physically deleted from the array
  //   4. next save persists the truncated spheres → permanent data loss
  //
  // Triggers: preloadRules silent failure, save-cycle before preload
  // resolves, admin Rules Data view re-preload race, etc.
  //
  // Affected: any character with PT- or MCI-granted Contacts spheres.
  // Yusuf: rating 3 (1 MCI + 2 PT) collapsed to ['Legal'] when bug
  // fired; Street + Underworld physically deleted.
  if (!getRulesCache()) {
    console.warn('applyDerivedMerits: rules cache not loaded — skipping derivation to avoid partial-state corruption (issue #249)');
    return;
  }

  // Clear ephemeral tracking
  c._pt_nine_again_skills = new Set();
  c._pt_dot4_bonus_skills = new Set();
  delete c._mci_dot3_skills;
  delete c._ohm_nine_again_skills;
  c._grant_pools = [];
  c._mci_free_specs = [];
  c._bloodline_free_specs = [];
  // N-1: Collective Compound synthesis is render-time only. Clear any stale
  // `_collective_shared_with` from a previous applyDerivedMerits run so a
  // removed Sepulcher dot retires its synthesised partner list.
  (c.merits || []).forEach(m => { if ('_collective_shared_with' in m) delete m._collective_shared_with; });

  // ── MCI grant pools (evaluator reads from rule_grant / rule_speciality_grant / rule_skill_bonus / rule_tier_budget) ──
  applyMCIRulesFromDb(c, getRulesBySource('Mystery Cult Initiation'));

  // ── PT: clear stale free_pt before re-applying ──
  (c.merits || []).forEach(m => { m.free_pt = 0; });

  // ── MDB: clear stale free_mdb before re-applying ──
  (c.merits || []).forEach(m => { m.free_mdb = 0; });

  // ── K-9 / Falconry: auto-create Retainer grant (evaluator reads from rule_grant, condition='fighting_style_present') ──
  applyStyleRetainerRulesFromDb(c, getRulesBySource('K-9'));
  applyStyleRetainerRulesFromDb(c, getRulesBySource('Falconry'));

  // ── PT grant pools (evaluator reads from rule_grant / rule_nine_again / rule_skill_bonus) ──
  applyPTRulesFromDb(c, getRulesBySource('Professional Training'));

  // ── VM grant pool (Allies, evaluator reads from rule_grant, condition='merit_present') ──
  applyPoolRulesFromDb(c, getRulesBySource('Viral Mythology'));

  // ── OHM: grants, FHP auto-create, and 9-again (evaluator reads from rule_grant / rule_nine_again) ──
  applyOHMRulesFromDb(c, getRulesBySource('Oath of the Hard Motherfucker'));

  // ── Safe Word: mirror partner's shared_merit as free_sw dots ──
  // Only clear when we can re-apply: when allChars is empty the SW evaluator
  // skips (can't verify partner), so clearing would strip persisted free_sw
  // values on every player-side single-arg render.
  if (Array.isArray(allChars) && allChars.length > 0) {
    (c.merits || []).forEach(m => { m.free_sw = 0; });
  }
  applySafeWordRulesFromDb(c, getRulesBySource('Oath of the Safe Word'), allChars);

  // ── Invested grant pool (evaluator reads from rule_grant) ──
  applyPoolRulesFromDb(c, getRulesBySource('Invested'));

  // ── MDB: free dots into chosen Crúac style = Mentor rating (evaluator reads from rule_grant, condition='merit_present') ──
  applyMDBRulesFromDb(c, getRulesBySource('The Mother-Daughter Bond'));

  // ── Lorekeeper grant pool (evaluator reads from rule_grant) ──
  applyPoolRulesFromDb(c, getRulesBySource('Lorekeeper'));

  // ── Necropolis Sepulcher grant pool (N-7c, issue #771): pool=Sepulcher
  //    rating, distributable across the six Collective Compound targets via
  //    `free_grants.necro`. Same pool-evaluator dispatch shape as LK/Inv/VM —
  //    its absence from N-7 left `_grant_pools` empty for necro, which silently
  //    broke the domain counter render AND clamped the per-target stepper to 0
  //    via poolAvailableFor. The helpers + write-path landed in N-7; this is
  //    the producer call that fills the pool. ──
  applyPoolRulesFromDb(c, getRulesBySource('Necropolis Sepulcher'));

  // ── Oath of the Scapegoat: floor on covenant status + 2 free style dots per dot ──
  applyOTSRulesFromDb(c, getRulesBySource('Oath of the Scapegoat'));

  // ── Bloodline grants (specs and merits) ──
  applyBloodlineRulesFromDb(c, getRulesBySource('Bloodline'));

  // ── Auto-bonus rules (FwB on Feeding Grounds, etc.) — single generic call
  //    reading every grant_type='auto_bonus' rule from the cache so adding
  //    a new auto-bonus merit is a seed change, not a code change. ──
  const _autoBonusRules = (getRulesCache()?.rule_grant || []).filter(r => r.grant_type === 'auto_bonus');
  applyAutoBonusRulesFromDb(c, { grants: _autoBonusRules });

  // ── N-1 / ADR-005 Rev 2 §D3: Collective Compound sharing-scope synthesis ──
  // For each rule_grant whose sharing_scope is collective-typed, resolve the
  // synthesised member list and write it to the dedicated `_collective_shared_with`
  // transient field on each target merit instance on this character. NEVER mutate
  // `m.shared_with` (the persisted explicit list); the underscore-prefixed
  // field is stripped on save by `buildSaveBody` (export-character.js).
  //
  // Empty-list contract: members get `_collective_shared_with = []` when they're
  // the only owner; non-members get NO field set (so DOM reads naturally skip).
  // No-op when `allChars` is empty (player-side single-arg render — same guard
  // SafeWord already uses above): can't compute membership without the full
  // chars context, and overwriting a stale list with [] would mis-blank.
  if (Array.isArray(allChars) && allChars.length > 0) {
    const _sharingRules = (getRulesCache()?.rule_grant || [])
      .filter(r => r && r.sharing_scope && r.sharing_scope.type === 'collective_owners_of_merit');
    for (const rule of _sharingRules) {
      const synthesised = resolveSharingScope(rule.sharing_scope, c, allChars, rule);
      if (synthesised == null) continue;          // unknown type / partner_explicit → fall back to persisted shared_with
      const targets = Array.isArray(rule.pool_targets) ? rule.pool_targets : [];
      if (!targets.length) continue;
      for (const m of (c.merits || [])) {
        if (targets.includes(m.name)) m._collective_shared_with = synthesised;
      }
    }
  }

  // ── Sync ratings from inline creation fields (free + cp + xp) ──
  ensureMeritSync(c);
  (c.merits || []).forEach(m => {
    // MCI and PT have their own render logic; MG's total includes partner contributions
    if (m.name === 'Mystery Cult Initiation' || m.name === 'Professional Training' || m.name === 'Mandragora Garden') return;
    const total = syncMeritRating(m);
    if (total > 0) m.rating = total;
    // Issue #144: cascade scenario — a free_* grant clearing here (e.g. MCI
    // removed → free_mci on Contacts drops to 0) lowers the effective rating
    // without going through the user-edit chokepoints (#143). Prune the
    // spheres array on the auto-resync path too so the DT-form picker doesn't
    // surface stale options the character no longer holds.
    pruneContactsSpheres(m);
  });
}

const _MCI_DEFAULT_BUDGETS = [0, 1, 1, 2, 3, 3]; // index = tier (1-indexed), 0 unused

/**
 * Compute total merit pool dots granted by an MCI merit based on per-dot choices.
 * Dot 1: Speciality or 1 merit dot
 * Dot 2: fixed 1 merit dot
 * Dot 3: Skill dot or 2 merit dots
 * Dot 4: fixed 3 merit dots
 * Dot 5: Advantage or 3 merit dots
 *
 * @param {object} mci - MCI merit instance
 * @param {number[]} [budgets] - per-tier amounts from rule_tier_budget (defaults to hardcoded)
 */
export function mciPoolTotal(mci, budgets = _MCI_DEFAULT_BUDGETS) {
  const r = mci.rating || 0;
  let pool = 0;
  if (r >= 1) pool += mci.dot1_choice === 'speciality' ? 0 : (budgets[1] ?? 1);
  if (r >= 2) pool += (budgets[2] ?? 1);
  if (r >= 3) pool += mci.dot3_choice === 'skill' ? 0 : (budgets[3] ?? 2);
  if (r >= 4) pool += (budgets[4] ?? 3);
  if (r >= 5) pool += mci.dot5_choice === 'advantage' ? 0 : (budgets[5] ?? 3);
  return pool;
}

/** Sum all free_mci dots allocated across every merit and fighting style.
 *
 *  N-9 (issue #762, Bug 1): consumes `freeOf` (union-read map + legacy) so the
 *  pool counter at top of merits reads correct numerator on backfilled data.
 *  Pre-N-9 this read only `m.free_mci`, missing every grant that had been
 *  migrated into `m.free_grants.mci` by N-2's backfill — the counter showed
 *  0/Y while the denominator moved as MCI XP shifted, making the per-row
 *  selectors look broken when they were actually wired correctly. */
export function getMCIPoolUsed(c) {
  let total = 0;
  (c.merits || []).forEach(m => { total += freeOf(m, 'mci'); });
  (c.fighting_styles || []).forEach(fs => { total += freeOf(fs, 'mci'); });
  return total;
}

/** Sum all free_ots dots allocated across fighting styles (Oath of the Scapegoat pool).
 *  N-9 (issue #762): freeOf union-read for N-2-backfill safety. */
export function getOTSPoolUsed(c) {
  return (c.fighting_styles || []).reduce((s, fs) => s + freeOf(fs, 'ots'), 0);
}

/** Check if a pool matches a merit name (supports single `name` or multi `names`). */
function _poolMatchesName(pool, meritName) {
  if (pool.names) return pool.names.includes(meritName);
  return pool.name === meritName;
}

/**
 * Get total pool available for a merit name from all grant sources.
 * For shared pools (names array), returns the full shared amount.
 */
export function getPoolTotal(c, meritName) {
  return (c._grant_pools || [])
    .filter(p => _poolMatchesName(p, meritName))
    .reduce((s, p) => s + p.amount, 0);
}

/**
 * Get total free dots used from pools that include meritName.
 * For shared pools, sums free across ALL target merit names.
 */
export function getPoolUsed(c, meritName) {
  // Find all pools that include this merit
  const matchedPools = (c._grant_pools || []).filter(p => _poolMatchesName(p, meritName));
  // Collect all merit names + slugs (pool categories) covered.
  const allNames = new Set();
  const slugs = new Set();
  matchedPools.forEach(p => {
    if (p.names) p.names.forEach(n => allNames.add(n));
    else if (p.name) allNames.add(p.name);
    if (p.category) slugs.add(p.category);
  });
  // Sum all named grant fields across all covered merits.
  //
  // N-9 (issue #762, Bug 1): the legacy implementation iterated
  // `Object.entries(m)` for `free_*` keys — caught legacy flat fields but
  // NOT the new `m.free_grants` map. For each matched-pool category we now
  // also read `freeOf(m, slug)` so the map entries are picked up. The
  // legacy `free_*` enumeration is retained for transitional safety on the
  // few channels (free / free_fwb / free_attache / free_carthian) that
  // aren't pool categories tracked in `_grant_pools.category` — those
  // continue to count as before, but for the categories that DO have a
  // pool the freeOf union-read becomes the canonical source.
  let total = 0;
  (c.merits || []).forEach(m => {
    if (!allNames.has(m.name)) return;
    for (const slug of slugs) total += freeOf(m, slug);
    // Anything else that starts with `free_` but isn't a pool category
    // (free, free_fwb, free_attache, free_carthian, etc.) — keep the
    // legacy enumeration so this helper's pre-N-9 behaviour for non-pool
    // free fields is preserved. Pool categories are skipped here because
    // `freeOf` already consumed both their map and legacy values above.
    for (const [k, v] of Object.entries(m)) {
      if (!k.startsWith('free_') || k === 'free_grants') continue;
      if (typeof v !== 'number') continue;
      const slug = k.slice('free_'.length);
      if (slugs.has(slug)) continue; // already counted via freeOf above
      total += v;
    }
  });
  return total;
}

/**
 * Get pools relevant to a merit category for display.
 */
export function getPoolsForCategory(c, category) {
  return (c._grant_pools || []).filter(p => p.category === category);
}
