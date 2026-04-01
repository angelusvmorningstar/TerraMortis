/* Ordeals tab — shows player-level and character-level ordeal status.
 * Clicking Questionnaire or History opens the questionnaire form.
 * Status for form-backed ordeals comes from the questionnaire_responses collection. */

import { apiGet } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { renderQuestionnaire } from './questionnaire-form.js';
import { renderHistory } from './history-form.js';

const PLAYER_ORDEALS = [
  { key: 'setting', label: 'Setting', altKey: 'lore',
    desc: 'Demonstrate knowledge of the game setting. 3 XP to all your characters.' },
  { key: 'rules', label: 'Rules',
    desc: 'Demonstrate knowledge of VtR 2e rules. 3 XP to all your characters. Unlocks dice roller in the game app.' },
  { key: 'covenant', label: 'Covenant',
    desc: 'Demonstrate knowledge of your covenant. 3 XP to characters in that covenant.' },
];

const CHAR_ORDEALS = [
  { key: 'questionnaire', label: 'Questionnaire', hasForm: true,
    desc: 'Complete the character questionnaire. 3 XP to this character.' },
  { key: 'history', label: 'History', hasForm: true,
    desc: 'Write your character history. 3 XP to this character.' },
];

let playerDoc = null;
let currentChar = null;
let questionnaireStatus = null;
let historyStatus = null;

export async function initOrdeals(char, chars) {
  const el = document.getElementById('tab-ordeals');
  if (!el) return;
  currentChar = char;

  const [pDoc, qDoc, hDoc] = await Promise.all([
    playerDoc ? Promise.resolve(playerDoc) : apiGet('/api/players/me').catch(() => ({ ordeals: {} })),
    apiGet(`/api/questionnaire?character_id=${char._id}`).catch(() => null),
    apiGet(`/api/history?character_id=${char._id}`).catch(() => null),
  ]);

  playerDoc = pDoc;
  questionnaireStatus = qDoc?.status || null;
  historyStatus = hDoc?.status || null;

  renderOrdealsList(el, char);
}

function renderOrdealsList(el, char) {
  const pOrdeals = playerDoc?.ordeals || {};
  const cOrdeals = normaliseCharOrdeals(char);

  let h = '<div class="ordeals-container" id="ordeals-list">';

  // Character-level ordeals
  h += '<div class="ordeals-section">';
  h += `<h3 class="ordeals-heading">${esc(displayName(char))}</h3>`;
  for (const def of CHAR_ORDEALS) {
    const status = getOrdealStatus(def, cOrdeals);
    h += ordealCard(def, status);
  }
  h += '</div>';

  // Player-level ordeals
  h += '<div class="ordeals-section">';
  h += '<h3 class="ordeals-heading">Player Ordeals</h3>';
  for (const def of PLAYER_ORDEALS) {
    const status = pOrdeals[def.key] || pOrdeals[def.altKey] || fallbackFromChar(cOrdeals, def) || { status: 'not_started' };
    h += ordealCard(def, status);
  }
  h += '</div>';

  h += '</div>';
  el.innerHTML = h;

  el.querySelectorAll('.ordeal-card[data-form]').forEach(card => {
    card.addEventListener('click', () => openForm(el, card.dataset.form));
  });
}

// Derive ordeal status from the matching response collection
function getOrdealStatus(def, cOrdeals) {
  if (def.key === 'questionnaire' && questionnaireStatus) {
    return { status: questionnaireStatus };
  }
  if (def.key === 'history' && historyStatus) {
    return { status: historyStatus };
  }
  return cOrdeals[def.key] || { status: 'not_started' };
}

function openForm(el, formType) {
  let h = '<div class="ordeals-container">';
  h += '<button class="qf-back-btn" id="qf-back">&larr; Back to Ordeals</button>';
  h += '<div id="qf-target"></div>';
  h += '</div>';
  el.innerHTML = h;

  document.getElementById('qf-back').addEventListener('click', () => {
    renderOrdealsList(el, currentChar);
  });

  if (formType === 'history') {
    renderHistory(document.getElementById('qf-target'), currentChar);
  } else {
    renderQuestionnaire(document.getElementById('qf-target'), currentChar);
  }
}

function ordealCard(def, status) {
  const s = status.status || 'not_started';
  const done = s === 'approved' || status.complete === true;
  const submitted = s === 'submitted';
  const draft = s === 'draft';
  const stateClass = done ? 'done' : submitted ? 'pending' : draft ? 'draft' : 'incomplete';
  const stateLabel = done ? 'Approved' : submitted ? 'Submitted' : draft ? 'In Progress' : 'Not Started';
  const icon = done ? '&#10003;' : submitted ? '&#9679;' : draft ? '&#9998;' : '&#9675;';
  const xp = done ? '+3 XP' : '';
  const formAttr = def.hasForm ? ` data-form="${def.key}"` : '';
  const clickHint = def.hasForm ? '<span class="ordeal-action">Open &rarr;</span>' : '';

  return `<div class="ordeal-card ${stateClass}"${formAttr}>
    <div class="ordeal-icon">${icon}</div>
    <div class="ordeal-info">
      <div class="ordeal-label">${esc(def.label)}</div>
      <div class="ordeal-desc">${esc(def.desc)}</div>
    </div>
    <div class="ordeal-status">
      <span class="ordeal-state">${stateLabel}</span>
      ${xp ? `<span class="ordeal-xp">${xp}</span>` : ''}
      ${clickHint}
    </div>
  </div>`;
}

function normaliseCharOrdeals(char) {
  const ordeals = char.ordeals;
  if (!ordeals) return {};
  if (!Array.isArray(ordeals)) return ordeals;

  const out = {};
  for (const o of ordeals) {
    out[o.name] = {
      status: o.complete ? 'approved' : 'not_started',
      complete: o.complete,
    };
  }
  return out;
}

function fallbackFromChar(cOrdeals, def) {
  return cOrdeals[def.key] || (def.altKey ? cOrdeals[def.altKey] : null);
}

export function resetPlayerDoc() {
  playerDoc = null;
}
