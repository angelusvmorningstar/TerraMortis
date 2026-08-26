/**
 * Data Portability — DP-1 (export), DP-2 (import), DP-3 (verify).
 * Validators, writers, and CSV parser are in data-portability-import.js.
 */

import { apiGet, apiPut, apiPost } from '../data/api.js';
import { validateRow, writeRow, parseCSV } from './data-portability-import.js';
import { processDowntimeCsvFile } from './downtime-views.js';

// ── Label map ─────────────────────────────────────────────────────────────────

const COLLECTION_LABELS = {
  downtime_submissions: 'Downtime Submissions',
  npcs:                 'NPCs',
  ordeal_rubrics:       'Ordeal Rubrics',
  ordeal_submissions:   'Ordeal Submissions',
  ordeal_responses:     'Ordeal Responses',
};

function collectionLabel(id) {
  return COLLECTION_LABELS[id] || id;
}

// ── Init ──────────────────────────────────────────────────────────────────────

// ADMR-3: the character-list parameter this used to take is removed - it was
// only ever needed by the now-retired characters Excel export/import flow.
// admin.js's own call site (initDataPortabilityView(chars)) is left
// unchanged: JS silently discards an extra call-site argument against a
// function declaring fewer parameters, so no caller-side edit is needed.
export function initDataPortabilityView() {
  const el = document.getElementById('data-portability-content');
  if (!el) return;
  el.innerHTML = buildShell();

  // Export CSV
  el.querySelectorAll('.dp-export-btn').forEach(btn => {
    btn.addEventListener('click', () => handleExport(btn.dataset.collection));
  });

  // Export JSON
  el.querySelectorAll('.dp-export-json-btn').forEach(btn => {
    btn.addEventListener('click', () => handleExportJson(btn.dataset.collection));
  });

  // Import CSV — click proxy → hidden input
  el.querySelectorAll('.dp-import-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelector(`.dp-file-input[data-collection="${btn.dataset.collection}"]`)?.click();
    });
  });

  // Import JSON — click proxy → hidden input
  el.querySelectorAll('.dp-import-json-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelector(`.dp-file-json-input[data-collection="${btn.dataset.collection}"]`)?.click();
    });
  });

  // CSV file change
  el.querySelectorAll('.dp-file-input').forEach(input => {
    input.addEventListener('change', async e => {
      if (!e.target.files[0]) return;
      const collection = e.target.dataset.collection;
      const file = e.target.files[0];
      e.target.value = '';
      const label = collectionLabel(collection);
      if (!window.confirm(`Import ${label} from "${file.name}"?\nThis will overwrite matching records in the live database.\nContinue?`)) return;
      if (collection === 'downtime_submissions') await handleDowntimeCSVImport(file);
      else await handleImport(collection, file);
    });
  });

  // JSON file change
  el.querySelectorAll('.dp-file-json-input').forEach(input => {
    input.addEventListener('change', async e => {
      if (!e.target.files[0]) return;
      const collection = e.target.dataset.collection;
      const file = e.target.files[0];
      e.target.value = '';
      const label = collectionLabel(collection);
      if (!window.confirm(`Import ${label} from "${file.name}"?\nThis will overwrite matching records in the live database.\nContinue?`)) return;
      await handleJsonImport(collection, file);
    });
  });

  // Verify
  el.querySelectorAll('.dp-verify-btn').forEach(btn => {
    btn.addEventListener('click', () => handleVerify(btn.dataset.collection));
  });

}

// ── Shell ─────────────────────────────────────────────────────────────────────

function buildShell() {
  let h = '';

  // Warning banner
  h += `<div class="dp-warning">
    <strong>Warning:</strong> This tab modifies live game data. Importing will overwrite or change records in the database. Always export before importing. Any action here affects all players immediately.
  </div>`;

  // ── Game State section
  // ADMR-3: characters/territories/game_sessions/attendance/chapters/rules
  // retired - TM Admin now has real, working coverage for all six. See
  // specs/stories/admr-3-trim-data-portability.md for the parity table.
  const gameStateCards = [
    { id: 'downtime_submissions', label: 'Downtime Submissions', desc: 'Player downtime submissions. CSV imports player CSV (character matching). JSON imports backup.',        csvImportLabel: 'Import Player CSV', verify: false },
    { id: 'npcs',                 label: 'NPCs',                 desc: 'NPC register entries',                                                                                 verify: true  },
    { id: 'ordeal_rubrics',       label: 'Ordeal Rubrics',       desc: 'Ordeal definitions and rubric templates',                                                              verify: false },
    { id: 'ordeal_submissions',   label: 'Ordeal Submissions',   desc: 'Player ordeal submission records',                                                                     verify: false },
    { id: 'ordeal_responses',     label: 'Ordeal Responses',     desc: 'Player responses for Rules, Lore, and Covenant ordeals',                                               verify: false },
    { id: 'offices',              label: 'Offices',              desc: 'Court positions and office assignments',                         placeholder: 'Coming soon — court offices are not yet implemented' },
  ];

  h += `<div class="dp-section">
    <div class="dp-section-heading">Game State</div>
    <div class="dp-grid">`;
  for (const c of gameStateCards) h += buildCard(c);
  h += `</div></div>`;

  h += '<div id="dp-result"></div>';
  return h;
}

