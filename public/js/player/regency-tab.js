/**
 * Regency tab — standalone territory management for regents.
 * Feeding rights are stored on the territory document (territories collection)
 * as `feeding_rights: string[]` — same source as the ST City tab.
 *
 * Regent (slot 1) and Lieutenant (slot 2) are implicit — they are displayed
 * as locked header rows and are NOT included in the feeding_rights dropdowns
 * or the feeding_rights array sent to the API.
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc, displayName, findRegentTerritory } from '../data/helpers.js';
import { TERRITORY_DATA, AMBIENCE_CAP } from './downtime-data.js';

const MAX_FEEDING_POSITION = 12; // maximum position index to scan (regent=1, lt=2, additional 3-12)

let currentChar = null;
let _territories = [];
let allCharNames = [];
let _activeCycle = null;

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

  // Load active cycle for confirmation state
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    const sorted = cycles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    _activeCycle = sorted.find(c => c.status === 'active') || null;
  } catch { _activeCycle = null; }

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
  const regentId = String(currentChar._id);
  const rawFeedingRights = _terrDoc()?.feeding_rights || [];
  const terrId = ri?.territoryId || '';

  // Regent is always slot 1; lieutenant is slot 2 if present
  const ltId = ri?.lieutenantId || '';
  const ltChar = ltId ? allCharNames.find(c => String(c._id) === ltId) : null;
  const ltName = ltChar ? displayName(ltChar) : (ltId ? ltId : '— None —');
  const loopStart = ltId ? 3 : 2; // feeding right dropdowns begin at this position

  // Strip regent and lieutenant IDs from saved array (handles legacy data that included them)
  const additionalRights = rawFeedingRights.filter(
    id => id !== regentId && (!ltId || id !== ltId)
  );

  // Render slots from loopStart; show any existing over-cap entries too
  const loopEnd = Math.max(cap, loopStart + additionalRights.length - 1);

  // Confirmation state for active cycle
  const cycleConfirmed = _activeCycle?.feeding_rights_confirmed === true;
  const myConfirmation = _activeCycle
    ? (_activeCycle.regent_confirmations || []).find(c => c.territory_id === terrId)
    : null;
  const confirmedRights = myConfirmation?.rights || [];

  let h = '<div class="regency-wrap">';

  // CTA banner — show when cycle gate is pending and this Regent hasn't confirmed
  if (_activeCycle && !cycleConfirmed && !myConfirmation) {
    h += `<div class="reg-cta-banner">`;
    h += `<strong>Action required:</strong> The feeding rights gate for <em>${esc(_activeCycle.label || 'this cycle')}</em> is waiting on your confirmation. Use the "Confirm Feeding Rights" button below to lock in your territory's rights for this cycle.`;
    h += `</div>`;
  }

  h += `<h3 class="regency-title">Regency: ${esc(terrName)}</h3>`;
  h += `<p class="regency-meta">Ambience: ${esc(ambience)} — Feeding rights cap: ${cap}</p>`;
  h += `<p class="regency-desc">Grant feeding rights for your territory. Slots beyond the cap are highlighted as over-capacity.</p>`;

  h += '<div class="dt-residency-grid">';

  // Slot 1 — Regent (locked, implicit)
  h += '<div class="dt-residency-row">';
  h += '<span class="dt-residency-label">Regent</span>';
  h += `<span class="dt-residency-locked">${esc(regentName)}</span>`;
  h += '</div>';

  // Slot 2 — Lieutenant (locked, implicit; hidden if none)
  if (ltId) {
    h += '<div class="dt-residency-row">';
    h += '<span class="dt-residency-label">Lieutenant</span>';
    h += `<span class="dt-residency-locked">${esc(ltName)}</span>`;
    h += '</div>';
  }

  // Additional feeding right slots — start at loopStart (3 with lt, 2 without)
  for (let i = loopStart; i <= loopEnd; i++) {
    const overCap = i > cap;
    const rowClass = overCap ? 'dt-residency-row dt-over-cap' : 'dt-residency-row';
    const savedVal = additionalRights[i - loopStart] || '';
    const isConfirmedSlot = confirmedRights.includes(savedVal) && savedVal;

    h += `<div class="${rowClass}">`;
    h += `<span class="dt-residency-label">Feeding Right ${i}</span>`;
    if (isConfirmedSlot) {
      const confirmedChar = allCharNames.find(c => String(c._id) === savedVal);
      const confirmedName = confirmedChar ? displayName(confirmedChar) : savedVal;
      h += `<select id="reg-slot-${i}" class="qf-select dt-residency-select" data-residency-slot="${i}" disabled>`;
      h += `<option value="${esc(savedVal)}" selected>${esc(confirmedName)}</option>`;
      h += '</select>';
      h += '<span class="reg-confirmed-chip">Confirmed</span>';
    } else {
      h += `<select id="reg-slot-${i}" class="qf-select dt-residency-select" data-residency-slot="${i}">`;
      h += '<option value="">— None —</option>';
      for (const c of allCharNames) {
        const sel = savedVal === String(c._id) ? ' selected' : '';
        h += `<option value="${esc(String(c._id))}"${sel}>${esc(displayName(c))}</option>`;
      }
      h += '</select>';
    }
    if (overCap) h += '<span class="dt-over-cap-warn">Over capacity</span>';
    h += '</div>';
  }

  h += '</div>';

  // Action buttons
  h += '<div class="regency-actions">';
  h += '<button id="reg-save" class="qf-btn qf-btn-submit">Save Feeding Rights</button>';
  if (_activeCycle && !cycleConfirmed) {
    h += '<button id="reg-confirm" class="qf-btn qf-btn-secondary">Confirm Feeding Rights</button>';
  } else if (_activeCycle && cycleConfirmed && myConfirmation) {
    h += '<span class="reg-confirmed-badge">Feeding rights confirmed for this cycle</span>';
  }
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
  container.querySelector('#reg-confirm')?.addEventListener('click', () => confirmFeeding(container));
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

  const ltId = ri?.lieutenantId || '';
  const loopStart = ltId ? 3 : 2;

  // Collect only the additional feeding right slots (regent + lieutenant are implicit)
  const feedingRights = [];
  for (let i = loopStart; i <= MAX_FEEDING_POSITION; i++) {
    const el = document.getElementById(`reg-slot-${i}`);
    if (!el) break; // stop when we reach slots that weren't rendered
    if (el.value) feedingRights.push(el.value);
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

async function confirmFeeding(container) {
  const statusEl = document.getElementById('reg-save-status');
  const ri = _regInfo();
  if (!ri?.territoryId) {
    if (statusEl) statusEl.textContent = 'Error: territory not found';
    return;
  }
  if (!_activeCycle?._id) {
    if (statusEl) statusEl.textContent = 'Error: no active cycle';
    return;
  }

  const ltId = ri?.lieutenantId || '';
  const loopStart = ltId ? 3 : 2;

  // Collect current additional feeding right slots only
  const rights = [];
  for (let i = loopStart; i <= MAX_FEEDING_POSITION; i++) {
    const el = document.getElementById(`reg-slot-${i}`);
    if (!el) break;
    if (el.value) rights.push(el.value);
  }

  const btn = container.querySelector('#reg-confirm');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming...'; }
  if (statusEl) statusEl.textContent = '';

  try {
    const updated = await apiPost(`/api/downtime_cycles/${_activeCycle._id}/confirm-feeding`, {
      territory_id: ri.territoryId,
      rights,
    });
    _activeCycle = updated;
    render(container);
  } catch (err) {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirm Feeding Rights'; }
    if (statusEl) statusEl.textContent = 'Confirm failed: ' + err.message;
  }
}

/** Get the current feeding rights list (for downtime submission). */
export function getResidencyList() {
  const ri = _regInfo();
  const ltId = ri?.lieutenantId || '';
  const loopStart = ltId ? 3 : 2;
  const list = [];
  for (let i = loopStart; i <= MAX_FEEDING_POSITION; i++) {
    const el = document.getElementById(`reg-slot-${i}`);
    if (!el) break;
    list.push(el.value || '');
  }
  return list;
}
