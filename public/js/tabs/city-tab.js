/* City tab — merged Who's Who + Map + Regents.
 * All sections collapsible, collapsed by default.
 * Map opens in a fullscreen pinch-zoom overlay.
 */

import { apiGet, apiPut } from '../data/api.js';
import { esc, displayName, sortName, redactPlayer } from '../data/helpers.js';
import { clanIcon, covIcon } from '../data/helpers.js';
import { getRole } from '../auth/discord.js';
import { renderMapStageHtml, attachDragHandlers } from '../components/map-overlay.js';

// Issue #9: capture latest chars + territories at render time so the map
// overlay (opened lazily from the button) has access to the same data the
// rest of the tab uses.
let _latestChars = [];
let _latestTerrs = [];

// ── Module-local helpers ───────────────────────────────────────────────────────

function bpIcon(c) {
  const bp = c.blood_potency ?? 0;
  const glyph = bp >= 2 ? '<span class="city-stat-glyph">✕</span>' : '';
  return `<span class="city-stat-icon"><img src="/assets/pdf/icons/bp-icon.png" alt="" class="city-stat-img">${glyph}</span>`;
}

function humanityIcon(c) {
  const hum = c.humanity ?? 5;
  let glyph = '';
  if (hum >= 8) glyph = '<span class="city-stat-glyph">^</span>';
  else if (hum < 4) glyph = '<span class="city-stat-glyph">v</span>';
  return `<span class="city-stat-icon"><img src="/assets/pdf/icons/humanity-icon.png" alt="" class="city-stat-img">${glyph}</span>`;
}

function charRow(c, badge) {
  const b = badge !== undefined ? badge : c.court_category;
  let h = '<div class="city-char-row">';
  h += '<div class="city-char-top">';
  h += `<span class="city-char-name">${esc(displayName(c))}`;
  if (b) h += ` <span class="city-char-badge">${esc(b)}</span>`;
  h += '</span>';
  h += '<div class="city-char-right">';
  if (c.clan) h += `<span class="city-char-clan">${clanIcon(c.clan, 12)}<span>${esc(c.clan)}</span></span>`;
  h += bpIcon(c) + humanityIcon(c);
  h += '</div>';
  h += '</div>';
  if (c.player) h += `<div class="city-char-player">${esc(redactPlayer(c.player))}</div>`;
  h += '</div>';
  return h;
}

