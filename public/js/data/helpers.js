/* Display helper functions — pure, no DOM manipulation */

import { ICONS } from './icons.js';

const CLAN_ICON_KEY = {
  Daeva: 'daeva',
  Gangrel: 'gangrel',
  Mekhet: 'mekhet',
  Nosferatu: 'nosferatu',
  Ventrue: 'ventrue'
};

const COV_ICON_KEY = {
  'Carthian Movement': 'carthian',
  'Circle of the Crone': 'crone',
  'Invictus': 'invictus',
  'Lancea et Sanctum': 'lance'
};

export { CLAN_ICON_KEY, COV_ICON_KEY };

export function clanIcon(clan, sz) {
  const k = CLAN_ICON_KEY[clan];
  return k
    ? '<img src="' + ICONS[k] + '" style="width:' + sz + 'px;height:' + sz + 'px;filter:invert(1) sepia(1) brightness(.78) saturate(2.8);opacity:.7;">'
    : '';
}

export function covIcon(cov, sz) {
  const k = COV_ICON_KEY[cov];
  return k
    ? '<img src="' + ICONS[k] + '" style="width:' + sz + 'px;height:' + sz + 'px;filter:invert(1) sepia(1) brightness(.78) saturate(2.8);opacity:.6;">'
    : '';
}

export function shDots(n) {
  return '\u25CF'.repeat(Math.max(0, n || 0));
}

export function shDotsWithBonus(base, bonus) {
  if (!bonus) return shDots(base);
  return '\u25CF'.repeat(base) + '\u25CB'.repeat(bonus);
}

/** Display name: honorific + (moniker || name) */
export function displayName(c) {
  const base = c.moniker || c.name;
  return c.honorific ? c.honorific + ' ' + base : base;
}

/** Sort key: moniker || name (no honorific) */
export function sortName(c) {
  return (c.moniker || c.name).toLowerCase();
}

export function esc(s) {
  return s == null ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function shortCov(c) {
  if (!c) return '?';
  const m = {
    'Carthian Movement': 'Carthian',
    'Circle of the Crone': 'Crone',
    'Lancea et Sanctum': 'Lance',
    'Ordo Dracul': 'Ordo'
  };
  return m[c] || c;
}

export function formatSpecs(c, specs) {
  if (!specs || !specs.length) return '';
  return specs.map(sp => {
    const enhanced = hasAoE(c, sp);
    return esc(sp) + (enhanced ? ' <span style="color:rgba(140,200,140,.8)">+2</span>' : '');
  }).join(', ');
}

export function hasAoE(c, specName) {
  return (c.merits || []).some(m =>
    m.name === 'Area of Expertise' && m.qualifier && m.qualifier.toLowerCase() === specName.toLowerCase()
  );
}
