/* ST Mods admin panel (Epic STM, issue #386; lifecycle UI #440).
 *
 * Per-character workbench: header + global kill-switch toggle +
 * per-character override toggle + create form + a lifecycle mod list.
 * STM-12 (issue #440) evolves the list from "active mods + revoke" into
 * an active/inactive lifecycle view: active mods (Deactivate/Delete) and
 * a visually-muted inactive group (Reactivate/Delete), an All/Active/
 * Inactive filter, a delete-confirmation modal with tombstone copy, and
 * a soft-duplicate warning that fires only when the create form's path
 * matches an INACTIVE mod (active-path stacking stays silent per Rev 1 §D4).
 *
 * Consumes STM-1/STM-10 (POST/GET/PATCH/DELETE /api/st_mods), STM-3
 * (/api/settings, /api/characters/:id/st_mods_suppressed), STM-6's label
 * helper + categorised dropdown, and the pure helpers in
 * st-mods-panel-logic.js.
 *
 * Delegated event routing throughout (per memory
 * feedback_listener_routing_static_blind_spot):
 *   - one `change` listener for filter inputs + toggles + form fields
 *   - one `click` listener for buttons (Save, Deactivate, Reactivate,
 *     Delete, filter views, modal confirm/cancel, dormant reactivate)
 * dispatching on data-stm-* attributes.
 */

import { apiGet, apiPost, apiPatch, apiDelete } from '../data/api.js';
import { displayName, esc } from '../data/helpers.js';
import { labelForPath, buildStatPathCategories } from '../data/st-mod-labels.js';
import { markLocalWrite } from '../data/ws.js';
import {
  getGlobalSettings,
  loadGlobalSettings,
} from '../data/app-settings.js';
import { partitionMods, filterMods, findDormantMatch } from './st-mods-panel-logic.js';

// Module-level state for the active panel.
const state = {
  character: null,
  mods: [],          // GET /api/st_mods rows for active character (active + inactive)
  view: 'all',       // list filter: 'all' | 'active' | 'inactive'
  form: {
    stat_path: '',
    delta: 1,
    reason: '',
    show_reason_to_player: false,
  },
  dormantDismissedPath: null, // path the ST dismissed the dormant banner for
  pendingDelete: null,        // mod id awaiting delete confirmation (modal open)
  error: null,
  saving: false,
  loading: false,
  initialized: false,
};

let _rootEl = null;
let _onMutateCallback = null;

/** init — called from admin.js switchDomain when 'st-mods' tab activates.
 *  Pass the active character (may be null when no char is selected).
 *  Pass an optional onMutate callback that the panel calls whenever a
 *  mod is created/revoked or a toggle flips, so admin.js can trigger
 *  the sheet re-render via STM-2's helper. */
export async function initStModsPanel(rootEl, character, onMutate) {
  _rootEl = rootEl;
  _onMutateCallback = typeof onMutate === 'function' ? onMutate : null;

  if (!_rootEl) return;

  // No character selected — placeholder, single listener block stays
  // installed so subsequent activations work without re-binding.
  if (!character) {
    _rootEl.innerHTML = `<div class="stm-panel-empty">Select a character from the Player tab to manage their ST mods.</div>`;
    return;
  }

  state.character = character;
  state.form.stat_path = '';
  state.form.delta = 1;
  state.form.reason = '';
  state.form.show_reason_to_player = false;
  state.view = 'all';
  state.dormantDismissedPath = null;
  state.pendingDelete = null;
  state.error = null;

  if (!state.initialized) {
    _attachDelegatedHandlers(_rootEl);
    state.initialized = true;
  }

  _renderScaffold();
  await _refetchMods();
}

// ── DOM scaffold ─────────────────────────────────────────────────────

