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

/**
 * Total XP earned by a character (all sources).
 * @param {object} c - character object
 * @returns {number}
 */
export function xpEarned(c) {
  const e = (c.xp_log || {}).earned || {};
  return (e.starting || 0) + (e.humanity_drop || 0) + (e.ordeals || 0) + (e.game || 0);
}

/**
 * Total XP spent by a character (all categories).
 * @param {object} c - character object
 * @returns {number}
 */
export function xpSpent(c) {
  const s = (c.xp_log || {}).spent || {};
  return (s.attributes || 0) + (s.skills || 0) + (s.merits || 0) + (s.powers || 0) + (s.special || 0);
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
