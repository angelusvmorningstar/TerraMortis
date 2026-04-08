/* Merit-category edit handlers — split from edit.js to stay under 500 lines */

import state from '../data/state.js';
import { meritByCategory, addMerit, removeMerit } from './merits.js';
import { mciPoolTotal } from './mci.js';
import { getRuleByKey } from '../data/loader.js';

function ruleKeyFor(name) {
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return getRuleByKey(slug)?.key || null;
}

/* ── Callback registration (same pattern as edit.js) ── */
let _markDirty, _renderSheet;
export function registerCallbacks(markDirty, renderSheet) {
  _markDirty = markDirty;
  _renderSheet = renderSheet;
}

/* ══════════════════════════════════════════════════════════
   INFLUENCE MERITS
══════════════════════════════════════════════════════════ */

export function shEditInflMerit(idx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'influence', idx);
  if (!m) return;
  if (field === 'name') { m.name = val; m.rule_key = ruleKeyFor(val); m.area = ''; delete m.ghoul; }
  else if (field === 'area') m.area = val;
  else if (field === 'rating') m.rating = Math.max(0, Math.min(5, parseInt(val) || 0));
  else if (field === 'ghoul') m.ghoul = val === true || val === 'true' || val === 1;
  _markDirty();
  _renderSheet(c);
}

export function shEditStatusMode(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'influence', idx);
  if (!m) return;
  m.narrow = !m.narrow;
  m.area = '';
  _markDirty();
  _renderSheet(c);
}

export function shEditContactSphere(meritIdx, dotIdx, sphere) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const m = c.merits[meritIdx];
  if (!m || m.name !== 'Contacts') return;
  if (!m.spheres) m.spheres = [];
  m.spheres[dotIdx] = sphere;
  _markDirty();
  _renderSheet(c);
}

export function shRemoveInflMerit(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { realIdx } = meritByCategory(c, 'influence', idx);
  if (realIdx >= 0) removeMerit(c, realIdx);
  _markDirty();
  _renderSheet(c);
}

export function shAddLKMerit(type) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  addMerit(c, { category: 'domain', name: type || 'Herd', rating: 0, granted_by: 'Lorekeeper' });
  _markDirty();
  _renderSheet(c);
}

export function shAddVMAllies() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  addMerit(c, { category: 'influence', name: 'Allies', rating: 0, area: '', granted_by: 'VM' });
  _markDirty();
  _renderSheet(c);
}

export function shAddInflMerit(type) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const name = type || 'Allies';
  const entry = { category: 'influence', name: name, rating: 1, area: '' };
  if (name === 'Retainer') entry.ghoul = false;
  addMerit(c, entry);
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   GENERAL MERITS
══════════════════════════════════════════════════════════ */

export function shEditGenMerit(idx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'general', idx);
  if (!m) return;
  if (field === 'name') { m.name = val; m.rule_key = ruleKeyFor(val); }
  else if (field === 'qualifier') {
    const prevQualifier = m.qualifier;
    if (val) m.qualifier = val; else delete m.qualifier;
    if (m.name === 'Fucking Thief') {
      // Remove previously stolen merit (identified by granted_by)
      if (prevQualifier && prevQualifier !== val) {
        const oldIdx = (c.merits || []).findIndex(x => x.name === prevQualifier && x.category === 'general' && x.granted_by === 'Fucking Thief');
        if (oldIdx >= 0) removeMerit(c, oldIdx);
      }
      // Add newly stolen merit with granted_by marker
      if (val) {
        let newIdx = (c.merits || []).findIndex(x => x.name === val && x.category === 'general' && x.granted_by === 'Fucking Thief');
        if (newIdx < 0) {
          addMerit(c, { category: 'general', name: val, rating: 0, granted_by: 'Fucking Thief' });
          newIdx = c.merits.length - 1;
        }
        c.merits[newIdx].free = 1;
      }
    }
  }
  _markDirty();
  _renderSheet(c);
}

export function shRemoveGenMerit(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { realIdx } = meritByCategory(c, 'general', idx);
  if (realIdx >= 0) removeMerit(c, realIdx);
  _markDirty();
  _renderSheet(c);
}

