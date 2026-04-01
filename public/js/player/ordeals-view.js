/* Ordeals tab — shows all 5 ordeals with status and form access.
 * Character-level: Questionnaire, History (per character)
 * Player-level: Setting/Lore, Rules, Covenant (per player) */

import { apiGet } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { renderQuestionnaire } from './questionnaire-form.js';
import { renderHistory } from './history-form.js';
import { renderOrdealForm } from './ordeal-form.js';
import { RULES_SECTIONS } from './rules-data.js';
import { LORE_SECTIONS } from './lore-data.js';
import { COVENANT_ROUTING, COVENANT_SECTIONS } from './covenant-data.js';

const CHAR_ORDEALS = [
  { key: 'questionnaire', label: 'Questionnaire', hasForm: true, formType: 'questionnaire',
    desc: 'Complete the character questionnaire. 3 XP to this character.' },
  { key: 'history', label: 'History', hasForm: true, formType: 'history',
    desc: 'Write your character history. 3 XP to this character.' },
];

const PLAYER_ORDEALS = [
  { key: 'setting', label: 'Setting', altKey: 'lore', hasForm: true, formType: 'lore',
    desc: 'Demonstrate knowledge of the game setting. 3 XP to all your characters.' },
  { key: 'rules', label: 'Rules', hasForm: true, formType: 'rules',
    desc: 'Demonstrate knowledge of VtR 2e rules. 3 XP to all your characters. Unlocks dice roller in the game app.' },
  { key: 'covenant', label: 'Covenant', hasForm: true, formType: 'covenant',
    desc: 'Demonstrate knowledge of your covenant. 3 XP to characters in that covenant.' },
];

let playerDoc = null;
let currentChar = null;
let statusCache = {}; // { questionnaire, history, rules, lore, covenant }

export async function initOrdeals(char, chars) {
  const el = document.getElementById('tab-ordeals');
  if (!el) return;
  currentChar = char;

  // Fetch everything in parallel
  const [pDoc, qDoc, hDoc, rulesDoc, loreDoc, covDoc] = await Promise.all([
    playerDoc ? Promise.resolve(playerDoc) : apiGet('/api/players/me').catch(() => ({ ordeals: {} })),
    apiGet(`/api/questionnaire?character_id=${char._id}`).catch(() => null),
    apiGet(`/api/history?character_id=${char._id}`).catch(() => null),
    apiGet('/api/ordeal-responses?type=rules').catch(() => null),
    apiGet('/api/ordeal-responses?type=lore').catch(() => null),
    apiGet('/api/ordeal-responses?type=covenant').catch(() => null),
  ]);

  playerDoc = pDoc;
  statusCache = {
    questionnaire: qDoc?.status || null,
    history: hDoc?.status || null,
    rules: rulesDoc?.status || null,
    lore: loreDoc?.status || null,
    covenant: covDoc?.status || null,
  };

  renderOrdealsList(el, char);
}

function renderOrdealsList(el, char) {
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
    const status = getOrdealStatus(def, cOrdeals);
    h += ordealCard(def, status);
  }
  h += '</div>';

  h += '</div>';
  el.innerHTML = h;

  el.querySelectorAll('.ordeal-card[data-form]').forEach(card => {
    card.addEventListener('click', () => openForm(el, card.dataset.form));
  });
}

function getOrdealStatus(def, cOrdeals) {
  // Check response collection status first
  const responseStatus = statusCache[def.key] || statusCache[def.altKey];
  if (responseStatus) return { status: responseStatus };

  // Fall back to character sheet ordeal data
  return cOrdeals[def.key] || (def.altKey ? cOrdeals[def.altKey] : null) || { status: 'not_started' };
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

  const target = document.getElementById('qf-target');

  switch (formType) {
    case 'questionnaire':
      renderQuestionnaire(target, currentChar);
      break;
    case 'history':
      renderHistory(target, currentChar);
      break;
    case 'rules':
      renderOrdealForm(target, 'rules', 'Rules Mastery', RULES_SECTIONS);
      break;
    case 'lore':
      renderOrdealForm(target, 'lore', 'Lore Mastery', LORE_SECTIONS);
      break;
    case 'covenant':
      renderCovenantForm(target);
      break;
  }
}

// Covenant form needs special handling — branches by covenant
async function renderCovenantForm(target) {
  // Determine covenant from the character or from saved response
  let savedCovenant = null;

  // Try to load existing response
  let responseDoc = null;
  try {
    responseDoc = await apiGet('/api/ordeal-responses?type=covenant');
  } catch { /* none */ }

  if (responseDoc?.responses?.covenant_choice) {
    savedCovenant = responseDoc.responses.covenant_choice;
  } else if (currentChar.covenant && COVENANT_SECTIONS[currentChar.covenant]) {
    savedCovenant = currentChar.covenant;
  }

  if (savedCovenant && COVENANT_SECTIONS[savedCovenant]) {
    // Render the covenant-specific sections
    const sections = COVENANT_SECTIONS[savedCovenant];
    renderOrdealForm(target, 'covenant', `Covenant Ordeal — ${savedCovenant}`, sections);
  } else {
    // Show covenant picker first
    target.innerHTML = `<div id="cov-picker" class="reading-pane"></div>`;
    const picker = document.getElementById('cov-picker');
    let h = '<div class="qf-header"><h3 class="qf-title">Covenant Questionnaire</h3></div>';
    h += '<div class="qf-field">';
    h += `<label class="qf-label">${esc(COVENANT_ROUTING.label)} <span class="qf-req">*</span></label>`;
    h += '<div class="qf-radio-group">';
    for (const opt of COVENANT_ROUTING.options) {
      h += `<label class="qf-radio-label">`;
      h += `<input type="radio" name="cov-pick" value="${esc(opt.value)}">`;
      h += `<span>${esc(opt.label)}</span>`;
      h += `</label>`;
    }
    h += '</div></div>';
    h += '<div class="qf-actions"><button class="qf-btn qf-btn-submit" id="cov-start">Start</button></div>';
    picker.innerHTML = h;

    document.getElementById('cov-start').addEventListener('click', () => {
      const checked = document.querySelector('input[name="cov-pick"]:checked');
      if (!checked) return;
      const cov = checked.value;
      if (COVENANT_SECTIONS[cov]) {
        renderOrdealForm(target, 'covenant', `Covenant Ordeal — ${cov}`, COVENANT_SECTIONS[cov]);
      }
    });
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
  const formAttr = def.hasForm ? ` data-form="${def.formType}"` : '';
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

export function resetPlayerDoc() {
  playerDoc = null;
}
