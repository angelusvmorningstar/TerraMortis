/* Shared pool string parser — resolves discipline keys to dice pools */

import { DISC, SORCERY_THEMES, RITUAL_DISCS } from '../suite/data.js';
import { getAttrVal, skDots } from '../data/accessors.js';

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
  const info = DISC[key];
  if (!info) return null;
  if (!info.a || !info.s) return { noRoll: true, info };
  const attrV = getAttrVal(char, info.a);
  const skillV = skDots(char, info.s);
  const discV = info.d ? (char.disciplines ? char.disciplines[info.d] || 0 : 0) : 0;
  return {
    total: attrV + skillV + discV,
    attr: info.a, attrV,
    skill: info.s, skillV,
    discName: info.d, discV,
    resistance: info.r || null,
    cost: info.c || null,
    action: info.ac || null,
    duration: info.du || null,
    effect: info.ef || null,
    isRitual: info.ac === 'Ritual',
    info
  };
}
