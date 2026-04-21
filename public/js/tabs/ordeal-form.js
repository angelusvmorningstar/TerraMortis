/* Generic ordeal form — renders Rules, Lore, or Covenant ordeals.
 * These are player-level ordeals (not character-specific).
 * Same lifecycle as questionnaire: draft → submitted → approved (locked). */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc } from '../data/helpers.js';
import { isSTRole } from '../auth/discord.js';

let responseDoc = null;
let currentType = null;
let currentSections = null;
let currentTitle = null;
let saveTimer = null;
let editing = false;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 2000);
}

function collectResponses() {
  const responses = {};
  for (const section of currentSections) {
    for (const q of section.questions) {
      const el = document.getElementById('o-' + q.key);
      if (!el) continue;
      if (q.type === 'radio') {
        const checked = document.querySelector(`input[name="o-${q.key}"]:checked`);
        responses[q.key] = checked ? checked.value : '';
      } else {
        responses[q.key] = el.value;
      }
    }
  }
  return responses;
}

async function saveDraft() {
  if (!editing) return;
  const responses = collectResponses();
  const statusEl = document.getElementById('of-save-status');

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/ordeal-responses', {
        type: currentType,
        responses,
      });
    } else {
      responseDoc = await apiPut(`/api/ordeal-responses/${responseDoc._id}`, { responses });
    }
    if (statusEl) statusEl.textContent = 'Saved';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

async function submitForm() {
  const responses = collectResponses();

  const missing = [];
  for (const section of currentSections) {
    for (const q of section.questions) {
      if (!q.required) continue;
      if (!responses[q.key]?.trim()) missing.push(q.label);
    }
  }

  if (missing.length) {
    const statusEl = document.getElementById('of-save-status');
    if (statusEl) statusEl.textContent = `Missing required fields (${missing.length})`;
    return;
  }

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/ordeal-responses', {
        type: currentType,
        responses,
      });
    }
    responseDoc = await apiPut(`/api/ordeal-responses/${responseDoc._id}`, {
      responses,
      status: 'submitted',
    });
    editing = false;
    renderForm(document.getElementById('of-container'));
  } catch (err) {
    const statusEl = document.getElementById('of-save-status');
    if (statusEl) statusEl.textContent = 'Submit failed: ' + err.message;
  }
}

/**
 * @param {HTMLElement} targetEl
 * @param {string} type — 'rules', 'lore', or 'covenant'
 * @param {string} title — display title
 * @param {Array} sections — question sections to render
 */
