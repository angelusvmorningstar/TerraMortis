/**
 * Grant pool system — MCI, PT, and other sources provide pools of free dots.
 * Users allocate from these pools into merit_creation.free fields.
 * applyDerivedMerits computes available pools each render cycle.
 */

import { MERITS_DB } from '../data/merits-db-data.js';
import { removeMerit, ensureMeritSync } from './merits.js';
import { hasViralMythology, vmAlliesPool, lorekeeperPool } from './domain.js';

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

  // Clear ephemeral tracking
  delete c._pt_nine_again_skills;
  c._grant_pools = [];

  // ── MCI grant pools ──
  const mcis = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation');
  for (const mci of mcis) {
    if (mci.active === false || !mci.benefit_grants) continue;
    const dots = mci.rating || 0;
    for (let d = 0; d < Math.min(dots, mci.benefit_grants.length); d++) {
      const entry = mci.benefit_grants[d];
      if (!entry) continue;
      const grants = Array.isArray(entry) ? entry : (entry.name ? [entry] : []);
      for (const grant of grants) {
        if (!grant || !grant.name) continue;
        c._grant_pools.push({
          source: 'MCI L' + (d + 1),
          name: grant.name,
          category: grant.category || 'general',
          amount: grant.rating || 1,
          qualifier: grant.qualifier || ''
        });
      }
    }
  }

  // ── PT grant pools ──
  const pts = (c.merits || []).filter(m => m.name === 'Professional Training');
  for (const pt of pts) {
    const dots = pt.rating || 0;
    const role = pt.role || '';
    const assets = (pt.asset_skills || []).filter(Boolean);

    // Dot 1: 2 dots of Contacts
    if (dots >= 1 && role) {
      c._grant_pools.push({
        source: 'PT',
        name: 'Contacts',
        category: 'influence',
        amount: 2,
        qualifier: ''
      });
    }

    // Dot 2+: nine_again on asset skills
    if (dots >= 2 && assets.length) {
      if (!c._pt_nine_again_skills) c._pt_nine_again_skills = new Set();
      for (const sk of assets) c._pt_nine_again_skills.add(sk);
    }
  }

  // ── VM grant pool (Allies) ──
  if (hasViralMythology(c)) {
    const vmPool = vmAlliesPool(c);
    if (vmPool > 0) {
      c._grant_pools.push({
        source: 'VM',
        name: 'Allies',
        category: 'influence',
        amount: vmPool,
        qualifier: ''
      });
    }
  }

  // ── Lorekeeper grant pool (Herd/Retainer) ──
  const lkPool = lorekeeperPool(c);
  if (lkPool > 0) {
    c._grant_pools.push({
      source: 'Lorekeeper',
      names: ['Herd', 'Retainer'],
      category: 'domain',
      amount: lkPool,
      qualifier: ''
    });
  }

  // ── Sync ratings from merit_creation (free + cp + xp) ──
  ensureMeritSync(c);
  (c.merits || []).forEach((m, i) => {
    if (m.name === 'Mystery Cult Initiation' || m.name === 'Professional Training') return;
    const mc = (c.merit_creation || [])[i] || {};
    const total = (mc.free || 0) + (mc.cp || 0) + (mc.xp || 0);
    if (total > 0) m.rating = total;
  });
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
