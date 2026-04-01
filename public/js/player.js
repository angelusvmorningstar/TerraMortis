/* Player portal entry point — auth gate, tab routing, character loading, read-only sheet */

import { apiGet } from './data/api.js';
import { esc, displayName } from './data/helpers.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser, getPlayerInfo } from './auth/discord.js';
import { renderSheet, toggleExp, toggleDisc } from './editor/sheet.js';
import { initOrdeals } from './player/ordeals-view.js';
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

  const info = getPlayerInfo();
  const adminLink = info?.is_dual_role
    ? `<a href="admin" class="header-admin-link">ST Admin</a>`
    : '';

  el.innerHTML =
    `${adminLink}` +
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
