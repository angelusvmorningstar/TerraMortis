/* City tab — full-width map + who's who of active characters. */

import { apiGet } from '../data/api.js';
import { esc, displayName, sortName } from '../data/helpers.js';
import { clanIcon, covIcon } from '../data/helpers.js';

const COVENANT_ORDER = [
  'Invictus', 'Lancea et Sanctum', 'Ordo Dracul',
  'Circle of the Crone', 'Carthian Movement', 'Unaligned',
];

export async function renderCityTab(el) {
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let chars = [];
  try {
    chars = await apiGet('/api/characters/public');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  let h = '';

  // ── Map ──
  h += '<div class="city-map-wrap">';
  h += '<img class="city-map" src="/assets/Terra Mortis Map.png" alt="Terra Mortis City Map">';
  h += '</div>';

  // ── Who's Who ──
  h += '<div class="city-whos-who">';
  h += '<h3 class="city-section-title">Who\'s Who</h3>';

  // Group by covenant
  const groups = new Map();
  for (const cov of COVENANT_ORDER) groups.set(cov, []);

  for (const c of chars) {
    const cov = c.covenant || 'Unaligned';
    if (!groups.has(cov)) groups.set(cov, []);
    groups.get(cov).push(c);
  }

  for (const [cov, members] of groups) {
    if (!members.length) continue;
    const sorted = [...members].sort((a, b) => sortName(a).localeCompare(sortName(b)));

    h += '<div class="city-cov-group">';
    h += `<div class="city-cov-heading">${covIcon(cov, 14)} ${esc(cov)}</div>`;
    h += '<div class="city-char-list">';
    for (const c of sorted) {
      h += '<div class="city-char-row">';
      h += `<span class="city-char-name">${esc(displayName(c))}</span>`;
      h += '<span class="city-char-meta">';
      if (c.clan) h += `${clanIcon(c.clan, 12)}<span>${esc(c.clan)}</span>`;
      if (c.court_position) h += `<span class="city-char-position">${esc(c.court_position)}</span>`;
      h += '</span>';
      h += '</div>';
    }
    h += '</div>';
    h += '</div>';
  }

  h += '</div>';
  el.innerHTML = h;
}
