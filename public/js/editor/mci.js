/**
 * Grant pool system — MCI, PT, and other sources provide pools of free dots.
 * Users allocate from these pools into merit_creation.free fields.
 * applyDerivedMerits computes available pools each render cycle.
 */

import { MERITS_DB } from '../data/merits-db-data.js';
import { removeMerit, ensureMeritSync } from './merits.js';
import { hasViralMythology, vmAlliesPool } from './domain.js';

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

  // ── Sync ratings from merit_creation (free + cp + xp) ──
  ensureMeritSync(c);
  (c.merits || []).forEach((m, i) => {
    if (m.name === 'Mystery Cult Initiation' || m.name === 'Professional Training') return;
    const mc = (c.merit_creation || [])[i] || {};
    const total = (mc.free || 0) + (mc.cp || 0) + (mc.xp || 0);
    if (total > 0) m.rating = total;
  });
}

/**
 * Get total pool available for a merit name from all grant sources.
 */
export function getPoolTotal(c, meritName) {
  return (c._grant_pools || [])
    .filter(p => p.name === meritName)
    .reduce((s, p) => s + p.amount, 0);
}

/**
 * Get total free dots allocated to merits of a given name.
 */
export function getPoolUsed(c, meritName) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.name !== meritName) return;
    const mc = (c.merit_creation || [])[i] || {};
    total += (mc.free || 0);
  });
  return total;
}

/**
 * Get pools grouped by section for display.
 * Returns pools relevant to a merit category.
 */
export function getPoolsForCategory(c, category) {
  return (c._grant_pools || []).filter(p => p.category === category);
}
