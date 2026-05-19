/* ST Mods admin panel (Epic STM, issue #386).
 *
 * Per-character workbench: header + global kill-switch toggle +
 * per-character override toggle + create form + active-mods list with
 * revoke buttons. Consumes STM-1 (POST/GET/DELETE /api/st_mods),
 * STM-3 (/api/settings, /api/characters/:id/st_mods_suppressed),
 * and STM-6's label helper + categorised dropdown structure.
 *
 * Delegated event routing throughout (per memory
 * feedback_listener_routing_static_blind_spot):
 *   - one `change` listener for filter inputs + toggles
 *   - one `click` listener for buttons (Save, Revoke, etc.)
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

// Module-level state for the active panel.
const state = {
  character: null,
  mods: [],          // GET /api/st_mods rows for active character
  form: {
    stat_path: '',
    delta: 1,
    reason: '',
    show_reason_to_player: false,
  },
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
        <div class="stm-form-actions">
          <button data-stm-action="save" ${state.saving ? 'disabled' : ''}>Save mod</button>
          ${state.error ? `<span class="stm-form-error">${esc(state.error)}</span>` : ''}
        </div>
      </section>

      <section class="stm-panel-list">
        <h3>Active mods</h3>
        <div class="stm-list-body" data-stm-list-body>
          ${state.loading ? '<p>Loading…</p>' : _renderModRows()}
        </div>
      </section>
    </div>
  `;
}

function _renderModRows() {
  if (!state.mods.length) {
    return '<p class="stm-list-empty">No active mods. Create one above.</p>';
  }
  return state.mods.map(m => {
    const sign = m.delta >= 0 ? '+' : '';
    const when = m.created_at ? m.created_at.replace('T', ' ').replace(/\..*$/, '') : '';
    const creator = m?.created_by?.discord_name || 'unknown';
    return `
      <article class="stm-mod-row">
        <header class="stm-mod-row-head">
          <span class="stm-mod-label">${esc(labelForPath(m.stat_path))}</span>
          <span class="stm-mod-delta">${esc(sign + String(m.delta))}</span>
          ${m.show_reason_to_player ? '<span class="stm-mod-public">shown to player</span>' : ''}
          <button class="stm-mod-revoke" data-stm-action="revoke" data-stm-mod-id="${esc(String(m._id))}">Revoke</button>
        </header>
        ${m.reason ? `<p class="stm-mod-reason"><em>${esc(m.reason)}</em></p>` : ''}
        <p class="stm-mod-meta">${esc(creator)} · ${esc(when)}</p>
      </article>
    `;
  }).join('');
}

function _renderListBody() {
  const el = _rootEl?.querySelector('[data-stm-list-body]');
  if (el) el.innerHTML = state.loading ? '<p>Loading…</p>' : _renderModRows();
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
    }
  });

  root.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const action = t.dataset.stmAction;
    if (action === 'save') {
      _onSaveClick();
    } else if (action === 'revoke') {
      _onRevokeClick(t.dataset.stmModId);
    }
  });
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

// ── Revoke ───────────────────────────────────────────────────────────

async function _onRevokeClick(modId) {
  if (!modId) return;
  if (!confirm('Revoke this mod? The audit log will still record the creation event.')) return;
  try {
    // STM-9 (issue #416): same dedupe shape as POST — mark before DELETE.
    if (state.character?._id) markLocalWrite(String(state.character._id), { st_mod: true });
    await apiDelete(`/api/st_mods/${modId}`);
    await _refetchMods();
    _renderListBody();
    if (_onMutateCallback) _onMutateCallback();
  } catch (err) {
    console.error('[stm-panel] revoke failed:', err);
  }
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
