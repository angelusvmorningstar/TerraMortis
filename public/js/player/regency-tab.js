/**
 * Regency tab — standalone territory management for regents.
 * Feeding rights are stored on the territory document (territories collection)
 * as `feeding_rights: string[]` — same source as the ST City tab.
 */

import { apiGet, apiPost } from '../data/api.js';
import { esc, displayName, findRegentTerritory } from '../data/helpers.js';
import { TERRITORY_DATA, AMBIENCE_CAP } from './downtime-data.js';

const FEEDING_SLOTS = 10; // editable feeding right slots (excludes Regent + Lieutenant header rows)

let currentChar = null;
let _territories = [];
let allCharNames = [];

function _regInfo() { return findRegentTerritory(_territories, currentChar); }

function _terrDoc() {
  const ri = _regInfo();
  return ri ? _territories.find(t => t.id === ri.territoryId) : null;
}

export async function renderRegencyTab(container, char, territories) {
  currentChar = char;
  _territories = territories || [];
  const ri = _regInfo();
  if (!container || !ri) {
    if (container) container.innerHTML = '';
    return;
  }

  // Load character names for dropdowns
  try {
    allCharNames = await apiGet('/api/characters/names');
  } catch { allCharNames = []; }

  render(container);
}

function getRegentCap() {
  const ri = _regInfo();
  const terr = ri ? TERRITORY_DATA.find(t => t.name === ri.territory) : null;
  return terr ? (AMBIENCE_CAP[terr.ambience] || 5) : 5;
}

function render(container) {
  const cap = getRegentCap();
  const ri = _regInfo();
  const terrName = ri?.territory || '';
  const terr = TERRITORY_DATA.find(t => t.name === terrName);
  const ambience = terr ? terr.ambience : 'Unknown';
  const regentName = displayName(currentChar);
  const feedingRights = _terrDoc()?.feeding_rights || [];

  let h = '<div class="regency-wrap">';
  h += `<h3 class="regency-title">Regency: ${esc(terrName)}</h3>`;
  h += `<p class="regency-meta">Ambience: ${esc(ambience)} — Feeding rights cap: ${cap}</p>`;
  h += `<p class="regency-desc">Grant feeding rights for your territory. Slots beyond the cap are highlighted as over-capacity.</p>`;

  // Header rows — Regent (locked) and Lieutenant (locked)
  h += '<div class="dt-residency-grid">';

  // Regent row
  h += '<div class="dt-residency-row">';
  h += '<span class="dt-residency-label">Regent</span>';
  h += `<span class="dt-residency-locked">${esc(regentName)}</span>`;
  h += '</div>';

  // Lieutenant row
  const ltId = ri?.lieutenantId || '';
  const ltChar = ltId ? allCharNames.find(c => String(c._id) === ltId) : null;
  const ltName = ltChar ? displayName(ltChar) : (ltId ? ltId : '— None —');
  h += '<div class="dt-residency-row">';
  h += '<span class="dt-residency-label">Lieutenant</span>';
  h += `<span class="dt-residency-locked">${esc(ltName)}</span>`;
  h += '</div>';

  // Feeding right slots
  for (let i = 1; i <= FEEDING_SLOTS; i++) {
    const overCap = i + 2 > cap; // slots 1-2 are regent+lieutenant, feeding starts at position 3
    const rowClass = overCap ? 'dt-residency-row dt-over-cap' : 'dt-residency-row';
    const savedVal = feedingRights[i - 1] || '';

    h += `<div class="${rowClass}">`;
    h += `<span class="dt-residency-label">Feeding Right ${i}</span>`;
    h += `<select id="reg-slot-${i}" class="qf-select dt-residency-select" data-residency-slot="${i}">`;
    h += '<option value="">— None —</option>';
    for (const c of allCharNames) {
      const sel = savedVal === String(c._id) ? ' selected' : '';
      h += `<option value="${esc(String(c._id))}"${sel}>${esc(displayName(c))}</option>`;
    }
    h += '</select>';
    if (overCap) h += '<span class="dt-over-cap-warn">Over capacity</span>';
    h += '</div>';
  }
  h += '</div>';

  // Save button
  h += '<div class="regency-actions">';
  h += '<button id="reg-save" class="qf-btn qf-btn-submit">Save Feeding Rights</button>';
  h += '<span id="reg-save-status" class="qf-save-status"></span>';
  h += '</div>';

  h += '</div>';
  container.innerHTML = h;
  wireEvents(container);
}

function wireEvents(container) {
  container.querySelectorAll('[data-residency-slot]').forEach(sel => {
    sel.addEventListener('change', () => updateResidencyOptions(container));
  });
  updateResidencyOptions(container);
  container.querySelector('#reg-save')?.addEventListener('click', saveRegency);
}

function updateResidencyOptions(container) {
  const selects = container.querySelectorAll('[data-residency-slot]');
  const selected = new Set([String(currentChar._id)]);
  selects.forEach(sel => { if (sel.value) selected.add(sel.value); });

  selects.forEach(sel => {
    const myVal = sel.value;
    for (const opt of sel.options) {
      if (!opt.value) continue;
      opt.disabled = opt.value !== myVal && selected.has(opt.value);
    }
  });
}

async function saveRegency() {
  const statusEl = document.getElementById('reg-save-status');
  const ri = _regInfo();
  if (!ri?.territoryId) {
    if (statusEl) statusEl.textContent = 'Error: territory not found';
    return;
  }

  const feedingRights = [];
  for (let i = 1; i <= FEEDING_SLOTS; i++) {
    const el = document.getElementById(`reg-slot-${i}`);
    if (el?.value) feedingRights.push(el.value);
  }

  try {
    await apiPost('/api/territories', { id: ri.territoryId, feeding_rights: feedingRights });

    // Update local territory doc so display reflects saved state
    const td = _territories.find(t => t.id === ri.territoryId);
    if (td) td.feeding_rights = feedingRights;

    if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

/** Get the current feeding rights list (for downtime submission). */
export function getResidencyList() {
  const list = [];
  for (let i = 1; i <= FEEDING_SLOTS; i++) {
    const el = document.getElementById(`reg-slot-${i}`);
    list.push(el?.value || '');
  }
  return list;
}
