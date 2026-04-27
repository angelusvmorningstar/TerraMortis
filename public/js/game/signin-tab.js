/**
 * signin-tab.js — Live game check-in tab (ST + coordinator).
 *
 * Repurposed by fin.3 as the coordinator check-in tool.
 * Shows attendance entries for the most recent game session.
 * Each row: player name, character name, attended tick, payment method,
 * amount, and starting Vitae / WP / Influence derived from character data.
 * Payment is written to the structured attendance[n].payment object
 * (fin.2 schema). Changes auto-save to /api/game_sessions/:id.
 */

import { apiGet, apiPut } from '../data/api.js';
import { calcVitaeMax, calcWillpowerMax } from '../data/accessors.js';
import { calcTotalInfluence } from '../editor/domain.js';
import { displayName, sortName, esc } from '../data/helpers.js';
import { readPayment } from './payment-helpers.js';

// fin.2 schema enum. Display labels paired with stored values.
const PAYMENT_METHODS = [
  { value: '',       label: '— Not recorded' },
  { value: 'cash',   label: 'Cash' },
  { value: 'payid',  label: 'PayID' },
  { value: 'paypal', label: 'PayPal' },
  { value: 'exiles', label: 'Exiles (offset)' },
  { value: 'waived', label: 'Waived' },
];
const DEFAULT_AMOUNT = 15;
const ZERO_AMOUNT_METHODS = new Set(['exiles', 'waived', '']);

function calcEminence(session, chars) {
  const attendedIds = new Set(
    (session?.attendance || []).filter(a => a.attended).map(a => String(a.character_id))
  );
  const em = {}, asc = {};
  for (const c of chars) {
    if (!attendedIds.has(String(c._id))) continue;
    const cs = c.status?.city || 0;
    if (c.clan)     em[c.clan]      = (em[c.clan]      || 0) + cs;
    if (c.covenant) asc[c.covenant] = (asc[c.covenant] || 0) + cs;
  }
  const top2 = (obj) => Object.entries(obj)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 2)
    .map(([name, total]) => ({ name, total }));
  return { eminence: top2(em), ascendancy: top2(asc) };
}

let _session = null;
let _chars = [];
let _saveTimer = null;
let _el = null;
let _playerByCharId = new Map();

// Placeholder strings seeded by an early redacted import. Treat as missing.
const PLACEHOLDER_RE = /^Player [A-Z]{1,2}$/;

export async function initSignIn(el, chars) {
  _el = el;
  _chars = chars || [];
  el.innerHTML = '<div class="si-loading">Loading session\u2026</div>';

  try {
    const sessions = await apiGet('/api/game_sessions');
    _session = sessions.sort((a, b) => b.session_date.localeCompare(a.session_date))[0] || null;
  } catch {
    el.innerHTML = '<div class="si-empty">Could not load sessions. Check your connection.</div>';
    return;
  }

  if (!_session) {
    el.innerHTML = '<div class="si-empty">No game sessions found. Create one in ST Admin \u2192 Attendance.</div>';
    return;
  }

  // Build character_id \u2192 display_name lookup once. Coordinator-accessible
  // narrow endpoint; if it fails (network or auth), fall back to whatever
  // string is on the row so the tab still renders.
  _playerByCharId = new Map();
  try {
    const pairs = await apiGet('/api/players/display-names');
    for (const p of (pairs || [])) {
      if (p?.character_id && p?.display_name) {
        _playerByCharId.set(String(p.character_id), p.display_name);
      }
    }
  } catch {
    // leave map empty; resolvePlayerName falls back to raw a.player or '\u2014'
  }

  render();
}

function resolvePlayerName(att) {
  const raw = (att.player || '').trim();
  if (raw && !PLACEHOLDER_RE.test(raw)) return raw;
  const fromMap = _playerByCharId.get(String(att.character_id));
  return fromMap || raw || '\u2014';
}

function scheduleAutosave() {
  const statusEl = _el?.querySelector('.si-status');
  if (statusEl) statusEl.textContent = 'Saving\u2026';
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(doAutosave, 800);
}

async function doAutosave() {
  if (!_session) return;
  const statusEl = _el?.querySelector('.si-status');
  try {
    const { _id, ...body } = _session;
    const updated = await apiPut('/api/game_sessions/' + _id, body);
    Object.assign(_session, updated);
    if (statusEl) statusEl.textContent = '';
  } catch {
    if (statusEl) statusEl.textContent = 'Save failed \u2014 retrying\u2026';
    _saveTimer = setTimeout(doAutosave, 3000);
  }
}

function charForEntry(a) {
  return _chars.find(c =>
    String(c._id) === String(a.character_id) ||
    c.name === (a.character_name || a.name)
  ) || null;
}