function _renderScaffold() {
  const c = state.character;
  const cats = buildStatPathCategories(c);
  const settings = getGlobalSettings();
  const globalEnabled = settings?.st_mods_enabled !== false;
  const charSuppressed = !!c.st_mods_suppressed;

  const catOptionsHtml = cats.map(cat => {
    const opts = cat.entries.map(e => `<option value="${esc(e.path)}">${esc(e.label)}</option>`).join('');
    return `<optgroup label="${esc(cat.category)}">${opts}</optgroup>`;
  }).join('');

  _rootEl.innerHTML = `
    <div class="stm-panel" data-stm-panel-root>
      <header class="stm-panel-head">
        <h2>ST Mods — ${esc(displayName(c) || c.name || '')}</h2>
      </header>

      <section class="stm-panel-toggles">
        <label class="stm-toggle">
          <input type="checkbox" data-stm-toggle="global" ${globalEnabled ? 'checked' : ''}>
          Show ST Mods on sheets <strong>${globalEnabled ? 'ON' : 'OFF'}</strong>
          <span class="stm-toggle-hint">Master switch. When off, no character sheet shows ST mods anywhere on the site (mods stay in the DB; nothing is deleted). Off acts as an emergency hide-all kill-switch.</span>
        </label>
        <label class="stm-toggle">
          <input type="checkbox" data-stm-toggle="suppress" ${charSuppressed ? 'checked' : ''}>
          Hide ST Mods for this character only
          <span class="stm-toggle-hint">When on, just this character's modded values render as base. Other characters unaffected. Use for a quick &ldquo;reset to canonical&rdquo; on one sheet without touching the master switch.</span>
        </label>
      </section>

      <section class="stm-panel-create">
        <h3>Create mod</h3>
        <div class="stm-form-row">
          <label>Stat
            <select data-stm-form="stat_path">
              <option value="">— select —</option>
              ${catOptionsHtml}
            </select>
          </label>
          <label>Delta
            <input type="number" data-stm-form="delta" value="${state.form.delta}" step="1">
          </label>
        </div>
        <div class="stm-form-row">
          <label class="stm-form-reason">Reason
            <input type="text" data-stm-form="reason" value="${esc(state.form.reason)}" placeholder="Why the adjustment?">
          </label>
          <label class="stm-form-show-reason">
            <input type="checkbox" data-stm-form="show_reason_to_player" ${state.form.show_reason_to_player ? 'checked' : ''}>
            Show reason to player
          </label>
        </div>
        <div class="stm-dormant-banner-slot" data-stm-dormant-banner>${_renderDormantBanner()}</div>
        <div class="stm-form-actions">
          <button data-stm-action="save" ${state.saving ? 'disabled' : ''}>Save mod</button>
          ${state.error ? `<span class="stm-form-error">${esc(state.error)}</span>` : ''}
        </div>
      </section>

      <section class="stm-panel-list">
        <div class="stm-list-filters" data-stm-filters>
          <button data-stm-view="all" class="stm-view-btn ${state.view === 'all' ? 'is-active' : ''}">All</button>
          <button data-stm-view="active" class="stm-view-btn ${state.view === 'active' ? 'is-active' : ''}">Active only</button>
          <button data-stm-view="inactive" class="stm-view-btn ${state.view === 'inactive' ? 'is-active' : ''}">Inactive only</button>
        </div>
        <div class="stm-list-body" data-stm-list-body>
          ${state.loading ? '<p>Loading…</p>' : _renderLists()}
        </div>
      </section>
      ${_renderDeleteModal()}
    </div>
  `;
}

// Render the active + inactive sections per the current view filter. The
// inactive group is only shown when it has rows (in 'all' view) so an
// all-active character isn't cluttered with an empty "Inactive" heading.
function _renderLists() {
  if (!state.mods.length) {
    return '<p class="stm-list-empty">No mods yet. Create one above.</p>';
  }
  const { active, inactive } = filterMods(state.mods, state.view);
  const counts = partitionMods(state.mods);
  const parts = [];

  if (state.view !== 'inactive') {
    const body = active.length
      ? active.map(m => _renderRow(m, true)).join('')
      : '<p class="stm-list-empty">No active mods.</p>';
    parts.push(`<div class="stm-list-group"><h3>Active mods (${counts.active.length})</h3>${body}</div>`);
  }

  if (state.view === 'inactive') {
    const body = inactive.length
      ? inactive.map(m => _renderRow(m, false)).join('')
      : '<p class="stm-list-empty">No inactive mods.</p>';
    parts.push(`<div class="stm-list-group"><h3>Inactive mods (${counts.inactive.length})</h3>${body}</div>`);
  } else if (counts.inactive.length) {
    // 'all' view: append the muted inactive group when any exist.
    const body = inactive.map(m => _renderRow(m, false)).join('');
    parts.push(`<div class="stm-list-group stm-list-group--inactive"><h3>Inactive mods (${counts.inactive.length})</h3>${body}</div>`);
  }

  return parts.join('');
}

