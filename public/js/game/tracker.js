/* Game app — live tracker.
   Vitae, Willpower, Health, and Influence persist to MongoDB via /api/tracker_state.
   Conditions stay localStorage-only (per-device session state). */

import suiteState from '../suite/data.js';
import { calcVitaeMax, calcWillpowerMax, calcHealth } from '../data/accessors.js';
import { calcTotalInfluence } from '../editor/domain.js';
import { esc } from '../data/helpers.js';
import { CONDITIONS_DB } from '../data/conditions.js';
import { getRole } from '../auth/discord.js';

const API_BASE = location.hostname === 'localhost' ? 'http://localhost:3000' : '';
function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('tm_auth_token');
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

const LOCAL_PREFIX = 'tm_tracker_local_';

// In-memory cache — populated by initTracker() / ensureLoaded()
const _cache = {};

// charIds confirmed loaded from API (or migrated) — guards against overwriting real data with defaults
const _confirmed = new Set();

// UI-only — which cards are currently expanded
const _expanded = new Set();

// ── Storage helpers ──

function defaults(c) {
  return {
    vitae:      calcVitaeMax(c),
    willpower:  calcWillpowerMax(c),
    bashing:    0,
    lethal:     0,
    aggravated: 0,
    conditions: [],
    inf:        calcTotalInfluence(c),
  };
}

function persistedFields(cs) {
  return {
    vitae:      cs.vitae,
    willpower:  cs.willpower,
    bashing:    cs.bashing,
    lethal:     cs.lethal,
    aggravated: cs.aggravated,
    influence:  cs.inf,
    conditions: cs.conditions || [],
  };
}

function loadLocal(charId) {
  try { return JSON.parse(localStorage.getItem(LOCAL_PREFIX + charId) || '{}'); } catch { return {}; }
}

function saveLocal(charId, fields) {
  localStorage.setItem(LOCAL_PREFIX + charId, JSON.stringify({ ...loadLocal(charId), ...fields }));
}

async function loadFromApi(charId) {
  try {
    const res = await fetch(`${API_BASE}/api/tracker_state/${charId}`, { headers: authHeaders() });
    if (res.ok) return await res.json();
  } catch { /* network failure — fall through to null */ }
  return null;
}

function saveToApi(charId, fields) {
  // Optimistic: update cache immediately, write in background
  _cache[charId] = { ...(_cache[charId] || {}), ...fields };
  fetch(`${API_BASE}/api/tracker_state/${charId}`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(fields),
  }).catch(() => { /* silent fail — cache remains valid */ });
}

export async function ensureLoaded(c) {
  const id = String(c._id);
  if (_confirmed.has(id)) return _cache[id];

  const remote = await loadFromApi(id);
  const local = loadLocal(id);

  if (remote) {
    _cache[id] = {
      vitae:      remote.vitae      ?? defaults(c).vitae,
      willpower:  remote.willpower  ?? defaults(c).willpower,
      bashing:    remote.bashing    ?? 0,
      lethal:     remote.lethal     ?? 0,
      aggravated: remote.aggravated ?? 0,
      inf:        remote.influence  ?? calcTotalInfluence(c),
      conditions: remote.conditions ?? local.conditions ?? [],
    };
    _confirmed.add(id);
    return _cache[id];
  }

  // No API entry — attempt migration from old localStorage key
  try {
    const oldStore = JSON.parse(localStorage.getItem('tm_tracker_state') || '{}');
    const old = oldStore[id];
    if (old) {
      const migrated = {
        vitae:      old.vitae      ?? defaults(c).vitae,
        willpower:  old.willpower  ?? defaults(c).willpower,
        bashing:    old.bashing    ?? 0,
        lethal:     old.lethal     ?? 0,
        aggravated: old.aggravated ?? 0,
      };
      saveToApi(id, migrated);
      _cache[id] = { ...migrated, inf: old.inf ?? calcTotalInfluence(c), conditions: local.conditions ?? old.conditions ?? [] };
      _confirmed.add(id);
      return _cache[id];
    }
  } catch { /* ignore */ }

  // Seed fresh defaults and persist
  const d = defaults(c);
  _cache[id] = d;
  saveToApi(id, persistedFields(d));
  _confirmed.add(id);
  return _cache[id];
}

function fromCache(c) {
  const id = String(c._id);
  if (_cache[id]) return _cache[id];
  // Cache miss before init completes — seed defaults without API write
  _cache[id] = defaults(c);
  return _cache[id];
}

// ── Public API ──

let _el = null;

export function trackerRead(charId) {
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return null;
  return fromCache(c);
}

export function trackerReadRaw(charId) {
  return _cache[charId] || null;
}

export function trackerWriteField(charId, field, value) {
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const cs = fromCache(c);
  cs[field] = value;
  if (['vitae', 'willpower', 'bashing', 'lethal', 'aggravated'].includes(field)) {
    // Only write to API if confirmed loaded — prevents migration code from
    // overwriting real MongoDB data with stale localStorage on every page load
    if (_confirmed.has(charId)) saveToApi(charId, { [field]: value });
  } else {
    saveLocal(charId, { [field]: value });
  }
}

