/* Downtime submission form — character-aware, section-gated, auto-saving.
 * Uses existing /api/downtime_submissions API.
 * Lifecycle: draft → submitted (player can edit until deadline)
 *
 * Auto-detected sections:
 *  - Court: from game_sessions attendance
 *  - Regency action: inlined in Vamping section for Regents
 *  - Spheres/Contacts/Retainers: from character merits
 *  - Blood Sorcery: from disciplines (Cruac/Theban)
 */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { saveDraft as saveLocalDraft, loadDraft as loadLocalDraft, clearDraft as clearLocalDraft, pickFreshestDraft } from './draft-persist.js';
import { esc, displayName, parseOutcomeSections, redactPlayer, redactCharName, hasAoE, isSpecs, findRegentTerritory } from '../data/helpers.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { DOWNTIME_SECTIONS, DOWNTIME_GATES, SPHERE_ACTIONS, TERRITORY_DATA, FEEDING_TERRITORIES, PROJECT_ACTIONS, FEED_METHODS, MAINTENANCE_MERITS, FEED_VIOLENCE_DEFAULTS } from './downtime-data.js';
import { ALL_ATTRS, ALL_SKILLS, CLAN_DISCS, BLOODLINE_DISCS, CORE_DISCS } from '../data/constants.js';
import { calcTotalInfluence } from '../editor/domain.js';
import { calcVitaeMax } from '../data/accessors.js';
import { xpLeft } from '../editor/xp.js';
import { meetsPrereq } from '../editor/merits.js';
import { getRuleByKey, getRulesByCategory } from '../data/loader.js';
import { getRole, isSTRole } from '../auth/discord.js';
import { FAMILIES, kindByCode } from '../data/relationship-kinds.js';
import { promptForKind } from '../data/kind-prompts.js';

// Influence merit names that generate monthly influence
const INFLUENCE_MERIT_NAMES = ['Allies', 'Retainer', 'Mentor', 'Resources', 'Staff', 'Contacts', 'Status'];
// Only 5 territories can receive influence (not The Barrens)
const INFLUENCE_TERRITORIES = FEEDING_TERRITORIES.filter(t => !t.includes('Barrens'));

// DTFP-2: render-time alphabetical sort for chip lists. Returns a new array;
// never mutates the source (chip data often comes from shared modules like
// FEED_METHODS that must not be reordered).
function sortChips(items, keyFn = x => x) {
  return items.slice().sort((a, b) =>
    String(keyFn(a)).localeCompare(String(keyFn(b)), undefined, { sensitivity: 'base' })
  );
}

// STs receive raw docs from the API (stripStReview not applied server-side for their role).
// Promote st_review.outcome_text → published_outcome client-side so ST player-portal views
// behave identically to player views.
function _promotePublishedOutcome(sub) {
  if (!sub.published_outcome && sub.st_review?.outcome_visibility === 'published') {
    sub.published_outcome = sub.st_review.outcome_text;
  }
}

let responseDoc = null;
let currentChar = null;
let currentCycle = null;
let _territories = [];
let gateValues = {};
let saveTimer = null;
let localSaveTimer = null; // DTU-2: localStorage mirror fires faster than server save
let restoredFromLocal = false; // DTU-2: banner flag set when form mounts from localStorage
let priorPublishedLabel = null; // label of most recent published cycle other than current
let _linkedNpcs = [];    // DTOSL.2 legacy (kept so legacy renderers don't crash) — unused in new flow
let _myRelationships = []; // NPCR.12: active edges involving the current character, for the story-moment picker

// Merits detected from the character sheet, grouped by type
let detectedMerits = { spheres: [], contacts: [], retainers: [], status: [] };


// Characters who attended last game (for shoutout picks)
let lastGameAttendees = [];
// All active characters (for cast picker modal)
let allCharacters = [];

// Map of territory name → Set of resident character IDs (for feeding grid indicators)
let residencyByTerritory = {};


// Feeding method state (for feeding_method widget)
let feedMethodId = '';
let feedDiscName = '';
let feedSpecName = '';
let feedCustomAttr = '';
let feedCustomSkill = '';
let feedCustomDisc = '';
let feedRoteAction = false;
let feedRoteSlot = 1;
let feedRoteDisc = '';
let feedRoteSpec = '';
let feedRoteCustomAttr = '';
let feedRoteCustomSkill = '';

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
  'feed': [],
  'xp_spend': ['xp_picker'],
  'ambience_increase': ['title', 'territory', 'pools', 'cast', 'description'],
  'ambience_decrease': ['title', 'territory', 'pools', 'cast', 'description'],
  'attack': ['title', 'target_char', 'pools', 'outcome', 'territory', 'cast', 'merits', 'description'],
  'investigate': ['title', 'target_flex', 'investigate_lead', 'pools', 'outcome', 'cast', 'merits', 'description'],
  'hide_protect': ['title', 'target_own_merit', 'pools', 'outcome', 'cast', 'merits', 'description'],
  'patrol_scout': ['title', 'pools', 'outcome', 'territory', 'cast', 'description'],
  'support': ['title', 'pools', 'outcome', 'cast', 'description'],
  'misc': ['title', 'pools', 'outcome', 'cast', 'description'],
  'maintenance': ['description'],
};

const SPHERE_ACTION_FIELDS = {
  '': [],
  'ambience_increase': ['territory', 'outcome'],
  'ambience_decrease': ['territory', 'outcome'],
  'attack': ['target_char', 'outcome'],
  'block': ['target_char', 'block_merit', 'outcome'],
  'hide_protect': ['target_own_merit', 'outcome'],
  'investigate': ['target_flex', 'investigate_lead', 'outcome'],
  'patrol_scout': ['territory', 'outcome', 'description'],
  'rumour': ['outcome', 'description'],
  'support': ['project_support', 'outcome'],
  'grow': ['outcome', 'description'],
  'misc': ['outcome', 'description'],
};

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(), 2000);
  // DTU-2: localStorage mirror runs at 800ms so a tab close between
  // keystrokes and the 2s server save doesn't wipe in-progress work.
  if (localSaveTimer) clearTimeout(localSaveTimer);
  localSaveTimer = setTimeout(_saveLocalSnapshot, 800);
}

function _saveLocalSnapshot() {
  if (!currentChar?._id || !currentCycle?._id) return;
  if (currentCycle._id === 'dev-stub') return;
  try {
    const responses = collectResponses();
    saveLocalDraft(String(currentChar._id), String(currentCycle._id), responses);
  } catch {
    // Never block rendering on a storage failure.
  }
}

