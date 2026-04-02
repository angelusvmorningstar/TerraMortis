/* Downtime submission form — character-aware, section-gated, auto-saving.
 * Uses existing /api/downtime_submissions API.
 * Lifecycle: draft → submitted (player can edit until deadline)
 *
 * Auto-detected sections:
 *  - Court: from game_sessions attendance
 *  - Regency: from regent_territory, with residency grid
 *  - Spheres/Contacts/Retainers: from character merits
 *  - Blood Sorcery: from disciplines (Cruac/Theban)
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { DOWNTIME_SECTIONS, DOWNTIME_GATES, SPHERE_ACTIONS, AMBIENCE_CAP, TERRITORY_DATA, FEEDING_TERRITORIES, PROJECT_ACTIONS, FEED_METHODS } from './downtime-data.js';
import { ALL_ATTRS, ALL_SKILLS, CLAN_DISCS, BLOODLINE_DISCS, CORE_DISCS } from '../data/constants.js';
import { xpLeft } from '../editor/xp.js';
import { DEVOTIONS_DB } from '../data/devotions-db.js';
import { MERITS_DB } from '../data/merits-db-data.js';
import { meritQualifies } from '../editor/merits.js';
import { getRole } from '../auth/discord.js';

// Influence merit names that generate monthly influence
const INFLUENCE_MERIT_NAMES = ['Allies', 'Retainer', 'Mentor', 'Resources', 'Staff', 'Contacts', 'Status'];
// Only 5 territories can receive influence (not The Barrens)
const INFLUENCE_TERRITORIES = FEEDING_TERRITORIES.filter(t => !t.includes('Barrens'));

let responseDoc = null;
let currentChar = null;
let currentCycle = null;
let gateValues = {};
let saveTimer = null;

// Merits detected from the character sheet, grouped by type
let detectedMerits = { spheres: [], contacts: [], retainers: [] };

// All active characters (lightweight: _id, name, moniker, honorific) for regency dropdowns
let allCharNames = [];

// Persisted residency list from territory_residency collection
let persistedResidency = [];

// Characters who attended last game (for shoutout picks)
let lastGameAttendees = [];

// Map of territory name → Set of resident character IDs (for feeding grid indicators)
let residencyByTerritory = {};

const RESIDENCY_SLOTS = 10;

// Feeding method state (for feeding_method widget)
let feedMethodId = '';
let feedDiscName = '';
let feedSpecName = '';
let feedCustomAttr = '';
let feedCustomSkill = '';
let feedCustomDisc = '';

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 2000);
}

/** Build a stable key for a merit (used as field prefix and toggle key). */
function meritKey(merit) {
  const area = merit.area || merit.qualifier || '';
  return `${merit.name}_${merit.rating}_${area}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

/** Format a merit for display: "Allies ●●● (Health)" */
function meritLabel(merit) {
  const area = merit.area || merit.qualifier || '';
  const dots = '●'.repeat(merit.rating);
  return area ? `${merit.name} ${dots} (${area})` : `${merit.name} ${dots}`;
}

/** Deduplicate merits by meritKey — keeps the first occurrence only. */
function deduplicateMerits(list) {
  const seen = new Set();
  return list.filter(m => {
    const key = meritKey(m);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Scan character merits and disciplines to populate detectedMerits and auto-gates. */
function detectMerits() {
  // Only top-level merits (not benefit_grants children nested inside standing merits)
  const merits = (currentChar.merits || []).filter(m => m.category);
  const discs = currentChar.disciplines || {};

  detectedMerits.spheres = deduplicateMerits(merits.filter(m =>
    m.category === 'influence' && (m.name === 'Allies' || m.name === 'Status')
  ));
  // Contacts: split comma-separated areas into individual entries
  const rawContacts = deduplicateMerits(merits.filter(m =>
    m.category === 'influence' && m.name === 'Contacts'
  ));
  detectedMerits.contacts = [];
  for (const m of rawContacts) {
    const areas = (m.area || m.qualifier || '').split(/,\s*/);
    if (areas.length > 1) {
      for (const a of areas) {
        if (!a) continue;
        detectedMerits.contacts.push({ ...m, area: a.trim(), _splitFrom: m });
      }
    } else {
      detectedMerits.contacts.push(m);
    }
  }
  detectedMerits.retainers = deduplicateMerits(merits.filter(m =>
    m.category === 'influence' && m.name === 'Retainer'
  ));

  gateValues.has_sorcery = (discs.Cruac || discs.Theban) ? 'yes' : 'no';
}

/** Calculate monthly influence budget from character data. */
function getInfluenceBudget() {
  const c = currentChar;
  let total = 0;
  // Clan + Covenant status: 1 per dot
  total += (c.status?.clan || 0);
  total += (c.status?.covenant || 0);
  // Qualifying influence merits: 3-4 dots = 1, 5 dots = 2
  for (const m of (c.merits || [])) {
    if (m.category !== 'influence') continue;
    if (!INFLUENCE_MERIT_NAMES.includes(m.name)) continue;
    if (m.rating >= 5) total += 2;
    else if (m.rating >= 3) total += 1;
  }
  // MCI at 5 dots: 1 influence
  for (const m of (c.merits || [])) {
    if (m.name === 'Mystery Cult Initiation' && m.rating >= 5) total += 1;
  }
  return total;
}

/** Get the feeding cap for the regent's territory based on its ambience. */
function getRegentCap() {
  const terrName = currentChar.regent_territory;
  const terr = TERRITORY_DATA.find(t => t.name === terrName);
  if (!terr) return 6; // sensible default
  return AMBIENCE_CAP[terr.ambience] || 6;
}

function collectResponses() {
  const responses = {};

  // Persist auto-detected gates
  responses['_gate_attended'] = gateValues.attended || '';
  responses['_gate_is_regent'] = gateValues.is_regent || '';
  responses['_gate_has_sorcery'] = gateValues.has_sorcery || '';
  if (gateValues.is_regent === 'yes' && currentChar.regent_territory) {
    responses['regent_territory'] = currentChar.regent_territory;
  }

  // Collect manual gate values
  for (const gate of DOWNTIME_GATES) {
    const checked = document.querySelector(`input[name="gate-${gate.key}"]:checked`);
    responses[`_gate_${gate.key}`] = checked ? checked.value : '';
  }

  // Collect static section responses
  for (const section of DOWNTIME_SECTIONS) {
    if (section.gate && gateValues[section.gate] !== 'yes') continue;

    for (const q of section.questions) {
      if (q.type === 'shoutout_picks') {
        const picks = [];
        document.querySelectorAll('[data-shoutout-slot]').forEach(sel => {
          picks.push(sel.value || '');
        });
        responses[q.key] = JSON.stringify(picks.filter(Boolean));
        continue;
      }
      if (q.type === 'feeding_method') {
        responses['_feed_method'] = feedMethodId;
        responses['_feed_disc'] = feedDiscName;
        responses['_feed_spec'] = feedSpecName;
        responses['_feed_custom_attr'] = feedCustomAttr;
        responses['_feed_custom_skill'] = feedCustomSkill;
        responses['_feed_custom_disc'] = feedCustomDisc;
        const descEl = document.getElementById('dt-feeding_description');
        responses['feeding_description'] = descEl ? descEl.value : '';
        continue;
      }
      if (q.type === 'xp_grid') {
        const gridEl = document.getElementById('dt-xp_spend');
        const rows = [];
        if (gridEl) {
          gridEl.querySelectorAll('[data-xp-row]').forEach(rowEl => {
            const catEl = rowEl.querySelector('[data-xp-cat]');
            const itemEl = rowEl.querySelector('[data-xp-item]');
            const dotsEl = rowEl.querySelector('[data-xp-dots]');
            const category = catEl ? catEl.value : '';
            const item = itemEl ? itemEl.value : '';
            const dotsBuying = dotsEl ? parseInt(dotsEl.value, 10) || 0 : 0;
            if (category) rows.push({ category, item, dotsBuying });
          });
        }
        responses[q.key] = JSON.stringify(rows);
        continue;
      }
      if (q.type === 'influence_grid') {
        const infVals = {};
        for (const terr of INFLUENCE_TERRITORIES) {
          const tk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const el = document.getElementById(`inf-val-${tk}`);
          infVals[tk] = el ? parseInt(el.textContent, 10) || 0 : 0;
        }
        responses[q.key] = JSON.stringify(infVals);
        continue;
      }
      if (q.type === 'territory_grid') {
        // Collect feeding grid as JSON object
        const gridVals = {};
        for (const terr of FEEDING_TERRITORIES) {
          const terrKey = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const checked = document.querySelector(`input[name="feed-${terrKey}"]:checked`);
          gridVals[terrKey] = checked ? checked.value : 'none';
        }
        responses[q.key] = JSON.stringify(gridVals);
        continue;
      }
      const el = document.getElementById('dt-' + q.key);
      if (!el) continue;
      if (q.type === 'radio') {
        const checked = document.querySelector(`input[name="dt-${q.key}"]:checked`);
        responses[q.key] = checked ? checked.value : '';
      } else {
        responses[q.key] = el.value;
      }
    }
  }

  // Collect project slots
  const projectSection = DOWNTIME_SECTIONS.find(s => s.key === 'projects');
  const projectSlotCount = projectSection?.projectSlots || 4;
  for (let n = 1; n <= projectSlotCount; n++) {
    const actionEl = document.getElementById(`dt-project_${n}_action`);
    responses[`project_${n}_action`] = actionEl ? actionEl.value : '';
    for (const poolKey of ['pool', 'pool2']) {
      const prefix = `project_${n}_${poolKey}`;
      const attrEl = document.getElementById(`dt-${prefix}_attr`);
      const skillEl = document.getElementById(`dt-${prefix}_skill`);
      const discEl = document.getElementById(`dt-${prefix}_disc`);
      responses[`${prefix}_attr`] = attrEl ? attrEl.value : '';
      responses[`${prefix}_skill`] = skillEl ? skillEl.value : '';
      responses[`${prefix}_disc`] = discEl ? discEl.value : '';
    }
    const outcomeEl = document.getElementById(`dt-project_${n}_outcome`);
    const descEl = document.getElementById(`dt-project_${n}_description`);
    responses[`project_${n}_outcome`] = outcomeEl ? outcomeEl.value : '';
    responses[`project_${n}_description`] = descEl ? descEl.value : '';
  }

  // Collect sorcery slots
  const sorcerySection = DOWNTIME_SECTIONS.find(s => s.key === 'blood_sorcery');
  const sorcerySlotCount = sorcerySection?.sorcerySlots || 3;
  for (let n = 1; n <= sorcerySlotCount; n++) {
    const riteEl = document.getElementById(`dt-sorcery_${n}_rite`);
    responses[`sorcery_${n}_rite`] = riteEl ? riteEl.value : '';
    const targetsEl = document.getElementById(`dt-sorcery_${n}_targets`);
    responses[`sorcery_${n}_targets`] = targetsEl ? targetsEl.value : '';
    const notesEl = document.getElementById(`dt-sorcery_${n}_notes`);
    responses[`sorcery_${n}_notes`] = notesEl ? notesEl.value : '';
  }

  // Collect residency grid
  if (gateValues.is_regent === 'yes') {
    for (let i = 1; i <= RESIDENCY_SLOTS; i++) {
      const el = document.getElementById(`dt-residency_${i}`);
      if (el) responses[`residency_${i}`] = el.value;
    }
  }

  // Collect merit toggle states and dynamic section responses
  const allMerits = [...detectedMerits.spheres, ...detectedMerits.contacts, ...detectedMerits.retainers];
  for (const m of allMerits) {
    const key = meritKey(m);
    responses[`_merit_${key}`] = gateValues[`merit_${key}`] || 'no';
  }

  // Sphere action fields
  let sphereIdx = 0;
  for (const m of detectedMerits.spheres) {
    const key = meritKey(m);
    if (gateValues[`merit_${key}`] !== 'yes') continue;
    sphereIdx++;
    for (const suffix of ['action', 'outcome', 'description']) {
      const el = document.getElementById(`dt-sphere_${sphereIdx}_${suffix}`);
      if (el) responses[`sphere_${sphereIdx}_${suffix}`] = el.value;
    }
    responses[`sphere_${sphereIdx}_merit`] = meritLabel(m);
  }

  // Contact fields
  let contactIdx = 0;
  for (const m of detectedMerits.contacts) {
    const key = meritKey(m);
    if (gateValues[`merit_${key}`] !== 'yes') continue;
    contactIdx++;
    const el = document.getElementById(`dt-contact_${contactIdx}`);
    if (el) responses[`contact_${contactIdx}`] = el.value;
    responses[`contact_${contactIdx}_merit`] = meritLabel(m);
  }

  // Retainer fields
  let retainerIdx = 0;
  for (const m of detectedMerits.retainers) {
    const key = meritKey(m);
    if (gateValues[`merit_${key}`] !== 'yes') continue;
    retainerIdx++;
    const el = document.getElementById(`dt-retainer_${retainerIdx}`);
    if (el) responses[`retainer_${retainerIdx}`] = el.value;
    responses[`retainer_${retainerIdx}_merit`] = meritLabel(m);
  }

  return responses;
}

async function saveDraft() {
  const responses = collectResponses();
  const statusEl = document.getElementById('dt-save-status');

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/downtime_submissions', {
        character_id: currentChar._id,
        cycle_id: currentCycle?._id || null,
        status: 'draft',
        responses,
      });
    } else {
      responseDoc = await apiPut(`/api/downtime_submissions/${responseDoc._id}`, { responses });
    }
    // Persist residency to territory collection
    if (gateValues.is_regent === 'yes') await saveResidency(responses);
    if (statusEl) statusEl.textContent = 'Saved';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

async function submitForm() {
  const responses = collectResponses();

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/downtime_submissions', {
        character_id: currentChar._id,
        cycle_id: currentCycle?._id || null,
        status: 'submitted',
        responses,
        submitted_at: new Date().toISOString(),
      });
    } else {
      responseDoc = await apiPut(`/api/downtime_submissions/${responseDoc._id}`, {
        responses,
        status: 'submitted',
        submitted_at: new Date().toISOString(),
      });
    }
    // Persist residency to territory collection
    if (gateValues.is_regent === 'yes') await saveResidency(responses);
    renderForm(document.getElementById('dt-container'));
  } catch (err) {
    const statusEl = document.getElementById('dt-save-status');
    if (statusEl) statusEl.textContent = 'Submit failed: ' + err.message;
  }
}

/** Persist residency list to territory_residency collection for cross-cycle continuity. */
async function saveResidency(responses) {
  const residents = [];
  for (let i = 1; i <= RESIDENCY_SLOTS; i++) {
    residents.push(responses[`residency_${i}`] || '');
  }
  try {
    await apiPut('/api/territory-residency', {
      territory: currentChar.regent_territory,
      residents,
    });
    persistedResidency = residents;
  } catch { /* non-critical — submission still saved */ }
}

export async function renderDowntimeTab(targetEl, char) {
  currentChar = char;
  responseDoc = null;
  currentCycle = null;
  gateValues = {};

  // Load current cycle
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    currentCycle = cycles
      .filter(c => c.status === 'open' || c.status === 'active')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
      || cycles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0]
      || null;
  } catch { /* no cycles */ }

  // Load existing submission for this character + cycle
  if (currentCycle) {
    try {
      const subs = await apiGet(`/api/downtime_submissions?cycle_id=${currentCycle._id}`);
      responseDoc = subs.find(s =>
        s.character_id === currentChar._id || s.character_id?.toString() === currentChar._id?.toString()
      ) || null;
    } catch { /* no submission */ }
  }

  // Auto-detect attendance from most recent game session
  lastGameAttendees = [];
  try {
    const sessions = await apiGet('/api/game_sessions');
    if (sessions.length) {
      const latest = sessions[0]; // sorted newest first by API
      const entry = (latest.attendance || []).find(a =>
        a.character_id === currentChar._id || a.character_id?.toString() === currentChar._id?.toString()
      );
      gateValues.attended = entry?.attended ? 'yes' : 'no';
      // Build attendee list (excluding current character)
      lastGameAttendees = (latest.attendance || [])
        .filter(a => a.attended && a.character_id !== currentChar._id && a.character_id?.toString() !== currentChar._id?.toString())
        .map(a => ({ id: a.character_id, name: a.character_display || a.character_name || '' }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch { /* game_sessions is ST-only — fall back */ }

  // If attendee list empty (player can't access game_sessions), use character names
  if (!lastGameAttendees.length) {
    try {
      const names = await apiGet('/api/characters/names');
      lastGameAttendees = names
        .filter(c => c._id !== currentChar._id && c._id?.toString() !== currentChar._id?.toString())
        .map(c => ({ id: c._id, name: c.moniker || c.name }));
    } catch { /* ignore */ }
  }

  // Auto-detect regent status from character data
  gateValues.is_regent = currentChar.regent_territory ? 'yes' : 'no';

  // Load character name list and persisted residency for regency dropdowns
  if (gateValues.is_regent === 'yes') {
    try {
      allCharNames = await apiGet('/api/characters/names');
    } catch { allCharNames = []; }
    try {
      const res = await apiGet(`/api/territory-residency?territory=${encodeURIComponent(currentChar.regent_territory)}`);
      persistedResidency = res.residents || [];
    } catch { persistedResidency = []; }
  }

  // Load all territory residency lists (for feeding grid indicators)
  try {
    const allRes = await apiGet('/api/territory-residency');
    residencyByTerritory = {};
    for (const doc of allRes) {
      residencyByTerritory[doc.territory] = new Set(doc.residents || []);
    }
  } catch { residencyByTerritory = {}; }

  // Restore feeding state from saved responses
  if (responseDoc?.responses) {
    feedMethodId = responseDoc.responses['_feed_method'] || '';
    feedDiscName = responseDoc.responses['_feed_disc'] || '';
    feedSpecName = responseDoc.responses['_feed_spec'] || '';
    feedCustomAttr = responseDoc.responses['_feed_custom_attr'] || '';
    feedCustomSkill = responseDoc.responses['_feed_custom_skill'] || '';
    feedCustomDisc = responseDoc.responses['_feed_custom_disc'] || '';
  } else {
    feedMethodId = ''; feedDiscName = ''; feedSpecName = ''; feedCustomAttr = ''; feedCustomSkill = ''; feedCustomDisc = '';
  }

  // Detect merits and auto-gate sorcery
  detectMerits();

  // Restore saved states
  if (responseDoc?.responses) {
    const saved = responseDoc.responses;
    for (const gate of DOWNTIME_GATES) {
      gateValues[gate.key] = saved[`_gate_${gate.key}`] || '';
    }
    const allMerits = [...detectedMerits.spheres, ...detectedMerits.contacts, ...detectedMerits.retainers];
    for (const m of allMerits) {
      const key = meritKey(m);
      if (saved[`_merit_${key}`]) {
        gateValues[`merit_${key}`] = saved[`_merit_${key}`];
      }
    }
  }

  targetEl.innerHTML = `<div id="dt-container" class="reading-pane"></div>`;
  renderForm(document.getElementById('dt-container'));
}

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const status = responseDoc?.status || 'new';
  const role = getRole();
  const isST = role === 'st';
  const isSubmitted = status === 'submitted';

  let h = '';

  // Header
  h += '<div class="qf-header">';
  h += `<h3 class="qf-title">Downtime Submission</h3>`;
  if (currentCycle) {
    h += `<p class="qf-section-intro">${esc(currentCycle.label || currentCycle.title || 'Current Cycle')}</p>`;
  }
  h += '<div class="qf-meta">';
  if (isSubmitted) {
    h += '<span class="qf-badge qf-badge-submitted">Submitted</span>';
  } else if (status === 'draft') {
    h += '<span class="qf-badge qf-badge-draft">Draft</span>';
  } else {
    h += '<span class="qf-badge qf-badge-draft">Not Started</span>';
  }
  h += '<span id="dt-save-status" class="qf-save-status"></span>';
  h += '</div>';
  h += '<p class="qf-intro">Your responses auto-save as you type.</p>';
  h += '</div>';

  // Auto-detected status (attendance + regency)
  h += '<div class="qf-section">';
  h += '<h4 class="qf-section-title">Character Status</h4>';
  if (gateValues.attended === 'yes') {
    h += '<p class="qf-section-intro">Attended last game — Court section enabled.</p>';
  } else {
    h += '<p class="qf-section-intro">Did not attend last game — Court section skipped.</p>';
  }
  if (gateValues.is_regent === 'yes') {
    h += `<p class="qf-section-intro">Regent of ${esc(currentChar.regent_territory)} — Regency section enabled.</p>`;
  }
  if (gateValues.has_sorcery === 'yes') {
    const traditions = [];
    if (currentChar.disciplines?.Cruac) traditions.push('Cruac');
    if (currentChar.disciplines?.Theban) traditions.push('Theban Sorcery');
    h += `<p class="qf-section-intro">${traditions.join(' and ')} practitioner — Blood Sorcery section enabled.</p>`;
  }
  h += '</div>';

  // Static sections: Court, Feeding (Regency + Projects rendered specially)
  for (const section of DOWNTIME_SECTIONS) {
    if (section.key === 'regency') continue;
    if (section.key === 'projects') continue;
    if (section.key === 'acquisitions') continue;
    if (section.key === 'blood_sorcery') continue;
    if (section.key === 'vamping') continue;
    if (section.key === 'admin') continue;

    const isGated = section.gate && gateValues[section.gate] !== 'yes';
    const sectionClass = isGated ? 'qf-section dt-gated-hidden' : 'qf-section';

    h += `<div class="${sectionClass}" data-gate-section="${section.gate || ''}">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}</h4>`;
    if (section.intro) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }
    for (const q of section.questions) {
      const val = saved[q.key] || '';
      h += renderQuestion(q, val);
    }
    h += '</div>';
  }

  // ── Projects section with dynamic slots ──
  h += renderProjectSlots(saved);

  // ── Regency section with residency grid ──
  if (gateValues.is_regent === 'yes') {
    h += renderRegencySection(saved);
  }

  // ── Dynamic merit sections ──
  h += renderMeritToggles(saved);

  // Remaining static sections: Acquisitions, Blood Sorcery, Vamping, Admin
  if (DOWNTIME_GATES.length) {
    h += '<div class="qf-section">';
    h += '<h4 class="qf-section-title">Additional Sections</h4>';
    for (const gate of DOWNTIME_GATES) {
      const val = gateValues[gate.key] || saved[`_gate_${gate.key}`] || '';
      h += `<div class="qf-field">`;
      h += `<label class="qf-label">${esc(gate.label)}</label>`;
      h += `<div class="qf-radio-group">`;
      for (const opt of gate.options) {
        const checked = val === opt.value ? ' checked' : '';
        h += `<label class="qf-radio-label">`;
        h += `<input type="radio" name="gate-${gate.key}" value="${esc(opt.value)}"${checked} data-gate="${gate.key}">`;
        h += `<span>${esc(opt.label)}</span>`;
        h += `</label>`;
      }
      h += '</div></div>';
    }
    h += '</div>';
  }

  // ── Blood Sorcery (dynamic rite selector) ──
  if (gateValues.has_sorcery === 'yes') {
    h += renderSorcerySection(saved);
  }

  for (const key of ['acquisitions', 'vamping', 'admin']) {
    const section = DOWNTIME_SECTIONS.find(s => s.key === key);
    if (!section) continue;
    const isGated = section.gate && gateValues[section.gate] !== 'yes';
    const sectionClass = isGated ? 'qf-section dt-gated-hidden' : 'qf-section';

    h += `<div class="${sectionClass}" data-gate-section="${section.gate || ''}">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}</h4>`;
    if (section.intro) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }
    for (const q of section.questions) {
      const val = saved[q.key] || '';
      h += renderQuestion(q, val);
    }
    h += '</div>';
  }

  // Actions
  h += '<div class="qf-actions">';
  h += '<button class="qf-btn qf-btn-save" id="dt-btn-save">Save Draft</button>';
  h += '<button class="qf-btn qf-btn-submit" id="dt-btn-submit">Submit Downtime</button>';
  h += '</div>';

  container.innerHTML = h;

  // Wire events — skip if already wired (prevent listener stacking on re-render)
  if (container._dtWired) return;
  container._dtWired = true;

  container.addEventListener('input', scheduleSave);
  container.addEventListener('change', (e) => {
    const gateInput = e.target.closest('[data-gate]');
    if (gateInput) {
      gateValues[gateInput.dataset.gate] = gateInput.value;
      updateGatedSections(container);
    }
    // Merit toggle
    const meritToggle = e.target.closest('[data-merit-toggle]');
    if (meritToggle) {
      const mk = meritToggle.dataset.meritToggle;
      gateValues[`merit_${mk}`] = meritToggle.value;
      updateMeritSections(container);
    }
    // Project action — show/hide details
    const projectAction = e.target.closest('[data-project-action]');
    if (projectAction) {
      const n = projectAction.dataset.projectAction;
      const details = container.querySelector(`[data-project-details="${n}"]`);
      if (details) {
        if (projectAction.value) {
          details.classList.remove('dt-gated-hidden');
        } else {
          details.classList.add('dt-gated-hidden');
        }
      }
    }
    // Dice pool dropdown — update total
    const poolSelect = e.target.closest('[data-pool-prefix]');
    if (poolSelect) {
      updatePoolTotal(poolSelect.dataset.poolPrefix);
    }
    // XP category/item change — collect current state and re-render
    const xpCat = e.target.closest('[data-xp-cat]');
    const xpItem = e.target.closest('[data-xp-item]');
    const xpDots = e.target.closest('[data-xp-dots]');
    if (xpCat || xpItem || xpDots) {
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Sorcery rite selection — re-render to show details
    const sorcerySelect = e.target.closest('[data-sorcery-slot]');
    if (sorcerySelect) {
      // Save current responses before re-render
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Shoutout picks — disable already-selected in other slots
    const shoutoutSel = e.target.closest('[data-shoutout-slot]');
    if (shoutoutSel) {
      const selects = container.querySelectorAll('[data-shoutout-slot]');
      const selected = new Set();
      selects.forEach(s => { if (s.value) selected.add(s.value); });
      selects.forEach(s => {
        for (const opt of s.options) {
          if (!opt.value) continue;
          opt.disabled = opt.value !== s.value && selected.has(opt.value);
        }
      });
      scheduleSave();
      return;
    }
    // Feeding method discipline change
    const feedDiscSel = e.target.closest('#dt-feed-disc');
    if (feedDiscSel) {
      feedDiscName = feedDiscSel.value;
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Feeding custom pool changes
    const feedCustom = e.target.closest('#dt-feed-custom-attr, #dt-feed-custom-skill, #dt-feed-custom-disc');
    if (feedCustom) {
      feedCustomAttr = document.getElementById('dt-feed-custom-attr')?.value || '';
      feedCustomSkill = document.getElementById('dt-feed-custom-skill')?.value || '';
      feedCustomDisc = document.getElementById('dt-feed-custom-disc')?.value || '';
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Residency dropdown — enforce no duplicates
    const residencySelect = e.target.closest('[data-residency-slot]');
    if (residencySelect) {
      updateResidencyOptions(container);
    }
    scheduleSave();
  });

  // Click handler (feeding cards, spec chips, influence +/-)
  container.addEventListener('click', (e) => {
    // Feeding method cards
    const feedCard = e.target.closest('[data-feed-method]');
    if (feedCard) {
      feedMethodId = feedCard.dataset.feedMethod;
      feedDiscName = ''; feedSpecName = '';
      feedCustomAttr = ''; feedCustomSkill = ''; feedCustomDisc = '';
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Feeding spec chips
    const specChip = e.target.closest('[data-feed-spec]');
    if (specChip) {
      feedSpecName = feedSpecName === specChip.dataset.feedSpec ? '' : specChip.dataset.feedSpec;
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    const btn = e.target.closest('[data-inf-terr]');
    if (!btn) return;
    const tk = btn.dataset.infTerr;
    const dir = parseInt(btn.dataset.infDir, 10);
    const valEl = document.getElementById(`inf-val-${tk}`);
    if (!valEl) return;

    const budget = getInfluenceBudget();
    let currentVal = parseInt(valEl.textContent, 10) || 0;
    const newVal = currentVal + dir;

    // Calculate what total spent would be with this change
    let totalSpent = Math.abs(newVal);
    for (const terr of INFLUENCE_TERRITORIES) {
      const otherTk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (otherTk === tk) continue;
      const otherEl = document.getElementById(`inf-val-${otherTk}`);
      totalSpent += Math.abs(otherEl ? parseInt(otherEl.textContent, 10) || 0 : 0);
    }

    // Block if over budget
    if (totalSpent > budget) return;

    valEl.textContent = newVal;
    // Colour negative values
    valEl.classList.toggle('dt-inf-negative', newVal < 0);
    valEl.classList.toggle('dt-inf-positive', newVal > 0);

    // Update budget display
    const remaining = budget - totalSpent;
    const budgetEl = document.getElementById('dt-influence-budget');
    if (budgetEl) {
      const remSpan = budgetEl.querySelector('.dt-influence-remaining');
      if (remSpan) {
        remSpan.textContent = remaining;
        remSpan.classList.toggle('dt-influence-over', remaining < 0);
      }
    }

    scheduleSave();
  });

  document.getElementById('dt-btn-save')?.addEventListener('click', saveDraft);
  document.getElementById('dt-btn-submit')?.addEventListener('click', submitForm);
}

// ── Project slots ──

function renderProjectSlots(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'projects');
  const slotCount = section?.projectSlots || 4;

  // Build attribute/skill/discipline option lists from character data
  const attrs = ALL_ATTRS.filter(a => {
    const v = currentChar.attributes?.[a];
    return v && (v.dots + (v.bonus || 0)) > 0;
  });
  const skills = ALL_SKILLS.filter(s => {
    const v = currentChar.skills?.[s];
    return v && (v.dots + (v.bonus || 0)) > 0;
  });
  const discs = Object.keys(currentChar.disciplines || {}).filter(d =>
    currentChar.disciplines[d] > 0
  );

  let h = '<div class="qf-section">';
  h += `<h4 class="qf-section-title">${esc(section.title)}</h4>`;
  if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;

  for (let n = 1; n <= slotCount; n++) {
    const actionVal = saved[`project_${n}_action`] || '';
    const hasAction = actionVal && actionVal !== '';

    h += `<div class="dt-project-slot" data-project-slot="${n}">`;
    // Action type selector — always visible
    h += '<div class="qf-field">';
    h += `<label class="qf-label" for="dt-project_${n}_action">Project ${n}: Action Type</label>`;
    h += `<select id="dt-project_${n}_action" class="qf-select" data-project-action="${n}">`;
    for (const opt of PROJECT_ACTIONS) {
      const sel = actionVal === opt.value ? ' selected' : '';
      h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
    }
    h += '</select></div>';

    // Remaining fields — hidden if no action selected
    const detailClass = hasAction ? 'dt-project-details' : 'dt-project-details dt-gated-hidden';
    h += `<div class="${detailClass}" data-project-details="${n}">`;

    // Primary dice pool
    h += renderDicePool(n, 'pool', 'Primary Dice Pool', attrs, skills, discs, saved);

    // Secondary dice pool
    h += renderDicePool(n, 'pool2', 'Secondary Dice Pool (optional)', attrs, skills, discs, saved);

    // Desired outcome
    h += renderQuestion({
      key: `project_${n}_outcome`, label: `Desired Outcome`,
      type: 'text', required: false,
      desc: 'Each Project must aim to achieve ONE clear thing.',
    }, saved[`project_${n}_outcome`] || '');

    // Description
    h += renderQuestion({
      key: `project_${n}_description`, label: `Description`,
      type: 'textarea', required: false,
      desc: 'Project Name:\nCharacters involved:\nMerits & Bonuses:\nXP Spend:\nProject description:',
    }, saved[`project_${n}_description`] || '');

    h += '</div>'; // project-details
    h += '</div>'; // project-slot
  }

  h += '</div>';
  return h;
}

function renderDicePool(slotNum, poolKey, label, attrs, skills, discs, saved) {
  const prefix = `project_${slotNum}_${poolKey}`;
  const savedAttr = saved[`${prefix}_attr`] || '';
  const savedSkill = saved[`${prefix}_skill`] || '';
  const savedDisc = saved[`${prefix}_disc`] || '';

  // Calculate total from saved selections
  let total = 0;
  if (savedAttr) {
    const a = currentChar.attributes?.[savedAttr];
    if (a) total += (a.dots || 0) + (a.bonus || 0);
  }
  if (savedSkill) {
    const s = currentChar.skills?.[savedSkill];
    if (s) total += (s.dots || 0) + (s.bonus || 0);
  }
  if (savedDisc) {
    total += currentChar.disciplines?.[savedDisc] || 0;
  }

  let h = '<div class="qf-field">';
  h += `<label class="qf-label">${esc(label)}</label>`;
  h += '<div class="dt-dice-pool-row">';

  // Attribute dropdown
  h += `<select id="dt-${prefix}_attr" class="qf-select dt-pool-select" data-pool-prefix="${prefix}">`;
  h += '<option value="">Attribute</option>';
  for (const a of attrs) {
    const v = currentChar.attributes[a];
    const dots = (v.dots || 0) + (v.bonus || 0);
    const sel = savedAttr === a ? ' selected' : '';
    h += `<option value="${esc(a)}"${sel}>${esc(a)} (${dots})</option>`;
  }
  h += '</select>';

  // Skill dropdown
  h += `<select id="dt-${prefix}_skill" class="qf-select dt-pool-select" data-pool-prefix="${prefix}">`;
  h += '<option value="">Skill</option>';
  for (const s of skills) {
    const v = currentChar.skills[s];
    const dots = (v.dots || 0) + (v.bonus || 0);
    const specs = v.specs?.length ? ` [${v.specs.join(', ')}]` : '';
    const sel = savedSkill === s ? ' selected' : '';
    h += `<option value="${esc(s)}"${sel}>${esc(s)} (${dots})${esc(specs)}</option>`;
  }
  h += '</select>';

  // Discipline dropdown (optional)
  h += `<select id="dt-${prefix}_disc" class="qf-select dt-pool-select" data-pool-prefix="${prefix}">`;
  h += '<option value="">Discipline</option>';
  for (const d of discs) {
    const dots = currentChar.disciplines[d];
    const sel = savedDisc === d ? ' selected' : '';
    h += `<option value="${esc(d)}"${sel}>${esc(d)} (${dots})</option>`;
  }
  h += '</select>';

  // Total
  h += `<span class="dt-pool-total" id="${prefix}_total">${total || '—'}</span>`;
  h += '</div></div>';
  return h;
}

// ── XP Spend Grid ──

const XP_CATEGORIES = [
  { value: '', label: '— Select Category —' },
  { value: 'attribute', label: 'Attribute' },
  { value: 'skill', label: 'Skill' },
  { value: 'discipline', label: 'Discipline' },
  { value: 'merit', label: 'Merit' },
  { value: 'devotion', label: 'Devotion' },
  { value: 'rite', label: 'Rite' },
];

function isClanDisc(discName) {
  const bl = currentChar.bloodline;
  const clan = currentChar.clan;
  if (bl && BLOODLINE_DISCS[bl]) return BLOODLINE_DISCS[bl].includes(discName);
  if (clan && CLAN_DISCS[clan]) return CLAN_DISCS[clan].includes(discName);
  return false;
}

/** Parse merit rating string: "2" → { flat: true, min: 2, max: 2 }, "1–5" → { flat: false, min: 1, max: 5 } */
function parseMeritRating(ratingStr) {
  if (!ratingStr) return { flat: true, min: 1, max: 1 };
  const match = ratingStr.match(/(\d+)\s*[–\-]\s*(\d+)/);
  if (match) return { flat: false, min: parseInt(match[1], 10), max: parseInt(match[2], 10) };
  const single = parseInt(ratingStr, 10);
  return { flat: true, min: single || 1, max: single || 1 };
}

function getXpCost(category, item) {
  switch (category) {
    case 'attribute': return 4;
    case 'skill': return 2;
    case 'discipline': return isClanDisc(item) ? 3 : 4;
    case 'merit': {
      // Item format: "Name|flat|rating|0" or "Name|grad|currentDots|maxTarget"
      // For graduated, the actual dots purchased comes from the dots selector
      const parts = item.split('|');
      if (parts[1] === 'flat') return parseInt(parts[2], 10) || 1;
      // Graduated: cost comes from the row's dotsBuying field
      return 0; // calculated dynamically via row.dotsBuying
    }
    case 'devotion': {
      const dev = DEVOTIONS_DB.find(d => d.n === item);
      return dev ? dev.xp : 2;
    }
    case 'rite': return 4;
    default: return 0;
  }
}

function getItemsForCategory(category) {
  const c = currentChar;
  switch (category) {
    case 'attribute':
      return ALL_ATTRS.map(a => {
        const v = c.attributes?.[a];
        const dots = v ? (v.dots || 0) + (v.bonus || 0) : 0;
        return { value: a, label: `${a} (${dots} → ${dots + 1})` };
      });
    case 'skill':
      return ALL_SKILLS.map(s => {
        const v = c.skills?.[s];
        const dots = v ? (v.dots || 0) + (v.bonus || 0) : 0;
        return { value: s, label: `${s} (${dots} → ${dots + 1})` };
      });
    case 'discipline': {
      // Character's current disciplines + all core clan discs they might learn
      const owned = Object.keys(c.disciplines || {});
      const clanDiscs = (c.bloodline && BLOODLINE_DISCS[c.bloodline])
        || (c.clan && CLAN_DISCS[c.clan]) || [];
      const all = [...new Set([...clanDiscs, ...CORE_DISCS, ...owned])].sort();
      return all.map(d => {
        const dots = c.disciplines?.[d] || 0;
        const cost = isClanDisc(d) ? 3 : 4;
        const tag = isClanDisc(d) ? 'clan' : 'out';
        return { value: d, label: `${d} (${dots} → ${dots + 1}) [${tag}, ${cost} XP]` };
      });
    }
    case 'merit': {
      const items = [];
      const charMerits = c.merits || [];
      function currentMeritDots(meritName) {
        const found = charMerits.filter(m =>
          m.name && m.name.toLowerCase() === meritName.toLowerCase()
        );
        return found.length ? Math.max(...found.map(m => m.rating || 0)) : 0;
      }

      for (const [key, m] of Object.entries(MERITS_DB)) {
        if (m.type === 'Invictus Oath' || m.type === 'Carthian Law') continue;
        if (m.prereq && !meritQualifies(c, m.prereq)) continue;
        const name = key.split(' ').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
        const rating = parseMeritRating(m.rating);
        const currentDots = currentMeritDots(key);
        if (currentDots >= rating.max) continue;

        if (rating.flat) {
          // Flat merit: all dots at once
          items.push({
            value: `${name}|flat|${rating.max}|0`,
            label: `${name} (${rating.max} dots, ${rating.max} XP) — all at once`,
          });
        } else {
          // Graduated merit: one entry, dots selector will appear on selection
          // value encodes: name|grad|currentDots|maxBuyable
          // maxBuyable: up to 3 can be multi-dot, 4+ is one at a time
          const maxTarget = currentDots < 3
            ? Math.min(3, rating.max)
            : Math.min(currentDots + 1, rating.max);
          items.push({
            value: `${name}|grad|${currentDots}|${maxTarget}`,
            label: `${name} (currently ${currentDots} dot${currentDots !== 1 ? 's' : ''})`,
          });
        }
      }
      items.sort((a, b) => a.label.localeCompare(b.label));
      return items;
    }
    case 'devotion': {
      const discs = c.disciplines || {};
      return DEVOTIONS_DB
        .filter(d => {
          if (d.bl && d.bl !== c.bloodline) return false;
          return d.p.every(req => (discs[req.disc] || 0) >= req.dots);
        })
        .map(d => ({ value: d.n, label: `${d.n} (${d.xp} XP)` }));
    }
    case 'rite': {
      // Rites they could learn at their current Cruac/Theban level
      const cruacLevel = c.disciplines?.Cruac || 0;
      const thebanLevel = c.disciplines?.Theban || 0;
      const items = [];
      if (cruacLevel > 0) {
        for (let lvl = 1; lvl <= cruacLevel; lvl++) {
          items.push({ value: `Cruac Rite (Level ${lvl})`, label: `Cruac Rite (Level ${lvl})` });
        }
      }
      if (thebanLevel > 0) {
        for (let lvl = 1; lvl <= thebanLevel; lvl++) {
          items.push({ value: `Theban Rite (Level ${lvl})`, label: `Theban Rite (Level ${lvl})` });
        }
      }
      return items;
    }
    default: return [];
  }
}

function renderXpRow(idx, row) {
  let h = `<div class="dt-xp-row" data-xp-row="${idx}">`;

  // Category dropdown
  h += `<select class="qf-select dt-xp-cat" data-xp-cat="${idx}">`;
  for (const opt of XP_CATEGORIES) {
    const sel = row.category === opt.value ? ' selected' : '';
    h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
  }
  h += '</select>';

  // Item dropdown (populated based on category)
  if (row.category) {
    const items = getItemsForCategory(row.category);
    h += `<select class="qf-select dt-xp-item" data-xp-item="${idx}">`;
    h += '<option value="">— Select —</option>';
    for (const item of items) {
      const sel = row.item === item.value ? ' selected' : '';
      h += `<option value="${esc(item.value)}"${sel}>${esc(item.label)}</option>`;
    }
    h += '</select>';
  }

  // For graduated merits: dots selector
  if (row.item && row.category === 'merit') {
    const parts = row.item.split('|');
    if (parts[1] === 'grad') {
      const currentDots = parseInt(parts[2], 10) || 0;
      const maxTarget = parseInt(parts[3], 10) || currentDots + 1;
      const selectedTarget = row.dotsBuying
        ? currentDots + row.dotsBuying
        : 0;

      h += `<select class="qf-select dt-xp-dots" data-xp-dots="${idx}">`;
      h += '<option value="">Buy to...</option>';
      for (let target = currentDots + 1; target <= maxTarget; target++) {
        const dotsBuying = target - currentDots;
        const sel = selectedTarget === target ? ' selected' : '';
        h += `<option value="${dotsBuying}"${sel}>${'●'.repeat(target)} (dot ${target}, ${dotsBuying} XP)</option>`;
      }
      h += '</select>';
    }
  }

  // Cost display
  const cost = getRowCost(row);
  if (cost > 0) {
    h += `<span class="dt-xp-cost">${cost} XP</span>`;
  }

  h += '</div>';
  return h;
}

function getRowCost(row) {
  if (!row.item || !row.category) return 0;
  if (row.category === 'merit') {
    const parts = row.item.split('|');
    if (parts[1] === 'flat') return parseInt(parts[2], 10) || 1;
    if (parts[1] === 'grad') return row.dotsBuying || 0;
    return 0;
  }
  return getXpCost(row.category, row.item);
}

// ── Blood Sorcery ──

function renderSorcerySection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'blood_sorcery');
  const slotCount = section?.sorcerySlots || 3;
  const rites = (currentChar.powers || []).filter(p => p.category === 'rite');
  // Sort by tradition then level
  rites.sort((a, b) => a.tradition.localeCompare(b.tradition) || a.level - b.level);

  let h = '<div class="qf-section">';
  h += `<h4 class="qf-section-title">${esc(section.title)}</h4>`;
  if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;

  for (let n = 1; n <= slotCount; n++) {
    const selectedRite = saved[`sorcery_${n}_rite`] || '';
    const rite = rites.find(r => r.name === selectedRite);

    h += `<div class="dt-sorcery-slot">`;
    h += '<div class="qf-field">';
    h += `<label class="qf-label" for="dt-sorcery_${n}_rite">Rite ${n}</label>`;
    h += `<select id="dt-sorcery_${n}_rite" class="qf-select" data-sorcery-slot="${n}">`;
    h += '<option value="">— No Rite —</option>';
    let lastTradition = '';
    for (const r of rites) {
      if (r.tradition !== lastTradition) {
        if (lastTradition) h += '</optgroup>';
        h += `<optgroup label="${esc(r.tradition)}">`;
        lastTradition = r.tradition;
      }
      const sel = selectedRite === r.name ? ' selected' : '';
      h += `<option value="${esc(r.name)}"${sel}>${esc(r.name)} (Level ${r.level})</option>`;
    }
    if (lastTradition) h += '</optgroup>';
    h += '</select></div>';

    // Rite details — shown when a rite is selected
    if (rite) {
      h += '<div class="dt-sorcery-details">';
      h += '<div class="dt-sorcery-info">';
      h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Tradition/Level:</span> ${esc(rite.tradition)} ${rite.level}</div>`;
      h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Stats:</span> ${esc(rite.stats || '')}</div>`;
      h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Effect:</span> ${esc(rite.effect || '')}</div>`;
      h += '</div>';

      h += renderQuestion({
        key: `sorcery_${n}_targets`, label: 'Target/s',
        type: 'text', required: false, desc: null,
      }, saved[`sorcery_${n}_targets`] || '');

      h += renderQuestion({
        key: `sorcery_${n}_notes`, label: 'Additional Notes',
        type: 'textarea', required: false,
        desc: 'Any extra context: co-casters, specific intentions, location, etc.',
      }, saved[`sorcery_${n}_notes`] || '');

      h += '</div>';
    }
    h += '</div>';
  }

  h += '</div>';
  return h;
}

