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

/** XP spent on attributes — sum of attr_creation.xp across all attributes. */
export function xpSpentAttrs(c) {
  return sumCreationXP(c.attr_creation);
}

/** XP spent on skills + specialisations beyond free allowance. */
export function xpSpentSkills(c) {
  const skillXP = sumCreationXP(c.skill_creation);
  // Specialisation XP: 1 per spec beyond free allowance
  const totalSpecs = Object.values(c.skills || {}).reduce((s, sk) => s + ((sk && sk.specs) ? sk.specs.length : 0), 0);
  const ptM = (c.merits || []).find(m => m.name === 'Professional Training');
  const ptB = (ptM && ptM.rating >= 3) ? 2 : 0;
  const freeS = 3 + ptB;
  const specXP = Math.max(0, totalSpecs - freeS);
  return skillXP + specXP;
}

/** XP spent on all merits (general, influence, domain, standing, manoeuvres). */
export function xpSpentMerits(c) {
  return (c.merit_creation || []).reduce((t, mc) => t + (mc ? mc.xp || 0 : 0), 0);
}

/** XP spent on powers — disciplines + devotions. */
export function xpSpentPowers(c) {
  const discXP = sumCreationXP(c.disc_creation);
  // Devotion XP: look up each devotion's cost from DEVOTIONS_DB
  const devXP = (c.powers || [])
    .filter(p => p.category === 'devotion')
    .reduce((t, p) => {
      const db = _devotionsDB ? _devotionsDB.find(d => d.n === p.name) : null;
      return t + (db ? db.xp || 0 : 0);
    }, 0);
  return discXP + devXP;
}

/** XP spent on special: Blood Potency, Humanity, lost Willpower dots. */
export function xpSpentSpecial(c) {
  // Blood Potency: 5 XP per dot above starting (starting = 1 for most neonates)
  const bpXP = Math.max(0, (c.blood_potency || 1) - 1) * 5;
  // Lost Willpower dots: stored in xp_log.spent.willpower
  const wpXP = ((c.xp_log || {}).spent || {}).willpower || 0;
  // Manual special: anything else tracked in xp_log
  const manualXP = ((c.xp_log || {}).spent || {}).special || 0;
  return bpXP + wpXP + manualXP;
}

// Devotions DB reference (set via setDevotionsDB)
let _devotionsDB = null;
export function setDevotionsDB(db) { _devotionsDB = db; }

/**
 * Total XP spent by a character (all categories, fully dynamic).
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
 * Render the merit breakdown row: Fr + CP + XP = total | UP
 * Fr is editable but backed by grant pools (MCI/PT/VM/etc).
 * @param {number} realIdx - index into c.merits / c.merit_creation
 * @param {object} mc - merit_creation entry {cp, free, xp, up}
 * @returns {string} HTML
 */
export function meritBdRow(realIdx, mc) {
  const fr = mc.free || 0;
  const total = fr + (mc.cp || 0) + (mc.xp || 0);
  const up = mc.up || 0;
  return '<div class="merit-bd-row">'
    + '<span class="bd-lbl" style="color:var(--gold2)">Fr</span><input class="merit-bd-input" style="color:var(--gold2)" type="number" min="0" value="' + fr + '" onchange="shEditMeritPt(' + realIdx + ',\'free\',+this.value)">'
    + '<span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + (mc.cp || 0) + '" onchange="shEditMeritPt(' + realIdx + ',\'cp\',+this.value)">'
    + '<span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + (mc.xp || 0) + '" onchange="shEditMeritPt(' + realIdx + ',\'xp\',+this.value)">'
    + '<span class="bd-lbl' + (up ? ' bd-up' : '') + '">UP</span><input class="merit-bd-input' + (up ? ' bd-up-input' : '') + '" type="number" min="0" value="' + up + '" onchange="shEditMeritPt(' + realIdx + ',\'up\',+this.value)">'
    + '<span class="bd-total">\u2248 ' + total + ' dot' + (total === 1 ? '' : 's') + (up ? ' <span class="bd-up-warn">+' + up + ' unaccounted</span>' : '') + '</span>'
    + '</div>';
}
