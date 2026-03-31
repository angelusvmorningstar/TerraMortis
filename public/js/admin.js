/* Admin app entry point — auth gate, sidebar routing, API data loading */

import { apiGet } from './data/api.js';
import { esc, clanIcon, covIcon, shortCov } from './data/helpers.js';
import { xpLeft, xpEarned } from './editor/xp.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser } from './auth/discord.js';

let chars = [];

// ── Auth gate ──

async function boot() {
  const loginScreen = document.getElementById('login-screen');
  const app = document.getElementById('admin-app');
  const errorEl = document.getElementById('login-error');

  // Handle OAuth callback (page loaded with ?code=...)
  try {
    const wasCallback = await handleCallback();
    if (wasCallback) {
      // Successfully exchanged code — fall through to show app
    }
  } catch (err) {
    errorEl.textContent = err.message;
    return;
  }

  // Check if we have a valid token
  if (isLoggedIn()) {
    const valid = await validateToken();
    if (valid) {
      loginScreen.style.display = 'none';
      app.style.display = 'flex';
      renderSidebarUser();
      init();
      return;
    }
  }

  // Not authenticated — show login screen
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

  el.innerHTML = `<img class="sidebar-avatar" src="${avatarUrl}" alt="">` +
    `<span class="sidebar-username">${name}</span>` +
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

  const sorted = [...chars].sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = sorted.map(c => {
    const bp = c.blood_potency || 1;
    const hum = c.humanity != null ? c.humanity : '?';
    const xpL = xpLeft(c);
    const title = c.court_title ? `<span class="cc-tag title">${esc(c.court_title)}</span>` : '';
    const ci = covIcon(c.covenant, 28) + clanIcon(c.clan, 28);

    return `<div class="char-card">
      <div class="cc-top">
        <div style="display:flex;gap:4px;flex-shrink:0">${ci}</div>
        <div class="cc-identity"><span class="cc-name">${esc(c.name)}</span><br><span class="cc-player">${esc(c.player || '')}</span></div>
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
  }).join('');

  count.textContent = sorted.length + ' characters';
}

// ── Init ──

async function init() {
  try {
    chars = await apiGet('/api/characters');
    renderCharGrid();
  } catch (err) {
    console.error('Failed to load characters:', err.message);
    document.getElementById('char-grid').innerHTML =
      `<p class="placeholder">Failed to load characters from API. Is the server running?</p>`;
  }
}

boot();
