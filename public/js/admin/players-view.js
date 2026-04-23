/**
 * Players domain — admin app.
 * Create, edit, and remove player records. Controls who can log in and
 * whether they have ST access.
 *
 * Auth flow reminder:
 *   1. Player logs in via Discord OAuth → server looks up by discord_id (numeric).
 *   2. Fallback: matches by discord_username with no ID set yet, then auto-fills
 *      the numeric ID so future logins skip the lookup.
 *   3. No match → 403. Player must be pre-created here by an ST.
 *
 * Fields:
 *   display_name     — shown in the app (e.g. "Angelus")
 *   discord_username — the @handle, used for pre-auth fallback matching
 *   discord_id       — numeric snowflake; set automatically on first login,
 *                      or enter manually for immediate access
 *   role             — 'player' | 'st'
 *   character_ids    — managed via the Link Player modal on the character sheet
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { discordAvatarUrl, isRedactMode } from '../data/helpers.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

let players = [];
let chars   = [];
let editingId = null;   // player _id currently in edit mode
let expandedId = null;  // player _id currently expanded

export async function initPlayersView(characters) {
  chars = characters || [];
  const container = document.getElementById('players-content');
  if (!container) return;

  container.innerHTML = '<p class="placeholder">Loading\u2026</p>';
  try {
    players = await apiGet('/api/players');
  } catch (err) {
    container.innerHTML = `<p class="placeholder">Failed to load players: ${esc(err.message)}</p>`;
    return;
  }
  editingId = null;
  render();
}

// ── Render ───────────────────────────────────────────────────────────────────

function render() {
  const container = document.getElementById('players-content');
  if (!container) return;

  const count = document.getElementById('players-count');
  if (count) count.textContent = players.length ? `${players.length} player${players.length !== 1 ? 's' : ''}` : '';

  let h = '';

  // Add-player form (always visible at top)
  if (editingId === 'new') {
    h += playerForm(null, 'new');
  } else {
    h += `<div class="pv-toolbar">
      <button class="btn-sm" id="pv-add-btn">+ Add Player</button>
    </div>`;
  }

  // Player list
  if (players.length === 0) {
    h += '<p class="placeholder">No player records yet. Add one above.</p>';
  } else {
    // Sort: STs first, then alphabetically by display_name
    const sorted = [...players].sort((a, b) => {
      if (a.role === 'st' && b.role !== 'st') return -1;
      if (b.role === 'st' && a.role !== 'st') return 1;
      return (a.display_name || '').localeCompare(b.display_name || '');
    });

    h += '<div class="pv-list">';
    for (const p of sorted) {
      if (editingId === p._id) {
        h += playerForm(p, p._id);
      } else {
        h += playerCard(p);
      }
    }
    h += '</div>';
  }

  container.innerHTML = h;
  bindEvents(container);
}

function playerCard(p) {
  const charNames = (p.character_ids || [])
    .map(id => chars.find(c => String(c._id) === String(id)))
    .filter(Boolean)
    .map(c => esc(c.moniker || c.name))
    .join(', ');

  const roleBadge = p.role === 'st'
    ? '<span class="pv-badge pv-badge-st">ST</span>'
    : p.role === 'coordinator'
    ? '<span class="pv-badge pv-badge-coord">Coordinator</span>'
    : '<span class="pv-badge pv-badge-player">Player</span>';

  const lastLogin = p.last_login
    ? new Date(p.last_login).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '<span class="pv-dim">Never logged in</span>';

  const avatarUrl = discordAvatarUrl(p.discord_id, p.discord_avatar, 40);

  const didDisplay = p.discord_id
    ? `<span class="pv-did">${esc(p.discord_id)}</span>`
    : '<span class="pv-dim">No ID yet</span>';

  const usernameDisplay = p.discord_username
    ? `<span class="pv-handle">@${esc(p.discord_username)}</span>`
    : '<span class="pv-dim">No username set</span>';

  const isExpanded = expandedId === String(p._id);
  const dim = (v) => v ? esc(v) : '<span class="pv-dim">Not provided</span>';

  let detail = '';
  if (isExpanded) {
    detail = `<div class="pv-detail">
      <div class="pv-detail-grid">
        <div class="pv-detail-field"><span class="pv-detail-label">Email</span>${dim(p.email)}</div>
        <div class="pv-detail-field"><span class="pv-detail-label">Mobile</span>${dim(p.mobile)}</div>
        <div class="pv-detail-field"><span class="pv-detail-label">Emergency Contact</span>${dim(p.emergency_contact_name)}</div>
        <div class="pv-detail-field"><span class="pv-detail-label">Emergency Mobile</span>${dim(p.emergency_contact_mobile)}</div>
        <div class="pv-detail-field pv-detail-wide"><span class="pv-detail-label">Medical Info</span>${dim(p.medical_info)}</div>
      </div>
      <div class="pv-detail-actions">
        <button class="pv-icon-btn pv-edit-btn" data-id="${esc(p._id)}" title="Edit">&#9998;</button>
      </div>
    </div>`;
  }

  return `<div class="pv-card${isExpanded ? ' pv-card-expanded' : ''}" data-id="${esc(p._id)}">
    <div class="pv-card-header" data-toggle-id="${esc(p._id)}">
      <img class="pv-avatar" src="${avatarUrl}" alt=""${isRedactMode() ? '' : ` onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'"`}>
      <div class="pv-info">
        <div class="pv-name-row">
          <span class="pv-name">${esc(p.display_name || '(unnamed)')}</span>
          ${roleBadge}
        </div>
        <div class="pv-discord-row">
          ${usernameDisplay}
          ${didDisplay}
        </div>
        ${charNames ? `<div class="pv-chars">${charNames}</div>` : ''}
      </div>
      <div class="pv-meta">
        <span class="pv-login">Last login: ${lastLogin}</span>
      </div>
      <div class="pv-row-actions">
        <button class="pv-icon-btn pv-remove-btn" data-id="${esc(p._id)}" data-name="${esc(p.display_name || '(unnamed)')}" title="Remove">&#10005;</button>
      </div>
    </div>
    ${detail}
  </div>`;
}

function playerForm(p, formId) {
  const isNew = formId === 'new';
  const title = isNew ? 'Add Player' : `Edit ${esc(p?.display_name || 'Player')}`;

  const val = (field) => esc(p?.[field] || '');

  return `<div class="pv-form" data-form-id="${esc(formId)}">
    <div class="pv-form-title">${title}</div>
    <div class="pv-form-grid">
      <label class="pv-label">
        <span>Display name <span class="pv-req">*</span></span>
        <input class="pv-input" id="pv-f-name" type="text" value="${val('display_name')}" placeholder="e.g. Angelus">
      </label>
      <label class="pv-label">
        <span>Discord username</span>
        <input class="pv-input" id="pv-f-username" type="text" value="${val('discord_username')}" placeholder="e.g. angelus (without @)">
        <span class="pv-hint">Used to auto-link their account on first login</span>
      </label>
      <label class="pv-label">
        <span>Discord ID <span class="pv-hint-inline">(numeric)</span></span>
        <input class="pv-input" id="pv-f-did" type="text" value="${val('discord_id')}" placeholder="e.g. 123456789012345678">
        <span class="pv-hint">Optional — grants immediate access. Right-click name in Discord &rarr; Copy User ID.</span>
      </label>
      <label class="pv-label">
        <span>Role</span>
        <select class="pv-input pv-select" id="pv-f-role">
          <option value="player" ${(p?.role || 'player') === 'player' ? 'selected' : ''}>Player</option>
          <option value="coordinator" ${p?.role === 'coordinator' ? 'selected' : ''}>Coordinator</option>
          <option value="st" ${p?.role === 'st' ? 'selected' : ''}>Storyteller</option>
        </select>
      </label>
      <label class="pv-label">
        <span>Email</span>
        <input class="pv-input" id="pv-f-email" type="email" value="${val('email')}" placeholder="e.g. player@example.com">
        <span class="pv-hint">Used for automated downtime result notifications.</span>
      </label>
    </div>
    <div class="pv-label">
      <span>Linked characters</span>
      <div class="pv-char-list">${buildCharCheckboxes(p)}</div>
      <span class="pv-hint">Characters this player can access when logged in.</span>
    </div>
    <p class="pv-err" id="pv-form-err" style="display:none"></p>
    <div class="pv-form-actions">
      <button class="btn-sm pv-save-btn" data-form-id="${esc(formId)}">${isNew ? 'Create' : 'Save'}</button>
      <button class="dt-btn pv-cancel-btn">Cancel</button>
    </div>
  </div>`;
}

function buildCharCheckboxes(p) {
  const linkedIds = new Set((p?.character_ids || []).map(id => String(id)));
  const active = chars.filter(c => !c.retired).sort((a, b) =>
    (a.moniker || a.name).localeCompare(b.moniker || b.name)
  );
  if (!active.length) return '<span class="pv-dim">No characters in database.</span>';
  return active.map(c => {
    const id = String(c._id);
    const checked = linkedIds.has(id) ? 'checked' : '';
    return `<label class="pv-char-check">
      <input type="checkbox" class="pv-char-cb" value="${esc(id)}" ${checked}>
      ${esc(c.moniker || c.name)}
    </label>`;
  }).join('');
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindEvents(container) {
  container.querySelector('#pv-add-btn')?.addEventListener('click', () => {
    editingId = 'new';
    render();
  });

  // Card header toggle (expand/collapse)
  container.querySelectorAll('[data-toggle-id]').forEach(el => {
    el.addEventListener('click', e => {
      if (e.target.closest('button')) return; // don't toggle when clicking buttons
      const id = el.dataset.toggleId;
      expandedId = expandedId === id ? null : id;
      render();
    });
  });

  container.querySelectorAll('.pv-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editingId = btn.dataset.id;
      render();
    });
  });

  container.querySelectorAll('.pv-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => handleRemove(btn.dataset.id, btn.dataset.name));
  });

  container.querySelectorAll('.pv-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => { editingId = null; render(); });
  });

  container.querySelectorAll('.pv-save-btn').forEach(btn => {
    btn.addEventListener('click', () => handleSave(btn.dataset.formId));
  });
}

// ── Actions ───────────────────────────────────────────────────────────────────

async function handleSave(formId) {
  const name     = document.getElementById('pv-f-name')?.value.trim();
  const username = document.getElementById('pv-f-username')?.value.trim().replace(/^@/, '');
  const did      = document.getElementById('pv-f-did')?.value.trim();
  const role     = document.getElementById('pv-f-role')?.value;
  const email    = document.getElementById('pv-f-email')?.value.trim();
  const errEl    = document.getElementById('pv-form-err');

  if (errEl) errEl.style.display = 'none';

  if (!name) {
    if (errEl) { errEl.textContent = 'Display name is required.'; errEl.style.display = ''; }
    return;
  }

  const characterIds = [...document.querySelectorAll('.pv-char-cb:checked')].map(cb => cb.value);

  const body = {
    display_name:      name,
    discord_username:  username || null,
    discord_id:        did || null,
    role:              role || 'player',
    character_ids:     characterIds,
    email:             email || null,
  };

  try {
    if (formId === 'new') {
      const created = await apiPost('/api/players', body);
      players.push(created);
    } else {
      const updated = await apiPut('/api/players/' + formId, body);
      const idx = players.findIndex(p => p._id === formId);
      if (idx >= 0) players[idx] = { ...players[idx], ...updated };
    }
    editingId = null;
    render();
  } catch (err) {
    if (errEl) { errEl.textContent = err.message; errEl.style.display = ''; }
  }
}

async function handleRemove(playerId, displayName) {
  if (!confirm(`Remove player "${displayName}"?\n\nThis only removes their login access — their characters are not deleted.`)) return;

  try {
    await apiDelete('/api/players/' + playerId);
    players = players.filter(p => p._id !== playerId);
    render();
  } catch (err) {
    alert('Failed to remove player: ' + err.message);
  }
}
