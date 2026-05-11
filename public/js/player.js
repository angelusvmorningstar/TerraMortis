/* Player portal entry point — auth gate, tab routing, character loading, read-only sheet */

import { apiGet, apiPut } from './data/api.js';
import { loadGameXP } from './data/game-xp.js';
import { loadDowntimeHoldFlag } from './data/dt-hold-flag.js';
import { esc, displayName, dropdownName, sortName, discordAvatarUrl, findRegentTerritory } from './data/helpers.js';
import { setStatusTerritories } from './data/accessors.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser, getPlayerInfo, getRole, isSTRole } from './auth/discord.js';
import { renderSheet, toggleExp, toggleDisc } from './editor/sheet.js';
import { initOrdeals } from './tabs/ordeals-view.js';
import { renderDowntimeTab } from './tabs/downtime-form.js';
import { renderRegencyTab } from './tabs/regency-tab.js';
import { renderOfficeTab } from './tabs/office-tab.js';
import { renderFeedingTab } from './tabs/feeding-tab.js';
import { renderStoryTab } from './tabs/story-tab.js';
import { initArchiveTab } from './tabs/archive-tab.js';
import { renderCityTab } from './tabs/city-tab.js';
import { renderStatusTab } from './tabs/status-tab.js';
import { renderPrimerTab } from './tabs/primer-tab.js';
import { renderTicketsTab } from './tabs/tickets-tab.js';
import { renderXpLogTab } from './tabs/xp-log-tab.js';
import { startWizard } from './tabs/wizard.js';
import { getActiveCycle, getGamePhaseCycle } from './downtime/db.js';
import { loadRulesFromApi } from './data/loader.js';
import { preloadRules } from './editor/rule_engine/load-rules.js';
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
      renderSidebarFooter();
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

  // Issue #256 (perf, 2026-05-11): Phase 1a — preloadRules + characters +
  // territories are mutually independent, fire in parallel via
  // Promise.allSettled so a single failure (e.g. preloadRules 403 for
  // a player against the ST-only rules-engine endpoint) doesn't kill
  // the others. Keeps the issue #249 hotfix's user-visible error
  // surface in place for the rules-cache path.
  const charsUrl = getRole() === 'st' ? '/api/characters' : '/api/characters?mine=1';
  const [rulesRes, charsRes, terrRes] = await Promise.allSettled([
    preloadRules(),
    apiGet(charsUrl),
    apiGet('/api/territories'),
  ]);

  // preloadRules failure: same console.error + status-banner surface
  // as the post-#249 explicit catch in app.js:514.
  if (rulesRes.status === 'rejected') {
    console.error('[player] preloadRules failed — derivations skipped until rules cache loads (issue #249):', rulesRes.reason);
    const banner = document.getElementById('app-status-banner');
    if (banner) {
      banner.textContent = 'Rules data failed to load — some derived merit values may be unavailable. Reload the page or check your connection.';
      banner.classList.add('app-status-banner--error');
      banner.style.display = '';
    }
  }

  // /api/characters failure is fatal for the player view — short-circuit.
  if (charsRes.status === 'rejected') {
    document.getElementById('sh-content').innerHTML =
      `<p class="placeholder-msg">Failed to load characters: ${esc(charsRes.reason?.message || 'unknown')}</p>`;
    return;
  }
  chars = charsRes.value || [];
  // Sanitise: strip zero-dot disciplines (treated as absent)
  chars.forEach(c => { if (c.disciplines) for (const [k, v] of Object.entries(c.disciplines)) { if ((v?.dots ?? v) === 0) delete c.disciplines[k]; } });

  // Territories failure is non-fatal — degrade to empty list, downstream
  // tabs render with the territory data they have. Hoisted from the
  // pre-fix position at line 233 into Phase 1a so it parallelises with
  // the other two independent fetches.
  _territories = terrRes.status === 'fulfilled' && Array.isArray(terrRes.value)
    ? terrRes.value
    : [];

  // Phase 1b: loadGameXP + loadDowntimeHoldFlag both depend on `chars`
  // being loaded but are mutually independent. Fire in parallel.
  await Promise.allSettled([
    loadGameXP(chars, isSTRole()),
    loadDowntimeHoldFlag(chars, { isST: isSTRole() }),
  ]);

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
      `<option value="${i}">${esc(dropdownName(c))}</option>`
    ).join('');
    selector.addEventListener('change', () => {
      localStorage.setItem('tm_active_char', String(activeChars[Number(selector.value)]._id));
      selectCharacter(activeChars, Number(selector.value));
    });
  }

  // Issue #256: _territories was loaded in Phase 1a above (parallel with
  // rules + characters). No second fetch needed here.
  // Sync City Status calc recompute path (issue #13 Surface 2).
  setStatusTerritories(_territories);
  renderCityTab(document.getElementById('tab-city'));

  // Primer and Tickets tabs — render once, independent of active character
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

// Issue #258 (perf, 2026-05-11): per-char lazy-render bookkeeping.
// `_lazyRenderedTabs` records which char-dependent tabs have already
// been rendered for the CURRENT character. Reset on every
// selectCharacter call so a char-switch re-arms every tab.
// `_lazyRenderers` maps tab name → render fn that closes over the
// current `activeChar` / `_territories` / `retiredChars` module-level
// state. Tabs absent from the map (sheet / city / primer / tickets)
// are not lazy — sheet renders eagerly in selectCharacter; the others
// are char-independent and rendered once in loadCharacters.
const _lazyRenderedTabs = new Set();

