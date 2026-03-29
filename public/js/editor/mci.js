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
  const mci = (c.merits || []).find(m => m.name === 'Mystery Cult Initiation');
  if (mci && mci.active !== false && mci.benefit_grants) {
    const dots = mci.rating || 0;
    for (let d = 0; d < Math.min(dots, mci.benefit_grants.length); d++) {
      const grant = mci.benefit_grants[d];
      if (!grant || !grant.name) continue;
      // Check prereqs from MERITS_DB
      const dbEntry = MERITS_DB ? MERITS_DB[grant.name.toLowerCase()] : null;
      if (dbEntry && dbEntry.prereq && !meritQualifies(c, dbEntry.prereq)) {
        addMerit(c, Object.assign({}, grant, { derived: true, granted_by: 'MCI L' + (d + 1), prereq_failed: true }));
      } else {
        addMerit(c, Object.assign({}, grant, { derived: true, granted_by: 'MCI L' + (d + 1) }));
      }
    }
  }
}
