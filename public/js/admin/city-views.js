/**
 * City domain views — two-column layout.
 * Left: Court (editable), Ascendancy, Prestige (4 views).
 * Right: Territories with editable regents/lieutenants.
 */

import { apiGet, apiPut, apiPost } from '../data/api.js';
// #751: writes state.activeCycleNum when the active cycle resolves so the
// editor's Add Equipment / Add Asset rows pre-fill acquired_cycle correctly.
import state from '../data/state.js';
import { calcTotalInfluence } from '../editor/domain.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { displayName, cardName, dropdownName, sortName, clanIcon, covIcon } from '../data/helpers.js';
import { setStatusTerritories } from '../data/accessors.js';
import { AMBIENCE_MODS } from '../tabs/downtime-data.js';
import { invalidateCachedTerritories } from './downtime-views.js';
import { openCityMapOverlay } from '../tabs/city-tab.js';

const TERRITORIES = [
  { id: 'academy', name: 'The Academy', ambience: 'Curated', ambienceMod: +3 },
  { id: 'dockyards', name: 'The Dockyards', ambience: 'Settled', ambienceMod: 0 },
  { id: 'harbour', name: 'The Harbour', ambience: 'Untended', ambienceMod: -2 },
  { id: 'northshore', name: 'The North Shore', ambience: 'Tended', ambienceMod: +2 },
  { id: 'secondcity', name: 'The Second City', ambience: 'Tended', ambienceMod: +2 },
];

const AMBIENCE_LEVELS = ['Hostile', 'Barrens', 'Neglected', 'Untended', 'Settled', 'Tended', 'Curated', 'Verdant', 'The Rack'];

const CATEGORY_ORDER = ['Head of State', 'Primogen', 'Administrator', 'Socialite', 'Enforcer'];
const COURT_CATEGORIES = ['Head of State', 'Primogen', 'Administrator', 'Socialite', 'Enforcer'];
const CLANS = ['Daeva', 'Gangrel', 'Mekhet', 'Nosferatu', 'Ventrue'];
const COVENANTS = ['Carthian Movement', 'Circle of the Crone', 'Invictus', 'Lancea et Sanctum', 'Ordo Dracul'];

let chars = [];
let terrDocs = [];           // territory documents from /api/territories
// oxp.5: seat documents from /api/office_seats. The court edit panel is now
// SEAT-backed rather than category-backed, so this is loaded once in
// initCityView beside terrDocs and read synchronously by renderCourt (both
// renderCity and renderCourt must stay synchronous).
let seatDocs = [];
// oxp.5: the court edit panel's open/closed state, kept across a re-render.
// saveCourt re-renders on both success and failure, and #court-save-status
// lives INSIDE the panel — without this, a 409 from the handover route would be
// written into a hidden element and the ST would see nothing at all.
let _courtPanelOpen = false;
let _terrExpanded = new Set(); // territory ids currently expanded
let _feedingEdits = {};      // terrId -> charId[] (working copy while editing)
let prestigeView = 0; // 0-3 for the four views
let _activeCycle = null;     // active downtime cycle (for regent confirmation chips)
let _latestSession = null;   // most recent game session (for Eminence & Ascendancy)

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
    setStatusTerritories(terrDocs); // keep City Status calc in sync (issue #13 Surface 2)
  } catch { terrDocs = []; setStatusTerritories([]); }

  // oxp.5: seats, fetched once here so renderCourt can stay synchronous. An
  // empty array on failure renders the explicit no-seat line for every
  // category rather than a row of selectable controls that would write nowhere.
  await refreshSeats();

  try {
    const cycles = await apiGet('/api/downtime_cycles');
    const sorted = cycles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    _activeCycle = sorted.find(c => c.status === 'active') || null;
    // #751: plumb the cycle number into shared state for the editor's
    // Add Equipment / Add Asset pre-fill (read in sheet.js + edit.js).
    state.activeCycleNum = (_activeCycle && _activeCycle.cycle_number) ?? null;
  } catch { _activeCycle = null; state.activeCycleNum = null; }

  try {
    const sessions = await apiGet('/api/game_sessions');
    _latestSession = sessions.sort((a, b) => (b.session_date || '').localeCompare(a.session_date || ''))[0] || null;
  } catch { _latestSession = null; }

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

