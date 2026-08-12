/**
 * Effective City Status — the one shared calculation, importable by both the
 * client (public/js/data/accessors.js) and the server
 * (server/routes/office-actions.js), so there is exactly one implementation
 * of the budget formula, not two independently-maintained copies. Mirrors
 * the public/js/downtime/cycle-phase.js precedent for the same reason.
 *
 * Deliberately imports only public/js/data/constants.js, a verified
 * zero-import leaf module — accessors.js itself is NOT safe to import
 * server-side (its getRulesCache import chain transitively reads
 * location.hostname at module scope via public/js/data/api.js and crashes
 * under Node/vitest, the same landmine issue-1141 routed around once
 * already via a different chain).
 */

import { TITLE_STATUS_BONUS } from './constants.js';

// Bonus from regenting an ambience territory. Regent-only by design;
// lieutenants receive no bonus (issue #13 Q-A, 2026-05-05).
export const REGENT_AMBIENCE_BONUS = Object.freeze({ 'Curated': 1, 'Verdant': 1, 'The Rack': 2 });

export function titleStatusBonusFor(courtCategory) {
  return TITLE_STATUS_BONUS[courtCategory] || 0;
}

export function regentAmbienceBonusFor(ambience) {
  return REGENT_AMBIENCE_BONUS[ambience] || 0;
}

/**
 * @param {object} c - character-like object with status.city and court_category
 * @param {string|null|undefined} regentAmbience - ambience of the territory c regents, if any
 */
export function calcEffectiveCityStatus(c, regentAmbience) {
  const raw = (c?.status?.city || 0) + titleStatusBonusFor(c?.court_category) + regentAmbienceBonusFor(regentAmbience);
  return Math.min(raw, 10);
}