function _renderRow(m, isActiveRow) {
  const sign = m.delta >= 0 ? '+' : '';
  const when = m.created_at ? m.created_at.replace('T', ' ').replace(/\..*$/, '') : '';
  const creator = m?.created_by?.discord_name || 'unknown';
  const id = esc(String(m._id));
  const glyph = isActiveRow ? '●' : '◌';
  const toggleBtn = isActiveRow
    ? `<button class="stm-mod-btn" data-stm-action="deactivate" data-stm-mod-id="${id}">Deactivate</button>`
    : `<button class="stm-mod-btn stm-mod-btn--reactivate" data-stm-action="reactivate" data-stm-mod-id="${id}">Reactivate</button>`;
  return `
    <article class="stm-mod-row ${isActiveRow ? '' : 'stm-mod-row--inactive'}">
      <header class="stm-mod-row-head">
        <span class="stm-mod-glyph">${glyph}</span>
        <span class="stm-mod-label">${esc(labelForPath(m.stat_path))}</span>
        <span class="stm-mod-delta">${esc(sign + String(m.delta))}</span>
        ${m.show_reason_to_player ? '<span class="stm-mod-public">shown to player</span>' : ''}
        <span class="stm-mod-actions">
          ${toggleBtn}
          <button class="stm-mod-btn stm-mod-btn--delete" data-stm-action="delete" data-stm-mod-id="${id}">Delete</button>
        </span>
      </header>
      ${m.reason ? `<p class="stm-mod-reason"><em>${esc(m.reason)}</em></p>` : ''}
      <p class="stm-mod-meta">${esc(creator)} · ${esc(when)}</p>
    </article>
  `;
}

// Soft-duplicate banner: shown only when the create form's path matches an
// INACTIVE mod and the ST hasn't dismissed it for that path. Active-path
// matches are silent on purpose (multi-mod stacking is by design, Rev 1 §D4).
function _renderDormantBanner() {
  const path = (state.form.stat_path || '').trim();
  if (!path || state.dormantDismissedPath === path) return '';
  const match = findDormantMatch(state.mods, path);
  if (!match) return '';
  const sign = match.delta >= 0 ? '+' : '';
  const label = `${labelForPath(match.stat_path)} ${sign}${match.delta}`;
  return `
    <div class="stm-dormant-banner" role="status">
      <span class="stm-dormant-text">A dormant '${esc(label)}' already exists for this character. Reactivate it instead?</span>
      <button class="stm-mod-btn stm-mod-btn--reactivate" data-stm-action="reactivate-dormant" data-stm-mod-id="${esc(String(match._id))}">Reactivate dormant</button>
      <button class="stm-dormant-dismiss" data-stm-action="dismiss-dormant" aria-label="Dismiss">&times;</button>
    </div>
  `;
}

// Delete confirmation modal — explicit "permanently delete" + tombstone copy.
function _renderDeleteModal() {
  if (!state.pendingDelete) return '';
  const m = state.mods.find(x => String(x._id) === String(state.pendingDelete));
  if (!m) return '';
  const sign = m.delta >= 0 ? '+' : '';
  const label = `${labelForPath(m.stat_path)} ${sign}${m.delta}`;
  return `
    <div class="stm-modal-overlay" data-stm-modal-overlay>
      <div class="stm-modal" role="dialog" aria-modal="true">
        <h3>Permanently delete this mod?</h3>
        <p>You are about to permanently delete <strong>${esc(label)}</strong>.</p>
        <p class="stm-modal-note">The audit log will record this deletion as a tombstone; the mod itself will be gone and cannot be reactivated. To pause it instead, cancel and use <em>Deactivate</em>.</p>
        <div class="stm-modal-actions">
          <button class="stm-mod-btn stm-mod-btn--delete" data-stm-action="confirm-delete" data-stm-mod-id="${esc(String(m._id))}">Permanently delete</button>
          <button class="stm-mod-btn" data-stm-action="cancel-delete">Cancel</button>
        </div>
      </div>
    </div>
  `;
}

function _renderListBody() {
  const el = _rootEl?.querySelector('[data-stm-list-body]');
  if (el) el.innerHTML = state.loading ? '<p>Loading…</p>' : _renderLists();
}

function _renderDormantBannerSlot() {
  const el = _rootEl?.querySelector('[data-stm-dormant-banner]');
  if (el) el.innerHTML = _renderDormantBanner();
}

