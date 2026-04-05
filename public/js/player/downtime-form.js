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
import { esc, displayName, parseOutcomeSections } from '../data/helpers.js';
import { DOWNTIME_SECTIONS, DOWNTIME_GATES, SPHERE_ACTIONS, AMBIENCE_CAP, TERRITORY_DATA, FEEDING_TERRITORIES, PROJECT_ACTIONS, FEED_METHODS } from './downtime-data.js';
import { ALL_ATTRS, ALL_SKILLS, CLAN_DISCS, BLOODLINE_DISCS, CORE_DISCS } from '../data/constants.js';
import { calcTotalInfluence } from '../editor/domain.js';
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
let priorPublishedLabel = null; // label of most recent published cycle other than current

// Merits detected from the character sheet, grouped by type
let detectedMerits = { spheres: [], contacts: [], retainers: [] };

// All active characters (lightweight: _id, name, moniker, honorific) for regency dropdowns
let allCharNames = [];

// Persisted residency list from territory_residency collection
let persistedResidency = [];

// Characters who attended last game (for shoutout picks)
let lastGameAttendees = [];
// All active characters (for cast picker modal)
let allCharacters = [];

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
let feedRoteAction = false;

// Project tab state
let activeProjectTab = 1;
// Sphere tab state
let activeSphereTab = 1;

const ACTION_ICONS = {
  '': '\u2298', 'ambience_increase': '\u25B2', 'ambience_decrease': '\u25BC',
  'attack': '\u2694', 'feed': '\u2666', 'hide_protect': '\u25C6',
  'investigate': '\u25CE', 'patrol_scout': '\u25C8', 'support': '\u2605',
  'xp_spend': '\u2726', 'misc': '\u25CF',
};
const ACTION_SHORT = {
  '': 'No Action', 'ambience_increase': 'Ambience +', 'ambience_decrease': 'Ambience \u2212',
  'attack': 'Attack', 'feed': 'Feed (Rote)', 'hide_protect': 'Hide/Protect',
  'investigate': 'Investigate', 'patrol_scout': 'Patrol/Scout', 'support': 'Support',
  'xp_spend': 'XP Spend', 'misc': 'Misc',
};
// Which fields each action type shows
const ACTION_FIELDS = {
  '': [],
  'feed': ['summary'],
  'xp_spend': ['xp_note'],
  'ambience_increase': ['title', 'territory', 'pools', 'cast', 'description'],
  'ambience_decrease': ['title', 'territory', 'pools', 'cast', 'description'],
  'attack': ['title', 'pools', 'outcome', 'territory', 'cast', 'merits', 'description'],
  'investigate': ['title', 'pools', 'outcome', 'territory', 'cast', 'merits', 'description'],
  'hide_protect': ['title', 'pools', 'outcome', 'territory', 'cast', 'merits', 'description'],
  'patrol_scout': ['title', 'pools', 'outcome', 'territory', 'cast', 'description'],
  'support': ['title', 'pools', 'outcome', 'cast', 'description'],
  'misc': ['title', 'pools', 'outcome', 'description'],
};

// Which fields each sphere action type shows (no dice pools)
const SPHERE_ACTION_FIELDS = {
  '': [],
  'ambience_increase': ['territory', 'outcome', 'description'],
  'ambience_decrease': ['territory', 'outcome', 'description'],
  'attack': ['cast', 'outcome', 'description'],
  'block': ['cast', 'outcome', 'description'],
  'hide_protect': ['outcome', 'description'],
  'investigate': ['territory', 'outcome', 'description'],
  'patrol_scout': ['territory', 'outcome', 'description'],
  'rumour': ['outcome', 'description'],
  'support': ['cast', 'outcome', 'description'],
  'grow': ['outcome', 'description'],
  'misc': ['outcome', 'description'],
  'acquisition': ['outcome', 'description'],
};

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
  // Contacts: expand spheres array into individual entries for toggle rendering
  const rawContacts = deduplicateMerits(merits.filter(m =>
    m.category === 'influence' && m.name === 'Contacts'
  ));
  detectedMerits.contacts = [];
  for (const m of rawContacts) {
    // New format: spheres array
    if (m.spheres && m.spheres.length) {
      for (const sp of m.spheres) {
        detectedMerits.contacts.push({ ...m, area: sp, rating: 1 });
      }
    } else {
      // Legacy format: comma-separated area/qualifier string
      const areas = (m.area || m.qualifier || '').split(/,\s*/).filter(Boolean);
      if (areas.length > 1) {
        for (const a of areas) {
          detectedMerits.contacts.push({ ...m, area: a.trim(), rating: 1 });
        }
      } else if (areas.length === 1) {
        detectedMerits.contacts.push({ ...m, area: areas[0] });
      } else {
        detectedMerits.contacts.push(m);
      }
    }
  }
  detectedMerits.retainers = deduplicateMerits(merits.filter(m =>
    m.category === 'influence' && m.name === 'Retainer'
  ));

  gateValues.has_sorcery = (discs.Cruac || discs.Theban) ? 'yes' : 'no';
}

/** Calculate monthly influence budget from character data. */
function getInfluenceBudget() {
  return calcTotalInfluence(currentChar);
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
        responses['_feed_rote'] = feedRoteAction ? 'yes' : '';
        // Blood type checkboxes
        const bloodChecked = [];
        document.querySelectorAll('[data-blood-type]:checked').forEach(cb => bloodChecked.push(cb.value));
        responses['_feed_blood_types'] = JSON.stringify(bloodChecked);
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
    const titleEl = document.getElementById(`dt-project_${n}_title`);
    const terrEl = document.getElementById(`dt-project_${n}_territory`);
    const xpEl = document.getElementById(`dt-project_${n}_xp`);
    responses[`project_${n}_outcome`] = outcomeEl ? outcomeEl.value : '';
    responses[`project_${n}_description`] = descEl ? descEl.value : '';
    responses[`project_${n}_title`] = titleEl ? titleEl.value : '';
    responses[`project_${n}_territory`] = terrEl ? terrEl.value : '';
    responses[`project_${n}_xp`] = xpEl ? xpEl.value : '';
    // Secondary feed method (rote feed action)
    const feedMethod2El = document.getElementById(`dt-project_${n}_feed_method2`);
    if (feedMethod2El) responses[`project_${n}_feed_method2`] = feedMethod2El.value;

    // Cast checkboxes
    const castHidden = document.querySelectorAll(`input[type="hidden"][data-proj-cast-cb="${n}"]`);
    const castIds = [];
    castHidden.forEach(el => { if (el.value) castIds.push(el.value); });
    responses[`project_${n}_cast`] = JSON.stringify(castIds);

    // Merit checkboxes
    const meritCbs = document.querySelectorAll(`[data-proj-merit-cb="${n}"]:checked`);
    const meritKeys = [];
    meritCbs.forEach(cb => meritKeys.push(cb.value));
    responses[`project_${n}_merits`] = JSON.stringify(meritKeys);
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

  // Residency is now managed in the Regency tab (regency-tab.js)

  // Collect merit toggle states and dynamic section responses
  const allMerits = [...detectedMerits.spheres, ...detectedMerits.contacts, ...detectedMerits.retainers];
  for (const m of allMerits) {
    const key = meritKey(m);
    responses[`_merit_${key}`] = gateValues[`merit_${key}`] || 'no';
  }

  // Sphere action fields (tabbed — up to 5 slots)
  const maxSpheres = Math.min(detectedMerits.spheres.length, 5);
  for (let n = 1; n <= maxSpheres; n++) {
    for (const suffix of ['action', 'outcome', 'description', 'territory']) {
      const el = document.getElementById(`dt-sphere_${n}_${suffix}`);
      if (el) responses[`sphere_${n}_${suffix}`] = el.value;
    }
    // Merit label for this slot
    const m = detectedMerits.spheres[n - 1];
    if (m) responses[`sphere_${n}_merit`] = meritLabel(m);
    // Cast hidden inputs
    const castHidden = document.querySelectorAll(`input[type="hidden"][data-sphere-cast-cb="${n}"]`);
    const castIds = [];
    castHidden.forEach(el => { if (el.value) castIds.push(el.value); });
    responses[`sphere_${n}_cast`] = JSON.stringify(castIds);
  }

  // Contact fields (expandable table — up to 5)
  const maxContacts = Math.min(detectedMerits.contacts.length, 5);
  for (let n = 1; n <= maxContacts; n++) {
    const infoEl = document.getElementById(`dt-contact_${n}_info`);
    const reqEl = document.getElementById(`dt-contact_${n}_request`);
    const meritEl = document.getElementById(`dt-contact_${n}_merit`);
    responses[`contact_${n}_info`] = infoEl ? infoEl.value : '';
    responses[`contact_${n}_request`] = reqEl ? reqEl.value : '';
    responses[`contact_${n}_merit`] = meritEl ? meritEl.value : '';
    // Backwards compat: also store combined value in old key
    const combined = [responses[`contact_${n}_info`], responses[`contact_${n}_request`]].filter(Boolean).join('\n');
    responses[`contact_${n}`] = combined;
  }

  // Retainer fields (expandable table)
  const maxRetainers = detectedMerits.retainers.length;
  for (let n = 1; n <= maxRetainers; n++) {
    const typeEl = document.getElementById(`dt-retainer_${n}_type`);
    const taskEl = document.getElementById(`dt-retainer_${n}_task`);
    const meritEl = document.getElementById(`dt-retainer_${n}_merit`);
    responses[`retainer_${n}_type`] = typeEl ? typeEl.value : '';
    responses[`retainer_${n}_task`] = taskEl ? taskEl.value : '';
    responses[`retainer_${n}_merit`] = meritEl ? meritEl.value : '';
    // Backwards compat: combined value in old key
    const combined = [responses[`retainer_${n}_type`], responses[`retainer_${n}_task`]].filter(Boolean).join('\n');
    responses[`retainer_${n}`] = combined;
  }

  // Acquisition fields (custom render)
  const acqDescEl = document.getElementById('dt-acq_description');
  responses['acq_description'] = acqDescEl ? acqDescEl.value : '';
  const acqAvailEl = document.getElementById('dt-acq_availability');
  responses['acq_availability'] = acqAvailEl ? acqAvailEl.value : '';
  // Acquisition merits
  const acqMeritCbs = document.querySelectorAll('[data-acq-merit-cb]:checked');
  const acqMeritKeys = [];
  acqMeritCbs.forEach(cb => acqMeritKeys.push(cb.value));
  responses['acq_merits'] = JSON.stringify(acqMeritKeys);
  // Backwards compat: combined into old key
  const resourcesRating = (currentChar.merits || []).find(m => m.name === 'Resources')?.rating || 0;
  responses['resources_acquisitions'] = [
    resourcesRating ? `Resources ${resourcesRating}` : '',
    acqMeritKeys.length ? `Merits: ${acqMeritKeys.join(', ')}` : '',
    responses['acq_description'],
    responses['acq_availability'] ? `Availability: ${responses['acq_availability']}/5` : '',
  ].filter(Boolean).join('\n');

  // Skill acquisition fields
  const skDescEl = document.getElementById('dt-skill_acq_description');
  responses['skill_acq_description'] = skDescEl ? skDescEl.value : '';
  const skAttrEl = document.getElementById('dt-skill_acq_pool_attr');
  const skSkillEl = document.getElementById('dt-skill_acq_pool_skill');
  responses['skill_acq_pool_attr'] = skAttrEl ? skAttrEl.value : '';
  responses['skill_acq_pool_skill'] = skSkillEl ? skSkillEl.value : '';
  const skSpecEl = document.getElementById('dt-skill_acq_pool_spec');
  responses['skill_acq_pool_spec'] = skSpecEl ? skSpecEl.value : '';
  const skAvailEl = document.getElementById('dt-skill_acq_availability');
  responses['skill_acq_availability'] = skAvailEl ? skAvailEl.value : '';
  const skAcqMeritCbs = document.querySelectorAll('[data-skill-acq-merit-cb]:checked');
  const skAcqMeritKeys = [];
  skAcqMeritCbs.forEach(cb => skAcqMeritKeys.push(cb.value));
  responses['skill_acq_merits'] = JSON.stringify(skAcqMeritKeys);
  // Backwards compat
  responses['skill_acquisitions'] = responses['skill_acq_description'];

  return responses;
}