export async function renderCityTab(el, territories = []) {
  el.innerHTML = '<p class="placeholder-msg">Loading…</p>';

  let chars = [];
  try {
    chars = await apiGet('/api/characters/public');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  // Cache for the lazy-opened map overlay (issue #9).
  _latestChars = chars;
  _latestTerrs = territories || [];

  // ── Data prep ──
  const CATEGORY_ORDER = ['Head of State', 'Primogen', 'Administrator', 'Socialite', 'Enforcer'];
  const courtHolders = chars.filter(c => CATEGORY_ORDER.includes(c.court_category))
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.court_category);
      const bi = CATEGORY_ORDER.indexOf(b.court_category);
      return ai - bi || sortName(a).localeCompare(sortName(b));
    });

  const covGroups = new Map();
  for (const c of chars) {
    const cov = c.covenant || 'Unaligned';
    if (!covGroups.has(cov)) covGroups.set(cov, []);
    covGroups.get(cov).push(c);
  }
  const sortedCovs = [...covGroups.keys()].sort((a, b) => a.localeCompare(b));

  const allTerrs = (territories || [])
    .sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));

  let h = '<div class="city-col">';

  // ── Map button ─────────────────────────────────────────────────────────────
  h += `<button class="city-map-btn" id="city-map-btn">
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
    <span>View City Map</span>
  </button>`;

  // ── Court (collapsible) ────────────────────────────────────────────────────
  h += `<details class="city-section">`;
  h += `<summary class="city-section-hd">Court <span class="city-section-count">${courtHolders.length}</span></summary>`;
  h += `<div class="city-section-body">`;
  if (courtHolders.length) {
    h += '<div class="city-char-list">';
    for (const c of courtHolders) h += charRow(c);
    h += '</div>';
  } else {
    h += '<p class="placeholder-msg city-placeholder">No court positions recorded yet.</p>';
  }
  h += '</div></details>';

  // ── Regencies (collapsible) ────────────────────────────────────────────────
  if (allTerrs.length) {
    h += `<details class="city-section">`;
    h += `<summary class="city-section-hd">Regencies <span class="city-section-count">${allTerrs.length}</span></summary>`;
    h += `<div class="city-section-body">`;
    h += '<div class="city-char-list">';
    for (const tr of allTerrs) {
      const rc = chars.find(ch => String(ch._id) === tr.regent_id);
      if (rc) {
        h += charRow(rc, tr.name || tr.id);
      } else {
        h += '<div class="city-char-row">';
        h += '<div class="city-char-top">';
        h += `<span class="city-char-name">(vacant) <span class="city-char-badge">${esc(tr.name || tr.id)}</span></span>`;
        h += '</div>';
        h += '</div>';
      }
    }
    h += '</div>';
    h += '</div></details>';
  }

  // ── Who's Who (collapsible) ────────────────────────────────────────────────
  h += `<details class="city-section">`;
  h += `<summary class="city-section-hd">Who's Who <span class="city-section-count">${chars.length}</span></summary>`;
  h += `<div class="city-section-body">`;

  for (const cov of sortedCovs) {
    const members = covGroups.get(cov);
    const sorted = [...members].sort((a, b) => sortName(a).localeCompare(sortName(b)));

    h += '<div class="city-cov-group">';
    h += `<div class="city-cov-heading">${covIcon(cov, 14)} <span>${esc(cov)}</span></div>`;
    h += '<div class="city-char-list">';
    for (const c of sorted) h += charRow(c);
    h += '</div>';
    h += '</div>';
  }

  h += '</div></details>';

  h += '</div>'; // city-col
  el.innerHTML = h;

  // ── Map overlay ────────────────────────────────────────────────────────────
  el.querySelector('#city-map-btn')?.addEventListener('click', _openMapOverlay);
}

// ── Fullscreen map overlay with pinch-zoom ───────────────────────────────────

let _mapOverlay = null;
// Issue #9: pending coord changes while ST drag-mode is active. Keyed by
// territory _id; values are { x, y } percent. Save commits these via PUT.
let _pendingCoords = new Map();
let _editMode = false;
let _detachDrag = null;

/**
 * Issue #9: public entry-point so the admin City view can open the same
 * fullscreen overlay (with the ST edit-mode toggle) without re-implementing
 * the pinch/zoom + drag/save pipeline. When called with `opts`, the cached
 * chars/territories are overwritten before opening.
 */
export function openCityMapOverlay(opts) {
  if (opts && Array.isArray(opts.chars)) _latestChars = opts.chars;
  if (opts && Array.isArray(opts.territories)) _latestTerrs = opts.territories;
  _openMapOverlay();
}