export function trackerToggle(charId) {
  if (_expanded.has(charId)) _expanded.delete(charId);
  else _expanded.add(charId);
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  patchCard(charId, c, fromCache(c));
}

export async function initTracker(el) {
  _el = el;
  el.innerHTML = '<div class="dtl-empty">Loading tracker\u2026</div>';
  // Clear confirmed set so API is re-fetched every time the tab opens —
  // picks up vitae changes written by player.html feeding confirm
  _confirmed.clear();
  await Promise.all((suiteState.chars || []).filter(c => !c.retired).map(c => ensureLoaded(c)));
  renderAll();
}

export async function trackerReset() {
  if (!confirm('Reset all characters to zero Vitae and full Willpower? Damage and conditions are preserved.')) return;
  for (const c of (suiteState.chars || [])) {
    const id = String(c._id);
    if (!_confirmed.has(id)) await ensureLoaded(c);
    const cs = _cache[id] || {};
    cs.vitae = 0;
    cs.willpower = calcWillpowerMax(c);
    _confirmed.add(id);
    saveToApi(id, persistedFields(cs));
  }
  renderAll();
}

export async function trackerAdj(charId, field, delta) {
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  // Load from API if not yet confirmed — prevents overwriting real data with seeded defaults
  if (!_confirmed.has(charId)) await ensureLoaded(c);
  const cs = _cache[charId];

  if (field === 'vitae') {
    cs.vitae = clamp(cs.vitae + delta, 0, calcVitaeMax(c));
    // Clear feed-confirmed vitae so manual ST adjustment takes precedence
    try {
      const loc = JSON.parse(localStorage.getItem(LOCAL_PREFIX + charId) || '{}');
      if (loc.vitae_confirmed != null) {
        delete loc.vitae_confirmed;
        localStorage.setItem(LOCAL_PREFIX + charId, JSON.stringify(loc));
      }
    } catch { /* ignore */ }
  } else if (field === 'willpower') {
    cs.willpower = clamp(cs.willpower + delta, 0, calcWillpowerMax(c));
  } else if (field === 'inf') {
    const maxInf = calcTotalInfluence(c);
    cs.inf = clamp((cs.inf ?? maxInf) + delta, 0, maxInf);
    saveToApi(charId, { influence: cs.inf });
    patchCard(charId, c, cs);
    return;
  } else {
    const maxHp = calcHealth(c);
    const used  = cs.bashing + cs.lethal + cs.aggravated;
    if (delta > 0 && used >= maxHp) return;
    cs[field] = Math.max(0, cs[field] + delta);
  }

  saveToApi(charId, persistedFields(cs));
  patchCard(charId, c, cs);
}

export function trackerAddCondition(charId) {
  const selEl   = document.getElementById('cond-sel-' + charId);
  const input   = document.getElementById('cond-in-'  + charId);
  const selVal  = selEl?.value || '';
  const freeVal = input?.value.trim() || '';
  const condName = selVal || freeVal;
  if (!condName) return;
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const cs = fromCache(c);
  const dbEntry = CONDITIONS_DB.find(cd => cd.name === condName);
  const entry = dbEntry
    ? { name: dbEntry.name, effect: dbEntry.effect, resolution: dbEntry.resolution, applied_at: new Date().toISOString() }
    : { name: condName, applied_at: new Date().toISOString() };
  cs.conditions = [...(cs.conditions || []), entry];
  if (_confirmed.has(charId)) saveToApi(charId, { conditions: cs.conditions });
  if (selEl) selEl.value = '';
  if (input) input.value = '';
  patchCard(charId, c, cs);
}

export function trackerRemoveCond(charId, idx) {
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const cs = fromCache(c);
  cs.conditions = (cs.conditions || []).filter((_, i) => i !== idx);
  if (_confirmed.has(charId)) saveToApi(charId, { conditions: cs.conditions });
  patchCard(charId, c, cs);
}

// ── Rendering ──

function renderAll() {
  if (!_el) return;
  const chars = (suiteState.chars || []).filter(c => !c.retired);

  let h = '<div class="trk-wrap">';
  h += '<div class="trk-toolbar"><button class="trk-reset-btn" onclick="trackerReset()">Reset All</button><span class="trk-toolbar-hint">Zero Vitae, full WP &mdash; damage preserved</span></div>';

  if (!chars.length) {
    h += '<div class="dtl-empty">No characters loaded.</div>';
  } else {
    h += '<div class="trk-list">';
    for (const c of chars) h += cardHtml(String(c._id), c, fromCache(c));
    h += '</div>';
  }
  h += '</div>';
  _el.innerHTML = h;
}

function patchCard(charId, c, cs) {
  const old = document.getElementById('trk-card-' + charId);
  if (!old) { renderAll(); return; }
  const tmp = document.createElement('div');
  tmp.innerHTML = cardHtml(charId, c, cs);
  old.replaceWith(tmp.firstElementChild);
}

