/**
 * Derived merit system -- MCI and Professional Training grants.
 * Grants add _granted_free dots to target merits each render cycle.
 * Merits remain normal (editable) — free dots are removed if the source is deactivated.
 */

import { MERITS_DB } from '../data/merits-db-data.js';
import { removeMerit, addMerit, ensureMeritSync, meritQualifies } from './merits.js';

/**
 * Find an existing merit matching grant criteria, or create one.
 * For influence merits with a qualifier → match by name + area.
 * For others → match by name + category.
 */
function _findOrCreate(c, grant) {
  const cat = grant.category || 'general';
  const area = grant.qualifier || '';
  let target;
  if (area) {
    // Match by name + area (e.g. Allies Health)
    target = (c.merits || []).find(m => m.category === cat && m.name === grant.name && (m.area || '') === area);
  } else {
    // Match by name only (e.g. Hobbyist Clique, Safe Place)
    target = (c.merits || []).find(m => m.category === cat && m.name === grant.name);
  }
  if (!target) {
    target = { category: cat, name: grant.name, rating: 0 };
    if (area) target.area = area;
    addMerit(c, target);
  }
  return target;
}

/**
 * Apply MCI and PT grants as free dots on target merits.
 * Called each render cycle — resets _granted_free then recomputes.
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

  // Clear ephemeral grant tracking on all merits
  (c.merits || []).forEach(m => {
    delete m._granted_free;
    delete m._grant_sources;
  });

  // Clear PT nine_again tracking from previous cycle
  delete c._pt_nine_again_skills;

  // Reset Contacts derived-dot tracking
  const contactsEntry = (c.merits || []).find(m => m.name === 'Contacts' && m.category === 'influence');
  if (contactsEntry) {
    contactsEntry.rating = Math.max(0, (contactsEntry.rating || 0) - (contactsEntry._mci_dots || 0) - (contactsEntry._pt_dots || 0));
    delete contactsEntry._mci_dots;
    delete contactsEntry._pt_dots;
  }

  // ── MCI grants ──
  const mcis = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation');
  for (const mci of mcis) {
    if (mci.active === false || !mci.benefit_grants) continue;
    const dots = mci.rating || 0;
    for (let d = 0; d < Math.min(dots, mci.benefit_grants.length); d++) {
      const entry = mci.benefit_grants[d];
      if (!entry) continue;
      const grants = Array.isArray(entry) ? entry : (entry.name ? [entry] : []);
      const tag = 'MCI L' + (d + 1);
      for (const grant of grants) {
        if (!grant || !grant.name) continue;
        const grantDots = grant.rating || 1;

        // Contacts: special handling (sphere-per-dot display)
        if (grant.name === 'Contacts') {
          let existing = c.merits.find(m => m.name === 'Contacts' && m.category === 'influence');
          if (!existing) {
            existing = { category: 'influence', name: 'Contacts', rating: 0, spheres: [] };
            c.merits.push(existing);
            ensureMeritSync(c);
          }
          existing.rating = Math.min(5, (existing.rating || 0) + grantDots);
          if (!existing._mci_dots) existing._mci_dots = 0;
          existing._mci_dots += grantDots;
          existing._granted_free = (existing._granted_free || 0) + grantDots;
          if (!existing._grant_sources) existing._grant_sources = [];
          existing._grant_sources.push(tag);
          continue;
        }

        // All other merits: find or create, add free dots
        const target = _findOrCreate(c, grant);
        target._granted_free = (target._granted_free || 0) + grantDots;
        if (!target._grant_sources) target._grant_sources = [];
        target._grant_sources.push(tag);

        // Check prerequisites
        const dbEntry = MERITS_DB ? MERITS_DB[grant.name.toLowerCase()] : null;
        if (dbEntry && dbEntry.prereq && !meritQualifies(c, dbEntry.prereq)) {
          target._prereq_failed = true;
        }

        // Sync rating = free(static) + granted_free + cp + xp
        const ri = c.merits.indexOf(target);
        const mc = (c.merit_creation || [])[ri] || {};
        target.rating = (mc.free || 0) + (target._granted_free || 0) + (mc.cp || 0) + (mc.xp || 0);
      }
    }
  }

  // ── PT grants ──
  const pts = (c.merits || []).filter(m => m.name === 'Professional Training');
  for (const pt of pts) {
    const dots = pt.rating || 0;
    const role = pt.role || '';
    const assets = (pt.asset_skills || []).filter(Boolean);

    // Dot 1: 2 dots of Contacts
    if (dots >= 1 && role) {
      let existing = c.merits.find(m => m.name === 'Contacts' && m.category === 'influence');
      if (!existing) {
        existing = { category: 'influence', name: 'Contacts', rating: 0, spheres: [] };
        c.merits.push(existing);
        ensureMeritSync(c);
      }
      existing.rating = Math.min(5, (existing.rating || 0) + 2);
      if (!existing._pt_dots) existing._pt_dots = 0;
      existing._pt_dots += 2;
      existing._granted_free = (existing._granted_free || 0) + 2;
      if (!existing._grant_sources) existing._grant_sources = [];
      existing._grant_sources.push('PT');
    }

    // Dot 2+: nine_again on asset skills
    if (dots >= 2 && assets.length) {
      if (!c._pt_nine_again_skills) c._pt_nine_again_skills = new Set();
      for (const sk of assets) c._pt_nine_again_skills.add(sk);
    }
  }
}
