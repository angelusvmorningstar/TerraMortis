/* Sheet-mode edit handlers — all read state.editIdx and write to state.chars[state.editIdx] */

import state from '../data/state.js';
import {
  CLAN_BANES, BLOODLINE_CLANS, BLOODLINE_DISCS, CLAN_DISCS, RITUAL_DISCS,
  SKILL_CATS, SKILL_PRI_BUDGETS, ALL_SKILLS, ATTR_CATS, PRI_BUDGETS
} from '../data/constants.js';
import { DEVOTIONS_DB } from '../data/devotions-db.js';
import { xpToDots, xpEarned, xpSpent } from './xp.js';
import { meritByCategory, addMerit, removeMerit, ensureMeritSync } from './merits.js';
import {
  shEditInflMerit, shEditStatusMode, shRemoveInflMerit, shAddInflMerit,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill, shToggleMCI, shEditMCIGrant,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  registerCallbacks as registerDomainCallbacks
} from './edit-domain.js';

/* Re-export merit-category handlers so consumers can import from edit.js */
export {
  shEditInflMerit, shEditStatusMode, shRemoveInflMerit, shAddInflMerit,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill, shToggleMCI, shEditMCIGrant,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner
};

/* ── Callback registration (avoids circular deps with main.js / sheet.js) ── */
let _markDirty, _renderSheet;
export function registerCallbacks(markDirty, renderSheet) {
  _markDirty = markDirty;
  _renderSheet = renderSheet;
  registerDomainCallbacks(markDirty, renderSheet);
}

/* ══════════════════════════════════════════════════════════
   IDENTITY & BASICS
══════════════════════════════════════════════════════════ */

export function editFromSheet() {
  if (state.editIdx < 0) return;
  const el = document.getElementById('sh-content');
  const scrollEl = el ? el.closest('.sh-wrap') || el.parentElement || document.documentElement : document.documentElement;
  const savedScroll = scrollEl.scrollTop;
  state.editMode = !state.editMode;
  const btn = document.querySelector('.sheet-edit-btn');
  if (btn) {
    btn.textContent = state.editMode ? 'Done' : 'Edit';
    btn.classList.toggle('editing', state.editMode);
  }
  _renderSheet(state.chars[state.editIdx]);
  scrollEl.scrollTop = savedScroll;
}

export function shEdit(field, val) {
  if (state.editIdx < 0) return;
  state.chars[state.editIdx][field] = val || null;
  _markDirty();
  // Re-render for fields that affect derived display (title bonus, regent territory, clan bane)
  if (field === 'court_title' || field === 'regent_territory') {
    _renderSheet(state.chars[state.editIdx]);
    return;
  }
  // If clan changed, update curse bane
  if (field === 'clan') {
    const c = state.chars[state.editIdx];
    const newCurse = CLAN_BANES[val];
    if (newCurse) {
      if (!c.banes) c.banes = [];
      const ci = c.banes.findIndex(b => Object.values(CLAN_BANES).some(cb => cb.name === b.name));
      if (ci >= 0) c.banes[ci] = { ...newCurse };
      else c.banes.unshift({ ...newCurse });
    }
    // Clear bloodline if not valid for new clan
    const validBLs = BLOODLINE_CLANS[val] || [];
    if (c.bloodline && !validBLs.includes(c.bloodline)) c.bloodline = null;
    _renderSheet(c);
  }
}

export function shEditStatus(key, val) {
  if (state.editIdx < 0) return;
  if (!state.chars[state.editIdx].status) state.chars[state.editIdx].status = {};
  state.chars[state.editIdx].status[key] = parseInt(val) || 0;
  _markDirty();
}

/* ══════════════════════════════════════════════════════════
   BANES
══════════════════════════════════════════════════════════ */

export function shEditBaneName(i, val) {
  if (state.editIdx < 0) return;
  const banes = state.chars[state.editIdx].banes || [];
  if (banes[i]) { banes[i].name = val; _markDirty(); }
}

export function shEditBaneEffect(i, val) {
  if (state.editIdx < 0) return;
  const banes = state.chars[state.editIdx].banes || [];
  if (banes[i]) { banes[i].effect = val; _markDirty(); }
}

export function shRemoveBane(i) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.banes) return;
  // Don't remove the clan curse
  const b = c.banes[i];
  if (b && Object.values(CLAN_BANES).some(cb => cb.name === b.name)) {
    return; // can't remove clan curse
  }
  c.banes.splice(i, 1);
  _markDirty();
  _renderSheet(c);
}

