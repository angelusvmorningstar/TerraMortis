/* Questionnaire form — renders questions from data, saves to API, supports draft/submit */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc, displayName, clanIcon, covIcon } from '../data/helpers.js';
import { QUESTIONNAIRE_SECTIONS } from './questionnaire-data.js';

// Maps question keys to icon helper functions
const ICON_FN = { clan: clanIcon, covenant: covIcon };

let responseDoc = null;
let currentCharId = null;
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
      // Create new response
      responseDoc = await apiPost('/api/questionnaire', {
        character_id: currentCharId,
        responses,
      });
    } else {
      // Update existing
      responseDoc = await apiPut(`/api/questionnaire/${responseDoc._id}`, { responses });
    }
    if (statusEl) statusEl.textContent = 'Saved';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

async function submitForm() {
  // Save current state first
  const responses = collectResponses();

  // Check required fields
  const missing = [];
  for (const section of QUESTIONNAIRE_SECTIONS) {
    for (const q of section.questions) {
      if (q.required && !responses[q.key]?.trim()) {
        missing.push(q.label);
      }
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
    // Re-render to show submitted state
    renderForm(document.getElementById('qf-container'));
  } catch (err) {
    const statusEl = document.getElementById('qf-save-status');
    if (statusEl) statusEl.textContent = 'Submit failed: ' + err.message;
  }
}

export async function renderQuestionnaire(targetEl, char) {
  currentCharId = char._id;
  responseDoc = null;

  // Load existing response
  try {
    responseDoc = await apiGet(`/api/questionnaire?character_id=${char._id}`);
  } catch { /* no existing response */ }

  // Auto-populate player info from auth if no saved response yet
  if (!responseDoc) {
    const user = JSON.parse(localStorage.getItem('tm_auth_user') || '{}');
    autoFill.player_name = user.global_name || user.username || '';
    autoFill.discord_nickname = user.username || '';
  } else {
    autoFill.player_name = '';
    autoFill.discord_nickname = '';
  }

  targetEl.innerHTML = `<div id="qf-container"></div>`;
  renderForm(document.getElementById('qf-container'));
}

const autoFill = { player_name: '', discord_nickname: '' };

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
      const val = saved[q.key] || autoFill[q.key] || '';
      h += renderQuestion(q, val);
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
