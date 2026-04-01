/* Character History form — backstory submission for the History ordeal.
 * Same lifecycle as questionnaire: draft → submitted → approved (locked). */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { HISTORY_SECTIONS } from './history-data.js';
import { getRole } from '../auth/discord.js';

let responseDoc = null;
let currentCharId = null;
let saveTimer = null;
let editing = false;

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 2000);
}

function collectResponses() {
  const responses = {};
  for (const section of HISTORY_SECTIONS) {
    for (const q of section.questions) {
      const el = document.getElementById('h-' + q.key);
      if (el) responses[q.key] = el.value;
    }
  }
  return responses;
}

async function saveDraft() {
  if (!editing) return;
  const responses = collectResponses();
  const statusEl = document.getElementById('hf-save-status');

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/history', {
        character_id: currentCharId,
        responses,
      });
    } else {
      responseDoc = await apiPut(`/api/history/${responseDoc._id}`, { responses });
    }
    if (statusEl) statusEl.textContent = 'Saved';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

async function submitForm() {
  const responses = collectResponses();

  // Check required
  if (!responses.backstory_text?.trim() && !responses.backstory_link?.trim()) {
    const statusEl = document.getElementById('hf-save-status');
    if (statusEl) statusEl.textContent = 'Please write your backstory or provide a link.';
    return;
  }

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/history', {
        character_id: currentCharId,
        responses,
      });
    }
    responseDoc = await apiPut(`/api/history/${responseDoc._id}`, {
      responses,
      status: 'submitted',
    });
    editing = false;
    renderForm(document.getElementById('hf-container'));
  } catch (err) {
    const statusEl = document.getElementById('hf-save-status');
    if (statusEl) statusEl.textContent = 'Submit failed: ' + err.message;
  }
}

export async function renderHistory(targetEl, char) {
  currentCharId = char._id;
  responseDoc = null;

  try {
    responseDoc = await apiGet(`/api/history?character_id=${char._id}`);
  } catch { /* no response */ }

  const status = responseDoc?.status || 'new';
  editing = (status === 'new' || status === 'draft');

  targetEl.innerHTML = `<div id="hf-container" class="reading-pane"></div>`;
  renderForm(document.getElementById('hf-container'));
}

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const status = responseDoc?.status || 'new';
  const role = getRole();
  const isST = role === 'st';
  const isApproved = status === 'approved';
  const isSubmitted = status === 'submitted';
  const readOnly = !editing;

  let h = '';

  // Header
  h += '<div class="qf-header">';
  h += '<h3 class="qf-title">Character History</h3>';
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
  h += '<span id="hf-save-status" class="qf-save-status"></span>';
  h += '</div>';

  if (isApproved) {
    h += '<p class="qf-intro">This history has been approved and is locked. +3 XP awarded.</p>';
  } else if (isSubmitted) {
    h += '<p class="qf-intro">Your character history has been submitted for review.</p>';
  }
  h += '</div>';

  // Sections
  for (const section of HISTORY_SECTIONS) {
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
        if (q.key === 'backstory_link' && val) {
          h += `<div class="qf-readonly-value"><a href="${esc(val)}" target="_blank" rel="noopener" style="color:#5A1A1A;text-decoration:underline">${esc(val)}</a></div>`;
        } else {
          h += `<div class="qf-readonly-value">${esc(val)}</div>`;
        }
        h += '</div>';
      } else {
        const val = saved[q.key] || '';
        const rows = q.rows || 4;
        h += `<div class="qf-field">`;
        h += `<label class="qf-label" for="h-${q.key}">${esc(q.label)}${q.required ? ' <span class="qf-req">*</span>' : ''}</label>`;
        if (q.desc) h += `<p class="qf-desc">${esc(q.desc)}</p>`;
        if (q.type === 'textarea') {
          h += `<textarea id="h-${q.key}" class="qf-textarea" rows="${rows}">${esc(val)}</textarea>`;
        } else {
          h += `<input type="text" id="h-${q.key}" class="qf-input" value="${esc(val)}">`;
        }
        h += '</div>';
      }
    }
    h += '</div>';
  }

  // Actions
  h += '<div class="qf-actions">';
  if (editing) {
    h += '<button class="qf-btn qf-btn-save" id="hf-btn-save">Save Draft</button>';
    h += '<button class="qf-btn qf-btn-submit" id="hf-btn-submit">Submit</button>';
  } else if (isApproved && isST) {
    h += '<button class="qf-btn qf-btn-edit" id="hf-btn-edit">Edit (ST)</button>';
  } else if (isSubmitted) {
    h += '<button class="qf-btn qf-btn-edit" id="hf-btn-edit">Edit Responses</button>';
  }
  if (isSubmitted && isST) {
    h += '<button class="qf-btn qf-btn-approve" id="hf-btn-approve">Approve Ordeal</button>';
  }
  h += '</div>';

  container.innerHTML = h;

  if (editing) {
    container.addEventListener('input', scheduleSave);
    container.addEventListener('change', scheduleSave);
  }

  const btnSave = document.getElementById('hf-btn-save');
  if (btnSave) btnSave.addEventListener('click', saveDraft);

  const btnSubmit = document.getElementById('hf-btn-submit');
  if (btnSubmit) btnSubmit.addEventListener('click', submitForm);

  const btnEdit = document.getElementById('hf-btn-edit');
  if (btnEdit) btnEdit.addEventListener('click', () => {
    editing = true;
    renderForm(container);
  });

  const btnApprove = document.getElementById('hf-btn-approve');
  if (btnApprove) btnApprove.addEventListener('click', async () => {
    try {
      responseDoc = await apiPut(`/api/history/${responseDoc._id}`, { status: 'approved' });
      editing = false;
      renderForm(container);
    } catch (err) {
      const statusEl = document.getElementById('hf-save-status');
      if (statusEl) statusEl.textContent = 'Approve failed: ' + err.message;
    }
  });
}

export function getHistoryStatus() {
  return responseDoc?.status || null;
}
