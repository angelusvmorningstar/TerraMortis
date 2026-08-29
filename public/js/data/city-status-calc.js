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
 * prax.0: `heldOfficeCategories` is optional and strictly additive. A character
 * may now hold two seats at once (Head of State plus Primogen), and
 * `court_category` carries only the HEADLINE of the two, so the title bonus
 * read off that single field under-reports a dual holder's real Status Action
 * budget. A caller that knows every office the character actually holds passes
 * the list and gets the SUM; a caller that does not passes nothing and gets
 * precisely the answer it got before.
 *
 * Known, deliberate gap (prax.0's stated scope boundary): only the two call
 * sites that gate the real Status Action budget pass the list, that is
 * `office-tab.js`'s Head of State budget preview and
 * `server/routes/office-actions.js`'s authoritative check. Display-only
 * surfaces (`status-tab.js`, `suite/status.js`, `suite/sheet.js`,
 * `csv-format.js`, `export-character.js`, `contested-rolls.js`) still call the
 * two-argument form and still show the single-office answer. Nothing is visibly
 * wrong today because no character holds two seats yet; closing that gap is
 * follow-up work, recorded rather than left to be rediscovered.
 *
 * @param {object} c - character-like object with status.city and court_category
 * @param {string|null|undefined} regentAmbience - ambience of the territory c regents, if any
 * @param {string[]} [heldOfficeCategories] - every office category this
 *   character currently holds a seat in. Deduplicated before summing. Omitted
 *   or empty falls back to `c.court_category` alone.
 */
export function calcEffectiveCityStatus(c, regentAmbience, heldOfficeCategories) {
  const categories = Array.isArray(heldOfficeCategories) && heldOfficeCategories.length
    ? [...new Set(heldOfficeCategories)]
    : [c?.court_category];
  const titleBonus = categories.reduce((sum, cat) => sum + titleStatusBonusFor(cat), 0);
  const raw = (c?.status?.city || 0) + titleBonus + regentAmbienceBonusFor(regentAmbience);
  return Math.min(raw, 10);
}