// ── Regency grid ──

function renderRegencySection(saved) {
  const regencySection = DOWNTIME_SECTIONS.find(s => s.key === 'regency');
  const cap = getRegentCap();
  const terrName = currentChar.regent_territory;
  const terr = TERRITORY_DATA.find(t => t.name === terrName);
  const ambience = terr ? terr.ambience : 'Unknown';
  const regentName = displayName(currentChar);

  let h = '';
  h += '<div class="qf-section">';
  h += `<h4 class="qf-section-title">Regency: The Hand that Feeds</h4>`;
  h += `<p class="qf-section-intro">${esc(terrName)} — Ambience: ${esc(ambience)} — Feeding cap: ${cap}</p>`;
  h += `<p class="qf-section-intro">Assign feeding residents for your territory. Slots beyond the feeding cap are highlighted as over-capacity.</p>`;

  h += '<div class="dt-residency-grid">';
  for (let i = 1; i <= RESIDENCY_SLOTS; i++) {
    const overCap = i > cap;
    const rowClass = overCap ? 'dt-residency-row dt-over-cap' : 'dt-residency-row';
    // Prefer saved submission value, fall back to persisted residency from last cycle
    const savedVal = saved[`residency_${i}`] || persistedResidency[i - 1] || '';

    // Row 1: always the regent (locked)
    // Row 2: labelled "Second" (selectable)
    let label;
    let locked = false;
    let value = savedVal;

    if (i === 1) {
      label = 'Regent';
      locked = true;
      value = currentChar._id;
    } else if (i === 2) {
      label = 'Second';
    } else {
      label = `Resident ${i}`;
    }

    h += `<div class="${rowClass}">`;
    h += `<span class="dt-residency-label">${label}</span>`;

    if (locked) {
      h += `<span class="dt-residency-locked">${esc(regentName)}</span>`;
      h += `<input type="hidden" id="dt-residency_${i}" value="${esc(value)}">`;
    } else {
      h += `<select id="dt-residency_${i}" class="qf-select dt-residency-select" data-residency-slot="${i}">`;
      h += `<option value="">— None —</option>`;
      for (const c of allCharNames) {
        const cName = displayName(c);
        const sel = value === c._id ? ' selected' : '';
        h += `<option value="${esc(c._id)}"${sel}>${esc(cName)}</option>`;
      }
      h += '</select>';
    }

    if (overCap) {
      h += '<span class="dt-over-cap-warn">Over capacity</span>';
    }
    h += '</div>';
  }
  h += '</div>';

  // Regency action question (from static section)
  if (regencySection) {
    for (const q of regencySection.questions) {
      const val = saved[q.key] || '';
      h += renderQuestion(q, val);
    }
  }

  h += '</div>';
  return h;
}