function _openMapOverlay() {
  if (_mapOverlay) { _mapOverlay.classList.add('on'); document.body.style.overflow = 'hidden'; return; }

  const isST = getRole() === 'st';

  const div = document.createElement('div');
  div.id = 'city-map-overlay';
  div.className = 'city-map-overlay on';
  // Stage transform replaces the prior img-only transform so the map_coords
  // overlay layer (sibling of the img inside the stage) pans/scales together
  // with the image (issue #9).
  const stageHtml = renderMapStageHtml({
    territories: _latestTerrs,
    chars: _latestChars,
    imgClass: 'city-map-img',
    imgId: 'city-map-img',
    editable: false,
  });
  let toolbarHtml = '';
  if (isST) {
    toolbarHtml = `<div class="city-map-toolbar" data-st-toolbar>
      <button class="city-map-edit-toggle" id="city-map-edit-toggle">Edit map placement</button>
      <button class="city-map-edit-save" id="city-map-edit-save" hidden>Save placement</button>
      <button class="city-map-edit-cancel" id="city-map-edit-cancel" hidden>Cancel</button>
      <span class="city-map-edit-status" id="city-map-edit-status" aria-live="polite"></span>
    </div>`;
  }
  div.innerHTML = `
    <button class="city-map-close" id="city-map-close">&times;</button>
    ${toolbarHtml}
    <div class="city-map-viewport" id="city-map-viewport">
      ${stageHtml}
    </div>`;
  document.body.appendChild(div);
  _mapOverlay = div;
  document.body.style.overflow = 'hidden';

  div.querySelector('#city-map-close').addEventListener('click', _closeMapOverlay);
  div.addEventListener('click', e => { if (e.target === div) _closeMapOverlay(); });

  if (isST) _wireEditMode(div);

  // Pinch-zoom + pan via CSS transform on the stage (so the overlay layer
  // pans/scales with the img — issue #9).
  const viewport = div.querySelector('#city-map-viewport');
  const stage = div.querySelector('[data-map-stage]');
  let scale = 1, posX = 0, posY = 0;
  let startDist = 0, startScale = 1;
  let panStartX = 0, panStartY = 0, startPosX = 0, startPosY = 0;
  let isPanning = false;

  function applyTransform() {
    stage.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
  }

  // Issue #9: edit-mode short-circuit. When dragging a label, skip the
  // pan/zoom touch handlers so the label drag wins (PointerEvents fire
  // alongside TouchEvents).
  function _isEditingLabelEvent(e) {
    return _editMode && e.target?.closest && e.target.closest('.map-label--editable');
  }

  // Touch: pinch-zoom + two-finger pan
  viewport.addEventListener('touchstart', e => {
    if (_isEditingLabelEvent(e)) return;
    if (e.touches.length === 2) {
      e.preventDefault();
      startDist = _dist(e.touches[0], e.touches[1]);
      startScale = scale;
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      panStartX = cx; panStartY = cy;
      startPosX = posX; startPosY = posY;
    } else if (e.touches.length === 1 && scale > 1) {
      isPanning = true;
      panStartX = e.touches[0].clientX;
      panStartY = e.touches[0].clientY;
      startPosX = posX; startPosY = posY;
    }
  }, { passive: false });

  viewport.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = _dist(e.touches[0], e.touches[1]);
      scale = Math.max(1, Math.min(5, startScale * (dist / startDist)));
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      posX = startPosX + (cx - panStartX);
      posY = startPosY + (cy - panStartY);
      applyTransform();
    } else if (e.touches.length === 1 && isPanning) {
      posX = startPosX + (e.touches[0].clientX - panStartX);
      posY = startPosY + (e.touches[0].clientY - panStartY);
      applyTransform();
    }
  }, { passive: false });

  viewport.addEventListener('touchend', e => {
    if (e.touches.length < 2) isPanning = false;
    if (scale <= 1) { scale = 1; posX = 0; posY = 0; applyTransform(); }
  });

  // Mouse: scroll to zoom, drag to pan
  viewport.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(1, Math.min(5, scale * delta));
    if (scale <= 1) { posX = 0; posY = 0; }
    applyTransform();
  }, { passive: false });

  let mouseDown = false, mx0 = 0, my0 = 0, px0 = 0, py0 = 0;
  viewport.addEventListener('mousedown', e => {
    if (scale <= 1) return;
    if (_isEditingLabelEvent(e)) return;
    mouseDown = true; mx0 = e.clientX; my0 = e.clientY; px0 = posX; py0 = posY;
    viewport.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!mouseDown) return;
    posX = px0 + (e.clientX - mx0);
    posY = py0 + (e.clientY - my0);
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    mouseDown = false;
    if (viewport) viewport.style.cursor = scale > 1 ? 'grab' : '';
  });

  // Double-tap to reset
  let lastTap = 0;
  viewport.addEventListener('touchend', e => {
    if (e.touches.length > 0) return;
    const now = Date.now();
    if (now - lastTap < 300) { scale = 1; posX = 0; posY = 0; applyTransform(); }
    lastTap = now;
  });
}

function _closeMapOverlay() {
  if (_mapOverlay) _mapOverlay.classList.remove('on');
  document.body.style.overflow = '';
  // Tear down any in-flight edit mode so the next open starts clean.
  if (_detachDrag) { _detachDrag(); _detachDrag = null; }
  _editMode = false;
  _pendingCoords.clear();
}

