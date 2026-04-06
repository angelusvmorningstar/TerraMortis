/* Questionnaire form — renders questions from data, saves to API, supports draft/submit.
 * Fields that overlap with the character sheet are read-only — the sheet is authoritative.
 * The opener block shows player identity (name, discord, facebook) always visible.
 * The char header block shows sheet-derived character identity always visible.
 * All question sections start collapsed and toggle on title click.
 *
 * Lifecycle: draft → submitted (read-only, player can edit) → approved (locked, ST only)
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc, displayName, clanIcon, covIcon } from '../data/helpers.js';
import { QUESTIONNAIRE_SECTIONS } from './questionnaire-data.js';
import { getRole } from '../auth/discord.js';

// Fields derived from the character sheet — not rendered as questions.
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
  date_of_embrace: c => c.date_of_embrace || '',
};

// Questions handled by the opener block — not rendered in sections.
const OPENER_FIELDS = new Set(['player_name', 'discord_nickname']);

// Override section titles where the remaining questions no longer match the original label.
const SECTION_LABELS = {
  player_info: 'Player Preferences',
};

let responseDoc = null;
let currentChar = null;
let currentCharId = null;
let sheetValues = {};
let discordUsername = '';
let saveTimer = null;
let editing = false;
let allCharacters = [];

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 2000);
}

function collectResponses() {
  const responses = {};

  // Collect sheet-derived values
  for (const [key, val] of Object.entries(sheetValues)) {
    if (val) responses[key] = val;
  }

  // Collect discord from auth (always current)
  if (discordUsername) responses.discord_nickname = discordUsername;

  // Collect all rendered inputs (facebook_name is in opener with id q-facebook_name)
  for (const section of QUESTIONNAIRE_SECTIONS) {
    for (const q of section.questions) {
      if (SHEET_FIELDS[q.key]) continue; // already collected above
      if (q.type === 'checkbox' || q.type === 'character_select') {
        const checked = [...document.querySelectorAll(`input[name="q-${q.key}"]:checked`)]
          .map(el => el.value);
        responses[q.key] = checked;
        continue;
      }
      if (q.type === 'radio') {
        const checked = document.querySelector(`input[name="q-${q.key}"]:checked`);
        responses[q.key] = checked ? checked.value : '';
        continue;
      }
      if (q.type === 'dynamic_list') {
        const listEl = document.getElementById('dynlist-' + q.key);
        if (!listEl) { responses[q.key] = []; continue; }
        const entries = [];
        for (const entryEl of listEl.querySelectorAll('.qf-dynlist-entry')) {
          const entry = {};
          for (const input of entryEl.querySelectorAll('[data-sfkey]')) {
            entry[input.dataset.sfkey] = input.value;
          }
          if (Object.values(entry).some(v => String(v).trim())) entries.push(entry);
        }
        responses[q.key] = entries;
        continue;
      }
      const el = document.getElementById('q-' + q.key);
      if (!el) continue;
      responses[q.key] = el.value;
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
      if (SHEET_FIELDS[q.key] || OPENER_FIELDS.has(q.key)) continue;
      const v = responses[q.key];
      const blank = Array.isArray(v) ? v.length === 0 : !v?.trim();
      if (blank) missing.push(q.label);
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

  // Discord username from the player profile that owns this character.
  // ST viewing: search all players for the one whose character_ids includes this character.
  // Player viewing their own: /api/players/me is sufficient.
  discordUsername = '';
  try {
    if (getRole() === 'st') {
      const allPlayers = await apiGet('/api/players');
      const ownerDoc = allPlayers.find(p =>
        (p.character_ids || []).some(id => String(id) === String(char._id))
      );
      discordUsername = ownerDoc?.discord_username || '';
    } else {
      const playerDoc = await apiGet('/api/players/me');
      discordUsername = playerDoc?.discord_username || '';
    }
  } catch { /* leave blank */ }

  try {
    const chars = await apiGet('/api/characters');
    allCharacters = chars
      .filter(c => String(c._id) !== String(char._id))
      .sort((a, b) => (a.moniker || a.name).localeCompare(b.moniker || b.name));
  } catch { allCharacters = []; }

  try {
    responseDoc = await apiGet(`/api/questionnaire?character_id=${char._id}`);
  } catch { /* no existing response */ }

  const status = responseDoc?.status || 'new';
  editing = (status === 'new' || status === 'draft');

  targetEl.innerHTML = `<div id="qf-container" class="reading-pane"></div>`;
  renderForm(document.getElementById('qf-container'));
}

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const status = responseDoc?.status || 'new';
  const role = getRole();
  const isST = role === 'st';
  const isApproved = status === 'approved';
  const isSubmitted = status === 'submitted';
  const canPlayerEdit = !isApproved;
  const readOnly = !editing;

  let h = '';

  // ── Form header ──────────────────────────────────────────────
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
    h += '<p class="qf-intro">Required questions are marked <span class="qf-req">*</span>. Responses auto-save as you type.</p>';
  } else if (isApproved) {
    h += '<p class="qf-intro">Approved and locked. +3 XP awarded.</p>';
  } else if (isSubmitted) {
    h += '<p class="qf-intro">Submitted for review.</p>';
  }
  h += '</div>';

  // ── Opener: player identity ───────────────────────────────────
  h += renderOpener(saved);

  // ── Player-level sections (before character header) ───────────
  h += renderSections(['player_info'], saved, readOnly, editing);

  // ── Character identity header ─────────────────────────────────
  h += renderCharHeader();

  // ── Character sections (after character header) ───────────────
  const charSectionKeys = QUESTIONNAIRE_SECTIONS
    .map(s => s.key)
    .filter(k => k !== 'player_info');
  h += renderSections(charSectionKeys, saved, readOnly, editing);

  // ── Actions ───────────────────────────────────────────────────
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

  // ── Wire events ───────────────────────────────────────────────
  if (editing) {
    container.addEventListener('input', scheduleSave);
    container.addEventListener('change', scheduleSave);
  }

  // Section collapse toggle + dynamic list add/remove
  container.addEventListener('click', e => {
    const title = e.target.closest('.qf-section-title');
    if (title) {
      const section = title.closest('.qf-section');
      if (section) section.classList.toggle('collapsed');
      return;
    }

    const addBtn = e.target.closest('.qf-dynlist-add');
    if (addBtn) {
      const key = addBtn.dataset.dynkey;
      const q = QUESTIONNAIRE_SECTIONS.flatMap(s => s.questions).find(q => q.key === key);
      if (!q) return;
      const listEl = document.getElementById('dynlist-' + key);
      if (!listEl) return;
      const idx = listEl.querySelectorAll('.qf-dynlist-entry').length;
      listEl.insertAdjacentHTML('beforeend', renderDynEntry(q, {}, idx));
      scheduleSave();
      return;
    }

    const removeBtn = e.target.closest('.qf-dynlist-remove');
    if (removeBtn) {
      removeBtn.closest('.qf-dynlist-entry')?.remove();
      scheduleSave();
    }
  });

  document.getElementById('qf-btn-save')?.addEventListener('click', saveDraft);
  document.getElementById('qf-btn-submit')?.addEventListener('click', submitForm);

  document.getElementById('qf-btn-edit')?.addEventListener('click', () => {
    editing = true;
    renderForm(container);
  });

  document.getElementById('qf-btn-approve')?.addEventListener('click', async () => {
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

// ── Section renderer ──────────────────────────────────────────────

function renderSections(keys, saved, readOnly, editing) {
  let h = '';
  for (const key of keys) {
    const section = QUESTIONNAIRE_SECTIONS.find(s => s.key === key);
    if (!section) continue;

    const questions = section.questions.filter(q =>
      !SHEET_FIELDS[q.key] && !OPENER_FIELDS.has(q.key)
    );
    if (!questions.length) continue;

    const sectionLabel = SECTION_LABELS[section.key] || section.title;
    h += `<div class="qf-section collapsed" data-section-key="${esc(section.key)}">`;
    h += `<h4 class="qf-section-title">${esc(sectionLabel)}<span class="qf-section-tick"></span></h4>`;
    h += '<div class="qf-section-body">';

    if (section.intro && editing) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }

    // Date of Embrace: shown as a display row at the top of Character History
    if (section.key === 'character_history') {
      const embraceRaw = sheetValues.date_of_embrace;
      const embraceDisp = embraceRaw
        ? new Date(embraceRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;
      h += `<div class="qf-field">`;
      h += `<label class="qf-label">Date of Embrace</label>`;
      h += embraceDisp
        ? `<div class="qf-readonly-value">${esc(embraceDisp)}</div>`
        : `<div class="qf-readonly-value qf-readonly-pending">Not yet confirmed. To be set by the ST on the character sheet.</div>`;
      h += `</div>`;
    }

    for (let q of questions) {
      // bloodline_rationale only shown when a bloodline is set; label names the bloodline
      if (q.key === 'bloodline_rationale') {
        if (!sheetValues.bloodline) continue;
        q = { ...q, label: `${q.label}: ${sheetValues.bloodline}` };
      }
      if (readOnly) {
        h += renderReadOnlyField(q, saved[q.key] || '');
      } else {
        h += renderQuestion(q, saved[q.key] || '');
      }
    }

    h += '</div>'; // qf-section-body
    h += '</div>'; // qf-section
  }
  return h;
}

// ── Opener: player identity block ────────────────────────────────

function renderOpener(saved) {
  const playerName = sheetValues.player_name || '';

  let h = '<div class="qf-opener">';

  if (playerName) {
    h += `<div class="qf-opener-row">`;
    h += `<span class="qf-opener-label">Player</span>`;
    h += `<span class="qf-opener-value">${esc(playerName)}</span>`;
    h += `</div>`;
  }

  if (discordUsername) {
    h += `<div class="qf-opener-row">`;
    h += `<span class="qf-opener-label">Discord</span>`;
    h += `<span class="qf-opener-value">${esc(discordUsername)}</span>`;
    h += `</div>`;
  }

  h += '</div>';
  return h;
}

// ── Character identity header ─────────────────────────────────────

function renderCharHeader() {
  const clan      = sheetValues.clan;
  const bloodline = sheetValues.bloodline;
  const covenant  = sheetValues.covenant;
  const mask      = sheetValues.mask;
  const dirge     = sheetValues.dirge;
  const concept   = sheetValues.high_concept;
  const bp        = sheetValues.blood_potency;
  const age       = sheetValues.apparent_age;
  const embraceRaw = sheetValues.date_of_embrace;
  const embraceDisp = embraceRaw
    ? new Date(embraceRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  let h = '<div class="qf-char-header">';

  // Clan / Covenant row
  h += '<div class="qf-char-identity">';
  if (clan) {
    h += `<span class="qf-char-clan">${clanIcon(clan, 18)}<span>${esc(clan)}</span>`;
    if (bloodline) h += ` <span class="qf-char-bloodline">/ ${esc(bloodline)}</span>`;
    h += '</span>';
  }
  if (covenant) {
    h += `<span class="qf-char-cov">${covIcon(covenant, 18)}<span>${esc(covenant)}</span></span>`;
  }
  h += '</div>';

  // Mask / Dirge row
  if (mask || dirge) {
    h += '<div class="qf-char-archetypes">';
    if (mask)  h += `<span class="qf-char-arch"><span class="qf-arch-label">Mask</span> ${esc(mask)}</span>`;
    if (dirge) h += `<span class="qf-char-arch"><span class="qf-arch-label">Dirge</span> ${esc(dirge)}</span>`;
    h += '</div>';
  }

  // High concept
  if (concept) {
    h += `<div class="qf-char-concept">${esc(concept)}</div>`;
  }

  // Stats row
  const stats = [];
  if (embraceDisp) stats.push(`Embraced ${esc(embraceDisp)}`);
  if (age) stats.push(`Apparent age ${esc(age)}`);
  if (bp)  stats.push(`Blood Potency ${'●'.repeat(parseInt(bp) || 0) || bp}`);
  if (stats.length) {
    h += `<div class="qf-char-stats">${stats.join(' · ')}</div>`;
  }

  h += '</div>';
  return h;
}

// ── Field renderers ───────────────────────────────────────────────

function renderReadOnlyField(q, value) {
  const isEmpty = Array.isArray(value) ? value.length === 0 : !value;
  if (isEmpty) return '';
  let h = `<div class="qf-field">`;
  h += `<label class="qf-label">${esc(q.label)}</label>`;

  if (q.type === 'dynamic_list' && !Array.isArray(value)) {
    // Legacy import: stored as a plain string rather than structured array
    h += `<div class="qf-readonly-value">${esc(value)}</div>`;
  } else if (q.type === 'dynamic_list') {
    h += `<div class="qf-dynlist-readonly">`;
    for (const entry of value) {
      h += `<div class="qf-dynlist-card">`;
      for (const sf of q.subfields) {
        if (entry[sf.key]) {
          h += `<div class="qf-dynlist-card-row">`;
          h += `<span class="qf-dynlist-card-label">${esc(sf.label)}</span>`;
          h += `<span class="qf-dynlist-card-value">${esc(entry[sf.key])}</span>`;
          h += `</div>`;
        }
      }
      h += `</div>`;
    }
    h += `</div>`;
  } else if (Array.isArray(value)) {
    // checkbox / character_select: render as tags
    const labels = value.map(v => {
      const opt = (q.options || []).find(o => o.value === v);
      return esc(opt ? opt.label : v);
    });
    h += `<div class="qf-tag-list">${labels.map(l => `<span class="qf-tag">${l}</span>`).join('')}</div>`;
  } else if (q.type === 'radio' || q.type === 'select') {
    // Resolve option label; fall back to raw value for legacy free-text imports
    const opt = (q.options || []).find(o => o.value === value);
    h += opt
      ? `<div class="qf-tag-list"><span class="qf-tag">${esc(opt.label)}</span></div>`
      : `<div class="qf-readonly-value">${esc(value)}</div>`;
  } else {
    h += `<div class="qf-readonly-value">${esc(value)}</div>`;
  }

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
      h += `<div class="qf-radio-group" id="q-${q.key}">`;
      for (const opt of q.options) {
        const checked = value === opt.value ? ' checked' : '';
        h += `<label class="qf-radio-label">`;
        h += `<input type="radio" name="q-${q.key}" value="${esc(opt.value)}"${checked}>`;
        h += `<span>${esc(opt.label)}</span>`;
        h += `</label>`;
      }
      h += '</div>';
      break;
    }

    case 'checkbox': {
      const selected = Array.isArray(value) ? value : [];
      h += `<div class="qf-checkbox-group">`;
      for (const opt of q.options) {
        const chk = selected.includes(opt.value) ? ' checked' : '';
        h += `<label class="qf-checkbox-label">`;
        h += `<input type="checkbox" name="q-${q.key}" value="${esc(opt.value)}"${chk}>`;
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

    case 'character_select': {
      const selected = Array.isArray(value) ? value : [];
      const active  = allCharacters.filter(c => !c.retired);
      const retired = allCharacters.filter(c => c.retired);
      h += `<div class="qf-char-select-grid">`;
      for (const ch of active) {
        const name = ch.moniker || ch.name;
        const chk = selected.includes(name) ? ' checked' : '';
        h += `<label class="qf-checkbox-label">`;
        h += `<input type="checkbox" name="q-${q.key}" value="${esc(name)}"${chk}>`;
        h += `<span>${esc(name)}</span>`;
        h += `</label>`;
      }
      if (retired.length) {
        h += `<details class="qf-char-inactive"><summary>Inactive characters</summary><div class="qf-char-select-grid qf-char-select-grid-retired">`;
        for (const ch of retired) {
          const name = ch.moniker || ch.name;
          const chk = selected.includes(name) ? ' checked' : '';
          h += `<label class="qf-checkbox-label">`;
          h += `<input type="checkbox" name="q-${q.key}" value="${esc(name)}"${chk}>`;
          h += `<span>${esc(name)}</span>`;
          h += `</label>`;
        }
        h += `</div></details>`;
      }
      h += '</div>';
      break;
    }

    case 'dynamic_list': {
      const entries = Array.isArray(value) ? value : [];
      h += `<div class="qf-dynlist" id="dynlist-${q.key}">`;
      entries.forEach((entry, idx) => { h += renderDynEntry(q, entry, idx); });
      h += '</div>';
      h += `<button type="button" class="qf-dynlist-add" data-dynkey="${esc(q.key)}">${esc(q.addLabel || '+ Add')}</button>`;
      break;
    }
  }

  h += '</div>';
  return h;
}

// ── Dynamic list entry renderer ───────────────────────────────────

function renderDynEntry(q, entry, idx) {
  let h = `<div class="qf-dynlist-entry" data-idx="${idx}">`;
  h += `<button type="button" class="qf-dynlist-remove" data-dynkey="${esc(q.key)}" title="Remove">×</button>`;
  for (const sf of q.subfields) {
    const val = entry[sf.key] || '';
    h += `<div class="qf-dynlist-field">`;
    h += `<label class="qf-dynlist-label">${esc(sf.label)}</label>`;
    if (sf.type === 'character_picker') {
      h += `<select class="qf-select qf-dynlist-input" data-sfkey="${sf.key}">`;
      h += `<option value="">Select a character</option>`;
      for (const ch of allCharacters) {
        const name = ch.moniker || ch.name;
        const sel = val === name ? ' selected' : '';
        h += `<option value="${esc(name)}"${sel}>${esc(name)}${ch.retired ? ' (inactive)' : ''}</option>`;
      }
      h += `</select>`;
    } else if (sf.type === 'textarea') {
      h += `<textarea class="qf-textarea qf-dynlist-input" data-sfkey="${sf.key}" rows="3">${esc(val)}</textarea>`;
    } else {
      h += `<input type="text" class="qf-input qf-dynlist-input" data-sfkey="${sf.key}" value="${esc(val)}">`;
    }
    h += `</div>`;
  }
  h += '</div>';
  return h;
}

// Expose the current status for ordeal cards
export function getQuestionnaireStatus() {
  return responseDoc?.status || null;
}