function _clearLocalSnapshot() {
  if (!currentChar?._id || !currentCycle?._id) return;
  clearLocalDraft(String(currentChar._id), String(currentCycle._id));
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
  const merits = (currentChar.merits || []).filter(m => m.category);
  const discs = currentChar.disciplines || {};

  // Expand benefit_grants from standing merits (MCI) into the influence pool
  const expandedInfluence = [...merits];
  for (const m of merits) {
    if (m.category === 'standing' && Array.isArray(m.benefit_grants)) {
      for (const g of m.benefit_grants) {
        if (g.category === 'influence') expandedInfluence.push({ ...g, _from_mci: m.cult_name || m.name });
      }
    }
  }

  detectedMerits.spheres = deduplicateMerits(expandedInfluence.filter(m =>
    m.category === 'influence' && m.name === 'Allies'
  ));
  detectedMerits.status = deduplicateMerits(merits.filter(m =>
    m.category === 'influence' && m.name === 'Status'
  )).concat(merits.filter(m => m.category === 'standing' && m.name === 'MCI'));
  // Contacts: expand spheres array into individual entries for toggle rendering
  const rawContacts = deduplicateMerits(expandedInfluence.filter(m =>
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
function collectResponses() {
  const responses = {};

  // Persist auto-detected gates
  responses['_gate_attended'] = gateValues.attended || '';
  responses['_gate_is_regent'] = gateValues.is_regent || '';
  responses['_gate_has_sorcery'] = gateValues.has_sorcery || '';
  if (gateValues.is_regent === 'yes' && findRegentTerritory(_territories, currentChar)?.territory) {
    responses['regent_territory'] = findRegentTerritory(_territories, currentChar)?.territory;
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
        document.querySelectorAll('.dt-shoutout-cb:checked').forEach(cb => picks.push(cb.value));
        responses[q.key] = JSON.stringify(picks);
        continue;
      }
      if (q.type === 'feeding_method') {
        // DTFP-4: _feed_method is no longer persisted on new submissions.
        // The method-card pick is UX-only scaffolding for the chip suggestions;
        // the saved pool is whatever the player built via attr/skill/disc/spec.
        // Legacy submissions keep their stored _feed_method for back-compat reads.
        // DTFP-5: feed_violence persists only after the player clicks the toggle.
        // Pre-selection is visual only; preserve any explicit choice through saves.
        if (responseDoc?.responses?.feed_violence) {
          responses.feed_violence = responseDoc.responses.feed_violence;
        }
        responses['_feed_disc'] = feedDiscName;
        responses['_feed_spec'] = feedSpecName;
        responses['_feed_custom_attr'] = feedCustomAttr;
        responses['_feed_custom_skill'] = feedCustomSkill;
        responses['_feed_custom_disc'] = feedCustomDisc;
        responses['_feed_rote'] = feedRoteAction ? 'yes' : '';
        responses['_feed_rote_slot'] = feedRoteAction ? String(feedRoteSlot) : '';
        const roteDiscEl = document.getElementById('dt-rote-disc');
        feedRoteDisc = roteDiscEl ? roteDiscEl.value : feedRoteDisc;
        const roteAttrEl = document.getElementById('dt-rote-custom-attr');
        const roteSkillEl = document.getElementById('dt-rote-custom-skill');
        if (roteAttrEl) feedRoteCustomAttr = roteAttrEl.value;
        if (roteSkillEl) feedRoteCustomSkill = roteSkillEl.value;
        responses['_rote_disc'] = feedRoteAction ? feedRoteDisc : '';
        responses['_rote_spec'] = feedRoteAction ? feedRoteSpec : '';
        responses['_rote_custom_attr'] = feedRoteAction ? feedRoteCustomAttr : '';
        responses['_rote_custom_skill'] = feedRoteAction ? feedRoteCustomSkill : '';
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
        const gridVals = {};
        for (const terr of FEEDING_TERRITORIES) {
          const terrKey = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
          const el = document.getElementById(`feed-val-${terrKey}`);
          gridVals[terrKey] = el ? el.value : 'none';
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

  // Personal story fields (legacy keys kept for back-compat with ST admin views)
  const psNpcId   = document.getElementById('dt-personal_story_npc_id');
  const psNpcName = document.getElementById('dt-personal_story_npc_name');
  const psNote    = document.getElementById('dt-personal_story_note');
  // NPCR.12 r3: personal_story_direction retired (Story direction radios
  // removed). Existing legacy submissions still carry the field.
  responses['personal_story_npc_id']   = psNpcId   ? psNpcId.value   : '';
  responses['personal_story_npc_name'] = psNpcName ? psNpcName.value : '';
  responses['personal_story_note']     = psNote    ? psNote.value    : '';

  // NPCR.12: Personal Story target + moment note. Legacy osl_* / correspondence
  // fields are no longer written from new submissions; legacy submissions in
  // the DB are read by downstream renderers via fallback lookups.
  const relIdEl = document.getElementById('dt-story_moment_relationship_id');
  const noteEl  = document.getElementById('dt-story_moment_note');
  responses['story_moment_relationship_id'] = relIdEl ? relIdEl.value : '';
  responses['story_moment_note']            = noteEl  ? noteEl.value  : '';

  // Aspiration structured slots
  for (let n = 1; n <= 3; n++) {
    const typeEl = document.getElementById(`dt-aspiration_${n}_type`);
    const textEl = document.getElementById(`dt-aspiration_${n}_text`);
    responses[`aspiration_${n}_type`] = typeEl ? typeEl.value : '';
    responses[`aspiration_${n}_text`] = textEl ? textEl.value : '';
  }

  // DTR.1: Game recount structured highlight slots (game_recount_1…5).
  // We also maintain a joined `game_recount` string (one highlight per line)
  // so ST admin views that still read the legacy key keep working, and so
  // the required-field validator has something to check.
  const highlights = [];
  for (let n = 1; n <= 5; n++) {
    const el = document.getElementById(`dt-game_recount_${n}`);
    const val = el ? el.value : '';
    responses[`game_recount_${n}`] = val;
    if (val.trim()) highlights.push(val.trim());
    // DTFP-7: per-slot mechanical-flag boolean
    const flagEl = document.getElementById(`dt-mechanical_flag_${n}`);
    if (flagEl) responses[`mechanical_flag_${n}`] = flagEl.checked;
  }
  if (highlights.length > 0) {
    responses['game_recount'] = highlights.map((h, i) => `${i + 1}. ${h}`).join('\n\n');
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
    // Rote-locked slot: pull description from rote textarea
    if (feedRoteAction && n === feedRoteSlot) {
      const roteDescEl = document.getElementById('dt-rote-description');
      if (roteDescEl) responses[`project_${n}_description`] = roteDescEl.value;
      responses[`project_${n}_action`] = 'feed';
    }
    responses[`project_${n}_title`] = titleEl ? titleEl.value : '';
    responses[`project_${n}_territory`] = terrEl ? terrEl.value : '';
    responses[`project_${n}_xp`] = xpEl ? xpEl.value : '';
    const xpTraitEl = document.getElementById(`dt-project_${n}_xp_trait`);
    responses[`project_${n}_xp_trait`] = xpTraitEl ? xpTraitEl.value : '';
    const xpCatEl = document.getElementById(`dt-project_${n}_xp_category`);
    const xpItemEl = document.getElementById(`dt-project_${n}_xp_item`);
    responses[`project_${n}_xp_category`] = xpCatEl ? xpCatEl.value : '';
    responses[`project_${n}_xp_item`] = xpItemEl ? xpItemEl.value : '';
    if (responses[`project_${n}_action`] === 'xp_spend') responses[`project_${n}_xp_dots`] = '1';
    // Target pickers (attack, hide_protect, investigate)
    const targetTypeRadio = document.querySelector(`input[name="dt-project_${n}_target_type"]:checked`);
    responses[`project_${n}_target_type`] = targetTypeRadio ? targetTypeRadio.value : '';
    // target_char uses checkbox grid; others use hidden input or select
    const targetCharCbs = document.querySelectorAll(`.dt-target-char-cb[data-target-slot="${n}"]:checked`);
    if (targetCharCbs.length) {
      const ids = []; targetCharCbs.forEach(cb => ids.push(cb.value));
      responses[`project_${n}_target_value`] = JSON.stringify(ids);
    } else {
      const targetValueEl = document.getElementById(`dt-project_${n}_target_value`);
      responses[`project_${n}_target_value`] = targetValueEl ? targetValueEl.value : '';
    }
    const leadEl = document.getElementById(`dt-project_${n}_investigate_lead`);
    responses[`project_${n}_investigate_lead`] = leadEl ? leadEl.value : '';

    // Cast checkboxes (inline grid)
    const castCbs = document.querySelectorAll(`.dt-cast-proj-cb[data-cast-slot="${n}"]:checked`);
    const castIds = [];
    castCbs.forEach(cb => { if (cb.value) castIds.push(cb.value); });
    responses[`project_${n}_cast`] = JSON.stringify(castIds);

    // Merit checkboxes
    const meritCbs = document.querySelectorAll(`[data-proj-merit-cb="${n}"]:checked`);
    const meritKeys = [];
    meritCbs.forEach(cb => meritKeys.push(cb.value));
    responses[`project_${n}_merits`] = JSON.stringify(meritKeys);
  }

  // Collect sorcery slots (dynamic count)
  const sorceryCountEl = document.getElementById('dt-sorcery-slot-count');
  const sorcerySlotCount = sorceryCountEl ? parseInt(sorceryCountEl.value, 10) || 1 : 1;
  responses['sorcery_slot_count'] = String(sorcerySlotCount);
  for (let n = 1; n <= sorcerySlotCount; n++) {
    const riteEl = document.getElementById(`dt-sorcery_${n}_rite`);
    responses[`sorcery_${n}_rite`] = riteEl ? riteEl.value : '';
    const targetsEl = document.getElementById(`dt-sorcery_${n}_targets`);
    responses[`sorcery_${n}_targets`] = targetsEl ? targetsEl.value : '';
    const notesEl = document.getElementById(`dt-sorcery_${n}_notes`);
    responses[`sorcery_${n}_notes`] = notesEl ? notesEl.value : '';
    const mandEl = document.getElementById(`dt-sorcery_${n}_mandragora`);
    responses[`sorcery_${n}_mandragora`] = mandEl ? (mandEl.checked ? 'yes' : 'no') : 'no';
    const mandPaidEl = document.getElementById(`dt-sorcery_${n}_mand_paid`);
    responses[`sorcery_${n}_mand_paid`] = mandPaidEl ? (mandPaidEl.checked ? 'yes' : 'no') : 'no';
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
    for (const suffix of ['action', 'outcome', 'description', 'territory', 'block_merit', 'project_support', 'investigate_lead']) {
      const el = document.getElementById(`dt-sphere_${n}_${suffix}`);
      if (el) responses[`sphere_${n}_${suffix}`] = el.value;
    }
    const flexRadio = document.querySelector(`input[name="dt-sphere_${n}_target_type"]:checked`);
    responses[`sphere_${n}_target_type`] = flexRadio ? flexRadio.value : '';
    const sphTargetCbs = document.querySelectorAll(`.dt-target-char-sphere-cb[data-target-slot="sphere_${n}"]:checked`);
    if (sphTargetCbs.length) {
      const ids = []; sphTargetCbs.forEach(cb => ids.push(cb.value));
      responses[`sphere_${n}_target_value`] = JSON.stringify(ids);
    } else {
      const el = document.getElementById(`dt-sphere_${n}_target_value`);
      if (el) responses[`sphere_${n}_target_value`] = el.value;
    }
    // Merit label for this slot
    const m = detectedMerits.spheres[n - 1];
    if (m) responses[`sphere_${n}_merit`] = meritLabel(m);
    // Cast hidden inputs (legacy — kept for backwards compat)
    const castHidden = document.querySelectorAll(`input[type="hidden"][data-sphere-cast-cb="${n}"]`);
    const castIds = [];
    castHidden.forEach(el => { if (el.value) castIds.push(el.value); });
    responses[`sphere_${n}_cast`] = JSON.stringify(castIds);
  }

  // Status action fields
  const maxStatus = Math.min(detectedMerits.status.length, 5);
  for (let n = 1; n <= maxStatus; n++) {
    for (const suffix of ['action', 'outcome', 'description', 'territory', 'investigate_lead']) {
      const el = document.getElementById(`dt-status_${n}_${suffix}`);
      if (el) responses[`status_${n}_${suffix}`] = el.value;
    }
    const stTargetCbs = document.querySelectorAll(`.dt-target-char-sphere-cb[data-target-slot="status_${n}"]:checked`);
    if (stTargetCbs.length) {
      const ids = []; stTargetCbs.forEach(cb => ids.push(cb.value));
      responses[`status_${n}_target_value`] = JSON.stringify(ids);
    } else {
      const el = document.getElementById(`dt-status_${n}_target_value`);
      if (el) responses[`status_${n}_target_value`] = el.value;
    }
    const flexRadio = document.querySelector(`input[name="dt-status_${n}_target_type"]:checked`);
    responses[`status_${n}_target_type`] = flexRadio ? flexRadio.value : '';
    const sm = detectedMerits.status[n - 1];
    if (sm) responses[`status_${n}_merit`] = meritLabel(sm);
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
    responses['acq_availability'] ? `Availability: ${responses['acq_availability'] === 'unknown' ? 'Unknown' : responses['acq_availability'] + '/5'}` : '',
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

  // Collect equipment slots
  const equipCountEl = document.getElementById('dt-equipment-slot-count');
  const equipSlotCount = equipCountEl ? parseInt(equipCountEl.value, 10) || 1 : 1;
  responses['equipment_slot_count'] = String(equipSlotCount);
  for (let n = 1; n <= equipSlotCount; n++) {
    const nameEl = document.getElementById(`dt-equipment_${n}_name`);
    const qtyEl = document.getElementById(`dt-equipment_${n}_qty`);
    const notesEl = document.getElementById(`dt-equipment_${n}_notes`);
    responses[`equipment_${n}_name`] = nameEl ? nameEl.value : '';
    responses[`equipment_${n}_qty`] = qtyEl ? qtyEl.value : '';
    responses[`equipment_${n}_notes`] = notesEl ? notesEl.value : '';
  }

  return responses;
}

async function saveDraft() {
  const statusEl = document.getElementById('dt-save-status');
  if (!currentCycle) {
    if (statusEl) statusEl.textContent = 'No active cycle — contact your ST';
    return;
  }
  if (currentCycle._id === 'dev-stub') {
    if (statusEl) statusEl.textContent = '[Dev] Save skipped';
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
    // DTU-2: server now has the truth, drop the local mirror.
    _clearLocalSnapshot();
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

async function submitForm() {
  const responses = collectResponses();
  const btn = document.getElementById('dt-btn-submit');

  // Validate required fields
  const missing = [];
  for (const section of DOWNTIME_SECTIONS) {
    if (section.gate && gateValues[section.gate] !== 'yes') continue;
    for (const q of (section.questions || [])) {
      if (!q.required) continue;
      // DTR.1: highlight_slots validates to "at least one slot has content"
      if (q.type === 'highlight_slots') {
        const hasAny = [1, 2, 3, 4, 5].some(n => (responses[`${q.key}_${n}`] || '').trim());
        if (!hasAny) missing.push(q.label || q.key);
        continue;
      }
      const val = responses[q.key];
      if (!val || (typeof val === 'string' && !val.trim())) {
        missing.push(q.label || q.key);
      }
    }
  }
  // DTFP-4: feeding-method requirement dropped — pool components are the gate now
  // (the existing pool-validation logic already flags incomplete attr/skill/disc).
  // Feeding territory is required
  const territories = (() => { try { return JSON.parse(responses['feeding_territories'] || '{}'); } catch { return {}; } })();
  if (!Object.values(territories).some(v => v && v !== 'none')) missing.push('Feeding Territory');

  if (missing.length) {
    showToast(`Please complete required fields before submitting: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ` (+${missing.length - 3} more)` : ''}.`, 'error');
    return;
  }

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
    // DTU-2: submission completed, local mirror no longer needed.
    _clearLocalSnapshot();
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

export async function renderDowntimeTab(targetEl, char, territories, options = {}) {
  currentChar = char;
  if (char) applyDerivedMerits(char);
  _territories = territories || [];
  responseDoc = null;
  currentCycle = null;
  gateValues = {};

  // Load current cycle — priority: active > game > prep > closed > anything
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    const sorted = cycles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    const LIVE_STATUSES = ['active', 'game', 'prep'];
    currentCycle = sorted.find(c => LIVE_STATUSES.includes(c.status))
      || sorted.find(c => c.status === 'closed')
      || sorted[0]
      || null;
  } catch { /* no cycles */ }

  // Dev bypass: on localhost, coerce non-active cycles to 'active' for the
  // form's other status gates, but preserve the underlying cycle's data
  // (is_chapter_finale, maintenance_audit, etc.) so dev-time testing of
  // those features works. Stub fallback still applies when no cycle exists.
  if (currentCycle && currentCycle.status !== 'active' && location.hostname === 'localhost') {
    currentCycle = { ...currentCycle, status: 'active' };
  }
  if (!currentCycle && location.hostname === 'localhost') {
    currentCycle = { _id: 'dev-stub', status: 'active', label: '[Dev Preview]', feeding_rights_confirmed: true };
  }

  // DTOSL.2 legacy: kept so legacy-submission renderers on the admin side
  // don't break when viewing old cycles. The new flow (NPCR.12) does not
  // use this list.
  _linkedNpcs = [];
  if (currentChar?._id) {
    try {
      _linkedNpcs = await apiGet(`/api/npcs/for-character/${encodeURIComponent(currentChar._id)}`);
    } catch { _linkedNpcs = []; }
  }

  // NPCR.12: load this character's relationships (active + pending) for
  // the Personal Story picker. Fails silently — picker shows empty state.
  _myRelationships = [];
  if (currentChar?._id) {
    try {
      _myRelationships = await apiGet(`/api/relationships/for-character/${encodeURIComponent(currentChar._id)}`);
    } catch { _myRelationships = []; }
  }

  // Load existing submission for this character + cycle
  priorPublishedLabel = null;
  if (currentCycle) {
    try {
      const subs = await apiGet(`/api/downtime_submissions?cycle_id=${currentCycle._id}`);
      responseDoc = subs.find(s =>
        s.character_id === currentChar._id || s.character_id?.toString() === currentChar._id?.toString()
      ) || null;
      if (responseDoc) _promotePublishedOutcome(responseDoc);
    } catch { /* no submission */ }
  }

  // DTU-2: if a localStorage draft is newer than the server copy, restore
  // from it. Handles the "tab close between keystroke and 2s server save"
  // case. Never overrides a submitted doc — only pre-submit draft state.
  restoredFromLocal = false;
  if (currentChar?._id && currentCycle?._id && currentCycle._id !== 'dev-stub') {
    const local = loadLocalDraft(String(currentChar._id), String(currentCycle._id));
    if (local && (!responseDoc || responseDoc.status !== 'submitted')) {
      const picked = pickFreshestDraft(local, responseDoc);
      if (picked.from === 'local') {
        if (!responseDoc) {
          responseDoc = { responses: picked.responses };
        } else {
          responseDoc.responses = picked.responses;
        }
        restoredFromLocal = true;
      }
    }
  }

  // Check for published outcomes from previous cycles (for "results available" banner)
  if (currentCycle?.status === 'active' && !responseDoc?.published_outcome) {
    try {
      const allSubs = await apiGet('/api/downtime_submissions');
      allSubs.forEach(_promotePublishedOutcome);
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
    })).sort((a, b) => a.name.localeCompare(b.name));
    // If attendee list empty, fall back to full list
    if (!lastGameAttendees.length) {
      lastGameAttendees = others.map(c => ({ id: c._id, name: c.moniker || c.name }));
    }
  } catch { /* ignore */ }

  // Auto-detect regent status from character data
  gateValues.is_regent = findRegentTerritory(_territories, currentChar)?.territory ? 'yes' : 'no';

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

  const devPreview = location.hostname === 'localhost';

  // STs can preview the form for active or prep cycles; players only for active
  const _isST = isSTRole();
  const _formStatuses = _isST ? ['active', 'prep'] : ['active'];
  const _gateBlocks = !currentCycle || !_formStatuses.includes(currentCycle.status);

  if (options.singleColumn) {
    // Game app context: render form directly, no split, no right-panel history
    // (downtime-tab.js handles the history accordion separately)
    if (!devPreview && _gateBlocks) {
      targetEl.innerHTML = renderCycleGatePage();
    } else {
      targetEl.innerHTML = `<div id="dt-container" class="reading-pane"></div>`;
      renderForm(document.getElementById('dt-container'));
    }
    return;
  }

  // Set up two-pane layout (player portal)
  targetEl.innerHTML = `
    <div class="dt-split">
      <div class="dt-split-left" id="dt-left-pane"></div>
      <div class="dt-split-right" id="dt-right-pane"></div>
    </div>`;

  const leftEl  = document.getElementById('dt-left-pane');
  const rightEl = document.getElementById('dt-right-pane');

  // Left: form or gate message
  if (!devPreview && _gateBlocks) {
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
  const isST = isSTRole();
  const isSubmitted = status === 'submitted';

  let h = '';

  // DTU-2: show a one-shot banner when the form was restored from a local
  // draft (i.e., server copy was older than localStorage snapshot).
  if (restoredFromLocal) {
    h += `<div class="qf-results-banner qf-local-restore-banner">&#x2139; Restored unsaved edits from this browser. They will save to the server as you continue typing.</div>`;
    restoredFromLocal = false; // only show once per mount
  }

  // Status banner — results live in the Story tab, not here
  const published = responseDoc?.published_outcome;
  const pending = responseDoc && !published && status === 'submitted';
  if (published) {
    h += `<div class="qf-results-banner">&#x2713; Your results for this cycle are published &mdash; see the <strong>Story</strong> tab.</div>`;
  } else if (pending) {
    h += '<div class="qf-results-pending"><p class="qf-results-pending-msg">Your downtime submission has been received and is awaiting ST review. Results will appear here once published.</p></div>';
  } else if (!published && priorPublishedLabel) {
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
    h += `<span class="dt-badge dt-badge-on">Regent \u2014 ${esc(findRegentTerritory(_territories, currentChar)?.territory)}</span>`;
  }
  if (gateValues.has_sorcery === 'yes') {
    const traditions = [];
    if (currentChar.disciplines?.Cruac?.dots) traditions.push('Cruac');
    if (currentChar.disciplines?.Theban?.dots) traditions.push('Theban');
    h += `<span class="dt-badge dt-badge-on">${traditions.join(' / ')}</span>`;
  }
  const bp = currentChar.blood_potency || 0;
  if (bp) h += `<span class="dt-badge dt-badge-info">BP ${bp}</span>`;
  h += '</div>';
  h += '</div>';

  // Static sections: Court only — territory/feeding/regency rendered explicitly below in game-logic order
  // RFR.3: territory + feeding sections render regardless of cycle's
  // feeding_rights_confirmed state. Regents manage feeding_rights on the
  // Regency tab; players are never blocked from filing downtime.
  for (const section of DOWNTIME_SECTIONS) {
    if (section.key === 'projects') continue;
    if (section.key === 'acquisitions') continue;
    if (section.key === 'blood_sorcery') continue;
    if (section.key === 'equipment') continue;
    if (section.key === 'vamping') continue;
    if (section.key === 'admin') continue;
    if (section.key === 'territory') continue;
    if (section.key === 'feeding') continue;
    if (section.key === 'regency') continue;
    if (section.key === 'personal_story') continue; // rendered explicitly below

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

  // ── Personal Story — NPC interaction ──
  h += renderPersonalStorySection(saved);

  // ── Blood Sorcery before Territory/Feeding — rites can affect hunt pool ──
  if (gateValues.has_sorcery === 'yes') {
    h += renderSorcerySection(saved);
  }

  // ── Territory then Feeding — players see ambience/cap before choosing hunt method ──
  for (const key of ['territory', 'feeding']) {
    const section = DOWNTIME_SECTIONS.find(s => s.key === key);
    if (!section) continue;
    h += `<div class="qf-section collapsed" data-gate-section="" data-section-key="${key}">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
    h += '<div class="qf-section-body">';
    if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    for (const q of section.questions) h += renderQuestion(q, saved[q.key] || '');
    h += '</div></div>';
  }

  // ── Projects section with dynamic slots ──
  h += renderProjectSlots(saved);

  // ── Dynamic merit sections ──
  h += renderMeritToggles(saved);

  // ── Acquisitions (custom render) ──
  h += renderAcquisitionsSection(saved);

  // ── Equipment (dynamic rows) ──
  h += renderEquipmentSection(saved);

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
    if (key === 'vamping' && gateValues.is_regent === 'yes') {
      const terrName = findRegentTerritory(_territories, currentChar)?.territory || 'your territory';
      h += `<div class="qf-field dt-regency-sub">`;
      h += `<label class="qf-label">As Regent of ${esc(terrName)}: what do you want to make known about your domain this month?</label>`;
      h += `<p class="qf-desc">Proclamations, policies, enforcement, or any public stance you wish to communicate to other Kindred about your territory.</p>`;
      h += `<textarea id="dt-regency_action" class="qf-textarea" rows="4">${esc(saved['regency_action'] || '')}</textarea>`;
      h += `</div>`;
    }
    h += '</div></div>';
  }

  // Hide feedback textarea until a rating is provided
  if (!saved['form_rating']) {
    h = h.replace('dt-feedback-field', 'dt-feedback-field dt-feedback-hidden');
  }

  // Actions
  const submitLabel = responseDoc?.status === 'submitted' ? 'Update Submission' : 'Submit Downtime';
  h += '<div class="qf-actions">';
  h += '<button class="qf-btn qf-btn-save" id="dt-btn-save">Save Draft</button>';
  h += `<button class="qf-btn qf-btn-submit" id="dt-btn-submit">${esc(submitLabel)}</button>`;
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
    if (s && s[`project_${feedRoteSlot}_action`] !== 'feed') {
      s[`project_${feedRoteSlot}_action`] = 'feed';
    }
  }

  // Wire events — skip if already wired (prevent listener stacking on re-render)
  if (container._dtWired) return;
  container._dtWired = true;

  // Section collapse/expand toggle
  container.addEventListener('click', (e) => {
    // DTOSL.2 choice chip handler — removed in NPCR.12 (replaced by the
    // single relationships picker in renderPersonalStorySection).

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
    const acqUnknown = e.target.closest('[data-acq-unknown]') || e.target.closest('[data-skill-acq-unknown]');
    if (acqUnknown) {
      const isSkill = !!acqUnknown.dataset.skillAcqUnknown;
      const input = document.getElementById(isSkill ? 'dt-skill_acq_availability' : 'dt-acq_availability');
      if (input) input.value = 'unknown';
      const row = acqUnknown.closest(isSkill ? '[data-skill-acq-avail]' : '[data-acq-avail]');
      if (row) {
        const dotAttr = isSkill ? 'data-skill-acq-dot' : 'data-acq-dot';
        row.querySelectorAll(`[${dotAttr}]`).forEach(d => d.classList.remove('dt-acq-dot-filled'));
        acqUnknown.classList.add('dt-acq-dot-filled');
        const lbl = row.querySelector('.dt-acq-avail-label');
        if (lbl) lbl.textContent = '';
      }
      scheduleSave();
      updateSectionTicks(container);
      return;
    }
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
        row.querySelectorAll('[data-acq-unknown],[data-skill-acq-unknown]').forEach(u => u.classList.remove('dt-acq-dot-filled'));
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
    // Status tab switching
    const statusTab = e.target.closest('[data-status-tab]');
    if (statusTab) {
      const n = parseInt(statusTab.dataset.statusTab, 10);
      container.querySelectorAll('[data-status-tab]').forEach(t =>
        t.classList.toggle('dt-proj-tab-active', parseInt(t.dataset.statusTab, 10) === n)
      );
      container.querySelectorAll('[data-status-pane]').forEach(p =>
        p.classList.toggle('dt-proj-pane-hidden', parseInt(p.dataset.statusPane, 10) !== n)
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

    // DTR.1: reveal the next highlight slot when the current one gets content.
    const hl = e.target.closest('.dt-highlight-input');
    if (hl) {
      const hasText = hl.value.trim().length > 0;
      const n = Number(hl.dataset.highlightN);
      if (hasText && n >= 3 && n < 5) {
        const next = container.querySelector(`.dt-highlight-slot[data-highlight-n="${n + 1}"]`);
        if (next && next.style.display === 'none') next.style.display = '';
      }
    }

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
    // NPCR.12/13: relationship picker change — swap the kind-driven label
    // and placeholder in place, preserving whatever the player has typed.
    if (e.target.id === 'dt-story_moment_relationship_id') {
      const relId = e.target.value;
      const edge = (_myRelationships || []).find(r => String(r._id) === String(relId));
      const prompt = edge
        ? promptForKind(edge.kind, edge.custom_label)
        : promptForKind('_default', null);
      const label = document.getElementById('dt-story_moment_note_label');
      const note  = document.getElementById('dt-story_moment_note');
      if (label) label.textContent = prompt.label;
      if (note)  note.setAttribute('placeholder', prompt.placeholder);
      scheduleSave();
      return;
    }

    // Personal story free-text NPC name — sync to hidden fields and deselect cards
    if (e.target.id === 'dt-personal_story_npc_name_free') {
      const val    = e.target.value.trim();
      const idEl   = document.getElementById('dt-personal_story_npc_id');
      const nameEl = document.getElementById('dt-personal_story_npc_name');
      if (idEl)   idEl.value   = val ? '__new__' : '';
      if (nameEl) nameEl.value = val;
      if (val) container.querySelectorAll('[data-npc-pick]').forEach(c => c.classList.remove('dt-npc-card-selected'));
      scheduleSave();
      return;
    }
    // Rote feeding checkbox
    if (e.target.id === 'dt-feed-rote') {
      feedRoteAction = e.target.checked;
      applyRoteToProjectSlot(container);
      return;
    }
    if (['dt-rote-disc', 'dt-rote-custom-attr', 'dt-rote-custom-skill'].includes(e.target.id)) {
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Territory radio change — re-render to update vitae projection (legacy path, kept for safety)
    if (e.target.closest('[data-feed-terr]')) {
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
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
    // XP category picker — re-render to show item dropdown
    if (e.target.closest('[data-xp-pick-cat]') || e.target.closest('[data-xp-pick-item]')) {
      const slotEl = e.target.closest('[data-xp-pick-cat]') || e.target.closest('[data-xp-pick-item]');
      activeProjectTab = parseInt(slotEl.dataset.xpPickCat || slotEl.dataset.xpPickItem, 10);
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
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
    // Status action change — re-render for action-specific fields
    const statusAction = e.target.closest('[data-status-action]');
    if (statusAction) {
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Flex target type radio — re-render to show correct input
    const flexType = e.target.closest('[data-flex-type]');
    if (flexType) {
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
    // Shoutout picks — enforce 3-selection limit on checkbox grid
    const shoutoutCb = e.target.closest('.dt-shoutout-cb');
    if (shoutoutCb) {
      const allCbs = container.querySelectorAll('.dt-shoutout-cb');
      const checkedCount = container.querySelectorAll('.dt-shoutout-cb:checked').length;
      const atLimit = checkedCount >= 3;
      allCbs.forEach(cb => {
        if (!cb.checked) cb.disabled = atLimit;
      });
      // Update limit hint
      const limitMsg = container.querySelector('.dt-shoutout-limit');
      if (atLimit && !limitMsg) {
        const grid = container.querySelector('.dt-shoutout-grid');
        if (grid) {
          const msg = document.createElement('p');
          msg.className = 'dt-shoutout-limit';
          msg.textContent = '3 selections made \u2014 uncheck one to change.';
          grid.insertAdjacentElement('afterend', msg);
        }
      } else if (!atLimit && limitMsg) {
        limitMsg.remove();
      }
      scheduleSave();
      return;
    }
    // Main feed pool selector changes
    const feedPoolSel = e.target.closest('#dt-feed-custom-attr, #dt-feed-custom-skill, #dt-feed-disc');
    if (feedPoolSel) {
      const prevSkill = feedCustomSkill;
      feedCustomAttr = document.getElementById('dt-feed-custom-attr')?.value || feedCustomAttr;
      feedCustomSkill = document.getElementById('dt-feed-custom-skill')?.value || feedCustomSkill;
      feedDiscName = document.getElementById('dt-feed-disc')?.value || feedDiscName;
      if (feedCustomSkill !== prevSkill) feedSpecName = '';
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
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
    // DTFP-5: Kiss / Violent toggle
    const viBtn = e.target.closest('[data-feed-violence]');
    if (viBtn) {
      if (!responseDoc) responseDoc = { responses: {} };
      if (!responseDoc.responses) responseDoc.responses = {};
      responseDoc.responses.feed_violence = viBtn.dataset.feedViolence;
      renderForm(container);
      scheduleSave();
      return;
    }
    // NPC card selection
    const npcCard = e.target.closest('[data-npc-pick]');
    if (npcCard) {
      const id   = npcCard.dataset.npcPick;
      const name = npcCard.dataset.npcName || '';
      const idEl   = document.getElementById('dt-personal_story_npc_id');
      const nameEl = document.getElementById('dt-personal_story_npc_name');
      if (idEl)   idEl.value   = id;
      if (nameEl) nameEl.value = name;
      container.querySelectorAll('[data-npc-pick]').forEach(c =>
        c.classList.toggle('dt-npc-card-selected', c.dataset.npcPick === id)
      );
      // Clear free-text field when a card is picked
      const freeEl = document.getElementById('dt-personal_story_npc_name_free');
      if (freeEl) freeEl.value = '';
      scheduleSave();
      updateSectionTicks(container);
      return;
    }
    // Single-select territory pills
    const terrPill = e.target.closest('[data-terr-single][data-terr-val]');
    if (terrPill) {
      const fieldId = terrPill.dataset.terrSingle;
      const val = terrPill.dataset.terrVal;
      const hidden = document.getElementById(fieldId);
      const currentVal = hidden ? hidden.value : '';
      const newVal = currentVal === val ? '' : val; // toggle off if same
      if (hidden) hidden.value = newVal;
      // Update pill active states without full re-render
      container.querySelectorAll(`[data-terr-single="${fieldId}"]`).forEach(p => {
        p.classList.toggle('dt-terr-pill-on', p.dataset.terrVal === newVal);
      });
      scheduleSave();
      updateSectionTicks(container);
      return;
    }
    // Multi-select feeding territory pills
    const feedTerrPill = e.target.closest('[data-feed-terr-key]');
    if (feedTerrPill) {
      const terrKey = feedTerrPill.dataset.feedTerrKey;
      const statusVal = feedTerrPill.dataset.feedStatus;
      const isActive = feedTerrPill.dataset.feedActive === '1';
      const hidden = document.getElementById(`feed-val-${terrKey}`);
      if (hidden) hidden.value = isActive ? 'none' : statusVal;
      // Re-render to update pill appearance and vitae projection
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Feed suggestion chips (quick-fill attr or skill)
    const feedChipAttr = e.target.closest('[data-feed-chip-attr]');
    if (feedChipAttr) {
      feedCustomAttr = feedChipAttr.dataset.feedChipAttr;
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    const feedChipSkill = e.target.closest('[data-feed-chip-skill]');
    if (feedChipSkill) {
      feedCustomSkill = feedChipSkill.dataset.feedChipSkill;
      feedSpecName = '';
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Rote suggestion chips
    const feedChipDisc = e.target.closest('[data-feed-chip-disc]');
    if (feedChipDisc) {
      feedDiscName = feedChipDisc.dataset.feedChipDisc;
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    const roteChipDisc = e.target.closest('[data-rote-chip-disc]');
    if (roteChipDisc) {
      feedRoteDisc = roteChipDisc.dataset.roteChipDisc;
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    const roteChipAttr = e.target.closest('[data-rote-chip-attr]');
    if (roteChipAttr) {
      feedRoteCustomAttr = roteChipAttr.dataset.roteChipAttr;
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    const roteChipSkill = e.target.closest('[data-rote-chip-skill]');
    if (roteChipSkill) {
      feedRoteCustomSkill = roteChipSkill.dataset.roteChipSkill;
      feedRoteSpec = '';
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Feeding spec chips
    const specChip = e.target.closest('[data-feed-spec]');
    if (specChip) {
      if (specChip.dataset.roteSpec !== undefined) {
        feedRoteSpec = feedRoteSpec === specChip.dataset.feedSpec ? '' : specChip.dataset.feedSpec;
      } else {
        feedSpecName = feedSpecName === specChip.dataset.feedSpec ? '' : specChip.dataset.feedSpec;
      }
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Mandragora Garden checkbox — re-render to show/hide "already paid" sub-checkbox
    const mandCb = e.target.closest('.dt-mand-cb[id$="_mandragora"]');
    if (mandCb) {
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Add Rite button
    if (e.target.closest('#dt-add-rite')) {
      const responses = collectResponses();
      const countEl = document.getElementById('dt-sorcery-slot-count');
      const current = countEl ? parseInt(countEl.value, 10) || 1 : 1;
      responses['sorcery_slot_count'] = String(current + 1);
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Remove Rite button
    const removeRiteBtn = e.target.closest('[data-remove-rite]');
    if (removeRiteBtn) {
      const removeN = parseInt(removeRiteBtn.dataset.removeRite, 10);
      const responses = collectResponses();
      const countEl = document.getElementById('dt-sorcery-slot-count');
      const current = countEl ? parseInt(countEl.value, 10) || 1 : 1;
      // Shift slots down
      for (let n = removeN; n < current; n++) {
        responses[`sorcery_${n}_rite`] = responses[`sorcery_${n + 1}_rite`] || '';
        responses[`sorcery_${n}_targets`] = responses[`sorcery_${n + 1}_targets`] || '';
        responses[`sorcery_${n}_notes`] = responses[`sorcery_${n + 1}_notes`] || '';
        responses[`sorcery_${n}_mandragora`] = responses[`sorcery_${n + 1}_mandragora`] || 'no';
        responses[`sorcery_${n}_mand_paid`] = responses[`sorcery_${n + 1}_mand_paid`] || 'no';
      }
      // Clear last slot
      delete responses[`sorcery_${current}_rite`];
      delete responses[`sorcery_${current}_targets`];
      delete responses[`sorcery_${current}_notes`];
      delete responses[`sorcery_${current}_mandragora`];
      delete responses[`sorcery_${current}_mand_paid`];
      responses['sorcery_slot_count'] = String(Math.max(1, current - 1));
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Add Equipment button
    if (e.target.closest('#dt-add-equipment')) {
      const responses = collectResponses();
      const countEl = document.getElementById('dt-equipment-slot-count');
      const current = countEl ? parseInt(countEl.value, 10) || 1 : 1;
      responses['equipment_slot_count'] = String(current + 1);
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Remove Equipment button
    const removeEquipBtn = e.target.closest('[data-remove-equipment]');
    if (removeEquipBtn) {
      const removeN = parseInt(removeEquipBtn.dataset.removeEquipment, 10);
      const responses = collectResponses();
      const countEl = document.getElementById('dt-equipment-slot-count');
      const current = countEl ? parseInt(countEl.value, 10) || 1 : 1;
      // Shift slots down
      for (let n = removeN; n < current; n++) {
        responses[`equipment_${n}_name`] = responses[`equipment_${n + 1}_name`] || '';
        responses[`equipment_${n}_qty`] = responses[`equipment_${n + 1}_qty`] || '1';
        responses[`equipment_${n}_notes`] = responses[`equipment_${n + 1}_notes`] || '';
      }
      // Clear last slot
      delete responses[`equipment_${current}_name`];
      delete responses[`equipment_${current}_qty`];
      delete responses[`equipment_${current}_notes`];
      responses['equipment_slot_count'] = String(Math.max(1, current - 1));
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

    // Sync ambience-direction labels around the stepper (DTFP-1).
    // Both label spans are always in the DOM; just update text so the
    // stepper column doesn't shift horizontally between rows.
    const controlEl = valEl.closest('.dt-influence-control');
    if (controlEl) {
      const leftEl  = controlEl.querySelector('.dt-influence-label-left');
      const rightEl = controlEl.querySelector('.dt-influence-label-right');
      if (leftEl)  leftEl.textContent  = newVal < 0 ? 'decreasing ambience' : '';
      if (rightEl) rightEl.textContent = newVal > 0 ? 'increasing ambience' : '';
    }

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
  let h = '<div class="plm-overlay" id="dt-cast-overlay">';
  h += '<div class="plm-dialog dt-cast-modal">';
  h += '<div class="plm-header">';
  const modalTitle = typeof slotId === 'number' || /^\d+$/.test(slotId)
    ? `Select Characters — Action ${slotId}`
    : `Select Characters — Sphere ${slotId.replace('sphere_', '')}`;
  h += `<h3>${modalTitle}</h3>`;
  h += '<button type="button" class="cd-close" id="dt-cast-close">\u00D7</button>';
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
    h += `<div class="dt-cast-charname">${esc(redactCharName(c.name))}</div>`;
    if (c.player) h += `<div class="dt-cast-player">${esc(redactPlayer(c.player))}</div>`;
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

function applyRoteToProjectSlot(container) {
  const responses = collectResponses();
  if (feedRoteAction && feedMethodId) {
    // Auto-find first available slot
    feedRoteSlot = [1,2,3,4].find(n => {
      const act = responses[`project_${n}_action`];
      return !act || act === 'feed';
    }) || 1;
    responses[`project_${feedRoteSlot}_action`] = 'feed';
    responses['_feed_rote_slot'] = String(feedRoteSlot);
    activeProjectTab = feedRoteSlot;
  } else {
    // Clear all feed slots
    for (let n = 1; n <= 4; n++) {
      if (responses[`project_${n}_action`] === 'feed') {
        responses[`project_${n}_action`] = '';
        responses[`project_${n}_description`] = '';
      }
    }
  }
  if (responseDoc) responseDoc.responses = responses;
  else responseDoc = { responses };
  renderForm(container);
  scheduleSave();
}

// ── Project slots (tabbed UI) ──

// CHM-3: chapter-finale at-risk reminder for PT/MCI standing merits.
// Renders zero, one, or two warning strips at the top of the Personal
// Projects section. Gated on cycle.is_chapter_finale === true; cleared
// per-merit by the ST ticking the matching box on CHM-2's audit panel
// (cycle.maintenance_audit[char_id].{pt,mci}). MAINTENANCE_MERITS is
// the source of truth for the gate set; PT and MCI need different
// strawman copy so they're branched explicitly here.
function maintenanceWarningHtml(meritName, cultNames) {
  const label = cultNames && cultNames.length
    ? `${meritName} (${cultNames.join(', ')})`
    : meritName;
  return `<div class="dt-maintenance-warning">`
    + `<strong>Maintenance reminder.</strong> `
    + `Your <strong>${esc(label)}</strong> has not been logged as maintained this chapter. `
    + `This is the last cycle of the chapter, so use one of your projects below to maintain it, or it will lapse.`
    + `</div>`;
}

function renderMaintenanceWarnings(char, cycle) {
  if (!cycle || cycle.is_chapter_finale !== true) return '';
  if (!char) return '';
  const audit = cycle.maintenance_audit?.[String(char._id)] || {};
  const merits = char.merits || [];
  const out = [];

  const hasPT = merits.some(m => m.name === 'Professional Training');
  if (hasPT && audit.pt !== true) {
    out.push(maintenanceWarningHtml('Professional Training', null));
  }

  const mciMerits = merits.filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false);
  if (mciMerits.length && audit.mci !== true) {
    const cults = mciMerits.map(m => m.cult_name).filter(Boolean);
    out.push(maintenanceWarningHtml('Mystery Cult Initiation', cults));
  }

  return out.join('');
}

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
    (currentChar.disciplines[d]?.dots || 0) > 0
  );

  // Character merits for the merit picker and own-merit target
  const charMerits = (currentChar.merits || []).filter(m =>
    m.category === 'general' || m.category === 'influence' || m.category === 'standing'
  );

  const hasMaintenance = (currentChar.merits || []).some(m =>
    MAINTENANCE_MERITS.includes(m.name)
  );
  const availableActions = PROJECT_ACTIONS.filter(opt =>
    opt.value !== 'maintenance' || hasMaintenance
  );

  let h = '<div class="qf-section collapsed" data-section-key="projects">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
  h += '<div class="qf-section-body">';
  h += renderMaintenanceWarnings(currentChar, currentCycle);
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

    // ── Rote-locked slot ──
    const isRoteLocked = feedRoteAction && n === feedRoteSlot;
    if (isRoteLocked) {
      const roteDesc = saved[`project_${n}_description`] || '';
      h += '<div class="dt-proj-rote-locked">';
      h += '<span class="dt-proj-rote-badge">Committed to Feeding (Rote)</span>';
      if (roteDesc) h += `<p class="dt-proj-rote-desc">${esc(roteDesc)}</p>`;
      h += '</div>';
      h += `<input type="hidden" id="dt-project_${n}_action" value="feed">`;
      h += '</div>';
      continue;
    }

    // Action type selector — always visible
    h += '<div class="qf-field">';
    h += `<label class="qf-label" for="dt-project_${n}_action">Action Type ${n === 1 ? '<span class="qf-req">*</span>' : ''}</label>`;
    h += `<select id="dt-project_${n}_action" class="qf-select" data-project-action="${n}">`;
    for (const opt of availableActions) {
      const sel = actionVal === opt.value ? ' selected' : '';
      h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
    }
    h += '</select></div>';

    // ── XP Spend picker (structured) ──
    if (fields.includes('xp_picker')) {
      const savedCat  = saved[`project_${n}_xp_category`] || '';
      const savedItem = saved[`project_${n}_xp_item`] || '';
      const budget = xpLeft(currentChar);

      // Deduct already-committed project XP from other slots
      let committed = 0;
      for (let s = 1; s <= 4; s++) {
        if (s === n) continue;
        if (saved[`project_${s}_action`] === 'xp_spend') {
          const cat = saved[`project_${s}_xp_category`];
          const item = saved[`project_${s}_xp_item`];
          if (cat && item) committed += getRowCost({ category: cat, item, dotsBuying: 1 });
        }
      }
      const remaining = budget - committed;

      h += '<div class="dt-xp-picker">';
      h += '<p class="qf-desc">Select one trait to purchase. 1 dot per project action committed.</p>';
      h += `<div class="dt-xp-picker-budget ${remaining < 0 ? 'dt-influence-over' : ''}">`;
      h += `${remaining} / ${budget} XP available</div>`;

      // Category dropdown (merits excluded — use Admin section for free merits)
      h += `<div class="dt-xp-picker-row">`;
      h += `<select id="dt-project_${n}_xp_category" class="qf-select dt-xp-pick-cat" data-xp-pick-cat="${n}">`;
      h += '<option value="">\u2014 Category \u2014</option>';
      for (const opt of XP_CATEGORIES.filter(o => o.value && o.value !== 'merit')) {
        h += `<option value="${esc(opt.value)}"${savedCat === opt.value ? ' selected' : ''}>${esc(opt.label)}</option>`;
      }
      h += '</select>';

      if (savedCat) {
        const items = getItemsForCategory(savedCat);
        h += `<select id="dt-project_${n}_xp_item" class="qf-select dt-xp-pick-item" data-xp-pick-item="${n}">`;
        h += '<option value="">\u2014 Item \u2014</option>';
        for (const item of items) {
          h += `<option value="${esc(item.value)}"${savedItem === item.value ? ' selected' : ''}>${esc(item.label)}</option>`;
        }
        h += '</select>';
      }

      if (savedCat && savedItem) {
        const cost = getRowCost({ category: savedCat, item: savedItem, dotsBuying: 1 });
        const insufficient = cost > remaining;
        h += `<span class="dt-xp-cost${insufficient ? ' dt-vitae-over' : ''}">${cost} XP${insufficient ? ' \u2014 Insufficient XP' : ''}</span>`;
      }
      h += '</div>';

      h += renderQuestion({
        key: `project_${n}_xp_trait`, label: 'In-character justification',
        type: 'textarea', required: false,
        desc: 'Describe the activity or events that justify this growth.',
      }, saved[`project_${n}_xp_trait`] || '');

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
      h += '<label class="qf-label">Territory</label>';
      h += renderTerritoryPills(`dt-project_${n}_territory`, savedTerr);
      h += '</div>';
    }

    // ── Target: character (attack) — checkbox grid ──
    if (fields.includes('target_char')) {
      let targetPicks = [];
      try { targetPicks = JSON.parse(saved[`project_${n}_target_value`] || '[]'); } catch {
        // legacy single ID
        if (saved[`project_${n}_target_value`]) targetPicks = [saved[`project_${n}_target_value`]];
      }
      const targetSet = new Set(targetPicks.map(String));
      h += '<div class="qf-field">';
      h += '<label class="qf-label">Target Character(s)</label>';
      h += `<div class="dt-shoutout-grid">`;
      for (const c of allCharacters) {
        const isChecked = targetSet.has(String(c.id));
        const isAtt = lastGameAttendees.some(a => String(a.id) === String(c.id));
        h += `<label class="dt-shoutout-item${isAtt ? ' dt-shoutout-att' : ''}">`;
        h += `<input type="checkbox" class="dt-target-char-cb" data-target-slot="${n}" value="${esc(String(c.id))}"${isChecked ? ' checked' : ''}>`;
        h += `<span>${esc(c.name)}</span>`;
        h += '</label>';
      }
      h += '</div></div>';
    }

    // ── Target: own merit (hide_protect) ──
    if (fields.includes('target_own_merit')) {
      const savedVal = saved[`project_${n}_target_value`] || '';
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-project_${n}_target_value">What are you protecting?</label>`;
      h += `<select id="dt-project_${n}_target_value" class="qf-select">`;
      h += '<option value="">— Select Merit / Asset —</option>';
      for (const m of charMerits) {
        const mLabel = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
        const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
        const sel = mKey === savedVal ? ' selected' : '';
        h += `<option value="${esc(mKey)}"${sel}>${esc(mLabel)}</option>`;
      }
      h += '</select></div>';
    }

    // ── Target: flex (investigate) ──
    if (fields.includes('target_flex')) {
      const savedType = saved[`project_${n}_target_type`] || '';
      const savedVal = saved[`project_${n}_target_value`] || '';
      h += '<div class="qf-field dt-target-flex">';
      h += `<label class="qf-label">What are you investigating?</label>`;
      h += `<div class="dt-target-flex-radios">`;
      for (const opt of [['character', 'Character'], ['territory', 'Territory'], ['other', 'Other']]) {
        const chk = savedType === opt[0] ? ' checked' : '';
        h += `<label class="dt-flex-radio-label"><input type="radio" name="dt-project_${n}_target_type" value="${opt[0]}"${chk} data-flex-type="project_${n}"> ${opt[1]}</label>`;
      }
      h += '</div>';
      if (savedType === 'character') {
        h += `<select id="dt-project_${n}_target_value" class="qf-select dt-flex-char-sel">`;
        h += '<option value="">— Select Character —</option>';
        for (const c of allCharacters) {
          const sel = String(c.id) === String(savedVal) ? ' selected' : '';
          h += `<option value="${esc(String(c.id))}"${sel}>${esc(c.name)}</option>`;
        }
        h += '</select>';
      } else if (savedType === 'territory') {
        h += renderTerritoryPills(`dt-project_${n}_target_value`, savedVal);
      } else if (savedType === 'other') {
        h += `<input type="text" id="dt-project_${n}_target_value" class="qf-input" value="${esc(savedVal)}" placeholder="Describe what you are investigating">`;
      }
      h += '</div>';
    }

    // ── Investigate lead (mandatory for investigate) ──
    if (fields.includes('investigate_lead')) {
      h += renderQuestion({
        key: `project_${n}_investigate_lead`, label: 'What is your lead on this investigation? \u2731',
        type: 'textarea', required: true,
        desc: 'Provide a specific starting point, source, or known fact. Investigations without a lead cannot proceed.',
      }, saved[`project_${n}_investigate_lead`] || '');
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

    // ── Cast (other characters involved) — inline checkbox grid ──
    if (fields.includes('cast')) {
      let castPicks = [];
      try { castPicks = JSON.parse(saved[`project_${n}_cast`] || '[]'); } catch { /* ignore */ }
      const castSet = new Set(castPicks.map(String));
      h += '<div class="qf-field">';
      h += '<label class="qf-label">Characters Involved</label>';
      h += '<p class="qf-desc">Tick any characters your character collaborates with on this action. Attendees from last game are highlighted.</p>';
      h += `<div class="dt-shoutout-grid">`;
      for (const c of allCharacters) {
        const isChecked = castSet.has(String(c.id));
        const isAtt = lastGameAttendees.some(a => String(a.id) === String(c.id));
        h += `<label class="dt-shoutout-item${isAtt ? ' dt-shoutout-att' : ''}">`;
        h += `<input type="checkbox" class="dt-cast-proj-cb" data-cast-slot="${n}" value="${esc(String(c.id))}"${isChecked ? ' checked' : ''}>`;
        h += `<span>${esc(c.name)}</span>`;
        h += '</label>';
      }
      h += '</div></div>';
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
  const savedAttr  = saved[`${prefix}_attr`]  || '';
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
    total += currentChar.disciplines?.[savedDisc]?.dots || 0;
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
    const dots = currentChar.disciplines[d]?.dots || 0;
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
      // Try rules cache first
      const slug = 'devotion-' + item.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const rule = getRuleByKey(slug);
      return rule ? (rule.xp_fixed || 2) : 2;
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
        const dots = c.disciplines?.[d]?.dots || 0;
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

      // Try rules cache first, fallback to MERITS_DB
      const meritRules = getRulesByCategory('merit');
      if (meritRules.length) {
        for (const rule of meritRules) {
          if (rule.parent && (rule.parent === 'Invictus Oath' || rule.parent === 'Carthian Law')) continue;
          if (!meetsPrereq(c, rule.prereq)) continue;
          const name = rule.name;
          const rr = rule.rating_range;
          const min = rr ? rr[0] : 1;
          const max = rr ? rr[1] : 1;
          const currentDots = currentMeritDots(name);
          if (currentDots >= max) continue;

          if (min === max) {
            items.push({
              value: `${name}|flat|${max}|0`,
              label: `${name} (${max} dots, ${max} XP) — all at once`,
            });
          } else {
            const maxTarget = currentDots < 3
              ? Math.min(3, max)
              : Math.min(currentDots + 1, max);
            items.push({
              value: `${name}|grad|${currentDots}|${maxTarget}`,
              label: `${name} (currently ${currentDots} dot${currentDots !== 1 ? 's' : ''})`,
            });
          }
        }
      }
      items.sort((a, b) => a.label.localeCompare(b.label));
      return items;
    }
    case 'devotion': {
      const discs = c.disciplines || {};
      // Try rules cache first
      const devRules = getRulesByCategory('devotion');
      return devRules
        .filter(rule => {
          if (rule.bloodline && rule.bloodline !== c.bloodline) return false;
          if (!rule.prereq) return true;
          return meetsPrereq(c, rule.prereq);
        })
        .map(rule => ({ value: rule.name, label: `${rule.name} (${rule.xp_fixed || '?'} XP)` }));
    }
    case 'rite': {
      // Rites they could learn at their current Cruac/Theban level
      const cruacLevel = c.disciplines?.Cruac?.dots || 0;
      const thebanLevel = c.disciplines?.Theban?.dots || 0;
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

// NPCR.12: Personal Story: Off-Screen Life — relationships-driven picker.
// Retires the DTOSL.2/.4 three-way choice. The picker shows a single list of
// the character's active relationships (grouped by kind family); selecting
// one stores its _id as responses.story_moment_relationship_id. The
// follow-up textarea is kind-driven via kind-prompts.js (NPCR.13).

function renderPersonalStorySection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'personal_story');
  if (!section) return '';

  // Back-compat read: new submissions use story_moment_relationship_id;
  // legacy submissions seeded the note into osl_moment / personal_story_note /
  // correspondence. The direction radio used personal_story_direction.
  const savedRelId = saved['story_moment_relationship_id'] || '';
  const savedNote  = saved['story_moment_note']
                   || saved['osl_moment']
                   || saved['personal_story_note']
                   || saved['correspondence']
                   || '';
  // NPCR.12 r3: personal_story_direction no longer read — Story direction radios removed.

  // Only active edges are pickable. _myRelationships was loaded in
  // renderDowntimeTab from /api/relationships/for-character/:id.
  const activeEdges = (_myRelationships || []).filter(e => e.status === 'active');

  // Resolve the selected edge (if still active) to drive the prompt copy.
  const selectedEdge = activeEdges.find(e => String(e._id) === String(savedRelId)) || null;
  const prompt = selectedEdge
    ? promptForKind(selectedEdge.kind, selectedEdge.custom_label)
    : promptForKind('_default', null);

  let h = '<div class="qf-section collapsed" data-section-key="personal_story">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
  h += '<div class="qf-section-body">';
  h += '<p class="qf-section-intro">Pick a relationship to focus this cycle’s off-screen moment. Don’t have one yet? Visit the Relationships tab to add one, or submit without a story moment.</p>';

  // Picker: grouped by kind family via <optgroup>.
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Who is this moment about?</label>';
  if (activeEdges.length === 0) {
    h += '<p class="dt-osl-empty">You have no active relationships yet. Visit the Relationships tab to create one, or submit this downtime without a story moment.</p>';
    h += '<input type="hidden" id="dt-story_moment_relationship_id" value="">';
  } else {
    // Group by kind family, sort entries by other-endpoint name within family.
    const byFamily = Object.fromEntries(FAMILIES.map(f => [f, []]));
    for (const e of activeEdges) {
      const k = kindByCode(e.kind);
      const fam = k?.family || 'Other';
      byFamily[fam].push(e);
    }
    for (const fam of FAMILIES) {
      byFamily[fam].sort((a, b) => String(a._other_name || '').localeCompare(String(b._other_name || ''), undefined, { sensitivity: 'base' }));
    }

    h += '<select id="dt-story_moment_relationship_id" class="qf-select">';
    h += '<option value="">— None (no story moment this cycle) —</option>';
    for (const fam of FAMILIES) {
      const bucket = byFamily[fam];
      if (bucket.length === 0) continue;
      h += `<optgroup label="${esc(fam)}">`;
      for (const e of bucket) {
        const k = kindByCode(e.kind);
        const kindLabel = k?.label || e.kind;
        const custom = e.kind === 'other' && e.custom_label ? ` (${esc(e.custom_label)})` : '';
        const name = e._other_name || '(unknown)';
        const sel = String(savedRelId) === String(e._id) ? ' selected' : '';
        h += `<option value="${esc(String(e._id))}"${sel}>${esc(name)} · ${esc(kindLabel)}${custom}</option>`;
      }
      h += '</optgroup>';
    }
    h += '</select>';
  }
  h += '</div>';

  // Kind-driven prompt (NPCR.13).
  h += '<div class="qf-field" style="margin-top:12px;">';
  h += `<label class="qf-label" id="dt-story_moment_note_label">${esc(prompt.label)}</label>`;
  h += `<textarea id="dt-story_moment_note" class="qf-textarea" rows="4" placeholder="${esc(prompt.placeholder)}">${esc(savedNote)}</textarea>`;
  h += '</div>';

  // NPCR.12 r3: Story direction radios retired — subsumed by the NPCs tab
  // (players flag NPCs for review via NPCR.11, edit their own edges via
  // NPCR.9, or propose direction shifts by editing edge state text).

  h += '</div></div>';
  return h;
}

// ── Legacy renderer (kept for diff isolation — unused after DTOSL.2) ──
function _legacyRenderPersonalStorySection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'personal_story');
  if (!section) return '';

  const availableNpcs = (currentChar?.npcs || []).filter(n => n.available !== false);
  const savedNpcId    = saved['personal_story_npc_id']    || '';
  const savedNpcName  = saved['personal_story_npc_name']  || '';
  const savedNote     = saved['personal_story_note']       || '';
  const savedDir      = saved['personal_story_direction']  || 'continue';

  let h = '<div class="qf-section collapsed" data-section-key="personal_story">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
  h += '<div class="qf-section-body">';
  h += '<p class="qf-section-intro">Who does your character spend time with this month? Choose someone from your life, or introduce someone new.</p>';

  if (availableNpcs.length) {
    // NPC card picker
    h += '<div class="dt-npc-cards">';
    for (const npc of availableNpcs) {
      const isSelected = savedNpcId === npc.id;
      h += `<div class="dt-npc-card${isSelected ? ' dt-npc-card-selected' : ''}" data-npc-pick="${esc(npc.id)}" data-npc-name="${esc(npc.name)}">`;
      h += `<div class="dt-npc-card-name">${esc(npc.name)}</div>`;
      if (npc.relationship_type) h += `<div class="dt-npc-card-rel">${esc(npc.relationship_type)}</div>`;
      if (npc.location_context)  h += `<div class="dt-npc-card-loc">${esc(npc.location_context)}</div>`;
      h += '</div>';
    }
    h += '</div>';
    h += `<input type="hidden" id="dt-personal_story_npc_id" value="${esc(savedNpcId)}">`;
    h += `<input type="hidden" id="dt-personal_story_npc_name" value="${esc(savedNpcName)}">`;
    h += '<div class="dt-npc-propose">';
    h += '<label class="qf-label">Or introduce someone new:</label>';
    h += `<input type="text" class="qf-input dt-npc-freetext" id="dt-personal_story_npc_name_free" value="${esc(savedNpcId === '__new__' ? savedNpcName : '')}" placeholder="Name and brief description\u2026">`;
    h += '</div>';
  } else {
    // Free-text fallback — no NPCs registered yet
    h += `<input type="hidden" id="dt-personal_story_npc_id" value="__new__">`;
    h += '<div class="qf-field">';
    h += '<label class="qf-label">Who do you want your character to spend time with?</label>';
    h += '<p class="qf-desc">Describe them briefly — name, relationship, context. Your ST will use this to seed their character register.</p>';
    h += `<input type="text" class="qf-input" id="dt-personal_story_npc_name" value="${esc(savedNpcName)}" placeholder="e.g. Marcus, my character\u2019s younger brother\u2026">`;
    h += '</div>';
  }

  // Interaction note
  h += '<div class="qf-field" style="margin-top:12px;">';
  h += '<label class="qf-label">What kind of moment do you want?</label>';
  h += '<p class="qf-desc">What are you hoping for from this interaction — a quiet scene, a difficult conversation, a letter, something unexpected? The more you share, the better the story.</p>';
  h += `<textarea id="dt-personal_story_note" class="qf-textarea" rows="3" placeholder="Optional\u2014 any direction, tone, or story beats you\u2019d like\u2026">${esc(savedNote)}</textarea>`;
  h += '</div>';

  // Story direction
  h += '<div class="qf-field" style="margin-top:8px;">';
  h += '<label class="qf-label">Story direction</label>';
  h += '<div class="dt-npc-direction">';
  for (const [val, label, desc] of [
    ['continue', 'Happy with this direction', 'Let the ST continue the current story thread'],
    ['redirect', 'I\'d like to redirect', 'I want to adjust the story — see note above'],
  ]) {
    const checked = savedDir === val ? ' checked' : '';
    h += `<label class="dt-npc-dir-option">`;
    h += `<input type="radio" name="personal_story_direction" value="${val}"${checked}>`;
    h += `<span class="dt-npc-dir-label">${label}</span>`;
    h += `<span class="dt-npc-dir-desc">${desc}</span>`;
    h += `</label>`;
  }
  h += '</div></div>';

  // DTR.2: correspondence moved here from Court. Rendered from the first
  // question in section.questions (type 'textarea') so collectResponses
  // can still find it via `dt-<key>`.
  const correspondenceQ = (section.questions || []).find(q => q.key === 'correspondence');
  if (correspondenceQ) {
    h += renderQuestion(correspondenceQ, saved['correspondence'] || '');
  }

  h += '</div></div>';
  return h;
}

function renderSorcerySection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'blood_sorcery');
  const hasMandragora = (currentChar.merits || []).some(m => m.name === 'Mandragora Garden');
  const rites = (currentChar.powers || []).filter(p => p.category === 'rite');
  rites.sort((a, b) => a.tradition.localeCompare(b.tradition) || a.level - b.level);
  const cruacRites = rites.filter(r => r.tradition === 'Cruac');

  const savedCount = parseInt(saved['sorcery_slot_count'] || '1', 10);
  const slotCount = Math.max(1, savedCount);

  let h = '<div class="qf-section collapsed" data-section-key="blood_sorcery">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">\u2714</span></h4>`;
  h += '<div class="qf-section-body">';
  if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;

  // Hidden field tracking slot count
  h += `<input type="hidden" id="dt-sorcery-slot-count" value="${slotCount}">`;

  if (!rites.length) {
    h += '<p class="qf-desc" style="color:var(--txt3);font-style:italic">No rites on your character sheet. Add rites in the character editor first.</p>';
    h += '</div></div>';
    return h;
  }

  for (let n = 1; n <= slotCount; n++) {
    const selectedRite = saved[`sorcery_${n}_rite`] || '';
    const rite = rites.find(r => r.name === selectedRite);
    const isCruac = rite?.tradition === 'Cruac';
    const mandSaved = saved[`sorcery_${n}_mandragora`] === 'yes';

    h += `<div class="dt-sorcery-slot" id="dt-sorcery-slot-${n}">`;
    h += `<div class="dt-sorcery-slot-hd"><span class="dt-sorcery-slot-num">Rite ${n}</span>`;
    if (n > 1) h += `<button type="button" class="dt-sorcery-remove" data-remove-rite="${n}" title="Remove this rite">\u00D7 Remove</button>`;
    h += '</div>';

    h += '<div class="qf-field">';
    h += `<select id="dt-sorcery_${n}_rite" class="qf-select" data-sorcery-slot="${n}">`;
    h += '<option value="">\u2014 No Rite \u2014</option>';
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
    h += '</select>';

    // Mandragora Garden checkbox — Cruac rites only, when character has the merit
    if (hasMandragora && cruacRites.length) {
      const mandChecked = isCruac && mandSaved ? ' checked' : '';
      const mandDisabled = !isCruac ? ' disabled' : '';
      const mandMerit = (currentChar.merits || []).find(m => m.name === 'Mandragora Garden');
      const mandDots = mandMerit ? (mandMerit.rating || 0) : 0;
      h += `<label class="dt-mand-label" title="If ticked, this rite is cast in your Mandragora Garden, granting +${mandDots} bonus dice to the casting roll and sustaining the rite each game in perpetuity. Costs 1 Vitae per garden dot.">`;
      h += `<input type="checkbox" id="dt-sorcery_${n}_mandragora" class="dt-mand-cb"${mandChecked}${mandDisabled}>`;
      h += ` Mandragora Garden (sustained${isCruac && mandDots ? `, +${mandDots} dice` : ''})`;
      h += '</label>';
      // "Already paid" checkbox — shown when garden checkbox is ticked
      if (isCruac && mandSaved) {
        const paidSaved = saved[`sorcery_${n}_mand_paid`] === 'yes';
        const paidChecked = paidSaved ? ' checked' : '';
        h += `<label class="dt-mand-label dt-mand-paid-label" title="Tick if you have already set aside ${mandDots} Vitae to cover this rite's sustained cost for the month.">`;
        h += `<input type="checkbox" id="dt-sorcery_${n}_mand_paid" class="dt-mand-cb"${paidChecked}>`;
        h += ` Vitae cost already paid (${mandDots}V)`;
        h += '</label>';
      }
    }

    h += '</div>';

    if (rite) {
      h += '<div class="dt-sorcery-details">';
      h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Tradition/Level:</span> ${esc(rite.tradition)} ${rite.level}</div>`;
      if (rite.stats) h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Stats:</span> ${esc(rite.stats)}</div>`;
      if (rite.effect) h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Effect:</span> ${esc(rite.effect)}</div>`;

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

  h += `<button type="button" class="dt-add-rite-btn" id="dt-add-rite">\u002B Add Rite</button>`;
  h += '</div></div>';
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
    m.category === 'general' || m.category === 'influence' || m.category === 'standing'
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

  // Availability (dot selector 1-5 + Unknown)
  const savedAvailRaw = saved['acq_availability'];
  const savedAvail = savedAvailRaw === 'unknown' ? 'unknown' : (parseInt(savedAvailRaw, 10) || 0);
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Availability</label>';
  h += '<p class="qf-desc">How rare is this item? Click to set (1 = common, 5 = unique).</p>';
  h += '<div class="dt-acq-avail-row" data-acq-avail>';
  for (let d = 1; d <= 5; d++) {
    const filled = typeof savedAvail === 'number' && d <= savedAvail ? ' dt-acq-dot-filled' : '';
    h += `<span class="dt-acq-dot${filled}" data-acq-dot="${d}">\u25CF</span>`;
  }
  h += `<span class="dt-acq-unknown${savedAvail === 'unknown' ? ' dt-acq-dot-filled' : ''}" data-acq-unknown>Unknown</span>`;
  if (savedAvail) {
    const labels = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];
    const lbl = savedAvail === 'unknown' ? '' : (labels[savedAvail] || '');
    if (lbl) h += `<span class="dt-acq-avail-label">${lbl}</span>`;
  }
  h += `<input type="hidden" id="dt-acq_availability" value="${esc(String(savedAvail || ''))}">`;
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

  // Specialisation chips (if selected skill has specs, or IS grants cross-skill specs)
  const skSavedSpec = saved['skill_acq_pool_spec'] || '';
  let specBonus = 0;
  const skNativeSpecs = skSavedSkill ? (c.skills?.[skSavedSkill]?.specs || []) : [];
  const skIsSpecs = isSpecs(c).filter(({ spec }) => !skNativeSpecs.includes(spec));
  const skAllSpecs = [...skNativeSpecs, ...skIsSpecs.map(({ spec }) => spec)];
  if (skSavedSpec && skAllSpecs.includes(skSavedSpec)) {
    specBonus = hasAoE(c, skSavedSpec) ? 2 : 1;
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
  if (skNativeSpecs.length || skIsSpecs.length) {
    h += '<div class="dt-feed-spec-row" style="margin-top:6px;">';
    h += '<label class="dt-feed-disc-lbl">Specialisation:</label>';
    const allSkSpecs = [
      ...skNativeSpecs.map(sp => ({ sp, fromSkill: null, native: true })),
      ...skIsSpecs.map(({ spec, fromSkill }) => ({ sp: spec, fromSkill, native: false })),
    ];
    for (const { sp, fromSkill, native } of sortChips(allSkSpecs, item => item.sp)) {
      const on = skSavedSpec === sp ? ' dt-feed-spec-on' : '';
      const label = native ? esc(sp) : `${esc(sp)} (${esc(fromSkill)})`;
      h += `<button type="button" class="dt-feed-spec-chip${on}" data-skill-acq-spec="${esc(sp)}">${label} <span class="dt-feed-spec-bonus">+${hasAoE(c, sp) ? 2 : 1}</span></button>`;
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

  // Availability (dot selector 1-5 + Unknown)
  const skSavedAvailRaw = saved['skill_acq_availability'];
  const skSavedAvail = skSavedAvailRaw === 'unknown' ? 'unknown' : (parseInt(skSavedAvailRaw, 10) || 0);
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Availability</label>';
  h += '<p class="qf-desc">How rare is this item? Click to set (1 = common, 5 = unique).</p>';
  h += '<div class="dt-acq-avail-row" data-skill-acq-avail>';
  for (let d = 1; d <= 5; d++) {
    const filled = typeof skSavedAvail === 'number' && d <= skSavedAvail ? ' dt-acq-dot-filled' : '';
    h += `<span class="dt-acq-dot${filled}" data-skill-acq-dot="${d}">\u25CF</span>`;
  }
  h += `<span class="dt-acq-unknown${skSavedAvail === 'unknown' ? ' dt-acq-dot-filled' : ''}" data-skill-acq-unknown>Unknown</span>`;
  if (skSavedAvail) {
    const labels = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];
    const lbl = skSavedAvail === 'unknown' ? '' : (labels[skSavedAvail] || '');
    if (lbl) h += `<span class="dt-acq-avail-label">${lbl}</span>`;
  }
  h += `<input type="hidden" id="dt-skill_acq_availability" value="${esc(String(skSavedAvail || ''))}">`;
  h += '</div></div>';

  h += '</div>';

  h += '</div></div>'; // section-body, section
  return h;
}

// ── Equipment ──

function renderEquipmentSection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'equipment');
  if (!section) return '';

  const savedCount = parseInt(saved['equipment_slot_count'] || '1', 10);
  const slotCount = Math.max(1, savedCount);

  let h = '<div class="qf-section collapsed" data-section-key="equipment">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">\u2714</span></h4>`;
  h += '<div class="qf-section-body">';
  if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;

  h += `<input type="hidden" id="dt-equipment-slot-count" value="${slotCount}">`;

  h += '<div id="dt-equipment-rows">';
  for (let n = 1; n <= slotCount; n++) {
    h += renderEquipmentRow(n, saved);
  }
  h += '</div>';

  h += `<button type="button" class="dt-add-rite-btn" id="dt-add-equipment">\u002B Add Item</button>`;
  h += '</div></div>';
  return h;
}

function renderEquipmentRow(n, saved) {
  let h = `<div class="dt-equipment-row" id="dt-equipment-row-${n}">`;
  h += `<div class="dt-equipment-row-fields">`;
  h += `<input type="text" id="dt-equipment_${n}_name" class="qf-input dt-equip-name" placeholder="Item name" value="${esc(saved[`equipment_${n}_name`] || '')}">`;
  h += `<input type="number" id="dt-equipment_${n}_qty" class="qf-input dt-equip-qty" placeholder="Qty" min="1" value="${esc(saved[`equipment_${n}_qty`] || '1')}">`;
  h += `<input type="text" id="dt-equipment_${n}_notes" class="qf-input dt-equip-notes" placeholder="Source / notes" value="${esc(saved[`equipment_${n}_notes`] || '')}">`;
  if (n > 1) h += `<button type="button" class="dt-sorcery-remove" data-remove-equipment="${n}" title="Remove">\u00D7</button>`;
  h += '</div>';
  h += '</div>';
  return h;
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
    total += currentChar.disciplines?.[discEl.value]?.dots || 0;
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
// ── Unified feeding pool selector ──
// scope: 'feed' (main) or 'rote' — determines element IDs and data attributes
function renderFeedPoolSelector(c, methodId, selAttr, selSkill, selDisc, selSpec, scope) {
  const isOther = methodId === 'other';
  const isOpen  = !methodId; // DTFP-4: no method picked — show all char discs in dropdown
  const m = isOther ? null : FEED_METHODS.find(fm => fm.id === methodId);
  const pfx = scope === 'rote' ? 'rote' : 'feed';

  // All attrs/skills the char has dots in
  const allAttrs = ALL_ATTRS.filter(a => { const v = c.attributes?.[a]; return v && (v.dots+(v.bonus||0))>0; });
  const allSkills = ALL_SKILLS.filter(s => { const v = c.skills?.[s]; return v && (v.dots+(v.bonus||0))>0; });
  const allDiscs = (isOther || isOpen)
    ? Object.entries(c.disciplines||{}).filter(([,v])=>(v?.dots||0)>0).map(([d])=>d)
    : (m?.discs || []).filter(d => c.disciplines?.[d]?.dots);

  // Calculate total from current selections
  let total = 0;
  if (selAttr) { const a = c.attributes?.[selAttr]; if (a) total += (a.dots||0)+(a.bonus||0); }
  if (selSkill) { const s = c.skills?.[selSkill]; if (s) total += (s.dots||0)+(s.bonus||0); }
  if (selDisc) total += c.disciplines?.[selDisc]?.dots || 0;
  const fgVal = (c.merits||[]).find(mr=>mr.name==='Feeding Grounds')?.rating || 0;
  total += fgVal;
  const specBonus = selSpec ? (hasAoE(c, selSpec) ? 2 : 1) : 0;
  total += specBonus;

  let h = '<div class="dt-feed-pool">';

  // ── Pool dropdowns ──
  h += '<div class="dt-feed-custom-row">';
  h += `<select class="qf-select" id="dt-${pfx}-custom-attr"><option value="">Attribute</option>`;
  for (const a of allAttrs) {
    const v = c.attributes[a]; const dots = (v.dots||0)+(v.bonus||0);
    h += `<option value="${esc(a)}"${selAttr===a?' selected':''}>${esc(a)} (${dots})</option>`;
  }
  h += '</select>';
  h += `<select class="qf-select" id="dt-${pfx}-custom-skill"><option value="">Skill</option>`;
  for (const s of allSkills) {
    const v = c.skills[s]; const dots = (v.dots||0)+(v.bonus||0);
    h += `<option value="${esc(s)}"${selSkill===s?' selected':''}>${esc(s)} (${dots})</option>`;
  }
  h += '</select>';
  if (allDiscs.length) {
    h += `<select class="qf-select" id="dt-${pfx}-disc"><option value="">Discipline</option>`;
    for (const d of allDiscs) {
      const dv = c.disciplines[d]?.dots || 0;
      h += `<option value="${esc(d)}"${selDisc===d?' selected':''}>${esc(d)} (${dv})</option>`;
    }
    h += '</select>';
  }
  if (total > 0) h += `<span class="dt-feed-total">= ${total} dice</span>`;
  h += '</div>';

  // ── Suggestion chips (non-Other only) ──
  if (m && (m.attrs.length || m.skills.length || m.discs.length)) {
    h += '<div class="dt-feed-suggest">';
    h += '<span class="dt-feed-suggest-lbl">Suggestions:</span>';
    for (const a of sortChips(m.attrs)) {
      const v = c.attributes?.[a]; const val = v ? (v.dots||0)+(v.bonus||0) : 0;
      const active = selAttr === a ? ' dt-feed-chip-on' : '';
      h += `<button type="button" class="dt-feed-chip dt-feed-chip-attr${active}" data-${pfx}-chip-attr="${esc(a)}">${esc(a)} (${val})</button>`;
    }
    h += '<span class="dt-feed-suggest-sep">/</span>';
    for (const s of sortChips(m.skills)) {
      const v = c.skills?.[s]; const val = v ? (v.dots||0)+(v.bonus||0) : 0;
      const active = selSkill === s ? ' dt-feed-chip-on' : '';
      h += `<button type="button" class="dt-feed-chip dt-feed-chip-skill${active}" data-${pfx}-chip-skill="${esc(s)}">${esc(s)} (${val})</button>`;
    }
    if (m.discs.length) {
      h += '<span class="dt-feed-suggest-sep">/</span>';
      for (const d of sortChips(m.discs)) {
        const val = c.disciplines?.[d]?.dots || 0;
        const active = selDisc === d ? ' dt-feed-chip-on' : '';
        h += `<button type="button" class="dt-feed-chip dt-feed-chip-disc${active}" data-${pfx}-chip-disc="${esc(d)}">${esc(d)} (${val})</button>`;
      }
    }
    h += '</div>';
    // DTFP-3: By Force teaching note when a brawl/weaponry-boosting discipline is picked
    if (m.id === 'force' && (selDisc === 'Vigour' || selDisc === 'Celerity')) {
      h += `<div class="dt-feed-teaching-note">Vigour and Celerity add bonus dice to Brawl and Weaponry pools. Confirm with your ST if your roll relies on this.</div>`;
    }
  }

  // ── Spec chips (for selected skill) ──
  const nativeSpecs = selSkill ? (c.skills?.[selSkill]?.specs || []) : [];
  const isSpecsList = selSkill ? isSpecs(c).filter(({ spec }) => !nativeSpecs.includes(spec)) : [];
  if (nativeSpecs.length || isSpecsList.length) {
    h += '<div class="dt-feed-spec-row"><label class="dt-feed-disc-lbl">Specialisation:</label>';
    const allSpecs = [
      ...nativeSpecs.map(sp => ({ sp, fromSkill: null, native: true })),
      ...isSpecsList.map(({ spec, fromSkill }) => ({ sp: spec, fromSkill, native: false })),
    ];
    for (const { sp, fromSkill, native } of sortChips(allSpecs, item => item.sp)) {
      const on = selSpec===sp?' dt-feed-spec-on':'';
      const label = native ? esc(sp) : `${esc(sp)} (${esc(fromSkill)})`;
      h += `<button type="button" class="dt-feed-spec-chip${on}" data-feed-spec="${esc(sp)}"${scope==='rote'?' data-rote-spec="1"':''}>${label} <span class="dt-feed-spec-bonus">+${hasAoE(c,sp)?2:1}</span></button>`;
    }
    h += '</div>';
  }

  if (fgVal) h += `<div class="dt-feed-dim" style="font-size:12px;margin-top:4px">+${fgVal} Feeding Grounds included in total</div>`;

  h += '</div>';
  return h;
}

// ── Territory pill switcher helpers ──

/** Single-select territory pills. fieldId = the hidden input ID (same as old select ID). */
function renderTerritoryPills(fieldId, savedVal) {
  let h = `<div class="dt-terr-pills" data-terr-single="${fieldId}">`;
  for (const t of TERRITORY_DATA) {
    const active = savedVal === t.id ? ' dt-terr-pill-on' : '';
    h += `<button type="button" class="dt-terr-pill${active}" data-terr-single="${fieldId}" data-terr-val="${esc(t.id)}">${esc(t.name)}</button>`;
  }
  h += '</div>';
  h += `<input type="hidden" id="${fieldId}" value="${esc(savedVal || '')}">`;
  return h;
}

/** Multi-select feeding territory pills (territory_grid). */
function renderFeedingTerritoryPills(gridVals) {
  let h = '<div class="dt-terr-pills dt-feed-terr-pills">';
  for (const terr of FEEDING_TERRITORIES) {
    const terrKey = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const isBarrens = terr.includes('Barrens');
    const terrData = TERRITORY_DATA.find(t => t.name === terr);
    const ambience = terrData ? terrData.ambience : '';

    // A character has feeding rights on a territory if they are:
    //   - the regent (territory.regent_id matches) — implicit, not in feeding_rights[]
    //   - the lieutenant (territory.lieutenant_id matches) — implicit
    //   - explicitly listed in territory.feeding_rights[]
    // Regent and lieutenant are stored on their own fields; the regency tab
    // deliberately strips them from feeding_rights[] to avoid duplication.
    const myId = String(currentChar._id);
    const hasFeedingRights = !isBarrens && (_territories || []).some(t => {
      if (t.name !== terr) return false;
      if (String(t.regent_id || '') === myId) return true;
      if (String(t.lieutenant_id || '') === myId) return true;
      return Array.isArray(t.feeding_rights) && t.feeding_rights.some(id => String(id) === myId);
    });

    let savedVal = gridVals[terrKey] || 'none';
    if (savedVal === 'resident') savedVal = 'feeding_rights';
    if (savedVal === 'poacher') savedVal = 'poaching';
    if (gridVals[terrKey] === undefined && !isBarrens) {
      savedVal = hasFeedingRights ? 'feeding_rights' : 'none';
    }

    const isActive = savedVal !== 'none';
    const statusVal = isBarrens ? (isActive ? 'barrens' : 'none')
      : (hasFeedingRights ? 'feeding_rights' : 'poaching');
    const statusLabel = isBarrens ? 'The Barrens'
      : (hasFeedingRights ? 'Feeding Rights' : 'Poaching');

    const activeClass = isActive
      ? (isBarrens ? ' dt-terr-pill-barrens' : (hasFeedingRights ? ' dt-terr-pill-rights' : ' dt-terr-pill-poach'))
      : '';

    h += `<button type="button" class="dt-terr-pill${activeClass}"`;
    h += ` data-feed-terr-key="${terrKey}" data-feed-status="${statusVal}" data-feed-active="${isActive ? '1' : '0'}">`;
    h += `<span class="dt-terr-pill-name">${esc(isBarrens ? 'The Barrens' : terr)}</span>`;
    if (ambience && !isBarrens) {
      const mod = terrData?.ambienceMod;
      const modStr = mod !== undefined ? ` (${mod >= 0 ? '+' : ''}${mod})` : '';
      h += `<span class="dt-terr-pill-amb">${esc(ambience)}${modStr}</span>`;
    }
    if (isActive && !isBarrens) h += `<span class="dt-terr-pill-status">${statusLabel}</span>`;
    h += '</button>';
    h += `<input type="hidden" id="feed-val-${terrKey}" value="${savedVal}">`;
  }
  h += '</div>';
  return h;
}

function renderSphereFields(n, prefix, fields, saved, charMerits) {
  let h = '';

  if (fields.includes('territory')) {
    const savedTerr = saved[`${prefix}_${n}_territory`] || '';
    h += '<div class="qf-field">';
    h += '<label class="qf-label">Territory</label>';
    h += renderTerritoryPills(`dt-${prefix}_${n}_territory`, savedTerr);
    h += '</div>';
  }

  if (fields.includes('target_char')) {
    let targetPicks = [];
    try { targetPicks = JSON.parse(saved[`${prefix}_${n}_target_value`] || '[]'); } catch {
      if (saved[`${prefix}_${n}_target_value`]) targetPicks = [saved[`${prefix}_${n}_target_value`]];
    }
    const targetSet = new Set(targetPicks.map(String));
    h += '<div class="qf-field">';
    h += '<label class="qf-label">Target Character(s)</label>';
    h += `<div class="dt-shoutout-grid">`;
    for (const c of allCharacters) {
      const isChecked = targetSet.has(String(c.id));
      const isAtt = lastGameAttendees.some(a => String(a.id) === String(c.id));
      h += `<label class="dt-shoutout-item${isAtt ? ' dt-shoutout-att' : ''}">`;
      h += `<input type="checkbox" class="dt-target-char-sphere-cb" data-target-slot="${prefix}_${n}" value="${esc(String(c.id))}"${isChecked ? ' checked' : ''}>`;
      h += `<span>${esc(c.name)}</span>`;
      h += '</label>';
    }
    h += '</div></div>';
  }

  if (fields.includes('block_merit')) {
    const savedMerit = saved[`${prefix}_${n}_block_merit`] || '';
    h += '<div class="qf-field">';
    h += `<label class="qf-label" for="dt-${prefix}_${n}_block_merit">Which merit are you targeting?</label>`;
    h += `<p class="qf-desc">Name your best guess — you may not know exactly what they have.</p>`;
    h += `<input type="text" id="dt-${prefix}_${n}_block_merit" class="qf-input" value="${esc(savedMerit)}" placeholder="e.g. Allies (Police), Status (Lancea)">`;
    h += '</div>';
  }

  if (fields.includes('target_own_merit')) {
    const savedVal = saved[`${prefix}_${n}_target_value`] || '';
    h += '<div class="qf-field">';
    h += `<label class="qf-label" for="dt-${prefix}_${n}_target_value">What are you protecting?</label>`;
    h += `<select id="dt-${prefix}_${n}_target_value" class="qf-select">`;
    h += '<option value="">— Select Merit / Asset —</option>';
    for (const m of charMerits) {
      const mLabel = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
      const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
      const sel = mKey === savedVal ? ' selected' : '';
      h += `<option value="${esc(mKey)}"${sel}>${esc(mLabel)}</option>`;
    }
    h += '</select></div>';
  }

  if (fields.includes('target_flex')) {
    const savedType = saved[`${prefix}_${n}_target_type`] || '';
    const savedVal = saved[`${prefix}_${n}_target_value`] || '';
    h += '<div class="qf-field dt-target-flex">';
    h += '<label class="qf-label">What are you investigating?</label>';
    h += '<div class="dt-target-flex-radios">';
    for (const opt of [['character', 'Character'], ['territory', 'Territory'], ['other', 'Other']]) {
      const chk = savedType === opt[0] ? ' checked' : '';
      h += `<label class="dt-flex-radio-label"><input type="radio" name="dt-${prefix}_${n}_target_type" value="${opt[0]}"${chk} data-flex-type="${prefix}_${n}"> ${opt[1]}</label>`;
    }
    h += '</div>';
    if (savedType === 'character') {
      h += `<select id="dt-${prefix}_${n}_target_value" class="qf-select dt-flex-char-sel">`;
      h += '<option value="">— Select Character —</option>';
      for (const c of allCharacters) {
        const sel = String(c.id) === String(savedVal) ? ' selected' : '';
        h += `<option value="${esc(String(c.id))}"${sel}>${esc(c.name)}</option>`;
      }
      h += '</select>';
    } else if (savedType === 'territory') {
      h += renderTerritoryPills(`dt-${prefix}_${n}_target_value`, savedVal);
    } else if (savedType === 'other') {
      h += `<input type="text" id="dt-${prefix}_${n}_target_value" class="qf-input" value="${esc(savedVal)}" placeholder="Describe what you are investigating">`;
    }
    h += '</div>';
  }

  if (fields.includes('investigate_lead')) {
    h += renderQuestion({
      key: `${prefix}_${n}_investigate_lead`, label: 'What is your lead on this investigation? \u2731',
      type: 'textarea', required: true,
      desc: 'Provide a specific starting point, source, or known fact.',
    }, saved[`${prefix}_${n}_investigate_lead`] || '');
  }

  if (fields.includes('project_support')) {
    const savedVal = saved[`${prefix}_${n}_project_support`] || '';
    const activeProjects = [];
    const projectSection = DOWNTIME_SECTIONS.find(s => s.key === 'projects');
    const slotCount = projectSection?.projectSlots || 4;
    for (let p = 1; p <= slotCount; p++) {
      const act = saved[`project_${p}_action`] || '';
      if (act && act !== '') {
        const title = saved[`project_${p}_title`] || `Action ${p}`;
        activeProjects.push({ value: String(p), label: `${title} (${act})` });
      }
    }
    h += '<div class="qf-field">';
    h += `<label class="qf-label" for="dt-${prefix}_${n}_project_support">Which project are you supporting?</label>`;
    h += `<select id="dt-${prefix}_${n}_project_support" class="qf-select">`;
    h += '<option value="">— Select Project —</option>';
    for (const p of activeProjects) {
      const sel = p.value === savedVal ? ' selected' : '';
      h += `<option value="${esc(p.value)}"${sel}>${esc(p.label)}</option>`;
    }
    h += '</select></div>';
  }

  if (fields.includes('outcome')) {
    h += renderQuestion({
      key: `${prefix}_${n}_outcome`, label: 'Desired Outcome',
      type: 'text', required: false, desc: null,
    }, saved[`${prefix}_${n}_outcome`] || '');
  }

  if (fields.includes('description')) {
    h += renderQuestion({
      key: `${prefix}_${n}_description`, label: 'Description',
      type: 'textarea', required: false, desc: null,
    }, saved[`${prefix}_${n}_description`] || '');
  }

  return h;
}

function renderMeritToggles(saved) {
  let h = '';
  const hasSpheres = detectedMerits.spheres.length > 0;
  const hasContacts = detectedMerits.contacts.length > 0;
  const hasRetainers = detectedMerits.retainers.length > 0;
  const hasStatus = detectedMerits.status.length > 0;
  const charMerits = (currentChar.merits || []).filter(m =>
    m.category === 'general' || m.category === 'influence' || m.category === 'standing'
  );

  if (!hasSpheres && !hasContacts && !hasRetainers && !hasStatus) return '';

  // ── Spheres of Influence (tabbed, max 5) ──
  if (hasSpheres) {
    const maxSpheres = Math.min(detectedMerits.spheres.length, 5);
    h += '<div class="qf-section collapsed" data-section-key="spheres">';
    h += '<h4 class="qf-section-title">Allies: Spheres of Influence<span class="qf-section-tick">✔</span></h4>';
    h += '<div class="qf-section-body">';
    h += '<p class="qf-section-intro">Your character has the following Allies merits. Use the tabs to configure up to 5 sphere actions this Downtime.</p>';

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
      for (const opt of SPHERE_ACTIONS.filter(o => o.value !== 'grow')) {
        const sel = actionVal === opt.value ? ' selected' : '';
        h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
      }
      h += '</select></div>';

      h += renderSphereFields(n, 'sphere', fields, saved, charMerits);

      h += '</div>'; // pane
    }

    h += '</div></div>';
  }

  // ── Status (Broad / Narrow / MCI) ──
  if (detectedMerits.status.length > 0) {
    const maxStatus = Math.min(detectedMerits.status.length, 5);
    h += '<div class="qf-section collapsed" data-section-key="status">';
    h += '<h4 class="qf-section-title">Status: Social Standing<span class="qf-section-tick">✔</span></h4>';
    h += '<div class="qf-section-body">';
    h += '<p class="qf-section-intro">Use your Status merits to take social actions this Downtime.</p>';

    h += '<div class="dt-proj-tabs">';
    for (let n = 1; n <= maxStatus; n++) {
      const m = detectedMerits.status[n - 1];
      const actionVal = saved[`status_${n}_action`] || '';
      const icon = ACTION_ICONS[actionVal] || ACTION_ICONS[''];
      const label = actionVal ? (ACTION_SHORT[actionVal] || actionVal) : 'No Action';
      const active = n === 1 ? ' dt-proj-tab-active' : '';
      const noAction = !actionVal ? ' dt-proj-tab-empty' : '';
      const statusLabel = m.name === 'MCI' ? `MCI${m.cult_name ? ` (${m.cult_name})` : ''}` :
        (m.qualifier || m.area ? `Status (${m.qualifier || m.area})` : 'Broad Status');
      h += `<button type="button" class="dt-proj-tab${active}${noAction}" data-status-tab="${n}">`;
      h += `<span class="dt-proj-tab-icon">${icon}</span>`;
      h += `<span class="dt-proj-tab-num">${esc(statusLabel)}</span>`;
      h += `<span class="dt-proj-tab-label">${esc(label)}</span>`;
      h += '</button>';
    }
    h += '</div>';

    for (let n = 1; n <= maxStatus; n++) {
      const m = detectedMerits.status[n - 1];
      const actionVal = saved[`status_${n}_action`] || '';
      const visible = n === 1;
      const fields = SPHERE_ACTION_FIELDS[actionVal] || [];

      h += `<div class="dt-proj-pane${visible ? '' : ' dt-proj-pane-hidden'}" data-status-pane="${n}">`;
      h += `<input type="hidden" id="dt-status_${n}_merit_key" value="${esc(meritKey(m))}">`;

      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-status_${n}_action">Action Type</label>`;
      h += `<select id="dt-status_${n}_action" class="qf-select" data-status-action="${n}">`;
      for (const opt of SPHERE_ACTIONS) {
        const sel = actionVal === opt.value ? ' selected' : '';
        h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
      }
      h += '</select></div>';

      h += renderSphereFields(n, 'status', fields, saved, charMerits);

      h += '</div>';
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
      h += `<label class="qf-label" for="dt-contact_${n}_request">What specific information are you requesting?</label>`;
      h += `<p class="qf-desc">Name a person, event, or piece of information your contact would plausibly know. Vague requests (\u201Canything useful about X\u201D) will be resolved at ST discretion.</p>`;
      h += `<textarea id="dt-contact_${n}_request" class="qf-textarea" rows="3" placeholder="e.g. \u201CWhat does Lord Vance know about the missing shipment from March?\u201D">${esc(savedReq)}</textarea>`;
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

    // Territory: tick when any feeding territory has a feeding_rights or poaching selection
    if (key === 'territory') {
      const feedRadios = body.querySelectorAll('input[type="radio"]:checked');
      const activeVals = new Set(['feeding_rights', 'poaching', 'resident', 'poach']);
      const hasSelection = Array.from(feedRadios).some(r => activeVals.has(r.value));
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
      let picks = [];
      if (value) { try { picks = JSON.parse(value); } catch { /* ignore */ } }
      const pickSet = new Set(picks.map(String));
      const atLimit = pickSet.size >= 3;

      h += '<div class="dt-shoutout-grid">';
      for (const char of allCharacters) {
        const isChecked = pickSet.has(String(char.id));
        const isAtt = lastGameAttendees.some(a => String(a.id) === String(char.id));
        const disabled = (!isChecked && atLimit) ? ' disabled' : '';
        const checkedAttr = isChecked ? ' checked' : '';
        const attClass = isAtt ? ' dt-shoutout-att' : '';
        h += `<label class="dt-shoutout-item${attClass}">`;
        h += `<input type="checkbox" class="dt-shoutout-cb" value="${esc(String(char.id))}"${checkedAttr}${disabled}>`;
        h += `<span>${esc(char.name)}</span>`;
        h += `</label>`;
      }
      h += '</div>';
      if (atLimit) {
        h += '<p class="dt-shoutout-limit">3 selections made &mdash; uncheck one to change.</p>';
      }
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

      // ── Unified pool builder (DTFP-4: always visible, method optional) ──
      h += renderFeedPoolSelector(c, feedMethodId, feedCustomAttr, feedCustomSkill, feedDiscName, feedSpecName, 'feed');

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

      // ── DTFP-5: Kiss / Violent toggle ──
      // Player choice wins. If unset, pre-select per method (stalking + other stay
      // unselected so the player must commit). Pre-selection is visual only — the
      // field is not persisted until the player clicks one of the buttons.
      const persistedViolence = responseDoc?.responses?.feed_violence || '';
      const preselect = persistedViolence || (FEED_VIOLENCE_DEFAULTS[feedMethodId] || '');
      h += '<div class="qf-field">';
      h += '<label class="qf-label">How loud was the feeding?</label>';
      h += '<div class="dt-feed-violence-toggle">';
      h += `<button type="button" class="dt-feed-vi-btn${preselect === 'kiss' ? ' dt-feed-vi-on' : ''}" data-feed-violence="kiss">The Kiss (subtle)</button>`;
      h += `<button type="button" class="dt-feed-vi-btn${preselect === 'violent' ? ' dt-feed-vi-on' : ''}" data-feed-violence="violent">Violent</button>`;
      h += '</div>';
      if (!persistedViolence && !preselect) {
        h += '<p class="qf-desc dt-feed-vi-hint">Pick one. Your method does not pre-select for you.</p>';
      } else if (!persistedViolence && preselect) {
        h += '<p class="qf-desc dt-feed-vi-hint">Pre-selected based on your method. Click to confirm or change.</p>';
      }
      h += '</div>';

      // ROTE checkbox + description (shown when method selected)
      if (feedMethodId) {
        // Restore rote state from saved responses
        const savedRote = responseDoc?.responses?.['_feed_rote'] === 'yes';
        if (savedRote && !feedRoteAction) feedRoteAction = true;
        feedRoteDisc = responseDoc?.responses?.['_rote_disc'] || feedRoteDisc;
        feedRoteSpec = responseDoc?.responses?.['_rote_spec'] || feedRoteSpec;
        feedRoteCustomAttr = responseDoc?.responses?.['_rote_custom_attr'] || feedRoteCustomAttr;
        feedRoteCustomSkill = responseDoc?.responses?.['_rote_custom_skill'] || feedRoteCustomSkill;

        const saved = responseDoc?.responses || {};

        // Auto-assign first available slot
        const firstAvail = [1,2,3,4].find(n => {
          const act = saved[`project_${n}_action`];
          return !act || act === 'feed';
        }) || 1;
        if (feedRoteAction && feedRoteSlot !== firstAvail) feedRoteSlot = firstAvail;

        const roteDesc = saved[`project_${feedRoteSlot}_description`] || '';

        h += '<div class="dt-rote-toggle-wrap">';
        h += `<label class="dt-feed-rote-label"><input type="checkbox" id="dt-feed-rote"${feedRoteAction ? ' checked' : ''}> Commit a Project action for Rote quality on this hunt</label>`;
        if (feedRoteAction) {
          h += '<div class="dt-rote-slot-picker">';
          h += `<p class="qf-desc" style="margin:0 0 8px">Commits <strong>Project ${feedRoteSlot}</strong> to this hunt.</p>`;

          // Pool (same helper as main feed, separate state)
          h += renderFeedPoolSelector(c, feedMethodId, feedRoteCustomAttr, feedRoteCustomSkill, feedRoteDisc, feedRoteSpec, 'rote');

          h += renderQuestion({
            key: 'rote-description', label: 'Describe your dedicated feeding effort',
            type: 'textarea', required: false,
            desc: 'Describe where, how, and any relevant context for this dedicated hunt.',
          }, roteDesc);
          h += '</div>';
        }
        h += '</div>';

        h += '<div class="qf-field">';
        h += '<label class="qf-label" for="dt-feeding_description">Describe how your character hunts</label>';
        h += `<textarea id="dt-feeding_description" class="qf-textarea" rows="4">${esc(savedDesc)}</textarea>`;
        h += '</div>';
      }

      // ── Vitae Projection ──
      {
        const allResp = responseDoc?.responses || {};
        const vitaeMax = calcVitaeMax(c);

        // Monthly costs
        const ghoulCost = (c.merits || [])
          .filter(m => m.name === 'Retainer' && (m.ghoul || m.type === 'ghoul'))
          .reduce((sum, m) => sum + (m.rating || 0), 0);
        const rites = (c.powers || []).filter(p => p.category === 'rite');
        const sorcCount = parseInt(allResp['sorcery_slot_count'] || '1', 10);
        let riteVitaeCost = 0;
        for (let sn = 1; sn <= sorcCount; sn++) {
          const riteName = allResp[`sorcery_${sn}_rite`];
          if (riteName) {
            const rite = rites.find(r => r.name === riteName);
            if (rite && rite.tradition === 'Cruac') riteVitaeCost += rite.level || 0;
          }
        }
        const mandMerit = (c.merits || []).find(m => m.name === 'Mandragora Garden');
        const mandDots = mandMerit ? (mandMerit.rating || 0) : 0;
        const totalCost = ghoulCost + riteVitaeCost + mandDots;
        const mandFruit = mandDots * 2;

        // Ambience from selected feeding territory
        let feedingGrid = {};
        try { feedingGrid = JSON.parse(allResp['feeding_territories'] || '{}'); } catch { /* ignore */ }
        const primaryTerrKey = Object.keys(feedingGrid).find(k =>
          feedingGrid[k] === 'feeding_rights' || feedingGrid[k] === 'poaching' ||
          feedingGrid[k] === 'resident' || feedingGrid[k] === 'poacher'
        );
        const primaryTerrName = primaryTerrKey
          ? FEEDING_TERRITORIES.find(t => t.toLowerCase().replace(/[^a-z0-9]+/g, '_') === primaryTerrKey)
          : null;
        const terrData = primaryTerrName ? TERRITORY_DATA.find(t => t.name === primaryTerrName) : null;
        const ambienceMod = terrData ? (terrData.ambienceMod || 0) : null;

        const netVitae = ambienceMod !== null
          ? Math.max(0, Math.min(vitaeMax, vitaeMax - totalCost + ambienceMod))
          : null;

        h += '<div class="dt-vitae-budget">';
        h += '<div class="dt-vitae-budget-title">Vitae Projection</div>';
        h += `<div class="dt-vitae-row"><span>Vitae Max (BP ${c.blood_potency || 1})</span><span>${vitaeMax}</span></div>`;
        if (ghoulCost > 0) h += `<div class="dt-vitae-row dt-vitae-cost"><span>Ghoul Retainers</span><span>\u2212${ghoulCost}</span></div>`;
        if (riteVitaeCost > 0) h += `<div class="dt-vitae-row dt-vitae-cost"><span>Cruac Rites</span><span>\u2212${riteVitaeCost}</span></div>`;
        if (mandDots > 0) h += `<div class="dt-vitae-row dt-vitae-cost"><span>Mandragora Garden (${'●'.repeat(mandDots)})</span><span>\u2212${mandDots}</span></div>`;
        if (ambienceMod !== null) {
          const ambLabel = `${esc(terrData.ambience)} (${primaryTerrName})`;
          const modStr = ambienceMod >= 0 ? `+${ambienceMod}` : `${ambienceMod}`;
          h += `<div class="dt-vitae-row dt-vitae-note"><span>Ambience: ${ambLabel}</span><span>${modStr}</span></div>`;
          h += `<div class="dt-vitae-row dt-vitae-total"><span>Net Vitae after feeding</span><span class="${netVitae === 0 ? 'dt-vitae-over' : ''}">${netVitae}</span></div>`;
        } else {
          h += `<div class="dt-vitae-row dt-vitae-note"><span style="font-style:italic;color:var(--txt3)">Select a feeding territory above to see your projection.</span><span></span></div>`;
        }
        if (mandFruit > 0) h += `<div class="dt-vitae-row dt-vitae-note"><span>Mandragora Fruit (equipment, not on Vitae track)</span><span>+${mandFruit}</span></div>`;
        h += '</div>';
      }

      h += '</div>'; // dt-feed-card-wrap
      break;
    }

    case 'aspiration_slots': {
      const saved = responseDoc?.responses || {};
      h += '<div class="dt-aspiration-slots">';
      for (let n = 1; n <= 3; n++) {
        const savedType = saved[`aspiration_${n}_type`] || '';
        const savedText = saved[`aspiration_${n}_text`] || '';
        h += '<div class="dt-aspiration-slot">';
        h += `<select id="dt-aspiration_${n}_type" class="qf-select dt-aspiration-type">`;
        h += '<option value="">\u2014 Type \u2014</option>';
        for (const t of ['Short', 'Medium', 'Long']) {
          h += `<option value="${t}"${savedType === t ? ' selected' : ''}>${t}</option>`;
        }
        h += '</select>';
        h += `<input type="text" id="dt-aspiration_${n}_text" class="qf-input dt-aspiration-text" value="${esc(savedText)}" placeholder="Aspiration ${n}">`;
        h += '</div>';
      }
      h += '</div>';
      break;
    }

    case 'highlight_slots': {
      // DTR.1: 3 fields minimum, expanding to 4 and 5 as each is filled.
      // Legacy game_recount (single blob) imports into slot 1 on first load
      // if no numbered slots exist yet — player can then redistribute.
      const saved = responseDoc?.responses || {};
      const legacy = saved['game_recount'];
      const slotVals = [];
      for (let n = 1; n <= 5; n++) slotVals.push(saved[`game_recount_${n}`] || '');
      if (legacy && !slotVals.some(v => v)) slotVals[0] = legacy;

      // Visible count: always >=3; reveal 4 if slot 3 has text; reveal 5 if slot 4 has text.
      let visibleCount = 3;
      for (let n = 4; n <= 5; n++) {
        if (slotVals[n - 2].trim() || slotVals[n - 1].trim()) visibleCount = Math.max(visibleCount, n);
      }

      h += '<div class="dt-highlight-slots" data-highlight-root>';
      for (let n = 1; n <= 5; n++) {
        const hidden = n > visibleCount ? ' style="display:none"' : '';
        const flagChecked = saved[`mechanical_flag_${n}`] === true;
        h += `<div class="dt-highlight-slot" data-highlight-n="${n}"${hidden}>`;
        h += `<label class="qf-label">Highlight ${n}${n > 3 ? ' (optional)' : ''}</label>`;
        h += `<textarea id="dt-game_recount_${n}" class="qf-textarea dt-highlight-input" data-highlight-n="${n}" rows="2" placeholder="One highlight…">${esc(slotVals[n - 1])}</textarea>`;
        // DTFP-7: per-slot mechanical-flag checkbox
        h += `<label class="dt-highlight-flag">`;
        h += `<input type="checkbox" id="dt-mechanical_flag_${n}" data-mechanical-flag-n="${n}"${flagChecked ? ' checked' : ''}>`;
        h += `<span class="dt-highlight-flag-text">This involved a mechanical effect on another character or the world (flags this for your ST).</span>`;
        h += `</label>`;
        h += '</div>';
      }
      h += '</div>';
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

      // ── Project XP Commitments (read-only carry-forward) ──
      const projCommits = [];
      for (let n = 1; n <= 4; n++) {
        if (saved[`project_${n}_action`] !== 'xp_spend') continue;
        const cat  = saved[`project_${n}_xp_category`] || '';
        const item = saved[`project_${n}_xp_item`] || '';
        if (!cat || !item) { projCommits.push({ n, cat: '', item: '', cost: 0, label: '(not yet selected)' }); continue; }
        const cost = getRowCost({ category: cat, item, dotsBuying: 1 });
        const catLabel = XP_CATEGORIES.find(o => o.value === cat)?.label || cat;
        const itemLabel = getItemsForCategory(cat).find(i => i.value === item)?.label || item;
        projCommits.push({ n, cat, item, cost, label: `${catLabel} \u2014 ${itemLabel}` });
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
      const projCommitCost = projCommits.reduce((s, p) => s + p.cost, 0);
      const totalSpent = xpRows.reduce((sum, r) => sum + getRowCost(r), 0) + projCommitCost;
      const remaining = budget - totalSpent;

      h += `<div class="dt-xp-grid" id="dt-${q.key}">`;
      h += `<div class="dt-xp-budget" id="dt-xp-budget">`;
      h += `<span class="dt-influence-remaining${remaining < 0 ? ' dt-influence-over' : ''}">${remaining}</span>`;
      h += ` / ${budget} XP remaining`;
      h += '</div>';

      // ── Project XP Commitments (read-only) ──
      if (projCommits.length) {
        h += '<div class="dt-xp-proj-commits">';
        h += '<div class="dt-xp-proj-commits-title">Project XP Commitments</div>';
        for (const p of projCommits) {
          h += `<div class="dt-xp-proj-row">`;
          h += `<span class="dt-xp-proj-num">Action ${p.n}</span>`;
          h += `<span class="dt-xp-proj-label">${esc(p.label)}</span>`;
          h += p.cost > 0 ? `<span class="dt-xp-cost">${p.cost} XP</span>` : '';
          h += '</div>';
        }
        h += '</div>';
      }

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
        // DTFP-1: both label slots always present so the stepper column stays
        // vertically aligned across rows; text content is value-driven.
        const leftText  = val < 0 ? 'decreasing ambience' : '';
        const rightText = val > 0 ? 'increasing ambience' : '';
        h += '<div class="dt-influence-row">';
        h += `<span class="dt-influence-terr">${esc(terr)}</span>`;
        h += '<span class="dt-influence-control">';
        h += `<span class="dt-influence-label dt-influence-label-left">${leftText}</span>`;
        h += `<button type="button" class="dt-inf-btn" data-inf-terr="${tk}" data-inf-dir="-1">−</button>`;
        h += `<span class="dt-inf-val" id="inf-val-${tk}">${val}</span>`;
        h += `<button type="button" class="dt-inf-btn" data-inf-terr="${tk}" data-inf-dir="1">+</button>`;
        h += `<span class="dt-influence-label dt-influence-label-right">${rightText}</span>`;
        h += '</span>';
        h += '</div>';
      }
      h += '</div>';
      break;
    }

    case 'territory_grid': {
      let gridVals = {};
      if (value) { try { gridVals = JSON.parse(value); } catch { /* ignore */ } }
      h += '<p class="qf-desc">Ambience shown is current. Actual feeding ambience is calculated after Downtime processing and may shift based on how many Kindred feed in each territory.</p>';
      h += `<div id="dt-${q.key}">`;
      h += renderFeedingTerritoryPills(gridVals);
      h += '</div>';
      break;
    }
  }

  h += '</div>';
  return h;
}
