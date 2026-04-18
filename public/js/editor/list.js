/* List view — character grid rendering and filtering */

import state from '../data/state.js';
import { esc, cardName, sortName } from '../data/helpers.js';

/**
 * Render the character card grid, respecting search and filter inputs.
 * Reads state.chars and state.dirty. Emits onclick for openChar (global).
 */
export function renderList(limitIds) {
  const grid = document.getElementById('char-grid');
  const search = document.querySelector('.list-search').value.toLowerCase();
  const clanF = document.getElementById('filter-clan').value;
  const covF = document.getElementById('filter-cov').value;

  let filtered = state.chars.map((c, i) => ({ c, i })).filter(({ c }) => {
    if (limitIds && !limitIds.includes(c._id)) return false;
    if (clanF && c.clan !== clanF) return false;
    if (covF && c.covenant !== covF) return false;
    if (search) {
      const hay = (c.name + ' ' + (c.moniker || '') + ' ' + (c.honorific || '') + ' ' + c.player + ' ' + (c.concept || '') + ' ' + (c.bloodline || '')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  filtered.sort((a, b) => sortName(a.c).localeCompare(sortName(b.c)));

  grid.innerHTML = filtered.map(({ c, i }) => {
    return `<button class="char-chip" onclick="openChar(${i})">${esc(cardName(c))}</button>`;
  }).join('');

  document.getElementById('list-count').textContent = filtered.length + ' / ' + state.chars.length + ' characters';
}

/**
 * Re-render the list (called from filter/search UI).
 */
let _limitIds = null;
export function setListLimit(ids) { _limitIds = ids; }
export function filterList() {
  renderList(_limitIds);
}
