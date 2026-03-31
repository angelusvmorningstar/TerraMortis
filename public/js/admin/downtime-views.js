/**
 * Downtime domain views — admin app.
 * CSV upload, cycle management, and submission overview.
 */

import { parseDowntimeCSV } from '../downtime/parser.js';
import { getActiveCycle, getCycles, createCycle, getSubmissionsForCycle, upsertCycle } from '../downtime/db.js';

let submissions = [];
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
    <div id="dt-submissions" class="dt-submissions"></div>`;
}

async function loadActiveCycle() {
  const infoEl = document.getElementById('dt-cycle-info');
  const subEl = document.getElementById('dt-submissions');

  activeCycle = await getActiveCycle();
  if (!activeCycle) {
    infoEl.innerHTML = '<span class="placeholder">No active cycle. Upload a CSV or create a new cycle.</span>';
    subEl.innerHTML = '';
    return;
  }

  infoEl.innerHTML = `<span class="dt-cycle-label">${esc(activeCycle.label || 'Active Cycle')}</span>
    <span class="domain-count">${activeCycle.submission_count || 0} submissions</span>`;

  submissions = await getSubmissionsForCycle(activeCycle._id);
  renderSubmissions();
}

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

    return `<div class="dt-sub-card">
      <div class="dt-sub-top">
        <span class="dt-sub-name">${esc(s.character_name || '?')}</span>
        <span class="dt-sub-player">${esc(s.player_name || '')}</span>
        <span class="${attendedClass}">${attended}</span>
      </div>
      <div class="dt-sub-stats">
        ${projects ? `<span class="dt-sub-tag">${projects} project${projects > 1 ? 's' : ''}</span>` : ''}
        ${spheres ? `<span class="dt-sub-tag">${spheres} sphere</span>` : ''}
        ${feeding ? `<span class="dt-sub-tag">${esc(feeding)}</span>` : ''}
      </div>
    </div>`;
  }).join('') + '</div>';
}

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
