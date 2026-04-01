/* Admin app entry point — auth gate, sidebar routing, API data loading, character editing */

import { apiGet, apiPut } from './data/api.js';
import { downloadCSV } from './editor/export.js';
import { esc, clanIcon, covIcon, shortCov, displayName, sortName } from './data/helpers.js';
import { xpLeft, xpEarned } from './editor/xp.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser, getPlayerInfo } from './auth/discord.js';
import { initSessionLog } from './admin/session-log.js';
import { initCityView } from './admin/city-views.js';
import { initDowntimeView } from './admin/downtime-views.js';
import { initAttendance } from './admin/attendance.js';
import { initDiceEngine } from './admin/dice-engine.js';
import { initFeedingEngine } from './admin/feeding-engine.js';
import { renderSheet, toggleExp, toggleDisc } from './editor/sheet.js';
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
import { printSheet } from './editor/print.js';
import editorState from './data/state.js';

const CLANS = ['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue'];
const COVENANTS = ['Carthian Movement', 'Circle of the Crone', 'Invictus', 'Lancea et Sanctum', 'Ordo Dracul'];
const COURT_TITLES = ['', 'Head of State', 'Primogen', 'Socialite', 'Enforcer', 'Administrator', 'Regent'];
const REGENT_TERRITORIES = ['The Academy', 'The North Shore', 'The Dockyards', 'The Second City', 'The Harbour'];

let chars = [];
let selectedChar = null;

// ── Editor wiring ──

function markDirty(idx) {
  if (idx === undefined) idx = editorState.editIdx;
  if (idx < 0) return;
  editorState.dirty.add(idx);
  const badge = document.getElementById('cd-dirty-badge');
  if (badge) badge.style.display = editorState.dirty.size > 0 ? '' : 'none';
}

registerEditCallbacks(markDirty, renderSheet);
registerIdentityCallbacks(markDirty, xpLeft);
registerAttrsCallbacks(markDirty);

// ── Auth gate ──

async function boot() {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('admin-app');
  const errorEl = document.getElementById('login-error');

  try {
    const wasCallback = await handleCallback();
    if (wasCallback) { /* fall through */ }
  } catch (err) {
    errorEl.textContent = err.message;
    return;
  }

  if (isLoggedIn()) {
    const valid = await validateToken();
    if (valid) {
      // Check if user was logging in from another page (index, player)
      const returnTo = localStorage.getItem('tm_auth_return');
      localStorage.removeItem('tm_auth_return');
      if (returnTo && returnTo !== '/admin' && returnTo !== '/admin.html') {
        window.location.href = returnTo;
        return;
      }

      // Player-only users get redirected to the player portal
      const info = getPlayerInfo();
      if (info && info.role === 'player') {
        window.location.href = '/player';
        return;
      }

      loginScreen.style.display = 'none';
      app.style.display = 'flex';
      renderSidebarUser();
      init();
      return;
    }
  }

  loginScreen.style.display = '';
  document.getElementById('login-btn').addEventListener('click', login);
}

function renderSidebarUser() {
  const user = getUser();
  if (!user) return;

  const el = document.getElementById('sidebar-user');
  const name = esc(user.global_name || user.username);
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

  const info = getPlayerInfo();
  const playerLink = info?.is_dual_role
    ? `<a href="player" class="sidebar-player-link">My Character</a>`
    : '';

  el.innerHTML = `<img class="sidebar-avatar" src="${avatarUrl}" alt="">` +
    `<span class="sidebar-username">${name}</span>` +
    `${playerLink}` +
    `<button class="sidebar-logout" id="logout-btn">Log out</button>`;

  document.getElementById('logout-btn').addEventListener('click', logout);
}

// ── Domain switching ──

function switchDomain(domain) {
  document.querySelectorAll('.domain').forEach(d => d.classList.remove('active'));
  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('on'));

  const target = document.getElementById('d-' + domain);
  const btn = document.querySelector(`.sidebar-btn[data-domain="${domain}"]`);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('on');

  if (domain === 'engine') { initDiceEngine(chars); initFeedingEngine(chars); initSessionLog(); }
  if (domain === 'city') initCityView();
  if (domain === 'downtime') initDowntimeView();
  if (domain === 'attendance') initAttendance(chars);
}

document.getElementById('sidebar').addEventListener('click', e => {
  const btn = e.target.closest('.sidebar-btn');
  if (!btn) return;
  switchDomain(btn.dataset.domain);
});

// ── Character grid rendering ──

