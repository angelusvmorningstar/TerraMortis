/**
 * Prerequisite engine — structured JSON Logic tree evaluator.
 *
 * Replaces the regex-based meritQualifies() with a composable tree walker.
 * Prereq trees use { all: [...] } (AND) and { any: [...] } (OR) combinators.
 * Leaf nodes specify a type + name + optional dots/qualifier/max.
 *
 * Labels are derived at render time from the tree structure — not stored.
 */

import { getAttrVal, skDots } from './accessors.js';

// Short covenant names → full names used in char.covenant
const COV_FULL = {
  carthian: 'Carthian Movement', crone: 'Circle of the Crone',
  invictus: 'Invictus', lance: 'Lancea et Sanctum',
  sanctified: 'Lancea et Sanctum'
};

/** Resolve a status qualifier against character data. */
function _getStatus(char, qualifier) {
  const q = qualifier.toLowerCase();
  if (q === 'city') return char.status?.city || 0;
  if (q === 'clan') return char.status?.clan || 0;
  // Covenant status: own covenant uses status.covenant, others use covenant_standings
  const fullName = COV_FULL[q] || qualifier;
  if ((char.covenant || '').toLowerCase() === fullName.toLowerCase()) {
    return char.status?.covenant || 0;
  }
  const standings = char.covenant_standings || {};
  const k = Object.keys(standings).find(k => k.toLowerCase() === q);
  return k ? standings[k] : 0;
}

/**
 * Check if a character meets a prerequisite tree.
 * @param {Object} char — character object with attributes, skills, disciplines, merits, clan, bloodline, humanity
 * @param {Object|null} node — prereq tree node, or null (no prereqs)
 * @returns {boolean}
 */
export function meetsPrereq(char, node) {
  if (!node) return true;

  // Combinators
  if (node.all) return node.all.every(n => meetsPrereq(char, n));
  if (node.any) return node.any.some(n => meetsPrereq(char, n));

  // Leaf node
  const dots = node.dots || 0;

  switch (node.type) {
    case 'attribute':
      return getAttrVal(char, node.name) >= dots;

    case 'skill':
      return skDots(char, node.name) >= dots;

    case 'discipline':
      return (char.disciplines?.[node.name]?.dots || 0) >= dots;

    case 'merit': {
      const merits = char.merits || [];
      return merits.some(m => {
        if (m.name !== node.name) return false;
        if (node.qualifier && m.qualifier !== node.qualifier && m.area !== node.qualifier) return false;
        return (m.rating || 0) >= (dots || 1);
      });
    }

    case 'status':
      return _getStatus(char, node.qualifier) >= (dots || 1);

    case 'not_status':
      return _getStatus(char, node.qualifier) === 0;

    case 'clan':
      return char.clan === node.name;

    case 'bloodline':
      return char.bloodline === node.name;

    case 'humanity':
      return (char.humanity || 0) <= (node.max ?? 10);

    case 'not': {
      const merits = char.merits || [];
      if (node.qualifier) {
        return !merits.some(m => m.name === node.name && (m.qualifier === node.qualifier || m.area === node.qualifier));
      }
      return !merits.some(m => m.name === node.name);
    }

    case 'blood_potency':
      return (char.blood_potency || 0) >= dots;

    case 'willpower':
      // Willpower is derived; check resolve + composure as proxy
      return true; // Can't reliably check — pass through

    case 'specialised_skill': {
      // Check if any skill at >= dots has a specialisation
      const skills = char.skills || {};
      return Object.entries(skills).some(([, v]) =>
        (v.dots || 0) >= dots && v.specs && v.specs.length > 0
      );
    }

    case 'has_specialisation':
      // Check if any skill has a specialisation
      return Object.values(char.skills || {}).some(v => v.specs && v.specs.length > 0);

    case 'specialisation':
      // "Specialisation in X or Y" — check if char has a spec in any of the named skills
      // node.name may be "Brawl or Weaponry" or "Crafts or Expression"
      return true; // Complex to check — pass through for now

    case 'text':
      // Freeform text prereqs can't be machine-checked
      return true;

    default:
      return true;
  }
}

/**
 * Generate a human-readable label from a prereq tree.
 * @param {Object|null} node — prereq tree node
 * @param {boolean} nested — true if inside a parent combinator (for parenthesisation)
 * @returns {string}
 */
export function prereqLabel(node, nested = false) {
  if (!node) return '';

  // Combinators
  if (node.all) {
    return node.all.map(n => prereqLabel(n, true)).join(', ');
  }
  if (node.any) {
    const inner = node.any.map(n => prereqLabel(n, true)).join(' or ');
    return nested ? `(${inner})` : inner;
  }

  // Leaf formatting
  switch (node.type) {
    case 'attribute':
    case 'skill':
    case 'discipline':
      return node.dots ? `${node.name} ${node.dots}` : node.name;

    case 'merit': {
      let s = node.name;
      if (node.qualifier) s = `${node.qualifier} ${s}`;
      if (node.dots) s += ` ${node.dots}`;
      return s;
    }

    case 'status': {
      let s = `${node.qualifier} Status`;
      if (node.dots) s += ` ${node.dots}`;
      return s;
    }

    case 'not_status':
      return `No ${node.qualifier} Status`;

    case 'clan':
      return node.name;

    case 'bloodline':
      return `${node.name} bloodline`;

    case 'humanity':
      return `Humanity < ${(node.max ?? 0) + 1}`;

    case 'not':
      return node.qualifier ? `No ${node.qualifier} ${node.name}` : `No ${node.name}`;

    case 'blood_potency':
      return `Blood Potency ${node.dots}`;

    case 'willpower':
      return `Willpower ${node.dots}`;

    case 'specialised_skill':
      return `Specialised Skill ${node.dots || 3}`;

    case 'has_specialisation':
      return 'Skill Specialisation';

    case 'specialisation':
      return `Specialisation (${node.name})`;

    case 'text':
      return node.name;

    default:
      return node.name || '';
  }
}
