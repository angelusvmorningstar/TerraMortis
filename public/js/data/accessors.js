/* v2 schema accessor functions — shared between Editor and Suite */

// ── Attributes ──

export function getAttrVal(c, attr) {
  return c.attributes?.[attr]?.dots || 0;
}

export function getAttrBonus(c, attr) {
  return c.attributes?.[attr]?.bonus || 0;
}

export function getAttrTotal(c, attr) {
  return getAttrVal(c, attr) + getAttrBonus(c, attr);
}

export function setAttrVal(c, attr, dots, bonus) {
  if (!c.attributes) c.attributes = {};
  c.attributes[attr] = { dots: dots, bonus: bonus || 0 };
}

// ── Skills ──

export function getSkillObj(c, skill) {
  const v = c.skills?.[skill];
  if (!v) return { dots: 0, bonus: 0, specs: [], nine_again: false };
  return { dots: v.dots || 0, bonus: v.bonus || 0, specs: v.specs || [], nine_again: !!v.nine_again };
}

export function setSkillObj(c, skill, obj) {
  if (!c.skills) c.skills = {};
  if (!obj.specs?.length && !obj.nine_again && !obj.bonus && obj.dots === 0) {
    delete c.skills[skill];
  } else {
    c.skills[skill] = { dots: obj.dots, bonus: obj.bonus || 0, specs: obj.specs || [], nine_again: !!obj.nine_again };
  }
}

export function skDots(c, skill) { return c.skills?.[skill]?.dots || 0; }
export function skBonus(c, skill) { return c.skills?.[skill]?.bonus || 0; }
export function skTotal(c, skill) { return skDots(c, skill) + skBonus(c, skill); }
export function skSpecs(c, skill) { return c.skills?.[skill]?.specs || []; }
export function skSpecStr(c, skill) { return skSpecs(c, skill).join(', '); }
export function skNineAgain(c, skill) { return c.skills?.[skill]?.nine_again || false; }

// ── Merits by category ──

export function meritsByCategory(c, cat) {
  return (c.merits || []).filter(m => m.category === cat);
}
export function influenceMerits(c) { return meritsByCategory(c, 'influence'); }
export function domainMerits(c) { return meritsByCategory(c, 'domain'); }
export function standingMerits(c) { return meritsByCategory(c, 'standing'); }
export function generalMerits(c) { return meritsByCategory(c, 'general'); }
export function manoeuvres(c) { return meritsByCategory(c, 'manoeuvre'); }

// ── Influence total ──

export function influenceTotal(c) {
  return influenceMerits(c).reduce((s, m) => s + (m.rating || 0), 0);
}

// ── Domain shortcuts ──

export function domainRating(c, name) {
  const m = domainMerits(c).find(dm => dm.name === name);
  return m ? m.rating : 0;
}

// ── Powers by category ──

export function discPowers(c, discName) {
  return (c.powers || []).filter(p => p.category === 'discipline' && p.discipline === discName);
}
export function devotions(c) {
  return (c.powers || []).filter(p => p.category === 'devotion');
}
export function rites(c, tradition) {
  const all = (c.powers || []).filter(p => p.category === 'rite');
  return tradition ? all.filter(r => r.tradition === tradition) : all;
}
export function pacts(c) {
  return (c.powers || []).filter(p => p.category === 'pact');
}

// ── Derived stats ──

export function calcSize(c) {
  const giant = (c.merits || []).find(m => m.name === 'Giant');
  return 5 + (giant ? 1 : 0);
}

export function calcSpeed(c) {
  const str = getAttrVal(c, 'Strength');
  const dex = getAttrVal(c, 'Dexterity');
  const sz = calcSize(c);
  const vigour = (c.disciplines || {}).Vigour || 0;
  const fleet = (c.merits || []).find(m => m.name === 'Fleet of Foot');
  return str + dex + sz + vigour + (fleet ? fleet.rating : 0);
}

export function calcDefence(c) {
  const dex = getAttrVal(c, 'Dexterity');
  const wits = getAttrVal(c, 'Wits');
  const base = Math.min(dex, wits);
  const dc = (c.merits || []).find(m => m.name === 'Defensive Combat');
  if (dc) return base + skDots(c, dc.qualifier || 'Athletics');
  return base + skDots(c, 'Athletics');
}

export function calcHealth(c) {
  const resilience = (c.disciplines || {}).Resilience || 0;
  return getAttrVal(c, 'Stamina') + calcSize(c) + resilience;
}

export function calcWillpowerMax(c) {
  return getAttrVal(c, 'Resolve') + getAttrVal(c, 'Composure');
}

export function xpLeft(c) {
  return (c.xp_total || 0) - (c.xp_spent || 0);
}

// ── Blood Potency table (VtR 2e core p.101) ──

const BP_TABLE = {
  0: { vitae: 5, per_turn: 1, surge: 1, mend: 1, feed: 'animal' },
  1: { vitae: 10, per_turn: 1, surge: 1, mend: 1, feed: 'animal' },
  2: { vitae: 11, per_turn: 2, surge: 1, mend: 1, feed: 'animal' },
  3: { vitae: 12, per_turn: 3, surge: 2, mend: 1, feed: 'human' },
  4: { vitae: 13, per_turn: 4, surge: 2, mend: 2, feed: 'human' },
  5: { vitae: 15, per_turn: 5, surge: 3, mend: 2, feed: 'kindred' },
  6: { vitae: 20, per_turn: 6, surge: 3, mend: 3, feed: 'kindred' },
  7: { vitae: 25, per_turn: 7, surge: 4, mend: 3, feed: 'kindred' },
  8: { vitae: 30, per_turn: 8, surge: 5, mend: 4, feed: 'kindred' },
  9: { vitae: 50, per_turn: 10, surge: 6, mend: 5, feed: 'kindred' },
  10: { vitae: 75, per_turn: 15, surge: 7, mend: 6, feed: 'kindred' },
};
export { BP_TABLE };

export function calcVitaeMax(c) {
  return (BP_TABLE[c.blood_potency || 0] || BP_TABLE[1]).vitae;
}

// ── City Status (base + title bonus) ──

import { TITLE_STATUS_BONUS } from './constants.js';

export function titleStatusBonus(c) {
  return TITLE_STATUS_BONUS[c.court_title] || 0;
}

export function calcCityStatus(c) {
  return (c.status?.city || 0) + titleStatusBonus(c);
}