function renderCharGrid() {
  const grid = document.getElementById('char-grid');
  const count = document.getElementById('char-count');

  const sorted = [...chars].sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const active = sorted.filter(c => !c.retired);
  const retired = sorted.filter(c => c.retired);

  function charCard(c) {
    const bp = c.blood_potency || 1;
    const hum = c.humanity != null ? c.humanity : '?';
    const xpL = xpLeft(c);
    const title = c.court_title ? `<span class="cc-tag title">${esc(c.court_title)}</span>` : '';
    const ci = covIcon(c.covenant, 28) + clanIcon(c.clan, 28);

    return `<div class="char-card${c.retired ? ' retired' : ''}" data-id="${c._id}">
      <div class="cc-top">
        <div style="display:flex;gap:4px;flex-shrink:0">${ci}</div>
        <div class="cc-identity"><span class="cc-name">${esc(displayName(c))}</span><br><span class="cc-player">${esc(c.player || '')}</span></div>
      </div>
      <div class="cc-mid">
        <span class="cc-tag cov">${covIcon(c.covenant, 14)} ${esc(shortCov(c.covenant))}</span>
        <span class="cc-tag clan">${clanIcon(c.clan, 14)} ${esc(c.clan || '?')}</span>
        ${c.bloodline ? `<span class="cc-tag">${esc(c.bloodline)}</span>` : ''}
        ${title}
      </div>
      <div class="cc-bot">
        <span>BP <span class="val">${bp}</span></span>
        <span>Hum <span class="val">${hum}</span></span>
        <span>XP <span class="val">${xpL}/${xpEarned(c)}</span></span>
      </div>
    </div>`;
  }

  let html = active.map(charCard).join('');
  if (retired.length) {
    html += `<div class="retired-divider"><span>Retired</span></div>`;
    html += retired.map(charCard).join('');
  }
  grid.innerHTML = html;

  count.textContent = active.length + ' active' + (retired.length ? ', ' + retired.length + ' retired' : '');

  grid.addEventListener('click', e => {
    const card = e.target.closest('.char-card');
    if (!card) return;
    const id = card.dataset.id;
    const c = chars.find(ch => ch._id === id);
    if (c) openCharDetail(c);
  });
}

// ── Character detail panel ──

