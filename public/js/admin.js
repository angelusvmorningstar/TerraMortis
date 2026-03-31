/* Admin app entry point — auth gate, sidebar routing, API data loading */

import { apiGet, apiPut } from './data/api.js';
import { esc, clanIcon, covIcon, shortCov } from './data/helpers.js';
import { xpLeft, xpEarned } from './editor/xp.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser } from './auth/discord.js';
import { initSessionLog } from './admin/session-log.js';
import { initCityView } from './admin/city-views.js';
import { initDowntimeView } from './admin/downtime-views.js';

const CLANS = ['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue'];
const COVENANTS = ['Carthian Movement', 'Circle of the Crone', 'Invictus', 'Lancea et Sanctum', 'Ordo Dracul'];
const COURT_TITLES = ['', 'Head of State', 'Primogen', 'Socialite', 'Enforcer', 'Administrator', 'Regent'];
const REGENT_TERRITORIES = ['The Academy', 'The North Shore', 'The Dockyards', 'The Second City', 'The Harbour'];

let chars = [];
let selectedChar = null;

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

  if (domain === 'engine') initSessionLog();
  if (domain === 'city') initCityView();
  if (domain === 'downtime') initDowntimeView();
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

  grid.innerHTML = sorted.map((c, i) => {
    const bp = c.blood_potency || 1;
    const hum = c.humanity != null ? c.humanity : '?';
    const xpL = xpLeft(c);
    const title = c.court_title ? `<span class="cc-tag title">${esc(c.court_title)}</span>` : '';
    const ci = covIcon(c.covenant, 28) + clanIcon(c.clan, 28);

    return `<div class="char-card" data-id="${c._id}">
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

  // Card click handler
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
  const panel = document.getElementById('char-detail');
  const st = c.status || {};
  const isRegent = c.court_title === 'Regent';

  const opts = (arr, current, allowEmpty) => {
    let h = allowEmpty ? '<option value="">\u2014</option>' : '';
    h += arr.map(v => `<option${v === current ? ' selected' : ''}>${esc(v)}</option>`).join('');
    return h;
  };

  panel.innerHTML = `
    <div class="cd-header">
      <h3 class="cd-name">${esc(c.name)}</h3>
      <span class="cd-player">${esc(c.player || '')}</span>
      <button class="cd-close" id="cd-close">&times;</button>
    </div>
    <div class="cd-grid">
      <label class="cd-field">
        <span class="cd-label">Clan</span>
        <select id="cd-clan">${opts(CLANS, c.clan)}</select>
      </label>
      <label class="cd-field">
        <span class="cd-label">Covenant</span>
        <select id="cd-covenant">${opts(COVENANTS, c.covenant)}</select>
      </label>
      <label class="cd-field">
        <span class="cd-label">Bloodline</span>
        <input type="text" id="cd-bloodline" value="${esc(c.bloodline || '')}">
      </label>
      <label class="cd-field">
        <span class="cd-label">Court Title</span>
        <select id="cd-title">${opts(COURT_TITLES, c.court_title || '', true)}</select>
      </label>
      <label class="cd-field ${isRegent ? '' : 'cd-hidden'}" id="cd-territory-field">
        <span class="cd-label">Regent Territory</span>
        <select id="cd-territory"><option value="">\u2014</option>${REGENT_TERRITORIES.map(t => `<option${t === c.regent_territory ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>
      </label>
      <label class="cd-field">
        <span class="cd-label">Blood Potency</span>
        <input type="number" id="cd-bp" min="0" max="10" value="${c.blood_potency || 1}">
      </label>
      <label class="cd-field">
        <span class="cd-label">Humanity</span>
        <input type="number" id="cd-humanity" min="0" max="10" value="${c.humanity != null ? c.humanity : 7}">
      </label>
      <label class="cd-field">
        <span class="cd-label">City Status</span>
        <input type="number" id="cd-city" min="0" max="5" value="${st.city || 0}">
      </label>
      <label class="cd-field">
        <span class="cd-label">Clan Status</span>
        <input type="number" id="cd-clan-status" min="0" max="5" value="${st.clan || 0}">
      </label>
      <label class="cd-field">
        <span class="cd-label">Covenant Status</span>
        <input type="number" id="cd-cov-status" min="0" max="5" value="${st.covenant || 0}">
      </label>
    </div>
    <div class="cd-actions">
      <button class="cd-save" id="cd-save">Save</button>
      <span class="cd-status" id="cd-status"></span>
    </div>`;

  panel.style.display = '';

  // Show/hide territory field when title changes
  document.getElementById('cd-title').addEventListener('change', e => {
    const field = document.getElementById('cd-territory-field');
    field.classList.toggle('cd-hidden', e.target.value !== 'Regent');
  });

  document.getElementById('cd-close').addEventListener('click', closeCharDetail);
  document.getElementById('cd-save').addEventListener('click', saveCharDetail);

  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeCharDetail() {
  selectedChar = null;
  document.getElementById('char-detail').style.display = 'none';
}

async function saveCharDetail() {
  if (!selectedChar) return;
  const statusEl = document.getElementById('cd-status');
  const title = document.getElementById('cd-title').value;

  const updates = {
    clan: document.getElementById('cd-clan').value,
    covenant: document.getElementById('cd-covenant').value,
    bloodline: document.getElementById('cd-bloodline').value || null,
    court_title: title || null,
    regent_territory: title === 'Regent' ? (document.getElementById('cd-territory').value || null) : null,
    blood_potency: parseInt(document.getElementById('cd-bp').value) || 1,
    humanity: parseInt(document.getElementById('cd-humanity').value),
    status: {
      ...(selectedChar.status || {}),
      city: parseInt(document.getElementById('cd-city').value) || 0,
      clan: parseInt(document.getElementById('cd-clan-status').value) || 0,
      covenant: parseInt(document.getElementById('cd-cov-status').value) || 0,
    },
  };

  try {
    const updated = await apiPut('/api/characters/' + selectedChar._id, updates);
    // Update local cache
    const idx = chars.findIndex(c => c._id === selectedChar._id);
    if (idx !== -1) Object.assign(chars[idx], updated);
    selectedChar = updated;

    statusEl.textContent = 'Saved';
    statusEl.className = 'cd-status cd-saved';
    setTimeout(() => { statusEl.textContent = ''; }, 2000);

    renderCharGrid();
  } catch (err) {
    statusEl.textContent = 'Error: ' + err.message;
    statusEl.className = 'cd-status cd-error';
  }
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
