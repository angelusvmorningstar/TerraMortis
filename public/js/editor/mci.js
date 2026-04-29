/**
 * Grant pool system — MCI, PT, and other sources provide pools of free dots.
 * Users allocate from these pools into merit inline free fields (v3).
 * applyDerivedMerits computes available pools each render cycle.
 */

import { addMerit, ensureMeritSync } from './merits.js';
import { hasViralMythology, vmAlliesPool, hasLorekeeper, lorekeeperPool, lorekeeperUsed, hasOHM, hasInvested, investedPool } from './domain.js';
import { BLOODLINE_GRANTS } from '../data/constants.js';
import { getRulesBySource } from './rule_engine/load-rules.js';
import { applyPTRulesFromDb } from './rule_engine/pt-evaluator.js';

/**
 * Compute grant pools and set ephemeral tracking data.
 * Does NOT modify merit ratings or free dots — those are user-controlled.
 * @param {object} c - character object (mutated in place)
 */
const MCI_TIER_BUDGETS = [0, 1, 1, 2, 3, 3]; // index = tier number (1-5), 0 unused

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

  // ── MCI grant pools ──
  const mcis = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation');
  // Sync MCI rating from inline creation fields. MCI is excluded from the general merit sync
  // (edit.js ensureMeritSync skips it), but rating must be accurate for tier grant pruning and
  // pool calculations. The ingest script sets cp/xp but leaves rating at 0, causing tier grants
  // to be pruned on every render. Only sync when inline fields are present (legacy JSON data
  // only has rating, no cp/xp, and must not be overwritten with 0).
  for (const mci of mcis) {
    const _inlineTotal = (mci.cp || 0) + (mci.xp || 0) + (mci.free || 0);
    if (_inlineTotal > 0) {
      mci.rating = _inlineTotal;
    }
  }
  // Collect free specialisations granted by active MCIs at dot 1
  mcis.filter(m => m.active !== false && (m.rating || 0) >= 1 && m.dot1_choice === 'speciality').forEach(m => {
    if (m.dot1_spec_skill && m.dot1_spec) c._mci_free_specs.push({ skill: m.dot1_spec_skill, spec: m.dot1_spec });
  });
  // Collect bonus skill dots granted by active MCIs at dot 3
  mcis.filter(m => m.active !== false && (m.rating || 0) >= 3 && m.dot3_choice === 'skill' && m.dot3_skill).forEach(m => {
    if (!c._mci_dot3_skills) c._mci_dot3_skills = new Set();
    c._mci_dot3_skills.add(m.dot3_skill);
  });
  const totalMCIPool = mcis.filter(m => m.active !== false).reduce((s, m) => s + mciPoolTotal(m), 0);
  if (totalMCIPool > 0) {
    c._grant_pools.push({ source: 'MCI', name: '_mci', category: 'any', amount: totalMCIPool });
  }

  // ── PT: clear stale free_pt before re-applying ──
  (c.merits || []).forEach(m => { m.free_pt = 0; });

  // ── MDB: clear stale free_mdb before re-applying ──
  (c.merits || []).forEach(m => { m.free_mdb = 0; });

  // ── K-9 / Falconry: clear then auto-apply 1 free dot to their granted Retainers ──
  const _STYLE_RETAINER_GRANTS = ['K-9', 'Falconry'];
  (c.merits || []).forEach(m => {
    if (m.name === 'Retainer' && _STYLE_RETAINER_GRANTS.includes(m.granted_by)) { m.free = 0; m.free_pet = 0; }
  });
  _STYLE_RETAINER_GRANTS.forEach(styleName => {
    const hasStyle = (c.fighting_styles || []).some(fs =>
      fs.type !== 'merit' && fs.name === styleName &&
      ((fs.cp||0) + (fs.free||0) + (fs.free_mci||0) + (fs.free_ots||0) + (fs.xp||0) + (fs.up||0)) >= 1
    );
    if (!hasStyle) return;
    let m = (c.merits || []).find(m => m.name === 'Retainer' && m.granted_by === styleName);
    if (!m) {
      const area = styleName === 'K-9' ? 'Dog' : 'Falcon';
      if (!c.merits) c.merits = [];
      m = { name: 'Retainer', category: 'influence', rating: 0, area, granted_by: styleName };
      c.merits.push(m);
    }
    m.free_pet = 1;
  });

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


  // ── OHM: auto-apply 1 free dot each to Contacts and Resources; 1 to chosen Allies sphere;
  //        also grant Friends in High Places for free ──
  const ohmPact = (c.powers || []).find(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the hard motherfucker');
  // Clear stale OHM free dots on all merits before re-applying
  (c.merits || []).forEach(m => { m.free_ohm = 0; });
  if (ohmPact) {
    // Auto-apply 1 free_ohm to Contacts and Resources (if they exist)
    ['Contacts', 'Resources'].forEach(mName => {
      const m = (c.merits || []).find(m => m.category === 'influence' && m.name === mName);
      if (m) m.free_ohm = 1;
    });
    // Auto-apply 1 free_ohm to the chosen Allies sphere (if set and merit exists)
    const ohmSphere = (ohmPact.ohm_allies_sphere || '').trim();
    if (ohmSphere) {
      const m = (c.merits || []).find(m =>
        m.category === 'influence' && m.name === 'Allies' &&
        (m.area || '').toLowerCase() === ohmSphere.toLowerCase()
      );
      if (m) m.free_ohm = 1;
    }
    // Auto-grant Friends in High Places (general merit) for free
    let fhpM = (c.merits || []).find(m => m.name === 'Friends in High Places' && m.granted_by === 'OHM');
    if (!fhpM) {
      if (!c.merits) c.merits = [];
      fhpM = { name: 'Friends in High Places', category: 'general', granted_by: 'OHM', rating: 0 };
      c.merits.push(fhpM);
    }
    fhpM.free_ohm = 1;
    // Grant pool for tracking display
    c._grant_pools.push({
      source: 'Oath of the Hard Motherfucker',
      names: ['Allies', 'Contacts', 'Resources'],
      category: 'ohm',
      amount: 3
    });
    // 9-again on chosen skills
    const skills = ohmPact.ohm_skills || [];
    if (skills.length) {
      c._ohm_nine_again_skills = new Set(skills.filter(Boolean));
    }
  } else {
    // No OHM — remove auto-granted FHP if present
    const fhpIdx = (c.merits || []).findIndex(m => m.name === 'Friends in High Places' && m.granted_by === 'OHM');
    if (fhpIdx !== -1) c.merits.splice(fhpIdx, 1);
  }

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

  // ── Invested grant pool (Herd/Mentor/Resources/Retainer = Invictus Status dots) ──
  if (hasInvested(c)) {
    const invPool = investedPool(c);
    if (invPool > 0) {
      c._grant_pools.push({
        source: 'Invested',
        names: ['Herd', 'Mentor', 'Resources', 'Retainer'],
        category: 'inv',
        amount: invPool
      });
    }
  }

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

  // ── Lorekeeper grant pool (Herd/Retainer) ──
  if (hasLorekeeper(c)) {
    const lkPool = lorekeeperPool(c);
    if (lkPool > 0) {
      c._grant_pools.push({
        source: 'Lorekeeper',
        names: ['Herd', 'Retainer'],
        category: 'lk',
        amount: lkPool
      });
    }
  }

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
  // Clear stale free/free_bloodline on bloodline merits before re-applying so
  // ex-bloodline characters don't carry orphaned grant dots indefinitely.
  (c.merits || []).forEach(m => { if (m.granted_by === 'Bloodline') { m.free = 0; m.free_bloodline = 0; } });
  const bloodlineGrants = BLOODLINE_GRANTS[c.bloodline];
  if (bloodlineGrants) {
    for (const { skill, spec } of (bloodlineGrants.skill_specs || [])) {
      if (!c.skills) c.skills = {};
      if (!c.skills[skill]) c.skills[skill] = { dots: 0, bonus: 0, specs: [], nine_again: false };
      if (!c.skills[skill].specs) c.skills[skill].specs = [];
      if (!c.skills[skill].specs.includes(spec)) c.skills[skill].specs.push(spec);
      c._bloodline_free_specs.push({ skill, spec });
    }
    for (const grant of (bloodlineGrants.merits || [])) {
      const gq = (grant.qualifier || '').toLowerCase().trim();
      // Case-insensitive qualifier match to avoid duplicates from capitalisation drift
      const existing = (c.merits || []).find(m =>
        m.name === grant.name && m.granted_by === 'Bloodline' &&
        (m.qualifier || '').toLowerCase().trim() === gq
      );
      if (existing) {
        // Normalise qualifier case to canonical form from grant definition
        if (grant.qualifier != null) existing.qualifier = grant.qualifier;
        existing.free_bloodline = 1;
      } else {
        if (!c.merits) c.merits = [];
        c.merits.push({ name: grant.name, category: grant.category, qualifier: grant.qualifier || null, free_bloodline: 1, granted_by: 'Bloodline' });
      }
      // Remove any extra duplicates (stale case-mismatch entries already in DB)
      const canonical = existing || c.merits[c.merits.length - 1];
      const dupes = (c.merits || []).filter(m =>
        m !== canonical && m.name === grant.name && m.granted_by === 'Bloodline' &&
        (m.qualifier || '').toLowerCase().trim() === gq
      );
      dupes.forEach(d => c.merits.splice(c.merits.indexOf(d), 1));
    }
  }

  // ── Sync ratings from inline creation fields (free + cp + xp) ──
  ensureMeritSync(c);
  (c.merits || []).forEach(m => {
    // MCI and PT have their own render logic; MG's total includes partner contributions
    if (m.name === 'Mystery Cult Initiation' || m.name === 'Professional Training' || m.name === 'Mandragora Garden') return;
    const total = (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.free_sw || 0) + (m.cp || 0) + (m.xp || 0);
    if (total > 0) m.rating = total;
  });
}

/**
 * Compute total merit pool dots granted by an MCI merit based on per-dot choices.
 * Dot 1: Speciality or 1 merit dot
 * Dot 2: fixed 1 merit dot
 * Dot 3: Skill dot or 2 merit dots
 * Dot 4: fixed 3 merit dots
 * Dot 5: Advantage or 3 merit dots
 */
export function mciPoolTotal(mci) {
  const r = mci.rating || 0;
  let pool = 0;
  if (r >= 1) pool += mci.dot1_choice === 'speciality' ? 0 : 1;
  if (r >= 2) pool += 1;
  if (r >= 3) pool += mci.dot3_choice === 'skill' ? 0 : 2;
  if (r >= 4) pool += 3;
  if (r >= 5) pool += mci.dot5_choice === 'advantage' ? 0 : 3;
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