function _renderError() {
  const el = _rootEl?.querySelector('.stm-form-error');
  if (el) el.textContent = state.error || '';
  else if (state.error) {
    // Insert error inline if it wasn't present in the prior render
    const actions = _rootEl?.querySelector('.stm-form-actions');
    if (actions) {
      const span = document.createElement('span');
      span.className = 'stm-form-error';
      span.textContent = state.error;
      actions.appendChild(span);
    }
  }
}

// ── Delegated event handlers ─────────────────────────────────────────

function _attachDelegatedHandlers(root) {
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;

    if (t.dataset.stmToggle === 'global') {
      _onGlobalToggle(t.checked);
    } else if (t.dataset.stmToggle === 'suppress') {
      _onSuppressToggle(t.checked);
    } else if (t.dataset.stmForm) {
      const key = t.dataset.stmForm;
      if (key === 'delta') state.form.delta = parseInt(t.value, 10) || 0;
      else if (key === 'show_reason_to_player') state.form.show_reason_to_player = t.checked;
      else state.form[key] = t.value;
      // Changing the stat path resets the dormant-dismissal and re-evaluates
      // the soft-duplicate banner against the new path.
      if (key === 'stat_path') {
        state.dormantDismissedPath = null;
        _renderDormantBannerSlot();
      }
    }
  });

  root.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const btn = t.closest('[data-stm-action], [data-stm-view]');
    if (!(btn instanceof HTMLElement)) {
      // Click on the modal backdrop (outside the dialog) cancels the delete.
      if (t.matches('[data-stm-modal-overlay]')) _cancelDelete();
      return;
    }
    const view = btn.dataset.stmView;
    if (view) { _onViewChange(view); return; }
    const action = btn.dataset.stmAction;
    const modId = btn.dataset.stmModId;
    if (action === 'save') _onSaveClick();
    else if (action === 'deactivate') _onToggleClick(modId, false);
    else if (action === 'reactivate') _onToggleClick(modId, true);
    else if (action === 'reactivate-dormant') _onReactivateDormant(modId);
    else if (action === 'dismiss-dormant') _onDismissDormant();
    else if (action === 'delete') _onDeleteClick(modId);
    else if (action === 'confirm-delete') _onConfirmDelete(modId);
    else if (action === 'cancel-delete') _cancelDelete();
  });
}

// ── View filter ──────────────────────────────────────────────────────

function _onViewChange(view) {
  if (view !== 'all' && view !== 'active' && view !== 'inactive') return;
  state.view = view;
  // Update the active-button styling + list body without a full scaffold redraw.
  _rootEl?.querySelectorAll('[data-stm-view]').forEach(b => {
    b.classList.toggle('is-active', b.dataset.stmView === view);
  });
  _renderListBody();
}

// ── Toggle handlers ──────────────────────────────────────────────────

async function _onGlobalToggle(newValue) {
  try {
    await apiPatch('/api/settings', { st_mods_enabled: newValue });
    await loadGlobalSettings();          // refresh STM-3 cache
    _renderScaffold();                    // reflect new label
    if (_onMutateCallback) _onMutateCallback();
  } catch (err) {
    console.error('[stm-panel] global toggle failed:', err);
    // Revert UI by re-rendering against the (unchanged) cached state.
    _renderScaffold();
  }
}

async function _onSuppressToggle(newValue) {
  const c = state.character;
  if (!c?._id) return;
  try {
    const updated = await apiPatch(`/api/characters/${c._id}/st_mods_suppressed`, {
      st_mods_suppressed: newValue,
    });
    // Reflect server-authoritative state back onto the in-memory character.
    if (newValue) c.st_mods_suppressed = true;
    else delete c.st_mods_suppressed;
    _renderScaffold();
    if (_onMutateCallback) _onMutateCallback();
  } catch (err) {
    console.error('[stm-panel] suppress toggle failed:', err);
    _renderScaffold();
  }
}

// ── Create form ──────────────────────────────────────────────────────

