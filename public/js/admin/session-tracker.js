/**
 * Session tracker for admin Engine domain.
 * Per-character vitae/WP/influence tracking with downtime expenditure.
 * Uses same localStorage keys as the suite tracker for cross-app compatibility.
 */

import { esc, displayName, redactPlayer } from '../data/helpers.js';
import { calcVitaeMax, calcWillpowerMax, influenceTotal } from '../data/accessors.js';
import { applyDerivedMerits } from '../editor/mci.js';

// ── State ──

let chars = [];
let activeNames = [];  // names of characters currently shown in tracker

// ── Tracker persistence (localStorage, shared with suite tracker + feeding engine) ──

function maxVitae(c) { return calcVitaeMax(c); }
function maxWP(c) { return calcWillpowerMax(c); }
function maxInf(c) { return influenceTotal(c); }

function getTracker(c) {
  try {
    const s = JSON.parse(localStorage.getItem('tm_tracker_' + c.name) || 'null');
    if (s) return s;
  } catch { /* ignore */ }
  return { vitae: 0, wp: maxWP(c), inf: maxInf(c) };
}

function setTracker(c, data) {
  localStorage.setItem('tm_tracker_' + c.name, JSON.stringify(data));
}

function getDt(c) {
  try { return JSON.parse(localStorage.getItem('tm_dt_' + c.name) || '{}'); } catch { return {}; }
}

function setDt(c, val) {
  localStorage.setItem('tm_dt_' + c.name, JSON.stringify(val));
}

// ── Init ──

export function initSessionTracker(allChars) {
  chars = allChars.filter(c => !c.retired);
  chars.forEach(c => applyDerivedMerits(c));
  render();
}

// ── Actions ──

function resetAll() {
  const targets = activeNames.length
    ? activeNames.map(n => chars.find(c => c.name === n)).filter(Boolean)
    : chars;
  targets.forEach(c => {
    setTracker(c, { vitae: 0, wp: maxWP(c), inf: maxInf(c) });
  });
  render();
}

function applyDowntime() {
  const targets = activeNames.length
    ? activeNames.map(n => chars.find(c => c.name === n)).filter(Boolean)
    : chars;
  let changed = 0;
  targets.forEach(c => {
    const dt = getDt(c);
    if (!dt.wp && !dt.vitae && !dt.inf) return;
    const cur = getTracker(c);
    const mV = maxVitae(c), mW = maxWP(c), mI = maxInf(c);
    if (dt.wp)    cur.wp    = Math.max(0, Math.min(mW, cur.wp    - (parseInt(dt.wp) || 0)));
    if (dt.vitae) cur.vitae = Math.max(0, Math.min(mV, cur.vitae - (parseInt(dt.vitae) || 0)));
    if (dt.inf)   cur.inf   = Math.max(0, Math.min(mI, cur.inf   - (parseInt(dt.inf) || 0)));
    setTracker(c, cur);
    setDt(c, {});
    changed++;
  });
  render();
}

function pickChar(name) {
  if (!name) { activeNames = []; }
  else if (!activeNames.includes(name)) { activeNames.push(name); }
  render();
}

function dismissChar(name) {
  activeNames = activeNames.filter(n => n !== name);
  render();
}

function logDt(name, field, val) {
  const c = chars.find(x => x.name === name);
  if (!c) return;
  const dt = getDt(c);
  dt[field] = val === '' ? 0 : parseInt(val) || 0;
  setDt(c, dt);
}

function adjTracker(name, field, delta) {
  const c = chars.find(x => x.name === name);
  if (!c) return;
  const t = getTracker(c);
  const maxMap = { vitae: maxVitae(c), wp: maxWP(c), inf: maxInf(c) };
  t[field] = Math.max(0, Math.min(maxMap[field], t[field] + delta));
  setTracker(c, t);
  render();
}

// ── Render ──

