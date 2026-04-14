/**
 * Data Portability — DP-1 (export), DP-2 (import), DP-3 (verify).
 * Validators, writers, and CSV parser are in data-portability-import.js.
 */

import { apiGet, apiPut, apiPost } from '../data/api.js';
import { downloadCSV as downloadCharCSV } from '../editor/export.js';
import { validateRow, writeRow, parseCSV } from './data-portability-import.js';
import { parseExcelWorkbook } from './excel-parser.js';
import { mergeExcelOntoCharacter } from './excel-merge.js';
import { processDowntimeCsvFile } from './downtime-views.js';

let chars = [];

// ── Label map ─────────────────────────────────────────────────────────────────

const COLLECTION_LABELS = {
  characters:           'Characters',
  territories:          'Territories',
  game_sessions:        'Game Sessions',
  attendance:           'Attendance',
  downtime_cycles:      'Downtime Cycles',
  downtime_submissions: 'Downtime Submissions',
  investigations:       'Investigations',
  npcs:                 'NPCs',
  ordeal_rubrics:       'Ordeal Rubrics',
  ordeal_submissions:   'Ordeal Submissions',
  ordeal_responses:     'Ordeal Responses',
  rules:                'Purchasable Powers',
};

function collectionLabel(id) {
  return COLLECTION_LABELS[id] || id;
}

// ── Init ──────────────────────────────────────────────────────────────────────

