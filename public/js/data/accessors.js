/* v2 schema accessor functions — pure, no DOM */

export function getAttrVal(c, attr) {
  return c.attributes?.[attr]?.dots || 0;
}

export function getAttrBonus(c, attr) {
  return c.attributes?.[attr]?.bonus || 0;
}

export function setAttrVal(c, attr, dots, bonus) {
  if (!c.attributes) c.attributes = {};
  c.attributes[attr] = { dots: dots, bonus: bonus || 0 };
}

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
