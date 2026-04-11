/**
 * Grant pool system — MCI, PT, and other sources provide pools of free dots.
 * Users allocate from these pools into merit inline free fields (v3).
 * applyDerivedMerits computes available pools each render cycle.
 */

import { addMerit, removeMerit, ensureMeritSync } from './merits.js';
import { hasViralMythology, vmAlliesPool, hasLorekeeper, lorekeeperPool, lorekeeperUsed, hasOHM, hasInvested, investedPool } from './domain.js';
import { BLOODLINE_GRANTS } from '../data/constants.js';

/**
 * Compute grant pools and set ephemeral tracking data.
 * Does NOT modify merit ratings or free dots — those are user-controlled.
 * @param {object} c - character object (mutated in place)
 */
const MCI_TIER_BUDGETS = [0, 1, 1, 2, 3, 3]; // index = tier number (1-5), 0 unused

export function applyDerivedMerits(c) {
  if (!c) return;

  // Strip any legacy derived merits (migration cleanup)
  if (c.merits) {
    for (let i = c.merits.length - 1; i >= 0; i--) {
      if (c.merits[i].derived) removeMerit(c, i);
    }
  }

  // Migrate legacy 'up' field → 'cp' on merit objects (Excel import artifact)
  (c.merits || []).forEach(m => {
    if (!m || !m.up) return;
    m.cp = (m.cp || 0) + m.up;
    delete m.up;
  });

  // Migrate legacy MCI-granted merits: old code stamped granted_by on merits it created.
  // Current system is pool-based (free_mci only) and never sets granted_by for MCI.
  // Clear the field so these orphaned merits become ST-editable/deletable.
  (c.merits || []).forEach(m => {
    if (m.granted_by === 'Mystery Cult Initiation' || m.granted_by === 'MCI') delete m.granted_by;
  });

  // Migrate Fucking Thief stolen merits: backfill granted_by if missing
  const ftMerit = (c.merits || []).find(m => m.name === 'Fucking Thief' && m.category === 'general');
  if (ftMerit && ftMerit.qualifier) {
    const stolenIdx = (c.merits || []).findIndex(m => m.name === ftMerit.qualifier && m.category === 'general' && !m.granted_by);
    if (stolenIdx >= 0) c.merits[stolenIdx].granted_by = 'Fucking Thief';
  }
  // Clear legacy free dot on Fucking Thief stolen merits (never legitimate)
  (c.merits || []).forEach(m => { if (m.granted_by === 'Fucking Thief') m.free = 0; });

  // Migrate legacy benefit_grants → tier_grants on MCI merits
  (c.merits || []).forEach(m => {
    if (m.name !== 'Mystery Cult Initiation') return;
    if (m.tier_grants || !m.benefit_grants || !m.benefit_grants.length) return;
    m.tier_grants = [];
    m.benefit_grants.forEach((bg, i) => {
      if (!bg || !bg.name) return;
      m.tier_grants.push({ tier: i + 1, name: bg.name, category: bg.category || 'general', rating: bg.rating || 1, qualifier: bg.qualifier || bg.area || null });
    });
  });

  // Auto-map free_mci allocations to tier_grants when tier_grants is absent.
  // Matches merits by free_mci amount to available tier budgets (greedy, largest first).
  // Runs once per MCI — once tier_grants exists, user manages it manually.
  const _AUTO_TIER_BUDGETS = MCI_TIER_BUDGETS;
  (c.merits || []).forEach(mci => {
    if (mci.name !== 'Mystery Cult Initiation' || mci.tier_grants) return;
    const rating = mci.rating || 0;
    if (rating === 0) return;
    const d1c = mci.dot1_choice || 'merits', d3c = mci.dot3_choice || 'merits', d5c = mci.dot5_choice || 'merits';
    // Build list of available merit tiers (descending budget for greedy match)
    const avail = [];
    if (rating >= 5 && d5c === 'merits') avail.push(5);
    if (rating >= 4) avail.push(4);
    if (rating >= 3 && d3c === 'merits') avail.push(3);
    if (rating >= 2) avail.push(2);
    if (rating >= 1 && d1c === 'merits') avail.push(1);
    if (!avail.length) return;
    // Collect merits with free_mci, sorted largest first
    const candidates = (c.merits || [])
      .filter(m => m !== mci && (m.free_mci || 0) > 0)
      .map(m => ({ name: m.name, category: m.category, rating: m.free_mci, qualifier: m.area || m.qualifier || null }))
      .sort((a, b) => b.rating - a.rating);
    if (!candidates.length) return;
    mci.tier_grants = [];
    const usedTiers = new Set();
    for (const cand of candidates) {
      // Find best matching tier: budget >= candidate rating, not yet used
      const tier = avail.find(t => !usedTiers.has(t) && _AUTO_TIER_BUDGETS[t] >= cand.rating);
      if (tier == null) continue;
      usedTiers.add(tier);
      mci.tier_grants.push({ tier, name: cand.name, category: cand.category, rating: Math.min(cand.rating, _AUTO_TIER_BUDGETS[tier]), qualifier: cand.qualifier });
    }
  });

  // Migrate legacy 'Regular' fighting style → 'Fighting Merit' (type: merit)
  (c.fighting_styles || []).forEach(fs => {
    if (fs.name === 'Regular') { fs.name = 'Fighting Merit'; fs.type = 'merit'; }
  });

  // Migrate Mandragora Garden from general → domain if miscategorised
  (c.merits || []).forEach(m => {
    if (m.name === 'Mandragora Garden' && m.category !== 'domain') m.category = 'domain';
  });
  // De-duplicate domain Mandragora Gardens: keep the one with shared_with (proper domain entry),
  // remove legacy extras (e.g. old general entry with granted_by). Splice in reverse index order.
  {
    const mgIdxs = (c.merits || []).reduce((a, m, i) => m.name === 'Mandragora Garden' ? [...a, i] : a, []);
    if (mgIdxs.length > 1) {
      // Prefer to keep: 1) has shared_with, 2) no granted_by, 3) first in array
      let keepIdx = mgIdxs.find(i => (c.merits[i].shared_with || []).length > 0);
      if (keepIdx === undefined) keepIdx = mgIdxs.find(i => !c.merits[i].granted_by);
      if (keepIdx === undefined) keepIdx = mgIdxs[0];
      const toRemove = mgIdxs.filter(i => i !== keepIdx).sort((a, b) => b - a);
      for (const ri of toRemove) {
        c.merits.splice(ri, 1);
      }
    }
  }

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
    if (m.name === 'Retainer' && _STYLE_RETAINER_GRANTS.includes(m.granted_by)) { m.free = 0; m.free_retainer = 0; }
  });
  _STYLE_RETAINER_GRANTS.forEach(styleName => {
    const hasStyle = (c.fighting_styles || []).some(fs =>
      fs.type !== 'merit' && fs.name === styleName &&
      ((fs.cp||0) + (fs.free||0) + (fs.free_mci||0) + (fs.xp||0) + (fs.up||0)) >= 1
    );
    if (!hasStyle) return;
    let m = (c.merits || []).find(m => m.name === 'Retainer' && m.granted_by === styleName);
    if (!m) {
      const area = styleName === 'K-9' ? 'Dog' : 'Falcon';
      if (!c.merits) c.merits = [];
      m = { name: 'Retainer', category: 'influence', rating: 0, area, granted_by: styleName };
      c.merits.push(m);
    }
    m.free_retainer = 1;
  });

  // ── PT grant pools ──
  const pts = (c.merits || []).filter(m => m.name === 'Professional Training');
  // Sync PT rating from inline creation fields before applying grants (mirrors MCI early sync)
  for (const pt of pts) {
    const _ptInlineTotal = (pt.cp || 0) + (pt.xp || 0) + (pt.free || 0);
    if (_ptInlineTotal > 0) pt.rating = _ptInlineTotal;
  }
  for (const pt of pts) {
    const dots = pt.rating || 0;
    const role = pt.role || '';
    const assets = (pt.asset_skills || []).filter(Boolean);

    // Dot 1: 2 free Contacts dots — auto-applied like OHM (no role required)
    if (dots >= 1) {
      let ctM = (c.merits || []).find(m => m.category === 'influence' && m.name === 'Contacts');
      if (!ctM) {
        if (!c.merits) c.merits = [];
        ctM = { name: 'Contacts', category: 'influence', rating: 0, granted_by: 'PT' };
        c.merits.push(ctM);
      }
      ctM.free_pt = 2;
    }

    // Dot 2: nine_again on all asset skills (3rd skill added at dot 3 also qualifies)
    if (dots >= 2 && assets.length) {
      for (const sk of assets) c._pt_nine_again_skills.add(sk);
    }

    // Dot 4: bonus dot on chosen asset skill
    if (dots >= 4 && pt.dot4_skill) {
      c._pt_dot4_bonus_skills.add(pt.dot4_skill);
    }
  }

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
  if (otsOath) {
    const otsDots = (otsOath.cp || 0) + (otsOath.xp || 0);
    if (otsDots > 0) {
      c._ots_covenant_bonus = otsDots;
      c._ots_free_dots = otsDots * 2;
    }
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
    const total = (m.free_bloodline || 0) + (m.free_retainer || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0) + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.cp || 0) + (m.xp || 0);
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