const _lazyRenderers = {
  xplog: () => {
    initOrdeals(activeChar, chars);
    renderXpLogTab(document.getElementById('tab-xplog'), activeChar);
  },
  // Issue #259: selectCharacter just loaded `activeChar` and `_territories`
  // — pass skipFreshFetch so renderDowntimeTab reuses them instead of
  // re-fetching. (Same opt-in preserved through the lazy boundary.)
  downtime: () => renderDowntimeTab(document.getElementById('tab-downtime'), activeChar, _territories, { skipFreshFetch: true }),
  feeding: () => renderFeedingTab(document.getElementById('feeding-content'), activeChar),
  story:   () => renderStoryTab(document.getElementById('story-content'), activeChar),
  status:  () => renderStatusTab(document.getElementById('tab-status'), activeChar, isSTRole()),
  archive: () => initArchiveTab(document.getElementById('tab-archive'), activeChar, retiredChars),
  regency: () => renderRegencyTab(document.getElementById('regency-content'), activeChar, _territories),
  office:  () => renderOfficeTab(document.getElementById('office-content'), activeChar),
};

/**
 * Render a lazy tab if not yet rendered for the current character.
 * Idempotent — re-clicking a tab is a no-op once it's rendered.
 */
function _renderTabIfNeeded(tabName) {
  if (_lazyRenderedTabs.has(tabName)) return;
  const fn = _lazyRenderers[tabName];
  if (!fn) return; // sheet / city / primer / tickets — eager / char-independent
  _lazyRenderedTabs.add(tabName);
  try {
    fn();
  } catch (err) {
    // Render failure shouldn't poison the lazy state — clear so a
    // subsequent click retries. Mirrors the catch-and-continue pattern
    // the eager renderers had pre-fix (per-tab failure didn't kill the
    // others).
    _lazyRenderedTabs.delete(tabName);
    console.error(`[player] tab '${tabName}' render failed:`, err);
  }
}

function selectCharacter(activeChars, idx) {
  activeChar = activeChars[idx];
  state.editIdx = chars.indexOf(activeChar);

  // Re-arm lazy state — every tab needs fresh render for the new char.
  _lazyRenderedTabs.clear();

  // Sheet is the default-active tab on first paint; always render it
  // eagerly so the user has content immediately.
  renderSheet(activeChar);

  // Visibility toggles for conditional tab buttons. The actual tab
  // CONTENT renders lazily when the user clicks the button. We still
  // need to set button display here so the sidebar reflects which
  // tabs exist for this character.
  const regInfo = findRegentTerritory(_territories, activeChar);
  const regBtn = document.getElementById('tab-btn-regency');
  if (regBtn) regBtn.style.display = regInfo ? '' : 'none';

  const offBtn = document.getElementById('tab-btn-office');
  if (offBtn) offBtn.style.display = activeChar.court_category ? '' : 'none';

  // If the currently-active tab is char-dependent (e.g. user previously
  // navigated to Downtime, then changed characters), render it now so
  // they don't see a blank panel.
  const activeBtn = document.querySelector('.sidebar-btn.on[data-tab]');
  const activeTab = activeBtn?.dataset.tab;
  if (activeTab && activeTab !== 'sheet') _renderTabIfNeeded(activeTab);
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

  // Issue #258 (perf): lazy-render the tab's content if this is its
  // first activation for the current character. Saves ~15-20 API calls
  // per char-selection by deferring non-active tab init until needed.
  _renderTabIfNeeded(btn.dataset.tab);
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
// ── Sidebar footer nav ──

function renderSidebarFooter() {
  const nav = document.getElementById('sidebar-footer-nav');
  if (!nav) return;

  const path = location.pathname.replace(/\/+$/, '') || '/';
  const html = [];

  if (path !== '' && path !== '/') html.push(`<a href="/" class="sb-link-btn">Game App</a>`);
  if (isSTRole() && path !== '/admin') html.push(`<a href="/admin" class="sb-link-btn">Storyteller</a>`);
  // Player (/player) is always current page here; never shown

  html.push(`<button class="sb-link-btn" id="sb-mode-btn"></button>`);
  html.push(`<button class="sb-link-btn" id="sb-profile-btn">Emergency Contact</button>`);

  nav.innerHTML = html.join('');

  const modeBtn = document.getElementById('sb-mode-btn');
  const htmlEl = document.documentElement;
  const updateMode = () => {
    modeBtn.textContent = htmlEl.getAttribute('data-theme') === 'dark' ? '☀ Light Mode' : '☾ Dark Mode';
  };
  updateMode();
  modeBtn.addEventListener('click', () => {
    const dark = htmlEl.getAttribute('data-theme') === 'dark';
    if (dark) { htmlEl.removeAttribute('data-theme'); localStorage.removeItem('tm-theme'); }
    else { htmlEl.setAttribute('data-theme', 'dark'); localStorage.setItem('tm-theme', 'dark'); }
    updateMode();
  });

  document.getElementById('sb-profile-btn').addEventListener('click', openProfileModal);
}

// Auto-collapse when a tab is selected on small screens
document.getElementById('sidebar').addEventListener('click', e => {
  if (e.target.closest('.sidebar-btn') && window.innerWidth <= 1024) {
    appEl.classList.add('sb-collapsed');
  }
});

// ── Boot ──

boot();