/** oxp.5: reload the seat array. Called on boot and again after every save,
 *  because a handover changes `holder_id` and the panel's baseline comparison
 *  is taken from these documents. */
async function refreshSeats() {
  try {
    const docs = await apiGet('/api/office_seats');
    seatDocs = Array.isArray(docs) ? docs : [];
  } catch { seatDocs = []; }
}

/** oxp.5: this office's seats, in the SAME deterministic order office-tab.js's
 *  `_fallbackSeat` uses (ascending created_at, then ascending _id as the
 *  tie-break). Matching it matters: if the admin panel and the office tab
 *  ordered seats differently they would disagree about which seat is "first",
 *  and an ST editing "the first Primogen" here would be editing a different
 *  seat from the one a holder sees over there. */
function _seatsForCategory(cat) {
  return seatDocs
    .filter(s => s && s.office_category === cat)
    .sort((a, b) => {
      const ca = String(a.created_at ?? '');
      const cb = String(b.created_at ?? '');
      if (ca !== cb) return ca < cb ? -1 : 1;
      const ia = String(a._id ?? '');
      const ib = String(b._id ?? '');
      return ia < ib ? -1 : ia > ib ? 1 : 0;
    });
}

/** oxp.5: what distinguishes one seat of an office from another on screen.
 *  Socialite's two seats have real labels ('Harpy', "People's Harpy");
 *  Primogen's two have neither a label nor any other distinguishing field, so a
 *  short form of the id is the only thing that separates them. Same shape as
 *  office-tab.js's `_seatNote`. */
function _seatDisambiguator(seat) {
  return seat.seat_label ? String(seat.seat_label) : `seat ${String(seat._id).slice(-6)}`;
}

/**
 * oxp.5: the character currently holding a seat, or null if it is vacant.
 *
 * Searched across ALL characters, never only the active ones. Codex review
 * finding (High): this used to search `active` alone, so a seat held by a
 * RETIRED character resolved to null, the row rendered with nothing selected,
 * and the `<select>` silently fell back to its first option, "Vacant". An
 * unrelated save then read that row as a deliberate change and fired a real
 * handover, vacating a live seat and destroying its manoeuvre ladder. A holder
 * being retired is not the same fact as a seat being vacant, and this function
 * is where the two used to get confused.
 */
export function seatHolder(seat, allChars = []) {
  if (!seat || seat.holder_id == null) return null;
  return allChars.find(c => String(c._id) === String(seat.holder_id)) || null;
}

/**
 * oxp.5: the option list for one seat's holder `<select>`, as pure data.
 *
 * Exported and DOM-free so it can be tested directly — this project has no
 * jsdom, and the bug this function exists to prevent is a rendering decision,
 * not a string of markup.
 *
 * Every active character is offered. On top of that, if the seat's real holder
 * is NOT among them, an extra option is appended for that holder specifically,
 * so the row can always represent the truth:
 *
 *   - a retired holder is shown by name, marked retired;
 *   - a `holder_id` that resolves to no character at all (the hard-delete
 *     cascade in characters.js sweeps several collections but never
 *     `office_seats`, so this is reachable) is shown as an unknown holder.
 *
 * The extra option exists only on the row for the seat that holder actually
 * holds, so a retired character never becomes generally assignable.
 */
export function courtSlotOptions(seat, active = [], allChars = []) {
  const holderId = !seat || seat.holder_id == null ? '' : String(seat.holder_id);
  const options = [{ value: '', label: '— Vacant —', selected: holderId === '' }];

  let representsHolder = holderId === '';
  for (const c of active) {
    const value = String(c._id);
    if (value === holderId) representsHolder = true;
    options.push({ value, label: c.moniker || c.name, selected: value === holderId });
  }

  if (!representsHolder) {
    const held = seatHolder(seat, allChars);
    const label = held
      ? `${held.moniker || held.name}${held.retired ? ' (retired)' : ''}`
      : `Unknown character (id ${holderId.slice(-6)})`;
    options.push({ value: holderId, label, selected: true });
  }

  return options;
}

