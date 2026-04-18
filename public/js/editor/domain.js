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
  const purchased = (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.xp || 0);
  return purchased + (name === 'Herd' ? ssjHerdBonus(c) + flockHerdBonus(c) : 0);
}

/** SSJ bonus Herd dots: one per MCI dot, auto-applied (not tracked inline). */
export function ssjHerdBonus(c) {
  if (!(c.merits || []).some(m => m.name === 'Secret Society Junkie')) return 0;
  return (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation')
    .reduce((s, m) => s + (m.rating || 0), 0);
}

/** Flock bonus Herd dots: equal to Flock rating, can exceed cap of 5. */
export function flockHerdBonus(c) {
  const flock = (c.merits || []).find(m => m.name === 'Flock');
  return flock ? (flock.rating || 0) : 0;
}

/**
 * Full dots contributed by a partner to a shared pool (CP + free + XP).
 * Free dots (e.g. MCI grants) represent real physical resources, so partners share them too.
 * @param {object} c - character object
 * @param {string} name - merit name
 * @returns {number}
 */
export function domMeritShareable(c, name) {
  const m = (c.merits || []).find(m => m.category === 'domain' && m.name === name);
  if (!m) return 0;
  const realIdx = (c.merits || []).indexOf(m);
  return (m.cp || 0) + (m.free || 0) + (m.free_mci || 0) + (m.xp || 0);
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
  let partnerTotal = 0;
  for (const pName of partners) {
    const p = (state.chars || []).find(ch => ch.name === pName);
    if (p) partnerTotal += domMeritShareable(p, name);
  }
  // Fallback: if no partner chars were found in state.chars (player portal
  // only has the player's own characters), use _partner_dots which the
  // server pre-computed on the ?mine=1 fetch path.
  if (partners.length > 0 && partnerTotal === 0 && m._partner_dots > 0) {
    partnerTotal = m._partner_dots;
  }
  const total = own + partnerTotal;
  // Herd can exceed 5 when Flock is present
  const cap = (name === 'Herd' && flockHerdBonus(c) > 0) ? Infinity : 5;
  return Math.min(cap, total);
}

/**
 * Effective domain merit access for a character — their own total, or the
 * total from any partner who lists this character in their shared_with.
 * Used by the prereq checker to validate access through shared resources.
 * @param {object} c - character object
 * @param {string} name - merit name (e.g. "Haven")
 * @returns {number}
 */
export function domMeritAccess(c, name) {
  const own = domMeritTotal(c, name);
  if (own > 0) return own;
  for (const partner of (state.chars || [])) {
    const pm = (partner.merits || []).find(m =>
      m.category === 'domain' && m.name === name &&
      (m.shared_with || []).includes(c.name)
    );
    if (pm) return domMeritTotal(partner, name);
  }
  return 0;
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
export function hasHoneyWithVinegar(c) {
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
    total += (m.cp || 0) + (m.xp || 0) + (m.free_mci || 0);
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
    total += (m.free_vm || 0);
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
    total += (m.cp || 0) + (m.xp || 0);
  });
  return total;
}

/** Check if character has Oath of the Hard Motherfucker (stored as a pact in c.powers). */
export function hasOHM(c) {
  return (c.powers || []).some(p => p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the hard motherfucker');
}

/** Count OHM bonus dots allocated via free_ohm on Allies, Contacts, and Resources entries. */
export function ohmUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.category !== 'influence') return;
    if (m.name !== 'Allies' && m.name !== 'Contacts' && m.name !== 'Resources') return;
    total += (m.free_ohm || 0);
  });
  return total;
}

/** Check if character has the Invested merit. */
export function hasInvested(c) {
  return (c.merits || []).some(m => m.name === 'Invested');
}

/** Invested pool: dots equal to effective Invictus (covenant) Status (including OTS floor). */
export function investedPool(c) {
  if (!hasInvested(c)) return 0;
  return effectiveInvictusStatus(c);
}

/** Count Invested bonus dots allocated via free_inv on eligible merits. */
export function investedUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (!['Herd', 'Mentor', 'Resources', 'Retainer', 'Attach\u00e9'].includes(m.name)) return;
    total += (m.free_inv || 0);
  });
  return total;
}

/** Effective Invictus covenant status — includes Oath of the Scapegoat floor. */
export function effectiveInvictusStatus(c) {
  if (c.covenant !== 'Invictus') return 0;
  const st = c.status || {};
  return Math.max(st.covenant || 0, c._ots_covenant_bonus || 0);
}

/** Dots granted by an Attaché merit linked to the named target merit. */
export function attacheBonusDots(c, meritName) {
  const att = (c.merits || []).find(m => m.name === 'Attach\u00e9' && m.attached_to === meritName);
  if (!att) return 0;
  return effectiveInvictusStatus(c);
}

/** Check if character has the Lorekeeper merit. */
export function hasLorekeeper(c) {
  return (c.merits || []).some(m => m.name === 'Lorekeeper');
}

/** Lorekeeper pool: purchased Library dots (CP + XP) = free dots for Herd/Retainer. */
export function lorekeeperPool(c) {
  if (!hasLorekeeper(c)) return 0;
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.name !== 'Library') return;
    total += (m.cp || 0) + (m.xp || 0);
  });
  return total;
}

/** Count Lorekeeper bonus dots allocated via free_lk on Herd/Retainer entries. */
export function lorekeeperUsed(c) {
  let total = 0;
  (c.merits || []).forEach((m, i) => {
    if (m.name !== 'Herd' && m.name !== 'Retainer') return;
    total += (m.free_lk || 0);
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

/**
 * Return a line-by-line breakdown of influence sources for tooltip display.
 * Each entry: "Label: N" — only includes sources that contribute > 0.
 */
export function influenceBreakdown(c) {
  const lines = [];
  const st = c.status || {};
  const hwv = hasHoneyWithVinegar(c);
  if (st.clan) lines.push('Clan Status: ' + st.clan);
  if (st.covenant) lines.push('Covenant Status: ' + st.covenant);
  const inflM = (c.merits || []).filter(m => m.category === 'influence' && m.name !== 'Contacts');
  for (const m of inflM) {
    const inf = calcMeritInfluence(m, hwv);
    if (!inf) continue;
    const area = (m.area || m.qualifier || '').trim();
    const label = m.name + (area ? ' (' + area + ')' : '');
    lines.push(label + ': ' + inf + (hwv && m.name === 'Allies' ? ' (HWV)' : ''));
  }
  const cInf = calcContactsInfluence(c);
  if (cInf) lines.push('Contacts: ' + cInf + (hwv ? ' (HWV)' : ''));
  const mci = (c.merits || []).find(m => m.name === 'Mystery Cult Initiation');
  if (mci && mci.rating >= 5) lines.push('MCI 5: 1');
  return lines;
}