export function shAddGenMerit() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  addMerit(c, { category: 'general', name: '', rating: 0 });
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   STANDING MERITS (MCI + PT)
══════════════════════════════════════════════════════════ */

export function shAddStandMCI() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  addMerit(c, { category: 'standing', name: 'Mystery Cult Initiation', rating: 0, cult_name: '', dot1_choice: 'merits', dot3_choice: 'merits', dot5_choice: 'merits' });
  _markDirty();
  _renderSheet(c);
}

export function shAddStandPT() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  addMerit(c, { category: 'standing', name: 'Professional Training', rating: 0, role: '', asset_skills: [] });
  _markDirty();
  _renderSheet(c);
}

export function shEditStandMerit(idx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'standing', idx);
  if (!m) return;
  if (field === 'cult_name') m.cult_name = val;
  else if (field === 'role') m.role = val;
  else if (field === 'dot4_skill') m.dot4_skill = val || null;
  else if (field === 'benefit') {
    const parts = val.split('|');
    const dotIdx = parseInt(parts[0]);
    const text = parts[1] || '';
    if (!m.benefits) m.benefits = ['', '', '', '', ''];
    m.benefits[dotIdx] = text;
  }
  _markDirty();
  _renderSheet(c);
}

export function shEditStandAssetSkill(standIdx, slotIdx, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'standing', standIdx);
  if (!m) return;
  if (!m.asset_skills) m.asset_skills = [];
  m.asset_skills[slotIdx] = val;
  _markDirty();
  _renderSheet(c);
}

export function shToggleMCI(standIdx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'standing', standIdx);
  if (!m || m.name !== 'Mystery Cult Initiation') return;
  m.active = m.active === false ? true : false;
  _markDirty();
  _renderSheet(c);
}

export function shRemoveStandMerit(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { realIdx, merit: m } = meritByCategory(c, 'standing', idx);
  if (realIdx < 0) return;
  // For MCI: clear all free_mci allocations across the character
  if (m && m.name === 'Mystery Cult Initiation') {
    (c.merits || []).forEach(m2 => { m2.free_mci = 0; });
    (c.fighting_styles || []).forEach(fs => { fs.free_mci = 0; });
  }
  removeMerit(c, realIdx);
  _markDirty();
  _renderSheet(c);
}

export function shEditMCIDot(standIdx, dotKey, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'standing', standIdx);
  if (!m || m.name !== 'Mystery Cult Initiation') return;
  m[dotKey] = val;
  // Clear tier_grants for affected tier when choice changes away from merits
  if (dotKey === 'dot1_choice' && val === 'speciality' && m.tier_grants) m.tier_grants = m.tier_grants.filter(t => t.tier !== 1);
  if (dotKey === 'dot3_choice' && val === 'skill' && m.tier_grants) m.tier_grants = m.tier_grants.filter(t => t.tier !== 3);
  if (dotKey === 'dot5_choice' && val === 'advantage' && m.tier_grants) m.tier_grants = m.tier_grants.filter(t => t.tier !== 5);
  _markDirty();
  _renderSheet(c);
}

const _MCI_TIER_BUDGET = [0, 1, 1, 2, 3, 3];

function _meritCategory(name) {
  if (_INFL_NAMES.has(name)) return 'influence';
  if (_DOM_NAMES.has(name)) return 'domain';
  return 'general';
}

export function shEditMCITierGrant(standIdx, tier, meritName) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'standing', standIdx);
  if (!m || m.name !== 'Mystery Cult Initiation') return;
  if (!m.tier_grants) m.tier_grants = [];
  // Remove existing grant for this tier
  m.tier_grants = m.tier_grants.filter(t => t.tier !== tier);
  if (meritName) {
    const cat = _meritCategory(meritName);
    const budget = _MCI_TIER_BUDGET[tier] || 0;
    m.tier_grants.push({ tier, name: meritName, category: cat, rating: budget, qualifier: null });
  }
  _markDirty();
  _renderSheet(c);
}

export function shEditMCITierQual(standIdx, tier, qualifier) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'standing', standIdx);
  if (!m || m.name !== 'Mystery Cult Initiation' || !m.tier_grants) return;
  const tg = m.tier_grants.find(t => t.tier === tier);
  if (tg) tg.qualifier = qualifier || null;
  _markDirty();
  _renderSheet(c);
}

