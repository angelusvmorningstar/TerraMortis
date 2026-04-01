/**
 * app.js — Unified entry point for the merged SPA.
 *
 * Replaces both js/main.js (editor) and js/suite/main.js (suite),
 * providing a single init, unified tab navigation, and merged
 * window registration for all inline onclick/onchange handlers.
 */

// ══════════════════════════════════════════════
//  EDITOR IMPORTS
// ══════════════════════════════════════════════

import editorState from './data/state.js';
import { ICONS } from './data/icons.js';
import { CLAN_ICON_KEY, displayName, sortName } from './data/helpers.js';
import { renderList, filterList } from './editor/list.js';
import { renderSheet as editorRenderSheet, toggleExp as editorToggleExp, toggleDisc as editorToggleDisc } from './editor/sheet.js';
import { loadDB, saveDB, saveAll, syncToSuite, downloadCSV, registerCallbacks as registerExportCallbacks } from './editor/export.js';
import {
  editFromSheet, shEdit, shEditStatus,
  shEditBaneName, shEditBaneEffect, shRemoveBane, shAddBane,
  shEditTouchstone, shAddTouchstone, shRemoveTouchstone,
  shEditBP, shEditHumanity,
  shStatusUp, shStatusDown,
  shToggleOrdeal, shSetPriority, shSetClanAttr, shEditAttrPt,
  shSetSkillPriority, shEditSkillPt,
  shEditSpec, shRemoveSpec, shAddSpec,
  shEditDiscPt, shShowDevSelect, shAddDevotion, shRemoveDevotion,
  shEditInflMerit, shEditStatusMode, shRemoveInflMerit, shAddInflMerit,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill,
  shToggleMCI, shEditMCIGrant, shAddStandMCI, shAddStandPT,
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
import { printSheet } from './editor/print.js';

// ══════════════════════════════════════════════
//  SUITE IMPORTS
// ══════════════════════════════════════════════

import suiteState, { CHARS_DATA, DISC } from './suite/data.js';
import { mountTerr } from './suite/territory.js';
import {
  handleImport as _handleImport,
  handleDtImport as _handleDtImport,
  setImportCallbacks,
} from './suite/import.js';
import { loadCharsFromApi } from './data/loader.js';
import { loadPool, chgPool, chgMod, updPool, setAgain, togMod, doRoll, clrHist, effPool } from './suite/roll.js';
import { onSheetChar, renderSheet as suiteRenderSheet } from './suite/sheet.js';
import { toggleExp as suiteToggleExp, toggleDisc as suiteToggleDisc } from './suite/sheet-helpers.js';
import { updResist, showResistSec } from './shared/resist.js';
import { getPool } from './shared/pools.js';
import {
  renderStOverview as _renderStOverview, stPickChar, stResetAll, stApplyDowntime,
  stDismiss, toast as _toast, togglePrestige, stLogDt
} from './suite/tracker.js';
import { feedToggle, feedBuildPool, feedRoll, feedReset, feedAdjApply, feedApplyVitae, feedSelectMethod } from './suite/tracker-feed.js';

// ══════════════════════════════════════════════
//  FORWARD WRAPPERS (suite)
// ══════════════════════════════════════════════

function renderStOverview() { _renderStOverview(); }
function toast(msg) { _toast(msg); }

// ══════════════════════════════════════════════
//  DIRTY STATE MANAGEMENT (editor)
// ══════════════════════════════════════════════

function markDirty(idx) {
  if (idx === undefined) idx = editorState.editIdx;
  if (idx < 0) return;
  editorState.dirty.add(idx);
  updDirtyBadge();
}

function updDirtyBadge() {
  const el = document.getElementById('edit-dirty');
  if (el) el.classList.toggle('on', editorState.dirty.size > 0);
}

// ══════════════════════════════════════════════
//  EDITOR VIEW HELPERS
// ══════════════════════════════════════════════

function showEditTab(t) {
  document.querySelectorAll('.edit-tab').forEach(b => b.classList.remove('on'));
  const tabBtn = document.querySelector(`.edit-tab[data-tab="${t}"]`);
  if (tabBtn) tabBtn.classList.add('on');
  document.querySelectorAll('.etab').forEach(el => el.classList.remove('active'));
  const tabEl = document.getElementById('et-' + t);
  if (tabEl) tabEl.classList.add('active');
}

function openChar(idx) {
  editorState.editIdx = idx;
  const c = editorState.chars[idx];
  // Update edit header
  const nameEl = document.getElementById('edit-charname');
  if (nameEl) nameEl.textContent = displayName(c) || 'Unnamed';
  const hdrIcon = document.getElementById('edit-clan-icon');
  const ck = CLAN_ICON_KEY[c.clan];
  if (ck && hdrIcon) { hdrIcon.src = ICONS[ck]; hdrIcon.style.display = 'inline'; }
  else if (hdrIcon) { hdrIcon.style.display = 'none'; }
  renderIdentityTab(c);
  renderAttrsTab(c);
  editorRenderSheet(c);
  goTab('editor');
}

// ══════════════════════════════════════════════
//  UNIFIED TAB NAVIGATION
// ══════════════════════════════════════════════

const TAB_SUBTITLES = {
  chars: 'Characters',
  editor: 'Character Sheet',
  edit: 'Edit Character',
  roll: 'Roll',
  sheets: 'Sheets',
  st: 'Tracker',
  territory: 'Territory',
};

const EDITOR_TABS = new Set(['chars', 'editor', 'edit']);

function goTab(t) {
  // Hide all tabs
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nbtn').forEach(el => el.classList.remove('on'));

  // Show target tab
  const tabEl = document.getElementById('t-' + t);
  if (tabEl) tabEl.classList.add('active');
  const navEl = document.getElementById('n-' + t);
  if (navEl) navEl.classList.add('on');

  // Update header subtitle
  const subEl = document.getElementById('header-subtitle');
  if (subEl && TAB_SUBTITLES[t]) subEl.textContent = TAB_SUBTITLES[t];

  // Show/hide Save button (only relevant on editor tabs)
  const saveRow = document.getElementById('topbar-right');
  if (saveRow) saveRow.style.display = EDITOR_TABS.has(t) ? '' : 'none';

  // Tab-specific init
  if (t === 'territory') mountTerr();
  if (t === 'st') renderStOverview();
  if (t === 'chars') renderList();
}

// ══════════════════════════════════════════════
//  UNIFIED DATA LOADING
// ══════════════════════════════════════════════

function populateSuiteDropdowns(chars) {
  const sel = document.getElementById('char-sel');
  if (sel) {
    sel.innerHTML = '<option value="">\u2014 Select character \u2014</option>';
    chars.forEach(c => {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = displayName(c);
      sel.appendChild(o);
    });
  }
  const ssel = document.getElementById('st-char-sel');
  if (ssel) {
    ssel.innerHTML = '<option value="">\u2014 Select character \u2014</option>';
    chars.forEach(c => {
      const o = document.createElement('option');
      o.value = c.name;
      o.textContent = displayName(c);
      ssel.appendChild(o);
    });
  }
}

async function loadAllData() {
  // 1. Try API first (cache-first mode: fetches from API, caches to localStorage, falls back)
  const apiChars = await loadCharsFromApi();
  if (apiChars) {
    editorState.chars = apiChars;
  } else {
    // API unreachable and no cached data — fall back to localStorage/embedded
    loadDB();
  }

  // 2. Copy to suite state
  const sortedChars = editorState.chars.slice().sort((a, b) => sortName(a).localeCompare(sortName(b)));
  suiteState.chars = sortedChars;
  window._charNames = sortedChars.map(c => c.name);
  window._charDisplayMap = Object.fromEntries(sortedChars.map(c => [c.name, displayName(c)]));

  // 3. Populate suite dropdowns
  populateSuiteDropdowns(sortedChars);
}

/**
 * loadChars() — suite-compatible reload.
 * Called after import or clearImport to refresh suite data.
 */
function loadChars() {
  let data = CHARS_DATA;
  try {
    const v2Stored = localStorage.getItem('tm_chars_db');
    if (v2Stored) {
      const parsed = JSON.parse(v2Stored);
      if (parsed && parsed.v === 2 && Array.isArray(parsed.chars) && parsed.chars.length) {
        data = parsed.chars;
      }
    } else {
      const stored = localStorage.getItem('tm_import_chars');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length) data = parsed;
      }
    }
  } catch (e) { /* ignore */ }
  const chars = data.slice().sort((a, b) => sortName(a).localeCompare(sortName(b)));
  suiteState.chars = chars;
  window._charNames = chars.map(c => c.name);
  window._charDisplayMap = Object.fromEntries(chars.map(c => [c.name, displayName(c)]));
  populateSuiteDropdowns(chars);
  renderImportBanner();
}

