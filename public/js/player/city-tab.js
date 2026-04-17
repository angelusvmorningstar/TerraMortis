/* City tab — two-panel layout.
 * Left:  Court office holders → Map → Regents
 * Right: Who's Who by covenant (alphabetical)
 */

import { apiGet } from '../data/api.js';
import { esc, displayName, sortName, redactPlayer } from '../data/helpers.js';
import { clanIcon, covIcon } from '../data/helpers.js';

export async function renderCityTab(el, territories) {
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let chars = [];
  try {
    chars = await apiGet('/api/characters/public');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  // Load territories if not passed (standalone call or legacy)
  let terrs = territories || [];
  if (!terrs.length) { try { terrs = await apiGet('/api/territories'); } catch { terrs = []; } }

  const CATEGORY_ORDER = ['Head of State', 'Primogen', 'Administrator', 'Socialite', 'Enforcer'];
  const courtHolders = chars.filter(c => CATEGORY_ORDER.includes(c.court_category))
    .sort((a, b) => {
      const ai = CATEGORY_ORDER.indexOf(a.court_category);
      const bi = CATEGORY_ORDER.indexOf(b.court_category);
      return ai - bi || sortName(a).localeCompare(sortName(b));
    });
  // Derive regents from territory documents (single source of truth)
  const regents = terrs
    .filter(t => t.regent_id)
    .map(t => {
      const c = chars.find(ch => String(ch._id) === t.regent_id);
      return { territory: t.name || t.id, char: c };
    })
    .sort((a, b) => a.territory.localeCompare(b.territory));

  // Who's Who — grouped by covenant, alphabetical covenant order
  const covGroups = new Map();
  for (const c of chars) {
    const cov = c.covenant || 'Unaligned';
    if (!covGroups.has(cov)) covGroups.set(cov, []);
    covGroups.get(cov).push(c);
  }
  const sortedCovs = [...covGroups.keys()].sort((a, b) => a.localeCompare(b));

  let h = '<div class="city-split">';

  // ── Left pane ──────────────────────────────────────────────────────────────
  h += '<div class="city-left">';

  // Court office holders
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

  // Map
  h += '<div class="city-map-wrap">';
  h += '<img class="city-map" src="/assets/Terra Mortis Map.png" alt="Terra Mortis City Map">';
  h += '</div>';

  // Regents
  h += '<div class="city-panel">';
  h += '<div class="city-panel-title">Regents</div>';
  if (regents.length) {
    h += '<div class="city-regent-list">';
    for (const r of regents) {
      h += '<div class="city-regent-row">';
      h += `<span class="city-regent-territory">${esc(r.territory)}</span>`;
      h += `<span class="city-regent-name">${r.char ? esc(displayName(r.char)) : '<span class="city-placeholder">(vacant)</span>'}</span>`;
      h += '</div>';
    }
    h += '</div>';
  } else {
    h += '<p class="placeholder-msg city-placeholder">No regents assigned yet.</p>';
  }
  h += '</div>';

  h += '</div>'; // city-left

  // ── Right pane — Who's Who ─────────────────────────────────────────────────
  h += '<div class="city-right">';
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

  h += '</div>'; // city-right

  h += '</div>'; // city-split
  el.innerHTML = h;
}