function render() {
  if (!_el || !_session) return;

  const att = (_session.attendance || []).slice().sort((a, b) => {
    const pa = resolvePlayerName(a).toLowerCase();
    const pb = resolvePlayerName(b).toLowerCase();
    return pa.localeCompare(pb);
  });

  const label = _session.session_date + (_session.title ? ' \u2014 ' + _session.title : '');
  const attended = att.filter(a => a.attended).length;

  const { eminence, ascendancy } = calcEminence(_session, _chars);
  const fmtTop = (arr) => arr.length
    ? arr.map(e => `${esc(e.name)} (${e.total})`).join(' · ')
    : '—';

  let h = `<div class="si-header">
    <span class="si-session-label">${esc(label)}</span>
    <span class="si-stat">${attended} / ${att.length} attended</span>
    <span class="si-status"></span>
  </div>
  <div class="si-eminence-block">
    <span class="si-em-label">Eminence:</span><span class="si-em-val">${fmtTop(eminence)}</span>
    <span class="si-em-label">Ascendancy:</span><span class="si-em-val">${fmtTop(ascendancy)}</span>
  </div>`;

  h += '<div class="si-list">';
  att.forEach((a, idx) => {
    const c = charForEntry(a);
    const charName = c ? displayName(c) : (a.character_display || a.character_name || a.name || '\u2014');

    let resourceRow = '';
    if (c) {
      const vMax  = calcVitaeMax(c);
      const wpMax = calcWillpowerMax(c);
      const infMax = calcTotalInfluence(c);
      resourceRow = `<div class="si-resources">
        <span class="si-res-item"><span class="si-res-lbl">V</span> ${vMax}/${vMax}</span>
        <span class="si-res-item"><span class="si-res-lbl">WP</span> ${wpMax}/${wpMax}</span>
        ${infMax > 0 ? `<span class="si-res-item"><span class="si-res-lbl">Inf</span> ${infMax}/${infMax}</span>` : ''}
      </div>`;
    }

    const { method: currentMethod, amount: legacyAmt } = readPayment(a);
    const currentAmount = a.payment?.amount ?? (legacyAmt || '');
    const payOpts = PAYMENT_METHODS.map(m =>
      `<option value="${esc(m.value)}"${currentMethod === m.value ? ' selected' : ''}>${esc(m.label)}</option>`
    ).join('');

    h += `<div class="si-row${a.attended ? ' si-attended' : ''}" data-idx="${idx}">
      <label class="si-attended-wrap">
        <input type="checkbox" class="si-att-chk" data-idx="${idx}"${a.attended ? ' checked' : ''}>
      </label>
      <div class="si-info">
        <div class="si-player">${esc(resolvePlayerName(a))}</div>
        <div class="si-char">${esc(charName)}</div>
        ${resourceRow}
      </div>
      <select class="si-pay-sel" data-idx="${idx}">
        ${payOpts}
      </select>
      <input type="number" class="si-pay-amt" data-idx="${idx}" min="0" step="1" value="${currentAmount}" placeholder="$">
    </div>`;
  });
  h += '</div>';

  // Footer: attended count + collected total from real-payment methods (reads via readPayment for legacy compat)
  const collected = att.reduce((s, a) => {
    const { method, amount } = readPayment(a);
    if (method === 'cash' || method === 'payid' || method === 'paypal') {
      return s + amount;
    }
    return s;
  }, 0);
  h += `<div class="si-footer"><strong>${attended}</strong> attended · <strong>$${collected}</strong> collected</div>`;

  _el.innerHTML = h;
  wireEvents();
}

function wireEvents() {
  _el.querySelectorAll('.si-att-chk').forEach(chk => {
    chk.addEventListener('change', () => {
      const idx = parseInt(chk.dataset.idx);
      if (_session.attendance[idx]) {
        _session.attendance[idx].attended = chk.checked;
        scheduleAutosave();
        render();
      }
    });
  });

  _el.querySelectorAll('.si-pay-sel').forEach(sel => {
    sel.addEventListener('change', () => {
      const idx = parseInt(sel.dataset.idx);
      const entry = _session.attendance[idx];
      if (!entry) return;
      const method = sel.value;
      // Build structured payment (fin.2 schema). Reset amount sensibly.
      const prevAmount = entry.payment?.amount;
      let amount;
      if (ZERO_AMOUNT_METHODS.has(method)) {
        amount = 0;
      } else if (prevAmount != null && prevAmount > 0) {
        amount = prevAmount;            // keep whatever coordinator had typed
      } else {
        amount = DEFAULT_AMOUNT;        // first time switching to a real method
      }
      entry.payment = { ...(entry.payment || {}), method, amount };
      // Legacy mirror for any old readers
      entry.payment_method = method;
      scheduleAutosave();
      render();
    });
  });

  _el.querySelectorAll('.si-pay-amt').forEach(inp => {
    inp.addEventListener('change', () => {
      const idx = parseInt(inp.dataset.idx);
      const entry = _session.attendance[idx];
      if (!entry) return;
      const amount = Number(inp.value) || 0;
      entry.payment = { ...(entry.payment || {}), amount };
      scheduleAutosave();
      render();
    });
  });
}
