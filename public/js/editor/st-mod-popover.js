/* ST mod popover (Epic STM, issue #385).
 *
 * Click-to-expand breakdown for any sheet-rendered stat whose path is
 * present in c._st_mod_overlay. Per ADR-004 Rev 2 §D4: list each mod
 * (no collapse in v1); per §D6, the popover is a pure read view —
 * never mutates tracker_state, characters, or st_mods documents.
 *
 * The buildPopover() function is a pure data → render-spec transform,
 * separately testable. renderPopoverHtml() converts the spec to HTML.
 * installStModPopover() wires a delegated click handler on a root
 * container so all markers on the sheet share one listener
 * (per memory feedback_listener_routing_static_blind_spot).
 */

import { esc } from '../data/helpers.js';
import { labelForPath } from '../data/st-mod-labels.js';
import { buildPopover } from '../data/st-mod-popover-spec.js';
import { apiPost } from '../data/api.js';
import { markLocalWrite } from '../data/ws.js';

// Re-export so existing import paths in the test (if anyone wanted to
// import it from here) continue to work. The vitest test imports from
// the pure-spec module directly to avoid the browser-only esc chain.
export { buildPopover };

const MARKER_SELECTOR = '[data-stm-marker-path]';

/** Render the popover spec to HTML. Pure string-building; the caller
 *  injects the result into the DOM and positions it.
 *
 *  Issue #408 (Epic STM UX polish — Finding 4): clearer visual hierarchy.
 *  Three logical sections (Base / Adjustments / Final) are emitted as
 *  distinct rows with explicit label+value span pairs so flex layout
 *  keeps them on a single line, plus a small "Adjustments" sub-header
 *  before the mod rows so the popover reads as start → adjust → result
 *  at a glance. CSS owns the separator borders + indentation. */
export function renderPopoverHtml(spec) {
  if (!spec) return '';
  const baseSuffix = spec.baseRow.fromTracker ? ' <span class="stm-pop-base-src">(from tracker)</span>' : '';
  const rows = spec.modRows.map(r => {
    const meta = (r.reason || r.creator)
      ? `<div class="stm-pop-mod-meta">${r.reason ? `<em>${esc(r.reason)}</em>` : ''}${r.reason && r.creator ? ' &mdash; ' : ''}${r.creator ? esc(r.creator) : ''}${r.when ? ` <span class="stm-pop-mod-when">${esc(r.when)}</span>` : ''}</div>`
      : '';
    return `<div class="stm-pop-mod"><span class="stm-pop-mod-delta">${esc(r.deltaSigned)}</span>${meta}</div>`;
  }).join('');
  return `
    <div class="stm-pop">
      <div class="stm-pop-head">${esc(spec.pathLabel)}</div>
      <div class="stm-pop-base">
        <span class="stm-pop-row-lbl">${esc(spec.baseRow.label)}</span>
        <span class="stm-pop-val">${esc(String(spec.baseRow.value))}${baseSuffix}</span>
      </div>
      <div class="stm-pop-mods">
        <div class="stm-pop-mods-hdr">Adjustments</div>
        ${rows}
      </div>
      <div class="stm-pop-final">
        <span class="stm-pop-row-lbl">${esc(spec.finalRow.label)}</span>
        <span class="stm-pop-val">${esc(String(spec.finalRow.value))}</span>
      </div>
    </div>
  `;
}

// ── Delegated DOM wiring ────────────────────────────────────────────

// One installed handler per page; tracks the currently open popover so
// the next click on a new marker (or anywhere else) closes the prior.
let _installed = false;
let _activePopover = null;

// Apply-bonus modal (STM-14, issue #1034). One instance at a time — opening
// a new one (or a marker popover) closes any prior via _closeApplyModal.
let _applyModalHost = null;
let _applyModalState = null; // { charId, path, label, delta, reason, showReasonToPlayer, error, saving }
let _onApplyMutate = null;

/** Render a marker span for a given path, IF c._st_mod_overlay[path]
 *  exists. Otherwise returns empty string — caller can inline this
 *  next to a stat display without conditional gating.
 *
 *  Issue #408 (Epic STM UX polish): for stat displays that are NOT
 *  dot-runs (current.* / derived.* / blood_potency / humanity in the
 *  stats strip), the standalone marker still applies. The title is
 *  now enriched with the stat label + signed delta so a hover
 *  immediately conveys what changed and by how much without the
 *  player having to click. Dot-run paths (attributes / skills) are
 *  marked via the dot class in shDotsWithBonus, not via this helper. */
export function markerFor(c, path) {
  const overlay = c?._st_mod_overlay?.[path];
  if (!overlay) return '';
  const sign = overlay.delta >= 0 ? '+' : '';
  const title = `ST adjustment: ${labelForPath(path)} ${sign}${overlay.delta}. Click for details.`;
  return `<span class="stm-marker" data-stm-marker-path="${esc(path)}" title="${esc(title)}"></span>`;
}