function _dist(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

// Issue #9: ST drag-to-place wiring. Toggles label editability, captures
// pending coord changes, and PUTs each modified territory's map_coords on
// Save. Cancel discards local changes (the next open re-renders from the
// canonical territories cache).
function _wireEditMode(overlayEl) {
  const toggleBtn = overlayEl.querySelector('#city-map-edit-toggle');
  const saveBtn   = overlayEl.querySelector('#city-map-edit-save');
  const cancelBtn = overlayEl.querySelector('#city-map-edit-cancel');
  const statusEl  = overlayEl.querySelector('#city-map-edit-status');
  const overlayLayer = overlayEl.querySelector('[data-map-overlay]');
  const stage = overlayEl.querySelector('[data-map-stage]');
  if (!toggleBtn || !saveBtn || !cancelBtn || !overlayLayer || !stage) return;

  function _setStatus(msg) { if (statusEl) statusEl.textContent = msg || ''; }

  function _enterEdit() {
    _editMode = true;
    _pendingCoords.clear();
    overlayLayer.classList.add('map-overlay-layer--editing');
    overlayLayer.dataset.mapEditable = '';
    overlayLayer.querySelectorAll('.map-label').forEach(el => el.classList.add('map-label--editable'));
    toggleBtn.hidden = true;
    saveBtn.hidden = false;
    cancelBtn.hidden = false;
    _setStatus('Drag a territory label to reposition. Save commits the new coordinates.');
    _detachDrag = attachDragHandlers(stage, (territoryId, coords) => {
      _pendingCoords.set(String(territoryId), coords);
      _setStatus(`${_pendingCoords.size} change${_pendingCoords.size === 1 ? '' : 's'} pending`);
    });
  }

  function _exitEdit() {
    _editMode = false;
    if (_detachDrag) { _detachDrag(); _detachDrag = null; }
    overlayLayer.classList.remove('map-overlay-layer--editing');
    delete overlayLayer.dataset.mapEditable;
    overlayLayer.querySelectorAll('.map-label').forEach(el => el.classList.remove('map-label--editable', 'map-label--dragging'));
    saveBtn.hidden = true;
    cancelBtn.hidden = true;
    toggleBtn.hidden = false;
  }

  function _restoreLabelPositions() {
    // Reset the in-DOM positions to whatever the cached territories carry,
    // discarding any drag state since the user cancelled.
    for (const t of _latestTerrs) {
      if (!t.map_coords) continue;
      const el = overlayLayer.querySelector(`.map-label[data-territory-id="${String(t._id)}"]`);
      if (!el) continue;
      el.style.left = (t.map_coords.x || 0) + '%';
      el.style.top = (t.map_coords.y || 0) + '%';
    }
  }

  toggleBtn.addEventListener('click', _enterEdit);

  cancelBtn.addEventListener('click', () => {
    _restoreLabelPositions();
    _pendingCoords.clear();
    _exitEdit();
    _setStatus('');
  });

  saveBtn.addEventListener('click', async () => {
    if (!_pendingCoords.size) { _exitEdit(); _setStatus(''); return; }
    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    _setStatus(`Saving ${_pendingCoords.size} change${_pendingCoords.size === 1 ? '' : 's'}…`);
    try {
      // Sequential PUTs — small N (max ~10 territories), keeps server load
      // and error semantics simple.
      for (const [tid, coords] of _pendingCoords.entries()) {
        const updated = await apiPut(`/api/territories/${tid}`, { map_coords: coords });
        // Reflect the saved value into the cached array so a re-open
        // (without a full reload) renders the persisted positions.
        const cached = _latestTerrs.find(t => String(t._id) === String(tid));
        if (cached) cached.map_coords = updated.map_coords || coords;
      }
      _pendingCoords.clear();
      _setStatus('Saved.');
      _exitEdit();
    } catch (err) {
      _setStatus('Save failed: ' + (err?.message || 'unknown error'));
    } finally {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
}
