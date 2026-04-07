/* Shared pool string parser — resolves discipline keys to dice pools */

import { SORCERY_THEMES, RITUAL_DISCS } from '../suite/data.js';
import { getAttrVal, skDots } from '../data/accessors.js';
import { SKILLS_MENTAL } from '../data/constants.js';
import { getRuleByKey } from '../data/loader.js';

/** Unskilled penalty: -3 for Mental skills, -1 for Physical/Social. */
function unskilledPenalty(skillName) {
  return SKILLS_MENTAL.includes(skillName) ? -3 : -1;
}

/**
 * Check if a raw pool string targets a Sorcery theme.
 * Returns the theme name (e.g. 'Creation') or null.
 */
export function isSorceryTheme(raw) {
  const key = raw.includes('|') ? raw.split('|')[1].trim() : raw.trim();
  const m = key.match(/^(Creation|Destruction|Divination|Protection|Transmutation)\s*●/);
  return m ? m[1] : null;
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
  const theme = isSorceryTheme(raw);
  if (theme) {
    const td = char.disciplines ? char.disciplines[theme] || 0 : 0;
    const intel = getAttrVal(char, 'Intelligence');
    const occ = skDots(char, 'Occult');
    return {
      total: intel + occ + td,
      attr: 'Intelligence', attrV: intel,
      skill: 'Occult', skillV: occ,
      discName: theme, discV: td,
      resistance: null,
      cost: '1 V 1+ Suc', action: 'Ritual',
      isRitual: true, info: {}
    };
  }
  const key = extractKey(raw);

  // Try rules cache first — discipline powers keyed by slug
  const slug = key.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug) || getRuleByKey('rite-' + slug) || getRuleByKey('devotion-' + slug);
  if (rule) {
    const p = rule.pool;
    if (!p || (!p.attr && !p.skill)) return { noRoll: true, info: { d: rule.parent, c: rule.cost, ac: rule.action, du: rule.duration, ef: rule.description } };
    const attrV = p.attr ? getAttrVal(char, p.attr) : 0;
    const baseDots = p.skill ? skDots(char, p.skill) : 0;
    const ptBonus = (p.skill && char._pt_dot4_bonus_skills instanceof Set && char._pt_dot4_bonus_skills.has(p.skill)) ? 1 : 0;
    const mciBonus = (p.skill && char._mci_dot3_skills instanceof Set && char._mci_dot3_skills.has(p.skill)) ? 1 : 0;
    const skillV = baseDots + ptBonus + mciBonus;
    const unskilled = (p.skill && skillV === 0) ? unskilledPenalty(p.skill) : 0;
    const discV = p.disc ? (char.disciplines?.[p.disc] || 0) : 0;
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