// ══════════════════════════════════════════════
//  IMPORT BANNER (suite)
// ══════════════════════════════════════════════

function renderImportBanner() {
  const el = document.getElementById('import-banner');
  if (!el) return;
  try {
    const meta = localStorage.getItem('tm_import_meta');
    if (meta) {
      const m = JSON.parse(meta);
      el.style.display = '';
      el.innerHTML = `<div class="import-banner"><span>Data imported from <b>${m.filename}</b> &mdash; ${m.count} characters &mdash; ${m.date}</span><button class="import-banner-clr" onclick="clearImport()" title="Clear import">\u00d7</button></div>`;
      return;
    }
  } catch (e) { /* ignore */ }
  el.style.display = 'none';
  el.innerHTML = '';
}

function clearImport() {
  localStorage.removeItem('tm_import_chars');
  localStorage.removeItem('tm_import_meta');
  loadChars();
  renderStOverview();
  toast('Import cleared \u2014 using built-in data');
}

// ══════════════════════════════════════════════
//  PICKER PANEL (suite)
// ══════════════════════════════════════════════

function openPanel(mode) {
  suiteState.panelMode = mode;
  const body = document.getElementById('panel-body');
  const title = document.getElementById('panel-title');
  body.innerHTML = '';

  if (mode === 'char') {
    title.textContent = 'Select Character';
    suiteState.chars.forEach(c => {
      const el = document.createElement('div');
      el.className = 'panel-item';
      el.innerHTML = `<div><div class="pi-main">${displayName(c)}</div><div class="pi-sub">${c.clan || ''} \u00B7 ${c.covenant || ''}</div></div><div class="pi-badge">${c.player || ''}</div>`;
      el.addEventListener('click', () => { pickChar(c); closePanel(); });
      body.appendChild(el);
    });
  } else if (mode === 'disc') {
    title.textContent = 'Select Discipline';
    if (!suiteState.rollChar) {
      body.innerHTML = '<div class="hempty" style="padding:24px 16px;">Select a character first</div>';
    } else {
      const powers = suiteState.rollChar.powers || [];
      const groups = {};
      const SORCERY_THEMES = ['Creation', 'Destruction', 'Divination', 'Protection', 'Transmutation'];
      powers.forEach(p => {
        const lookupKey = p.name || '';
        const pi = getPool(suiteState.rollChar, lookupKey);
        let disc = p.discipline || p.category || 'Other';
        if (SORCERY_THEMES.includes(disc)) disc = disc + ' (Sorcery)';
        if (!groups[disc]) groups[disc] = [];
        const dispName = p.name || '';
        groups[disc].push({ raw: lookupKey, disp: dispName, pi });
      });

      Object.entries(groups).forEach(([disc, items]) => {
        const sec = document.createElement('div');
        sec.className = 'panel-section';
        sec.textContent = disc;
        body.appendChild(sec);
        items.forEach(({ raw, disp, pi }) => {
          const el = document.createElement('div');
          el.className = 'panel-item';
          const hasRoll = pi && !pi.noRoll && pi.total !== undefined;
          let poolEl = '<div class="pi-pool nr">\u2014</div>';
          if (hasRoll) poolEl = '<div class="pi-pool">' + pi.total + '</div>';
          let subStr = '';
          if (hasRoll) subStr = pi.attr + ' + ' + pi.skill + (pi.resistance ? ' \u00B7 vs ' + pi.resistance : '');
          else if (pi && pi.noRoll && pi.info && pi.info.c) subStr = 'Cost: ' + pi.info.c;
          else if (pi && pi.info && pi.info.c) subStr = 'Cost: ' + pi.info.c;
          el.innerHTML = '<div><div class="pi-main">' + disp + '</div>' + (subStr ? '<div class="pi-sub">' + subStr + '</div>' : '') + '</div>' + poolEl;
          el.addEventListener('click', () => {
            if (hasRoll) { loadPool(pi.total, disp, pi); }
            else { toast(disp + ' \u2014 no roll'); closePanel(); }
          });
          body.appendChild(el);
        });
      });
    }
  }

  document.getElementById('panel-overlay').classList.add('on');
  requestAnimationFrame(() => requestAnimationFrame(() =>
    document.getElementById('panel').style.transform = 'translateY(0)'
  ));
}

