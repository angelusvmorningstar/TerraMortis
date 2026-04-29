/**
 * Grant pool system — MCI, PT, and other sources provide pools of free dots.
 * Users allocate from these pools into merit inline free fields (v3).
 * applyDerivedMerits computes available pools each render cycle.
 */

import { addMerit, ensureMeritSync } from './merits.js';
import { hasViralMythology, vmAlliesPool } from './domain.js';
import { getRulesBySource } from './rule_engine/load-rules.js';
import { applyPTRulesFromDb } from './rule_engine/pt-evaluator.js';
import { applyMCIRulesFromDb } from './rule_engine/mci-evaluator.js';
import { applyOHMRulesFromDb } from './rule_engine/ohm-evaluator.js';
import { applyBloodlineRulesFromDb } from './rule_engine/bloodline-evaluator.js';
import { applyPoolRulesFromDb } from './rule_engine/pool-evaluator.js';
import { applyStyleRetainerRulesFromDb } from './rule_engine/style-retainer-evaluator.js';

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

  // ── VM grant pool (Allies) ──
  if (hasViralMythology(c)) {
    const vmPool = vmAlliesPool(c);
    if (vmPool > 0) {
      c._grant_pools.push({
        source: 'VM',
        name: '_vm',
        category: 'vm',
        amount: vmPool
      });
    }
  }


  // ── OHM: grants, FHP auto-create, and 9-again (evaluator reads from rule_grant / rule_nine_again) ──
  applyOHMRulesFromDb(c, getRulesBySource('Oath of the Hard Motherfucker'));

  // ── Safe Word: grant partner's shared_merit as free_sw dots ──
  (c.merits || []).forEach(m => { m.free_sw = 0; });
  const _swPact = (c.powers || []).find(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word');
  if (_swPact && _swPact.partner) {
    const _swPartner = allChars.find(ch => ch.name === _swPact.partner);
    const _swActive = _swPartner && (_swPartner.powers || []).some(p =>
      p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word' && p.partner === c.name
    );
    if (_swActive) {
      const _partnerPact = (_swPartner.powers || []).find(p =>
        p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the safe word'
      );
      const _smStr = (_partnerPact && _partnerPact.shared_merit ? _partnerPact.shared_merit : '').trim();
      if (_smStr) {
        const _parenM = _smStr.match(/^(.+?)\s*\((.+)\)$/);
        const _mName = _parenM ? _parenM[1].trim() : _smStr;
        const _mArea = _parenM ? _parenM[2].trim() : '';
        const _pm = (_swPartner.merits || []).find(m =>
          m.name === _mName &&
          (!_mArea || (m.area || '').toLowerCase() === _mArea.toLowerCase() ||
                      (m.qualifier || '').toLowerCase() === _mArea.toLowerCase())
        );
        // Grant = partner's own dots only (cp + xp + free_* excluding free_sw to prevent circular)
        const _gr = _pm ? ((_pm.cp||0)+(_pm.free_bloodline||0)+(_pm.free_pet||0)+(_pm.free_mci||0)+
          (_pm.free_vm||0)+(_pm.free_lk||0)+(_pm.free_ohm||0)+(_pm.free_inv||0)+
          (_pm.free_pt||0)+(_pm.free_mdb||0)+(_pm.xp||0)) : 0;
        if (_gr > 0) {
          let _rm = (c.merits || []).find(m =>
            m.name === _mName && m.granted_by === 'Safe Word' &&
            (!_mArea || (m.area || '').toLowerCase() === _mArea.toLowerCase())
          );
          if (!_rm) {
            if (!c.merits) c.merits = [];
            _rm = { name: _mName, category: 'influence', granted_by: 'Safe Word', cp: 0, xp: 0, free_sw: 0 };
            if (_mArea) _rm.area = _mArea;
            c.merits.push(_rm);
          }
          _rm.free_sw = _gr;
        }
      }
    } else {
      // Oath no longer active — remove auto-created SW merit if it has no own dots
      const _swIdx = (c.merits || []).findIndex(m =>
        m.granted_by === 'Safe Word' &&
        !(m.cp) && !(m.xp) && !(m.free_mci) && !(m.free_vm) && !(m.free_bloodline) &&
        !(m.free_pet) && !(m.free_lk) && !(m.free_ohm) && !(m.free_inv) && !(m.free_pt) && !(m.free_mdb)
      );
      if (_swIdx !== -1) c.merits.splice(_swIdx, 1);
    }
  }

  // ── Invested grant pool (evaluator reads from rule_grant) ──
  applyPoolRulesFromDb(c, getRulesBySource('Invested'));

  // ── MDB: auto-apply free_mdb to chosen Crúac Style = Mentor rating ──
  const mdbMerit = (c.merits || []).find(m => m.name === 'The Mother-Daughter Bond');
  if (mdbMerit && mdbMerit.qualifier) {
    const mentorM = (c.merits || []).find(m => m.category === 'influence' && m.name === 'Mentor');
    if (mentorM) {
      const mentorRating = (mentorM.cp||0) + (mentorM.free||0) + (mentorM.free_mci||0) + (mentorM.free_vm||0) + (mentorM.free_lk||0) + (mentorM.free_ohm||0) + (mentorM.free_inv||0) + (mentorM.free_pt||0) + (mentorM.xp||0);
      if (mentorRating > 0) {
        const styleM = (c.merits || []).find(m => m.category === 'general' && m.name === mdbMerit.qualifier);
        if (styleM) styleM.free_mdb = mentorRating;
      }
    }
  }

  // ── Lorekeeper grant pool (evaluator reads from rule_grant) ──
  applyPoolRulesFromDb(c, getRulesBySource('Lorekeeper'));

  // ── Oath of the Scapegoat: floor on covenant status + 2 free style dots per dot ──
  const otsOath = (c.powers || []).find(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the scapegoat');
  c._ots_covenant_bonus = 0;
  c._ots_free_dots = 0;
  const _otsDots = otsOath ? ((otsOath.cp || 0) + (otsOath.xp || 0)) : 0;
  if (_otsDots > 0) {
    c._ots_covenant_bonus = _otsDots;
    c._ots_free_dots = _otsDots * 2;
  } else {
    // Oath absent or unpurchased — clear user-allocated OTS dots from all styles
    (c.fighting_styles || []).forEach(fs => { fs.free_ots = 0; });
  }

  // ── Bloodline grants (specs and merits) ──
  applyBloodlineRulesFromDb(c, getRulesBySource('Bloodline'));

  // ── Sync ratings from inline creation fields (free + cp + xp) ──
  ensureMeritSync(c);
  (c.merits || []).forEach(m => {
    // MCI and PT have their own render logic; MG's total includes partner contributions
    if (m.name === 'Mystery Cult Initiation' || m.name === 'Professional Training' || m.name === 'Mandragora Garden') return;
    const total = (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.free_sw || 0) + (m.cp || 0) + (m.xp || 0);
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
