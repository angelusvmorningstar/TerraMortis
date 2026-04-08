/**
 * Data Portability — DP-1 (export), DP-2 (import), DP-3 (verify).
 * Validators, writers, and CSV parser are in data-portability-import.js.
 */

import { apiGet, apiPut, apiPost } from '../data/api.js';
import { downloadCSV as downloadCharCSV } from '../editor/export.js';
import { validateRow, writeRow, parseCSV } from './data-portability-import.js';
import { parseExcelWorkbook } from './excel-parser.js';
import { mergeExcelOntoCharacter } from './excel-merge.js';
import { getRuleByKey } from '../data/loader.js';

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
      const collection = e.target.dataset.collection;
      if (collection === 'characters') await handleExcelImport(e.target.files[0]);
      else await handleImport(collection, e.target.files[0]);
      e.target.value = '';
    });
  });
  el.querySelectorAll('.dp-verify-btn').forEach(btn => {
    btn.addEventListener('click', () => handleVerify(btn.dataset.collection));
  });
}

function buildShell() {
  const collections = [
    { id: 'characters',    label: 'Characters',    desc: 'Full character sheets (Affinity Publisher merge format)', excelImport: true },
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
    if (c.excelImport) {
      const xlsxOk = typeof window !== 'undefined' && window.XLSX;
      h += `<button class="dt-btn dp-import-btn dp-excel-import" data-collection="${c.id}"${xlsxOk ? '' : ' disabled title="XLSX library not loaded"'}>Import from Excel</button>`;
      h += `<input type="file" accept=".xlsx" class="dp-file-input" data-collection="${c.id}" style="display:none">`;
    } else if (!c.noImport) {
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

// ── Excel Import ─────────────────────────────────────────────────────────────

let _importResults = [];
let _importChars = [];

async function handleExcelImport(file) {
  const resultEl = document.getElementById('dp-result');
  resultEl.innerHTML = '<p class="dp-result-loading">Parsing Excel workbook\u2026</p>';

  try {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data, { type: 'array' });
    const { characters: excelChars, warnings } = parseExcelWorkbook(workbook);

    if (!excelChars.length) {
      resultEl.innerHTML = '<p class="dp-result-err">No characters found in workbook.' + (warnings.length ? '<br>' + warnings.join('<br>') : '') + '</p>';
      return;
    }

    // Load existing characters from API
    const existingChars = await apiGet('/api/characters');
    const existingMap = new Map();
    for (const c of existingChars) existingMap.set(c.name, c);

    // Merge each Excel character onto existing data
    _importResults = [];
    for (const excel of excelChars) {
      const existing = existingMap.get(excel.name) || null;
      const result = mergeExcelOntoCharacter(existing, excel);
      _importResults.push(result);
      existingMap.delete(excel.name);
    }

    // Add DB-only characters as "Not in Excel"
    for (const [name, c] of existingMap) {
      _importResults.push({ merged: c, changes: [], warnings: [], isNew: false, notInExcel: true });
    }

    _importChars = existingChars;
    renderImportPreview(resultEl, warnings);
  } catch (err) {
    resultEl.innerHTML = `<p class="dp-result-err">Excel import failed: ${err.message}</p>`;
  }
}

function _esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function renderImportPreview(el, globalWarnings) {
  let h = '<div class="dp-excel-preview">';
  h += '<div class="dp-excel-header">';
  h += `<span class="dp-stat">${_importResults.length} characters parsed</span>`;
  const updates = _importResults.filter(r => !r.isNew && !r.notInExcel && r.changes.length);
  const newChars = _importResults.filter(r => r.isNew);
  const unchanged = _importResults.filter(r => !r.isNew && !r.notInExcel && !r.changes.length);
  const notInExcel = _importResults.filter(r => r.notInExcel);
  h += `<span class="dp-stat dp-stat-ok">${updates.length} to update</span>`;
  if (newChars.length) h += `<span class="dp-stat" style="color:var(--gold2)">${newChars.length} new</span>`;
  h += `<span class="dp-stat">${unchanged.length} unchanged</span>`;
  if (notInExcel.length) h += `<span class="dp-stat">${notInExcel.length} DB only</span>`;
  h += '</div>';

  if (globalWarnings.length) {
    h += '<div class="dp-excel-warnings">' + globalWarnings.map(w => '<div class="dp-excel-warn">\u26A0 ' + _esc(w) + '</div>').join('') + '</div>';
  }

  // Table
  h += '<table class="dp-excel-tbl"><thead><tr>';
  h += '<th><input type="checkbox" id="dp-excel-all" checked></th>';
  h += '<th>Character</th><th>Status</th><th>Changes</th><th>Warnings</th>';
  h += '</tr></thead><tbody>';

  _importResults.forEach((r, i) => {
    if (r.notInExcel) {
      h += `<tr class="dp-excel-row dp-excel-dimmed"><td></td><td>${_esc(r.merged.name)}</td><td><span class="dp-badge dp-badge-dim">Not in Excel</span></td><td>\u2014</td><td></td></tr>`;
      return;
    }
    const status = r.isNew ? 'New' : r.changes.length ? 'Update' : 'Unchanged';
    const badgeCls = r.isNew ? 'dp-badge-new' : r.changes.length ? 'dp-badge-update' : 'dp-badge-dim';
    const checked = r.isNew ? '' : r.changes.length ? ' checked' : '';
    const warnCount = r.warnings.length;

    h += `<tr class="dp-excel-row" data-idx="${i}">`;
    h += `<td><input type="checkbox" class="dp-excel-chk" data-idx="${i}"${checked}${status === 'Unchanged' ? ' disabled' : ''}></td>`;
    h += `<td class="dp-excel-name">${_esc(r.merged.name)}</td>`;
    h += `<td><span class="dp-badge ${badgeCls}">${status}</span></td>`;
    h += `<td>${r.changes.length || '\u2014'}</td>`;
    h += `<td>${warnCount ? '<span class="dp-badge dp-badge-warn">' + warnCount + '</span>' : ''}</td>`;
    h += '</tr>';

    // Expandable diff panel
    if (r.changes.length || r.warnings.length) {
      h += `<tr class="dp-excel-diff" id="dp-diff-${i}" style="display:none"><td colspan="5"><div class="dp-diff-panel">`;
      if (r.warnings.length) {
        h += '<div class="dp-diff-section"><div class="dp-diff-title">Warnings</div>';
        r.warnings.forEach(w => { h += '<div class="dp-diff-warn">\u26A0 ' + _esc(w) + '</div>'; });
        h += '</div>';
      }
      // Group changes by section
      const sections = {};
      for (const ch of r.changes) {
        if (!sections[ch.section]) sections[ch.section] = [];
        sections[ch.section].push(ch);
      }
      for (const [sec, chs] of Object.entries(sections)) {
        h += `<div class="dp-diff-section"><div class="dp-diff-title">${_esc(sec)}</div>`;
        for (const ch of chs) {
          h += `<div class="dp-diff-row"><span class="dp-diff-field">${_esc(ch.field)}</span><span class="dp-diff-old">${_esc(String(ch.old))}</span><span class="dp-diff-arrow">\u2192</span><span class="dp-diff-new">${_esc(String(ch.new))}</span></div>`;
        }
        h += '</div>';
      }
      h += '</div></td></tr>';
    }
  });

  h += '</tbody></table>';
  h += '<div class="dp-excel-actions">';
  h += '<button class="dt-btn dp-excel-apply" id="dp-excel-apply">Apply Import</button>';
  h += '<span class="dp-excel-progress" id="dp-excel-progress"></span>';
  h += '</div></div>';

  el.innerHTML = h;

  // Wire events
  el.querySelector('#dp-excel-all')?.addEventListener('change', e => {
    el.querySelectorAll('.dp-excel-chk:not(:disabled)').forEach(cb => { cb.checked = e.target.checked; });
  });
  el.querySelectorAll('.dp-excel-row[data-idx]').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.tagName === 'INPUT') return;
      const idx = row.dataset.idx;
      const diff = el.querySelector(`#dp-diff-${idx}`);
      if (diff) diff.style.display = diff.style.display === 'none' ? '' : 'none';
    });
  });
  el.querySelector('#dp-excel-apply')?.addEventListener('click', () => applyExcelImport(el));
}

