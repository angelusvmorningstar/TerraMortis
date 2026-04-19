/* equipment.js — helpers for character equipment (nav.10).
 *
 * Equipment is stored on character.equipment as an array.
 * It is display-only for players; STs assign it via the admin editor.
 */

import { getAttrEffective, calcDefence } from './accessors.js';

const ATTR_FOR_SKILL = {
  Brawl:    'Strength',
  Weaponry: 'Strength',
  Firearms: 'Dexterity',
};
const ATTR_LABEL = {
  Strength:  'Str',
  Dexterity: 'Dex',
};

export function getEquipment(c) {
  return (c && c.equipment) ? c.equipment : [];
}

export function weaponPool(c, weapon) {
  const attr = ATTR_FOR_SKILL[weapon.attack_skill] || 'Strength';
  const attrV = getAttrEffective(c, attr);
  const skillV = c.skills?.[weapon.attack_skill]?.dots || 0;
  const bonus = weapon.damage_rating || 0;
  return { total: attrV + skillV + bonus, attrLabel: ATTR_LABEL[attr] || attr, attrV, skillV, bonus };
}

export function effectiveDefence(c) {
  const base = calcDefence(c);
  const penalty = getEquipment(c)
    .filter(e => e.type === 'armour')
    .reduce((s, e) => s + (e.mobility_penalty || 0), 0);
  return base - penalty;
}

export function weaponPoolLabel(c, weapon) {
  const { total, attrLabel, attrV, skillV, bonus } = weaponPool(c, weapon);
  const parts = [`${attrLabel} ${attrV}`];
  if (skillV) parts.push(`${weapon.attack_skill} ${skillV}`);
  if (bonus)  parts.push(`+${bonus}`);
  return `${parts.join(' + ')} = ${total}${weapon.damage_type || 'L'}`;
}