export function shAddBane() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.banes) c.banes = [];
  c.banes.push({ name: '', effect: '' });
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   TOUCHSTONES
══════════════════════════════════════════════════════════ */

export function shEditTouchstone(i, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.touchstones || !c.touchstones[i]) return;
  c.touchstones[i][field] = field === 'humanity' ? (parseInt(val) || 1) : val;
  _markDirty();
}

export function shAddTouchstone() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.touchstones) c.touchstones = [];
  c.touchstones.push({ humanity: 1, name: '', desc: '' });
  _markDirty();
  _renderSheet(c);
}

export function shRemoveTouchstone(i) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.touchstones) return;
  c.touchstones.splice(i, 1);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   BLOOD POTENCY & HUMANITY
══════════════════════════════════════════════════════════ */

export function shEditBP(val) {
  if (state.editIdx < 0) return;
  const n = Math.max(0, Math.min(10, parseInt(val) || 0));
  state.chars[state.editIdx].blood_potency = n;
  _markDirty();
  _renderSheet(state.chars[state.editIdx]);
}

export function shEditHumanity(val) {
  if (state.editIdx < 0) return;
  const n = Math.max(0, Math.min(10, parseInt(val) || 0));
  state.chars[state.editIdx].humanity = n;
  _markDirty();
  _renderSheet(state.chars[state.editIdx]);
}

/* ══════════════════════════════════════════════════════════
   STATUS UP/DOWN
══════════════════════════════════════════════════════════ */

export function shStatusUp(key) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.status) c.status = {};
  c.status[key] = Math.min(5, (c.status[key] || 0) + 1);
  _markDirty();
  _renderSheet(c);
}

export function shStatusDown(key) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.status) c.status = {};
  c.status[key] = Math.max(0, (c.status[key] || 0) - 1);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   ATTRIBUTE PRIORITIES & CREATION POINTS
══════════════════════════════════════════════════════════ */

export function shSetPriority(cat, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.attribute_priorities) c.attribute_priorities = {};
  const old = c.attribute_priorities[cat];
  if (old === val) return;
  // Swap: find who currently has this value and give them the old one
  const cats = ['Mental', 'Physical', 'Social'];
  cats.forEach(k => {
    if (k !== cat && c.attribute_priorities[k] === val) {
      c.attribute_priorities[k] = old || 'Tertiary';
    }
  });
  c.attribute_priorities[cat] = val;
  _markDirty();
  _renderSheet(c);
}

export function shEditAttrPt(attr, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.attr_creation) c.attr_creation = {};
  if (!c.attr_creation[attr]) c.attr_creation[attr] = { cp: 0, free: 0, xp: 0 };
  val = Math.max(0, val || 0);
  if (field === 'cp') {
    // Enforce category CP cap
    const cat = Object.entries(ATTR_CATS).find(([k, v]) => v.includes(attr));
    if (cat) {
      const pri = (c.attribute_priorities || {})[cat[0]] || 'Primary';
      const budget = PRI_BUDGETS[pri] || 5;
      const otherCP = cat[1].filter(a => a !== attr).reduce((s, a) => s + (((c.attr_creation || {})[a] || {}).cp || 0), 0);
      val = Math.min(val, budget - otherCP);
      if (val < 0) val = 0;
    }
  }
  c.attr_creation[attr][field] = val;
  const cr = c.attr_creation[attr];
  const attrBase = (cr.cp || 0) + (cr.free || 0);
  const newDots = attrBase + xpToDots(cr.xp || 0, attrBase, 4);
  if (!c.attributes[attr]) c.attributes[attr] = { dots: 0, bonus: 0 };
  c.attributes[attr].dots = newDots;
  // Recalculate xp_log.spent.attributes: flat sum of all attr XP costs
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  let attrXpTotal = 0;
  const NINE_ATTRS = ['Intelligence', 'Wits', 'Resolve', 'Strength', 'Dexterity', 'Stamina', 'Presence', 'Manipulation', 'Composure'];
  NINE_ATTRS.forEach(a => { attrXpTotal += ((c.attr_creation || {})[a] || {}).xp || 0; });
  c.xp_log.spent.attributes = attrXpTotal;
  c.xp_total = xpEarned(c);
  c.xp_spent = xpSpent(c);
  _markDirty();
  _renderSheet(c);
}