async function applyExcelImport(el) {
  const btn = el.querySelector('#dp-excel-apply');
  const prog = el.querySelector('#dp-excel-progress');
  if (btn) btn.disabled = true;

  const selected = [];
  el.querySelectorAll('.dp-excel-chk:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.idx, 10);
    if (!isNaN(idx)) selected.push(idx);
  });

  if (!selected.length) {
    if (prog) prog.textContent = 'No characters selected.';
    if (btn) btn.disabled = false;
    return;
  }

  let updated = 0, created = 0, failed = 0;
  const errors = [];

  for (let si = 0; si < selected.length; si++) {
    const r = _importResults[selected[si]];
    if (prog) prog.textContent = `${si + 1} of ${selected.length}\u2026`;

    try {
      if (r.isNew) {
        await apiPost('/api/characters', r.merged);
        created++;
      } else {
        const id = r.merged._id;
        const body = { ...r.merged };
        delete body._id;
        await apiPut(`/api/characters/${id}`, body);
        updated++;
      }
    } catch (err) {
      failed++;
      errors.push({ name: r.merged.name, error: err.message });
    }
  }

  let msg = `Done: ${updated} updated`;
  if (created) msg += `, ${created} created`;
  if (failed) msg += `, ${failed} failed`;
  if (prog) prog.textContent = msg;
  if (btn) btn.disabled = false;

  if (errors.length) {
    let errH = '<div class="dp-excel-errors">';
    errors.forEach(e => { errH += `<div class="dp-diff-warn">\u2716 ${_esc(e.name)}: ${_esc(e.error)}</div>`; });
    errH += '</div>';
    el.querySelector('.dp-excel-actions')?.insertAdjacentHTML('afterend', errH);
  }

  // Refresh character data
  try {
    chars = await apiGet('/api/characters');
    // Trigger grid refresh if available
    if (typeof window.renderCharGrid === 'function') window.renderCharGrid();
  } catch { /* ignore refresh failure */ }
}
