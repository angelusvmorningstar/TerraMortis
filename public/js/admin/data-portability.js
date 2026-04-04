/**
 * Data Portability — DP-1: CSV export for all collections.
 */

import { apiGet } from '../data/api.js';
import { downloadCSV as downloadCharCSV } from '../editor/export.js';
import { esc } from '../data/helpers.js';

let chars = [];

export function initDataPortabilityView(charData) {
  chars = charData || [];
  const el = document.getElementById('data-portability-content');
  if (!el) return;
  el.innerHTML = buildShell();
  el.querySelectorAll('.dp-export-btn').forEach(btn => {
    btn.addEventListener('click', () => handleExport(btn.dataset.collection));
  });
}

function buildShell() {
  const collections = [
    { id: 'characters',    label: 'Characters',    desc: 'Full character sheets (Affinity Publisher merge format)' },
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
    h += `<button class="dt-btn dp-export-btn" data-collection="${c.id}">Export CSV</button>`;
    h += `</div>`;
  }
  h += '</div>';
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