/** Disable already-selected characters in other residency dropdowns. */
function updateResidencyOptions(container) {
  const selects = container.querySelectorAll('[data-residency-slot]');
  // Gather all currently selected values
  const selected = new Set();
  // Always include the regent (slot 1)
  selected.add(currentChar._id);
  selects.forEach(sel => {
    if (sel.value) selected.add(sel.value);
  });

  // Disable options that are already chosen in another slot
  selects.forEach(sel => {
    const myVal = sel.value;
    for (const opt of sel.options) {
      if (!opt.value) continue; // skip "— None —"
      opt.disabled = opt.value !== myVal && selected.has(opt.value);
    }
  });
}

/** Recalculate and display the dice pool total for a given pool prefix. */
function updatePoolTotal(prefix) {
  const attrEl = document.getElementById(`dt-${prefix}_attr`);
  const skillEl = document.getElementById(`dt-${prefix}_skill`);
  const discEl = document.getElementById(`dt-${prefix}_disc`);
  const totalEl = document.getElementById(`${prefix}_total`);
  if (!totalEl) return;

  let total = 0;
  if (attrEl?.value) {
    const a = currentChar.attributes?.[attrEl.value];
    if (a) total += (a.dots || 0) + (a.bonus || 0);
  }
  if (skillEl?.value) {
    const s = currentChar.skills?.[skillEl.value];
    if (s) total += (s.dots || 0) + (s.bonus || 0);
  }
  if (discEl?.value) {
    total += currentChar.disciplines?.[discEl.value] || 0;
  }

  totalEl.textContent = total || '—';
}

