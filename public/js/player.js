/* Player portal entry point — auth gate, tab routing, character loading, read-only sheet */

import { apiGet, apiPut } from './data/api.js';
import { loadGameXP } from './data/game-xp.js';
import { esc, displayName, sortName, discordAvatarUrl, findRegentTerritory } from './data/helpers.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser, getPlayerInfo, getRole, isSTRole } from './auth/discord.js';
import { renderSheet, toggleExp, toggleDisc } from './editor/sheet.js';
import { initOrdeals } from './player/ordeals-view.js';
import { renderDowntimeTab } from './player/downtime-form.js';
import { renderRegencyTab } from './player/regency-tab.js';
import { renderFeedingTab } from './player/feeding-tab.js';
import { renderStoryTab } from './player/story-tab.js';
import { initArchiveTab } from './player/archive-tab.js';
import { renderCityTab } from './player/city-tab.js';
import { renderStatusTab } from './player/status-tab.js';
import { renderPrimerTab } from './player/primer-tab.js';
import { renderTicketsTab } from './player/tickets-tab.js';
import { renderXpLogTab } from './player/xp-log-tab.js';
import { startWizard } from './player/wizard.js';
import { getActiveCycle, getGamePhaseCycle } from './downtime/db.js';
import { loadRulesFromApi } from './data/loader.js';
import state from './data/state.js';

