/**
 * City domain views — two-column layout.
 * Left: Court (editable), Ascendancy, Prestige (4 views).
 * Right: Territories with editable regents/lieutenants.
 */

import { apiGet, apiPut, apiPost } from '../data/api.js';
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

const TITLE_ORDER = ['Premier', 'Primogen', 'Administrator', 'Harpy', 'Protector'];
const COURT_TITLES = ['', 'Premier', 'Primogen', 'Administrator', 'Harpy', 'Protector'];
const CLANS = ['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue'];
const COVENANTS = ['Carthian Movement', 'Circle of the Crone', 'Invictus', 'Lancea et Sanctum', 'Ordo Dracul'];

let chars = [];
let terrDocs = [];           // territory documents from /api/territories
let _terrExpanded = new Set(); // territory ids currently expanded
let _feedingEdits = {};      // terrId -> charId[] (working copy while editing)
let prestigeView = 0; // 0-3 for the four views

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

  try {
    terrDocs = await apiGet('/api/territories');
  } catch { terrDocs = []; }

  renderCity(container);
}

function renderCity(container) {
  container.innerHTML = `<div class="city-split">
    <div class="city-left">${renderCourt()}${renderAscendancy()}${renderPrestige()}</div>
    <div class="city-right">${renderTerritories()}</div>
  </div>`;
  wireEvents(container);
}

// ══════════════════════════════════════
//  COURT (editable)
// ══════════════════════════════════════

function renderCourt() {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const titled = active.filter(c => c.court_title).sort((a, b) => {
    const ai = TITLE_ORDER.indexOf(a.court_title);
    const bi = TITLE_ORDER.indexOf(b.court_title);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || sortName(a).localeCompare(sortName(b));
  });

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

  // Edit section
  h += '<div class="court-edit">';
  h += '<button class="city-edit-toggle" id="court-edit-toggle">Edit Court Positions</button>';
  h += '<div class="court-edit-panel" id="court-edit-panel" style="display:none">';
  h += '<div class="court-edit-grid">';
  for (const title of COURT_TITLES) {
    if (!title) continue;
    const holder = active.find(c => c.court_title === title);
    h += `<div class="court-edit-row">`;
    h += `<span class="court-edit-label">${esc(title)}</span>`;
    h += `<select class="court-edit-sel" data-court-title="${esc(title)}">`;
    h += '<option value="">— Vacant —</option>';
    for (const c of active) {
      const sel = holder && holder._id === c._id ? ' selected' : '';
      h += `<option value="${esc(c._id)}"${sel}>${esc(displayName(c))}</option>`;
    }
    h += '</select></div>';
  }
  h += '</div>';
  h += '<button class="city-save-btn" id="court-save">Save Court</button>';
  h += '<span class="city-save-status" id="court-save-status"></span>';
  h += '</div></div>';

  return h;
}

// ══════════════════════════════════════
//  EMINENCE & ASCENDANCY
// ══════════════════════════════════════

function renderAscendancy() {
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
  h += '</div></div>';
  return h;
}

// ══════════════════════════════════════
//  PRESTIGE (4 views)
// ══════════════════════════════════════

function getPrestigeData() {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));

  // Faction sizes
  const clanSize = {};
  const covSize = {};
  for (const c of active) {
    if (c.clan) clanSize[c.clan] = (clanSize[c.clan] || 0) + 1;
    if (c.covenant) covSize[c.covenant] = (covSize[c.covenant] || 0) + 1;
  }

  // Eminence/ascendancy totals (for tiebreak view 2)
  const clanEminence = {};
  const covAscendancy = {};
  for (const c of active) {
    const cs = c.status?.clan || 0;
    const cvs = c.status?.covenant || 0;
    if (c.clan) clanEminence[c.clan] = (clanEminence[c.clan] || 0) + (c.status?.city || 0);
    if (c.covenant) covAscendancy[c.covenant] = (covAscendancy[c.covenant] || 0) + (c.status?.city || 0);
  }

  return active.map(c => {
    const st = c.status || {};
    const clan = st.clan || 0;
    const cov = st.covenant || 0;
    const influence = calcTotalInfluence(c);
    const cSize = clanSize[c.clan] || 1;
    const cvSize = covSize[c.covenant] || 1;

    return {
      name: displayName(c),
      clan: c.clan || '',
      covenant: c.covenant || '',
      clanStatus: clan,
      covStatus: cov,
      prestige: clan + cov,
      influence,
      // View 3: weighted (+members)
      weighted: clan + cov + cSize + cvSize,
      // View 4: highly weighted (×members)
      highWeighted: (clan * cSize) + (cov * cvSize),
      // Tiebreakers
      clanEminence: clanEminence[c.clan] || 0,
      covAscendancy: covAscendancy[c.covenant] || 0,
      clanSize: cSize,
      covSize: cvSize,
    };
  }).filter(r => r.prestige > 0);
}

