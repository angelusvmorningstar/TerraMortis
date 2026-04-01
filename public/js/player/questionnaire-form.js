/* Questionnaire form — renders questions from data, saves to API, supports draft/submit.
 * Fields that overlap with the character sheet are read-only — the sheet is authoritative. */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc, displayName, clanIcon, covIcon } from '../data/helpers.js';
import { QUESTIONNAIRE_SECTIONS } from './questionnaire-data.js';

// Maps question keys to icon helper functions
const ICON_FN = { clan: clanIcon, covenant: covIcon };

// Fields where the character sheet is the source of truth.
// key = questionnaire field, value = function to extract from character doc.
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

// Debounced auto-save (2 seconds after last input)
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 2000);
}

function collectResponses() {
  const responses = {};
  for (const section of QUESTIONNAIRE_SECTIONS) {
    for (const q of section.questions) {
      // Sheet-authoritative fields are not in the form — use sheet value
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

  // Check required fields (skip sheet-authoritative fields — they're always filled)
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

  // Build sheet-authoritative values from the character
  sheetValues = {};
  for (const [key, fn] of Object.entries(SHEET_FIELDS)) {
    sheetValues[key] = fn(char);
  }

  // Load existing response
  try {
    responseDoc = await apiGet(`/api/questionnaire?character_id=${char._id}`);
  } catch { /* no existing response */ }

  // Auto-populate from auth only if this is the player's own character
  autoFill.discord_nickname = '';
  if (!responseDoc) {
    const user = JSON.parse(localStorage.getItem('tm_auth_user') || '{}');
    const ownCharIds = (user.character_ids || []).map(id => String(id));
    if (ownCharIds.includes(String(char._id))) {
      autoFill.discord_nickname = user.username || '';
    }
  }

  targetEl.innerHTML = `<div id="qf-container"></div>`;
  renderForm(document.getElementById('qf-container'));
}

const autoFill = { discord_nickname: '' };

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const isSubmitted = responseDoc?.status === 'submitted';

  let h = '';

  // Form header
  h += '<div class="qf-header">';
  h += '<h3 class="qf-title">Character Questionnaire</h3>';
  h += '<div class="qf-meta">';
  if (isSubmitted) {
    h += '<span class="qf-badge qf-badge-submitted">Submitted</span>';
  } else {
    h += '<span class="qf-badge qf-badge-draft">Draft</span>';
  }
  h += '<span id="qf-save-status" class="qf-save-status"></span>';
  h += '</div>';
  h += '<p class="qf-intro">Required questions are marked with <span class="qf-req">*</span>. Your responses auto-save as you type. Complete all optional questions with thoughtful responses to qualify for the 3 XP Ordeal bonus.</p>';
  h += '</div>';

  // Sections
  for (const section of QUESTIONNAIRE_SECTIONS) {
    h += `<div class="qf-section">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}</h4>`;
    if (section.intro) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }

    for (const q of section.questions) {
      // Sheet-authoritative fields render as read-only with character data
      if (SHEET_FIELDS[q.key] && sheetValues[q.key]) {
        h += renderLockedField(q, sheetValues[q.key]);
      } else {
        const val = saved[q.key] || autoFill[q.key] || '';
        h += renderQuestion(q, val);
      }
    }
    h += '</div>';
  }

  // Submit button
  h += '<div class="qf-actions">';
  if (isSubmitted) {
    h += '<button class="qf-btn qf-btn-edit" id="qf-btn-edit">Edit Responses</button>';
  } else {
    h += '<button class="qf-btn qf-btn-save" id="qf-btn-save">Save Draft</button>';
    h += '<button class="qf-btn qf-btn-submit" id="qf-btn-submit">Submit Questionnaire</button>';
  }
  h += '</div>';

  container.innerHTML = h;

  // Wire events
  container.addEventListener('input', scheduleSave);
  container.addEventListener('change', scheduleSave);

  const btnSave = document.getElementById('qf-btn-save');
  if (btnSave) btnSave.addEventListener('click', saveDraft);

  const btnSubmit = document.getElementById('qf-btn-submit');
  if (btnSubmit) btnSubmit.addEventListener('click', submitForm);

  const btnEdit = document.getElementById('qf-btn-edit');
  if (btnEdit) btnEdit.addEventListener('click', async () => {
    responseDoc = await apiPut(`/api/questionnaire/${responseDoc._id}`, { status: 'draft' });
    renderForm(container);
  });
}

// Render a field that's locked to the character sheet value
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