export function shSetClanAttr(val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const oldCA = c.clan_attribute;
  c.clan_attribute = val;
  // Recalculate dots for old and new clan attr
  [oldCA, val].forEach(attr => {
    if (!attr) return;
    if (!c.attr_creation) c.attr_creation = {};
    if (!c.attr_creation[attr]) c.attr_creation[attr] = { cp: 0, free: 1, xp: 0 };
    const cr = c.attr_creation[attr];
    // Update free: base 1, +1 if this is the new clan attr
    const wasClan = (attr === oldCA);
    const isClan = (attr === val);
    if (wasClan && !isClan) cr.free = Math.max(1, cr.free - 1);
    if (!wasClan && isClan) cr.free = cr.free + 1;
    const aBase = (cr.cp || 0) + (cr.free || 0);
    if (!c.attributes[attr]) c.attributes[attr] = { dots: 0, bonus: 0 };
    c.attributes[attr].dots = aBase + xpToDots(cr.xp || 0, aBase, 4);
  });
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   DISCIPLINES
══════════════════════════════════════════════════════════ */

export function shEditDiscPt(disc, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.disc_creation) c.disc_creation = {};
  if (!c.disc_creation[disc]) c.disc_creation[disc] = { cp: 0, free: 0, xp: 0 };
  val = Math.max(0, val || 0);
  if (field === 'cp') {
    // Enforce: 3 total CP, max 1 out-of-clan CP
    const inClanList = BLOODLINE_DISCS[c.bloodline] || CLAN_DISCS[c.clan] || [];
    const isInClan = inClanList.includes(disc);
    const otherCP = Object.entries(c.disc_creation)
      .filter(([d]) => d !== disc)
      .reduce((s, [, v]) => s + (v.cp || 0), 0);
    val = Math.min(val, 3 - otherCP);
    if (!isInClan) {
      const otherOutCP = Object.entries(c.disc_creation)
        .filter(([d]) => d !== disc && !inClanList.includes(d))
        .reduce((s, [, v]) => s + (v.cp || 0), 0);
      val = Math.min(val, 1 - otherOutCP);
    }
    if (val < 0) val = 0;
  }
  c.disc_creation[disc][field] = val;
  const cr = c.disc_creation[disc];
  const inClanList2 = BLOODLINE_DISCS[c.bloodline] || CLAN_DISCS[c.clan] || [];
  const discBase = (cr.cp || 0) + (cr.free || 0);
  const discCostMult = RITUAL_DISCS.includes(disc) ? 4 : (inClanList2.includes(disc) ? 3 : 4);
  const newDots = discBase + xpToDots(cr.xp || 0, discBase, discCostMult);
  if (!c.disciplines) c.disciplines = {};
  c.disciplines[disc] = newDots;
  // Recalculate XP spent on disciplines
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  let discXpTotal = 0;
  Object.entries(c.disc_creation || {}).forEach(([d, v]) => {
    discXpTotal += v.xp || 0;
  });
  c.xp_log.spent.powers = discXpTotal;
  c.xp_total = xpEarned(c);
  c.xp_spent = xpSpent(c);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   SKILLS — SPECIALISATIONS & PRIORITIES
══════════════════════════════════════════════════════════ */

export function shEditSpec(skill, idx, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const sk = c.skills?.[skill];
  if (!sk || !sk.specs) return;
  sk.specs[idx] = val;
  _markDirty();
}

export function shRemoveSpec(skill, idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const sk = c.skills?.[skill];
  if (!sk || !sk.specs) return;
  sk.specs.splice(idx, 1);
  _markDirty();
  _renderSheet(c);
}

export function shAddSpec(skill) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.skills) c.skills = {};
  if (!c.skills[skill]) c.skills[skill] = { dots: 0, bonus: 0, specs: [], nine_again: false };
  if (!c.skills[skill].specs) c.skills[skill].specs = [];
  c.skills[skill].specs.push('');
  _markDirty();
  _renderSheet(c);
}

export function shSetSkillPriority(cat, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.skill_priorities) c.skill_priorities = {};
  const old = c.skill_priorities[cat];
  if (old === val) return;
  const cats = ['Mental', 'Physical', 'Social'];
  cats.forEach(k => {
    if (k !== cat && c.skill_priorities[k] === val) {
      c.skill_priorities[k] = old || 'Tertiary';
    }
  });
  c.skill_priorities[cat] = val;
  _markDirty();
  _renderSheet(c);
}

