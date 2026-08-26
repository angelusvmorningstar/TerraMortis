/**
 * Data Portability — DP-2: per-collection validators, writers, and CSV parser.
 */

import { apiPost, apiPut } from '../data/api.js';

// ── Per-collection validators ─────────────────────────────────────────────────

const VALID_OID = /^[0-9a-f]{24}$/i;

export function validateRow(collection, row) {
  switch (collection) {
    case 'npcs':           return validateNpcRow(row);
    default: return 'Unknown collection';
  }
}

function validateNpcRow(r) {
  if (!r.name) return 'name is required';
  if (r._id && !VALID_OID.test(r._id)) return `_id "${r._id}" is not a valid ObjectId`;
  if (r.status && !['active', 'resolved', 'archived'].includes(r.status)) return 'status must be active, resolved, or archived';
  return null;
}

// ── Per-collection writers ────────────────────────────────────────────────────

export async function writeRow(collection, row) {
  switch (collection) {
    case 'npcs':           return writeNpcRow(row);
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
