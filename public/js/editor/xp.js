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
  // PT free specs (dot 3): 2 extra, but ONLY usable on asset skills — tracked separately
  const ptM = (c.merits || []).find(m => m.name === 'Professional Training');
  const ptFree = (ptM && ptM.rating >= 3) ? 2 : 0;
  const ptAssets = new Set((ptM && ptM.rating >= 3 && ptM.asset_skills) ? (ptM.asset_skills || []).filter(Boolean) : []);
  let assetSpecs = 0, nonAssetSpecs = 0;
  Object.entries(c.skills || {}).forEach(([sk, skillObj]) => {
    const count = (skillObj && skillObj.specs) ? skillObj.specs.length : 0;
    if (ptAssets.has(sk)) assetSpecs += count;
    else nonAssetSpecs += count;
  });
  // PT free covers asset specs first; baseline 3 covers everything else
  const ptFreeCovered = Math.min(ptFree, assetSpecs);
  const paidSpecs = nonAssetSpecs + Math.max(0, assetSpecs - ptFreeCovered);
  const specXP = Math.max(0, paidSpecs - 3);
  return skillXP + specXP;
}

/** XP spent on all merits (general, influence, domain, standing) + fighting styles. */
export function xpSpentMerits(c) {
  const meritXP = (c.merit_creation || []).reduce((t, mc) => t + (mc ? mc.xp || 0 : 0), 0);
  const styleXP = (c.fighting_styles || []).reduce((t, fs) => t + (fs.xp || 0), 0);
  return meritXP + styleXP;
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
  // Rite XP: paid rites cost 1 XP (rank 1-3) or 2 XP (rank 4-5)
  const riteXP = (c.powers || [])
    .filter(p => p.category === 'rite' && !p.free)
    .reduce((t, p) => t + (p.level >= 4 ? 2 : 1), 0);
  return discXP + devXP + riteXP;
}

/** XP spent on special: Blood Potency, Humanity, lost Willpower dots. */
export function xpSpentSpecial(c) {
  // Blood Potency: 5 XP per dot above starting, minus any dots already paid for via merit CP
  const bpCPDots = Math.floor(((c.bp_creation || {}).cp || 0) / 5);
  const bpXP = Math.max(0, (c.blood_potency || 1) - 1 - bpCPDots) * 5;
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
/**
 * Render the merit breakdown row: Fr + CP + XP = total | UP
 * @param {number} realIdx
 * @param {object} mc - merit_creation entry {cp, free, xp, up}
 * @param {number|null} fixedAt - if the merit has a fixed rating (e.g. 3 for VM), pass it here;
 *   null for graduated merits. When fixedAt is set, the displayed total snaps to 0 until the
 *   threshold is met, then shows fixedAt.
 */
export function meritBdRow(realIdx, mc, fixedAt, opts = {}) {
  const cp = mc.cp || 0, xp = mc.xp || 0, fr = mc.free || 0, fmci = mc.free_mci || 0, fvm = mc.free_vm || 0, flk = mc.free_lk || 0, fohm = mc.free_ohm || 0, finv = mc.free_inv || 0;
  const total = cp + xp + fr + fmci + fvm + flk + fohm + finv;
  // Effective display: for fixed merits, only show dots once the threshold is reached
  const effective = (fixedAt != null) ? (total >= fixedAt ? fixedAt : 0) : total;
  const needsHint = (fixedAt != null && total > 0 && total < fixedAt)
    ? '<span class="bd-needs-hint">' + total + ' / ' + fixedAt + ' needed</span>' : '';
  let h = '<div class="merit-bd-row">'
    + '<div class="bd-grp"><span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + cp + '" onchange="shEditMeritPt(' + realIdx + ',\'cp\',+this.value)"></div>'
    + '<div class="bd-grp"><span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + xp + '" onchange="shEditMeritPt(' + realIdx + ',\'xp\',+this.value)"></div>'
    + '<div class="bd-sep"></div>'
    + '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">Fr</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + fr + '" onchange="shEditMeritPt(' + realIdx + ',\'free\',+this.value)"></div>';
  if (opts.showMCI) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">MCI</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + fmci + '" onchange="shEditMeritPt(' + realIdx + ',\'free_mci\',+this.value)"></div>';
  if (opts.showVM) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">VM</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + fvm + '" onchange="shEditMeritPt(' + realIdx + ',\'free_vm\',+this.value)"></div>';
  if (opts.showLK) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">LK</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + flk + '" onchange="shEditMeritPt(' + realIdx + ',\'free_lk\',+this.value)"></div>';
  if (opts.showOHM) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">OHM</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + fohm + '" onchange="shEditMeritPt(' + realIdx + ',\'free_ohm\',+this.value)"></div>';
  if (opts.showINV) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">INV</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + finv + '" onchange="shEditMeritPt(' + realIdx + ',\'free_inv\',+this.value)"></div>';
  h += '<div class="bd-eq"><span class="bd-val">' + effective + ' dot' + (effective === 1 ? '' : 's') + '</span>' + needsHint + '</div>'
    + '</div>';
  return h;
}
