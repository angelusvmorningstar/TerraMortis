/* Shared pool string parser — resolves discipline keys to dice pools */

import { RITUAL_DISCS } from '../suite/data.js';
import { getAttrEffective, skTotal } from '../data/accessors.js';
import { SKILLS_MENTAL } from '../data/constants.js';
import { getRuleByKey } from '../data/loader.js';

/** Unskilled penalty: -3 for Mental skills, -1 for Physical/Social. */
function unskilledPenalty(skillName) {
  return SKILLS_MENTAL.includes(skillName) ? -3 : -1;
}

/**
 * Extract the discipline key from a raw pool string.
 * Handles pipe-separated display labels and dot-suffix notation.
 */
export function extractKey(raw) {
  if (raw.includes('|')) return raw.split('|')[1].trim();
  const m = raw.match(/^(.+?)\s*(●+)\s*$/);
  if (m) return m[1].trim() + ' ' + String(m[2].length);
  return raw.trim();
}

/**
 * Parse a pool string against a character, returning pool breakdown.
 * Returns { total, attr, attrV, skill, skillV, discName, discV, resistance, ... }
 * or { noRoll: true, info } for non-rollable disciplines, or null if unknown.
 */
export function getPool(char, raw) {
  const key = extractKey(raw);

  // Try rules cache first — discipline powers keyed by slug
  const slug = key.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug) || getRuleByKey('rite-' + slug) || getRuleByKey('devotion-' + slug);
  if (rule) {
    const p = rule.pool;
    if (!p || (!p.attr && !p.skill)) return { noRoll: true, info: { d: rule.parent, c: rule.cost, ac: rule.action, du: rule.duration, ef: rule.description } };
    const attrV  = p.attr  ? getAttrEffective(char, p.attr) : 0;
    const skillV = p.skill ? skTotal(char, p.skill)         : 0;
    const unskilled = (p.skill && skillV === 0) ? unskilledPenalty(p.skill) : 0;
    const discV = p.disc ? (char.disciplines?.[p.disc]?.dots || 0) : 0;
    return {
      total: attrV + skillV + discV + unskilled,
      attr: p.attr, attrV,
      skill: p.skill, skillV, unskilled,
      discName: p.disc, discV,
      resistance: rule.resistance || null,
      cost: rule.cost || null,
      action: rule.action || null,
      duration: rule.duration || null,
      effect: rule.description || null,
      isRitual: rule.action === 'Ritual',
      info: { d: rule.parent, a: p.attr, s: p.skill, r: rule.resistance, c: rule.cost, ac: rule.action, du: rule.duration, ef: rule.description }
    };
  }

  return null;
}
