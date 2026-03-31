/**
 * Derived merit system -- Mystery Cult Initiation grants.
 * Applies and strips derived merits each render cycle.
 */

import { MERITS_DB } from '../data/merits-db-data.js';
import { removeMerit, addMerit, meritQualifies } from './merits.js';

/**
 * Strip previously derived merits, then re-apply MCI benefit grants
 * based on the character's current MCI rating and benefit_grants array.
 * @param {object} c - character object (mutated in place)
 */
export function applyDerivedMerits(c) {
  if (!c) return;

  // Strip any previously derived merits (reverse iterate for safe splicing)
  if (c.merits) {
    for (let i = c.merits.length - 1; i >= 0; i--) {
      if (c.merits[i].derived) removeMerit(c, i);
    }
  }

  // MCI grants
  const mcis = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation');
  for (const mci of mcis) {
    if (mci.active === false || !mci.benefit_grants) continue;
    const dots = mci.rating || 0;
    for (let d = 0; d < Math.min(dots, mci.benefit_grants.length); d++) {
      const entry = mci.benefit_grants[d];
      if (!entry) continue;
      // Each level can be a single grant or an array of grants
      const grants = Array.isArray(entry) ? entry : (entry.name ? [entry] : []);
      for (const grant of grants) {
        if (!grant || !grant.name) continue;
        const dbEntry = MERITS_DB ? MERITS_DB[grant.name.toLowerCase()] : null;
        const failed = dbEntry && dbEntry.prereq && !meritQualifies(c, dbEntry.prereq);
        addMerit(c, Object.assign({}, grant, { derived: true, granted_by: 'MCI L' + (d + 1), ...(failed ? { prereq_failed: true } : {}) }));
      }
    }
  }
}