const _INFL_NAMES = new Set(['Allies','Contacts','Mentor','Resources','Retainer','Staff','Status']);
const _DOM_NAMES = new Set(['Safe Place','Haven','Feeding Grounds','Herd','Mandragora Garden']);

export function shEditDerivedMeritArea(mciRealIdx, dotLevel, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const mci = c.merits[mciRealIdx];
  if (!mci || !mci.benefit_grants) return;
  const grant = mci.benefit_grants[dotLevel];
  if (!grant) return;
  if (val) grant.qualifier = val;
  else delete grant.qualifier;
  _markDirty();
  _renderSheet(c);
}

export function shEditMCIGrant(standIdx, dotLevel, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'standing', standIdx);
  if (!m || m.name !== 'Mystery Cult Initiation') return;
  if (!m.benefit_grants) m.benefit_grants = [null, null, null, null, null];
  const _DOT_RATING = [1, 1, 2, 3, 3];
  if (field === 'name') {
    if (!val) {
      m.benefit_grants[dotLevel] = null;
    } else {
      const cat = _INFL_NAMES.has(val) ? 'influence' : _DOM_NAMES.has(val) ? 'domain' : 'general';
      m.benefit_grants[dotLevel] = { category: cat, name: val, rating: _DOT_RATING[dotLevel] || 1 };
    }
  } else if (field === 'qualifier') {
    if (m.benefit_grants[dotLevel]) {
      if (val) m.benefit_grants[dotLevel].qualifier = val;
      else delete m.benefit_grants[dotLevel].qualifier;
    }
  }
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   DOMAIN MERIT EDITING
══════════════════════════════════════════════════════════ */

export function shEditDomMerit(idx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'domain', idx);
  if (!m) return;
  if (field === 'name') { m.name = val; m.rule_key = ruleKeyFor(val); }
  else if (field === 'rating') m.rating = Math.max(1, Math.min(5, parseInt(val) || 1));
  else if (field === 'qualifier') { if (val) m.qualifier = val; else delete m.qualifier; }
  _markDirty();
  _renderSheet(c);
}

export function shRemoveDomMerit(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { realIdx } = meritByCategory(c, 'domain', idx);
  if (realIdx >= 0) removeMerit(c, realIdx);
  _markDirty();
  _renderSheet(c);
}

export function shAddDomMerit() {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  addMerit(c, { category: 'domain', name: 'Safe Place', rating: 0 });
  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   DOMAIN PARTNER SHARING
══════════════════════════════════════════════════════════ */

export function shAddDomainPartner(domIdx, partnerName) {
  // Link partnerName to the domain merit at domIdx on the current char
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'domain', domIdx);
  if (!m) return;
  const meritName = m.name;
  if (!m.shared_with) m.shared_with = [];
  if (m.shared_with.includes(partnerName)) return; // already linked

  // The full new group = current char + existing partners + new partner
  const fullGroup = [c.name, ...(m.shared_with || []), partnerName];

  // Update all existing group members to include new partner
  for (const memberName of [c.name, ...(m.shared_with || [])]) {
    const member = state.chars.find(ch => ch.name === memberName);
    if (!member) continue;
    const mm = (member.merits || []).find(x => x.category === 'domain' && x.name === meritName);
    if (mm) {
      mm.shared_with = fullGroup.filter(n => n !== memberName);
    }
  }

  // Ensure the new partner has this domain merit (add at 0 if missing)
  const partner = state.chars.find(ch => ch.name === partnerName);
  if (partner) {
    let pm = (partner.merits || []).find(x => x.category === 'domain' && x.name === meritName);
    if (!pm) {
      pm = { category: 'domain', name: meritName, rating: 0, shared_with: fullGroup.filter(n => n !== partnerName) };
      addMerit(partner, pm);
    } else {
      pm.shared_with = fullGroup.filter(n => n !== partnerName);
    }
  }

  _markDirty();
  _renderSheet(c);
}