async function saveDraft() {
  const statusEl = document.getElementById('dt-save-status');
  if (!currentCycle) {
    if (statusEl) statusEl.textContent = 'No active cycle — contact your ST';
    return;
  }
  const responses = collectResponses();

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/downtime_submissions', {
        character_id: currentChar._id,
        character_name: currentChar.name,
        cycle_id: currentCycle._id,
        status: 'draft',
        responses,
      });
    } else {
      responseDoc = await apiPut(`/api/downtime_submissions/${responseDoc._id}`, { responses });
    }
    // Residency is now saved in the Regency tab
    if (statusEl) statusEl.textContent = 'Saved';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

async function submitForm() {
  const responses = collectResponses();
  const btn = document.getElementById('dt-btn-submit');

  // AC2: Validate XP spend against available budget before submitting
  const xpRows = JSON.parse(responses.xp_spend || '[]');
  const xpSpent = xpRows.reduce((sum, r) => sum + getRowCost(r), 0);
  const xpBudget = xpLeft(currentChar);
  if (xpSpent > xpBudget) {
    showToast(`XP over budget: spending ${xpSpent} XP but only ${xpBudget} available.`, 'error');
    return;
  }

  // Visual feedback — disable button, show loading
  if (btn) { btn.disabled = true; btn.textContent = 'Submitting\u2026'; }

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/downtime_submissions', {
        character_id: currentChar._id,
        character_name: currentChar.name,
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
    showToast('Downtime submitted successfully!', 'success');
    renderForm(document.getElementById('dt-container'));
  } catch (err) {
    showToast('Submit failed: ' + err.message, 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Submit Downtime'; }
  }
}

