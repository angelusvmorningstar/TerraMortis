/**
 * Derived merit system -- MCI and Professional Training grants.
 * Applies and strips derived merits each render cycle.
 */

import { MERITS_DB } from '../data/merits-db-data.js';
import { removeMerit, addMerit, meritQualifies } from './merits.js';

/**
 * Strip previously derived merits, then re-apply MCI and PT benefit grants
 * based on the character's current ratings.
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

  // Clear PT nine_again tracking from previous cycle
  delete c._pt_nine_again_skills;

  // MCI grants
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
        const dbEntry = MERITS_DB ? MERITS_DB[grant.name.toLowerCase()] : null;
        const failed = dbEntry && dbEntry.prereq && !meritQualifies(c, dbEntry.prereq);
        addMerit(c, Object.assign({}, grant, { derived: true, granted_by: 'MCI L' + (d + 1), ...(failed ? { prereq_failed: true } : {}) }));
      }
    }
  }

  // PT grants
  const pts = (c.merits || []).filter(m => m.name === 'Professional Training');
  for (const pt of pts) {
    const dots = pt.rating || 0;
    const role = pt.role || '';
    const assets = (pt.asset_skills || []).filter(Boolean);

    // Dot 1: 2 dots of Contacts in the profession's field
    if (dots >= 1 && role) {
      addMerit(c, { category: 'influence', name: 'Contacts', rating: 2, area: role, derived: true, granted_by: 'Professional Training' });
    }

    // Dot 2+: nine_again on asset skills (tracked for render, not stored on skills)
    if (dots >= 2 && assets.length) {
      if (!c._pt_nine_again_skills) c._pt_nine_again_skills = new Set();
      for (const sk of assets) c._pt_nine_again_skills.add(sk);
    }
  }
}
