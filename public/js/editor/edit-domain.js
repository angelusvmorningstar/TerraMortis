/* Merit-category edit handlers — split from edit.js to stay under 500 lines */

import state from '../data/state.js';
import { meritByCategory, addMerit, removeMerit } from './merits.js';
import { mciPoolTotal } from './mci.js';
import { getRuleByKey } from '../data/loader.js';
import { DOMAIN_MERIT_TYPES } from '../data/constants.js';
import { pruneContactsSpheres, domKey } from './domain.js';

function ruleKeyFor(name) {
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return getRuleByKey(slug)?.key || null;
}

function stolenMeritCategory(name) {
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug);
  if (rule?.sub_category === 'domain') return 'domain';
  return DOMAIN_MERIT_TYPES.includes(name) ? 'domain' : 'general';
}

/* ── Callback registration (same pattern as edit.js) ── */
let _markDirty, _renderSheet;
export function registerCallbacks(markDirty, renderSheet) {
  _markDirty = markDirty;
  _renderSheet = renderSheet;
}

/* ── Partner dirty tracking — populated by domain sharing edits ── */
const _dirtyPartners = new Set(); // character _id strings
function _markPartnerDirty(ch) { if (ch && ch._id) _dirtyPartners.add(String(ch._id)); }
export function getDirtyPartners() { return new Set(_dirtyPartners); }
export function clearDirtyPartners() { _dirtyPartners.clear(); }

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
  else if (field === 'narrow') m.narrow = val;
  else if (field === 'attached_to') { if (val) m.attached_to = val; else delete m.attached_to; }
  // Issue #39 Task 2: Contacts spheres prune on rating decrease.
  pruneContactsSpheres(m);
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
  if (field === 'name') {
    m.name = val; m.rule_key = ruleKeyFor(val);
    if (val === 'Attach\u00e9') { m.category = 'influence'; m.rating = 1; }
  }
  else if (field === 'qualifier') {
    const prevQualifier = m.qualifier;
    if (val) m.qualifier = val; else delete m.qualifier;
    if (m.name === 'Fucking Thief') {
      if (prevQualifier && prevQualifier !== val) {
        // Category-agnostic removal — handles legacy 'general' and new 'domain' entries
        const oldIdx = (c.merits || []).findIndex(x => x.name === prevQualifier && x.granted_by === 'Fucking Thief');
        if (oldIdx >= 0) removeMerit(c, oldIdx);
      }
      if (val) {
        const newCat = stolenMeritCategory(val);
        const alreadyExists = (c.merits || []).some(x => x.name === val && x.granted_by === 'Fucking Thief');
        if (!alreadyExists) {
          addMerit(c, { category: newCat, name: val, rating: 0, granted_by: 'Fucking Thief' });
        }
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

export function shTogglePT(standIdx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m } = meritByCategory(c, 'standing', standIdx);
  if (!m || m.name !== 'Professional Training') return;
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
  const slug = (name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const rule = getRuleByKey(slug);
  return rule?.sub_category || 'general';
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

/* ══════════════════════════════════════════════════════════
   DOMAIN MERIT EDITING
══════════════════════════════════════════════════════════ */

export function shEditDomMerit(idx, field, val) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { merit: m, realIdx } = meritByCategory(c, 'domain', idx);
  if (!m) return;
  // Clear any prior qualifier error on each edit
  delete c._domQualError;
  if (field === 'name') { m.name = val; m.rule_key = ruleKeyFor(val); delete m.qualifier; delete m.attached_to; }
  else if (field === 'rating') m.rating = Math.max(1, Math.min(5, parseInt(val) || 1));
  else if (field === 'qualifier') {
    if (['Safe Place', 'Feeding Grounds'].includes(m.name)) {
      const dupExists = (c.merits || []).some((other, i2) =>
        i2 !== realIdx &&
        other.category === 'domain' &&
        other.name === m.name &&
        (other.qualifier || '').toLowerCase() === (val || '').toLowerCase()
      );
      if (dupExists) {
        c._domQualError = 'A ' + m.name + ' with this descriptor already exists.';
        _renderSheet(c);
        return;
      }
    }
    if (val) m.qualifier = val; else delete m.qualifier;
  }
  else if (field === 'attached_to') { if (val) m.attached_to = val; else delete m.attached_to; }
  _markDirty();
  _renderSheet(c);
}

export function shRemoveDomMerit(idx) {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  const { realIdx, merit: removed } = meritByCategory(c, 'domain', idx);
  if (realIdx >= 0) {
    // Auto-detach any Haven / Mandragora Garden that reference this Safe Place.
    if (removed && removed.name === 'Safe Place') {
      const key = domKey(removed);
      (c.merits || []).forEach(m2 => {
        if (['Haven', 'Mandragora Garden'].includes(m2.name) && m2.attached_to === key) {
          delete m2.attached_to;
        }
      });
    }
    removeMerit(c, realIdx);
  }
  _markDirty();
  _renderSheet(c);
}

export function shAddDomMerit(name = 'Safe Place') {
  if (state.editIdx < 0) return;
  const c = state.chars[state.editIdx];
  addMerit(c, { category: 'domain', name, rating: 0 });
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
  const meritQualifier = m.qualifier || undefined;
  const meritKey = domKey(m);
  if (!m.shared_with) m.shared_with = [];
  if (m.shared_with.includes(partnerName)) return; // already linked

  // The full new group = current char + existing partners + new partner
  const fullGroup = [c.name, ...(m.shared_with || []), partnerName];

  // Update all existing group members to include new partner (keyed by name + qualifier)
  for (const memberName of [c.name, ...(m.shared_with || [])]) {
    const member = state.chars.find(ch => ch.name === memberName);
    if (!member) continue;
    const mm = (member.merits || []).find(x =>
      x.category === 'domain' && x.name === meritName && (x.qualifier || undefined) === meritQualifier
    );
    if (mm) {
      mm.shared_with = fullGroup.filter(n => n !== memberName);
      if (memberName !== c.name) _markPartnerDirty(member);
    }
  }

  // Ensure the new partner has this domain merit (add at 0 if missing, with same qualifier)
  const partner = state.chars.find(ch => ch.name === partnerName);
  if (partner) {
    let pm = (partner.merits || []).find(x =>
      x.category === 'domain' && x.name === meritName && (x.qualifier || undefined) === meritQualifier
    );
    if (!pm) {
      const newEntry = { category: 'domain', name: meritName, rating: 0, shared_with: fullGroup.filter(n => n !== partnerName) };
      if (meritQualifier) newEntry.qualifier = meritQualifier;
      addMerit(partner, newEntry);
    } else {
      pm.shared_with = fullGroup.filter(n => n !== partnerName);
    }
    _markPartnerDirty(partner);
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
  const meritQualifier = m.qualifier || undefined;

  // Remove partnerName from all remaining group members' shared_with (keyed by name + qualifier)
  const remainingGroup = [c.name, ...(m.shared_with || [])].filter(n => n !== partnerName);
  for (const memberName of remainingGroup) {
    const member = state.chars.find(ch => ch.name === memberName);
    if (!member) continue;
    const mm = (member.merits || []).find(x =>
      x.category === 'domain' && x.name === meritName && (x.qualifier || undefined) === meritQualifier
    );
    if (mm) {
      mm.shared_with = remainingGroup.filter(n => n !== memberName);
      if (memberName !== c.name) _markPartnerDirty(member);
    }
  }

  // On the partner: remove this char from their shared_with
  const partner = state.chars.find(ch => ch.name === partnerName);
  if (partner) {
    const pm = (partner.merits || []).find(x =>
      x.category === 'domain' && x.name === meritName && (x.qualifier || undefined) === meritQualifier
    );
    if (pm) {
      pm.shared_with = (pm.shared_with || []).filter(n => n !== c.name && n !== partnerName);
      // If partner has 0 contribution and no remaining partners, remove the merit
      const pRealIdx = partner.merits.indexOf(pm);
      const pContrib = (pm.cp || 0) + (pm.xp || 0);
      if (pContrib === 0 && pm.shared_with.length === 0) {
        removeMerit(partner, pRealIdx);
      }
    }
    _markPartnerDirty(partner);
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
  c.fighting_styles.push({ name: styleName, type, cp: 0, free_mci: 0, free_ots: 0, xp: 0 });
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
    .reduce((s, fs) => s + (fs.cp||0) + (fs.free_mci||0) + (fs.free_ots||0) + (fs.xp||0), 0);
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