function openCharDetail(c) {
  selectedChar = c;
  editorState.chars = chars;
  editorState.editIdx = chars.indexOf(c);
  editorState.editMode = false;
  editorState.dirty.clear();

  const panel = document.getElementById('char-detail');

  panel.innerHTML = `
    <div class="cd-header">
      <h3 class="cd-name">${esc(displayName(c))}</h3>
      <span class="cd-player">${esc(c.player || '')}</span>
      <div class="cd-header-actions">
        <span class="cd-dirty-badge" id="cd-dirty-badge" style="display:none">Unsaved</span>
        <button class="dt-btn" id="cd-edit-toggle">Edit</button>
        <button class="dt-btn" id="cd-print">Print</button>
        <button class="dt-btn" id="cd-save-api" style="display:none">Save to DB</button>
        <a class="dt-btn cd-player-view" href="player.html" id="cd-player-view">Player View</a>
        <button class="dt-btn retire-btn" id="cd-retire">${c.retired ? 'Unretire' : 'Retire'}</button>
        <button class="cd-close" id="cd-close">&times;</button>
      </div>
    </div>
    <div id="sh-content" class="cd-sheet"></div>`;

  panel.style.display = '';
  renderSheet(c);

  document.getElementById('cd-close').addEventListener('click', closeCharDetail);
  document.getElementById('cd-print').addEventListener('click', () => printSheet());
  document.getElementById('cd-edit-toggle').addEventListener('click', () => {
    editorState.editMode = !editorState.editMode;
    const btn = document.getElementById('cd-edit-toggle');
    const saveBtn = document.getElementById('cd-save-api');
    btn.textContent = editorState.editMode ? 'View' : 'Edit';
    saveBtn.style.display = editorState.editMode ? '' : 'none';
    renderSheet(chars[editorState.editIdx]);
  });
  document.getElementById('cd-save-api').addEventListener('click', saveCharToApi);
  document.getElementById('cd-retire').addEventListener('click', toggleRetire);

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function toggleRetire() {
  const idx = editorState.editIdx;
  const c = chars[idx];
  if (!c || !c._id) return;

  const newState = !c.retired;
  const action = newState ? 'retire' : 'unretire';
  if (!confirm(`${action.charAt(0).toUpperCase() + action.slice(1)} ${displayName(c)}?`)) return;

  const btn = document.getElementById('cd-retire');
  btn.textContent = 'Saving...';

  try {
    c.retired = newState || undefined;
    const { _id, ...body } = c;
    const updated = await apiPut('/api/characters/' + _id, body);
    Object.assign(chars[idx], updated);
    btn.textContent = newState ? 'Unretire' : 'Retire';
    renderCharGrid();
  } catch (err) {
    c.retired = !newState || undefined;
    btn.textContent = newState ? 'Retire' : 'Unretire';
    console.error('Retire failed:', err.message);
  }
}

function closeCharDetail() {
  if (editorState.dirty.size > 0) {
    if (!confirm('You have unsaved changes. Close anyway?')) return;
  }
  selectedChar = null;
  editorState.editMode = false;
  editorState.dirty.clear();
  document.getElementById('char-detail').style.display = 'none';
}

async function saveCharToApi() {
  const idx = editorState.editIdx;
  const c = chars[idx];
  if (!c || !c._id) return;

  const saveBtn = document.getElementById('cd-save-api');
  saveBtn.textContent = 'Saving...';

  try {
    const { _id, ...body } = c;
    const updated = await apiPut('/api/characters/' + _id, body);
    Object.assign(chars[idx], updated);
    selectedChar = chars[idx];
    editorState.dirty.clear();

    const badge = document.getElementById('cd-dirty-badge');
    if (badge) badge.style.display = 'none';
    saveBtn.textContent = 'Saved \u2713';
    setTimeout(() => { saveBtn.textContent = 'Save to DB'; }, 2000);

    renderCharGrid();
  } catch (err) {
    saveBtn.textContent = 'Error';
    console.error('Save failed:', err.message);
    setTimeout(() => { saveBtn.textContent = 'Save to DB'; }, 2000);
  }
}

// ── Init ──

/**
 * Compute game XP per character from game_sessions attendance data.
 * Caches result as c._gameXP for use by xpGame().
 */
async function loadGameXP() {
  try {
    const gameSessions = await apiGet('/api/game_sessions');
    for (const c of chars) c._gameXP = 0;

    for (const s of gameSessions) {
      for (const a of s.attendance || []) {
        const xp = (a.attended ? 1 : 0) + (a.costuming ? 1 : 0) + (a.downtime ? 1 : 0) + (a.extra || 0);
        if (xp === 0) continue;

        // Find matching character by any available key
        const c = chars.find(ch =>
          (a.character_id && ch._id === a.character_id) ||
          ch.name === a.character_name ||
          ch.name === a.name ||
          displayName(ch) === (a.display_name || a.character_display)
        );
        if (c) c._gameXP += xp;
      }
    }
  } catch (err) {
    console.warn('Could not load game sessions for XP:', err.message);
  }
}

async function init() {
  try {
    chars = await apiGet('/api/characters');
    await loadGameXP();
    renderCharGrid();
  } catch (err) {
    console.error('Failed to load characters:', err.message);
    document.getElementById('char-grid').innerHTML =
      `<p class="placeholder">Failed to load characters from API. Is the server running?</p>`;
  }
}

// ── Window registrations (needed by inline onclick in rendered sheet HTML) ──

Object.assign(window, {
  toggleExp, toggleDisc, renderSheet, editFromSheet: () => {
    editorState.editMode = true;
    document.getElementById('cd-edit-toggle').textContent = 'View';
    document.getElementById('cd-save-api').style.display = '';
    renderSheet(chars[editorState.editIdx]);
  },
  downloadCSV: () => downloadCSV(chars),
  markDirty, printSheet,
  shEdit, shEditStatus,
  shEditBaneName, shEditBaneEffect, shRemoveBane, shAddBane,
  shEditTouchstone, shAddTouchstone, shRemoveTouchstone,
  shEditBP, shEditHumanity, shStatusUp, shStatusDown,
  shToggleOrdeal, shSetPriority, shSetClanAttr, shEditAttrPt,
  shSetSkillPriority, shEditSkillPt,
  shEditSpec, shRemoveSpec, shAddSpec,
  shEditDiscPt, shShowDevSelect, shAddDevotion, shRemoveDevotion,
  shEditInflMerit, shEditStatusMode, shRemoveInflMerit, shAddInflMerit,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill,
  shToggleMCI, shEditMCIGrant, shAddStandMCI, shAddStandPT, shEditMeritPt, shEditXP,
  clickAttrDot, adjAttrBonus, clickSkillDot, toggleNineAgain, adjSkillBonus, updSkillSpec,
  updField, updStatus,
  renderIdentityTab, renderAttrsTab,
});

boot();