/**
 * oxp.5: which rows the save should actually send, as pure data.
 *
 * `rows` is `[{ seatId, selectedHolder, title, optionValues }]`, read off the
 * DOM by saveCourt. Kept DOM-free and exported for the same reason as
 * courtSlotOptions: the invariant below is the one a code review found broken,
 * and it deserves a real test rather than a source-contract assertion.
 *
 * THE INVARIANT: a row nobody touched must never fire a handover. A handover is
 * destructive — it clears a character's court fields and permanently destroys
 * the seat's manoeuvre XP — so "I could not represent this seat's current
 * state" must never be silently indistinguishable from "the ST chose Vacant".
 */
export function computeCourtChanges(rows = [], seats = [], allChars = []) {
  const changes = [];
  for (const row of rows) {
    const seat = seats.find(s => String(s._id) === String(row.seatId));
    if (!seat) continue;

    const currentHolder = seat.holder_id == null ? '' : String(seat.holder_id);
    const currentTitle = currentHolder ? (seatHolder(seat, allChars)?.court_title || '') : '';
    const selectedHolder = row.selectedHolder || '';
    const title = (row.title || '').trim();

    // Safety net for the invariant above. With courtSlotOptions the holder is
    // always representable, so this cannot fire today; it is here because the
    // consequence of it ever firing again is destructive and silent. Scoped
    // narrowly to the exact shape of the original bug — an unrepresentable
    // holder sitting at the select's default — so a deliberate choice is never
    // swallowed.
    const representsCurrent = !currentHolder || (row.optionValues || []).includes(currentHolder);
    if (!representsCurrent && selectedHolder === '') continue;

    if (selectedHolder === currentHolder && title === currentTitle) continue;
    changes.push({ seatId: String(row.seatId), holderId: selectedHolder, title });
  }
  return changes;
}

/**
 * oxp.5: one editable row per REAL SEAT.
 *
 * Before this story a slot row was keyed only by its category and its position
 * in the DOM, with no seat identity anywhere in the markup, and "+ Add slot"
 * conjured another one out of nothing. Rows are now backed by an
 * `office_seats` document and carry its id, which is what lets saveCourt call
 * the single transactional handover route instead of writing `court_category`
 * onto characters directly.
 */
function _renderSlot(cat, active, seat, showDisambiguator) {
  const holder = seatHolder(seat, chars);
  let h = `<div class="court-slot-row" data-seat-id="${esc(String(seat._id))}">`;
  if (showDisambiguator) {
    h += `<span class="court-detail">${esc(_seatDisambiguator(seat))}</span>`;
  }
  h += `<select class="court-edit-sel" data-court-category="${esc(cat)}">`;
  for (const opt of courtSlotOptions(seat, active, chars)) {
    h += `<option value="${esc(opt.value)}"${opt.selected ? ' selected' : ''}>${esc(opt.label)}</option>`;
  }
  h += '</select>';
  h += `<input type="text" class="court-title-input" data-court-title placeholder="${esc(cat)}" value="${esc(holder?.court_title || '')}">`;
  h += '</div>';
  return h;
}

function renderCourt() {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const titled = active.filter(c => c.court_category).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a.court_category);
    const bi = CATEGORY_ORDER.indexOf(b.court_category);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || sortName(a).localeCompare(sortName(b));
  });

  let h = '<h3 class="city-section-title">Court</h3><div class="court-list">';
  for (const c of titled) {
    h += `<div class="court-row">
      <span class="court-title">${esc(c.court_category)}</span>
      <span class="court-name">${esc(c.moniker || c.name)}</span>
      <span class="court-detail">${esc(c.covenant || '')}</span>
    </div>`;
  }
  h += '</div>';

  // Edit section — oxp.5: seat-backed.
  h += '<div class="court-edit">';
  h += '<button class="city-edit-toggle" id="court-edit-toggle">Edit Court Positions</button>';
  h += `<div class="court-edit-panel" id="court-edit-panel"${_courtPanelOpen ? '' : ' style="display:none"'}>`;
  h += '<div class="court-edit-grid">';
  for (const cat of COURT_CATEGORIES) {
    const seats = _seatsForCategory(cat);
    // Only worth showing when there is more than one seat to tell apart.
    const showDisambiguator = seats.length > 1;
    h += `<div class="court-edit-category" data-category="${esc(cat)}">`;
    h += `<span class="court-edit-label">${esc(cat)}</span>`;
    h += `<div class="court-slot-list">`;
    if (!seats.length) {
      // An office with no seat gets a plain statement of fact, not an empty
      // selectable row. A row here would look editable and write nowhere:
      // the handover route is addressed by seat id, and there is no seat.
      h += `<span class="court-detail">No seat exists for this office, so nobody can be assigned to it.</span>`;
    } else {
      for (const seat of seats) {
        h += _renderSlot(cat, active, seat, showDisambiguator);
      }
    }
    h += '</div>';
    h += '</div>';
  }
  h += '</div>';
  // oxp.5: "+ Add slot" and "remove slot" are gone, deliberately. They created
  // and destroyed a HOLDING by writing court_category onto an extra character,
  // which produced a holder with no seat behind them: invisible to the office
  // XP derivation and to the office tab's purchase-state resolution, i.e.
  // exactly the inconsistent data this route exists to stop. In-app seat
  // creation is a real gap with no home yet; refusing loudly beats writing a
  // broken record quietly.
  h += '<p class="derived-note">Seats are provisioned ST-side. Creating or removing a seat is not yet available in the app.</p>';
  h += '<button class="city-save-btn" id="court-save">Save Court</button>';
  h += '<span class="city-save-status" id="court-save-status"></span>';
  h += '</div></div>';

  return h;
}

