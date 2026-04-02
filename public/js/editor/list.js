/* List view — character grid rendering and filtering */

import state from '../data/state.js';
import { esc, clanIcon, covIcon, shortCov, displayName, sortName } from '../data/helpers.js';
import { xpLeft, xpEarned } from './xp.js';

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
    const bp = c.blood_potency || 1;
    const hum = c.humanity != null ? c.humanity : '?';
    const xpL = xpLeft(c);

    const isDirty = state.dirty.has(i) ? ' dirty' : '';
    const title = c.court_title ? `<span class="cc-tag title">${esc(c.court_title)}</span>` : '';
    const ci = covIcon(c.covenant, 28) + clanIcon(c.clan, 28);
    return `<div class="char-card${isDirty}" onclick="openChar(${i})">
      <div class="cc-top">
        <div style="display:flex;gap:4px;flex-shrink:0">${ci}</div>
        <div class="cc-identity"><span class="cc-name">${esc(displayName(c))}</span><br><span class="cc-player">${esc(c.player || '')}</span></div>
      </div>
      <div class="cc-mid">
        <span class="cc-tag cov">${covIcon(c.covenant, 14)} ${esc(shortCov(c.covenant))}</span>
        <span class="cc-tag clan">${clanIcon(c.clan, 14)} ${esc(c.clan || '?')}</span>
        ${c.bloodline ? `<span class="cc-tag">${esc(c.bloodline)}</span>` : ''}
        ${title}
      </div>
      <div class="cc-bot">
        <span>BP <span class="val">${bp}</span></span>
        <span>Hum <span class="val">${hum}</span></span>
        <span>XP <span class="val">${xpL}/${xpEarned(c)}</span></span>
      </div>
    </div>`;
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
