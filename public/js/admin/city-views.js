/**
 * City domain views — territory overview, influence rankings, court holders.
 * Renders into the City domain section of the admin app.
 */

import { apiGet } from '../data/api.js';
import { calcTotalInfluence } from '../editor/domain.js';
import { applyDerivedMerits } from '../editor/mci.js';

const TERRITORIES = [
  { id: 'academy', name: 'The Academy', ambience: 'Curated', ambienceMod: +3 },
  { id: 'dockyards', name: 'The Dockyards', ambience: 'Settled', ambienceMod: 0 },
  { id: 'harbour', name: 'The Harbour', ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', ambience: 'Tended', ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', ambience: 'Tended', ambienceMod: +2 },
];

const TITLE_ORDER = ['Head of State', 'Primogen', 'Socialite', 'Enforcer', 'Administrator', 'Regent'];

let chars = [];

export async function initCityView() {
  const container = document.getElementById('city-content');
  if (!container) return;

  container.innerHTML = '<p class="placeholder">Loading city data...</p>';

  try {
    chars = await apiGet('/api/characters');
    chars.forEach(c => applyDerivedMerits(c));
  } catch (err) {
    container.innerHTML = '<p class="placeholder">Failed to load character data.</p>';
    return;
  }

  container.innerHTML = renderTerritories() + renderCourt() + renderInfluence();
}

function renderTerritories() {
  const regents = chars.filter(c => c.court_title === 'Regent' && c.regent_territory);
  let h = '<h3 class="city-section-title">Territories</h3><div class="terr-grid">';

  for (const t of TERRITORIES) {
    const regent = regents.find(c => c.regent_territory === t.name);
    const modSign = t.ambienceMod >= 0 ? '+' : '';
    h += `<div class="terr-card">
      <div class="terr-name">${esc(t.name)}</div>
      <div class="terr-ambience">${esc(t.ambience)} (${modSign}${t.ambienceMod})</div>
      <div class="terr-regent">${regent ? esc(regent.name) : '<span class="terr-vacant">Vacant</span>'}</div>
    </div>`;
  }

  h += '</div>';
  return h;
}

function renderCourt() {
  const titled = chars.filter(c => c.court_title).sort((a, b) => {
    const ai = TITLE_ORDER.indexOf(a.court_title);
    const bi = TITLE_ORDER.indexOf(b.court_title);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  if (!titled.length) return '';

  let h = '<h3 class="city-section-title">Court</h3><div class="court-list">';
  for (const c of titled) {
    const territory = c.court_title === 'Regent' && c.regent_territory ? ' — ' + esc(c.regent_territory) : '';
    h += `<div class="court-row">
      <span class="court-title">${esc(c.court_title)}</span>
      <span class="court-name">${esc(c.name)}</span>
      <span class="court-detail">${esc(c.clan || '')}${territory}</span>
    </div>`;
  }
  h += '</div>';
  return h;
}

function renderInfluence() {
  const ranked = chars.map(c => ({
    name: c.name,
    clan: c.clan || '',
    covenant: c.covenant || '',
    influence: calcTotalInfluence(c),
    cityStatus: (c.status || {}).city || 0,
  })).filter(r => r.influence > 0).sort((a, b) => b.influence - a.influence);

  if (!ranked.length) return '';

  let h = '<h3 class="city-section-title">Influence Rankings</h3>';
  h += '<table class="infl-table"><thead><tr><th>Character</th><th>Clan</th><th>Covenant</th><th>City Status</th><th>Influence</th></tr></thead><tbody>';
  for (const r of ranked) {
    h += `<tr>
      <td class="infl-name">${esc(r.name)}</td>
      <td>${esc(r.clan)}</td>
      <td>${esc(r.covenant)}</td>
      <td class="infl-num">${r.cityStatus || '\u2014'}</td>
      <td class="infl-num infl-total">${r.influence}</td>
    </tr>`;
  }
  h += '</tbody></table>';
  return h;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
