/* Admin app entry point — auth gate, sidebar routing, API data loading, character editing */
console.log('%c[TM Admin] build 2026-04-08T1', 'color: #E0C47A; font-weight: bold');

import { apiGet, apiPut, apiPost } from './data/api.js';
import { loadGameXP } from './data/game-xp.js';
import { auditCharacter } from './data/audit.js';
import { initAdminArchive } from './admin/archive-admin.js';
import { sanitiseChar, loadRulesFromApi } from './data/loader.js';
import { downloadCSV } from './editor/export.js';
import { esc, clanIcon, covIcon, shortCov, displayName, sortName } from './data/helpers.js';
import { xpLeft, xpEarned } from './editor/xp.js';
import { applyDerivedMerits, getPoolUsed, getMCIPoolUsed } from './editor/mci.js';
import { ATTR_CATS, SKILL_CATS, PRI_BUDGETS, SKILL_PRI_BUDGETS } from './data/constants.js';
import { vmAlliesUsed, lorekeeperUsed, ohmUsed, investedUsed } from './editor/domain.js';
import { handleCallback, isLoggedIn, validateToken, login, logout, getUser, getPlayerInfo } from './auth/discord.js';
import { initSessionLog } from './admin/session-log.js';
import { initPlayersView } from './admin/players-view.js';
import { initCityView } from './admin/city-views.js';
import { initDowntimeView } from './admin/downtime-views.js';
import { initAttendance } from './admin/attendance.js';
import { initDiceEngine } from './admin/dice-engine.js';
import { initFeedingEngine } from './admin/feeding-engine.js';
import { initSessionTracker } from './admin/session-tracker.js';
import { initDataPortabilityView } from './admin/data-portability.js';
import { initOrdealsAdminView } from './admin/ordeals-admin.js';
import { initPrimerAdmin } from './admin/primer-admin.js';
import { initTicketsView } from './admin/tickets-views.js';
import { initRulesView } from './admin/rules-view.js';
import { initNextSession } from './admin/next-session.js';
import { renderSheet, toggleExp, toggleDisc } from './editor/sheet.js';
import {
  editFromSheet, shEdit, shEditStatus,
  shEditBaneName, shEditBaneEffect, shRemoveBane, shAddBane,
  shEditTouchstone, shAddTouchstone, shRemoveTouchstone,
  shEditBPCreation, shEditBPXP, shEditBPLost, shEditHumanityXP, shEditHumanityLost,
  shStatusUp, shStatusDown, shCovStandingUp, shCovStandingDown,
  shToggleOrdeal, shSetPriority, shSetClanAttr, shEditAttrPt,
  shSetSkillPriority, shEditSkillPt,
  shEditSpec, shRemoveSpec, shAddSpec,
  shEditDiscPt, shShowDevSelect, shAddDevotion, shRemoveDevotion,
  shEditInflMerit, shEditContactSphere, shEditStatusMode, shRemoveInflMerit, shAddInflMerit, shAddVMAllies, shAddLKMerit,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill,
  shToggleMCI, shEditMCIDot, shEditMCITierGrant, shEditMCITierQual, shRemoveStandMerit, shAddStandMCI, shAddStandPT,
  shAddStyle, shRemoveStyle, shEditStyle, shAddPick, shRemovePick,
  shAddRite, shRemoveRite, shToggleRiteFree,
  shAddPact, shRemovePact, shEditPact,
  shEditMeritPt, shStepMeritRating, shEditXP, shAdjAttrBonus,
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
let _players = []; // cached for link icon on char cards
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

  if (domain === 'players') initPlayersView(chars);
  if (domain === 'engine') { initNextSession(); initDiceEngine(chars); initFeedingEngine(chars); initSessionTracker(chars); initSessionLog(); }
  if (domain === 'city') initCityView();
  if (domain === 'downtime') initDowntimeView();
  if (domain === 'attendance') initAttendance(chars);
  if (domain === 'data') initDataPortabilityView(chars);
  if (domain === 'ordeals') initOrdealsAdminView(chars);
  if (domain === 'documents') initPrimerAdmin(document.getElementById('documents-content'));
  if (domain === 'tickets') initTicketsView(document.getElementById('tickets-admin-content'));
  if (domain === 'rules') initRulesView(document.getElementById('rules-content'));
}