export async function renderOrdealForm(targetEl, type, title, sections) {
  currentType = type;
  currentTitle = title;
  currentSections = sections;
  responseDoc = null;

  try {
    responseDoc = await apiGet(`/api/ordeal-responses?type=${type}`);
  } catch { /* no response */ }

  const status = responseDoc?.status || 'new';
  editing = (status === 'new' || status === 'draft');

  targetEl.innerHTML = `<div id="of-container" class="reading-pane"></div>`;
  renderForm(document.getElementById('of-container'));
}

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const status = responseDoc?.status || 'new';
  const isST = isSTRole();
  const isApproved = status === 'approved';
  const isSubmitted = status === 'submitted';
  const readOnly = !editing;

  let h = '';

  // Header
  h += '<div class="qf-header">';
  h += `<h3 class="qf-title">${esc(currentTitle)}</h3>`;
  h += '<div class="qf-meta">';
  if (isApproved) {
    h += '<span class="qf-badge qf-badge-approved">Approved</span>';
  } else if (isSubmitted) {
    h += '<span class="qf-badge qf-badge-submitted">Submitted</span>';
  } else if (status === 'draft') {
    h += '<span class="qf-badge qf-badge-draft">Draft</span>';
  } else {
    h += '<span class="qf-badge qf-badge-draft">Not Started</span>';
  }
  h += '<span id="of-save-status" class="qf-save-status"></span>';
  h += '</div>';

  if (editing) {
    h += '<p class="qf-intro">Your responses auto-save as you type. Bonus questions are optional.</p>';
  } else if (isApproved) {
    h += '<p class="qf-intro">This ordeal has been approved and is locked. +3 XP awarded.</p>';
  } else if (isSubmitted) {
    h += '<p class="qf-intro">Your responses have been submitted for review.</p>';
  }
  h += '</div>';

  // Sections
  for (const section of currentSections) {
    h += '<div class="qf-section">';
    h += `<h4 class="qf-section-title">${esc(section.title)}</h4>`;
    if (section.intro && editing) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }

    for (const q of section.questions) {
      if (readOnly) {
        const val = saved[q.key] || '';
        if (!val) continue;
        h += `<div class="qf-field">`;
        h += `<label class="qf-label">${esc(q.label)}</label>`;
        h += `<div class="qf-readonly-value">${esc(val)}</div>`;
        h += '</div>';
      } else {
        h += renderQuestion(q, saved[q.key] || '');
      }
    }
    h += '</div>';
  }

  // Actions
  h += '<div class="qf-actions">';
  if (editing) {
    h += '<button class="qf-btn qf-btn-save" id="of-btn-save">Save Draft</button>';
    h += '<button class="qf-btn qf-btn-submit" id="of-btn-submit">Submit</button>';
  } else if (isApproved && isST) {
    h += '<button class="qf-btn qf-btn-edit" id="of-btn-edit">Edit (ST)</button>';
  } else if (isSubmitted) {
    h += '<button class="qf-btn qf-btn-edit" id="of-btn-edit">Edit Responses</button>';
  }
  if (isSubmitted && isST) {
    h += '<button class="qf-btn qf-btn-approve" id="of-btn-approve">Approve Ordeal</button>';
  }
  h += '</div>';

  container.innerHTML = h;

  if (editing) {
    container.addEventListener('input', scheduleSave);
    container.addEventListener('change', scheduleSave);
  }

  const btnSave = document.getElementById('of-btn-save');
  if (btnSave) btnSave.addEventListener('click', saveDraft);

  const btnSubmit = document.getElementById('of-btn-submit');
  if (btnSubmit) btnSubmit.addEventListener('click', submitForm);

  const btnEdit = document.getElementById('of-btn-edit');
  if (btnEdit) btnEdit.addEventListener('click', () => {
    editing = true;
    renderForm(container);
  });

  const btnApprove = document.getElementById('of-btn-approve');
  if (btnApprove) btnApprove.addEventListener('click', async () => {
    try {
      responseDoc = await apiPut(`/api/ordeal-responses/${responseDoc._id}`, { status: 'approved' });
      editing = false;
      renderForm(container);
    } catch (err) {
      const statusEl = document.getElementById('of-save-status');
      if (statusEl) statusEl.textContent = 'Approve failed: ' + err.message;
    }
  });
}

function renderQuestion(q, value) {
  const reqMark = q.required ? ' <span class="qf-req">*</span>' : '';
  let h = `<div class="qf-field">`;
  h += `<label class="qf-label" for="o-${q.key}">${esc(q.label)}${reqMark}</label>`;

  if (q.desc) {
    h += `<p class="qf-desc">${esc(q.desc)}</p>`;
  }

  switch (q.type) {
    case 'text':
      h += `<input type="text" id="o-${q.key}" class="qf-input" value="${esc(value)}">`;
      break;

    case 'textarea':
      h += `<textarea id="o-${q.key}" class="qf-textarea" rows="${q.rows || 4}">${esc(value)}</textarea>`;
      break;

    case 'radio':
      h += `<div class="qf-radio-group" id="o-${q.key}">`;
      for (const opt of q.options) {
        const checked = value === opt.value ? ' checked' : '';
        h += `<label class="qf-radio-label">`;
        h += `<input type="radio" name="o-${q.key}" value="${esc(opt.value)}"${checked}>`;
        h += `<span>${esc(opt.label)}</span>`;
        h += `</label>`;
      }
      h += '</div>';
      break;

    case 'select':
      h += `<select id="o-${q.key}" class="qf-select">`;
      h += `<option value="">— Select —</option>`;
      for (const opt of q.options) {
        const sel = value === opt.value ? ' selected' : '';
        h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
      }
      h += '</select>';
      break;
  }

  h += '</div>';
  return h;
}
