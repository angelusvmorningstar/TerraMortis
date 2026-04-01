/* Ordeals tab — shows player-level and character-level ordeal status */

import { apiGet } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';

// Ordeal definitions with display info
const PLAYER_ORDEALS = [
  { key: 'setting', label: 'Setting', altKey: 'lore',
    desc: 'Demonstrate knowledge of the game setting. 3 XP to all your characters.' },
  { key: 'rules', label: 'Rules',
    desc: 'Demonstrate knowledge of VtR 2e rules. 3 XP to all your characters. Unlocks dice roller in the game app.' },
  { key: 'covenant', label: 'Covenant',
    desc: 'Demonstrate knowledge of your covenant. 3 XP to characters in that covenant.' },
];

const CHAR_ORDEALS = [
  { key: 'questionnaire', label: 'Questionnaire',
    desc: 'Complete the character questionnaire. 3 XP to this character.' },
  { key: 'history', label: 'History',
    desc: 'Write your character history. 3 XP to this character.' },
];

let playerDoc = null;

export async function initOrdeals(char, chars) {
  const el = document.getElementById('tab-ordeals');
  if (!el) return;

  // Fetch player doc for player-level ordeals (cache after first load)
  if (!playerDoc) {
    try {
      playerDoc = await apiGet('/api/players/me');
    } catch {
      playerDoc = { ordeals: {} };
    }
  }

  renderOrdeals(el, char);
}

function renderOrdeals(el, char) {
  const pOrdeals = playerDoc?.ordeals || {};
  // Character ordeals — old format is array, new format is object
  const cOrdeals = normaliseCharOrdeals(char);

  let h = '<div class="ordeals-container">';

  // Character-level ordeals
  h += '<div class="ordeals-section">';
  h += `<h3 class="ordeals-heading">${esc(displayName(char))}</h3>`;
  for (const def of CHAR_ORDEALS) {
    const status = cOrdeals[def.key] || { status: 'not_started' };
    h += ordealCard(def, status);
  }
  h += '</div>';

  // Player-level ordeals
  h += '<div class="ordeals-section">';
  h += '<h3 class="ordeals-heading">Player Ordeals</h3>';
  for (const def of PLAYER_ORDEALS) {
    // Check both the canonical key and the alt key (lore → setting)
    const status = pOrdeals[def.key] || pOrdeals[def.altKey] || fallbackFromChar(cOrdeals, def) || { status: 'not_started' };
    h += ordealCard(def, status);
  }
  h += '</div>';

  h += '</div>';
  el.innerHTML = h;
}

function ordealCard(def, status) {
  const done = status.status === 'approved' || status.complete === true;
  const pending = status.status === 'pending';
  const stateClass = done ? 'done' : pending ? 'pending' : 'incomplete';
  const stateLabel = done ? 'Complete' : pending ? 'Pending Review' : 'Not Started';
  const icon = done ? '&#10003;' : pending ? '&#9679;' : '&#9675;';
  const xp = done ? '+3 XP' : '';

  return `<div class="ordeal-card ${stateClass}">
    <div class="ordeal-icon">${icon}</div>
    <div class="ordeal-info">
      <div class="ordeal-label">${esc(def.label)}</div>
      <div class="ordeal-desc">${esc(def.desc)}</div>
    </div>
    <div class="ordeal-status">
      <span class="ordeal-state">${stateLabel}</span>
      ${xp ? `<span class="ordeal-xp">${xp}</span>` : ''}
    </div>
  </div>`;
}

// Convert old array format [{ name, complete }] to object format { key: { status } }
function normaliseCharOrdeals(char) {
  const ordeals = char.ordeals;
  if (!ordeals) return {};

  // Already object format
  if (!Array.isArray(ordeals)) return ordeals;

  // Array format → object
  const out = {};
  for (const o of ordeals) {
    out[o.name] = {
      status: o.complete ? 'approved' : 'not_started',
      complete: o.complete,
    };
  }
  return out;
}

// Fall back to character-level data for player ordeals (during transition)
function fallbackFromChar(cOrdeals, def) {
  return cOrdeals[def.key] || (def.altKey ? cOrdeals[def.altKey] : null);
}

export function resetPlayerDoc() {
  playerDoc = null;
}
