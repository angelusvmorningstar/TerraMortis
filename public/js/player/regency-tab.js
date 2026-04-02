/**
 * Regency tab — standalone territory management for regents.
 * Residency grid (10 slots) + regency action.
 * Persists to /api/territory-residency and saves action to downtime submission.
 */

import { apiGet, apiPut } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { TERRITORY_DATA, AMBIENCE_CAP } from './downtime-data.js';

const RESIDENCY_SLOTS = 12; // Regent + Lieutenant + 10 feeding rights

let currentChar = null;
let allCharNames = [];
let persistedResidency = [];

export async function renderRegencyTab(container, char) {
  currentChar = char;
  if (!container || !char?.regent_territory) {
    if (container) container.innerHTML = '';
    return;
  }

  // Load character names for dropdowns
  try {
    allCharNames = await apiGet('/api/characters/names');
  } catch { allCharNames = []; }

  // Load persisted residency
  try {
    const res = await apiGet(`/api/territory-residency?territory=${encodeURIComponent(char.regent_territory)}`);
    persistedResidency = res?.residents || [];
  } catch { persistedResidency = []; }

  render(container);
}

function getRegentCap() {
  const terr = TERRITORY_DATA.find(t => t.name === currentChar.regent_territory);
  return terr ? (AMBIENCE_CAP[terr.ambience] || 5) : 5;
}

function render(container) {
  const cap = getRegentCap();
  const terrName = currentChar.regent_territory;
  const terr = TERRITORY_DATA.find(t => t.name === terrName);
  const ambience = terr ? terr.ambience : 'Unknown';
  const regentName = displayName(currentChar);

  let h = '<div class="regency-wrap">';
  h += `<h3 class="regency-title">Regency: ${esc(terrName)}</h3>`;
  h += `<p class="regency-meta">Ambience: ${esc(ambience)} — Feeding rights cap: ${cap}</p>`;
  h += `<p class="regency-desc">Grant feeding rights for your territory. Slots beyond the cap are highlighted as over-capacity.</p>`;

  // Residency grid
  h += '<div class="dt-residency-grid">';
  for (let i = 1; i <= RESIDENCY_SLOTS; i++) {
    const overCap = i > cap;
    const rowClass = overCap ? 'dt-residency-row dt-over-cap' : 'dt-residency-row';
    const savedVal = persistedResidency[i - 1] || '';

    let label, locked = false, value = savedVal;
    if (i === 1) { label = 'Regent'; locked = true; value = currentChar._id; }
    else if (i === 2) {
      label = 'Lieutenant';
      locked = true;
      // Lieutenant is set on the character record, not selectable
      value = currentChar.regent_lieutenant || '';
    }
    else { label = `Feeding Right ${i - 2}`; }

    h += `<div class="${rowClass}">`;
    h += `<span class="dt-residency-label">${label}</span>`;

    if (locked) {
      // Find display name for locked slots
      let lockedName = '';
      if (i === 1) {
        lockedName = regentName;
      } else if (value) {
        const ltChar = allCharNames.find(c => c.name === value || c._id === value);
        lockedName = ltChar ? displayName(ltChar) : value;
      } else {
        lockedName = '— None —';
      }
      h += `<span class="dt-residency-locked">${esc(lockedName)}</span>`;
      h += `<input type="hidden" id="reg-slot-${i}" value="${esc(value)}">`;
    } else {
      h += `<select id="reg-slot-${i}" class="qf-select dt-residency-select" data-residency-slot="${i}">`;
      h += '<option value="">— None —</option>';
      for (const c of allCharNames) {
        const cName = displayName(c);
        const sel = value === c._id ? ' selected' : '';
        h += `<option value="${esc(c._id)}"${sel}>${esc(cName)}</option>`;
      }
      h += '</select>';
    }

    if (overCap) h += '<span class="dt-over-cap-warn">Over capacity</span>';
    h += '</div>';
  }
  h += '</div>';

  // Save button
  h += '<div class="regency-actions">';
  h += '<button id="reg-save" class="qf-submit-btn">Save Feeding Rights</button>';
  h += '<span id="reg-save-status" class="qf-save-status"></span>';
  h += '</div>';

  h += '</div>';
  container.innerHTML = h;
  wireEvents(container);
}

function wireEvents(container) {
  // Residency dropdown changes — disable already-selected
  container.querySelectorAll('[data-residency-slot]').forEach(sel => {
    sel.addEventListener('change', () => updateResidencyOptions(container));
  });
  updateResidencyOptions(container);

  // Save
  container.querySelector('#reg-save')?.addEventListener('click', saveRegency);
}

function updateResidencyOptions(container) {
  const selects = container.querySelectorAll('[data-residency-slot]');
  const selected = new Set();
  selected.add(currentChar._id);
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
  const residents = [];
  for (let i = 1; i <= RESIDENCY_SLOTS; i++) {
    const el = document.getElementById(`reg-slot-${i}`);
    residents.push(el?.value || '');
  }

  try {
    await apiPut('/api/territory-residency', {
      territory: currentChar.regent_territory,
      residents: residents.filter(Boolean),
    });
    persistedResidency = residents;
    if (statusEl) statusEl.textContent = 'Saved';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

/** Get the current residency list (for downtime submission to include). */
export function getResidencyList() {
  const residents = [];
  for (let i = 1; i <= RESIDENCY_SLOTS; i++) {
    const el = document.getElementById(`reg-slot-${i}`);
    residents.push(el?.value || '');
  }
  return residents;
}
