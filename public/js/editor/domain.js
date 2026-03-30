/**
 * Domain merit helpers and influence calculations.
 * Domain merits can be shared between characters (coterie resources).
 */

import { INFLUENCE_SPHERES } from '../data/constants.js';
import state from '../data/state.js';

/* ══════════════════════════════════════════════════════
   Domain merit contribution helpers
   ══════════════════════════════════════════════════════ */

/**
 * This character's own contribution to a named domain merit (all sources: CP + free + XP).
 * @param {object} c - character object
 * @param {string} name - merit name (e.g. "Safe Place")
 * @returns {number}
 */
export function domMeritContrib(c, name) {
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  const realIdx = (c.merits || []).indexOf(m);
  const mc = (c.merit_creation && c.merit_creation[realIdx]) || { cp: 0, free: 0, xp: 0 };
  return (mc.cp || 0) + (mc.free || 0) + (mc.xp || 0);
}

/**
 * CP + XP portion only -- this is what partners contribute to a shared pool (not Free).
 * @param {object} c - character object
 * @param {string} name - merit name
 * @returns {number}
 */
export function domMeritShareable(c, name) {
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  const realIdx = (c.merits || []).indexOf(m);
  const mc = (c.merit_creation && c.merit_creation[realIdx]) || { cp: 0, free: 0, xp: 0 };
  return (mc.cp || 0) + (mc.xp || 0);
}

/**
 * Effective total = this char's full dots + partners' CP+XP only, capped at 5.
 * Looks up partner characters from the shared chars array via loader.
 * @param {object} c - character object
 * @param {string} name - merit name
 * @returns {number}
 */
export function domMeritTotal(c, name) {
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  const own = domMeritContrib(c, name);
  const partners = m.shared_with || [];
  let total = own;
  for (const pName of partners) {
    const p = (state.chars || []).find(ch => ch.name === pName);
    if (p) total += domMeritShareable(p, name);
  }
  return Math.min(5, total);
}

/* ══════════════════════════════════════════════════════
   Influence calculations
   ══════════════════════════════════════════════════════ */

/**
 * Calculate influence points from a single influence merit entry.
 * Contacts are handled separately via calcContactsInfluence.
 * Standard: 1 at 3 dots, 2 at 5 dots.
 * Narrow Status: 1 at 5 dots only.
 * @param {object} m - merit entry with name, rating, area
 * @returns {number}
 */
export function calcMeritInfluence(m) {
  if (m.name === 'Contacts') return 0;
  const r = m.rating || 0;
  if (m.name === 'Status') {
    const area = (m.area || '').trim();
    const isNarrow = area && !INFLUENCE_SPHERES.some(s => area.toLowerCase().includes(s.toLowerCase()));
    if (isNarrow) return r >= 5 ? 1 : 0;
  }
  if (r >= 5) return 2;
  if (r >= 3) return 1;
  return 0;
}

/**
 * Calculate influence from all Contacts merits combined.
 * Sums all Contact dots (capped at 5), then applies threshold.
 * @param {object} c - character object
 * @returns {number}
 */
export function calcContactsInfluence(c) {
  const total = Math.min(5, (c.merits || [])
    .filter(m => m.category === 'influence' && m.name === 'Contacts')
    .reduce((s, m) => s + (m.rating || 0), 0));
  if (total >= 5) return 2;
  if (total >= 3) return 1;
  return 0;
}

/**
 * Calculate total influence for a character from all sources.
 * Includes clan/covenant status, influence merits, contacts, and MCI at 5.
 * @param {object} c - character object
 * @returns {number}
 */
export function calcTotalInfluence(c) {
  let total = 0;
  // Clan + Covenant status: 1 per dot each
  const st = c.status || {};
  total += (st.clan || 0) + (st.covenant || 0);
  // Influence merits (Contacts excluded from per-entry calc)
  (c.merits || []).filter(m => m.category === 'influence').forEach(m => {
    total += calcMeritInfluence(m);
  });
  // Contacts: sum all dots, apply threshold to total
  total += calcContactsInfluence(c);
  // MCI at 5 dots: 1 influence
  const mci = (c.merits || []).find(m => m.name === 'Mystery Cult Initiation');
  if (mci && mci.rating >= 5) total += 1;
  return total;
}