/** Render a sequence of markers for a list of paths. Skips any path
 *  without an overlay entry. Useful when a single stat display might
 *  carry multiple potential mod targets (e.g. current.willpower +
 *  derived.willpower_max on the WP cell). */
export function markersFor(c, paths) {
  return paths.map(p => markerFor(c, p)).join('');
}

/** Render the "apply an audited ST bonus" affordance for a given
 *  attribute/skill stat_path (issue #1034, STM-14). Co-located here per
 *  the story's Dev Notes: apply + view live in one place alongside the
 *  marker/popover machinery.
 *
 *  Callers (editor/sheet.js's shRenderAttributes/shRenderSkills) only
 *  render this in the non-edit-mode branch — the base-value editor
 *  strips the overlay on entry (ADR-004 §D8/§D9), so an st_mod created
 *  there would be invisible. Both consumers of shRenderAttributes/Skills
 *  (admin.js, and app.js's embedded ST editor) are already ST-gated, so
 *  no additional role check is needed here.
 *
 *  The character id travels in the DOM (data-stm-apply-char-id) rather
 *  than via _resolveActiveCharacter(), so the create flow doesn't depend
 *  on window.chars/window.editIdx being populated. */
export function applyAffordance(c, path, label) {
  if (!c?._id) return '';
  const title = `Apply an ST bonus to ${label}`;
  return `<button type="button" class="stm-mod-btn stm-apply-btn" data-stm-apply-path="${esc(path)}" data-stm-apply-label="${esc(label)}" data-stm-apply-char-id="${esc(String(c._id))}" title="${esc(title)}">+</button>`;
}

/** Install the delegated click handler on a root element (called once
 *  per page bootstrap from admin.js / player.js / app.js). Idempotent.
 *
 *  `onMutate(characterId)` (issue #1034) is called after a successful
 *  apply-bonus POST so the caller can re-run the existing overlay
 *  composition (applyOverlayToAll / renderSheetWithOverlay) and re-render
 *  — reusing the same path the WS onStModUpdate handler already uses,
 *  per ADR-004 single-composition-site invariant. */
export function installStModPopover(rootEl, onMutate) {
  if (_installed || !rootEl) return;
  _installed = true;
  _onApplyMutate = typeof onMutate === 'function' ? onMutate : null;

  rootEl.addEventListener('click', (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;

    const applyBtn = target.closest('[data-stm-apply-path]');
    if (applyBtn) {
      e.stopPropagation();
      _openApplyModal(applyBtn.dataset.stmApplyCharId, applyBtn.dataset.stmApplyPath, applyBtn.dataset.stmApplyLabel);
      return;
    }

    const marker = target.closest(MARKER_SELECTOR);
    if (marker) {
      e.stopPropagation();
      _openForMarker(marker);
      return;
    }

    // Click outside any marker AND outside the active popover → close.
    if (_activePopover && !target.closest('.stm-pop-host')) {
      _closeActive();
    }
  });

  // Also close on Escape.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (_activePopover) _closeActive();
    if (_applyModalHost) _closeApplyModal();
  });
}

function _openForMarker(markerEl) {
  // If clicking the marker whose popover is already open, close it.
  if (_activePopover && _activePopover.dataset.stmMarkerSource === markerEl.dataset.stmMarkerPath) {
    _closeActive();
    return;
  }
  _closeActive();

  const path = markerEl.dataset.stmMarkerPath;
  // The current character is read via the sheet-owner's exposed window.chars
  // + window.editIdx (admin) or window.activeChar (player). Both expose enough
  // to recover the overlay. Falls back to walking up looking for a closest
  // [data-stm-char-id] attribute if the global isn't set.
  const c = _resolveActiveCharacter(markerEl);
  if (!c || !c._st_mod_overlay) return;
  const entry = c._st_mod_overlay[path];
  if (!entry) return;

  const spec = buildPopover(entry, path);
  const host = document.createElement('div');
  host.className = 'stm-pop-host';
  host.dataset.stmMarkerSource = path;
  host.innerHTML = renderPopoverHtml(spec);

  // Position next to marker, clamped to viewport.
  const rect = markerEl.getBoundingClientRect();
  host.style.position = 'fixed';
  host.style.top = `${Math.min(window.innerHeight - 220, rect.bottom + 6)}px`;
  host.style.left = `${Math.min(window.innerWidth - 320, rect.left)}px`;
  host.style.zIndex = '9999';

  document.body.appendChild(host);
  _activePopover = host;
}

function _closeActive() {
  if (_activePopover && _activePopover.parentNode) {
    _activePopover.parentNode.removeChild(_activePopover);
  }
  _activePopover = null;
}

// ── Apply-bonus modal (STM-14, issue #1034) ─────────────────────────

function _openApplyModal(charId, path, label) {
  if (!charId || !path) return;
  _closeActive(); // any open marker popover shouldn't linger under the modal
  _applyModalState = {
    charId: String(charId),
    path,
    label,
    delta: 1,
    reason: '',
    showReasonToPlayer: false,
    error: null,
    saving: false,
  };
  _renderApplyModal();
}

