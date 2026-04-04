/**
 * Data Portability — DP-1 (export), DP-2 (import), DP-3 (verify).
 * Validators, writers, and CSV parser are in data-portability-import.js.
 */

import { apiGet } from '../data/api.js';
import { downloadCSV as downloadCharCSV } from '../editor/export.js';
import { validateRow, writeRow, parseCSV } from './data-portability-import.js';

let chars = [];

export function initDataPortabilityView(charData) {
  chars = charData || [];
  const el = document.getElementById('data-portability-content');
  if (!el) return;
  el.innerHTML = buildShell();
  el.querySelectorAll('.dp-export-btn').forEach(btn => {
    btn.addEventListener('click', () => handleExport(btn.dataset.collection));
  });
  el.querySelectorAll('.dp-import-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelector(`.dp-file-input[data-collection="${btn.dataset.collection}"]`)?.click();
    });
  });
  el.querySelectorAll('.dp-file-input').forEach(input => {
    input.addEventListener('change', async e => {
      if (!e.target.files[0]) return;
      await handleImport(e.target.dataset.collection, e.target.files[0]);
      e.target.value = '';
    });
  });
  el.querySelectorAll('.dp-verify-btn').forEach(btn => {
    btn.addEventListener('click', () => handleVerify(btn.dataset.collection));
  });
}

function buildShell() {
  const collections = [
    { id: 'characters',    label: 'Characters',    desc: 'Full character sheets (Affinity Publisher merge format)', noImport: true },
    { id: 'territories',   label: 'Territories',   desc: 'Territory ambience, regents, feeding rights' },
    { id: 'game_sessions', label: 'Game Sessions',  desc: 'Session dates and game numbers' },
    { id: 'attendance',    label: 'Attendance',     desc: 'Per-character attendance per session (expanded rows)' },
    { id: 'investigations',label: 'Investigations', desc: 'Downtime investigation tracker entries' },
    { id: 'npcs',          label: 'NPCs',           desc: 'NPC register entries' },
  ];
  let h = '<div class="dp-grid">';
  for (const c of collections) {
    h += `<div class="dp-card">`;
    h += `<div class="dp-card-name">${c.label}</div>`;
    h += `<div class="dp-card-desc">${c.desc}</div>`;
    h += `<div class="dp-card-btns">`;
    h += `<button class="dt-btn dp-export-btn" data-collection="${c.id}">Export CSV</button>`;
    if (!c.noImport) {
      h += `<button class="dt-btn dp-import-btn" data-collection="${c.id}">Import CSV</button>`;
      h += `<button class="dt-btn dp-verify-btn" data-collection="${c.id}">Verify</button>`;
      h += `<input type="file" accept=".csv" class="dp-file-input" data-collection="${c.id}" style="display:none">`;
    }
    h += `</div></div>`;
  }
  h += '</div><div id="dp-result"></div>';
  return h;
}

// ── Export ───────────────────────────────────────────────────────────────────

async function handleExport(collection) {
  try {
    switch (collection) {
      case 'characters':    await exportCharacters(); break;
      case 'territories':   await exportCollection('territories',             territoriesToRows,    territoryHeaders()); break;
      case 'game_sessions': await exportCollection('game_sessions',           gameSessionsToRows,   gameSessionHeaders()); break;
      case 'attendance':    await exportCollection('game_sessions',           attendanceToRows,     attendanceHeaders()); break;
      case 'investigations':await exportCollection('downtime_investigations', investigationsToRows, investigationHeaders()); break;
      case 'npcs':          await exportCollection('npcs',                    npcsToRows,           npcHeaders()); break;
    }
  } catch (err) { alert(`Export failed: ${err.message}`); }
}

async function exportCharacters() {
  if (!chars.length) { alert('No character data loaded.'); return; }
  await downloadCharCSV(chars);
}

async function exportCollection(apiPath, toRows, headers) {
  const docs = await apiGet(`/api/${apiPath}`);
  if (!docs.length) { alert('No data to export.'); return; }
  triggerDownload(buildCSV(headers, toRows(docs)), apiPath);
}

// ── Territory ────────────────────────────────────────────────────────────────

function territoryHeaders() {
  return ['id', 'name', 'regent_id', 'regent_name', 'ambience', 'feeding_rights', 'updated_at'];
}
function territoriesToRows(docs) {
  return docs.map(d => [d.id || '', d.name || '', d.regent_id || '', d.regent_name || '',
    d.ambience || '', (d.feeding_rights || []).join('; '), d.updated_at || '']);
}

// ── Game Sessions ────────────────────────────────────────────────────────────

function gameSessionHeaders() {
  return ['_id', 'session_date', 'game_number', 'attendance_count', 'created_at', 'updated_at'];
}
function gameSessionsToRows(docs) {
  return docs.map(d => [String(d._id), d.session_date || '',
    d.game_number != null ? d.game_number : '', (d.attendance || []).length,
    d.created_at || '', d.updated_at || '']);
}

// ── Attendance ───────────────────────────────────────────────────────────────

function attendanceHeaders() {
  return ['session_id', 'session_date', 'game_number', 'character_id', 'character_name', 'attended', 'costume', 'downtime', 'extra_xp'];
}
function attendanceToRows(docs) {
  const rows = [];
  for (const session of docs) {
    for (const a of (session.attendance || [])) {
      rows.push([String(session._id), session.session_date || '',
        session.game_number != null ? session.game_number : '',
        a.character_id != null ? String(a.character_id) : '',
        a.character_name || a.character_display || '',
        a.attended ? 'true' : 'false', a.costume ? 'true' : 'false',
        a.downtime ? 'true' : 'false', a.extra_xp != null ? a.extra_xp : '']);
    }
  }
  return rows;
}