export function shEditSkillPt(skill, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.skill_creation) c.skill_creation = {};
  if (!c.skill_creation[skill]) c.skill_creation[skill] = { cp: 0, free: 0, xp: 0 };
  val = Math.max(0, val || 0);
  if (field === 'cp') {
    const cat = Object.entries(SKILL_CATS).find(([k, v]) => v.includes(skill));
    if (cat) {
      const pri = (c.skill_priorities || {})[cat[0]] || 'Primary';
      const budget = SKILL_PRI_BUDGETS[pri] || 11;
      const otherCP = cat[1].filter(s => s !== skill).reduce((s, sk) => s + (((c.skill_creation || {})[sk] || {}).cp || 0), 0);
      val = Math.min(val, budget - otherCP);
      if (val < 0) val = 0;
    }
  }
  c.skill_creation[skill][field] = val;
  const cr = c.skill_creation[skill];
  const skBase = (cr.cp || 0) + (cr.free || 0);
  const newDots = skBase + xpToDots(cr.xp || 0, skBase, 2);
  if (!c.skills) c.skills = {};
  if (!c.skills[skill]) c.skills[skill] = { dots: 0, bonus: 0, specs: [], nine_again: false };
  else if (typeof c.skills[skill] !== 'object') c.skills[skill] = { dots: c.skills[skill], bonus: 0, specs: [], nine_again: false };
  c.skills[skill].dots = newDots;
  // Recalculate XP spent on skills
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  let skXpTotal = 0;
  ALL_SKILLS.forEach(s => { skXpTotal += ((c.skill_creation || {})[s] || {}).xp || 0; });
  c.xp_log.spent.skills = skXpTotal;
  c.xp_total = xpEarned(c);
  c.xp_spent = xpSpent(c);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   ORDEALS & XP
══════════════════════════════════════════════════════════ */

export function shToggleOrdeal(idx, checked) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.ordeals || !c.ordeals[idx]) return;
  c.ordeals[idx].complete = checked;
  c.ordeals[idx].xp = checked ? 3 : 0;
  // Recalculate ordeals total in xp_log
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  c.xp_log.earned.ordeals = c.ordeals.reduce((s, o) => s + (o.xp || 0), 0);
  _markDirty();
  _renderSheet(c);
}

export function shEditXP(bucket, key, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.xp_log) c.xp_log = { earned: {}, spent: {} };
  if (!c.xp_log[bucket]) c.xp_log[bucket] = {};
  c.xp_log[bucket][key] = val || 0;
  c.xp_total = xpEarned(c);
  c.xp_spent = xpSpent(c);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   DEVOTIONS
══════════════════════════════════════════════════════════ */

export function shShowDevSelect(btn) {
  const sel = document.getElementById('dev-add-select');
  if (!sel) return;
  if (sel.style.display === 'none') {
    sel.style.display = '';
    btn.textContent = 'Confirm';
  } else {
    // Actually add the devotion
    if (!sel.value) return;
    const c = state.chars[state.editIdx];
    const dev = DEVOTIONS_DB.find(d => d.n === sel.value);
    if (!dev) return;
    if (!c.powers) c.powers = [];
    if (c.powers.some(p => p.category === 'devotion' && p.name === dev.n)) return;
    c.powers.push({ category: 'devotion', name: dev.n, stats: dev.stats || '', effect: dev.effect || '' });
    _markDirty();
    _renderSheet(c);
  }
}

export function shAddDevotion() {
  shShowDevSelect(document.querySelector('.dev-add-btn'));
}

export function shRemoveDevotion(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const devPowers = (c.powers || []).filter(p => p.category === 'devotion');
  const target = devPowers[idx];
  if (!target) return;
  const realIdx = c.powers.indexOf(target);
  if (realIdx >= 0) c.powers.splice(realIdx, 1);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   MERIT CREATION POINTS
══════════════════════════════════════════════════════════ */

export function shEditMeritPt(realIdx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  ensureMeritSync(c);
  const mc = c.merit_creation[realIdx];
  if (!mc) return;
  mc[field] = Math.max(0, parseInt(val) || 0);
  // Sync stored rating
  const total = (mc.cp || 0) + (mc.free || 0) + (mc.xp || 0);
  if (c.merits[realIdx]) c.merits[realIdx].rating = total;
  _markDirty();
  _renderSheet(c);
}