function cardHtml(id, c, cs) {
  const vpMax   = calcVitaeMax(c);
  const wpMax   = calcWillpowerMax(c);
  const hpMax   = calcHealth(c);
  const dmg     = cs.bashing + cs.lethal + cs.aggravated;
  const open    = _expanded.has(id);
  const chevron = open ? '\u25B2' : '\u25BC';

  let h = `<div class="trk-card${open ? ' trk-open' : ''}" id="trk-card-${id}">`;

  const dmgStr  = dmg > 0 ? `<span class="trk-hd-dmg">${dmg}dmg</span>` : '';
  const condStr = (cs.conditions || []).length > 0 ? `<span class="trk-hd-cond">${cs.conditions.length} cond</span>` : '';
  const infMax = calcTotalInfluence(c);
  h += `<button class="trk-card-hd" onclick="trackerToggle('${id}')">`;
  h += `<span class="trk-name">${esc(c.moniker || c.name)}</span>`;
  h += `<span class="trk-hd-meta">`;
  h += `<span class="trk-hd-v">V ${cs.vitae}/${vpMax}</span>`;
  h += `<span class="trk-hd-w">WP ${cs.willpower}/${wpMax}</span>`;
  if (infMax > 0) h += `<span class="trk-hd-inf">Inf ${cs.inf ?? infMax}/${infMax}</span>`;
  h += dmgStr + condStr;
  h += `</span>`;
  h += `<span class="trk-chev">${chevron}</span>`;
  h += '</button>';

  if (!open) { h += '</div>'; return h; }

  h += counter('Vitae',     id, 'vitae',    cs.vitae,    vpMax, 'trk-row-v');
  h += counter('Willpower', id, 'willpower', cs.willpower, wpMax, 'trk-row-w');
  if (infMax > 0) h += counter('Influence', id, 'inf', cs.inf ?? infMax, infMax, 'trk-row-inf');

  h += `<div class="trk-row trk-row-hp">`;
  h += `<span class="trk-lbl">Health <span class="trk-hp-total">${dmg}/${hpMax}</span></span>`;
  h += `<div class="trk-dmg-cols">`;
  h += dmgCol('Bashing', id, 'bashing',    cs.bashing,    'trk-bash');
  h += dmgCol('Lethal',  id, 'lethal',     cs.lethal,     'trk-let');
  h += dmgCol('Agg',     id, 'aggravated', cs.aggravated, 'trk-agg');
  h += `</div></div>`;

  const conds = cs.conditions || [];
  const isST = getRole() === 'st';
  h += '<div class="trk-conds">';
  if (conds.length) {
    h += '<div class="trk-cond-chips">';
    conds.forEach((cond, i) => {
      const condName = typeof cond === 'object' ? cond.name : cond;
      const condEffect = typeof cond === 'object' ? cond.effect : '';
      const condRes    = typeof cond === 'object' ? cond.resolution : '';
      h += `<div class="trk-cond-card">`;
      h += `<div class="trk-cond-card-hdr"><span class="trk-cond-name">${esc(condName)}</span>${isST ? `<button class="trk-chip-rm" onclick="trackerRemoveCond('${id}',${i})" title="Resolve">\xD7 Resolve</button>` : ''}</div>`;
      if (condEffect) h += `<div class="trk-cond-effect">${esc(condEffect)}</div>`;
      if (condRes)    h += `<div class="trk-cond-res"><span class="trk-cond-res-lbl">Resolution:</span> ${esc(condRes)}</div>`;
      h += '</div>';
    });
    h += '</div>';
  }
  if (isST) {
    const condOpts = CONDITIONS_DB.map(cd =>
      `<option value="${esc(cd.name)}">${esc(cd.name)}</option>`
    ).join('');
    h += `<div class="trk-cond-row">`;
    h += `<select id="cond-sel-${id}" class="trk-cond-sel"><option value="">— pick condition —</option>${condOpts}</select>`;
    h += `<input id="cond-in-${id}" class="trk-cond-in" type="text" placeholder="or type custom\u2026">`;
    h += `<button class="trk-cond-add" onclick="trackerAddCondition('${id}')">Add</button>`;
    h += `</div>`;
  }
  h += '</div>';

  h += '</div>';
  return h;
}

function counter(label, id, field, cur, max, cls) {
  return `<div class="trk-row ${cls}">
    <span class="trk-lbl">${esc(label)}</span>
    <div class="trk-ctr">
      <button class="trk-adj" onclick="trackerAdj('${id}','${field}',-1)">\u2212</button>
      <span class="trk-cur">${cur}</span><span class="trk-sep">/</span><span class="trk-max">${max}</span>
      <button class="trk-adj" onclick="trackerAdj('${id}','${field}',1)">+</button>
    </div>
  </div>`;
}

function dmgCol(label, id, field, cur, cls) {
  return `<div class="trk-dmg-col ${cls}">
    <button class="trk-adj sm" onclick="trackerAdj('${id}','${field}',-1)">\u2212</button>
    <span class="trk-dmg-n">${cur}</span>
    <button class="trk-adj sm" onclick="trackerAdj('${id}','${field}',1)">+</button>
    <span class="trk-dmg-lbl">${esc(label)}</span>
  </div>`;
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
