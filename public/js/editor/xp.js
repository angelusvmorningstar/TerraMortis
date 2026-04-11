/**
 * XP calculations and merit rating/breakdown helpers.
 * Pure functions — no DOM side-effects.
 */

import { getRuleByKey } from '../data/loader.js';

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

/** XP from voluntary humanity drops: 2 per dot permanently lost. */
export function xpHumanityDrop(c) {
  // Use explicit field if set; otherwise infer from stored humanity value
  const lost = c.humanity_lost !== undefined
    ? c.humanity_lost
    : Math.max(0, (c.humanity_base || 7) - (c.humanity || 0));
  return lost * 2;
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

/** XP bonus from Professional Training: 1 XP per asset skill at 5+ effective dots (requires PT ≥ 4).
 *  Effective dots = base dots + PT dot 4 bonus (+1 to chosen asset skill). */
export function xpPT5(c) {
  const ptM = (c.merits || []).find(m => m.name === 'Professional Training');
  if (!ptM || meritRating(c, ptM) < 4) return 0;
  const assets = (ptM.asset_skills || []).filter(Boolean);
  if (!assets.length) return 0;
  const ptBonus = c._pt_dot4_bonus_skills instanceof Set ? c._pt_dot4_bonus_skills : new Set();
  return assets.filter(sk => {
    const s = (c.skills || {})[sk];
    const effective = (s?.dots || 0) + (ptBonus.has(sk) ? 1 : 0);
    return effective >= 5;
  }).length;
}

/**
 * Total XP earned by a character (all sources, derived dynamically).
 * @param {object} c - character object
 * @returns {number}
 */
export function xpEarned(c) {
  return xpStarting() + xpHumanityDrop(c) + xpOrdeals(c) + xpGame(c) + xpPT5(c);
}

/** Sum XP from inline creation fields on an object (attributes, skills, disciplines). */
function sumInlineXP(obj) {
  if (!obj) return 0;
  return Object.values(obj).reduce((t, v) => t + (v?.xp || 0), 0);
}

/** XP spent on attributes — sum of .xp across all attribute objects. */
export function xpSpentAttrs(c) {
  return sumInlineXP(c.attributes);
}

/** XP spent on skills + specialisations beyond free allowance. */
export function xpSpentSkills(c) {
  const skillXP = sumInlineXP(c.skills);
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
  // MCI dot 1 free specs: each active MCI with dot1_choice === 'speciality' grants 1 free spec
  const mciFreeSpecs = (c._mci_free_specs || []).filter(fs =>
    fs.skill && fs.spec && (c.skills || {})[fs.skill] && ((c.skills[fs.skill].specs || []).includes(fs.spec))
  ).length;
  // Bloodline-granted specs are also exempt from XP cost
  const bloodlineFreeSpecs = (c._bloodline_free_specs || []).filter(fs =>
    fs.skill && fs.spec && (c.skills || {})[fs.skill] && ((c.skills[fs.skill].specs || []).includes(fs.spec))
  ).length;
  // PT free covers asset specs first; baseline 3 covers everything else
  const ptFreeCovered = Math.min(ptFree, assetSpecs);
  const paidSpecs = nonAssetSpecs + Math.max(0, assetSpecs - ptFreeCovered);
  const specXP = Math.max(0, paidSpecs - 3 - mciFreeSpecs - bloodlineFreeSpecs);
  return skillXP + specXP;
}

/** XP spent on all merits (general, influence, domain, standing) + fighting styles + pact oaths. */
export function xpSpentMerits(c) {
  const meritXP = (c.merits || []).reduce((t, m) => t + (m.xp || 0), 0);
  const styleXP = (c.fighting_styles || []).reduce((t, fs) => t + (fs.xp || 0), 0);
  const pactXP = (c.powers || []).filter(p => p.category === 'pact').reduce((t, p) => t + (p.xp || 0), 0);
  return meritXP + styleXP + pactXP;
}

/** XP spent on powers — disciplines + devotions. */
export function xpSpentPowers(c) {
  const discXP = sumInlineXP(c.disciplines);
  // Devotion XP: look up each devotion's cost from DEVOTIONS_DB
  const devXP = (c.powers || [])
    .filter(p => p.category === 'devotion')
    .reduce((t, p) => {
      // Try rules cache first, fallback to _devotionsDB
      const slug = 'devotion-' + p.name.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const rule = getRuleByKey(slug);
      if (rule) return t + (rule.xp_fixed || 0);
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
  // Blood Potency: tracked directly in bp_creation.xp (new model) or derived (legacy)
  const bpXP = (c.bp_creation || {}).xp !== undefined
    ? ((c.bp_creation || {}).xp || 0)
    : Math.max(0, (c.blood_potency || 1) - 1 - Math.floor(((c.bp_creation || {}).cp || 0) / 5)) * 5;
  // Humanity: XP spent raising dots (new model only; old model net is captured in xpHumanityDrop)
  const humXP = c.humanity_xp || 0;
  // Lost Willpower dots: stored in xp_log.spent.willpower
  const wpXP = ((c.xp_log || {}).spent || {}).willpower || 0;
  // Manual special: anything else tracked in xp_log
  const manualXP = ((c.xp_log || {}).spent || {}).special || 0;
  return bpXP + humXP + wpXP + manualXP;
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
 * Effective rating of a merit (sum of CP + free + grant pools + XP, inline on merit object).
 * Falls back to stored rating if inline fields are absent.
 * @param {object} c - character object
 * @param {object} m - merit entry
 * @returns {number}
 */
export function meritRating(c, m) {
  if (m.cp === undefined && m.xp === undefined) return m.rating || 0;
  return (m.cp || 0) + (m.free_bloodline || 0) + (m.free_pet || 0) + (m.free_mci || 0) + (m.free_vm || 0) + (m.free_lk || 0)
    + (m.free_ohm || 0) + (m.free_inv || 0) + (m.free_pt || 0) + (m.free_mdb || 0) + (m.free_sw || 0) + (m.free_attache || 0) + (m.xp || 0);
}

/**
 * Render the merit breakdown row: Fr + CP + XP = total
 * @param {number} realIdx - index into c.merits
 * @param {object} mc - merit object with inline creation fields {cp, free, xp, free_mci, ...}
 * @param {number|null} fixedAt - if the merit has a fixed rating (e.g. 3 for VM), pass it here;
 *   null for graduated merits. When fixedAt is set, the displayed total snaps to 0 until the
 *   threshold is met, then shows fixedAt.
 */
export function meritBdRow(realIdx, mc, fixedAt, opts = {}) {
  const cp = mc.cp || 0, xp = mc.xp || 0, fbl = mc.free_bloodline || 0, fret = mc.free_pet || 0, fmci = mc.free_mci || 0, fvm = mc.free_vm || 0, flk = mc.free_lk || 0, fohm = mc.free_ohm || 0, finv = mc.free_inv || 0, fpt = mc.free_pt || 0, fmdb = mc.free_mdb || 0, fsw = mc.free_sw || 0, fatt = mc.free_attache || 0;
  const total = cp + xp + fbl + fret + fmci + fvm + flk + fohm + finv + fpt + fmdb + fsw + fatt;
  // Effective display: for fixed merits, only show dots once the threshold is reached
  const effective = (fixedAt != null) ? (total >= fixedAt ? fixedAt : 0) : total;
  const needsHint = (fixedAt != null && total > 0 && total < fixedAt)
    ? '<span class="bd-needs-hint">' + total + ' / ' + fixedAt + ' needed</span>' : '';
  let h = '<div class="merit-bd-row">'
    + '<div class="bd-grp"><span class="bd-lbl">CP</span><input class="merit-bd-input" type="number" min="0" value="' + cp + '" onchange="shEditMeritPt(' + realIdx + ',\'cp\',+this.value)"></div>'
    + '<div class="bd-grp"><span class="bd-lbl">XP</span><input class="merit-bd-input" type="number" min="0" value="' + xp + '" onchange="shEditMeritPt(' + realIdx + ',\'xp\',+this.value)"></div>'
    + '<div class="bd-sep"></div>';
  if (opts.showMCI) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">MCI</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + fmci + '" onchange="shEditMeritPt(' + realIdx + ',\'free_mci\',+this.value)"></div>';
  if (opts.showVM) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">VM</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + fvm + '" onchange="shEditMeritPt(' + realIdx + ',\'free_vm\',+this.value)"></div>';
  if (opts.showLK) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">LK</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + flk + '" onchange="shEditMeritPt(' + realIdx + ',\'free_lk\',+this.value)"></div>';
  if (opts.showOHM) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">OHM</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + fohm + '" onchange="shEditMeritPt(' + realIdx + ',\'free_ohm\',+this.value)"></div>';
  if (opts.showINV) h += '<div class="bd-grp"><span class="bd-lbl bd-bonus-lbl">INV</span><input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + finv + '" onchange="shEditMeritPt(' + realIdx + ',\'free_inv\',+this.value)"></div>';
  if (opts.showAttache) {
    const _aKeys = opts.showAttache.keys;
    const _aCurKey = mc.retainer_source || '';
    const _aCurDots = fatt;
    h += '<div class="bd-grp bd-attache-grp">'
      + '<span class="bd-lbl bd-bonus-lbl">Att</span>'
      + '<select class="merit-bd-select" onchange="shEditMeritAttache(' + realIdx + ',this.value,' + _aCurDots + ')">'
      + '<option value="">\u2014</option>'
      + _aKeys.map(k => '<option value="' + k + '"' + (_aCurKey === k ? ' selected' : '') + '>' + k + '</option>').join('')
      + '</select>'
      + '<input class="merit-bd-input bd-bonus-input" type="number" min="0" value="' + _aCurDots + '" onchange="shEditMeritAttache(' + realIdx + ',\'' + _aCurKey + '\',+this.value)">'
      + '</div>';
  }
  h += '<div class="bd-eq"><span class="bd-val">' + effective + ' dot' + (effective === 1 ? '' : 's') + '</span>' + needsHint + '</div>'
    + '</div>';
  return h;
}