function render() {
  const el = document.getElementById('session-tracker');
  if (!el) return;

  let h = '<div class="slabel">Session Tracker</div>';

  // Character selector
  h += '<div class="st-admin-pick">';
  h += '<select class="de-sc-btn" id="sta-char" style="flex:1;">';
  h += '<option value="">\u2014 Add character \u2014</option>';
  for (const c of chars) {
    if (activeNames.includes(c.name)) continue;
    h += `<option value="${esc(c.name)}">${esc(displayName(c))}</option>`;
  }
  h += '</select>';
  h += '</div>';

  // Controls
  h += '<div class="st-admin-controls">';
  h += '<button class="de-btn gold" id="sta-reset">Reset All Trackers</button>';
  h += '<button class="de-btn crim" id="sta-apply-dt">Apply Downtime</button>';
  h += '</div>';

  // Character rows
  if (!activeNames.length) {
    h += '<div class="st-admin-empty">Select characters above to track.</div>';
  }

  for (const name of activeNames) {
    const c = chars.find(x => x.name === name);
    if (!c) continue;
    const t = getTracker(c);
    const dt = getDt(c);
    const mV = maxVitae(c), mW = maxWP(c), mI = maxInf(c);
    const slug = c.name.replace(/[^a-z0-9]/gi, '');
    const en = esc(name);

    h += `<div class="st-admin-row">`;
    h += `<div class="st-admin-row-hdr">`;
    h += `<div><div class="st-admin-name">${esc(displayName(c))}</div>`;
    h += `<div class="st-admin-meta">${esc(c.clan || '')}${c.bloodline ? ' \u00B7 ' + esc(c.bloodline) : ''} \u00B7 ${esc(c.covenant || '')}</div></div>`;
    h += `<div class="st-admin-meta">${esc(redactPlayer(c.player || ''))}</div>`;
    h += `<button class="st-admin-dismiss" data-dismiss="${en}">\u2715</button>`;
    h += `</div>`;

    // Trackers with +/- buttons
    h += `<div class="st-admin-trackers">`;
    for (const [field, label, val, max] of [['vitae', 'Vitae', t.vitae, mV], ['wp', 'Willpower', t.wp, mW], ['inf', 'Influence', t.inf, mI]]) {
      h += `<div class="st-admin-cell">`;
      h += `<div class="st-admin-cell-lbl">${label}</div>`;
      h += `<div class="st-admin-cell-row">`;
      h += `<button class="st-admin-adj" data-adj="${en}|${field}|-1">\u2212</button>`;
      h += `<span class="st-admin-cell-val">${val}</span>`;
      h += `<span class="st-admin-cell-max">/ ${max}</span>`;
      h += `<button class="st-admin-adj" data-adj="${en}|${field}|1">+</button>`;
      h += `</div></div>`;
    }
    h += `</div>`;

    // Downtime expenditure
    h += `<div class="st-admin-dt">`;
    h += `<div class="st-admin-dt-lbl">Downtime expenditure</div>`;
    h += `<div class="st-admin-dt-inputs">`;
    for (const [field, label] of [['vitae', 'Vitae'], ['wp', 'WP'], ['inf', 'Influence']]) {
      h += `<div class="st-admin-dt-field">`;
      h += `<label>${label}</label>`;
      h += `<input type="number" min="0" placeholder="0" value="${dt[field] || ''}" data-dt="${en}|${field}">`;
      h += `</div>`;
    }
    h += `</div></div>`;
    h += `</div>`;
  }

  el.innerHTML = h;
  wireEvents();
}

function wireEvents() {
  const $ = id => document.getElementById(id);

  $('sta-char')?.addEventListener('change', e => {
    if (e.target.value) pickChar(e.target.value);
  });

  $('sta-reset')?.addEventListener('click', resetAll);
  $('sta-apply-dt')?.addEventListener('click', applyDowntime);

  document.querySelectorAll('#session-tracker [data-dismiss]').forEach(btn => {
    btn.addEventListener('click', () => dismissChar(btn.dataset.dismiss));
  });

  document.querySelectorAll('#session-tracker [data-adj]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [name, field, delta] = btn.dataset.adj.split('|');
      adjTracker(name, field, parseInt(delta));
    });
  });

  document.querySelectorAll('#session-tracker [data-dt]').forEach(input => {
    input.addEventListener('input', () => {
      const [name, field] = input.dataset.dt.split('|');
      logDt(name, field, input.value);
    });
  });
}
