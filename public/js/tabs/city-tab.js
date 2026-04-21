/* City tab — single-column layout.
 * Top:    Court office holders
 * Below:  Who's Who by covenant (alphabetical)
 * Map and Regents live in the Map tab.
 */

import { apiGet } from '../data/api.js';
import { esc, displayName, sortName, redactPlayer } from '../data/helpers.js';
import { clanIcon, covIcon } from '../data/helpers.js';

export async function renderCityTab(el) {
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let chars = [];
  try {
    chars = await apiGet('/api/characters/public');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  const CATEGORY_ORDER = ['Head of State', 'Primogen', 'Administrator', 'Socialite', 'Enforcer'];
  const courtHolders = chars.filter(c => CATEGORY_ORDER.includes(c.court_category))
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.court_category);
      const bi = CATEGORY_ORDER.indexOf(b.court_category);
      return ai - bi || sortName(a).localeCompare(sortName(b));
    });

  // Who's Who — grouped by covenant, alphabetical covenant order
  const covGroups = new Map();
  for (const c of chars) {
    const cov = c.covenant || 'Unaligned';
    if (!covGroups.has(cov)) covGroups.set(cov, []);
    covGroups.get(cov).push(c);
  }
  const sortedCovs = [...covGroups.keys()].sort((a, b) => a.localeCompare(b));

  let h = '<div class="city-col">';

  // ── Court ──────────────────────────────────────────────────────────────────
  h += '<div class="city-panel">';
  h += '<div class="city-panel-title">Court</div>';
  if (courtHolders.length) {
    h += '<div class="city-office-list">';
    for (const c of courtHolders) {
      h += '<div class="city-office-row">';
      h += `<span class="city-office-name">${esc(displayName(c))}</span>`;
      h += `<span class="city-office-position">${esc(c.court_category)}</span>`;
      h += '</div>';
    }
    h += '</div>';
  } else {
    h += '<p class="placeholder-msg city-placeholder">No court positions recorded yet.</p>';
  }
  h += '</div>';

  // ── Who's Who ──────────────────────────────────────────────────────────────
  h += '<div class="city-whos-who">';
  h += '<div class="city-panel-title">Who\'s Who</div>';

  for (const cov of sortedCovs) {
    const members = covGroups.get(cov);
    const sorted = [...members].sort((a, b) => sortName(a).localeCompare(sortName(b)));

    h += '<div class="city-cov-group">';
    h += `<div class="city-cov-heading">${covIcon(cov, 14)} <span>${esc(cov)}</span></div>`;
    h += '<div class="city-char-list">';
    for (const c of sorted) {
      h += '<div class="city-char-row">';
      h += `<span class="city-char-name">${esc(displayName(c))}${c.player ? ` <span class="city-char-player">(${esc(redactPlayer(c.player))})</span>` : ''}</span>`;
      h += '<span class="city-char-meta">';
      if (c.clan) h += `${clanIcon(c.clan, 12)}<span>${esc(c.clan)}</span>`;
      if (c.court_category) h += `<span class="city-char-position">${esc(c.court_category)}</span>`;
      h += '</span>';
      h += '</div>';
    }
    h += '</div>';
    h += '</div>';
  }

  h += '</div>'; // city-whos-who

  h += '</div>'; // city-col
  el.innerHTML = h;
}