function closePanel() {
  const overlay = document.getElementById('panel-overlay');
  if (overlay) overlay.classList.remove('on');
  suiteState.panelMode = null;
}

function overlayClick(e) {
  if (e.target === document.getElementById('panel-overlay')) closePanel();
}

function pickChar(c) {
  suiteState.rollChar = c;
  const valEl = document.getElementById('sc-char-val');
  const lblEl = document.getElementById('sc-char-lbl');
  if (lblEl) lblEl.textContent = '';
  if (valEl) valEl.textContent = (c.moniker || c.name).split(' ')[0];
  const scChar = document.getElementById('sc-char');
  if (scChar) scChar.classList.add('loaded');
  const discLbl = document.getElementById('sc-disc-lbl');
  if (discLbl) discLbl.textContent = 'Discipline';
  const discVal = document.getElementById('sc-disc-val');
  if (discVal) discVal.textContent = '';
  const scDisc = document.getElementById('sc-disc');
  if (scDisc) scDisc.classList.remove('loaded');
  const poolBanner = document.getElementById('pool-banner');
  if (poolBanner) poolBanner.classList.remove('on');
  suiteState.POOL_INFO = null;
  suiteState.RESIST_CHAR = null;
  suiteState.RESIST_VAL = 0;
  suiteState.RESIST_MODE = null;
  const sec = document.getElementById('resist-sec');
  if (sec) sec.style.display = 'none';
}

