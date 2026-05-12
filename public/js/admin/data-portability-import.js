/**
 * Data Portability — DP-2: per-collection validators, writers, and CSV parser.
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';

// ── Per-collection validators ─────────────────────────────────────────────────

const VALID_OID = /^[0-9a-f]{24}$/i;
const VALID_DATE = /^\d{4}-\d{2}-\d{2}/;
const BOOL_VALS = new Set(['true', 'false', '1', '0', '']);

export function validateRow(collection, row) {
  switch (collection) {
    case 'territories':    return validateTerritoryRow(row);
    case 'game_sessions':  return validateGameSessionRow(row);
    case 'attendance':     return validateAttendanceRow(row);
    case 'investigations': return validateInvestigationRow(row);
    case 'npcs':           return validateNpcRow(row);
    default: return 'Unknown collection';
  }
}

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
  if (r.attended && !BOOL_VALS.has(r.attended.toLowerCase())) return 'attended must be true or false';
  if (r.extra_xp && isNaN(parseInt(r.extra_xp, 10))) return 'extra_xp must be an integer';
  return null;
}

function validateInvestigationRow(r) {
  if (!r.target_description) return 'target_description is required';
  if (r._id && !VALID_OID.test(r._id)) return `_id "${r._id}" is not a valid ObjectId`;
  if (r.status && !['active', 'resolved'].includes(r.status)) return 'status must be active or resolved';
  if (r.threshold && isNaN(parseInt(r.threshold, 10))) return 'threshold must be an integer';
  if (r.progress && isNaN(parseInt(r.progress, 10))) return 'progress must be an integer';
  return null;
}

function validateNpcRow(r) {
  if (!r.name) return 'name is required';
  if (r._id && !VALID_OID.test(r._id)) return `_id "${r._id}" is not a valid ObjectId`;
  if (r.status && !['active', 'resolved', 'archived'].includes(r.status)) return 'status must be active, resolved, or archived';
  return null;
}

// ── Per-collection writers ────────────────────────────────────────────────────

function parseBool(v) { return v === 'true' || v === '1'; }

export async function writeRow(collection, row) {
  switch (collection) {
    case 'territories':    return writeTerritoryRow(row);
    case 'game_sessions':  return writeGameSessionRow(row);
    case 'attendance':     return writeAttendanceRow(row);
    case 'investigations': return writeInvestigationRow(row);
    case 'npcs':           return writeNpcRow(row);
  }
}

async function writeTerritoryRow(r) {
  // Post-ADR-002: insert (no _id) creates a new doc with a generated _id;
  // slug carries the legacy id value as a label.
  // Issue #33 (2026-05-07): territorySchema is now strict — `regent_name`
  // dropped from the body. It was a derived display cache, never persisted
  // on real territory docs, and is not in the canonical fieldset.
  await apiPost('/api/territories', {
    slug: r.id || undefined,
    name: r.name || undefined,
    regent_id: r.regent_id || undefined,
    ambience: r.ambience || undefined,
    feeding_rights: r.feeding_rights ? r.feeding_rights.split(';').map(s => s.trim()).filter(Boolean) : [],
  });
}

async function writeGameSessionRow(r) {
  const body = {
    session_date: r.session_date,
    game_number: r.game_number ? parseInt(r.game_number, 10) : undefined,
  };
  if (r._id) await apiPut(`/api/game_sessions/${r._id}`, body);
  else await apiPost('/api/game_sessions', body);
}

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
  if (r._id) await apiPut(`/api/downtime_investigations/${r._id}`, body);
  else await apiPost('/api/downtime_investigations', body);
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
  if (r._id) await apiPut(`/api/npcs/${r._id}`, body);
  else await apiPost('/api/npcs', body);
}

// ── CSV parser ────────────────────────────────────────────────────────────────

export function parseCSV(text) {
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
    if (ch === '"') { inQ = !inQ; cur += ch; }
    else if (!inQ && (ch === '\n' || (ch === '\r' && text[i + 1] !== '\n'))) { lines.push(cur); cur = ''; }
    else if (!inQ && ch === '\r') { /* skip \r before \n */ }
    else { cur += ch; }
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