document.getElementById('sidebar').addEventListener('click', e => {
  const btn = e.target.closest('.sidebar-btn');
  if (!btn) return;
  switchDomain(btn.dataset.domain);
});

// ── Audit badges: error + warning icons with counts and hover breakdown ──

function _auditBadges(audit) {
  const errs = audit.errors.length;
  const warns = audit.warnings.length;
  if (!errs && !warns) return '';
  let h = '<div class="cc-audit">';
  if (errs) {
    const tip = audit.errors.map(e => '\u2716 ' + e.message).join('\n');
    h += `<span class="cc-audit-badge cc-audit-err" title="${esc(tip)}">\u2716${errs > 1 ? ' ' + errs : ''}</span>`;
  }
  if (warns) {
    const tip = audit.warnings.map(w => '\u26A0 ' + w.message).join('\n');
    h += `<span class="cc-audit-badge cc-audit-warn" title="${esc(tip)}">\u26A0${warns > 1 ? ' ' + warns : ''}</span>`;
  }
  h += '</div>';
  return h;
}

// ── Character alert checks ──

function charAlerts(c) {
  applyDerivedMerits(c);
  let red = false, yellow = false;

  // XP overspend
  if (xpLeft(c) < 0) red = true;

  // Merit CP overspend (budget: 10)
  const meritCPUsed = (c.merits || []).reduce((s, m) => s + (m.cp || 0), 0)
    + (c.fighting_styles || []).reduce((s, fs) => s + (fs.cp || 0), 0)
    + (c.powers || []).filter(p => p.category === 'pact').reduce((s, p) => s + (p.cp || 0), 0)
    + ((c.bp_creation || {}).cp || 0);
  if (meritCPUsed > 10) red = true;
  // BP game cap (max BP 2 for this chronicle)
  if ((c.blood_potency || 0) > 2) yellow = true;

  // Attribute CP overspend (priority budgets: Primary 5, Secondary 4, Tertiary 3)
  const atPri = c.attribute_priorities || {};
  for (const cat of Object.keys(ATTR_CATS)) {
    const budget = PRI_BUDGETS[atPri[cat] || 'Tertiary'] || 3;
    const used = (ATTR_CATS[cat] || []).reduce((s, a) => s + ((c.attributes?.[a]?.cp) || 0), 0);
    if (used > budget) red = true;
  }

  // Skill CP overspend (priority budgets: Primary 11, Secondary 7, Tertiary 4)
  const skPri = c.skill_priorities || {};
  for (const cat of Object.keys(SKILL_CATS)) {
    const budget = SKILL_PRI_BUDGETS[skPri[cat] || 'Tertiary'] || 4;
    const used = (SKILL_CATS[cat] || []).reduce((s, sk) => s + ((c.skills?.[sk]?.cp) || 0), 0);
    if (used > budget) red = true;
  }

  // Grant pool overspend / unspent
  for (const p of (c._grant_pools || [])) {
    const total = p.amount;
    let used;
    if (p.category === 'any') used = getMCIPoolUsed(c);
    else if (p.category === 'vm') used = vmAlliesUsed(c);
    else if (p.category === 'lk') used = lorekeeperUsed(c);
    else if (p.category === 'ohm') used = ohmUsed(c);
    else if (p.category === 'inv') used = investedUsed(c);
    else used = getPoolUsed(c, p.names ? p.names[0] : p.name);
    if (used > total) red = true;
    else if (used < total) yellow = true;
  }
  return { red, yellow };
}

// ── Character grid rendering ──

