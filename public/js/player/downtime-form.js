/* Downtime submission form — character-aware, section-gated, auto-saving.
 * Uses existing /api/downtime_submissions API.
 * Lifecycle: draft → submitted (player can edit until deadline) */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { DOWNTIME_SECTIONS, DOWNTIME_GATES } from './downtime-data.js';
import { getRole } from '../auth/discord.js';

let responseDoc = null;
let currentChar = null;
let currentCycle = null;
let gateValues = {};
let saveTimer = null;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 2000);
}

function collectResponses() {
  const responses = {};

  // Collect gate values
  for (const gate of DOWNTIME_GATES) {
    const checked = document.querySelector(`input[name="gate-${gate.key}"]:checked`);
    responses[`_gate_${gate.key}`] = checked ? checked.value : '';
  }

  // Collect section responses
  for (const section of DOWNTIME_SECTIONS) {
    // Skip gated sections that are hidden
    if (section.gate && gateValues[section.gate] !== 'yes') continue;

    for (const q of section.questions) {
      const el = document.getElementById('dt-' + q.key);
      if (!el) continue;
      if (q.type === 'radio') {
        const checked = document.querySelector(`input[name="dt-${q.key}"]:checked`);
        responses[q.key] = checked ? checked.value : '';
      } else {
        responses[q.key] = el.value;
      }
    }
  }
  return responses;
}

async function saveDraft() {
  const responses = collectResponses();
  const statusEl = document.getElementById('dt-save-status');

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/downtime_submissions', {
        character_id: currentChar._id,
        cycle_id: currentCycle?._id || null,
        status: 'draft',
        responses,
      });
    } else {
      responseDoc = await apiPut(`/api/downtime_submissions/${responseDoc._id}`, { responses });
    }
    if (statusEl) statusEl.textContent = 'Saved';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

async function submitForm() {
  const responses = collectResponses();

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/downtime_submissions', {
        character_id: currentChar._id,
        cycle_id: currentCycle?._id || null,
        status: 'submitted',
        responses,
        submitted_at: new Date().toISOString(),
      });
    } else {
      responseDoc = await apiPut(`/api/downtime_submissions/${responseDoc._id}`, {
        responses,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      });
    }
    renderForm(document.getElementById('dt-container'));
  } catch (err) {
    const statusEl = document.getElementById('dt-save-status');
    if (statusEl) statusEl.textContent = 'Submit failed: ' + err.message;
  }
}