const PRESTIGE_VIEWS = [
  { label: 'Standard', desc: 'Clan + Covenant status, tiebreak: influence generated', sort: (a, b) => b.prestige - a.prestige || b.influence - a.influence },
  { label: 'Political', desc: 'Clan + Covenant status, tiebreak: ascendancy + eminence order', sort: (a, b) => b.prestige - a.prestige || (b.clanEminence + b.covAscendancy) - (a.clanEminence + a.covAscendancy) },
  { label: 'Weighted', desc: 'Status + faction member count', sort: (a, b) => b.weighted - a.weighted || b.influence - a.influence, valKey: 'weighted' },
  { label: 'Power', desc: 'Each status point × faction members', sort: (a, b) => b.highWeighted - a.highWeighted || b.influence - a.influence, valKey: 'highWeighted' },
];

function renderPrestige() {
  const data = getPrestigeData();
  const view = PRESTIGE_VIEWS[prestigeView];
  const ranked = data.slice().sort(view.sort).slice(0, 6);

  let h = '<h3 class="city-section-title">Prestige</h3>';

  // View selector
  h += '<div class="prestige-views">';
  for (let i = 0; i < PRESTIGE_VIEWS.length; i++) {
    const on = i === prestigeView ? ' prestige-view-on' : '';
    h += `<button class="prestige-view-btn${on}" data-prestige-view="${i}">${esc(PRESTIGE_VIEWS[i].label)}</button>`;
  }
  h += '</div>';
  h += `<p class="prestige-view-desc">${esc(view.desc)}</p>`;

  const valKey = view.valKey || 'prestige';
  const valLabel = view.valKey ? PRESTIGE_VIEWS[prestigeView].label : 'Total';

  h += '<table class="infl-table"><thead><tr><th>#</th><th>Character</th><th>Clan</th><th>Covenant</th><th>Clan St</th><th>Cov St</th><th>' + esc(valLabel) + '</th></tr></thead><tbody>';
  ranked.forEach((r, i) => {
    h += `<tr>
      <td class="infl-num">${i + 1}</td>
      <td class="infl-name">${esc(r.name)}</td>
      <td>${esc(r.clan)}</td>
      <td>${esc(r.covenant)}</td>
      <td class="infl-num">${r.clanStatus || '\u2014'}</td>
      <td class="infl-num">${r.covStatus || '\u2014'}</td>
      <td class="infl-num infl-total">${r[valKey]}</td>
    </tr>`;
  });
  h += '</tbody></table>';
  return h;
}

// ══════════════════════════════════════
//  TERRITORIES (expandable — regents/lieutenants + feeding rights)
// ══════════════════════════════════════

function getFeedingRights(terrId) {
  if (_feedingEdits[terrId] !== undefined) return _feedingEdits[terrId];
  const doc = terrDocs.find(d => d.id === terrId);
  return doc?.feeding_rights || [];
}

function renderFeedingChips(terrId) {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const rights = getFeedingRights(terrId);
  if (!rights.length) return '<span class="terr-feed-empty">None assigned</span>';
  return rights.map((cid, i) => {
    const c = active.find(x => String(x._id) === String(cid));
    const name = c ? esc(displayName(c)) : esc(String(cid));
    return `<span class="terr-chip">${name}<button class="terr-chip-rm" data-terr-feed-rm="${esc(terrId)}" data-feed-idx="${i}">&times;</button></span>`;
  }).join('');
}

