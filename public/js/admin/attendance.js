/**
 * Attendance & Finance — per-session player attendance, XP awards, and payment tracking.
 * Player-centric: each row is a player with their linked character.
 * Renders into #attendance-content in the admin app.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
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

const PAYMENT_METHODS = ['', 'Cash', 'PayPal', 'PayID (Symon)', 'Transfer (Lyn)', 'Exiles', 'Waived'];

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
      <button class="att-btn att-delete-btn" id="att-delete-btn" style="display:none">Delete Session</button>
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
  document.getElementById('att-delete-btn').addEventListener('click', deleteSession);
}

function renderEmpty(el) {
  const wrap = el.querySelector('#att-grid-wrap') || el;
  wrap.innerHTML = '<div class="att-empty">No game sessions yet. Create one to start tracking attendance.</div>';
}

function selectSession(session) {
  activeSession = session;
  dirty = false;
  document.getElementById('att-save-btn').style.display = 'none';
  document.getElementById('att-delete-btn').style.display = sessions.length > 1 ? '' : 'none';
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

  // Pre-populate with all active players (1:1 with characters)
  const attendance = chars
    .map(c => ({
      player: c.player || '',
      character_id: c._id,
      character_name: c.name,
      character_display: displayName(c),
      attended: false,
      costuming: false,
      downtime: false,
      extra: 0,
      paid: false,
      payment_method: ''
    }))
    .sort((a, b) => a.player.localeCompare(b.player));

  try {
    const session = await apiPost('/api/game_sessions', {
      session_date: date,
      title,
      attendance
    });
    sessions.unshift(session);
    const sel = document.getElementById('att-session-sel');
    const opt = document.createElement('option');
    opt.value = session._id;
    opt.textContent = date + ' — ' + title;
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

  // Preserve original array order for display (matches MongoDB document order)
  const sorted = att.map((a, i) => {
    const c = chars.find(ch => ch._id === a.character_id || ch.name === a.character_name || ch.name === a.name);
    const player = a.player || (c ? c.player : '') || '';
    return { a, i, player };
  });

  // Summaries
  const totalAttended = att.filter(a => a.attended).length;
  const totalPaid = att.filter(a => a.paid).length;

  let html = `<div class="att-summary">
    <span>${esc(activeSession.session_date)}${activeSession.title ? ' — ' + esc(activeSession.title) : ''}</span>
    <span class="att-stat">Attended: <strong>${totalAttended}</strong> / ${att.length}</span>
    <span class="att-stat">Paid: <strong>${totalPaid}</strong> / ${att.length}</span>
  </div>`;

  html += `<table class="att-table">
    <thead><tr>
      <th class="att-name-col">Player</th>
      <th class="att-char-col">Character</th>
      <th class="att-check-col">Attended</th>
      <th class="att-check-col">Costume</th>
      <th class="att-check-col">Downtime</th>
      <th class="att-num-col">Extra</th>
      <th class="att-xp-col">XP</th>
      <th class="att-pay-col">Payment</th>
      <th class="att-check-col">Paid</th>
    </tr></thead><tbody>`;

  for (const { a, i } of sorted) {
    const c = chars.find(ch => ch._id === a.character_id || ch.name === a.character_name || ch.name === a.name);
    const charDisplay = c ? displayName(c) : (a.character_display || a.display_name || a.name || '');
    const playerName = a.player || (c ? c.player : '') || '';
    const xp = (a.attended ? 1 : 0) + (a.costuming ? 1 : 0) + (a.downtime ? 1 : 0) + (a.extra || 0);
    const absentClass = a.attended ? '' : ' att-absent';

    html += `<tr class="att-row${absentClass}">
      <td class="att-player-name">${esc(playerName)}</td>
      <td class="att-char-name">${esc(charDisplay)}</td>
      <td class="att-check"><input type="checkbox" ${a.attended ? 'checked' : ''} onchange="attUpdate(${i},'attended',this.checked)"></td>
      <td class="att-check"><input type="checkbox" ${a.costuming ? 'checked' : ''} onchange="attUpdate(${i},'costuming',this.checked)"></td>
      <td class="att-check"><input type="checkbox" ${a.downtime ? 'checked' : ''} onchange="attUpdate(${i},'downtime',this.checked)"></td>
      <td class="att-num"><input type="number" min="0" max="5" value="${a.extra || 0}" onchange="attUpdate(${i},'extra',+this.value)"></td>
      <td class="att-xp">${xp}</td>
      <td class="att-pay"><select onchange="attUpdate(${i},'payment_method',this.value)">${PAYMENT_METHODS.map(m => `<option${a.payment_method === m ? ' selected' : ''}>${esc(m || '\u2014')}</option>`).join('')}</select></td>
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

async function deleteSession() {
  if (!activeSession) return;
  const label = activeSession.session_date + (activeSession.title ? ' — ' + activeSession.title : '');
  if (!confirm(`Delete session "${label}"? This cannot be undone.`)) return;

  try {
    await apiDelete('/api/game_sessions/' + activeSession._id);
    sessions = sessions.filter(s => s._id !== activeSession._id);
    activeSession = null;
    dirty = false;
    const el = document.getElementById('attendance-content');
    renderToolbar(el);
    if (sessions.length) {
      selectSession(sessions[0]);
    } else {
      renderEmpty(el);
    }
  } catch (err) {
    alert('Failed to delete session: ' + err.message);
  }
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