function buildCard(c) {
  // Placeholder card — no buttons
  if (c.placeholder) {
    return `<div class="dp-card dp-card-placeholder">
      <div class="dp-card-name">${c.label}</div>
      <div class="dp-card-desc">${c.desc}</div>
      <div class="dp-card-desc dp-placeholder-note">${c.placeholder}</div>
    </div>`;
  }

  const csvImportLabel = c.csvImportLabel || 'Import CSV';
  let btns = '';

  // Export CSV
  btns += `<button class="dt-btn dp-export-btn" data-collection="${c.id}">Export CSV</button>`;

  // Import CSV (player CSV for downtime_submissions, normal CSV otherwise)
  btns += `<button class="dt-btn dp-import-btn" data-collection="${c.id}">${csvImportLabel}</button>`;
  btns += `<input type="file" accept=".csv" class="dp-file-input" data-collection="${c.id}" style="display:none">`;

  // Export JSON
  btns += `<button class="dt-btn dp-export-json-btn" data-collection="${c.id}">Export JSON</button>`;

  // Import JSON
  btns += `<button class="dt-btn dp-import-json-btn" data-collection="${c.id}">Import JSON</button>`;
  btns += `<input type="file" accept=".json" class="dp-file-json-input" data-collection="${c.id}" style="display:none">`;

  // Verify (CSV round-trip only for supported collections)
  if (c.verify) {
    btns += `<button class="dt-btn dp-verify-btn" data-collection="${c.id}">Verify</button>`;
  }

  return `<div class="dp-card">
    <div class="dp-card-name">${c.label}</div>
    <div class="dp-card-desc">${c.desc}</div>
    <div class="dp-card-btns">${btns}</div>
  </div>`;
}

// ── CSV Export ────────────────────────────────────────────────────────────────

async function handleExport(collection) {
  try {
    switch (collection) {
      case 'downtime_submissions': await exportCollection('downtime_submissions',    downtimeSubsToRows,         downtimeSubHeaders()); break;
      case 'npcs':                 await exportCollection('npcs',                    npcsToRows,                 npcHeaders()); break;
      case 'ordeal_rubrics':       await exportCollection('ordeal_rubrics',          ordealRubricsToRows,        ordealRubricHeaders()); break;
      case 'ordeal_submissions':   await exportCollection('ordeal_submissions',      ordealSubsToRows,           ordealSubHeaders()); break;
      case 'ordeal_responses':     await exportCollection('ordeal-responses',        ordealResponsesToRows,      ordealResponseHeaders()); break;
    }
  } catch (err) { alert(`Export failed: ${err.message}`); }
}

async function exportCollection(apiPath, toRows, headers) {
  const docs = await apiGet(`/api/${apiPath}`);
  if (!docs.length) { alert('No data to export.'); return; }
  triggerDownload(buildCSV(headers, toRows(docs)), apiPath);
}

// ── JSON Export ───────────────────────────────────────────────────────────────

async function handleExportJson(collection) {
  try {
    const apiPath = collectionApiPath(collection);
    const docs = await apiGet(`/api/${apiPath}`);
    const name = collection;
    if (!docs || !docs.length) { alert('No records found for the selected filter.'); return; }
    triggerJsonDownload(JSON.stringify(docs, null, 2), name);
  } catch (err) { alert(`JSON export failed: ${err.message}`); }
}

function collectionApiPath(collection) {
  const MAP = {
    downtime_submissions: 'downtime_submissions',
    npcs:                 'npcs',
    ordeal_rubrics:       'ordeal_rubrics',
    ordeal_submissions:   'ordeal_submissions',
    ordeal_responses:     'ordeal-responses',
  };
  return MAP[collection] || collection;
}