function renderFeedingDropdown(terrId) {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const rights = getFeedingRights(terrId);
  const opts = active
    .filter(c => !rights.includes(String(c._id)))
    .map(c => `<option value="${esc(String(c._id))}">${esc(displayName(c))}</option>`)
    .join('');
  return `<select id="terr-feed-sel-${esc(terrId)}" class="terr-feed-sel">
    <option value="">\u2014 Add character \u2014</option>${opts}
  </select>`;
}

function renderTerritories() {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const regents = active.filter(c => c.regent_territory);
  let h = '<h3 class="city-section-title">Territories</h3>';

  for (const t of TERRITORIES) {
    const regent = regents.find(c => c.regent_territory === t.name);
    const modSign = t.ambienceMod >= 0 ? '+' : '';
    const ltName = regent?.regent_lieutenant;
    const lt = ltName ? active.find(c => c.name === ltName) : null;
    const ltDisplay = lt ? esc(displayName(lt)) : ltName ? esc(ltName) : null;
    const open = _terrExpanded.has(t.id);

    h += `<div class="terr-card${open ? ' terr-card-open' : ''}" id="terr-card-${esc(t.id)}">`;
    h += `<button class="terr-card-hd" data-terr-toggle="${esc(t.id)}">`;
    h += `<div class="terr-hd-info">`;
    h += `<div class="terr-name">${esc(t.name)}</div>`;
    h += `<div class="terr-ambience">${esc(t.ambience)} (${modSign}${t.ambienceMod})</div>`;
    h += `<div class="terr-regent">Regent: ${regent ? `<span class="terr-regent-name">${esc(displayName(regent))}</span>` : '<span class="terr-vacant">Vacant</span>'}</div>`;
    if (ltDisplay) h += `<div class="terr-lt">Lieutenant: ${ltDisplay}</div>`;
    h += `</div>`;
    h += `<span class="terr-chev">${open ? '\u25B2' : '\u25BC'}</span>`;
    h += `</button>`;

    if (open) {
      h += `<div class="terr-expand">`;
      h += `<div class="terr-feed-section">`;
      h += `<div class="terr-feed-label">Feeding Rights</div>`;
      h += `<div class="terr-feed-list" id="terr-feed-list-${esc(t.id)}">${renderFeedingChips(t.id)}</div>`;
      h += `<div class="terr-feed-add">`;
      h += renderFeedingDropdown(t.id);
      h += `<button class="terr-feed-add-btn" data-terr-feed-add="${esc(t.id)}">Add</button>`;
      h += `</div>`;
      h += `<div class="terr-feed-actions">`;
      h += `<button class="city-save-btn" data-terr-feed-save="${esc(t.id)}">Save Feeding Rights</button>`;
      h += `<span class="city-save-status" id="terr-feed-status-${esc(t.id)}"></span>`;
      h += `</div>`;
      h += `</div>`;
      h += `</div>`;
    }

    h += `</div>`;
  }

  // Edit section
  h += '<button class="city-edit-toggle" id="terr-edit-toggle">Edit Regents &amp; Lieutenants</button>';
  h += '<div class="terr-edit-panel" id="terr-edit-panel" style="display:none">';
  for (const t of TERRITORIES) {
    const regent = active.find(c => c.regent_territory === t.name);
    h += `<div class="terr-edit-block" data-territory="${esc(t.name)}">`;
    h += `<div class="terr-edit-name">${esc(t.name)}</div>`;
    h += '<div class="terr-edit-row">';
    h += '<label>Regent:</label>';
    h += `<select class="terr-edit-sel" data-terr-role="regent" data-terr-name="${esc(t.name)}">`;
    h += '<option value="">— Vacant —</option>';
    for (const c of active) {
      const sel = regent && regent._id === c._id ? ' selected' : '';
      h += `<option value="${esc(c._id)}"${sel}>${esc(displayName(c))}</option>`;
    }
    h += '</select></div>';

    h += '<div class="terr-edit-row">';
    h += '<label>Lieutenant:</label>';
    h += `<select class="terr-edit-sel" data-terr-role="lieutenant" data-terr-name="${esc(t.name)}">`;
    h += '<option value="">— None —</option>';
    for (const c of active) {
      const sel = regent?.regent_lieutenant === c.name ? ' selected' : '';
      h += `<option value="${esc(c.name)}"${sel}>${esc(displayName(c))}</option>`;
    }
    h += '</select></div>';
    h += '</div>';
  }
  h += '<button class="city-save-btn" id="terr-save">Save Territories</button>';
  h += '<span class="city-save-status" id="terr-save-status"></span>';
  h += '</div>';

  return h;
}

