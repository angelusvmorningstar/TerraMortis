/**
 * Attendance & Finance — per-session attendance, XP awards, and payment tracking.
 * Renders into #attendance-content in the admin app.
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { displayName } from '../data/helpers.js';

let chars = [];
let sessions = [];
let activeSession = null;
let dirty = false;

function esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = String(s);
  return d.innerHTML;
}

const PAYMENT_METHODS = ['', 'Cash', 'PayPal', 'PayID', 'Exiles', 'Waived'];

export async function initAttendance(charList) {
  chars = charList.filter(c => !c.retired);
  const el = document.getElementById('attendance-content');
  if (!el) return;

  try {
    sessions = await apiGet('/api/game_sessions');
  } catch (err) {
    sessions = [];
  }

  renderToolbar(el);
  if (sessions.length) {
    selectSession(sessions[0]);
  } else {
    renderEmpty(el);
  }
}

function renderToolbar(el) {
  let html = `<div class="att-toolbar">
    <div class="att-toolbar-left">
      <label class="att-label">Session:</label>
      <select class="att-select" id="att-session-sel">
        ${sessions.map(s => `<option value="${s._id}">${esc(s.session_date)}${s.title ? ' — ' + esc(s.title) : ''}</option>`).join('')}
      </select>
      <input type="date" class="att-date-input" id="att-new-date">
      <button class="att-btn" id="att-new-btn">+ New Session</button>
    </div>
    <div class="att-toolbar-right">
      <button class="att-btn att-save-btn" id="att-save-btn" style="display:none">Save Changes</button>
    </div>
  </div>
  <div id="att-grid-wrap"></div>`;

  el.innerHTML = html;

  document.getElementById('att-session-sel').addEventListener('change', e => {
    if (dirty && !confirm('You have unsaved changes. Discard?')) {
      e.target.value = activeSession._id;
      return;
    }
    const s = sessions.find(x => x._id === e.target.value);
    if (s) selectSession(s);
  });

  document.getElementById('att-new-btn').addEventListener('click', createNewSession);
  document.getElementById('att-save-btn').addEventListener('click', saveSession);
}

function renderEmpty(el) {
  const wrap = el.querySelector('#att-grid-wrap') || el;
  wrap.innerHTML = '<div class="att-empty">No game sessions yet. Create one to start tracking attendance.</div>';
}

function selectSession(session) {
  activeSession = session;
  dirty = false;
  document.getElementById('att-save-btn').style.display = 'none';
  renderGrid();
}

function markDirty() {
  dirty = true;
  document.getElementById('att-save-btn').style.display = '';
}

async function createNewSession() {
  const dateInput = document.getElementById('att-new-date');
  const date = dateInput.value;
  if (!date) { dateInput.focus(); return; }

  const gameNumber = sessions.length + 1;
  const title = 'Game ' + gameNumber;

  // Pre-populate with all active characters
  const attendance = chars.map(c => ({
    character_id: c._id,
    name: c.name,
    display_name: displayName(c),
    attended: false,
    costuming: false,
    downtime: false,
    extra: 0,
    paid: false,
    payment_method: ''
  }));

  try {
    const session = await apiPost('/api/game_sessions', {
      session_date: date,
      title,
      attendance
    });
    sessions.unshift(session);
    // Update dropdown
    const sel = document.getElementById('att-session-sel');
    const opt = document.createElement('option');
    opt.value = session._id;
    opt.textContent = date + (title ? ' — ' + title : '');
    sel.prepend(opt);
    sel.value = session._id;
    selectSession(session);
  } catch (err) {
    alert('Failed to create session: ' + err.message);
  }
}

function renderGrid() {
  const wrap = document.getElementById('att-grid-wrap');
  if (!activeSession) { renderEmpty(wrap); return; }

  const att = activeSession.attendance || [];

  // XP summary
  const totalAttended = att.filter(a => a.attended).length;
  const totalPaid = att.filter(a => a.paid).length;

  let html = `<div class="att-summary">
    <span>${esc(activeSession.session_date)}${activeSession.title ? ' — ' + esc(activeSession.title) : ''}</span>
    <span class="att-stat">Attended: <strong>${totalAttended}</strong> / ${att.length}</span>
    <span class="att-stat">Paid: <strong>${totalPaid}</strong> / ${att.length}</span>
  </div>`;

  html += `<table class="att-table">
    <thead><tr>
      <th class="att-name-col">Character</th>
      <th class="att-check-col">Attended</th>
      <th class="att-check-col">Costume</th>
      <th class="att-check-col">Downtime</th>
      <th class="att-num-col">Extra</th>
      <th class="att-xp-col">XP</th>
      <th class="att-pay-col">Payment</th>
      <th class="att-check-col">Paid</th>
    </tr></thead><tbody>`;

  for (let i = 0; i < att.length; i++) {
    const a = att[i];
    const xp = (a.attended ? 1 : 0) + (a.costuming ? 1 : 0) + (a.downtime ? 1 : 0) + (a.extra || 0);
    const absentClass = a.attended ? '' : ' att-absent';

    html += `<tr class="att-row${absentClass}">
      <td class="att-name">${esc(a.display_name || a.name)}</td>
      <td class="att-check"><input type="checkbox" ${a.attended ? 'checked' : ''} onchange="attUpdate(${i},'attended',this.checked)"></td>
      <td class="att-check"><input type="checkbox" ${a.costuming ? 'checked' : ''} onchange="attUpdate(${i},'costuming',this.checked)"></td>
      <td class="att-check"><input type="checkbox" ${a.downtime ? 'checked' : ''} onchange="attUpdate(${i},'downtime',this.checked)"></td>
      <td class="att-num"><input type="number" min="0" max="5" value="${a.extra || 0}" onchange="attUpdate(${i},'extra',+this.value)"></td>
      <td class="att-xp">${xp}</td>
      <td class="att-pay"><select onchange="attUpdate(${i},'payment_method',this.value)">${PAYMENT_METHODS.map(m => `<option${a.payment_method === m ? ' selected' : ''}>${esc(m || '—')}</option>`).join('')}</select></td>
      <td class="att-check"><input type="checkbox" ${a.paid ? 'checked' : ''} onchange="attUpdate(${i},'paid',this.checked)"></td>
    </tr>`;
  }

  html += '</tbody></table>';
  wrap.innerHTML = html;
}

function attUpdate(idx, field, value) {
  if (!activeSession) return;
  activeSession.attendance[idx][field] = value;
  markDirty();
  renderGrid();
}

async function saveSession() {
  if (!activeSession) return;
  const btn = document.getElementById('att-save-btn');
  btn.textContent = 'Saving...';

  try {
    const { _id, ...body } = activeSession;
    const updated = await apiPut('/api/game_sessions/' + _id, body);
    Object.assign(activeSession, updated);
    dirty = false;
    btn.style.display = 'none';
    btn.textContent = 'Save Changes';
  } catch (err) {
    btn.textContent = 'Error — retry';
    console.error('Save failed:', err.message);
  }
}

// Expose to inline handlers
Object.assign(window, { attUpdate });
