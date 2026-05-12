/**
 * Regency tab — standalone territory management for regents.
 * Feeding rights are stored on the territory document (territories collection)
 * as `feeding_rights: string[]` — same source as the ST City tab.
 *
 * Regent (slot 1) and Lieutenant (slot 2) are implicit — they are displayed
 * as locked header rows and are NOT included in the feeding_rights dropdowns
 * or the feeding_rights array sent to the API.
 */

import { apiGet, apiPost, apiPatch } from '../data/api.js';
import { esc, displayName, dropdownName, findRegentTerritory } from '../data/helpers.js';
import { AMBIENCE_CAP } from './downtime-data.js';
import { charPicker, setCharPickerSources } from '../components/character-picker.js';

const MAX_FEEDING_POSITION = 12; // maximum position index to scan (regent=1, lt=2, additional 3-12)

// Mirrors server/utils/territory-slugs.js — maps submission feeding_territories
// slug variants to canonical territory.slug values.
const TERRITORY_SLUG_ALIASES = {
  the_academy: 'academy',
  the_harbour: 'harbour',
  the_city_harbour: 'harbour',
  the_dockyards: 'dockyards',
  the_docklands: 'dockyards',
  the_second_city: 'secondcity',
  the_north_shore: 'northshore',
  the_northern_shore: 'northshore',
};
function _matchesTerritory(feedingSlug, terrId) {
  if (!feedingSlug || !terrId) return false;
  if (feedingSlug === terrId) return true;
  return TERRITORY_SLUG_ALIASES[feedingSlug] === terrId;
}

let currentChar = null;
let _territories = [];
let allCharNames = [];
let _activeCycle = null;
let _lockedCharIds = new Set();  // character IDs that cannot be removed this cycle
// dt-form.16: per-slot selected character id, keyed by slot index. The
// charPicker components are uncontrolled DOM, so we mirror their state here
// for cross-slot exclusion + save collection.
const _slotValues = new Map();

function _regInfo() { return findRegentTerritory(_territories, currentChar); }

function _terrDoc() {
  const ri = _regInfo();
  return ri ? _territories.find(t => String(t._id) === String(ri.territoryId)) : null;
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

  // Compute locked character IDs from this cycle's submitted downtimes
  await _computeLocked();

  render(container);
}