// ══════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════

function wireEvents(container) {
  // Court edit toggle
  container.querySelector('#court-edit-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('court-edit-panel');
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });

  // Court save
  container.querySelector('#court-save')?.addEventListener('click', saveCourt);

  // Territory edit toggle
  container.querySelector('#terr-edit-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('terr-edit-panel');
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  });

  // Territory save
  container.querySelector('#terr-save')?.addEventListener('click', saveTerritories);

  // Prestige view switcher
  container.querySelectorAll('[data-prestige-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      prestigeView = parseInt(btn.dataset.prestigeView);
      renderCity(container);
    });
  });

  // Territory card expand/collapse + feeding rights (delegated on container — guard against duplicate wiring)
  if (container._terrDelegated) return;
  container._terrDelegated = true;
  container.addEventListener('click', e => {
    // Expand/collapse card
    const toggle = e.target.closest('[data-terr-toggle]');
    if (toggle) {
      const terrId = toggle.dataset.terrToggle;
      if (_terrExpanded.has(terrId)) {
        _terrExpanded.delete(terrId);
      } else {
        _terrExpanded.add(terrId);
        // Initialise edit state from stored doc if not already editing
        if (_feedingEdits[terrId] === undefined) {
          const doc = terrDocs.find(d => d.id === terrId);
          _feedingEdits[terrId] = [...(doc?.feeding_rights || [])];
        }
      }
      patchTerritories(container);
      return;
    }

    // Remove a feeding rights chip
    const rmBtn = e.target.closest('[data-terr-feed-rm]');
    if (rmBtn) {
      const terrId = rmBtn.dataset.terrFeedRm;
      const idx = parseInt(rmBtn.dataset.feedIdx);
      _feedingEdits[terrId] = (_feedingEdits[terrId] || []).filter((_, i) => i !== idx);
      patchFeedingList(terrId);
      patchFeedingDropdown(terrId);
      return;
    }

    // Add a character to feeding rights
    const addBtn = e.target.closest('[data-terr-feed-add]');
    if (addBtn) {
      const terrId = addBtn.dataset.terrFeedAdd;
      const sel = document.getElementById('terr-feed-sel-' + terrId);
      if (sel?.value) {
        if (!_feedingEdits[terrId]) _feedingEdits[terrId] = [];
        _feedingEdits[terrId] = [..._feedingEdits[terrId], sel.value];
        sel.value = '';
        patchFeedingList(terrId);
        patchFeedingDropdown(terrId);
      }
      return;
    }

    // Save feeding rights
    const saveBtn = e.target.closest('[data-terr-feed-save]');
    if (saveBtn) {
      saveFeedingRights(saveBtn.dataset.terrFeedSave);
      return;
    }
  });
}

function patchTerritories(container) {
  const right = container.querySelector('.city-right');
  if (!right) { renderCity(container); return; }
  right.innerHTML = renderTerritories();
}

function patchFeedingList(terrId) {
  const el = document.getElementById('terr-feed-list-' + terrId);
  if (el) el.innerHTML = renderFeedingChips(terrId);
}

