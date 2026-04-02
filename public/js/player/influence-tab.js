/**
 * Influence tab — territory influence spending.
 * Separate from downtime form. Budget derived from character merits and status.
 */

import { esc } from '../data/helpers.js';
import { FEEDING_TERRITORIES } from './downtime-data.js';

const INFLUENCE_TERRITORIES = FEEDING_TERRITORIES.filter(t => !t.includes('Barrens'));
const INFLUENCE_MERIT_NAMES = ['Allies', 'Retainer', 'Mentor', 'Resources', 'Staff', 'Contacts', 'Status'];

let currentChar = null;
let infVals = {}; // { territory_key: number }

export function renderInfluenceTab(container, char) {
  currentChar = char;
  if (!container || !char) {
    if (container) container.innerHTML = '<p class="placeholder-msg">Select a character to manage influence.</p>';
    return;
  }
  render(container);
}

function getInfluenceBudget() {
  const c = currentChar;
  let total = 0;
  total += (c.status?.clan || 0);
  total += (c.status?.covenant || 0);
  for (const m of (c.merits || [])) {
    if (m.category !== 'influence') continue;
    if (!INFLUENCE_MERIT_NAMES.includes(m.name)) continue;
    if (m.rating >= 5) total += 2;
    else if (m.rating >= 3) total += 1;
  }
  for (const m of (c.merits || [])) {
    if (m.name === 'Mystery Cult Initiation' && m.rating >= 5) total += 1;
  }
  return total;
}

function getTotalSpent() {
  let total = 0;
  for (const terr of INFLUENCE_TERRITORIES) {
    const tk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    total += Math.abs(infVals[tk] || 0);
  }
  return total;
}

function render(container) {
  const budget = getInfluenceBudget();
  const remaining = budget - getTotalSpent();

  let h = '<div class="influence-wrap">';
  h += '<h3 class="influence-title">Influence: Territory Spending</h3>';
  h += '<p class="influence-desc">Positive values improve a Territory\'s Ambience. Negative values degrade it. Each point spent costs 1 Influence from your monthly budget.</p>';

  h += '<div class="dt-influence-grid">';
  h += `<div class="dt-influence-budget">`;
  h += `<span class="dt-influence-remaining${remaining < 0 ? ' dt-influence-over' : ''}">${remaining}</span>`;
  h += ` / ${budget} Influence remaining`;
  h += '</div>';

  for (const terr of INFLUENCE_TERRITORIES) {
    const tk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const val = infVals[tk] || 0;
    h += '<div class="dt-influence-row">';
    h += `<span class="dt-influence-terr">${esc(terr)}</span>`;
    h += '<span class="dt-influence-control">';
    h += `<button type="button" class="dt-inf-btn" data-inf-terr="${tk}" data-inf-dir="-1">\u2212</button>`;
    h += `<span class="dt-inf-val" id="inf-val-${tk}">${val}</span>`;
    h += `<button type="button" class="dt-inf-btn" data-inf-terr="${tk}" data-inf-dir="1">+</button>`;
    h += '</span>';
    h += '</div>';
  }
  h += '</div>';
  h += '</div>';

  container.innerHTML = h;
  wireEvents(container);
}

function wireEvents(container) {
  container.querySelectorAll('[data-inf-terr]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tk = btn.dataset.infTerr;
      const dir = parseInt(btn.dataset.infDir);
      infVals[tk] = (infVals[tk] || 0) + dir;

      // Update display without full re-render
      const valEl = document.getElementById(`inf-val-${tk}`);
      if (valEl) valEl.textContent = infVals[tk];

      const budget = getInfluenceBudget();
      const remaining = budget - getTotalSpent();
      const remEl = container.querySelector('.dt-influence-remaining');
      if (remEl) {
        remEl.textContent = remaining;
        remEl.classList.toggle('dt-influence-over', remaining < 0);
      }
    });
  });
}

/** Get influence spend data for inclusion in downtime submission or separate storage. */
export function getInfluenceData() {
  return { ...infVals };
}
