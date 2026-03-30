/* main.js — App entry point, navigation, dirty state, and window registration */

import state from './data/state.js';
import { ICONS } from './data/icons.js';
import { CLAN_ICON_KEY } from './data/helpers.js';
import { renderList, filterList } from './editor/list.js';
import { renderSheet, toggleExp, toggleDisc } from './editor/sheet.js';
import { loadDB, saveDB, saveAll, syncToSuite, downloadCSV, registerCallbacks as registerExportCallbacks } from './editor/export.js';
import {
  editFromSheet, shEdit, shEditStatus,
  shEditBaneName, shEditBaneEffect, shRemoveBane, shAddBane,
  shToggleOrdeal, shSetPriority, shSetClanAttr, shEditAttrPt,
  shSetSkillPriority, shEditSkillPt,
  shEditSpec, shRemoveSpec, shAddSpec,
  shEditDiscPt, shShowDevSelect, shAddDevotion, shRemoveDevotion,
  shEditInflMerit, shEditStatusMode, shRemoveInflMerit, shAddInflMerit,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill,
  shToggleMCI, shEditMCIGrant,
  shEditMeritPt, shEditXP,
  registerCallbacks as registerEditCallbacks
} from './editor/edit.js';
import { renderIdentityTab, updField, updStatus, registerCallbacks as registerIdentityCallbacks } from './editor/identity.js';
import {
  renderAttrsTab, clickAttrDot, adjAttrBonus,
  clickSkillDot, toggleNineAgain, adjSkillBonus, updSkillSpec,
  registerCallbacks as registerAttrsCallbacks
} from './editor/attrs-tab.js';
import { xpLeft } from './editor/xp.js';

/* ══════════════════════════════════════════════════════════
   DIRTY STATE MANAGEMENT
══════════════════════════════════════════════════════════ */

function markDirty(idx) {
  if (idx === undefined) idx = state.editIdx;
  if (idx < 0) return;
  state.dirty.add(idx);
  updDirtyBadge();
}

function updDirtyBadge() {
  const el = document.getElementById('edit-dirty');
  if (el) el.classList.toggle('on', state.dirty.size > 0);
}

/* ══════════════════════════════════════════════════════════
   VIEW MANAGEMENT
══════════════════════════════════════════════════════════ */

function showView(v) {
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.topbar-btn').forEach(b => b.classList.remove('on'));
  const vEl = document.getElementById('v-' + v);
  const nEl = document.getElementById('nav-' + v);
  if (vEl) vEl.classList.add('active');
  if (nEl) nEl.classList.add('on');
  if (v === 'list') renderList();
}

function showEditTab(t) {
  document.querySelectorAll('.edit-tab').forEach(b => b.classList.remove('on'));
  document.querySelector(`.edit-tab[data-tab="${t}"]`).classList.add('on');
  document.querySelectorAll('.etab').forEach(el => el.classList.remove('active'));
  document.getElementById('et-' + t).classList.add('active');
}

/* ══════════════════════════════════════════════════════════
   OPEN CHARACTER (list -> sheet transition)
══════════════════════════════════════════════════════════ */

function openChar(idx) {
  state.editIdx = idx;
  const c = state.chars[idx];
  // Update edit header
  document.getElementById('edit-charname').textContent = c.name || 'Unnamed';
  const hdrIcon = document.getElementById('edit-clan-icon');
  const ck = CLAN_ICON_KEY[c.clan];
  if (ck && hdrIcon) { hdrIcon.src = ICONS[ck]; hdrIcon.style.display = 'inline'; }
  else if (hdrIcon) { hdrIcon.style.display = 'none'; }
  renderIdentityTab(c);
  renderAttrsTab(c);
  // Show sheet view
  renderSheet(c);
  showView('sheet');
}

/* ══════════════════════════════════════════════════════════
   REGISTER CALLBACKS (break circular dependencies)
══════════════════════════════════════════════════════════ */

registerEditCallbacks(markDirty, renderSheet);
registerExportCallbacks(renderList, updDirtyBadge);
registerIdentityCallbacks(markDirty, xpLeft);
registerAttrsCallbacks(markDirty);

/* ══════════════════════════════════════════════════════════
   WINDOW REGISTRATION (for onclick HTML attributes)
══════════════════════════════════════════════════════════ */

Object.assign(window, {
  // Navigation (from static HTML)
  showView,
  showEditTab,
  openChar,
  filterList,

  // Persistence (from static HTML)
  syncToSuite,
  saveAll,
  downloadCSV,

  // Sheet view
  editFromSheet,
  toggleExp,
  toggleDisc,
  renderSheet,

  // Sheet edit handlers
  shEdit,
  shEditStatus,
  shEditBaneName,
  shEditBaneEffect,
  shRemoveBane,
  shAddBane,
  shToggleOrdeal,
  shSetPriority,
  shSetClanAttr,
  shEditAttrPt,
  shSetSkillPriority,
  shEditSkillPt,
  shEditSpec,
  shRemoveSpec,
  shAddSpec,
  shEditDiscPt,
  shShowDevSelect,
  shAddDevotion,
  shRemoveDevotion,
  shEditInflMerit,
  shEditStatusMode,
  shRemoveInflMerit,
  shAddInflMerit,
  shEditDomMerit,
  shRemoveDomMerit,
  shAddDomMerit,
  shAddDomainPartner,
  shRemoveDomainPartner,
  shEditGenMerit,
  shRemoveGenMerit,
  shAddGenMerit,
  shEditStandMerit,
  shEditStandAssetSkill,
  shToggleMCI,
  shEditMCIGrant,
  shEditMeritPt,
  shEditXP,

  // Attributes & Skills tab
  clickAttrDot,
  adjAttrBonus,
  clickSkillDot,
  toggleNineAgain,
  adjSkillBonus,
  updSkillSpec,

  // Identity tab
  updField,
  updStatus,

  // Dirty state (used by some modules)
  markDirty
});

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */

loadDB();
document.getElementById('topbar-logo').src = ICONS.TM_logo;
renderList();
