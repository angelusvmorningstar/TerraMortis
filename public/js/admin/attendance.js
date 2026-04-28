/**
 * Attendance & Finance — per-session player attendance, XP awards, and payment tracking.
 * Player-centric: each row is a player with their linked character.
 * Renders into #attendance-content in the admin app.
 */

import { apiGet, apiPut, apiDelete } from '../data/api.js';
import { displayName, sortName, redactPlayer } from '../data/helpers.js';

let chars = [];
let sessions = [];
let activeSession = null;
let _saveTimer = null;
let _sortBy = 'character'; // 'character' | 'player'

// FIN-5: 'Player A/B/C' placeholder strings seeded by an early redacted
// import. Treat as missing and fall back to the character's player field.
const PLACEHOLDER_RE = /^Player [A-Z]{1,2}$/;
function resolvePlayerName(a, c) {
  const raw = (a.player || '').trim();
  if (raw && !PLACEHOLDER_RE.test(raw)) return raw;
  if (c?.player) return c.player;
  return raw || '';
}

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

function getEligibleChars() {
  if (!activeSession) return [];
  const presentIds = new Set(activeSession.attendance.map(a => a.character_id));
  return chars
    .filter(c => !presentIds.has(c._id))
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));
}

function showAddForm() {
  const eligible = getEligibleChars();
  if (!eligible.length) {
    alert('All active characters are already in this session.');
    return;
  }

  const form = document.getElementById('att-add-form');
  const addBtn = document.getElementById('att-add-btn');
  if (!form) return;

  form.innerHTML = `
    <select id="att-add-sel">
      <option value="">— select character —</option>
      ${eligible.map(c => `<option value="${esc(c._id)}">${esc(displayName(c))}${c.player ? ' (' + esc(c.player) + ')' : ''}</option>`).join('')}
    </select>
    <button class="att-btn" id="att-add-confirm">Add</button>
    <button class="att-btn" id="att-add-cancel">Cancel</button>
  `;
  form.style.display = 'flex';
  if (addBtn) addBtn.disabled = true;

  document.getElementById('att-add-confirm').addEventListener('click', confirmAddCharacter);
  document.getElementById('att-add-cancel').addEventListener('click', hideAddForm);
}

function hideAddForm() {
  const form = document.getElementById('att-add-form');
  const addBtn = document.getElementById('att-add-btn');
  if (form) { form.style.display = 'none'; form.innerHTML = ''; }
  if (addBtn) addBtn.disabled = false;
}

async function confirmAddCharacter() {
  const sel = document.getElementById('att-add-sel');
  if (!sel || !sel.value) return;
  const c = chars.find(ch => ch._id === sel.value);
  if (!c) return;

  const entry = {
    character_id:      c._id,
    character_name:    c.name,
    character_display: displayName(c),
    player:            c.player || '',
    attended:          false,
    costuming:         false,
    downtime:          false,
    extra:             0,
    paid:              false,
    payment_method:    ''
  };

  activeSession.attendance.push(entry);
  hideAddForm();

  try {
    const { _id, ...body } = activeSession;
    const updated = await apiPut('/api/game_sessions/' + _id, body);
    Object.assign(activeSession, updated);
  } catch (err) {
    activeSession.attendance.pop(); // rollback
    alert('Failed to add character: ' + err.message);
  }

  renderGrid();
}

function renderToolbar(el) {
  let html = `<div class="att-toolbar">
    <div class="att-toolbar-left">
      <label class="att-label">Session:</label>
      <select class="att-select" id="att-session-sel">
        ${sessions.map(s => `<option value="${s._id}">${esc(s.session_date)}${s.title ? ' — ' + esc(s.title) : ''}</option>`).join('')}
      </select>
      <!-- Session creation moved to the Next Session panel above; this
           toolbar only switches between existing sessions. -->
    </div>
    <div class="att-toolbar-right">
      <span class="att-save-status" id="att-save-status"></span>
      <button class="att-btn" id="att-add-btn">+ Add Character</button>
      <button class="att-btn att-delete-btn" id="att-delete-btn" style="display:none">Delete Session</button>
    </div>
  </div>
  <div id="att-add-form" class="att-add-form" style="display:none"></div>
  <div id="att-grid-wrap"></div>`;

  el.innerHTML = html;

  document.getElementById('att-session-sel').addEventListener('change', e => {
    const s = sessions.find(x => x._id === e.target.value);
    if (s) selectSession(s);
  });

  document.getElementById('att-add-btn').addEventListener('click', showAddForm);
  document.getElementById('att-delete-btn').addEventListener('click', deleteSession);
}