// ══════════════════════════════════════════════
//  REGISTER CALLBACKS (editor — break circular deps)
// ══════════════════════════════════════════════

registerEditCallbacks(markDirty, editorRenderSheet);
registerExportCallbacks(renderList, updDirtyBadge);
registerIdentityCallbacks(markDirty, xpLeft);
registerAttrsCallbacks(markDirty);

// Wire up suite import callbacks
setImportCallbacks({
  loadChars,
  renderStOverview,
  toast,
});

// ══════════════════════════════════════════════
//  WINDOW REGISTRATION (merged)
// ══════════════════════════════════════════════

Object.assign(window, {
  // Unified navigation
  goTab,
  showEditTab,
  openChar,
  filterList,

  // Editor persistence
  syncToSuite,
  saveAll,
  downloadCSV,

  // Editor sheet view (prefixed where needed)
  editFromSheet,
  printSheet,
  renderSheet: editorRenderSheet,
  toggleExp: editorToggleExp,
  toggleDisc: editorToggleDisc,

  // Editor edit handlers
  shEdit,
  shEditStatus,
  shEditBaneName,
  shEditBaneEffect,
  shRemoveBane,
  shAddBane,
  shEditTouchstone,
  shAddTouchstone,
  shRemoveTouchstone,
  shEditBP,
  shEditHumanity,
  shStatusUp,
  shStatusDown,
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
  shEditMCIGrant, shAddStandMCI, shAddStandPT,
  shEditMeritPt,
  shEditXP,

  // Editor attributes & skills tab
  clickAttrDot,
  adjAttrBonus,
  clickSkillDot,
  toggleNineAgain,
  adjSkillBonus,
  updSkillSpec,

  // Editor identity tab
  updField,
  updStatus,

  // Editor dirty state
  markDirty,

  // Suite navigation & panels
  openPanel,
  closePanel,
  overlayClick,
  pickChar,

  // Suite data
  loadChars,
  renderImportBanner,
  clearImport,

  // Suite roll tab
  chgPool,
  chgMod,
  updPool,
  setAgain,
  togMod,
  doRoll,
  clrHist,
  loadPool,
  effPool,

  // Suite sheet tab
  onSheetChar,
  suiteRenderSheet,
  suiteToggleExp,
  suiteToggleDisc,

  // Suite resistance
  updResist,
  showResistSec,

  // Suite tracker tab
  renderStOverview,
  stPickChar,
  stResetAll,
  stApplyDowntime,
  stDismiss,
  toast,
  togglePrestige,
  stLogDt,

  // Suite feeding
  feedToggle,
  feedBuildPool,
  feedRoll,
  feedReset,
  feedAdjApply,
  feedApplyVitae,
  feedSelectMethod,

  // Suite import
  handleImport: _handleImport,
  handleDtImport: _handleDtImport,

  // Suite territory
  mountTerr,
  _mountTerr: mountTerr,
});

// ══════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════

loadAllData().then(() => {
  renderList();
  renderImportBanner();
});
const logo = document.getElementById('topbar-logo');
if (logo) logo.src = ICONS.TM_logo;