// ── CSV Import ────────────────────────────────────────────────────────────────

async function handleImport(collection, file) {
  const resultEl = document.getElementById('dp-result');
  resultEl.innerHTML = '<p class="dp-result-loading">Parsing\u2026</p>';
  try {
    const rawRows = parseCSV(await file.text());
    if (!rawRows.length) { resultEl.innerHTML = '<p class="dp-result-err">No data rows found.</p>'; return; }
    // cm-2b: a CSV exported before the rename carries a `cycle_id` COLUMN.
    // Shaped here, at the writer's own entry point, for the same reason the
    // JSON path shapes it — `npcs`' `linked_cycle_id` is a different key and is
    // untouched by this. (The two collections that could carry the column,
    // `chapters` and `downtime_submissions`, have no `writeRow` case of their
    // own: chapters CSV import is rejected as an unknown collection, and the
    // downtime submissions CSV is the PLAYER form export, handled by
    // `handleDowntimeCSVImport` -> `upsertCycle`, which builds `chapter_id`
    // itself from the live Chapter. This is defence at the boundary, not a
    // live path today.)
    const rows = rawRows.map(shapeLegacyChapterFk);
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

async function handleDowntimeCSVImport(file) {
  const resultEl = document.getElementById('dp-result');
  resultEl.innerHTML = '<p class="dp-result-loading">Importing downtime CSV\u2026</p>';
  try {
    const { created, updated, unmatched, warnings } = await processDowntimeCsvFile(file);
    const total = created + updated;
    let h = '<div class="dp-result-box">';
    h += `<div class="dp-result-summary"><span class="dp-stat">${total} processed</span>`;
    h += `<span class="dp-stat dp-stat-ok">${created} created, ${updated} updated</span>`;
    if (unmatched) h += `<span class="dp-stat dp-stat-err">${unmatched} unmatched</span>`;
    h += '</div>';
    if (warnings.length) {
      h += '<ul class="dp-error-list">';
      for (const w of warnings) h += `<li>${w}</li>`;
      h += '</ul>';
    } else {
      h += '<p class="dp-result-ok">All submissions imported successfully.</p>';
    }
    h += '</div>';
    resultEl.innerHTML = h;
  } catch (err) {
    resultEl.innerHTML = `<p class="dp-result-err">Downtime CSV import failed: ${err.message}</p>`;
  }
}

// ── JSON Import ───────────────────────────────────────────────────────────────

async function handleJsonImport(collection, file) {
  const resultEl = document.getElementById('dp-result');
  resultEl.innerHTML = '<p class="dp-result-loading">Parsing JSON\u2026</p>';
  try {
    let docs;
    try { docs = JSON.parse(await file.text()); }
    catch { resultEl.innerHTML = '<p class="dp-result-err">Invalid JSON file.</p>'; return; }
    if (!Array.isArray(docs)) { resultEl.innerHTML = '<p class="dp-result-err">Expected a JSON array.</p>'; return; }
    if (!docs.length) { resultEl.innerHTML = '<p class="dp-result-err">No documents in array.</p>'; return; }

    let written = 0, rejected = 0;
    const errors = [];
    for (let i = 0; i < docs.length; i++) {
      try { await writeJsonDoc(collection, docs[i]); written++; }
      catch (e) { rejected++; errors.push({ row: i + 1, error: e.message }); }
    }
    renderResult(resultEl, docs.length, written, rejected, errors);
  } catch (err) {
    resultEl.innerHTML = `<p class="dp-result-err">JSON import failed: ${err.message}</p>`;
  }
}

/**
 * cm-2b: shape a restored document's legacy Chapter FK.
 *
 * A backup taken before cm-2b carries `cycle_id`. Restoring it verbatim would
 * either 400 (the submissions routes now reject the legacy key outright — see
 * `server/helpers/chapter-fk.js`) or, before that guard existed, silently
 * re-create `cycle_id`-only documents in bulk: invisible to every list,
 * hold-flag, publish and delete-orphan guard.
 *
 * Fixed at the WRITER, per this project's own Lesson #105 — drop the legacy
 * keys at the writer rather than gate them on the schema. `chapter_id` already
 * present wins; the legacy key is dropped either way.
 *
 * Exported for direct test drive (the oxp.5 convention).
 */
export function shapeLegacyChapterFk(body) {
  if (!body || typeof body !== 'object') return body;
  if (!Object.prototype.hasOwnProperty.call(body, 'cycle_id')) return body;
  const out = { ...body };
  if (out.chapter_id === undefined || out.chapter_id === null) out.chapter_id = out.cycle_id;
  delete out.cycle_id;
  return out;
}

// Exported for direct test drive (the oxp.5 convention: functions whose logic
// matters are exported and driven, rather than pinned by a source regex).
export async function writeJsonDoc(collection, doc) {
  const id = doc._id ? String(doc._id) : null;
  const body = { ...doc };
  delete body._id;

  switch (collection) {
    case 'downtime_submissions': {
      // cm-2b: `cycle_id` -> `chapter_id` on restore. See shapeLegacyChapterFk.
      const subBody = shapeLegacyChapterFk(body);
      if (id) return apiPut(`/api/downtime_submissions/${id}`, subBody);
      return apiPost('/api/downtime_submissions', subBody);
    }

    case 'npcs':
      if (id) return apiPut(`/api/npcs/${id}`, body);
      return apiPost('/api/npcs', doc);

    case 'ordeal_rubrics':
      if (!id) throw new Error('Ordeal rubric doc missing _id — update-only collection');
      return apiPut(`/api/ordeal_rubrics/${id}`, body);

    case 'ordeal_submissions':
      if (!id) throw new Error('Ordeal submission doc missing _id — update-only collection');
      return apiPut(`/api/ordeal_submissions/${id}`, body);

    case 'ordeal_responses':
      if (id) return apiPut(`/api/ordeal-responses/${id}`, body);
      return apiPost('/api/ordeal-responses', doc);

    default:
      throw new Error(`Unknown collection: ${collection}`);
  }
}

// ── Round-Trip Verification ───────────────────────────────────────────────────

const COLLECTION_API = {
  npcs:           'npcs',
};

const COLLECTION_ROWS = {
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

// ── Result renderer ───────────────────────────────────────────────────────────

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

function triggerJsonDownload(json, name) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `TM_${name}_${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Downtime Submissions ──────────────────────────────────────────────────────

function downtimeSubHeaders() {
  return ['_id', 'chapter_id', 'character_id', 'character_name', 'status', 'submitted_at', 'approval_status'];
}
function downtimeSubsToRows(docs) {
  return docs.map(d => [String(d._id),
    d.chapter_id != null ? String(d.chapter_id) : '',
    d.character_id != null ? String(d.character_id) : '',
    d.character_name || '',
    d.status || '',
    d.submitted_at || '',
    d.approval_status || '']);
}

// ── NPCs ──────────────────────────────────────────────────────────────────────

function npcHeaders() {
  return ['_id', 'name', 'description', 'status', 'linked_cycle_id', 'linked_character_ids', 'notes', 'created_at'];
}
function npcsToRows(docs) {
  return docs.map(d => [String(d._id), d.name || '', d.description || '', d.status || '',
    d.linked_cycle_id != null ? String(d.linked_cycle_id) : '',
    (d.linked_character_ids || []).join('; '), d.notes || '', d.created_at || '']);
}

// ── Ordeal Rubrics ────────────────────────────────────────────────────────────

function ordealRubricHeaders() {
  return ['_id', 'ordeal_type', 'covenant', 'title', 'description', 'marking_notes'];
}
function ordealRubricsToRows(docs) {
  return docs.map(d => [String(d._id), d.ordeal_type || '', d.covenant || '',
    d.title || '', d.description || '', d.marking_notes || '']);
}

// ── Ordeal Submissions ────────────────────────────────────────────────────────

function ordealSubHeaders() {
  return ['_id', 'ordeal_type', 'character_id', 'player_id', 'covenant', 'submitted_at', 'marking_status', 'xp_awarded'];
}
function ordealSubsToRows(docs) {
  return docs.map(d => [String(d._id), d.ordeal_type || '',
    d.character_id != null ? String(d.character_id) : '',
    d.player_id != null ? String(d.player_id) : '',
    d.covenant || '', d.submitted_at || '',
    d.marking?.status || '', d.marking?.xp_awarded != null ? d.marking.xp_awarded : '']);
}

// ── Ordeal Responses ──────────────────────────────────────────────────────────

function ordealResponseHeaders() {
  return ['_id', 'player_id', 'ordeal_type', 'status', 'created_at', 'submitted_at', 'approved_at'];
}
function ordealResponsesToRows(docs) {
  return docs.map(d => [String(d._id), d.player_id || '', d.ordeal_type || '',
    d.status || '', d.created_at || '', d.submitted_at || '', d.approved_at || '']);
}