function _closeApplyModal() {
  if (_applyModalHost && _applyModalHost.parentNode) {
    _applyModalHost.parentNode.removeChild(_applyModalHost);
  }
  _applyModalHost = null;
  _applyModalState = null;
}

function _renderApplyModal() {
  if (_applyModalHost && _applyModalHost.parentNode) {
    _applyModalHost.parentNode.removeChild(_applyModalHost);
  }
  _applyModalHost = null;
  if (!_applyModalState) return;

  const st = _applyModalState;
  const host = document.createElement('div');
  host.className = 'stm-modal-overlay';
  host.innerHTML = `
    <div class="stm-modal" role="dialog" aria-modal="true">
      <h3 class="stm-modal-title--action">Apply ST bonus &mdash; ${esc(st.label)}</h3>
      <div class="stm-form-row">
        <label>Delta
          <input type="number" data-stm-apply-field="delta" value="${esc(String(st.delta))}" step="1">
        </label>
      </div>
      <div class="stm-form-row">
        <label class="stm-form-reason">Reason
          <input type="text" data-stm-apply-field="reason" value="${esc(st.reason)}" placeholder="Why the adjustment?">
        </label>
        <label class="stm-form-show-reason">
          <input type="checkbox" data-stm-apply-field="show_reason_to_player" ${st.showReasonToPlayer ? 'checked' : ''}>
          Show reason to player
        </label>
      </div>
      <div class="stm-modal-actions">
        <button type="button" class="stm-mod-btn" data-stm-apply-action="confirm" ${st.saving ? 'disabled' : ''}>Apply</button>
        <button type="button" class="stm-mod-btn" data-stm-apply-action="cancel">Cancel</button>
        ${st.error ? `<span class="stm-form-error">${esc(st.error)}</span>` : ''}
      </div>
    </div>
  `;

  host.addEventListener('click', (e) => {
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (!t) return;
    if (t === host) { _closeApplyModal(); return; } // backdrop click
    const btn = t.closest('[data-stm-apply-action]');
    if (!btn) return;
    const action = btn.dataset.stmApplyAction;
    if (action === 'cancel') _closeApplyModal();
    else if (action === 'confirm') _onApplyConfirm();
  });

  host.addEventListener('change', (e) => {
    const t = e.target instanceof HTMLElement ? e.target : null;
    if (!t || !t.dataset.stmApplyField || !_applyModalState) return;
    const key = t.dataset.stmApplyField;
    if (key === 'delta') _applyModalState.delta = parseInt(t.value, 10) || 0;
    else if (key === 'show_reason_to_player') _applyModalState.showReasonToPlayer = t.checked;
    else if (key === 'reason') _applyModalState.reason = t.value;
  });

  document.body.appendChild(host);
  _applyModalHost = host;
}

/** Create flow — mirrors st-mods-panel.js's _onSaveClick (:392-442):
 *  validate → markLocalWrite BEFORE the POST (STM-9 / ADR-004 Rev 3 §D11,
 *  suppresses the WS echo) → POST /api/st_mods → close → onMutate refetch
 *  + re-render via the caller's single composition-site callback.
 *  Author/timestamp are never sent — the server stamps both (ADR-004 §D17). */
async function _onApplyConfirm() {
  const st = _applyModalState;
  if (!st || st.saving) return;

  const delta = Number.isInteger(st.delta) ? st.delta : parseInt(st.delta, 10);
  const reason = (st.reason || '').trim();

  if (!Number.isInteger(delta) || delta === 0) {
    st.error = 'Delta must be a non-zero integer.';
    _renderApplyModal();
    return;
  }
  if (!reason) {
    st.error = 'Reason is required.';
    _renderApplyModal();
    return;
  }

  st.saving = true;
  st.error = null;
  _renderApplyModal();

  const charId = st.charId;
  try {
    markLocalWrite(charId, { st_mod: true });
    await apiPost('/api/st_mods', {
      character_id: charId,
      stat_path: st.path,
      delta,
      reason,
      show_reason_to_player: !!st.showReasonToPlayer,
    });
    _closeApplyModal();
    if (_onApplyMutate) await _onApplyMutate(charId);
  } catch (err) {
    if (_applyModalState) {
      _applyModalState.error = err?.message || 'Failed to create mod.';
      _applyModalState.saving = false;
      _renderApplyModal();
    }
  }
}

/** Resolve the active character from globals exposed by admin.js / player.js.
 *  Tolerant of either being unavailable (returns null). */
function _resolveActiveCharacter(_markerEl) {
  // #1040: every sheet renderer (editor/sheet.js, suite/sheet.js, player.js)
  // sets window.__activeChar to the rendered character. The old admin branch
  // read window.chars/window.editIdx, which are never assigned (they live in
  // the editor `state` module, not on window) — it silently fell through and
  // the popover only worked when __activeChar was left over from a prior view.
  if (window.__activeChar) return window.__activeChar;
  return null;
}
