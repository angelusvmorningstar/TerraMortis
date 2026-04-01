/**
 * XP calculations and merit rating/breakdown helpers.
 * Pure functions — no DOM side-effects.
 */

/**
 * Convert XP spent into dot count (flat rate).
 * @param {number} xpSpent - total XP allocated
 * @param {number} baseBeforeXP - dots from CP/free (unused in flat model, kept for API)
 * @param {number} costPerDot - XP cost per single dot
 * @returns {number}
 */
export function xpToDots(xpSpent, baseBeforeXP, costPerDot) {
  return Math.floor((xpSpent || 0) / costPerDot);
}

/**
 * Convert a dot count into XP cost (flat rate).
 * @param {number} numDots
 * @param {number} baseBeforeXP - (unused in flat model, kept for API)
 * @param {number} costPerDot
 * @returns {number}
 */
export function dotsToXP(numDots, baseBeforeXP, costPerDot) {
  return (numDots || 0) * costPerDot;
}

/** Starting XP awarded on character creation. */
export function xpStarting() { return 10; }

/** XP from voluntary humanity drops: 2 per dot lost. */
export function xpHumanityDrop(c) {
  return Math.max(0, (c.humanity_base || 7) - (c.humanity || 0)) * 2;
}

/** XP from completed ordeals: 3 per ordeal. */
export function xpOrdeals(c) {
  return ((c.ordeals || []).filter(o => o.complete).length) * 3;
}

/** XP from game attendance. Uses cached _gameXP from sessions if available, falls back to xp_log. */
export function xpGame(c) {
  if (c._gameXP != null) return c._gameXP;
  return ((c.xp_log || {}).earned || {}).game || 0;
}

/**
 * Total XP earned by a character (all sources, derived dynamically).
 * @param {object} c - character object
 * @returns {number}
 */
export function xpEarned(c) {
  return xpStarting() + xpHumanityDrop(c) + xpOrdeals(c) + xpGame(c);
}

/** Sum XP from a creation object (e.g. attr_creation, skill_creation). */
function sumCreationXP(obj) {
  if (!obj) return 0;
  return Object.values(obj).reduce((t, v) => t + (v.xp || 0), 0);
}

/** Sum XP from a creation object, with fallback to xp_log.spent value. */
function creationOrFallback(c, creationKey, spentKey) {
  const fromCreation = sumCreationXP(c[creationKey]);
  const fromLog = ((c.xp_log || {}).spent || {})[spentKey] || 0;
  return Math.max(fromCreation, fromLog);
}

/** XP spent on attributes. */
export function xpSpentAttrs(c) { return creationOrFallback(c, 'attr_creation', 'attributes'); }

/** XP spent on skills. */
export function xpSpentSkills(c) { return creationOrFallback(c, 'skill_creation', 'skills'); }

/** XP spent on merits. */
export function xpSpentMerits(c) {
  const fromCreation = (c.merit_creation || []).reduce((t, mc) => t + (mc ? mc.xp || 0 : 0), 0);
  const fromLog = ((c.xp_log || {}).spent || {}).merits || 0;
  return Math.max(fromCreation, fromLog);
}

/** XP spent on powers — disciplines + devotions. */
export function xpSpentPowers(c) { return creationOrFallback(c, 'disc_creation', 'powers'); }

/** XP spent on special items (manual, stored in xp_log). */
export function xpSpentSpecial(c) {
  return ((c.xp_log || {}).spent || {}).special || 0;
}

/**
 * Total XP spent by a character (all categories).
 * Derives from _creation objects where available, falls back to xp_log.spent.
 * @param {object} c - character object
 * @returns {number}
 */
export function xpSpent(c) {
  return xpSpentAttrs(c) + xpSpentSkills(c) + xpSpentMerits(c) + xpSpentPowers(c) + xpSpentSpecial(c);
}

/**
 * Remaining unspent XP.
 * @param {object} c - character object
 * @returns {number}
 */
export function xpLeft(c) {
  return xpEarned(c) - xpSpent(c);
}

/**
 * Effective rating of a merit (sum of CP + free + XP from merit_creation).
 * Falls back to stored rating if no creation record exists.
 * @param {object} c - character object
 * @param {object} m - merit entry
 * @returns {number}
 */
export function meritRating(c, m) {
  const idx = (c.merits || []).indexOf(m);
  if (idx < 0) return m.rating || 0;
  const mc = (c.merit_creation || [])[idx];
  if (!mc) return m.rating || 0;
  return (mc.cp || 0) + (mc.free || 0) + (mc.xp || 0);
}

/**
 * Render the merit breakdown row (CP / Free / XP / UP inputs).
 * Returns an HTML string with onchange handlers that call the global shEditMeritPt.
 * @param {number} realIdx - index into c.merits / c.merit_creation
 * @param {object} mc - merit_creation entry {cp, free, xp, up}
 * @returns {string} HTML
 */
export function meritBdRow(realIdx, mc) {
  const total = (mc.cp || 0) + (mc.free || 0) + (mc.xp || 0);
  const up = mc.up || 0;
  return '<div class="merit-bd-row">'
    + '<span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + (mc.cp || 0) + '" onchange="shEditMeritPt(' + realIdx + ',\'cp\',+this.value)">'
    + '<span class="bd-lbl">Fr</span><input class="merit-bd-input" type="number" min="0" value="' + (mc.free || 0) + '" onchange="shEditMeritPt(' + realIdx + ',\'free\',+this.value)">'
    + '<span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + (mc.xp || 0) + '" onchange="shEditMeritPt(' + realIdx + ',\'xp\',+this.value)">'
    + '<span class="bd-lbl' + (up ? ' bd-up' : '') + '">UP</span><input class="merit-bd-input' + (up ? ' bd-up-input' : '') + '" type="number" min="0" value="' + up + '" onchange="shEditMeritPt(' + realIdx + ',\'up\',+this.value)">'
    + '<span class="bd-total">= ' + total + ' dot' + (total === 1 ? '' : 's') + (up ? ' <span class="bd-up-warn">+' + up + ' unaccounted</span>' : '') + '</span>'
    + '</div>';
}
