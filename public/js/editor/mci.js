/**
 * Grant pool system — MCI, PT, and other sources provide pools of free dots.
 * Users allocate from these pools into merit inline free fields (v3).
 * applyDerivedMerits computes available pools each render cycle.
 */

import { addMerit, ensureMeritSync } from './merits.js';
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

/**
 * Compute grant pools and set ephemeral tracking data.
 * Does NOT modify merit ratings or free dots — those are user-controlled.
 * @param {object} c - character object (mutated in place)
 */
export function applyDerivedMerits(c, allChars = []) {
  if (!c) return;

  // Clear ephemeral tracking
  c._pt_nine_again_skills = new Set();
  c._pt_dot4_bonus_skills = new Set();
  delete c._mci_dot3_skills;
  delete c._ohm_nine_again_skills;
  c._grant_pools = [];
  c._mci_free_specs = [];
  c._bloodline_free_specs = [];

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

  // ── Oath of the Scapegoat: floor on covenant status + 2 free style dots per dot ──
  applyOTSRulesFromDb(c, getRulesBySource('Oath of the Scapegoat'));

  // ── Bloodline grants (specs and merits) ──
  applyBloodlineRulesFromDb(c, getRulesBySource('Bloodline'));

  // ── Auto-bonus rules (FwB on Feeding Grounds, etc.) — single generic call
  //    reading every grant_type='auto_bonus' rule from the cache so adding
  //    a new auto-bonus merit is a seed change, not a code change. ──
  const _autoBonusRules = (getRulesCache()?.rule_grant || []).filter(r => r.grant_type === 'auto_bonus');
  applyAutoBonusRulesFromDb(c, { grants: _autoBonusRules });

  // ── Sync ratings from inline creation fields (free + cp + xp) ──
  ensureMeritSync(c);
  (c.merits || []).forEach(m => {
    // MCI and PT have their own render logic; MG's total includes partner contributions
    if (m.name === 'Mystery Cult Initiation' || m.name === 'Professional Training' || m.name === 'Mandragora Garden') return;
    const total = (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.free_sw || 0) + (m.free_fwb || 0) + (m.cp || 0) + (m.xp || 0);
    if (total > 0) m.rating = total;
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

/** Sum all free_mci dots allocated across every merit and fighting style. */
export function getMCIPoolUsed(c) {
  let total = 0;
  (c.merits || []).forEach(m => { total += m.free_mci || 0; });
  (c.fighting_styles || []).forEach(fs => { total += fs.free_mci || 0; });
  return total;
}

/** Sum all free_ots dots allocated across fighting styles (Oath of the Scapegoat pool). */
export function getOTSPoolUsed(c) {
  return (c.fighting_styles || []).reduce((s, fs) => s + (fs.free_ots || 0), 0);
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
  // Collect all merit names covered by these pools
  const allNames = new Set();
  matchedPools.forEach(p => {
    if (p.names) p.names.forEach(n => allNames.add(n));
    else if (p.name) allNames.add(p.name);
  });
  // Sum all named grant fields across all covered merits
  let total = 0;
  (c.merits || []).forEach(m => {
    if (!allNames.has(m.name)) return;
    for (const [k, v] of Object.entries(m)) {
      if (k.startsWith('free_') && typeof v === 'number') total += v;
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