// ── Merit toggles ──

/** Render a merit toggle with its form inlined directly below. */
function renderMeritToggle(m, saved, formHtml) {
  const key = meritKey(m);
  const val = gateValues[`merit_${key}`] || saved[`_merit_${key}`] || '';
  const active = val === 'yes';

  let h = `<div class="qf-field">`;
  h += `<label class="qf-label">${meritLabel(m)} — use this Downtime?</label>`;
  h += `<div class="qf-radio-group">`;
  for (const opt of [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }]) {
    const checked = val === opt.value ? ' checked' : '';
    h += `<label class="qf-radio-label">`;
    h += `<input type="radio" name="merit-${key}" value="${opt.value}"${checked} data-merit-toggle="${key}">`;
    h += `<span>${opt.label}</span>`;
    h += `</label>`;
  }
  h += '</div>';
  // Inline form — shown only when active
  if (active && formHtml) {
    h += `<div class="dt-merit-inline" data-merit-section="${key}">${formHtml}</div>`;
  }
  h += '</div>';
  return h;
}

/** Render merit toggle radios with inline form sections. */
function renderMeritToggles(saved) {
  let h = '';
  const hasSpheres = detectedMerits.spheres.length > 0;
  const hasContacts = detectedMerits.contacts.length > 0;
  const hasRetainers = detectedMerits.retainers.length > 0;

  if (!hasSpheres && !hasContacts && !hasRetainers) return '';

  // ── Spheres of Influence (Allies / Status) ──
  if (hasSpheres) {
    h += '<div class="qf-section">';
    h += '<h4 class="qf-section-title">Spheres of Influence</h4>';
    h += '<p class="qf-section-intro">Your character has the following Allies and Status merits. Select which you wish to activate this Downtime (maximum 5 sphere actions).</p>';

    let sphereIdx = 0;
    for (const m of detectedMerits.spheres) {
      const key = meritKey(m);
      const active = gateValues[`merit_${key}`] === 'yes';

      let formHtml = '';
      if (active) {
        sphereIdx++;
        if (sphereIdx <= 5) {
          formHtml += renderQuestion({
            key: `sphere_${sphereIdx}_action`, label: 'Action Type',
            type: 'select', required: false, desc: null, options: SPHERE_ACTIONS,
          }, saved[`sphere_${sphereIdx}_action`] || '');
          formHtml += renderQuestion({
            key: `sphere_${sphereIdx}_outcome`, label: 'Desired Outcome',
            type: 'text', required: false, desc: null,
          }, saved[`sphere_${sphereIdx}_outcome`] || '');
          formHtml += renderQuestion({
            key: `sphere_${sphereIdx}_description`, label: 'Description',
            type: 'textarea', required: false, desc: null,
          }, saved[`sphere_${sphereIdx}_description`] || '');
        }
      }
      h += renderMeritToggle(m, saved, formHtml);
    }
    h += '</div>';
  }

  // ── Contacts ──
  if (hasContacts) {
    h += '<div class="qf-section">';
    h += '<h4 class="qf-section-title">Contacts: Requests for Information</h4>';
    h += '<p class="qf-section-intro">Your character has the following Contacts. Select which you wish to use this Downtime (maximum 5 information requests).</p>';

    let contactIdx = 0;
    for (const m of detectedMerits.contacts) {
      const key = meritKey(m);
      const active = gateValues[`merit_${key}`] === 'yes';

      let formHtml = '';
      if (active) {
        contactIdx++;
        if (contactIdx <= 5) {
          formHtml += renderQuestion({
            key: `contact_${contactIdx}`, label: `${m.area || 'Contact'}: Information Request`,
            type: 'textarea', required: false, desc: 'Supporting Info:\nRequest:',
          }, saved[`contact_${contactIdx}`] || '');
        }
      }
      h += renderMeritToggle(m, saved, formHtml);
    }
    h += '</div>';
  }

  // ── Retainers ──
  if (hasRetainers) {
    h += '<div class="qf-section">';
    h += '<h4 class="qf-section-title">Retainers: Task Delegation</h4>';
    h += '<p class="qf-section-intro">Your character has the following Retainer merits. Select which you wish to task this Downtime.</p>';

    let retainerIdx = 0;
    for (const m of detectedMerits.retainers) {
      const key = meritKey(m);
      const active = gateValues[`merit_${key}`] === 'yes';

      let formHtml = '';
      if (active) {
        retainerIdx++;
        formHtml += renderQuestion({
          key: `retainer_${retainerIdx}`, label: 'Task Description',
          type: 'textarea', required: false, desc: 'Area of Expertise:\nSupporting Info:\nRequest:',
        }, saved[`retainer_${retainerIdx}`] || '');
      }
      h += renderMeritToggle(m, saved, formHtml);
    }
    h += '</div>';
  }

  return h;
}