function renderEmpty(el) {
  const wrap = el.querySelector('#att-grid-wrap') || el;
  wrap.innerHTML = '<div class="att-empty">No game sessions yet. Create one to start tracking attendance.</div>';
}

function selectSession(session) {
  activeSession = session;
  clearTimeout(_saveTimer);
  _saveTimer = null;
  hideAddForm();
  document.getElementById('att-delete-btn').style.display = sessions.length > 1 ? '' : 'none';
  renderGrid();
}

function scheduleAutosave() {
  const statusEl = document.getElementById('att-save-status');
  if (statusEl) statusEl.textContent = 'Saving\u2026';
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(doAutosave, 800);
}

async function doAutosave() {
  if (!activeSession) return;
  const statusEl = document.getElementById('att-save-status');
  try {
    const { _id, ...body } = activeSession;
    const updated = await apiPut('/api/game_sessions/' + _id, body);
    Object.assign(activeSession, updated);
    if (statusEl) statusEl.textContent = '';
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed \u2014 retrying\u2026';
    _saveTimer = setTimeout(doAutosave, 3000);
  }
}

// Session creation removed from this toolbar; the Next Session panel above
// is now the canonical session creator. Attendance is populated at the door
// via the Check-In tab (FIN-5/6/7) and edited here post-game.

function renderGrid() {
  const wrap = document.getElementById('att-grid-wrap');
  if (!activeSession) { renderEmpty(wrap); return; }

  const att = activeSession.attendance || [];

  const sorted = att.map((a, i) => {
    const c = chars.find(ch => ch._id === a.character_id || ch.name === a.character_name || ch.name === a.name);
    const player = resolvePlayerName(a, c);
    return { a, i, c, player };
  });
  sorted.sort((x, y) => {
    if (_sortBy === 'player') {
      return (x.player || '').localeCompare(y.player || '');
    }
    const nx = x.c ? sortName(x.c) : (x.a.character_display || x.a.name || '');
    const ny = y.c ? sortName(y.c) : (y.a.character_display || y.a.name || '');
    return nx.localeCompare(ny);
  });

  // Summaries
  const totalAttended = att.filter(a => a.attended).length;
  const totalPaid = att.filter(a => a.paid).length;

  let html = `<div class="att-summary">
    <span>${esc(activeSession.session_date)}${activeSession.title ? ' — ' + esc(activeSession.title) : ''}</span>
    <span class="att-stat">Attended: <strong>${totalAttended}</strong> / ${att.length}</span>
    <span class="att-stat">Paid: <strong>${totalPaid}</strong> / ${att.length}</span>
  </div>`;

  const pArrow = _sortBy === 'player'    ? ' \u25B2' : '';
  const cArrow = _sortBy === 'character' ? ' \u25B2' : '';
  html += `<table class="att-table">
    <thead><tr>
      <th class="att-name-col att-sort-hd" onclick="attSort('player')">Player${pArrow}</th>
      <th class="att-char-col att-sort-hd" onclick="attSort('character')">Character${cArrow}</th>
      <th class="att-check-col">Attended</th>
      <th class="att-check-col">Costume</th>
      <th class="att-check-col">Downtime</th>
      <th class="att-num-col">Extra</th>
      <th class="att-xp-col">XP</th>
      <th class="att-pay-col">Payment</th>
      <th class="att-check-col">Paid</th>
    </tr></thead><tbody>`;

  for (const { a, i, c } of sorted) {
    const rawName = c ? sortName(c) : (a.character_display || a.display_name || a.name || '');
    const charDisplay = rawName.replace(/\b\w/g, l => l.toUpperCase());
    const playerName = resolvePlayerName(a, c);
    const xp = (a.attended ? 1 : 0) + (a.costuming ? 1 : 0) + (a.downtime ? 1 : 0) + (a.extra || 0);
    const absentClass = a.attended ? '' : ' att-absent';

    html += `<tr class="att-row${absentClass}">
      <td class="att-player-name">${esc(redactPlayer(playerName))}</td>
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

function attSort(field) {
  _sortBy = field;
  renderGrid();
}

function attUpdate(idx, field, value) {
  if (!activeSession) return;
  activeSession.attendance[idx][field] = value;
  scheduleAutosave();
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
    clearTimeout(_saveTimer);
    _saveTimer = null;
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


// Expose to inline handlers
Object.assign(window, { attUpdate, attSort });