async function _onSaveClick() {
  const c = state.character;
  if (!c?._id || state.saving) return;

  const stat_path = (state.form.stat_path || '').trim();
  const delta = parseInt(state.form.delta, 10);
  const reason = (state.form.reason || '').trim();

  if (!stat_path) { state.error = 'Select a stat to mod.'; _renderError(); return; }
  if (!Number.isInteger(delta) || delta === 0) {
    state.error = 'Delta must be a non-zero integer.';
    _renderError();
    return;
  }
  if (!reason) { state.error = 'Reason is required.'; _renderError(); return; }

  state.saving = true;
  state.error = null;
  _renderError();

  try {
    // STM-9 (issue #416, ADR-004 Rev 3 §D11): mark the local write
    // BEFORE the POST fires so the WS echo (which often arrives a few
    // ms before the HTTP response) is suppressed. Constant 'st_mod'
    // token keyed by character_id — the panel's own _refetchMods +
    // onMutate chain handles the refresh on this client, so the WS
    // handler should not redundantly fire for the originating mutation.
    markLocalWrite(String(c._id), { st_mod: true });
    await apiPost('/api/st_mods', {
      character_id: String(c._id),
      stat_path,
      delta,
      reason,
      show_reason_to_player: !!state.form.show_reason_to_player,
    });
    // Reset form
    state.form.stat_path = '';
    state.form.delta = 1;
    state.form.reason = '';
    state.form.show_reason_to_player = false;
    state.error = null;
    await _refetchMods();
    _renderScaffold();
    if (_onMutateCallback) _onMutateCallback();
  } catch (err) {
    state.error = err?.message || 'Failed to create mod.';
    _renderError();
  } finally {
    state.saving = false;
  }
}

// ── Lifecycle: deactivate / reactivate (PATCH active) ────────────────

async function _onToggleClick(modId, active) {
  if (!modId) return;
  try {
    // STM-9 (issue #416): mark the local write before PATCH so the WS echo
    // is suppressed — the panel refreshes itself via _refetchMods.
    if (state.character?._id) markLocalWrite(String(state.character._id), { st_mod: true });
    await apiPatch(`/api/st_mods/${modId}`, { active });
    await _refetchMods();
    _renderListBody();
    _renderDormantBannerSlot();   // (de)activation can change dormant-match state
    if (_onMutateCallback) _onMutateCallback();
  } catch (err) {
    console.error('[stm-panel] toggle failed:', err);
  }
}

async function _onReactivateDormant(modId) {
  // Reactivate the dormant match from the soft-duplicate banner, then clear
  // the form path so the banner retires.
  await _onToggleClick(modId, true);
  state.form.stat_path = '';
  state.dormantDismissedPath = null;
  _renderScaffold();
}

function _onDismissDormant() {
  state.dormantDismissedPath = (state.form.stat_path || '').trim() || null;
  _renderDormantBannerSlot();
}

// ── Delete (tombstone) with confirmation modal ───────────────────────

function _onDeleteClick(modId) {
  if (!modId) return;
  state.pendingDelete = modId;
  _renderModal();
}

function _cancelDelete() {
  state.pendingDelete = null;
  _renderModal();
}

async function _onConfirmDelete(modId) {
  if (!modId) return;
  try {
    // STM-9 (issue #416): same dedupe shape as PATCH/POST — mark before DELETE.
    if (state.character?._id) markLocalWrite(String(state.character._id), { st_mod: true });
    await apiDelete(`/api/st_mods/${modId}`);
    state.pendingDelete = null;
    await _refetchMods();
    _renderModal();
    _renderListBody();
    _renderDormantBannerSlot();
    if (_onMutateCallback) _onMutateCallback();
  } catch (err) {
    console.error('[stm-panel] delete failed:', err);
    state.pendingDelete = null;
    _renderModal();
  }
}

// Mount/refresh the modal at the panel root (it lives just inside the root,
// outside the list body, so list re-renders don't clobber it).
function _renderModal() {
  const root = _rootEl?.querySelector('[data-stm-panel-root]');
  if (!root) return;
  const existing = root.querySelector('[data-stm-modal-overlay]');
  if (existing) existing.remove();
  if (state.pendingDelete) root.insertAdjacentHTML('beforeend', _renderDeleteModal());
}

// ── Fetch helpers ────────────────────────────────────────────────────

async function _refetchMods() {
  const c = state.character;
  if (!c?._id) return;
  state.loading = true;
  _renderListBody();
  try {
    state.mods = await apiGet(`/api/st_mods?character_id=${encodeURIComponent(String(c._id))}`);
  } catch (err) {
    console.error('[stm-panel] fetch mods failed:', err);
    state.mods = [];
  }
  state.loading = false;
  _renderListBody();
}
