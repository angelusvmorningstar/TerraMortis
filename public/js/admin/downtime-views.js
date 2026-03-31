/**
 * Downtime domain views — admin app.
 * CSV upload, cycle management, submission overview, and character data bridge.
 */

import { apiGet } from '../data/api.js';
import { parseDowntimeCSV } from '../downtime/parser.js';
import { getActiveCycle, getCycles, createCycle, getSubmissionsForCycle, upsertCycle } from '../downtime/db.js';

let submissions = [];
let characters = [];
let charMap = new Map(); // lowercase name → character object
let activeCycle = null;

export async function initDowntimeView() {
  const container = document.getElementById('downtime-content');
  if (!container) return;

  container.innerHTML = buildShell();

  document.getElementById('dt-file-input').addEventListener('change', handleFileSelect);
  document.getElementById('dt-drop-zone').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
  document.getElementById('dt-drop-zone').addEventListener('dragleave', e => { e.currentTarget.classList.remove('drag-over'); });
  document.getElementById('dt-drop-zone').addEventListener('drop', handleDrop);
  document.getElementById('dt-new-cycle').addEventListener('click', handleNewCycle);

  await loadCharacters();
  await loadActiveCycle();
}

function buildShell() {
  return `
    <div class="dt-toolbar">
      <div id="dt-drop-zone" class="dt-drop-zone">
        <span>Drop CSV here or </span>
        <label class="dt-file-label">
          choose file<input type="file" id="dt-file-input" accept=".csv" style="display:none">
        </label>
      </div>
      <button class="dt-btn" id="dt-new-cycle">New Cycle</button>
    </div>
    <div id="dt-cycle-info" class="dt-cycle-info"></div>
    <div id="dt-warnings" class="dt-warnings"></div>
    <div id="dt-match-summary"></div>
    <div id="dt-submissions" class="dt-submissions"></div>`;
}

// ── Character data bridge ───────────────────────────────────────────────────

async function loadCharacters() {
  try {
    characters = await apiGet('/api/characters');
    charMap = new Map(characters.map(c => [(c.name || '').toLowerCase().trim(), c]));
  } catch {
    characters = [];
    charMap = new Map();
  }
}

/** Find a character by submission name (case-insensitive, trimmed). */
export function findCharacter(submissionName) {
  if (!submissionName) return null;
  return charMap.get(submissionName.toLowerCase().trim()) || null;
}

// ── Cycle loading ───────────────────────────────────────────────────────────

async function loadActiveCycle() {
  const infoEl = document.getElementById('dt-cycle-info');
  const subEl = document.getElementById('dt-submissions');

  activeCycle = await getActiveCycle();
  if (!activeCycle) {
    infoEl.innerHTML = '<span class="placeholder">No active cycle. Upload a CSV or create a new cycle.</span>';
    subEl.innerHTML = '';
    document.getElementById('dt-match-summary').innerHTML = '';
    return;
  }

  infoEl.innerHTML = `<span class="dt-cycle-label">${esc(activeCycle.label || 'Active Cycle')}</span>
    <span class="domain-count">${activeCycle.submission_count || 0} submissions</span>`;

  submissions = await getSubmissionsForCycle(activeCycle._id);
  renderMatchSummary();
  renderSubmissions();
}

// ── Match summary ───────────────────────────────────────────────────────────

function renderMatchSummary() {
  const el = document.getElementById('dt-match-summary');
  if (!submissions.length) { el.innerHTML = ''; return; }

  const matched = submissions.filter(s => findCharacter(s.character_name));
  const unmatched = submissions.filter(s => !findCharacter(s.character_name));

  let h = `<div class="dt-match-bar">`;
  h += `<span class="dt-match-ok">${matched.length} matched</span>`;
  if (unmatched.length) {
    h += `<span class="dt-match-warn">${unmatched.length} unmatched: ${unmatched.map(s => esc(s.character_name || '?')).join(', ')}</span>`;
  }
  h += '</div>';
  el.innerHTML = h;
}

// ── Submission rendering ────────────────────────────────────────────────────

function renderSubmissions() {
  const el = document.getElementById('dt-submissions');
  if (!submissions.length) {
    el.innerHTML = '<p class="placeholder">No submissions in this cycle.</p>';
    return;
  }

  const sorted = [...submissions].sort((a, b) => (a.character_name || '').localeCompare(b.character_name || ''));

  el.innerHTML = '<div class="dt-sub-grid">' + sorted.map(s => {
    const raw = s._raw || {};
    const sub = raw.submission || {};
    const projects = (raw.projects || []).length;
    const spheres = (raw.sphere_actions || []).length;
    const feeding = raw.feeding?.method || '';
    const attended = sub.attended_last_game ? '\u2713' : '\u2717';
    const attendedClass = sub.attended_last_game ? 'dt-attended' : 'dt-absent';

    const char = findCharacter(s.character_name);
    const matchIcon = char ? '<span class="dt-match-icon" title="Matched">\u2713</span>' : '<span class="dt-unmatch-icon" title="No matching character">\u26A0</span>';
    const clan = char ? esc(char.clan || '') : '';

    return `<div class="dt-sub-card${char ? '' : ' dt-sub-unmatched'}">
      <div class="dt-sub-top">
        ${matchIcon}
        <span class="dt-sub-name">${esc(s.character_name || '?')}</span>
        <span class="dt-sub-player">${esc(s.player_name || '')}</span>
        <span class="${attendedClass}">${attended}</span>
      </div>
      <div class="dt-sub-stats">
        ${clan ? `<span class="dt-sub-tag">${clan}</span>` : ''}
        ${projects ? `<span class="dt-sub-tag">${projects} project${projects > 1 ? 's' : ''}</span>` : ''}
        ${spheres ? `<span class="dt-sub-tag">${spheres} sphere</span>` : ''}
        ${feeding ? `<span class="dt-sub-tag">${esc(feeding)}</span>` : ''}
      </div>
    </div>`;
  }).join('') + '</div>';
}

// ── File handling ───────────────────────────────────────────────────────────

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) processFile(file);
}

async function processFile(file) {
  const warnEl = document.getElementById('dt-warnings');
  warnEl.innerHTML = '';

  const text = await file.text();
  const { submissions: parsed, warnings } = parseDowntimeCSV(text);

  if (warnings.length) {
    warnEl.innerHTML = warnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('');
  }

  if (!parsed.length) {
    warnEl.innerHTML += '<div class="dt-warn">No submissions found in CSV.</div>';
    return;
  }

  const result = await upsertCycle(parsed, file.name.replace('.csv', ''));
  warnEl.innerHTML = `<div class="dt-success">Loaded ${result.created} new, ${result.updated} updated submissions.</div>`;

  await loadActiveCycle();
}

async function handleNewCycle() {
  const label = prompt('Cycle label (e.g. "March 2026"):');
  if (!label) return;
  await createCycle(label);
  await loadActiveCycle();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