function renderCharGrid() {
  const grid = document.getElementById('char-grid');
  const count = document.getElementById('char-count');

  // Sync character.player from linked player's display_name
  for (const c of chars) {
    const linked = _players.find(p => (p.character_ids || []).some(id => String(id) === String(c._id)));
    if (linked && linked.display_name && c.player !== linked.display_name) {
      c.player = linked.display_name;
    }
  }

  const sorted = [...chars].sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const active = sorted.filter(c => !c.retired);
  const retired = sorted.filter(c => c.retired);

  function charCard(c) {
    const bp = c.blood_potency || 1;
    const hum = c.humanity != null ? c.humanity : '?';
    const title = c.court_title ? `<span class="cc-tag title">${esc(c.court_title)}</span>` : '';
    const ci = covIcon(c.covenant, 28) + clanIcon(c.clan, 28);
    charAlerts(c); // runs applyDerivedMerits so xp/audit work correctly
    const xpL = xpLeft(c);
    const audit = auditCharacter(c);
    const auditBadges = _auditBadges(audit);

    return `<div class="char-card${c.retired ? ' retired' : ''}" data-id="${c._id}">
      <div class="cc-top">
        <div style="display:flex;gap:4px;flex-shrink:0">${ci}</div>
        <div class="cc-identity"><span class="cc-name">${esc(displayName(c))}</span><br><span class="cc-player">${esc(c.player || '')}</span></div>
        ${auditBadges}
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
  localStorage.setItem('tm_active_char', String(c._id));

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
        <button class="dt-btn" id="cd-archive">Archive</button>
        <button class="dt-btn" id="cd-link-player">Link Player</button>
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
  document.getElementById('cd-link-player').addEventListener('click', () => openPlayerLinkModal(c));
  document.getElementById('cd-archive').addEventListener('click', () => {
    initAdminArchive(document.getElementById('sh-content'), c);
  });

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

async function createNewCharacter() {
  const name = prompt('Character name:');
  if (!name || !name.trim()) return;

  const blank = {
    name: name.trim(),
    player: '',
    honorific: null,
    moniker: null,
    concept: '',
    pronouns: '',
    clan: '',
    bloodline: null,
    covenant: '',
    humanity: 7,
    humanity_base: 7,
    blood_potency: 1,
    bp_creation: { cp: 0, xp: 0, lost: 0 },
    status: { city: 0, clan: 0, covenant: 0 },
    covenant_standings: {},
    attribute_priorities: {},
    skill_priorities: {},
    attributes: Object.fromEntries(
      ['Intelligence','Wits','Resolve','Strength','Dexterity','Stamina','Presence','Manipulation','Composure']
        .map(a => [a, { dots: 1, bonus: 0, cp: 0, xp: 0, free: 0, rule_key: null }])
    ),
    skills: Object.fromEntries(
      ['Academics','Computer','Crafts','Investigation','Medicine','Occult','Politics','Science',
       'Athletics','Brawl','Drive','Firearms','Larceny','Stealth','Survival','Weaponry',
       'Animal Ken','Empathy','Expression','Intimidation','Persuasion','Socialise','Streetwise','Subterfuge']
        .map(s => [s, { dots: 0, bonus: 0, specs: [], nine_again: false, cp: 0, xp: 0, free: 0, rule_key: null }])
    ),
    disciplines: {},
    merits: [],
    powers: [],
    banes: [],
    ordeals: [],
    touchstones: [],
    fighting_styles: [],
    fighting_picks: [],
    willpower: {},
    mask: null,
    dirge: null,
    features: '',
    retired: false,
  };

  try {
    const created = await apiPost('/api/characters', blank);
    chars.push(created);
    renderCharGrid();
    editorState.editMode = true;
    openCharDetail(created);
  } catch (err) {
    alert('Failed to create character: ' + err.message);
  }
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

// loadGameXP imported from data/game-xp.js (shared with player portal)

// ── Player link modal ──

async function openPlayerLinkModal(c) {
  document.getElementById('player-link-modal')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'player-link-modal';
  overlay.className = 'plm-overlay';
  overlay.innerHTML = '<div class="plm-dialog"><p class="plm-loading">Loading\u2026</p></div>';
  document.getElementById('admin-app').appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  await _renderPlmContent(c);
}

async function _renderPlmContent(c) {
  const overlay = document.getElementById('player-link-modal');
  if (!overlay) return;
  const dialog = overlay.querySelector('.plm-dialog');

  let players;
  try {
    players = await apiGet('/api/players');
  } catch (err) {
    dialog.innerHTML = `<div class="plm-header"><h3>Link Player</h3><button class="cd-close" onclick="document.getElementById('player-link-modal').remove()">&times;</button></div><p class="plm-error">Failed to load players: ${esc(err.message)}</p>`;
    return;
  }

  const charId = String(c._id);
  const charName = displayName(c);
  const linked = players.find(p => (p.character_ids || []).some(id => String(id) === charId));

  const rows = players.map(p => {
    const isLinked = linked && String(p._id) === String(linked._id);
    const pid = esc(String(p._id));
    return `<tr class="${isLinked ? 'plm-row-linked' : ''}">
      <td>${esc(p.display_name || '\u2014')}</td>
      <td class="plm-did">${esc(p.discord_id || '\u2014')}</td>
      <td class="plm-role">${esc(p.role)}</td>
      <td>${isLinked ? '<span class="plm-badge">Linked</span>' : ''}</td>
      <td>${isLinked
        ? `<button class="dt-btn plm-unlink-btn" onclick="window._plmUnlink('${pid}','${esc(charId)}')">Unlink</button>`
        : `<button class="dt-btn" onclick="window._plmLink('${pid}','${esc(charId)}')">Link</button>`
      }</td>
    </tr>`;
  }).join('');

  dialog.innerHTML = `
    <div class="plm-header">
      <h3>Link \u201c${esc(charName)}\u201d to Player</h3>
      <button class="cd-close" onclick="document.getElementById('player-link-modal').remove()">&times;</button>
    </div>
    ${players.length
      ? `<div class="plm-list"><table class="plm-table">
          <thead><tr><th>Display name</th><th>Discord ID</th><th>Role</th><th></th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`
      : '<p class="plm-empty">No player records yet.</p>'}
    <div class="plm-create">
      <h4>New player record</h4>
      <div class="plm-form">
        <label class="plm-label">Discord ID<input id="plm-did" class="plm-input" placeholder="numeric Discord user ID" type="text"></label>
        <label class="plm-label">Display name<input id="plm-dname" class="plm-input" placeholder="Display name" type="text"></label>
        <label class="plm-label">Role<select id="plm-drole" class="plm-select"><option value="player">Player</option><option value="st">ST</option></select></label>
        <button class="dt-btn" onclick="window._plmCreate('${esc(charId)}')">Create &amp; Link</button>
      </div>
      <p id="plm-err" class="plm-error" style="display:none"></p>
    </div>`;
}

window._plmLink = async (playerId, charId) => {
  try {
    const player = await apiGet('/api/players/' + playerId);
    const ids = [...new Set([...(player.character_ids || []).map(String), charId])];
    await apiPut('/api/players/' + playerId, { character_ids: ids });
    const c = chars.find(ch => String(ch._id) === charId);
    if (c) await _renderPlmContent(c);
  } catch (err) { console.error('Link failed:', err.message); }
};

window._plmUnlink = async (playerId, charId) => {
  try {
    const player = await apiGet('/api/players/' + playerId);
    const ids = (player.character_ids || []).map(String).filter(id => id !== charId);
    await apiPut('/api/players/' + playerId, { character_ids: ids });
    const c = chars.find(ch => String(ch._id) === charId);
    if (c) await _renderPlmContent(c);
  } catch (err) { console.error('Unlink failed:', err.message); }
};

window._plmCreate = async (charId) => {
  const did = document.getElementById('plm-did')?.value.trim();
  const dname = document.getElementById('plm-dname')?.value.trim();
  const drole = document.getElementById('plm-drole')?.value;
  const errEl = document.getElementById('plm-err');
  if (errEl) errEl.style.display = 'none';

  if (!did) {
    if (errEl) { errEl.textContent = 'Discord ID is required.'; errEl.style.display = ''; }
    return;
  }
  try {
    await apiPost('/api/players', {
      discord_id: did,
      display_name: dname || '',
      role: drole || 'player',
      character_ids: [charId],
    });
    const c = chars.find(ch => String(ch._id) === charId);
    if (c) await _renderPlmContent(c);
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
  }
};

async function init() {
  // Load rules data (purchasable powers) — non-blocking, cached
  loadRulesFromApi().catch(() => {});

  try {
    chars = await apiGet('/api/characters');
    chars.forEach(sanitiseChar);
    await loadGameXP(chars);
    try { _players = await apiGet('/api/players'); } catch { _players = []; }
    renderCharGrid();
  } catch (err) {
    console.error('Failed to load characters:', err.message);
    document.getElementById('char-grid').innerHTML =
      `<p class="placeholder">Failed to load characters from API. Is the server running?</p>`;
  }
}

// ── Window registrations (needed by inline onclick in rendered sheet HTML) ──

Object.defineProperty(window, 'chars', { get: () => chars });
Object.defineProperty(window, 'editIdx', { get: () => editorState.editIdx });
Object.assign(window, {
  toggleExp, toggleDisc, renderSheet, editFromSheet: () => {
    editorState.editMode = true;
    document.getElementById('cd-edit-toggle').textContent = 'View';
    document.getElementById('cd-save-api').style.display = '';
    renderSheet(chars[editorState.editIdx]);
  },
  createNewCharacter, openPlayerLinkModal,
  downloadCSV: () => downloadCSV(chars),
  markDirty, printSheet,
  shEdit, shEditStatus,
  shEditBaneName, shEditBaneEffect, shRemoveBane, shAddBane,
  shEditTouchstone, shAddTouchstone, shRemoveTouchstone,
  shEditBPCreation, shEditBPXP, shEditBPLost, shEditHumanityXP, shEditHumanityLost, shStatusUp, shStatusDown, shCovStandingUp, shCovStandingDown,
  shToggleOrdeal, shSetPriority, shSetClanAttr, shEditAttrPt,
  shSetSkillPriority, shEditSkillPt,
  shEditSpec, shRemoveSpec, shAddSpec,
  shEditDiscPt, shShowDevSelect, shAddDevotion, shRemoveDevotion,
  shEditInflMerit, shEditContactSphere, shEditStatusMode, shRemoveInflMerit, shAddInflMerit, shAddVMAllies, shAddLKMerit,
  shEditDomMerit, shRemoveDomMerit, shAddDomMerit,
  shAddDomainPartner, shRemoveDomainPartner,
  shEditGenMerit, shRemoveGenMerit, shAddGenMerit,
  shEditStandMerit, shEditStandAssetSkill,
  shToggleMCI, shEditMCIDot, shEditMCITierGrant, shEditMCITierQual, shRemoveStandMerit, shAddStandMCI, shAddStandPT,
  shAddStyle, shRemoveStyle, shEditStyle, shAddPick, shRemovePick,
  shAddRite, shRemoveRite, shToggleRiteFree,
  shAddPact, shRemovePact, shEditPact,
  shEditMeritPt, shStepMeritRating, shEditXP, shAdjAttrBonus,
  clickAttrDot, adjAttrBonus, clickSkillDot, toggleNineAgain, adjSkillBonus, updSkillSpec,
  updField, updStatus,
  renderIdentityTab, renderAttrsTab,
});

boot();
