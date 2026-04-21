/* City tab — merged Who's Who + Map + Regents.
 * All sections collapsible, collapsed by default.
 * Map opens in a fullscreen pinch-zoom overlay.
 */

import { apiGet } from '../data/api.js';
import { esc, displayName, sortName, redactPlayer } from '../data/helpers.js';
import { clanIcon, covIcon } from '../data/helpers.js';

export async function renderCityTab(el, territories = []) {
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let chars = [];
  try {
    chars = await apiGet('/api/characters/public');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

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

  const regentTerrs = (territories || []).filter(t => t.regent_id)
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
    h += '<div class="city-office-list">';
    for (const c of courtHolders) {
      h += '<div class="city-office-row">';
      h += `<span class="city-office-name">${esc(displayName(c))}</span>`;
      h += `<span class="city-office-position">${esc(c.court_category)}</span>`;
      h += '</div>';
    }
    h += '</div>';
  } else {
    h += '<p class="placeholder-msg city-placeholder">No court positions recorded yet.</p>';
  }
  h += '</div></details>';

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
    for (const c of sorted) {
      h += '<div class="city-char-row">';
      h += '<div class="city-char-top">';
      h += `<span class="city-char-name">${esc(displayName(c))}`;
      if (c.court_category) h += ` <span class="city-char-badge">${esc(c.court_category)}</span>`;
      h += '</span>';
      if (c.clan) h += `<span class="city-char-clan">${clanIcon(c.clan, 12)}<span>${esc(c.clan)}</span></span>`;
      h += '</div>';
      if (c.player) h += `<div class="city-char-player">${esc(redactPlayer(c.player))}</div>`;
      h += '</div>';
    }
    h += '</div>';
    h += '</div>';
  }

  h += '</div></details>';

  // ── Regents (collapsible) ──────────────────────────────────────────────────
  if (regentTerrs.length) {
    h += `<details class="city-section">`;
    h += `<summary class="city-section-hd">Regents <span class="city-section-count">${regentTerrs.length}</span></summary>`;
    h += `<div class="city-section-body">`;
    h += '<div class="city-regent-list">';
    for (const tr of regentTerrs) {
      const rc = chars.find(ch => String(ch._id) === tr.regent_id);
      const name = rc ? displayName(rc) : '(vacant)';
      h += `<div class="city-regent-row"><span class="city-regent-terr">${esc(tr.name || tr.id)}</span><span class="city-regent-name">${esc(name)}</span></div>`;
    }
    h += '</div>';
    h += '</div></details>';
  }

  h += '</div>'; // city-col
  el.innerHTML = h;

  // ── Map overlay ────────────────────────────────────────────────────────────
  el.querySelector('#city-map-btn')?.addEventListener('click', _openMapOverlay);
}

// ── Fullscreen map overlay with pinch-zoom ───────────────────────────────────

let _mapOverlay = null;

function _openMapOverlay() {
  if (_mapOverlay) { _mapOverlay.classList.add('on'); document.body.style.overflow = 'hidden'; return; }

  const div = document.createElement('div');
  div.id = 'city-map-overlay';
  div.className = 'city-map-overlay on';
  div.innerHTML = `
    <button class="city-map-close" id="city-map-close">&times;</button>
    <div class="city-map-viewport" id="city-map-viewport">
      <img class="city-map-img" src="/assets/Terra Mortis Map.png" alt="Terra Mortis City Map" id="city-map-img">
    </div>`;
  document.body.appendChild(div);
  _mapOverlay = div;
  document.body.style.overflow = 'hidden';

  div.querySelector('#city-map-close').addEventListener('click', _closeMapOverlay);
  div.addEventListener('click', e => { if (e.target === div) _closeMapOverlay(); });

  // Pinch-zoom + pan via CSS transform
  const viewport = div.querySelector('#city-map-viewport');
  const img = div.querySelector('#city-map-img');
  let scale = 1, posX = 0, posY = 0;
  let startDist = 0, startScale = 1;
  let panStartX = 0, panStartY = 0, startPosX = 0, startPosY = 0;
  let isPanning = false;

  function applyTransform() {
    img.style.transform = `translate(${posX}px, ${posY}px) scale(${scale})`;
  }

  // Touch: pinch-zoom + two-finger pan
  viewport.addEventListener('touchstart', e => {
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
}

function _dist(a, b) {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}