export async function renderDowntimeTab(targetEl, char) {
  currentChar = char;
  responseDoc = null;
  currentCycle = null;
  gateValues = {};

  // Load current cycle
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    // Find the most recent open cycle
    currentCycle = cycles
      .filter(c => c.status === 'open' || c.status === 'active')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
      || cycles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
      || null;
  } catch { /* no cycles */ }

  // Load existing submission for this character + cycle
  if (currentCycle) {
    try {
      const subs = await apiGet(`/api/downtime_submissions?cycle_id=${currentCycle._id}`);
      responseDoc = subs.find(s =>
        s.character_id === currentChar._id || s.character_id?.toString() === currentChar._id?.toString()
      ) || null;
    } catch { /* no submission */ }
  }

  // Restore gate values from saved responses
  if (responseDoc?.responses) {
    for (const gate of DOWNTIME_GATES) {
      gateValues[gate.key] = responseDoc.responses[`_gate_${gate.key}`] || '';
    }
  }

  targetEl.innerHTML = `<div id="dt-container" class="reading-pane"></div>`;
  renderForm(document.getElementById('dt-container'));
}

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const status = responseDoc?.status || 'new';
  const role = getRole();
  const isST = role === 'st';
  const isSubmitted = status === 'submitted';

  let h = '';

  // Header
  h += '<div class="qf-header">';
  h += `<h3 class="qf-title">Downtime Submission</h3>`;
  if (currentCycle) {
    h += `<p class="qf-section-intro">${esc(currentCycle.label || currentCycle.title || 'Current Cycle')}</p>`;
  }
  h += '<div class="qf-meta">';
  if (isSubmitted) {
    h += '<span class="qf-badge qf-badge-submitted">Submitted</span>';
  } else if (status === 'draft') {
    h += '<span class="qf-badge qf-badge-draft">Draft</span>';
  } else {
    h += '<span class="qf-badge qf-badge-draft">Not Started</span>';
  }
  h += '<span id="dt-save-status" class="qf-save-status"></span>';
  h += '</div>';
  h += '<p class="qf-intro">Your responses auto-save as you type. Use the gate questions to show/hide sections relevant to your character.</p>';
  h += '</div>';

  // Gate questions (always shown at the top)
  h += '<div class="qf-section">';
  h += '<h4 class="qf-section-title">Section Gates</h4>';
  h += '<p class="qf-section-intro">Answer these to show the relevant sections below.</p>';
  for (const gate of DOWNTIME_GATES) {
    const val = gateValues[gate.key] || saved[`_gate_${gate.key}`] || '';
    h += `<div class="qf-field">`;
    h += `<label class="qf-label">${esc(gate.label)}</label>`;
    h += `<div class="qf-radio-group">`;
    for (const opt of gate.options) {
      const checked = val === opt.value ? ' checked' : '';
      h += `<label class="qf-radio-label">`;
      h += `<input type="radio" name="gate-${gate.key}" value="${esc(opt.value)}"${checked} data-gate="${gate.key}">`;
      h += `<span>${esc(opt.label)}</span>`;
      h += `</label>`;
    }
    h += '</div></div>';
  }
  h += '</div>';

  // Content sections
  for (const section of DOWNTIME_SECTIONS) {
    const isGated = section.gate && gateValues[section.gate] !== 'yes';
    const sectionClass = isGated ? 'qf-section dt-gated-hidden' : 'qf-section';

    h += `<div class="${sectionClass}" data-gate-section="${section.gate || ''}">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}</h4>`;
    if (section.intro) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }

    for (const q of section.questions) {
      const val = saved[q.key] || '';
      h += renderQuestion(q, val);
    }
    h += '</div>';
  }

  // Actions
  h += '<div class="qf-actions">';
  h += '<button class="qf-btn qf-btn-save" id="dt-btn-save">Save Draft</button>';
  h += '<button class="qf-btn qf-btn-submit" id="dt-btn-submit">Submit Downtime</button>';
  h += '</div>';

  container.innerHTML = h;

  // Wire events
  container.addEventListener('input', scheduleSave);
  container.addEventListener('change', (e) => {
    // Handle gate changes — show/hide sections
    const gateInput = e.target.closest('[data-gate]');
    if (gateInput) {
      gateValues[gateInput.dataset.gate] = gateInput.value;
      updateGatedSections(container);
    }
    scheduleSave();
  });

  document.getElementById('dt-btn-save')?.addEventListener('click', saveDraft);
  document.getElementById('dt-btn-submit')?.addEventListener('click', submitForm);
}

function updateGatedSections(container) {
  container.querySelectorAll('[data-gate-section]').forEach(section => {
    const gate = section.dataset.gateSection;
    if (!gate) return;
    if (gateValues[gate] === 'yes') {
      section.classList.remove('dt-gated-hidden');
    } else {
      section.classList.add('dt-gated-hidden');
    }
  });
}

function renderQuestion(q, value) {
  const reqMark = q.required ? ' <span class="qf-req">*</span>' : '';
  let h = `<div class="qf-field">`;
  h += `<label class="qf-label" for="dt-${q.key}">${esc(q.label)}${reqMark}</label>`;

  if (q.desc) {
    h += `<p class="qf-desc">${esc(q.desc)}</p>`;
  }

  switch (q.type) {
    case 'text':
      h += `<input type="text" id="dt-${q.key}" class="qf-input" value="${esc(value)}">`;
      break;

    case 'textarea':
      h += `<textarea id="dt-${q.key}" class="qf-textarea" rows="${q.rows || 4}">${esc(value)}</textarea>`;
      break;

    case 'select':
      h += `<select id="dt-${q.key}" class="qf-select">`;
      for (const opt of q.options) {
        const sel = value === String(opt.value) ? ' selected' : '';
        h += `<option value="${esc(String(opt.value))}"${sel}>${esc(opt.label)}</option>`;
      }
      h += '</select>';
      break;

    case 'radio':
      h += `<div class="qf-radio-group" id="dt-${q.key}">`;
      for (const opt of q.options) {
        const checked = value === opt.value ? ' checked' : '';
        h += `<label class="qf-radio-label">`;
        h += `<input type="radio" name="dt-${q.key}" value="${esc(opt.value)}"${checked}>`;
        h += `<span>${esc(opt.label)}</span>`;
        h += `</label>`;
      }
      h += '</div>';
      break;
  }

  h += '</div>';
  return h;
}
