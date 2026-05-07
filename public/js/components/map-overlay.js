/**
 * City map overlay component (issue #9).
 *
 * Two surfaces consume this:
 *   - public/js/tabs/city-tab.js  — World fullscreen pinch/zoom overlay
 *   - public/js/app.js (Map tab)  — inline static image with regent panel below
 *
 * Both wrap the map image in a `.map-stage` so the overlay layer is a sibling
 * of the img and inherits any stage-level CSS transform (city-tab applies
 * pinch/zoom to the stage; map tab leaves it untransformed). Labels are
 * absolutely positioned at `map_coords.x`% / `map_coords.y`% relative to the
 * stage — which sizes to the rendered image — so they track responsive width
 * and zoom transforms automatically.
 *
 * Edit mode (ST-only) layers a `cursor: move` + pointerdown handler onto each
 * label; pointer client coords convert to natural-percent via the IMG's
 * post-transform getBoundingClientRect(), so the conversion is correct under
 * any pinch/zoom scale without recomputing the transform manually.
 */

import { esc, displayName, findRegentTerritory } from '../data/helpers.js';

export const MAP_IMG_SRC = '/assets/Terra Mortis Map.png';

/**
 * Render the stage HTML — `<div class="map-stage"><img><div class="map-overlay-layer">…</div></div>`.
 * Pass `editable: true` to mark labels as drag-eligible (ST mode).
 *
 * @param {object} opts
 * @param {object[]} opts.territories — territory documents
 * @param {object[]} opts.chars — character documents (for displayName resolution)
 * @param {string} [opts.imgClass='city-map-img'] — class on the <img>
 * @param {string} [opts.imgId] — optional id on the <img>
 * @param {boolean} [opts.editable=false] — render labels with drag handles
 * @param {string} [opts.alt='Terra Mortis City Map']
 */
export function renderMapStageHtml(opts) {
  const { territories = [], chars = [], imgClass = 'city-map-img', imgId, editable = false, alt = 'Terra Mortis City Map' } = opts || {};
  const idAttr = imgId ? ` id="${esc(imgId)}"` : '';

  let labels = '';
  for (const t of territories) {
    if (!_hasCoords(t.map_coords)) continue;
    labels += renderLabelHtml(t, chars, editable);
  }

  return `<div class="map-stage" data-map-stage>`
    + `<img class="${esc(imgClass)}" src="${esc(MAP_IMG_SRC)}" alt="${esc(alt)}"${idAttr}>`
    + `<div class="map-overlay-layer" data-map-overlay${editable ? ' data-map-editable' : ''}>${labels}</div>`
    + `</div>`;
}

/**
 * Render a single territory label. Vacant territories render '(vacant)'
 * for the regent line; ambience comes straight from the territory doc.
 */
export function renderLabelHtml(territory, chars, editable = false) {
  const regent = territory.regent_id ? (chars || []).find(c => String(c._id) === String(territory.regent_id)) : null;
  const regentName = regent ? displayName(regent) : '(vacant)';
  const ambience = territory.ambience || '';
  const x = territory.map_coords?.x ?? 0;
  const y = territory.map_coords?.y ?? 0;
  const editClass = editable ? ' map-label--editable' : '';
  const idAttr = territory._id ? String(territory._id) : '';

  let h = `<div class="map-label${editClass}"`
    + ` style="left:${x}%;top:${y}%"`
    + ` data-map-label`
    + ` data-territory-id="${esc(idAttr)}"`
    + (editable ? ` role="button" tabindex="0" aria-label="Drag to reposition ${esc(territory.name || '')}"` : '')
    + '>';
  h += `<span class="map-label__regent">${esc(regentName)}</span>`;
  if (ambience) h += `<span class="map-label__ambience">${esc(ambience)}</span>`;
  h += '</div>';
  return h;
}

function _hasCoords(c) {
  return c && typeof c.x === 'number' && typeof c.y === 'number'
    && c.x >= 0 && c.x <= 100 && c.y >= 0 && c.y <= 100;
}

/**
 * Convert a pointer's client coords into image-natural-percent. Uses the IMG
 * element's getBoundingClientRect(), which already factors in any CSS
 * transform on the parent stage — so this works under pinch/zoom without
 * needing the caller to track the transform state.
 *
 * Returns null if the pointer is outside the image bounds (caller decides
 * whether to clamp or reject the drag move).
 */
export function pointerToPercent(clientX, clientY, imgEl) {
  if (!imgEl) return null;
  const rect = imgEl.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  return { x, y };
}

/**
 * Wire drag handlers onto every editable label inside `stageEl`. Uses the
 * unified PointerEvent API (mouse + touch). On each drag end, calls
 * `onChange(territoryId, { x, y })` so the caller can update local state.
 *
 * Returns a teardown function that removes all listeners.
 */
export function attachDragHandlers(stageEl, onChange) {
  if (!stageEl) return () => {};
  const imgEl = stageEl.querySelector('img');
  if (!imgEl) return () => {};

  let activeLabel = null;
  let pointerId = null;

  function onDown(e) {
    const label = e.target.closest('.map-label--editable');
    if (!label || !stageEl.contains(label)) return;
    e.preventDefault();
    activeLabel = label;
    pointerId = e.pointerId;
    label.setPointerCapture?.(pointerId);
    label.classList.add('map-label--dragging');
  }

  function onMove(e) {
    if (!activeLabel || e.pointerId !== pointerId) return;
    e.preventDefault();
    const pct = pointerToPercent(e.clientX, e.clientY, imgEl);
    if (!pct) return;
    const x = Math.max(0, Math.min(100, pct.x));
    const y = Math.max(0, Math.min(100, pct.y));
    activeLabel.style.left = x + '%';
    activeLabel.style.top = y + '%';
  }

  function onUp(e) {
    if (!activeLabel || e.pointerId !== pointerId) return;
    e.preventDefault();
    const pct = pointerToPercent(e.clientX, e.clientY, imgEl);
    let coords;
    if (pct) {
      coords = {
        x: Math.max(0, Math.min(100, pct.x)),
        y: Math.max(0, Math.min(100, pct.y)),
      };
    } else {
      // Fall back to the style-encoded position if the pointer left the image.
      coords = {
        x: parseFloat(activeLabel.style.left) || 0,
        y: parseFloat(activeLabel.style.top) || 0,
      };
    }
    activeLabel.classList.remove('map-label--dragging');
    activeLabel.releasePointerCapture?.(pointerId);
    const tid = activeLabel.dataset.territoryId;
    activeLabel = null;
    pointerId = null;
    if (tid && typeof onChange === 'function') onChange(tid, coords);
  }

  stageEl.addEventListener('pointerdown', onDown);
  stageEl.addEventListener('pointermove', onMove);
  stageEl.addEventListener('pointerup', onUp);
  stageEl.addEventListener('pointercancel', onUp);

  return () => {
    stageEl.removeEventListener('pointerdown', onDown);
    stageEl.removeEventListener('pointermove', onMove);
    stageEl.removeEventListener('pointerup', onUp);
    stageEl.removeEventListener('pointercancel', onUp);
  };
}
