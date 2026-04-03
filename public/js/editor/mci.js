/**
 * Grant pool system — MCI, PT, and other sources provide pools of free dots.
 * Users allocate from these pools into merit_creation.free fields.
 * applyDerivedMerits computes available pools each render cycle.
 */

import { MERITS_DB } from '../data/merits-db-data.js';
import { removeMerit, ensureMeritSync } from './merits.js';
import { hasViralMythology, vmAlliesPool, hasLorekeeper, lorekeeperPool, lorekeeperUsed, hasOHM, hasInvested, investedPool } from './domain.js';

/**
 * Compute grant pools and set ephemeral tracking data.
 * Does NOT modify merit ratings or free dots — those are user-controlled.
 * @param {object} c - character object (mutated in place)
 */
export function applyDerivedMerits(c) {
  if (!c) return;

  // Strip any legacy derived merits (migration cleanup)
  if (c.merits) {
    for (let i = c.merits.length - 1; i >= 0; i--) {
      if (c.merits[i].derived) removeMerit(c, i);
    }
  }

  // Migrate legacy 'up' field → 'cp' in merit_creation (Excel import artifact)
  (c.merit_creation || []).forEach(mc => {
    if (!mc || !mc.up) return;
    mc.cp = (mc.cp || 0) + mc.up;
    delete mc.up;
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
        if (c.merit_creation) c.merit_creation.splice(ri, 1);
      }
    }
  }

  // Clear ephemeral tracking
  delete c._pt_nine_again_skills;
  delete c._pt_dot4_bonus_skills;
  delete c._mci_dot3_skills;
  delete c._ohm_nine_again_skills;
  c._grant_pools = [];
  c._mci_free_specs = [];

  // ── MCI grant pools ──
  const mcis = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation');
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
  (c.merit_creation || []).forEach(mc => { if (mc) mc.free_pt = 0; });

  // ── MDB: clear stale free_mdb before re-applying ──
  (c.merit_creation || []).forEach(mc => { if (mc) mc.free_mdb = 0; });

  // ── K-9 / Falconry: clear then auto-apply 1 free dot to their granted Retainers ──
  const _STYLE_RETAINER_GRANTS = ['K-9', 'Falconry'];
  (c.merit_creation || []).forEach((mc, i) => {
    if (!mc) return;
    const m = (c.merits || [])[i];
    if (m && m.name === 'Retainer' && _STYLE_RETAINER_GRANTS.includes(m.granted_by)) mc.free = 0;
  });
  _STYLE_RETAINER_GRANTS.forEach(styleName => {
    const hasStyle = (c.fighting_styles || []).some(fs =>
      fs.type !== 'merit' && fs.name === styleName &&
      ((fs.cp||0) + (fs.free||0) + (fs.free_mci||0) + (fs.xp||0) + (fs.up||0)) >= 1
    );
    if (!hasStyle) return;
    const ri = (c.merits || []).findIndex(m => m.name === 'Retainer' && m.granted_by === styleName);
    if (ri < 0) return;
    if (!c.merit_creation) c.merit_creation = [];
    if (!c.merit_creation[ri]) c.merit_creation[ri] = { cp: 0, xp: 0, free: 0 };
    c.merit_creation[ri].free = 1;
  });

  // ── PT grant pools ──
  const pts = (c.merits || []).filter(m => m.name === 'Professional Training');
  for (const pt of pts) {
    const dots = pt.rating || 0;
    const role = pt.role || '';
    const assets = (pt.asset_skills || []).filter(Boolean);

    // Dot 1: 2 free Contacts dots — auto-applied like OHM (no role required)
    if (dots >= 1) {
      const mi = (c.merits || []).findIndex(m => m.category === 'influence' && m.name === 'Contacts');
      if (mi >= 0) {
        if (!c.merit_creation) c.merit_creation = [];
        if (!c.merit_creation[mi]) c.merit_creation[mi] = { cp: 0, xp: 0, free: 0 };
        c.merit_creation[mi].free_pt = 2;
      }
    }

    // Dot 2: nine_again on first 2 asset skills only
    if (dots >= 2 && assets.length) {
      if (!c._pt_nine_again_skills) c._pt_nine_again_skills = new Set();
      for (const sk of assets.slice(0, 2)) c._pt_nine_again_skills.add(sk);
    }

    // Dot 4: bonus dot on chosen asset skill
    if (dots >= 4 && pt.dot4_skill) {
      if (!c._pt_dot4_bonus_skills) c._pt_dot4_bonus_skills = new Set();
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


  // ── OHM: auto-apply 1 free dot each to Contacts and Resources; 1 to chosen Allies sphere ──
  const ohmPact = (c.powers || []).find(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the hard motherfucker');
  if (ohmPact) {
    // Clear stale OHM free dots before re-applying
    (c.merit_creation || []).forEach((mc, i) => {
      if (!mc) return;
      const m = (c.merits || [])[i];
      if (!m || m.category !== 'influence') return;
      if (m.name === 'Contacts' || m.name === 'Resources' || m.name === 'Allies') mc.free_ohm = 0;
    });
    // Auto-apply 1 free_ohm to Contacts and Resources (if they exist)
    ['Contacts', 'Resources'].forEach(mName => {
      const mi = (c.merits || []).findIndex(m => m.category === 'influence' && m.name === mName);
      if (mi < 0) return;
      if (!c.merit_creation) c.merit_creation = [];
      if (!c.merit_creation[mi]) c.merit_creation[mi] = { cp: 0, xp: 0, free: 0 };
      c.merit_creation[mi].free_ohm = 1;
    });
    // Auto-apply 1 free_ohm to the chosen Allies sphere (if set and merit exists)
    const ohmSphere = (ohmPact.ohm_allies_sphere || '').trim();
    if (ohmSphere) {
      const mi = (c.merits || []).findIndex(m =>
        m.category === 'influence' && m.name === 'Allies' &&
        (m.area || '').toLowerCase() === ohmSphere.toLowerCase()
      );
      if (mi >= 0) {
        if (!c.merit_creation[mi]) c.merit_creation[mi] = { cp: 0, xp: 0, free: 0 };
        c.merit_creation[mi].free_ohm = 1;
      }
    }
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
    const mentorIdx = (c.merits || []).findIndex(m => m.category === 'influence' && m.name === 'Mentor');
    if (mentorIdx >= 0) {
      const mmc = (c.merit_creation || [])[mentorIdx] || {};
      const mentorRating = (mmc.cp||0) + (mmc.free||0) + (mmc.free_mci||0) + (mmc.free_vm||0) + (mmc.free_lk||0) + (mmc.free_ohm||0) + (mmc.free_inv||0) + (mmc.free_pt||0) + (mmc.xp||0);
      if (mentorRating > 0) {
        const styleIdx = (c.merits || []).findIndex(m => m.category === 'general' && m.name === mdbMerit.qualifier);
        if (styleIdx >= 0) {
          if (!c.merit_creation) c.merit_creation = [];
          if (!c.merit_creation[styleIdx]) c.merit_creation[styleIdx] = { cp: 0, xp: 0, free: 0 };
          c.merit_creation[styleIdx].free_mdb = mentorRating;
        }
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

  // ── Sync ratings from merit_creation (free + cp + xp) ──
  ensureMeritSync(c);
  (c.merits || []).forEach((m, i) => {
    if (m.name === 'Mystery Cult Initiation' || m.name === 'Professional Training') return;
    const mc = (c.merit_creation || [])[i] || {};
    const total = (mc.free || 0) + (mc.free_mci || 0) + (mc.free_vm || 0) + (mc.free_lk || 0) + (mc.free_ohm || 0) + (mc.free_inv || 0) + (mc.free_pt || 0) + (mc.free_mdb || 0) + (mc.cp || 0) + (mc.xp || 0);
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
  (c.merits || []).forEach((m, i) => { total += ((c.merit_creation || [])[i] || {}).free_mci || 0; });
  (c.fighting_styles || []).forEach(fs => { total += fs.free_mci || 0; });
  return total;
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
  // Sum free across all covered merits
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (!allNames.has(m.name)) return;
    const mc = (c.merit_creation || [])[i] || {};
    total += (mc.free || 0);
  });
  return total;
}

/**
 * Get pools relevant to a merit category for display.
 */
export function getPoolsForCategory(c, category) {
  return (c._grant_pools || []).filter(p => p.category === category);
}