export function shRemoveDomainPartner(domIdx, partnerName) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'domain', domIdx);
  if (!m) return;
  const meritName = m.name;

  // Remove partnerName from all remaining group members' shared_with
  const remainingGroup = [c.name, ...(m.shared_with || [])].filter(n => n !== partnerName);
  for (const memberName of remainingGroup) {
    const member = state.chars.find(ch => ch.name === memberName);
    if (!member) continue;
    const mm = (member.merits || []).find(x => x.category === 'domain' && x.name === meritName);
    if (mm) mm.shared_with = remainingGroup.filter(n => n !== memberName);
  }

  // On the partner: remove this char from their shared_with
  const partner = state.chars.find(ch => ch.name === partnerName);
  if (partner) {
    const pm = (partner.merits || []).find(x => x.category === 'domain' && x.name === meritName);
    if (pm) {
      pm.shared_with = (pm.shared_with || []).filter(n => n !== c.name && n !== partnerName);
      // If partner has 0 contribution and no remaining partners, remove the merit
      const pRealIdx = partner.merits.indexOf(pm);
      const pContrib = (pm.cp || 0) + (pm.free || 0) + (pm.xp || 0);
      if (pContrib === 0 && pm.shared_with.length === 0) {
        removeMerit(partner, pRealIdx);
      }
    }
  }

  _markDirty();
  _renderSheet(c);
}

/* ══════════════════════════════════════════════════════════
   FIGHTING STYLES
══════════════════════════════════════════════════════════ */

export function shAddStyle(styleName, type = 'style') {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.fighting_styles) c.fighting_styles = [];
  if (c.fighting_styles.some(fs => fs.name === styleName)) return;
  c.fighting_styles.push({ name: styleName, type, cp: 0, free: 0, free_mci: 0, xp: 0 });
  _markDirty();
  _renderSheet(c);
}

export function shRemoveStyle(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.fighting_styles || !c.fighting_styles[idx]) return;
  c.fighting_styles.splice(idx, 1);
  _markDirty();
  _renderSheet(c);
}

export function shEditStyle(idx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const fs = (c.fighting_styles || [])[idx];
  if (!fs) return;
  val = Math.max(0, parseInt(val) || 0);
  if (field === 'cp') {
    const otherCP = (c.merits || []).reduce((s, m) => s + (m.cp || 0), 0)
      + (c.fighting_styles || []).reduce((s, fs2, i2) => s + (i2 === idx ? 0 : (fs2.cp || 0)), 0);
    val = Math.min(val, Math.max(0, 10 - otherCP));
  }
  if (field === 'free_mci') {
    const mciTotal = (c.merits || []).filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false)
      .reduce((s, m) => s + mciPoolTotal(m), 0);
    const otherMCI = (c.merits || []).reduce((s, m) => s + (m.free_mci || 0), 0)
      + (c.fighting_styles || []).reduce((s, fs2, i2) => s + (i2 === idx ? 0 : (fs2.free_mci || 0)), 0);
    val = Math.min(val, Math.max(0, mciTotal - otherMCI));
  }
  if (field === 'free_ots') {
    const otsTotal = c._ots_free_dots || 0;
    const otherOTS = (c.fighting_styles || []).reduce((s, fs2, i2) => s + (i2 === idx ? 0 : (fs2.free_ots || 0)), 0);
    val = Math.min(val, Math.max(0, otsTotal - otherOTS));
  }
  fs[field] = val;
  _markDirty();
  _renderSheet(c);
}

export function shAddPick(manName) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.fighting_picks) c.fighting_picks = [];
  const totalDots = (c.fighting_styles || [])
    .reduce((s, fs) => s + (fs.cp||0) + (fs.free||0) + (fs.free_mci||0) + (fs.free_ots||0) + (fs.xp||0), 0);
  const maxPicks = totalDots;
  if (c.fighting_picks.length >= maxPicks) return;
  const already = c.fighting_picks.some(pk =>
    (typeof pk === 'string' ? pk : pk.manoeuvre).toLowerCase() === manName.toLowerCase()
  );
  if (already) return;
  c.fighting_picks.push({ manoeuvre: manName });
  _markDirty();
  _renderSheet(c);
}

export function shRemovePick(pickIdx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  if (!c.fighting_picks || !c.fighting_picks[pickIdx]) return;
  c.fighting_picks.splice(pickIdx, 1);
  _markDirty();
  _renderSheet(c);
}
