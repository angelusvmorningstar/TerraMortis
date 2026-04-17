/* Game app — live tracker.
   Per-character Vitae, Willpower, Health, and Conditions.
   State persists in localStorage for the duration of the session. */

import suiteState from '../suite/data.js';
import { calcVitaeMax, calcWillpowerMax, calcHealth, influenceTotal } from '../data/accessors.js';
import { displayName, esc } from '../data/helpers.js';

const KEY = 'tm_tracker_state';

// UI-only — which cards are currently expanded (collapsed by default)
const _expanded = new Set();

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
}
function save(state) { localStorage.setItem(KEY, JSON.stringify(state)); }

function defaults(c) {
  return {
    vitae:      calcVitaeMax(c),
    willpower:  calcWillpowerMax(c),
    bashing:    0,
    lethal:     0,
    aggravated: 0,
    conditions: [],
    inf:        influenceTotal(c),
  };
}

function ensure(state, c) {
  const id = String(c._id);
  if (!state[id]) state[id] = defaults(c);
  return state[id];
}

// ── Public API ──

let _el = null;

export function trackerRead(charId) {
  const st = load();
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return null;
  return ensure(st, c); // seeds defaults if entry is missing
}

export function trackerReadRaw(charId) {
  return load()[charId] || null;
}

export function trackerWriteField(charId, field, value) {
  const st = load();
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const cs = ensure(st, c);
  cs[field] = value;
  save(st);
}


export function trackerToggle(charId) {
  if (_expanded.has(charId)) _expanded.delete(charId);
  else _expanded.add(charId);
  // Patch just the card to avoid re-rendering the whole list
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const state = load();
  patchCard(charId, c, ensure(state, c));
}

export function initTracker(el) {
  _el = el;
  renderAll();
}

export function trackerReset() {
  if (!confirm('Reset all characters to full Vitae and Willpower, clear all damage and conditions?')) return;
  const state = {};
  for (const c of (suiteState.chars || [])) state[String(c._id)] = defaults(c);
  save(state);
  renderAll();
}

export function trackerAdj(charId, field, delta) {
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const state = load();
  const cs = ensure(state, c);

  if (field === 'vitae') {
    cs.vitae = clamp(cs.vitae + delta, 0, calcVitaeMax(c));
  } else if (field === 'willpower') {
    cs.willpower = clamp(cs.willpower + delta, 0, calcWillpowerMax(c));
  } else if (field === 'inf') {
    const maxInf = influenceTotal(c);
    cs.inf = clamp((cs.inf ?? maxInf) + delta, 0, maxInf);
  } else {
    const maxHp = calcHealth(c);
    const used  = cs.bashing + cs.lethal + cs.aggravated;
    if (delta > 0 && used >= maxHp) return;
    cs[field] = Math.max(0, cs[field] + delta);
  }

  save(state);
  patchCard(charId, c, cs);
}

export function trackerAddCondition(charId) {
  const input = document.getElementById('cond-in-' + charId);
  const val   = input?.value.trim();
  if (!val) return;
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const state = load();
  const cs    = ensure(state, c);
  cs.conditions = [...(cs.conditions || []), val];
  save(state);
  input.value = '';
  patchCard(charId, c, cs);
}

export function trackerRemoveCond(charId, idx) {
  const c = (suiteState.chars || []).find(x => String(x._id) === charId);
  if (!c) return;
  const state = load();
  const cs    = ensure(state, c);
  cs.conditions = (cs.conditions || []).filter((_, i) => i !== idx);
  save(state);
  patchCard(charId, c, cs);
}

// ── Rendering ──

function renderAll() {
  if (!_el) return;
  const chars = suiteState.chars || [];
  const state = load();

  let h = '<div class="trk-wrap">';
  h += '<div class="trk-toolbar"><button class="trk-reset-btn" onclick="trackerReset()">Reset All</button><span class="trk-toolbar-hint">Resets tracks &amp; clears conditions</span></div>';

  if (!chars.length) {
    h += '<div class="dtl-empty">No characters loaded.</div>';
  } else {
    h += '<div class="trk-list">';
    for (const c of chars) h += cardHtml(String(c._id), c, ensure(state, c));
    h += '</div>';
  }
  h += '</div>';
  _el.innerHTML = h;
  save(state); // persist any newly initialised defaults
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

  // Header — always visible, tappable to toggle
  const dmgStr  = dmg > 0 ? `<span class="trk-hd-dmg">${dmg}dmg</span>` : '';
  const condStr = (cs.conditions || []).length > 0 ? `<span class="trk-hd-cond">${cs.conditions.length} cond</span>` : '';
  h += `<button class="trk-card-hd" onclick="trackerToggle('${id}')">`;
  h += `<span class="trk-name">${esc(displayName(c))}</span>`;
  h += `<span class="trk-hd-meta">`;
  h += `<span class="trk-hd-v">V ${cs.vitae}/${vpMax}</span>`;
  h += `<span class="trk-hd-w">WP ${cs.willpower}/${wpMax}</span>`;
  h += dmgStr + condStr;
  h += `</span>`;
  h += `<span class="trk-chev">${chevron}</span>`;
  h += '</button>';

  if (!open) { h += '</div>'; return h; }

  // Vitae
  h += counter('Vitae',      id, 'vitae',     cs.vitae,     vpMax, 'trk-row-v');
  // Willpower
  h += counter('Willpower',  id, 'willpower',  cs.willpower, wpMax, 'trk-row-w');
  // Influence
  const infMax = influenceTotal(c);
  if (infMax > 0) h += counter('Influence', id, 'inf', cs.inf ?? infMax, infMax, 'trk-row-inf');

  // Health
  h += `<div class="trk-row trk-row-hp">`;
  h += `<span class="trk-lbl">Health <span class="trk-hp-total">${dmg}/${hpMax}</span></span>`;
  h += `<div class="trk-dmg-cols">`;
  h += dmgCol('Bashing', id, 'bashing',    cs.bashing,    'trk-bash');
  h += dmgCol('Lethal',  id, 'lethal',     cs.lethal,     'trk-let');
  h += dmgCol('Agg',     id, 'aggravated', cs.aggravated, 'trk-agg');
  h += `</div></div>`;

  // Conditions
  const conds = cs.conditions || [];
  h += '<div class="trk-conds">';
  if (conds.length) {
    h += '<div class="trk-cond-chips">';
    conds.forEach((cond, i) => {
      h += `<span class="trk-chip">${esc(cond)}<button class="trk-chip-rm" onclick="trackerRemoveCond('${id}',${i})">\xD7</button></span>`;
    });
    h += '</div>';
  }
  h += `<div class="trk-cond-row"><input id="cond-in-${id}" class="trk-cond-in" type="text" placeholder="Add condition\u2026" onkeydown="if(event.key==='Enter')trackerAddCondition('${id}')"><button class="trk-cond-add" onclick="trackerAddCondition('${id}')">Add</button></div>`;
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