export function initDataPortabilityView(charData) {
  chars = charData || [];
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
      if (collection === 'characters') await handleExcelImport(file);
      else if (collection === 'downtime_submissions') await handleDowntimeCSVImport(file);
      else if (collection === 'rules') await handleRulesCSVImport(file);
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
  const gameStateCards = [
    { id: 'characters',           label: 'Characters',           desc: 'Full character sheets (Excel merge format)',                     excelImport: true,                   verify: false },
    { id: 'territories',          label: 'Territories',          desc: 'Territory ambience, regents, feeding rights',                                                         verify: true  },
    { id: 'game_sessions',        label: 'Game Sessions',        desc: 'Session dates and game numbers',                                                                       verify: true  },
    { id: 'attendance',           label: 'Attendance',           desc: 'Per-character attendance per session (expanded rows)',                                                  verify: true  },
    { id: 'downtime_cycles',      label: 'Downtime Cycles',      desc: 'Downtime cycle definitions and status',                                                                verify: false },
    { id: 'downtime_submissions', label: 'Downtime Submissions', desc: 'Player downtime submissions. CSV imports player CSV (character matching). JSON imports backup.',        csvImportLabel: 'Import Player CSV', verify: false },
    { id: 'investigations',       label: 'Investigations',       desc: 'Downtime investigation tracker entries',                                                               verify: true  },
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

  // ── Rules Data section
  h += `<div class="dp-section">
    <div class="dp-section-heading">Rules Data</div>
    <div class="dp-grid">`;

  // Purchasable Powers card
  h += `<div class="dp-card dp-rules-card">
    <div class="dp-card-name">Purchasable Powers</div>
    <div class="dp-card-desc">Merits, disciplines, rites, devotions, and powers stored in MongoDB. Filter by category and parent to export/import a specific subset.</div>
    <div class="dp-rules-filters">
      <select id="dp-rules-category" class="dp-rules-select">
        <option value="">All</option>
        <option value="merit">Merits</option>
        <option value="discipline">Disciplines</option>
        <option value="devotion">Devotions</option>
        <option value="rite">Rites</option>
        <option value="manoeuvre">Manoeuvres</option>
        <option value="attribute">Attributes</option>
        <option value="skill">Skills</option>
      </select>
      <input id="dp-rules-parent" class="dp-rules-parent" type="text" placeholder="Filter by parent (e.g. Cruac)">
    </div>
    <div class="dp-card-btns">
      <button class="dt-btn dp-export-btn" data-collection="rules">Export CSV</button>
      <button class="dt-btn dp-export-json-btn" data-collection="rules">Export JSON</button>
      <button class="dt-btn dp-import-json-btn" data-collection="rules">Import JSON</button>
      <input type="file" accept=".json" class="dp-file-json-input" data-collection="rules" style="display:none">
      <button class="dt-btn dp-import-btn" data-collection="rules">Import CSV</button>
      <input type="file" accept=".csv" class="dp-file-input" data-collection="rules" style="display:none">
    </div>
    <div class="dp-rules-import-note">Import applies to all documents in the file regardless of filter.</div>
  </div>`;

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
  const xlsxOk = typeof window !== 'undefined' && window.XLSX;
  let btns = '';

  // Export CSV
  btns += `<button class="dt-btn dp-export-btn" data-collection="${c.id}">Export CSV</button>`;

  // Import CSV (Excel for characters, player CSV for downtime_submissions, normal CSV otherwise)
  if (c.excelImport) {
    btns += `<button class="dt-btn dp-import-btn" data-collection="${c.id}"${xlsxOk ? '' : ' disabled title="XLSX library not loaded"'}>Import from Excel</button>`;
    btns += `<input type="file" accept=".xlsx" class="dp-file-input" data-collection="${c.id}" style="display:none">`;
  } else {
    btns += `<button class="dt-btn dp-import-btn" data-collection="${c.id}">${csvImportLabel}</button>`;
    btns += `<input type="file" accept=".csv" class="dp-file-input" data-collection="${c.id}" style="display:none">`;
  }

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
      case 'characters':           await exportCharacters(); break;
      case 'territories':          await exportCollection('territories',             territoriesToRows,          territoryHeaders()); break;
      case 'game_sessions':        await exportCollection('game_sessions',           gameSessionsToRows,         gameSessionHeaders()); break;
      case 'attendance':           await exportCollection('game_sessions',           attendanceToRows,           attendanceHeaders()); break;
      case 'downtime_cycles':      await exportCollection('downtime_cycles',         downtimeCyclesToRows,       downtimeCycleHeaders()); break;
      case 'downtime_submissions': await exportCollection('downtime_submissions',    downtimeSubsToRows,         downtimeSubHeaders()); break;
      case 'investigations':       await exportCollection('downtime_investigations', investigationsToRows,       investigationHeaders()); break;
      case 'npcs':                 await exportCollection('npcs',                    npcsToRows,                 npcHeaders()); break;
      case 'ordeal_rubrics':       await exportCollection('ordeal_rubrics',          ordealRubricsToRows,        ordealRubricHeaders()); break;
      case 'ordeal_submissions':   await exportCollection('ordeal_submissions',      ordealSubsToRows,           ordealSubHeaders()); break;
      case 'ordeal_responses':     await exportCollection('ordeal-responses',        ordealResponsesToRows,      ordealResponseHeaders()); break;
      case 'rules':                await exportRulesCSV(); break;
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

async function exportRulesCSV() {
  const { docs, filenameSuffix } = await fetchRulesFiltered();
  if (!docs.length) { alert('No records found for the selected filter.'); return; }
  triggerDownload(buildCSV(rulesHeaders(), rulesToRows(docs)), `rules_${filenameSuffix}`);
}

// ── JSON Export ───────────────────────────────────────────────────────────────

async function handleExportJson(collection) {
  try {
    let docs, name;
    if (collection === 'rules') {
      const filtered = await fetchRulesFiltered();
      docs = filtered.docs;
      name = `rules_${filtered.filenameSuffix}`;
    } else {
      const apiPath = collectionApiPath(collection);
      docs = await apiGet(`/api/${apiPath}`);
      name = collection;
    }
    if (!docs || !docs.length) { alert('No records found for the selected filter.'); return; }
    triggerJsonDownload(JSON.stringify(docs, null, 2), name);
  } catch (err) { alert(`JSON export failed: ${err.message}`); }
}

/** Fetch rules from API with category + parent filters applied.
 *  Returns { docs, filenameSuffix } where filenameSuffix encodes the active filters. */
async function fetchRulesFiltered() {
  const categoryEl = document.getElementById('dp-rules-category');
  const parentEl   = document.getElementById('dp-rules-parent');
  const category   = categoryEl?.value || '';
  const parentFilter = (parentEl?.value || '').trim();

  const url = category ? `/api/rules?category=${encodeURIComponent(category)}` : '/api/rules';
  let docs = await apiGet(url);

  if (parentFilter) {
    const lc = parentFilter.toLowerCase();
    docs = docs.filter(d => d.parent?.toLowerCase().includes(lc));
  }

  const catPart    = category || 'all';
  const parentPart = parentFilter ? '_' + parentFilter.toLowerCase().replace(/\s+/g, '_') : '';
  const filenameSuffix = `${catPart}${parentPart}`;

  return { docs, filenameSuffix };
}


function collectionApiPath(collection) {
  const MAP = {
    characters:           'characters',
    territories:          'territories',
    game_sessions:        'game_sessions',
    attendance:           'game_sessions',
    downtime_cycles:      'downtime_cycles',
    downtime_submissions: 'downtime_submissions',
    investigations:       'downtime_investigations',
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

async function handleRulesCSVImport(file) {
  const resultEl = document.getElementById('dp-result');
  resultEl.innerHTML = '<p class="dp-result-loading">Parsing rules CSV\u2026</p>';
  try {
    const rows = parseCSV(await file.text());
    if (!rows.length) { resultEl.innerHTML = '<p class="dp-result-err">No data rows found.</p>'; return; }

    let written = 0, rejected = 0;
    const errors = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const key = (row.key || '').trim();
      if (!key) { rejected++; errors.push({ row: i + 2, error: 'Missing key' }); continue; }

      const rankRaw = (row.rank || '').trim();
      const rank = rankRaw !== '' ? parseInt(rankRaw, 10) : null;

      const body = {};
      if (row.name        !== undefined) body.name         = row.name.trim()         || null;
      if (row.parent      !== undefined) body.parent       = row.parent.trim()       || null;
      if (row.sub_category !== undefined) body.sub_category = row.sub_category.trim() || null;
      if (row.description !== undefined) body.description  = row.description.trim()  || '';
      body.rank = (rankRaw !== '' && !isNaN(rank)) ? rank : null;

      try {
        try {
          await apiPut(`/api/rules/${encodeURIComponent(key)}`, body);
        } catch (putErr) {
          if (putErr.message === 'Power not found') {
            const category = (row.category || '').trim();
            if (!category) throw new Error('New record missing category');
            await apiPost('/api/rules', { key, category, ...body });
          } else {
            throw putErr;
          }
        }
        written++;
      } catch (e) {
        rejected++;
        errors.push({ row: i + 2, error: e.message });
      }
    }

    renderResult(resultEl, rows.length, written, rejected, errors);
  } catch (err) {
    resultEl.innerHTML = `<p class="dp-result-err">Rules CSV import failed: ${err.message}</p>`;
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

async function writeJsonDoc(collection, doc) {
  const id = doc._id ? String(doc._id) : null;
  const body = { ...doc };
  delete body._id;

  switch (collection) {
    case 'characters':
      if (id) return apiPut(`/api/characters/${id}`, body);
      return apiPost('/api/characters', doc);

    case 'territories': {
      // Territories use a slug `id` field, not MongoDB _id
      const slugId = doc.id || id;
      if (!slugId) throw new Error('Territory doc missing id field');
      try { return await apiPut(`/api/territories/${slugId}`, body); }
      catch { return apiPost('/api/territories', doc); }
    }

    case 'game_sessions':
      if (id) return apiPut(`/api/game_sessions/${id}`, body);
      return apiPost('/api/game_sessions', doc);

    case 'attendance':
      throw new Error('Attendance is nested in game_sessions — import via Game Sessions JSON instead.');

    case 'downtime_cycles':
      if (id) return apiPut(`/api/downtime_cycles/${id}`, body);
      return apiPost('/api/downtime_cycles', body);

    case 'downtime_submissions':
      if (id) return apiPut(`/api/downtime_submissions/${id}`, body);
      return apiPost('/api/downtime_submissions', body);

    case 'investigations':
      if (id) return apiPut(`/api/downtime_investigations/${id}`, body);
      return apiPost('/api/downtime_investigations', doc);

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

    case 'rules': {
      const key = doc.key;
      if (!key) throw new Error('Rules doc missing key field');
      try { return await apiPut(`/api/rules/${key}`, body); }
      catch { return apiPost('/api/rules', doc); }
    }

    default:
      throw new Error(`Unknown collection: ${collection}`);
  }
}

// ── Round-Trip Verification ───────────────────────────────────────────────────

const COLLECTION_API = {
  territories:    'territories',
  game_sessions:  'game_sessions',
  attendance:     'game_sessions',
  investigations: 'downtime_investigations',
  npcs:           'npcs',
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

// ── Territory ─────────────────────────────────────────────────────────────────

function territoryHeaders() {
  return ['id', 'name', 'regent_id', 'regent_name', 'ambience', 'feeding_rights', 'updated_at'];
}
function territoriesToRows(docs) {
  return docs.map(d => [d.id || '', d.name || '', d.regent_id || '', d.regent_name || '',
    d.ambience || '', (d.feeding_rights || []).join('; '), d.updated_at || '']);
}

// ── Game Sessions ─────────────────────────────────────────────────────────────

function gameSessionHeaders() {
  return ['_id', 'session_date', 'game_number', 'attendance_count', 'created_at', 'updated_at'];
}
function gameSessionsToRows(docs) {
  return docs.map(d => [String(d._id), d.session_date || '',
    d.game_number != null ? d.game_number : '', (d.attendance || []).length,
    d.created_at || '', d.updated_at || '']);
}

// ── Attendance ────────────────────────────────────────────────────────────────

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

// ── Downtime Cycles ───────────────────────────────────────────────────────────

function downtimeCycleHeaders() {
  return ['_id', 'label', 'title', 'status', 'game_number', 'deadline_at'];
}
function downtimeCyclesToRows(docs) {
  return docs.map(d => [String(d._id), d.label || '', d.title || '', d.status || '',
    d.game_number != null ? d.game_number : '', d.deadline_at || '']);
}

// ── Downtime Submissions ──────────────────────────────────────────────────────

function downtimeSubHeaders() {
  return ['_id', 'cycle_id', 'character_id', 'character_name', 'status', 'submitted_at', 'approval_status'];
}
function downtimeSubsToRows(docs) {
  return docs.map(d => [String(d._id),
    d.cycle_id != null ? String(d.cycle_id) : '',
    d.character_id != null ? String(d.character_id) : '',
    d.character_name || '',
    d.status || '',
    d.submitted_at || '',
    d.approval_status || '']);
}

// ── Investigations ────────────────────────────────────────────────────────────

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

// ── Rules (Purchasable Powers) ────────────────────────────────────────────────

function rulesHeaders() {
  return ['key', 'name', 'category', 'sub_category', 'parent', 'rank', 'description'];
}
function rulesToRows(docs) {
  return docs.map(d => [d.key || '', d.name || '', d.category || '',
    d.sub_category || '', d.parent || '',
    d.rank != null ? d.rank : '', d.description || '']);
}

// ── Excel Import ──────────────────────────────────────────────────────────────

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

    const existingChars = await apiGet('/api/characters');
    const existingMap = new Map();
    for (const c of existingChars) existingMap.set(c.name, c);

    _importResults = [];
    for (const excel of excelChars) {
      const existing = existingMap.get(excel.name) || null;
      const result = mergeExcelOntoCharacter(existing, excel);
      _importResults.push(result);
      existingMap.delete(excel.name);
    }

    for (const [, c] of existingMap) {
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
  if (newChars.length) h += `<span class="dp-stat" style="color:var(--accent)">${newChars.length} new</span>`;
  h += `<span class="dp-stat">${unchanged.length} unchanged</span>`;
  if (notInExcel.length) h += `<span class="dp-stat">${notInExcel.length} DB only</span>`;
  h += '</div>';

  if (globalWarnings.length) {
    h += '<div class="dp-excel-warnings">' + globalWarnings.map(w => '<div class="dp-excel-warn">\u26A0 ' + _esc(w) + '</div>').join('') + '</div>';
  }

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

    if (r.changes.length || r.warnings.length) {
      h += `<tr class="dp-excel-diff" id="dp-diff-${i}" style="display:none"><td colspan="5"><div class="dp-diff-panel">`;
      if (r.warnings.length) {
        h += '<div class="dp-diff-section"><div class="dp-diff-title">Warnings</div>';
        r.warnings.forEach(w => { h += '<div class="dp-diff-warn">\u26A0 ' + _esc(w) + '</div>'; });
        h += '</div>';
      }
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

  try {
    chars = await apiGet('/api/characters');
    if (typeof window.renderCharGrid === 'function') window.renderCharGrid();
  } catch { /* ignore refresh failure */ }
}
