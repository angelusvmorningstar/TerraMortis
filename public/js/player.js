/* Player portal entry point — auth gate, tab routing, character loading, read-only sheet */

import { apiGet } from './data/api.js';
import { esc, displayName } from './data/helpers.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser, getPlayerInfo } from './auth/discord.js';
import { renderSheet, toggleExp, toggleDisc } from './editor/sheet.js';
import { initOrdeals } from './player/ordeals-view.js';
import { renderDowntimeTab } from './player/downtime-form.js';
import { renderRegencyTab } from './player/regency-tab.js';
import { renderFeedingTab } from './player/feeding-tab.js';
import state from './data/state.js';

let chars = [];
let activeChar = null;

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
      renderHeaderUser();
      await loadCharacters();
      return;
    }
  }

  loginScreen.style.display = '';
  document.getElementById('login-btn').addEventListener('click', login);
}

// ── Header user ──

function renderHeaderUser() {
  const user = getUser();
  if (!user) return;

  const el = document.getElementById('header-user');
  const name = esc(user.global_name || user.username);
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
    : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

  const role = getUser()?.role;

  // Cross-app nav buttons — alongside char selector
  const selectorArea = document.querySelector('.header-controls');
  if (selectorArea && !document.getElementById('nav-game')) {
    const gameBtn = document.createElement('a');
    gameBtn.id = 'nav-game';
    gameBtn.href = '/';
    gameBtn.className = 'app-nav-btn';
    gameBtn.textContent = 'Game App';
    selectorArea.insertBefore(gameBtn, selectorArea.firstChild);

    if (role === 'st') {
      const adminBtn = document.createElement('a');
      adminBtn.id = 'nav-admin';
      adminBtn.href = '/admin';
      adminBtn.className = 'app-nav-btn';
      adminBtn.textContent = 'ST Admin';
      selectorArea.insertBefore(adminBtn, gameBtn.nextSibling);
    }
  }

  el.innerHTML =
    `<img class="header-avatar" src="${avatarUrl}" alt="">` +
    `<span class="header-username">${name}</span>` +
    `<button class="header-logout" id="logout-btn">Log out</button>`;

  document.getElementById('logout-btn').addEventListener('click', logout);
}

// ── Character loading ──

async function loadCharacters() {
  try {
    chars = await apiGet('/api/characters');
  } catch (err) {
    document.getElementById('sh-content').innerHTML =
      `<p class="placeholder-msg">Failed to load characters: ${esc(err.message)}</p>`;
    return;
  }

  if (!chars.length) {
    document.getElementById('sh-content').innerHTML =
      `<p class="placeholder-msg">No characters found. Contact an ST to get started.</p>`;
    return;
  }

  // Populate shared state so renderSheet can access chars
  state.chars = chars;
  state.editMode = false;

  // Character selector (shown if multiple characters)
  const selector = document.getElementById('char-selector');
  if (chars.length > 1) {
    selector.style.display = '';
    selector.innerHTML = chars.map((c, i) =>
      `<option value="${i}">${esc(displayName(c))}</option>`
    ).join('');
    selector.addEventListener('change', () => selectCharacter(Number(selector.value)));
  }

  selectCharacter(0);
}

function selectCharacter(idx) {
  activeChar = chars[idx];
  state.editIdx = idx;
  renderSheet(activeChar);
  initOrdeals(activeChar, chars);
  renderDowntimeTab(document.getElementById('tab-downtime'), activeChar);
  renderFeedingTab(document.getElementById('feeding-content'), activeChar);

  // Regency tab — only visible for regents
  const regBtn = document.getElementById('tab-btn-regency');
  if (activeChar.regent_territory) {
    if (regBtn) regBtn.style.display = '';
    renderRegencyTab(document.getElementById('regency-content'), activeChar);
  } else {
    if (regBtn) regBtn.style.display = 'none';
  }
}

// ── Tab switching ──

document.getElementById('tab-bar').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('on'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  btn.classList.add('on');
  const panel = document.getElementById('tab-' + btn.dataset.tab);
  if (panel) panel.classList.add('active');
});

// ── Boot ──

boot();
