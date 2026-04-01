/* Questionnaire form — renders questions from data, saves to API, supports draft/submit.
 * Fields that overlap with the character sheet are read-only — the sheet is authoritative.
 *
 * Lifecycle: draft → submitted (read-only, player can edit) → approved (locked, ST only)
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc, displayName, clanIcon, covIcon } from '../data/helpers.js';
import { QUESTIONNAIRE_SECTIONS } from './questionnaire-data.js';
import { getRole } from '../auth/discord.js';

// Maps question keys to icon helper functions
const ICON_FN = { clan: clanIcon, covenant: covIcon };

// Fields where the character sheet is the source of truth.
const SHEET_FIELDS = {
  player_name:    c => c.player || '',
  character_name: c => [c.honorific, c.moniker || c.name].filter(Boolean).join(' '),
  high_concept:   c => c.concept || '',
  clan:           c => c.clan || '',
  covenant:       c => c.covenant || '',
  bloodline:      c => c.bloodline || '',
  mask:           c => c.mask || '',
  dirge:          c => c.dirge || '',
  blood_potency:  c => c.blood_potency != null ? String(c.blood_potency) : '',
  apparent_age:   c => c.apparent_age || '',
};

let responseDoc = null;
let currentChar = null;
let currentCharId = null;
let sheetValues = {};
let saveTimer = null;
let editing = false; // true when actively editing (draft mode or player clicked Edit)

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 2000);
}

function collectResponses() {
  const responses = {};
  for (const section of QUESTIONNAIRE_SECTIONS) {
    for (const q of section.questions) {
      if (SHEET_FIELDS[q.key] && sheetValues[q.key]) {
        responses[q.key] = sheetValues[q.key];
        continue;
      }
      const el = document.getElementById('q-' + q.key);
      if (!el) continue;
      if (q.type === 'radio') {
        const checked = document.querySelector(`input[name="q-${q.key}"]:checked`);
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
  const statusEl = document.getElementById('qf-save-status');

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/questionnaire', {
        character_id: currentCharId,
        responses,
      });
    } else {
      responseDoc = await apiPut(`/api/questionnaire/${responseDoc._id}`, { responses });
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
  for (const section of QUESTIONNAIRE_SECTIONS) {
    for (const q of section.questions) {
      if (!q.required) continue;
      if (SHEET_FIELDS[q.key] && sheetValues[q.key]) continue;
      if (!responses[q.key]?.trim()) missing.push(q.label);
    }
  }

  if (missing.length) {
    const statusEl = document.getElementById('qf-save-status');
    if (statusEl) statusEl.textContent = `Missing required fields: ${missing.join(', ')}`;
    return;
  }

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/questionnaire', {
        character_id: currentCharId,
        responses,
      });
    }
    responseDoc = await apiPut(`/api/questionnaire/${responseDoc._id}`, {
      responses,
      status: 'submitted',
    });
    editing = false;
    renderForm(document.getElementById('qf-container'));
  } catch (err) {
    const statusEl = document.getElementById('qf-save-status');
    if (statusEl) statusEl.textContent = 'Submit failed: ' + err.message;
  }
}

export async function renderQuestionnaire(targetEl, char) {
  currentChar = char;
  currentCharId = char._id;
  responseDoc = null;

  sheetValues = {};
  for (const [key, fn] of Object.entries(SHEET_FIELDS)) {
    sheetValues[key] = fn(char);
  }

  try {
    responseDoc = await apiGet(`/api/questionnaire?character_id=${char._id}`);
  } catch { /* no existing response */ }

  // Auto-populate Discord only for player's own character with no saved response
  autoFill.discord_nickname = '';
  if (!responseDoc) {
    const user = JSON.parse(localStorage.getItem('tm_auth_user') || '{}');
    const ownCharIds = (user.character_ids || []).map(id => String(id));
    if (ownCharIds.includes(String(char._id))) {
      autoFill.discord_nickname = user.username || '';
    }
  }

  // Determine initial editing state
  const status = responseDoc?.status || 'new';
  if (status === 'new' || status === 'draft') {
    editing = true;
  } else {
    editing = false;
  }

  targetEl.innerHTML = `<div id="qf-container"></div>`;
  renderForm(document.getElementById('qf-container'));
}

