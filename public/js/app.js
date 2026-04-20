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
import { CLAN_ICON_KEY, covIcon, displayName, sortName, redactPlayer, discordAvatarUrl, esc } from './data/helpers.js';
import { renderList, filterList, setListLimit } from './editor/list.js';
import { renderSheet as editorRenderSheet, toggleExp as editorToggleExp, toggleDisc as editorToggleDisc } from './editor/sheet.js';
import { loadDB, saveDB, saveAll, syncToSuite, downloadCSV, registerCallbacks as registerExportCallbacks } from './editor/export.js';
import {
  editFromSheet, shEdit, shEditStatus,
  shEditBaneName, shEditBaneEffect, shRemoveBane, shAddBane,
  shEditTouchstone, shAddTouchstone, shRemoveTouchstone,
  shEditBP, shEditBPCreation, shEditBPXP, shEditBPLost, shEditHumanity, shEditHumanityXP, shEditHumanityLost,
  shStatusUp, shStatusDown,
  shToggleOrdeal, shSetPriority, shSetClanAttr, shEditAttrPt,
  shSetSkillPriority, shEditSkillPt,
  shEditSpec, shRemoveSpec, shAddSpec,
  shEditDiscPt, shShowDevSelect, shAddDevotion, shRemoveDevotion,
  shEditInflMerit, shEditStatusMode, shEditContactSphere, shRemoveInflMerit, shAddInflMerit,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill,
  shToggleMCI, shTogglePT, shEditMCIDot, shRemoveStandMerit, shAddStandMCI, shAddStandPT,
  shEditMeritPt, shStepMeritRating, shEditXP, shAdjAttrBonus,
  shAddEquip, shEditEquip, shRemoveEquip,
  registerCallbacks as registerEditCallbacks
} from './editor/edit.js';
import { renderIdentityTab, updField, updStatus, registerCallbacks as registerIdentityCallbacks } from './editor/identity.js';
import {
  renderAttrsTab, clickAttrDot, adjAttrBonus,
  clickSkillDot, toggleNineAgain, adjSkillBonus, updSkillSpec,
  registerCallbacks as registerAttrsCallbacks
} from './editor/attrs-tab.js';
import { xpLeft } from './editor/xp.js';
import { renderCharPools } from './game/char-pools.js';
import { openContestedRoll, closeContestedRoll, crSetType, crSetChar, crAdjPool, crRoll } from './game/contested-roll.js';
import { loadDtLookup } from './game/dt-lookup.js';
import { initTracker, trackerReset, trackerAdj, trackerAddCondition, trackerRemoveCond, trackerToggle } from './game/tracker.js';
import { initSignIn } from './game/signin-tab.js';
import { renderEmergencyTab } from './game/emergency-tab.js';
import { initCombatTab } from './game/combat-tab.js';
import { initRules, openRulesOverlay, closeRulesOverlay } from './game/rules.js';
// Player portal tabs — migrated to More grid (nav-2-3 + nav-2-4)
import { initDowntimeTab } from './player/downtime-tab.js';
import { renderStatusTab } from './player/status-tab.js';
import { renderPrimerTab } from './player/primer-tab.js';
import { renderTicketsTab } from './player/tickets-tab.js';
import { initOrdeals } from './player/ordeals-view.js';
import { renderRegencyTab } from './player/regency-tab.js';
import { renderOfficeTab } from './player/office-tab.js';
import { renderCityTab } from './player/city-tab.js';
import { initArchiveTab } from './player/archive-tab.js';
import { renderFeedingTab } from './player/feeding-tab.js';
import { findRegentTerritory } from './data/helpers.js';
import { printSheet, printPDF, exportJSON } from './editor/print.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser, getRole, getPlayerInfo } from './auth/discord.js';

// ══════════════════════════════════════════════
//  SUITE IMPORTS
// ══════════════════════════════════════════════

import suiteState, { CHARS_DATA } from './suite/data.js';
import { mountTerr } from './suite/territory.js';
import {
  handleImport as _handleImport,
  handleDtImport as _handleDtImport,
  setImportCallbacks,
} from './suite/import.js';
import { loadCharsFromApi, sanitiseChar, loadRulesFromApi, getRulesByCategory } from './data/loader.js';
import { apiGet, apiPost } from './data/api.js';
import { loadGameXP } from './data/game-xp.js';
import { applyDerivedMerits } from './editor/mci.js';
import { loadPool, chgPool, chgMod, updPool, setAgain, togMod, togSpec, doRoll, clrHist, effPool } from './suite/roll.js';
import { onSheetChar, renderSheet as suiteRenderSheet } from './suite/sheet.js';
import { toggleExp as suiteToggleExp, toggleDisc as suiteToggleDisc } from './suite/sheet-helpers.js';
import { updResist, showResistSec } from './shared/resist.js';
import { getPool } from './shared/pools.js';
import { getAttrEffective as getAttrVal, skDots } from './data/accessors.js';
import { SKILLS_MENTAL } from './data/constants.js';
import { AUSPEX_QUESTIONS } from './data/auspex-insight.js';
import { toast as _toast } from './suite/tracker.js';
// suite/tracker-feed.js removed — feeding consolidated to More grid (nav-2-5)
import { renderSuiteStatusTab, suiteStatusOpenEdit, suiteStatusCloseEdit, suiteStatusAdjustCity } from './suite/status.js';

// ══════════════════════════════════════════════
//  FORWARD WRAPPERS (suite)
// ══════════════════════════════════════════════

function toast(msg) { _toast(msg); }

// ══════════════════════════════════════════════
//  VIEW MODE (ST player-view toggle)
// ══════════════════════════════════════════════

const VIEW_MODE_KEY = 'tm_view_mode';
let _viewMode = localStorage.getItem(VIEW_MODE_KEY) || 'st';

function effectiveRole() {
  return (getRole() === 'st' && _viewMode === 'player') ? 'player' : getRole();
}

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

function setSheetView(view) {
  const gcpEl  = document.getElementById('gcp-panel');
  const shEl   = document.getElementById('sh-content');
  const dtEl   = document.getElementById('dt-lookup');
  const printBtn = document.getElementById('btn-print');
  const isSheet = view === 'sheet';

  if (gcpEl)  gcpEl.style.display  = isSheet ? '' : 'none';
  if (shEl)   shEl.style.display   = isSheet ? '' : 'none';
  if (dtEl)   dtEl.style.display   = isSheet ? 'none' : '';
  if (printBtn) printBtn.style.display = isSheet ? '' : 'none';

  document.getElementById('svt-sheet')?.classList.toggle('on', isSheet);
  document.getElementById('svt-dt')?.classList.toggle('on', !isSheet);

  if (!isSheet && editorState.editIdx >= 0) {
    loadDtLookup(dtEl, editorState.chars[editorState.editIdx]);
  }
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
  editorRenderSheet(c);         // keep — editor/attrs tabs still use this
  suiteState.sheetChar = c;
  document.getElementById('sh-empty').style.display = 'none';
  document.getElementById('sh-content-suite').style.display = '';
  suiteRenderSheet();           // suite single-column sheet for the Sheets tab

  // Render pools panel — sets rollChar so Roll tab banner shows this character
  const poolsEl = document.getElementById('gcp-panel');
  if (poolsEl) {
    suiteState.rollChar = c;
    renderCharPools(poolsEl, c, (p) => {
      loadPool(p.total, p.label, p.pi || { total: p.total, attr: p.attr, attrV: p.attrV, skill: p.skill, skillV: p.skillV, nineAgain: p.nineAgain, resistance: p.resistance });
      goTab('dice');
    });
  }

  setSheetView('sheet');
  goTab('sheets');
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
  territory: 'Territory',
  tracker: 'Live Tracker',
  rules: 'Rules Reference',
  // Unified nav tab names
  dice: 'Dice',
  sheet: 'Sheet',
  stats: 'Stats',
  skills: 'Skills',
  powers: 'Powers',
  info: 'Misc',
  status: 'Status',
  territory: 'Territory',
  more: 'More',
  settings: 'Settings',
};