// ── Utilities ──

function updateGatedSections(container) {
  container.querySelectorAll('[data-gate-section]').forEach(section => {
    const gate = section.dataset.gateSection;
    if (!gate) return;
    if (gateValues[gate] === 'yes') {
      section.classList.remove('dt-gated-hidden');
    } else {
      section.classList.add('dt-gated-hidden');
    }
  });
}

function updateMeritSections(container) {
  renderForm(container);
}

function renderQuestion(q, value) {
  const reqMark = q.required ? ' <span class="qf-req">*</span>' : '';
  let h = `<div class="qf-field">`;
  h += `<label class="qf-label" for="dt-${q.key}">${esc(q.label)}${reqMark}</label>`;

  if (q.desc) {
    let descHtml = esc(q.desc).replace(/\n/g, '<br>');
    descHtml = descHtml.replace(/(Example:\s*.*)$/i, '<em>$1</em>');
    h += `<p class="qf-desc">${descHtml}</p>`;
  }

  switch (q.type) {
    case 'text':
      h += `<input type="text" id="dt-${q.key}" class="qf-input" value="${esc(value)}">`;
      break;

    case 'textarea':
      h += `<textarea id="dt-${q.key}" class="qf-textarea" rows="${q.rows || 4}">${esc(value)}</textarea>`;
      break;

    case 'select':
      h += `<select id="dt-${q.key}" class="qf-select">`;
      for (const opt of q.options) {
        const sel = value === String(opt.value) ? ' selected' : '';
        h += `<option value="${esc(String(opt.value))}"${sel}>${esc(opt.label)}</option>`;
      }
      h += '</select>';
      break;

    case 'radio':
      h += `<div class="qf-radio-group" id="dt-${q.key}">`;
      for (const opt of q.options) {
        const checked = value === opt.value ? ' checked' : '';
        h += `<label class="qf-radio-label">`;
        h += `<input type="radio" name="dt-${q.key}" value="${esc(opt.value)}"${checked}>`;
        h += `<span>${esc(opt.label)}</span>`;
        h += `</label>`;
      }
      h += '</div>';
      break;

    case 'shoutout_picks': {
      // Parse saved value: JSON array of character IDs
      let picks = [];
      if (value) { try { picks = JSON.parse(value); } catch { /* ignore */ } }
      // Ensure 3 slots
      while (picks.length < 3) picks.push('');

      h += '<div class="dt-shoutout-picks">';
      for (let i = 0; i < 3; i++) {
        // Build options excluding already-selected characters in other slots
        const otherPicks = picks.filter((p, j) => j !== i && p);
        h += `<select class="qf-select dt-shoutout-sel" data-shoutout-slot="${i}">`;
        h += `<option value="">${i < 2 ? '\u2014 Select \u2014' : '\u2014 Optional \u2014'}</option>`;
        for (const att of lastGameAttendees) {
          const disabled = otherPicks.includes(att.id) ? ' disabled' : '';
          const sel = picks[i] === att.id ? ' selected' : '';
          h += `<option value="${esc(att.id)}"${sel}${disabled}>${esc(att.name)}</option>`;
        }
        h += '</select>';
      }
      h += '</div>';
      break;
    }

    case 'feeding_method': {
      const c = currentChar;
      const savedDesc = responseDoc?.responses?.['feeding_description'] || '';

      h += '<div class="dt-feed-methods">';
      for (const m of FEED_METHODS) {
        const sel = feedMethodId === m.id ? ' dt-feed-sel' : '';
        h += `<button type="button" class="dt-feed-card${sel}" data-feed-method="${m.id}">`;
        h += `<div class="dt-feed-card-name">${esc(m.name)}</div>`;
        h += `<div class="dt-feed-card-desc">${esc(m.desc)}</div>`;
        h += '</button>';
      }
      h += '</div>';

      // Pool breakdown for selected method
      if (feedMethodId && feedMethodId !== 'other') {
        const m = FEED_METHODS.find(fm => fm.id === feedMethodId);
        if (m) {
          // Best attr
          let bestA = '', bestAV = 0;
          for (const a of m.attrs) {
            const av = c.attributes?.[a]; const v = av ? (av.dots || 0) + (av.bonus || 0) : 0;
            if (v > bestAV) { bestAV = v; bestA = a; }
          }
          // Best skill + collect specs
          let bestS = '', bestSV = 0, bestSpecs = [];
          for (const s of m.skills) {
            const sv = c.skills?.[s]; const v = sv ? (sv.dots || 0) + (sv.bonus || 0) : 0;
            if (v > bestSV) { bestSV = v; bestS = s; bestSpecs = sv?.specs || []; }
          }

          // Spec bonus: check for Area of Expertise merit
          const hasAoE = (c.merits || []).some(m =>
            m.name && m.name.toLowerCase() === 'area of expertise'
          );
          const specBonus = feedSpecName ? (hasAoE ? 2 : 1) : 0;

          // Discipline selector
          const availDiscs = m.discs.filter(d => c.disciplines?.[d]);
          const discVal = (feedDiscName && c.disciplines?.[feedDiscName]) || 0;
          const total = bestAV + bestSV + discVal + specBonus;

          h += '<div class="dt-feed-pool">';
          h += '<div class="dt-feed-breakdown">';
          h += `<span class="dt-feed-bv">${bestAV}</span> ${esc(bestA)}`;
          h += ` + <span class="dt-feed-bv">${bestSV}</span> ${esc(bestS)}`;
          if (bestSpecs.length) h += ` <span class="dt-feed-dim">[${esc(bestSpecs.join(', '))}]</span>`;
          if (discVal) h += ` + <span class="dt-feed-bv">${discVal}</span> ${esc(feedDiscName)}`;
          if (specBonus) h += ` + <span class="dt-feed-bv">${specBonus}</span> ${esc(feedSpecName)}`;
          h += ` = <span class="dt-feed-total">${total} dice</span>`;
          h += '</div>';

          // Specialisation chips (if best skill has specs)
          if (bestSpecs.length) {
            h += '<div class="dt-feed-spec-row">';
            h += '<label class="dt-feed-disc-lbl">Specialisation:</label>';
            for (const sp of bestSpecs) {
              const on = feedSpecName === sp ? ' dt-feed-spec-on' : '';
              h += `<button type="button" class="dt-feed-spec-chip${on}" data-feed-spec="${esc(sp)}">${esc(sp)} <span class="dt-feed-spec-bonus">+${hasAoE ? 2 : 1}</span></button>`;
            }
            h += '</div>';
          }

          // Discipline dropdown
          if (availDiscs.length) {
            h += '<div class="dt-feed-disc-row">';
            h += '<label class="dt-feed-disc-lbl">Discipline:</label>';
            h += '<select class="qf-select dt-feed-disc-sel" id="dt-feed-disc">';
            h += '<option value="">None</option>';
            for (const d of availDiscs) {
              const dv = c.disciplines[d];
              const sel = feedDiscName === d ? ' selected' : '';
              h += `<option value="${esc(d)}"${sel}>${esc(d)} (${dv})</option>`;
            }
            h += '</select></div>';
          }
          h += '</div>';
        }
      }

      // "Other" custom pool builder
      if (feedMethodId === 'other') {
        const attrs = ALL_ATTRS.filter(a => { const v = c.attributes?.[a]; return v && (v.dots + (v.bonus || 0)) > 0; });
        const skills = ALL_SKILLS.filter(s => { const v = c.skills?.[s]; return v && (v.dots + (v.bonus || 0)) > 0; });
        const discs = Object.entries(c.disciplines || {}).filter(([, v]) => v > 0);

        let customTotal = 0;
        if (feedCustomAttr) { const a = c.attributes?.[feedCustomAttr]; if (a) customTotal += (a.dots || 0) + (a.bonus || 0); }
        if (feedCustomSkill) { const s = c.skills?.[feedCustomSkill]; if (s) customTotal += (s.dots || 0) + (s.bonus || 0); }
        if (feedCustomDisc) customTotal += c.disciplines?.[feedCustomDisc] || 0;

        h += '<div class="dt-feed-custom">';
        h += '<p class="qf-desc">Custom feeding method — subject to ST approval.</p>';
        h += '<div class="dt-feed-custom-row">';
        h += '<select class="qf-select" id="dt-feed-custom-attr"><option value="">Attribute</option>';
        for (const a of attrs) {
          const v = c.attributes[a]; const dots = (v.dots || 0) + (v.bonus || 0);
          h += `<option value="${esc(a)}"${feedCustomAttr === a ? ' selected' : ''}>${esc(a)} (${dots})</option>`;
        }
        h += '</select>';
        h += '<select class="qf-select" id="dt-feed-custom-skill"><option value="">Skill</option>';
        for (const s of skills) {
          const v = c.skills[s]; const dots = (v.dots || 0) + (v.bonus || 0);
          h += `<option value="${esc(s)}"${feedCustomSkill === s ? ' selected' : ''}>${esc(s)} (${dots})</option>`;
        }
        h += '</select>';
        h += '<select class="qf-select" id="dt-feed-custom-disc"><option value="">Discipline</option>';
        for (const [d, v] of discs) {
          h += `<option value="${esc(d)}"${feedCustomDisc === d ? ' selected' : ''}>${esc(d)} (${v})</option>`;
        }
        h += '</select>';
        if (customTotal) h += `<span class="dt-feed-total">= ${customTotal} dice</span>`;
        h += '</div></div>';
      }

      // Description textarea (always shown when method selected)
      if (feedMethodId) {
        h += '<div class="qf-field" style="margin-top:10px;">';
        h += '<label class="qf-label" for="dt-feeding_description">Describe how your character hunts</label>';
        h += `<textarea id="dt-feeding_description" class="qf-textarea" rows="4">${esc(savedDesc)}</textarea>`;
        h += '</div>';
      }

      break;
    }

    case 'xp_grid': {
      // Parse saved XP spend rows: JSON array of { category, item, cost }
      let xpRows = [];
      if (value) {
        try { xpRows = JSON.parse(value); } catch { /* ignore */ }
      }
      // Ensure at least one empty row
      if (!xpRows.length || xpRows[xpRows.length - 1].category) {
        xpRows.push({ category: '', item: '', cost: 0 });
      }

      const budget = xpLeft(currentChar);
      const totalSpent = xpRows.reduce((sum, r) => sum + getRowCost(r), 0);
      const remaining = budget - totalSpent;

      h += `<div class="dt-xp-grid" id="dt-${q.key}">`;
      h += `<div class="dt-xp-budget" id="dt-xp-budget">`;
      h += `<span class="dt-influence-remaining${remaining < 0 ? ' dt-influence-over' : ''}">${remaining}</span>`;
      h += ` / ${budget} XP remaining`;
      h += '</div>';

      for (let i = 0; i < xpRows.length; i++) {
        h += renderXpRow(i, xpRows[i]);
      }
      h += '</div>';
      break;
    }

    case 'influence_grid': {
      // Parse saved value: JSON object { territory_key: number } or empty
      let infVals = {};
      if (value) {
        try { infVals = JSON.parse(value); } catch { /* ignore */ }
      }
      const budget = getInfluenceBudget();
      // Calculate total spent (absolute values)
      let totalSpent = 0;
      for (const terr of INFLUENCE_TERRITORIES) {
        const tk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        totalSpent += Math.abs(infVals[tk] || 0);
      }
      const remaining = budget - totalSpent;

      h += `<div class="dt-influence-grid" id="dt-${q.key}">`;
      h += `<div class="dt-influence-budget" id="dt-influence-budget">`;
      h += `<span class="dt-influence-remaining${remaining < 0 ? ' dt-influence-over' : ''}">${remaining}</span>`;
      h += ` / ${budget} Influence remaining`;
      h += '</div>';

      for (const terr of INFLUENCE_TERRITORIES) {
        const tk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const val = infVals[tk] || 0;
        h += '<div class="dt-influence-row">';
        h += `<span class="dt-influence-terr">${esc(terr)}</span>`;
        h += '<span class="dt-influence-control">';
        h += `<button type="button" class="dt-inf-btn" data-inf-terr="${tk}" data-inf-dir="-1">−</button>`;
        h += `<span class="dt-inf-val" id="inf-val-${tk}">${val}</span>`;
        h += `<button type="button" class="dt-inf-btn" data-inf-terr="${tk}" data-inf-dir="1">+</button>`;
        h += '</span>';
        h += '</div>';
      }
      h += '</div>';
      break;
    }

    case 'territory_grid': {
      // Parse saved value: JSON object { territory: status } or empty
      let gridVals = {};
      if (value) {
        try { gridVals = JSON.parse(value); } catch { /* ignore */ }
      }
      const statuses = ['resident', 'poacher', 'none'];
      const statusLabels = ['Resident', 'Poacher', 'Not feeding here'];

      h += `<div class="dt-feed-grid" id="dt-${q.key}">`;
      // Header row
      h += '<div class="dt-feed-grid-row dt-feed-grid-header">';
      h += '<span class="dt-feed-grid-terr"></span>';
      for (const lbl of statusLabels) {
        h += `<span class="dt-feed-grid-col">${lbl}</span>`;
      }
      h += '</div>';
      // Territory rows
      for (const terr of FEEDING_TERRITORIES) {
        const terrKey = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        // Check if character has been granted residency in this territory
        const isResident = (residencyByTerritory[terr] || new Set()).has(currentChar._id);
        // Default to 'resident' if granted, 'none' otherwise; saved value takes priority
        const hasExplicitSave = gridVals[terrKey] !== undefined;
        const effectiveVal = hasExplicitSave ? gridVals[terrKey] : (isResident ? 'resident' : 'none');

        const rowClass = isResident ? 'dt-feed-grid-row dt-feed-resident' : 'dt-feed-grid-row';
        h += `<div class="${rowClass}">`;
        h += `<span class="dt-feed-grid-terr">${esc(terr)}`;
        if (isResident) h += ' <span class="dt-feed-resident-badge">Resident</span>';
        h += '</span>';
        for (let si = 0; si < statuses.length; si++) {
          const checked = effectiveVal === statuses[si] ? ' checked' : '';
          h += '<span class="dt-feed-grid-col">';
          h += `<input type="radio" name="feed-${terrKey}" value="${statuses[si]}"${checked} data-feed-terr="${terrKey}">`;
          h += '</span>';
        }
        h += '</div>';
      }
      h += '</div>';
      break;
    }
  }

  h += '</div>';
  return h;
}
