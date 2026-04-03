/* Ordeals tab — shows all 5 ordeals with status and form access.
 * Character-level: Questionnaire, History (per character)
 * Player-level: Setting/Lore, Rules, Covenant (per player) */

import { apiGet } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import {
  xpStarting, xpHumanityDrop, xpOrdeals, xpGame, xpPT5, xpEarned,
  xpSpentAttrs, xpSpentSkills, xpSpentMerits, xpSpentPowers, xpSpentSpecial, xpSpent, xpLeft,
} from '../editor/xp.js';
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
  const el = document.getElementById('tab-xplog');
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

function renderXPBreakdown(char) {
  const earnedParts = {
    starting:       xpStarting(),
    humanityDrop:   xpHumanityDrop(char),
    ordeals:        xpOrdeals(char),
    game:           xpGame(char),
    pt5:            xpPT5(char),
  };
  const totalEarned = xpEarned(char);
  const spentParts = {
    attrs:   xpSpentAttrs(char),
    skills:  xpSpentSkills(char),
    powers:  xpSpentPowers(char),
    merits:  xpSpentMerits(char),
    special: xpSpentSpecial(char),
  };
  const totalSpent = xpSpent(char);
  const remaining   = xpLeft(char);
  const over = remaining < 0;

  let h = '<div class="xpl-panel">';
  h += '<div class="xpl-cols">';

  // Earned column
  h += '<div class="xpl-col">';
  h += '<div class="xpl-col-head">Earned</div>';
  h += '<table class="xpl-table">';
  h += `<tr><td>Starting</td><td class="xpl-n">${earnedParts.starting}</td></tr>`;
  if (earnedParts.humanityDrop > 0)
    h += `<tr><td>Humanity drops (${Math.round(earnedParts.humanityDrop / 2)}&times;2)</td><td class="xpl-n">${earnedParts.humanityDrop}</td></tr>`;
  if (earnedParts.ordeals > 0)
    h += `<tr><td>Ordeals (${Math.round(earnedParts.ordeals / 3)}&times;3)</td><td class="xpl-n">${earnedParts.ordeals}</td></tr>`;
  if (earnedParts.game > 0)
    h += `<tr><td>Game attendance</td><td class="xpl-n">${earnedParts.game}</td></tr>`;
  if (earnedParts.pt5 > 0)
    h += `<tr class="xpl-bonus"><td>Professional Training \u25cf\u25cf\u25cf\u25cf\u25cf</td><td class="xpl-n">${earnedParts.pt5}</td></tr>`;
  h += `<tr class="xpl-total"><td>Total</td><td class="xpl-n">${totalEarned}</td></tr>`;
  h += '</table></div>';

  // Spent column
  h += '<div class="xpl-col">';
  h += '<div class="xpl-col-head">Spent</div>';
  h += '<table class="xpl-table">';
  const anySpent = Object.values(spentParts).some(v => v > 0);
  if (spentParts.attrs > 0)   h += `<tr><td>Attributes</td><td class="xpl-n">${spentParts.attrs}</td></tr>`;
  if (spentParts.skills > 0)  h += `<tr><td>Skills</td><td class="xpl-n">${spentParts.skills}</td></tr>`;
  if (spentParts.powers > 0)  h += `<tr><td>Disciplines &amp; powers</td><td class="xpl-n">${spentParts.powers}</td></tr>`;
  if (spentParts.merits > 0)  h += `<tr><td>Merits &amp; styles</td><td class="xpl-n">${spentParts.merits}</td></tr>`;
  if (spentParts.special > 0) h += `<tr><td>Special</td><td class="xpl-n">${spentParts.special}</td></tr>`;
  if (!anySpent) h += '<tr><td colspan="2" class="xpl-none">None yet</td></tr>';
  h += `<tr class="xpl-total"><td>Total</td><td class="xpl-n">${totalSpent}</td></tr>`;
  h += '</table></div>';

  h += '</div>'; // xpl-cols

  const sign = remaining > 0 ? '+' : '';
  h += `<div class="xpl-balance ${over ? 'xpl-over' : 'xpl-ok'}">`;
  h += `<span class="xpl-bal-lbl">Remaining</span>`;
  h += `<span class="xpl-bal-val">${sign}${remaining} XP</span>`;
  h += '</div>';
  h += '</div>'; // xpl-panel
  return h;
}

function renderOrdealsList(el, char) {
  const cOrdeals = normaliseCharOrdeals(char);

  let h = renderXPBreakdown(char);
  h += '<div class="ordeals-container" id="ordeals-list">';

  // Character-level ordeals
  h += '<div class="ordeals-section">';
  h += `<h3 class="ordeals-heading">Ordeals</h3>`;
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
  h += '<button class="qf-back-btn" id="qf-back">&larr; Back to XP Log</button>';
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