const EDITOR_TABS = new Set(['chars', 'editor', 'edit']);

// Maps internal tab names to the visible unified nav button ID.
// When a legacy tab name is activated, the correct new nav button is highlighted.
// Maps internal tab names to the visible unified nav button ID.
// Legacy tabs and More grid apps all resolve to the correct primary nav button.
const NAV_ALIAS = {
  // Editor sub-views highlight the Stats nav button (primary sheet view)
  chars: 'stats', editor: 'stats', edit: 'stats', sheets: 'stats', sheet: 'stats',
  roll: 'dice',
  // More grid still exists for desktop sidebar — alias for goTab compatibility
  more: 'more',
};

// ── Scrollable bottom nav ───────────────────────────────────────────────────
// Ordered list of all nav items. Role/condition gating mirrors MORE_APPS.
// Icons are inlined (not referencing _svg) to avoid declaration-order issues.
const NAV_ITEMS = [
  // Sheet split into Stats / Skills / Powers for phone UX
  { id: 'stats',     label: 'Stats',     icon: '<svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>', goTab: 'stats' },
  { id: 'skills',    label: 'Skills',    icon: '<svg viewBox="0 0 24 24"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>', goTab: 'skills' },
  { id: 'powers',    label: 'Powers',    icon: '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>', goTab: 'powers' },
  { id: 'status',    label: 'Status',    icon: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>', goTab: 'status' },
  { id: 'misc',      label: 'Misc',      icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>', goTab: 'info' },
  { id: 'whos-who',  label: "Who's Who", icon: '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>', goTab: 'whos-who' },
  { id: 'feeding',   label: 'Feeding',   icon: '<svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>', goTab: 'feeding' },
  { id: 'downtime',  label: 'Downtime',  icon: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>', goTab: 'downtime' },
  { id: 'map',       label: 'Map',       icon: '<svg viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>', goTab: 'map' },
  { id: 'ordeals',   label: 'Ordeals',   icon: '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>', goTab: 'ordeals' },
  { id: 'primer',    label: 'Primer',    icon: '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>', goTab: 'primer', guide: true },
  { id: 'game-guide',label: 'Guide',     icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', goTab: 'game-guide', disabled: true, guide: true },
  { id: 'rules',     label: 'Rules',     icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><path d="M13 8h4M13 12h4M13 16h4"/></svg>', goTab: 'rules', guide: true },
  // ST only
  { id: 'territory', label: 'Territory', icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>', goTab: 'territory', stOnly: true },
  { id: 'tracker',   label: 'Tracker',   icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', goTab: 'tracker', stOnly: true },
  { id: 'combat',    label: 'Combat',    icon: '<svg viewBox="0 0 24 24"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M3 14l7-7"/></svg>', goTab: 'combat', stOnly: true },
  { id: 'signin',    label: 'Sign-In',   icon: '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>', goTab: 'signin', stOnly: true },
  { id: 'emergency', label: 'Emergency', icon: '<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.89 12 19.79 19.79 0 0 1 1.84 3.4 2 2 0 0 1 3.81 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>', goTab: 'emergency', stOnly: true },
  // Conditional
  { id: 'regency',   label: 'Regency',   icon: '<svg viewBox="0 0 24 24"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="2" y1="20" x2="22" y2="20"/></svg>', goTab: 'regency', condition: 'hasRegency' },
  { id: 'office',    label: 'Office',    icon: '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>', goTab: 'office', condition: 'hasOffice' },
  // Settings (always last)
  { id: 'settings',  label: 'Settings',  icon: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>', goTab: 'settings' },
];

function renderBottomNav() {
  const el = document.getElementById('bnav');
  if (!el) return;
  const role = effectiveRole();
  const isST = role === 'st';

  const showGuides = localStorage.getItem('tm-show-guides') === '1';
  let h = '';
  for (const item of NAV_ITEMS) {
    if (item.stOnly && !isST) continue;
    if (item.condition && !_moreGridCondition(item)) continue;
    if (item.guide && !showGuides) continue;
    const dis = item.disabled ? ' nbtn-disabled' : '';
    const click = item.disabled ? '' : ` onclick="goTab('${item.goTab}')"`;
    h += `<button class="nbtn${dis}" id="n-${item.id}"${click}>${item.icon}<span>${item.label}</span></button>`;
  }
  el.innerHTML = h;

  // Highlight the currently active tab
  const active = document.querySelector('.tab.active');
  if (active) {
    const tabId = active.id.replace('t-', '');
    const navId = 'n-' + (NAV_ALIAS[tabId] || tabId);
    const navEl = document.getElementById(navId);
    if (navEl) navEl.classList.add('on');
  }
}

function goTab(t) {
  // Hide all tabs
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nbtn').forEach(el => el.classList.remove('on'));

  // Show target tab
  const tabEl = document.getElementById('t-' + t);
  if (tabEl) tabEl.classList.add('active');
  // Mark the nav button — use alias if the tab maps to a unified nav button
  const navId = 'n-' + (NAV_ALIAS[t] || t);
  const navEl = document.getElementById(navId);
  if (navEl) {
    navEl.classList.add('on');
    // Scroll the active button into view in the swipeable nav strip
    navEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  // Update header subtitle
  const subEl = document.getElementById('hdr-sub');
  if (subEl && TAB_SUBTITLES[t]) subEl.textContent = TAB_SUBTITLES[t];

  // Show/hide Save button (only relevant on editor tabs)
  const saveRow = document.getElementById('topbar-right');
  if (saveRow) saveRow.style.display = EDITOR_TABS.has(t) ? '' : 'none';

  // Tab-specific init
  if (t === 'territory') mountTerr();
  if (t === 'tracker') initTracker(document.getElementById('t-tracker'));
  if (t === 'rules') initRules(document.getElementById('t-rules'));
  if (t === 'status') renderSuiteStatusTab(document.getElementById('t-status'));
  if (t === 'signin') initSignIn(document.getElementById('t-signin'), suiteState.chars);

  // ── Unified nav tab init ──────────────────────────────────────────────────
  if (document.body.classList.contains('desktop-mode')) renderDesktopSidebar();
  if (t === 'dice') { _clearLifecycleCache(); renderLifecycleCards(); }
  if (t === 'more') renderMoreGrid();
  if (t === 'settings') renderSettingsTab();

  // ── More grid apps — player portal tabs (nav-2-3) ────────────────────────
  if (t === 'map') {
    const el = document.getElementById('t-map');
    if (el && !el.innerHTML.trim()) {
      const terrs = (suiteState.territories || []).filter(t => t.regent_id);
      const chars = suiteState.chars || [];
      let regHtml = '';
      if (terrs.length) {
        regHtml = '<div class="map-regent-panel"><div class="map-regent-title">Regents</div><div class="map-regent-list">';
        for (const tr of terrs.sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))) {
          const c = chars.find(ch => String(ch._id) === tr.regent_id);
          const name = c ? (c.moniker || c.name) : '(vacant)';
          regHtml += `<div class="map-regent-row"><span class="map-regent-terr">${tr.name || tr.id}</span><span class="map-regent-name">${name}</span></div>`;
        }
        regHtml += '</div></div>';
      }
      el.innerHTML = `<div class="map-tab-wrap"><div class="map-img-wrap"><img class="city-map" src="/assets/Terra Mortis Map.png" alt="Terra Mortis City Map"></div>${regHtml}</div>`;
    }
  }
  if (t === 'feeding') {
    const el = document.getElementById('t-feeding');
    const char = _activeMoreChar();
    if (el && char) renderFeedingTab(el, char);
    checkMoreBadge(); // re-check after visiting feeding (may have just rolled)
  }
  if (t === 'regency') {
    const el = document.getElementById('t-regency');
    const char = _activeMoreChar();
    const terrs = suiteState.territories || [];
    if (el && char) renderRegencyTab(el, char, terrs);
  }
  if (t === 'whos-who') {
    const el = document.getElementById('t-whos-who');
    if (el && !el.innerHTML.trim()) renderCityTab(el);
  }
  if (t === 'office') {
    const el = document.getElementById('t-office');
    const char = _activeMoreChar();
    if (el && char) renderOfficeTab(el, char);
  }
  if (t === 'archive') {
    const el = document.getElementById('t-archive');
    const char = _activeMoreChar();
    if (el && char) initArchiveTab(el, char, (suiteState.chars || []).filter(c => c.retired));
  }
  if (t === 'downtime') {
    const el = document.getElementById('t-downtime');
    const char = _activeMoreChar();
    if (el && char) initDowntimeTab(el, char, suiteState.territories || []);
    _markSubViewed();
  }
  if (t === 'status') {
    // Status tab is also the primary nav #3 — handled above; this covers More grid access
  }
  if (t === 'primer') {
    const el = document.getElementById('t-primer');
    if (el) renderPrimerTab(el);
  }
  if (t === 'game-guide') {
    const el = document.getElementById('t-game-guide');
    if (el && !el.innerHTML.trim()) {
      el.innerHTML = '<div style="padding:32px 20px;max-width:480px;margin:0 auto"><p class="sh-sec-title">Game Guide</p><p style="font-family:var(--ft);font-size:14px;color:var(--txt2);line-height:1.7;margin-top:12px">Content coming soon. Ask your Storyteller.</p></div>';
    }
  }
  if (t === 'ordeals') {
    const el = document.getElementById('t-ordeals');
    const char = _activeMoreChar();
    if (el && char) initOrdeals(char, suiteState.chars, el);
  }
  if (t === 'emergency') {
    const el = document.getElementById('t-emergency');
    if (el && !el.innerHTML.trim()) renderEmergencyTab(el);
  }
  if (t === 'combat') {
    const el = document.getElementById('t-combat');
    if (el) initCombatTab(el);
  }
  if (t === 'tickets') {
    const el = document.getElementById('t-tickets');
    if (el) renderTicketsTab(el);
  }
  if (t === 'chars') {
    // Sheet tab: ST sees 3-col character picker; player sees their own sheet
    const role = getRole();
    if (role !== 'st') {
      showPlayerSheet();
    } else {
      renderSheetPicker(document.getElementById('t-chars'));
    }
  }
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
}

async function loadAllData() {
  // 0. Load rules data (purchasable powers) — non-blocking, cached
  loadRulesFromApi().catch(() => {});

  // 1. Try API first — role-filtered server-side (player sees own, ST sees all)
  const apiChars = await loadCharsFromApi();
  if (apiChars) {
    editorState.chars = apiChars;
  } else if (getRole() === 'st') {
    // Only fall back to embedded data for STs
    loadDB();
  } else {
    // Player with no API — show nothing rather than leak all characters
    editorState.chars = [];
  }

  // 1b. Load game session XP (attendance-based) — same as admin/player portal
  await loadGameXP(editorState.chars, getRole() === 'st').catch(() => {});

  // 1c. Compute derived bonus fields (PT/MCI/OHM grants, 9-Again, etc.)
  editorState.chars.forEach(c => applyDerivedMerits(c));

  // 2. Copy to suite state
  const sortedChars = editorState.chars.slice().sort((a, b) => sortName(a).localeCompare(sortName(b)));
  suiteState.chars = sortedChars;

  // 2b. Load combat data for ALL characters (resist target dropdown).
  // Players only have their own chars in editorState, but the resist
  // calculator needs opponents' attributes. The /combat endpoint returns
  // lightweight attribute/discipline data for all active characters.
  try {
    const combatChars = await apiGet('/api/characters/combat');
    if (Array.isArray(combatChars) && combatChars.length) {
      // Merge combat chars into suiteState so resist lookups find them
      const ownIds = new Set(sortedChars.map(c => String(c._id)));
      for (const cc of combatChars) {
        if (!ownIds.has(String(cc._id))) suiteState.chars.push(cc);
      }
    }
  } catch (e) { console.warn('Combat chars load failed:', e.message); }

  window._charNames = suiteState.chars.map(c => c.name);
  window._charDisplayMap = Object.fromEntries(suiteState.chars.map(c => [c.name, displayName(c)]));

  // 3. Load territories (used by regency condition + renderRegencyTab)
  try {
    suiteState.territories = await apiGet('/api/territories');
  } catch { suiteState.territories = []; }

  // 4. Populate suite dropdowns
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
  data.forEach(sanitiseChar);
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
  toast('Import cleared \u2014 using built-in data');
}

// ══════════════════════════════════════════════
//  PICKER PANEL (suite)
// ══════════════════════════════════════════════

const COMMON_ACTIONS = [
  { name: 'Argument',      attr: 'Intelligence', skill: 'Expression',    resist: 'Resolve' },
  { name: 'Carousing',     attr: 'Presence',     skill: 'Socialise',     resist: null },
  { name: 'Carousing',     attr: 'Presence',     skill: 'Streetwise',    resist: null },
  { name: 'Fast-Talk',     attr: 'Manipulation', skill: 'Subterfuge',    resist: 'Composure' },
  { name: 'Interrogation', attr: 'Manipulation', skill: 'Empathy',       resist: 'Resolve' },
  { name: 'Interrogation', attr: 'Manipulation', skill: 'Intimidation',  resist: 'Resolve' },
  { name: 'Intimidation',  attr: 'Strength',     skill: 'Intimidation',  resist: 'Composure' },
  { name: 'Intimidation',  attr: 'Manipulation', skill: 'Intimidation',  resist: 'Composure' },
  { name: 'Investigate',   attr: 'Intelligence', skill: 'Investigation', resist: null },
  { name: 'Jumping',       attr: 'Strength',     skill: 'Athletics',     resist: null },
  { name: 'Repair',        attr: 'Intelligence', skill: 'Crafts',        resist: null },
  { name: 'Research',      attr: 'Intelligence', skill: 'Academics',     resist: null },
  { name: 'Research',      attr: 'Intelligence', skill: 'Occult',        resist: null },
  { name: 'Shadowing',     attr: 'Wits',         skill: 'Stealth',       resist: null, note: 'vs Wits + Composure' },
  { name: 'Shadowing',     attr: 'Wits',         skill: 'Drive',         resist: null, note: 'vs Wits + Composure' },
  { name: 'Sneaking',      attr: 'Dexterity',    skill: 'Stealth',       resist: null, note: 'vs Wits + Composure' },
];

function openPanel(mode) {
  suiteState.panelMode = mode;
  const body = document.getElementById('panel-body');
  const title = document.getElementById('panel-title');
  body.innerHTML = '';

  if (mode === 'char') {
    title.textContent = 'Select Character';
    const role = getRole();
    const info = getPlayerInfo();
    const charList = role === 'st'
      ? suiteState.chars
      : suiteState.chars.filter(c => info?.character_ids?.includes(c._id));
    charList.forEach(c => {
      const el = document.createElement('div');
      el.className = 'panel-item';
      el.innerHTML = `<div><div class="pi-main">${displayName(c)}</div><div class="pi-sub">${c.clan || ''} \u00B7 ${c.covenant || ''}</div></div><div class="pi-badge">${redactPlayer(c.player || '')}</div>`;
      el.addEventListener('click', () => { pickChar(c); closePanel(); });
      body.appendChild(el);
    });
  } else if (mode === 'disc') {
    title.textContent = 'Select Discipline';
    if (!suiteState.rollChar) {
      body.innerHTML = '<div class="hempty" style="padding:24px 16px;">Select a character first</div>';
    } else {
      const c = suiteState.rollChar;
      const allRules = getRulesByCategory('discipline');

      // Derive discipline powers from the rules cache (same as the editor sheet).
      // For each discipline the character has dots in, show powers up to that rank.
      const discEntries = Object.entries(c.disciplines || {})
        .filter(([, v]) => (v?.dots || 0) > 0)
        .sort(([a], [b]) => a.localeCompare(b));

      for (const [disc, v] of discEntries) {
        const dots = v.dots || 0;
        const ruledPowers = allRules
          .filter(r => r.parent === disc && r.rank != null && r.rank <= dots)
          .sort((a, b) => a.rank - b.rank);
        // Fall back to stored c.powers if no rules exist for this discipline
        const powers = ruledPowers.length
          ? ruledPowers.map(r => ({ name: r.name, discipline: disc }))
          : (c.powers || []).filter(p => p.category === 'discipline' && p.discipline === disc);

        if (!powers.length) continue;
        const sec = document.createElement('div');
        sec.className = 'panel-section';
        sec.textContent = disc + ' (' + dots + ')';
        body.appendChild(sec);

        for (const p of powers) {
          const lookupKey = p.name || '';
          const pi = getPool(c, lookupKey);
          const hasRoll = pi && !pi.noRoll && pi.total !== undefined;
          let poolEl = '<div class="pi-pool nr">\u2014</div>';
          if (hasRoll) poolEl = '<div class="pi-pool">' + pi.total + '</div>';
          let subStr = '';
          if (hasRoll) subStr = pi.attr + ' + ' + pi.skill + (pi.resistance ? ' \u00B7 vs ' + pi.resistance : '');
          else if (pi && pi.noRoll && pi.info && pi.info.c) subStr = 'Cost: ' + pi.info.c;
          else if (pi && pi.info && pi.info.c) subStr = 'Cost: ' + pi.info.c;
          const el = document.createElement('div');
          el.className = 'panel-item';
          el.innerHTML = '<div><div class="pi-main">' + lookupKey + '</div>' + (subStr ? '<div class="pi-sub">' + subStr + '</div>' : '') + '</div>' + poolEl;
          el.addEventListener('click', () => {
            if (hasRoll) { loadPool(pi.total, lookupKey, pi); }
            else { toast(lookupKey + ' \u2014 no roll'); closePanel(); }
          });
          body.appendChild(el);
        }
      }

      // Also show devotions and rites from c.powers (these are character-specific picks)
      const otherPowers = (c.powers || []).filter(p => p.category === 'devotion' || p.category === 'rite');
      if (otherPowers.length) {
        const sec = document.createElement('div');
        sec.className = 'panel-section';
        sec.textContent = 'Devotions & Rites';
        body.appendChild(sec);
        for (const p of otherPowers) {
          const lookupKey = p.name || '';
          const pi = getPool(c, lookupKey);
          const hasRoll = pi && !pi.noRoll && pi.total !== undefined;
          let poolEl = '<div class="pi-pool nr">\u2014</div>';
          if (hasRoll) poolEl = '<div class="pi-pool">' + pi.total + '</div>';
          let subStr = '';
          if (hasRoll) subStr = pi.attr + ' + ' + pi.skill + (pi.resistance ? ' \u00B7 vs ' + pi.resistance : '');
          else if (pi && pi.noRoll && pi.info && pi.info.c) subStr = 'Cost: ' + pi.info.c;
          const el = document.createElement('div');
          el.className = 'panel-item';
          el.innerHTML = '<div><div class="pi-main">' + lookupKey + '</div>' + (subStr ? '<div class="pi-sub">' + subStr + '</div>' : '') + '</div>' + poolEl;
          el.addEventListener('click', () => {
            if (hasRoll) { loadPool(pi.total, lookupKey, pi); }
            else { toast(lookupKey + ' \u2014 no roll'); closePanel(); }
          });
          body.appendChild(el);
        }
      }
    }
  } else if (mode === 'auspex') {
    title.textContent = 'Auspex Insight';
    const c = suiteState.rollChar || suiteState.sheetChar;
    const dots = c?.disciplines?.Auspex?.dots || 0;
    if (!dots) {
      body.innerHTML = '<div class="hempty" style="padding:24px 16px;">No Auspex rating detected.</div>';
    } else {
      let html = '';
      const maxTier = Math.min(dots, 3);
      for (let tier = 1; tier <= maxTier; tier++) {
        html += `<div class="panel-section">Tier ${tier} \u2014 Auspex ${'&#9679;'.repeat(tier)}</div>`;
        AUSPEX_QUESTIONS[tier].forEach(({ q, fmt }) => {
          html += `<div class="auspex-q-item">
            <div class="auspex-q-text">${q}</div>
            <div class="auspex-q-fmt">${fmt}</div>
          </div>`;
        });
      }
      body.innerHTML = html;
    }
  } else if (mode === 'common') {
    title.textContent = 'Common Actions';
    if (!suiteState.rollChar) {
      body.innerHTML = '<div class="hempty" style="padding:24px 16px;">Select a character first</div>';
    } else {
      const c = suiteState.rollChar;
      COMMON_ACTIONS.forEach(a => {
        const attrV  = getAttrVal(c, a.attr);
        const skillV = skDots(c, a.skill);
        const unskilled = skillV === 0 ? (SKILLS_MENTAL.includes(a.skill) ? -3 : -1) : 0;
        const total  = attrV + skillV + unskilled;
        const pi = { attr: a.attr, attrV, skill: a.skill, skillV, unskilled: unskilled || null, discName: null, discV: 0, resistance: a.resist, total };
        const el = document.createElement('div');
        el.className = 'panel-item';
        let sub = a.attr + ' + ' + a.skill;
        if (unskilled) sub += ' ' + unskilled + ' (unskilled)';
        if (a.resist) sub += ' \u00B7 vs ' + a.resist;
        if (a.note)   sub += ' \u00B7 ' + a.note;
        el.innerHTML = '<div><div class="pi-main">' + a.name + '</div><div class="pi-sub">' + sub + '</div></div><div class="pi-pool">' + total + '</div>';
        el.addEventListener('click', () => { loadPool(total, a.name, pi); });
        body.appendChild(el);
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
  // Update header character name
  const hdrName = document.getElementById('hdr-char-name');
  if (hdrName) hdrName.textContent = displayName(c);
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

  // Reset and re-init feeding (ST only — section hidden for players)
  // Legacy feed init removed — feeding is now in More grid (nav-2-5)

  // Render tappable pool chips in the roll tab for the selected character
  const rollPoolsEl = document.getElementById('roll-char-pools');
  if (rollPoolsEl) {
    renderCharPools(rollPoolsEl, c, (p) => {
      loadPool(p.total, p.label, p.pi || { total: p.total, attr: p.attr, attrV: p.attrV, skill: p.skill, skillV: p.skillV, nineAgain: p.nineAgain, resistance: p.resistance });
    });
    rollPoolsEl.style.display = '';
  }

  // Show Auspex button if character has Auspex
  const auspexBtn = document.getElementById('sc-auspex');
  if (auspexBtn) auspexBtn.style.display = (c.disciplines?.Auspex?.dots || 0) > 0 ? '' : 'none';
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
  printPDF,
  exportJSON,
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
  shEditBP, shEditBPCreation, shEditBPXP, shEditBPLost,
  shEditHumanity, shEditHumanityXP, shEditHumanityLost,
  shStatusUp,
  shStatusDown,
  shToggleOrdeal,
  shSetPriority,
  shSetClanAttr,
  shEditAttrPt,
  shAdjAttrBonus,
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
  shEditContactSphere,
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
  shToggleMCI, shTogglePT,
  shEditMCIDot, shRemoveStandMerit, shAddStandMCI, shAddStandPT,
  shEditMeritPt, shStepMeritRating,
  shEditXP,
  shAddEquip, shEditEquip, shRemoveEquip,

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
  togSpec,
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

  // Toast
  toast,

  // Suite feeding (ST only, in Roll tab)
  // feedToggle/feedInit etc removed — feeding consolidated to More grid (nav-2-5)

  // Suite import
  handleImport: _handleImport,
  handleDtImport: _handleDtImport,

  // Suite territory
  mountTerr,
  _mountTerr: mountTerr,
  toggleDesktopMode,
  renderDesktopSidebar,
  toggleTheme,
  renderMoreGrid,
  renderSheetPicker,
  openSheetChar,
  showPlayerSheet,

  // Game — live tracker
  trackerReset,
  trackerAdj,
  trackerAddCondition,
  trackerRemoveCond,
  trackerToggle,

  // Game — sheet/DT toggle
  setSheetView,

  // Game — contested roll
  openContestedRoll,
  closeContestedRoll,
  crSetType,
  crSetChar,
  crAdjPool,
  crRoll,
});

// ══════════════════════════════════════════════
//  AUTH GATE + INIT
// ══════════════════════════════════════════════

async function boot() {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('app');
  const errorEl = document.getElementById('login-error');

  try {
    await handleCallback();
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message;
  }

  // Close profile dropdown on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('#hdr-profile') && !e.target.closest('#hdr-profile-menu')) {
      const menu = document.getElementById('hdr-profile-menu');
      if (menu) menu.style.display = 'none';
    }
  });

  if (isLoggedIn()) {
    const valid = await validateToken();
    if (valid) {
      loginScreen.style.display = 'none';
      app.style.display = '';
      applyRoleRestrictions();
      if (localStorage.getItem('tm_auth_token') === 'local-test-token') {
        await import('./dev-fixtures.js');
      }
      await loadAllData();
      renderList();
      renderImportBanner();
      renderUserHeader();
      // Auto-open character for players so Sheet/Downtime tabs work immediately,
      // and pre-fill the dice tab so the roller is ready without a manual pick.
      if (getRole() !== 'st' && editorState.chars.length > 0) {
        openChar(0);
        pickChar(editorState.chars[0]);
      }
      goTab('stats');
      renderLifecycleCards(); // non-blocking
      checkMoreBadge();       // non-blocking
      _updateThemeIcon();     // set correct sun/moon on load
      _initDesktopMode();     // restore desktop mode if saved
      return;
    }
  }

  // Show login screen
  loginScreen.style.display = '';
  app.style.display = 'none';
  document.getElementById('login-btn').addEventListener('click', login);
}

/** Navigate to editor tab in downtime view, highlighting the DT nav button. */
function playerGoDowntime() {
  document.querySelectorAll('.tab').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.nbtn').forEach(el => el.classList.remove('on'));
  const tabEl = document.getElementById('t-editor');
  if (tabEl) tabEl.classList.add('active');
  document.getElementById('n-dt')?.classList.add('on');
  setSheetView('dt');
}

/** Apply nav and UI visibility for the current effective role. Idempotent — safe to call multiple times. */
function applyRoleRestrictions() {
  const role = effectiveRole();
  const isST = role === 'st';
  const isRealST = getRole() === 'st';

  // Rebuild the scrollable bottom nav with role-appropriate items
  renderBottomNav();

  // Contested Roll — ST only (Feeding is now in More grid)
  const btnContested = document.getElementById('btn-contested');
  if (btnContested) btnContested.style.display = isST ? '' : 'none';

  // ST Admin link — always visible to real STs regardless of view mode
  const navAdmin = document.getElementById('nav-admin');
  if (navAdmin) navAdmin.style.display = isRealST ? '' : 'none';

  // Sheet topbar — hide for players
  const topbar = document.querySelector('.sheet-topbar');
  if (topbar) topbar.style.display = isST ? '' : 'none';

  // Character list — restrict to player's own characters in player mode
  if (!isST) {
    const info = getPlayerInfo();
    setListLimit(info?.character_ids || []);
    const toolbar = document.querySelector('.list-toolbar');
    if (toolbar) toolbar.style.display = 'none';
  } else {
    setListLimit([]);
    const toolbar = document.querySelector('.list-toolbar');
    if (toolbar) toolbar.style.display = '';
  }

  // Update toggle button label
  const toggleBtn = document.getElementById('btn-view-toggle');
  if (toggleBtn) {
    toggleBtn.textContent = isST ? 'Player View' : 'ST View';
    toggleBtn.classList.toggle('view-toggle-active', !isST);
  }
}

// ── More grid app launcher (Story 1.3) ────────────────────────────────────────

// SVG icons — monochrome, stroke-based, currentColor. Consistent with bottom nav.
const _svg = {
  status:   '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>',
  whosWho:  '<svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  dtReport: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
  feeding:  '<svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>',
  primer:   '<svg viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
  guide:    '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  rules:    '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/><path d="M13 8h4M13 12h4M13 16h4"/></svg>',
  dtSubmit: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M9 16l2 2 4-4"/></svg>',
  ordeals:  '<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  tracker:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  signin:   '<svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',
  emergency:'<svg viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.89 12 19.79 19.79 0 0 1 1.84 3.4 2 2 0 0 1 3.81 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.96a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
  regency:  '<svg viewBox="0 0 24 24"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><line x1="2" y1="20" x2="22" y2="20"/></svg>',
  office:   '<svg viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>',
};

// section: 'game' | 'player' | 'lore' | 'st'
// Render order: game → player (if visible) → lore → st (if visible)
const MORE_APPS = [
  // ── Game section ──
  // Note: Status is a primary nav tab — not duplicated here
  { id: 'whos-who',     label: "Who's Who",   icon: _svg.whosWho,  section: 'game' },
  { id: 'feeding',      label: 'Feeding',     icon: _svg.feeding,  section: 'game' },
  { id: 'map',          label: 'Map',         icon: '<svg viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>', section: 'game' },
  { id: 'territory',    label: 'Territory',   icon: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>', section: 'st', stOnly: true },
  // ── Player section (player role only) ──
  { id: 'downtime',      label: 'Downtime',    icon: _svg.dtSubmit, section: 'player',
    badge: () => {
      const sub = _lifecycleCache?.mySubmission;
      if (!sub?.published_outcome) return false;
      return String(sub._id) !== localStorage.getItem('tm-last-viewed-sub');
    }
  },
  { id: 'ordeals',      label: 'Ordeals',     icon: _svg.ordeals,  section: 'player' },
  { id: 'tickets',      label: 'Tickets',     icon: '<svg viewBox="0 0 24 24"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/></svg>', section: 'player' },
  // ── Lore section ──
  { id: 'primer',       label: 'Primer',      icon: _svg.primer,   section: 'lore' },
  { id: 'game-guide',   label: 'Game Guide',  icon: _svg.guide,    section: 'lore' },
  { id: 'rules',        label: 'Rules',       icon: _svg.rules,    section: 'lore' },
  // ── Storyteller section (ST role only) ──
  { id: 'tracker',      label: 'Tracker',     icon: _svg.tracker,  section: 'st', stOnly: true },
  { id: 'combat',       label: 'Combat',      icon: '<svg viewBox="0 0 24 24"><path d="M14.5 17.5L3 6V3h3l11.5 11.5"/><path d="M13 19l6-6"/><path d="M2 2l20 20"/><path d="M3 14l7-7"/></svg>', section: 'st', stOnly: true },
  { id: 'signin',       label: 'Sign-In',     icon: _svg.signin,   section: 'st', stOnly: true },
  { id: 'emergency',    label: 'Emergency',   icon: _svg.emergency,section: 'st', stOnly: true },
  // ── Conditional apps (section determined by context) ──
  { id: 'regency',      label: 'Regency',     icon: _svg.regency,  section: 'game', condition: 'hasRegency' },
  { id: 'office',       label: 'Office',      icon: _svg.office,   section: 'game', condition: 'hasOffice' },
  { id: 'archive',      label: 'Archive',     icon: '<svg viewBox="0 0 24 24"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>', section: 'player', condition: 'hasArchive' },
];

const MORE_SECTIONS = [
  { id: 'game',   label: 'Game' },
  { id: 'player', label: 'Player' },
  { id: 'lore',   label: 'Lore' },
  { id: 'st',     label: 'Storyteller' },
];

function _moreGridCondition(app) {
  if (!app.condition) return true;
  // STs see all conditional apps — conditions only gate player view
  if (getRole() === 'st') return true;
  const chars = suiteState.chars || [];
  const info = getPlayerInfo();
  const myChar = chars.find(c => info?.character_ids?.includes(c._id) || info?.character_ids?.includes(String(c._id)));
  if (app.condition === 'hasRegency') {
    // Regent if their character _id matches a territory's regent_id
    const terrs = suiteState.territories || [];
    return !!(myChar && findRegentTerritory(terrs, myChar));
  }
  if (app.condition === 'hasOffice') {
    return !!(myChar && myChar.court_category);
  }
  if (app.condition === 'hasArchive') {
    // Archive visible if character has any archive documents — check loaded state
    return !!(myChar && myChar._has_archive);
  }
  return true;
}

// ── Settings tab ────────────────────────────────────────────────────────────

const FONT_SIZE_KEY = 'tm-reading-font-size';
const FONT_SIZES = [
  { value: '13px', label: 'Small' },
  { value: '15px', label: 'Default' },
  { value: '17px', label: 'Large' },
  { value: '19px', label: 'X-Large' },
];

function _getReadingFontSize() {
  return localStorage.getItem(FONT_SIZE_KEY) || '15px';
}

function _applyReadingFontSize(size) {
  localStorage.setItem(FONT_SIZE_KEY, size);
  document.documentElement.style.setProperty('--reading-font-size', size);
}

// Apply saved font size on load
(function() {
  const saved = _getReadingFontSize();
  if (saved !== '15px') document.documentElement.style.setProperty('--reading-font-size', saved);
})();

function renderSettingsTab() {
  const el = document.getElementById('t-settings');
  if (!el) return;
  const user = getUser();
  const currentTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  const currentFontSize = _getReadingFontSize();

  const avatarUrl = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : user?.id
      ? `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`
      : '';

  let h = '<div class="settings-wrap">';
  h += '<h3 class="settings-title">Settings</h3>';

  // Profile
  if (user) {
    h += '<div class="settings-section">';
    h += '<div class="settings-section-label">Profile</div>';
    h += '<div class="settings-profile">';
    if (avatarUrl) h += `<img class="settings-avatar" src="${avatarUrl}" alt="">`;
    h += `<div class="settings-profile-info">`;
    h += `<span class="settings-name">${esc(user.global_name || user.username)}</span>`;
    h += `<span class="settings-role">${user.role === 'st' ? 'Storyteller' : 'Player'}</span>`;
    h += `</div>`;
    h += '</div>';
    h += `<button class="settings-btn settings-logout" onclick="logout()">Log Out</button>`;
    h += '</div>';
  }

  // Theme
  h += '<div class="settings-section">';
  h += '<div class="settings-section-label">Theme</div>';
  h += '<div class="settings-toggle-row">';
  h += `<button class="settings-toggle-btn${currentTheme === 'light' ? ' on' : ''}" data-theme="light">Light</button>`;
  h += `<button class="settings-toggle-btn${currentTheme === 'dark' ? ' on' : ''}" data-theme="dark">Dark</button>`;
  h += '</div>';
  h += '</div>';

  // Reading font size
  h += '<div class="settings-section">';
  h += '<div class="settings-section-label">Reading Font Size</div>';
  h += '<div class="settings-section-hint">Applies to Primer, Game Guide, and Rules tabs.</div>';
  h += '<div class="settings-toggle-row">';
  for (const fs of FONT_SIZES) {
    h += `<button class="settings-toggle-btn${currentFontSize === fs.value ? ' on' : ''}" data-fontsize="${fs.value}">${fs.label}</button>`;
  }
  h += '</div>';
  h += '</div>';

  // Show Guides toggle
  const showGuides = localStorage.getItem('tm-show-guides') === '1';
  h += '<div class="settings-section">';
  h += '<div class="settings-section-label">Navigation</div>';
  h += '<label class="settings-checkbox-row">';
  h += `<input type="checkbox" id="settings-show-guides"${showGuides ? ' checked' : ''}>`;
  h += '<span>Show Primer, Guide &amp; Rules tabs</span>';
  h += '</label>';
  h += '</div>';

  // ST Admin link
  if (getRole() === 'st') {
    h += '<div class="settings-section">';
    h += '<a href="/admin" class="settings-btn">ST Admin Panel</a>';
    h += '</div>';
  }

  // Submit a Ticket
  h += '<div class="settings-section">';
  h += '<div class="settings-section-label">Submit a Ticket</div>';
  h += '<div class="settings-ticket-form">';
  h += '<select class="settings-input" id="stk-type"><option value="bug">Bug Report</option><option value="feature">Feature Request</option><option value="question">Question</option><option value="sheet">Sheet Issue</option><option value="other">Other</option></select>';
  h += '<input class="settings-input" id="stk-title" type="text" placeholder="Short summary" maxlength="200">';
  h += '<textarea class="settings-input" id="stk-body" rows="4" placeholder="Describe the issue or request..."></textarea>';
  h += '<div id="stk-status" style="display:none"></div>';
  h += '<button class="settings-btn" id="stk-submit">Submit Ticket</button>';
  h += '</div>';
  h += '</div>';

  h += '</div>';
  el.innerHTML = h;

  // Wire theme toggles
  el.querySelectorAll('[data-theme]').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.dataset.theme;
      if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('tm-theme', 'dark');
      } else {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('tm-theme', 'light');
      }
      renderSettingsTab();
    });
  });

  // Wire font size toggles
  el.querySelectorAll('[data-fontsize]').forEach(btn => {
    btn.addEventListener('click', () => {
      _applyReadingFontSize(btn.dataset.fontsize);
      renderSettingsTab();
    });
  });

  // Wire show guides toggle
  el.querySelector('#settings-show-guides')?.addEventListener('change', e => {
    localStorage.setItem('tm-show-guides', e.target.checked ? '1' : '0');
    renderBottomNav();
    if (document.body.classList.contains('desktop-mode')) renderDesktopSidebar();
  });

  // Wire ticket submit
  el.querySelector('#stk-submit')?.addEventListener('click', async () => {
    const type  = el.querySelector('#stk-type')?.value || 'other';
    const title = el.querySelector('#stk-title')?.value?.trim();
    const body  = el.querySelector('#stk-body')?.value?.trim();
    const statusEl = el.querySelector('#stk-status');
    if (!title) { statusEl.textContent = 'Title is required.'; statusEl.style.display = ''; statusEl.style.color = 'var(--crim)'; return; }
    statusEl.textContent = 'Submitting\u2026'; statusEl.style.display = ''; statusEl.style.color = 'var(--txt3)';
    try {
      await apiPost('/api/tickets', { type, title, body: body || '' });
      statusEl.textContent = 'Ticket submitted!'; statusEl.style.color = 'var(--green2)';
      el.querySelector('#stk-title').value = '';
      el.querySelector('#stk-body').value = '';
    } catch (err) {
      statusEl.textContent = 'Failed: ' + (err.message || 'unknown error'); statusEl.style.color = 'var(--crim)';
    }
  });
}

function renderMoreGrid() {
  const el = document.getElementById('t-more');
  if (!el) return;

  const role = effectiveRole();
  const isST = role === 'st';

  function appVisible(app) {
    if (app.stOnly && !isST) return false;
    if (app.playerOnly && isST) return false;
    if (app.condition && !_moreGridCondition(app)) return false;
    return true;
  }

  function appIcon(app) {
    const hasBadge = typeof app.badge === 'function' && app.badge();
    const badgeDot = hasBadge ? '<span class="nav-badge visible"></span>' : '';
    return `<button class="more-app-icon" data-app="${app.id}" onclick="goTab('${app.id}')">` +
      `<span class="more-app-icon-svg">${app.icon}</span>` +
      `<span class="more-app-label">${app.label}</span>` +
      badgeDot +
      '</button>';
  }

  let h = '<div class="more-grid-wrap">';
  for (const section of MORE_SECTIONS) {
    const sectionApps = MORE_APPS.filter(a => a.section === section.id && appVisible(a));
    if (!sectionApps.length) continue;
    h += `<div class="more-section">`;
    h += `<div class="more-section-label">${section.label}</div>`;
    h += `<div class="more-section-grid">`;
    h += sectionApps.map(appIcon).join('');
    h += `</div></div>`;
  }
  h += '</div>';
  el.innerHTML = h;
}

// ── More tab badge (nav-3-3) ──────────────────────────────────────────────────

async function checkMoreBadge() {
  const badge = document.getElementById('more-badge');
  if (!badge) return;

  const { nextSession, activeCycle, mySubmission } = await _loadLifecycleData();
  const today = new Date().toISOString().slice(0, 10);

  let hasBadge = false;

  // Feeding phase open and player hasn't rolled
  if (nextSession?.session_date >= today && !mySubmission?.feeding_roll_player) {
    hasBadge = true;
  }

  // Unread DT narrative — published outcome the player hasn't viewed
  if (!hasBadge && mySubmission?.published_outcome) {
    const lastViewed = localStorage.getItem('tm-last-viewed-sub');
    if (String(mySubmission._id) !== lastViewed) hasBadge = true;
  }

  badge.classList.toggle('visible', hasBadge);
}

function _markSubViewed() {
  const { mySubmission } = _lifecycleCache || {};
  if (mySubmission?._id) {
    localStorage.setItem('tm-last-viewed-sub', String(mySubmission._id));
    checkMoreBadge();
    renderMoreGrid();
  }
}

// ── Desktop mode toggle (nav-desktop-mode) ───────────────────────────────────

function toggleDesktopMode() {
  const isDesktop = document.body.classList.toggle('desktop-mode');
  localStorage.setItem('tm-mode', isDesktop ? 'desktop' : 'game');
  _updateDesktopIcon();
  _syncSidebarActions();
  if (isDesktop) {
    renderDesktopSidebar();
    const onMore = document.getElementById('t-more')?.classList.contains('active');
    if (onMore) goTab('dice');
  }
}

function _syncSidebarActions() {
  const actionsEl = document.getElementById('desktop-sidebar-actions');
  if (!actionsEl) return;
  const isDesktop = document.body.classList.contains('desktop-mode');
  if (!isDesktop) { actionsEl.innerHTML = ''; return; }
  // Clone the original header nav buttons into the sidebar actions row
  const themeBtn = document.getElementById('btn-theme-toggle');
  const desktopBtn = document.getElementById('btn-desktop-toggle');
  const adminLink = document.getElementById('nav-admin');
  actionsEl.innerHTML = '';
  if (themeBtn) actionsEl.appendChild(themeBtn.cloneNode(true));
  if (desktopBtn) {
    const clone = desktopBtn.cloneNode(true);
    clone.id = 'btn-desktop-toggle-sidebar';
    clone.setAttribute('onclick', 'toggleDesktopMode()');
    actionsEl.appendChild(clone);
  }
  if (adminLink && adminLink.style.display !== 'none') {
    actionsEl.appendChild(adminLink.cloneNode(true));
  }
}

function _updateDesktopIcon() {
  const isDesktop = document.body.classList.contains('desktop-mode');
  const gameIcon = document.getElementById('desktop-icon-game');
  const desktopIcon = document.getElementById('desktop-icon-desktop');
  if (gameIcon) gameIcon.style.display = isDesktop ? 'none' : '';
  if (desktopIcon) desktopIcon.style.display = isDesktop ? '' : 'none';
}

const DESKTOP_MQ = window.matchMedia('(min-width: 900px)');

function _initDesktopMode() {
  // Auto-detect: wide viewport → desktop mode, narrow → game mode.
  // matchMedia listener keeps it in sync on resize / rotation.
  _applyDesktopMode(DESKTOP_MQ.matches);
  DESKTOP_MQ.addEventListener('change', e => _applyDesktopMode(e.matches));
}

function _applyDesktopMode(isDesktop) {
  document.body.classList.toggle('desktop-mode', isDesktop);
  _updateDesktopIcon();
  _syncSidebarActions();
  if (isDesktop) {
    renderDesktopSidebar();
    // Show header nav controls in desktop mode
    const hdrNav = document.getElementById('hdr-nav');
    if (hdrNav) hdrNav.style.display = '';
  } else {
    const hdrNav = document.getElementById('hdr-nav');
    if (hdrNav) hdrNav.style.display = 'none';
  }
  renderBottomNav();
}

function renderDesktopSidebar() {
  const nav = document.getElementById('desktop-sidebar-nav');
  if (!nav) return;

  const currentTab = document.querySelector('.tab.active')?.id?.replace('t-', '') || 'dice';
  const isActive = (id) => id === currentTab || (id === 'chars' && ['chars','sheets','editor'].includes(currentTab));

  // Primary tabs prepended to Game section — Dice/Sheet/Status are first game items
  const primaryTabs = [
    { id: 'dice',   label: 'Dice',   icon: '<svg viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" rx="4"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/><circle cx="17" cy="7" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="7" cy="17" r="1.5" fill="currentColor"/><circle cx="17" cy="17" r="1.5" fill="currentColor"/></svg>' },
    { id: 'chars',  label: 'Sheet',  icon: '<svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>' },
    { id: 'status', label: 'Status', icon: '<svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
  ];

  let h = '';

  // All sections — 3-column grids; Game section gets Dice/Sheet/Status prepended
  for (const section of MORE_SECTIONS) {
    const sectionApps = MORE_APPS.filter(app => {
      if (app.section !== section.id) return false;
      if (app.stOnly && effectiveRole() !== 'st') return false;
      if (app.condition && !_moreGridCondition(app)) return false;
      return true;
    });
    if (!sectionApps.length) continue;

    h += `<div class="sidebar-section-label">${section.label}</div>`;
    h += `<div class="sidebar-app-grid">`;
    // Prepend Dice/Sheet/Status to Game section
    if (section.id === 'game') {
      for (const { id, label, icon } of primaryTabs) {
        const on = isActive(id) ? ' on' : '';
        h += `<button class="sidebar-app-tile${on}" onclick="goTab('${id}')" title="${label}">`;
        h += `<span class="sidebar-app-tile-icon">${icon}</span><span class="sidebar-app-tile-label">${label}</span></button>`;
      }
    }
    for (const app of sectionApps) {
      const on = isActive(app.id) ? ' on' : '';
      h += `<button class="sidebar-app-tile${on}" onclick="goTab('${app.id}')" title="${app.label}">`;
      h += `<span class="sidebar-app-tile-icon">${app.icon}</span>`;
      h += `<span class="sidebar-app-tile-label">${app.label}</span>`;
      h += `</button>`;
    }
    h += `</div>`;
  }

  // Settings button at the bottom of the sidebar
  const settingsOn = isActive('settings') ? ' on' : '';
  h += `<div class="sidebar-settings"><button class="sidebar-app-tile sidebar-settings-btn${settingsOn}" onclick="goTab('settings')" title="Settings">`;
  h += `<span class="sidebar-app-tile-icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>`;
  h += `<span class="sidebar-app-tile-label">Settings</span></button></div>`;

  nav.innerHTML = h;

  // Mirror user info
  const userEl = document.getElementById('sidebar-user');
  const desktopUserEl = document.getElementById('desktop-sidebar-user');
  if (userEl && desktopUserEl) desktopUserEl.innerHTML = userEl.innerHTML;
}

// ── Theme toggle (nav-3-2) ────────────────────────────────────────────────────

function toggleTheme() {
  const current = localStorage.getItem('tm-theme');
  const next = (current === 'light') ? 'dark' : 'light';
  localStorage.setItem('tm-theme', next);
  if (next === 'light') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  _updateThemeIcon();
}

function _updateThemeIcon() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark' ||
                 !document.documentElement.hasAttribute('data-theme');
  const sunEl = document.getElementById('theme-icon-dark');
  const moonEl = document.getElementById('theme-icon-parch');
  if (sunEl) sunEl.style.display = isDark ? '' : 'none';
  if (moonEl) moonEl.style.display = isDark ? 'none' : '';
}

// ── More grid helpers ─────────────────────────────────────────────────────────

/** Get the active character for More grid player tabs.
 *  ST: returns suiteState.rollChar (last selected in Sheet/Dice)
 *  Player: returns their own character */
function _activeMoreChar() {
  const role = getRole();
  const chars = suiteState.chars || [];
  if (role !== 'st') {
    const info = getPlayerInfo();
    const ids = info?.character_ids || [];
    return chars.find(c => ids.includes(String(c._id)) || ids.includes(c._id)) || null;
  }
  return suiteState.rollChar || chars[0] || null;
}

// ── Sheet tab — character picker and player sheet (nav-2-1) ──────────────────

function renderSheetPicker(el) {
  if (!el) return;
  const chars = (suiteState.chars || []).filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));

  let h = '<div class="sheet-picker"><div class="sheet-picker-grid">';
  for (const c of chars) {
    const name = displayName(c);
    const icon = covIcon(c.covenant, 40);
    const esc = s => s ? s.replace(/&/g,'&amp;').replace(/"/g,'&quot;') : '';
    h += `<button class="sheet-char-chip" onclick="openSheetChar('${esc(c.name)}')" title="${esc(name)}">`;
    h += `<span class="sheet-char-chip-icon">${icon}</span>`;
    h += `<span class="sheet-char-chip-name">${esc(name)}</span>`;
    h += '</button>';
  }
  h += '</div></div>';
  el.innerHTML = h;
}

function openSheetChar(charName) {
  onSheetChar(charName);
  goTab('sheets');
}

function showPlayerSheet() {
  const info = getPlayerInfo();
  const ids = info?.character_ids || [];
  const chars = suiteState.chars || [];
  const myChar = chars.find(c => ids.includes(String(c._id)) || ids.includes(c._id));
  if (myChar) {
    onSheetChar(myChar.name);
    goTab('sheets');
  }
}

// ── Lifecycle-aware contextual cards (nav-3-1) ───────────────────────────────

let _lifecycleCache = null; // cached { nextSession, activeCycle, mySubmission }

async function _loadLifecycleData() {
  if (_lifecycleCache) return _lifecycleCache;
  try {
    const [nextSession, cycles] = await Promise.all([
      fetch('/api/game_sessions/next', { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null),
      apiGet('/api/downtime_cycles').catch(() => []),
    ]);
    const activeCycle = Array.isArray(cycles)
      ? cycles.find(c => c.status === 'open' || c.status === 'active') || null
      : null;
    let mySubmission = null;
    if (activeCycle) {
      const subs = await apiGet('/api/downtime_submissions').catch(() => []);
      const char = _activeMoreChar();
      if (char && Array.isArray(subs)) {
        mySubmission = subs.find(s => String(s.character_id) === String(char._id)) || null;
      }
    }
    _lifecycleCache = { nextSession, activeCycle, mySubmission };
    return _lifecycleCache;
  } catch {
    return { nextSession: null, activeCycle: null, mySubmission: null };
  }
}

function _clearLifecycleCache() { _lifecycleCache = null; }

async function renderLifecycleCards() {
  const el = document.getElementById('lifecycle-cards');
  if (!el) return;

  const { nextSession, activeCycle, mySubmission } = await _loadLifecycleData();
  const today = new Date().toISOString().slice(0, 10);

  let h = '';

  // Feeding card: game phase open AND player hasn't rolled yet
  const feedingOpen = nextSession && nextSession.session_date >= today;
  const hasRolled = mySubmission?.feeding_roll_player != null;
  if (feedingOpen && !hasRolled) {
    h += `<button class="lifecycle-card lifecycle-card-feeding" onclick="goTab('feeding')">
      <span class="lifecycle-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/></svg></span>
      <span class="lifecycle-card-text">
        <span class="lifecycle-card-title">Your feeding roll is ready</span>
        <span class="lifecycle-card-sub">Tap to roll before game night</span>
      </span>
      <span class="lifecycle-card-arr">›</span>
    </button>`;
  }

  // DT deadline card: active cycle with deadline within 7 days
  if (activeCycle?.deadline_at) {
    const deadline = new Date(activeCycle.deadline_at);
    const daysLeft = Math.ceil((deadline - new Date()) / 86400000);
    if (daysLeft > 0 && daysLeft <= 7) {
      const urgency = daysLeft <= 3 ? ' lifecycle-card-urgent' : '';
      const deadlineStr = deadline.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
      h += `<button class="lifecycle-card${urgency}" onclick="goTab('downtime')">
        <span class="lifecycle-card-icon"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg></span>
        <span class="lifecycle-card-text">
          <span class="lifecycle-card-title">Downtime due ${deadlineStr}</span>
          <span class="lifecycle-card-sub">${daysLeft} day${daysLeft !== 1 ? 's' : ''} remaining</span>
        </span>
        <span class="lifecycle-card-arr">›</span>
      </button>`;
    }
  }

  el.innerHTML = h;
  el.style.display = h ? '' : 'none';
}

/** Show logged-in user in header (desktop mode only — mobile uses Settings tab). */
function renderUserHeader() {
  const user = getUser();
  if (!user) return;

  // Desktop sidebar shows profile; mobile header is kept clean (logo + char name only).
  // The hdr-nav is hidden on mobile via CSS but visible in desktop mode.
  const hdrNav = document.getElementById('hdr-nav');
  if (hdrNav && document.body.classList.contains('desktop-mode')) {
    hdrNav.style.display = '';
  }

  // Show toggle for STs, restore saved label
  const toggleBtn = document.getElementById('btn-view-toggle');
  if (toggleBtn && getRole() === 'st') {
    toggleBtn.style.display = '';
    toggleBtn.textContent = _viewMode === 'st' ? 'Player View' : 'ST View';
    toggleBtn.classList.toggle('view-toggle-active', _viewMode === 'player');
  }

  // Returning ST who last left in player mode — re-enter player view
  if (getRole() === 'st' && _viewMode === 'player') {
    applyRoleRestrictions();
    _enterPlayerView();
  }
}

function toggleProfileMenu() {
  const menu = document.getElementById('hdr-profile-menu');
  if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none';
}

function toggleViewMode() {
  _viewMode = _viewMode === 'st' ? 'player' : 'st';
  localStorage.setItem(VIEW_MODE_KEY, _viewMode);
  applyRoleRestrictions();
  if (_viewMode === 'player') {
    _enterPlayerView();
  } else {
    _enterSTView();
  }
}

function _enterPlayerView() {
  const info = getPlayerInfo();
  const ids = info?.character_ids || [];
  if (!ids.length) {
    goTab('editor');
    const shContent = document.getElementById('sh-content');
    if (shContent) shContent.innerHTML = '<div class="dtl-empty">No character detected — ask your Storyteller to link your Discord account.</div>';
    return;
  }
  const idx = editorState.chars.findIndex(c => ids.includes(String(c._id)));
  if (idx >= 0) openChar(idx);
  else goTab('dice');
}

function _enterSTView() {
  goTab('chars');
}

// Expose functions used in inline onclick handlers
window.goTab  = goTab;
window.logout = logout;
window.playerGoDowntime  = playerGoDowntime;
window.openRulesOverlay  = openRulesOverlay;
window.closeRulesOverlay = closeRulesOverlay;
window.toggleViewMode    = toggleViewMode;
window.toggleProfileMenu = toggleProfileMenu;
window.suiteStatusOpenEdit   = suiteStatusOpenEdit;
window.suiteStatusCloseEdit  = suiteStatusCloseEdit;
window.suiteStatusAdjustCity = suiteStatusAdjustCity;

boot();
const logo = document.getElementById('topbar-logo');
if (logo) logo.src = ICONS.TM_logo;