const autoFill = { discord_nickname: '' };

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const status = responseDoc?.status || 'new';
  const role = getRole();
  const isST = role === 'st';
  const isApproved = status === 'approved';
  const isSubmitted = status === 'submitted';
  const canPlayerEdit = !isApproved; // players can edit draft + submitted, not approved
  const readOnly = !editing;

  let h = '';

  // Form header
  h += '<div class="qf-header">';
  h += '<h3 class="qf-title">Character Questionnaire</h3>';
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
  h += '<span id="qf-save-status" class="qf-save-status"></span>';
  h += '</div>';

  if (editing) {
    h += '<p class="qf-intro">Required questions are marked with <span class="qf-req">*</span>. Your responses auto-save as you type. Complete all optional questions with thoughtful responses to qualify for the 3 XP Ordeal bonus.</p>';
  } else if (isApproved) {
    h += '<p class="qf-intro">This questionnaire has been approved and is locked. +3 XP awarded.</p>';
  } else if (isSubmitted) {
    h += '<p class="qf-intro">Your questionnaire has been submitted for review.</p>';
  }
  h += '</div>';

  // Sections
  for (const section of QUESTIONNAIRE_SECTIONS) {
    h += `<div class="qf-section">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}</h4>`;
    if (section.intro && editing) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }

    for (const q of section.questions) {
      if (SHEET_FIELDS[q.key] && sheetValues[q.key]) {
        h += renderLockedField(q, sheetValues[q.key]);
      } else if (readOnly) {
        const val = saved[q.key] || '';
        h += renderReadOnlyField(q, val);
      } else {
        const val = saved[q.key] || autoFill[q.key] || '';
        h += renderQuestion(q, val);
      }
    }
    h += '</div>';
  }

  // Actions
  h += '<div class="qf-actions">';
  if (editing) {
    h += '<button class="qf-btn qf-btn-save" id="qf-btn-save">Save Draft</button>';
    h += '<button class="qf-btn qf-btn-submit" id="qf-btn-submit">Submit</button>';
  } else if (isApproved && isST) {
    h += '<button class="qf-btn qf-btn-edit" id="qf-btn-edit">Edit (ST)</button>';
  } else if (isSubmitted && canPlayerEdit) {
    h += '<button class="qf-btn qf-btn-edit" id="qf-btn-edit">Edit Responses</button>';
  }
  if (isSubmitted && isST) {
    h += '<button class="qf-btn qf-btn-approve" id="qf-btn-approve">Approve Ordeal</button>';
  }
  h += '</div>';

  container.innerHTML = h;

  // Wire events
  if (editing) {
    container.addEventListener('input', scheduleSave);
    container.addEventListener('change', scheduleSave);
  }

  const btnSave = document.getElementById('qf-btn-save');
  if (btnSave) btnSave.addEventListener('click', saveDraft);

  const btnSubmit = document.getElementById('qf-btn-submit');
  if (btnSubmit) btnSubmit.addEventListener('click', submitForm);

  const btnEdit = document.getElementById('qf-btn-edit');
  if (btnEdit) btnEdit.addEventListener('click', () => {
    editing = true;
    renderForm(container);
  });

  const btnApprove = document.getElementById('qf-btn-approve');
  if (btnApprove) btnApprove.addEventListener('click', async () => {
    try {
      responseDoc = await apiPut(`/api/questionnaire/${responseDoc._id}`, { status: 'approved' });
      editing = false;
      renderForm(container);
    } catch (err) {
      const statusEl = document.getElementById('qf-save-status');
      if (statusEl) statusEl.textContent = 'Approve failed: ' + err.message;
    }
  });
}

// Render a field locked to the character sheet value
function renderLockedField(q, value) {
  const iconFn = ICON_FN[q.key];
  const icon = iconFn ? iconFn(value, 18) : '';

  let h = `<div class="qf-field qf-field-locked">`;
  h += `<label class="qf-label">${esc(q.label)}</label>`;
  h += `<div class="qf-locked-value">${icon}<span>${esc(value)}</span></div>`;
  h += `<p class="qf-locked-note">From character sheet</p>`;
  h += '</div>';
  return h;
}

// Render a field as read-only (showing saved response)
function renderReadOnlyField(q, value) {
  if (!value) return ''; // hide empty fields in read-only view

  let h = `<div class="qf-field">`;
  h += `<label class="qf-label">${esc(q.label)}</label>`;
  h += `<div class="qf-readonly-value">${esc(value)}</div>`;
  h += '</div>';
  return h;
}

function renderQuestion(q, value) {
  const reqMark = q.required ? ' <span class="qf-req">*</span>' : '';
  let h = `<div class="qf-field">`;
  h += `<label class="qf-label" for="q-${q.key}">${esc(q.label)}${reqMark}</label>`;

  if (q.desc) {
    h += `<p class="qf-desc">${esc(q.desc)}</p>`;
  }

  switch (q.type) {
    case 'text':
      h += `<input type="text" id="q-${q.key}" class="qf-input" value="${esc(value)}">`;
      break;

    case 'textarea':
      h += `<textarea id="q-${q.key}" class="qf-textarea" rows="4">${esc(value)}</textarea>`;
      break;

    case 'radio': {
      const iconFn = ICON_FN[q.key];
      h += `<div class="qf-radio-group" id="q-${q.key}">`;
      for (const opt of q.options) {
        const checked = value === opt.value ? ' checked' : '';
        const icon = iconFn ? iconFn(opt.value, 20) : '';
        h += `<label class="qf-radio-label">`;
        h += `<input type="radio" name="q-${q.key}" value="${esc(opt.value)}"${checked}>`;
        if (icon) h += `<span class="qf-radio-icon">${icon}</span>`;
        h += `<span>${esc(opt.label)}</span>`;
        h += `</label>`;
      }
      h += '</div>';
      break;
    }

    case 'select':
      h += `<select id="q-${q.key}" class="qf-select">`;
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

// Expose the current status for ordeal cards
export function getQuestionnaireStatus() {
  return responseDoc?.status || null;
}
