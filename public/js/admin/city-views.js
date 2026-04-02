/**
 * City domain views — two-column layout.
 * Left: Court, Ascendancy, Prestige. Right: Territories with residents.
 */

import { apiGet } from '../data/api.js';
import { calcTotalInfluence } from '../editor/domain.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { displayName, sortName, clanIcon, covIcon } from '../data/helpers.js';

const TERRITORIES = [
  { id: 'academy', name: 'The Academy', ambience: 'Curated', ambienceMod: +3 },
  { id: 'dockyards', name: 'The Dockyards', ambience: 'Settled', ambienceMod: 0 },
  { id: 'harbour', name: 'The Harbour', ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', ambience: 'Tended', ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', ambience: 'Tended', ambienceMod: +2 },
];

const TITLE_ORDER = ['Premier', 'Primogen', 'Administrator', 'Harpy', 'Protector', 'Regent'];

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

  container.innerHTML = `<div class="city-split">
    <div class="city-left">${renderCourt()}${renderAscendancy()}${renderPrestige()}</div>
    <div class="city-right">${renderTerritories()}</div>
  </div>`;
}

// ── Left column ──

function renderCourt() {
  const titled = chars.filter(c => c.court_title).sort((a, b) => {
    const ai = TITLE_ORDER.indexOf(a.court_title);
    const bi = TITLE_ORDER.indexOf(b.court_title);
    const orderDiff = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    if (orderDiff !== 0) return orderDiff;
    return sortName(a).localeCompare(sortName(b));
  });

  if (!titled.length) return '';

  let h = '<h3 class="city-section-title">Court</h3><div class="court-list">';
  for (const c of titled) {
    const territory = c.regent_territory ? ' — Regent of ' + esc(c.regent_territory) : '';
    h += `<div class="court-row">
      <span class="court-title">${esc(c.court_title)}</span>
      <span class="court-name">${esc(displayName(c))}</span>
      <span class="court-detail">${esc(c.clan || '')}${territory}</span>
    </div>`;
  }
  h += '</div>';
  return h;
}

function renderAscendancy() {
  // Hardcoded snapshot from Game 2 — will be dynamic once game cycles are implemented
  const eminence = [
    { name: 'Mekhet', val: 17 },
    { name: 'Ventrue', val: 12 },
    { name: 'Gangrel', val: 11 },
    { name: 'Daeva', val: 7 },
    { name: 'Nosferatu', val: 5 },
  ];
  const ascendancy = [
    { name: 'Circle of the Crone', val: 17 },
    { name: 'Lancea et Sanctum', val: 14 },
    { name: 'Carthian Movement', val: 12 },
    { name: 'Invictus', val: 9 },
  ];

  let h = '<h3 class="city-section-title">Eminence &amp; Ascendancy <span class="city-game-tag">Game 2</span></h3>';
  h += '<div class="asc-columns">';

  h += '<div class="asc-block"><div class="asc-label">Eminence (Clan)</div>';
  for (const e of eminence) {
    h += `<div class="asc-card">${clanIcon(e.name, 28)}<span class="asc-name">${esc(e.name)}</span><span class="asc-val">${e.val}</span></div>`;
  }
  h += '</div>';

  h += '<div class="asc-block"><div class="asc-label">Ascendancy (Covenant)</div>';
  for (const a of ascendancy) {
    h += `<div class="asc-card">${covIcon(a.name, 28)}<span class="asc-name">${esc(a.name)}</span><span class="asc-val">${a.val}</span></div>`;
  }
  h += '</div>';

  h += '</div>';
  return h;
}

function renderPrestige() {
  const ranked = chars.map(c => {
    const st = c.status || {};
    const clan = st.clan || 0;
    const cov = st.covenant || 0;
    return {
      name: displayName(c),
      clan: c.clan || '',
      covenant: c.covenant || '',
      clanStatus: clan,
      covStatus: cov,
      prestige: clan + cov,
      influence: calcTotalInfluence(c),
    };
  }).filter(r => r.prestige > 0)
    .sort((a, b) => b.prestige - a.prestige || b.influence - a.influence)
    .slice(0, 6);

  if (!ranked.length) return '';

  let h = '<h3 class="city-section-title">Prestige</h3>';
  h += '<table class="infl-table"><thead><tr><th>Character</th><th>Clan</th><th>Covenant</th><th>Clan</th><th>Cov</th><th>Total</th></tr></thead><tbody>';
  for (const r of ranked) {
    h += `<tr>
      <td class="infl-name">${esc(r.name)}</td>
      <td>${esc(r.clan)}</td>
      <td>${esc(r.covenant)}</td>
      <td class="infl-num">${r.clanStatus || '\u2014'}</td>
      <td class="infl-num">${r.covStatus || '\u2014'}</td>
      <td class="infl-num infl-total">${r.prestige}</td>
    </tr>`;
  }
  h += '</tbody></table>';
  return h;
}

// ── Right column ──

function renderTerritories() {
  const regents = chars.filter(c => c.regent_territory);
  let h = '<h3 class="city-section-title">Territories</h3>';

  for (const t of TERRITORIES) {
    const regent = regents.find(c => c.regent_territory === t.name);
    const modSign = t.ambienceMod >= 0 ? '+' : '';
    const ltName = regent?.regent_lieutenant;
    const lt = ltName ? chars.find(c => c.name === ltName) : null;
    const ltDisplay = lt ? esc(displayName(lt)) : ltName ? esc(ltName) : null;

    h += `<div class="terr-card">
      <div class="terr-name">${esc(t.name)}</div>
      <div class="terr-ambience">${esc(t.ambience)} (${modSign}${t.ambienceMod})</div>
      <div class="terr-regent">Regent: ${regent ? esc(displayName(regent)) : '<span class="terr-vacant">Vacant</span>'}</div>
      ${ltDisplay ? `<div class="terr-lt">Lieutenant: ${ltDisplay}</div>` : ''}
    </div>`;
  }

  return h;
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