// Populate _lockedCharIds with character IDs who have submitted a DT this
// cycle marked as 'resident' on this regent's territory. These characters
// cannot be removed from feeding_rights (enforced server-side; mirrored here
// for immediate UI disable state).
async function _computeLocked() {
  _lockedCharIds = new Set();
  if (!_activeCycle?._id) return;
  const ri = _regInfo();
  if (!ri?.territoryId) return;

  // Submissions still store legacy slug-variant keys in feeding_territories
  // (Q4: submissions are append-only audit trail of what the player typed).
  // Match those against the territory's slug, not its _id.
  const terrSlug = ri.slug;
  if (!terrSlug) return;

  try {
    const subs = await apiGet(`/api/downtime_submissions?cycle_id=${encodeURIComponent(_activeCycle._id)}`);
    for (const sub of (subs || [])) {
      if (sub.status !== 'submitted') continue;
      const raw = sub?.responses?.feeding_territories;
      if (!raw) continue;
      let grid;
      try { grid = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { continue; }
      if (!grid || typeof grid !== 'object') continue;
      for (const [slug, state] of Object.entries(grid)) {
        if (state !== 'resident') continue;
        if (_matchesTerritory(slug, terrSlug)) {
          _lockedCharIds.add(String(sub.character_id));
        }
      }
    }
  } catch {
    // Non-fatal; tab still renders without lock chips
  }
}

function getRegentCap() {
  const td = _terrDoc();
  return td ? (AMBIENCE_CAP[td.ambience] || 5) : 5;
}

function render(container) {
  const cap = getRegentCap();
  const ri = _regInfo();
  const terrName = ri?.territory || '';
  const td = _terrDoc();
  const ambience = td?.ambience || 'Unknown';
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

  // dt-form.16: publish source list to the universal char picker (ADR-003 §Q6).
  setCharPickerSources({
    all: allCharNames.map(c => ({ id: String(c._id), name: dropdownName(c) })),
  });

  // Seed _slotValues from saved state on every render so the live mirror
  // matches the DOM after re-render.
  _slotValues.clear();
  for (let i = loopStart; i <= loopEnd; i++) {
    const v = additionalRights[i - loopStart] || '';
    if (v) _slotValues.set(i, String(v));
  }

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
    const isLocked = savedVal && _lockedCharIds.has(String(savedVal));

    h += `<div class="${rowClass}" data-reg-slot-row="${i}">`;
    h += `<span class="dt-residency-label">Feeding Right ${i}</span>`;
    if (isConfirmedSlot) {
      const confirmedChar = allCharNames.find(c => String(c._id) === savedVal);
      const confirmedName = confirmedChar ? displayName(confirmedChar) : savedVal;
      // dt-form.16: locked display — no editor needed once a slot is confirmed.
      h += `<span class="dt-residency-locked dt-residency-locked--confirmed" data-reg-slot-locked="${i}" data-char-id="${esc(savedVal)}">${esc(confirmedName)}</span>`;
      h += '<span class="reg-confirmed-chip">Confirmed</span>';
    } else if (isLocked) {
      const lockedChar = allCharNames.find(c => String(c._id) === savedVal);
      const lockedName = lockedChar ? displayName(lockedChar) : savedVal;
      h += `<span class="dt-residency-locked dt-residency-locked--fed" data-reg-slot-locked="${i}" data-char-id="${esc(savedVal)}">${esc(lockedName)}</span>`;
      h += '<span class="reg-locked-chip" title="This character has fed here this cycle and cannot be removed until the cycle closes.">Fed this cycle</span>';
    } else {
      // Universal char picker (ADR-003 §Q6) — site #5 (regency feeding-rights slot).
      const initialJson = esc(JSON.stringify(savedVal ? String(savedVal) : ''));
      h += `<div data-cp-mount data-cp-site="reg-slot"`
         + ` data-cp-scope="all" data-cp-cardinality="single"`
         + ` data-reg-slot="${i}"`
         + ` data-cp-initial="${initialJson}"`
         + ` data-cp-placeholder="Pick a feeding right"></div>`;
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
  _mountRegSlotPickers(container);
  container.querySelector('#reg-save')?.addEventListener('click', saveRegency);
  container.querySelector('#reg-confirm')?.addEventListener('click', () => confirmFeeding(container));
}

function _mountRegSlotPickers(container) {
  const placeholders = container.querySelectorAll('[data-cp-mount][data-cp-site="reg-slot"]');
  placeholders.forEach(ph => _mountOneRegSlotPicker(ph, container));
}

function _mountOneRegSlotPicker(ph, container) {
  const slotIdx = parseInt(ph.dataset.regSlot, 10);
  if (!slotIdx) return;
  const placeholder = ph.dataset.cpPlaceholder || '';
  let initial = '';
  try { initial = JSON.parse(ph.dataset.cpInitial || '""'); } catch { initial = ''; }

  const onChange = (next) => {
    const val = typeof next === 'string' ? next : '';
    if (val) _slotValues.set(slotIdx, val);
    else _slotValues.delete(slotIdx);
    _remountOtherRegSlotPickers(container, slotIdx);
  };

  const el = charPicker({
    scope: 'all',
    cardinality: 'single',
    initial,
    onChange,
    placeholder,
    excludeIds: _excludeIdsForSlot(slotIdx),
  });
  el.dataset.regSlot = String(slotIdx);
  el.dataset.cpMountedSite = 'reg-slot';
  el.dataset.cpMountedPlaceholder = placeholder;
  ph.replaceWith(el);
}

function _excludeIdsForSlot(slotIdx) {
  const out = [String(currentChar._id)];
  for (const [k, v] of _slotValues.entries()) {
    if (k !== slotIdx && v) out.push(String(v));
  }
  return out;
}

function _remountOtherRegSlotPickers(container, changedSlotIdx) {
  const els = container.querySelectorAll('.char-picker[data-reg-slot]');
  els.forEach(el => {
    const sIdx = parseInt(el.dataset.regSlot, 10);
    if (!sIdx || sIdx === changedSlotIdx) return;
    const placeholderText = el.dataset.cpMountedPlaceholder || '';
    const cur = _slotValues.get(sIdx) || '';
    const fresh = charPicker({
      scope: 'all',
      cardinality: 'single',
      initial: cur,
      onChange: (next) => {
        const val = typeof next === 'string' ? next : '';
        if (val) _slotValues.set(sIdx, val);
        else _slotValues.delete(sIdx);
        _remountOtherRegSlotPickers(container, sIdx);
      },
      placeholder: placeholderText,
      excludeIds: _excludeIdsForSlot(sIdx),
    });
    fresh.dataset.regSlot = String(sIdx);
    fresh.dataset.cpMountedSite = 'reg-slot';
    fresh.dataset.cpMountedPlaceholder = placeholderText;
    el.replaceWith(fresh);
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

  // dt-form.16: read selected slot values from _slotValues (mirrored by charPicker
  // onChange). Locked/confirmed slots are not in _slotValues, so include their
  // ids by reading data-char-id from the DOM. Order matters — preserve slot index.
  const feedingRights = [];
  const container = document.querySelector('.regency-wrap')?.parentElement || document;
  for (let i = loopStart; i <= MAX_FEEDING_POSITION; i++) {
    if (_slotValues.has(i)) {
      const v = _slotValues.get(i);
      if (v) feedingRights.push(v);
      continue;
    }
    const lockedEl = container.querySelector(`[data-reg-slot-locked="${i}"]`);
    if (lockedEl) {
      const v = lockedEl.dataset.charId || '';
      if (v) feedingRights.push(v);
    }
  }

  // Belt-and-braces: include any locked-cycle ids that didn't render this pass.
  for (const lockedId of _lockedCharIds) {
    if (!feedingRights.includes(lockedId)) feedingRights.push(lockedId);
  }

  try {
    await apiPatch(`/api/territories/${encodeURIComponent(ri.territoryId)}/feeding-rights`, {
      feeding_rights: feedingRights,
    });

    // Update local territory doc so display reflects saved state
    const td = _territories.find(t => String(t._id) === String(ri.territoryId));
    if (td) td.feeding_rights = feedingRights;

    if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
  } catch (err) {
    // Backend returns { error, message, locked } for 409s. The generic error
    // string from api.js carries the message; surface a clearer hint for the
    // locked case.
    const msg = err.message || 'Save failed';
    if (/already fed this cycle/i.test(msg)) {
      if (statusEl) statusEl.textContent = 'Cannot remove a character who has already fed here this cycle.';
    } else {
      if (statusEl) statusEl.textContent = 'Save failed: ' + msg;
    }
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

  // dt-form.16: collect from _slotValues + locked/confirmed display nodes.
  const rights = [];
  const wrap = container.querySelector('.regency-wrap') || container;
  for (let i = loopStart; i <= MAX_FEEDING_POSITION; i++) {
    if (_slotValues.has(i)) {
      const v = _slotValues.get(i);
      if (v) rights.push(v);
      continue;
    }
    const lockedEl = wrap.querySelector(`[data-reg-slot-locked="${i}"]`);
    if (lockedEl) {
      const v = lockedEl.dataset.charId || '';
      if (v) rights.push(v);
    }
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
  // dt-form.16: read from _slotValues mirror; fall back to locked display
  // nodes for confirmed/fed-this-cycle slots that have no editor.
  const wrap = document.querySelector('.regency-wrap');
  for (let i = loopStart; i <= MAX_FEEDING_POSITION; i++) {
    if (_slotValues.has(i)) {
      list.push(_slotValues.get(i) || '');
      continue;
    }
    const lockedEl = wrap?.querySelector(`[data-reg-slot-locked="${i}"]`);
    if (lockedEl) {
      list.push(lockedEl.dataset.charId || '');
      continue;
    }
    // No editor and no locked element rendered — slot beyond what the page
    // built. Stop walking; matches prior `break` behaviour.
    break;
  }
  return list;
}
