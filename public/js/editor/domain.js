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
  const mc = (c.merit_creation && c.merit_creation[realIdx]) || { cp: 0, free: 0, free_mci: 0, xp: 0 };
  const purchased = (mc.cp || 0) + (mc.free || 0) + (mc.free_mci || 0) + (mc.xp || 0);
  return purchased + (name === 'Herd' ? ssjHerdBonus(c) : 0);
}

/** SSJ bonus Herd dots: one per MCI dot, auto-applied (not tracked in merit_creation). */
export function ssjHerdBonus(c) {
  if (!(c.merits || []).some(m => m.name === 'Secret Society Junkie')) return 0;
  return (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation')
    .reduce((s, m) => s + (m.rating || 0), 0);
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
export function calcMeritInfluence(m, hwv = false) {
  if (m.name === 'Contacts') return 0;
  const r = m.rating || 0;
  if (m.name === 'Status') {
    const area = (m.area || '').trim();
    const isNarrow = area && !INFLUENCE_SPHERES.some(s => area.toLowerCase().includes(s.toLowerCase()));
    if (isNarrow) return r >= 5 ? 1 : 0;
    // Wide Status: Honey with Vinegar lowers threshold
    if (hwv) return r >= 4 ? 2 : r >= 2 ? 1 : 0;
  }
  // Allies: Honey with Vinegar lowers threshold
  if (hwv && m.name === 'Allies') return r >= 4 ? 2 : r >= 2 ? 1 : 0;
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
  const hwv = hasHoneyWithVinegar(c);
  const total = Math.min(5, (c.merits || [])
    .filter(m => m.category === 'influence' && m.name === 'Contacts')
    .reduce((s, m) => s + (m.rating || 0), 0));
  if (hwv) return total >= 4 ? 2 : total >= 2 ? 1 : 0;
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
/** Check if character has Honey with Vinegar merit. */
function hasHoneyWithVinegar(c) {
  return (c.merits || []).some(m => m.name === 'Honey With Vinegar' || m.name === 'Honey with Vinegar');
}

/* ══════════════════════════════════════════════════════
   Viral Mythology helpers
   ══════════════════════════════════════════════════════ */

/** Check if character has Viral Mythology merit. */
export function hasViralMythology(c) {
  return (c.merits || []).some(m => m.name === 'Viral Mythology');
}

/**
 * Count all non-VM Allies dots (CP + XP + Fr + MCI) to determine VM bonus pool size.
 * Only VM-generated Allies (granted_by: 'VM') are excluded to prevent feedback loop.
 */
export function vmAlliesPool(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.category !== 'influence' || m.name !== 'Allies') return;
    if (m.granted_by === 'VM') return;  // only exclude VM bonus — MCI and other sources count
    const mc = (c.merit_creation || [])[i] || {};
    total += (mc.cp || 0) + (mc.xp || 0) + (mc.free || 0) + (mc.free_mci || 0);
  });
  return total;
}

/**
 * Count VM bonus Allies dots allocated via free_vm on non-VM-granted Allies merits.
 */
export function vmAlliesUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.category !== 'influence' || m.name !== 'Allies') return;
    if (m.granted_by === 'VM') return;
    const mc = (c.merit_creation || [])[i] || {};
    total += (mc.free_vm || 0);
  });
  return total;
}

/**
 * Count purchased Herd dots (CP + XP). VM doubles these.
 */
export function vmHerdPool(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.name !== 'Herd') return;
    if (m.derived) return;
    const mc = (c.merit_creation || [])[i] || {};
    total += (mc.cp || 0) + (mc.xp || 0);
  });
  return total;
}

/**
 * Check if character is a Lorekeeper (has merits granted by Lorekeeper).
 */
export function isLorekeeper(c) {
  return (c.merits || []).some(m => (m.granted_by || '') === 'Lorekeeper');
}

/**
 * Lorekeeper pool: purchased Library dots (CP + XP) = free dots for Herd/Retainer.
 */
export function lorekeeperPool(c) {
  if (!isLorekeeper(c)) return 0;
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.name !== 'Library') return;
    const mc = (c.merit_creation || [])[i] || {};
    total += (mc.cp || 0) + (mc.xp || 0);
  });
  return total;
}

export function calcTotalInfluence(c) {
  let total = 0;
  const hwv = hasHoneyWithVinegar(c);
  // Clan + Covenant status: 1 per dot each
  const st = c.status || {};
  total += (st.clan || 0) + (st.covenant || 0);
  // Influence merits (Contacts excluded from per-entry calc)
  (c.merits || []).filter(m => m.category === 'influence').forEach(m => {
    total += calcMeritInfluence(m, hwv);
  });
  // Contacts: sum all dots, apply threshold to total
  total += calcContactsInfluence(c);
  // MCI at 5 dots: 1 influence
  const mci = (c.merits || []).find(m => m.name === 'Mystery Cult Initiation');
  if (mci && mci.rating >= 5) total += 1;
  return total;
}