function patchFeedingDropdown(terrId) {
  const el = document.getElementById('terr-feed-sel-' + terrId);
  if (!el) return;
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const rights = _feedingEdits[terrId] || [];
  el.innerHTML = `<option value="">\u2014 Add character \u2014</option>` +
    active
      .filter(c => !rights.includes(String(c._id)))
      .map(c => `<option value="${esc(String(c._id))}">${esc(displayName(c))}</option>`)
      .join('');
}

async function saveFeedingRights(terrId) {
  const status = document.getElementById('terr-feed-status-' + terrId);
  const rights = _feedingEdits[terrId] || [];
  try {
    await apiPost('/api/territories', { id: terrId, feeding_rights: rights });
    // Update local cache
    const idx = terrDocs.findIndex(d => d.id === terrId);
    if (idx >= 0) terrDocs[idx] = { ...terrDocs[idx], feeding_rights: rights };
    else terrDocs.push({ id: terrId, feeding_rights: rights });
    if (status) { status.textContent = 'Saved'; setTimeout(() => { if (status) status.textContent = ''; }, 2000); }
  } catch (err) {
    if (status) status.textContent = 'Failed: ' + err.message;
  }
}

async function saveCourt() {
  const status = document.getElementById('court-save-status');
  const selects = document.querySelectorAll('[data-court-title]');
  const assignments = {};
  selects.forEach(sel => { assignments[sel.dataset.courtTitle] = sel.value; });

  try {
    // Clear all existing court titles, then assign new ones
    const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
    for (const c of active) {
      if (!c.court_title) continue;
      // Check if still assigned
      const stillAssigned = Object.entries(assignments).some(([title, id]) => id === c._id && title === c.court_title);
      if (!stillAssigned) {
        await apiPut(`/api/characters/${c._id}`, { court_title: null });
        c.court_title = null;
      }
    }
    // Assign new titles
    for (const [title, charId] of Object.entries(assignments)) {
      if (!charId) continue;
      const c = active.find(x => x._id === charId);
      if (c && c.court_title !== title) {
        await apiPut(`/api/characters/${c._id}`, { court_title: title });
        c.court_title = title;
      }
    }
    if (status) status.textContent = 'Saved';
    setTimeout(() => { if (status) status.textContent = ''; }, 2000);
    renderCity(document.getElementById('city-content'));
  } catch (err) {
    if (status) status.textContent = 'Failed: ' + err.message;
  }
}

async function saveTerritories() {
  const status = document.getElementById('terr-save-status');
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));

  try {
    // Build desired state: { territory: { regentId, lieutenantName } }
    const desired = {};
    for (const t of TERRITORIES) {
      const regSel = document.querySelector(`[data-terr-role="regent"][data-terr-name="${t.name}"]`);
      const ltSel = document.querySelector(`[data-terr-role="lieutenant"][data-terr-name="${t.name}"]`);
      desired[t.name] = { regentId: regSel?.value || '', ltName: ltSel?.value || '' };
    }

    // Clear regent_territory from characters no longer assigned
    for (const c of active) {
      if (!c.regent_territory) continue;
      const d = desired[c.regent_territory];
      if (!d || d.regentId !== c._id) {
        await apiPut(`/api/characters/${c._id}`, { regent_territory: null, regent_lieutenant: null });
        c.regent_territory = null;
        c.regent_lieutenant = null;
      }
    }

    // Assign new regents
    for (const [terrName, { regentId, ltName }] of Object.entries(desired)) {
      if (!regentId) continue;
      const c = active.find(x => x._id === regentId);
      if (c && (c.regent_territory !== terrName || c.regent_lieutenant !== ltName)) {
        await apiPut(`/api/characters/${c._id}`, { regent_territory: terrName, regent_lieutenant: ltName || null });
        c.regent_territory = terrName;
        c.regent_lieutenant = ltName || null;
      }
    }

    if (status) status.textContent = 'Saved';
    setTimeout(() => { if (status) status.textContent = ''; }, 2000);
    renderCity(document.getElementById('city-content'));
  } catch (err) {
    if (status) status.textContent = 'Failed: ' + err.message;
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
