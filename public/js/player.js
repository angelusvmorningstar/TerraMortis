/* Player portal entry point — auth gate, tab routing, character loading, read-only sheet */

import { apiGet } from './data/api.js';
import { esc, displayName } from './data/helpers.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser, getPlayerInfo, getRole } from './auth/discord.js';
import { renderSheet, toggleExp, toggleDisc } from './editor/sheet.js';
import { initOrdeals } from './player/ordeals-view.js';
import { renderDowntimeTab } from './player/downtime-form.js';
import { renderRegencyTab } from './player/regency-tab.js';
import { renderFeedingTab } from './player/feeding-tab.js';
import { renderStoryTab } from './player/story-tab.js';
import { renderXpLogTab } from './player/xp-log-tab.js';
import { startWizard } from './player/wizard.js';
import state from './data/state.js';

let chars = [];
let activeChar = null;
let retiredChars = [];

// Expose sheet helpers to onclick handlers in rendered HTML
window.toggleExp = toggleExp;
window.toggleDisc = toggleDisc;

// ── Auth gate ──

async function boot() {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('player-app');
  const errorEl = document.getElementById('login-error');

  try {
    await handleCallback();
  } catch (err) {
    errorEl.textContent = err.message;
    return;
  }

  if (isLoggedIn()) {
    const valid = await validateToken();
    if (valid) {
      loginScreen.style.display = 'none';
      app.style.display = '';
      renderSidebarUser();
      await loadCharacters();
      return;
    }
  }

  loginScreen.style.display = '';
  document.getElementById('login-btn').addEventListener('click', login);
}

// ── Sidebar user ──

function renderSidebarUser() {
  const user = getUser();
  if (!user) return;

  const el = document.getElementById('sidebar-user');
  const name = esc(user.global_name || user.username);
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

  // Show ST Admin link for dual-role users
  if (getUser()?.role === 'st') {
    const adminLink = document.getElementById('nav-admin');
    if (adminLink) adminLink.style.display = '';
  }

  el.innerHTML =
    `<img class="sidebar-avatar" src="${avatarUrl}" alt="">` +
    `<span class="sidebar-username">${name}</span>` +
    `<button class="sidebar-logout" id="logout-btn">Log out</button>`;

  document.getElementById('logout-btn').addEventListener('click', logout);
}

// ── Character loading ──

async function loadCharacters() {
  try {
    chars = await apiGet(getRole() === 'st' ? '/api/characters' : '/api/characters?mine=1');
    // Sanitise: strip zero-dot disciplines (treated as absent)
    chars.forEach(c => { if (c.disciplines) for (const [k, v] of Object.entries(c.disciplines)) { if (v === 0) delete c.disciplines[k]; } });
  } catch (err) {
    document.getElementById('sh-content').innerHTML =
      `<p class="placeholder-msg">Failed to load characters: ${esc(err.message)}</p>`;
    return;
  }

  // Check for wizard / pending states before rendering normal UI
  if (!chars.length) {
    showWizard();
    return;
  }

  const approvedChars = chars.filter(c => !c.pending_approval && !c.retired);
  if (!approvedChars.length) {
    const pendingChars = chars.filter(c => c.pending_approval);
    if (pendingChars.length) {
      showPending();
    } else {
      showWizard();
    }
    return;
  }

  // Split active and retired characters (from approved pool)
  retiredChars = chars.filter(c => c.retired && !c.pending_approval);
  const activeChars = approvedChars;

  // Populate shared state so renderSheet can access chars
  state.chars = chars;
  state.editMode = false;

  // Character selector (shown if multiple active characters)
  const selector = document.getElementById('char-selector');
  if (activeChars.length > 1) {
    selector.style.display = '';
    selector.innerHTML = activeChars.map((c, i) =>
      `<option value="${i}">${esc(displayName(c))}</option>`
    ).join('');
    selector.addEventListener('change', () => selectCharacter(activeChars, Number(selector.value)));
  }

  // Show Archive tab if any retired characters exist
  if (retiredChars.length) {
    const archiveBtn = document.getElementById('tab-btn-archive');
    if (archiveBtn) archiveBtn.style.display = '';
    renderArchiveTab();
  }

  if (!activeChars.length) {
    document.getElementById('sh-content').innerHTML =
      `<p class="placeholder-msg">All your characters are retired. See the Archive tab.</p>`;
    return;
  }

  selectCharacter(activeChars, 0);
}

function showWizard() {
  document.getElementById('player-body').style.display = 'none';
  document.getElementById('pending-container').style.display = 'none';
  const wizEl = document.getElementById('wizard-container');
  wizEl.style.display = '';
  startWizard(wizEl, async (createdChar) => {
    // Wizard complete — reload characters and boot normal portal
    wizEl.style.display = 'none';
    document.getElementById('player-body').style.display = '';
    chars = [];
    activeChar = null;
    retiredChars = [];
    await loadCharacters();
  });
}

function showPending() {
  document.getElementById('player-body').style.display = 'none';
  document.getElementById('wizard-container').style.display = 'none';
  document.getElementById('pending-container').style.display = '';
}

function selectCharacter(activeChars, idx) {
  activeChar = activeChars[idx];
  state.editIdx = chars.indexOf(activeChar);
  renderSheet(activeChar);
  initOrdeals(activeChar, chars);
  renderDowntimeTab(document.getElementById('tab-downtime'), activeChar);
  renderFeedingTab(document.getElementById('feeding-content'), activeChar);
  renderStoryTab(document.getElementById('story-content'), activeChar);
  renderXpLogTab(document.getElementById('tab-xplog'), activeChar);

  // Regency tab — only visible for regents
  const regBtn = document.getElementById('tab-btn-regency');
  if (activeChar.regent_territory) {
    if (regBtn) regBtn.style.display = '';
    renderRegencyTab(document.getElementById('regency-content'), activeChar);
  } else {
    if (regBtn) regBtn.style.display = 'none';
  }
}

function renderArchiveTab() {
  const el = document.getElementById('archive-content');
  if (!el || !retiredChars.length) return;

  let h = '<div class="archive-list">';
  for (const c of retiredChars) {
    h += `<div class="archive-char">`;
    h += `<h3 class="archive-char-name">${esc(displayName(c))} <span class="archive-badge">Retired</span></h3>`;
    h += `<div id="archive-sh-${esc(String(c._id))}" class="cd-sheet"></div>`;
    h += `</div>`;
  }
  h += '</div>';
  el.innerHTML = h;

  // Render each retired character's sheet into its container
  for (const c of retiredChars) {
    const target = document.getElementById(`archive-sh-${String(c._id)}`);
    if (target) renderSheet(c, target);
  }
}

// ── Tab switching ──

document.getElementById('sidebar').addEventListener('click', e => {
  const btn = e.target.closest('.sidebar-btn');
  if (!btn || !btn.dataset.tab) return;

  document.querySelectorAll('.sidebar-btn').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  btn.classList.add('on');
  const panel = document.getElementById('tab-' + btn.dataset.tab);
  if (panel) panel.classList.add('active');
});

// ── Boot ──

boot();