function showToast(message, type) {
  // Remove any existing toast
  document.getElementById('dt-toast')?.remove();
  const toast = document.createElement('div');
  toast.id = 'dt-toast';
  toast.className = `dt-toast dt-toast-${type || 'info'}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('dt-toast-show'));
  setTimeout(() => {
    toast.classList.remove('dt-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
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

// ── Story 1.10: Player-facing results view ────────────────────────────────────

/**
 * Render published downtime results for the player.
 * outcome_text is a markdown-style string with ## section headers.
 */
function renderDowntimeResults(outcomeText, sub) {
  const sections = parseOutcomeSections(outcomeText);

  let h = '<div class="qf-results">';
  h += '<h3 class="qf-results-title">Downtime Results</h3>';

  for (const sec of sections) {
    if (!sec.heading) {
      h += `<div class="qf-results-body"><p>${esc(sec.lines.join('\n').trim())}</p></div>`;
    } else {
      const isMech = sec.heading === 'Mechanical Outcomes';
      h += `<div class="qf-results-section${isMech ? ' qf-results-mech' : ''}">`;
      h += `<h4 class="qf-results-section-head">${esc(sec.heading)}</h4>`;
      const body = sec.lines.join('\n').trim();
      if (isMech) {
        h += `<pre class="qf-results-pre">${esc(body)}</pre>`;
      } else {
        const paras = body.split(/\n{2,}/).filter(Boolean);
        h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
      }
      h += '</div>';
    }
  }

  h += '</div>';
  return h;
}

export async function renderDowntimeTab(targetEl, char) {
  currentChar = char;
  responseDoc = null;
  currentCycle = null;
  gateValues = {};

  // Load current cycle — only 'active' cycles accept new submissions
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    const sorted = cycles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    currentCycle = sorted.find(c => c.status === 'active')
      || sorted.find(c => c.status === 'game' || c.status === 'closed')
      || sorted[0]
      || null;
  } catch { /* no cycles */ }

  // Load existing submission for this character + cycle
  priorPublishedLabel = null;
  if (currentCycle) {
    try {
      const subs = await apiGet(`/api/downtime_submissions?cycle_id=${currentCycle._id}`);
      responseDoc = subs.find(s =>
        s.character_id === currentChar._id || s.character_id?.toString() === currentChar._id?.toString()
      ) || null;
    } catch { /* no submission */ }
  }

  // Check for published outcomes from previous cycles (for "results available" banner)
  if (currentCycle?.status === 'active' && !responseDoc?.published_outcome) {
    try {
      const allSubs = await apiGet('/api/downtime_submissions');
      const charId = String(currentChar._id);
      const currentCycleId = String(currentCycle._id);
      const priorPublished = allSubs
        .filter(s => String(s.character_id) === charId && s.published_outcome && String(s.cycle_id) !== currentCycleId)
        .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));
      if (priorPublished.length) {
        // Try to find cycle label
        try {
          const cycles = await apiGet('/api/downtime_cycles');
          const priorCycle = cycles.find(c => String(c._id) === String(priorPublished[0].cycle_id));
          priorPublishedLabel = priorCycle?.label || 'previous cycle';
        } catch { priorPublishedLabel = 'previous cycle'; }
      }
    } catch { /* ignore */ }
  }

  // Auto-detect attendance from the game session matching this downtime cycle
  lastGameAttendees = [];
  try {
    let attUrl = '/api/attendance?character_id=' + encodeURIComponent(String(currentChar._id));
    if (currentCycle?.game_number) attUrl += '&game_number=' + currentCycle.game_number;
    const att = await apiGet(attUrl);
    gateValues.attended = att.attended ? 'yes' : 'no';
    lastGameAttendees = att.attendees || [];
  } catch { /* fall back — leave gateValues.attended unset */ }

  // Load all character names for cast picker
  try {
    const names = await apiGet('/api/characters/names');
    const others = names.filter(c => c._id !== currentChar._id && c._id?.toString() !== currentChar._id?.toString());
    allCharacters = others.map(c => ({
      id: c._id,
      name: c.moniker || c.name,
      fullName: c.name,
      player: c.player || '',
    }));
    // If attendee list empty, fall back to full list
    if (!lastGameAttendees.length) {
      lastGameAttendees = others.map(c => ({ id: c._id, name: c.moniker || c.name }));
    }
  } catch { /* ignore */ }

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

  // Set up two-pane layout
  targetEl.innerHTML = `
    <div class="dt-split">
      <div class="dt-split-left" id="dt-left-pane"></div>
      <div class="dt-split-right" id="dt-right-pane"></div>
    </div>`;

  const leftEl  = document.getElementById('dt-left-pane');
  const rightEl = document.getElementById('dt-right-pane');

  // Left: form or gate message
  if (!currentCycle || currentCycle.status !== 'active') {
    leftEl.innerHTML = renderCycleGatePage();
  } else {
    leftEl.innerHTML = `<div id="dt-container" class="reading-pane"></div>`;
    renderForm(document.getElementById('dt-container'));
  }

  // Right: history panel (fire-and-forget, loads independently)
  renderHistoryPanel(rightEl, char);
}

async function renderHistoryPanel(el, char) {
  el.innerHTML = '<p class="placeholder-msg dt-hist-loading">Loading history\u2026</p>';

  let allSubs = [], cycles = [];
  try {
    [allSubs, cycles] = await Promise.all([
      apiGet('/api/downtime_submissions'),
      apiGet('/api/downtime_cycles'),
    ]);
  } catch {
    el.innerHTML = '<p class="placeholder-msg">Could not load history.</p>';
    return;
  }

  const cycleMap = {};
  for (const c of cycles) cycleMap[String(c._id)] = c;

  const charId = String(char._id);
  const charSubs = allSubs
    .filter(s => String(s.character_id) === charId)
    .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));

  let h = '<div class="dt-hist-panel">';
  h += '<div class="dt-hist-title">Submission History</div>';

  if (!charSubs.length) {
    h += '<p class="placeholder-msg dt-hist-empty">No previous submissions.</p>';
  } else {
    for (const sub of charSubs) {
      const cycle   = cycleMap[String(sub.cycle_id)];
      const label   = cycle?.label || `Cycle ${String(sub.cycle_id).slice(-4)}`;
      const status  = sub.approval_status || 'pending';
      const statusCss = status === 'approved' ? 'approved' : status === 'modified' ? 'modified' : status === 'rejected' ? 'rejected' : 'pending';
      const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
      const hasOutcome  = !!sub.published_outcome;

      h += `<div class="dt-hist-entry">`;
      h += `<div class="dt-hist-entry-head">`;
      h += `<span class="dt-hist-cycle">${esc(label)}</span>`;
      h += `<span class="dt-status-badge dt-status-${statusCss}">${esc(statusLabel)}</span>`;
      if (hasOutcome) h += `<span class="dt-hist-has-outcome">\u2665 Outcome</span>`;
      h += `</div>`;

      if (hasOutcome) {
        const sections = parseOutcomeSections(sub.published_outcome);
        h += '<div class="dt-hist-outcome">';
        for (const sec of sections) {
          if (sec.heading) {
            const isMech = sec.heading === 'Mechanical Outcomes';
            h += `<div class="dt-hist-section${isMech ? ' dt-hist-mech' : ''}">`;
            h += `<div class="dt-hist-section-head">${esc(sec.heading)}</div>`;
            const body = sec.lines.join('\n').trim();
            if (isMech) {
              h += `<pre class="dt-hist-pre">${esc(body)}</pre>`;
            } else {
              h += sec.lines.filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('');
            }
            h += '</div>';
          } else {
            h += sec.lines.filter(Boolean).map(l => `<p>${esc(l)}</p>`).join('');
          }
        }
        h += '</div>';
      }

      h += '</div>';
    }
  }

  h += '</div>';
  el.innerHTML = h;
}

function renderCycleGatePage() {
  if (!currentCycle) {
    return `<div class="reading-pane qf-gate-page">
      <p class="placeholder-msg">No active downtime cycle right now. Your ST will open submissions before the next game.</p>
    </div>`;
  }
  const label = esc(currentCycle.label || 'This cycle');
  const isGame = currentCycle.status === 'game';
  const isClosed = currentCycle.status === 'closed';

  let h = `<div class="reading-pane qf-gate-page">`;
  h += `<h3 class="qf-title">${label}</h3>`;

  if (isGame) {
    h += `<p class="qf-gate-msg">Submissions for this cycle are locked \u2014 the game is on. Check the <strong>Feeding</strong> tab for your feeding roll.</p>`;
  } else if (isClosed) {
    h += `<p class="qf-gate-msg">Your ST is processing downtime results. Published outcomes will appear in the <strong>Story</strong> tab once ready.</p>`;
  } else {
    h += `<p class="qf-gate-msg">Downtime submissions are currently closed.</p>`;
  }

  // If the player already has a submission for this cycle, show its status
  if (responseDoc) {
    const statusLabel = responseDoc.status === 'submitted' ? 'Submitted' : 'Draft saved';
    h += `<p class="qf-gate-sub-status"><span class="qf-badge qf-badge-submitted">${statusLabel}</span> Your ${label} submission is on file.</p>`;
  }

  h += `</div>`;
  return h;
}

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const status = responseDoc?.status || 'new';
  const role = getRole();
  const isST = role === 'st';
  const isSubmitted = status === 'submitted';

  let h = '';

  // Results panel (Story 1.10) — show published outcome if available
  const published = responseDoc?.published_outcome;
  const pending = responseDoc && !published && status === 'submitted';
  if (published) {
    h += renderDowntimeResults(published, responseDoc);
  } else if (pending) {
    h += '<div class="qf-results-pending"><p class="qf-results-pending-msg">Your downtime submission has been received and is awaiting ST review. Results will appear here once published.</p></div>';
  }

  // Banner: prior cycle results published, visible in Story tab
  if (!published && priorPublishedLabel) {
    h += `<div class="qf-results-banner">&#x2713; Your <strong>${esc(priorPublishedLabel)}</strong> results are published &mdash; see the <strong>Story</strong> tab.</div>`;
  }

  // Header
  h += '<div class="qf-header">';
  h += `<h3 class="qf-title">Downtime Submission</h3>`;
  if (currentCycle) {
    h += `<p class="qf-section-intro">${esc(currentCycle.label || currentCycle.title || 'Current Cycle')}</p>`;
    if (currentCycle.deadline_at) {
      const dl = new Date(currentCycle.deadline_at);
      const past = dl < new Date();
      const dlStr = dl.toLocaleString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      h += `<p class="qf-deadline${past ? ' qf-deadline-closed' : ''}">${past ? 'Submissions closed' : 'Open until ' + dlStr}</p>`;
    }
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

  // Status badges
  h += '<div class="dt-status-badges">';
  if (gateValues.attended === 'yes') {
    h += '<span class="dt-badge dt-badge-on">Attended</span>';
  } else {
    h += '<span class="dt-badge dt-badge-off">Absent</span>';
  }
  if (gateValues.is_regent === 'yes') {
    h += `<span class="dt-badge dt-badge-on">Regent \u2014 ${esc(currentChar.regent_territory)}</span>`;
  }
  if (gateValues.has_sorcery === 'yes') {
    const traditions = [];
    if (currentChar.disciplines?.Cruac) traditions.push('Cruac');
    if (currentChar.disciplines?.Theban) traditions.push('Theban');
    h += `<span class="dt-badge dt-badge-on">${traditions.join(' / ')}</span>`;
  }
  const bp = currentChar.blood_potency || 0;
  if (bp) h += `<span class="dt-badge dt-badge-info">BP ${bp}</span>`;
  h += '</div>';
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
    const sectionClass = isGated ? 'qf-section dt-gated-hidden' : 'qf-section collapsed';

    h += `<div class="${sectionClass}" data-gate-section="${section.gate || ''}" data-section-key="${section.key}">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
    h += '<div class="qf-section-body">';
    if (section.intro) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }
    for (const q of section.questions) {
      const val = saved[q.key] || '';
      h += renderQuestion(q, val);
    }
    h += '</div></div>';
  }

  // ── Projects section with dynamic slots ──
  h += renderProjectSlots(saved);

  // Regency is now its own tab (regency-tab.js)

  // ── Dynamic merit sections ──
  h += renderMeritToggles(saved);

  // ── Blood Sorcery (dynamic rite selector) ──
  if (gateValues.has_sorcery === 'yes') {
    h += renderSorcerySection(saved);
  }

  // ── Acquisitions (custom render) ──
  h += renderAcquisitionsSection(saved);

  for (const key of ['vamping', 'admin']) {
    const section = DOWNTIME_SECTIONS.find(s => s.key === key);
    if (!section) continue;
    const isGated = section.gate && gateValues[section.gate] !== 'yes';
    const sectionClass = isGated ? 'qf-section dt-gated-hidden' : 'qf-section collapsed';

    h += `<div class="${sectionClass}" data-gate-section="${section.gate || ''}" data-section-key="${section.key}">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
    h += '<div class="qf-section-body">';
    if (section.intro) {
      h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    }
    for (const q of section.questions) {
      const val = saved[q.key] || '';
      h += renderQuestion(q, val);
    }
    h += '</div></div>';
  }

  // Hide feedback textarea until a rating is provided
  if (!saved['form_rating']) {
    h = h.replace('dt-feedback-field', 'dt-feedback-field dt-feedback-hidden');
  }

  // Actions
  h += '<div class="qf-actions">';
  h += '<button class="qf-btn qf-btn-save" id="dt-btn-save">Save Draft</button>';
  h += '<button class="qf-btn qf-btn-submit" id="dt-btn-submit">Submit Downtime</button>';
  h += '</div>';

  // Capture expanded sections before re-render
  const expandedSections = new Set();
  container.querySelectorAll('.qf-section[data-section-key]:not(.collapsed)').forEach(el => {
    expandedSections.add(el.dataset.sectionKey);
  });

  container.innerHTML = h;

  // Restore expanded state
  expandedSections.forEach(key => {
    const el = container.querySelector(`.qf-section[data-section-key="${key}"]`);
    if (el) el.classList.remove('collapsed');
  });

  // Update section completion ticks on initial render
  updateSectionTicks(container);

  // Ensure rote feeding data is set in saved responses (no re-render)
  if (feedRoteAction && feedMethodId) {
    const s = responseDoc?.responses;
    if (s && s['project_1_action'] !== 'feed') {
      s['project_1_action'] = 'feed';
    }
  }

  // Wire events — skip if already wired (prevent listener stacking on re-render)
  if (container._dtWired) return;
  container._dtWired = true;

  // Section collapse/expand toggle
  container.addEventListener('click', (e) => {
    // Skill acquisition spec chip toggle
    const skAcqSpec = e.target.closest('[data-skill-acq-spec]');
    if (skAcqSpec) {
      const sp = skAcqSpec.dataset.skillAcqSpec;
      const input = document.getElementById('dt-skill_acq_pool_spec');
      // Toggle: click same spec to deselect
      if (input) input.value = input.value === sp ? '' : sp;
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      scheduleSave();
      return;
    }
    // Availability dot selectors (resources + skill acquisition)
    const acqDot = e.target.closest('[data-acq-dot]') || e.target.closest('[data-skill-acq-dot]');
    if (acqDot) {
      const isSkill = !!acqDot.dataset.skillAcqDot;
      const val = parseInt(isSkill ? acqDot.dataset.skillAcqDot : acqDot.dataset.acqDot, 10);
      const input = document.getElementById(isSkill ? 'dt-skill_acq_availability' : 'dt-acq_availability');
      if (input) input.value = val;
      const row = acqDot.closest(isSkill ? '[data-skill-acq-avail]' : '[data-acq-avail]');
      if (row) {
        const dotAttr = isSkill ? 'data-skill-acq-dot' : 'data-acq-dot';
        row.querySelectorAll(`[${dotAttr}]`).forEach(d => {
          d.classList.toggle('dt-acq-dot-filled', parseInt(d.getAttribute(dotAttr), 10) <= val);
        });
        const labels = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];
        let lbl = row.querySelector('.dt-acq-avail-label');
        if (!lbl) { lbl = document.createElement('span'); lbl.className = 'dt-acq-avail-label'; row.appendChild(lbl); }
        lbl.textContent = labels[val] || '';
      }
      scheduleSave();
      updateSectionTicks(container);
      return;
    }
    // Contact row toggle
    const contactToggle = e.target.closest('[data-contact-toggle]');
    if (contactToggle && !e.target.closest('[data-contact-clear]')) {
      const n = contactToggle.dataset.contactToggle;
      const panel = container.querySelector(`[data-contact-panel="${n}"]`);
      if (panel) panel.classList.toggle('dt-contact-panel-hidden');
      return;
    }
    // Contact clear button
    const contactClear = e.target.closest('[data-contact-clear]');
    if (contactClear) {
      const n = contactClear.dataset.contactClear;
      const infoEl = document.getElementById(`dt-contact_${n}_info`);
      const reqEl = document.getElementById(`dt-contact_${n}_request`);
      if (infoEl) infoEl.value = '';
      if (reqEl) reqEl.value = '';
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      scheduleSave();
      return;
    }
    // Retainer row toggle
    const retainerToggle = e.target.closest('[data-retainer-toggle]');
    if (retainerToggle && !e.target.closest('[data-retainer-clear]')) {
      const n = retainerToggle.dataset.retainerToggle;
      const panel = container.querySelector(`[data-retainer-panel="${n}"]`);
      if (panel) panel.classList.toggle('dt-contact-panel-hidden');
      return;
    }
    // Retainer clear button
    const retainerClear = e.target.closest('[data-retainer-clear]');
    if (retainerClear) {
      const n = retainerClear.dataset.retainerClear;
      const typeEl = document.getElementById(`dt-retainer_${n}_type`);
      const taskEl = document.getElementById(`dt-retainer_${n}_task`);
      if (typeEl) typeEl.value = '';
      if (taskEl) taskEl.value = '';
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      scheduleSave();
      return;
    }
    // Cast picker modal
    const castBtn = e.target.closest('[data-cast-open]');
    if (castBtn) {
      openCastModal(castBtn.dataset.castOpen, container);
      return;
    }
    // Sphere tab switching
    const sphereTab = e.target.closest('[data-sphere-tab]');
    if (sphereTab) {
      const n = parseInt(sphereTab.dataset.sphereTab, 10);
      activeSphereTab = n;
      container.querySelectorAll('[data-sphere-tab]').forEach(t =>
        t.classList.toggle('dt-proj-tab-active', parseInt(t.dataset.sphereTab, 10) === n)
      );
      container.querySelectorAll('[data-sphere-pane]').forEach(p =>
        p.classList.toggle('dt-proj-pane-hidden', parseInt(p.dataset.spherePane, 10) !== n)
      );
      return;
    }
    // Project tab switching
    const tab = e.target.closest('[data-proj-tab]');
    if (tab) {
      const n = parseInt(tab.dataset.projTab, 10);
      activeProjectTab = n;
      container.querySelectorAll('.dt-proj-tab').forEach(t =>
        t.classList.toggle('dt-proj-tab-active', parseInt(t.dataset.projTab, 10) === n)
      );
      container.querySelectorAll('[data-proj-pane]').forEach(p =>
        p.classList.toggle('dt-proj-pane-hidden', parseInt(p.dataset.projPane, 10) !== n)
      );
      return;
    }
    // Section collapse/expand
    const title = e.target.closest('.qf-section-title');
    if (!title) return;
    if (e.target.closest('[data-star-val]')) return;
    const section = title.closest('.qf-section');
    if (section) section.classList.toggle('collapsed');
  });

  container.addEventListener('input', (e) => {
    scheduleSave();
    updateSectionTicks(container);

    // Live update contact/retainer row status badges
    const contactPanel = e.target.closest('[data-contact-panel]');
    if (contactPanel) {
      const n = contactPanel.dataset.contactPanel;
      const row = container.querySelector(`[data-contact-row="${n}"]`);
      if (row) {
        const info = document.getElementById(`dt-contact_${n}_info`);
        const req = document.getElementById(`dt-contact_${n}_request`);
        const hasContent = (info && info.value.trim()) || (req && req.value.trim());
        row.classList.toggle('dt-contact-used', !!hasContent);
        const badge = row.querySelector('.dt-contact-status');
        if (badge) badge.textContent = hasContent ? 'Used' : 'Unused';
      }
    }
    const retainerPanel = e.target.closest('[data-retainer-panel]');
    if (retainerPanel) {
      const n = retainerPanel.dataset.retainerPanel;
      const row = container.querySelector(`[data-retainer-row="${n}"]`);
      if (row) {
        const typeEl = document.getElementById(`dt-retainer_${n}_type`);
        const taskEl = document.getElementById(`dt-retainer_${n}_task`);
        const hasContent = (typeEl && typeEl.value.trim()) || (taskEl && taskEl.value.trim());
        row.classList.toggle('dt-contact-used', !!hasContent);
        const badge = row.querySelector('.dt-contact-status');
        if (badge) badge.textContent = hasContent ? 'Tasked' : 'Idle';
      }
    }
  });
  container.addEventListener('change', (e) => {
    // Rote feeding checkbox
    if (e.target.id === 'dt-feed-rote') {
      feedRoteAction = e.target.checked;
      applyRoteToProject1(container);
      return;
    }
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
    // Project action change — re-render to show correct fields for action type
    const projectAction = e.target.closest('[data-project-action]');
    if (projectAction) {
      activeProjectTab = parseInt(projectAction.dataset.projectAction, 10);
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Sphere action change — re-render for action-specific fields
    const sphereAction = e.target.closest('[data-sphere-action]');
    if (sphereAction) {
      activeSphereTab = parseInt(sphereAction.dataset.sphereAction, 10);
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
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
    // Skill acquisition pool change — re-render for spec chips
    if (e.target.id === 'dt-skill_acq_pool_skill' || e.target.id === 'dt-skill_acq_pool_attr') {
      // Clear spec if skill changed
      if (e.target.id === 'dt-skill_acq_pool_skill') {
        const specInput = document.getElementById('dt-skill_acq_pool_spec');
        if (specInput) specInput.value = '';
      }
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
    updateSectionTicks(container);
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

  // ── Star rating hover + click ──
  container.addEventListener('mouseover', (e) => {
    const half = e.target.closest('[data-star-val]');
    if (!half) return;
    const row = half.closest('.dt-star-row');
    if (!row) return;
    const hoverVal = parseInt(half.dataset.starVal, 10);
    row.querySelectorAll('[data-star-val]').forEach(el => {
      const v = parseInt(el.dataset.starVal, 10);
      el.classList.toggle('dt-star-hover', v <= hoverVal);
    });
    const label = row.querySelector('.dt-star-label');
    if (label) label.textContent = hoverVal + '/10';
  });

  container.addEventListener('mouseout', (e) => {
    const half = e.target.closest('[data-star-val]');
    if (!half) return;
    const row = half.closest('.dt-star-row');
    if (!row) return;
    const input = document.getElementById(row.dataset.starInput);
    const cur = parseInt(input?.value, 10) || 0;
    row.querySelectorAll('[data-star-val]').forEach(el => {
      el.classList.remove('dt-star-hover');
    });
    const label = row.querySelector('.dt-star-label');
    if (label) label.textContent = cur ? cur + '/10' : '';
  });

  container.addEventListener('click', (e) => {
    const half = e.target.closest('[data-star-val]');
    if (!half) return;
    const row = half.closest('.dt-star-row');
    if (!row) return;
    const val = parseInt(half.dataset.starVal, 10);
    const input = document.getElementById(row.dataset.starInput);
    if (input) {
      input.value = val;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Update filled state
    row.querySelectorAll('[data-star-val]').forEach(el => {
      const v = parseInt(el.dataset.starVal, 10);
      el.classList.toggle('dt-star-filled', v <= val);
    });
    const label = row.querySelector('.dt-star-label');
    if (label) label.textContent = val + '/10';
    // Reveal feedback field
    const fb = container.querySelector('.dt-feedback-field');
    if (fb) fb.classList.remove('dt-feedback-hidden');
    scheduleSave();
    updateSectionTicks(container);
  });

  document.getElementById('dt-btn-save')?.addEventListener('click', saveDraft);
  document.getElementById('dt-btn-submit')?.addEventListener('click', submitForm);
}

// ── Cast picker modal ──

function openCastModal(slotId, container) {
  // slotId is either a number (project slot) or "sphere_N" string
  const castKey = typeof slotId === 'number' || /^\d+$/.test(slotId)
    ? `project_${slotId}_cast`
    : `${slotId}_cast`;
  const saved = responseDoc?.responses || {};
  let castPicks = [];
  try { castPicks = JSON.parse(saved[castKey] || '[]'); } catch { /* ignore */ }
  const attendeeIds = new Set(lastGameAttendees.map(a => String(a.id)));

  // Build modal HTML
  let h = '<div class="dt-cast-overlay" id="dt-cast-overlay">';
  h += '<div class="dt-cast-modal">';
  h += '<div class="dt-cast-modal-header">';
  const modalTitle = typeof slotId === 'number' || /^\d+$/.test(slotId)
    ? `Select Characters — Action ${slotId}`
    : `Select Characters — Sphere ${slotId.replace('sphere_', '')}`;
  h += `<h4>${modalTitle}</h4>`;
  h += '<button type="button" class="dt-cast-modal-close" id="dt-cast-close">\u00D7</button>';
  h += '</div>';

  // Filter toggle
  h += '<div class="dt-cast-filter">';
  h += '<label class="dt-cast-filter-label"><input type="checkbox" id="dt-cast-filter-att"> Show only last game attendees</label>';
  h += '</div>';

  h += '<div class="dt-cast-list" id="dt-cast-list">';
  for (const c of allCharacters) {
    const isAtt = attendeeIds.has(String(c.id));
    const checked = castPicks.includes(c.id) || castPicks.includes(String(c.id)) ? ' checked' : '';
    const initials = (c.name || '?').split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 2);
    h += `<label class="dt-cast-item${isAtt ? ' dt-cast-att' : ''}" data-att="${isAtt ? '1' : '0'}">`;
    h += `<div class="dt-cast-avatar">${initials}</div>`;
    h += '<div class="dt-cast-info">';
    h += `<div class="dt-cast-charname">${esc(c.name)}</div>`;
    if (c.player) h += `<div class="dt-cast-player">${esc(c.player)}</div>`;
    h += '</div>';
    h += `<input type="checkbox" class="dt-cast-check" value="${esc(String(c.id))}"${checked}>`;
    h += '</label>';
  }
  if (!allCharacters.length) {
    h += '<p class="dt-cast-empty">No characters available.</p>';
  }
  h += '</div>';

  h += '<div class="dt-cast-modal-footer">';
  h += '<button type="button" class="qf-btn qf-btn-save" id="dt-cast-confirm">Confirm</button>';
  h += '</div>';
  h += '</div></div>';

  // Insert into DOM
  const overlay = document.createElement('div');
  overlay.innerHTML = h;
  document.body.appendChild(overlay.firstElementChild);

  // Filter toggle
  document.getElementById('dt-cast-filter-att')?.addEventListener('change', (e) => {
    const onlyAtt = e.target.checked;
    document.querySelectorAll('.dt-cast-item').forEach(item => {
      if (onlyAtt && item.dataset.att === '0') {
        item.style.display = 'none';
      } else {
        item.style.display = '';
      }
    });
  });

  // Close
  const closeModal = () => {
    document.getElementById('dt-cast-overlay')?.remove();
  };
  document.getElementById('dt-cast-close')?.addEventListener('click', closeModal);
  document.getElementById('dt-cast-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'dt-cast-overlay') closeModal();
  });

  // Confirm
  document.getElementById('dt-cast-confirm')?.addEventListener('click', () => {
    const selected = [];
    document.querySelectorAll('.dt-cast-check:checked').forEach(cb => selected.push(cb.value));
    const responses = collectResponses();
    responses[castKey] = JSON.stringify(selected);
    if (responseDoc) responseDoc.responses = responses;
    else responseDoc = { responses };
    closeModal();
    renderForm(container);
    scheduleSave();
  });
}

// ── Rote feeding → Project 1 ──

function applyRoteToProject1(container) {
  const responses = collectResponses();
  if (feedRoteAction && feedMethodId) {
    responses['project_1_action'] = 'feed';
    activeProjectTab = 1;
  } else if (responses['project_1_action'] === 'feed') {
    responses['project_1_action'] = '';
    responses['project_1_outcome'] = '';
    responses['project_1_description'] = '';
  } else {
    return; // nothing to change
  }
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  scheduleSave();
}

// ── Project slots (tabbed UI) ──

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

  // Character merits for the merit picker
  const charMerits = (currentChar.merits || []).filter(m =>
    m.category === 'general' || m.category === 'influence'
  );

  let h = '<div class="qf-section collapsed" data-section-key="projects">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
  h += '<div class="qf-section-body">';
  if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;

  // ── Tab bar ──
  h += '<div class="dt-proj-tabs">';
  for (let n = 1; n <= slotCount; n++) {
    const actionVal = saved[`project_${n}_action`] || '';
    const icon = ACTION_ICONS[actionVal] || ACTION_ICONS[''];
    const label = ACTION_SHORT[actionVal] || 'No Action';
    const active = n === activeProjectTab ? ' dt-proj-tab-active' : '';
    const noAction = !actionVal ? ' dt-proj-tab-empty' : '';
    h += `<button type="button" class="dt-proj-tab${active}${noAction}" data-proj-tab="${n}">`;
    h += `<span class="dt-proj-tab-icon">${icon}</span>`;
    h += `<span class="dt-proj-tab-num">Action ${n}</span>`;
    h += `<span class="dt-proj-tab-label">${esc(label)}</span>`;
    h += '</button>';
  }
  h += '</div>';

  // ── Tab panes ──
  for (let n = 1; n <= slotCount; n++) {
    const actionVal = saved[`project_${n}_action`] || '';
    const visible = n === activeProjectTab;
    const fields = ACTION_FIELDS[actionVal] || [];

    h += `<div class="dt-proj-pane${visible ? '' : ' dt-proj-pane-hidden'}" data-proj-pane="${n}">`;

    // Action type selector — always visible
    h += '<div class="qf-field">';
    h += `<label class="qf-label" for="dt-project_${n}_action">Action Type ${n === 1 ? '<span class="qf-req">*</span>' : ''}</label>`;
    h += `<select id="dt-project_${n}_action" class="qf-select" data-project-action="${n}">`;
    for (const opt of PROJECT_ACTIONS) {
      const sel = actionVal === opt.value ? ' selected' : '';
      h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
    }
    h += '</select></div>';

    // ── Feed (rote) — primary summary + secondary hunt ──
    if (fields.includes('summary')) {
      const method = FEED_METHODS.find(m => m.id === feedMethodId);
      const methodName = method ? method.name : feedMethodId || 'Not selected';
      let poolSummary = methodName;
      if (feedDiscName) poolSummary += ` + ${feedDiscName}`;
      if (feedSpecName) poolSummary += ` (${feedSpecName})`;
      h += '<div class="dt-proj-feed-summary">';
      h += `<p>Primary hunt from Feeding section receives <strong>Rote quality</strong>.</p>`;
      h += `<p class="dt-proj-feed-method">Rote Pool: <strong>${esc(poolSummary)}</strong></p>`;
      h += '</div>';

      // Secondary hunt — additional method, pool, territory, description
      h += '<p class="qf-section-intro" style="margin-top:14px;">You may also conduct a second hunt with a different approach.</p>';

      // Secondary method selector
      const savedMethod2 = saved[`project_${n}_feed_method2`] || '';
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-project_${n}_feed_method2">Secondary Hunt Method</label>`;
      h += `<select id="dt-project_${n}_feed_method2" class="qf-select">`;
      h += '<option value="">— Same as primary —</option>';
      for (const fm of FEED_METHODS) {
        const sel = savedMethod2 === fm.id ? ' selected' : '';
        h += `<option value="${esc(fm.id)}"${sel}>${esc(fm.name)} \u2014 ${esc(fm.desc)}</option>`;
      }
      h += '</select></div>';

      // Secondary dice pool
      h += renderDicePool(n, 'pool', 'Secondary Hunt Dice Pool', attrs, skills, discs, saved);

      // Territory for this hunt
      const savedTerr = saved[`project_${n}_territory`] || '';
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-project_${n}_territory">Hunting Territory</label>`;
      h += `<select id="dt-project_${n}_territory" class="qf-select">`;
      h += '<option value="">— No Territory —</option>';
      for (const t of TERRITORY_DATA) {
        const sel = savedTerr === t.id ? ' selected' : '';
        h += `<option value="${esc(t.id)}"${sel}>${esc(t.name)}</option>`;
      }
      h += '</select></div>';

      // Description
      h += renderQuestion({
        key: `project_${n}_description`, label: 'Description',
        type: 'textarea', required: false,
        desc: 'Describe the additional hunt \u2014 where, how, and any relevant context.',
      }, saved[`project_${n}_description`] || '');
    }

    // ── Title ──
    // ── XP Spend note ──
    if (fields.includes('xp_note')) {
      h += '<div class="dt-proj-feed-summary">';
      h += '<p>This action dedicates a Project slot to XP spending.</p>';
      h += '<p>Each XP Spend action allows purchasing <strong>1 dot</strong> of an Attribute, Skill, Discipline, Devotion, or Rite in the <strong>Admin</strong> section below.</p>';
      h += '<p class="qf-desc" style="margin:6px 0 0;">Merits at 1\u20133 dots can be purchased freely without dedicating an action.</p>';
      h += '</div>';
    }

    if (fields.includes('title')) {
      h += renderQuestion({
        key: `project_${n}_title`, label: 'Project Title',
        type: 'text', required: false,
        desc: 'A short name for this project.',
      }, saved[`project_${n}_title`] || '');
    }

    // ── Territory picker ──
    if (fields.includes('territory')) {
      const savedTerr = saved[`project_${n}_territory`] || '';
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-project_${n}_territory">Territory</label>`;
      h += `<select id="dt-project_${n}_territory" class="qf-select">`;
      h += '<option value="">— No Territory —</option>';
      for (const t of TERRITORY_DATA) {
        const sel = savedTerr === t.id ? ' selected' : '';
        h += `<option value="${esc(t.id)}"${sel}>${esc(t.name)}</option>`;
      }
      h += '</select></div>';
    }

    // ── Dice pools ──
    if (fields.includes('pools')) {
      h += renderDicePool(n, 'pool', 'Primary Dice Pool', attrs, skills, discs, saved);
      h += renderDicePool(n, 'pool2', 'Secondary Dice Pool (optional)', attrs, skills, discs, saved);
    }

    // ── Desired outcome ──
    if (fields.includes('outcome')) {
      h += renderQuestion({
        key: `project_${n}_outcome`, label: 'Desired Outcome',
        type: 'text', required: false,
        desc: 'Each Project must aim to achieve ONE clear thing.',
      }, saved[`project_${n}_outcome`] || '');
    }

    // ── Cast (other characters involved) ──
    if (fields.includes('cast')) {
      let castPicks = [];
      try { castPicks = JSON.parse(saved[`project_${n}_cast`] || '[]'); } catch { /* ignore */ }
      // Build summary of selected characters
      const castNames = castPicks.map(id => {
        const c = allCharacters.find(ch => ch.id === id || String(ch.id) === String(id));
        return c ? c.name : '';
      }).filter(Boolean);
      h += '<div class="qf-field">';
      h += `<label class="qf-label">Characters Involved</label>`;
      h += `<div class="dt-cast-summary" data-cast-slot="${n}">`;
      if (castNames.length) {
        h += `<span class="dt-cast-pills">`;
        castNames.forEach(name => { h += `<span class="dt-cast-pill">${esc(name)}</span>`; });
        h += '</span>';
      } else {
        h += '<span class="dt-cast-none">None selected</span>';
      }
      h += `<button type="button" class="dt-cast-btn" data-cast-open="${n}">Select\u2026</button>`;
      h += '</div>';
      // Hidden inputs to preserve state
      castPicks.forEach(id => {
        h += `<input type="hidden" data-proj-cast-cb="${n}" value="${esc(String(id))}">`;
      });
      h += '</div>';
    }

    // ── Merits (applicable character merits) ──
    if (fields.includes('merits')) {
      let meritPicks = [];
      try { meritPicks = JSON.parse(saved[`project_${n}_merits`] || '[]'); } catch { /* ignore */ }
      h += '<div class="qf-field">';
      h += `<label class="qf-label">Applicable Merits</label>`;
      h += '<p class="qf-desc">Select merits from your sheet that support this action.</p>';
      h += `<div class="dt-proj-merits" data-proj-merits="${n}">`;
      for (const m of charMerits) {
        const mName = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
        const dots = '\u25CF'.repeat(m.rating || 0);
        const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
        const checked = meritPicks.includes(mKey) ? ' checked' : '';
        h += `<label class="dt-proj-merit-label">`;
        h += `<input type="checkbox" value="${esc(mKey)}" data-proj-merit-cb="${n}"${checked}>`;
        h += `<span>${esc(mName)} ${dots}</span>`;
        h += '</label>';
      }
      if (!charMerits.length) {
        h += '<p class="qf-desc">No applicable merits on this character.</p>';
      }
      h += '</div></div>';
    }

    // ── XP note ──
    if (fields.includes('xp')) {
      h += renderQuestion({
        key: `project_${n}_xp`, label: 'XP Expenditure',
        type: 'textarea', required: false, rows: 2,
        desc: 'Describe what you are spending XP on in this action.',
      }, saved[`project_${n}_xp`] || '');
    }

    // ── Description ──
    if (fields.includes('description')) {
      h += renderQuestion({
        key: `project_${n}_description`, label: 'Description',
        type: 'textarea', required: false,
        desc: 'Additional context, narrative, or details for this action.',
      }, saved[`project_${n}_description`] || '');
    }

    h += '</div>'; // proj-pane
  }

  h += '</div>'; // section-body
  h += '</div>'; // section
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

function renderXpRow(idx, row, xpActions, dotsRemaining) {
  let h = `<div class="dt-xp-row" data-xp-row="${idx}">`;

  // Filter categories based on action budget
  const filteredCats = XP_CATEGORIES.filter(opt => {
    if (!opt.value) return true; // "Select" placeholder always shown
    if (opt.value === 'merit') return true; // merits 1-3 always available
    return xpActions > 0; // all others need at least 1 XP action
  });

  // Category dropdown
  h += `<select class="qf-select dt-xp-cat" data-xp-cat="${idx}">`;
  for (const opt of filteredCats) {
    const sel = row.category === opt.value ? ' selected' : '';
    h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
  }
  h += '</select>';

  // Item dropdown (populated based on category, filtered by action budget)
  if (row.category) {
    let items = getItemsForCategory(row.category);
    // If no XP actions and category is merit, filter to merits <= 3 dots only
    if (row.category === 'merit' && xpActions === 0) {
      items = items.filter(item => {
        const parts = item.value.split('|');
        if (parts[1] === 'flat') return parseInt(parts[2], 10) <= 3;
        if (parts[1] === 'grad') return parseInt(parts[2], 10) < 3; // currentDots < 3
        return true;
      });
    }
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

  let h = '<div class="qf-section collapsed" data-section-key="blood_sorcery">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
  h += '<div class="qf-section-body">';
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

  h += '</div>'; // section-body
  h += '</div>'; // section
  return h;
}

// ── Acquisitions (custom render) ──

function renderAcquisitionsSection(saved) {
  const c = currentChar;
  // Find Resources merit rating
  const resourcesMerit = (c.merits || []).find(m => m.name === 'Resources');
  const resourcesRating = resourcesMerit ? (resourcesMerit.rating || 0) : 0;

  // All character merits for the picker
  const charMerits = (c.merits || []).filter(m =>
    m.category === 'general' || m.category === 'influence'
  );

  let h = '<div class="qf-section collapsed" data-section-key="acquisitions">';
  h += '<h4 class="qf-section-title">Acquisition: Resources and Skills<span class="qf-section-tick">✔</span></h4>';
  h += '<div class="qf-section-body">';

  // ── Resources acquisition ──
  h += '<div class="dt-acq-card">';
  h += '<div class="dt-acq-card-title">Resources Acquisition</div>';

  // Resources level (auto from sheet)
  h += '<div class="dt-acq-resources-row">';
  h += `<span class="dt-acq-label">Resources Level:</span>`;
  h += `<span class="dt-acq-dots">${resourcesRating ? '\u25CF'.repeat(resourcesRating) : 'None'}</span>`;
  h += '</div>';

  // Relevant merits (checkbox picker)
  let meritPicks = [];
  try { meritPicks = JSON.parse(saved['acq_merits'] || '[]'); } catch { /* ignore */ }
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Relevant Merits</label>';
  h += '<p class="qf-desc">Select merits that support this acquisition.</p>';
  h += '<div class="dt-proj-merits" data-acq-merits>';
  for (const m of charMerits) {
    const mName = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
    const dots = '\u25CF'.repeat(m.rating || 0);
    const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
    const checked = meritPicks.includes(mKey) ? ' checked' : '';
    h += `<label class="dt-proj-merit-label">`;
    h += `<input type="checkbox" value="${esc(mKey)}" data-acq-merit-cb${checked}>`;
    h += `<span>${esc(mName)} ${dots}</span>`;
    h += '</label>';
  }
  if (!charMerits.length) {
    h += '<p class="qf-desc">No applicable merits.</p>';
  }
  h += '</div></div>';

  // Description
  h += renderQuestion({
    key: 'acq_description', label: 'Acquisition Description',
    type: 'textarea', required: false,
    desc: 'What are you attempting to acquire? Include context and purpose.',
  }, saved['acq_description'] || '');

  // Availability (dot selector 1-5)
  const savedAvail = parseInt(saved['acq_availability'], 10) || 0;
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Availability</label>';
  h += '<p class="qf-desc">How rare is this item? Click to set (1 = common, 5 = unique).</p>';
  h += '<div class="dt-acq-avail-row" data-acq-avail>';
  for (let d = 1; d <= 5; d++) {
    const filled = d <= savedAvail ? ' dt-acq-dot-filled' : '';
    h += `<span class="dt-acq-dot${filled}" data-acq-dot="${d}">\u25CF</span>`;
  }
  if (savedAvail) {
    const labels = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];
    h += `<span class="dt-acq-avail-label">${labels[savedAvail] || ''}</span>`;
  }
  h += `<input type="hidden" id="dt-acq_availability" value="${savedAvail || ''}">`;
  h += '</div></div>';

  h += '</div>'; // acq-card

  // ── Skill-based acquisition ──
  const skAttrs = ALL_ATTRS.filter(a => {
    const v = c.attributes?.[a]; return v && (v.dots + (v.bonus || 0)) > 0;
  });
  const skSkills = ALL_SKILLS.filter(s => {
    const v = c.skills?.[s]; return v && (v.dots + (v.bonus || 0)) > 0;
  });

  h += '<div class="dt-acq-card" style="margin-top:16px;">';
  h += '<div class="dt-acq-card-title">Skill-Based Acquisition</div>';
  h += '<p class="qf-desc">Limited to ONE skill-based acquisition per Downtime.</p>';

  h += renderQuestion({
    key: 'skill_acq_description', label: 'Description',
    type: 'textarea', required: false,
    desc: 'What are you attempting to obtain, and how?',
  }, saved['skill_acq_description'] || '');

  // Dice pool: Attribute + Skill + relevant Merit
  h += '<div class="qf-field">';
  h += '<div class="dt-pool-label">Acquisition Pool</div>';
  h += '<div class="dt-dice-pool-row">';

  const skSavedAttr = saved['skill_acq_pool_attr'] || '';
  const skSavedSkill = saved['skill_acq_pool_skill'] || '';

  h += '<select class="qf-select" id="dt-skill_acq_pool_attr">';
  h += '<option value="">Attribute</option>';
  for (const a of skAttrs) {
    const v = c.attributes[a]; const dots = (v.dots || 0) + (v.bonus || 0);
    h += `<option value="${esc(a)}"${skSavedAttr === a ? ' selected' : ''}>${esc(a)} (${dots})</option>`;
  }
  h += '</select>';

  h += '<select class="qf-select" id="dt-skill_acq_pool_skill">';
  h += '<option value="">Skill</option>';
  for (const s of skSkills) {
    const v = c.skills[s]; const dots = (v.dots || 0) + (v.bonus || 0);
    h += `<option value="${esc(s)}"${skSavedSkill === s ? ' selected' : ''}>${esc(s)} (${dots})</option>`;
  }
  h += '</select>';

  // Specialisation chips (if selected skill has specs)
  const skSavedSpec = saved['skill_acq_pool_spec'] || '';
  const hasAoE = (c.merits || []).some(m => m.name?.toLowerCase() === 'area of expertise');
  let specBonus = 0;
  let skSpecs = [];
  if (skSavedSkill && c.skills?.[skSavedSkill]?.specs?.length) {
    skSpecs = c.skills[skSavedSkill].specs;
    if (skSavedSpec && skSpecs.includes(skSavedSpec)) {
      specBonus = hasAoE ? 2 : 1;
    }
  }

  // Pool total
  let skTotal = 0;
  if (skSavedAttr) { const a = c.attributes?.[skSavedAttr]; if (a) skTotal += (a.dots || 0) + (a.bonus || 0); }
  if (skSavedSkill) { const s = c.skills?.[skSavedSkill]; if (s) skTotal += (s.dots || 0) + (s.bonus || 0); }
  skTotal += specBonus;
  h += `<span class="dt-pool-total">${skTotal || '\u2014'}</span>`;
  h += '</div>';

  // Spec chips row + hidden input
  h += `<input type="hidden" id="dt-skill_acq_pool_spec" value="${esc(skSavedSpec)}">`;
  if (skSpecs.length) {
    h += '<div class="dt-feed-spec-row" style="margin-top:6px;">';
    h += '<label class="dt-feed-disc-lbl">Specialisation:</label>';
    for (const sp of skSpecs) {
      const on = skSavedSpec === sp ? ' dt-feed-spec-on' : '';
      h += `<button type="button" class="dt-feed-spec-chip${on}" data-skill-acq-spec="${esc(sp)}">${esc(sp)} <span class="dt-feed-spec-bonus">+${hasAoE ? 2 : 1}</span></button>`;
    }
    h += '</div>';
  }
  h += '</div>';

  // Relevant merits for this acquisition
  let skMeritPicks = [];
  try { skMeritPicks = JSON.parse(saved['skill_acq_merits'] || '[]'); } catch { /* ignore */ }
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Relevant Merits</label>';
  h += '<div class="dt-proj-merits" data-skill-acq-merits>';
  for (const m of charMerits) {
    const mName = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
    const dots = '\u25CF'.repeat(m.rating || 0);
    const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
    const checked = skMeritPicks.includes(mKey) ? ' checked' : '';
    h += `<label class="dt-proj-merit-label">`;
    h += `<input type="checkbox" value="${esc(mKey)}" data-skill-acq-merit-cb${checked}>`;
    h += `<span>${esc(mName)} ${dots}</span>`;
    h += '</label>';
  }
  h += '</div></div>';

  // Availability (dot selector 1-5)
  const skSavedAvail = parseInt(saved['skill_acq_availability'], 10) || 0;
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Availability</label>';
  h += '<p class="qf-desc">How rare is this item? Click to set (1 = common, 5 = unique).</p>';
  h += '<div class="dt-acq-avail-row" data-skill-acq-avail>';
  for (let d = 1; d <= 5; d++) {
    const filled = d <= skSavedAvail ? ' dt-acq-dot-filled' : '';
    h += `<span class="dt-acq-dot${filled}" data-skill-acq-dot="${d}">\u25CF</span>`;
  }
  if (skSavedAvail) {
    const labels = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];
    h += `<span class="dt-acq-avail-label">${labels[skSavedAvail] || ''}</span>`;
  }
  h += `<input type="hidden" id="dt-skill_acq_availability" value="${skSavedAvail || ''}">`;
  h += '</div></div>';

  h += '</div>';

  h += '</div></div>'; // section-body, section
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
  h += '<div class="qf-section collapsed" data-section-key="regency">';
  h += `<h4 class="qf-section-title">Regency: The Hand that Feeds<span class="qf-section-tick">✔</span></h4>`;
  h += '<div class="qf-section-body">';
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

  h += '</div>'; // section-body
  h += '</div>'; // section
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

  // ── Spheres of Influence (tabbed, max 5) ──
  if (hasSpheres) {
    const maxSpheres = Math.min(detectedMerits.spheres.length, 5);
    h += '<div class="qf-section collapsed" data-section-key="spheres">';
    h += '<h4 class="qf-section-title">Spheres of Influence<span class="qf-section-tick">✔</span></h4>';
    h += '<div class="qf-section-body">';
    h += '<p class="qf-section-intro">Your character has the following Allies and Status merits. Use the tabs to configure up to 5 sphere actions this Downtime.</p>';

    // ── Tab bar ──
    h += '<div class="dt-proj-tabs">';
    for (let n = 1; n <= maxSpheres; n++) {
      const m = detectedMerits.spheres[n - 1];
      const actionVal = saved[`sphere_${n}_action`] || '';
      const icon = ACTION_ICONS[actionVal] || ACTION_ICONS[''];
      const label = actionVal ? (ACTION_SHORT[actionVal] || actionVal) : 'No Action';
      const active = n === activeSphereTab ? ' dt-proj-tab-active' : '';
      const noAction = !actionVal ? ' dt-proj-tab-empty' : '';
      h += `<button type="button" class="dt-proj-tab${active}${noAction}" data-sphere-tab="${n}">`;
      h += `<span class="dt-proj-tab-icon">${icon}</span>`;
      h += `<span class="dt-proj-tab-num">${esc(meritLabel(m))}</span>`;
      h += `<span class="dt-proj-tab-label">${esc(label)}</span>`;
      h += '</button>';
    }
    h += '</div>';

    // ── Tab panes ──
    for (let n = 1; n <= maxSpheres; n++) {
      const m = detectedMerits.spheres[n - 1];
      const actionVal = saved[`sphere_${n}_action`] || '';
      const visible = n === activeSphereTab;
      const fields = SPHERE_ACTION_FIELDS[actionVal] || [];

      h += `<div class="dt-proj-pane${visible ? '' : ' dt-proj-pane-hidden'}" data-sphere-pane="${n}">`;

      // Merit info header
      h += `<div class="dt-sphere-merit-info">${esc(meritLabel(m))}</div>`;

      // Store which merit this slot references
      h += `<input type="hidden" id="dt-sphere_${n}_merit_key" value="${esc(meritKey(m))}">`;

      // Action type selector
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-sphere_${n}_action">Action Type</label>`;
      h += `<select id="dt-sphere_${n}_action" class="qf-select" data-sphere-action="${n}">`;
      for (const opt of SPHERE_ACTIONS) {
        const sel = actionVal === opt.value ? ' selected' : '';
        h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
      }
      h += '</select></div>';

      // ── Territory picker ──
      if (fields.includes('territory')) {
        const savedTerr = saved[`sphere_${n}_territory`] || '';
        h += '<div class="qf-field">';
        h += `<label class="qf-label" for="dt-sphere_${n}_territory">Territory</label>`;
        h += `<select id="dt-sphere_${n}_territory" class="qf-select">`;
        h += '<option value="">— No Territory —</option>';
        for (const t of TERRITORY_DATA) {
          const sel = savedTerr === t.id ? ' selected' : '';
          h += `<option value="${esc(t.id)}"${sel}>${esc(t.name)}</option>`;
        }
        h += '</select></div>';
      }

      // ── Cast picker ──
      if (fields.includes('cast')) {
        let castPicks = [];
        try { castPicks = JSON.parse(saved[`sphere_${n}_cast`] || '[]'); } catch { /* ignore */ }
        const castNames = castPicks.map(id => {
          const c = allCharacters.find(ch => ch.id === id || String(ch.id) === String(id));
          return c ? c.name : '';
        }).filter(Boolean);
        h += '<div class="qf-field">';
        h += `<label class="qf-label">Target Character(s)</label>`;
        h += `<div class="dt-cast-summary" data-cast-slot="sphere_${n}">`;
        if (castNames.length) {
          h += '<span class="dt-cast-pills">';
          castNames.forEach(name => { h += `<span class="dt-cast-pill">${esc(name)}</span>`; });
          h += '</span>';
        } else {
          h += '<span class="dt-cast-none">None selected</span>';
        }
        h += `<button type="button" class="dt-cast-btn" data-cast-open="sphere_${n}">Select\u2026</button>`;
        h += '</div>';
        castPicks.forEach(id => {
          h += `<input type="hidden" data-sphere-cast-cb="${n}" value="${esc(String(id))}">`;
        });
        h += '</div>';
      }

      // ── Desired outcome ──
      if (fields.includes('outcome')) {
        h += renderQuestion({
          key: `sphere_${n}_outcome`, label: 'Desired Outcome',
          type: 'text', required: false, desc: null,
        }, saved[`sphere_${n}_outcome`] || '');
      }

      // ── Description ──
      if (fields.includes('description')) {
        h += renderQuestion({
          key: `sphere_${n}_description`, label: 'Description',
          type: 'textarea', required: false, desc: null,
        }, saved[`sphere_${n}_description`] || '');
      }

      h += '</div>'; // pane
    }

    h += '</div></div>';
  }

  // ── Contacts (expandable table) ──
  if (hasContacts) {
    const maxContacts = Math.min(detectedMerits.contacts.length, 5);
    h += '<div class="qf-section collapsed" data-section-key="contacts">';
    h += '<h4 class="qf-section-title">Contacts: Requests for Information<span class="qf-section-tick">✔</span></h4>';
    h += '<div class="qf-section-body">';
    h += '<p class="qf-section-intro">Click a contact to expand and submit an information request. Maximum 5 requests per Downtime.</p>';

    h += '<div class="dt-contacts-table">';
    for (let n = 1; n <= maxContacts; n++) {
      const m = detectedMerits.contacts[n - 1];
      const area = m.area || m.qualifier || 'General';
      const dots = '\u25CF'.repeat(m.rating || 1);
      const savedInfo = saved[`contact_${n}_info`] || '';
      const savedReq = saved[`contact_${n}_request`] || '';
      const isUsed = savedInfo || savedReq;
      const expanded = isUsed;

      h += `<div class="dt-contact-row${isUsed ? ' dt-contact-used' : ''}" data-contact-row="${n}">`;
      // Header (clickable)
      h += `<div class="dt-contact-header" data-contact-toggle="${n}">`;
      h += `<span class="dt-contact-area">${esc(area)}</span>`;
      h += `<span class="dt-contact-dots">${dots}</span>`;
      h += `<span class="dt-contact-status">${isUsed ? 'Used' : 'Unused'}</span>`;
      if (isUsed) {
        h += `<button type="button" class="dt-contact-clear" data-contact-clear="${n}" title="Clear and close">\u2715</button>`;
      }
      h += '</div>';

      // Expandable panel
      h += `<div class="dt-contact-panel${expanded ? '' : ' dt-contact-panel-hidden'}" data-contact-panel="${n}">`;
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-contact_${n}_info">Supporting Info</label>`;
      h += `<input type="text" id="dt-contact_${n}_info" class="qf-input" value="${esc(savedInfo)}" placeholder="Context, leverage, or relevant details">`;
      h += '</div>';
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-contact_${n}_request">Request</label>`;
      h += `<textarea id="dt-contact_${n}_request" class="qf-textarea" rows="3" placeholder="What do you want to know?">${esc(savedReq)}</textarea>`;
      h += '</div>';
      // Store merit label
      h += `<input type="hidden" id="dt-contact_${n}_merit" value="${esc(meritLabel(m))}">`;
      h += '</div>'; // panel
      h += '</div>'; // row
    }
    h += '</div>';

    h += '</div></div>';
  }

  // ── Retainers (expandable table) ──
  if (hasRetainers) {
    const maxRetainers = detectedMerits.retainers.length;
    h += '<div class="qf-section collapsed" data-section-key="retainers">';
    h += '<h4 class="qf-section-title">Retainers: Task Delegation<span class="qf-section-tick">✔</span></h4>';
    h += '<div class="qf-section-body">';
    h += '<p class="qf-section-intro">Click a retainer to expand and assign a task for this Downtime.</p>';

    h += '<div class="dt-contacts-table">';
    for (let n = 1; n <= maxRetainers; n++) {
      const m = detectedMerits.retainers[n - 1];
      const area = m.area || m.qualifier || 'Retainer';
      const dots = '\u25CF'.repeat(m.rating || 1);
      const ghoulTag = m.ghoul ? ' (Ghoul)' : '';
      const savedType = saved[`retainer_${n}_type`] || '';
      const savedTask = saved[`retainer_${n}_task`] || '';
      const isUsed = savedType || savedTask;
      const expanded = isUsed;

      h += `<div class="dt-contact-row${isUsed ? ' dt-contact-used' : ''}" data-retainer-row="${n}">`;
      // Header
      h += `<div class="dt-contact-header" data-retainer-toggle="${n}">`;
      h += `<span class="dt-contact-area">${esc(area)}${esc(ghoulTag)}</span>`;
      h += `<span class="dt-contact-dots">${dots}</span>`;
      h += `<span class="dt-contact-status">${isUsed ? 'Tasked' : 'Idle'}</span>`;
      if (isUsed) {
        h += `<button type="button" class="dt-contact-clear" data-retainer-clear="${n}" title="Clear and close">\u2715</button>`;
      }
      h += '</div>';

      // Expandable panel
      h += `<div class="dt-contact-panel${expanded ? '' : ' dt-contact-panel-hidden'}" data-retainer-panel="${n}">`;
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-retainer_${n}_type">Task Type</label>`;
      h += `<input type="text" id="dt-retainer_${n}_type" class="qf-input" value="${esc(savedType)}" placeholder="e.g. Guard, Investigate, Deliver, Procure">`;
      h += '</div>';
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-retainer_${n}_task">Task Description</label>`;
      h += `<textarea id="dt-retainer_${n}_task" class="qf-textarea" rows="3" placeholder="What do you want them to do?">${esc(savedTask)}</textarea>`;
      h += '</div>';
      h += `<input type="hidden" id="dt-retainer_${n}_merit" value="${esc(meritLabel(m))}">`;
      h += '</div>'; // panel
      h += '</div>'; // row
    }
    h += '</div>';

    h += '</div></div>';
  }

  return h;
}

// ── Section completion ticks ──

function updateSectionTicks(container) {
  container.querySelectorAll('.qf-section[data-section-key]').forEach(section => {
    const tick = section.querySelector('.qf-section-tick');
    if (!tick) return;
    const body = section.querySelector('.qf-section-body');
    if (!body) return;

    const key = section.dataset.sectionKey;

    // Projects: tick when project 1 has an action selected
    if (key === 'projects') {
      const p1Action = document.getElementById('dt-project_1_action');
      tick.classList.toggle('visible', !!(p1Action && p1Action.value));
      return;
    }

    // Retainers: tick when any retainer has content
    if (key === 'retainers') {
      const maxR = detectedMerits.retainers.length;
      let anyUsed = false;
      for (let n = 1; n <= maxR; n++) {
        const t = document.getElementById(`dt-retainer_${n}_type`);
        const d = document.getElementById(`dt-retainer_${n}_task`);
        if ((t && t.value.trim()) || (d && d.value.trim())) { anyUsed = true; break; }
      }
      tick.classList.toggle('visible', anyUsed);
      return;
    }

    // Contacts: tick when any contact has content
    if (key === 'contacts') {
      const maxC = Math.min(detectedMerits.contacts.length, 5);
      let anyUsed = false;
      for (let n = 1; n <= maxC; n++) {
        const info = document.getElementById(`dt-contact_${n}_info`);
        const req = document.getElementById(`dt-contact_${n}_request`);
        if ((info && info.value.trim()) || (req && req.value.trim())) { anyUsed = true; break; }
      }
      tick.classList.toggle('visible', anyUsed);
      return;
    }

    // Spheres: tick when any sphere slot has an action selected
    if (key === 'spheres') {
      const maxS = Math.min(detectedMerits.spheres.length, 5);
      let anyAction = false;
      for (let n = 1; n <= maxS; n++) {
        const el = document.getElementById(`dt-sphere_${n}_action`);
        if (el && el.value) { anyAction = true; break; }
      }
      tick.classList.toggle('visible', anyAction);
      return;
    }

    // Territory: tick when any feeding territory has a resident/poach selection
    if (key === 'territory') {
      const feedRadios = body.querySelectorAll('input[type="radio"]:checked');
      const hasSelection = Array.from(feedRadios).some(r => r.value === 'resident' || r.value === 'poach');
      tick.classList.toggle('visible', hasSelection);
      return;
    }

    // For all other sections: tick only when ALL visible fields are filled.
    // Skip fields inside hidden (gated) sub-sections.
    const fields = body.querySelectorAll('.qf-field:not(.dt-feedback-hidden)');
    let totalFields = 0;
    let filledFields = 0;

    fields.forEach(field => {
      // Skip if inside a hidden gated section
      if (field.closest('.dt-gated-hidden')) return;
      // Skip if the field itself is hidden (e.g. feedback before rating)
      if (field.classList.contains('dt-feedback-hidden')) return;

      // Find the input element(s) in this field
      const textarea = field.querySelector('textarea');
      const input = field.querySelector('input:not([type="hidden"]):not([type="radio"])');
      const select = field.querySelector('select');
      const hiddenInput = field.querySelector('input[type="hidden"]');
      const radioGroup = field.querySelectorAll('input[type="radio"]');
      const meritToggle = field.querySelector('[data-merit-toggle]');

      // Merit toggle fields: skip (they're action selectors, not content)
      if (meritToggle) return;

      let hasField = false;
      let isFilled = false;

      if (textarea) {
        hasField = true;
        isFilled = textarea.value.trim().length > 0;
      } else if (select) {
        hasField = true;
        isFilled = select.value.trim().length > 0;
      } else if (input) {
        hasField = true;
        isFilled = input.value.trim().length > 0;
      } else if (hiddenInput) {
        hasField = true;
        isFilled = hiddenInput.value.trim().length > 0;
      } else if (radioGroup.length > 0) {
        hasField = true;
        isFilled = !!field.querySelector('input[type="radio"]:checked');
      }

      if (hasField) {
        totalFields++;
        if (isFilled) filledFields++;
      }
    });

    const complete = totalFields > 0 && filledFields === totalFields;
    tick.classList.toggle('visible', complete);
  });
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
  const extraClass = q.key === 'form_feedback' ? ' dt-feedback-field' : '';
  let h = `<div class="qf-field${extraClass}">`;
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

    case 'star_rating': {
      const cur = parseInt(value, 10) || 0;
      h += `<input type="hidden" id="dt-${q.key}" value="${cur ? cur : ''}">`;
      h += '<div class="dt-star-row" data-star-input="dt-' + q.key + '">';
      for (let s = 1; s <= 5; s++) {
        const leftVal = s * 2 - 1;
        const rightVal = s * 2;
        const leftFill = cur >= leftVal ? ' dt-star-filled' : '';
        const rightFill = cur >= rightVal ? ' dt-star-filled' : '';
        h += `<span class="dt-star" data-star="${s}">`;
        h += `<span class="dt-star-half dt-star-left${leftFill}" data-star-val="${leftVal}">★</span>`;
        h += `<span class="dt-star-half dt-star-right${rightFill}" data-star-val="${rightVal}">★</span>`;
        h += '</span>';
      }
      if (cur) h += `<span class="dt-star-label">${cur}/10</span>`;
      else h += '<span class="dt-star-label"></span>';
      h += '</div>';
      break;
    }

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

      h += '<div class="dt-feed-card-wrap">';
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

      // Blood type selection (always shown)
      const BLOOD_TYPES = ['Animal', 'Human', 'Kindred'];
      let savedBlood = [];
      try { savedBlood = JSON.parse(responseDoc?.responses?.['_feed_blood_types'] || '[]'); } catch { /* ignore */ }
      h += '<div class="qf-field">';
      h += '<label class="qf-label">Blood Type</label>';
      h += '<div class="dt-feed-blood-types">';
      for (const bt of BLOOD_TYPES) {
        const checked = savedBlood.includes(bt) ? ' checked' : '';
        h += `<label class="dt-feed-blood-label">`;
        h += `<input type="checkbox" value="${esc(bt)}" data-blood-type${checked}>`;
        h += `<span>${esc(bt)}</span>`;
        h += '</label>';
      }
      h += '</div></div>';

      // ROTE checkbox + description (shown when method selected)
      if (feedMethodId) {
        // Restore rote state from saved responses
        const savedRote = responseDoc?.responses?.['_feed_rote'] === 'yes';
        if (savedRote && !feedRoteAction) feedRoteAction = true;

        h += '<div class="dt-feed-rote">';
        h += `<label class="dt-feed-rote-label">`;
        h += `<input type="checkbox" id="dt-feed-rote" ${feedRoteAction ? 'checked' : ''}>`;
        h += `<span>Spend a Project action for Rote feeding</span>`;
        h += '</label>';
        h += '<p class="qf-desc" style="margin:4px 0 0 24px;">Dedicates Project 1 to feeding. The pool and method above will be copied automatically.</p>';
        h += '</div>';

        h += '<div class="qf-field">';
        h += '<label class="qf-label" for="dt-feeding_description">Describe how your character hunts</label>';
        h += `<textarea id="dt-feeding_description" class="qf-textarea" rows="4">${esc(savedDesc)}</textarea>`;
        h += '</div>';
      }

      h += '</div>'; // dt-feed-card-wrap
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

      // Count XP Spend project actions → dot budget for non-merit purchases
      const saved = responseDoc?.responses || {};
      let xpActions = 0;
      for (let n = 1; n <= 4; n++) {
        if (saved[`project_${n}_action`] === 'xp_spend') xpActions++;
      }

      // Count dots already allocated to non-merit categories
      let dotsUsed = 0;
      for (const r of xpRows) {
        if (!r.category || !r.item) continue;
        if (r.category === 'merit') continue; // merits 1-3 are free
        if (r.category === 'devotion') {
          dotsUsed++; // devotions count as 1 action each
        } else {
          dotsUsed += (r.dotsBuying || 1);
        }
      }
      const dotsRemaining = xpActions - dotsUsed;

      const budget = xpLeft(currentChar);
      const totalSpent = xpRows.reduce((sum, r) => sum + getRowCost(r), 0);
      const remaining = budget - totalSpent;

      h += `<div class="dt-xp-grid" id="dt-${q.key}">`;
      h += `<div class="dt-xp-budget" id="dt-xp-budget">`;
      h += `<span class="dt-influence-remaining${remaining < 0 ? ' dt-influence-over' : ''}">${remaining}</span>`;
      h += ` / ${budget} XP remaining`;
      h += '</div>';

      // Action budget indicator
      h += '<div class="dt-xp-action-budget">';
      if (xpActions > 0) {
        h += `<span class="dt-xp-action-count">${xpActions} XP Spend action${xpActions > 1 ? 's' : ''}</span>`;
        h += ` \u2014 <span class="${dotsRemaining < 0 ? 'dt-influence-over' : ''}">${dotsRemaining} dot${dotsRemaining !== 1 ? 's' : ''} remaining</span>`;
      } else {
        h += '<span class="dt-xp-action-none">No XP Spend actions allocated \u2014 only Merits (1\u20133 dots) available</span>';
      }
      h += '</div>';

      for (let i = 0; i < xpRows.length; i++) {
        h += renderXpRow(i, xpRows[i], xpActions, dotsRemaining);
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
