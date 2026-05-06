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

import { apiGet, apiPost, apiPut, apiPatch } from '../data/api.js';
import { saveDraft as saveLocalDraft, loadDraft as loadLocalDraft, clearDraft as clearLocalDraft, pickFreshestDraft } from './draft-persist.js';
import { esc, displayName, parseOutcomeSections, redactPlayer, redactCharName, hasAoE, isSpecs, findRegentTerritory } from '../data/helpers.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { DOWNTIME_SECTIONS, DOWNTIME_GATES, SPHERE_ACTIONS, TERRITORY_DATA, FEEDING_TERRITORIES, PROJECT_ACTIONS, FEED_METHODS, MAINTENANCE_MERITS, FEED_VIOLENCE_DEFAULTS, JOINT_ELIGIBLE_ACTIONS, ACTION_DESCRIPTIONS, ACTION_APPROACH_PROMPTS, SUBMIT_FINAL_MODAL_QUESTIONS } from './downtime-data.js';
import { actionSpentSummary, formatActionSpentSummary } from '../data/dt-action-summary.js';
import { ALL_ATTRS, ALL_SKILLS, CLAN_DISCS, BLOODLINE_DISCS, CORE_DISCS, RITUAL_DISCS } from '../data/constants.js';
import { calcTotalInfluence, domMeritTotal, attacheBonusDots, effectiveInvictusStatus, ssjHerdBonus, flockHerdBonus, meritEffectiveRating } from '../editor/domain.js';
import { calcVitaeMax, skTotal, skNineAgain, riteCost, skillAcqPoolStr, getAttrEffective, getAttrTotal, discDots } from '../data/accessors.js';
import { xpLeft } from '../editor/xp.js';
import { meetsPrereq } from '../editor/merits.js';
import { getRuleByKey, getRulesByCategory } from '../data/loader.js';
import { getRole, isSTRole } from '../auth/discord.js';
import { FAMILIES, kindByCode } from '../data/relationship-kinds.js';
import { promptForKind } from '../data/kind-prompts.js';
import { charPicker, setCharPickerSources } from '../components/character-picker.js';
import { isMinimalComplete, missingMinimumPieces } from '../data/dt-completeness.js';

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
let _allSubmissions = []; // DTUI-13: all submissions for the current cycle, for free-slot detection

// Merits detected from the character sheet, grouped by type
let detectedMerits = { spheres: [], contacts: [], retainers: [], status: [] };


// Characters who attended last game (for shoutout picks)
let lastGameAttendees = [];
// dt-form.17: game_session id matching the active cycle, for the soft-submit
// lifecycle PATCH on attendance.downtime.
let _activeGameSessionId = null;
// All active characters (for cast picker modal)
let allCharacters = [];

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
// JDT-2: invitations for the current cycle, fetched on form open and
// after each joint create. Read by renderJointAuthoring for status badges.
let _jointInvitations = [];

// JDT-2: status label map for invitation states.
const JOINT_STATUS_LABELS = {
  pending: 'Pending',
  accepted: 'Accepted',
  declined: 'Declined',
  decoupled: 'Decoupled',
  'cancelled-by-lead': 'Cancelled by lead',
};

const ACTION_ICONS = {
  '': '\u2298', 'ambience_increase': '\u25B2', 'ambience_decrease': '\u25BC',
  'attack': '\u2694', 'feed': '\u2666', 'hide_protect': '\u25C6',
  'investigate': '\u25CE', 'patrol_scout': '\u25C8', 'support': '\u2605',
  'xp_spend': '\u2726', 'misc': '\u25CF', 'maintenance': '\u2699',
};
const ACTION_SHORT = {
  '': 'No Action', 'ambience_increase': 'Ambience +', 'ambience_decrease': 'Ambience \u2212',
  'attack': 'Attack', 'feed': 'Feed (Rote)', 'hide_protect': 'Hide/Protect',
  'investigate': 'Investigate', 'patrol_scout': 'Patrol/Scout', 'support': 'Support',
  'xp_spend': 'XP Spend', 'misc': 'Misc', 'maintenance': 'Maintenance',
};
// Which fields each action type shows
const ACTION_FIELDS = {
  '': [],
  'feed': [],
  'xp_spend': ['xp_picker'],
  'ambience_change':   ['title', 'outcome', 'target', 'pools', 'description'],
  'attack':            ['title', 'outcome', 'target', 'pools', 'description'],
  'investigate':       ['title', 'outcome', 'target', 'investigate_lead', 'pools', 'description'],
  'hide_protect':      ['title', 'outcome', 'target', 'pools', 'description'],
  'patrol_scout':      ['title', 'outcome', 'target', 'pools', 'description'],
  'misc':              ['title', 'outcome', 'target', 'pools', 'description'],
  'maintenance':       ['target', 'description'],
};