// ══════════════════════════════════════
//  EMINENCE & ASCENDANCY
// ══════════════════════════════════════

function renderAscendancy() {
  const active = chars.filter(c => !c.retired);

  if (!active.length) {
    return '<h3 class="city-section-title">Eminence &amp; Ascendancy</h3><p class="placeholder">No characters.</p>';
  }

  const eminenceMap = {};
  const ascendancyMap = {};
  for (const c of active) {
    const cs = c.status?.city || 0;
    if (c.clan)     eminenceMap[c.clan]       = (eminenceMap[c.clan]       || 0) + cs;
    if (c.covenant) ascendancyMap[c.covenant] = (ascendancyMap[c.covenant] || 0) + cs;
  }

  const toSorted = (map) => Object.entries(map)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, val]) => ({ name, val }));

  const eminence   = toSorted(eminenceMap);
  const ascendancy = toSorted(ascendancyMap);

  let h = '<h3 class="city-section-title">Eminence &amp; Ascendancy</h3>';
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
    const cvs = c.status?.covenant?.[c.covenant] || 0;
    if (c.clan) clanEminence[c.clan] = (clanEminence[c.clan] || 0) + (c.status?.city || 0);
    if (c.covenant) covAscendancy[c.covenant] = (covAscendancy[c.covenant] || 0) + (c.status?.city || 0);
  }

  return active.map(c => {
    const st = c.status || {};
    const clan = st.clan || 0;
    const cov = st.covenant?.[c.covenant] || 0;
    const effectiveCov = cov;
    const influence = calcTotalInfluence(c);
    const cSize = clanSize[c.clan] || 1;
    const cvSize = covSize[c.covenant] || 1;

    return {
      name: displayName(c),
      clan: c.clan || '',
      covenant: c.covenant || '',
      clanStatus: clan,
      covStatus: cov,
      prestige: clan + effectiveCov,
      influence,
      // View 3: weighted (+members)
      weighted: clan + effectiveCov + cSize + cvSize,
      // View 4: highly weighted (×members)
      highWeighted: (clan * cSize) + (effectiveCov * cvSize),
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
  // terrId is a slug from the local TERRITORIES iteration; Mongo docs carry it as `slug`.
  const doc = terrDocs.find(d => d.slug === terrId);
  return doc?.feeding_rights || [];
}

function renderFeedingChips(terrId) {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const rights = getFeedingRights(terrId);
  if (!rights.length) return '<span class="terr-feed-empty">None assigned</span>';
  return rights.map((cid, i) => {
    const c = active.find(x => String(x._id) === String(cid));
    const name = c ? esc(cardName(c)) : esc(String(cid));
    return `<span class="terr-chip">${name}<button class="terr-chip-rm" data-terr-feed-rm="${esc(terrId)}" data-feed-idx="${i}">&times;</button></span>`;
  }).join('');
}

function renderFeedingDropdown(terrId) {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  const rights = getFeedingRights(terrId);
  const opts = active
    .filter(c => !rights.includes(String(c._id)))
    .map(c => `<option value="${esc(String(c._id))}">${esc(dropdownName(c))}</option>`)
    .join('');
  return `<select id="terr-feed-sel-${esc(terrId)}" class="terr-feed-sel">
    <option value="">\u2014 Add character \u2014</option>${opts}
  </select>`;
}

function _terrDoc(terrId) {
  // terrId is a slug from the local TERRITORIES iteration; Mongo docs carry it as `slug`.
  return terrDocs.find(d => d.slug === terrId);
}

const TERR_TYPE_LABELS = { mortal: 'Mortal-controlled', contested: 'Contested' };

function _renderNonVampireTerrCard(td) {
  const label = TERR_TYPE_LABELS[td.type] || td.type;
  let h = `<div class="terr-card terr-card--non-vampire">`;
  h += `<div class="terr-card-hd" style="cursor:default">`;
  h += `<div class="terr-hd-info">`;
  h += `<div class="terr-name">${esc(td.name || td.slug || td._id)}</div>`;
  h += `<span class="terr-type-badge">${esc(label)}</span>`;
  h += `</div>`;
  h += `</div>`;
  h += `</div>`;
  return h;
}

function renderTerritories() {
  const active = chars.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
  let h = '<h3 class="city-section-title">Territories</h3>';
  // Issue #9: ST entry-point to the fullscreen map overlay where the
  // drag-to-place edit mode lives. Sibling to the existing territory cards.
  h += '<button type="button" class="city-map-edit-launch" data-open-map-edit>Open city map (drag-to-place)</button>';

  for (const t of TERRITORIES) {
    const td = _terrDoc(t.id);
    // feat-2: skip vampire section if this territory has been reclassified
    if (td?.type && td.type !== 'vampire') continue;
    const regent = td?.regent_id ? active.find(c => String(c._id) === td.regent_id) : null;
    // Prefer DB ambience values over hardcoded defaults
    const dispAmbience = td?.ambience || t.ambience;
    const dispMod      = td?.ambienceMod !== undefined && td?.ambienceMod !== null ? td.ambienceMod : t.ambienceMod;
    const modSign = dispMod >= 0 ? '+' : '';
    const lt = td?.lieutenant_id ? active.find(c => String(c._id) === td.lieutenant_id) : null;
    const ltDisplay = lt ? esc(displayName(lt)) : null; // deliberate: court title shown in city view
    const open = _terrExpanded.has(t.id);

    h += `<div class="terr-card${open ? ' terr-card-open' : ''}" id="terr-card-${esc(t.id)}">`;
    h += `<button class="terr-card-hd" data-terr-toggle="${esc(t.id)}">`;
    h += `<div class="terr-hd-info">`;
    h += `<div class="terr-name">${esc(t.name)}</div>`;
    h += `<div class="terr-ambience">${esc(dispAmbience)} (${modSign}${dispMod})</div>`;
    h += `<div class="terr-regent">Regent: ${regent ? `<span class="terr-regent-name">${esc(displayName(regent))}</span>` : '<span class="terr-vacant">Vacant</span>'}</div>`; // deliberate: court title shown in city view
    if (ltDisplay) h += `<div class="terr-lt">Lieutenant: ${ltDisplay}</div>`;
    // Regent confirmation chip for active cycle.
    // Cycle confirmations carry territory_id as the territory's _id-string per ADR-002.
    if (_activeCycle && td?.regent_id) {
      const conf = (_activeCycle.regent_confirmations || []).find(c => c.territory_id === String(td._id));
      if (conf) {
        const dateStr = new Date(conf.confirmed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
        h += `<div class="terr-confirm-chip terr-confirm-chip--confirmed">Confirmed ${dateStr}</div>`;
      } else {
        h += `<div class="terr-confirm-chip terr-confirm-chip--pending">Pending</div>`;
      }
    }
    h += `</div>`;
    h += `<span class="terr-chev">${open ? '\u25B2' : '\u25BC'}</span>`;
    h += `</button>`;

    if (open) {
      const regentId = td?.regent_id || '';
      const ltId = td?.lieutenant_id || '';
      h += `<div class="terr-expand">`;

      // Regent / Lieutenant inline edit
      h += `<div class="terr-rl-section">`;
      h += `<div class="terr-edit-row">`;
      h += `<label class="terr-edit-lbl">Regent</label>`;
      h += `<select class="terr-edit-sel" data-terr-role="regent" data-terr-id="${esc(t.id)}">`;
      h += '<option value="">— Vacant —</option>';
      for (const c of active) {
        const sel = regentId === String(c._id) ? ' selected' : '';
        h += `<option value="${esc(String(c._id))}"${sel}>${esc(dropdownName(c))}</option>`;
      }
      h += '</select>';
      h += `</div>`;
      h += `<div class="terr-edit-row">`;
      h += `<label class="terr-edit-lbl">Lieutenant</label>`;
      h += `<select class="terr-edit-sel" data-terr-role="lieutenant" data-terr-id="${esc(t.id)}">`;
      h += '<option value="">— None —</option>';
      for (const c of active) {
        const sel = ltId === String(c._id) ? ' selected' : '';
        h += `<option value="${esc(String(c._id))}"${sel}>${esc(dropdownName(c))}</option>`;
      }
      h += '</select>';
      h += `</div>`;
      h += `<div class="terr-rl-actions">`;
      h += `<button class="city-save-btn" data-terr-rl-save="${esc(t.id)}">Save</button>`;
      h += `<span class="city-save-status" id="terr-rl-status-${esc(t.id)}"></span>`;
      h += `</div>`;
      h += `</div>`;

      // Feeding Rights
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

      // Ambience Override
      const curAmb    = td?.ambience || t.ambience;
      const curMod    = td?.ambienceMod !== undefined && td?.ambienceMod !== null ? td.ambienceMod : t.ambienceMod;
      h += `<div class="terr-amb-section">`;
      h += `<div class="terr-feed-label">Ambience Override</div>`;
      h += `<div class="terr-edit-row">`;
      h += `<label class="terr-edit-lbl">Level</label>`;
      h += `<select class="terr-amb-level-sel" data-terr-id="${esc(t.id)}">`;
      for (const lvl of AMBIENCE_LEVELS) {
        const sel = curAmb === lvl ? ' selected' : '';
        h += `<option value="${esc(lvl)}"${sel}>${esc(lvl)}</option>`;
      }
      h += `</select>`;
      h += `</div>`;
      h += `<div class="terr-rl-actions">`;
      h += `<button class="city-save-btn" data-terr-amb-save="${esc(t.id)}">Save Ambience</button>`;
      h += `<span class="city-save-status" id="terr-amb-status-${esc(t.id)}"></span>`;
      h += `</div>`;
      h += `</div>`;

      h += `</div>`;
    }

    h += `</div>`;
  }

  // feat-2: non-vampire territories — rendered without regent/feeding controls
  const nonVampireDocs = terrDocs.filter(td => td.type && td.type !== 'vampire');
  if (nonVampireDocs.length) {
    h += `<div class="terr-section-divider"><span>Non-Vampire Territories</span></div>`;
    for (const td of nonVampireDocs) {
      h += _renderNonVampireTerrCard(td);
    }
  }

  return h;
}

// ══════════════════════════════════════
//  EVENTS
// ══════════════════════════════════════

function wireEvents(container) {
  // Issue #9: open the fullscreen map overlay (with the ST drag-to-place
  // edit toggle inside) — sibling to the existing territory cards.
  container.querySelector('[data-open-map-edit]')?.addEventListener('click', () => {
    openCityMapOverlay({ chars, territories: terrDocs });
  });

  // Court edit toggle. oxp.5: the open state is remembered across re-renders
  // so a save (and, more importantly, a failed save) leaves the panel and its
  // status line visible.
  container.querySelector('#court-edit-toggle')?.addEventListener('click', () => {
    const panel = document.getElementById('court-edit-panel');
    _courtPanelOpen = panel.style.display === 'none';
    panel.style.display = _courtPanelOpen ? '' : 'none';
  });

  // Court save
  container.querySelector('#court-save')?.addEventListener('click', saveCourt);

  // oxp.5: the add-slot / remove-slot handlers that used to live here are gone
  // along with their buttons — see renderCourt's note. Rows are now backed by
  // real office_seats documents, and nothing in this panel creates or destroys
  // one.

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
          const doc = terrDocs.find(d => d.slug === terrId);
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

    // Save regent / lieutenant for a single territory
    const rlSaveBtn = e.target.closest('[data-terr-rl-save]');
    if (rlSaveBtn) {
      saveTerritory(rlSaveBtn.dataset.terrRlSave);
      return;
    }

    // Save ambience override (manual button — kept as fallback)
    const ambSaveBtn = e.target.closest('[data-terr-amb-save]');
    if (ambSaveBtn) {
      saveTerrAmbience(ambSaveBtn.dataset.terrAmbSave);
      return;
    }
  });

  // Auto-save ambience on select change
  container.addEventListener('change', e => {
    const sel = e.target.closest('.terr-amb-level-sel');
    if (sel?.dataset.terrId) {
      saveTerrAmbience(sel.dataset.terrId);
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
      .map(c => `<option value="${esc(String(c._id))}">${esc(dropdownName(c))}</option>`)
      .join('');
}

async function saveFeedingRights(terrId) {
  const status = document.getElementById('terr-feed-status-' + terrId);
  const rights = _feedingEdits[terrId] || [];
  try {
    const doc = terrDocs.find(d => d.slug === terrId);
    if (!doc?._id) throw new Error('Territory not loaded yet');
    const terrNameF = TERRITORIES.find(t => t.id === terrId)?.name || terrId;
    await apiPost('/api/territories', { _id: String(doc._id), name: terrNameF, feeding_rights: rights });
    // Update local cache
    const idx = terrDocs.findIndex(d => d.slug === terrId);
    if (idx >= 0) terrDocs[idx] = { ...terrDocs[idx], feeding_rights: rights };
    invalidateCachedTerritories();
    if (status) { status.textContent = 'Saved'; setTimeout(() => { if (status) status.textContent = ''; }, 2000); }
  } catch (err) {
    if (status) status.textContent = 'Failed: ' + err.message;
  }
}

/**
 * oxp.5: save the court panel through the single transactional handover route.
 *
 * This function makes NO call to /api/characters/ at all any more. It used to
 * do two independent passes of raw character writes — a clear-pass setting
 * court_category to null on whoever dropped out, then an assign-pass setting it
 * on whoever came in — with no atomicity, no seat awareness and no manoeuvre
 * reset. Both halves of a reassignment are the same event, and
 * PUT /api/office_seats/:seatId/holder does both of them, plus the seat's own
 * holder_id and the manoeuvre reset, inside one transaction.
 *
 * One call per row whose selected holder or title differs from that seat's
 * current state. Rows that have not changed are skipped entirely, which is why
 * the route's same-holder no-op exists as a 200 rather than an error: an ST
 * correcting one title should not collect four rejections.
 */
async function saveCourt() {
  // Read every row off the DOM as plain data, then let computeCourtChanges
  // decide which ones actually changed. The decision is deliberately kept out
  // of here: it carries the "an untouched row never fires a handover"
  // invariant, and it is unit-tested directly.
  const rows = [];
  document.querySelectorAll('.court-slot-row').forEach(row => {
    const sel = row.querySelector('.court-edit-sel');
    rows.push({
      seatId: row.dataset.seatId,
      selectedHolder: sel?.value || '',
      title: row.querySelector('.court-title-input')?.value || '',
      // What the select could actually offer. computeCourtChanges uses this to
      // tell "the ST chose Vacant" apart from "this row could not represent its
      // own holder", which are the same empty string otherwise.
      optionValues: Array.from(sel?.options || []).map(o => o.value),
    });
  });
  const changes = computeCourtChanges(rows, seatDocs, chars);

  let message = 'Saved';
  try {
    for (const { seatId, holderId, title } of changes) {
      await apiPut(`/api/office_seats/${encodeURIComponent(seatId)}/holder`, {
        holder_id: holderId || null,
        // A CLEARED title box is sent as the empty string, not as null, and the
        // server resolves it to the seat's own office category. Codex review
        // finding 5: this used to send `title || null`, which the server read as
        // "no title supplied" and therefore ignored, so an ST clearing a sitting
        // holder's title saw "Saved" and then watched the old title reappear.
        // Vacating ignores the title entirely, server-side.
        court_title: holderId ? title : null,
      });
    }
  } catch (err) {
    // apiPut throws with the SERVER's own message body (see data/api.js), so a
    // 409 from the conflicting-seat refusal arrives here naming the seat the
    // target already holds, not as a bare status code.
    message = 'Failed: ' + err.message;
  }

  // Re-fetch before re-rendering: holder_id has changed on the server, and so
  // has court_category/court_title on up to two characters per handover. Done
  // on the failure path too, since earlier rows in the loop may have committed
  // before a later one was refused.
  //
  // Codex review finding: a failed character refresh used to be swallowed
  // silently while the status still read "Saved", so the panel could re-render
  // the NEW seat holder alongside the OLD court titles and look authoritative.
  // The write did commit, so this is not a failure, but it must not be reported
  // as a clean save either.
  let charsRefreshed = true;
  try {
    const fresh = await apiGet('/api/characters');
    chars = fresh;
    chars.forEach(c => applyDerivedMerits(c));
  } catch {
    charsRefreshed = false; // keep the stale array rather than blanking the view
  }
  await refreshSeats();
  if (charsRefreshed === false && !message.startsWith('Failed')) {
    message = 'Saved, but the character list could not be refreshed. Reload to see current titles.';
  }

  // #634's ordering, for the same reason it was needed there: re-render FIRST
  // (it rebuilds the status span from the template), THEN write the feedback
  // onto the fresh node.
  renderCity(document.getElementById('city-content'));
  const status = document.getElementById('court-save-status');
  if (status) {
    status.textContent = message;
    if (message === 'Saved') {
      setTimeout(() => {
        const s = document.getElementById('court-save-status');
        if (s) s.textContent = '';
      }, 2000);
    }
  }
}

async function saveTerrAmbience(terrId) {
  const status   = document.getElementById('terr-amb-status-' + terrId);
  const levelSel = document.querySelector(`.terr-amb-level-sel[data-terr-id="${terrId}"]`);
  const ambience = levelSel?.value || null;
  // Derive mod automatically from the level — no manual input
  const ambienceMod = ambience ? (AMBIENCE_MODS[ambience] ?? 0) : 0;

  try {
    const doc = terrDocs.find(d => d.slug === terrId);
    if (!doc?._id) throw new Error('Territory not loaded yet');
    const terrNameA = TERRITORIES.find(t => t.id === terrId)?.name || terrId;
    await apiPost('/api/territories', { _id: String(doc._id), name: terrNameA, ambience, ambienceMod });
    // Update local cache
    const idx = terrDocs.findIndex(d => d.slug === terrId);
    const patch = { ambience, ambienceMod };
    if (idx >= 0) Object.assign(terrDocs[idx], patch);

    // Invalidate processing mode's territory cache so it refetches on next render
    invalidateCachedTerritories();

    // #634: re-render FIRST (it rebuilds the status span from the template), THEN set the
    // "Saved" feedback on the fresh node — otherwise patchTerritories wiped it in the same tick.
    patchTerritories(document.getElementById('city-content'));
    const savedStatus = document.getElementById('terr-amb-status-' + terrId);
    if (savedStatus) {
      savedStatus.textContent = 'Saved';
      setTimeout(() => { const s = document.getElementById('terr-amb-status-' + terrId); if (s) s.textContent = ''; }, 2000);
    }
  } catch (err) {
    if (status) status.textContent = 'Failed: ' + err.message;
  }
}

async function saveTerritory(terrId) {
  const status = document.getElementById('terr-rl-status-' + terrId);
  const regSel = document.querySelector(`[data-terr-role="regent"][data-terr-id="${terrId}"]`);
  const ltSel = document.querySelector(`[data-terr-role="lieutenant"][data-terr-id="${terrId}"]`);
  const regentId = regSel?.value || null;
  const lieutenantId = ltSel?.value || null;

  try {
    const doc = terrDocs.find(d => d.slug === terrId);
    if (!doc?._id) throw new Error('Territory not loaded yet');
    const terrName = TERRITORIES.find(t => t.id === terrId)?.name || terrId;
    await apiPost('/api/territories', { _id: String(doc._id), name: terrName, regent_id: regentId, lieutenant_id: lieutenantId });

    // Update local cache
    const idx = terrDocs.findIndex(d => d.slug === terrId);
    const patch = { regent_id: regentId, lieutenant_id: lieutenantId };
    if (idx >= 0) Object.assign(terrDocs[idx], patch);

    invalidateCachedTerritories();

    if (status) { status.textContent = 'Saved'; setTimeout(() => { if (status) status.textContent = ''; }, 2000); }
    // Refresh card header to show updated name
    patchTerritories(document.getElementById('city-content'));
  } catch (err) {
    if (status) status.textContent = 'Failed: ' + err.message;
  }
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
