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

/** Install the delegated click handler on a root element (called once
 *  per page bootstrap from admin.js / player.js). Idempotent. */
export function installStModPopover(rootEl) {
  if (_installed || !rootEl) return;
  _installed = true;

  rootEl.addEventListener('click', (e) => {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;

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
    if (e.key === 'Escape' && _activePopover) _closeActive();
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

/** Resolve the active character from globals exposed by admin.js / player.js.
 *  Tolerant of either being unavailable (returns null). */
function _resolveActiveCharacter(_markerEl) {
  // Admin: window.chars[window.editIdx]
  if (Array.isArray(window.chars) && typeof window.editIdx === 'number' && window.editIdx >= 0) {
    return window.chars[window.editIdx] || null;
  }
  // Player: window.__activeChar (we'll wire this in player.js when installing)
  if (window.__activeChar) return window.__activeChar;
  return null;
}