const SPHERE_ACTION_FIELDS = {
  '': [],
  'ambience_change':   ['territory', 'ambience_dir', 'outcome'],
  'ambience_increase': ['territory', 'ambience_dir', 'outcome'],  // legacy alias
  'ambience_decrease': ['territory', 'ambience_dir', 'outcome'],  // legacy alias
  'attack':            ['target_char', 'outcome'],
  'block':             ['target_char', 'block_merit', 'outcome'],
  'hide_protect':      ['target_own_merit', 'outcome'],
  'investigate':       ['target_flex', 'investigate_lead', 'outcome'],
  'patrol_scout':      ['territory', 'outcome'],
  'grow':              ['grow_xp'],
  'misc':              ['outcome'],
  'maintenance':       ['maintenance_target'],
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

/** Format a merit for display: "Allies ●●● (Health)" using effective rating. */
function meritLabel(merit) {
  const area = merit.area || merit.qualifier || '';
  const dots = '●'.repeat(meritEffectiveRating(currentChar, merit));
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
  // Attaché (*) merits are functionally Retainers (per sheet.js:900); also walk
  // expandedInfluence so any benefit_grants-sourced Retainer is picked up.
  detectedMerits.retainers = deduplicateMerits(expandedInfluence.filter(m =>
    m.category === 'influence' && (m.name === 'Retainer' || m.name?.startsWith('Attaché ('))
  ));

  gateValues.has_sorcery = (discDots(currentChar, 'Cruac') > 0 || discDots(currentChar, 'Theban') > 0) ? 'yes' : 'no';
}

/** Calculate monthly influence budget from character data. */
function getInfluenceBudget() {
  return calcTotalInfluence(currentChar);
}

/**
/** Convenience: effective rating for a domain merit by name (looks up the instance). */
function effectiveDomainDots(c, name) {
  const m = (c.merits || []).find(merit => merit.category === 'domain' && merit.name === name);
  return meritEffectiveRating(c, m);
}

/** Get the feeding cap for the regent's territory based on its ambience. */
function collectResponses() {
  // dt-form.17 (ADR-003 §Q1 Resolutions): preserve previously-entered fields
  // for sections hidden by the current mode. Spread the prior responses as a
  // base, then specific section blocks below either overwrite (when their UI
  // is rendered) or are skipped (when hidden by MINIMAL).
  const _prior = responseDoc?.responses || {};
  const responses = { ..._prior };
  // Carry the existing mode flag forward; the toggle handler updates it
  // explicitly before triggering a save/render.
  if (_prior._mode === 'minimal' || _prior._mode === 'advanced') {
    responses._mode = _prior._mode;
  }
  const _mode = _formMode(_prior);
  const _isMinimal = _mode === 'minimal';

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
    // dt-form.17: skip hidden sections in MINIMAL so we don't clobber prior
    // values with empty strings when the DOM isn't rendered.
    if (_isMinimal && !MINIMAL_SECTIONS.has(section.key)) continue;

    for (const q of section.questions) {
      if (q.type === 'shoutout_picks') {
        // dt-form.16: charPicker writes JSON array directly to the hidden input.
        const hiddenEl = document.getElementById(`dt-${q.key}`);
        const raw = hiddenEl ? hiddenEl.value : '';
        let picks = [];
        try {
          const parsed = JSON.parse(raw || '[]');
          if (Array.isArray(parsed)) picks = parsed.map(String).filter(Boolean);
        } catch { picks = []; }
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
        // Blood type
        const bloodChecked = [];
        document.querySelectorAll('[data-blood-type].dt-feed-vi-on').forEach(btn => bloodChecked.push(btn.dataset.bloodType));
        responses['_feed_blood_types'] = JSON.stringify(bloodChecked);
        const descEl = document.getElementById('dt-feeding_description');
        responses['feeding_description'] = descEl ? descEl.value : '';
        // Rote territory picker
        if (feedRoteAction) {
          const roteGridVals = {};
          for (const terr of FEEDING_TERRITORIES) {
            const terrKey = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            const el = document.getElementById(`feed-rote-val-${terrKey}`);
            roteGridVals[terrKey] = el ? el.value : 'none';
          }
          responses['feeding_territories_rote'] = JSON.stringify(roteGridVals);
        }
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

  // Aspiration structured slots — admin section, ADVANCED only.
  if (!_isMinimal) {
    for (let n = 1; n <= 3; n++) {
      const typeEl = document.getElementById(`dt-aspiration_${n}_type`);
      const textEl = document.getElementById(`dt-aspiration_${n}_text`);
      responses[`aspiration_${n}_type`] = typeEl ? typeEl.value : '';
      responses[`aspiration_${n}_text`] = textEl ? textEl.value : '';
    }
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
  // dt-form.17: in MINIMAL only the first slot is rendered; iterate just slot
  // 1 so slots 2-4 retain their prior values from the spread base.
  const projectSection = DOWNTIME_SECTIONS.find(s => s.key === 'projects');
  const projectSlotCount = _isMinimal ? 1 : (projectSection?.projectSlots || 4);
  for (let n = 1; n <= projectSlotCount; n++) {
    const actionEl = document.getElementById(`dt-project_${n}_action`);
    responses[`project_${n}_action`] = actionEl ? actionEl.value : '';
    for (const poolKey of ['pool', 'pool2']) {
      const prefix = `project_${n}_${poolKey}`;
      const attrEl = document.getElementById(`dt-${prefix}_attr`);
      const skillEl = document.getElementById(`dt-${prefix}_skill`);
      const discEl = document.getElementById(`dt-${prefix}_disc`);
      const specEl = document.getElementById(`dt-${prefix}_spec`);
      responses[`${prefix}_attr`] = attrEl ? attrEl.value : '';
      responses[`${prefix}_skill`] = skillEl ? skillEl.value : '';
      responses[`${prefix}_disc`] = discEl ? discEl.value : '';
      responses[`${prefix}_spec`] = specEl ? specEl.value : '';
    }
    const outcomeEl = document.getElementById(`dt-project_${n}_outcome`);
    const outcomeRadio = document.querySelector(`input[name="dt-project_${n}_outcome"]:checked`);
    const descEl = document.getElementById(`dt-project_${n}_description`);
    const titleEl = document.getElementById(`dt-project_${n}_title`);
    const terrEl = document.getElementById(`dt-project_${n}_territory`);
    const xpEl = document.getElementById(`dt-project_${n}_xp`);
    responses[`project_${n}_outcome`] = outcomeEl ? outcomeEl.value : (outcomeRadio ? outcomeRadio.value : '');
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
    // Target zone (unified: attack, hide_protect, investigate, patrol_scout, misc)
    const targetTypeRadio = document.querySelector(`input[name="dt-project_${n}_target_type"]:checked`);
    responses[`project_${n}_target_type`] = targetTypeRadio ? targetTypeRadio.value : '';
    const targetValueEl = document.getElementById(`dt-project_${n}_target_value`);
    responses[`project_${n}_target_value`] = targetValueEl ? targetValueEl.value : '';
    const targetTerrEl = document.getElementById(`dt-project_${n}_target_terr`);
    responses[`project_${n}_target_terr`] = targetTerrEl ? targetTerrEl.value : '';
    const targetOtherEl = document.getElementById(`dt-project_${n}_target_other`);
    responses[`project_${n}_target_other`] = targetOtherEl ? targetOtherEl.value : '';
    const ambienceDirEl = document.querySelector(`input[name="dt-project_${n}_ambience_dir"]:checked`);
    responses[`project_${n}_ambience_dir`] = ambienceDirEl ? ambienceDirEl.value : '';
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

    // JDT-4: support-slot personal notes
    const personalNotesEl = document.getElementById(`dt-project_${n}_personal_notes`);
    if (personalNotesEl) {
      responses[`project_${n}_personal_notes`] = personalNotesEl.value;
    }

    // JDT-2: Joint scratch fields. Persist the lead's in-flight joint authoring
    // state so a draft round-trip preserves it. The canonical joint document
    // is created on save via POST /api/downtime_cycles/:id/joint_projects.
    const soloJointRadio = document.querySelector(`input[name="dt-project_${n}_solo_joint"]:checked`);
    responses[`project_${n}_is_joint`] = soloJointRadio?.value === 'joint' ? 'yes' : '';
    const jointDescEl = document.getElementById(`dt-project_${n}_joint_description`);
    responses[`project_${n}_joint_description`] = jointDescEl ? jointDescEl.value : '';
    const jointTargetTypeEl = document.querySelector(`input[name="dt-project_${n}_joint_target_type"]:checked`);
    const jointTargetType = jointTargetTypeEl ? jointTargetTypeEl.value : '';
    responses[`project_${n}_joint_target_type`] = jointTargetType;
    if (jointTargetType === 'character') {
      // dt-form.16: charPicker writes JSON array directly to the hidden input.
      const hiddenEl = document.getElementById(`dt-project_${n}_joint_target_value`);
      const raw = hiddenEl ? hiddenEl.value : '';
      let ids = [];
      try {
        const parsed = JSON.parse(raw || '[]');
        if (Array.isArray(parsed)) ids = parsed.map(String).filter(Boolean);
      } catch { ids = []; }
      responses[`project_${n}_joint_target_value`] = JSON.stringify(ids);
    } else {
      const jointTargetValEl = document.getElementById(`dt-project_${n}_joint_target_value`);
      responses[`project_${n}_joint_target_value`] = jointTargetValEl ? jointTargetValEl.value : '';
    }
    // dtui-13: prefer hidden input (chip path) over legacy checkboxes (existingJoint re-invite path)
    const invitedHidden = document.getElementById(`dt-project_${n}_joint_invited_ids`);
    if (invitedHidden) {
      responses[`project_${n}_joint_invited_ids`] = invitedHidden.value;
    } else {
      const jointInviteeCbs = document.querySelectorAll(`.dt-joint-invitee-cb[data-joint-slot="${n}"]:checked`);
      const jointInviteeIds = [];
      jointInviteeCbs.forEach(cb => { if (cb.value) jointInviteeIds.push(cb.value); });
      responses[`project_${n}_joint_invited_ids`] = JSON.stringify(jointInviteeIds);
    }

    // Support Assets sphere/retainer chip selection — read from DOM so the
    // post-click state survives the responses replacement in re-render.
    const chipPanel = document.querySelector(`[data-support-assets-wrap="${n}"]`);
    if (chipPanel) {
      const selectedChips = chipPanel.querySelectorAll('[data-joint-sphere-slot].dt-chip--selected');
      const chipKeys = [...selectedChips].map(el => el.dataset.sphereKey).filter(Boolean);
      responses[`project_${n}_joint_sphere_chips`] = JSON.stringify(chipKeys);
    } else {
      // Panel not rendered (Support Assets ticker = Solo) — preserve prior value
      const prior = responseDoc?.responses?.[`project_${n}_joint_sphere_chips`];
      if (prior !== undefined) responses[`project_${n}_joint_sphere_chips`] = prior;
    }
  }

  // dt-form.17: collection of ADVANCED-only sections (sorcery, spheres,
  // status, contacts, retainers, acquisitions, equipment, skill acq) is
  // skipped in MINIMAL mode. Their prior values stay intact via the spread.
  if (!_isMinimal) {

  // Collect sorcery slots (dynamic count)
  const sorceryCountEl = document.getElementById('dt-sorcery-slot-count');
  const sorcerySlotCount = sorceryCountEl ? parseInt(sorceryCountEl.value, 10) || 1 : 1;
  responses['sorcery_slot_count'] = String(sorcerySlotCount);
  for (let n = 1; n <= sorcerySlotCount; n++) {
    const riteEl = document.getElementById(`dt-sorcery_${n}_rite`);
    responses[`sorcery_${n}_rite`] = riteEl ? riteEl.value : '';
    // DTFP-6: collect structured target rows for this sorcery slot.
    // Persisted shape: array of {type, value} objects, omitting empty rows.
    const targetsBlock = document.querySelector(`[data-sorcery-slot-targets="${n}"]`);
    if (targetsBlock) {
      const arr = [];
      targetsBlock.querySelectorAll('.dt-sorcery-target-row').forEach((row, ti) => {
        const typeEl = row.querySelector(`input[name="dt-sorcery_${n}_targets_${ti}_type"]:checked`);
        const valEl  = row.querySelector(`#dt-sorcery_${n}_targets_${ti}_value`);
        const type = typeEl ? typeEl.value : '';
        const value = valEl ? (valEl.value || '').trim() : '';
        if (type) arr.push({ type, value });
      });
      responses[`sorcery_${n}_targets`] = arr;
    } else {
      // No DOM block (slot not currently rendered) — preserve any previously-saved value
      const prior = responseDoc?.responses?.[`sorcery_${n}_targets`];
      if (prior !== undefined) responses[`sorcery_${n}_targets`] = prior;
    }
    const notesEl = document.getElementById(`dt-sorcery_${n}_notes`);
    responses[`sorcery_${n}_notes`] = notesEl ? notesEl.value : '';
    const mandEl = document.getElementById(`dt-sorcery_${n}_mandragora`);
    responses[`sorcery_${n}_mandragora`] = mandEl ? (mandEl.checked ? 'yes' : 'no') : 'no';
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
    for (const suffix of ['action', 'outcome', 'description', 'territory', 'block_merit', 'project_support', 'investigate_lead', 'grow_target']) {
      const el = document.getElementById(`dt-sphere_${n}_${suffix}`);
      if (el) responses[`sphere_${n}_${suffix}`] = el.value;
    }
    // Ambience direction (radio) — when sphere action is ambience_change, resolve
    // to legacy ambience_increase/ambience_decrease so downstream code is untouched.
    const dirEl = document.querySelector(`input[name="dt-sphere_${n}_ambience_dir"]:checked`);
    const ambienceDir = dirEl ? dirEl.value : '';
    responses[`sphere_${n}_ambience_dir`] = ambienceDir;
    if (responses[`sphere_${n}_action`] === 'ambience_change') {
      responses[`sphere_${n}_action`] = ambienceDir === 'degrade' ? 'ambience_decrease' : 'ambience_increase';
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
    // If this sphere is committed to a project's Support Assets, force action
    // to 'support'. The dropdown may still be rendered with an empty value at
    // first-click time; the chips are the source of truth for support state.
    const sphereSlotKey = `sphere_${n}`;
    for (let pn = 1; pn <= projectSlotCount; pn++) {
      let chips = [];
      try { chips = JSON.parse(responses[`project_${pn}_joint_sphere_chips`] || '[]'); } catch { chips = []; }
      if (Array.isArray(chips) && chips.includes(sphereSlotKey)) {
        responses[`sphere_${n}_action`] = 'support';
        break;
      }
    }
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
    // Ambience direction (radio) — resolve ambience_change to legacy values
    const stDirEl = document.querySelector(`input[name="dt-status_${n}_ambience_dir"]:checked`);
    const stAmbienceDir = stDirEl ? stDirEl.value : '';
    responses[`status_${n}_ambience_dir`] = stAmbienceDir;
    if (responses[`status_${n}_action`] === 'ambience_change') {
      responses[`status_${n}_action`] = stAmbienceDir === 'degrade' ? 'ambience_decrease' : 'ambience_increase';
    }
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
    // Preserve prior task data when the retainer row is locked into support
    // mode (its inputs are not rendered, so reading them would wipe the data).
    const priorType = responseDoc?.responses?.[`retainer_${n}_type`] || '';
    const priorTask = responseDoc?.responses?.[`retainer_${n}_task`] || '';
    responses[`retainer_${n}_type`] = typeEl ? typeEl.value : priorType;
    responses[`retainer_${n}_task`] = taskEl ? taskEl.value : priorTask;
    responses[`retainer_${n}_merit`] = meritEl ? meritEl.value : '';
    // Backwards compat: combined value in old key
    const combined = [responses[`retainer_${n}_type`], responses[`retainer_${n}_task`]].filter(Boolean).join('\n');
    responses[`retainer_${n}`] = combined;
  }

  // Acquisition fields (multi-slot, per-slot keys)
  const acqCountEl = document.getElementById('dt-acq-slot-count');
  const acqSlotCount = acqCountEl ? parseInt(acqCountEl.value, 10) || 1 : 1;
  responses['acq_slot_count'] = String(acqSlotCount);
  const acqSlots = [];
  for (let n = 1; n <= acqSlotCount; n++) {
    const descEl = document.getElementById(`dt-acq_${n}_description`);
    const availEl = document.getElementById(`dt-acq_${n}_availability`);
    responses[`acq_${n}_description`] = descEl ? descEl.value : '';
    responses[`acq_${n}_availability`] = availEl ? availEl.value : '';
    const cbs = document.querySelectorAll(`[data-acq-merit-cb="${n}"]:checked`);
    const keys = [];
    cbs.forEach(cb => keys.push(cb.value));
    responses[`acq_${n}_merits`] = JSON.stringify(keys);
    acqSlots.push({ description: responses[`acq_${n}_description`], availability: responses[`acq_${n}_availability`], merits: keys });
  }
  // Legacy keys: slot 1 mirror
  responses['acq_description']  = responses['acq_1_description']  || '';
  responses['acq_availability'] = responses['acq_1_availability'] || '';
  responses['acq_merits']       = responses['acq_1_merits']       || '[]';
  // Composite blob: all slots
  const resourcesM = (currentChar.merits || []).find(m => m.name === 'Resources');
  const resourcesRating = meritEffectiveRating(currentChar, resourcesM);
  const blobLines = [];
  if (resourcesRating) blobLines.push(`Resources ${resourcesRating}`);
  if (acqSlotCount === 1) {
    const s = acqSlots[0];
    if (s.merits.length) blobLines.push(`Merits: ${s.merits.join(', ')}`);
    if (s.description)   blobLines.push(s.description);
    if (s.availability)  blobLines.push(`Availability: ${s.availability === 'unknown' ? 'Unknown' : s.availability + '/5'}`);
  } else {
    acqSlots.forEach((s, i) => {
      blobLines.push('');
      blobLines.push(`--- Item ${i + 1} ---`);
      if (s.merits.length) blobLines.push(`Merits: ${s.merits.join(', ')}`);
      if (s.description)   blobLines.push(s.description);
      if (s.availability)  blobLines.push(`Availability: ${s.availability === 'unknown' ? 'Unknown' : s.availability + '/5'}`);
    });
  }
  responses['resources_acquisitions'] = blobLines.join('\n').replace(/^\n/, '').trim();

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
  // Backwards compat: enrich with pool + availability so text-only consumers see the full picture
  const _skPoolStr = skillAcqPoolStr(currentChar, {
    skill: responses['skill_acq_pool_skill'],
    spec: responses['skill_acq_pool_spec'],
  });
  responses['skill_acquisitions'] = [
    responses['skill_acq_description'],
    _skPoolStr ? `Pool: ${_skPoolStr}` : '',
    responses['skill_acq_availability']
      ? `Availability: ${responses['skill_acq_availability'] === 'unknown' ? 'Unknown' : responses['skill_acq_availability'] + '/5'}`
      : '',
  ].filter(Boolean).join('\n');

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

  } // end if (!_isMinimal) — ADVANCED-only collection

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

  // dt-form.17 (ADR-003 §Q3, §Q4): hard-mirror lifecycle. Compute the
  // derived bool, persist on responses, and on transition mirror to
  // submission.status + attendance.downtime.
  const completenessCtx = _completenessCtx();
  const hasMinimum = isMinimalComplete(responses, completenessCtx);
  responses._has_minimum = hasMinimum;
  const priorHasMinimum = !!responseDoc?.responses?._has_minimum;
  const flipped = priorHasMinimum !== hasMinimum;
  const nextStatus = hasMinimum ? 'submitted' : 'draft';

  try {
    if (!responseDoc) {
      responseDoc = await apiPost('/api/downtime_submissions', {
        character_id: currentChar._id,
        character_name: currentChar.name,
        cycle_id: currentCycle._id,
        status: nextStatus,
        responses,
      });
    } else {
      // Include status in the body so a status flip and the responses write
      // land in the same PUT — saves a round-trip and keeps the two fields
      // consistent on retry.
      const body = flipped ? { responses, status: nextStatus } : { responses };
      responseDoc = await apiPut(`/api/downtime_submissions/${responseDoc._id}`, body);
    }
    // Residency is now saved in the Regency tab
    if (statusEl) statusEl.textContent = 'Saved';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
    // DTU-2: server now has the truth, drop the local mirror.
    _clearLocalSnapshot();

    // dt-form.17: mirror to attendance.downtime on transition. Idempotent —
    // we still send the PATCH on flip, even if the bool is the same as last
    // time (e.g. on a fresh form load with no prior state).
    if (flipped && _activeGameSessionId && currentChar?._id) {
      try {
        await apiPatch(
          `/api/attendance/${encodeURIComponent(_activeGameSessionId)}/${encodeURIComponent(String(currentChar._id))}`,
          { downtime: hasMinimum }
        );
        // Local cache for XP-Available annotation; also flips the player
        // sheet's _gameXP on the next loadGameXP call.
        currentChar._dtHoldFlag = !hasMinimum;
      } catch {
        // Non-fatal — the bool can be reconciled at cycle-close. The 423
        // gate handler logs to status if cycle is closed.
      }
    } else if (currentChar) {
      currentChar._dtHoldFlag = !hasMinimum;
    }

    // JDT-2: After the submission save lands, fan out joint creations for any
    // slot that authored a joint and doesn't yet have a backing joint document.
    await createPendingJoints(responses);
  } catch (err) {
    // dt-form.17 §Q11: surface the cycle-close 423 with a stable message.
    if (err && /CYCLE_CLOSED|423|Cycle is closed/i.test(err.message || '')) {
      if (statusEl) statusEl.textContent = 'Cycle closed; submission locked';
    } else if (statusEl) {
      statusEl.textContent = 'Save failed: ' + err.message;
    }
  }
}

// JDT-3: Accept a pending invitation. On success the server returns the
// updated invitation, joint, slot number, and the invitee's submission with
// the joint markers written into slot N. We refresh local caches and
// re-render. Race condition (409) → reload invitations and re-render.
async function handleInvitationAccept(invId, container) {
  if (!invId) return;
  const statusEl = document.getElementById('dt-save-status');
  try {
    const result = await apiPost(`/api/project_invitations/${invId}/accept`, {});
    if (result?.submission) responseDoc = result.submission;
    await refreshJointCaches();
    if (statusEl) {
      statusEl.textContent = `Joined slot ${result?.slot ?? ''}`.trim();
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
    }
    renderForm(container);
  } catch (err) {
    if (/no longer pending|no longer available|409/i.test(err.message)) {
      await refreshJointCaches();
      renderForm(container);
      if (statusEl) {
        statusEl.textContent = 'This invitation is no longer available. The list has been refreshed.';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
      }
    } else if (statusEl) {
      statusEl.textContent = 'Accept failed: ' + err.message;
    }
  }
}

async function handleInvitationDecline(invId, container) {
  if (!invId) return;
  const statusEl = document.getElementById('dt-save-status');
  try {
    await apiPost(`/api/project_invitations/${invId}/decline`, {});
    await refreshJointCaches();
    renderForm(container);
  } catch (err) {
    if (/no longer pending|409/i.test(err.message)) {
      await refreshJointCaches();
      renderForm(container);
      if (statusEl) {
        statusEl.textContent = 'This invitation is no longer available. The list has been refreshed.';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
      }
    } else if (statusEl) {
      statusEl.textContent = 'Decline failed: ' + err.message;
    }
  }
}

// JDT-6: voluntary decouple from an accepted joint. Confirms with the
// player, then calls /api/project_invitations/:id/decouple. On success the
// server has cleared the joint slot fields on the submission; we re-fetch
// the cycle + invitations and re-render to show the slot reverted to a
// normal empty project slot.
async function handleInvitationDecouple(invId, container) {
  if (!invId) return;
  const ok = window.confirm('Decouple from this joint? Your slot will be freed up.');
  if (!ok) return;
  const statusEl = document.getElementById('dt-save-status');
  try {
    const result = await apiPost(`/api/project_invitations/${invId}/decouple`, {});
    if (result?.submission) responseDoc = result.submission;
    await refreshJointCaches();
    if (statusEl) {
      statusEl.textContent = 'Decoupled.';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
    }
    renderForm(container);
  } catch (err) {
    if (/not accepted|409/i.test(err.message)) {
      await refreshJointCaches();
      renderForm(container);
      if (statusEl) {
        statusEl.textContent = 'This joint is no longer in a state that can be decoupled. Refreshed.';
        setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
      }
    } else if (statusEl) {
      statusEl.textContent = 'Decouple failed: ' + err.message;
    }
  }
}

// JDT-6: lead re-invite. Reads the ticked checkboxes inside the re-invite
// panel and calls /api/downtime_cycles/:id/joint_projects/:jointId/reinvite.
async function handleJointReinvite(jointId, container) {
  if (!jointId || !currentCycle?._id) return;
  const cbs = container.querySelectorAll(`.dt-joint-reinvite-cb[data-joint-id="${jointId}"]:checked`);
  const ids = Array.from(cbs).map(cb => cb.value).filter(Boolean);
  const statusEl = container.querySelector(`.dt-joint-reinvite-status[data-joint-id="${jointId}"]`);
  if (!ids.length) {
    if (statusEl) {
      statusEl.textContent = 'Tick at least one alternate to invite.';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 3000);
    }
    return;
  }
  try {
    await apiPost(`/api/downtime_cycles/${currentCycle._id}/joint_projects/${jointId}/reinvite`, {
      invitee_character_ids: ids,
    });
    await refreshJointCaches();
    renderForm(container);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Re-invite failed: ' + err.message;
  }
}

// JDT-6: lead cancel. Server enforces zero-supports / zero-pending precondition.
async function handleJointCancel(jointId, container) {
  if (!jointId || !currentCycle?._id) return;
  const ok = window.confirm('Cancel this joint? Your slot will be freed up. The joint will remain on the cycle for audit.');
  if (!ok) return;
  const statusEl = container.querySelector(`.dt-joint-cancel-status[data-joint-id="${jointId}"]`);
  try {
    await apiPost(`/api/downtime_cycles/${currentCycle._id}/joint_projects/${jointId}/cancel`, {});
    await refreshJointCaches();
    // Lead's slot was cleared server-side; re-fetch the submission so the
    // local responseDoc shows the cleared slot fields on next render.
    if (responseDoc?._id) {
      try {
        const subs = await apiGet(`/api/downtime_submissions?cycle_id=${currentCycle._id}`);
        const fresh = (subs || []).find(s => String(s._id) === String(responseDoc._id));
        if (fresh) responseDoc = fresh;
      } catch { /* keep existing */ }
    }
    renderForm(container);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Cancel failed: ' + err.message;
  }
}

// JDT-6: lead saves an edit to joint description. Bumps description_updated_at
// server-side so support slots can render the change indicator on next render.
async function handleJointDescriptionSave(jointId, container) {
  if (!jointId || !currentCycle?._id) return;
  // Locate the textarea inside the same authoring panel as this save button.
  const btn = container.querySelector(`.dt-joint-desc-save-btn[data-joint-id="${jointId}"]`);
  const textareaEl = btn?.closest('.dt-joint-authoring')?.querySelector('textarea[id$="_joint_description"]');
  if (!textareaEl) return;
  const description = textareaEl.value;
  const statusEl = container.querySelector(`.dt-joint-desc-save-status[data-joint-id="${jointId}"]`);
  try {
    await apiPatch(`/api/downtime_cycles/${currentCycle._id}/joint_projects/${jointId}`, { description });
    await refreshJointCaches();
    if (statusEl) {
      statusEl.textContent = 'Saved.';
      setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2500);
    }
    renderForm(container);
  } catch (err) {
    if (statusEl) statusEl.textContent = 'Save failed: ' + err.message;
  }
}

// JDT-6: support clicks "View and acknowledge" on the description-changed
// indicator. Sets participant.description_change_acknowledged_at to now so
// the indicator clears on next render.
async function handleJointDescriptionAcknowledge(jointId, charId, container) {
  if (!jointId || !charId || !currentCycle?._id) return;
  try {
    await apiPost(`/api/downtime_cycles/${currentCycle._id}/joint_projects/${jointId}/participants/${charId}/acknowledge`, {});
    await refreshJointCaches();
    renderForm(container);
  } catch (err) {
    const statusEl = document.getElementById('dt-save-status');
    if (statusEl) statusEl.textContent = 'Acknowledge failed: ' + err.message;
  }
}

// JDT-3: re-fetch the cycle (joint_projects array changes on accept) and the
// invitations list so badges, panels, and slot UI all reflect the latest state.
async function refreshJointCaches() {
  if (!currentCycle?._id || currentCycle._id === 'dev-stub') return;
  try {
    const cycles = await apiGet('/api/downtime_cycles');
    const fresh = cycles.find(c => String(c._id) === String(currentCycle._id));
    if (fresh) {
      const prevStatusOverride = currentCycle.status !== fresh.status && location.hostname === 'localhost'
        ? currentCycle.status
        : null;
      currentCycle = prevStatusOverride ? { ...fresh, status: prevStatusOverride } : fresh;
    }
  } catch { /* keep prior cycle */ }
  try {
    _jointInvitations = await apiGet(`/api/project_invitations?cycle_id=${encodeURIComponent(currentCycle._id)}`) || [];
  } catch { /* keep prior invitations */ }
}

// JDT-2: For each slot where the lead has selected Joint mode, has invitees,
// and no joint yet exists on cycle.joint_projects, create the joint + invitations
// via POST /api/downtime_cycles/:cycleId/joint_projects. Refresh local cycle and
// invitation caches afterwards so the next render shows the saved state.
async function createPendingJoints(responses) {
  if (!responseDoc?._id || !currentCycle?._id) return;
  if (currentCycle._id === 'dev-stub') return;

  const slotsToCreate = [];
  for (let n = 1; n <= 4; n++) {
    if (responses[`project_${n}_is_joint`] !== 'yes') continue;
    const action = responses[`project_${n}_action`];
    if (!JOINT_ELIGIBLE_ACTIONS.includes(action)) continue;
    if (findExistingJoint(n)) continue;

    let inviteeIds = [];
    try { inviteeIds = JSON.parse(responses[`project_${n}_joint_invited_ids`] || '[]'); }
    catch { inviteeIds = []; }
    if (!inviteeIds.length) continue;

    slotsToCreate.push({
      slot: n,
      action,
      description: responses[`project_${n}_joint_description`] || '',
      target_type: responses[`project_${n}_joint_target_type`] || null,
      target_value: responses[`project_${n}_joint_target_value`] || null,
      invitee_character_ids: inviteeIds.map(String),
    });
  }
  if (!slotsToCreate.length) return;

  let anyCreated = false;
  for (const s of slotsToCreate) {
    try {
      await apiPost(`/api/downtime_cycles/${currentCycle._id}/joint_projects`, {
        lead_character_id: String(currentChar._id),
        lead_submission_id: String(responseDoc._id),
        lead_project_slot: s.slot,
        description: s.description,
        action_type: s.action,
        target_type: s.target_type,
        target_value: s.target_value,
        invitee_character_ids: s.invitee_character_ids,
      });
      anyCreated = true;
    } catch (err) {
      const statusEl = document.getElementById('dt-save-status');
      if (statusEl) statusEl.textContent = `Joint create failed (slot ${s.slot}): ${err.message}`;
    }
  }

  if (anyCreated) {
    await refreshJointCaches();
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
      _allSubmissions = subs || [];
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

  // Mandragora 2b: when there's no existing submission for this cycle, seed
  // sorcery slots from any rites the character has parked in their Mandragora
  // Garden (powers[].mandragora_parked === true). Parked rites are sustained
  // from the previous downtime — pre-filling avoids the player re-entering
  // them every cycle. Only fires when responseDoc is fully null (no server
  // doc, no local draft); existing drafts are respected.
  if (!responseDoc && currentChar?.powers && currentCycle && currentCycle._id !== 'dev-stub') {
    const parked = currentChar.powers.filter(
      p => p.category === 'rite' && p.mandragora_parked === true,
    );
    if (parked.length > 0) {
      const seeded = { sorcery_slot_count: String(parked.length) };
      parked.forEach((rite, i) => {
        const n = i + 1;
        seeded[`sorcery_${n}_rite`] = rite.name;
        seeded[`sorcery_${n}_mandragora`] = 'yes';
      });
      responseDoc = { responses: seeded };
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
  _activeGameSessionId = null;
  try {
    let attUrl = '/api/attendance?character_id=' + encodeURIComponent(String(currentChar._id));
    if (currentCycle?.game_number) attUrl += '&game_number=' + currentCycle.game_number;
    const att = await apiGet(attUrl);
    gateValues.attended = att.attended ? 'yes' : 'no';
    lastGameAttendees = att.attendees || [];
    _activeGameSessionId = att.session_id || null;
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

  // Publish character data to the universal picker (ADR-003 §Q6).
  setCharPickerSources({
    all: allCharacters.map(c => ({ id: String(c.id), name: c.name })),
    attendees: lastGameAttendees.map(a => ({ id: String(a.id), name: a.name })),
  });

  // Auto-detect regent status from character data
  gateValues.is_regent = findRegentTerritory(_territories, currentChar)?.territory ? 'yes' : 'no';

  // JDT-2: load invitations visible to this character on the current cycle.
  // Used by the joint authoring panel for live status badges (lead view) and
  // by JDT-3 for the invitee inbox. Best-effort — empty array on error.
  _jointInvitations = [];
  if (currentCycle?._id && currentCycle._id !== 'dev-stub') {
    try {
      _jointInvitations = await apiGet(`/api/project_invitations?cycle_id=${encodeURIComponent(currentCycle._id)}`) || [];
    } catch { _jointInvitations = []; }
  }

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
    if (!devPreview && !_isST && _gateBlocks) {
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
  if (!devPreview && !_isST && _gateBlocks) {
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

// ── Universal character picker plumbing (ADR-003 §Q6) ────────────────────
// Picker render sites emit a placeholder element marked with [data-cp-mount];
// after innerHTML assignment, mountCharPickers() replaces each placeholder
// with a live charPicker instance whose onChange writes back to a hidden
// input (so existing collection paths keep working) and triggers scheduleSave.

function mountCharPickers(container) {
  const placeholders = container.querySelectorAll('[data-cp-mount]');
  placeholders.forEach(ph => {
    const site = ph.dataset.cpSite || '';
    const scope = ph.dataset.cpScope === 'attendees' ? 'attendees' : 'all';
    const cardinality = ph.dataset.cpCardinality === 'multi' ? 'multi' : 'single';
    const placeholderText = ph.dataset.cpPlaceholder || '';
    let initial;
    try { initial = JSON.parse(ph.dataset.cpInitial || (cardinality === 'multi' ? '[]' : '""')); }
    catch { initial = (cardinality === 'multi' ? [] : ''); }
    let excludeIds = [];
    try { excludeIds = JSON.parse(ph.dataset.cpExclude || '[]'); } catch { excludeIds = []; }

    const hiddenId = ph.dataset.cpHidden || '';
    const onChange = _makeCharPickerOnChange(site, hiddenId, cardinality);
    const el = charPicker({ scope, cardinality, initial, onChange, placeholder: placeholderText, excludeIds });
    el.dataset.cpMountedSite = site;
    if (hiddenId) el.dataset.cpMountedHidden = hiddenId;
    if (placeholderText) el.dataset.cpMountedPlaceholder = placeholderText;
    if (ph.className) el.classList.add(...ph.className.split(/\s+/).filter(Boolean));
    ph.replaceWith(el);
  });
}

function _writeHidden(hiddenId, value) {
  if (!hiddenId) return;
  const el = document.getElementById(hiddenId);
  if (el) el.value = value;
}

function _makeCharPickerOnChange(site, hiddenId, cardinality) {
  if (site === 'shoutout') {
    // 3-pick cap preserved from prior behaviour. Locked picker signature has
    // no max-N parameter, so over-cap selections are reverted by remounting
    // the picker with the trimmed list.
    return (next) => {
      const arr = Array.isArray(next) ? next : [];
      if (arr.length > 3) {
        const trimmed = arr.slice(0, 3);
        _writeHidden(hiddenId, JSON.stringify(trimmed));
        scheduleSave();
        _remountShoutoutPicker(trimmed);
        return;
      }
      _writeHidden(hiddenId, JSON.stringify(arr));
      scheduleSave();
    };
  }
  if (cardinality === 'multi') {
    return (next) => {
      const arr = Array.isArray(next) ? next : [];
      _writeHidden(hiddenId, JSON.stringify(arr));
      scheduleSave();
    };
  }
  return (next) => {
    _writeHidden(hiddenId, typeof next === 'string' ? next : '');
    scheduleSave();
  };
}

function _remountShoutoutPicker(trimmed) {
  const cur = document.querySelector('[data-cp-mounted-site="shoutout"]');
  if (!cur) return;
  const hiddenId = cur.dataset.cpMountedHidden || '';
  const placeholderText = cur.dataset.cpMountedPlaceholder || '';
  const fresh = charPicker({
    scope: 'attendees',
    cardinality: 'multi',
    initial: trimmed,
    onChange: _makeCharPickerOnChange('shoutout', hiddenId, 'multi'),
    placeholder: placeholderText,
    excludeIds: [],
  });
  fresh.dataset.cpMountedSite = 'shoutout';
  if (hiddenId) fresh.dataset.cpMountedHidden = hiddenId;
  if (placeholderText) fresh.dataset.cpMountedPlaceholder = placeholderText;
  cur.replaceWith(fresh);
}

// dt-form.17 (ADR-003 §Q1, §Q2): MINIMAL vs ADVANCED mode gate.
// Sections in MINIMAL_SECTIONS render in both modes; everything else is
// hidden in MINIMAL (per ADR §Q2 lock — "not rendered, not just display:none").
const MINIMAL_SECTIONS = new Set(['court', 'personal_story', 'feeding', 'projects', 'regency']);

function _formMode(saved) {
  return saved?._mode === 'advanced' ? 'advanced' : 'minimal';
}

function _isSectionVisibleInMode(sectionKey, mode) {
  if (mode === 'advanced') return true;
  return MINIMAL_SECTIONS.has(sectionKey);
}

function _completenessCtx() {
  return {
    isRegent: gateValues.is_regent === 'yes',
    regencyConfirmed: _isRegencyConfirmedThisCycle(),
  };
}

function _isRegencyConfirmedThisCycle() {
  if (!currentCycle?.regent_confirmations) return false;
  const ri = findRegentTerritory(_territories, currentChar);
  if (!ri?.territoryId) return false;
  return (currentCycle.regent_confirmations || []).some(
    c => String(c.territory_id) === String(ri.territoryId)
  );
}

// dt-form.31 (ADR-003 §Q5): Submit Final modal. ADVANCED-only affordance
// that lets a player declare "I am done editing" via responses._final_submitted_at.
// Mirrors the existing .npcr-modal pattern (admin-layout.css) but lives in
// components.css under .dt-modal-* so the player surface picks it up.
function openSubmitFinalModal(container) {
  // Render fresh markup each time so the action-spent counts reflect the
  // current responses (per §Q9, ADVANCED + MINIMAL-filled shows zeros).
  closeSubmitFinalModal();
  const saved = responseDoc?.responses || {};
  const totals = {
    projectSlots:     DOWNTIME_SECTIONS.find(s => s.key === 'projects')?.projectSlots || 4,
    sphereSlots:      Math.min((detectedMerits.spheres || []).length, 5),
    statusSlots:      Math.min((detectedMerits.status || []).length, 5),
    contactSlots:     Math.min((detectedMerits.contacts || []).length, 5),
    retainerSlots:    (detectedMerits.retainers || []).length,
    acquisitionSlots: parseInt(saved.acq_slot_count || '1', 10) || 1,
    sorcerySlots:     parseInt(saved.sorcery_slot_count || '0', 10) || 0,
    equipmentSlots:   parseInt(saved.equipment_slot_count || '0', 10) || 0,
  };
  const summary = actionSpentSummary(saved, totals);
  const lines = formatActionSpentSummary(summary);

  const overlay = document.createElement('div');
  overlay.className = 'dt-modal-overlay';
  overlay.id = 'dt-submit-final-overlay';
  overlay.setAttribute('role', 'presentation');

  const titleId = 'dt-submit-final-title';
  let h = '';
  h += `<div class="dt-modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}">`;
  h += `<h3 class="dt-modal-title" id="${titleId}">Submit Final</h3>`;
  h += '<div class="dt-modal-body">';
  h += '<p class="qf-section-intro">Use this when you are done editing. Your downtime will continue auto-saving until the cycle deadline; this just records the moment you stopped.</p>';

  // Action-spent summary
  h += '<h4 class="dt-modal-subhead">This cycle so far</h4>';
  if (lines.length) {
    h += '<ul class="dt-modal-summary-list">';
    for (const line of lines) {
      h += `<li>${esc(line)}</li>`;
    }
    h += '</ul>';
  } else {
    h += '<p class="qf-desc">No actions filled in yet.</p>';
  }

  // Optional rate-the-form widget — lifted from the removed Admin section
  // (SUBMIT_FINAL_MODAL_QUESTIONS in downtime-data.js) so the existing
  // star_rating + textarea widgets render via renderQuestion(), unchanged.
  h += '<h4 class="dt-modal-subhead">Rate the form (optional)</h4>';
  for (const q of SUBMIT_FINAL_MODAL_QUESTIONS) {
    h += renderQuestion(q, saved[q.key] || '');
  }
  h += '</div>'; // dt-modal-body

  // Actions
  h += '<div class="dt-modal-actions">';
  h += '<button type="button" class="qf-btn qf-btn-save" data-dt-final-cancel>Cancel</button>';
  h += '<button type="button" class="qf-btn qf-btn-submit-final" data-dt-final-confirm>Submit Final</button>';
  h += '</div>';

  h += '</div>'; // dt-modal
  overlay.innerHTML = h;
  document.body.appendChild(overlay);

  // Focus management: send focus to the dialog so screen readers announce it.
  overlay.querySelector('.dt-modal')?.focus({ preventScroll: true });

  // Escape closes the modal.
  overlay.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeSubmitFinalModal(); }
  });
}

function closeSubmitFinalModal() {
  const el = document.getElementById('dt-submit-final-overlay');
  if (el) el.remove();
}

async function handleSubmitFinalConfirm(container) {
  // Collect the rating widget values from the modal so they round-trip on
  // the next save. Star rating writes to a hidden input; textarea writes
  // straight to its DOM node. We seed them onto responseDoc so collectResponses
  // (which iterates over rendered form fields, not the modal) keeps the values.
  if (!responseDoc) responseDoc = { responses: {} };
  if (!responseDoc.responses) responseDoc.responses = {};
  for (const q of SUBMIT_FINAL_MODAL_QUESTIONS) {
    const el = document.getElementById('dt-' + q.key);
    if (el) responseDoc.responses[q.key] = el.value;
  }
  responseDoc.responses._final_submitted_at = new Date().toISOString();
  closeSubmitFinalModal();
  // Re-render the form so the button label flips to "Update Final Submission",
  // then save so the new field reaches the server. Save handles the toast
  // status banner via the auto-mirror lifecycle.
  renderForm(container);
  scheduleSave();
  const statusEl = document.getElementById('dt-save-status');
  if (statusEl) {
    statusEl.textContent = 'Final submission recorded; keep editing until the deadline.';
    setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 4000);
  }
}

function renderForm(container) {
  const saved = responseDoc?.responses || {};
  const status = responseDoc?.status || 'new';
  const isST = isSTRole();
  const isSubmitted = status === 'submitted';

  // dt-form.17: derive _mode + _has_minimum on every render so the gate and
  // banner reflect the latest state. The persistent fields are written by
  // the lifecycle hook in scheduleSave; this is read-only here.
  const mode = _formMode(saved);
  const ctx = _completenessCtx();
  const hasMinimum = isMinimalComplete(saved, ctx);
  const missing = hasMinimum ? [] : missingMinimumPieces(saved, ctx);

  // Re-publish picker sources every render — guards against another module
  // (regency-tab) overwriting them between navigations.
  setCharPickerSources({
    all: allCharacters.map(c => ({ id: String(c.id), name: c.name })),
    attendees: lastGameAttendees.map(a => ({ id: String(a.id), name: a.name })),
  });

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
    h += '<div class="qf-results-pending"><p class="qf-results-pending-msg">Your downtime is submitted. You can keep editing until the deadline — changes auto-save and update your submission.</p></div>';
  } else if (!published && priorPublishedLabel) {
    h += `<div class="qf-results-banner">&#x2713; Your <strong>${esc(priorPublishedLabel)}</strong> results are published &mdash; see the <strong>Story</strong> tab.</div>`;
  }

  // dt-form.17 (ADR-003 §Q1): mode selector at top of form.
  h += '<div class="dt-mode-selector" role="group" aria-label="Form mode">';
  h += `<button type="button" class="dt-mode-pill${mode === 'minimal' ? ' dt-mode-pill--active' : ''}" data-dt-mode="minimal" aria-pressed="${mode === 'minimal'}">Minimal</button>`;
  h += `<button type="button" class="dt-mode-pill${mode === 'advanced' ? ' dt-mode-pill--active' : ''}" data-dt-mode="advanced" aria-pressed="${mode === 'advanced'}">Advanced</button>`;
  h += '<span class="dt-mode-desc">';
  h += mode === 'minimal'
    ? 'Just the essentials. Switch to Advanced for the full form — your data is preserved either way.'
    : 'All sections shown. Switch back to Minimal at any time without losing what you have entered.';
  h += '</span>';
  h += '</div>';

  // dt-form.17 (ADR-003 §Q3): persistent below-minimum banner with the
  // missing-pieces list. Locked copy per story §Banner copy.
  if (!hasMinimum) {
    h += '<div class="dt-min-banner" role="status" aria-live="polite">';
    h += '<p class="dt-min-banner__lead"><strong>Your form is below minimum-complete.</strong> Your downtime XP credit is on hold. Add the missing pieces to restore it:</p>';
    if (missing.length) {
      h += '<ul class="dt-min-banner__list">';
      for (const item of missing) {
        h += `<li>${esc(item.label)}</li>`;
      }
      h += '</ul>';
    }
    h += '</div>';
  } else if (mode === 'minimal') {
    // dt-form.31 (ADR-003 §Q5): MINIMAL auto-submit confirmation toast.
    // Locked copy. Persistent — stays as long as the form is above minimum
    // in MINIMAL mode. ADVANCED uses the Submit Final modal instead.
    h += '<div class="dt-min-toast" role="status" aria-live="polite">';
    h += '<p class="dt-min-toast__lead"><strong>Submitted</strong> — keep editing until the deadline.</p>';
    h += '</div>';
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
    if (discDots(currentChar, 'Cruac') > 0) traditions.push('Cruac');
    if (discDots(currentChar, 'Theban') > 0) traditions.push('Theban');
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
    // dt-form.31: admin section removed from DOWNTIME_SECTIONS. Defensive skip
    // kept in case legacy data or imports re-introduce the key.
    if (section.key === 'admin') continue;
    if (section.key === 'territory') continue;
    if (section.key === 'feeding') continue;
    if (section.key === 'regency') continue;
    if (section.key === 'personal_story') continue; // rendered explicitly below
    // dt-form.17: hide non-minimal sections when in MINIMAL mode (court is in
    // MINIMAL so it falls through; trust/harm/aspirations live in admin).
    if (!_isSectionVisibleInMode(section.key, mode)) continue;

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
  if (gateValues.has_sorcery === 'yes' && _isSectionVisibleInMode('blood_sorcery', mode)) {
    h += renderSorcerySection(saved);
  }

  // ── Territory then Feeding — players see ambience/cap before choosing hunt method ──
  for (const key of ['territory', 'feeding']) {
    if (!_isSectionVisibleInMode(key, mode)) continue;
    const section = DOWNTIME_SECTIONS.find(s => s.key === key);
    if (!section) continue;
    h += `<div class="qf-section collapsed" data-gate-section="" data-section-key="${key}">`;
    h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
    h += '<div class="qf-section-body">';
    if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
    for (const q of section.questions) {
      // territory_grid in the feeding section is rendered inside dt-feed-card-wrap
      if (key === 'feeding' && q.type === 'territory_grid') continue;
      h += renderQuestion(q, saved[q.key] || '');
    }
    h += '</div></div>';
  }

  // ── Projects section with dynamic slots ──
  // dt-form.17: in MINIMAL only the first project slot renders.
  h += renderProjectSlots(saved, mode);

  // dt-form.17: ADVANCED-only sections below the projects.
  if (mode === 'advanced') {
    // ── Dynamic merit sections ──
    h += renderMeritToggles(saved);

    // ── Acquisitions (custom render) ──
    h += renderAcquisitionsSection(saved);

    // ── Equipment (dynamic rows) ──
    h += renderEquipmentSection(saved);
  }

  // dt-form.31: 'admin' removed from DOWNTIME_SECTIONS — find() returns
  // undefined for it and the body is skipped. Loop kept for vamping.
  for (const key of ['vamping']) {
    if (!_isSectionVisibleInMode(key, mode)) continue;
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

  // dt-form.31: form-rating hide hack removed — the rating widget now lives
  // in the Submit Final modal (ADVANCED only); not in the form body.

  // Actions
  const submitLabel = responseDoc?.status === 'submitted' ? 'Update Submission' : 'Submit Downtime';
  h += '<div class="qf-actions">';
  h += '<button class="qf-btn qf-btn-save" id="dt-btn-save">Save Draft</button>';
  h += `<button class="qf-btn qf-btn-submit" id="dt-btn-submit">${esc(submitLabel)}</button>`;
  // dt-form.31 (ADR-003 §Q5): ADVANCED-only Submit Final affordance. Opens
  // the modal; the modal sets responses._final_submitted_at on confirm.
  // Per §Q9 the button is mode-conditional, not state-conditional — an
  // ADVANCED player who only filled MINIMAL still sees it (the modal
  // shows zeros in that case).
  if (mode === 'advanced') {
    const finalAt = saved._final_submitted_at;
    const finalLabel = finalAt ? 'Update Final Submission' : 'Submit Final';
    h += `<button type="button" class="qf-btn qf-btn-submit-final" id="dt-btn-submit-final">${esc(finalLabel)}</button>`;
  }
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

  // Mount universal character pickers in place of their placeholders.
  // Re-runs on every renderForm because innerHTML wipes prior mounts.
  mountCharPickers(container);

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
    // dt-form.17: Mode pill toggle. Persist on responses._mode and re-render.
    // Switching preserves entered data (per ADR §Q1 Resolutions): non-MINIMAL
    // fields stay in responses; only their UI is hidden.
    const modePill = e.target.closest('[data-dt-mode]');
    if (modePill) {
      const next = modePill.dataset.dtMode === 'advanced' ? 'advanced' : 'minimal';
      const cur = collectResponses();
      cur._mode = next;
      if (responseDoc) responseDoc.responses = cur;
      else responseDoc = { responses: cur };
      renderForm(container);
      scheduleSave();
      return;
    }
    // dt-form.31: Submit Final button (ADVANCED only) opens the modal.
    if (e.target.closest('#dt-btn-submit-final')) {
      e.preventDefault();
      openSubmitFinalModal(container);
      return;
    }
    // dt-form.31: Submit Final modal action delegations.
    const modalConfirm = e.target.closest('[data-dt-final-confirm]');
    if (modalConfirm) {
      e.preventDefault();
      handleSubmitFinalConfirm(container);
      return;
    }
    const modalCancel = e.target.closest('[data-dt-final-cancel]');
    if (modalCancel) {
      e.preventDefault();
      closeSubmitFinalModal();
      return;
    }
    // Click on the overlay (outside the modal box) dismisses the modal.
    if (e.target.classList?.contains('dt-modal-overlay')) {
      closeSubmitFinalModal();
      return;
    }
    // DTOSL.2 choice chip handler — removed in NPCR.12 (replaced by the
    // single relationships picker in renderPersonalStorySection).

    // JDT-3: pending invitation Accept / Decline
    const acceptBtn = e.target.closest('.dt-pending-invitation-accept');
    if (acceptBtn && !acceptBtn.disabled) {
      handleInvitationAccept(acceptBtn.dataset.invitationId, container);
      return;
    }
    const declineBtn = e.target.closest('.dt-pending-invitation-decline');
    if (declineBtn) {
      handleInvitationDecline(declineBtn.dataset.invitationId, container);
      return;
    }

    // JDT-6: voluntary decouple from an accepted joint
    const decoupleBtn = e.target.closest('.dt-joint-decouple-btn');
    if (decoupleBtn) {
      handleInvitationDecouple(decoupleBtn.dataset.invitationId, container);
      return;
    }
    // JDT-6: lead re-invite alternates
    const reinviteBtn = e.target.closest('.dt-joint-reinvite-btn');
    if (reinviteBtn) {
      handleJointReinvite(reinviteBtn.dataset.jointId, container);
      return;
    }
    // JDT-6: lead cancel joint
    const cancelBtn = e.target.closest('.dt-joint-cancel-btn');
    if (cancelBtn) {
      handleJointCancel(cancelBtn.dataset.jointId, container);
      return;
    }
    // JDT-6: lead description save (mid-cycle edit)
    const descSaveBtn = e.target.closest('.dt-joint-desc-save-btn');
    if (descSaveBtn) {
      handleJointDescriptionSave(descSaveBtn.dataset.jointId, container);
      return;
    }
    // JDT-6: support acknowledge description change
    const ackBtn = e.target.closest('.dt-joint-desc-acknowledge-btn');
    if (ackBtn) {
      handleJointDescriptionAcknowledge(ackBtn.dataset.jointId, ackBtn.dataset.characterId, container);
      return;
    }

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
      const slot = isSkill ? null : (acqUnknown.dataset.acqUnknown || null);
      const inputId = isSkill ? 'dt-skill_acq_availability' : (slot ? `dt-acq_${slot}_availability` : 'dt-acq_availability');
      const input = document.getElementById(inputId);
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
      const slot = isSkill ? null : (acqDot.dataset.acqSlot || null);
      const inputId = isSkill ? 'dt-skill_acq_availability' : (slot ? `dt-acq_${slot}_availability` : 'dt-acq_availability');
      const input = document.getElementById(inputId);
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

    // Personal story free-text NPC name — sync to hidden fields and update tick
    if (e.target.id === 'dt-personal_story_npc_name_free') {
      const val    = e.target.value.trim();
      const idEl   = document.getElementById('dt-personal_story_npc_id');
      const nameEl = document.getElementById('dt-personal_story_npc_name');
      if (idEl)   idEl.value   = val ? '__new__' : '';
      if (nameEl) nameEl.value = val;
      scheduleSave();
      updateSectionTicks(container);
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
    // JDT-2: Solo/Joint toggle — re-render to show/hide the joint authoring panel
    const soloJoint = e.target.closest('[data-project-solo-joint]');
    if (soloJoint) {
      activeProjectTab = parseInt(soloJoint.dataset.projectSoloJoint, 10);
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Single/Dual roll toggle — show or hide the secondary dice pool
    const poolCountRadio = e.target.closest('[data-project-pool-count]');
    if (poolCountRadio) {
      const slot = poolCountRadio.dataset.projectPoolCount;
      const wrap = container.querySelector(`[data-secondary-wrap="${slot}"]`);
      if (wrap) {
        if (poolCountRadio.value === 'dual') {
          wrap.removeAttribute('hidden');
        } else {
          wrap.querySelectorAll('select').forEach(sel => { sel.value = ''; });
          wrap.setAttribute('hidden', '');
          scheduleSave();
        }
      }
      return;
    }
    // Solo / Support Assets toggle — show or hide the Allies/Retainers picker
    const supportAssetsRadio = e.target.closest('[data-project-support-assets]');
    if (supportAssetsRadio) {
      const slot = supportAssetsRadio.dataset.projectSupportAssets;
      const wrap = container.querySelector(`[data-support-assets-wrap="${slot}"]`);
      if (wrap) {
        if (supportAssetsRadio.value === 'support') {
          wrap.removeAttribute('hidden');
        } else {
          // Reuse the existing chip-click handler to deselect each chip
          // cleanly — keeps sphere_${i}_action and joint_sphere_chips in sync.
          wrap.querySelectorAll('[data-joint-sphere-slot].dt-chip--selected').forEach(chip => chip.click());
          wrap.setAttribute('hidden', '');
          scheduleSave();
        }
      }
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
    // Grow target dots — re-render to update XP cost display
    if (e.target.dataset.growTarget !== undefined) {
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
    // Attack outcome ticker radio
    const projOutcome = e.target.closest('[data-proj-outcome]');
    if (projOutcome) {
      scheduleSave();
      return;
    }
    // Ambience direction ticker — re-render so desc/prompt/outcome update
    const projAmbienceDir = e.target.closest('[data-proj-ambience-dir]');
    if (projAmbienceDir) {
      activeProjectTab = parseInt(projAmbienceDir.dataset.projAmbienceDir, 10);
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Sphere/Status ambience direction ticker — re-render so resolved action reflects direction
    const sphereAmbienceDir = e.target.closest('[data-sphere-ambience-dir]');
    if (sphereAmbienceDir) {
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Dice pool dropdown — update total, then re-render so spec chips appear
    // (or disappear) for the newly-selected skill. Skill change clears any
    // stale spec from the prior skill.
    const poolSelect = e.target.closest('[data-pool-prefix]');
    if (poolSelect) {
      const prefix = poolSelect.dataset.poolPrefix;
      updatePoolTotal(prefix);
      // If the changed dropdown is the skill picker, clear any stale spec.
      if (poolSelect.id === `dt-${prefix}_skill`) {
        const specHidden = document.getElementById(`dt-${prefix}_spec`);
        if (specHidden) specHidden.value = '';
      }
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Project dice pool spec chip — toggle selection and re-render
    const poolSpecChip = e.target.closest('[data-pool-spec]');
    if (poolSpecChip) {
      const prefix = poolSpecChip.dataset.poolSpec;
      const specName = poolSpecChip.dataset.specName;
      const hidden = document.getElementById(`dt-${prefix}_spec`);
      if (hidden) hidden.value = hidden.value === specName ? '' : specName;
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
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
    if (e.target.id === 'dt-skill_acq_pool_skill') {
      // Clear spec when skill changes
      {
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
    // Blood type toggle — single-select pill buttons
    const bloodBtn = e.target.closest('[data-blood-type]');
    if (bloodBtn) {
      const wasOn = bloodBtn.classList.contains('dt-feed-vi-on');
      document.querySelectorAll('[data-blood-type]').forEach(b => b.classList.remove('dt-feed-vi-on'));
      if (!wasOn) bloodBtn.classList.add('dt-feed-vi-on');
      scheduleSave();
      return;
    }
    // Rote hunt toggle (Standard / Rote pill pair)
    const roteBtn = e.target.closest('[data-feed-rote]');
    if (roteBtn) {
      feedRoteAction = roteBtn.dataset.feedRote === 'on';
      applyRoteToProjectSlot(container);
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
    // DTFP-6: sorcery target row add / remove
    const addTargetBtn = e.target.closest('.dt-sorcery-target-add-btn');
    if (addTargetBtn) {
      const responses = collectResponses();
      const slot = addTargetBtn.dataset.sorcerySlot;
      const key = `sorcery_${slot}_targets`;
      const arr = Array.isArray(responses[key]) ? responses[key] : [];
      arr.push({ type: '', value: '' });
      responses[key] = arr;
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    const removeTargetBtn = e.target.closest('.dt-sorcery-target-remove-btn');
    if (removeTargetBtn) {
      const responses = collectResponses();
      const slot = removeTargetBtn.dataset.sorcerySlot;
      const idx = Number(removeTargetBtn.dataset.targetIdx);
      const key = `sorcery_${slot}_targets`;
      const arr = Array.isArray(responses[key]) ? responses[key] : [];
      arr.splice(idx, 1);
      if (arr.length === 0) arr.push({ type: '', value: '' }); // keep one empty row
      responses[key] = arr;
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
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
    // dt-form.16: target character chip handler removed — universal charPicker
    // mounted in renderTargetCharOrOther handles its own selection lifecycle.
    // Maintenance merit chip — single-select, writes to hidden target_value input
    const maintChip = e.target.closest('[data-maintenance-target]');
    if (maintChip && !maintChip.disabled) {
      const slotNum = maintChip.dataset.maintenanceTarget;
      const mPrefix = maintChip.dataset.maintenancePrefix || 'project';
      const targetId = maintChip.dataset.targetId;
      const hidden = document.getElementById(`dt-${mPrefix}_${slotNum}_target_value`);
      const wasSelected = maintChip.classList.contains('dt-chip--selected');
      container.querySelectorAll(`[data-maintenance-target="${slotNum}"]`).forEach(c => c.classList.remove('dt-chip--selected'));
      if (!wasSelected) {
        maintChip.classList.add('dt-chip--selected');
        if (hidden) hidden.value = targetId;
      } else {
        if (hidden) hidden.value = '';
      }
      scheduleSave();
      return;
    }
    // dt-form.16: joint invitee chip handler removed — universal charPicker
    // mounted in renderJointInviteeChips handles its own selection lifecycle.
    // dt-form.16: shoutout chip handler removed — universal charPicker mounted
    // in the shoutout_picks case handles selection and 3-pick cap via remount.

    const sphereCharChip = e.target.closest('[data-sphere-char-target]');
    if (sphereCharChip && !sphereCharChip.disabled) {
      const prefixN = sphereCharChip.dataset.sphereCharTarget; // e.g. 'sphere_2'
      const charId = sphereCharChip.dataset.charId;
      const wasSelected = sphereCharChip.classList.contains('dt-chip--selected');
      container.querySelectorAll(`[data-sphere-char-target="${prefixN}"]`).forEach(el => el.classList.remove('dt-chip--selected'));
      const hidden = document.getElementById(`dt-${prefixN}_target_value`);
      if (!wasSelected) {
        sphereCharChip.classList.add('dt-chip--selected');
        saved[`${prefixN}_target_value`] = charId;
        if (hidden) hidden.value = charId;
      } else {
        saved[`${prefixN}_target_value`] = '';
        if (hidden) hidden.value = '';
      }
      scheduleSave();
      return;
    }
    // DTUI-14: sphere-merit collaborator chip — multi-select, auto-commits Support
    const sphereChip = e.target.closest('[data-joint-sphere-slot]');
    if (sphereChip && !sphereChip.disabled) {
      const n = sphereChip.dataset.jointSphereSlot;
      const slotKey = sphereChip.dataset.sphereKey;
      const type = sphereChip.dataset.sphereType;
      const willSelect = !sphereChip.classList.contains('dt-chip--selected');
      sphereChip.classList.toggle('dt-chip--selected', willSelect);
      if (type === 'sphere') {
        saved[`${slotKey}_action`] = willSelect ? 'support' : '';
      }
      const allSphereChips = container.querySelectorAll(`[data-joint-sphere-slot="${n}"]`);
      const keys = [...allSphereChips]
        .filter(el => el.classList.contains('dt-chip--selected'))
        .map(el => el.dataset.sphereKey);
      saved[`project_${n}_joint_sphere_chips`] = JSON.stringify(keys);
      // T24 (DTLT-6): re-render so the sphere pane lock badge appears immediately
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
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
        p.classList.toggle('dt-chip--selected', p.dataset.terrVal === newVal);
      });
      scheduleSave();
      updateSectionTicks(container);
      return;
    }
    // Single-select feeding territory pills (main)
    const feedTerrPill = e.target.closest('[data-feed-terr-key]');
    if (feedTerrPill) {
      const terrKey = feedTerrPill.dataset.feedTerrKey;
      const statusVal = feedTerrPill.dataset.feedStatus;
      const isActive = feedTerrPill.dataset.feedActive === '1';
      container.querySelectorAll('[data-feed-terr-key]').forEach(pill => {
        const key = pill.dataset.feedTerrKey;
        if (key !== terrKey) {
          const h = document.getElementById(`feed-val-${key}`);
          if (h) h.value = 'none';
        }
      });
      const hidden = document.getElementById(`feed-val-${terrKey}`);
      if (hidden) hidden.value = isActive ? 'none' : statusVal;
      // Sync rote selection: clear it if the new main selection makes it invalid.
      // A rote pick is invalid when (main=Barrens AND rote!=Barrens) or
      // (main!=Barrens AND rote=Barrens).
      const newMainIsBarrens = !isActive && statusVal === 'barrens';
      container.querySelectorAll('[data-feed-rote-terr-key]').forEach(rotePill => {
        const rk = rotePill.dataset.feedRoteTerrKey;
        const rh = document.getElementById(`feed-rote-val-${rk}`);
        if (!rh || rh.value === 'none') return;
        const roteIsBarrens = rotePill.dataset.feedRoteStatus === 'barrens';
        if (newMainIsBarrens !== roteIsBarrens) rh.value = 'none';
      });
      const responses = collectResponses();
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Single-select rote territory pills
    const feedRoteTerrPill = e.target.closest('[data-feed-rote-terr-key]');
    if (feedRoteTerrPill) {
      const terrKey = feedRoteTerrPill.dataset.feedRoteTerrKey;
      const statusVal = feedRoteTerrPill.dataset.feedRoteStatus;
      const isActive = feedRoteTerrPill.dataset.feedRoteActive === '1';
      container.querySelectorAll('[data-feed-rote-terr-key]').forEach(pill => {
        const key = pill.dataset.feedRoteTerrKey;
        if (key !== terrKey) {
          const h = document.getElementById(`feed-rote-val-${key}`);
          if (h) h.value = 'none';
        }
      });
      const hidden = document.getElementById(`feed-rote-val-${terrKey}`);
      if (hidden) hidden.value = isActive ? 'none' : statusVal;
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
    // Mandragora Garden checkbox — re-render so the capacity counter and
    // disabled state on other slots' Park toggles update (2c).
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
      }
      // Clear last slot
      delete responses[`sorcery_${current}_rite`];
      delete responses[`sorcery_${current}_targets`];
      delete responses[`sorcery_${current}_notes`];
      delete responses[`sorcery_${current}_mandragora`];
      responses['sorcery_slot_count'] = String(Math.max(1, current - 1));
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Add Acquisition button
    if (e.target.closest('#dt-add-acquisition')) {
      const responses = collectResponses();
      const countEl = document.getElementById('dt-acq-slot-count');
      const current = countEl ? parseInt(countEl.value, 10) || 1 : 1;
      responses['acq_slot_count'] = String(current + 1);
      if (responseDoc) responseDoc.responses = responses;
      else responseDoc = { responses };
      renderForm(container);
      return;
    }
    // Remove Acquisition button
    const removeAcqBtn = e.target.closest('[data-remove-acq]');
    if (removeAcqBtn) {
      const removeN = parseInt(removeAcqBtn.dataset.removeAcq, 10);
      const responses = collectResponses();
      const countEl = document.getElementById('dt-acq-slot-count');
      const current = countEl ? parseInt(countEl.value, 10) || 1 : 1;
      for (let n = removeN; n < current; n++) {
        responses[`acq_${n}_description`]  = responses[`acq_${n + 1}_description`]  || '';
        responses[`acq_${n}_availability`] = responses[`acq_${n + 1}_availability`] || '';
        responses[`acq_${n}_merits`]       = responses[`acq_${n + 1}_merits`]       || '[]';
      }
      delete responses[`acq_${current}_description`];
      delete responses[`acq_${current}_availability`];
      delete responses[`acq_${current}_merits`];
      responses['acq_slot_count'] = String(Math.max(1, current - 1));
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
  if (feedRoteAction) {
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

function renderProjectSlots(saved, mode = 'advanced') {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'projects');
  // dt-form.17 (ADR-003 §Q2): MINIMAL renders one project slot only.
  const slotCount = mode === 'minimal' ? 1 : (section?.projectSlots || 4);

  // Build attribute/skill/discipline option lists from character data
  const attrs = ALL_ATTRS.filter(a => getAttrTotal(currentChar, a) > 0);
  const skills = ALL_SKILLS.filter(s => skTotal(currentChar, s) > 0);
  const discs = Object.keys(currentChar.disciplines || {}).filter(d => discDots(currentChar, d) > 0);

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
  // JDT-3: pending joint invitations sit at the top of the projects section
  // so the player sees them as soon as they expand.
  h += renderPendingInvitationsPanel();
  h += renderMaintenanceWarnings(currentChar, currentCycle);
  if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;

  // ── Tab bar ──
  h += '<div class="dt-proj-tabs">';
  for (let n = 1; n <= slotCount; n++) {
    const actionVal = saved[`project_${n}_action`] || '';
    let icon, label;
    if (actionVal === 'ambience_change') {
      const dir = saved[`project_${n}_ambience_dir`] || 'improve';
      icon = dir === 'improve' ? '▲' : '▼';
      label = dir === 'improve' ? 'Ambience +' : 'Ambience −';
    } else {
      icon = ACTION_ICONS[actionVal] || ACTION_ICONS[''];
      label = ACTION_SHORT[actionVal] || 'No Action';
    }
    const active = n === activeProjectTab ? ' dt-proj-tab-active' : '';
    const noAction = !actionVal ? ' dt-proj-tab-empty' : '';
    // JDT-4: Joint badge on the tab when this slot has a joint role.
    const jointRole = saved[`project_${n}_joint_role`];
    const jointTabClass = jointRole ? ' dt-proj-tab-joint' : '';
    const jointBadge = jointRole ? `<span class="dt-proj-tab-joint-badge">Joint</span>` : '';
    h += `<button type="button" class="dt-proj-tab${active}${noAction}${jointTabClass}" data-proj-tab="${n}">`;
    h += `<span class="dt-proj-tab-icon">${icon}</span>`;
    h += `<span class="dt-proj-tab-num">Action ${n}</span>`;
    h += `<span class="dt-proj-tab-label">${esc(label)}</span>`;
    h += jointBadge;
    h += '</button>';
  }
  h += '</div>';

  // ── Tab panes ──
  for (let n = 1; n <= slotCount; n++) {
    let actionVal = saved[`project_${n}_action`] || '';
    const visible = n === activeProjectTab;
    // Legacy backward-compat: normalise old ambience action types to ambience_change (dtui-10)
    if (actionVal === 'ambience_increase' || actionVal === 'ambience_decrease') {
      const legacyDir = actionVal === 'ambience_increase' ? 'improve' : 'degrade';
      if (!saved[`project_${n}_ambience_dir`]) saved[`project_${n}_ambience_dir`] = legacyDir;
      actionVal = 'ambience_change';
    }
    let fields = ACTION_FIELDS[actionVal] || [];

    // JDT-4: support-slot detection (set early so the pane wrapper class is right).
    const slotJointRole = saved[`project_${n}_joint_role`];
    const slotJointId = saved[`project_${n}_joint_id`];
    const isSupportSlot = slotJointRole === 'support' && !!slotJointId;

    h += `<div class="dt-proj-pane${visible ? '' : ' dt-proj-pane-hidden'}${isSupportSlot ? ' dt-proj-support-pane' : ''}" data-proj-pane="${n}">`;

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

    // ── JDT-4: support slot — locked, read-only joint metadata + editable
    // pool builder + personal notes textarea. Skip the normal action-type
    // select and per-action fields entirely.
    if (isSupportSlot) {
      const joint = (currentCycle?.joint_projects || [])
        .find(j => String(j._id) === String(slotJointId) && !j.cancelled_at);
      if (!joint) {
        h += `<div class="dt-proj-pane-orphaned">`;
        h += `<p class="qf-desc">This joint project is no longer available. Contact your Storyteller.</p>`;
        h += `</div></div>`;
        continue;
      }
      const lead = allCharacters.find(c => String(c.id) === String(joint.lead_character_id));
      const leadName = lead ? lead.name : 'Unknown lead';
      const personalNotes = saved[`project_${n}_personal_notes`] || '';
      const actionLabel = (PROJECT_ACTIONS.find(a => a.value === joint.action_type)?.label) || joint.action_type;

      h += `<div class="dt-proj-support-header">Support <span class="dt-proj-support-sep">— joint with</span> <strong>${esc(leadName)}</strong></div>`;

      // JDT-6: lead description-change indicator
      const myParticipantForAck = (joint.participants || []).find(p =>
        String(p.character_id) === String(currentChar._id) && !p.decoupled_at
      );
      const updatedAt = joint.description_updated_at;
      const ackedAt = myParticipantForAck?.description_change_acknowledged_at;
      const showIndicator = updatedAt && (!ackedAt || new Date(updatedAt) > new Date(ackedAt));
      if (showIndicator) {
        h += `<div class="dt-joint-desc-changed-indicator">`;
        h += `<strong>The lead has updated this project description.</strong>`;
        h += `<button type="button" class="dt-joint-desc-acknowledge-btn" data-joint-id="${esc(joint._id)}" data-character-id="${esc(String(currentChar._id))}">View and acknowledge</button>`;
        h += `</div>`;
      }

      h += `<div class="dt-proj-support-readonly-block">`;
      h += `<div class="dt-proj-support-label">Action type</div>`;
      h += `<div class="dt-proj-support-action">${esc(actionLabel)}</div>`;

      h += `<div class="dt-proj-support-label">Joint description</div>`;
      const descText = (joint.description || '').trim();
      if (descText) {
        h += `<div class="dt-proj-support-desc">${esc(descText)}</div>`;
      } else {
        h += `<div class="dt-proj-support-desc dt-proj-support-desc-empty">No description provided.</div>`;
      }

      if (joint.target_type) {
        let targetLbl = '';
        if (joint.target_type === 'character') {
          let ids = [];
          try {
            const parsed = JSON.parse(joint.target_value || '[]');
            ids = Array.isArray(parsed) ? parsed : (joint.target_value ? [joint.target_value] : []);
          } catch { ids = joint.target_value ? [joint.target_value] : []; }
          targetLbl = ids
            .map(id => allCharacters.find(x => String(x.id) === String(id))?.name || id)
            .join(', ');
        } else if (joint.target_type === 'territory') {
          targetLbl = TERRITORY_DATA.find(t => t.slug === joint.target_value)?.name || joint.target_value || '';
        } else {
          targetLbl = joint.target_value || '';
        }
        if (targetLbl) {
          h += `<div class="dt-proj-support-label">Joint target</div>`;
          h += `<div class="dt-proj-support-target">${esc(targetLbl)}</div>`;
        }
      }
      h += `</div>`;

      // Editable pool builders — same shape as a normal slot, so saves
      // reuse project_${n}_pool_attr/skill/disc + pool2_* paths.
      h += renderDicePool(n, 'pool', 'Primary Dice Pool', attrs, skills, discs, saved);
      h += renderSecondaryDicePool(n, attrs, skills, discs, saved);

      // Personal notes
      h += `<div class="qf-field">`;
      h += `<label class="qf-label" for="dt-project_${n}_personal_notes">Your personal notes</label>`;
      h += `<p class="qf-desc">What do you bring to this joint? What is your character's angle on it?</p>`;
      h += `<textarea id="dt-project_${n}_personal_notes" class="qf-textarea" rows="4">${esc(personalNotes)}</textarea>`;
      h += `</div>`;

      // JDT-6: Decouple — voluntary exit from this joint. The participant's
      // invitation_id is recorded on joint.participants when accept landed.
      const myParticipant = (joint.participants || []).find(p =>
        String(p.submission_id) === String(responseDoc?._id) &&
        Number(p.project_slot) === Number(n) &&
        !p.decoupled_at
      );
      if (myParticipant?.invitation_id) {
        h += `<div class="dt-joint-decouple-row">`;
        h += `<button type="button" class="dt-joint-decouple-btn" data-invitation-id="${esc(myParticipant.invitation_id)}">Decouple from this joint</button>`;
        h += `<p class="qf-desc dt-joint-decouple-help">Decoupling frees this slot. The lead is notified, and you can use the slot for a different project.</p>`;
        h += `</div>`;
      }

      h += `</div>`; // close dt-proj-pane
      continue;
    }

    // ── JDT-2: detect existing joint up front so JDT-6 can lock the
    // action-type select while the joint has active invitations. ──
    const isJointEligible = JOINT_ELIGIBLE_ACTIONS.includes(actionVal);
    const existingJoint = isJointEligible ? findExistingJoint(n) : null;
    const isJoint = isJointEligible && (existingJoint != null || saved[`project_${n}_is_joint`] === 'yes');

    // JDT-6: action-type change is blocked while the joint has any pending
    // or accepted (non-decoupled) invitation. Lead must cancel the joint
    // first to repurpose the slot.
    let lockActionType = false;
    if (existingJoint) {
      const activeInvs = _jointInvitations.filter(inv =>
        String(inv.joint_project_id) === String(existingJoint._id) &&
        (inv.status === 'pending' || inv.status === 'accepted')
      );
      if (activeInvs.length > 0) lockActionType = true;
    }

    h += '<div class="dt-action-block">';

    // Action type selector — always visible
    h += '<div class="qf-field">';
    h += `<label class="qf-label" for="dt-project_${n}_action">Action Type ${n === 1 ? '<span class="qf-req">*</span>' : ''}</label>`;
    const actionSelectAttrs = lockActionType
      ? ' disabled title="Cancel the joint first to change action type."'
      : '';
    h += `<select id="dt-project_${n}_action" class="qf-select" data-project-action="${n}"${actionSelectAttrs}>`;
    for (const opt of availableActions) {
      const sel = actionVal === opt.value ? ' selected' : '';
      h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
    }
    h += '</select>';
    if (lockActionType) {
      h += `<p class="qf-desc dt-action-type-locked-help">This joint has active invitations. Cancel the joint first to change action type.</p>`;
    }
    h += '</div>';

    // .dt-action-desc — descriptive copy for the selected action type
    const ambienceDir = saved[`project_${n}_ambience_dir`] || 'improve';
    const descKey = actionVal === 'ambience_change' ? `ambience_change_${ambienceDir}` : actionVal;
    const actionDesc = ACTION_DESCRIPTIONS[descKey] || '';
    h += `<p class="dt-action-desc" aria-live="polite">${esc(actionDesc)}</p>`;

    // Backward-compat: saved support actions are no longer a valid action type
    if (actionVal === 'support') {
      h += '<p class="qf-desc dt-action-legacy-notice">This action type is no longer available. Please select a new action type.</p>';
    }

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
        placeholder: 'Describe the activity or events that justify this growth.',
      }, saved[`project_${n}_xp_trait`] || '');

      h += '</div>';
    }

    if (fields.includes('title')) {
      h += renderQuestion({
        key: `project_${n}_title`, label: 'Project Title',
        type: 'text', required: false,
        placeholder: 'A short name for this project.',
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

    // ── Desired outcome ──
    if (fields.includes('outcome')) {
      h += renderOutcomeZone(n, actionVal, saved);
    }

    // ── Target zone ──
    if (fields.includes('target')) {
      h += renderTargetZone(n, actionVal, saved, allCharacters);
    }

    // ── Investigate lead (mandatory for investigate) ──
    if (fields.includes('investigate_lead')) {
      h += renderQuestion({
        key: `project_${n}_investigate_lead`, label: 'What is your lead on this investigation? ✱',
        type: 'textarea', required: true,
        desc: 'Provide a specific starting point, source, or known fact. Investigations without a lead cannot proceed.',
      }, saved[`project_${n}_investigate_lead`] || '');
    }

    // ── Dice pools ──
    if (fields.includes('pools')) {
      h += renderDicePool(n, 'pool', 'Primary Dice Pool', attrs, skills, discs, saved);
      h += renderSecondaryDicePool(n, attrs, skills, discs, saved);
    }

    // ── XP note ──
    if (fields.includes('xp')) {
      h += renderQuestion({
        key: `project_${n}_xp`, label: 'XP Expenditure',
        type: 'textarea', required: false, rows: 2,
        placeholder: 'Describe what you are spending XP on in this action.',
      }, saved[`project_${n}_xp`] || '');
    }

    // ── Approach ──
    if (fields.includes('description')) {
      const approachText = saved[`project_${n}_description`] || '';
      const promptKey = actionVal === 'ambience_change' ? `ambience_change_${ambienceDir}` : actionVal;
      const approachPrompt = ACTION_APPROACH_PROMPTS[promptKey] || 'Describe your approach in narrative terms.';
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-project_${n}_description">Approach</label>`;
      h += `<textarea id="dt-project_${n}_description" class="qf-textarea" rows="4" placeholder="${esc(approachPrompt)}">${esc(approachText)}</textarea>`;
      h += '</div>';
    }

    // ── Solo/Joint toggle — bottom of block (dtui-5) ──
    if (isJointEligible) {
      h += `<fieldset class="dt-ticker" data-proj-solo-joint-ticker="${n}">`;
      h += `<legend class="dt-ticker__legend">Mode</legend>`;
      h += `<label class="dt-ticker__pill">`;
      h += `<input type="radio" name="dt-project_${n}_solo_joint" value="solo"${!isJoint ? ' checked' : ''} data-project-solo-joint="${n}"${existingJoint ? ' disabled' : ''}>`;
      h += `Solo</label>`;
      h += `<label class="dt-ticker__pill">`;
      h += `<input type="radio" name="dt-project_${n}_solo_joint" value="joint"${isJoint ? ' checked' : ''} data-project-solo-joint="${n}">`;
      h += `Joint</label>`;
      h += `</fieldset>`;
      if (isJoint) {
        h += renderJointAuthoring(n, saved, existingJoint);
      }

      // Support Assets toggle — gates the Allies/Retainers picker so it
      // doesn't read as required. Auto-defaults to "Support Assets" if any
      // chips were saved previously, so returning players see their picks.
      const hasAssetMerits = (detectedMerits.spheres?.length || 0) + (detectedMerits.retainers?.length || 0) > 0;
      if (hasAssetMerits) {
        const savedChips = saved[`project_${n}_joint_sphere_chips`];
        const isSupport = !!(savedChips && savedChips !== '[]');
        h += `<fieldset class="dt-ticker" data-proj-support-assets-ticker="${n}">`;
        h += `<legend class="dt-ticker__legend">Support</legend>`;
        h += `<label class="dt-ticker__pill">`;
        h += `<input type="radio" name="dt-project_${n}_support_assets" value="solo"${!isSupport ? ' checked' : ''} data-project-support-assets="${n}">`;
        h += `Solo</label>`;
        h += `<label class="dt-ticker__pill">`;
        h += `<input type="radio" name="dt-project_${n}_support_assets" value="support"${isSupport ? ' checked' : ''} data-project-support-assets="${n}">`;
        h += `Support Assets</label>`;
        h += `</fieldset>`;
        h += `<div class="dt-support-assets-panel" data-support-assets-wrap="${n}"${isSupport ? '' : ' hidden'}>`;
        h += `<h4 class="dt-joint-panel__heading">Your Allies and Retainers</h4>`;
        h += `<div class="dt-chip-grid dt-chip-grid--multi">`;
        h += renderJointSphereChips(n, saved);
        h += `</div>`;
        h += `</div>`;
      }
    }

    h += '</div>'; // dt-action-block
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
  const savedDisc  = saved[`${prefix}_disc`]  || '';
  const savedSpec  = saved[`${prefix}_spec`]  || '';
  const bestSpecs  = savedSkill ? (currentChar.skills?.[savedSkill]?.specs || []) : [];

  // Calculate total from saved selections
  let total = 0;
  if (savedAttr) total += getAttrEffective(currentChar, savedAttr);
  if (savedSkill) total += skTotal(currentChar, savedSkill);
  if (savedDisc) total += discDots(currentChar, savedDisc);
  if (savedSpec && bestSpecs.includes(savedSpec)) {
    const na = skNineAgain(currentChar, savedSkill);
    total += (na || hasAoE(currentChar, savedSpec)) ? 2 : 1;
  }

  let h = '<div class="qf-field">';
  h += `<label class="qf-label">${esc(label)}</label>`;
  h += '<div class="dt-dice-pool-row">';

  // Attribute dropdown
  h += `<select id="dt-${prefix}_attr" class="qf-select dt-pool-select" data-pool-prefix="${prefix}">`;
  h += '<option value="">Attribute</option>';
  for (const a of attrs) {
    const dots = getAttrEffective(currentChar, a);
    const sel = savedAttr === a ? ' selected' : '';
    h += `<option value="${esc(a)}"${sel}>${esc(a)} (${dots})</option>`;
  }
  h += '</select>';

  // Skill dropdown
  h += `<select id="dt-${prefix}_skill" class="qf-select dt-pool-select" data-pool-prefix="${prefix}">`;
  h += '<option value="">Skill</option>';
  for (const s of skills) {
    const dots = skTotal(currentChar, s);
    const specs = currentChar.skills?.[s]?.specs?.length ? ` [${currentChar.skills[s].specs.join(', ')}]` : '';
    const sel = savedSkill === s ? ' selected' : '';
    h += `<option value="${esc(s)}"${sel}>${esc(s)} (${dots})${esc(specs)}</option>`;
  }
  h += '</select>';

  // Discipline dropdown (optional)
  h += `<select id="dt-${prefix}_disc" class="qf-select dt-pool-select" data-pool-prefix="${prefix}">`;
  h += '<option value="">Discipline</option>';
  for (const d of discs) {
    const dots = discDots(currentChar, d);
    const sel = savedDisc === d ? ' selected' : '';
    h += `<option value="${esc(d)}"${sel}>${esc(d)} (${dots})</option>`;
  }
  h += '</select>';

  // Total
  h += `<span class="dt-pool-total" id="${prefix}_total">${total || '—'}</span>`;
  h += '</div>';

  // Spec chip row
  h += `<input type="hidden" id="dt-${prefix}_spec" value="${esc(savedSpec)}">`;
  if (savedSkill && bestSpecs.length > 0) {
    h += '<div class="dt-feed-spec-row">';
    h += '<label class="dt-feed-disc-lbl">Specialisation:</label>';
    for (const sp of bestSpecs) {
      const on = savedSpec === sp ? ' dt-feed-spec-on' : '';
      const na = skNineAgain(currentChar, savedSkill);
      const bonus = (na || hasAoE(currentChar, sp)) ? 2 : 1;
      h += `<button type="button" class="dt-feed-spec-chip${on}" data-pool-spec="${esc(prefix)}" data-spec-name="${esc(sp)}">${esc(sp)} <span class="dt-feed-spec-bonus">+${bonus}</span></button>`;
    }
    h += '</div>';
  }

  h += '</div>';
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

/**
 * Renders the optional Secondary Dice Pool behind a Single Roll / Dual Roll
 * pill toggle (mirrors the Solo/Joint pattern). Defaults to Single. If the
 * slot has any saved pool2 values, the toggle starts on Dual.
 */
function renderSecondaryDicePool(n, attrs, skills, discs, saved) {
  const isDual = !!(saved[`project_${n}_pool2_attr`] || saved[`project_${n}_pool2_skill`] || saved[`project_${n}_pool2_disc`]);
  let h = '';
  h += `<fieldset class="dt-ticker" data-proj-pool-count-ticker="${n}">`;
  h += `<legend class="dt-ticker__legend">Roll</legend>`;
  h += `<label class="dt-ticker__pill">`;
  h += `<input type="radio" name="dt-project_${n}_pool_count" value="single"${!isDual ? ' checked' : ''} data-project-pool-count="${n}">`;
  h += `Single Roll</label>`;
  h += `<label class="dt-ticker__pill">`;
  h += `<input type="radio" name="dt-project_${n}_pool_count" value="dual"${isDual ? ' checked' : ''} data-project-pool-count="${n}">`;
  h += `Dual Roll</label>`;
  h += `</fieldset>`;
  h += `<div class="dt-secondary-pool-wrap" data-secondary-wrap="${n}"${isDual ? '' : ' hidden'}>`;
  h += renderDicePool(n, 'pool2', 'Secondary Dice Pool (optional)', attrs, skills, discs, saved);
  h += '</div>';
  return h;
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
    case 'rite': {
      const rule = (getRulesByCategory('rite') || []).find(r => r.name === item);
      const rank = rule?.rank || 1;
      return rank >= 4 ? 2 : 1;
    }
    default: return 0;
  }
}

function getItemsForCategory(category) {
  const c = currentChar;
  switch (category) {
    case 'attribute':
      return ALL_ATTRS.map(a => {
        const dots = getAttrEffective(c, a);
        if (dots >= 5) return null;
        return { value: a, label: `${a} (${dots} → ${dots + 1})` };
      }).filter(Boolean);
    case 'skill':
      return ALL_SKILLS.map(s => {
        const dots = skTotal(c, s);
        if (dots >= 5) return null;
        return { value: s, label: `${s} (${dots} → ${dots + 1})` };
      }).filter(Boolean);
    case 'discipline': {
      // Character's current disciplines + all core clan discs they might learn.
      // Filter against canonical discipline names — defence-in-depth against legacy
      // data leaks (e.g. retired themes; see specs/stories/dtlt.3.*).
      const owned = Object.keys(c.disciplines || {});
      const clanDiscs = (c.bloodline && BLOODLINE_DISCS[c.bloodline])
        || (c.clan && CLAN_DISCS[c.clan]) || [];
      const bloodlineDiscs = (c.bloodline && BLOODLINE_DISCS[c.bloodline]) || [];
      const validDiscs = new Set([...CORE_DISCS, ...RITUAL_DISCS, ...bloodlineDiscs]);
      const all = [...new Set([...clanDiscs, ...CORE_DISCS, ...owned])]
        .filter(d => validDiscs.has(d))
        .sort();
      return all.map(d => {
        const dots = discDots(c, d);
        if (dots >= 5) return null;
        const cost = isClanDisc(d) ? 3 : 4;
        const tag = isClanDisc(d) ? 'clan' : 'out';
        return { value: d, label: `${d} (${dots} → ${dots + 1}) [${tag}, ${cost} XP]` };
      }).filter(Boolean);
    }
    case 'merit': {
      const items = [];
      const charMerits = c.merits || [];
      function currentMeritDots(meritName) {
        const found = charMerits.filter(m =>
          m.name && m.name.toLowerCase() === meritName.toLowerCase()
        );
        return found.length ? Math.max(...found.map(m => meritEffectiveRating(c, m))) : 0;
      }

      // Try rules cache first, fallback to MERITS_DB
      const meritRules = getRulesByCategory('merit');
      if (meritRules.length) {
        for (const rule of meritRules) {
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
      const cruacLevel = discDots(c, 'Cruac');
      const thebanLevel = discDots(c, 'Theban');
      if (cruacLevel === 0 && thebanLevel === 0) return [];
      const ownedRiteNames = new Set(
        (c.powers || []).filter(p => p.category === 'rite').map(p => p.name)
      );
      const allRites = getRulesByCategory('rite') || [];
      const items = [];
      for (const rule of allRites) {
        if (ownedRiteNames.has(rule.name)) continue;
        const tradition = rule.parent;
        const charRank = tradition === 'Cruac' ? cruacLevel
                       : tradition === 'Theban' ? thebanLevel
                       : 0;
        if (charRank === 0) continue;
        const rank = rule.rank || 1;
        if (rank > charRank) continue;
        items.push({ value: rule.name, label: `${rule.name} (${tradition} Rank ${rank})` });
      }
      items.sort((a, b) => a.label.localeCompare(b.label));
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

// Issue #24: Personal Story — free-text NPC name + interaction note.
// Replaces the NPCR.12 relationships picker. Players name any NPC they know
// and describe the interaction; no registered relationship required.

function renderPersonalStorySection(saved) {
  const section = DOWNTIME_SECTIONS.find(s => s.key === 'personal_story');
  if (!section) return '';

  const savedName = saved['personal_story_npc_name'] || '';
  const savedNote = saved['personal_story_note']
                  || saved['story_moment_note']
                  || saved['osl_moment']
                  || saved['correspondence']
                  || '';

  let h = '<div class="qf-section collapsed" data-section-key="personal_story">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
  h += '<div class="qf-section-body">';
  h += '<p class="qf-section-intro">Name someone your character spends time with this cycle, and describe the kind of moment you\'re hoping for.</p>';

  // Hidden sync fields consumed by collectResponses() at submit time.
  h += `<input type="hidden" id="dt-personal_story_npc_id" value="${esc(savedName ? '__new__' : '')}">`;
  h += `<input type="hidden" id="dt-personal_story_npc_name" value="${esc(savedName)}">`;

  h += '<div class="qf-field">';
  h += '<label class="qf-label">Who is this moment about?</label>';
  h += `<input type="text" class="qf-input" id="dt-personal_story_npc_name_free" value="${esc(savedName)}" placeholder="Name an NPC — anyone your character knows or has heard of…">`;
  h += '</div>';

  h += '<div class="qf-field" style="margin-top:12px;">';
  h += '<label class="qf-label">How do you want to interact with them?</label>';
  h += `<textarea id="dt-personal_story_note" class="qf-textarea" rows="4" placeholder="Describe the kind of moment you're hoping for — a conversation, a letter, an unexpected encounter…">${esc(savedNote)}</textarea>`;
  h += '</div>';

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

  // Augmented rite list: known rites + castable-but-unlearned rites at
  // level ≤ (Cruac/Theban rating − 2). House rule per VtR2: any sorcerer
  // can attempt a rite two ranks below their discipline rating without
  // having learned it. Cruac 3 → level-1 rites are open; Cruac 5 → 1-3.
  const knownRites = (currentChar.powers || []).filter(p => p.category === 'rite');
  const knownNames = new Set(knownRites.map(r => r.name));
  const cruacDots = discDots(currentChar, 'Cruac');
  const thebanDots = discDots(currentChar, 'Theban');
  const ruleRites = getRulesByCategory('rite') || [];
  const unlearnedRites = [];
  for (const rule of ruleRites) {
    if (knownNames.has(rule.name)) continue;
    const trad = rule.parent;
    const rank = rule.rank || 1;
    const limit = trad === 'Cruac' ? cruacDots - 2
               : trad === 'Theban' ? thebanDots - 2
               : -1;
    if (rank <= limit) {
      unlearnedRites.push({ category: 'rite', name: rule.name, tradition: trad, level: rank, _unlearned: true });
    }
  }
  const rites = [...knownRites, ...unlearnedRites];
  rites.sort((a, b) => a.tradition.localeCompare(b.tradition) || a.level - b.level || a.name.localeCompare(b.name));
  const cruacRites = rites.filter(r => r.tradition === 'Cruac');

  const savedCount = parseInt(saved['sorcery_slot_count'] || '1', 10);
  const slotCount = Math.max(1, savedCount);

  // Mandragora 2c: capacity = Mandragora Garden effective dots. Count
  // currently-parked rites from `saved` so the cap can disable the Park
  // toggle on additional slots once full.
  const mandragoraCap = hasMandragora ? effectiveDomainDots(currentChar, 'Mandragora Garden') : 0;
  let parkedCount = 0;
  for (let i = 1; i <= slotCount; i++) {
    if (saved[`sorcery_${i}_mandragora`] === 'yes') parkedCount++;
  }
  const capacityReached = mandragoraCap > 0 && parkedCount >= mandragoraCap;

  let h = '<div class="qf-section collapsed" data-section-key="blood_sorcery">';
  h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">\u2714</span></h4>`;
  h += '<div class="qf-section-body">';
  if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;

  // Mandragora Garden +3 dice — flat, always-on for Cruac users with the merit
  if (hasMandragora && cruacDots > 0) {
    h += `<p class="qf-desc" style="margin:4px 0 10px;font-style:italic">Mandragora Garden grants +3 dice to every Cruac rite cast this downtime.</p>`;
    if (mandragoraCap > 0) {
      h += `<p class="qf-desc" style="margin:4px 0 10px;font-style:italic">Garden capacity: <strong>${parkedCount} / ${mandragoraCap}</strong> rite${mandragoraCap !== 1 ? 's' : ''} parked.</p>`;
    }
  }

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
      const suffix = r._unlearned ? ' — unlearned' : '';
      h += `<option value="${esc(r.name)}"${sel}>${esc(r.name)} (Level ${r.level})${suffix}</option>`;
    }
    if (lastTradition) h += '</optgroup>';
    h += '</select>';

    // Mandragora Garden checkbox — Cruac rites only, when character has the merit.
    // Storage only: the +3 dice bonus is automatic (shown above the slots) and
    // applies whether or not this rite is parked. Parking the rite means it
    // costs no vitae for this casting and is sustained by the garden.
    if (hasMandragora && cruacRites.length) {
      const mandChecked = isCruac && mandSaved ? ' checked' : '';
      // 2c: disable when not Cruac, OR when capacity is full and this rite
      // isn't already parked (so unticking remains possible to free a slot).
      const overCap = capacityReached && !mandSaved;
      const mandDisabled = (!isCruac || overCap) ? ' disabled' : '';
      const mandTitle = overCap
        ? `Garden capacity reached (${mandragoraCap}). Untick another parked rite to free a slot.`
        : `If ticked, this rite is parked in your Mandragora Garden: it costs no vitae for this casting and is sustained by the garden until next month.`;
      h += `<label class="dt-mand-label" title="${esc(mandTitle)}">`;
      h += `<input type="checkbox" id="dt-sorcery_${n}_mandragora" class="dt-mand-cb"${mandChecked}${mandDisabled}>`;
      h += ` Park in Mandragora Garden (sustained, no vitae cost)`;
      h += '</label>';
    }

    h += '</div>';

    if (rite) {
      h += '<div class="dt-sorcery-details">';
      h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Tradition/Level:</span> ${esc(rite.tradition)} ${rite.level}</div>`;
      const costLabel = riteCost(rite).label;
      if (costLabel) h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Cost:</span> ${esc(costLabel)}</div>`;
      if (rite.effect) h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Effect:</span> ${esc(rite.effect)}</div>`;

      // DTFP-6: structured multi-target picker. Persisted shape is an array of
      // {type, value} objects on responses[`sorcery_N_targets`]. Legacy string
      // values render as a single 'other' row; the next save converts to array.
      const rawTargets = saved[`sorcery_${n}_targets`];
      const targets = Array.isArray(rawTargets)
        ? rawTargets
        : (rawTargets ? [{ type: 'other', value: String(rawTargets) }] : [{ type: '', value: '' }]);
      h += `<div class="qf-field dt-sorcery-targets-block" data-sorcery-slot-targets="${n}">`;
      h += `<label class="qf-label">Target/s</label>`;
      h += `<p class="qf-desc" style="margin:0 0 8px;font-size:.85em;opacity:.8">Not all target types are valid for every rite — check the rite's description for valid targets. The ST will reject any mismatched targeting at processing.</p>`;
      for (let ti = 0; ti < targets.length; ti++) {
        const t = targets[ti] || { type: '', value: '' };
        h += `<div class="dt-sorcery-target-row" data-sorcery-target-row="${n}-${ti}">`;
        h += renderTargetPicker(`sorcery_${n}_targets_${ti}`, {
          savedType: t.type || '',
          savedValue: t.value || '',
          allCharacters,
        });
        if (targets.length > 1 || (t.type || t.value)) {
          h += `<button type="button" class="dt-sorcery-target-remove-btn" data-sorcery-slot="${n}" data-target-idx="${ti}" title="Remove target">×</button>`;
        }
        h += `</div>`;
      }
      h += `<button type="button" class="dt-sorcery-target-add-btn" data-sorcery-slot="${n}">+ Add target</button>`;
      h += `</div>`;

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
  const resourcesRating = meritEffectiveRating(c, resourcesMerit);

  // All character merits for the picker
  const charMerits = (c.merits || []).filter(m =>
    m.category === 'general' || m.category === 'influence' || m.category === 'standing'
  );

  let h = '<div class="qf-section collapsed" data-section-key="acquisitions">';
  h += '<h4 class="qf-section-title">Acquisition: Resources and Skills<span class="qf-section-tick">✔</span></h4>';
  h += '<div class="qf-section-body">';

  // ── Resources acquisition ──
    // -- Resources acquisition (multi-slot) --
  const savedCount = parseInt(saved['acq_slot_count'] || '1', 10);
  const slotCount = Math.max(1, savedCount);
  h += `<input type="hidden" id="dt-acq-slot-count" value="${slotCount}">`;

  // Resources Level header (section-level, shared across all slots)
  h += '<div class="dt-acq-resources-row dt-acq-resources-header">';
  h += `<span class="dt-acq-label">Resources Level:</span>`;
  h += `<span class="dt-acq-dots">${resourcesRating ? '●'.repeat(resourcesRating) : 'None'}</span>`;
  h += '</div>';

  for (let n = 1; n <= slotCount; n++) {
    h += renderResourcesAcquisitionSlot(n, saved, charMerits, slotCount);
  }

  h += `<button type="button" class="dt-add-rite-btn dt-add-acq-btn" id="dt-add-acquisition">+ Add Item</button>`;

  // ── Skill-based acquisition ──
  const skSkills = ALL_SKILLS.filter(s => skTotal(c, s) > 0);

  h += '<div class="dt-acq-card" style="margin-top:16px;">';
  h += '<div class="dt-acq-card-title">Skill-Based Acquisition</div>';
  h += '<p class="qf-desc">Limited to ONE skill-based acquisition per Downtime.</p>';

  h += renderQuestion({
    key: 'skill_acq_description', label: 'Description',
    type: 'textarea', required: false,
    desc: 'What are you attempting to obtain, and how?',
  }, saved['skill_acq_description'] || '');

  // Dice pool: Skill only (VtR 2e — no attribute addend for skill acquisition)
  h += '<div class="qf-field">';
  h += '<div class="dt-pool-label">Acquisition Pool</div>';
  h += '<div class="dt-dice-pool-row">';

  const skSavedSkill = saved['skill_acq_pool_skill'] || '';

  h += '<select class="qf-select" id="dt-skill_acq_pool_skill">';
  h += '<option value="">Skill</option>';
  for (const s of skSkills) {
    const dots = skTotal(c, s);
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

  // Pool total: skill dots only
  let skPoolTotal = 0;
  if (skSavedSkill) skPoolTotal += skTotal(c, skSavedSkill);
  skPoolTotal += specBonus;
  h += `<span class="dt-pool-total">${skPoolTotal || '\u2014'}</span>`;
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
    const dots = '\u25CF'.repeat(meritEffectiveRating(c, m));
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

function renderResourcesAcquisitionSlot(n, saved, charMerits, slotCount) {
  const useLegacy = n === 1 && saved['acq_slot_count'] === undefined && saved['acq_1_description'] === undefined;
  const description = useLegacy ? (saved['acq_description'] || '') : (saved[`acq_${n}_description`] || '');
  const availabilityRaw = useLegacy ? saved['acq_availability'] : saved[`acq_${n}_availability`];
  const meritsRaw = useLegacy ? (saved['acq_merits'] || '[]') : (saved[`acq_${n}_merits`] || '[]');

  let meritPicks = [];
  try { meritPicks = JSON.parse(meritsRaw); } catch { /* ignore */ }

  let h = `<div class="dt-acq-card" data-acq-slot="${n}">`;
  h += '<div class="dt-acq-card-hd">';
  h += `<div class="dt-acq-card-title">Item ${n}</div>`;
  if (slotCount > 1) {
    h += `<button type="button" class="dt-sorcery-remove dt-acq-remove" data-remove-acq="${n}" title="Remove this item">\xD7 Remove</button>`;
  }
  h += '</div>';

  h += '<div class="qf-field">';
  h += '<label class="qf-label">Relevant Merits</label>';
  h += '<p class="qf-desc">Select merits that support this acquisition.</p>';
  h += `<div class="dt-proj-merits" data-acq-merits="${n}">`;
  for (const m of charMerits) {
    const mName = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
    const dots = '●'.repeat(meritEffectiveRating(currentChar, m));
    const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
    const checked = meritPicks.includes(mKey) ? ' checked' : '';
    h += `<label class="dt-proj-merit-label">`;
    h += `<input type="checkbox" value="${esc(mKey)}" data-acq-merit-cb="${n}"${checked}>`;
    h += `<span>${esc(mName)} ${dots}</span>`;
    h += '</label>';
  }
  if (!charMerits.length) h += '<p class="qf-desc">No applicable merits.</p>';
  h += '</div></div>';

  h += renderQuestion({
    key: `acq_${n}_description`, label: 'Acquisition Description',
    type: 'textarea', required: false,
    desc: 'What are you attempting to acquire? Include context and purpose.',
  }, description);

  const savedAvail = availabilityRaw === 'unknown' ? 'unknown' : (parseInt(availabilityRaw, 10) || 0);
  h += '<div class="qf-field">';
  h += '<label class="qf-label">Availability</label>';
  h += '<p class="qf-desc">How rare is this item? Click to set (1 = common, 5 = unique).</p>';
  h += `<div class="dt-acq-avail-row" data-acq-avail="${n}">`;
  for (let d = 1; d <= 5; d++) {
    const filled = typeof savedAvail === 'number' && d <= savedAvail ? ' dt-acq-dot-filled' : '';
    h += `<span class="dt-acq-dot${filled}" data-acq-dot="${d}" data-acq-slot="${n}">●</span>`;
  }
  h += `<span class="dt-acq-unknown${savedAvail === 'unknown' ? ' dt-acq-dot-filled' : ''}" data-acq-unknown="${n}">Unknown</span>`;
  if (savedAvail) {
    const labels = ['', 'Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];
    const lbl = savedAvail === 'unknown' ? '' : (labels[savedAvail] || '');
    if (lbl) h += `<span class="dt-acq-avail-label">${lbl}</span>`;
  }
  h += `<input type="hidden" id="dt-acq_${n}_availability" value="${esc(String(savedAvail || ''))}">`;
  h += '</div></div>';

  h += '</div>';
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
  const attrEl  = document.getElementById(`dt-${prefix}_attr`);
  const skillEl = document.getElementById(`dt-${prefix}_skill`);
  const discEl  = document.getElementById(`dt-${prefix}_disc`);
  const specEl  = document.getElementById(`dt-${prefix}_spec`);
  const totalEl = document.getElementById(`${prefix}_total`);
  if (!totalEl) return;

  let total = 0;
  if (attrEl?.value) total += getAttrEffective(currentChar, attrEl.value);
  if (skillEl?.value) total += skTotal(currentChar, skillEl.value);
  if (discEl?.value) total += discDots(currentChar, discEl.value);
  if (specEl?.value && skillEl?.value) {
    const specs = currentChar.skills?.[skillEl.value]?.specs || [];
    if (specs.includes(specEl.value)) {
      const na = skNineAgain(currentChar, skillEl.value);
      total += (na || hasAoE(currentChar, specEl.value)) ? 2 : 1;
    }
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
  const allAttrs = ALL_ATTRS.filter(a => getAttrTotal(c, a) > 0);
  const allSkills = ALL_SKILLS.filter(s => skTotal(c, s) > 0);
  const allDiscs = (isOther || isOpen)
    ? Object.keys(c.disciplines || {}).filter(d => discDots(c, d) > 0)
    : (m?.discs || []).filter(d => discDots(c, d) > 0);

  // Calculate total from current selections
  let total = 0;
  if (selAttr) total += getAttrEffective(c, selAttr);
  if (selSkill) total += skTotal(c, selSkill);
  if (selDisc) total += discDots(c, selDisc);
  const fgVal = effectiveDomainDots(c, 'Feeding Grounds');
  total += fgVal;
  const specBonus = selSpec ? (hasAoE(c, selSpec) ? 2 : 1) : 0;
  total += specBonus;

  let h = '<div class="dt-feed-pool">';

  // ── Pool dropdowns ──
  h += '<div class="dt-feed-custom-row">';
  h += `<select class="qf-select" id="dt-${pfx}-custom-attr"><option value="">Attribute</option>`;
  for (const a of allAttrs) {
    const dots = getAttrEffective(c, a);
    h += `<option value="${esc(a)}"${selAttr===a?' selected':''}>${esc(a)} (${dots})</option>`;
  }
  h += '</select>';
  h += `<select class="qf-select" id="dt-${pfx}-custom-skill"><option value="">Skill</option>`;
  for (const s of allSkills) {
    const dots = skTotal(c, s);
    h += `<option value="${esc(s)}"${selSkill===s?' selected':''}>${esc(s)} (${dots})</option>`;
  }
  h += '</select>';
  if (allDiscs.length) {
    h += `<select class="qf-select" id="dt-${pfx}-disc"><option value="">Discipline</option>`;
    for (const d of allDiscs) {
      const dv = discDots(c, d);
      h += `<option value="${esc(d)}"${selDisc===d?' selected':''}>${esc(d)} (${dv})</option>`;
    }
    h += '</select>';
  }
  if (total > 0) h += `<span class="dt-feed-total">= ${total} dice</span>`;
  h += '</div>';
  if (selDisc) {
    h += '<p class="qf-desc" style="margin-top:6px">By adding a Discipline, if this roll fails, it will count as a dramatic failure.</p>';
  }

  // ── Suggestion chips (non-Other only) ──
  if (m && (m.attrs.length || m.skills.length || m.discs.length)) {
    h += '<div class="dt-feed-suggest">';
    h += '<span class="dt-feed-suggest-lbl">Suggestions:</span>';
    for (const a of sortChips(m.attrs)) {
      const val = getAttrEffective(c, a);
      const active = selAttr === a ? ' dt-feed-chip-on' : '';
      h += `<button type="button" class="dt-feed-chip dt-feed-chip-attr${active}" data-${pfx}-chip-attr="${esc(a)}">${esc(a)} (${val})</button>`;
    }
    h += '<span class="dt-feed-suggest-sep">/</span>';
    for (const s of sortChips(m.skills)) {
      const val = skTotal(c, s);
      const active = selSkill === s ? ' dt-feed-chip-on' : '';
      h += `<button type="button" class="dt-feed-chip dt-feed-chip-skill${active}" data-${pfx}-chip-skill="${esc(s)}">${esc(s)} (${val})</button>`;
    }
    if (m.discs.length) {
      h += '<span class="dt-feed-suggest-sep">/</span>';
      for (const d of sortChips(m.discs)) {
        const val = discDots(c, d);
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

/**
 * DTFP-6: shared structured target picker. Renders a Character / Territory /
 * Other radio group plus the appropriate value control for the chosen type.
 *
 * `prefix` is used for ids and field names — e.g. 'project_2_target' produces
 * radio name 'dt-project_2_target_type' and value-field id 'dt-project_2_target_value'.
 * Used by project target_flex (single picker per slot) and sorcery targets
 * (multi-target via repeated picker rows; prefix becomes 'sorcery_N_targets_TI').
 */
// JDT-6: Display helper for joint description edit timestamps.
function formatTimestamp(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// JDT-2: Locate an existing joint authored by the current submission for slot N.
function findExistingJoint(slot) {
  if (!currentCycle?.joint_projects || !responseDoc?._id) return null;
  const subId = String(responseDoc._id);
  return currentCycle.joint_projects.find(j =>
    String(j.lead_submission_id) === subId &&
    Number(j.lead_project_slot) === Number(slot) &&
    !j.cancelled_at
  ) || null;
}

// JDT-2: Joint authoring panel — description, target, invitees, status badges.
// `existingJoint` is read from cycle.joint_projects when the joint already
// exists; otherwise the panel is in pre-save authoring mode and reads scratch
// fields off `saved` (responses).
function renderJointAuthoring(n, saved, existingJoint) {
  if (!existingJoint) {
    return renderDtJointPanel(n, saved);
  }

  // existingJoint path — JDT lifecycle controls (unchanged)
  const desc = existingJoint.description || '';
  const targetType = existingJoint.target_type || '';
  const targetValue = existingJoint.target_value || '';

  let h = `<div class="dt-joint-authoring" data-joint-slot="${n}">`;
  h += `<div class="dt-joint-banner">Joint project</div>`;

  h += `<div class="dt-joint-explainer">`;
  h += `<p><strong>What you are committing to.</strong> Selecting Joint makes you the lead of this project. Coordinate the details with your invitees out of game before submitting; the description below should reflect what you have agreed.</p>`;
  h += `<p>Once any invitee accepts, you cannot quietly cancel. Supports must explicitly decouple themselves first. While submissions are open you can re-invite alternates after a decline or a decouple. Storytellers can override any joint state if circumstances require it.</p>`;
  h += `</div>`;

  h += `<p class="qf-desc dt-joint-saved-note">Joint created. Use the controls below to invite alternates or cancel the joint when no supports remain.</p>`;

  h += `<label class="qf-label" for="dt-project_${n}_joint_description">Joint description</label>`;
  h += `<textarea id="dt-project_${n}_joint_description" class="qf-textarea" rows="3">${esc(desc)}</textarea>`;
  h += `<div class="dt-joint-desc-edit-row">`;
  h += `<button type="button" class="dt-joint-desc-save-btn" data-joint-id="${esc(existingJoint._id)}">Save description</button>`;
  if (existingJoint.description_updated_at) {
    const ts = formatTimestamp(existingJoint.description_updated_at);
    h += `<span class="dt-joint-desc-last-edited">Last edited ${esc(ts)}</span>`;
  }
  h += `<span class="dt-joint-desc-save-status" data-joint-id="${esc(existingJoint._id)}"></span>`;
  h += `</div>`;

  h += `<label class="qf-label">Joint target</label>`;
  const labelMap = { character: 'Character', territory: 'Territory', other: 'Other' };
  const typeLbl = labelMap[targetType] || '—';
  let valLbl = targetValue || '';
  if (targetType === 'character') {
    let ids = [];
    try {
      const parsed = JSON.parse(targetValue || '[]');
      ids = Array.isArray(parsed) ? parsed : (targetValue ? [targetValue] : []);
    } catch {
      ids = targetValue ? [targetValue] : [];
    }
    const names = ids.map(id => allCharacters.find(x => String(x.id) === String(id))?.name || id);
    valLbl = names.join(', ') || '—';
  } else if (targetType === 'territory') {
    const t = TERRITORY_DATA.find(x => x.slug === targetValue);
    if (t) valLbl = t.name;
  }
  h += `<div class="dt-joint-readonly-target"><span class="dt-joint-readonly-type">${esc(typeLbl)}</span> <span class="dt-joint-readonly-val">${esc(valLbl)}</span></div>`;

  h += `<label class="qf-label">Invitees</label>`;
  h += renderJointStatusBadges(existingJoint);
  h += renderJointReinvitePanel(n, existingJoint);
  h += renderJointCancelPanel(existingJoint);

  h += `</div>`;
  return h;
}

// DTUI-12: new authoring panel for when no joint document exists yet.
// Two stacked chip-grid sections: Players (dtui-13) + Sphere merits (dtui-14).
function renderDtJointPanel(n, saved) {
  let h = `<div class="dt-joint-panel" aria-expanded="true" data-joint-slot="${n}">`;

  // Joint project explainer — shown in pre-save authoring mode so players
  // know what they're committing to before they invite anyone. The same
  // copy is shown in the existingJoint path of renderJointAuthoring.
  h += `<div class="dt-joint-banner">Joint project</div>`;
  h += `<div class="dt-joint-explainer">`;
  h += `<p><strong>What you are committing to.</strong> Selecting Joint makes you the lead of this project. Coordinate the details with your invitees out of game before submitting; the description below should reflect what you have agreed.</p>`;
  h += `<p>Once any invitee accepts, you cannot quietly cancel. Supports must explicitly decouple themselves first. While submissions are open you can re-invite alternates after a decline or a decouple. Storytellers can override any joint state if circumstances require it.</p>`;
  h += `</div>`;

  const playersHeadingId = `dt-joint-players-heading-${n}`;
  h += `<div class="dt-joint-panel__section">`;
  h += `<h4 class="dt-joint-panel__heading" id="${playersHeadingId}">Players</h4>`;
  h += `<div class="dt-chip-grid dt-chip-grid--multi" aria-labelledby="${playersHeadingId}" data-joint-players="${n}">`;
  h += renderJointInviteeChips(n, saved);
  h += `</div>`;
  h += `</div>`;

  // Allies/Retainers picker now lives outside the joint panel — controlled by
  // the separate Solo / Support Assets toggle on the project slot.

  h += `</div>`;
  return h;
}

// DTUI-13: free-slot detection for invitee chip greying
function getCharFreeSlotCount(charId) {
  const sub = _allSubmissions.find(s => String(s.character_id) === String(charId));
  if (!sub) return (DOWNTIME_SECTIONS.find(s => s.key === 'projects')?.projectSlots || 4);
  const responses = sub.responses || {};
  const maxSlots = DOWNTIME_SECTIONS.find(s => s.key === 'projects')?.projectSlots || 4;
  let used = 0;
  for (let p = 1; p <= maxSlots; p++) {
    if (responses[`project_${p}_action`]) used++;
  }
  return maxSlots - used;
}

// dt-form.16: joint invitee picker — universal charPicker (ADR-003 §Q6, site #3b).
// Characters with no free project slots this cycle are excluded from the dropdown
// (they cannot be invited). Self is excluded by source filter (allCharacters
// already drops the current character at load time).
function renderJointInviteeChips(n, saved) {
  let invitedIds = [];
  try { invitedIds = JSON.parse(saved[`project_${n}_joint_invited_ids`] || '[]'); } catch { invitedIds = []; }
  const savedJson = JSON.stringify(invitedIds);

  if (!allCharacters.length) {
    return `<input type="hidden" id="dt-project_${n}_joint_invited_ids" value="${esc(savedJson)}">`
         + '<p class="qf-desc">No other characters available to invite.</p>';
  }

  // Exclude characters with no free slots — invited ones stay (already accepted)
  // because excludeIds is applied to dropdown options, not selected chips.
  const noFreeSlots = allCharacters
    .map(c => String(c.id))
    .filter(id => getCharFreeSlotCount(id) <= 0 && !invitedIds.includes(id));
  const excludeJson = esc(JSON.stringify(noFreeSlots));
  const initialJson = esc(JSON.stringify(invitedIds.map(String)));

  let h = `<input type="hidden" id="dt-project_${n}_joint_invited_ids" value="${esc(savedJson)}">`;
  h += `<div data-cp-mount data-cp-site="joint-invitee"`
     + ` data-cp-scope="all" data-cp-cardinality="multi"`
     + ` data-cp-hidden="dt-project_${n}_joint_invited_ids"`
     + ` data-cp-initial="${initialJson}"`
     + ` data-cp-exclude="${excludeJson}"`
     + ` data-cp-placeholder="Invite players"></div>`;
  return h;
}

// DTUI-14: already-used detection for sphere/retainer merits
function isSphereMeritUsed(slotKey, type, saved) {
  if (type === 'sphere') return !!(saved[`${slotKey}_action`]);
  if (type === 'retainer') return !!(saved[`${slotKey}_type`] || saved[`${slotKey}_task`]);
  return false;
}

// DTUI-14: sphere-merit collaborator chip grid (Allies + Retainers)
function renderJointSphereChips(n, saved) {
  const spheres = (detectedMerits.spheres || []).map((m, i) => ({ m, slotKey: `sphere_${i + 1}`, type: 'sphere' }));
  const retainers = (detectedMerits.retainers || []).map((m, i) => ({ m, slotKey: `retainer_${i + 1}`, type: 'retainer' }));
  const all = [...spheres, ...retainers];

  if (!all.length) {
    return '<p class="qf-desc">You have no Allies or Retainer merits to contribute.</p>';
  }

  let selectedKeys = [];
  try { selectedKeys = JSON.parse(saved[`project_${n}_joint_sphere_chips`] || '[]'); } catch { selectedKeys = []; }
  const selectedSet = new Set(selectedKeys);

  let h = '';
  for (const { m, slotKey, type } of all) {
    const isUsed = isSphereMeritUsed(slotKey, type, saved);
    const isSelected = selectedSet.has(slotKey);
    const isDisabled = isUsed && !isSelected;
    const effectiveDots = meritEffectiveRating(currentChar, m);
    const area = m.area || m.qualifier || '';
    const label = m.name + (area ? ` (${area})` : '') + (effectiveDots ? ' ' + '●'.repeat(effectiveDots) : '');
    const disabledAttr = isDisabled ? ' disabled aria-disabled="true"' : '';
    const titleAttr = isDisabled ? ' title="This merit\'s action is already committed elsewhere."' : '';
    const selectedClass = isSelected ? ' dt-chip--selected' : '';
    const disabledClass = isDisabled ? ' dt-chip--disabled' : '';
    h += `<button type="button" class="dt-chip${selectedClass}${disabledClass}"${disabledAttr}${titleAttr}`;
    h += ` data-joint-sphere-slot="${n}" data-sphere-key="${esc(slotKey)}" data-sphere-type="${type}">`;
    h += esc(label);
    h += `</button>`;
  }
  return h;
}

// JDT-6: Re-invite affordance for the lead. Shows characters not currently
// invited (no pending or accepted invitation), lets the lead tick alternates
// and submit. The pre-existing per-invitation status badges sit above.
function renderJointReinvitePanel(n, joint) {
  const myInvs = _jointInvitations.filter(inv => String(inv.joint_project_id) === String(joint._id));
  const blocked = new Set(myInvs
    .filter(inv => inv.status === 'pending' || inv.status === 'accepted')
    .map(inv => String(inv.invited_character_id)));
  // Lead can't re-invite themselves
  blocked.add(String(joint.lead_character_id));
  const candidates = allCharacters.filter(c => !blocked.has(String(c.id)));
  if (!candidates.length) {
    return `<p class="qf-desc dt-joint-reinvite-empty">No alternates available to re-invite.</p>`;
  }

  let h = `<div class="dt-joint-reinvite-panel" data-joint-id="${esc(joint._id)}">`;
  h += `<div class="dt-joint-reinvite-title">Invite alternates</div>`;
  h += `<div class="dt-joint-invitee-grid">`;
  for (const c of candidates) {
    h += `<label class="dt-joint-invitee-item">`;
    h += `<input type="checkbox" class="dt-joint-reinvite-cb" data-joint-id="${esc(joint._id)}" value="${esc(String(c.id))}">`;
    h += `<span>${esc(c.name)}</span>`;
    h += `</label>`;
  }
  h += `</div>`;
  h += `<button type="button" class="dt-joint-reinvite-btn" data-joint-id="${esc(joint._id)}" data-joint-slot="${n}">Send invitations</button>`;
  h += `<span class="dt-joint-reinvite-status" data-joint-id="${esc(joint._id)}"></span>`;
  h += `</div>`;
  return h;
}

// JDT-6: Cancel panel. The button is enabled only when zero accepted
// participants AND zero pending invitations remain. Otherwise the panel
// shows guidance about the path back to a cancellable state.
function renderJointCancelPanel(joint) {
  const myInvs = _jointInvitations.filter(inv => String(inv.joint_project_id) === String(joint._id));
  const acceptedSupports = (joint.participants || []).filter(p => !p.decoupled_at).length;
  const pendingInvs = myInvs.filter(inv => inv.status === 'pending').length;
  const canCancel = acceptedSupports === 0 && pendingInvs === 0;

  let h = `<div class="dt-joint-cancel-panel" data-joint-id="${esc(joint._id)}">`;
  if (canCancel) {
    h += `<button type="button" class="dt-joint-cancel-btn" data-joint-id="${esc(joint._id)}">Cancel joint</button>`;
    h += `<p class="qf-desc dt-joint-cancel-help">Cancelling frees this slot. The joint document is kept on the cycle for audit; a Storyteller can recover it if needed.</p>`;
  } else {
    h += `<p class="qf-desc dt-joint-cancel-help">You can only cancel this joint when there are zero accepted supports and zero pending invitations. Currently: ${acceptedSupports} accepted, ${pendingInvs} pending.</p>`;
  }
  h += `<span class="dt-joint-cancel-status" data-joint-id="${esc(joint._id)}"></span>`;
  h += `</div>`;
  return h;
}

function renderJointInviteeGrid(n, invitedSet) {
  if (!allCharacters.length) {
    return `<p class="qf-desc">No characters available to invite.</p>`;
  }
  let h = `<div class="dt-joint-invitee-grid">`;
  for (const c of allCharacters) {
    const checked = invitedSet.has(String(c.id)) ? ' checked' : '';
    h += `<label class="dt-joint-invitee-item">`;
    h += `<input type="checkbox" class="dt-joint-invitee-cb" data-joint-slot="${n}" value="${esc(String(c.id))}"${checked}>`;
    h += `<span>${esc(c.name)}</span>`;
    h += `</label>`;
  }
  h += `</div>`;
  return h;
}

// JDT-3: panel rendered above the project tabs that lists pending joint
// invitations addressed to the current character. Empty when the invitee
// has no pending invitations on the active cycle.
function renderPendingInvitationsPanel() {
  if (!currentChar?._id) return '';
  const myCharId = String(currentChar._id);
  const pending = _jointInvitations
    .filter(inv => String(inv.invited_character_id) === myCharId && inv.status === 'pending')
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  if (!pending.length) return '';

  // Lowest-numbered slot with no action set is "available".
  const responses = responseDoc?.responses || {};
  let hasSlot = false;
  for (let n = 1; n <= 4; n++) {
    if (!responses[`project_${n}_action`]) { hasSlot = true; break; }
  }

  let h = `<section class="dt-pending-invitations-panel">`;
  h += `<h3 class="dt-pending-invitations-title">Pending invitations</h3>`;
  for (const inv of pending) {
    const joint = inv._joint;
    if (!joint) continue;
    const lead = allCharacters.find(c => String(c.id) === String(joint.lead_character_id));
    const leadName = lead ? lead.name : 'Unknown lead';
    const actionLabel = (PROJECT_ACTIONS.find(a => a.value === joint.action_type)?.label) || joint.action_type;
    const desc = (joint.description || '').trim();
    const descShort = desc.length > 220 ? desc.slice(0, 220).trimEnd() + '…' : desc;

    h += `<div class="dt-pending-invitation-row" data-invitation-id="${esc(inv._id)}">`;
    h += `<div class="dt-pending-invitation-meta">`;
    h += `<span class="dt-pending-invitation-lead">${esc(leadName)} invites you</span>`;
    h += `<span class="dt-pending-invitation-action">${esc(actionLabel)}</span>`;
    h += `</div>`;
    if (descShort) {
      h += `<div class="dt-pending-invitation-desc">${esc(descShort)}</div>`;
    } else {
      h += `<div class="dt-pending-invitation-desc dt-pending-invitation-desc-empty">No description provided.</div>`;
    }
    h += `<div class="dt-pending-invitation-actions">`;
    if (hasSlot) {
      h += `<button type="button" class="dt-pending-invitation-accept" data-invitation-id="${esc(inv._id)}">Accept</button>`;
    } else {
      h += `<button type="button" class="dt-pending-invitation-accept" disabled title="You have no available project slots. Free up a slot to accept.">Accept</button>`;
    }
    h += `<button type="button" class="dt-pending-invitation-decline" data-invitation-id="${esc(inv._id)}">Decline</button>`;
    h += `</div>`;
    h += `</div>`;
  }
  h += `</section>`;
  return h;
}

function renderJointStatusBadges(joint) {
  const myInvs = _jointInvitations.filter(inv => String(inv.joint_project_id) === String(joint._id));
  if (!myInvs.length) {
    return `<p class="qf-desc">No invitations on this joint.</p>`;
  }
  let h = `<div class="dt-joint-status-grid">`;
  for (const inv of myInvs) {
    const c = allCharacters.find(x => String(x.id) === String(inv.invited_character_id));
    const name = c ? c.name : 'Unknown';
    const status = inv.status || 'pending';
    const label = JOINT_STATUS_LABELS[status] || status;
    h += `<div class="dt-joint-status-row">`;
    h += `<span class="dt-joint-invitee-name">${esc(name)}</span>`;
    h += `<span class="dt-joint-status-badge dt-joint-status-${esc(status)}">${esc(label)}</span>`;
    h += `</div>`;
  }
  h += `</div>`;
  return h;
}

function renderTargetPicker(prefix, opts) {
  const {
    savedType = '',
    savedValue = '',
    allCharacters = [],
    includeOptions = ['character', 'territory', 'other'],
    multiCharacter = false,
  } = opts || {};
  const labelMap = { character: 'Character', territory: 'Territory', other: 'Other' };

  let h = `<div class="dt-target-picker" data-target-prefix="${esc(prefix)}">`;
  h += `<div class="dt-target-flex-radios">`;
  for (const opt of includeOptions) {
    const chk = savedType === opt ? ' checked' : '';
    h += `<label class="dt-flex-radio-label"><input type="radio" name="dt-${esc(prefix)}_type" value="${esc(opt)}"${chk} data-flex-type="${esc(prefix)}"> ${esc(labelMap[opt] || opt)}</label>`;
  }
  h += `</div>`;

  if (savedType === 'character') {
    if (multiCharacter) {
      // Universal char picker (ADR-003 §Q6) — site #3a (joint target multi)
      let initialIds = [];
      try {
        const parsed = JSON.parse(savedValue || '[]');
        if (Array.isArray(parsed)) initialIds = parsed.map(String).filter(Boolean);
        else if (savedValue) initialIds = [String(savedValue)];
      } catch {
        if (savedValue) initialIds = [String(savedValue)];
      }
      const initialJson = esc(JSON.stringify(initialIds));
      h += `<input type="hidden" id="dt-${esc(prefix)}_value" value="${esc(JSON.stringify(initialIds))}">`;
      h += `<div data-cp-mount data-cp-site="target-flex-multi"`
         + ` data-cp-scope="all" data-cp-cardinality="multi"`
         + ` data-cp-hidden="dt-${esc(prefix)}_value"`
         + ` data-cp-initial="${initialJson}"`
         + ` data-cp-placeholder="Pick characters"></div>`;
    } else {
      // Universal char picker (ADR-003 §Q6) — site #1
      const initialJson = esc(JSON.stringify(savedValue ? String(savedValue) : ''));
      h += `<input type="hidden" id="dt-${esc(prefix)}_value" value="${esc(savedValue || '')}">`;
      h += `<div data-cp-mount data-cp-site="target-flex-single"`
         + ` data-cp-scope="all" data-cp-cardinality="single"`
         + ` data-cp-hidden="dt-${esc(prefix)}_value"`
         + ` data-cp-initial="${initialJson}"`
         + ` data-cp-placeholder="Pick a character"></div>`;
    }
  } else if (savedType === 'territory') {
    h += renderTerritoryPills(`dt-${prefix}_value`, savedValue);
  } else if (savedType === 'other') {
    h += `<input type="text" id="dt-${esc(prefix)}_value" class="qf-input" value="${esc(savedValue)}" placeholder="Describe the target">`;
  }
  h += `</div>`;
  return h;
}

/** Returns a Set of target_value identifiers already claimed by other maintenance slots (dtui-11). */
function getAlreadyMaintainedTargets(n, saved, maxSlots) {
  const maintained = new Set();
  for (let k = 1; k <= maxSlots; k++) {
    if (k === n) continue;
    if (saved[`project_${k}_action`] === 'maintenance' && saved[`project_${k}_target_value`]) {
      maintained.add(saved[`project_${k}_target_value`]);
    }
  }
  return maintained;
}

/** Chip grid of the character's own maintenance-eligible merits (dtui-11).
 *  prefix defaults to 'project'; pass 'sphere' for Allies maintenance (dtui-16). */
function renderMaintenanceChips(n, saved, charData, alreadyMaintained, prefix = 'project') {
  const maintMerits = (charData?.merits || [])
    .filter(m => MAINTENANCE_MERITS.includes(m.name));

  const savedTarget = saved[`${prefix}_${n}_target_value`] || '';
  let h = `<input type="hidden" id="dt-${prefix}_${n}_target_value" value="${esc(savedTarget)}">`;

  if (maintMerits.length === 0) {
    h += '<p class="qf-desc">No merits requiring maintenance found for this character.</p>';
    return h;
  }

  h += `<div class="dt-chip-grid" role="group" aria-label="Select merit to maintain">`;
  for (const m of maintMerits) {
    const dots = meritEffectiveRating(currentChar, m);
    const id = `${m.name}_${dots}`;
    const dotStr = '●'.repeat(dots);
    const isSelected = savedTarget === id;
    const isDisabled = alreadyMaintained.has(id);
    const disabledAttr = isDisabled ? ' disabled aria-disabled="true"' : '';
    const titleAttr = isDisabled ? ' title="Maintained this chapter."' : '';
    const selectedClass = isSelected ? ' dt-chip--selected' : '';
    h += `<button type="button" class="dt-chip${selectedClass}"${disabledAttr}${titleAttr} ` +
         `data-maintenance-target="${n}" data-maintenance-prefix="${esc(prefix)}" data-target-id="${esc(id)}">` +
         `${esc(m.name)}${dotStr ? ` <span class="dt-chip__suffix">${dotStr}</span>` : ''}` +
         `</button>`;
  }
  h += '</div>';
  return h;
}

/** Returns a Set of target_value ids already claimed by other sphere/status maintenance slots (dtui-16). */
function getSphereAlreadyMaintainedTargets(prefix, n, saved, maxSlots) {
  const maintained = new Set();
  for (let k = 1; k <= maxSlots; k++) {
    if (k === n) continue;
    if (saved[`${prefix}_${k}_action`] === 'maintenance' && saved[`${prefix}_${k}_target_value`]) {
      maintained.add(saved[`${prefix}_${k}_target_value`]);
    }
  }
  return maintained;
}

/** Per-action outcome zone (dtui-9). */
function renderOutcomeZone(n, actionVal, saved) {
  const savedOutcome = saved[`project_${n}_outcome`] || '';

  // ambience_change, hide_protect, investigate, patrol_scout have no
  // interactive outcome — their goal is already covered by ACTION_DESCRIPTIONS
  // shown above the project title. Static readonly outcome lines were dropped
  // as redundant (2026-04-29).

  if (actionVal === 'attack') {
    const pills = ['destroy', 'degrade', 'disrupt'];
    const sel = savedOutcome || 'destroy';
    let h = `<fieldset class="dt-ticker" id="dt-project_${n}_outcome_group">`;
    h += '<legend class="dt-ticker__legend">Desired Outcome</legend>';
    for (const p of pills) {
      const label = p[0].toUpperCase() + p.slice(1);
      h += `<label class="dt-ticker__pill"><input type="radio" name="dt-project_${n}_outcome" value="${p}"${sel === p ? ' checked' : ''} data-proj-outcome="${n}"> ${label}</label>`;
    }
    h += '</fieldset>';
    return h;
  }

  if (actionVal === 'misc') {
    return `<div class="qf-field">` +
      `<label class="qf-label" for="dt-project_${n}_outcome">Desired Outcome</label>` +
      `<input type="text" id="dt-project_${n}_outcome" class="qf-input" data-proj-outcome="${n}" ` +
      `placeholder="${esc('State the goal of this project, aiming to achieve one clear thing.')}" ` +
      `value="${esc(savedOutcome)}">` +
      `</div>`;
  }

  return '';
}

/** Unified target zone dispatcher (dtui-8). */
function renderTargetZone(n, actionVal, saved, chars) {
  let savedCharId = saved[`project_${n}_target_value`] || '';
  // backward compat: old submissions stored char IDs as JSON array string
  if (savedCharId.startsWith('[')) {
    try {
      const arr = JSON.parse(savedCharId);
      savedCharId = Array.isArray(arr) && arr.length > 0 ? String(arr[0]) : '';
    } catch { savedCharId = ''; }
  }
  const savedType   = saved[`project_${n}_target_type`] || '';
  const savedTerrId = saved[`project_${n}_target_terr`] || '';
  const savedOther  = saved[`project_${n}_target_other`] || '';

  let h = '<div class="qf-field dt-target-zone">';
  h += '<label class="qf-label">Target</label>';

  if (['ambience_change', 'patrol_scout'].includes(actionVal)) {
    h += renderTerritoryPills(`dt-project_${n}_target_terr`, savedTerrId);
    if (actionVal === 'ambience_change') {
      const savedAmbienceDir = saved[`project_${n}_ambience_dir`] || 'improve';
      h += `<fieldset class="dt-ticker" aria-label="Direction" style="margin-top:8px">`;
      for (const d of ['improve', 'degrade']) {
        const dLabel = d[0].toUpperCase() + d.slice(1);
        h += `<label class="dt-ticker__pill"><input type="radio" name="dt-project_${n}_ambience_dir" value="${d}"${savedAmbienceDir === d ? ' checked' : ''} data-proj-ambience-dir="${n}"> ${dLabel}</label>`;
      }
      h += '</fieldset>';
    }
  } else if (actionVal === 'attack') {
    h += renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, { includeTerritory: false });
  } else if (actionVal === 'hide_protect') {
    h += renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, { includeTerritory: false, includeOwnMerit: true });
  } else if (['investigate', 'misc'].includes(actionVal)) {
    h += renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, { includeTerritory: true });
  } else if (actionVal === 'maintenance') {
    const alreadyMaintained = getAlreadyMaintainedTargets(n, saved, 5);
    h += renderMaintenanceChips(n, saved, currentChar, alreadyMaintained);
  }

  h += '</div>';
  return h;
}

/** Character-or-Other (or Character/Territory/Other) target sub-widget. */
function renderTargetCharOrOther(n, savedType, savedCharId, savedTerrId, savedOther, chars, opts = {}) {
  const { includeTerritory = false, includeOwnMerit = false } = opts;
  const options = [];
  if (includeOwnMerit) options.push('own_merit');
  options.push('character');
  if (includeTerritory) options.push('territory');
  options.push('other');
  const labelMap = { own_merit: 'Own Merit', character: 'Character', territory: 'Territory', other: 'Other' };
  const effectiveType = savedType || (includeOwnMerit ? 'own_merit' : (includeTerritory ? '' : 'character'));

  let h = `<fieldset class="dt-ticker" aria-label="Target type">`;
  for (const opt of options) {
    const chk = effectiveType === opt ? ' checked' : '';
    h += `<label class="dt-ticker__pill"><input type="radio" name="dt-project_${n}_target_type" value="${esc(opt)}"${chk} data-flex-type="project_${n}_target"> ${esc(labelMap[opt])}</label>`;
  }
  h += '</fieldset>';

  if (effectiveType === 'own_merit') {
    h += `<select id="dt-project_${n}_target_value" class="qf-select">`;
    h += '<option value="">— Select Merit / Asset —</option>';
    for (const m of (currentChar.merits || [])) {
      const mLabel = m.area ? `${m.name} (${m.area})` : (m.qualifier ? `${m.name} (${m.qualifier})` : m.name);
      const mKey = `${m.name}|${m.area || m.qualifier || ''}`;
      const sel = mKey === savedCharId ? ' selected' : '';
      h += `<option value="${esc(mKey)}"${sel}>${esc(mLabel)}</option>`;
    }
    h += '</select>';
  } else if (effectiveType === 'character') {
    // Universal char picker (ADR-003 §Q6) — site #2
    const initialJson = esc(JSON.stringify(savedCharId ? String(savedCharId) : ''));
    h += `<input type="hidden" id="dt-project_${n}_target_value" value="${esc(savedCharId)}">`;
    h += `<div data-cp-mount data-cp-site="project-target-char"`
       + ` data-cp-scope="all" data-cp-cardinality="single"`
       + ` data-cp-hidden="dt-project_${n}_target_value"`
       + ` data-cp-initial="${initialJson}"`
       + ` data-cp-placeholder="Pick a target character"></div>`;
  } else if (effectiveType === 'territory') {
    h += renderTerritoryPills(`dt-project_${n}_target_terr`, savedTerrId);
    h += `<input type="hidden" id="dt-project_${n}_target_value" value="">`;
  } else if (effectiveType === 'other') {
    h += `<div class="dt-target-other-input">`;
    h += `<input type="text" id="dt-project_${n}_target_other" class="qf-input" value="${esc(savedOther)}" placeholder="Describe the target">`;
    h += `</div>`;
    h += `<input type="hidden" id="dt-project_${n}_target_value" value="">`;
  }

  return h;
}

/** Single-select territory pills. fieldId = the hidden input ID (same as old select ID).
 *  Uses the canonical .dt-chip-grid / .dt-chip styling so target-zone territory chips
 *  match the character roster visually. */
function renderTerritoryPills(fieldId, savedVal) {
  let h = `<div class="dt-chip-grid" data-terr-single="${fieldId}">`;
  for (const t of TERRITORY_DATA) {
    const selected = savedVal === t.slug ? ' dt-chip--selected' : '';
    h += `<button type="button" class="dt-chip${selected}" data-terr-single="${fieldId}" data-terr-val="${esc(t.slug)}">${esc(t.name)}</button>`;
  }
  h += '</div>';
  h += `<input type="hidden" id="${fieldId}" value="${esc(savedVal || '')}">`;
  return h;
}

/** Feeding territory pills. Pass rote=true for the rote-hunt variant (separate IDs/data-attrs).
 *  When rote=true, supply mainGridVals so rote pills can disable invalid pairings:
 *  - rote-Barrens is only enabled when main feed is Barrens
 *  - non-Barrens rote pills are disabled when main feed is Barrens
 */
function renderFeedingTerritoryPills(gridVals, rote = false, mainGridVals = null) {
  const idPfx = rote ? 'feed-rote-val' : 'feed-val';
  const keyAttr = rote ? 'data-feed-rote-terr-key' : 'data-feed-terr-key';
  const statusAttr = rote ? 'data-feed-rote-status' : 'data-feed-status';
  const activeAttr = rote ? 'data-feed-rote-active' : 'data-feed-active';
  // Determine main-feed Barrens state for rote-pill gating
  let mainIsBarrens = false;
  if (rote && mainGridVals) {
    for (const t of FEEDING_TERRITORIES) {
      const k = t.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      if (mainGridVals[k] && mainGridVals[k] !== 'none' && t.includes('Barrens')) {
        mainIsBarrens = true;
      }
    }
  }
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
    const statusVal = isBarrens ? 'barrens' : (hasFeedingRights ? 'feeding_rights' : 'poaching');
    const statusLabel = isBarrens ? 'The Barrens' : (hasFeedingRights ? 'Feeding Rights' : 'Poaching');

    const activeClass = isActive
      ? (isBarrens ? ' dt-terr-pill-barrens' : (hasFeedingRights ? ' dt-terr-pill-rights' : ' dt-terr-pill-poach'))
      : '';

    // Rote-feed Barrens lock: if main is Barrens, only Barrens-rote is allowed;
    // if main is non-Barrens, Barrens-rote is disallowed. Also disable Barrens
    // rote when no main territory is picked yet (you can't rote without main).
    let disabled = false;
    if (rote) {
      if (isBarrens) {
        if (!mainIsBarrens) disabled = true;
      } else {
        if (mainIsBarrens) disabled = true;
      }
    }
    const disabledAttrs = disabled ? ' disabled aria-disabled="true" title="Rote territory must match main feed territory"' : '';
    const disabledClass = disabled ? ' dt-terr-pill-disabled' : '';

    h += `<button type="button" class="dt-terr-pill${activeClass}${disabledClass}"${disabledAttrs}`;
    h += ` ${keyAttr}="${terrKey}" ${statusAttr}="${statusVal}" ${activeAttr}="${isActive ? '1' : '0'}">`;
    h += `<span class="dt-terr-pill-name">${esc(isBarrens ? 'The Barrens' : terr)}</span>`;
    if (isBarrens) {
      if (isActive) h += `<span class="dt-terr-pill-amb">Barrens (-4)</span>`;
    } else if (ambience) {
      const mod = terrData?.ambienceMod;
      const modStr = mod !== undefined ? ` (${mod >= 0 ? '+' : ''}${mod})` : '';
      h += `<span class="dt-terr-pill-amb">${esc(ambience)}${modStr}</span>`;
    }
    if (isActive && !isBarrens) h += `<span class="dt-terr-pill-status">${statusLabel}</span>`;
    h += '</button>';
    h += `<input type="hidden" id="${idPfx}-${terrKey}" value="${savedVal}">`;
  }
  h += '</div>';
  return h;
}

// DTUI-17: Allies Ambience eligibility — effective dots ≥ 3 without HwV, ≥ 2 with
function getAlliesAmbienceEligible(m) {
  const effectiveDots = meritEffectiveRating(currentChar, m);
  const hwv = (currentChar.merits || []).some(
    merit => merit.name === 'Honey With Vinegar' || merit.name === 'Honey with Vinegar'
  );
  if (hwv) return effectiveDots >= 2;
  return effectiveDots >= 3;
}

// DTUI-19: Grow XP block — scoped to a specific Allies merit instance
function renderAlliesGrowXp(n, prefix, m, saved) {
  const currentDots = meritEffectiveRating(currentChar, m);
  const savedTarget = parseInt(saved[`${prefix}_${n}_grow_target`] || '0') || 0;
  const meritName = m.area ? `Allies (${m.area})` : (m.qualifier ? `Allies (${m.qualifier})` : 'Allies');

  let h = '<div class="qf-field">';
  h += `<p class="qf-desc">Growing: <strong>${esc(meritName)}</strong> — currently ${currentDots} dot${currentDots !== 1 ? 's' : ''}.</p>`;
  h += `<label class="qf-label" for="dt-${prefix}_${n}_grow_target">Target dots</label>`;
  h += `<select id="dt-${prefix}_${n}_grow_target" class="qf-select" data-grow-target="${prefix}_${n}">`;
  h += '<option value="">— Select target —</option>';
  const maxTarget = currentDots < 3 ? 3 : Math.min(currentDots + 1, 5);
  for (let d = currentDots + 1; d <= maxTarget; d++) {
    const sel = savedTarget === d ? ' selected' : '';
    h += `<option value="${d}"${sel}>${d} dot${d !== 1 ? 's' : ''}</option>`;
  }
  h += '</select>';
  if (savedTarget > currentDots) {
    const xpCost = (savedTarget - currentDots) * 1;
    h += `<p class="qf-desc dt-grow-xp-cost">${xpCost} XP to reach ${savedTarget} dots.</p>`;
  }
  h += '</div>';
  return h;
}

// DTUI-18: Allies Ambience contribution magnitude
function getAlliesAmbienceContribution(m) {
  const effectiveDots = meritEffectiveRating(currentChar, m);
  const hwv = (currentChar.merits || []).some(
    merit => merit.name === 'Honey With Vinegar' || merit.name === 'Honey with Vinegar'
  );
  if (hwv) {
    if (effectiveDots >= 4) return 2;
    if (effectiveDots >= 2) return 1;
    return 0;
  }
  if (effectiveDots >= 5) return 2;
  if (effectiveDots >= 3) return 1;
  return 0;
}

// DTUI-18: read-only contribution notice for Ambience actions
function renderAlliesAmbienceDisplay(m, actionVal) {
  const contribution = getAlliesAmbienceContribution(m);
  if (contribution === 0) return '';
  const sign = actionVal === 'ambience_increase' ? '+' : '-';
  const copy = `You are exhausting these allies for the next game. These allies will count ${sign}${contribution} towards the targeted territory's ambience.`;
  return `<div class="dt-action-desc" aria-live="polite">${esc(copy)}</div>`;
}

// DTUI-15: map sphere action values to ACTION_DESCRIPTIONS keys
function sphereActionDescKey(val) {
  if (val === 'ambience_increase') return 'ambience_change_improve';
  if (val === 'ambience_decrease') return 'ambience_change_degrade';
  return val;
}

function renderSphereFields(n, prefix, fields, saved, charMerits, sphereMerit = null) {
  let h = '';

  if (fields.includes('territory')) {
    const savedTerr = saved[`${prefix}_${n}_territory`] || '';
    h += '<div class="qf-field">';
    h += '<label class="qf-label">Territory</label>';
    h += renderTerritoryPills(`dt-${prefix}_${n}_territory`, savedTerr);
    h += '</div>';
    // DTUI-18: Allies Ambience contribution display (after territory picker)
    const actionVal = saved[`${prefix}_${n}_action`] || '';
    if (sphereMerit && (actionVal === 'ambience_increase' || actionVal === 'ambience_decrease')) {
      h += renderAlliesAmbienceDisplay(sphereMerit, actionVal);
    }
  }

  if (fields.includes('ambience_dir')) {
    // Direction toggle for ambience_change. Mirrors the project pattern.
    // Default 'improve' if no saved direction yet. Reads legacy
    // ambience_increase/_decrease as improve/degrade for back-compat.
    const actionVal = saved[`${prefix}_${n}_action`] || '';
    let savedDir = saved[`${prefix}_${n}_ambience_dir`] || '';
    if (!savedDir) {
      if (actionVal === 'ambience_decrease') savedDir = 'degrade';
      else savedDir = 'improve';
    }
    h += '<div class="qf-field">';
    h += '<label class="qf-label">Direction</label>';
    h += `<fieldset class="dt-ticker" aria-label="Ambience direction">`;
    for (const [d, dLabel] of [['improve', 'Increase (+)'], ['degrade', 'Decrease (−)']]) {
      h += `<label class="dt-ticker__pill"><input type="radio" name="dt-${prefix}_${n}_ambience_dir" value="${d}"${savedDir === d ? ' checked' : ''} data-sphere-ambience-dir="${n}"> ${dLabel}</label>`;
    }
    h += `</fieldset>`;
    h += '</div>';
  }

  if (fields.includes('target_char')) {
    // DTUI-16: replaced dt-shoutout-grid checkboxes with .dt-chip-grid--single
    let savedTarget = saved[`${prefix}_${n}_target_value`] || '';
    // Handle legacy JSON array saved values from old checkbox approach
    try {
      const parsed = JSON.parse(savedTarget);
      if (Array.isArray(parsed) && parsed.length) savedTarget = String(parsed[0]);
    } catch { /* plain string */ }
    h += '<div class="qf-field">';
    h += '<label class="qf-label">Target Character</label>';
    h += `<input type="hidden" id="dt-${prefix}_${n}_target_value" value="${esc(savedTarget)}">`;
    h += `<div class="dt-chip-grid dt-chip-grid--single" data-sphere-char-grid="${prefix}_${n}">`;
    for (const c of allCharacters) {
      const id = String(c.id);
      const isSelected = savedTarget === id;
      const selectedClass = isSelected ? ' dt-chip--selected' : '';
      h += `<button type="button" class="dt-chip${selectedClass}"`;
      h += ` data-sphere-char-target="${prefix}_${n}" data-char-id="${esc(id)}">${esc(c.name)}</button>`;
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
    // DTFP-6: shared target picker; field id pattern preserved for save/handlers.
    h += renderTargetPicker(`${prefix}_${n}_target`, {
      savedType,
      savedValue: savedVal,
      allCharacters,
    });
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

  if (fields.includes('maintenance_target')) {
    // DTUI-16: sphere maintenance — reuse renderMaintenanceChips with sphere prefix
    const maxSphereSlots = detectedMerits.spheres.length;
    const alreadyMaint = getSphereAlreadyMaintainedTargets(prefix, n, saved, maxSphereSlots);
    h += '<div class="qf-field">';
    h += '<label class="qf-label">What are you maintaining?</label>';
    h += renderMaintenanceChips(n, saved, currentChar, alreadyMaint, prefix);
    h += '</div>';
  }

  if (fields.includes('grow_xp')) {
    h += renderAlliesGrowXp(n, prefix, sphereMerit || {}, saved);
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

      // T24 (DTLT-6): if committed as support to a project, lock the pane
      if (actionVal === 'support') {
        const sphereSlotKey = `sphere_${n}`;
        let owningProject = null;
        for (let pn = 1; pn <= 4; pn++) {
          let chips = [];
          try { chips = JSON.parse(saved[`project_${pn}_joint_sphere_chips`] || '[]'); } catch { chips = []; }
          if (Array.isArray(chips) && chips.includes(sphereSlotKey)) { owningProject = pn; break; }
        }
        h += '<div class="dt-sphere-locked">';
        h += `<span class="dt-sphere-locked-badge">Committed to support of Project ${owningProject || '?'}</span>`;
        h += `<p class="dt-sphere-locked-help">Un-tick this Ally's chip in the project's Support Assets panel to free this slot.</p>`;
        h += '</div>';
        h += `<input type="hidden" id="dt-sphere_${n}_action" value="support">`;
        h += `<input type="hidden" id="dt-sphere_${n}_merit_key" value="${esc(meritKey(m))}">`;
        h += '</div>';
        continue;
      }

      // Store which merit this slot references
      h += `<input type="hidden" id="dt-sphere_${n}_merit_key" value="${esc(meritKey(m))}">`;

      // Action type selector
      h += '<div class="qf-field">';
      h += `<label class="qf-label" for="dt-sphere_${n}_action">Action Type</label>`;
      h += `<select id="dt-sphere_${n}_action" class="qf-select" data-sphere-action="${n}">`;
      // DTUI-17/19: filter per-merit eligibility; Grow now included
      const ambienceEligible = getAlliesAmbienceEligible(m);
      const filteredActions = SPHERE_ACTIONS.filter(o => {
        if (!ambienceEligible && o.value === 'ambience_change') return false;
        return true;
      });
      // Legacy actionVals 'ambience_increase'/'ambience_decrease' map to 'ambience_change' for the dropdown
      const dropdownVal = (actionVal === 'ambience_increase' || actionVal === 'ambience_decrease') ? 'ambience_change' : actionVal;
      for (const opt of filteredActions) {
        const sel = dropdownVal === opt.value ? ' selected' : '';
        h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
      }
      h += '</select></div>';

      // DTUI-15: action description below dropdown
      const descKey = sphereActionDescKey(actionVal);
      if (actionVal && ACTION_DESCRIPTIONS[descKey]) {
        h += `<div class="dt-action-desc" aria-live="polite">${esc(ACTION_DESCRIPTIONS[descKey])}</div>`;
      }

      h += renderSphereFields(n, 'sphere', fields, saved, charMerits, m);

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
      // Legacy actionVals map to 'ambience_change' for the dropdown
      const stDropdownVal = (actionVal === 'ambience_increase' || actionVal === 'ambience_decrease') ? 'ambience_change' : actionVal;
      for (const opt of SPHERE_ACTIONS) {
        const sel = stDropdownVal === opt.value ? ' selected' : '';
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
      const area = m.area || m.qualifier || '— sphere unset —';
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
      h += `<textarea id="dt-contact_${n}_request" class="qf-textarea" rows="3" placeholder="e.g. \u201CWhat does Marcus Reilly know about the missing shipment from March?\u201D">${esc(savedReq)}</textarea>`;
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
      const dots = '\u25CF'.repeat(meritEffectiveRating(currentChar, m) || 1);
      const ghoulTag = m.ghoul ? ' (Ghoul)' : '';
      const savedType = saved[`retainer_${n}_type`] || '';
      const savedTask = saved[`retainer_${n}_task`] || '';

      // Lock the retainer to "support" if its slot is referenced in any
      // project's joint_sphere_chips (matches the sphere section pattern).
      const retainerSlotKey = `retainer_${n}`;
      let supportingProject = null;
      for (let pn = 1; pn <= 4; pn++) {
        let chips = [];
        try { chips = JSON.parse(saved[`project_${pn}_joint_sphere_chips`] || '[]'); } catch { chips = []; }
        if (Array.isArray(chips) && chips.includes(retainerSlotKey)) { supportingProject = pn; break; }
      }

      if (supportingProject) {
        h += `<div class="dt-contact-row dt-contact-used" data-retainer-row="${n}">`;
        h += `<div class="dt-contact-header">`;
        h += `<span class="dt-contact-area">${esc(area)}${esc(ghoulTag)}</span>`;
        h += `<span class="dt-contact-dots">${dots}</span>`;
        h += `<span class="dt-contact-status">Support</span>`;
        h += '</div>';
        h += `<div class="dt-contact-panel">`;
        h += '<div class="dt-sphere-locked">';
        h += `<span class="dt-sphere-locked-badge">Committed to support of Project ${supportingProject}</span>`;
        h += `<p class="dt-sphere-locked-help">Un-tick this Retainer's chip in the project's Support Assets panel to free this slot.</p>`;
        h += '</div>';
        h += `<input type="hidden" id="dt-retainer_${n}_merit" value="${esc(meritLabel(m))}">`;
        h += '</div>'; // panel
        h += '</div>'; // row
        continue;
      }

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

    // Retainers: tick when any retainer has a task OR is committed to support
    if (key === 'retainers') {
      const maxR = detectedMerits.retainers.length;
      let anyUsed = false;
      for (let n = 1; n <= maxR; n++) {
        const t = document.getElementById(`dt-retainer_${n}_type`);
        const d = document.getElementById(`dt-retainer_${n}_task`);
        if ((t && t.value.trim()) || (d && d.value.trim())) { anyUsed = true; break; }
      }
      // Also tick if any retainer slot is in a project's joint_sphere_chips
      if (!anyUsed) {
        const r = responseDoc?.responses || {};
        for (let pn = 1; pn <= 4 && !anyUsed; pn++) {
          let chips = [];
          try { chips = JSON.parse(r[`project_${pn}_joint_sphere_chips`] || '[]'); } catch { chips = []; }
          if (Array.isArray(chips) && chips.some(k => k.startsWith('retainer_'))) anyUsed = true;
        }
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
  // feeding_method renders its own label inside the container
  if (q.type !== 'feeding_method') {
    h += `<label class="qf-label" for="dt-${q.key}">${esc(q.label)}${reqMark}</label>`;
  }

  if (q.desc) {
    let descHtml = esc(q.desc).replace(/\n/g, '<br>');
    descHtml = descHtml.replace(/(Example:\s*.*)$/i, '<em>$1</em>');
    h += `<p class="qf-desc">${descHtml}</p>`;
  }

  switch (q.type) {
    case 'text':
      h += `<input type="text" id="dt-${q.key}" class="qf-input" value="${esc(value)}"${q.placeholder ? ` placeholder="${esc(q.placeholder)}"` : ''}>`;
      break;

    case 'textarea':
      h += `<textarea id="dt-${q.key}" class="qf-textarea" rows="${q.rows || 4}"${q.placeholder ? ` placeholder="${esc(q.placeholder)}"` : ''}>${esc(value)}</textarea>`;
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
      // Universal char picker (ADR-003 §Q6) — site #4 (attendees scope, multi).
      // Max-3 cap preserved via consumer-side onChange (see _makeCharPickerOnChange).
      let picks = [];
      if (value) { try { picks = JSON.parse(value); } catch { /* ignore */ } }
      const initialIds = picks.map(String).filter(Boolean);
      const initialJson = esc(JSON.stringify(initialIds));
      const savedJson = esc(JSON.stringify(initialIds));
      h += `<input type="hidden" id="dt-${esc(q.key)}" value="${savedJson}">`;
      h += `<div data-cp-mount data-cp-site="shoutout"`
         + ` data-cp-scope="attendees" data-cp-cardinality="multi"`
         + ` data-cp-hidden="dt-${esc(q.key)}"`
         + ` data-cp-initial="${initialJson}"`
         + ` data-cp-placeholder="Pick up to 3 attendees"></div>`;
      h += '<p class="qf-desc dt-shoutout-limit-hint">Up to 3 picks. A 4th will be ignored.</p>';
      break;
    }

    case 'feeding_method': {
      const c = currentChar;
      const savedDesc = responseDoc?.responses?.['feeding_description'] || '';

      // ── Container 1: Main hunt ──
      h += '<div class="dt-feed-card-wrap">';
      // Territory picker embedded at top of this container
      {
        const feedingSect = DOWNTIME_SECTIONS.find(s => s.key === 'feeding');
        const terrQ = feedingSect?.questions.find(q => q.type === 'territory_grid');
        if (terrQ) {
          const terrVal = (responseDoc?.responses || {})[terrQ.key] || '';
          let terrGridVals = {};
          try { terrGridVals = JSON.parse(terrVal); } catch { /* ignore */ }
          h += '<label class="qf-label">Where does your character hunt? <span class="qf-req">*</span></label>';
          h += `<div id="dt-${terrQ.key}" style="margin-top:10px">${renderFeedingTerritoryPills(terrGridVals)}</div>`;
          h += '<p class="qf-desc" style="margin-top:10px">Ambience shown is current. Actual feeding ambience is calculated after Downtime processing and may shift based on how many Kindred feed in each territory.</p>';
        }
      }
      h += `<label class="qf-label" style="margin-top:10px;display:block">How does your character hunt? <span class="qf-req">*</span></label>`;
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

      // Blood type selection — single-select (legacy multi-array reads first item)
      const BLOOD_TYPES = ['Animal', 'Human', 'Kindred'];
      let savedBlood = [];
      try { savedBlood = JSON.parse(responseDoc?.responses?.['_feed_blood_types'] || '[]'); } catch { /* ignore */ }
      const selectedBlood = Array.isArray(savedBlood) && savedBlood.length ? savedBlood[0] : '';
      h += '<div class="qf-field">';
      h += '<label class="qf-label">Blood Type</label>';
      h += '<div class="dt-feed-violence-toggle">';
      for (const bt of BLOOD_TYPES) {
        const on = selectedBlood === bt ? ' dt-feed-vi-on' : '';
        h += `<button type="button" class="dt-feed-vi-btn${on}" data-blood-type="${esc(bt)}">${esc(bt)}</button>`;
      }
      h += '</div></div>';

      // ── DTFP-5: Kiss / Violent toggle ──
      const persistedViolence = responseDoc?.responses?.feed_violence || '';
      const preselect = persistedViolence || (FEED_VIOLENCE_DEFAULTS[feedMethodId] || '');
      h += '<div class="qf-field">';
      h += '<label class="qf-label">How loud was the feeding?</label>';
      h += '<div class="dt-feed-violence-toggle">';
      h += `<button type="button" class="dt-feed-vi-btn${preselect === 'kiss' ? ' dt-feed-vi-on' : ''}" data-feed-violence="kiss">The Kiss (subtle)</button>`;
      h += `<button type="button" class="dt-feed-vi-btn${preselect === 'violent' ? ' dt-feed-vi-on' : ''}" data-feed-violence="violent">The Assault (violent)</button>`;
      h += '</div>';
      if (!persistedViolence && !preselect) {
        h += '<p class="qf-desc dt-feed-vi-hint">Pick one. Your method does not pre-select for you.</p>';
      } else if (!persistedViolence && preselect) {
        h += '<p class="qf-desc dt-feed-vi-hint">Pre-selected based on your method. Click to confirm or change.</p>';
      }
      h += '</div>';

      h += '<div class="qf-field">';
      h += `<textarea id="dt-feeding_description" class="qf-textarea" rows="4" placeholder="Describe how your character hunts">${esc(savedDesc)}</textarea>`;
      h += '</div>';
      h += '</div>'; // dt-feed-card-wrap

      // ── Container 2: Feeding quality (Standard / Rote) ──
      {
        const savedRote = responseDoc?.responses?.['_feed_rote'] === 'yes';
        if (savedRote && !feedRoteAction) feedRoteAction = true;
        feedRoteDisc = responseDoc?.responses?.['_rote_disc'] || feedRoteDisc;
        feedRoteSpec = responseDoc?.responses?.['_rote_spec'] || feedRoteSpec;
        feedRoteCustomAttr = responseDoc?.responses?.['_rote_custom_attr'] || feedRoteCustomAttr;
        feedRoteCustomSkill = responseDoc?.responses?.['_rote_custom_skill'] || feedRoteCustomSkill;

        const saved = responseDoc?.responses || {};

        const firstAvail = [1,2,3,4].find(n => {
          const act = saved[`project_${n}_action`];
          return !act || act === 'feed';
        }) || 1;
        if (feedRoteAction && feedRoteSlot !== firstAvail) feedRoteSlot = firstAvail;

        const roteDesc = saved[`project_${feedRoteSlot}_description`] || '';

        h += '<div class="dt-feed-rote-section">';
        h += '<label class="qf-label">Commit a project to hunting this downtime?</label>';
        h += '<div class="dt-feed-violence-toggle">';
        h += `<button type="button" class="dt-feed-vi-btn${!feedRoteAction ? ' dt-feed-vi-on' : ''}" data-feed-rote="off">Standard Hunt</button>`;
        h += `<button type="button" class="dt-feed-vi-btn${feedRoteAction ? ' dt-feed-vi-on' : ''}" data-feed-rote="on">Rote Hunt</button>`;
        h += '</div>';
        if (feedRoteAction) {
          h += '<div class="dt-rote-slot-picker">';
          h += `<p class="qf-desc" style="margin:0 0 8px">Commits <strong>Project ${feedRoteSlot}</strong> to this hunt. IF this roll is successful, it will apply the Rote quality to your feeding roll (roll twice, take the best result).</p>`;
          {
            const roteTerrSaved = (responseDoc?.responses || {})['feeding_territories_rote'] || '';
            let roteTerrGridVals = {};
            try { roteTerrGridVals = JSON.parse(roteTerrSaved); } catch { /* ignore */ }
            const mainTerrSaved = (responseDoc?.responses || {})['feeding_territories'] || '';
            let mainTerrGridVals = {};
            try { mainTerrGridVals = JSON.parse(mainTerrSaved); } catch { /* ignore */ }
            h += '<div class="qf-field">';
            h += '<p class="qf-desc" style="margin:0 0 6px;font-size:.85em;opacity:.8">Rote feed must use the same territory type as your main feed. Barrens locks both.</p>';
            h += renderFeedingTerritoryPills(roteTerrGridVals, true, mainTerrGridVals);
            h += '</div>';
          }
          h += renderFeedPoolSelector(c, feedMethodId, feedRoteCustomAttr, feedRoteCustomSkill, feedRoteDisc, feedRoteSpec, 'rote');
          h += `<div class="qf-field"><textarea id="dt-rote-description" class="qf-textarea" rows="4" placeholder="Describe how your character hunts">${esc(roteDesc)}</textarea></div>`;
          h += '</div>';
        }
        h += '</div>';
      }

      // ── Container 3: Vitae Projection ──
      {
        const allResp = responseDoc?.responses || {};
        const vitaeMax = calcVitaeMax(c);

        // Monthly costs
        // Ghoul Retainer: 1 vitae per ghoul retainer merit (not per dot)
        const ghoulCost = (c.merits || [])
          .filter(m => m.name === 'Retainer' && (m.ghoul || m.type === 'ghoul'))
          .length;
        // Cruac Rites: 1 vitae for level 1-3, 2 vitae for level 4-5.
        // Mandragora 3: parked rites (sorcery_N_mandragora === 'yes') are
        // sustained by the garden and cost no vitae for this casting — skip
        // their cost from the projection.
        const rites = (c.powers || []).filter(p => p.category === 'rite');
        const sorcCount = parseInt(allResp['sorcery_slot_count'] || '1', 10);
        let riteVitaeCost = 0;
        for (let sn = 1; sn <= sorcCount; sn++) {
          const riteName = allResp[`sorcery_${sn}_rite`];
          if (!riteName) continue;
          if (allResp[`sorcery_${sn}_mandragora`] === 'yes') continue;
          const rite = rites.find(r => r.name === riteName);
          if (rite) riteVitaeCost += riteCost(rite).vitae;
        }
        // Mandragora Garden — effective dots across all bonus channels
        const mandDots = effectiveDomainDots(c, 'Mandragora Garden');
        // Each effective dot produces 1 Blood Fruit (worth 2 vitae if consumed; not on the vitae track)
        const bloodFruit = mandDots;
        // Herd: TM errata — 1 vitae per effective dot per month, all bonus channels included.
        const herdDots = effectiveDomainDots(c, 'Herd');
        // Oath of Fealty: stored as a power (category 'pact'), not a merit.
        // +vitae equal to effective Invictus Status when present.
        //
        // Effective Invictus Status = max(stored covenant status, OTS floor).
        // OTS (Oath of the Scapegoat) provides a covenant-status floor equal to
        // its dot rating, which lets characters whose stored status is otherwise
        // depressed (negative reputation in fiction) still benefit mechanically.
        // We compute the OTS floor inline as a fallback in case the cached
        // c._ots_covenant_bonus hasn't been refreshed for this character.
        const otsPact = (c.powers || []).find(p =>
          p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of the scapegoat'
        );
        const otsFloor = Math.max(
          c._ots_covenant_bonus || 0,
          otsPact ? ((otsPact.cp || 0) + (otsPact.xp || 0)) : 0
        );
        const hasOathOfFealty = (c.powers || []).some(p =>
          p.category === 'pact' && (p.name || '').toLowerCase() === 'oath of fealty'
        );
        const invStatusForOath = Math.max(c.status?.covenant?.['Invictus'] || 0, otsFloor);
        const oathBonus = hasOathOfFealty ? invStatusForOath : 0;

        // Resolve ambienceMod from a territory grid — returns {mod, label} or null
        const resolveTerrAmbience = (gridJson) => {
          let grid = {};
          try { grid = JSON.parse(gridJson || '{}'); } catch { /* ignore */ }
          const key = Object.keys(grid).find(k =>
            grid[k] === 'feeding_rights' || grid[k] === 'poaching' ||
            grid[k] === 'resident' || grid[k] === 'poacher' || grid[k] === 'barrens'
          );
          if (!key) return null;
          if (grid[key] === 'barrens') return { mod: -4, label: 'Barrens (The Barrens)' };
          const name = FEEDING_TERRITORIES.find(t => t.toLowerCase().replace(/[^a-z0-9]+/g, '_') === key);
          if (!name) return null;
          const td = TERRITORY_DATA.find(t => t.name === name);
          if (!td) return null;
          return { mod: td.ambienceMod || 0, label: `${td.ambience} (${name})` };
        };

        const mainAmb = resolveTerrAmbience(allResp['feeding_territories']);
        const roteAmb = feedRoteAction ? resolveTerrAmbience(allResp['feeding_territories_rote']) : null;

        // Best of the two territories (highest mod wins)
        let bestAmb = null;
        if (mainAmb !== null && roteAmb !== null) {
          const useRote = roteAmb.mod > mainAmb.mod;
          bestAmb = { ...(useRote ? roteAmb : mainAmb), fromRote: useRote };
        } else {
          bestAmb = mainAmb ?? roteAmb ?? null;
        }

        // Compute main hunt dice pool (used for average vitae yield)
        let mainPool = 0;
        if (feedCustomAttr) mainPool += getAttrEffective(c, feedCustomAttr);
        if (feedCustomSkill) mainPool += skTotal(c, feedCustomSkill);
        if (feedDiscName) mainPool += discDots(c, feedDiscName);
        const fgVal = effectiveDomainDots(c, 'Feeding Grounds');
        mainPool += fgVal;
        if (feedSpecName) mainPool += hasAoE(c, feedSpecName) ? 2 : 1;
        // Average vitae: base = floor(2N/3); rote = floor(5N/6) (max of two rolls)
        const avgGathered = feedRoteAction
          ? Math.floor((mainPool * 5) / 6)
          : Math.floor((mainPool * 2) / 3);

        // Group mods into positives and negatives
        const posMods = [];
        const negMods = [];
        if (bestAmb !== null) {
          const fromNote = bestAmb.fromRote ? ' (rote territory)' : '';
          const lbl = `Ambience: ${bestAmb.label}${fromNote}`;
          if (bestAmb.mod >= 0) posMods.push({ label: lbl, val: bestAmb.mod });
          else negMods.push({ label: lbl, val: bestAmb.mod });
        }
        if (herdDots > 0) posMods.push({ label: `Herd (${'●'.repeat(herdDots)})`, val: herdDots });
        if (oathBonus > 0) posMods.push({ label: `Oath of Fealty (Invictus Status ${invStatusForOath})`, val: oathBonus });
        if (ghoulCost > 0) negMods.push({ label: 'Ghoul Retainers', val: -ghoulCost });
        if (riteVitaeCost > 0) negMods.push({ label: 'Cruac Rites', val: -riteVitaeCost });
        if (mandDots > 0) negMods.push({ label: `Mandragora Garden (${'●'.repeat(mandDots)})`, val: -mandDots });

        const netStarting = posMods.reduce((s, m) => s + m.val, 0) + negMods.reduce((s, m) => s + m.val, 0);
        const projected = Math.max(0, Math.min(vitaeMax, netStarting + avgGathered));

        h += '<div class="dt-vitae-budget">';
        h += '<div class="dt-vitae-budget-title">Vitae Projection</div>';
        h += '<div class="dt-vitae-row"><span>Starting Vitae</span><span>0</span></div>';
        for (const mod of posMods) {
          h += `<div class="dt-vitae-row dt-vitae-pos"><span>${esc(mod.label)}</span><span>+${mod.val}</span></div>`;
        }
        for (const mod of negMods) {
          h += `<div class="dt-vitae-row dt-vitae-cost"><span>${esc(mod.label)}</span><span>−${Math.abs(mod.val)}</span></div>`;
        }
        const netSign = netStarting >= 0 ? '+' : '−';
        h += `<div class="dt-vitae-row dt-vitae-subtotal"><span>Net starting Vitae</span><span>${netSign}${Math.abs(netStarting)}</span></div>`;
        if (mainPool > 0) {
          const yieldLabel = feedRoteAction ? 'Projected average gathered (rote)' : 'Projected average gathered';
          h += `<div class="dt-vitae-row dt-vitae-pos"><span>${yieldLabel}</span><span>+${avgGathered}</span></div>`;
        } else {
          h += '<div class="dt-vitae-row dt-vitae-note"><span style="font-style:italic;color:var(--txt3)">Build your hunt pool above to see expected yield.</span><span></span></div>';
        }
        h += `<div class="dt-vitae-row dt-vitae-total"><span>Projected Vitae after feeding</span><span class="${projected === 0 ? 'dt-vitae-over' : ''}">${projected} / ${vitaeMax}</span></div>`;
        if (bloodFruit > 0) h += `<div class="dt-vitae-row dt-vitae-note"><span>Blood Fruit produced (worth 2 vitae each if consumed)</span><span>${bloodFruit}</span></div>`;
        h += '</div>';
      }

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
