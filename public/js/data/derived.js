/* Derived stat calculations — pure functions, never stored in schema */

import { getAttrVal, getSkillObj } from './accessors.js';

export function calcSize(c) {
  const giant = (c.merits || []).find(m => m.name === 'Giant');
  return 5 + (giant ? 1 : 0);
}

export function calcHealth(c) {
  const resilience = (c.disciplines || {}).Resilience || 0;
  return getAttrVal(c, 'Stamina') + calcSize(c) + resilience;
}

export function calcWillpowerMax(c) {
  return getAttrVal(c, 'Resolve') + getAttrVal(c, 'Composure');
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
  const skill = dc && dc.qualifier ? dc.qualifier : 'Athletics';
  return base + (getSkillObj(c, skill).dots || 0);
}