let chars = [];
let activeChar = null;
let _territories = [];
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
  const avatarUrl = user.role === 'dev'
    ? discordAvatarUrl(null, null)
    : user.avatar
      ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=64`
      : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

  // Show ST Admin link for ST and dev-role users
  if (isSTRole()) {
    const adminLink = document.getElementById('nav-admin');
    if (adminLink) adminLink.style.display = '';
  }

  el.innerHTML =
    `<img class="sidebar-avatar sidebar-avatar-click" id="sidebar-avatar-btn" src="${avatarUrl}" alt="" title="Edit your profile">` +
    `<span class="sidebar-username">${name}</span>` +
    `<button class="sidebar-logout" id="logout-btn">Log out</button>`;

  document.getElementById('logout-btn').addEventListener('click', logout);
  document.getElementById('sidebar-avatar-btn')?.addEventListener('click', openProfileModal);
}

// ── Player profile modal ──

async function openProfileModal() {
  document.getElementById('profile-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'profile-modal';
  overlay.className = 'plm-overlay';
  document.getElementById('player-app').appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  overlay.innerHTML = '<div class="plm-dialog"><p class="plm-loading">Loading\u2026</p></div>';

  let player;
  try {
    player = await apiGet('/api/players/me');
  } catch (err) {
    overlay.querySelector('.plm-dialog').innerHTML = '<p class="plm-error">Failed to load profile: ' + esc(err.message) + '</p>';
    return;
  }

  const user = getUser();
  const dialog = overlay.querySelector('.plm-dialog');
  dialog.innerHTML = `
    <div class="plm-header">
      <h3>Your Profile</h3>
      <button class="cd-close" id="profile-close">&times;</button>
    </div>
    <div class="prof-readonly">
      <div class="prof-field"><span class="prof-label">Display Name</span><span>${esc(player.display_name || '')}</span></div>
      <div class="prof-field"><span class="prof-label">Discord</span><span>@${esc(player.discord_username || user?.username || '')}</span></div>
    </div>
    <div class="prof-form">
      <div class="prof-field"><label class="prof-label" for="prof-email">Email</label><input id="prof-email" type="email" class="plm-input" value="${esc(player.email || '')}" placeholder="your@email.com"></div>
      <div class="prof-field"><label class="prof-label" for="prof-mobile">Mobile</label><input id="prof-mobile" type="tel" class="plm-input" value="${esc(player.mobile || '')}" placeholder="+61 4xx xxx xxx"></div>
      <div class="prof-field"><label class="prof-label" for="prof-emergency-name">Emergency Contact</label><input id="prof-emergency-name" type="text" class="plm-input" value="${esc(player.emergency_contact_name || '')}" placeholder="Name"></div>
      <div class="prof-field"><label class="prof-label" for="prof-emergency-mobile">Emergency Mobile</label><input id="prof-emergency-mobile" type="tel" class="plm-input" value="${esc(player.emergency_contact_mobile || '')}" placeholder="+61 4xx xxx xxx"></div>
      <div class="prof-field prof-wide"><label class="prof-label" for="prof-medical">Medical Info</label><textarea id="prof-medical" class="plm-input" rows="3" placeholder="Allergies, conditions, medications...">${esc(player.medical_info || '')}</textarea></div>
    </div>
    <p class="prof-privacy">This information is only visible to Storytellers and is used for live game safety.</p>
    <div class="prof-actions">
      <button class="dt-btn" id="profile-save">Save</button>
      <button class="dt-btn" id="profile-cancel">Cancel</button>
      <span id="profile-status" class="plm-loading" style="display:none"></span>
    </div>`;

  document.getElementById('profile-close').addEventListener('click', () => overlay.remove());
  document.getElementById('profile-cancel').addEventListener('click', () => overlay.remove());
  document.getElementById('profile-save').addEventListener('click', async () => {
    const statusEl = document.getElementById('profile-status');
    statusEl.style.display = '';
    statusEl.textContent = 'Saving\u2026';
    try {
      await apiPut('/api/players/me', {
        email: document.getElementById('prof-email').value.trim() || null,
        mobile: document.getElementById('prof-mobile').value.trim() || null,
        medical_info: document.getElementById('prof-medical').value.trim() || null,
        emergency_contact_name: document.getElementById('prof-emergency-name').value.trim() || null,
        emergency_contact_mobile: document.getElementById('prof-emergency-mobile').value.trim() || null,
      });
      statusEl.textContent = 'Saved!';
      setTimeout(() => overlay.remove(), 800);
    } catch (err) {
      statusEl.textContent = 'Failed: ' + err.message;
    }
  });
}

// ── Character loading ──

async function loadCharacters() {
  // Load rules data (purchasable powers) — non-blocking, cached
  loadRulesFromApi().catch(() => {});

  try {
    chars = await apiGet(getRole() === 'st' ? '/api/characters' : '/api/characters?mine=1');
    // Sanitise: strip zero-dot disciplines (treated as absent)
    chars.forEach(c => { if (c.disciplines) for (const [k, v] of Object.entries(c.disciplines)) { if ((v?.dots ?? v) === 0) delete c.disciplines[k]; } });
    await loadGameXP(chars);
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

  // Split active and retired characters (from approved pool), both sorted
  retiredChars = chars.filter(c => c.retired && !c.pending_approval).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const activeChars = approvedChars.slice().sort((a, b) => sortName(a).localeCompare(sortName(b)));

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
    selector.addEventListener('change', () => {
      localStorage.setItem('tm_active_char', String(activeChars[Number(selector.value)]._id));
      selectCharacter(activeChars, Number(selector.value));
    });
  }

  // Archive tab always visible
  const archiveBtn = document.getElementById('tab-btn-archive');
  if (archiveBtn) archiveBtn.style.display = '';

  // Load territories for regent derivation
  try { _territories = await apiGet('/api/territories'); } catch { _territories = []; }

  // City, Primer, and Tickets tabs — render once, independent of active character
  renderCityTab(document.getElementById('tab-city'), _territories);
  renderPrimerTab(document.getElementById('tab-primer'));
  renderTicketsTab(document.getElementById('tickets-content'));

  // Sidebar cycle indicators (fire-and-forget)
  updateCycleIndicators();

  if (!activeChars.length) {
    document.getElementById('sh-content').innerHTML =
      `<p class="placeholder-msg">All your characters are retired. See the Archive tab.</p>`;
    return;
  }

  // Restore last active character from admin/previous session
  const savedCharId = localStorage.getItem('tm_active_char');
  const savedIdx = savedCharId ? activeChars.findIndex(c => String(c._id) === savedCharId) : -1;
  const startIdx = savedIdx >= 0 ? savedIdx : 0;
  if (selector && activeChars.length > 1) selector.value = String(startIdx);
  selectCharacter(activeChars, startIdx);
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
  renderDowntimeTab(document.getElementById('tab-downtime'), activeChar, _territories);
  renderFeedingTab(document.getElementById('feeding-content'), activeChar);
  renderStoryTab(document.getElementById('story-content'), activeChar);
  renderXpLogTab(document.getElementById('tab-xplog'), activeChar);
  renderStatusTab(document.getElementById('tab-status'), activeChar);
  initArchiveTab(document.getElementById('tab-archive'), activeChar, retiredChars);

  // Derive regent status from territories (single source of truth)
  const regInfo = findRegentTerritory(_territories, activeChar);

  // Regency tab — only visible for regents
  const regBtn = document.getElementById('tab-btn-regency');
  if (regInfo) {
    if (regBtn) regBtn.style.display = '';
    renderRegencyTab(document.getElementById('regency-content'), activeChar, _territories);
  } else {
    if (regBtn) regBtn.style.display = 'none';
  }
}

async function updateCycleIndicators() {
  try {
    const [active, game] = await Promise.all([
      getActiveCycle().catch(() => null),
      getGamePhaseCycle().catch(() => null),
    ]);
    const dtBtn = document.getElementById('tab-btn-downtime');
    const fdBtn = document.getElementById('tab-btn-feeding');
    if (dtBtn) dtBtn.classList.toggle('cycle-open', !!active);
    if (fdBtn) fdBtn.classList.toggle('cycle-open', !!game);
  } catch { /* offline — no indicators */ }
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

// ── Sidebar collapse ──

const SB_KEY = 'tm_sidebar_collapsed';
const appEl = document.getElementById('player-app');
if (localStorage.getItem(SB_KEY) === '1' || (window.innerWidth <= 1024 && localStorage.getItem(SB_KEY) !== '0')) {
  appEl.classList.add('sb-collapsed');
}
document.getElementById('sb-close').addEventListener('click', () => {
  appEl.classList.add('sb-collapsed');
  localStorage.setItem(SB_KEY, '1');
});
document.getElementById('sb-open').addEventListener('click', () => {
  appEl.classList.remove('sb-collapsed');
  localStorage.setItem(SB_KEY, '0');
});
// Auto-collapse when a tab is selected on small screens
document.getElementById('sidebar').addEventListener('click', e => {
  if (e.target.closest('.sidebar-btn') && window.innerWidth <= 1024) {
    appEl.classList.add('sb-collapsed');
  }
});

// ── Boot ──

boot();
