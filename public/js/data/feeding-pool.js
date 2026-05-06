/**
 * Feeding dice-pool helper (story dt-form.20, ADR-003 §Q2).
 *
 * computeBestFeedingPool(opts) returns the highest-quality feeding pool
 * the character can build under the given method/territory/auto-pick of
 * the best discipline. Used by:
 *   - dt-form.20: MINIMAL feeding form's read-only pool annotation
 *   - dt-form.22: ROTE project-action read-only inherited pool annotation
 *
 * Pure ESM. No DOM. Mirrors the algorithm in
 * public/js/admin/feeding-engine.js:buildPool() so the player- and ST-side
 * derivations agree.
 *
 * Returned shape:
 *   {
 *     total,                                        // the dice pool number
 *     attr:    { name, val },                       // best attribute pick
 *     skill:   { name, val, specs },                // best skill pick (with specs joined)
 *     disc:    { name, val },                       // best discipline pick (auto)
 *     ambience:{ mod, label, territorySlug, name }, // territory ambience contribution
 *     unskilled,                                    // -1 / -3 / 0 (3rd-edition unskilled penalty)
 *   }
 *
 * Returns null if no method is supplied.
 */

import { FEED_METHODS, TERRITORY_DATA } from '../tabs/downtime-data.js';
import { SKILLS_MENTAL } from './constants.js';
import { getAttrTotal, skTotal, discDots } from './accessors.js';

export function computeBestFeedingPool({ char, methodId, territorySlug } = {}) {
  if (!char || !methodId) return null;
  const method = FEED_METHODS.find(m => m.id === methodId);
  if (!method) return null;

  // Best attribute available among those the method allows.
  let bestAttrVal = 0, bestAttrName = '';
  for (const a of method.attrs || []) {
    const v = getAttrTotal(char, a);
    if (v > bestAttrVal) { bestAttrVal = v; bestAttrName = a; }
  }

  // Best skill available among those the method allows. Carry specs for
  // the rendered breakdown.
  let bestSkillVal = 0, bestSkillName = '', bestSkillSpecs = '';
  for (const s of method.skills || []) {
    const v = skTotal(char, s);
    if (v > bestSkillVal) {
      bestSkillVal = v;
      bestSkillName = s;
      const sk = char.skills?.[s];
      bestSkillSpecs = sk?.specs?.length ? sk.specs.join(', ') : '';
    }
  }

  // Auto-pick the best discipline among those the method allows. ROTE/
  // MINIMAL surfaces a single number; the player doesn't see the pick.
  let bestDiscVal = 0, bestDiscName = '';
  for (const d of method.discs || []) {
    const v = discDots(char, d);
    if (v > bestDiscVal) { bestDiscVal = v; bestDiscName = d; }
  }

  // Territory ambience modifier — looked up by slug. TERRITORY_DATA carries
  // the ambience label + numeric modifier.
  const terr = TERRITORY_DATA.find(t => t.slug === territorySlug);
  const ambMod = terr?.ambienceMod || 0;
  const ambLabel = terr?.ambience || '';
  const ambName = terr?.name || '';

  // Unskilled penalty: VtR 2e -1 for physical/social skills you have zero
  // dots in, -3 for mental. Mirrors feeding-engine.js's branch.
  const unskilled = bestSkillVal === 0
    ? (method.skills.some(s => !SKILLS_MENTAL.includes(s)) ? -1 : -3)
    : 0;

  const total = Math.max(
    0,
    bestAttrVal + bestSkillVal + bestDiscVal + ambMod + unskilled
  );

  return {
    total,
    attr:  { name: bestAttrName, val: bestAttrVal },
    skill: { name: bestSkillName, val: bestSkillVal, specs: bestSkillSpecs },
    disc:  { name: bestDiscName,  val: bestDiscVal  },
    ambience: { mod: ambMod, label: ambLabel, territorySlug: territorySlug || '', name: ambName },
    unskilled,
  };
}