// ── Investigations ───────────────────────────────────────────────────────────

function investigationHeaders() {
  return ['_id', 'cycle_id', 'target_description', 'threshold_type', 'threshold', 'status', 'progress', 'investigating_character_id', 'notes', 'created_at'];
}
function investigationsToRows(docs) {
  return docs.map(d => [String(d._id), d.cycle_id != null ? String(d.cycle_id) : '',
    d.target_description || '', d.threshold_type || '',
    d.threshold != null ? d.threshold : '', d.status || '',
    d.progress != null ? d.progress : '', d.investigating_character_id || '',
    d.notes || '', d.created_at || '']);
}

// ── NPCs ─────────────────────────────────────────────────────────────────────

function npcHeaders() {
  return ['_id', 'name', 'description', 'status', 'linked_cycle_id', 'linked_character_ids', 'notes', 'created_at'];
}
function npcsToRows(docs) {
  return docs.map(d => [String(d._id), d.name || '', d.description || '', d.status || '',
    d.linked_cycle_id != null ? String(d.linked_cycle_id) : '',
    (d.linked_character_ids || []).join('; '), d.notes || '', d.created_at || '']);
}

// ── Round-Trip Verification (DP-3) ───────────────────────────────────────────

const COLLECTION_API = {
  territories: 'territories', game_sessions: 'game_sessions',
  attendance: 'game_sessions', investigations: 'downtime_investigations', npcs: 'npcs',
};
const COLLECTION_ROWS = {
  territories:    [territoryHeaders,    territoriesToRows],
  game_sessions:  [gameSessionHeaders,  gameSessionsToRows],
  attendance:     [attendanceHeaders,   attendanceToRows],
  investigations: [investigationHeaders, investigationsToRows],
  npcs:           [npcHeaders,          npcsToRows],
};

async function handleVerify(collection) {
  const resultEl = document.getElementById('dp-result');
  resultEl.innerHTML = '<p class="dp-result-loading">Verifying round-trip\u2026</p>';
  try {
    const docs = await apiGet(`/api/${COLLECTION_API[collection]}`);
    if (!docs.length) { resultEl.innerHTML = '<p class="dp-result-err">No data to verify.</p>'; return; }
    const [headersFn, toRowsFn] = COLLECTION_ROWS[collection];
    const rows = parseCSV(buildCSV(headersFn(), toRowsFn(docs)));
    let passed = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(collection, rows[i]);
      if (err) errors.push({ row: i + 2, error: `Re-parsed row failed validation: ${err}` });
      else passed++;
    }
    renderResult(resultEl, rows.length, passed, errors.length, errors);
    if (!errors.length) {
      resultEl.querySelector('.dp-result-box').insertAdjacentHTML('afterbegin',
        '<p class="dp-result-ok" style="margin-bottom:8px">Round-trip verified: all rows parse and validate correctly.</p>');
    }
  } catch (err) {
    resultEl.innerHTML = `<p class="dp-result-err">Verify failed: ${err.message}</p>`;
  }
}

// ── Import ───────────────────────────────────────────────────────────────────

async function handleImport(collection, file) {
  const resultEl = document.getElementById('dp-result');
  resultEl.innerHTML = '<p class="dp-result-loading">Parsing\u2026</p>';
  try {
    const rows = parseCSV(await file.text());
    if (!rows.length) { resultEl.innerHTML = '<p class="dp-result-err">No data rows found.</p>'; return; }
    let written = 0, rejected = 0;
    const errors = [];
    for (let i = 0; i < rows.length; i++) {
      const err = validateRow(collection, rows[i]);
      if (err) { rejected++; errors.push({ row: i + 2, error: err }); continue; }
      try { await writeRow(collection, rows[i]); written++; }
      catch (e) { rejected++; errors.push({ row: i + 2, error: e.message }); }
    }
    renderResult(resultEl, rows.length, written, rejected, errors);
  } catch (err) {
    resultEl.innerHTML = `<p class="dp-result-err">Import failed: ${err.message}</p>`;
  }
}

function renderResult(el, total, written, rejected, errors) {
  let h = '<div class="dp-result-box">';
  h += `<div class="dp-result-summary"><span class="dp-stat">${total} processed</span>`;
  h += `<span class="dp-stat dp-stat-ok">${written} written</span>`;
  if (rejected) h += `<span class="dp-stat dp-stat-err">${rejected} rejected</span>`;
  h += '</div>';
  if (errors.length) {
    h += '<ul class="dp-error-list">';
    for (const e of errors) h += `<li><strong>Row ${e.row}:</strong> ${e.error}</li>`;
    h += '</ul>';
  } else {
    h += '<p class="dp-result-ok">All rows written successfully.</p>';
  }
  h += '</div>';
  el.innerHTML = h;
}

// ── CSV utilities ─────────────────────────────────────────────────────────────

function escapeCSV(val) {
  const s = String(val ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function buildCSV(headers, rows) {
  return headers.map(escapeCSV).join(',') + '\n' + rows.map(r => r.map(escapeCSV).join(',')).join('\n');
}

function triggerDownload(csv, name) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TM_${name}_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
