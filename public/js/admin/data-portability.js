/**
 * Data Portability — DP-1 (export) and DP-2 (validated import).
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { downloadCSV as downloadCharCSV } from '../editor/export.js';

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
      h += `<input type="file" accept=".csv" class="dp-file-input" data-collection="${c.id}" style="display:none">`;
    }
    h += `</div>`;
    h += `</div>`;
  }
  h += '</div>';
  h += '<div id="dp-result"></div>';
  return h;
}

async function handleExport(collection) {
  try {
    switch (collection) {
      case 'characters':    await exportCharacters(); break;
      case 'territories':   await exportCollection('territories',    territoriesToRows,    territoryHeaders()); break;
      case 'game_sessions': await exportCollection('game_sessions',  gameSessionsToRows,   gameSessionHeaders()); break;
      case 'attendance':    await exportCollection('game_sessions',  attendanceToRows,     attendanceHeaders()); break;
      case 'investigations':await exportCollection('downtime_investigations', investigationsToRows, investigationHeaders()); break;
      case 'npcs':          await exportCollection('npcs',           npcsToRows,           npcHeaders()); break;
    }
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  }
}

async function exportCharacters() {
  if (!chars.length) { alert('No character data loaded.'); return; }
  await downloadCharCSV(chars);
}

async function exportCollection(apiPath, toRows, headers) {
  const docs = await apiGet(`/api/${apiPath}`);
  if (!docs.length) { alert('No data to export.'); return; }
  const rows = toRows(docs);
  triggerDownload(buildCSV(headers, rows), apiPath);
}

// ── Territory ────────────────────────────────────────────────────────────────

function territoryHeaders() {
  return ['id', 'name', 'regent_id', 'regent_name', 'ambience', 'feeding_rights', 'updated_at'];
}

function territoriesToRows(docs) {
  return docs.map(d => [
    d.id || '',
    d.name || '',
    d.regent_id || '',
    d.regent_name || '',
    d.ambience || '',
    (d.feeding_rights || []).join('; '),
    d.updated_at || '',
  ]);
}

// ── Game Sessions ────────────────────────────────────────────────────────────

function gameSessionHeaders() {
  return ['_id', 'session_date', 'game_number', 'attendance_count', 'created_at', 'updated_at'];
}

function gameSessionsToRows(docs) {
  return docs.map(d => [
    String(d._id),
    d.session_date || '',
    d.game_number != null ? d.game_number : '',
    (d.attendance || []).length,
    d.created_at || '',
    d.updated_at || '',
  ]);
}

// ── Attendance (expanded) ────────────────────────────────────────────────────

function attendanceHeaders() {
  return ['session_id', 'session_date', 'game_number', 'character_id', 'character_name', 'attended', 'costume', 'downtime', 'extra_xp'];
}

function attendanceToRows(docs) {
  const rows = [];
  for (const session of docs) {
    for (const a of (session.attendance || [])) {
      rows.push([
        String(session._id),
        session.session_date || '',
        session.game_number != null ? session.game_number : '',
        a.character_id != null ? String(a.character_id) : '',
        a.character_name || a.character_display || '',
        a.attended ? 'true' : 'false',
        a.costume  ? 'true' : 'false',
        a.downtime ? 'true' : 'false',
        a.extra_xp != null ? a.extra_xp : '',
      ]);
    }
  }
  return rows;
}

// ── Investigations ───────────────────────────────────────────────────────────

function investigationHeaders() {
  return ['_id', 'cycle_id', 'target_description', 'threshold_type', 'threshold', 'status', 'progress', 'investigating_character_id', 'notes', 'created_at'];
}

function investigationsToRows(docs) {
  return docs.map(d => [
    String(d._id),
    d.cycle_id != null ? String(d.cycle_id) : '',
    d.target_description || '',
    d.threshold_type || '',
    d.threshold != null ? d.threshold : '',
    d.status || '',
    d.progress != null ? d.progress : '',
    d.investigating_character_id || '',
    d.notes || '',
    d.created_at || '',
  ]);
}

// ── NPCs ─────────────────────────────────────────────────────────────────────

function npcHeaders() {
  return ['_id', 'name', 'description', 'status', 'linked_cycle_id', 'linked_character_ids', 'notes', 'created_at'];
}

function npcsToRows(docs) {
  return docs.map(d => [
    String(d._id),
    d.name || '',
    d.description || '',
    d.status || '',
    d.linked_cycle_id != null ? String(d.linked_cycle_id) : '',
    (d.linked_character_ids || []).join('; '),
    d.notes || '',
    d.created_at || '',
  ]);
}

// ── Import ───────────────────────────────────────────────────────────────────

async function handleImport(collection, file) {
  const resultEl = document.getElementById('dp-result');
  resultEl.innerHTML = '<p class="dp-result-loading">Parsing\u2026</p>';
  try {
    const text = await file.text();
    const rows = parseCSV(text);
    if (!rows.length) { resultEl.innerHTML = '<p class="dp-result-err">No data rows found.</p>'; return; }

    let written = 0, rejected = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-based, header is row 1
      const validationError = validateRow(collection, row);
      if (validationError) {
        rejected++;
        errors.push({ row: rowNum, error: validationError });
        continue;
      }
      try {
        await writeRow(collection, row);
        written++;
      } catch (err) {
        rejected++;
        errors.push({ row: rowNum, error: err.message });
      }
    }

    renderResult(resultEl, rows.length, written, rejected, errors);
  } catch (err) {
    resultEl.innerHTML = `<p class="dp-result-err">Import failed: ${err.message}</p>`;
  }
}

function validateRow(collection, row) {
  switch (collection) {
    case 'territories':   return validateTerritoryRow(row);
    case 'game_sessions': return validateGameSessionRow(row);
    case 'attendance':    return validateAttendanceRow(row);
    case 'investigations':return validateInvestigationRow(row);
    case 'npcs':          return validateNpcRow(row);
    default: return 'Unknown collection';
  }
}

async function writeRow(collection, row) {
  switch (collection) {
    case 'territories':    return writeTerritoryRow(row);
    case 'game_sessions':  return writeGameSessionRow(row);
    case 'attendance':     return writeAttendanceRow(row);
    case 'investigations': return writeInvestigationRow(row);
    case 'npcs':           return writeNpcRow(row);
  }
}

function renderResult(el, total, written, rejected, errors) {
  let h = '<div class="dp-result-box">';
  h += `<div class="dp-result-summary">`;
  h += `<span class="dp-stat">${total} processed</span>`;
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

// ── Per-collection validators ─────────────────────────────────────────────────

const VALID_OID = /^[0-9a-f]{24}$/i;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}/;
const BOOL_VALS = new Set(['true', 'false', '1', '0', '']);

function validateTerritoryRow(r) {
  if (!r.id) return 'id is required';
  return null;
}

function validateGameSessionRow(r) {
  if (!r.session_date) return 'session_date is required';
  if (!VALID_DATE.test(r.session_date)) return `session_date "${r.session_date}" is not a valid date`;
  if (r._id && !VALID_OID.test(r._id)) return `_id "${r._id}" is not a valid ObjectId`;
  if (r.game_number && isNaN(parseInt(r.game_number, 10))) return 'game_number must be an integer';
  return null;
}

function validateAttendanceRow(r) {
  if (!r.session_id) return 'session_id is required';
  if (!VALID_OID.test(r.session_id)) return `session_id "${r.session_id}" is not a valid ObjectId`;
  if (!r.character_name) return 'character_name is required';
  if (r.attended && !BOOL_VALS.has(r.attended.toLowerCase())) return `attended must be true or false`;
  if (r.extra_xp && isNaN(parseInt(r.extra_xp, 10))) return 'extra_xp must be an integer';
  return null;
}

function validateInvestigationRow(r) {
  if (!r.target_description) return 'target_description is required';
  if (r._id && !VALID_OID.test(r._id)) return `_id "${r._id}" is not a valid ObjectId`;
  if (r.status && !['active', 'resolved'].includes(r.status)) return `status must be active or resolved`;
  if (r.threshold && isNaN(parseInt(r.threshold, 10))) return 'threshold must be an integer';
  if (r.progress && isNaN(parseInt(r.progress, 10))) return 'progress must be an integer';
  return null;
}

function validateNpcRow(r) {
  if (!r.name) return 'name is required';
  if (r._id && !VALID_OID.test(r._id)) return `_id "${r._id}" is not a valid ObjectId`;
  if (r.status && !['active', 'resolved', 'archived'].includes(r.status)) return `status must be active, resolved, or archived`;
  return null;
}

// ── Per-collection writers ────────────────────────────────────────────────────

function parseBool(v) { return v === 'true' || v === '1'; }

async function writeTerritoryRow(r) {
  await apiPost('/api/territories', {
    id: r.id,
    name: r.name || undefined,
    regent_id: r.regent_id || undefined,
    regent_name: r.regent_name || undefined,
    ambience: r.ambience || undefined,
    feeding_rights: r.feeding_rights ? r.feeding_rights.split(';').map(s => s.trim()).filter(Boolean) : [],
  });
}

async function writeGameSessionRow(r) {
  const body = {
    session_date: r.session_date,
    game_number: r.game_number ? parseInt(r.game_number, 10) : undefined,
  };
  if (r._id) {
    await apiPut(`/api/game_sessions/${r._id}`, body);
  } else {
    await apiPost('/api/game_sessions', body);
  }
}

// Attendance rows are grouped per session and merged into the session document.
// Each row is written individually here; the grouping approach would require
// multiple API round-trips. We use a simple per-row merge via PUT.
async function writeAttendanceRow(r) {
  const session = await apiGet(`/api/game_sessions/${r.session_id}`);
  const attendance = session.attendance ? [...session.attendance] : [];
  const idx = attendance.findIndex(a =>
    (r.character_id && String(a.character_id) === r.character_id) ||
    (a.character_name === r.character_name)
  );
  const entry = {
    character_id: r.character_id || undefined,
    character_name: r.character_name,
    attended: parseBool(r.attended),
    costume:  parseBool(r.costume),
    downtime: parseBool(r.downtime),
    extra_xp: r.extra_xp ? parseInt(r.extra_xp, 10) : 0,
  };
  if (idx >= 0) attendance[idx] = { ...attendance[idx], ...entry };
  else attendance.push(entry);
  await apiPut(`/api/game_sessions/${r.session_id}`, { session_date: session.session_date, attendance });
}

async function writeInvestigationRow(r) {
  const body = {
    target_description: r.target_description,
    threshold_type: r.threshold_type || undefined,
    threshold: r.threshold ? parseInt(r.threshold, 10) : undefined,
    status: r.status || undefined,
    successes_accumulated: r.progress ? parseInt(r.progress, 10) : undefined,
    investigating_character_id: r.investigating_character_id || undefined,
    cycle_id: r.cycle_id || undefined,
  };
  if (r._id) {
    await apiPut(`/api/downtime_investigations/${r._id}`, body);
  } else {
    await apiPost('/api/downtime_investigations', body);
  }
}

async function writeNpcRow(r) {
  const body = {
    name: r.name,
    description: r.description || '',
    status: r.status || 'active',
    linked_cycle_id: r.linked_cycle_id || null,
    linked_character_ids: r.linked_character_ids ? r.linked_character_ids.split(';').map(s => s.trim()).filter(Boolean) : [],
    notes: r.notes || '',
  };
  if (r._id) {
    await apiPut(`/api/npcs/${r._id}`, body);
  } else {
    await apiPost('/api/npcs', body);
  }
}

// ── CSV parser ────────────────────────────────────────────────────────────────

function parseCSV(text) {
  // Strip BOM
  const clean = text.replace(/^\uFEFF/, '');
  const lines = splitCSVLines(clean);
  if (lines.length < 2) return [];

  const headers = parseCSVRow(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const vals = parseCSVRow(lines[i]);
    const obj = {};
    for (let j = 0; j < headers.length; j++) obj[headers[j]] = vals[j] ?? '';
    rows.push(obj);
  }
  return rows;
}

function splitCSVLines(text) {
  const lines = [];
  let cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQ = !inQ;
      cur += ch;
    } else if (!inQ && (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n'))) {
      lines.push(cur); cur = '';
    } else if (!inQ && ch === '\r') {
      // skip \r before \n
    } else {
      cur += ch;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function parseCSVRow(line) {
  const fields = [];
  let cur = '', inQ = false;
  for (let i = 0; i <= line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if ((ch === ',' || ch === undefined) && !inQ) {
      fields.push(cur); cur = '';
    } else {
      cur += (ch || '');
    }
  }
  return fields;
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
  const header = headers.map(escapeCSV).join(',');
  const data = rows.map(r => r.map(escapeCSV).join(','));
  return header + '\n' + data.join('\n');
}

function triggerDownload(csv, name) {
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `TM_${name}_${today}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
