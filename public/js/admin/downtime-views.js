/**
 * Downtime domain views — admin app.
 * CSV upload, cycle management, submission overview, character bridge, feeding rolls.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { parseDowntimeCSV } from '../downtime/parser.js';
import { getCycles, getActiveCycle, createCycle, updateCycle, closeCycle, openGamePhase, getSubmissionsForCycle, upsertCycle, updateSubmission, mapRawToResponses } from '../downtime/db.js';
import { TERRITORY_DATA, AMBIENCE_CAP, AMBIENCE_MODS, FEEDING_TERRITORIES, FEED_METHODS as FEED_METHODS_DATA, DOWNTIME_SECTIONS } from '../player/downtime-data.js';
import { rollPool, showRollModal, parseDiceString } from '../downtime/roller.js';
import { getAttrEffective as getAttrVal, getSkillObj, skDots, skTotal, skNineAgain, skSpecs } from '../data/accessors.js';
import { displayName, displayNameRaw, sortName, hasAoE, isSpecs } from '../data/helpers.js';
import { calcTotalInfluence, domMeritContrib, ssjHerdBonus, flockHerdBonus } from '../editor/domain.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { SKILLS_MENTAL, ALL_ATTRS, ALL_SKILLS, SKILL_CATS } from '../data/constants.js';
import { getUser } from '../auth/discord.js';

// Convert UTC ISO string to datetime-local input value (local time)
function isoToLocalInput(iso) {
  const d = new Date(iso);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

let submissions = [];
let characters = [];
let charMap = new Map();
let allCycles = [];
let activeCycle = null;
let currentCycle = null;
let selectedCycleId = null;
const procExpandedKeys = new Set(); // tracks which action rows are expanded in processing mode
let procHideDone = false;           // when true, hide fully-resolved action rows from the queue
let cycleReminders = [];       // processing_reminders from the current cycle document
let attachReminderKey = null;  // key of the sorcery entry with Attach Reminder panel open
let cachedTerritories = null;  // territories from DB (for ambience dashboard); null = not yet loaded
let ambDashCollapsed = true;   // collapse state for the Ambience Dashboard panel
let _procQueueMap = null;      // Map<key, entry> built once per renderProcessingMode call; null outside render
let discDashCollapsed = true;  // collapse state for the Discipline Profile Matrix panel
let matrixCollapsed = true;    // collapse state for the Feeding Matrix section in the dashboard
const expandedPhases = new Set(); // phaseKeys currently expanded in Processing Mode (empty = all collapsed)
const preReadExpanded = new Set();   // subIds with pre-read body expanded in processing mode
const narrativeExpanded = new Set(); // subIds with narrative body expanded in processing mode
const xpReviewExpanded  = new Set(); // subIds with XP review body expanded in processing mode
const signOffExpanded   = new Set(); // subIds with sign-off body expanded in processing mode

// ── Processing Mode constants ────────────────────────────────────────────────

const PHASE_ORDER = {
  resolve_first: 0,
  feeding: 1,
  ambience_increase: 2, ambience_decrease: 2,
  hide_protect: 3,
  investigate: 4,
  attack: 5,
  patrol_scout: 6, support: 6,
  misc: 7, xp_spend: 7, maintenance: 7, block: 7, rumour: 7, grow: 7, acquisition: 7,
};

const PHASE_LABELS = {
  resolve_first: 'Step 1 — Blood Sorcery & Rituals',
  feeding: 'Step 2 — Feeding',
  ambience: 'Step 3 — Ambience',
  hide_protect: 'Step 4 — Defensive',
  investigate: 'Step 5 — Investigative',
  attack: 'Step 6 — Hostile',
  support_patrol: 'Step 7 — Support & Patrol',
  misc: 'Step 8 — Miscellaneous',
  allies: 'Allies',
  status: 'Status',
  retainers: 'Retainers',
  contacts: 'Contacts',
  resources_retainers: 'Resources & Retainers',
  other_merit: 'Other Merit Actions',
};

// Maps phase numeric key back to display label key
const PHASE_NUM_TO_LABEL = {
  0: 'resolve_first',
  1: 'feeding',
  2: 'ambience',
  3: 'hide_protect',
  4: 'investigate',
  5: 'attack',
  6: 'support_patrol',
  7: 'misc',
  8: 'allies',
  9: 'status',
  10: 'retainers',
  11: 'contacts',
  12: 'resources_retainers',
  13: 'other_merit',
};

const ACTION_TYPE_LABELS = {
  ambience_increase: 'Ambience Increase',
  ambience_decrease: 'Ambience Decrease',
  attack: 'Attack',
  hide_protect: 'Hide / Protect',
  investigate: 'Investigate',
  patrol_scout: 'Patrol / Scout',
  support: 'Support',
  misc: 'Miscellaneous',
  maintenance: 'Maintenance',
  xp_spend: 'XP Spend',
  block: 'Block',
  rumour: 'Rumour',
  grow: 'Grow',
  acquisition: 'Acquisition',
};

const ALL_ACTION_TYPES = [
  'ambience_increase', 'ambience_decrease', 'attack', 'hide_protect',
  'investigate', 'patrol_scout', 'support', 'misc', 'maintenance', 'xp_spend',
  'block', 'rumour', 'grow', 'acquisition',
];

const FEED_METHOD_LABELS_MAP = {
  seduction: 'Seduction', stalking: 'Stalking', force: 'By Force',
  familiar: 'Familiar Face', intimidation: 'Intimidation', other: 'Other',
};

// Discipline names to detect in validated pool expressions for discipline × territory recording
const KNOWN_DISCIPLINES = [
  'Animalism', 'Auspex', 'Celerity', 'Dominate', 'Majesty', 'Nightmare',
  'Obfuscate', 'Resilience', 'Vigor', 'Vigour', 'Protean', 'Cruac', 'Theban',
];

// ── Merit action matrix (from DT Merits.xlsx) ──────────────────────────────
// Defines pool formula, action mode, and effect text per merit category × action type.
// poolFormula: 'dots2plus2' | 'none' | 'contacts'
// mode: 'instant' | 'contested' | 'auto'
// effect: primary effect text (rolled option)
// effectAuto: fixed/unrolled effect (used when poolFormula is 'none' or ST chooses auto)

const MERIT_MATRIX = {
  allies: {
    ambience_increase: { poolFormula: 'none', mode: 'auto', effect: 'Lvl 3–4: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none', mode: 'auto', effect: 'Lvl 3–4: −1 ambience; Lvl 5: −2 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk − Hide/Protect) halved (round up) removed from target merit level',                                           effectAuto: '(Level − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit',                                 effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool',                                              effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1–5+)',  effectAuto: '(Level − Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate − Hide/Protect = net successes)',                                            effectAuto: 'See Investigation Matrix (Level − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1–5+)',    effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'auto',      effect: 'Auto blocks merit of same level or lower' },
  },
  status: {
    ambience_increase: { poolFormula: 'none', mode: 'auto', effect: 'Lvl 3–4: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none', mode: 'auto', effect: 'Lvl 3–4: −1 ambience; Lvl 5: −2 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk − Hide/Protect) halved (round up) removed from target merit level',                                           effectAuto: '(Level − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit',                                 effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool',                                              effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1–5+)',  effectAuto: '(Level − Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate − Hide/Protect = net successes)',                                            effectAuto: 'See Investigation Matrix (Level − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1–5+)',    effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'auto',      effect: 'Auto blocks merit of lower level' },
  },
  retainer: {
    ambience_increase: { poolFormula: 'none', mode: 'auto', effect: 'Lvl 3–4: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none', mode: 'auto', effect: 'Lvl 3–4: −1 ambience; Lvl 5: −2 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk − Hide/Protect) halved (round up) removed from target merit level',                                           effectAuto: '(Level − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit',                                 effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool',                                              effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1–5+)',  effectAuto: '(Level − Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate − Hide/Protect = net successes)',                                            effectAuto: 'See Investigation Matrix (Level − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1–5+)',    effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'blocked',   effect: 'Cannot perform Block' },
  },
  staff: {
    ambience_increase: { poolFormula: 'none', mode: 'auto', effect: '+1 ambience' },
    ambience_decrease: { poolFormula: 'none', mode: 'auto', effect: '−1 ambience' },
    attack:            { poolFormula: 'none', mode: 'contested', effect: '(1 − Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'none', mode: 'instant',   effect: '−1 success from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'none', mode: 'instant',   effect: '+1 success to supported action' },
    patrol_scout:      { poolFormula: 'none', mode: 'contested', effect: '1 action revealed (1 − Hide/Protect = net successes; detail scales 1–5+)' },
    investigate:       { poolFormula: 'none', mode: 'contested', effect: 'See Investigation Matrix (1 − Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'none', mode: 'instant',   effect: '1 similar-merit action revealed (1 success)' },
    block:             { poolFormula: 'none', mode: 'blocked',   effect: 'Cannot perform Block' },
  },
  contacts: {
    investigate:          { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
    patrol_scout:         { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
    rumour:               { poolFormula: 'contacts', mode: 'contested', effect: 'If ≥1 success: information appropriate to sphere/theme asked' },
  },
};

// Investigation Matrix: innate modifier and no-lead penalty per information type
const INVESTIGATION_MATRIX = [
  { type: 'Public',       innate: +3, noLead: -1,
    results: ['Gain all publicly available information', 'Also gain lead on Internal information', 'Also gain lead on Confidential information', 'Also gain lead on Restricted information', 'Also one Rumour'] },
  { type: 'Internal',     innate: -1, noLead: -2,
    results: ['Gain lead on Internal information', 'Learn whether the information you seek exists', 'Gain vague Internal information', 'Gain basic Internal information', 'Gain detailed Internal information'] },
  { type: 'Confidential', innate: -2, noLead: -4,
    results: ['Gain lead on Confidential information', 'Learn whether the information you seek exists', 'Gain vague Confidential information', 'Gain basic Confidential information', 'Gain detailed Confidential information'] },
  { type: 'Restricted',   innate: -3, noLead: -5,
    results: ['Gain lead on Restricted information', 'Learn whether the information you seek exists', 'Gain vague Restricted information', 'Gain basic Restricted information', 'Gain detailed Restricted information'] },
];

/**
 * Parse merit_type strings in any of these formats:
 *   "Allies 3 (Finance)"       — digit dot count, qualifier in parens
 *   "Allies (Media) ***"       — qualifier in parens, asterisk dot count after
 *   "Allies *** (Media)"       — asterisk dot count, qualifier in parens after
 *   "Allies (Media) ●●●"       — filled-circle dot count
 *   "Allies (Media)"           — qualifier only, no dot count
 * Returns { category, label, dots, qualifier }
 */
function _parseMeritType(str) {
  if (!str) return { category: 'misc', label: '—', dots: null, qualifier: '' };

  // Extract qualifier from first parenthesised group
  const qualMatch = str.match(/\(([^)]+)\)/);
  const qualifier = qualMatch ? qualMatch[1].trim() : '';

  // Strip qualifier parens, then find dot count (digit, run of *, or run of ●)
  const stripped = str.replace(/\s*\([^)]*\)/g, '').trim();
  const dotsMatch = stripped.match(/(\d+)|(\*+)|(●+)/);
  let dots = null;
  if (dotsMatch) {
    if (dotsMatch[1]) dots = parseInt(dotsMatch[1], 10);
    else              dots = (dotsMatch[2] || dotsMatch[3]).length;
  }

  // Label is the leading alphabetic/space portion before any digit or symbol run
  const label = (stripped.replace(/\s*[\d*●].*$/, '').trim()) || stripped;

  const categoryRaw = label.toLowerCase();
  let category;
  if (/allies/.test(categoryRaw))         category = 'allies';
  else if (/status/.test(categoryRaw))    category = 'status';
  else if (/retainer/.test(categoryRaw))  category = 'retainer';
  else if (/staff/.test(categoryRaw))     category = 'staff';
  else if (/contacts?/.test(categoryRaw)) category = 'contacts';
  else                                    category = 'misc';

  return { category, label, dots, qualifier };
}

/** Compute dice pool size for a merit category + dots level. Returns null for non-rolled merits. */
function _computeMeritPoolSize(category, dots) {
  if (category === 'allies' || category === 'status' || category === 'retainer') {
    return dots != null ? (dots * 2) + 2 : null;
  }
  return null; // staff = fixed; contacts = char pool (not auto-computed)
}

// Human-readable labels for pool_status values across all action types
const POOL_STATUS_LABELS = {
  pending:     'Pending',
  validated:   'Validated',
  no_roll:     'No Roll',
  no_feed:     'No Valid Feeding',
  maintenance: 'Maintenance',
  resolved:    'Resolved',
  no_effect:   'No Effect',
};

// Statuses considered fully resolved (used for phase counts and hide-done filter)
const DONE_STATUSES = new Set(['validated', 'no_roll', 'no_feed', 'maintenance', 'resolved', 'no_effect', 'skipped']);

/** Returns a stable action_key string for reminder targeting. Returns null for sorcery entries. */
function entryActionKey(entry) {
  if (entry.source === 'feeding') return 'feeding';
  if (entry.source === 'project') return `project_${entry.actionIdx}`;
  if (entry.source === 'merit')   return `merit_${entry.actionIdx}`;
  return null; // sorcery entries are sources, not targets
}

// ── Cycle Phase Ribbon ───────────────────────────────────────────────────────

function getCyclePhase(cycle, subs) {
  if (!cycle) return null;
  if (cycle.status === 'game')   return 0;
  if (cycle.status === 'active') return 1;
  // closed
  const hasPending = (subs || []).some(s => !s.approval_status || s.approval_status === 'pending');
  return hasPending ? 2 : 3;
}

function getSubPhases(phase, cycle, subs) {
  switch (phase) {
    case 0:
      return [
        { label: 'Ambience Applied', done: !!cycle.ambience_applied },
      ];
    case 1: {
      const hasSubs = (subs || []).length > 0;
      const deadlinePast = !!(cycle.deadline_at && new Date(cycle.deadline_at) < new Date());
      return [
        { label: 'Deadline Set',         done: !!cycle.deadline_at },
        { label: 'Submissions Received', done: hasSubs },
        { label: 'Deadline Passed',      done: deadlinePast },
      ];
    }
    case 2: {
      const allResolved = !(subs || []).some(s => !s.approval_status || s.approval_status === 'pending');
      return [
        { label: 'Reviewing',    done: allResolved, inProgress: !allResolved },
        { label: 'All Resolved', done: allResolved },
      ];
    }
    case 3:
    default:
      return [];
  }
}

function renderPhaseRibbon(cycle, subs) {
  const mainEl = document.getElementById('dt-phase-ribbon');
  const subEl  = document.getElementById('dt-sub-ribbon');
  if (!mainEl || !subEl) return;

  const phase = getCyclePhase(cycle, subs);
  if (phase === null) {
    mainEl.style.display = 'none';
    subEl.style.display  = 'none';
    return;
  }

  // Main ribbon
  const mainSteps = ['Game \u0026 Feeding', 'Downtimes', 'Processing', 'Push Ready'];
  mainEl.style.display = '';
  mainEl.innerHTML = mainSteps.map((label, i) => {
    const done   = i < phase;
    const active = i === phase;
    const cls    = done ? 'pr-step pr-done' : active ? 'pr-step pr-active' : 'pr-step pr-future';
    const numContent = done ? '\u2713' : String(i + 1);
    const connector = i < mainSteps.length - 1 ? '<span class="pr-connector"></span>' : '';
    return `<span class="${cls}"><span class="pr-step-num">${numContent}</span>${label}</span>${connector}`;
  }).join('');

  // Sub ribbon
  const subSteps = getSubPhases(phase, cycle, subs);
  if (!subSteps.length) {
    subEl.style.display = 'none';
    return;
  }
  subEl.style.display = '';
  subEl.innerHTML = subSteps.map((s, i) => {
    const cls = s.done ? 'pr-sub pr-done' : s.inProgress ? 'pr-sub pr-active' : 'pr-sub pr-future';
    const icon = s.done ? '\u2713 ' : '';
    const connector = i < subSteps.length - 1 ? '<span class="pr-sub-connector"></span>' : '';
    return `<span class="${cls}">${icon}${s.label}</span>${connector}`;
  }).join('');
}

export async function initDowntimeView(passedChars) {
  const container = document.getElementById('downtime-content');
  if (!container) return;

  container.innerHTML = buildShell();

  document.getElementById('dt-new-cycle').addEventListener('click', openResetWizard);
  document.getElementById('dt-close-cycle').addEventListener('click', handleCloseCycle);
  document.getElementById('dt-open-game').addEventListener('click', handleOpenGamePhase);
  document.getElementById('dt-export-all').addEventListener('click', handleExportAll);
  document.getElementById('dt-export-json').addEventListener('click', handleExportJson);
  document.getElementById('dt-import-csv').addEventListener('click', () => {
    document.getElementById('dt-import-csv-input').click();
  });
  document.getElementById('dt-import-csv-input').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = '';
    await processDowntimeCsvFile(file);
    await renderCycle();
  });
  document.getElementById('dt-cycle-sel').addEventListener('change', e => {
    selectedCycleId = e.target.value;
    loadCycleById(selectedCycleId);
  });
  // Dev-only: preview CSV button (no MongoDB writes) — must be wired before API calls
  if (location.hostname === 'localhost') {
    const toolbar = document.querySelector('.dt-toolbar');
    if (toolbar) {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = '.csv';
      inp.style.display = 'none';
      inp.id = 'dt-preview-input';
      inp.addEventListener('change', e => { if (e.target.files[0]) processFilePreview(e.target.files[0]); });

      const btn = document.createElement('button');
      btn.className = 'dt-btn proc-mode-btn';
      btn.textContent = 'Preview CSV';
      btn.title = 'Load CSV for local preview — not saved to MongoDB';
      btn.addEventListener('click', () => inp.click());

      toolbar.appendChild(inp);
      toolbar.appendChild(btn);
    }
  }

  if (passedChars && passedChars.length) {
    characters = passedChars;
    charMap = new Map();
    for (const c of characters) {
      if (c.name) charMap.set(c.name.toLowerCase().trim(), c);
      if (c.moniker) charMap.set(c.moniker.toLowerCase().trim(), c);
    }
  } else {
    try { await loadCharacters(); } catch (e) { console.warn('loadCharacters failed (no API?):', e.message); }
  }
  try { await loadAllCycles(); } catch (e) { console.warn('loadAllCycles failed (no API?):', e.message); }
}

function buildShell() {
  return `
    <div class="dt-toolbar">
      <button class="dt-btn" id="dt-new-cycle">New Cycle</button>
      <button class="dt-btn" id="dt-close-cycle" style="display:none">Close Cycle</button>
      <button class="dt-btn dt-btn-game" id="dt-open-game" style="display:none">Open Game Phase</button>
      <button class="dt-btn dt-btn-export" id="dt-export-all" style="display:none">Export MD</button>
      <button class="dt-btn dt-btn-export" id="dt-export-json" style="display:none">Export JSON</button>
      <button class="dt-btn dt-btn-export" id="dt-import-csv">Import CSV</button>
      <input type="file" id="dt-import-csv-input" accept=".csv" style="display:none">
    </div>
    <div id="dt-cycle-bar" class="dt-cycle-bar">
      <select id="dt-cycle-sel" class="dt-cycle-sel"></select>
      <span id="dt-cycle-status" class="dt-cycle-status"></span>
    </div>
    <div id="dt-phase-ribbon" style="display:none"></div>
    <div id="dt-sub-ribbon" style="display:none"></div>
    <div id="dt-snapshot"></div>
    <div id="dt-warnings" class="dt-warnings"></div>
    <div id="dt-match-summary"></div>
    <div id="dt-feeding-scene"></div>
    <div id="dt-conflicts"></div>
    <div id="dt-submissions" class="dt-submissions"></div>
    <div id="dt-npcs"></div>`;
}

// ── Character + player data bridge ──────────────────────────────────────────

let players = [];

async function loadCharacters() {
  try {
    characters = await apiGet('/api/characters');
    characters.forEach(c => applyDerivedMerits(c));
    charMap = new Map();
    for (const c of characters) {
      if (c.name) charMap.set(c.name.toLowerCase().trim(), c);
      if (c.moniker) charMap.set(c.moniker.toLowerCase().trim(), c);
    }
  } catch {
    characters = [];
    charMap = new Map();
  }
  try { players = await apiGet('/api/players'); } catch { players = []; }
}

// ── Fuzzy matching utilities ────────────────────────────────────────────────

function _norm(s) { return (s || '').toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }

function _wordSet(s) { return new Set(_norm(s).split(/[\s'']+/).filter(Boolean)); }

/** Word-overlap score: fraction of query words found in target (0-1). */
function _wordOverlap(query, target) {
  const qw = _wordSet(query);
  const tw = _wordSet(target);
  if (!qw.size) return 0;
  let hits = 0;
  for (const w of qw) { if (tw.has(w)) hits++; }
  return hits / qw.size;
}

/** Substring containment score: 1 if target contains query or vice versa, 0.5 for partial word overlap. */
function _containsScore(query, target) {
  const q = _norm(query), t = _norm(target);
  if (q === t) return 1;
  if (t.includes(q) || q.includes(t)) return 0.9;
  return 0;
}

/**
 * Find the best matching character for a CSV submission row.
 * Combines character name matching and player name matching for a combined score.
 *
 * Character name is compared against: c.name, c.moniker, displayName(c)
 * Player name is compared against: player.display_name, player.discord_username, player.discord_global_name, c.player
 *
 * Returns { character, score, warnings[] } or { character: null, score: 0, warnings[] }
 */
export function findCharacter(submissionCharName, submissionPlayerName) {
  if (!submissionCharName && !submissionPlayerName) return null;

  // Build player → character_ids lookup
  const playerCharIds = new Map(); // character_id string → player doc
  for (const p of players) {
    for (const cid of (p.character_ids || [])) playerCharIds.set(String(cid), p);
  }

  let bestChar = null, bestScore = 0;

  for (const c of characters) {
    // Character name score (weight: 0.7)
    const cNames = [c.name, c.moniker, c.honorific ? (c.honorific + ' ' + (c.moniker || c.name)) : null].filter(Boolean);
    let charScore = 0;
    if (submissionCharName) {
      for (const cn of cNames) {
        const exact = _containsScore(submissionCharName, cn);
        const overlap = _wordOverlap(submissionCharName, cn);
        charScore = Math.max(charScore, exact, overlap);
      }
    }

    // Player name score (weight: 0.3)
    let playerScore = 0;
    if (submissionPlayerName) {
      const p = playerCharIds.get(String(c._id));
      const pNames = [
        c.player,
        p?.display_name,
        p?.discord_username,
        p?.discord_global_name,
      ].filter(Boolean);
      for (const pn of pNames) {
        const exact = _containsScore(submissionPlayerName, pn);
        const overlap = _wordOverlap(submissionPlayerName, pn);
        playerScore = Math.max(playerScore, exact, overlap);
      }
    }

    const combined = (submissionCharName && submissionPlayerName)
      ? charScore * 0.7 + playerScore * 0.3
      : submissionCharName ? charScore : playerScore;

    if (combined > bestScore) {
      bestScore = combined;
      bestChar = c;
    }
  }

  // Require a minimum confidence threshold
  if (bestScore < 0.4) return null;
  return bestChar;
}

/**
 * Match a CSV submission and return match details with warnings.
 * Used by the import flow to surface unmatched/low-confidence matches.
 */
export function matchSubmission(sub) {
  const charName = sub.submission.character_name;
  const playerName = sub.submission.player_name;
  const char = findCharacter(charName, playerName);
  const warnings = [];

  if (!char) {
    warnings.push(`No match found for character "${charName}" (player: ${playerName})`);
  } else {
    const matchedName = char.moniker || char.name;
    if (_norm(charName) !== _norm(matchedName) && _norm(charName) !== _norm(char.name)) {
      warnings.push(`Fuzzy match: "${charName}" → ${matchedName} (${char.name})`);
    }
  }

  return { character: char, warnings };
}

const FEED_METHODS = [
  { id: 'seduction', name: 'Seduction', attrs: ['Presence', 'Manipulation'], skills: ['Empathy', 'Socialise', 'Persuasion'] },
  { id: 'stalking', name: 'Stalking', attrs: ['Dexterity', 'Wits'], skills: ['Stealth', 'Athletics'] },
  { id: 'force', name: 'By Force', attrs: ['Strength'], skills: ['Brawl', 'Weaponry'] },
  { id: 'familiar', name: 'Familiar Face', attrs: ['Manipulation', 'Presence'], skills: ['Persuasion', 'Subterfuge'] },
  { id: 'intimidation', name: 'Intimidation', attrs: ['Strength', 'Manipulation'], skills: ['Intimidation', 'Subterfuge'] },
];

function buildFeedingPool(char, methodId, ambienceMod) {
  if (!char) return null;
  const method = FEED_METHODS.find(m => m.id === methodId);
  if (!method) return null;

  let bestAttr = 0, bestAttrName = '';
  for (const a of method.attrs) {
    const v = getAttrVal(char, a);
    if (v > bestAttr) { bestAttr = v; bestAttrName = a; }
  }

  let bestSkill = 0, bestSkillName = '';
  for (const s of method.skills) {
    const sk = getSkillObj(char, s);
    const v = sk.dots + (sk.bonus || 0);
    if (v > bestSkill) { bestSkill = v; bestSkillName = s; }
  }

  const fg = (char.merits || []).find(m => m.name === 'Feeding Grounds');
  const fgVal = fg ? (fg.rating || 0) : 0;
  const amb = ambienceMod || 0;
  const unskilled = bestSkill === 0
    ? (method.skills.some(s => !SKILLS_MENTAL.includes(s)) ? -1 : -3)
    : 0;
  const total = Math.max(0, bestAttr + bestSkill + fgVal + amb + unskilled);

  return {
    total,
    breakdown: { attr: bestAttrName, attrVal: bestAttr, skill: bestSkillName, skillVal: bestSkill, fg: fgVal, ambience: amb, unskilled },
  };
}

// ── Cycle loading ───────────────────────────────────────────────────────────

// ── End-of-Cycle Snapshot (GC-4) ────────────────────────────────────────────

/**
 * Capture prestige, eminence, and ascendancy for all active characters
 * and save the snapshot to the cycle document.
 * Called by GC-5 reset wizard.
 */
export async function takeSnapshot(cycleId) {
  const activeChars = characters.filter(c => !c.retired);

  // Per-character: prestige = clan status + covenant status, plus influence budget
  const charData = activeChars.map(c => ({
    character_id: String(c._id),
    name: displayName(c),
    clan: c.clan || '',
    covenant: c.covenant || '',
    prestige: (c.status?.clan || 0) + (c.status?.covenant || 0),
    influence: calcTotalInfluence(c),
  }));

  // Clan eminence: sum of all active chars' city status per clan
  const eminenceMap = {};
  for (const c of activeChars) {
    const clan = c.clan || 'Unknown';
    eminenceMap[clan] = (eminenceMap[clan] || 0) + (c.status?.city || 0);
  }
  const eminence = Object.entries(eminenceMap)
    .map(([clan, total]) => ({ clan, total }))
    .sort((a, b) => b.total - a.total);

  // Covenant ascendancy: sum of all active chars' city status per covenant
  const ascendancyMap = {};
  for (const c of activeChars) {
    const cov = c.covenant || 'Unaligned';
    ascendancyMap[cov] = (ascendancyMap[cov] || 0) + (c.status?.city || 0);
  }
  const ascendancy = Object.entries(ascendancyMap)
    .map(([covenant, total]) => ({ covenant, total }))
    .sort((a, b) => b.total - a.total);

  const snapshot = {
    taken_at: new Date().toISOString(),
    characters: charData,
    eminence,
    ascendancy,
  };

  await updateCycle(cycleId, { snapshot });
  const idx = allCycles.findIndex(c => c._id === cycleId);
  if (idx >= 0) allCycles[idx].snapshot = snapshot;
  return snapshot;
}

/**
 * Add monthly influence income to each active character's influence_balance.
 * Called by GC-5 reset wizard after takeSnapshot.
 * Returns array of { name, error } for any failures.
 */
export async function applyInfluenceIncome() {
  const activeChars = characters.filter(c => !c.retired);
  const errors = [];

  for (const c of activeChars) {
    const income = calcTotalInfluence(c);
    const newBalance = (c.influence_balance || 0) + income;
    try {
      await apiPut(`/api/characters/${c._id}`, {
        name: c.name,
        influence_balance: newBalance,
      });
      c.influence_balance = newBalance;
    } catch (err) {
      errors.push({ name: displayName(c), error: err.message });
    }
  }

  return errors;
}

/** Render the historical snapshot for a closed cycle. No-ops for active cycles or cycles without data. */
function renderSnapshotPanel(cycle) {
  const el = document.getElementById('dt-snapshot');
  if (!el) return;

  const snap = cycle.snapshot;
  if (!snap || cycle.status === 'active') { el.innerHTML = ''; return; }

  const takenAt = new Date(snap.taken_at).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
  const isOpen = el.dataset.open !== 'false';

  let h = '<div class="dt-snapshot-panel">';
  h += `<div class="dt-snapshot-toggle" id="dt-snapshot-toggle">${isOpen ? '\u25BC' : '\u25BA'} Cycle Snapshot <span class="domain-count">${esc(takenAt)}</span></div>`;

  if (isOpen) {
    const sorted = [...snap.characters].sort((a, b) => b.prestige - a.prestige || b.influence - a.influence);

    h += '<div class="dt-snapshot-body">';

    // Prestige table
    h += '<table class="dt-snapshot-table">';
    h += '<thead><tr><th>Character</th><th>Clan</th><th>Covenant</th><th>Prestige</th><th>Influence</th></tr></thead><tbody>';
    for (const c of sorted) {
      h += `<tr><td>${esc(c.name)}</td><td>${esc(c.clan)}</td><td>${esc(c.covenant)}</td>`;
      h += `<td class="dt-snap-val">${c.prestige}</td><td class="dt-snap-val">${c.influence}</td></tr>`;
    }
    h += '</tbody></table>';

    // Eminence + Ascendancy side by side
    h += '<div class="dt-snapshot-factions">';
    h += '<div class="dt-snapshot-faction-col"><div class="dt-snapshot-head">Clan Eminence</div>';
    for (const e of snap.eminence) {
      h += `<div class="dt-snap-faction-row"><span>${esc(e.clan)}</span><span class="dt-snap-val">${e.total}</span></div>`;
    }
    h += '</div>';
    h += '<div class="dt-snapshot-faction-col"><div class="dt-snapshot-head">Covenant Ascendancy</div>';
    for (const a of snap.ascendancy) {
      h += `<div class="dt-snap-faction-row"><span>${esc(a.covenant)}</span><span class="dt-snap-val">${a.total}</span></div>`;
    }
    h += '</div></div>'; // factions

    h += '</div>'; // body
  }

  h += '</div>'; // panel
  el.innerHTML = h;

  document.getElementById('dt-snapshot-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderSnapshotPanel(cycle);
  });
}


async function loadAllCycles() {
  allCycles = await getCycles();
  allCycles.sort((a, b) => (b.loaded_at || '').localeCompare(a.loaded_at || ''));

  const sel = document.getElementById('dt-cycle-sel');
  sel.innerHTML = '<option value="">\u2014 Select cycle \u2014</option>';
  allCycles.forEach(c => {
    const label = (c.label || 'Unnamed') + (c.status === 'active' ? ' (active)' : '');
    sel.innerHTML += `<option value="${c._id}">${esc(label)}</option>`;
  });

  // Auto-select active cycle
  activeCycle = allCycles.find(c => c.status === 'active') || null;
  if (activeCycle) {
    selectedCycleId = activeCycle._id;
    sel.value = activeCycle._id;
    await loadCycleById(activeCycle._id);
  } else if (allCycles.length) {
    selectedCycleId = allCycles[0]._id;
    sel.value = allCycles[0]._id;
    await loadCycleById(allCycles[0]._id);
  } else {
    document.getElementById('dt-submissions').innerHTML = '<p class="placeholder">No cycles. Upload a CSV or create a new cycle.</p>';
    document.getElementById('dt-match-summary').innerHTML = '';
    document.getElementById('dt-close-cycle').style.display = 'none';
    document.getElementById('dt-open-game').style.display = 'none';
    document.getElementById('dt-export-all').style.display = 'none';
    document.getElementById('dt-export-json').style.display = 'none';
  }
}

async function loadCycleById(cycleId) {
  const subEl = document.getElementById('dt-submissions');
  const statusEl = document.getElementById('dt-cycle-status');
  const closeBtn = document.getElementById('dt-close-cycle');

  const cycle = allCycles.find(c => c._id === cycleId);
  if (!cycle) {
    subEl.innerHTML = '<p class="placeholder">Cycle not found.</p>';
    return;
  }
  currentCycle = cycle;
  cycleReminders = cycle.processing_reminders || [];
  cachedTerritories = null; // refresh territory ambience on next processing render

  const isActive = cycle.status === 'active';
  const isGame   = cycle.status === 'game';
  const isClosed = cycle.status === 'closed';
  const deadlineStr = cycle.deadline_at
    ? new Date(cycle.deadline_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const deadlinePast = cycle.deadline_at && new Date(cycle.deadline_at) < new Date();
  const statusLabel = isActive ? 'active' : isGame ? 'game' : 'closed';
  const statusCss   = isActive ? 'pending' : isGame ? 'game' : 'approved';
  let statusHtml = `<span class="dt-status-badge dt-status-${statusCss}">${statusLabel}</span>` +
    `<span class="domain-count">${cycle.submission_count || 0} submissions</span>`;
  if (deadlineStr) {
    statusHtml += `<span class="dt-deadline${deadlinePast ? ' dt-deadline-past' : ''}">Deadline: ${esc(deadlineStr)}</span>`;
  }
  if (isActive) {
    const dtVal = cycle.deadline_at ? isoToLocalInput(cycle.deadline_at) : '';
    statusHtml += `<label class="dt-deadline-edit"><span>Set deadline</span><input type="datetime-local" class="dt-deadline-input" id="dt-deadline-input" value="${esc(dtVal)}"></label>`;
  }
  if (isClosed || isGame) {
    const alreadyApplied = cycle.ambience_applied;
    statusHtml += `<button class="dt-btn${alreadyApplied ? ' dt-btn-dim' : ''}" id="dt-apply-ambience" title="${alreadyApplied ? 'Ambience already applied for this cycle' : 'Apply ambience changes from this cycle\'s resolved projects'}">
      ${alreadyApplied ? '\u2713 Ambience applied' : 'Apply Ambience Changes'}
    </button>`;
  }

  statusEl.innerHTML = statusHtml;
  closeBtn.style.display = isActive ? '' : 'none';
  document.getElementById('dt-open-game').style.display = isClosed ? '' : 'none';

  // ── Snapshot panel (GC-4) ──
  renderSnapshotPanel(cycle);

  // ── Phase ribbon (initial render — submissions not yet loaded) ──
  renderPhaseRibbon(cycle, []);

  // Wire deadline input
  document.getElementById('dt-deadline-input')?.addEventListener('change', async e => {
    const val = e.target.value; // datetime-local string or empty
    await updateCycle(cycleId, { deadline_at: val ? new Date(val).toISOString() : null });
    const idx = allCycles.findIndex(c => c._id === cycleId);
    if (idx >= 0) allCycles[idx].deadline_at = val ? new Date(val).toISOString() : null;
    await loadCycleById(cycleId);
  });

  // Wire ambience apply button
  document.getElementById('dt-apply-ambience')?.addEventListener('click', () => handleApplyAmbience(cycleId, cycle));

  procExpandedKeys.clear();
  submissions = await getSubmissionsForCycle(cycleId);
  renderPhaseRibbon(currentCycle, submissions); // update sub-ribbon now submissions are loaded
  document.getElementById('dt-export-all').style.display = submissions.length ? '' : 'none';
  document.getElementById('dt-export-json').style.display = submissions.length ? '' : 'none';
  renderMatchSummary();
  renderSubmissionChecklist();
  await ensureTerritories();
  renderTerritoriesAtAGlance();
  await loadInvestigations(cycleId);
  renderInvestigations();
  await loadNpcs(cycleId);
  renderNpcs();
  renderSubmissions();
}

// ── Match summary ───────────────────────────────────────────────────────────

function renderMatchSummary() {
  const el = document.getElementById('dt-match-summary');
  if (!submissions.length) { el.innerHTML = ''; return; }

  const matched = submissions.filter(s => findCharacter(s.character_name, s.player_name));
  const unmatched = submissions.filter(s => !findCharacter(s.character_name, s.player_name));
  const rolled = submissions.filter(s => s.feeding_roll);

  const approved = submissions.filter(s => s.approval_status === 'approved').length;
  const modified = submissions.filter(s => s.approval_status === 'modified').length;
  const rejected = submissions.filter(s => s.approval_status === 'rejected').length;
  const ready = submissions.filter(s => s.st_review?.outcome_visibility === 'ready').length;
  const published = submissions.filter(s => s.st_review?.outcome_visibility === 'published').length;
  const pending = submissions.length - approved - modified - rejected;

  let h = '<div class="dt-match-bar">';
  h += `<span class="dt-match-ok">${matched.length} matched</span>`;
  h += `<span class="domain-count">${rolled.length}/${submissions.length} fed</span>`;
  h += `<span class="domain-count">${approved + modified}/${submissions.length} resolved</span>`;
  if (ready) h += `<span class="dt-ready-badge">${ready} ready to publish</span>`;
  if (published) h += `<span class="dt-pub-badge">${published} published</span>`;
  if (pending) h += `<span class="dt-status-badge dt-status-pending">${pending} pending</span>`;
  if (unmatched.length) {
    h += `<span class="dt-match-warn">${unmatched.length} unmatched</span>`;
  }
  h += '</div>';
  el.innerHTML = h;
}

// ── Submission rendering ────────────────────────────────────────────────────

function renderSubmissions() {
  // Stick the checklist to the top of the scroll area
  document.getElementById('dt-feeding-scene')
    ?.classList.add('dt-proc-sticky');

  renderProcessingMode(document.getElementById('dt-submissions'));
}

function renderFeedingDetail(s, raw, char) {
  const feed = raw.feeding || {};
  const territories = feed.territories || {};
  const rollResult = s.feeding_roll;

  let h = '<div class="dt-feed-detail">';
  h += '<div class="dt-feed-header">Feeding</div>';

  if (feed.method) h += `<div class="dt-feed-row"><span class="dt-feed-lbl">Submitted</span> ${esc(feed.method)}</div>`;

  // Territory feeding status
  const activeTerrs = Object.entries(territories).filter(([, v]) => v && v !== 'Not feeding here');
  if (activeTerrs.length) {
    h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Territories</span>';
    h += activeTerrs.map(([t, status]) => `<span class="dt-sub-tag">${esc(t)}: ${esc(status)}</span>`).join(' ');
    h += '</div>';
  }

  // Method selection + pool building (only if character matched)
  if (char) {
    h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Hunt method</span>';
    h += '<div class="dt-method-btns">';
    const selectedMethod = s._feed_method || '';
    FEED_METHODS.forEach(m => {
      h += `<button class="dt-method-btn${selectedMethod === m.id ? ' selected' : ''}" data-method="${m.id}" data-sub-id="${s._id}">${esc(m.name)}</button>`;
    });
    h += '</div></div>';

    // Show pool breakdown if method selected
    if (selectedMethod) {
      const stMod = s.st_review?.feeding_modifier || 0;
      const pool = buildFeedingPool(char, selectedMethod, stMod);
      if (pool) {
        const bd = pool.breakdown;
        h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Pool</span>';
        h += `<span class="dt-pool-breakdown">${bd.attrVal} ${esc(bd.attr)} + ${bd.skillVal} ${esc(bd.skill)}`;
        if (bd.fg) h += ` + ${bd.fg} FG`;
        if (bd.unskilled) h += ` \u2212 ${Math.abs(bd.unskilled)} (unskilled)`;
        if (stMod) h += ` ${stMod >= 0 ? '+' : '\u2212'} ${Math.abs(stMod)} ST`;
        h += ` = <b>${pool.total}</b></span>`;
        h += `<span class="dt-pool-mod-wrap"><label class="dt-feed-lbl">Mod</label> <input type="number" class="dt-pool-mod dt-num-input-sm" data-sub-id="${esc(s._id)}" value="${stMod}" min="-20" max="20" step="1"></span>`;
        h += '</div>';
      }
    }

    // Rote toggle — shown when a project action was dedicated to feeding
    const hasFeedAction = [1,2,3,4].some(n => s.responses?.[`project_${n}_action`] === 'feed');
    const isRote = s.st_review?.feeding_rote || false;
    h += `<div class="dt-feed-row"><span class="dt-feed-lbl">Rote</span>`;
    h += `<label class="dt-rote-label"><input type="checkbox" class="dt-feed-rote-chk" data-sub-id="${s._id}"${isRote ? ' checked' : ''}>`;
    h += ` Rote quality`;
    if (hasFeedAction) h += ` <span class="dt-rote-hint">(feed action detected)</span>`;
    h += `</label></div>`;
  } else {
    // Manual pool for unmatched characters
    h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Pool</span>';
    h += `<input type="number" class="dt-pool-input" min="1" max="30" value="${rollResult?.params?.size || 5}">`;
    h += '</div>';
  }

  // Roll button + result
  h += '<div class="dt-feed-roll-row">';
  h += `<button class="dt-btn dt-feed-roll-btn" data-sub-id="${s._id}">${rollResult ? 'Re-roll' : 'Roll'}</button>`;

  if (rollResult) {
    const rc = rollResult.exceptional ? 'exceptional' : rollResult.successes === 0 ? 'failure' : 'normal';
    const vessels = rollResult.successes;
    h += `<span class="dt-feed-result ${rc}">${rollResult.successes} ${rollResult.exceptional ? 'Exceptional' : rollResult.successes === 1 ? 'success' : 'successes'}</span>`;
    if (vessels > 0) h += `<span class="dt-feed-vessels">${vessels} vessel${vessels > 1 ? 's' : ''} \u00B7 ${vessels * 2} Vitae safe</span>`;
    h += `<span class="dt-feed-dice">${esc(rollResult.dice_string || '')}</span>`;
  }

  h += '</div></div>';
  return h;
}

// ── Feeding rolls — handled inline via showRollModal in event delegation ────

// ── Player Responses (new form format) ──────────────────────────────────────

function renderPlayerResponses(s) {
  const r = s.responses;
  if (!r || !Object.keys(r).length) return '';

  const SKIP_PREFIXES = ['_gate_', '_feed_blood', 'sorcery_slot_count', 'equipment_slot_count'];
  const FEED_METHOD_LABELS = { seduction: 'Seduction', stalking: 'Stalking', force: 'By Force', familiar: 'Familiar Face', intimidation: 'Intimidation', other: 'Other' };

  function row(label, val) {
    if (!val || (typeof val === 'string' && !val.trim())) return '';
    return `<div class="dt-resp-row"><span class="dt-resp-label">${esc(label)}</span><span class="dt-resp-val">${esc(val)}</span></div>`;
  }

  let h = '<div class="dt-panel dt-resp-panel">';
  h += '<div class="dt-panel-title">Player Submission</div>';

  // ── Feeding ──
  const feedMethod = r['_feed_method'];
  const feedDesc = r['feeding_description'];
  const feedDisc = r['_feed_disc'];
  const feedSpec = r['_feed_spec'];
  const feedRote = r['_feed_rote'] === 'yes';
  if (feedMethod) {
    h += '<div class="dt-resp-section"><div class="dt-resp-section-title">Feeding</div>';
    h += row('Method', FEED_METHOD_LABELS[feedMethod] || feedMethod);
    if (feedDisc) h += row('Discipline', feedDisc);
    if (feedSpec) h += row('Specialisation', feedSpec);
    if (feedRote) h += row('Rote action', 'Yes — Project 1 dedicated to feeding');
    try {
      const terrs = JSON.parse(r['feeding_territories'] || '{}');
      const active = Object.entries(terrs).filter(([, v]) => v && v !== 'none').map(([k, v]) => `${k.replace(/_/g, ' ')} (${v})`).join(', ');
      if (active) h += row('Territory', active);
    } catch { /* ignore */ }
    if (feedDesc) h += row('Description', feedDesc);
    h += '</div>';
  }

  // ── Court ──
  const courtKeys = ['travel', 'game_recount', 'rp_shoutout', 'correspondence', 'trust', 'harm', 'aspirations'];
  const courtLabels = { travel: 'Travel', game_recount: 'Game Recount', rp_shoutout: 'Shoutout', correspondence: 'Correspondence', trust: 'Trust', harm: 'Harm', aspirations: 'Aspirations' };
  const courtVals = courtKeys.filter(k => r[k] && r[k].trim());
  if (courtVals.length) {
    h += '<div class="dt-resp-section"><div class="dt-resp-section-title">Court</div>';
    for (const k of courtVals) {
      let val = r[k];
      if (k === 'rp_shoutout') { try { val = JSON.parse(val).filter(Boolean).map(id => { const ch = characters.find(c => String(c._id) === String(id)); return ch ? (ch.moniker || ch.name) : id; }).join(', '); } catch { /* ignore */ } }
      h += row(courtLabels[k] || k, val);
    }
    h += '</div>';
  }

  // ── Projects ──
  const projRows = [];
  for (let n = 1; n <= 4; n++) {
    const action = r[`project_${n}_action`];
    if (!action) continue;
    const actionLabel = action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    let desc = r[`project_${n}_description`] || r[`project_${n}_xp_trait`] || '';
    projRows.push(`${n}. ${actionLabel}${desc ? ': ' + desc : ''}`);
  }
  if (projRows.length) {
    h += '<div class="dt-resp-section"><div class="dt-resp-section-title">Projects</div>';
    for (const p of projRows) h += `<div class="dt-resp-row"><span class="dt-resp-val">${esc(p)}</span></div>`;
    h += '</div>';
  }

  // ── Sorcery ──
  const sorcCount = parseInt(r['sorcery_slot_count'] || '1', 10);
  const sorcRows = [];
  for (let n = 1; n <= sorcCount; n++) {
    const rite = r[`sorcery_${n}_rite`];
    if (!rite) continue;
    const targets = r[`sorcery_${n}_targets`] || '';
    const notes = r[`sorcery_${n}_notes`] || '';
    const mand = r[`sorcery_${n}_mandragora`] === 'yes';
    const mandPaid = r[`sorcery_${n}_mand_paid`] === 'yes';
    let line = rite;
    if (mand) line += mandPaid ? ' [Mandragora Garden \u2014 Vitae paid]' : ' [Mandragora Garden \u2014 Vitae outstanding]';
    if (targets) line += ` — targets: ${targets}`;
    if (notes) line += ` — ${notes}`;
    sorcRows.push(line);
  }
  if (sorcRows.length) {
    h += '<div class="dt-resp-section"><div class="dt-resp-section-title">Blood Sorcery</div>';
    for (const sr of sorcRows) h += `<div class="dt-resp-row"><span class="dt-resp-val">${esc(sr)}</span></div>`;
    h += '</div>';
  }

  // ── Equipment ──
  const equipCount = parseInt(r['equipment_slot_count'] || '1', 10);
  const equipRows = [];
  for (let n = 1; n <= equipCount; n++) {
    const name = r[`equipment_${n}_name`];
    if (!name) continue;
    const qty = r[`equipment_${n}_qty`] || '';
    const notes = r[`equipment_${n}_notes`] || '';
    equipRows.push([qty ? `${qty}× ${name}` : name, notes].filter(Boolean).join(' — '));
  }
  if (equipRows.length) {
    h += '<div class="dt-resp-section"><div class="dt-resp-section-title">Equipment</div>';
    for (const eq of equipRows) h += `<div class="dt-resp-row"><span class="dt-resp-val">${esc(eq)}</span></div>`;
    h += '</div>';
  }

  // ── Misc sections (vamping, lore, admin) ──
  const miscFields = [
    ['vamping', 'Vamping'],
    ['lore_request', 'Lore Request'],
    ['xp_spend', 'XP Spend'],
    ['resources_acquisitions', 'Resources Acquisitions'],
    ['skill_acquisitions', 'Skill Acquisitions'],
    ['regency_action', 'Regency Action'],
    ['form_feedback', 'Form Feedback'],
  ];
  let miscH = '';
  for (const [key, label] of miscFields) {
    if (!r[key] || !r[key].trim?.()) continue;
    if (key === 'xp_spend') {
      try {
        const rows = JSON.parse(r[key]).filter(rw => rw.category && rw.item);
        if (rows.length) miscH += row(label, rows.map(rw => `${rw.item} (${rw.cost} XP)`).join(', '));
      } catch { /* ignore */ }
    } else {
      miscH += row(label, r[key]);
    }
  }
  if (miscH) {
    h += '<div class="dt-resp-section"><div class="dt-resp-section-title">Other</div>';
    h += miscH;
    h += '</div>';
  }

  h += '</div>';
  return h;
}

// ── ST Notes ────────────────────────────────────────────────────────────────

function renderStNotes(s, raw) {
  const csvNotes = raw.meta?.st_notes || '';
  const savedNotes = s.st_notes || '';
  const currentNotes = savedNotes || csvNotes;
  const xpSpend = raw.meta?.xp_spend || '';

  let h = '<div class="dt-notes-detail">';
  h += '<div class="dt-feed-header">ST Notes</div>';

  if (csvNotes && !savedNotes) {
    h += `<div class="dt-notes-csv"><span class="dt-feed-lbl">From CSV</span> ${esc(csvNotes)}</div>`;
  }

  h += `<textarea class="dt-notes-input" data-sub-id="${s._id}" placeholder="ST notes (hidden from players)">${esc(currentNotes)}</textarea>`;
  h += `<div class="dt-notes-actions">
    <button class="dt-btn dt-notes-save" data-sub-id="${s._id}">Save Notes</button>
    <span class="dt-notes-vis">Visibility: ST only</span>
  </div>`;

  if (xpSpend) {
    h += `<div class="dt-notes-xp"><span class="dt-feed-lbl">XP Spend</span> ${esc(xpSpend)}</div>`;
  }

  h += '</div>';
  return h;
}

async function handleSaveNotes(subId) {
  const textarea = document.querySelector(`.dt-notes-input[data-sub-id="${subId}"]`);
  if (!textarea) return;

  const notes = textarea.value.trim();
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  try {
    await updateSubmission(subId, {
      st_notes: notes,
      st_notes_visibility: 'st_only',
      st_notes_updated: new Date().toISOString(),
    });
    sub.st_notes = notes;

    const btn = document.querySelector(`.dt-notes-save[data-sub-id="${subId}"]`);
    if (btn) { btn.textContent = 'Saved \u2713'; setTimeout(() => { btn.textContent = 'Save Notes'; }, 1500); }
  } catch (err) {
    console.error('Failed to save notes:', err.message);
  }
}

// ── Approval ────────────────────────────────────────────────────────────────

// ── Expenditure Tracking (GC-3) ─────────────────────────────────────────────

function renderExpenditurePanel(s) {
  const vitae    = s.st_review?.vitae_spent    ?? '';
  const wp       = s.st_review?.willpower_spent ?? '';
  const influence = s.st_review?.influence_spent ?? '';

  let h = '<div class="dt-exp-panel">';
  h += '<div class="dt-feed-header">Expenditure</div>';
  h += '<div class="dt-exp-fields">';
  for (const [label, field, val] of [
    ['Vitae', 'vitae_spent', vitae],
    ['Willpower', 'willpower_spent', wp],
    ['Influence', 'influence_spent', influence],
  ]) {
    h += `<label class="dt-exp-field">`;
    h += `<span class="dt-exp-lbl">${label}</span>`;
    h += `<input type="number" class="dt-exp-input" data-sub-id="${s._id}" data-exp-field="st_review.${field}" min="0" max="99" value="${esc(String(val))}">`;
    h += `</label>`;
  }
  h += '</div>';
  h += '</div>';
  return h;
}

const APPROVAL_STATUSES = ['pending', 'approved', 'modified', 'rejected'];

function renderApproval(s) {
  const status = s.approval_status || 'pending';
  const resolution = s.resolution_note || '';

  let h = '<div class="dt-approval-detail">';
  h += '<div class="dt-feed-header">Outcome</div>';
  h += '<div class="dt-approval-btns">';
  for (const st of APPROVAL_STATUSES) {
    h += `<button class="dt-approval-btn dt-appr-${st}${status === st ? ' active' : ''}" data-sub-id="${s._id}" data-status="${st}">${st}</button>`;
  }
  h += '</div>';
  h += `<textarea class="dt-notes-input dt-resolution-input" data-sub-id="${s._id}" placeholder="Resolution note (visible to player when approved)">${esc(resolution)}</textarea>`;
  h += '</div>';
  return h;
}

async function handleApproval(subId, newStatus) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  const textarea = document.querySelector(`.dt-resolution-input[data-sub-id="${subId}"]`);
  const resolution = textarea ? textarea.value.trim() : '';

  try {
    await updateSubmission(subId, {
      approval_status: newStatus,
      resolution_note: resolution,
      approval_updated: new Date().toISOString(),
    });
    sub.approval_status = newStatus;
    sub.resolution_note = resolution;
    renderMatchSummary();
    renderSubmissions();
  } catch (err) {
    console.error('Failed to save approval:', err.message);
  }
}

// ── File handling ───────────────────────────────────────────────────────────

/**
 * Process a downtime player CSV file.
 * Returns { created, updated, unmatched, warnings } so callers can render
 * their own result feedback.
 * Also writes human-readable feedback to #dt-warnings if it exists in the DOM.
 */
export async function processDowntimeCsvFile(file) {
  const warnEl = document.getElementById('dt-warnings');
  if (warnEl) warnEl.innerHTML = '';

  const text = await file.text();
  const { submissions: parsed, warnings } = parseDowntimeCSV(text);

  if (warnings.length && warnEl) {
    warnEl.innerHTML = warnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('');
  }

  if (!parsed.length) {
    if (warnEl) warnEl.innerHTML += '<div class="dt-warn">No submissions found in CSV.</div>';
    return { created: 0, updated: 0, unmatched: 0, warnings: ['No submissions found in CSV.'] };
  }

  // Enrich each parsed submission with character_id via combined fuzzy matching
  const matchWarnings = [];
  for (const sub of parsed) {
    const { character, warnings: mw } = matchSubmission(sub);
    if (character) sub._character_id = character._id;
    matchWarnings.push(...mw);
  }
  if (matchWarnings.length && warnEl) {
    warnEl.innerHTML += matchWarnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('');
  }

  const result = await upsertCycle(parsed, characters);
  const matched = parsed.filter(s => s._character_id).length;
  const unmatched = parsed.length - matched;

  let msg = `Loaded ${result.created} new, ${result.updated} updated submissions.`;
  if (unmatched) msg += ` ${unmatched} submission${unmatched > 1 ? 's' : ''} could not be linked to a character.`;
  if (warnEl) {
    warnEl.innerHTML = (matchWarnings.length ? matchWarnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('') : '')
      + `<div class="dt-success">${esc(msg)}</div>`;
  }
  await loadAllCycles();

  return { created: result.created, updated: result.updated, unmatched, warnings: matchWarnings };
}

// ── Dev CSV Preview (localhost only — no MongoDB writes) ─────────────────────

async function processFilePreview(file) {
  const warnEl = document.getElementById('dt-warnings');
  warnEl.innerHTML = '<div class="dt-warn dt-warn-preview">&#9888; Preview mode — data is not saved to MongoDB.</div>';

  const text = await file.text();
  const { submissions: parsed, warnings } = parseDowntimeCSV(text);

  if (warnings.length) {
    warnEl.innerHTML += warnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('');
  }
  if (!parsed.length) {
    warnEl.innerHTML += '<div class="dt-warn">No submissions found in CSV.</div>';
    return;
  }

  // Match to characters
  for (const sub of parsed) {
    const { character } = matchSubmission(sub);
    if (character) sub._character_id = character._id;
  }

  // Build synthetic submission documents (same shape as MongoDB docs)
  const devCycleId = 'dev-preview-cycle';
  const devSubs = parsed.map((sub, i) => ({
    _id: `dev-preview-${i}`,
    cycle_id: devCycleId,
    character_id: sub._character_id ? String(sub._character_id) : null,
    character_name: sub.submission.character_name,
    player_name: sub.submission.player_name,
    approval_status: 'pending',
    status: 'submitted',
    timestamp: sub.submission.timestamp,
    attended: sub.submission.attended_last_game,
    responses: mapRawToResponses(sub, characters),
    projects_resolved: [],
    merit_actions_resolved: [],
    updated_at: new Date().toISOString(),
  }));

  // Build synthetic cycle
  const devCycle = {
    _id: devCycleId,
    label: `Preview \u2014 ${file.name}`,
    game_number: 0,
    status: 'closed',
    submission_count: devSubs.length,
    loaded_at: new Date().toISOString(),
  };

  // Inject into module state (prepend so it appears first in selector)
  allCycles = [devCycle, ...allCycles.filter(c => c._id !== devCycleId)];
  activeCycle = null;
  currentCycle = devCycle;
  selectedCycleId = devCycleId;
  submissions = devSubs;

  // Rebuild cycle selector
  const sel = document.getElementById('dt-cycle-sel');
  if (sel) {
    sel.innerHTML = allCycles.map(c =>
      `<option value="${esc(c._id)}"${c._id === devCycleId ? ' selected' : ''}>${esc(c.label)}${c.status === 'active' ? ' (active)' : ''}</option>`
    ).join('');
  }

  // Render with dev data
  renderPhaseRibbon(devCycle, devSubs);
  document.getElementById('dt-export-all').style.display = devSubs.length ? '' : 'none';
  document.getElementById('dt-export-json').style.display = devSubs.length ? '' : 'none';
  document.getElementById('dt-close-cycle').style.display = 'none';
  document.getElementById('dt-open-game').style.display = 'none';
  document.getElementById('dt-cycle-status').innerHTML =
    `<span class="dt-status-badge dt-status-approved">preview</span><span class="domain-count">${devSubs.length} submissions</span>`;
  renderSnapshotPanel(devCycle);
  renderMatchSummary();
  renderSubmissionChecklist();
  renderTerritoriesAtAGlance();
  renderInvestigations();
  renderNpcs();
  renderSubmissions();
}

// ── Cycle Reset Wizard (GC-5) ────────────────────────────────────────────────

async function openResetWizard() {
  const cycle = allCycles.find(c => c._id === selectedCycleId);

  // Compute next game number
  let nextNum;
  if (cycle?.game_number) {
    nextNum = cycle.game_number + 1;
  } else {
    const closedCount = allCycles.filter(c => c.status === 'closed').length;
    // If there's an active cycle it counts as one game, next is one more
    nextNum = closedCount + (allCycles.some(c => c.status === 'active') ? 2 : 1);
  }

  if (!cycle || cycle.status !== 'active') {
    // No active cycle to close — create the next one directly
    if (!confirm(`Create Downtime ${nextNum}?`)) return;
    await createCycle(nextNum);
    await loadAllCycles();
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'gc-wizard-overlay';
  overlay.innerHTML = buildWizardChecklistHtml(cycle, nextNum);
  document.body.appendChild(overlay);

  overlay.querySelector('#gc-cancel').addEventListener('click', () => overlay.remove());

  const beginBtn = overlay.querySelector('#gc-begin');
  // AC 2: Enable Begin Reset only when all dismiss checkboxes are ticked
  overlay.addEventListener('change', e => {
    if (!e.target.classList.contains('gc-dismiss-check')) return;
    const all = [...overlay.querySelectorAll('.gc-dismiss-check')];
    beginBtn.disabled = !all.every(cb => cb.checked);
  });
  // AC 3: Dismiss-all shortcut
  overlay.querySelector('#gc-dismiss-all')?.addEventListener('click', () => {
    overlay.querySelectorAll('.gc-dismiss-check').forEach(cb => { cb.checked = true; });
    beginBtn.disabled = false;
  });

  beginBtn.addEventListener('click', () => {
    switchToPhaseView(overlay, cycle, nextNum);
  });
}

function buildWizardChecklistHtml(cycle, nextNum) {
  const readySubs = submissions.filter(s => s.st_review?.outcome_visibility === 'ready');
  const pendingSubs = submissions.filter(s => {
    const vis = s.st_review?.outcome_visibility;
    return !vis || vis === 'pending' || vis === 'hidden';
  });
  const approvedSubs = submissions.filter(s =>
    s.approval_status === 'approved' || s.approval_status === 'modified'
  );
  const missingExp = approvedSubs.filter(s =>
    !s.st_review?.vitae_spent && !s.st_review?.willpower_spent && !s.st_review?.influence_spent
  );
  const noFeed = submissions.filter(s => !s.feeding_roll);

  let items = '';
  if (readySubs.length) items += `<li class="gc-chk-ok">&#10003; ${readySubs.length} submission${readySubs.length !== 1 ? 's' : ''} ready to publish</li>`;

  // AC 1–3: Unresolved submissions are blocking — each must be acknowledged
  if (pendingSubs.length) {
    items += `<li class="gc-chk-block-header">&#9651; ${pendingSubs.length} unresolved \u2014 acknowledge each before proceeding:</li>`;
    for (const sub of pendingSubs) {
      const name = esc(`${sub.character_name || '\u2014'} \u2014 ${sub.player_name || '\u2014'}`);
      items += `<li class="gc-chk-block"><label><input type="checkbox" class="gc-dismiss-check" data-sub-id="${esc(String(sub._id))}"> <span class="gc-chk-name">${name}</span></label></li>`;
    }
  }

  if (missingExp.length) items += `<li class="gc-chk-warn">&#9651; ${missingExp.length} approved submission${missingExp.length !== 1 ? 's' : ''} missing expenditure data</li>`;
  if (noFeed.length) items += `<li class="gc-chk-warn">&#9651; ${noFeed.length} submission${noFeed.length !== 1 ? 's' : ''} with no feeding roll</li>`;
  if (!items) items = '<li class="gc-chk-ok">&#10003; All checks passed</li>';

  const hasAdvisoryWarnings = missingExp.length || noFeed.length;
  const blocking = pendingSubs.length > 0;

  return `<div class="gc-wizard-box">
    <div class="gc-wizard-title">Cycle Reset Wizard</div>
    <div class="gc-wizard-sub">Closing: <strong>${esc(cycle.label || 'Unnamed')}</strong></div>
    <ul class="gc-checklist">${items}</ul>
    ${hasAdvisoryWarnings ? '<p class="gc-chk-note">Other warnings are advisory. You may still proceed.</p>' : ''}
    <div class="gc-label-row">
      <span class="gc-label-lbl">New cycle</span>
      <span class="gc-next-cycle-name">Downtime ${nextNum}</span>
    </div>
    <div class="gc-wizard-actions">
      <button id="gc-cancel" class="dt-btn">Cancel</button>
      ${pendingSubs.length > 1 ? '<button id="gc-dismiss-all" class="dt-btn">Dismiss all</button>' : ''}
      <button id="gc-begin" class="dt-btn dt-btn-gold"${blocking ? ' disabled' : ''}>Begin Reset</button>
    </div>
  </div>`;
}

const RESET_PHASES = [
  { id: 'snapshot',  label: 'Capture cycle snapshot' },
  { id: 'income',    label: 'Apply influence income' },
  { id: 'mutations', label: 'Confirm XP mutations' },
  { id: 'publish',   label: 'Publish outcomes to players' },
  { id: 'tracks',    label: 'Reset character tracks' },
  { id: 'ambience',  label: 'Apply ambience changes' },
  { id: 'open-game', label: 'Open game phase (feeding)' },
  { id: 'new-cycle', label: 'Close cycle and create next' },
];

function buildPhaseListHtml() {
  return `<ul class="gc-phase-list">${
    RESET_PHASES.map(p =>
      `<li class="gc-phase-item" id="gc-phase-${p.id}">
        <span class="gc-phase-icon" id="gc-phase-icon-${p.id}">&#9675;</span>
        <span class="gc-phase-label">${p.label}</span>
        <span class="gc-phase-detail" id="gc-phase-detail-${p.id}"></span>
      </li>`
    ).join('')
  }</ul>`;
}

function setPhaseState(overlay, id, state, detail) {
  const icon = overlay.querySelector(`#gc-phase-icon-${id}`);
  const detailEl = overlay.querySelector(`#gc-phase-detail-${id}`);
  const item = overlay.querySelector(`#gc-phase-${id}`);
  if (!icon) return;
  const icons = { pending: '&#9675;', running: '&#9654;', done: '&#10003;', failed: '&#10007;', paused: '&#9646;&#9646;' };
  icon.innerHTML = icons[state] || '';
  icon.dataset.state = state;
  if (detailEl) detailEl.textContent = detail || '';
  if (item) item.dataset.state = state;
}

function switchToPhaseView(overlay, cycle, nextNum) {
  overlay.querySelector('.gc-wizard-box').innerHTML = `
    <div class="gc-wizard-title">Resetting Cycle&hellip;</div>
    <div class="gc-wizard-sub">Do not close this window.</div>
    ${buildPhaseListHtml()}
    <div id="gc-wizard-footer" class="gc-wizard-footer"></div>
  `;
  runWizardPhases(overlay, cycle, nextNum);
}

async function runWizardPhases(overlay, cycle, nextNum) {
  const footer = overlay.querySelector('#gc-wizard-footer');
  const cycleId = cycle._id;
  const rollback = { income_prev: null, published_ids: [], tracks_prev: [] };

  function fail(phaseId, msg) {
    setPhaseState(overlay, phaseId, 'failed', msg);
    let past = false;
    for (const p of RESET_PHASES) {
      if (p.id === phaseId) { past = true; continue; }
      if (past) setPhaseState(overlay, p.id, 'failed', 'skipped');
    }
    showWizardFooter(footer, 'failed', rollback, overlay);
  }

  // Phase 1: Snapshot
  setPhaseState(overlay, 'snapshot', 'running');
  try {
    await takeSnapshot(cycleId);
    setPhaseState(overlay, 'snapshot', 'done');
  } catch (err) { fail('snapshot', err.message); return; }

  // Phase 2: Influence income
  setPhaseState(overlay, 'income', 'running');
  rollback.income_prev = characters.filter(c => !c.retired).map(c => ({
    _id: c._id, name: c.name, balance: c.influence_balance || 0,
  }));
  const incomeErrors = await applyInfluenceIncome();
  if (incomeErrors.length) { fail('income', `Failed: ${incomeErrors.map(e => e.name).join(', ')}`); return; }
  setPhaseState(overlay, 'income', 'done');

  // Phase 3: XP mutations (manual gate)
  setPhaseState(overlay, 'mutations', 'paused', 'Awaiting confirmation');
  await new Promise(resolve => {
    const btn = document.createElement('button');
    btn.className = 'dt-btn dt-btn-gold';
    btn.textContent = 'Mutations applied \u2014 Continue';
    btn.addEventListener('click', () => { btn.remove(); resolve(); }, { once: true });
    footer.appendChild(btn);
  });
  setPhaseState(overlay, 'mutations', 'done');

  // Phase 4: Publish ready submissions
  setPhaseState(overlay, 'publish', 'running');
  const readySubs = submissions.filter(s => s.st_review?.outcome_visibility === 'ready');
  rollback.published_ids = readySubs.map(s => s._id);
  const pubAt = new Date().toISOString();
  const pubErrors = [];
  for (const sub of readySubs) {
    try {
      await updateSubmission(sub._id, {
        'st_review.outcome_visibility': 'published',
        'st_review.published_at': pubAt,
      });
      if (!sub.st_review) sub.st_review = {};
      sub.st_review.outcome_visibility = 'published';
      sub.st_review.published_at = pubAt;
    } catch (err) { pubErrors.push(sub.character_name); }
  }
  if (pubErrors.length) { fail('publish', `Failed: ${pubErrors.join(', ')}`); return; }
  setPhaseState(overlay, 'publish', 'done', `${readySubs.length} published`);

  // Phase 5: Track reset
  setPhaseState(overlay, 'tracks', 'running');
  const trackErrors = [];
  const approvedSubs = submissions.filter(s =>
    (s.approval_status === 'approved' || s.approval_status === 'modified') &&
    (s.character_id || s.character_name)
  );

  for (const sub of approvedSubs) {
    const char = sub.character_id
      ? characters.find(c => String(c._id) === String(sub.character_id))
      : findCharacter(sub.character_name, sub.player_name);
    if (!char) continue;
    const vitaeSpent    = sub.st_review?.vitae_spent    || 0;
    const wpSpent       = sub.st_review?.willpower_spent || 0;
    const influenceSpent = sub.st_review?.influence_spent || 0;
    if (!vitaeSpent && !wpSpent && !influenceSpent) continue;

    const resolve   = getAttrVal(char, 'Resolve');
    const composure = getAttrVal(char, 'Composure');
    const wpMax = resolve + composure;

    rollback.tracks_prev.push({
      _id: char._id, name: char.name,
      vitae_track:      char.vitae_track      ?? null,
      willpower_track:  char.willpower_track  ?? null,
      influence_balance: char.influence_balance ?? null,
    });

    const updates = { name: char.name };
    if (vitaeSpent)     updates.vitae_track     = -vitaeSpent;
    if (wpSpent)        updates.willpower_track  = wpMax - wpSpent;
    if (influenceSpent) updates.influence_balance = Math.max(0, (char.influence_balance || 0) - influenceSpent);

    try {
      await apiPut(`/api/characters/${char._id}`, updates);
      if (vitaeSpent)     char.vitae_track     = updates.vitae_track;
      if (wpSpent)        char.willpower_track  = updates.willpower_track;
      if (influenceSpent) char.influence_balance = updates.influence_balance;
    } catch (err) { trackErrors.push(displayName(char)); }
  }
  if (trackErrors.length) { fail('tracks', `Failed: ${trackErrors.join(', ')}`); return; }
  setPhaseState(overlay, 'tracks', 'done');

  // Phase: Apply confirmed ambience changes
  setPhaseState(overlay, 'ambience', 'running');
  const confirmedAmbience = currentCycle?.confirmed_ambience || {};
  const ambEntries = Object.entries(confirmedAmbience);
  if (!ambEntries.length) {
    setPhaseState(overlay, 'ambience', 'done', 'No changes');
  } else {
    const ambErrors = [];
    for (const [terrId, { ambience, ambienceMod }] of ambEntries) {
      try { await apiPost('/api/territories', { id: terrId, ambience, ambienceMod }); }
      catch (err) { ambErrors.push(terrId); }
    }
    cachedTerritories = null;
    if (ambErrors.length) { fail('ambience', `Failed: ${ambErrors.join(', ')}`); return; }
    setPhaseState(overlay, 'ambience', 'done', `${ambEntries.length} territor${ambEntries.length === 1 ? 'y' : 'ies'} updated`);
  }

  // Phase: Open game phase (feeding) — AC 5 manual gate
  setPhaseState(overlay, 'open-game', 'paused', 'Awaiting confirmation');
  await new Promise(resolve => {
    const prompt = document.createElement('p');
    prompt.className = 'gc-prompt';
    prompt.textContent = 'Open feeding for this game phase?';
    const openBtn = document.createElement('button');
    openBtn.className = 'dt-btn dt-btn-gold';
    openBtn.textContent = 'Open Feeding';
    const skipBtn = document.createElement('button');
    skipBtn.className = 'dt-btn';
    skipBtn.textContent = 'Skip';
    openBtn.addEventListener('click', async () => {
      openBtn.disabled = true;
      skipBtn.disabled = true;
      try {
        await openGamePhase(cycleId);
        setPhaseState(overlay, 'open-game', 'done');
      } catch (err) {
        setPhaseState(overlay, 'open-game', 'failed', err.message);
      }
      footer.innerHTML = '';
      resolve();
    }, { once: true });
    skipBtn.addEventListener('click', () => {
      setPhaseState(overlay, 'open-game', 'done', 'Skipped');
      footer.innerHTML = '';
      resolve();
    }, { once: true });
    footer.append(prompt, openBtn, skipBtn);
  });

  // Phase: New cycle — AC 6 deadline prompt then create
  setPhaseState(overlay, 'new-cycle', 'paused', 'Set deadline');
  const deadlineAt = await new Promise(resolve => {
    const today = new Date().toISOString().split('T')[0];
    const wrapper = document.createElement('div');
    wrapper.className = 'gc-deadline-wrapper';
    const label = document.createElement('label');
    label.className = 'gc-deadline-label';
    label.textContent = `Set deadline for Downtime ${nextNum}`;
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.id = 'gc-deadline-input';
    dateInput.className = 'gc-deadline-input';
    dateInput.value = today;
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'dt-btn dt-btn-gold';
    confirmBtn.textContent = 'Create Cycle';
    confirmBtn.addEventListener('click', () => {
      const val = dateInput.value;
      footer.innerHTML = '';
      resolve(val ? `${val}T00:00:00.000Z` : null);
    }, { once: true });
    wrapper.append(label, dateInput);
    footer.append(wrapper, confirmBtn);
  });
  setPhaseState(overlay, 'new-cycle', 'running');
  try {
    await closeCycle(cycleId);
    await createCycle(nextNum, deadlineAt);
    setPhaseState(overlay, 'new-cycle', 'done');
  } catch (err) { fail('new-cycle', err.message); return; }

  showWizardFooter(footer, 'done', rollback, overlay);
}

function showWizardFooter(footer, state, rollback, overlay) {
  footer.innerHTML = '';
  if (state === 'done') {
    const p = document.createElement('p');
    p.className = 'gc-result-ok';
    p.textContent = 'Reset complete. New cycle is now active.';
    const btn = document.createElement('button');
    btn.className = 'dt-btn dt-btn-gold';
    btn.textContent = 'Close';
    btn.addEventListener('click', () => { overlay.remove(); loadAllCycles(); }, { once: true });
    footer.append(p, btn);
  } else {
    const p = document.createElement('p');
    p.className = 'gc-result-err';
    p.textContent = 'Reset failed. Completed phases can be rolled back.';
    const rollBtn = document.createElement('button');
    rollBtn.className = 'dt-btn';
    rollBtn.textContent = 'Rollback & Close';
    rollBtn.addEventListener('click', async () => {
      rollBtn.disabled = true;
      rollBtn.textContent = 'Rolling back\u2026';
      await performRollback(rollback);
      overlay.remove();
      loadAllCycles();
    }, { once: true });
    const closeBtn = document.createElement('button');
    closeBtn.className = 'dt-btn';
    closeBtn.textContent = 'Close (no rollback)';
    closeBtn.addEventListener('click', () => { overlay.remove(); loadAllCycles(); }, { once: true });
    footer.append(p, rollBtn, closeBtn);
  }
}

async function performRollback(rollback) {
  // Restore income: revert influence_balance to pre-wizard values
  for (const prev of (rollback.income_prev || [])) {
    const char = characters.find(c => String(c._id) === String(prev._id));
    if (!char) continue;
    try {
      await apiPut(`/api/characters/${prev._id}`, { name: prev.name, influence_balance: prev.balance });
      char.influence_balance = prev.balance;
    } catch (err) { console.error('Rollback income:', prev.name, err.message); }
  }

  // Restore track resets
  for (const prev of (rollback.tracks_prev || [])) {
    const char = characters.find(c => String(c._id) === String(prev._id));
    if (!char) continue;
    const updates = { name: prev.name };
    if (prev.vitae_track      !== null) updates.vitae_track      = prev.vitae_track;
    if (prev.willpower_track  !== null) updates.willpower_track  = prev.willpower_track;
    if (prev.influence_balance !== null) updates.influence_balance = prev.influence_balance;
    try {
      await apiPut(`/api/characters/${prev._id}`, updates);
      if (prev.vitae_track !== null) char.vitae_track = prev.vitae_track;
      if (prev.willpower_track !== null) char.willpower_track = prev.willpower_track;
      if (prev.influence_balance !== null) char.influence_balance = prev.influence_balance;
    } catch (err) { console.error('Rollback tracks:', prev.name, err.message); }
  }

  // Restore published subs to 'ready'
  for (const subId of (rollback.published_ids || [])) {
    const sub = submissions.find(s => s._id === subId);
    if (!sub) continue;
    try {
      await updateSubmission(subId, { 'st_review.outcome_visibility': 'ready' });
      if (sub.st_review) sub.st_review.outcome_visibility = 'ready';
    } catch (err) { console.error('Rollback publish:', subId, err.message); }
  }

  // Snapshot: best-effort clear (cycle may already be closed)
  try { await updateCycle(selectedCycleId, { snapshot: null }); } catch (err) { /* best effort */ }
}

async function handleCloseCycle() {
  if (!selectedCycleId) return;
  const cycle = allCycles.find(c => c._id === selectedCycleId);
  if (!cycle || cycle.status !== 'active') return;
  if (!confirm(`Close cycle "${cycle.label || 'Unnamed'}"? This cannot be undone.`)) return;
  await closeCycle(selectedCycleId);
  await loadAllCycles();
}

async function handleOpenGamePhase() {
  if (!selectedCycleId) return;
  const cycle = allCycles.find(c => c._id === selectedCycleId);
  if (!cycle || cycle.status !== 'closed') return;
  if (!confirm(`Open game phase for "${cycle.label || 'Unnamed'}"? Players will be able to run their feeding rolls.`)) return;
  await openGamePhase(selectedCycleId);
  const idx = allCycles.findIndex(c => c._id === selectedCycleId);
  if (idx >= 0) allCycles[idx].status = 'game';
  await loadCycleById(selectedCycleId);
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

// ── Processing Mode (feature.43) ────────────────────────────────────────────

/**
 * Aggregate all actions from all submissions into a flat, phase-tagged queue.
 * Each entry: { key, subId, charName, phase, phaseNum, actionType, label, description, source, actionIdx, poolPlayer }
 */
function buildProcessingQueue(subs) {
  const queue = [];

  for (const sub of subs) {
    const raw = sub._raw || {};
    const resp = sub.responses || {};
    const _subChar = findCharacter(sub.character_name, sub.player_name);
    const charName = _subChar ? (_subChar.moniker || _subChar.name) : (sub.character_name || '?');

    // ── Sorcery (resolve_first) ──
    const sorcCount = parseInt(resp['sorcery_slot_count'] || '1', 10);
    // Tradition detection: check character disciplines for Cruac or Theban
    const sorcChar = _subChar || charMap.get((sub.character_name || '').toLowerCase().trim());
    const discs = sorcChar?.disciplines || {};
    let tradition = 'Unknown';
    if (discs.Cruac) tradition = 'Cruac';
    else if (discs.Theban) tradition = 'Theban';

    for (let n = 1; n <= sorcCount; n++) {
      const rite = resp[`sorcery_${n}_rite`];
      if (!rite) continue;
      const targetsText = resp[`sorcery_${n}_targets`] || '';
      const notes       = resp[`sorcery_${n}_notes`]   || '';
      let desc = rite;
      if (targetsText) desc += ` — targets: ${targetsText}`;
      if (notes)       desc += ` — ${notes}`;
      queue.push({
        key: `${sub._id}:sorcery:${n}`,
        subId: sub._id,
        charName,
        phase: PHASE_NUM_TO_LABEL[0],
        phaseNum: 0,
        actionType: 'resolve_first',
        label: `${tradition}: ${rite}`,
        description: desc,
        source: 'sorcery',
        actionIdx: n,
        poolPlayer: resp[`sorcery_${n}_pool_expr`] || '',
        riteName: rite,
        tradition,
        targetsText,
      });
    }

    // ── Feeding (all submissions get an entry; no-method submissions show as undeclared) ──
    {
      const feedMethod      = resp['_feed_method'] || '';
      const feedDisc        = resp['_feed_disc']   || '';
      const feedCustomAttr  = resp['_feed_custom_attr']  || '';
      const feedCustomSkill = resp['_feed_custom_skill'] || '';
      const feedCustomDisc  = resp['_feed_custom_disc']  || '';
      const feedDesc        = sub._raw?.feeding?.method || resp['feeding_description'] || '';
      const feedSpec        = resp['_feed_spec']   || '';
      const feedRote        = resp['_feed_rote'] === 'yes' || sub.st_review?.feeding_rote || false;
      let   feedTerrs   = {};
      try { feedTerrs = JSON.parse(resp['feeding_territories'] || '{}'); } catch { feedTerrs = {}; }
      const primaryTerr = Object.keys(feedTerrs).find(k => feedTerrs[k] === 'resident')
                       || Object.keys(feedTerrs).find(k => feedTerrs[k] && feedTerrs[k] !== 'none')
                       || '';
      const methodLabel = feedMethod ? (FEED_METHOD_LABELS_MAP[feedMethod] || feedMethod) : '';
      // For "other" method, use the player's custom attr/skill/disc as the pool label
      const poolLabel = feedMethod === 'other' && (feedCustomAttr || feedCustomSkill)
        ? [feedCustomAttr, feedCustomSkill, feedCustomDisc || feedDisc].filter(Boolean).join(' + ')
        : [methodLabel, feedDisc].filter(Boolean).join(' + ');
      queue.push({
        key: `${sub._id}:feeding`,
        subId: sub._id,
        charName,
        phase: PHASE_NUM_TO_LABEL[1],
        phaseNum: 1,
        actionType: 'feeding',
        label: 'Feeding',
        description: poolLabel || 'No feeding method declared',
        source: 'feeding',
        actionIdx: 0,
        poolPlayer: poolLabel,
        feedDesc,
        feedMethod,
        feedMethodLabel: methodLabel,
        feedDisc,
        feedSpec,
        feedRote,
        feedTerrs,
        primaryTerr,
        noMethod: !feedMethod,
      });
    }

    // ── Projects ──
    let projects = raw.projects || [];
    if (!projects.length) {
      for (let n = 1; n <= 4; n++) {
        const action = resp[`project_${n}_action`];
        if (!action) continue;
        projects.push({
          action_type: action,
          desired_outcome: resp[`project_${n}_outcome`] || '',
          detail: resp[`project_${n}_description`] || '',
          primary_pool: resp[`project_${n}_pool_expr`] ? { expression: resp[`project_${n}_pool_expr`] } : null,
        });
      }
    }
    projects.forEach((proj, idx) => {
      const actionType = proj.action_type || 'misc';
      if (actionType === 'feed') return; // AC10: feeding rote projects shown in feeding phase

      // ST recategorisation override — changes phase and label without altering player data
      const projReview = (sub.projects_resolved || [])[idx] || {};
      const effectiveActionType = projReview.action_type_override || actionType;

      const phaseNum = PHASE_ORDER[effectiveActionType] ?? 7;
      const phaseKey = PHASE_NUM_TO_LABEL[phaseNum];
      const slot = idx + 1; // 1-indexed response key

      // Task 1: extract app-form narrative description (distinct from desired outcome)
      const projDescription = resp[`project_${slot}_description`] || '';

      // Task 2: resolve cast character IDs to display names
      let projCastResolved = '';
      try {
        const castArr = JSON.parse(resp[`project_${slot}_cast`] || '[]');
        if (Array.isArray(castArr) && castArr.length) {
          projCastResolved = castArr.map(id => {
            const c = characters.find(ch => String(ch._id) === String(id));
            return c ? displayName(c) : id;
          }).join(', ');
        } else {
          projCastResolved = resp[`project_${slot}_cast`] || '';
        }
      } catch {
        projCastResolved = resp[`project_${slot}_cast`] || '';
      }

      // Task 3: parse merit keys "Name|qualifier" into "Name (qualifier)"
      let projMeritsResolved = '';
      try {
        const meritsArr = JSON.parse(resp[`project_${slot}_merits`] || '[]');
        if (Array.isArray(meritsArr) && meritsArr.length) {
          projMeritsResolved = meritsArr.map(m => {
            const parts = m.split('|');
            const name = parts[0] || m;
            const qual = parts[1] || '';
            return qual ? `${name} (${qual})` : name;
          }).join(', ');
        } else {
          projMeritsResolved = resp[`project_${slot}_merits`] || '';
        }
      } catch {
        projMeritsResolved = resp[`project_${slot}_merits`] || '';
      }

      queue.push({
        key: `${sub._id}:proj:${idx}`,
        subId: sub._id,
        charName,
        phase: phaseKey,
        phaseNum,
        actionType: effectiveActionType,
        originalActionType: actionType,
        label: ACTION_TYPE_LABELS[effectiveActionType] || effectiveActionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: projDescription || proj.desired_outcome || '',
        source: 'project',
        actionIdx: idx,
        projSlot: slot,
        poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || '',
        projTitle:       resp[`project_${slot}_title`]     || '',
        projOutcome:     proj.desired_outcome || resp[`project_${slot}_outcome`] || '',
        projDescription,
        projCast:        projCastResolved,
        projMerits:      projMeritsResolved,
        projTerritory:   resp[`project_${slot}_territory`] || '',
      });
    });

    // ── Merit/Sphere actions ──
    const spheres  = raw.sphere_actions || [];
    const contacts = raw.contact_actions?.requests || [];
    const retainers = raw.retainer_actions?.actions || [];

    // merit_actions_resolved uses a flat index: spheres, then contacts, then retainers
    let meritFlatIdx = 0;

    spheres.forEach((action, idx) => {
      const originalActionType = action.action_type || 'misc';
      const parsed     = _parseMeritType(action.merit_type || '');
      const { category: meritCategory, label: meritLabel, qualifier: meritQualifier } = parsed;
      // Use character's actual merit rating + bonus (catches VM bonus dots, shared merits, etc.)
      const sphereChar  = _subChar || charMap.get((sub.character_name || '').toLowerCase().trim());
      const actualMerit = sphereChar?.merits?.find(m => {
        const mName = (m.name || '').toLowerCase();
        const lName = meritLabel.toLowerCase();
        const nameMatch = mName === lName || lName.includes(mName) || mName.includes(lName);
        const qualMatch = (m.qualifier || m.area || '').toLowerCase() === meritQualifier.toLowerCase();
        return nameMatch && qualMatch;
      });
      const meritDots = actualMerit
        ? (actualMerit.rating || actualMerit.dots || parsed.dots || 0) + (actualMerit.bonus || 0)
        : (parsed.dots || 0);
      // Apply ST action-type override if present
      const meritResolved = (sub.merit_actions_resolved || [])[meritFlatIdx] || {};
      const actionType = meritResolved.action_type_override || originalActionType;
      let phaseNum;
      const isAlliesAction = meritCategory === 'allies' || meritCategory === 'status';
      if (meritCategory === 'allies') {
        phaseNum = PHASE_ORDER[actionType] ?? 8;
      } else if (meritCategory === 'status') {
        phaseNum = PHASE_ORDER[actionType] ?? 9;
      } else if (meritCategory === 'retainer' || meritCategory === 'staff') {
        phaseNum = 10;
      } else if (meritCategory === 'contacts') {
        phaseNum = 11;
      } else {
        phaseNum = PHASE_ORDER[actionType] ?? 13;
      }
      const phaseKey = PHASE_NUM_TO_LABEL[phaseNum];
      queue.push({
        key: `${sub._id}:merit:${meritFlatIdx}`,
        subId: sub._id,
        charName,
        phase: phaseKey,
        phaseNum,
        actionType,
        originalActionType,
        label: `${action.merit_type || 'Merit'}: ${ACTION_TYPE_LABELS[actionType] || actionType}`,
        description: action.description || action.desired_outcome || '',
        source: 'merit',
        actionIdx: meritFlatIdx,
        poolPlayer: action.primary_pool?.expression || '',
        isAlliesAction,
        meritCategory,
        meritLabel,
        meritDots,
        meritQualifier,
        meritDesiredOutcome: action.desired_outcome || '',
      });
      meritFlatIdx++;
    });

    contacts.forEach((req, idx) => {
      queue.push({
        key: `${sub._id}:merit:${meritFlatIdx}`,
        subId: sub._id,
        charName,
        phase: PHASE_NUM_TO_LABEL[11],
        phaseNum: 11,
        actionType: 'contacts',
        label: 'Contacts: Gather Info',
        description: req,
        source: 'merit',
        actionIdx: meritFlatIdx,
        poolPlayer: '',
      });
      meritFlatIdx++;
    });

    retainers.forEach((task, idx) => {
      queue.push({
        key: `${sub._id}:merit:${meritFlatIdx}`,
        subId: sub._id,
        charName,
        phase: PHASE_NUM_TO_LABEL[12],
        phaseNum: 12,
        actionType: 'resources_retainers',
        label: 'Retainer: Directed Action',
        description: task,
        source: 'merit',
        actionIdx: meritFlatIdx,
        poolPlayer: '',
      });
      meritFlatIdx++;
    });
  }

  // Sort: phase first, then character name
  queue.sort((a, b) => {
    if (a.phaseNum !== b.phaseNum) return a.phaseNum - b.phaseNum;
    return a.charName.localeCompare(b.charName);
  });

  return queue;
}

/**
 * Recompute discipline × territory profile from all currently-validated feeding reviews.
 * Called after any feeding pool_status or pool_validated change. Saves to cycle document.
 */
async function recomputeDisciplineProfile() {
  const profile = {};
  for (const sub of submissions) {
    const rev = sub.feeding_review || {};
    if (rev.pool_status !== 'validated' || !rev.pool_validated) continue;
    let feedTerrs = {};
    try { feedTerrs = JSON.parse(sub.responses?.feeding_territories || '{}'); } catch { feedTerrs = {}; }
    const active = Object.entries(feedTerrs).filter(([, v]) => v && v !== 'none').map(([k]) => resolveTerrId(k)).filter(Boolean);
    if (!active.length) continue;
    const foundDiscs = KNOWN_DISCIPLINES.filter(d => rev.pool_validated.includes(d));
    for (const territory of active) {
      if (!profile[territory]) profile[territory] = {};
      for (const disc of foundDiscs) {
        profile[territory][disc] = (profile[territory][disc] || 0) + 1;
      }
    }
  }
  // Also scan ambience project actions
  for (const sub of submissions) {
    for (const [pIdx, proj] of (sub.projects_resolved || []).entries()) {
      if (!proj?.pool_validated) continue;
      if (proj.pool_status !== 'validated') continue;
      if (proj.action_type !== 'ambience_increase' && proj.action_type !== 'ambience_decrease') continue;
      const territory = resolveTerrId(sub.responses?.[`project_${pIdx + 1}_territory`] || '');
      if (!territory) continue;
      const foundDiscs = KNOWN_DISCIPLINES.filter(d => proj.pool_validated.includes(d));
      if (!foundDiscs.length) continue;
      if (!profile[territory]) profile[territory] = {};
      for (const disc of foundDiscs) {
        profile[territory][disc] = (profile[territory][disc] || 0) + 1;
      }
    }
  }

  try {
    await updateCycle(selectedCycleId, { discipline_profile: profile });
    const idx = allCycles.findIndex(c => c._id === selectedCycleId);
    if (idx >= 0) allCycles[idx].discipline_profile = profile;
    if (currentCycle) currentCycle.discipline_profile = profile;
  } catch (err) {
    console.error('Failed to save discipline profile:', err.message);
  }
}

/** Get the review object for a queue entry from its submission. */
function getEntryReview(entry) {
  const sub = submissions.find(s => s._id === entry.subId);
  if (!sub) return null;
  if (entry.source === 'feeding') return sub.feeding_review || null;
  if (entry.source === 'project') return (sub.projects_resolved || [])[entry.actionIdx] || null;
  if (entry.source === 'merit')   return (sub.merit_actions_resolved || [])[entry.actionIdx] || null;
  if (entry.source === 'sorcery') return (sub.sorcery_review || {})[entry.actionIdx] || null;
  return null;
}

/** Save a partial update to a queue entry's review object. */
async function saveEntryReview(entry, patch) {
  const sub = submissions.find(s => s._id === entry.subId);
  if (!sub) return;

  if (entry.source === 'feeding') {
    const current = sub.feeding_review || { pool_player: entry.poolPlayer, pool_validated: '', pool_status: 'pending', notes_thread: [], player_feedback: '' };
    const updated = { ...current, ...patch };
    await updateSubmission(entry.subId, { feeding_review: updated });
    sub.feeding_review = updated;
    // Recompute discipline × territory profile when pool or status changes
    if ('pool_status' in patch || 'pool_validated' in patch) {
      recomputeDisciplineProfile(); // async, fire-and-forget
    }
  } else if (entry.source === 'project') {
    const resolved = [...(sub.projects_resolved || [])];
    while (resolved.length <= entry.actionIdx) resolved.push(null);
    const current = resolved[entry.actionIdx] || { action_type: entry.actionType, pool: null, roll: null, st_note: '', pool_player: entry.poolPlayer, pool_validated: '', pool_status: 'pending', notes_thread: [], player_feedback: '', resolved_at: null };
    resolved[entry.actionIdx] = { ...current, ...patch };
    await updateSubmission(entry.subId, { projects_resolved: resolved });
    sub.projects_resolved = resolved;
    // Recompute discipline profile when ambience actions are validated
    if (('pool_status' in patch || 'pool_validated' in patch) &&
        (entry.actionType === 'ambience_increase' || entry.actionType === 'ambience_decrease')) {
      recomputeDisciplineProfile(); // fire-and-forget
    }
  } else if (entry.source === 'merit') {
    const resolved = [...(sub.merit_actions_resolved || [])];
    while (resolved.length <= entry.actionIdx) resolved.push(null);
    const current = resolved[entry.actionIdx] || { pool_player: entry.poolPlayer, pool_validated: '', pool_status: 'pending', notes_thread: [], player_feedback: '' };
    resolved[entry.actionIdx] = { ...current, ...patch };
    await updateSubmission(entry.subId, { merit_actions_resolved: resolved });
    sub.merit_actions_resolved = resolved;
  } else if (entry.source === 'sorcery') {
    const sorcReview = { ...(sub.sorcery_review || {}) };
    const current = sorcReview[entry.actionIdx] || { pool_status: 'pending', notes_thread: [], player_feedback: '' };
    sorcReview[entry.actionIdx] = { ...current, ...patch };
    await updateSubmission(entry.subId, { sorcery_review: sorcReview });
    sub.sorcery_review = sorcReview;
  }
}

// ── Ambience Dashboard (feature.47) ─────────────────────────────────────────

const AMBIENCE_STEPS_LIST = [
  'Hostile', 'Barrens', 'Neglected', 'Untended',
  'Settled', 'Tended', 'Curated', 'Verdant', 'The Rack',
];

/** Load (or reuse) territories from the DB, falling back to TERRITORY_DATA. */
async function ensureTerritories() {
  if (cachedTerritories) return cachedTerritories;
  let db = [];
  try { db = await apiGet('/api/territories'); } catch { /* ignore */ }
  if (db.length) {
    cachedTerritories = db;
  } else {
    cachedTerritories = TERRITORY_DATA.map(t => ({ ...t }));
  }
  return cachedTerritories;
}

/**
 * Explicit slug-to-id map for territory keys produced by normaliseTerritoryGrid in db.js.
 * Also covers display-name variants from _raw.feeding.territories.
 */
const TERRITORY_SLUG_MAP = {
  // normaliseTerritoryGrid slugs
  the_academy:              'academy',
  the_harbour:              'harbour',
  the_city_harbour:         'harbour',     // legacy
  the_dockyards:            'dockyards',
  the_docklands:            'dockyards',   // legacy
  the_second_city:          'secondcity',
  the_north_shore:          'northshore',
  the_northern_shore:       'northshore',  // legacy
  the_barrens__no_territory_: null,        // no territory
  // MATRIX_TERRS display-name keys (from _raw.feeding.territories)
  'The Academy':            'academy',
  'The City Harbour':       'harbour',
  'The Harbour':            'harbour',   // short form used in _raw.influence
  'The Dockyards':          'dockyards',
  'The Second City':        'secondcity',
  'The Northern Shore':     'northshore',  // legacy
  'The North Shore':        'northshore',
  'The Shore':              'northshore',  // short form used in _raw.influence
  'The Barrens':            null,
  'The Barrens (No Territory)': null,
  // TERRITORY_DATA ids (pass-through)
  academy:    'academy',
  harbour:    'harbour',
  dockyards:  'dockyards',
  secondcity: 'secondcity',
  northshore: 'northshore',
};

/** Scan free text for a territory mention; returns TERRITORY_DATA id or null. */
function extractTerritoryFromText(text) {
  if (!text) return null;
  if (/\bacademy\b/i.test(text)) return 'academy';
  if (/\bharbou?r\b/i.test(text)) return 'harbour';
  if (/\bdockyards?\b/i.test(text)) return 'dockyards';
  if (/\bsecond\s+city\b/i.test(text)) return 'secondcity';
  if (/\bnorth(?:ern)?\s*shore\b/i.test(text)) return 'northshore';
  return null;
}

/** Normalise a territory string to a TERRITORY_DATA id. Returns null if not found or barrens. */
function resolveTerrId(raw) {
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, raw)) return TERRITORY_SLUG_MAP[raw];
  // Fallback: strip leading "the_" or "The ", convert underscores to spaces, fuzzy match
  const normalised = raw.toLowerCase().replace(/^the[_\s]+/, '').replace(/_/g, ' ');
  for (const td of TERRITORY_DATA) {
    const tdNorm = td.name.toLowerCase().replace(/^the\s+/, '');
    if (normalised === tdNorm || normalised.includes(tdNorm) || tdNorm.includes(normalised)) return td.id;
  }
  return null;
}

// ── Ambience source gatherers ─────────────────────────────────────────────────
// Each reads the module-level `submissions` array, normalises territory keys via
// resolveTerrId, and returns id-keyed accumulators. Extracted so buildAmbienceData
// reads as a coordinator rather than a 180-line monolith.

/**
 * Count feeders per territory for overfeeding calculation.
 * Reads responses.feeding_territories (slug keys); falls back to _raw.feeding.territories
 * (display-name keys) for submissions uploaded before normaliseTerritoryGrid was added.
 * Returns { [terrId]: count }
 */
function _gatherFeeders(subs) {
  const feederCounts = {};
  for (const sub of subs) {
    let grid = {};
    const respStr = sub.responses?.feeding_territories;
    if (respStr) {
      try { grid = JSON.parse(respStr); } catch { grid = {}; }
    } else {
      grid = sub._raw?.feeding?.territories || {};
    }
    for (const [k, v] of Object.entries(grid)) {
      if (!v || v === 'none' || v === 'Not feeding here') continue;
      const tid = resolveTerrId(k);
      if (!tid) continue; // skip barrens / unrecognised
      feederCounts[tid] = (feederCounts[tid] || 0) + 1;
    }
  }
  return feederCounts;
}

/**
 * Sum influence spend per territory.
 * influence_territories: { "The Academy": 3, "The Dockyards": -2, ... } or legacy array.
 * Returns { infPos: { [terrId]: n }, infNeg: { [terrId]: n } }
 */
function _gatherInfluence(subs) {
  const infPos = {}, infNeg = {};
  for (const sub of subs) {
    let infObj = {};
    try { infObj = JSON.parse(sub.responses?.influence_territories || '{}'); } catch { infObj = {}; }
    // Handle legacy format (array of names from old uploads) — treat each as +1
    if (Array.isArray(infObj)) {
      for (const k of infObj) {
        const tid = resolveTerrId(k);
        if (tid) infPos[tid] = (infPos[tid] || 0) + 1;
      }
    } else {
      for (const [k, v] of Object.entries(infObj)) {
        const tid = resolveTerrId(k);
        if (!tid) continue;
        const val = Number(v) || 0;
        if (val > 0) infPos[tid] = (infPos[tid] || 0) + val;
        else if (val < 0) infNeg[tid] = (infNeg[tid] || 0) + Math.abs(val);
      }
    }
  }
  return { infPos, infNeg };
}

/**
 * Sum ambience project roll successes per territory.
 * Returns { projPos: { [terrId]: n }, projNeg: { [terrId]: n }, pendingCount: n }
 */
function _gatherProjectAmbience(subs) {
  const projPos = {}, projNeg = {};
  let pendingCount = 0;
  for (const sub of subs) {
    // Count pending: ambience project actions in form responses with no resolved roll
    for (let n = 1; n <= 4; n++) {
      const action = sub.responses?.[`project_${n}_action`];
      if (action !== 'ambience_increase' && action !== 'ambience_decrease') continue;
      const resolved = (sub.projects_resolved || [])[n - 1];
      if ((resolved?.pool_status || 'pending') === 'pending') pendingCount++;
    }
    // Sum resolved roll successes
    for (const [idx, proj] of (sub.projects_resolved || []).entries()) {
      if (!proj) continue;
      if (proj.action_type !== 'ambience_increase' && proj.action_type !== 'ambience_decrease') continue;
      if (!proj.roll) continue;
      const n = idx + 1;
      const terrOverride = resolveTerrId(sub.st_review?.territory_overrides?.[String(idx)] || '');
      const terrRaw = sub.responses?.[`project_${n}_territory`] || '';
      const desc    = sub.responses?.[`project_${n}_description`] || '';
      const outcome = sub.responses?.[`project_${n}_outcome`] || '';
      const tid = terrOverride || resolveTerrId(terrRaw) || extractTerritoryFromText(desc) || extractTerritoryFromText(outcome);
      if (!tid) continue;
      const successes = proj.roll.successes ?? 0;
      if (proj.action_type === 'ambience_increase') projPos[tid] = (projPos[tid] || 0) + successes;
      else projNeg[tid] = (projNeg[tid] || 0) + successes;
    }
  }
  return { projPos, projNeg, pendingCount };
}

/**
 * Sum Allies / Status / Retainer automatic ambience contributions per territory.
 * Level-based: dots 3–4 = ±1, dots 5 = ±2. Territory resolved from st_review overrides.
 * Returns { alliesPos: { [terrId]: n }, alliesNeg: { [terrId]: n }, pendingCount: n }
 */
function _gatherMeritAmbience(subs) {
  const alliesPos = {}, alliesNeg = {};
  let pendingCount = 0;
  for (const sub of subs) {
    const raw       = sub._raw || {};
    const spheres   = raw.sphere_actions || [];
    const contacts  = raw.contact_actions?.requests || [];
    const retainers = raw.retainer_actions?.actions || [];
    const subChar   = findCharacter(sub.character_name, sub.player_name);
    let meritFlatIdx = 0;

    for (const action of spheres) {
      const resolvedAct = (sub.merit_actions_resolved || [])[meritFlatIdx];
      const rawType = resolvedAct?.action_type_override || action.action_type || 'misc';
      // Normalise raw form label to enum if not already (e.g. "Ambience Change (Increase):...")
      const isIncrease = rawType === 'ambience_increase' || /ambience.*increas/i.test(rawType);
      const isDecrease = rawType === 'ambience_decrease' || /ambience.*decreas/i.test(rawType);
      if (isIncrease || isDecrease) {
        const parsed = _parseMeritType(action.merit_type || '');
        if (parsed.category === 'allies' || parsed.category === 'status' || parsed.category === 'retainer') {
          if (resolvedAct?.pool_status === 'resolved') {
            const tid = resolveTerrId(sub.st_review?.territory_overrides?.[`allies_${meritFlatIdx}`] || '');
            if (tid) {
              // Prefer ST-linked qualifier over parsed submission text
              const linkedQual = resolvedAct?.linked_merit_qualifier ?? parsed.qualifier;
              const actualMerit = subChar?.merits?.find(m =>
                m.name?.toLowerCase() === parsed.label.toLowerCase() &&
                (m.qualifier || m.area || '').toLowerCase() === linkedQual.toLowerCase()
              );
              const dots = actualMerit
                ? (actualMerit.rating || actualMerit.dots || parsed.dots || 0) + (actualMerit.bonus || 0)
                : (parsed.dots || 0);
              const hasHWV = (subChar?.merits || []).some(m => /honey with vinegar/i.test(m.name || ''));
              const value = hasHWV
                ? (dots >= 4 ? 2 : dots >= 2 ? 1 : 0)
                : (dots >= 5 ? 2 : dots >= 3 ? 1 : 0);
              if (value > 0) {
                if (isIncrease) alliesPos[tid] = (alliesPos[tid] || 0) + value;
                else            alliesNeg[tid] = (alliesNeg[tid] || 0) + value;
              }
            }
          }
          // Count as pending if not yet resolved
          if (!resolvedAct || resolvedAct.pool_status === 'pending') pendingCount++;
        }
      }
      meritFlatIdx++;
    }
    // contacts and retainers don't do ambience but advance the flat index
    meritFlatIdx += contacts.length + retainers.length;
  }
  return { alliesPos, alliesNeg, pendingCount };
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the per-territory aggregation data for the ambience dashboard.
 * Returns { rows, pendingAmbienceCount }.
 */
function buildAmbienceData(terrs) {
  // Starting ambience from DB records (fallback to TERRITORY_DATA defaults)
  const startingAmbience = {}, startingAmbienceMod = {};
  if (terrs?.length) {
    for (const t of terrs) {
      const td = TERRITORY_DATA.find(d => d.id === t.id || d.name === t.name);
      if (td) {
        startingAmbience[td.id]    = t.ambience    || td.ambience;
        startingAmbienceMod[td.id] = (t.ambienceMod !== undefined && t.ambienceMod !== null)
          ? t.ambienceMod : td.ambienceMod;
      }
    }
  }
  for (const td of TERRITORY_DATA) {
    if (!startingAmbience[td.id])              startingAmbience[td.id]    = td.ambience;
    if (startingAmbienceMod[td.id] === undefined) startingAmbienceMod[td.id] = td.ambienceMod;
  }

  // Aggregate each change source (all accumulators keyed by canonical territory id)
  const feederCounts                                          = _gatherFeeders(submissions);
  const { infPos, infNeg }                                    = _gatherInfluence(submissions);
  const { projPos, projNeg, pendingCount: projPending }       = _gatherProjectAmbience(submissions);
  const { alliesPos, alliesNeg, pendingCount: alliesPending } = _gatherMeritAmbience(submissions);
  const pendingAmbienceCount = projPending + alliesPending;

  // ── Assemble rows ──
  const rows = TERRITORY_DATA.map(td => {
    const id = td.id;
    const ambience = startingAmbience[id] || td.ambience;
    const cap = AMBIENCE_CAP[ambience] ?? 6;
    const feeders = feederCounts[id] || 0;
    const overfeedVal = feeders > cap ? -(feeders - cap) : 0;
    const entropy = -1;
    const inf_pos = infPos[id] || 0;
    const inf_neg = infNeg[id] || 0;
    const influence = inf_pos - inf_neg;
    const proj_pos = projPos[id] || 0;
    const proj_neg = projNeg[id] || 0;
    const projects = proj_pos - proj_neg;
    const allies_pos = alliesPos[id] || 0;
    const allies_neg = alliesNeg[id] || 0;
    const allies = allies_pos - allies_neg;
    const net = entropy + overfeedVal + influence + projects + allies;
    const startIdx = AMBIENCE_STEPS_LIST.indexOf(ambience);
    let projStep = ambience;
    if (startIdx >= 0) {
      let delta = 0;
      if (net > 0) delta = 1;
      else if (net < -5) delta = -2;
      else if (net < 0) delta = -1;
      const newIdx = Math.max(0, Math.min(AMBIENCE_STEPS_LIST.length - 1, startIdx + delta));
      projStep = AMBIENCE_STEPS_LIST[newIdx];
    }
    const ambienceMod = startingAmbienceMod[id] ?? td.ambienceMod;
    return { id, name: td.name, ambience, ambienceMod, entropy, overfeed: overfeedVal, feeders, cap, inf_pos, inf_neg, influence, proj_pos, proj_neg, projects, allies_pos, allies_neg, allies, net, projStep };
  });
  return { rows, pendingAmbienceCount };
}

/** Render the Ambience Dashboard panel (collapsible). Returns HTML string. */
function renderAmbienceDashboard() {
  const terrs = cachedTerritories || TERRITORY_DATA;
  const { rows, pendingAmbienceCount } = buildAmbienceData(terrs);
  const profile = currentCycle?.discipline_profile || {};
  const notes = currentCycle?.ambience_notes || '';

  let h = `<div class="proc-amb-dashboard">`;
  h += `<div class="proc-amb-header" data-toggle="amb-dash">`;
  h += `<span class="proc-amb-title">Ambience Dashboard</span>`;
  if (pendingAmbienceCount > 0) h += `<span class="proc-amb-pending-chip">${pendingAmbienceCount} ambience action${pendingAmbienceCount > 1 ? 's' : ''} pending</span>`;
  h += `<span class="proc-amb-toggle">${ambDashCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
  h += `</div>`;

  if (!ambDashCollapsed) {
    h += `<div class="proc-amb-body">`;

    // ── Territory Ambience Table ──
    h += `<table class="proc-amb-table">`;
    h += `<thead><tr>
      <th>Territory</th>
      <th title="Current ambience step">Starting</th>
      <th title="Fixed -1 entropy per cycle">Entropy</th>
      <th title="Feeders vs cap">Overfeeding</th>
      <th title="Influence spend from CSV: +positive / -negative / net">Influence</th>
      <th title="Ambience project roll successes">Projects</th>
      <th title="Allies / Status / Retainer automatic ambience actions">Allies</th>
      <th title="Sum of all columns">Net Change</th>
      <th title="Projected new ambience step (preview only)">Projected</th>
      <th title="Confirm this ambience change for cycle push">Confirm</th>
    </tr></thead>`;
    h += `<tbody>`;
    for (const r of rows) {
      const netClass = r.net > 0 ? 'proc-amb-pos' : r.net < 0 ? 'proc-amb-neg' : '';
      const projClass = r.projStep !== r.ambience ? (r.net > 0 ? 'proc-amb-pos' : 'proc-amb-neg') : '';
      const netStr = r.net > 0 ? `+${r.net}` : String(r.net);
      const gap = r.cap - r.feeders;
      const gapStr = gap >= 0 ? `+${gap}` : String(gap);
      const gapClass = gap < 0 ? 'proc-amb-neg' : '';
      const infNet = r.inf_pos - r.inf_neg;
      const infNetStr = infNet > 0 ? `+${infNet}` : String(infNet);
      const infNetClass = infNet > 0 ? 'proc-amb-pos' : infNet < 0 ? 'proc-amb-neg' : '';
      const infDisplay = `<span class="proc-amb-pos">+${r.inf_pos}</span> | <span class="proc-amb-neg">-${r.inf_neg}</span> | <span class="${infNetClass}">${infNetStr}</span>`;
      h += `<tr>`;
      h += `<td class="proc-amb-terr">${esc(r.name)}</td>`;
      h += `<td>${esc(r.ambience)}</td>`;
      h += `<td class="proc-amb-neg">${r.entropy}</td>`;
      h += `<td>${r.feeders}/${r.cap} | <span class="${gapClass}">${gapStr}</span></td>`;
      h += `<td>${infDisplay}</td>`;
      const projNet = r.proj_pos - r.proj_neg;
      const projNetStr = projNet > 0 ? `+${projNet}` : String(projNet);
      const projNetClass = projNet > 0 ? 'proc-amb-pos' : projNet < 0 ? 'proc-amb-neg' : '';
      const projDisplay = `<span class="proc-amb-pos">+${r.proj_pos}</span> | <span class="proc-amb-neg">-${r.proj_neg}</span> | <span class="${projNetClass}">${projNetStr}</span>`;
      h += `<td>${projDisplay}</td>`;
      const alliesNet = r.allies_pos - r.allies_neg;
      const alliesNetStr = alliesNet > 0 ? `+${alliesNet}` : String(alliesNet);
      const alliesNetClass = alliesNet > 0 ? 'proc-amb-pos' : alliesNet < 0 ? 'proc-amb-neg' : '';
      const alliesDisplay = `<span class="proc-amb-pos">+${r.allies_pos}</span> | <span class="proc-amb-neg">-${r.allies_neg}</span> | <span class="${alliesNetClass}">${alliesNetStr}</span>`;
      h += `<td>${alliesDisplay}</td>`;
      h += `<td class="proc-amb-net ${netClass}">${netStr}</td>`;
      h += `<td class="${projClass}">${esc(r.projStep)}${r.projStep !== r.ambience ? (r.net > 0 ? ' &#8593;' : ' &#8595;') : ''}</td>`;
      // Confirm cell
      const confirmed = currentCycle?.confirmed_ambience?.[r.id];
      const projMod = AMBIENCE_MODS[r.projStep] ?? r.ambienceMod ?? 0;
      if (confirmed) {
        h += `<td class="proc-amb-confirmed">\u2713 ${esc(confirmed.ambience)} <button class="proc-amb-confirm-btn proc-amb-reconfirm" data-terr-id="${esc(r.id)}" data-proj-step="${esc(r.projStep)}" data-proj-mod="${projMod}">Re-confirm</button></td>`;
      } else {
        h += `<td><button class="proc-amb-confirm-btn" data-terr-id="${esc(r.id)}" data-proj-step="${esc(r.projStep)}" data-proj-mod="${projMod}">Confirm ${esc(r.projStep)}</button></td>`;
      }
      h += `</tr>`;
    }
    h += `</tbody></table>`;
    h += `<p class="proc-amb-note">Net change is informational. Positive net = +1 step. Negative net = -1 step. Net below -5 = -2 steps.</p>`;

    // ── Feeding Matrix ──
    h += `<div class="proc-disc-header" data-toggle="feed-matrix">`;
    h += `<span class="proc-amb-title">Feeding Matrix</span>`;
    h += `<span class="proc-amb-toggle">${matrixCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
    h += `</div>`;

    if (!matrixCollapsed) {
      const _mCols = MATRIX_TERRS;
      const _mResidents = {};
      for (const mt of _mCols) {
        const tid = TERRITORY_SLUG_MAP[mt.csvKey] ?? null;
        const td = (cachedTerritories || TERRITORY_DATA).find(t => t.id === tid);
        const residents = new Set(td?.feeding_rights || []);
        if (td?.regent_id) residents.add(String(td.regent_id));
        if (td?.lieutenant_id) residents.add(String(td.lieutenant_id));
        _mResidents[mt.csvKey] = residents;
      }
      const _mSubByCharId = new Map();
      for (const s of submissions) {
        const c = findCharacter(s.character_name, s.player_name);
        if (c) _mSubByCharId.set(String(c._id), s);
      }
      const _mChars = characters.filter(c => !c.retired)
        .sort((a, b) => sortName(a).localeCompare(sortName(b)));
      const _mFeederCounts = {};
      for (const mt of _mCols) _mFeederCounts[mt.csvKey] = 0;

      h += `<div class="dt-matrix-wrap"><table class="dt-matrix-table">`;
      h += '<thead><tr><th>Character</th>';
      for (const t of _mCols) {
        const amb = getTerritoryAmbience(t.ambienceKey);
        h += `<th title="${esc(amb || 'No cap')}">${esc(t.label)}<br><span class="dt-matrix-amb">${esc(amb || 'N/A')}</span></th>`;
      }
      h += '</tr></thead><tbody>';
      for (const char of _mChars) {
        const charId = String(char._id);
        const sub = _mSubByCharId.get(charId) || null;
        const hasSub = !!sub;
        const fedTerrs = hasSub ? _getSubFedTerrs(sub) : new Set();
        h += `<tr class="dt-matrix-row${hasSub ? '' : ' dt-matrix-nosub'}">`;
        h += `<td class="dt-matrix-char">${esc(displayName(char))}${!hasSub ? ' <span class="dt-matrix-nosub-badge">No submission</span>' : ''}</td>`;
        for (const t of _mCols) {
          const isBarrens = t.ambienceKey === null;
          const fed = fedTerrs.has(t.csvKey);
          if (!fed) {
            h += '<td class="dt-matrix-empty">\u2014</td>';
          } else {
            _mFeederCounts[t.csvKey]++;
            if (!isBarrens && _mResidents[t.csvKey].has(charId)) {
              h += '<td class="dt-matrix-resident">O</td>';
            } else {
              h += '<td class="dt-matrix-poach">X</td>';
            }
          }
        }
        h += '</tr>';
      }
      h += '</tbody>';
      h += '<tfoot><tr><td><strong>Feeders</strong></td>';
      for (const t of _mCols) {
        if (t.ambienceKey === null) {
          h += '<td class="dt-matrix-empty">\u2014</td>';
        } else {
          const amb = getTerritoryAmbience(t.ambienceKey);
          const cap = amb ? (AMBIENCE_CAP[amb] ?? null) : null;
          const count = _mFeederCounts[t.csvKey];
          const overCap = cap !== null && count > cap;
          h += `<td class="${overCap ? 'dt-matrix-overcap' : ''}">${count}${cap !== null ? ` / ${cap}` : ''}</td>`;
        }
      }
      h += '</tr></tfoot></table>';
      h += '<p class="dt-matrix-note">O = resident feeding. X = poaching (non-resident). Feeders / cap from City ambience. Residents set via City tab.</p>';
      h += '</div>';
    }

    // ── ST Notes ──
    h += `<div class="proc-amb-notes-block">`;
    h += `<label class="proc-amb-notes-lbl">ST Ambience Notes</label>`;
    h += `<textarea class="proc-amb-notes" placeholder="Working notes about the territory picture this cycle...">${esc(notes)}</textarea>`;
    h += `</div>`;

    h += `</div>`; // proc-amb-body
  }

  h += `</div>`; // proc-amb-dashboard
  return h;
}

// ── Pre-read Panel (Epic 1 — Story 1.1 + 1.2) ────────────────────────────────

function renderPreReadSection() {
  const COURT_KEYS = ['travel', 'game_recount', 'rp_shoutout', 'correspondence', 'trust', 'harm', 'aspirations'];
  const COURT_LABELS = {
    travel: 'Travel', game_recount: 'Game Recount', rp_shoutout: 'Shoutout',
    correspondence: 'Dear X', trust: 'Trust', harm: 'Harm', aspirations: 'Aspirations',
  };

  const readable = submissions
    .filter(s => {
      const r = s.responses || {};
      return COURT_KEYS.some(k => r[k]?.trim?.()) || r.vamping?.trim?.() || r.lore_request?.trim?.();
    })
    .sort((a, b) => (a.character_name || '').localeCompare(b.character_name || ''));

  if (!readable.length) return '';

  const isExpanded = expandedPhases.has('preread');

  let h = '<div class="proc-phase-section">';
  h += `<div class="proc-phase-header" data-toggle-phase="preread">`;
  h += `<span class="proc-phase-label">Step 0 \u2014 Pre-read</span>`;
  h += `<span class="proc-phase-count">${readable.length} submission${readable.length !== 1 ? 's' : ''}</span>`;
  h += `<span class="proc-phase-toggle">${isExpanded ? '&#9650; Hide' : '&#9660; Show'}</span>`;
  h += `</div>`;

  if (isExpanded) {
    for (const s of readable) {
      const r = s.responses || {};
      const char = findCharacter(s.character_name, s.player_name);
      const charName = char ? (char.moniker || char.name) : (s.character_name || 'Unknown');
      const isBlockExpanded = preReadExpanded.has(s._id);
      const hasLore = !!r.lore_request?.trim?.();
      const loreResponded = !!s.st_review?.lore_responded;
      const loreBadge = hasLore && !loreResponded
        ? '<span class="proc-preread-lore-badge">Lore ?</span>'
        : '';

      h += `<div class="proc-preread-char${isBlockExpanded ? ' expanded' : ''}" data-preread-id="${esc(s._id)}">`;
      h += `<span class="proc-row-char">${esc(charName)}</span>`;
      h += `<span class="proc-preread-char-right">${loreBadge}<span class="proc-phase-toggle">${isBlockExpanded ? '&#9650;' : '&#9660;'}</span></span>`;
      h += `</div>`;

      if (isBlockExpanded) {
        h += `<div class="proc-preread-body">`;

        // Court section
        const courtVals = COURT_KEYS.filter(k => r[k]?.trim?.());
        if (courtVals.length) {
          h += `<div class="dt-resp-section">`;
          h += `<div class="dt-resp-section-title">Court</div>`;
          for (const k of courtVals) {
            let val = r[k];
            if (k === 'rp_shoutout') {
              try {
                val = JSON.parse(val).filter(Boolean).map(id => {
                  const ch = characters.find(c => String(c._id) === String(id));
                  return ch ? (ch.moniker || ch.name) : id;
                }).join(', ');
              } catch { /* ignore */ }
            }
            if (!val?.trim?.()) continue;
            h += `<div class="dt-resp-row">`;
            h += `<span class="dt-resp-label">${esc(COURT_LABELS[k] || k)}</span>`;
            h += `<span class="dt-resp-val">${esc(val)}</span>`;
            h += `</div>`;
          }
          h += `</div>`;
        }

        // Vamping
        if (r.vamping?.trim?.()) {
          h += `<div class="dt-resp-section">`;
          h += `<div class="dt-resp-section-title">Vamping</div>`;
          h += `<div class="dt-resp-row"><span class="dt-resp-val">${esc(r.vamping)}</span></div>`;
          h += `</div>`;
        }

        // Lore request
        if (hasLore) {
          h += `<div class="dt-resp-section">`;
          h += `<div class="dt-resp-section-title">Lore Request</div>`;
          h += `<div class="dt-resp-row"><span class="dt-resp-val">${esc(r.lore_request)}</span></div>`;
          h += `<button class="dt-btn dt-btn-sm proc-lore-btn${loreResponded ? ' active' : ''}" data-sub-id="${esc(s._id)}">${loreResponded ? '\u2713 Responded' : 'Mark responded'}</button>`;
          h += `</div>`;
        }

        h += `</div>`; // proc-preread-body
      }
    }
  }

  h += `</div>`; // proc-phase-section
  return h;
}

// ── Sign-off Step (Epic 4 — Stories 4.1 + 4.2 + 4.3) ────────────────────────

function _signOffStatus(s) {
  const reasons = [];
  const approval = s.approval_status || 'pending';
  if (approval !== 'approved' && approval !== 'modified') {
    reasons.push('Submission not yet approved or modified');
  }
  const NARR_KEYS = ['letter_from_home', 'touchstone_vignette', 'territory_report', 'intelligence_dossier'];
  const NARR_LABELS = { letter_from_home: 'Letter from Home', touchstone_vignette: 'Touchstone Vignette', territory_report: 'Territory Report', intelligence_dossier: 'Intelligence Dossier' };
  const narr = s.st_review?.narrative || {};
  const unready = NARR_KEYS.filter(k => narr[k]?.status !== 'ready');
  if (unready.length) reasons.push(`Narrative not ready: ${unready.map(k => NARR_LABELS[k]).join(', ')}`);
  const flaggedXp = Object.values(s.st_review?.xp_approvals || {}).filter(a => a?.status === 'flagged').length;
  if (flaggedXp) reasons.push(`${flaggedXp} flagged XP row${flaggedXp !== 1 ? 's' : ''} outstanding`);
  return { ready: reasons.length === 0, reasons };
}

function renderSignOffStep() {
  if (!submissions.length) return '';

  const isExpanded = expandedPhases.has('sign_off');
  const doneCount = submissions.filter(s => ['ready', 'published'].includes(s.st_review?.outcome_visibility)).length;
  const stepBadge = doneCount === submissions.length && doneCount > 0
    ? ' <span class="dt-narr-badge">\u2713 All staged</span>'
    : doneCount > 0 ? ` <span class="proc-narr-progress">${doneCount}/${submissions.length}</span>` : '';

  let h = '<div class="proc-phase-section">';
  h += `<div class="proc-phase-header" data-toggle-phase="sign_off">`;
  h += `<span class="proc-phase-label">Step 11 \u2014 Sign-off${stepBadge}</span>`;
  h += `<span class="proc-phase-count">${submissions.length} submission${submissions.length !== 1 ? 's' : ''}</span>`;
  h += `<span class="proc-phase-toggle">${isExpanded ? '&#9650; Hide' : '&#9660; Show'}</span>`;
  h += `</div>`;

  if (isExpanded) {
    for (const s of submissions) {
      const char = findCharacter(s.character_name, s.player_name);
      const charName = char ? (char.moniker || char.name) : (s.character_name || 'Unknown');
      const isBlockExpanded = signOffExpanded.has(s._id);
      const approval = s.approval_status || 'pending';
      const visibility = s.st_review?.outcome_visibility || '';
      const isReady     = visibility === 'ready';
      const isPublished = visibility === 'published';

      let charBadge = '';
      if (isPublished)          charBadge = ' <span class="dt-pub-badge">\u2713 Published</span>';
      else if (isReady)         charBadge = ' <span class="dt-ready-badge">\u23F3 Ready</span>';
      else if (approval === 'approved')  charBadge = ' <span class="dt-narr-badge">\u2713 Approved</span>';
      else if (approval === 'modified')  charBadge = ' <span class="proc-narr-progress">Modified</span>';
      else if (approval === 'rejected')  charBadge = ' <span class="proc-signoff-rejected">Rejected</span>';

      h += `<div class="proc-preread-char${isBlockExpanded ? ' expanded' : ''}" data-signoff-id="${esc(s._id)}">`;
      h += `<span class="proc-row-char">${esc(charName)}${charBadge}</span>`;
      h += `<span class="proc-phase-toggle">${isBlockExpanded ? '&#9650;' : '&#9660;'}</span>`;
      h += `</div>`;

      if (isBlockExpanded) {
        h += `<div class="proc-preread-body">`;

        // Approval buttons + resolution note (Story 4.1)
        h += `<div class="proc-signoff-approval">`;
        h += `<div class="proc-detail-label">Outcome</div>`;
        h += `<div class="proc-signoff-btns">`;
        for (const st of ['pending', 'approved', 'modified', 'rejected']) {
          h += `<button class="dt-btn dt-approval-btn dt-appr-${st}${approval === st ? ' active' : ''}" data-sub-id="${esc(s._id)}" data-status="${st}">${st}</button>`;
        }
        h += `</div>`;
        h += `<textarea class="dt-notes-input dt-resolution-input proc-signoff-note" data-sub-id="${esc(s._id)}" rows="2" placeholder="Resolution note (visible to player when released)">${esc(s.resolution_note || '')}</textarea>`;
        h += `</div>`;

        // Mark ready / ready state / published state (Story 4.2)
        h += `<div class="proc-signoff-ready-row">`;
        if (isPublished) {
          h += `<span class="dt-pub-badge">\u2713 Published \u2014 released to player</span>`;
        } else if (isReady) {
          h += `<span class="dt-ready-badge">\u23F3 Staged for release</span>`;
          h += `<button class="dt-btn dt-btn-sm dt-btn-dim proc-signoff-revert" data-sub-id="${esc(s._id)}">Revert to draft</button>`;
        } else {
          const { ready, reasons } = _signOffStatus(s);
          if (ready) {
            h += `<button class="dt-btn dt-btn-gold proc-signoff-ready-btn" data-sub-id="${esc(s._id)}">Mark ready for release</button>`;
          } else {
            h += `<button class="dt-btn proc-signoff-ready-btn" disabled title="${esc(reasons.join('\n'))}">Mark ready for release</button>`;
            h += `<ul class="proc-signoff-blockers">`;
            for (const r of reasons) h += `<li>${esc(r)}</li>`;
            h += `</ul>`;
          }
        }
        h += `</div>`;

        h += `</div>`; // proc-preread-body
      }
    }
  }

  h += `</div>`; // proc-phase-section
  return h;
}

// ── XP Review Step (Epic 3 — Stories 3.1 + 3.2 + 3.3) ───────────────────────

function renderXpReviewStep() {
  // Only include submissions that have xp_spend rows
  const xpSubs = submissions.filter(s => {
    try {
      const rows = JSON.parse(s.responses?.xp_spend || '[]');
      return rows.some(r => r.category || r.item);
    } catch { return false; }
  });

  if (!xpSubs.length) return '';

  const isExpanded = expandedPhases.has('xp_review');

  // Summary count across all subs
  let totalRows = 0, totalApproved = 0;
  for (const s of xpSubs) {
    try {
      const rows = JSON.parse(s.responses?.xp_spend || '[]').filter(r => r.category || r.item);
      totalRows += rows.length;
      totalApproved += rows.filter((_, i) => s.st_review?.xp_approvals?.[i]?.status === 'approved').length;
    } catch { /* ignore */ }
  }
  const allApproved = totalRows > 0 && totalApproved === totalRows;
  const stepBadge = allApproved
    ? ' <span class="dt-narr-badge">\u2713 All approved</span>'
    : totalApproved > 0 ? ` <span class="proc-narr-progress">${totalApproved}/${totalRows}</span>` : '';

  let h = '<div class="proc-phase-section">';
  h += `<div class="proc-phase-header" data-toggle-phase="xp_review">`;
  h += `<span class="proc-phase-label">Step 10 \u2014 XP Review${stepBadge}</span>`;
  h += `<span class="proc-phase-count">${xpSubs.length} submission${xpSubs.length !== 1 ? 's' : ''}</span>`;
  h += `<span class="proc-phase-toggle">${isExpanded ? '&#9650; Hide' : '&#9660; Show'}</span>`;
  h += `</div>`;

  if (isExpanded) {
    for (const s of xpSubs) {
      let rows = [];
      try { rows = JSON.parse(s.responses?.xp_spend || '[]').filter(r => r.category || r.item); } catch { /* ignore */ }
      if (!rows.length) continue;

      const char = findCharacter(s.character_name, s.player_name);
      const charName = char ? (char.moniker || char.name) : (s.character_name || 'Unknown');
      const isBlockExpanded = xpReviewExpanded.has(s._id);
      const approvals = s.st_review?.xp_approvals || {};
      const doneHere = rows.filter((_, i) => approvals[i]?.status === 'approved').length;
      const allDoneHere = doneHere === rows.length;
      const charBadge = allDoneHere
        ? ' <span class="dt-narr-badge">\u2713 Done</span>'
        : doneHere > 0 ? ` <span class="proc-narr-progress">${doneHere}/${rows.length}</span>` : '';

      // Count how many project slots are xp_spend actions (sets the "action slots" budget)
      let xpActionSlots = 0;
      for (let n = 1; n <= 4; n++) {
        if (s.responses?.[`project_${n}_action`] === 'xp_spend') xpActionSlots++;
      }

      h += `<div class="proc-preread-char${isBlockExpanded ? ' expanded' : ''}" data-xp-review-id="${esc(s._id)}">`;
      h += `<span class="proc-row-char">${esc(charName)}${charBadge}</span>`;
      if (xpActionSlots) h += `<span class="proc-phase-count">${xpActionSlots} action slot${xpActionSlots !== 1 ? 's' : ''}</span>`;
      h += `<span class="proc-phase-toggle">${isBlockExpanded ? '&#9650;' : '&#9660;'}</span>`;
      h += `</div>`;

      if (isBlockExpanded) {
        h += `<div class="proc-preread-body">`;
        h += `<table class="proc-xp-table">`;
        h += `<thead><tr>`;
        h += `<th>Category</th><th>Purchase</th><th>Cost</th><th>Status</th>`;
        h += `</tr></thead><tbody>`;

        for (let i = 0; i < rows.length; i++) {
          const row = rows[i];
          const appr = approvals[i] || {};
          const status = appr.status || '';
          const isApproved = status === 'approved';
          const isFlagged  = status === 'flagged';

          h += `<tr class="proc-xp-row${isFlagged ? ' flagged' : ''}">`;
          h += `<td class="proc-xp-cat">${esc(row.category || '—')}</td>`;
          h += `<td class="proc-xp-item">${esc(row.item || '—')}</td>`;
          h += `<td class="proc-xp-cost">${row.cost ? esc(String(row.cost)) + ' XP' : '—'}</td>`;
          h += `<td class="proc-xp-status">`;
          h += `<button class="dt-btn dt-btn-sm proc-xp-approve-btn${isApproved ? ' active' : ''}" data-sub-id="${esc(s._id)}" data-row-idx="${i}" data-status="approved">\u2713 Approve</button>`;
          h += `<button class="dt-btn dt-btn-sm proc-xp-flag-btn${isFlagged ? ' active' : ''}" data-sub-id="${esc(s._id)}" data-row-idx="${i}" data-status="flagged">\u26A0 Flag</button>`;
          h += `</td>`;
          h += `</tr>`;

          if (isFlagged) {
            h += `<tr class="proc-xp-note-row">`;
            h += `<td colspan="4">`;
            h += `<input class="proc-xp-note-input" type="text" data-sub-id="${esc(s._id)}" data-row-idx="${i}" placeholder="Flag reason..." value="${esc(appr.note || '')}">`;
            h += `</td></tr>`;
          }
        }

        h += `</tbody></table>`;
        h += `</div>`; // proc-preread-body
      }
    }
  }

  h += `</div>`; // proc-phase-section
  return h;
}

// ── Narrative Step (Epic 2 — Stories 2.1 + 2.2 + 2.3) ───────────────────────

function renderNarrativeStep() {
  if (!submissions.length) return '';

  const NARR_KEYS = ['letter_from_home', 'touchstone_vignette', 'territory_report', 'intelligence_dossier'];
  const isExpanded = expandedPhases.has('narrative');
  const queue = buildProcessingQueue(submissions);

  let h = '<div class="proc-phase-section">';
  h += `<div class="proc-phase-header" data-toggle-phase="narrative">`;
  h += `<span class="proc-phase-label">Step 9 \u2014 Narrative Output</span>`;
  h += `<span class="proc-phase-count">${submissions.length} submission${submissions.length !== 1 ? 's' : ''}</span>`;
  h += `<span class="proc-phase-toggle">${isExpanded ? '&#9650; Hide' : '&#9660; Show'}</span>`;
  h += `</div>`;

  if (isExpanded) {
    for (const s of submissions) {
      const char = findCharacter(s.character_name, s.player_name);
      const charName = char ? (char.moniker || char.name) : (s.character_name || 'Unknown');
      const isBlockExpanded = narrativeExpanded.has(s._id);
      const narr = s.st_review?.narrative || {};
      const doneCount = NARR_KEYS.filter(k => narr[k]?.status === 'ready').length;
      const allDone = doneCount === NARR_KEYS.length;
      const statusBadge = allDone
        ? ' <span class="dt-narr-badge">\u2713 All ready</span>'
        : doneCount > 0 ? ` <span class="proc-narr-progress">${doneCount}/4</span>` : '';

      h += `<div class="proc-preread-char${isBlockExpanded ? ' expanded' : ''}" data-narrative-id="${esc(s._id)}">`;
      h += `<span class="proc-row-char">${esc(charName)}${statusBadge}</span>`;
      h += `<span class="proc-phase-toggle">${isBlockExpanded ? '&#9650;' : '&#9660;'}</span>`;
      h += `</div>`;

      if (isBlockExpanded) {
        h += `<div class="proc-preread-body">`;

        // Story 2.2 — Action responses as read-only reference
        const actionEntries = queue.filter(e => e.subId === s._id && e.source === 'project');
        const respondedEntries = actionEntries.filter(e => getEntryReview(e)?.st_response?.trim?.());
        if (respondedEntries.length) {
          h += `<details class="dt-style-guide proc-narr-action-ref">`;
          h += `<summary>Action responses (${respondedEntries.length})</summary>`;
          for (const entry of respondedEntries) {
            const rev = getEntryReview(entry);
            h += `<div class="proc-narr-action-ref-row">`;
            h += `<div class="proc-narr-action-ref-title">${esc(entry.label)}`;
            if (entry.description) h += ` \u2014 <span class="proc-narr-action-ref-desc">${esc(entry.description.slice(0, 100))}</span>`;
            h += `</div>`;
            h += `<div class="proc-narr-action-ref-text">${esc(rev.st_response)}</div>`;
            h += `</div>`;
          }
          h += `</details>`;
        }

        // Story 2.1 — Narrative panel (existing renderNarrativePanel, reused)
        h += renderNarrativePanel(s);

        h += `</div>`; // proc-preread-body
      }
    }
  }

  h += `</div>`; // proc-phase-section
  return h;
}

/** Compute the display state of a submission for the character strip. */
function _subChipState(sub, queue) {
  const vis = sub.st_review?.outcome_visibility || '';
  if (vis === 'published') return 'published';
  if (vis === 'ready')     return 'ready';

  const entries = queue.filter(e => e.subId === sub._id);
  const doneCt  = entries.filter(e => DONE_STATUSES.has(getEntryReview(e)?.pool_status)).length;

  const NARR_KEYS = ['letter_from_home', 'touchstone_vignette', 'territory_report', 'intelligence_dossier'];
  const narr = sub.st_review?.narrative || {};
  const narrDone = NARR_KEYS.filter(k => narr[k]?.status === 'ready').length;

  const approval = sub.approval_status || 'pending';
  const isApproved = approval === 'approved' || approval === 'modified';

  if (doneCt === entries.length && narrDone === 4 && isApproved) return 'complete';
  if (doneCt > 0 || narrDone > 0) return 'partial';
  return 'none';
}

/** Render the compact character status strip above the processing queue. */
function renderCharacterStrip(queue) {
  if (!submissions.length) return '';

  const NARR_KEYS = ['letter_from_home', 'touchstone_vignette', 'territory_report', 'intelligence_dossier'];
  const sorted = [...submissions].sort((a, b) => {
    const ca = findCharacter(a.character_name, a.player_name);
    const cb = findCharacter(b.character_name, b.player_name);
    const na = ca ? sortName(ca) : (a.character_name || '');
    const nb = cb ? sortName(cb) : (b.character_name || '');
    return na.localeCompare(nb);
  });

  let h = '<div class="proc-char-strip">';
  h += '<span class="proc-char-strip-label">Jump to</span>';

  for (const s of sorted) {
    const char = findCharacter(s.character_name, s.player_name);
    const name = char ? (char.moniker || char.name) : (s.character_name || '?');
    const state = _subChipState(s, queue);

    const entries = queue.filter(e => e.subId === s._id);
    const doneCt  = entries.filter(e => DONE_STATUSES.has(getEntryReview(e)?.pool_status)).length;
    const total   = entries.length;
    const narr    = s.st_review?.narrative || {};
    const narrDone = NARR_KEYS.filter(k => narr[k]?.status === 'ready').length;

    // Progress label: action fraction + narrative fraction, omit when fully done/not started
    let prog = '';
    if (state === 'partial') {
      const parts = [];
      if (total > 0) parts.push(`${doneCt}/${total}`);
      if (narrDone > 0 && narrDone < 4) parts.push(`\u270D${narrDone}/4`);
      prog = parts.join(' ');
    } else if (state === 'complete') {
      prog = '\u2713';
    } else if (state === 'ready' || state === 'published') {
      prog = state === 'published' ? 'Published' : 'Ready';
    }

    h += `<button class="proc-char-chip state-${state}" data-sub-id="${esc(s._id)}" title="${esc(name)}">`;
    h += `<span class="proc-char-chip-name">${esc(name)}</span>`;
    if (prog) h += `<span class="proc-char-chip-prog">${esc(prog)}</span>`;
    h += `</button>`;
  }

  h += '</div>';
  return h;
}

/** Render the phase-ordered processing queue into the given container. */
/**
 * Look up a queue entry by key using the map built at the start of the current
 * renderProcessingMode call. O(1); avoids rebuilding the queue on every event.
 */
function _getQueueEntry(key) { return _procQueueMap?.get(key) ?? null; }

/**
 * Wire ± ticker buttons (dec/inc) inside a processing-mode container.
 * All three modifier tickers share this logic; they differ only in selectors,
 * clamping, an optional secondary display, and which function runs after update.
 *
 * opts:
 *   decCls      — CSS class of the decrement button (e.g. 'proc-equip-mod-dec')
 *   incCls      — CSS class of the increment button
 *   panelCls    — CSS class of the panel that contains the input + display
 *   inputCls    — CSS class of the hidden value input inside the panel
 *   dispCls     — CSS class of the display span inside the panel
 *   clamp       — { min, max } to clamp the value, or null for free-range
 *   totalCls    — optional extra display span class (e.g. proc-proj-succ-total-val); null to skip
 *   afterUpdate — optional fn(container, key) called after the display is updated
 *   saveField   — key written to saveEntryReview (e.g. 'pool_mod_equipment')
 */
function _wireTickerHandler(container, { decCls, incCls, panelCls, inputCls, dispCls, clamp = null, totalCls = null, afterUpdate = null, saveField }) {
  container.querySelectorAll(`.${decCls}, .${incCls}`).forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const panel = container.querySelector(`.${panelCls}[data-proc-key="${key}"]`);
      if (!panel) return;
      const valInp = panel.querySelector(`.${inputCls}`);
      const disp   = panel.querySelector(`.${dispCls}[data-proc-key="${key}"]`);
      let val = parseInt(valInp?.value || '0', 10);
      if (btn.classList.contains(decCls)) { if (!clamp || val > clamp.min) val--; }
      else                                { if (!clamp || val < clamp.max) val++; }
      if (valInp) valInp.value = val;
      const str = val === 0 ? '\u00B10' : val > 0 ? `+${val}` : String(val);
      if (disp) disp.textContent = str;
      if (totalCls) {
        const total = panel.querySelector(`.${totalCls}[data-proc-key="${key}"]`);
        if (total) total.textContent = str;
      }
      afterUpdate?.(container, key);
      const entry = _getQueueEntry(key);
      if (entry) await saveEntryReview(entry, { [saveField]: val });
    });
  });
}

function renderProcessingMode(container) {
  renderTerritoriesAtAGlance();

  if (!submissions.length) {
    container.innerHTML = '<p class="placeholder">No submissions in this cycle.</p>';
    return;
  }

  const queue = buildProcessingQueue(submissions);
  if (!queue.length) {
    container.innerHTML = '<p class="placeholder">No actions found in this cycle.</p>';
    return;
  }
  _procQueueMap = new Map(queue.map(e => [e.key, e]));

  // Group by phase
  const byPhase = new Map();
  for (const entry of queue) {
    if (!byPhase.has(entry.phase)) byPhase.set(entry.phase, []);
    byPhase.get(entry.phase).push(entry);
  }

  let h = '<div class="proc-queue">';

  // Controls bar — queue-level toggles
  h += `<div class="proc-queue-controls">`;
  h += `<button class="proc-hide-done-btn${procHideDone ? ' active' : ''}" id="proc-hide-done-toggle">${procHideDone ? 'Show all' : 'Hide done'}</button>`;
  h += `</div>`;

  // Character status strip — at-a-glance state + jump-to navigation
  h += renderCharacterStrip(queue);

  // Ambience Dashboard — always shown at top of Processing Mode
  h += renderAmbienceDashboard();

  // Pre-read — Step 0, player questionnaire responses
  h += renderPreReadSection();

  for (const [phaseKey, entries] of byPhase) {
    const label = PHASE_LABELS[phaseKey] || phaseKey;
    const isCollapsed = !expandedPhases.has(phaseKey);

    // Completion count for this phase
    const doneCount = entries.filter(e => DONE_STATUSES.has(getEntryReview(e)?.pool_status)).length;
    const allPhaseDone = entries.length > 0 && doneCount === entries.length;
    const phaseProgressBadge = allPhaseDone
      ? ' <span class="dt-narr-badge">\u2713</span>'
      : doneCount > 0 ? ` <span class="proc-narr-progress">${doneCount}/${entries.length}</span>` : '';

    // When hiding done, skip phases where every action is resolved
    const visibleEntries = procHideDone
      ? entries.filter(e => !DONE_STATUSES.has(getEntryReview(e)?.pool_status))
      : entries;
    if (procHideDone && visibleEntries.length === 0) continue;

    h += `<div class="proc-phase-section">`;
    h += `<div class="proc-phase-header" data-toggle-phase="${esc(phaseKey)}">`;
    h += `<span class="proc-phase-label">${esc(label)}${phaseProgressBadge}</span>`;
    h += `<span class="proc-phase-count">${entries.length} action${entries.length !== 1 ? 's' : ''}</span>`;
    h += `<span class="proc-phase-toggle">${isCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
    h += `</div>`;

    if (!isCollapsed) {
      for (const entry of visibleEntries) {
        const isExpanded = procExpandedKeys.has(entry.key);
        const review = getEntryReview(entry);
        const status = review?.pool_status || 'pending';
        const shortDesc = entry.description.length > 80 ? entry.description.slice(0, 77) + '...' : entry.description;
        const lastAuthor = review?.response_author || '';

        h += `<div class="proc-action-row${isExpanded ? ' expanded' : ''}" data-proc-key="${esc(entry.key)}">`;
        h += `<span class="proc-row-char">${esc(entry.charName)}</span>`;
        h += `<span class="proc-row-label">${esc(entry.label)}</span>`;
        h += `<span class="proc-row-desc" title="${esc(entry.description)}">${esc(shortDesc || '—')}</span>`;
        h += `<span class="proc-row-status ${status}">${POOL_STATUS_LABELS[status] || status}</span>`;
        h += lastAuthor ? `<span class="proc-row-author">${esc(lastAuthor)}</span>` : '<span></span>';
        h += '</div>';

        if (isExpanded) {
          h += renderActionPanel(entry, review);
        }
      }

      // Investigations tracker lives inside the Investigative phase
      if (phaseKey === 'investigate') {
        h += '<div id="dt-investigations"></div>';
      }
    }

    h += '</div>'; // proc-phase-section
  }

  // If no investigate actions were submitted, still show the investigations tracker
  if (!byPhase.has('investigate')) {
    h += `<div class="proc-phase-section">`;
    h += `<div class="proc-phase-header" data-toggle-phase="investigate">`;
    h += `<span class="proc-phase-label">${PHASE_LABELS.investigate}</span>`;
    h += `<span class="proc-phase-count">0 actions</span>`;
    h += `<span class="proc-phase-toggle">${expandedPhases.has('investigate') ? '&#9650; Hide' : '&#9660; Show'}</span>`;
    h += `</div>`;
    if (expandedPhases.has('investigate')) {
      h += '<div id="dt-investigations"></div>';
    }
    h += '</div>';
  }

  // XP Review — Step 10, after action phases, before narrative
  h += renderXpReviewStep();

  // Narrative Output — Step 9
  h += renderNarrativeStep();

  // Sign-off — Step 11, final step before push
  h += renderSignOffStep();

  h += '</div>'; // proc-queue
  container.innerHTML = h;

  // Render investigations into its placeholder inside the investigate phase
  renderInvestigations();

  // Wire hide-done toggle
  document.getElementById('proc-hide-done-toggle')?.addEventListener('click', () => {
    procHideDone = !procHideDone;
    renderProcessingMode(container);
  });

  // Wire character strip chips — expand first pending action and scroll to it
  container.querySelectorAll('.proc-char-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const subId = chip.dataset.subId;
      const q = buildProcessingQueue(submissions);
      const firstPending = q.find(e => e.subId === subId && !DONE_STATUSES.has(getEntryReview(e)?.pool_status));
      const jumpEntry = firstPending || q.find(e => e.subId === subId);
      if (!jumpEntry) return;
      procExpandedKeys.add(jumpEntry.key);
      expandedPhases.add(jumpEntry.phase);
      renderProcessingMode(container);
      requestAnimationFrame(() => {
        container.querySelector(`.proc-action-row[data-proc-key="${jumpEntry.key}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  });

  // Wire action type recategorisation selects
  container.querySelectorAll('.proc-recat-select').forEach(sel => {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      // Skip selects that carry proc-recat-select only for styling — they have their own handlers
      if (sel.classList.contains('proc-prot-merit-sel') ||
          sel.classList.contains('proc-merit-link-sel') ||
          sel.classList.contains('proc-inv-char-sel') ||
          sel.classList.contains('proc-attack-char-sel') ||
          sel.classList.contains('proc-attack-merit-sel') ||
          sel.classList.contains('proc-inv-secrecy-sel')) return;
      const key = sel.dataset.procKey;
      const newType = sel.value;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      // Clear override if ST selects the original player-submitted type
      const patch = { action_type_override: newType === entry.originalActionType ? null : newType };
      // Maintenance auto-resolves as no-roll
      if (newType === 'maintenance') patch.pool_status = 'maintenance';
      await saveEntryReview(entry, patch);
      renderProcessingMode(container);
    });
  });

  // Wire row clicks — toggle individual rows independently
  container.querySelectorAll('.proc-action-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.procKey;
      if (procExpandedKeys.has(key)) { procExpandedKeys.delete(key); } else { procExpandedKeys.add(key); }
      renderProcessingMode(container);
    });
  });

  // Wire territory pill buttons — save override and refresh matrix only
  container.querySelectorAll('.proc-terr-pill').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId   = btn.dataset.subId;
      const context = btn.dataset.terrContext; // numeric string for projects, 'feeding', 'allies_N'
      const terrId  = btn.dataset.terrId; // '' = clear/deselect
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      if (!sub.st_review) sub.st_review = {};
      if (!sub.st_review.territory_overrides) sub.st_review.territory_overrides = {};

      if (context === 'feeding') {
        // Multi-select: toggle id in/out of array; em-dash clears all
        let arr = Array.isArray(sub.st_review.territory_overrides.feeding)
          ? [...sub.st_review.territory_overrides.feeding] : [];
        if (!terrId) {
          arr = []; // clear all
        } else {
          const idx = arr.indexOf(terrId);
          if (idx >= 0) arr.splice(idx, 1); else arr.push(terrId);
        }
        if (arr.length) {
          sub.st_review.territory_overrides.feeding = arr;
          await updateSubmission(subId, { 'st_review.territory_overrides.feeding': arr });
        } else {
          delete sub.st_review.territory_overrides.feeding;
          await updateSubmission(subId, { 'st_review.territory_overrides.feeding': null });
        }
        // Update pill active states in-place
        const newSet = new Set(sub.st_review.territory_overrides?.feeding || []);
        const pillRow = container.querySelector(`.proc-terr-pill-row[data-sub-id="${subId}"][data-terr-context="feeding"]`);
        if (pillRow) {
          pillRow.querySelectorAll('.proc-terr-pill').forEach(p => {
            const pid = p.dataset.terrId;
            p.classList.toggle('active', pid === '' ? newSet.size === 0 : newSet.has(pid));
          });
        }
      } else {
        // Single-select: existing behaviour
        if (terrId) {
          sub.st_review.territory_overrides[context] = terrId;
          await updateSubmission(subId, { [`st_review.territory_overrides.${context}`]: terrId });
        } else {
          delete sub.st_review.territory_overrides[context];
          await updateSubmission(subId, { [`st_review.territory_overrides.${context}`]: null });
        }
        // Update pill active states in-place
        const pillRow = container.querySelector(`.proc-terr-pill-row[data-sub-id="${subId}"][data-terr-context="${context}"]`);
        if (pillRow) {
          pillRow.querySelectorAll('.proc-terr-pill').forEach(p => {
            p.classList.toggle('active', p.dataset.terrId === terrId);
          });
        }
      }

      // Refresh the territories matrix
      renderTerritoriesAtAGlance();
    });
  });

  // Wire validation status buttons (stop propagation so row click doesn't fire)
  container.querySelectorAll('.proc-val-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key    = btn.dataset.procKey;
      const status = btn.dataset.status;
      const entry  = _getQueueEntry(key);
      if (!entry) return;
      // For feeding + project entries: read builder state and save pool_validated before status
      if (entry.source === 'feeding' || entry.source === 'project') {
        const builder = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
        if (builder) {
          const expr = _readBuilderExpr(builder);
          if (expr) {
            if (entry.source === 'project') {
              // Use sidebar checkbox states for project nine_again/rote/eight_again
              const rightPanel = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
              const roteVal      = rightPanel?.querySelector('.proc-pool-rote')?.checked  || false;
              const nineAgainVal = rightPanel?.querySelector('.proc-proj-9a')?.checked    || false;
              const eightAgainVal = rightPanel?.querySelector('.proc-proj-8a')?.checked   || false;
              await saveEntryReview(entry, { pool_validated: expr, nine_again: nineAgainVal, rote: roteVal, eight_again: eightAgainVal });
            } else {
              // Feeding: read nine_again and eight_again from right panel checkboxes
              const rightPanel = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
              const nineAgainVal  = rightPanel?.querySelector('.proc-proj-9a')?.checked  || false;
              const eightAgainVal = rightPanel?.querySelector('.proc-proj-8a')?.checked  || false;
              await saveEntryReview(entry, { pool_validated: expr, nine_again: nineAgainVal, eight_again: eightAgainVal });
            }
          }
        }
      }
      await saveEntryReview(entry, { pool_status: status });
      renderProcessingMode(container);
    });
  });

  // Wire clear pool button — clears pool_validated so ST can rebuild from scratch
  container.querySelectorAll('.proc-pool-clear-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { pool_validated: '' });
      renderProcessingMode(container);
    });
  });

  // ── Feeding description card — Edit / Save / Cancel ──
  container.querySelectorAll('.proc-feed-desc-ta, .proc-feed-name-input, .proc-feed-pool-input, .proc-feed-bonuses-input, .proc-proj-name-input, .proc-proj-title-input, .proc-proj-outcome-input, .proc-proj-merits-input, .proc-sorc-targets-input, .proc-sorc-notes-input, .proc-sorc-tradition-input, .proc-sorc-rite-input').forEach(el => {
    el.addEventListener('click',  e => e.stopPropagation());
    el.addEventListener('mousedown', e => e.stopPropagation());
  });
  container.querySelectorAll('.proc-feed-desc-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = btn.closest('.proc-feed-desc-card');
      card.querySelector('.proc-feed-desc-view').style.display = 'none';
      card.querySelector('.proc-feed-desc-edit').style.display = '';
      btn.style.display = 'none';
    });
  });
  container.querySelectorAll('.proc-feed-desc-cancel-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const card = btn.closest('.proc-feed-desc-card');
      card.querySelector('.proc-feed-desc-view').style.display = '';
      card.querySelector('.proc-feed-desc-edit').style.display = 'none';
      card.querySelector('.proc-feed-desc-edit-btn').style.display = '';
    });
  });
  container.querySelectorAll('.proc-feed-desc-save-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const card       = btn.closest('.proc-feed-desc-card');
      const name       = card.querySelector('.proc-feed-name-input').value.trim();
      const desc       = card.querySelector('.proc-feed-desc-ta').value.trim();
      const bloodType  = card.querySelector('.proc-feed-blood-sel').value;
      const playerPool = card.querySelector('.proc-feed-pool-input').value.trim();
      const bonuses    = card.querySelector('.proc-feed-bonuses-input').value.trim();
      await saveEntryReview(entry, { name, description: desc, blood_type: bloodType, pool_player: playerPool, bonuses });
      renderProcessingMode(container);
    });
  });
  container.querySelectorAll('.proc-proj-desc-save-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const card       = btn.closest('.proc-feed-desc-card');
      const title      = card.querySelector('.proc-proj-title-input').value.trim();
      const outcome    = card.querySelector('.proc-proj-outcome-input').value.trim();
      const desc       = card.querySelector('.proc-feed-desc-ta').value.trim();
      const playerPool = card.querySelector('.proc-feed-pool-input').value.trim();
      const merits     = card.querySelector('.proc-proj-merits-input').value.trim();
      await saveEntryReview(entry, { title, desired_outcome: outcome, description: desc, pool_player: playerPool, merits_bonuses: merits });
      renderProcessingMode(container);
    });
  });

  // Wire sorcery details card save
  container.querySelectorAll('.proc-sorc-desc-save-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const card       = btn.closest('.proc-feed-desc-card');
      const tradition  = card.querySelector('.proc-sorc-tradition-input').value.trim();
      const riteName   = card.querySelector('.proc-sorc-rite-input').value.trim();
      const targets    = card.querySelector('.proc-sorc-targets-input').value.trim();
      const notes      = card.querySelector('.proc-sorc-notes-input').value.trim();
      await saveEntryReview(entry, {
        sorc_tradition: tradition || null,
        sorc_rite_name: riteName  || null,
        sorc_targets:   targets   || null,
        sorc_notes:     notes     || null,
      });
      renderProcessingMode(container);
    });
  });

  // Wire merit details card save
  container.querySelectorAll('.proc-merit-desc-save-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const card    = btn.closest('.proc-feed-desc-card');
      const outcome = card.querySelector('.proc-merit-outcome-input').value.trim();
      const desc    = card.querySelector('.proc-merit-desc-ta').value.trim();
      await saveEntryReview(entry, { desired_outcome: outcome, description: desc });
      renderProcessingMode(container);
    });
  });

  // Wire pool_validated free-text input (non-feeding fallback — save on blur)
  container.querySelectorAll('.proc-pool-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('blur', async e => {
      const key   = inp.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { pool_validated: inp.value.trim() });
    });
  });

  // Wire pool builder dropdowns → live total update
  container.querySelectorAll('.proc-pool-attr, .proc-pool-skill, .proc-pool-disc').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', e => {
      e.stopPropagation();
      const procKey = sel.dataset.procKey;
      if (sel.classList.contains('proc-pool-skill')) {
        // Set nineAgain flag and render spec toggles before computing pool total
        _updateFeedBuilderMeta(container, procKey);
        // Reset spec selection when skill changes — specs from old skill no longer apply
        const skillChgEntry = _getQueueEntry(procKey);
        if (skillChgEntry && (skillChgEntry.source === 'feeding' || skillChgEntry.source === 'project')) {
          saveEntryReview(skillChgEntry, { active_feed_specs: [], pool_mod_spec: 0 });
        }
      }
      _refreshPoolBuilder(container, procKey);
    });
  });

  // Wire modifier decrement button
  container.querySelectorAll('.proc-pool-mod-dec').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key     = btn.dataset.procKey;
      const builder = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
      if (!builder) return;
      const modInput = builder.querySelector('.proc-pool-mod-val');
      const modDisp  = builder.querySelector(`.proc-pool-mod-disp[data-proc-key="${key}"]`);
      let val = parseInt(modInput.value || '0', 10);
      if (val > -5) val--;
      modInput.value = val;
      if (modDisp) modDisp.textContent = val === 0 ? '\u00B10' : val > 0 ? `+${val}` : String(val);
      _updatePoolTotal(container, key);
    });
  });

  // Wire modifier increment button
  container.querySelectorAll('.proc-pool-mod-inc').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const key     = btn.dataset.procKey;
      const builder = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
      if (!builder) return;
      const modInput = builder.querySelector('.proc-pool-mod-val');
      const modDisp  = builder.querySelector(`.proc-pool-mod-disp[data-proc-key="${key}"]`);
      let val = parseInt(modInput.value || '0', 10);
      if (val < 5) val++;
      modInput.value = val;
      if (modDisp) modDisp.textContent = val === 0 ? '\u00B10' : val > 0 ? `+${val}` : String(val);
      _updatePoolTotal(container, key);
    });
  });

  // Wire rote checkbox → save immediately to st_review.feeding_rote
  container.querySelectorAll('.proc-pool-rote').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = cb.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      if (entry.source === 'project') {
        await saveEntryReview(entry, { rote: cb.checked });
        renderProcessingMode(container);
        return;
      }
      const sub = submissions.find(s => s._id === entry.subId);
      if (!sub) return;
      const stReview = { ...(sub.st_review || {}), feeding_rote: cb.checked };
      await updateSubmission(entry.subId, { st_review: stReview });
      sub.st_review = stReview;
    });
  });

  // ── feature.51: Equipment modifier ticker (pool mod panel) ──
  _wireTickerHandler(container, {
    decCls: 'proc-equip-mod-dec', incCls: 'proc-equip-mod-inc',
    panelCls: 'proc-feed-mod-panel', inputCls: 'proc-equip-mod-val', dispCls: 'proc-equip-mod-disp',
    clamp: { min: -5, max: 5 },
    afterUpdate: _refreshPoolBuilder,
    saveField: 'pool_mod_equipment',
  });

  // ── feature.51: Manual vitae adjustment ticker (vitae panel) ──
  _wireTickerHandler(container, {
    decCls: 'proc-vitae-mod-dec', incCls: 'proc-vitae-mod-inc',
    panelCls: 'proc-feed-vitae-panel', inputCls: 'proc-vitae-mod-val', dispCls: 'proc-vitae-mod-disp',
    afterUpdate: _updateVitaeTotal,
    saveField: 'vitae_mod_manual',
  });

  // ── feature.59: Success modifier ticker (project right panel) ──
  _wireTickerHandler(container, {
    decCls: 'proc-succmod-dec', incCls: 'proc-succmod-inc',
    panelCls: 'proc-proj-succ-panel', inputCls: 'proc-succmod-val', dispCls: 'proc-succmod-disp',
    totalCls: 'proc-proj-succ-total-val',
    saveField: 'succ_mod_manual',
  });

  // ── feature.51: Rite cost input (vitae panel) ──
  container.querySelectorAll('.proc-rite-cost-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('input', e => {
      e.stopPropagation();
      _updateVitaeTotal(container, inp.dataset.procKey);
    });
    inp.addEventListener('blur', async e => {
      e.stopPropagation();
      const key  = inp.dataset.procKey;
      const val  = Math.max(0, parseInt(inp.value || '0', 10));
      inp.value  = val;
      const entry = _getQueueEntry(key);
      if (entry) await saveEntryReview(entry, { vitae_rite_cost: val });
    });
  });

  // Wire player_feedback input (save on blur)
  container.querySelectorAll('.proc-feedback-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('blur', async e => {
      const key = inp.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { player_feedback: inp.value.trim() });
    });
  });

  // Wire add-note buttons
  container.querySelectorAll('.proc-add-note-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key = btn.dataset.procKey;
      const ta = container.querySelector(`.proc-note-textarea[data-proc-key="${key}"]`);
      const text = ta ? ta.value.trim() : '';
      if (!text) return;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const user = getUser();
      const note = {
        author_id: user?.id || '',
        author_name: user?.global_name || user?.username || 'ST',
        text,
        created_at: new Date().toISOString(),
      };
      const review = getEntryReview(entry) || {};
      const thread = [...(review.notes_thread || []), note];
      await saveEntryReview(entry, { notes_thread: thread });
      renderProcessingMode(container);
    });
  });

  // Wire delete-note buttons
  container.querySelectorAll('.proc-note-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key  = btn.dataset.procKey;
      const idx  = parseInt(btn.dataset.noteIdx, 10);
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const review = getEntryReview(entry) || {};
      const thread = [...(review.notes_thread || [])];
      thread.splice(idx, 1);
      await saveEntryReview(entry, { notes_thread: thread });
      renderProcessingMode(container);
    });
  });

  // Prevent click on ST Response textarea from collapsing the row
  container.querySelectorAll('.proc-st-response-textarea').forEach(ta => {
    ta.addEventListener('click', e => e.stopPropagation());
  });

  // Wire ST Response save buttons (feature.66)
  container.querySelectorAll('.proc-st-response-save').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const textarea = container.querySelector(`.proc-st-response-textarea[data-proc-key="${CSS.escape(key)}"]`);
      if (!textarea) return;
      const text   = textarea.value.trim();
      const user   = getUser();
      const author = user?.display_name || user?.username || 'Unknown ST';
      const review = getEntryReview(entry) || {};
      // Re-saving resets reviewed status (AC 11)
      const patch = {
        st_response: text,
        response_author: review.response_author || author,
        response_status: 'draft',
        response_reviewed_by: null,
      };
      await saveEntryReview(entry, patch);
      renderProcessingMode(container);
    });
  });

  // Wire ST Response copy-context buttons (feature.66)
  container.querySelectorAll('.proc-st-response-copy').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const review    = getEntryReview(entry) || {};
      const roll      = review.roll || null;
      const pool      = review.pool_validated || entry.poolPlayer || '';
      const actionLbl = ACTION_TYPE_LABELS[entry.actionType] || entry.actionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

      // ── Roll result + mechanical outcome interpretation ──
      let rollSection = 'Roll: No roll recorded.';
      if (roll) {
        const s       = roll.successes;
        const exc     = roll.exceptional;
        const excTag  = exc ? ' — EXCEPTIONAL SUCCESS' : '';
        const diceStr = _formatDiceString(roll.dice_string);
        const type    = entry.actionType || 'misc';

        let outcome;
        if (s === 0) {
          outcome = 'Failure — no effect. The action produces no result this downtime.';
        } else {
          switch (type) {
            case 'ambience_increase':
              outcome = `Ambience increases by ${s}${exc ? ' (exceptional — consider a notable secondary effect)' : ''}.`;
              break;
            case 'ambience_decrease':
              outcome = `Ambience decreases by ${s}${exc ? ' (exceptional — consider a notable secondary effect)' : ''}.`;
              break;
            case 'attack':
              outcome = `${s} gross success${s !== 1 ? 'es' : ''}${excTag}. Subtract opposing Hide/Protect successes for net; halve net (round up) = levels removed from target merit. Contested — do not narrate a definitive outcome if net is unknown.`;
              break;
            case 'hide_protect':
              outcome = `${s} success${s !== 1 ? 'es' : ''}${excTag}. These are subtracted from any Attack, Patrol/Scout, or Investigate targeting this action this downtime.`;
              break;
            case 'support':
              outcome = `+${s} uncapped Teamwork bonus${excTag} added to the pool of the supported action.`;
              break;
            case 'patrol_scout': {
              const detail = s >= 5 ? 'highly detailed' : s >= 3 ? 'reasonably clear' : 'vague';
              outcome = `${s} action${s !== 1 ? 's' : ''} observed${excTag}. Information quality: ${detail}. Priority order: Attack > Patrol/Scout > Investigate > Ambience > Support — reveal the highest-priority visible actions first.`;
              break;
            }
            case 'investigate': {
              const detail = s >= 5 ? 'detailed' : s >= 4 ? 'basic' : s >= 3 ? 'vague' : s >= 2 ? 'existence confirmed' : 'lead only';
              outcome = `${s} gross success${s !== 1 ? 'es' : ''}${excTag}. Contested — subtract Hide/Protect for net. At net ${s}: ${detail} information at the requested classification. Apply Investigation Matrix for exact result. At 2+ gross: also gain a lead on the next tier.`;
              break;
            }
            case 'rumour': {
              const detail = s >= 5 ? 'detailed' : s >= 3 ? 'reasonably clear' : 'vague';
              outcome = `${s} similar-merit action${s !== 1 ? 's' : ''} revealed by rumour${excTag}. Information quality: ${detail}. Priority order: Attack > Patrol/Scout > Investigate > Ambience > Support.`;
              break;
            }
            case 'feed':
              outcome = `Success${excTag} — Rote Action granted for the character's game-start feeding pool. If disciplines were used and the roll had failed, failures would have become Dramatic Failures.`;
              break;
            case 'block':
              outcome = 'Automatic — no roll required. Merit auto-blocks any merit of equal or lower level targeting this action.';
              break;
            case 'xp_spend':
              outcome = `${s} success${s !== 1 ? 'es' : ''}${excTag} — XP spend approved.`;
              break;
            default:
              outcome = `${s} success${s !== 1 ? 'es' : ''}${excTag}.`;
          }
        }

        rollSection = `Roll: ${s} success${s !== 1 ? 'es' : ''}${excTag}\nDice: ${diceStr}\nMechanical outcome: ${outcome}`;
      }

      const lines = [
        'You are helping a Storyteller draft a narrative response for a Vampire: The Requiem 2nd Edition LARP downtime action.',
        '',
        '── CHARACTER ──────────────────────────',
        `Character: ${entry.charName}`,
        `Action type: ${actionLbl}`,
        entry.projTitle     ? `Title: ${entry.projTitle}`                             : null,
        entry.projTerritory ? `Territory: ${entry.projTerritory}`                     : null,
        entry.projCast      ? `Characters involved: ${entry.projCast}`                : null,
        entry.projMerits    ? `Merits & bonuses applied: ${entry.projMerits}`         : null,
        `Desired outcome: ${entry.projOutcome || entry.meritDesiredOutcome || '—'}`,
        `Player description: ${entry.projDescription || entry.description || '—'}`,
        `Validated pool: ${pool || '—'}`,
        '',
        '── ROLL RESULT ─────────────────────────',
        rollSection,
        '',
        '── YOUR TASK ───────────────────────────',
        'Write a narrative response (2–3 short paragraphs, max 150 words) describing what happened during this downtime action.',
        'The mechanical outcome above dictates the scale and direction of the narrative — calibrate accordingly.',
        'A failure narrates an attempt that produced no result. An exceptional success narrates something notably beyond the baseline.',
        '',
        '── STYLE RULES ─────────────────────────',
        '- Second person, present tense',
        '- British English',
        '- No mechanical terms: no discipline names, dot ratings, success counts, or merit names in narrative',
        '- No em dashes',
        '- Do not editorialise about what the result means mechanically',
        '- Never dictate what the character felt or chose',
        '- Compression over expansion: direct statement over periphrasis',
        '- No stacked declaratives (two or three short sentences in a row that should be folded into one)',
        '- No negative framing openers (do not begin sections with what the character did not find or what went wrong)',
        '- Show what happened, not what it means',
        '- Tone: dry, grounded, specific. Prefer concrete detail over atmosphere. Name streets, objects, and people where possible',
      ].filter(l => l !== null).join('\n');

      try {
        await navigator.clipboard.writeText(lines);
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = orig; }, 1500);
      } catch {
        btn.textContent = 'Failed';
        setTimeout(() => { btn.textContent = 'Copy context'; }, 1500);
      }
    });
  });

  // Wire ST Response review buttons (feature.66)
  container.querySelectorAll('.proc-response-review-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const user     = getUser();
      const reviewer = user?.display_name || user?.username || 'Unknown ST';
      await saveEntryReview(entry, { response_status: 'reviewed', response_reviewed_by: reviewer });
      renderProcessingMode(container);
    });
  });

  // Wire project / merit roll buttons
  container.querySelectorAll('.proc-action-roll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const review = getEntryReview(entry);
      const poolValidated = review?.pool_validated || '';
      if (!poolValidated) return;
      const match = poolValidated.match(/(\d+)\s*$/);
      const diceCount = match ? parseInt(match[1], 10) : 0;
      if (!diceCount) { alert('Cannot parse dice count from validated pool expression.'); return; }
      const result = rollPool(diceCount, 10, 8, 5, false);
      await saveEntryReview(entry, { roll: result });
      renderProcessingMode(container);
    });
  });

  // Wire feeding roll buttons
  // Wire feeding spec toggles
  container.querySelectorAll('.dt-feed-spec-toggle').forEach(cb => {
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const key  = cb.dataset.procKey;
      const spec = cb.dataset.spec;
      const entry = _getQueueEntry(key);
      if (!entry || !spec) return;
      const review = getEntryReview(entry) || {};

      // Snapshot current builder expression so it survives future re-renders
      const builder = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
      if (builder) {
        const expr = _readBuilderExpr(builder);
        if (expr) await saveEntryReview(entry, { pool_validated: expr });
      }

      const activeFeedSpecs = [...(review.active_feed_specs || [])];
      if (cb.checked) {
        if (!activeFeedSpecs.includes(spec)) activeFeedSpecs.push(spec);
      } else {
        const i = activeFeedSpecs.indexOf(spec);
        if (i !== -1) activeFeedSpecs.splice(i, 1);
      }
      const sub = submissions.find(s => s._id === entry.subId);
      const char = sub
        ? (characters.find(c => String(c._id) === String(sub.character_id)) || charMap.get((sub.character_name || '').toLowerCase().trim()))
        : null;
      const specBonus = activeFeedSpecs.reduce((sum, sp) => sum + (char && hasAoE(char, sp) ? 2 : 1), 0);
      // pool_mod_spec is applied at roll time only — no re-render needed; checkbox state already reflects the change
      await saveEntryReview(entry, { active_feed_specs: activeFeedSpecs, pool_mod_spec: specBonus });
    });
  });

  container.querySelectorAll('.proc-feed-roll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const subId = btn.dataset.subId;
      const isRote = btn.dataset.rote === 'true';
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const review = getEntryReview(entry);
      const poolValidated = review?.pool_validated || '';
      if (!poolValidated) return;
      const match = poolValidated.match(/(\d+)\s*$/);
      let diceCount = match ? parseInt(match[1], 10) : 0;
      if (!diceCount) { alert('Cannot parse dice count from validated pool expression.'); return; }
      diceCount += (review?.pool_mod_spec || 0);
      // Read again/rote from live DOM checkboxes — auto-detected 9-again may not be saved to DB
      const rightPanel = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
      const nineAgainChecked  = rightPanel?.querySelector('.proc-proj-9a')?.checked  ?? (review?.nine_again  || false);
      const eightAgainChecked = rightPanel?.querySelector('.proc-proj-8a')?.checked  ?? (review?.eight_again || false);
      const again = eightAgainChecked ? 8 : nineAgainChecked ? 9 : 10;
      const sub = submissions.find(s => s._id === subId);
      showRollModal(
        { size: diceCount, expression: `Feeding: ${poolValidated}`, existingRoll: sub?.feeding_roll,
          again, rote: isRote },
        async result => {
          await updateSubmission(subId, { feeding_roll: result });
          if (sub) sub.feeding_roll = result;
          renderProcessingMode(container);
        }
      );
    });
  });

  // Wire project 9-Again sidebar toggle
  container.querySelectorAll('.proc-proj-9a').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const key = cb.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { nine_again: cb.checked });
      // Update pool total annotation in-place
      const poolTotalEl = container.querySelector(`.proc-pool-total[data-proc-key="${key}"]`);
      if (poolTotalEl) {
        poolTotalEl.dataset.nineAgain = cb.checked ? '1' : '0';
        _updatePoolTotal(container, key);
      }
      renderProcessingMode(container);
    });
  });

  // Wire project 8-Again sidebar toggle
  container.querySelectorAll('.proc-proj-8a').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const key = cb.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { eight_again: cb.checked });
      renderProcessingMode(container);
    });
  });

  // Wire project roll button (sidebar roll card)
  container.querySelectorAll('.proc-proj-roll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const review = getEntryReview(entry);
      // Prefer the refreshed expression baked into the button's data attribute at render time
      const poolValidated = btn.dataset.poolValidated || review?.pool_validated || '';
      if (!poolValidated) return;
      const match = poolValidated.match(/(\d+)\s*$/);
      const diceCount = match ? parseInt(match[1], 10) : 0;
      if (!diceCount) { alert('Cannot parse dice count from validated pool expression.'); return; }
      // Read toggle states from sidebar
      const rightPanel = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
      const roteChecked      = rightPanel?.querySelector('.proc-pool-rote')?.checked  || false;
      const nineAgainChecked = rightPanel?.querySelector('.proc-proj-9a')?.checked    || false;
      const eightAgainChecked = rightPanel?.querySelector('.proc-proj-8a')?.checked   || false;
      const again = eightAgainChecked ? 8 : nineAgainChecked ? 9 : 10;
      showRollModal({
        size: diceCount, expression: poolValidated,
        existingRoll: review?.roll || null,
        again, initialRote: roteChecked,
      }, async result => {
        await saveEntryReview(entry, { roll: result });
        renderProcessingMode(container);
      });
    });
  });

  // Wire merit roll button (auto-computed pool from data-pool attribute)
  container.querySelectorAll('.proc-merit-roll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const review    = getEntryReview(entry);
      const diceCount = parseInt(btn.dataset.pool, 10) || 0;
      if (!diceCount) return;
      showRollModal({
        size: diceCount, expression: `(${entry.meritDots || '?'} \u00d7 2) + 2`,
        existingRoll: review?.roll || null,
        again: 10, initialRote: false,
      }, async result => {
        await saveEntryReview(entry, { roll: result });
        renderProcessingMode(container);
      });
    });
  });

  // ── Investigation: Target Secrecy dropdown ──
  container.querySelectorAll('.proc-inv-secrecy-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const entry = _getQueueEntry(sel.dataset.procKey);
      if (!entry) return;
      await saveEntryReview(entry, { inv_secrecy: sel.value || null });
      renderProcessingMode(container);
    });
  });

  // ── Investigation: Has Lead toggle buttons ──
  container.querySelectorAll('.proc-inv-lead-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const entry = _getQueueEntry(btn.dataset.procKey);
      if (!entry) return;
      const val = btn.dataset.lead === 'true';
      const rev = getEntryReview(entry) || {};
      // clicking the active button toggles it off (back to unset)
      const next = rev.inv_has_lead === val ? null : val;
      await saveEntryReview(entry, { inv_has_lead: next });
      renderProcessingMode(container);
    });
  });

  // Wire "Attach Reminder" open button
  container.querySelectorAll('.proc-attach-open-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      attachReminderKey = btn.dataset.procKey;
      renderProcessingMode(container);
    });
  });

  // Wire "Cancel" on attach panel
  container.querySelectorAll('.proc-attach-cancel-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      attachReminderKey = null;
      renderProcessingMode(container);
    });
  });

  // Wire connected character checkboxes
  container.querySelectorAll('.proc-conn-char-chk').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = cb.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const allChks   = container.querySelectorAll(`.proc-conn-char-chk[data-proc-key="${key}"]`);
      const connected = [...allChks].filter(c => c.checked).map(c => c.dataset.charName);
      await saveEntryReview(entry, { connected_chars: connected });
    });
  });

  // Wire attack target — character dropdown repopulates merit list; both save without re-render
  container.querySelectorAll('.proc-attack-char-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { attack_target_char: sel.value, attack_target_merit: '' });
      // Repopulate merit dropdown inline — no full re-render needed
      const meritSel = container.querySelector(`.proc-attack-merit-sel[data-proc-key="${key}"]`);
      if (meritSel) {
        const targetChar = characters.find(c => c.name === sel.value) || null;
        meritSel.innerHTML = '<option value="">\u2014 Select merit \u2014</option>';
        if (targetChar) {
          const merits = [...(targetChar.merits || [])].sort((a, b) => (a.name||'').localeCompare(b.name||''));
          for (const m of merits) {
            const mName   = m.name || '';
            const mRating = (m.rating || m.dots || 0) + (m.bonus || 0);
            const mQual   = m.qualifier ? ` (${m.qualifier})` : '';
            const opt     = document.createElement('option');
            opt.value       = mName;
            opt.textContent = `${mName}${mQual} \u25CF${mRating}`;
            meritSel.appendChild(opt);
          }
        }
      }
    });
  });

  container.querySelectorAll('.proc-attack-merit-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { attack_target_merit: sel.value });
    });
  });

  // Wire protected merit dropdown — saves which merit a hide/protect action covers
  container.querySelectorAll('.proc-prot-merit-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const [name, qual] = sel.value.split('|');
      await saveEntryReview(entry, { protected_merit_name: name || '', protected_merit_qualifier: qual || '' });
    });
  });

  // Wire merit link dropdown — saves which specific merit the action is linked to
  container.querySelectorAll('.proc-merit-link-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { linked_merit_qualifier: sel.value });
    });
  });

  // Wire investigate target character dropdown — save without re-render
  container.querySelectorAll('.proc-inv-char-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { investigate_target_char: sel.value });
    });
  });

  // Wire rite selector (sorcery) — save rite_override and re-render
  container.querySelectorAll('.proc-rite-select').forEach(sel => {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { rite_override: sel.value || null });
      renderProcessingMode(container);
    });
  });

  // Wire Mandragora Garden toggle (sorcery) — save and re-render
  container.querySelectorAll('.proc-ritual-mg-toggle').forEach(cb => {
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = cb.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { ritual_mg_used: cb.checked });
      renderProcessingMode(container);
    });
  });

  // Wire ritual result note (sorcery) — save on blur
  container.querySelectorAll('.proc-ritual-note-input').forEach(ta => {
    ta.addEventListener('blur', async e => {
      e.stopPropagation();
      const key   = ta.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { ritual_result_note: ta.value.trim() });
    });
  });

  // Wire ritual roll buttons (sorcery entries — single roll with DT bonus + MG)
  container.querySelectorAll('.proc-ritual-roll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;

      const sub = submissions.find(s => s._id === entry.subId);
      if (!sub) return;

      const rev      = (sub.sorcery_review || {})[entry.actionIdx] || {};
      const riteName = rev.rite_override || entry.riteName || '';
      const ritInfo  = riteName ? _getRiteInfo(riteName) : null;
      if (!ritInfo) { alert(`Rite "${riteName}" not found in the rules database.`); return; }

      // Resolve character
      const charIdStr   = sub.character_id ? String(sub.character_id) : null;
      const charNameKey = (sub.character_name || '').toLowerCase().trim();
      const char        = (charIdStr && characters.find(c => String(c._id) === charIdStr))
                        || charMap.get(charNameKey) || null;

      // Pool = tradition stats + 3 (DT) + Mandragora (Cruac, if toggled)
      const base         = _computeRitePool(char, ritInfo.attr, ritInfo.skill, ritInfo.disc);
      const isCruac      = entry.tradition === 'Cruac';
      const mandUsed     = rev.ritual_mg_used || false;
      const mgMerit      = isCruac ? (char?.merits || []).find(m => m.name === 'Mandragora Garden') : null;
      const mgPool       = mgMerit ? (mgMerit.rating || mgMerit.dots || 0) + (mgMerit.bonus || 0) : 0;
      const mgDots       = (isCruac && mandUsed) ? mgPool : 0;
      const eqMod        = rev.pool_mod_equipment || 0;
      const total        = base + 3 + mgDots + eqMod;
      if (!total) { alert('Cannot compute pool — character stats unavailable.'); return; }

      const _rdEntry = ritInfo.disc ? _charDiscsArray(char).find(d => d.name === ritInfo.disc) : null;
      const parts = char
        ? [
            `${ritInfo.attr} ${getAttrVal(char, ritInfo.attr) || 0}`,
            `${ritInfo.skill} ${skTotal(char, ritInfo.skill) || 0}`,
            ritInfo.disc ? `${ritInfo.disc} ${_rdEntry?.dots || 0}` : null,
            '+3 (downtime)',
            mgDots ? `+${mgDots} (Mandragora)` : null,
            eqMod  ? `${eqMod > 0 ? '+' : ''}${eqMod} (equip)` : null,
          ].filter(Boolean)
        : [ritInfo.poolExpr, '+3 (downtime)'];
      const poolExpr = parts.join(' + ') + ` = ${total}`;

      showRollModal(
        { size: total, expression: `${riteName}: ${poolExpr}`, existingRoll: rev.ritual_roll || null },
        async result => {
          const hit    = result.successes >= ritInfo.target;
          const status = hit ? 'resolved' : 'no_effect';
          const sorcReview = { ...(sub.sorcery_review || {}) };
          sorcReview[entry.actionIdx] = {
            ...(sorcReview[entry.actionIdx] || {}),
            ritual_roll:   result,
            ritual_target: ritInfo.target,
            pool_status:   status,
          };
          await updateSubmission(entry.subId, { sorcery_review: sorcReview });
          sub.sorcery_review = sorcReview;
          renderProcessingMode(container);
        }
      );
    });
  });

  // Wire "Attach" confirm
  container.querySelectorAll('.proc-attach-confirm-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key = btn.dataset.procKey;
      const panel = container.querySelector(`.proc-attach-panel[data-proc-key="${key}"]`);
      if (!panel) return;

      const textInput = panel.querySelector('.proc-attach-text');
      const reminderText = textInput ? textInput.value.trim() : '';

      // Gather checked targets
      const targets = [];
      panel.querySelectorAll('.proc-attach-target:checked').forEach(cb => {
        targets.push({
          sub_id:    cb.dataset.subId,
          char_name: cb.dataset.charName,
          action_key: cb.dataset.actionKey,
        });
      });

      if (!reminderText) { textInput?.focus(); return; }

      const entry = _getQueueEntry(key);
      if (!entry) return;

      const user = getUser();
      const reminder = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2),
        source_sub_id:    entry.subId,
        source_char_name: entry.charName,
        source_rite:      entry.riteName,
        source_tradition: entry.tradition,
        text:             reminderText,
        created_by:       user?.global_name || user?.username || 'ST',
        created_at:       new Date().toISOString(),
        targets,
      };

      cycleReminders = [...cycleReminders, reminder];
      attachReminderKey = null;

      try {
        const updated = await updateCycle(selectedCycleId, { processing_reminders: cycleReminders });
        // Sync back to allCycles
        const idx = allCycles.findIndex(c => c._id === selectedCycleId);
        if (idx >= 0) allCycles[idx].processing_reminders = cycleReminders;
      } catch (err) {
        cycleReminders = cycleReminders.filter(r => r.id !== reminder.id); // rollback
        alert('Failed to save reminder: ' + err.message);
      }

      renderProcessingMode(container);
    });
  });

  // Wire phase section collapse toggles
  container.querySelectorAll('[data-toggle-phase]').forEach(el => {
    el.addEventListener('click', () => {
      const key = el.dataset.togglePhase;
      if (expandedPhases.has(key)) expandedPhases.delete(key);
      else expandedPhases.add(key);
      renderProcessingMode(container);
    });
  });

  // Wire pre-read character block toggles
  container.querySelectorAll('.proc-preread-char').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.prereadId;
      if (preReadExpanded.has(id)) preReadExpanded.delete(id);
      else preReadExpanded.add(id);
      renderProcessingMode(container);
    });
  });

  // Wire lore responded button — update in-place without full re-render
  container.querySelectorAll('.proc-lore-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const newVal = !sub.st_review?.lore_responded;
      try {
        await updateSubmission(subId, { 'st_review.lore_responded': newVal });
        if (!sub.st_review) sub.st_review = {};
        sub.st_review.lore_responded = newVal;
        btn.textContent = newVal ? '\u2713 Responded' : 'Mark responded';
        btn.classList.toggle('active', newVal);
        const charRow = container.querySelector(`.proc-preread-char[data-preread-id="${subId}"]`);
        if (charRow) charRow.querySelector('.proc-preread-lore-badge')?.remove();
      } catch (err) { console.error('Lore responded error:', err.message); }
    });
  });

  // Wire XP review character block toggles (Step 10)
  container.querySelectorAll('[data-xp-review-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.xpReviewId;
      if (xpReviewExpanded.has(id)) xpReviewExpanded.delete(id);
      else xpReviewExpanded.add(id);
      renderProcessingMode(container);
    });
  });

  // Wire XP approve / flag buttons (Step 10)
  container.querySelectorAll('.proc-xp-approve-btn, .proc-xp-flag-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId  = btn.dataset.subId;
      const idx    = parseInt(btn.dataset.rowIdx, 10);
      const status = btn.dataset.status;
      const sub    = submissions.find(s => s._id === subId);
      if (!sub) return;
      // Toggle off if already active
      const current = sub.st_review?.xp_approvals?.[idx]?.status;
      const newStatus = current === status ? '' : status;
      if (!sub.st_review) sub.st_review = {};
      if (!sub.st_review.xp_approvals) sub.st_review.xp_approvals = {};
      if (!sub.st_review.xp_approvals[idx]) sub.st_review.xp_approvals[idx] = {};
      sub.st_review.xp_approvals[idx].status = newStatus;
      await updateSubmission(subId, { [`st_review.xp_approvals.${idx}.status`]: newStatus });
      renderProcessingMode(container);
    });
  });

  // Wire XP flag note input — save on blur (Step 10)
  container.querySelectorAll('.proc-xp-note-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('blur', async () => {
      const subId = inp.dataset.subId;
      const idx   = parseInt(inp.dataset.rowIdx, 10);
      const sub   = submissions.find(s => s._id === subId);
      if (!sub) return;
      if (!sub.st_review) sub.st_review = {};
      if (!sub.st_review.xp_approvals) sub.st_review.xp_approvals = {};
      if (!sub.st_review.xp_approvals[idx]) sub.st_review.xp_approvals[idx] = {};
      sub.st_review.xp_approvals[idx].note = inp.value;
      await updateSubmission(subId, { [`st_review.xp_approvals.${idx}.note`]: inp.value });
    });
  });

  // Wire sign-off character block toggles (Step 11)
  container.querySelectorAll('[data-signoff-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.signoffId;
      if (signOffExpanded.has(id)) signOffExpanded.delete(id);
      else signOffExpanded.add(id);
      renderProcessingMode(container);
    });
  });

  // Wire approval buttons in sign-off step (Step 11)
  container.querySelectorAll('.proc-preread-body .dt-approval-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await handleApproval(btn.dataset.subId, btn.dataset.status);
    });
  });

  // Wire resolution note autosave on blur (Step 11)
  container.querySelectorAll('.proc-signoff-note').forEach(ta => {
    ta.addEventListener('click', e => e.stopPropagation());
    ta.addEventListener('blur', async () => {
      const subId = ta.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const resolution = ta.value.trim();
      await updateSubmission(subId, { resolution_note: resolution });
      sub.resolution_note = resolution;
    });
  });

  // Wire mark ready button (Step 11)
  container.querySelectorAll('.proc-signoff-ready-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      await updateSubmission(subId, { 'st_review.outcome_visibility': 'ready' });
      if (!sub.st_review) sub.st_review = {};
      sub.st_review.outcome_visibility = 'ready';
      renderMatchSummary();
      renderProcessingMode(container);
    });
  });

  // Wire revert to draft button (Step 11)
  container.querySelectorAll('.proc-signoff-revert').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      await updateSubmission(subId, { 'st_review.outcome_visibility': null });
      if (!sub.st_review) sub.st_review = {};
      sub.st_review.outcome_visibility = null;
      renderMatchSummary();
      renderProcessingMode(container);
    });
  });

  // Wire narrative character block toggles (Step 9)
  container.querySelectorAll('[data-narrative-id]').forEach(el => {
    el.addEventListener('click', () => {
      const id = el.dataset.narrativeId;
      if (narrativeExpanded.has(id)) narrativeExpanded.delete(id);
      else narrativeExpanded.add(id);
      renderProcessingMode(container);
    });
  });

  // Wire narrative textarea autosave on blur (Step 9)
  container.querySelectorAll('.dt-narr-textarea').forEach(ta => {
    ta.addEventListener('blur', async e => {
      e.stopPropagation();
      const subId = ta.dataset.subId;
      const blockKey = ta.dataset.blockKey;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      try {
        await updateSubmission(subId, { [`st_review.narrative.${blockKey}.text`]: ta.value });
        if (!sub.st_review) sub.st_review = {};
        if (!sub.st_review.narrative) sub.st_review.narrative = {};
        if (!sub.st_review.narrative[blockKey]) sub.st_review.narrative[blockKey] = {};
        sub.st_review.narrative[blockKey].text = ta.value;
      } catch (err) { console.error('Narrative save error:', err.message); }
    });
  });

  // Wire narrative status toggle (draft/ready) — re-renders to update badge (Step 9)
  container.querySelectorAll('.dt-narr-status-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const blockKey = btn.dataset.blockKey;
      const newStatus = btn.dataset.status;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      try {
        await updateSubmission(subId, { [`st_review.narrative.${blockKey}.status`]: newStatus });
        if (!sub.st_review) sub.st_review = {};
        if (!sub.st_review.narrative) sub.st_review.narrative = {};
        if (!sub.st_review.narrative[blockKey]) sub.st_review.narrative[blockKey] = {};
        sub.st_review.narrative[blockKey].status = newStatus;
        renderProcessingMode(container);
      } catch (err) { console.error('Narrative status error:', err.message); }
    });
  });

  // Wire Ambience Dashboard collapse toggles
  container.querySelector('[data-toggle="amb-dash"]')?.addEventListener('click', () => {
    ambDashCollapsed = !ambDashCollapsed;
    renderProcessingMode(container);
  });
  container.querySelector('[data-toggle="feed-matrix"]')?.addEventListener('click', () => {
    matrixCollapsed = !matrixCollapsed;
    renderProcessingMode(container);
  });

  // Wire ambience confirm buttons
  container.querySelectorAll('.proc-amb-confirm-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentCycle) return;
      const terrId      = btn.dataset.terrId;
      const ambience    = btn.dataset.projStep;
      const ambienceMod = parseInt(btn.dataset.projMod, 10);
      const updated = { ...(currentCycle.confirmed_ambience || {}), [terrId]: { ambience, ambienceMod } };
      try {
        await updateCycle(currentCycle._id, { confirmed_ambience: updated });
        currentCycle.confirmed_ambience = updated;
        renderProcessingMode(container);
      } catch (err) { console.error('Failed to confirm ambience:', err.message); }
    });
  });

  // Wire ST ambience notes textarea (save on blur)
  container.querySelector('.proc-amb-notes')?.addEventListener('blur', async e => {
    const val = e.target.value;
    try {
      await updateCycle(selectedCycleId, { ambience_notes: val });
      const idx = allCycles.findIndex(c => c._id === selectedCycleId);
      if (idx >= 0) allCycles[idx].ambience_notes = val;
      if (currentCycle) currentCycle.ambience_notes = val;
    } catch (err) { console.error('Failed to save ambience notes:', err.message); }
  });

}

/** Render the inline Attach Reminder panel for a resolved sorcery entry. */
function _renderAttachPanel(entry) {
  // Build the list of all non-sorcery actions, grouped by character
  const allActions = buildProcessingQueue(submissions).filter(e => e.source !== 'sorcery');

  // Pre-selection: word-overlap match against entry.targetsText
  const targetWords = (entry.targetsText || '').toLowerCase().split(/[\s,;]+/).filter(Boolean);
  function isPreSelected(charName) {
    if (!targetWords.length) return false;
    const nameWords = charName.toLowerCase().split(/\s+/);
    return nameWords.some(w => w.length > 2 && targetWords.some(t => t.includes(w) || w.includes(t)));
  }

  // Group by char
  const byChar = new Map();
  for (const a of allActions) {
    if (!byChar.has(a.charName)) byChar.set(a.charName, []);
    byChar.get(a.charName).push(a);
  }

  let h = `<div class="proc-attach-panel" data-proc-key="${esc(entry.key)}">`;
  h += '<div class="proc-detail-label">Reminder Text</div>';
  h += `<input class="proc-attach-text proc-section" type="text" data-proc-key="${esc(entry.key)}" placeholder="e.g. +4 to pool, Rote quality, -1 Vitae" style="width:100%">`;
  h += '<div class="proc-detail-label">Attach to Actions:</div>';
  h += '<div class="proc-attach-actions">';

  for (const [charName, actions] of byChar) {
    const preSel = isPreSelected(charName);
    h += `<div class="proc-attach-char-group">`;
    h += `<div class="proc-attach-char-header">${esc(charName)}</div>`;
    for (const a of actions) {
      const ak = entryActionKey(a);
      if (!ak) continue;
      const checked = preSel ? ' checked' : '';
      h += `<label class="proc-attach-target-row">`;
      h += `<input type="checkbox" class="proc-attach-target"${checked} data-sub-id="${esc(a.subId)}" data-char-name="${esc(a.charName)}" data-action-key="${esc(ak)}" data-proc-key="${esc(entry.key)}">`;
      h += ` ${esc(a.label)}${a.description ? ' — ' + esc(a.description.slice(0, 50)) : ''}`;
      h += `</label>`;
    }
    h += `</div>`;
  }

  if (!allActions.length) {
    h += '<p class="dt-empty-msg">No other actions in this cycle.</p>';
  }

  h += '</div>'; // proc-attach-actions
  h += '<div class="proc-attach-btn-row">';
  h += `<button class="dt-btn proc-attach-confirm-btn" data-proc-key="${esc(entry.key)}">Attach</button>`;
  h += `<button class="dt-btn proc-attach-cancel-btn" data-proc-key="${esc(entry.key)}">Cancel</button>`;
  h += '</div>';
  h += '</div>'; // proc-attach-panel
  return h;
}

// ── Pool Builder helpers (feature.50) ───────────────────────────────────────

/**
 * Parse a pool_validated expression back into its components.
 * Format: "{Attr} {n} + {Skill} {n}[ + {Disc} {n}][± modifier] = {total}"
 * Returns { attr, skill, disc, modifier } or null on failure.
 */
function _parsePoolExpr(str, attrList, skillList, discNames) {
  if (!str) return null;
  const eqIdx = str.lastIndexOf('=');
  if (eqIdx === -1) return null;
  let lhs = str.slice(0, eqIdx).trim();

  // Extract negative modifier: ends with ' − N' (U+2212)
  let modifier = 0;
  const negModMatch = lhs.match(/\s+\u2212\s*(\d+)\s*$/);
  if (negModMatch) {
    modifier = -parseInt(negModMatch[1], 10);
    lhs = lhs.slice(0, negModMatch.index).trim();
  }

  // Split remaining by ' + '
  const parts = lhs.split(/\s+\+\s+/);

  // If last part is a lone number, it's a positive modifier
  if (!negModMatch && parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    if (/^\d+$/.test(last)) {
      modifier = parseInt(last, 10);
      parts.pop();
    }
  }

  if (parts.length < 2) return null;

  function parsePart(p) {
    const m = p.trim().match(/^(.+?)\s+(\d+)$/);
    return m ? { name: m[1].trim(), dots: parseInt(m[2], 10) } : null;
  }

  const t0 = parsePart(parts[0]);
  const t1 = parsePart(parts[1]);
  const t2 = parts[2] ? parsePart(parts[2]) : null;
  if (!t0 || !t1) return null;

  const attr  = attrList.find(a => a.toLowerCase() === t0.name.toLowerCase()) || null;
  const skill = skillList.find(s => s.toLowerCase() === t1.name.toLowerCase()) || null;
  if (!attr || !skill) return null;

  let disc = 'none';
  if (t2 && discNames) {
    disc = discNames.find(d => d.toLowerCase() === t2.name.toLowerCase()) || 'none';
  }
  return { attr, skill, disc, modifier };
}

/**
 * Normalise char.disciplines to [{name, dots}] regardless of schema version.
 * v2 format: array; old format: { "Dominate": { dots: 3 } }.
 */
function _charDiscsArray(char) {
  if (!char) return [];
  const d = char.disciplines;
  if (!d) return [];
  if (Array.isArray(d)) return d;
  // Old object format: { "Dominate": { dots: 3 } }
  return Object.entries(d).map(([name, v]) => ({ name, dots: v?.dots || 0 }));
}

/**
 * Return the unskilled penalty for a skill with 0 dots (-3 mental, -1 otherwise).
 */
function _unskilledPenalty(skillName, skillDots) {
  if (!skillName || skillDots > 0) return 0;
  return SKILLS_MENTAL.includes(skillName) ? -3 : -1;
}

/**
 * Re-sync a pool_validated expression string with current character effective stats.
 * Parses component names from the saved string, then rebuilds using getAttrVal / skTotal
 * so bonus dots are always included. Returns the refreshed string, or the original if
 * char is null or the expression cannot be parsed.
 */
function _refreshPoolExpr(str, char) {
  if (!str || !char) return str;
  const discNames = _charDiscsArray(char).filter(d => d.dots > 0).map(d => d.name);
  const parsed = _parsePoolExpr(str, ALL_ATTRS, ALL_SKILLS, discNames);
  if (!parsed?.attr || !parsed?.skill) return str;
  const attrDots  = getAttrVal(char, parsed.attr)  || 0;
  const skillDots = skTotal(char, parsed.skill)     || 0;
  const discDots  = parsed.disc && parsed.disc !== 'none'
    ? (_charDiscsArray(char).find(d => d.name === parsed.disc)?.dots || 0) : 0;
  return _buildPoolExpr(parsed.attr, attrDots, parsed.skill, skillDots, parsed.disc, discDots, parsed.modifier || 0);
}

/**
 * Build the human-readable pool expression string for pool_validated.
 */
function _buildPoolExpr(attr, attrDots, skill, skillDots, disc, discDots, modifier) {
  if (!attr || !skill) return '';
  let expr = `${attr} ${attrDots} + ${skill} ${skillDots}`;
  if (disc && disc !== 'none') expr += ` + ${disc} ${discDots}`;
  if (modifier !== 0) expr += ` ${modifier > 0 ? '+' : '\u2212'} ${Math.abs(modifier)}`;
  const total = attrDots + skillDots + (disc && disc !== 'none' ? discDots : 0) + modifier;
  expr += ` = ${total}`;
  return expr;
}

/**
 * Format a dice_string from rollPool into a human-readable list, marking exploded dice with !.
 * e.g. "[1,3,5,0>9>4,5]" → "[1, 3, 5, 10!, 9!, 4, 5]"
 */
function _formatDiceString(diceString) {
  if (!diceString) return '';
  const chains = parseDiceString(diceString);
  const parts = [];
  for (const chain of chains) {
    for (let i = 0; i < chain.length; i++) {
      const face = chain[i] === 0 ? 10 : chain[i];
      parts.push(i < chain.length - 1 ? `${face}!` : String(face));
    }
  }
  return '[' + parts.join(', ') + ']';
}

/**
 * Build the live display string for the pool total element.
 * skillName is optional; when provided and skillDots === 0, appends unskilled penalty note.
 * nineAgain is optional; when true, appends (9-Again).
 */
function _poolTotalDisplay(attr, attrDots, skill, skillDots, disc, discDots, modifier, skillName, nineAgain = false) {
  if (!attr || !skill) return '\u2014 + \u2014 = 0';
  const base = _buildPoolExpr(attr, attrDots, skill, skillDots, disc, discDots, modifier);
  const penalty = _unskilledPenalty(skillName, skillDots);
  let result;
  if (!penalty) {
    result = base;
  } else {
    const rawTotal = attrDots + skillDots + (disc && disc !== 'none' ? discDots : 0) + modifier;
    const corrected = rawTotal + penalty;
    result = base.replace(`= ${rawTotal}`, `= ${corrected} (\u2212${Math.abs(penalty)} unskilled)`);
  }
  if (nineAgain) result += ' (9-Again)';
  return result;
}

/**
 * Render a territory pill row. Wires up via the existing proc-terr-pill click handler.
 * feedingSet: pass a Set of active territory IDs for feeding multi-select; null for single-select.
 */
function _renderInlineTerrPills(subId, terrContext, currentTerrId, feedingSet = null) {
  const TERR_PILLS = [
    { id: '',           label: '\u2014' },
    { id: 'academy',   label: 'Academy' },
    { id: 'harbour',   label: 'Harbour' },
    { id: 'dockyards', label: 'Dockyards' },
    { id: 'northshore', label: 'N. Shore' },
    { id: 'secondcity', label: '2nd City' },
  ];
  let h = `<span class="proc-terr-pill-row proc-terr-inline-pills" data-sub-id="${esc(subId)}" data-terr-context="${esc(terrContext)}">`;
  h += `<span class="proc-feed-lbl">Terr.</span>`;
  for (const t of TERR_PILLS) {
    const active = feedingSet
      ? ((t.id === '' ? feedingSet.size === 0 : feedingSet.has(t.id)) ? ' active' : '')
      : (currentTerrId === t.id ? ' active' : '');
    h += `<button class="proc-terr-pill${active}" data-sub-id="${esc(subId)}" data-terr-context="${esc(terrContext)}" data-terr-id="${esc(t.id)}">${esc(t.label)}</button>`;
  }
  h += `</span>`;
  return h;
}

/**
 * Read the current builder state from the DOM and return the pool expression string.
 * Returns null if attr or skill are not selected.
 */
function _readBuilderExpr(builder) {
  const attrSel  = builder.querySelector('.proc-pool-attr');
  const skillSel = builder.querySelector('.proc-pool-skill');
  const discSel  = builder.querySelector('.proc-pool-disc');
  const modInput = builder.querySelector('.proc-pool-mod-val');
  if (!attrSel || !skillSel) return null;
  const attr  = attrSel.value;
  const skill = skillSel.value;
  if (!attr || !skill) return null;
  const disc     = discSel ? discSel.value : 'none';
  const modifier = parseInt(modInput ? modInput.value : '0', 10);
  const attrDots  = parseInt(attrSel.selectedOptions[0]?.dataset.dots  || '0', 10);
  const skillDots = parseInt(skillSel.selectedOptions[0]?.dataset.dots || '0', 10);
  const discDots  = (discSel && disc !== 'none') ? parseInt(discSel.selectedOptions[0]?.dataset.dots || '0', 10) : 0;
  return _buildPoolExpr(attr, attrDots, skill, skillDots, disc, discDots, modifier);
}

/**
 * Recompute pool modifier total in the right panel for a feeding entry.
 */
function _updatePoolModTotal(container, key) {
  const modPanel = container.querySelector(`.proc-feed-mod-panel[data-proc-key="${key}"]`);
  if (!modPanel) return;
  const fgData = modPanel.dataset.fg;
  const fgDice = fgData !== '' ? parseInt(fgData || '0', 10) : 0;

  const unskilledRow = modPanel.querySelector('.proc-feed-unskilled-row');
  const unskilledVal = (unskilledRow && unskilledRow.style.display !== 'none')
    ? parseInt(modPanel.querySelector('.proc-mod-unskilled-val')?.textContent || '0', 10)
    : 0;

  const eqInput = modPanel.querySelector('.proc-equip-mod-val');
  const eqVal = parseInt(eqInput?.value || '0', 10);

  const total = fgDice + unskilledVal + eqVal;
  const totalEl = modPanel.querySelector('.proc-mod-total-val');
  if (totalEl) totalEl.textContent = total === 0 ? '\u00B10' : total > 0 ? `+${total}` : String(total);

  // Sync total to pool builder hidden modifier input so the pool total display updates
  const builderModInp = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"] .proc-pool-mod-val`);
  if (builderModInp) builderModInp.value = String(total);
}

/**
 * Recompute final vitae total in the vitae panel for a feeding entry.
 */
function _updateVitaeTotal(container, key) {
  const panel = container.querySelector(`.proc-feed-vitae-panel[data-proc-key="${key}"]`);
  if (!panel) return;
  const herd    = panel.dataset.herd     !== '' ? parseInt(panel.dataset.herd     || '0', 10) : 0;
  const oof     = parseInt(panel.dataset.oof      || '0', 10);
  const amb     = panel.dataset.ambience !== '' ? parseInt(panel.dataset.ambience || '0', 10) : 0;
  const ghouls  = parseInt(panel.dataset.ghouls   || '0', 10);
  const manVal  = parseInt(panel.querySelector('.proc-vitae-mod-val')?.value  || '0', 10);
  const riteVal = parseInt(panel.querySelector('.proc-rite-cost-input')?.value || '0', 10);
  const total   = Math.max(0, herd + oof + amb - ghouls + manVal - riteVal);
  const totalEl = panel.querySelector('.proc-vitae-total-val');
  if (totalEl) totalEl.textContent = String(total);
}

/**
 * Update the unskilled row in the right panel when the skill dropdown changes.
 */
function _updateUnskilledRow(container, key) {
  const right = container.querySelector(`.proc-feed-right[data-proc-key="${key}"]`);
  if (!right) return;
  const builder = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
  if (!builder) return;
  const skillSel  = builder.querySelector('.proc-pool-skill');
  if (!skillSel) return;
  const skillName = skillSel.value;
  const skillDots = parseInt(skillSel.selectedOptions[0]?.dataset.dots || '0', 10);
  const penalty   = _unskilledPenalty(skillName, skillDots);

  const row = right.querySelector('.proc-feed-unskilled-row');
  if (row) {
    if (penalty === 0) {
      row.style.display = 'none';
    } else {
      row.style.display = '';
      const valEl = row.querySelector('.proc-mod-unskilled-val');
      if (valEl) valEl.textContent = String(penalty);
    }
  }
}

/**
 * Update the 9-again badge and spec info labels in the feeding pool builder when skill changes.
 */
function _updateFeedBuilderMeta(container, key) {
  const metaEl = container.querySelector(`.dt-feed-builder-meta[data-proc-key="${key}"]`);
  if (!metaEl) return;
  const skillSel = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"] .proc-pool-skill`);
  if (!skillSel) return;
  const skillName = skillSel.value;
  if (!skillName) { metaEl.innerHTML = ''; return; }
  const sub = submissions.find(s => s._id === metaEl.dataset.subId);
  const char = sub ? findCharacter(sub.character_name, sub.player_name) : null;
  if (!char) { metaEl.innerHTML = ''; return; }
  const nineA = skNineAgain(char, skillName);
  const specs = skSpecs(char, skillName);
  const entry = _getQueueEntry(key);
  const review = entry ? (getEntryReview(entry) || {}) : {};
  const activeSpecs = review.active_feed_specs || [];

  // For project entries: 9-again lives in the sidebar; only spec toggles in meta
  if (entry?.source === 'project') {
    // Sync auto-detected nine_again to sidebar checkbox and pool total annotation
    const sidebarNineA = container.querySelector(`.proc-proj-9a[data-proc-key="${key}"]`);
    if (sidebarNineA) sidebarNineA.checked = nineA;
    const poolTotalEl = container.querySelector(`.proc-pool-total[data-proc-key="${key}"]`);
    if (poolTotalEl) poolTotalEl.dataset.nineAgain = nineA ? '1' : '0';
    let h = '';
    for (const sp of specs) {
      const checked = activeSpecs.includes(sp);
      const aoe = hasAoE(char, sp);
      h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${key}" data-spec="${esc(sp)}"${checked ? ' checked' : ''}>${esc(sp)} ${aoe ? '+2' : '+1'}</label>`;
    }
    for (const { spec: isSp, fromSkill } of isSpecs(char)) {
      if (fromSkill === skillName) continue; // already present as a native spec on this skill
      const checked = activeSpecs.includes(isSp);
      const aoe = hasAoE(char, isSp);
      h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${key}" data-spec="${esc(isSp)}"${checked ? ' checked' : ''}>${esc(isSp)} (${esc(fromSkill)}) ${aoe ? '+2' : '+1'}</label>`;
    }
    metaEl.innerHTML = h;
    metaEl.querySelectorAll('.dt-feed-spec-toggle').forEach(cb => {
      cb.addEventListener('change', async e => {
        e.stopPropagation();
        const entry2 = _getQueueEntry(cb.dataset.procKey);
        if (!entry2 || !cb.dataset.spec) return;
        const rev2 = getEntryReview(entry2) || {};
        const activeSpecs2 = [...(rev2.active_feed_specs || [])];
        if (cb.checked) { if (!activeSpecs2.includes(cb.dataset.spec)) activeSpecs2.push(cb.dataset.spec); }
        else { const i = activeSpecs2.indexOf(cb.dataset.spec); if (i !== -1) activeSpecs2.splice(i, 1); }
        const specBonus2 = activeSpecs2.reduce((sum, sp) => sum + (hasAoE(char, sp) ? 2 : 1), 0);
        await saveEntryReview(entry2, { active_feed_specs: activeSpecs2, pool_mod_spec: specBonus2 });
      });
    });
    return;
  }

  // Feeding: 9-again lives in the right panel; sync auto-detected state to sidebar checkbox
  const sidebarNineAFeed = container.querySelector(`.proc-proj-9a[data-proc-key="${key}"]`);
  if (sidebarNineAFeed && review.nine_again == null) {
    sidebarNineAFeed.checked = nineA;
  }
  let h = '';
  for (const sp of specs) {
    const checked = activeSpecs.includes(sp);
    const aoe = hasAoE(char, sp);
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${key}" data-spec="${esc(sp)}"${checked ? ' checked' : ''}>${esc(sp)} ${aoe ? '+2' : '+1'}</label>`;
  }
  for (const { spec: isSp, fromSkill } of isSpecs(char)) {
    if (fromSkill === skillName) continue; // already present as a native spec on this skill
    const checked = activeSpecs.includes(isSp);
    const aoe = hasAoE(char, isSp);
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${key}" data-spec="${esc(isSp)}"${checked ? ' checked' : ''}>${esc(isSp)} (${esc(fromSkill)}) ${aoe ? '+2' : '+1'}</label>`;
  }
  metaEl.innerHTML = h;
  // Wire spec toggles injected by _updateFeedBuilderMeta — no re-render; pool_mod_spec applied at roll time
  metaEl.querySelectorAll('.dt-feed-spec-toggle').forEach(cb => {
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const entry2 = _getQueueEntry(cb.dataset.procKey);
      if (!entry2 || !cb.dataset.spec) return;
      const rev2 = getEntryReview(entry2) || {};
      const activeSpecs2 = [...(rev2.active_feed_specs || [])];
      if (cb.checked) { if (!activeSpecs2.includes(cb.dataset.spec)) activeSpecs2.push(cb.dataset.spec); }
      else { const i = activeSpecs2.indexOf(cb.dataset.spec); if (i !== -1) activeSpecs2.splice(i, 1); }
      const specBonus2 = activeSpecs2.reduce((sum, sp) => sum + (hasAoE(char, sp) ? 2 : 1), 0);
      await saveEntryReview(entry2, { active_feed_specs: activeSpecs2, pool_mod_spec: specBonus2 });
    });
  });
}

/**
 * Coordinator: recompute all pool builder displays for one entry in dependency order.
 * Sequence: unskilled row → mod panel total (syncs builder mod input) → pool total.
 * Call this instead of individual helpers when the skill, attr, or disc has changed.
 */
function _refreshPoolBuilder(container, key) {
  _updateUnskilledRow(container, key);
  _updatePoolModTotal(container, key);
  _updatePoolTotal(container, key);
}

/**
 * Recompute and update the total display for a pool builder in the container.
 */
function _updatePoolTotal(container, key) {
  const builder  = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"]`);
  if (!builder) return;
  const attrSel  = builder.querySelector('.proc-pool-attr');
  const skillSel = builder.querySelector('.proc-pool-skill');
  const discSel  = builder.querySelector('.proc-pool-disc');
  const modInput = builder.querySelector('.proc-pool-mod-val');
  const totalEl  = builder.querySelector('.proc-pool-total');
  if (!attrSel || !skillSel || !totalEl) return;
  const attr     = attrSel.value;
  const skill    = skillSel.value;
  const disc     = discSel ? discSel.value : 'none';
  const modifier = parseInt(modInput ? modInput.value : '0', 10);
  const attrDots  = parseInt(attrSel.selectedOptions[0]?.dataset.dots  || '0', 10);
  const skillDots = parseInt(skillSel.selectedOptions[0]?.dataset.dots || '0', 10);
  const discDots  = (discSel && disc !== 'none') ? parseInt(discSel.selectedOptions[0]?.dataset.dots || '0', 10) : 0;
  const nineAgain = totalEl.dataset.nineAgain === '1';
  totalEl.textContent = _poolTotalDisplay(attr, attrDots, skill, skillDots, disc, discDots, modifier, skill, nineAgain);
}

/**
 * Render the right-side sidebar for a sorcery entry.
 * Dice Pool Modifiers (DT bonus + Mandragora Garden + equipment) + Roll + Status.
 */
/** Render the proc-val-status button row. buttons = [[statusValue, label], ...] */
function _renderValStatusButtons(key, poolStatus, buttons) {
  let h = '<div class="proc-val-status">';
  for (const [val, label] of buttons) {
    h += `<button class="proc-val-btn${poolStatus === val ? ` active ${val}` : ''}" data-proc-key="${esc(key)}" data-status="${val}">${label}</button>`;
  }
  h += '</div>';
  return h;
}

/**
 * Render a ± ticker row (label, dec button, display span, hidden input, inc button).
 * cssPrefix: base CSS class (e.g. 'proc-equip-mod' → -dec / -disp / -val / -inc).
 * displayStr: pre-formatted display value (e.g. '+2', '±0', '-1').
 * storedVal: numeric value written to the hidden input.
 */
function _renderTickerRow(key, label, cssPrefix, displayStr, storedVal) {
  let h = `<div class="proc-mod-row proc-mod-ticker-row"><span class="proc-mod-label">${esc(label)}</span>`;
  h += `<span class="proc-mod-ticker">`;
  h += `<button class="${cssPrefix}-dec" type="button" data-proc-key="${esc(key)}">\u2212</button>`;
  h += `<span class="${cssPrefix}-disp" data-proc-key="${esc(key)}">${displayStr}</span>`;
  h += `<input type="hidden" class="${cssPrefix}-val" data-proc-key="${esc(key)}" value="${storedVal}">`;
  h += `<button class="${cssPrefix}-inc" type="button" data-proc-key="${esc(key)}">+</button>`;
  h += `</span></div>`;
  return h;
}

/**
 * Render the right-side sidebar for a sphere merit action entry.
 * Shows: action mode + effect from matrix, equipment modifier, roll card (if rolled), status buttons.
 */
function _renderMeritRightPanel(entry, rev) {
  const key        = entry.key;
  const poolStatus = rev.pool_status || 'pending';
  const category   = entry.meritCategory || 'misc';
  const actionType = entry.actionType || 'misc';
  const dots       = entry.meritDots;
  const eqMod      = rev.pool_mod_equipment || 0;
  const eqStr      = eqMod === 0 ? '\u00B10' : eqMod > 0 ? `+${eqMod}` : String(eqMod);

  const matrixRow  = MERIT_MATRIX[category]?.[actionType] || null;
  const formula    = matrixRow?.poolFormula || 'none';
  const mode       = matrixRow?.mode || 'instant';
  const effect     = matrixRow?.effect || '';
  const effectAuto = matrixRow?.effectAuto || '';

  const basePool   = formula === 'dots2plus2' && dots != null ? (dots * 2) + 2 : null;
  const invSecrecy = actionType === 'investigate' ? (rev.inv_secrecy || '') : '';
  const invHasLead = actionType === 'investigate' ? rev.inv_has_lead : undefined; // true | false | undefined
  const invRow     = invSecrecy ? (INVESTIGATION_MATRIX.find(r => r.type === invSecrecy) || null) : null;
  const innateMod  = invRow ? invRow.innate : 0;
  const noLeadMod  = invRow && invHasLead === false ? invRow.noLead : 0;
  const totalPool  = basePool != null ? basePool + eqMod + innateMod + noLeadMod : null;
  const roll       = rev.roll || null;
  const isRolled   = formula === 'dots2plus2';
  const isAuto     = mode === 'auto';
  const isBlocked  = mode === 'blocked';

  const MODE_LABELS = { instant: 'Instant', contested: 'Contested', auto: 'Automatic', blocked: 'Cannot' };

  let h = `<div class="proc-feed-right" data-proc-key="${esc(key)}">`;

  // ── Action mode + effect panel ──
  h += `<div class="proc-feed-mod-panel proc-merit-effect-panel" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-merit-mode-row">`;
  h += `<span class="proc-mod-label">Action Mode</span>`;
  h += `<span class="proc-merit-mode-chip proc-merit-mode-${mode}">${MODE_LABELS[mode] || mode}</span>`;
  if (actionType === 'ambience_increase' || actionType === 'ambience_decrease') {
    const mLbl = entry.meritLabel || '';
    const mQual = entry.meritQualifier || '';
    h += `<span class="proc-merit-cat-chip proc-merit-cat-${esc(category)}">${esc(mLbl.toUpperCase())}</span>`;
    if (mQual) h += `<span class="proc-merit-qualifier">${esc(mQual)}</span>`;
  }
  h += `</div>`;
  if (effect) {
    h += `<div class="proc-merit-effect-row">`;
    h += `<span class="proc-mod-label">Effect</span>`;
    h += `<span class="proc-merit-effect-text">${esc(effect)}</span>`;
    h += `</div>`;
  }
  if (effectAuto) {
    h += `<div class="proc-merit-effect-row proc-merit-effect-auto">`;
    h += `<span class="proc-mod-label">Auto</span>`;
    h += `<span class="proc-merit-effect-text">${esc(effectAuto)}</span>`;
    h += `</div>`;
  }
  h += `</div>`; // proc-merit-effect-panel

  if (isBlocked) {
    // Cannot perform this action at all
    h += `<div class="proc-feed-right-section"><span class="dt-dim-italic">This merit cannot perform this action type.</span></div>`;
  } else if (isAuto) {
    // Auto effect — no roll needed
    h += `<div class="proc-feed-right-section proc-proj-roll-card">`;
    h += `<div class="proc-mod-panel-title">Automatic</div>`;
    h += `<span class="dt-dim-italic">No roll required — effect applies automatically.</span>`;
    h += `</div>`;
  } else if (isRolled) {
    // Equipment modifier ticker
    h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
    h += `<div class="proc-mod-panel-title">Dice Pool Modifiers</div>`;
    const poolDisplay = basePool != null ? `(${dots} \u00d7 2) + 2 = ${basePool} dice` : '\u2014';
    h += `<div class="proc-mod-row"><span class="proc-mod-label">Base pool</span><span class="proc-mod-static">${poolDisplay}</span></div>`;
    h += _renderTickerRow(key, 'Equipment / other', 'proc-equip-mod', eqStr, eqMod);
    if (actionType === 'investigate') {
      // Target Secrecy
      const innateStr = innateMod > 0 ? `+${innateMod}` : innateMod < 0 ? String(innateMod) : '';
      const innateCls = innateMod > 0 ? ' proc-mod-pos' : innateMod < 0 ? ' proc-mod-neg' : ' proc-mod-muted';
      h += `<div class="proc-mod-row">`;
      h += `<span class="proc-mod-label">Target Secrecy</span>`;
      h += `<select class="proc-recat-select proc-inv-secrecy-sel" data-proc-key="${esc(key)}">`;
      h += `<option value="">\u2014 Not set \u2014</option>`;
      for (const r of INVESTIGATION_MATRIX) {
        h += `<option value="${esc(r.type)}"${r.type === invSecrecy ? ' selected' : ''}>${esc(r.type)}</option>`;
      }
      h += `</select>`;
      if (innateStr) h += `<span class="proc-mod-val${innateCls}">${innateStr}</span>`;
      h += `</div>`;
      // Has Lead toggle
      const noLeadStr = noLeadMod < 0 ? String(noLeadMod) : '';
      h += `<div class="proc-mod-row">`;
      h += `<span class="proc-mod-label">Lead</span>`;
      h += `<div class="proc-inv-lead-btns">`;
      h += `<button class="proc-inv-lead-btn${invHasLead === true ? ' active' : ''}" data-proc-key="${esc(key)}" data-lead="true">Lead</button>`;
      h += `<button class="proc-inv-lead-btn${invHasLead === false ? ' active' : ''}" data-proc-key="${esc(key)}" data-lead="false">No Lead</button>`;
      h += `</div>`;
      if (noLeadStr) h += `<span class="proc-mod-val proc-mod-neg">${noLeadStr}</span>`;
      h += `</div>`;
      // Total
      const totalStr = totalPool != null ? `${totalPool} dice` : '\u2014';
      h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Total</span><span class="proc-mod-total-val">${totalStr}</span></div>`;
    }
    h += `</div>`; // mod panel

    // Roll card
    const rollLabel = totalPool != null ? ` \u2014 ${totalPool} dice` : '';
    h += `<div class="proc-feed-right-section proc-proj-roll-card">`;
    h += `<div class="proc-mod-panel-title">Roll${rollLabel}</div>`;
    if (totalPool != null && totalPool > 0) {
      h += `<button class="dt-btn proc-merit-roll-btn" data-proc-key="${esc(key)}" data-pool="${totalPool}">${roll ? 'Re-roll' : 'Roll'}</button>`;
      if (roll) {
        const dStr   = _formatDiceString(roll.dice_string);
        const suc    = roll.successes;
        const excTag = roll.exceptional ? ' \u00b7 Exceptional' : '';
        h += `<div class="proc-proj-roll-result">${esc(dStr)} \u2014 ${suc} success${suc !== 1 ? 'es' : ''}${excTag}</div>`;
      }
    } else {
      h += `<span class="dt-dim-italic">Merit dots unknown \u2014 set pool manually</span>`;
    }
    h += `</div>`;
  } else if (formula === 'none') {
    // Staff — fixed effect, no roll
    h += `<div class="proc-feed-right-section proc-proj-roll-card">`;
    h += `<div class="proc-mod-panel-title">Fixed Effect</div>`;
    h += `<span class="dt-dim-italic">No dice pool — effect applies as stated.</span>`;
    h += `</div>`;
  }

  // ── Status ──
  h += `<div class="proc-feed-right-section proc-feed-right-validation">`;
  h += `<div class="proc-mod-panel-title">Status</div>`;
  const meritBtns = [['pending', 'Pending'], ['resolved', 'Approved'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];
  h += _renderValStatusButtons(key, poolStatus, meritBtns);
  h += `</div>`;

  h += `</div>`; // proc-feed-right
  return h;
}

function _renderSorceryRightPanel(entry, char, sub, rev) {
  const key         = entry.key;
  const poolStatus  = rev.pool_status || 'pending';
  const selectedRite = rev.rite_override || entry.riteName || '';
  const ritInfo      = selectedRite ? _getRiteInfo(selectedRite) : null;

  const isCruac      = entry.tradition === 'Cruac';
  const mandUsed     = rev.ritual_mg_used || false;
  const mgMerit      = isCruac ? (char?.merits || []).find(m => m.name === 'Mandragora Garden') : null;
  const mgPool       = mgMerit ? (mgMerit.rating || mgMerit.dots || 0) + (mgMerit.bonus || 0) : 0;
  const mgDots       = (isCruac && mandUsed) ? mgPool : 0;
  const eqMod        = rev.pool_mod_equipment || 0;
  const eqStr        = eqMod === 0 ? '\u00B10' : eqMod > 0 ? `+${eqMod}` : String(eqMod);
  const base         = ritInfo ? _computeRitePool(char, ritInfo.attr, ritInfo.skill, ritInfo.disc) : 0;
  const total        = base + 3 + mgDots + eqMod;

  let h = `<div class="proc-feed-right" data-proc-key="${esc(key)}">`;

  // ── Dice Pool Modifiers ──
  h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">Dice Pool Modifiers</div>`;

  // +3 Downtime bonus (always on)
  h += `<div class="proc-mod-row"><span class="proc-mod-label">Downtime bonus</span><span class="proc-mod-static">+3</span></div>`;

  // Mandragora Garden toggle (Cruac only — only if this character has the merit)
  if (isCruac && mgPool > 0) {
    h += `<div class="proc-mod-row">`;
    h += `<label class="proc-pool-rote-label proc-feed-rote-right">`;
    h += `<input type="checkbox" class="proc-ritual-mg-toggle" data-proc-key="${esc(key)}"${mandUsed ? ' checked' : ''}> Mandragora Garden (+${mgPool})`;
    h += `</label></div>`;
  }

  // Equipment / other ticker
  h += _renderTickerRow(key, 'Equipment / other', 'proc-equip-mod', eqStr, eqMod);

  h += `</div>`; // proc-feed-mod-panel

  // ── Roll card ──
  const ritRoll    = rev.ritual_roll || null;
  const canRoll    = !!ritInfo;
  h += `<div class="proc-feed-right-section proc-proj-roll-card">`;
  h += `<div class="proc-mod-panel-title">Roll${canRoll ? ` \u2014 ${total} dice \u00b7 target ${ritInfo.target}` : ''}</div>`;
  if (canRoll) {
    h += `<button class="dt-btn proc-ritual-roll-btn" data-proc-key="${esc(key)}">${ritRoll ? 'Re-roll' : 'Roll'}</button>`;
    if (ritRoll) {
      const hit    = ritRoll.successes >= (ritInfo.target || 1);
      const dStr   = _formatDiceString(ritRoll.dice_string);
      const suc    = ritRoll.successes;
      const excTag = ritRoll.exceptional ? ' \u00b7 Exceptional' : '';
      h += `<div class="proc-proj-roll-result${hit ? '' : ' proc-ritual-fail'}">${esc(dStr)} ${suc} success${suc !== 1 ? 'es' : ''}${hit ? ` \u2014 Potency ${suc}` : ' \u2014 no effect'}${excTag}</div>`;
    }
  } else {
    h += `<span class="dt-dim-italic dt-hint">Select a rite first</span>`;
  }
  h += `</div>`;

  // ── Validation Status ──
  h += `<div class="proc-feed-right-section proc-feed-right-validation">`;
  h += `<div class="proc-mod-panel-title">Status</div>`;
  h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']]);
  h += `</div>`;

  h += `</div>`; // proc-feed-right
  return h;
}

/**
 * Render the right-side sidebar for a project/ambience entry (feature.59).
 * Dice Pool Modifiers (equipment only) + Success Modifier + Rote + Validation Status.
 */
function _renderProjRightPanel(entry, char, rev) {
  const key = entry.key;
  // Always derive pool expression from current effective character stats (dots + bonus)
  const poolValidated = _refreshPoolExpr(rev.pool_validated || '', char);
  const poolStatus    = rev.pool_status    || 'pending';

  const eqMod = rev.pool_mod_equipment !== undefined ? rev.pool_mod_equipment : 0;
  const eqStr = eqMod === 0 ? '\u00B10' : eqMod > 0 ? `+${eqMod}` : String(eqMod);
  const poolModTotalStr = eqStr;

  const succMod = rev.succ_mod_manual !== undefined ? rev.succ_mod_manual : 0;
  const succStr = succMod === 0 ? '\u00B10' : succMod > 0 ? `+${succMod}` : String(succMod);

  let h = `<div class="proc-feed-right" data-proc-key="${esc(key)}">`;

  // ── Dice Pool Modifiers (equipment only) ──
  h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}" data-fg="">`;
  h += `<div class="proc-mod-panel-title">Dice Pool Modifiers</div>`;
  h += _renderTickerRow(key, 'Equipment / other', 'proc-equip-mod', eqStr, eqMod);
  h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Total</span>`;
  h += `<span class="proc-mod-total-val" data-proc-key="${esc(key)}">${poolModTotalStr}</span>`;
  h += `</div>`;
  h += `</div>`; // proc-feed-mod-panel

  // ── Success Modifier ──
  h += `<div class="proc-proj-succ-panel" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">Success Modifier</div>`;
  h += _renderTickerRow(key, 'Manual adj.', 'proc-succmod', succStr, succMod);
  h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Net modifier</span>`;
  h += `<span class="proc-proj-succ-total-val" data-proc-key="${esc(key)}">${succStr}</span>`;
  h += `</div>`;
  h += `</div>`; // proc-proj-succ-panel

  // ── Roll toggles: Rote, 9-Again, 8-Again ──
  const isRote        = rev.rote        || false;
  const eightAgainState = rev.eight_again || false;
  // Auto-detect nine_again from the character's validated skill — only when not explicitly saved
  let nineAgainState;
  if (rev.nine_again != null) {
    nineAgainState = rev.nine_again;
  } else {
    nineAgainState = false;
    if (char && poolValidated) {
      const _rppDiscs = _charDiscsArray(char).filter(d => d.dots > 0).map(d => d.name);
      const _rppParsed = _parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, _rppDiscs);
      if (_rppParsed?.skill) nineAgainState = skNineAgain(char, _rppParsed.skill);
    }
  }
  h += `<div class="proc-feed-right-section proc-feed-toggles-row">`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-pool-rote" data-proc-key="${esc(key)}"${isRote ? ' checked' : ''}> Rote Action</label>`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-proj-9a" data-proc-key="${esc(key)}"${nineAgainState ? ' checked' : ''}> 9-Again</label>`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-proj-8a" data-proc-key="${esc(key)}"${eightAgainState ? ' checked' : ''}> 8-Again</label>`;
  h += `</div>`;

  // ── Validation Status ──
  h += `<div class="proc-feed-right-section proc-feed-right-validation">`;
  h += `<div class="proc-mod-panel-title">Validation Status</div>`;
  h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']]);
  // Committed pool expression with active specs
  const _activeProjSpecs = rev.active_feed_specs || [];
  let displayPool = poolValidated;
  if (poolValidated && _activeProjSpecs.length > 0) {
    const _eqIdx = poolValidated.lastIndexOf('=');
    if (_eqIdx !== -1) {
      const _base = poolValidated.slice(0, _eqIdx).trim();
      const _tot  = parseInt(poolValidated.slice(_eqIdx + 1).trim()) || 0;
      const specTotal = _activeProjSpecs.reduce((s, sp) => s + (char && hasAoE(char, sp) ? 2 : 1), 0);
      const specLabel = _activeProjSpecs.map(sp => `${sp} +${char && hasAoE(char, sp) ? 2 : 1}`).join(', ');
      displayPool = `${_base} + ${specLabel} = ${_tot + specTotal}`;
    }
  }
  h += `<div class="proc-feed-committed-pool" data-proc-key="${esc(key)}">${displayPool ? esc(displayPool) : '<span class="dt-dim-italic">Not yet committed</span>'}</div>`;
  // Validation notation: show active flags when validated
  if (poolStatus === 'validated') {
    const notes = [];
    if (isRote) notes.push('Rote');
    if (nineAgainState) notes.push('9-Again');
    if (eightAgainState) notes.push('8-Again');
    if (notes.length > 0) {
      h += `<div class="proc-proj-val-notation">${esc(notes.join(' \u00B7 '))}</div>`;
    }
  }
  if (poolValidated) h += `<button class="dt-btn proc-pool-clear-btn" data-proc-key="${esc(key)}">Clear Pool</button>`;
  h += `</div>`;

  // ── Roll card ──
  const projRoll = rev.roll || null;
  const showRollBtn = poolStatus === 'validated' || !!projRoll;
  h += `<div class="proc-feed-right-section proc-proj-roll-card">`;
  h += `<div class="proc-mod-panel-title">Roll</div>`;
  if (showRollBtn) {
    const rollLabel = projRoll ? 'Re-roll' : 'Roll';
    h += `<button class="dt-btn proc-proj-roll-btn" data-proc-key="${esc(key)}" data-pool-validated="${esc(poolValidated)}">${rollLabel}</button>`;
  } else {
    h += `<span class="dt-dim-italic dt-hint">Validate pool first</span>`;
  }
  if (projRoll) {
    const diceStr = _formatDiceString(projRoll.dice_string);
    const suc = projRoll.successes;
    const excTag = projRoll.exceptional ? ' \u2014 Exceptional' : '';
    h += `<div class="proc-proj-roll-result">${esc(diceStr)} ${suc} success${suc !== 1 ? 'es' : ''}${excTag}</div>`;
  }
  h += `</div>`;

  // ── Review section (all personal project actions — feature.66 extended) ──
  const stResponse = rev.st_response || '';
  const responseStatus = rev.response_status || '';
  const reviewedBy = rev.response_reviewed_by || '';
  if (stResponse) {
    h += `<div class="proc-response-review-section">`;
    if (responseStatus === 'reviewed') {
      h += `<div class="proc-response-reviewed-label">Reviewed by ${esc(reviewedBy)}</div>`;
    } else {
      h += `<button class="dt-btn proc-response-review-btn" data-proc-key="${esc(key)}">Mark reviewed</button>`;
    }
    h += `</div>`;
  }

  h += `</div>`; // proc-feed-right
  return h;
}

/**
 * Render the right-side modifier panel for a feeding entry (Tasks 2 & 3, feature.51).
 * @param {object} entry - Processing queue entry
 * @param {object|null} char - Character document (may be null)
 * @param {object} rev - feeding_review fields
 */
function _renderFeedRightPanel(entry, char, rev) {
  const key = entry.key;

  // ── Pool modifier panel data ──
  const fg = (char?.merits || []).find(m => m.name === 'Feeding Grounds');
  const fgDice = fg ? (fg.rating || 0) : null; // null = char not loaded

  // Always derive pool expression from current effective character stats (dots + bonus)
  const poolValidated = _refreshPoolExpr(rev.pool_validated || '', char);
  let initSkillName = '', initSkillDots = 0;
  if (poolValidated && char) {
    const charDiscs0 = _charDiscsArray(char).filter(d => d.dots > 0).map(d => d.name);
    const parsed0 = _parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, charDiscs0);
    if (parsed0?.skill) {
      initSkillName = parsed0.skill;
      initSkillDots = skTotal(char, initSkillName) || 0;
    }
  }
  const initUnskilled = _unskilledPenalty(initSkillName, initSkillDots);

  const eqMod = rev.pool_mod_equipment !== undefined ? rev.pool_mod_equipment : 0;
  const eqStr = eqMod === 0 ? '\u00B10' : eqMod > 0 ? `+${eqMod}` : String(eqMod);
  const poolModTotal = (fgDice ?? 0) + initUnskilled + eqMod;
  const poolModTotalStr = poolModTotal === 0 ? '\u00B10' : poolModTotal > 0 ? `+${poolModTotal}` : String(poolModTotal);

  // fgDice data attr: '' when char null (so live update can detect "unknown")
  const fgDataAttr = fgDice !== null ? String(fgDice) : '';
  const fgDisplay  = fgDice !== null ? (fgDice > 0 ? `+${fgDice}` : String(fgDice)) : '\u2014';

  let h = `<div class="proc-feed-right" data-proc-key="${esc(key)}">`;

  // ── Dice Pool Modifiers ──
  h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}" data-fg="${esc(fgDataAttr)}">`;
  h += `<div class="proc-mod-panel-title">Dice Pool Modifiers</div>`;
  // Feeding Grounds row
  h += `<div class="proc-mod-row"><span class="proc-mod-label">Feeding Grounds</span><span class="proc-mod-val${fgDice !== null && fgDice > 0 ? ' proc-mod-pos' : ''}">${fgDisplay}</span></div>`;
  // Unskilled penalty row (hidden when 0)
  const unskilledDisplay = initUnskilled !== 0 ? String(initUnskilled) : '0';
  h += `<div class="proc-feed-unskilled-row proc-mod-row" data-proc-key="${esc(key)}" style="${initUnskilled === 0 ? 'display:none' : ''}">`;
  h += `<span class="proc-mod-label">Unskilled penalty</span>`;
  h += `<span class="proc-mod-val proc-mod-neg proc-mod-unskilled-val">${unskilledDisplay}</span>`;
  h += `</div>`;
  // Equipment ticker
  h += _renderTickerRow(key, 'Equipment / other', 'proc-equip-mod', eqStr, eqMod);
  // Total
  h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Total</span>`;
  h += `<span class="proc-mod-total-val" data-proc-key="${esc(key)}">${poolModTotalStr}</span>`;
  h += `</div>`;
  h += `</div>`; // proc-feed-mod-panel

  // ── Vitae Tally ──
  const herd = (char?.merits || []).find(m => m.name === 'Herd');
  // Include SSJ and Flock bonuses; fall back to stored rating for old-schema chars
  const herdVitae = char
    ? (domMeritContrib(char, 'Herd') || (herd ? (herd.rating || 0) : 0))
    : null;

  const hasOoF = (char?.powers || []).some(p => p.category === 'pact' && p.name === 'Oath of Fealty');
  const oofVitae = hasOoF ? Math.max(char.status?.covenant || 0, char._ots_covenant_bonus || 0) : 0;

  // Ambience: use best (highest ambienceMod) territory the character actually fed in
  const terrList = (cachedTerritories && cachedTerritories.length) ? cachedTerritories : TERRITORY_DATA;
  const feedSub = submissions.find(s => s._id === entry.subId);
  const fedTerrKeys = feedSub ? _getSubFedTerrs(feedSub) : new Set();

  let bestTerrLabel = null;
  let ambienceVitae = null;
  for (const csvKey of fedTerrKeys) {
    const mt = MATRIX_TERRS.find(m => m.csvKey === csvKey);
    if (!mt || !mt.ambienceKey) continue;
    const tid = TERRITORY_SLUG_MAP[mt.csvKey] ?? null;
    const confirmedAmb = tid ? currentCycle?.confirmed_ambience?.[tid] : null;
    let mod = null;
    if (confirmedAmb != null) {
      mod = confirmedAmb.ambienceMod ?? 0;
    } else {
      const tr = terrList.find(t =>
        t.id === tid || t.name === mt.ambienceKey
      );
      mod = tr?.ambienceMod ?? null;
    }
    if (mod !== null && (ambienceVitae === null || mod > ambienceVitae)) {
      ambienceVitae = mod;
      bestTerrLabel = mt.label;
    }
  }
  // Fallback: if no fed territories resolved, use primaryTerr as before
  if (ambienceVitae === null && entry.primaryTerr) {
    const normalizedTerrId = TERRITORY_SLUG_MAP[entry.primaryTerr] ?? entry.primaryTerr;
    const terrRec = terrList.find(t =>
      t.id === normalizedTerrId ||
      t.name === entry.primaryTerr ||
      t.name?.toLowerCase() === (entry.primaryTerr || '').replace(/_/g, ' ').toLowerCase()
    );
    const confirmedAmb = currentCycle?.confirmed_ambience?.[normalizedTerrId];
    ambienceVitae = confirmedAmb != null ? (confirmedAmb.ambienceMod ?? 0) : (terrRec?.ambienceMod ?? null);
    bestTerrLabel = entry.primaryTerr ? entry.primaryTerr.replace(/_/g, ' ') : null;
  }

  const ghoulCount = (char?.merits || []).filter(m =>
    m.name === 'Retainer' && (m.area || m.qualifier || '').toLowerCase().includes('ghoul')
  ).length;

  const vitaeMod  = rev.vitae_mod_manual !== undefined ? rev.vitae_mod_manual : 0;
  const vitaeRite = rev.vitae_rite_cost  !== undefined ? rev.vitae_rite_cost  : 0;
  const manStr    = vitaeMod === 0 ? '\u00B10' : vitaeMod > 0 ? `+${vitaeMod}` : String(vitaeMod);

  const autoSum = (herdVitae ?? 0) + oofVitae + (ambienceVitae ?? 0) - ghoulCount;
  const finalVitae = Math.max(0, autoSum + vitaeMod - vitaeRite);

  // data attrs for live recalculation
  const herdData      = herdVitae     !== null ? String(herdVitae)    : '';
  const ambienceData  = ambienceVitae !== null ? String(ambienceVitae): '';

  h += `<div class="proc-feed-vitae-panel" data-proc-key="${esc(key)}" data-herd="${esc(herdData)}" data-oof="${oofVitae}" data-ambience="${esc(ambienceData)}" data-ghouls="${ghoulCount}">`;
  h += `<div class="proc-mod-panel-title">Vitae Tally</div>`;

  // Herd
  const herdDisplay = herdVitae !== null ? `+${herdVitae}` : '\u2014';
  h += `<div class="proc-mod-row"><span class="proc-mod-label">Herd</span><span class="proc-mod-val${herdVitae !== null && herdVitae > 0 ? ' proc-mod-pos' : ''}">${herdDisplay}</span></div>`;

  // Feeding Grounds — does not contribute vitae
  h += `<div class="proc-mod-row"><span class="proc-mod-label">Feeding Grounds</span><span class="proc-mod-val proc-mod-muted">\u2014</span></div>`;

  // Oath of Fealty (only if character has it)
  if (hasOoF) {
    h += `<div class="proc-mod-row"><span class="proc-mod-label">Oath of Fealty</span><span class="proc-mod-val proc-mod-pos">+${oofVitae}</span></div>`;
  }

  // Territory ambience — always show, labelled with best fed territory name
  {
    const ambLabel = bestTerrLabel ? `Ambience (${bestTerrLabel})` : 'Ambience';
    if (ambienceVitae === null) {
      h += `<div class="proc-mod-row"><span class="proc-mod-label">${esc(ambLabel)}</span><span class="proc-mod-val proc-mod-muted">\u2014</span></div>`;
    } else {
      const ambSign = ambienceVitae > 0 ? '+' : '';
      h += `<div class="proc-mod-row"><span class="proc-mod-label">${esc(ambLabel)}</span><span class="proc-mod-val ${ambienceVitae > 0 ? 'proc-mod-pos' : ambienceVitae < 0 ? 'proc-mod-neg' : ''}">${ambSign}${ambienceVitae}</span></div>`;
    }
  }

  // Ghoul retainers (only if > 0)
  if (ghoulCount > 0) {
    h += `<div class="proc-mod-row"><span class="proc-mod-label">Ghoul retainers</span><span class="proc-mod-val proc-mod-neg">\u2212${ghoulCount}</span></div>`;
  }

  // Rite costs row (always shown with manual input)
  h += `<div class="proc-mod-row proc-mod-rite-row">`;
  h += `<span class="proc-mod-label">Rite costs</span>`;
  h += `<input type="number" class="proc-rite-cost-input dt-num-input-sm" min="0" data-proc-key="${esc(key)}" value="${vitaeRite}">`;
  h += `</div>`;

  // Manual adjustment ticker
  h += `<div class="proc-mod-row proc-mod-ticker-row"><span class="proc-mod-label">Manual adj.</span>`;
  h += `<span class="proc-mod-ticker">`;
  h += `<button class="proc-vitae-mod-dec" type="button" data-proc-key="${esc(key)}">\u2212</button>`;
  h += `<span class="proc-vitae-mod-disp" data-proc-key="${esc(key)}">${manStr}</span>`;
  h += `<input type="hidden" class="proc-vitae-mod-val" data-proc-key="${esc(key)}" value="${vitaeMod}">`;
  h += `<button class="proc-vitae-mod-inc" type="button" data-proc-key="${esc(key)}">+</button>`;
  h += `</span></div>`;

  // Final vitae total
  h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Final Vitae</span>`;
  h += `<span class="proc-vitae-total-val" data-proc-key="${esc(key)}">${finalVitae}</span>`;
  h += `</div>`;

  h += `</div>`; // proc-feed-vitae-panel

  // ── Roll toggles: Rote, 9-Again, 8-Again ──
  const feedSubR = submissions.find(s => s._id === entry.subId);
  const isRote = entry.feedRote || feedSubR?.st_review?.feeding_rote || false;
  const eightAgainStateFeed = rev.eight_again || false;
  let nineAgainStateFeed;
  if (rev.nine_again != null) {
    nineAgainStateFeed = rev.nine_again;
  } else {
    nineAgainStateFeed = false;
    if (poolValidated && char) {
      const _frdDiscs = _charDiscsArray(char).filter(d => d.dots > 0).map(d => d.name);
      const _frdParsed = _parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, _frdDiscs);
      if (_frdParsed?.skill) nineAgainStateFeed = skNineAgain(char, _frdParsed.skill);
    }
  }
  h += `<div class="proc-feed-right-section proc-feed-toggles-row">`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-pool-rote" data-proc-key="${esc(key)}"${isRote ? ' checked' : ''}> Rote Action</label>`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-proj-9a" data-proc-key="${esc(key)}"${nineAgainStateFeed ? ' checked' : ''}> 9-Again</label>`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-proj-8a" data-proc-key="${esc(key)}"${eightAgainStateFeed ? ' checked' : ''}> 8-Again</label>`;
  h += `</div>`;

  // ── Validation Status ──
  const poolStatus = rev.pool_status || 'pending';
  h += `<div class="proc-feed-right-section proc-feed-right-validation">`;
  h += `<div class="proc-mod-panel-title">Validation Status</div>`;
  h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['validated', 'Validated'], ['no_feed', 'No Valid Feeding']]);
  // Committed pool expression display — augmented with active spec names if any
  const _activeFeedSpecs = rev.active_feed_specs || [];
  let displayPool = poolValidated;
  if (poolValidated && _activeFeedSpecs.length > 0) {
    const _eqIdx = poolValidated.lastIndexOf('=');
    if (_eqIdx !== -1) {
      const _base = poolValidated.slice(0, _eqIdx).trim();
      const _tot  = parseInt(poolValidated.slice(_eqIdx + 1).trim()) || 0;
      const specTotal = _activeFeedSpecs.reduce((s, sp) => s + (char && hasAoE(char, sp) ? 2 : 1), 0);
      const specLabel = _activeFeedSpecs.map(sp => `${sp} +${char && hasAoE(char, sp) ? 2 : 1}`).join(', ');
      displayPool = `${_base} + ${specLabel} = ${_tot + specTotal}`;
    }
  }
  h += `<div class="proc-feed-committed-pool" data-proc-key="${esc(key)}">${displayPool ? esc(displayPool) : '<span class="dt-dim-italic">Not yet committed</span>'}</div>`;
  if (poolValidated) {
    const feedNotes = [];
    if (isRote) feedNotes.push('Rote');
    if (nineAgainStateFeed) feedNotes.push('9-Again');
    if (eightAgainStateFeed) feedNotes.push('8-Again');
    if (feedNotes.length > 0) h += `<div class="proc-proj-val-notation">${esc(feedNotes.join(' \u00B7 '))}</div>`;
    h += `<button class="dt-btn proc-pool-clear-btn" data-proc-key="${esc(key)}">Clear Pool</button>`;
  }

  h += `</div>`;

  h += `</div>`; // proc-feed-right
  return h;
}

/** Render the expanded detail panel for a single action row. */
function renderActionPanel(entry, review) {
  const rev = review || {};
  const poolPlayer    = rev.pool_player    || entry.poolPlayer || '';
  const poolValidated = rev.pool_validated || '';
  const poolStatus    = rev.pool_status    || 'pending';
  const thread        = rev.notes_thread   || [];
  const feedback      = rev.player_feedback || '';
  const isSorcery        = entry.source === 'sorcery';
  const isAmbienceMerit  = entry.source === 'merit' && (entry.actionType === 'ambience_increase' || entry.actionType === 'ambience_decrease');

  // Hoist char lookup for feeding entries (needed by right panel and pool builder)
  let feedSub = null;
  let feedChar = null;
  if (entry.source === 'feeding') {
    feedSub = submissions.find(s => s._id === entry.subId) || null;
    const charIdStr   = feedSub?.character_id ? String(feedSub.character_id) : null;
    const charNameKey = (feedSub?.character_name || '').toLowerCase().trim();
    feedChar =
      (charIdStr && characters.find(ch => String(ch._id) === charIdStr)) ||
      charMap.get(charNameKey) ||
      null;
  }

  // Hoist char lookup for project entries
  let projSub = null;
  let projChar = null;
  if (entry.source === 'project') {
    projSub = submissions.find(s => s._id === entry.subId) || null;
    const charIdStr   = projSub?.character_id ? String(projSub.character_id) : null;
    const charNameKey = (projSub?.character_name || '').toLowerCase().trim();
    projChar =
      (charIdStr && characters.find(ch => String(ch._id) === charIdStr)) ||
      charMap.get(charNameKey) ||
      null;
  }

  // Hoist char lookup for sorcery entries
  let sorcSub = null;
  let sorcChar = null;
  if (isSorcery) {
    sorcSub = submissions.find(s => s._id === entry.subId) || null;
    const charIdStr   = sorcSub?.character_id ? String(sorcSub.character_id) : null;
    const charNameKey = (sorcSub?.character_name || '').toLowerCase().trim();
    sorcChar =
      (charIdStr && characters.find(ch => String(ch._id) === charIdStr)) ||
      charMap.get(charNameKey) ||
      null;
  }

  // Hoist char lookup for merit entries
  let meritEntSub = null;
  let meritEntChar = null;
  if (entry.source === 'merit') {
    meritEntSub = submissions.find(s => s._id === entry.subId) || null;
    const charIdStr   = meritEntSub?.character_id ? String(meritEntSub.character_id) : null;
    const charNameKey = (meritEntSub?.character_name || '').toLowerCase().trim();
    meritEntChar =
      (charIdStr && characters.find(ch => String(ch._id) === charIdStr)) ||
      charMap.get(charNameKey) ||
      null;
  }

  let h = `<div class="proc-action-detail" data-proc-key="${esc(entry.key)}">`;

  // ── Reminder badges (non-sorcery target actions) ──
  const actionKey = entryActionKey(entry);
  if (actionKey) {
    const badges = cycleReminders.filter(r =>
      r.targets && r.targets.some(t => t.sub_id === entry.subId && t.action_key === actionKey)
    );
    for (const r of badges) {
      h += `<div class="proc-reminder-badge">\u2691 ${esc(r.source_rite)} (${esc(r.source_tradition)}) \u2014 ${esc(r.text)}</div>`;
    }
  }

  // Ritual result note reminder (sorcery — shown at top of every expansion as a reminder)
  if (isSorcery && rev.ritual_result_note) {
    h += `<div class="proc-reminder-badge proc-ritual-note-banner">\u2731 ${esc(rev.ritual_result_note)}</div>`;
  }


  // ── Merit action previous roll result (suppressed for auto-mode ambience actions) ──
  if (entry.source === 'merit' && !isAmbienceMerit) {
    const meritSub  = submissions.find(s => s._id === entry.subId);
    const meritRoll = meritSub?.merit_actions_resolved?.[entry.actionIdx]?.roll;
    if (meritRoll) {
      h += `<div class="proc-feed-roll-result">\u2713 Rolled: ${esc(String(meritRoll.successes))} success${meritRoll.successes !== 1 ? 'es' : ''}${meritRoll.exceptional ? ' \u2014 exceptional' : ''}</div>`;
    }
  }

  // ── Two-column layout wrapper (feeding + project + sorcery + merit) ──
  if (entry.source === 'feeding' || entry.source === 'project' || isSorcery || entry.source === 'merit') h += `<div class="proc-feed-layout"><div class="proc-feed-left">`;

  // ── Merit-specific detail display (inside left column) ──
  if (entry.source === 'merit') {
    const mCat       = entry.meritCategory || 'misc';
    const mLabel     = entry.meritLabel    || '';
    const mDots      = entry.meritDots;
    const mQual      = entry.meritQualifier || '';
    const mOutcome   = entry.meritDesiredOutcome || '';
    const mDesc      = entry.description || '';
    const mDotsStr   = mDots != null ? '\u25CF'.repeat(mDots) : '';

    if (!isAmbienceMerit) {
      h += '<div class="proc-merit-header">';
      h += `<span class="proc-merit-cat-chip proc-merit-cat-${esc(mCat)}">${esc(mLabel.toUpperCase())}</span>`;
      if (mQual)    h += `<span class="proc-merit-qualifier">${esc(mQual)}</span>`;
      if (mDotsStr) h += `<span class="proc-merit-dots">${esc(mDotsStr)}</span>`;
      h += '</div>';
    }

    {
      const outcomeVal = rev?.desired_outcome ?? mOutcome;
      const descVal    = rev?.description     ?? mDesc;
      h += `<div class="proc-feed-desc-card">`;
      h += `<div class="proc-feed-desc-card-hd"><span class="proc-detail-label">Details</span><button class="dt-btn proc-feed-desc-edit-btn" data-proc-key="${esc(entry.key)}">Edit</button></div>`;
      h += `<div class="proc-feed-desc-view">`;
      if (outcomeVal) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Desired Outcome</span> ${esc(outcomeVal)}</div>`;
      if (descVal)    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Description</span> ${esc(descVal)}</div>`;
      if (!outcomeVal && !descVal) h += `<div class="proc-proj-field proc-feed-desc-empty">\u2014 No details recorded</div>`;
      h += `</div>`;
      h += `<div class="proc-feed-desc-edit" style="display:none">`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Desired Outcome</span><input type="text" class="proc-detail-input proc-merit-outcome-input" data-proc-key="${esc(entry.key)}" value="${esc(outcomeVal)}"></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Description</span><textarea class="proc-detail-ta proc-merit-desc-ta" data-proc-key="${esc(entry.key)}" rows="4">${esc(descVal)}</textarea></div>`;
      h += `<div class="proc-feed-desc-actions"><button class="dt-btn proc-merit-desc-save-btn" data-proc-key="${esc(entry.key)}">Save</button><button class="dt-btn proc-feed-desc-cancel-btn" data-proc-key="${esc(entry.key)}">Cancel</button></div>`;
      h += `</div>`;
      h += `</div>`;
    }
  }

  // ── Project-specific detail display (inside left column) ──
  if (entry.source === 'project') {
    const projSub2 = submissions.find(s => s._id === entry.subId);
    const xpTrait  = projSub2?.responses?.[`project_${entry.projSlot}_xp_trait`] || '';
    const xpAmount = projSub2?.responses?.[`project_${entry.projSlot}_xp`] || '';

    // ── Editable Details card ──
    {
      const titleVal   = rev.title          ?? entry.projTitle   ?? '';
      const outcomeVal = rev.desired_outcome ?? entry.projOutcome ?? '';
      const descVal    = rev.description    ?? entry.description ?? '';
      const meritsVal  = rev.merits_bonuses ?? entry.projMerits  ?? '';
      const playerPoolVal = poolPlayer || '';

      h += `<div class="proc-feed-desc-card">`;
      h += `<div class="proc-feed-desc-card-hd"><span class="proc-detail-label">Details</span><button class="dt-btn proc-feed-desc-edit-btn" data-proc-key="${esc(entry.key)}">Edit</button></div>`;

      // View mode
      h += `<div class="proc-feed-desc-view">`;
      if (titleVal)      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Title</span> ${esc(titleVal)}</div>`;
      if (outcomeVal)    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Desired Outcome</span> ${esc(outcomeVal)}</div>`;
      if (descVal)       h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Description</span> ${esc(descVal)}</div>`;
      if (playerPoolVal) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Player's Pool</span> ${esc(playerPoolVal)}</div>`;
      if (meritsVal)     h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Merits &amp; Bonuses</span> ${esc(meritsVal)}</div>`;
      if (!titleVal && !outcomeVal && !descVal) h += `<div class="proc-proj-field proc-feed-desc-empty">\u2014 No details recorded</div>`;
      h += `</div>`;

      // Edit mode (hidden)
      h += `<div class="proc-feed-desc-edit" style="display:none">`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Title</span><input type="text" class="proc-detail-input proc-proj-title-input" data-proc-key="${esc(entry.key)}" value="${esc(titleVal)}"></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Desired Outcome</span><input type="text" class="proc-detail-input proc-proj-outcome-input" data-proc-key="${esc(entry.key)}" value="${esc(outcomeVal)}"></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Description</span><textarea class="proc-detail-ta proc-feed-desc-ta" data-proc-key="${esc(entry.key)}" rows="4">${esc(descVal)}</textarea></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Player's Pool</span><input type="text" class="proc-detail-input proc-feed-pool-input" data-proc-key="${esc(entry.key)}" value="${esc(playerPoolVal)}"></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Merits &amp; Bonuses</span><input type="text" class="proc-detail-input proc-proj-merits-input" data-proc-key="${esc(entry.key)}" value="${esc(meritsVal)}"></div>`;
      h += `<div class="proc-feed-desc-actions"><button class="dt-btn proc-proj-desc-save-btn" data-proc-key="${esc(entry.key)}">Save</button><button class="dt-btn proc-feed-desc-cancel-btn" data-proc-key="${esc(entry.key)}">Cancel</button></div>`;
      h += `</div>`;
      h += `</div>`;

      // XP spend — kept outside the card (it's an approval item, not descriptive)
      if (xpTrait) {
        const xpLabel = xpAmount ? `XP Spend (${esc(String(xpAmount))} XP)` : 'XP Spend';
        h += `<div class="proc-proj-field proc-proj-xp"><span class="proc-feed-lbl">${xpLabel}</span> ${esc(xpTrait)}</div>`;
      }

      // Territory (read-only — set via territory pills elsewhere)
      if (entry.projTerritory) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Territory</span> ${esc(entry.projTerritory)}</div>`;
      // Characters Involved (read-only — structural, not editable here)
      if (entry.projCast) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Characters Involved</span> ${esc(entry.projCast)}</div>`;
    }

    // ── Action type recategorisation ──
    const isOverridden = entry.originalActionType && entry.originalActionType !== entry.actionType;
    h += `<div class="proc-recat-row">`;
    h += `<span class="proc-feed-lbl">Action Type</span>`;
    h += `<select class="proc-recat-select" data-proc-key="${esc(entry.key)}">`;
    for (const [val, lbl] of Object.entries(ACTION_TYPE_LABELS)) {
      h += `<option value="${esc(val)}"${entry.actionType === val ? ' selected' : ''}>${esc(lbl)}</option>`;
    }
    h += `</select>`;
    if (isOverridden) {
      h += `<span class="proc-recat-original">Player: ${esc(ACTION_TYPE_LABELS[entry.originalActionType] || entry.originalActionType)}</span>`;
    }
    if (entry.actionType === 'investigate') {
      const _invT = rev.investigate_target_char || '';
      h += `<span class="proc-feed-lbl">Target</span>`;
      h += `<select class="proc-recat-select proc-inv-char-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select \u2014</option>`;
      for (const c of [...characters].sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
        const lbl = sortName(c).replace(/\b\w/g, l => l.toUpperCase());
        h += `<option value="${esc(c.name || '')}"${c.name === _invT ? ' selected' : ''}>${esc(lbl)}</option>`;
      }
      h += `</select>`;
    } else if (entry.actionType === 'attack') {
      const _atkT = rev.attack_target_char || '';
      h += `<span class="proc-feed-lbl">Target</span>`;
      h += `<select class="proc-recat-select proc-attack-char-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select \u2014</option>`;
      for (const c of [...characters].sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
        const lbl = sortName(c).replace(/\b\w/g, l => l.toUpperCase());
        h += `<option value="${esc(c.name || '')}"${c.name === _atkT ? ' selected' : ''}>${esc(lbl)}</option>`;
      }
      h += `</select>`;
    } else if (entry.actionType === 'ambience_increase' || entry.actionType === 'ambience_decrease') {
      const _ambiSub = submissions.find(s => s._id === entry.subId);
      const _ambiCtx = String(entry.actionIdx);
      const _ambiTid = _ambiSub?.st_review?.territory_overrides?.[_ambiCtx] || '';
      h += _renderInlineTerrPills(entry.subId, _ambiCtx, _ambiTid);
    } else {
      // All other project action types get territory pills inline
      const _projCtx = String(entry.actionIdx);
      const _projTid = projSub?.st_review?.territory_overrides?.[_projCtx] || '';
      h += _renderInlineTerrPills(entry.subId, _projCtx, _projTid);
    }
    h += `</div>`;
    if (entry.actionType === 'attack') {
      const _atkChar = characters.find(c => c.name === (rev.attack_target_char || '')) || null;
      const _atkMerit = rev.attack_target_merit || '';
      h += `<div class="proc-recat-row" style="margin-top:4px;padding-top:4px;border-top:none">`;
      h += `<span class="proc-feed-lbl">Merit</span>`;
      h += `<select class="proc-recat-select proc-attack-merit-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select merit \u2014</option>`;
      if (_atkChar) {
        for (const m of [...(_atkChar.merits || [])].sort((a, b) => (a.name||'').localeCompare(b.name||''))) {
          const mRating = (m.rating || m.dots || 0) + (m.bonus || 0);
          const mQual   = m.qualifier ? ` (${m.qualifier})` : '';
          h += `<option value="${esc(m.name||'')}"${m.name === _atkMerit ? ' selected' : ''}>${esc(m.name||'')}${esc(mQual)} \u25CF${mRating}</option>`;
        }
      }
      h += `</select>`;
      h += `</div>`;
    }
  }

  // ── Action type recategorisation for merit/sphere entries ──
  if (entry.source === 'merit') {
    h += `<div class="proc-recat-row">`;
    h += `<span class="proc-feed-lbl">Action Type</span>`;
    h += `<select class="proc-recat-select" data-proc-key="${esc(entry.key)}">`;
    for (const [val, lbl] of Object.entries(ACTION_TYPE_LABELS)) {
      h += `<option value="${esc(val)}"${entry.actionType === val ? ' selected' : ''}>${esc(lbl)}</option>`;
    }
    h += `</select>`;
    // Action-type-specific extras (Target character or Protects merit selector)
    if (entry.actionType === 'investigate') {
      const _invT = rev.investigate_target_char || '';
      h += `<span class="proc-feed-lbl">Target</span>`;
      h += `<select class="proc-recat-select proc-inv-char-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select \u2014</option>`;
      for (const c of [...characters].sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
        const lbl = sortName(c).replace(/\b\w/g, l => l.toUpperCase());
        h += `<option value="${esc(c.name || '')}"${c.name === _invT ? ' selected' : ''}>${esc(lbl)}</option>`;
      }
      h += `</select>`;
    } else if (entry.actionType === 'attack') {
      const _atkT = rev.attack_target_char || '';
      h += `<span class="proc-feed-lbl">Target</span>`;
      h += `<select class="proc-recat-select proc-attack-char-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select \u2014</option>`;
      for (const c of [...characters].sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
        const lbl = sortName(c).replace(/\b\w/g, l => l.toUpperCase());
        h += `<option value="${esc(c.name || '')}"${c.name === _atkT ? ' selected' : ''}>${esc(lbl)}</option>`;
      }
      h += `</select>`;
    } else if (entry.actionType === 'hide_protect') {
      const _protName = rev?.protected_merit_name      ?? '';
      const _protQual = rev?.protected_merit_qualifier ?? '';
      const _allMerits = (meritEntChar?.merits || [])
        .slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      h += `<span class="proc-feed-lbl">Protects</span>`;
      h += `<select class="proc-recat-select proc-prot-merit-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select merit \u2014</option>`;
      for (const m of _allMerits) {
        const mQual   = m.qualifier || m.area || '';
        const mRating = (m.rating || m.dots || 0) + (m.bonus || 0);
        const mLabel  = mQual ? `${esc(m.name || '')} (${esc(mQual)})` : esc(m.name || '');
        const mDots   = '\u25CF'.repeat(mRating);
        const isSelected = (m.name || '') === _protName && mQual === _protQual;
        h += `<option value="${esc((m.name || '') + '|' + mQual)}"${isSelected ? ' selected' : ''}>${mLabel} ${mDots}</option>`;
      }
      h += `</select>`;
    }
    // Merit link dropdown — universal for all named-merit categories
    if (['allies', 'status', 'retainer', 'contacts', 'staff'].includes(entry.meritCategory)) {
      const _linkedQual   = rev?.linked_merit_qualifier ?? entry.meritQualifier ?? '';
      const _meritNameKey = (entry.meritLabel || '').toLowerCase();
      const _charMerits   = (meritEntChar?.merits || [])
        .filter(m => {
          const mName = (m.name || '').toLowerCase();
          return mName === _meritNameKey || _meritNameKey.includes(mName) || mName.includes(_meritNameKey);
        })
        .sort((a, b) => (a.qualifier || a.area || '').localeCompare(b.qualifier || b.area || ''));
      const _hasHWV = isAmbienceMerit && (meritEntChar?.merits || []).some(m => /honey with vinegar/i.test(m.name || ''));
      h += `<span class="proc-feed-lbl">Merit</span>`;
      h += `<select class="proc-recat-select proc-merit-link-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select \u2014</option>`;
      for (const m of _charMerits) {
        const mRating = (m.rating || m.dots || 0) + (m.bonus || 0);
        const mQual   = m.qualifier || m.area || '';
        const mLabel  = mQual ? `${esc(m.name || '')} (${esc(mQual)})` : esc(m.name || '');
        const mDots   = '\u25CF'.repeat(mRating);
        const sel     = mQual && mQual.toLowerCase() === _linkedQual.toLowerCase() ? ' selected' : '';
        h += `<option value="${esc(mQual)}"${sel}>${mLabel} ${mDots}</option>`;
      }
      h += `</select>`;
      if (_hasHWV) h += `<span class="proc-hwv-badge">Honey with Vinegar</span>`;
    }
    // Territory pills — allies/status/retainer actions (all action types)
    if (entry.isAlliesAction) {
      const _mCtx = `allies_${entry.actionIdx}`;
      const _mTid = meritEntSub?.st_review?.territory_overrides?.[_mCtx] || '';
      h += _renderInlineTerrPills(entry.subId, _mCtx, _mTid);
    }
    h += `</div>`;
    if (entry.actionType === 'attack') {
      const _atkChar = characters.find(c => c.name === (rev.attack_target_char || '')) || null;
      const _atkMerit = rev.attack_target_merit || '';
      h += `<div class="proc-recat-row" style="margin-top:4px;padding-top:4px;border-top:none">`;
      h += `<span class="proc-feed-lbl">Merit</span>`;
      h += `<select class="proc-recat-select proc-attack-merit-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select merit \u2014</option>`;
      if (_atkChar) {
        for (const m of [...(_atkChar.merits || [])].sort((a, b) => (a.name||'').localeCompare(b.name||''))) {
          const mRating = (m.rating || m.dots || 0) + (m.bonus || 0);
          const mQual   = m.qualifier ? ` (${m.qualifier})` : '';
          h += `<option value="${esc(m.name||'')}"${m.name === _atkMerit ? ' selected' : ''}>${esc(m.name||'')}${esc(mQual)} \u25CF${mRating}</option>`;
        }
      }
      h += `</select>`;
      h += `</div>`;
    }
  }

  // ── Sorcery details card (editable) — above connected characters ──
  if (isSorcery) {
    const sorcRawNotes    = sorcSub?.responses?.[`sorcery_${entry.actionIdx}_notes`]   || '';
    const sorcRawTargets  = sorcSub?.responses?.[`sorcery_${entry.actionIdx}_targets`] || entry.targetsText || '';
    const targetsVal      = rev.sorc_targets    ?? sorcRawTargets;
    const notesVal        = rev.sorc_notes      ?? sorcRawNotes;
    // ST overrides for tradition and rite name — fall back to submission values
    const traditionVal    = rev.sorc_tradition  ?? entry.tradition ?? '';
    // Rite: prefer ST-set name, then right-panel rite_override, skip blob if >60 chars
    const blobRite        = (entry.riteName && entry.riteName.length <= 60) ? entry.riteName : '';
    const riteVal         = rev.sorc_rite_name  ?? rev.rite_override ?? blobRite;
    const riteRaw         = entry.riteName || '\u2014';

    h += `<div class="proc-feed-desc-card">`;
    h += `<div class="proc-feed-desc-card-hd"><span class="proc-detail-label">Details</span><button class="dt-btn proc-feed-desc-edit-btn" data-proc-key="${esc(entry.key)}">Edit</button></div>`;
    // View mode (hidden when editing)
    h += `<div class="proc-feed-desc-view">`;
    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Tradition</span> ${esc(traditionVal || '\u2014')}</div>`;
    h += `<div class="proc-proj-field" title="${esc(riteRaw)}"><span class="proc-feed-lbl">Rite</span> ${esc(riteVal || '\u2014')}</div>`;
    if (targetsVal)       h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Targets</span> ${esc(targetsVal)}</div>`;
    if (notesVal)         h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Notes</span> ${esc(notesVal)}</div>`;
    if (entry.poolPlayer) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Player's Pool</span> ${esc(entry.poolPlayer)}</div>`;
    h += `</div>`;
    // Edit mode (hidden by default)
    h += `<div class="proc-feed-desc-edit" style="display:none">`;
    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Tradition</span><input type="text" class="proc-detail-input proc-sorc-tradition-input" data-proc-key="${esc(entry.key)}" value="${esc(traditionVal)}" placeholder="Cruac or Theban Sorcery\u2026"></div>`;
    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Rite</span><input type="text" class="proc-detail-input proc-sorc-rite-input" data-proc-key="${esc(entry.key)}" value="${esc(riteVal)}" placeholder="Rite name\u2026"></div>`;
    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Targets</span><input type="text" class="proc-detail-input proc-sorc-targets-input" data-proc-key="${esc(entry.key)}" value="${esc(targetsVal)}" placeholder="Target characters or area\u2026"></div>`;
    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Notes</span><textarea class="proc-detail-ta proc-sorc-notes-input" data-proc-key="${esc(entry.key)}" rows="3">${esc(notesVal)}</textarea></div>`;
    h += `<div class="proc-feed-desc-actions"><button class="dt-btn proc-sorc-desc-save-btn" data-proc-key="${esc(entry.key)}">Save</button><button class="dt-btn proc-feed-desc-cancel-btn" data-proc-key="${esc(entry.key)}">Cancel</button></div>`;
    h += `</div>`;
    h += `</div>`;
  }

  // ── Connected Characters (project + merit + sorcery) — inside left column, below description ──
  // Ambience merit actions are level-based automatic effects; no connected characters needed
  if (!isAmbienceMerit && (entry.source === 'project' || entry.source === 'merit' || isSorcery)) {
    const connectedChars = rev.connected_chars || [];
    const otherChars = [...new Set(
      submissions.map(s => {
        const ch = findCharacter(s.character_name, s.player_name);
        return ch ? (ch.moniker || ch.name) : (s.character_name || null);
      }).filter(Boolean).filter(n => n !== entry.charName)
    )].sort();
    if (otherChars.length > 0) {
      h += `<div class="proc-connected-section">`;
      h += `<div class="proc-detail-label">Connected Characters</div>`;
      h += `<div class="proc-connected-list">`;
      for (const charN of otherChars) {
        const chk = connectedChars.includes(charN) ? ' checked' : '';
        h += `<label class="proc-conn-char-lbl"><input type="checkbox" class="proc-conn-char-chk" data-proc-key="${esc(entry.key)}" data-char-name="${esc(charN)}"${chk}> ${esc(charN)}</label>`;
      }
      h += `</div>`;
      h += `</div>`;
    }
  }


  // ── Feeding-specific detail display ──
  if (entry.source === 'feeding') {
    if (entry.noMethod) {
      h += `<div class="proc-feed-no-method">No feeding method declared by player.</div>`;
    }
    // ── Details card: Description (editable) + Blood Type (editable) + Player's Submitted Pool ──
    {
      const resp         = feedSub?.responses || {};
      const isAppForm    = !!(resp.feed_attr);
      const nameVal      = rev.name        ?? '';
      const descVal      = rev.description ?? entry.feedDesc ?? '';
      const bloodTypeVal = rev.blood_type  ?? '';
      const bonusesVal   = rev.bonuses     ?? '';
      // Player's submitted pool string
      let playerPoolStr;
      if (isAppForm) {
        const pAttr  = resp.feed_attr || '';
        const pSkill = resp.feed_skill || '';
        const pDisc  = resp.feed_discipline || '';
        playerPoolStr = [pAttr, pSkill, pDisc].filter(Boolean).join(' + ') || '\u2014';
      } else {
        playerPoolStr = (entry.feedMethod === 'other' && (!poolPlayer || poolPlayer === 'Other') && entry.feedDesc)
          ? entry.feedDesc
          : (poolPlayer || '\u2014');
      }

      h += `<div class="proc-feed-desc-card">`;
      h += `<div class="proc-feed-desc-card-hd"><span class="proc-detail-label">Details</span><button class="dt-btn proc-feed-desc-edit-btn" data-proc-key="${esc(entry.key)}">Edit</button></div>`;
      // View mode
      h += `<div class="proc-feed-desc-view">`;
      if (nameVal)      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Name</span> ${esc(nameVal)}</div>`;
      if (descVal)      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Description</span> ${esc(descVal)}</div>`;
      if (bloodTypeVal) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Blood Type</span> ${esc(bloodTypeVal)}</div>`;
      if (!nameVal && !descVal && !bloodTypeVal) h += `<div class="proc-proj-field proc-feed-desc-empty">\u2014 No details recorded</div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Player's Pool</span> ${esc(playerPoolStr)}</div>`;
      if (bonusesVal) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Bonuses</span> ${esc(bonusesVal)}</div>`;
      h += `</div>`;
      // Edit mode (hidden)
      h += `<div class="proc-feed-desc-edit" style="display:none">`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Name</span><input type="text" class="proc-detail-input proc-feed-name-input" data-proc-key="${esc(entry.key)}" value="${esc(nameVal)}" placeholder="Short action name"></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Description</span><textarea class="proc-detail-ta proc-feed-desc-ta" data-proc-key="${esc(entry.key)}" rows="3">${esc(descVal)}</textarea></div>`;
      const _btOpts = ['Human', 'Animal', 'Kindred', 'Ghoul'];
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Blood Type</span><select class="proc-recat-select proc-feed-blood-sel" data-proc-key="${esc(entry.key)}">${_btOpts.map(o => `<option value="${o}"${bloodTypeVal === o ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Player's Pool</span><input type="text" class="proc-detail-input proc-feed-pool-input" data-proc-key="${esc(entry.key)}" value="${esc(poolPlayer || playerPoolStr)}"></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Bonuses</span><input type="text" class="proc-detail-input proc-feed-bonuses-input" data-proc-key="${esc(entry.key)}" value="${esc(bonusesVal)}" placeholder="e.g. Herd +2, Rote"></div>`;
      h += `<div class="proc-feed-desc-actions"><button class="dt-btn proc-feed-desc-save-btn" data-proc-key="${esc(entry.key)}">Save</button><button class="dt-btn proc-feed-desc-cancel-btn" data-proc-key="${esc(entry.key)}">Cancel</button></div>`;
      h += `</div>`;
      h += `</div>`;
    }
    // Territory pills row — feeding multi-select
    {
      const _feedOvrArr = Array.isArray(feedSub?.st_review?.territory_overrides?.feeding)
        ? feedSub.st_review.territory_overrides.feeding : [];
      const _feedSet = new Set(_feedOvrArr);
      h += `<div class="proc-recat-row">`;
      h += _renderInlineTerrPills(entry.subId, 'feeding', '', _feedSet);
      h += `</div>`;
    }

    // Previous roll result (use hoisted feedSub from top of function)
    const feedRoll = feedSub?.feeding_roll;
    if (feedRoll) {
      const roteTag = feedRoll.params?.rote ? ' (rote)' : '';
      h += `<div class="proc-feed-roll-result">\u2713 Rolled: ${esc(String(feedRoll.successes))} success${feedRoll.successes !== 1 ? 'es' : ''}${feedRoll.exceptional ? ' \u2014 exceptional' : ''}${roteTag}</div>`;
    }
  }

  // Pool row — feeding gets structured pool builder; others get free-text input
  if (entry.source === 'feeding') {
    // Use hoisted feedSub / feedChar from top of function
    const resp = feedSub?.responses || {};
    const char = feedChar;

    // ST Pool Builder — always rendered; dot values filled from char data when available
    {
      const charDiscs = _charDiscsArray(char).filter(d => d.dots > 0);
      const discNames = charDiscs.map(d => d.name);
      const allDiscNames = char ? discNames : KNOWN_DISCIPLINES;

      // Pre-populate from existing pool_validated
      let preAttr = '', preSkill = '', preDisc = 'none', preMod = 0, showParseRef = false;
      if (poolValidated) {
        const parsed = _parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, allDiscNames);
        if (parsed) {
          preAttr  = parsed.attr  || '';
          preSkill = parsed.skill || '';
          preDisc  = parsed.disc  || 'none';
          preMod   = parsed.modifier || 0;
        } else {
          showParseRef = true;
        }
      }

      const attrOptHtml = ['<option value="" data-dots="0">-- Attribute --</option>',
        ...ALL_ATTRS.map(a => {
          const dots = char ? (getAttrVal(char, a) || 0) : null;
          const sel  = a === preAttr ? ' selected' : '';
          const label = dots !== null ? `${esc(a)} (${dots})` : esc(a);
          return `<option value="${esc(a)}" data-dots="${dots ?? 0}"${sel}>${label}</option>`;
        })
      ].join('');

      const skillOptHtml = ['<option value="" data-dots="0">-- Skill --</option>',
        ...ALL_SKILLS.map(s => {
          const dots = char ? (skTotal(char, s) || 0) : null;
          const sel  = s === preSkill ? ' selected' : '';
          const label = dots !== null ? `${esc(s)} (${dots})` : esc(s);
          return `<option value="${esc(s)}" data-dots="${dots ?? 0}"${sel}>${label}</option>`;
        })
      ].join('');

      const discOptHtml = ['<option value="none" data-dots="0">None</option>',
        ...allDiscNames.map(name => {
          const d    = charDiscs.find(cd => cd.name === name);
          const dots = d ? d.dots : null;
          const sel  = name === preDisc ? ' selected' : '';
          const label = dots !== null ? `${esc(name)} (${dots})` : esc(name);
          return `<option value="${esc(name)}" data-dots="${dots ?? 0}"${sel}>${label}</option>`;
        })
      ].join('');

      // Compute initial pool modifier total from right-panel values (FG + equipment)
      // This mirrors what _renderFeedRightPanel computes so the pool total reflects modifiers on open
      const fg0 = (char?.merits || []).find(m => m.name === 'Feeding Grounds');
      const fgDice0 = fg0 ? (fg0.rating || 0) : 0;
      const eqMod0 = rev.pool_mod_equipment !== undefined ? rev.pool_mod_equipment : 0;
      const initFeedPoolMod = fgDice0 + eqMod0;
      // Use right-panel total as the modifier (overrides parsed preMod for display; preMod still used
      // for expression string restoration but display uses live panel total)
      const initModForDisplay = initFeedPoolMod;

      // Initial total display (AC 12: pass skillName for unskilled penalty)
      const initAttrDots  = preAttr  ? (char ? (getAttrVal(char, preAttr) || 0) : 0) : 0;
      const initSkillDots = preSkill ? (char ? (skTotal(char, preSkill) || 0) : 0) : 0;
      const initDiscDots  = (preDisc && preDisc !== 'none') ? (charDiscs.find(d => d.name === preDisc)?.dots || 0) : 0;
      const initTotalStr  = _poolTotalDisplay(preAttr, initAttrDots, preSkill, initSkillDots, preDisc, initDiscDots, initModForDisplay, preSkill);

      h += `<div class="proc-pool-builder" data-proc-key="${esc(entry.key)}">`;
      h += `<div class="proc-detail-label">ST Pool Builder${!char ? ' <span class="dt-hint">(dot values unavailable \u2014 character not loaded)</span>' : ''}</div>`;
      if (showParseRef) {
        h += `<div class="proc-pool-parse-ref">Could not restore selection \u2014 previous: "${esc(poolValidated)}"</div>`;
      }
      h += '<div class="proc-pool-builder-selects">';
      h += `<select class="proc-pool-attr" data-proc-key="${esc(entry.key)}">${attrOptHtml}</select>`;
      h += `<span class="proc-pool-plus">+</span>`;
      h += `<select class="proc-pool-skill" data-proc-key="${esc(entry.key)}">${skillOptHtml}</select>`;
      h += `<span class="proc-pool-plus">+</span>`;
      h += `<select class="proc-pool-disc" data-proc-key="${esc(entry.key)}">${discOptHtml}</select>`;
      h += '</div>'; // proc-pool-builder-selects
      // Hidden modifier input — receives right-panel pool mod total so _readBuilderExpr includes it
      h += `<input type="hidden" class="proc-pool-mod-val" data-proc-key="${esc(entry.key)}" value="${initModForDisplay}">`;
      h += `<div class="proc-pool-total" data-proc-key="${esc(entry.key)}">${esc(initTotalStr)}</div>`;
      // Skill metadata: spec checkboxes only (9-again lives in the right panel)
      const _fbSp  = char && preSkill ? skSpecs(char, preSkill) : [];
      const _fbAct = rev.active_feed_specs || [];
      h += `<div class="dt-feed-builder-meta dt-skill-meta" data-proc-key="${esc(entry.key)}" data-sub-id="${esc(entry.subId)}">`;
      for (const sp of _fbSp) {
        const checked = _fbAct.includes(sp);
        const aoe = hasAoE(char, sp);
        h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${esc(entry.key)}" data-spec="${esc(sp)}"${checked ? ' checked' : ''}>${esc(sp)} ${aoe ? '+2' : '+1'}</label>`;
      }
      for (const { spec: isSp, fromSkill } of isSpecs(char || {})) {
        if (fromSkill === preSkill) continue; // already present as a native spec on this skill
        const checked = _fbAct.includes(isSp);
        const aoe = hasAoE(char, isSp);
        h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${esc(entry.key)}" data-spec="${esc(isSp)}"${checked ? ' checked' : ''}>${esc(isSp)} (${esc(fromSkill)}) ${aoe ? '+2' : '+1'}</label>`;
      }
      h += '</div>';
      h += '</div>'; // proc-pool-builder
    }
  } else if (entry.source === 'project') {
    // Project: structured pool builder (mirrors feeding)
    const char = projChar;
    const charDiscs = _charDiscsArray(char).filter(d => d.dots > 0);
    const allDiscNames = char ? charDiscs.map(d => d.name) : KNOWN_DISCIPLINES;

    let preAttr = '', preSkill = '', preDisc = 'none', showParseRef = false;
    if (poolValidated) {
      const parsed = _parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, allDiscNames);
      if (parsed) {
        preAttr  = parsed.attr  || '';
        preSkill = parsed.skill || '';
        preDisc  = parsed.disc  || 'none';
      } else {
        showParseRef = true;
      }
    } else if (projSub) {
      // Task 4: pre-populate from player's submitted form fields on first open
      const resp2 = projSub.responses || {};
      preAttr  = resp2[`project_${entry.projSlot}_pool_attr`]  || '';
      preSkill = resp2[`project_${entry.projSlot}_pool_skill`] || '';
      preDisc  = resp2[`project_${entry.projSlot}_pool_disc`]  || 'none';
    }

    const attrOptHtml = ['<option value="" data-dots="0">-- Attribute --</option>',
      ...ALL_ATTRS.map(a => {
        const dots = char ? (getAttrVal(char, a) || 0) : null;
        const sel  = a === preAttr ? ' selected' : '';
        const label = dots !== null ? `${esc(a)} (${dots})` : esc(a);
        return `<option value="${esc(a)}" data-dots="${dots ?? 0}"${sel}>${label}</option>`;
      })
    ].join('');

    const skillOptHtml = ['<option value="" data-dots="0">-- Skill --</option>',
      ...ALL_SKILLS.map(s => {
        const dots = char ? (skTotal(char, s) || 0) : null;
        const sel  = s === preSkill ? ' selected' : '';
        const label = dots !== null ? `${esc(s)} (${dots})` : esc(s);
        return `<option value="${esc(s)}" data-dots="${dots ?? 0}"${sel}>${label}</option>`;
      })
    ].join('');

    const discOptHtml = ['<option value="none" data-dots="0">None</option>',
      ...allDiscNames.map(name => {
        const d    = charDiscs.find(cd => cd.name === name);
        const dots = d ? d.dots : null;
        const sel  = name === preDisc ? ' selected' : '';
        const label = dots !== null ? `${esc(name)} (${dots})` : esc(name);
        return `<option value="${esc(name)}" data-dots="${dots ?? 0}"${sel}>${label}</option>`;
      })
    ].join('');

    const eqMod0 = rev.pool_mod_equipment !== undefined ? rev.pool_mod_equipment : 0;
    const initModForDisplay = eqMod0;

    const initAttrDots  = preAttr  ? (char ? (getAttrVal(char, preAttr) || 0) : 0) : 0;
    const initSkillDots = preSkill ? (char ? (skTotal(char, preSkill) || 0) : 0) : 0;
    const initDiscDots  = (preDisc && preDisc !== 'none') ? (charDiscs.find(d => d.name === preDisc)?.dots || 0) : 0;
    // 9-again auto-detect (used for pool total annotation and sidebar initial state)
    const _pnA  = char && preSkill ? skNineAgain(char, preSkill) : false;
    const initTotalStr  = _poolTotalDisplay(preAttr, initAttrDots, preSkill, initSkillDots, preDisc, initDiscDots, initModForDisplay, preSkill, _pnA);

    h += `<div class="proc-pool-builder" data-proc-key="${esc(entry.key)}">`;
    h += `<div class="proc-detail-label">ST Pool Builder${!char ? ' <span class="dt-hint">(dot values unavailable \u2014 character not loaded)</span>' : ''}</div>`;
    if (showParseRef) {
      h += `<div class="proc-pool-parse-ref">Could not restore selection \u2014 previous: "${esc(poolValidated)}"</div>`;
    }
    h += '<div class="proc-pool-builder-selects">';
    h += `<select class="proc-pool-attr" data-proc-key="${esc(entry.key)}">${attrOptHtml}</select>`;
    h += `<span class="proc-pool-plus">+</span>`;
    h += `<select class="proc-pool-skill" data-proc-key="${esc(entry.key)}">${skillOptHtml}</select>`;
    h += `<span class="proc-pool-plus">+</span>`;
    h += `<select class="proc-pool-disc" data-proc-key="${esc(entry.key)}">${discOptHtml}</select>`;
    h += '</div>';
    h += `<input type="hidden" class="proc-pool-mod-val" data-proc-key="${esc(entry.key)}" value="${initModForDisplay}">`;
    h += `<div class="proc-pool-total" data-proc-key="${esc(entry.key)}" data-nine-again="${_pnA ? '1' : '0'}">${esc(initTotalStr)}</div>`;
    // Spec toggles only — 9-again moved to right sidebar for project entries
    const _pSp  = char && preSkill ? skSpecs(char, preSkill) : [];
    const _pAct = rev.active_feed_specs || [];
    h += `<div class="dt-feed-builder-meta dt-skill-meta" data-proc-key="${esc(entry.key)}" data-sub-id="${esc(entry.subId)}">`;
    for (const sp of _pSp) {
      const checked = _pAct.includes(sp);
      const aoe = hasAoE(char, sp);
      h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${esc(entry.key)}" data-spec="${esc(sp)}"${checked ? ' checked' : ''}>${esc(sp)} ${aoe ? '+2' : '+1'}</label>`;
    }
    for (const { spec: isSp, fromSkill } of isSpecs(char || {})) {
      if (fromSkill === preSkill) continue; // already present as a native spec on this skill
      const checked = _pAct.includes(isSp);
      const aoe = hasAoE(char, isSp);
      h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${esc(entry.key)}" data-spec="${esc(isSp)}"${checked ? ' checked' : ''}>${esc(isSp)} (${esc(fromSkill)}) ${aoe ? '+2' : '+1'}</label>`;
    }
    h += '</div>';
    h += '</div>'; // proc-pool-builder
  } else if (isSorcery) {
    // ── Sorcery: player details card + rite dropdown + computed pool display + result note ──
    const allRites    = (_getRulesDB() || []).filter(r => r.category === 'rite');
    const selectedRite = rev.rite_override || entry.riteName || '';
    const ritInfo      = selectedRite ? _getRiteInfo(selectedRite) : null;
    const overridden   = rev.rite_override && rev.rite_override !== entry.riteName;

    // Rite selector
    h += '<div class="proc-rite-select-row">';
    h += '<span class="proc-detail-label">Rite</span>';
    h += `<select class="proc-rite-select" data-proc-key="${esc(entry.key)}">`;
    h += '<option value="">\u2014 Select Rite \u2014</option>';
    const tradOrder = ['Cruac', 'Theban'];
    const byTrad = {};
    for (const r of allRites) {
      const t = r.parent || 'Unknown';
      if (!byTrad[t]) byTrad[t] = [];
      byTrad[t].push(r);
    }
    const tradKeys = [...tradOrder.filter(t => byTrad[t]), ...Object.keys(byTrad).filter(t => !tradOrder.includes(t))];
    for (const trad of tradKeys) {
      const group = (byTrad[trad] || []).slice().sort((a, b) => (a.rank || 0) - (b.rank || 0) || a.name.localeCompare(b.name));
      h += `<optgroup label="${esc(trad)}">`;
      for (const r of group) {
        const sel = selectedRite === r.name ? ' selected' : '';
        const lvl = r.rank || _getRiteLevel(r.name) || '?';
        h += `<option value="${esc(r.name)}"${sel}>${esc(r.name)} (Level ${lvl})</option>`;
      }
      h += '</optgroup>';
    }
    h += '</select>';
    if (overridden) h += `<span class="proc-recat-original">Player: ${esc(entry.riteName || '\u2014')}</span>`;
    h += '</div>';

    // Pool + target display (auto-computed from selected rite + char)
    if (ritInfo) {
      const base         = _computeRitePool(sorcChar, ritInfo.attr, ritInfo.skill, ritInfo.disc);
      const isCruac      = entry.tradition === 'Cruac';
      const mandUsed     = rev.ritual_mg_used || false;
      const mgMeritL     = isCruac ? (sorcChar?.merits || []).find(m => m.name === 'Mandragora Garden') : null;
      const mgPoolL      = mgMeritL ? (mgMeritL.rating || mgMeritL.dots || 0) + (mgMeritL.bonus || 0) : 0;
      const mgDots       = (isCruac && mandUsed) ? mgPoolL : 0;
      const eqMod        = rev.pool_mod_equipment || 0;
      const total        = base + 3 + mgDots + eqMod;

      const _slEntry = ritInfo.disc ? _charDiscsArray(sorcChar).find(d => d.name === ritInfo.disc) : null;
      let exprParts = sorcChar
        ? [
            `${ritInfo.attr} ${getAttrVal(sorcChar, ritInfo.attr) || 0}`,
            `${ritInfo.skill} ${skTotal(sorcChar, ritInfo.skill) || 0}`,
            ritInfo.disc ? `${ritInfo.disc} ${_slEntry?.dots || 0}` : null,
            '+3',
          ].filter(Boolean)
        : [ritInfo.poolExpr, '+3'];
      if (mgDots) exprParts.push(`+${mgDots}`);
      if (eqMod)  exprParts.push(eqMod > 0 ? `+${eqMod}` : String(eqMod));

      h += `<div class="proc-ritual-info">`;
      h += `<span class="proc-ritual-info-item"><span class="proc-feed-lbl">Pool</span> ${esc(exprParts.join(' + '))} = ${total}</span>`;
      h += `<span class="proc-ritual-info-item"><span class="proc-feed-lbl">Target</span> ${ritInfo.target} success${ritInfo.target !== 1 ? 'es' : ''} (Level ${ritInfo.target})</span>`;
      h += '</div>';
    } else if (selectedRite) {
      h += `<div class="proc-ritual-no-rule">Rite not found in rules database.</div>`;
    }

    // Mechanical result note
    const resultNote = rev.ritual_result_note || '';
    h += '<div class="proc-section">';
    h += '<div class="proc-detail-label">Mechanical Result</div>';
    h += `<textarea class="proc-ritual-note-input" data-proc-key="${esc(entry.key)}" rows="2" placeholder="Potency, duration, effect on target\u2026">${esc(resultNote)}</textarea>`;
    h += '</div>';
  } else if (entry.source !== 'merit') {
    // Non-feeding, non-project, non-sorcery, non-merit: standard 2-column layout
    h += '<div class="proc-detail-grid">';
    h += '<div class="proc-detail-col">';
    h += `<div class="proc-detail-label">Player's Submitted Pool</div>`;
    h += `<div class="proc-detail-value">${esc(poolPlayer || '\u2014')}</div>`;
    h += '</div>';
    h += '<div class="proc-detail-col">';
    h += `<div class="proc-detail-label">ST Validated Pool</div>`;
    h += `<input class="proc-pool-input" type="text" data-proc-key="${esc(entry.key)}" value="${esc(poolValidated)}" placeholder="Enter validated pool...">`;
    h += '</div>';
    h += '</div>'; // proc-detail-grid
  }

  // Validation status — feeding, project, sorcery, merit move to right panel; others rendered here
  if (entry.source !== 'feeding' && entry.source !== 'project' && !isSorcery && entry.source !== 'merit') {
    const statusOptions = isSorcery
      ? [['pending', 'Pending'], ['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']]
      : [['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];

    h += '<div class="proc-section">';
    h += '<div class="proc-detail-label">Validation Status</div>';
    h += _renderValStatusButtons(entry.key, poolStatus, statusOptions);
    h += '</div>';
  }

  // ── Attach Reminder (sorcery resolved) ──
  if (isSorcery) {
    const reminderCount = cycleReminders.filter(r =>
      r.source_sub_id === entry.subId && r.source_rite === entry.riteName
    ).length;

    if (poolStatus === 'resolved') {
      if (attachReminderKey === entry.key) {
        // Render the inline attach panel
        h += _renderAttachPanel(entry);
      } else {
        h += `<div class="proc-section">`;
        h += `<button class="dt-btn proc-attach-open-btn" data-proc-key="${esc(entry.key)}">Attach Reminder</button>`;
        if (reminderCount) {
          h += ` <span class="proc-attach-count">Reminders attached to ${reminderCount} action${reminderCount !== 1 ? 's' : ''}.</span>`;
        }
        h += `</div>`;
      }
    } else if (reminderCount) {
      h += `<div class="proc-attach-count">Reminders attached to ${reminderCount} action${reminderCount !== 1 ? 's' : ''}.</div>`;
    }
  }


  // ST Response (all personal project actions — feature.66 extended)
  if (entry.source === 'project') {
    const stResponse     = rev.st_response       || '';
    const responseAuthor = rev.response_author   || '';
    const responseStatus = rev.response_status   || '';
    const reviewedBy     = rev.response_reviewed_by || '';
    h += '<div class="proc-st-response-section">';
    h += '<div class="proc-st-response-header">';
    h += '<span class="proc-detail-label">ST Response</span>';
    h += `<button class="dt-btn dt-btn-sm proc-st-response-copy" data-proc-key="${esc(entry.key)}">Copy context</button>`;
    h += '</div>';
    h += `<textarea class="proc-st-response-textarea" data-proc-key="${esc(entry.key)}" rows="5" placeholder="Narrative response for the player...">${esc(stResponse)}</textarea>`;
    h += `<div class="proc-st-response-footer">`;
    h += `<button class="dt-btn dt-btn-sm proc-st-response-save" data-proc-key="${esc(entry.key)}">Save</button>`;
    if (responseAuthor) {
      const statusBadge = responseStatus === 'reviewed'
        ? ` <span class="proc-response-status-badge proc-response-status-reviewed">Reviewed</span>`
        : ` <span class="proc-response-status-badge proc-response-status-draft">Draft</span>`;
      h += `<span class="proc-st-response-author">Drafted by ${esc(responseAuthor)}${statusBadge}</span>`;
    }
    h += '</div>';
    h += '</div>';
  }

  // Player feedback
  h += '<div class="proc-section">';
  h += '<div class="proc-detail-label">Player Feedback</div>';
  h += `<input class="proc-feedback-input" type="text" data-proc-key="${esc(entry.key)}" value="${esc(feedback)}" placeholder="Visible to player (pool correction reason, etc.)...">`;
  h += '</div>';

  // ST Notes thread
  h += '<div class="proc-section">';
  h += '<div class="proc-detail-label">ST Notes (ST only)</div>';
  if (thread.length) {
    h += '<div class="proc-notes-thread">';
    for (let noteIdx = 0; noteIdx < thread.length; noteIdx++) {
      const note = thread[noteIdx];
      const time = note.created_at
        ? new Date(note.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '';
      h += '<div class="proc-note-entry">';
      h += `<div class="proc-note-meta">${esc(note.author_name)}${time ? '  \u00B7  ' + esc(time) : ''}<button class="proc-note-delete-btn" data-proc-key="${esc(entry.key)}" data-note-idx="${noteIdx}" title="Delete note">\u00D7</button></div>`;
      h += `<div class="proc-note-text">${esc(note.text)}</div>`;
      h += '</div>';
    }
    h += '</div>';
  }
  h += '<div class="proc-note-add">';
  h += `<textarea class="proc-note-textarea" data-proc-key="${esc(entry.key)}" placeholder="Add ST note..." rows="2"></textarea>`;
  h += `<button class="dt-btn proc-add-note-btn" data-proc-key="${esc(entry.key)}">Add Note</button>`;
  h += '</div>';
  h += '</div>';

  // ── Close left column; render right panel for feeding + project + sorcery + merit entries ──
  if (entry.source === 'feeding') {
    h += '</div>'; // proc-feed-left
    h += _renderFeedRightPanel(entry, feedChar, rev);
    h += '</div>'; // proc-feed-layout
  } else if (entry.source === 'project') {
    h += '</div>'; // proc-feed-left
    h += _renderProjRightPanel(entry, projChar, rev);
    h += '</div>'; // proc-feed-layout
  } else if (isSorcery) {
    h += '</div>'; // proc-feed-left
    h += _renderSorceryRightPanel(entry, sorcChar, sorcSub, rev);
    h += '</div>'; // proc-feed-layout
  } else if (entry.source === 'merit') {
    h += '</div>'; // proc-feed-left
    h += _renderMeritRightPanel(entry, rev);
    h += '</div>'; // proc-feed-layout
  }

  h += '</div>'; // proc-action-detail
  return h;
}

// ── Ritual helpers ────────────────────────────────────────────────────────────

/**
 * Look up a rite's casting pool and target successes from the rules DB.
 * Pool components are the same for every rite within a tradition.
 * Target successes = rite rank (level 1–5).
 *
 * Returns { poolExpr, target, attr, skill, disc } or null.
 */
/**
 * Compute the shared Mandragora Garden pool across all characters.
 * Deduplicates paired "Shared (X)" merits — a garden shared between two characters
 * counts only once (at the rating of the first partner encountered).
 */
function _mandragoraSharedPool() {
  let total = 0;
  const countedPairs = new Set();
  for (const c of characters) {
    const m = (c.merits || []).find(x => x.name === 'Mandragora Garden');
    if (!m) continue;
    const qual = (m.qualifier || '');
    const sharedMatch = qual.match(/^[Ss]hared\s*\(([^)]+)\)$/);
    if (sharedMatch) {
      const pairedName = sharedMatch[1].trim().toLowerCase();
      const pairKey = [c.name.toLowerCase(), pairedName].sort().join('::');
      if (countedPairs.has(pairKey)) continue;
      countedPairs.add(pairKey);
    }
    total += (m.rating || m.dots || 0) + (m.bonus || 0);
  }
  return total;
}

// Tradition pool formulas — all rites within a tradition use the same base pool
const TRADITION_POOL = {
  Cruac:             { attr: 'Intelligence', skill: 'Occult',    disc: 'Cruac' },
  'Theban Sorcery':  { attr: 'Resolve',     skill: 'Academics', disc: 'Theban Sorcery' },
  Theban:            { attr: 'Resolve',     skill: 'Academics', disc: 'Theban Sorcery' },
};

function _getRiteInfo(riteName) {
  const db = _getRulesDB();

  // Try rules DB first — use rank if present, derive pool from parent tradition if pool is null
  if (db) {
    const riteRule = db.find(r => r.category === 'rite' && r.name === riteName);
    if (riteRule?.rank) {
      // Pool: use stored pool object if populated, otherwise derive from parent tradition
      let attr, skill, disc;
      if (riteRule.pool?.attr || riteRule.pool?.skill) {
        attr  = riteRule.pool.attr  || '';
        skill = riteRule.pool.skill || '';
        disc  = riteRule.pool.disc  || '';
      } else {
        const trad = TRADITION_POOL[riteRule.parent] || null;
        if (trad) { attr = trad.attr; skill = trad.skill; disc = trad.disc; }
      }
      if (attr || skill) {
        return { poolExpr: [attr, skill, disc].filter(Boolean).join(' + '), target: riteRule.rank, attr, skill, disc };
      }
    }
  }

  // Fallback: scan all loaded characters' powers to find rite level + tradition
  for (const char of characters) {
    const rite = (char.powers || []).find(p => p.category === 'rite' && p.name === riteName);
    if (rite?.level && rite.tradition) {
      const pool = TRADITION_POOL[rite.tradition] || null;
      if (pool) {
        return { poolExpr: [pool.attr, pool.skill, pool.disc].filter(Boolean).join(' + '), target: rite.level, ...pool };
      }
    }
  }

  return null;
}

/**
 * Return the known level of a rite by name: checks DB first, then all character powers.
 */
function _getRiteLevel(riteName) {
  const db = _getRulesDB();
  if (db) {
    const r = db.find(r => r.category === 'rite' && r.name === riteName);
    if (r?.rank) return r.rank;
  }
  for (const char of characters) {
    const p = (char.powers || []).find(p => p.category === 'rite' && p.name === riteName);
    if (p?.level) return p.level;
  }
  return null;
}

/**
 * Compute the ritual dice pool total for a character: attr + skill + tradition disc.
 */
function _computeRitePool(char, attr, skill, disc) {
  if (!char) return 0;
  const discEntry = disc ? _charDiscsArray(char).find(d => d.name === disc) : null;
  return (getAttrVal(char, attr) || 0)
       + (skTotal(char, skill)   || 0)
       + (discEntry?.dots || 0);
}

/**
 * Read the rules DB synchronously from localStorage (key: 'tm_rules_db').
 */
function _getRulesDB() {
  try {
    const raw = localStorage.getItem('tm_rules_db');
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

// ── Narrative Output Authoring (Story 1.7) ───────────────────────────────────

const NARR_BLOCKS = [
  {
    key: 'letter_from_home',
    label: 'Letter from Home',
    hint: 'A reply from an NPC to the character. Never from the character. Character moments only, no plot hooks.',
  },
  {
    key: 'touchstone_vignette',
    label: 'Touchstone Vignette',
    hint: 'Second person, present tense. In-person contact only. Living mortal as primary. First referent cannot be a pronoun.',
  },
  {
    key: 'territory_report',
    label: 'Territory Report',
    hint: 'What the character observed in their operating territory this cycle.',
  },
  {
    key: 'intelligence_dossier',
    label: 'Intelligence Dossier',
    hint: 'General intel by sphere, Cacophony Savvy, mystical visions, rumours. Check thresholds — do not reveal beyond what was earned.',
  },
];

const STYLE_RULES = [
  'No success counts, discipline names, or mechanical terms in player-facing prose.',
  'No editorialising about what results mean.',
  'No stacked declaratives — fold short sentences together.',
  'No negative framing openers — start with what the character found, not what they didn\'t.',
  'Never dictate what a player has chosen, felt, or done.',
];

function renderNarrativePanel(s) {
  const narr = s.st_review?.narrative || {};
  const NARR_KEYS = NARR_BLOCKS.map(b => b.key);
  const allReady = NARR_KEYS.every(k => narr[k]?.status === 'ready');

  let h = '<div class="dt-narr-detail">';
  h += `<div class="dt-feed-header">Narrative Output ${allReady ? '<span class="dt-narr-badge">&#x2713; All ready</span>' : ''}</div>`;

  // Style guide (collapsed by default)
  h += `<details class="dt-style-guide"><summary>Writing Rules</summary><ul class="dt-style-list">`;
  for (const rule of STYLE_RULES) h += `<li>${esc(rule)}</li>`;
  h += '</ul></details>';

  for (const block of NARR_BLOCKS) {
    const saved = narr[block.key] || {};
    const text = saved.text || '';
    const status = saved.status || 'draft';
    const isReady = status === 'ready';

    h += `<div class="dt-narr-block">`;
    h += `<div class="dt-narr-block-header">`;
    h += `<span class="dt-narr-label">${esc(block.label)}</span>`;
    h += `<span class="dt-narr-hint">${esc(block.hint)}</span>`;
    h += `<div class="dt-narr-status-row">`;
    h += `<button class="dt-narr-status-btn${!isReady ? ' active' : ''}" data-sub-id="${esc(s._id)}" data-block-key="${block.key}" data-status="draft">Draft</button>`;
    h += `<button class="dt-narr-status-btn${isReady ? ' active' : ''}" data-sub-id="${esc(s._id)}" data-block-key="${block.key}" data-status="ready">Ready</button>`;
    h += '</div></div>';
    h += `<textarea class="dt-narr-textarea" data-sub-id="${esc(s._id)}" data-block-key="${block.key}"
      placeholder="${esc(block.label)}...">${esc(text)}</textarea>`;
    h += '</div>';
  }

  h += '</div>';
  return h;
}

// ── DT-1: Downtime Export Packet ─────────────────────────────────────────────

function renderExportRow(s) {
  return `<div class="dt-export-row">
    <button class="dt-btn dt-export-btn" data-sub-id="${s._id}">Export Packet</button>
    <span class="dt-export-hint">Download this character's downtime data as Markdown for Claude</span>
  </div>`;
}

function downloadMd(filename, content) {
  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function resolveConflict(v) {
  return { Monstrous: 'Intimidation', Seductive: 'Manipulation', Competitive: 'Superiority' }[v] || v;
}

function resolveRole(v) {
  return {
    ruler: 'Ruler', primogen: 'Primogen', administrator: 'Administrator',
    regent: 'Regent', socialite: 'Socialite', enforcer: 'Enforcer', none_yet: 'None yet',
  }[v] || v;
}

async function buildExportMd(sub, char, questResp) {
  const raw = sub._raw || {};
  const r = questResp?.responses || {};
  const projects = raw.projects || [];
  const projResolved = sub.projects_resolved || [];
  const meritActions = [
    ...(raw.sphere_actions || []),
    ...((raw.contact_actions?.requests || []).map(req => ({ merit_type: 'Contacts', action_type: 'Gather Info', description: req }))),
    ...((raw.retainer_actions?.actions || []).map(req => ({ merit_type: 'Retainer', action_type: 'Directed Action', description: req }))),
  ];
  const meritResolved = sub.merit_actions_resolved || [];
  const feed = raw.feeding || {};

  const name = char ? displayName(char) : (sub.character_name || 'Unknown');
  let md = `# ${name}\n`;

  // Identity
  if (char) {
    const clanParts = [char.clan, char.bloodline].filter(Boolean).join(' / ');
    const lineParts = [clanParts, char.covenant].filter(Boolean);
    if (lineParts.length) md += `*${lineParts.join(' \u00B7 ')}*`;
    if (char.blood_potency) md += ` \u00B7 Blood Potency ${char.blood_potency}`;
    md += '\n';
    const identity = [];
    if (char.mask)  identity.push(`**Mask:** ${char.mask}`);
    if (char.dirge) identity.push(`**Dirge:** ${char.dirge}`);
    if (identity.length) md += identity.join(' \u00B7 ') + '\n';
    if (char.date_of_embrace) {
      const d = new Date(char.date_of_embrace + 'T00:00:00');
      md += `**Embraced:** ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}\n`;
    }
    if (char.humanity !== undefined) md += `**Humanity:** ${char.humanity}\n`;
  }
  md += '\n';

  // Motivations (from questionnaire)
  const motivations = [
    r.court_motivation  && `**Why Court?** ${r.court_motivation}`,
    r.ambitions_sydney  && `**Goals in Sydney:** ${r.ambitions_sydney}`,
    r.conflict_approach && `**Conflict Approach:** ${resolveConflict(r.conflict_approach)}`,
    r.aspired_role_tag  && `**Aspired Role:** ${resolveRole(r.aspired_role_tag)}`,
  ].filter(Boolean);
  if (motivations.length) md += `## Motivations\n${motivations.join('\n')}\n\n`;

  // Connections (from questionnaire)
  const connBlocks = [];
  if (r.allies_characters?.length) {
    const list = Array.isArray(r.allies_characters) ? r.allies_characters.join(', ') : r.allies_characters;
    let b = `**Allied PCs:** ${list}`;
    if (r.allies) b += `\n> ${r.allies}`;
    connBlocks.push(b);
  }
  if (r.coterie_characters?.length) {
    const list = Array.isArray(r.coterie_characters) ? r.coterie_characters.join(', ') : r.coterie_characters;
    let b = `**Coterie:** ${list}`;
    if (r.coterie) b += `\n> ${r.coterie}`;
    connBlocks.push(b);
  }
  if (r.enemies_characters?.length) {
    const list = Array.isArray(r.enemies_characters) ? r.enemies_characters.join(', ') : r.enemies_characters;
    let b = `**Rivals/Enemies:** ${list}`;
    if (r.enemies) b += `\n> ${r.enemies}`;
    connBlocks.push(b);
  }
  if (connBlocks.length) md += `## Connections\n${connBlocks.join('\n\n')}\n\n`;

  // Actions
  if (projects.length) {
    md += '## Actions\n';
    projects.forEach((proj, i) => {
      const res = projResolved[i];
      md += `\n### ${i + 1}. ${proj.action_type || 'Action'}\n`;
      if (proj.territory) md += `**Territory:** ${proj.territory}\n`;
      if (proj.desired_outcome) md += `**Intent:** ${proj.desired_outcome}\n`;
      if (proj.description && proj.description !== proj.desired_outcome) md += `**Description:** ${proj.description}\n`;
      if (res?.pool) md += `**Pool:** ${res.pool.expression || String(res.pool.total)}\n`;
      if (res?.roll) {
        const roll = res.roll;
        md += `**Result:** ${roll.successes} ${roll.successes === 1 ? 'success' : 'successes'}${roll.exceptional ? ' (exceptional)' : ''}\n`;
        if (roll.dice_string) md += `**Dice:** ${roll.dice_string}\n`;
      } else {
        md += `**Result:** pending\n`;
      }
      if (res?.st_note) md += `**ST Note:** ${res.st_note}\n`;
    });
    md += '\n';
  }

  // Feeding
  {
    md += '## Feeding\n';
    const method = feed.method || sub.responses?.['_feed_method'] || 'Not declared';
    md += `**Method:** ${method}\n`;
    const activeTerrs = Object.entries(feed.territories || {}).filter(([, v]) => v && v !== 'Not feeding here');
    if (activeTerrs.length) md += `**Territories:** ${activeTerrs.map(([t, v]) => `${t} (${v})`).join(', ')}\n`;
    const feedRoll = sub.feeding_roll;
    if (feedRoll?.params?.size) {
      const isRote = sub.st_review?.feeding_rote || feedRoll.params.rote || false;
      md += `**Pool:** ${feedRoll.params.size} dice${isRote ? ' \u2014 Rote quality' : ''}\n`;
    }
    if (feedRoll) {
      md += `**Result:** ${feedRoll.successes} ${feedRoll.successes === 1 ? 'success' : 'successes'}${feedRoll.exceptional ? ' (exceptional)' : ''} \u2014 ${feedRoll.successes * 2} Vitae safe\n`;
      if (feedRoll.dice_string) md += `**Dice:** ${feedRoll.dice_string}\n`;
    } else {
      md += `**Result:** pending\n`;
    }
    md += '\n';
  }

  // Merit Actions
  if (meritActions.length) {
    md += '## Merit Actions\n';
    meritActions.forEach((action, i) => {
      const res = meritResolved[i];
      md += `\n### ${action.merit_type} \u2014 ${action.action_type}\n`;
      if (action.description) md += `**Action:** ${action.description}\n`;
      if (res?.no_roll) {
        md += `**Result:** No roll required\n`;
        if (res.st_note) md += `**ST Note:** ${res.st_note}\n`;
      } else if (res?.roll) {
        const roll = res.roll;
        if (res.pool) md += `**Pool:** ${res.pool.expression || String(res.pool.total)}\n`;
        md += `**Result:** ${roll.successes} ${roll.successes === 1 ? 'success' : 'successes'}${roll.exceptional ? ' (exceptional)' : ''}\n`;
        if (roll.dice_string) md += `**Dice:** ${roll.dice_string}\n`;
        if (res.st_note) md += `**ST Note:** ${res.st_note}\n`;
      } else {
        md += `**Result:** pending\n`;
      }
    });
    md += '\n';
  }

  // ST Notes (private — included in export for ST use in Claude)
  if (sub.st_notes) md += `## ST Notes\n${sub.st_notes}\n\n`;

  return md.trim();
}

async function handleExportSingle(subId) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;
  const char = findCharacter(sub.character_name, sub.player_name);
  let questResp = null;
  if (char) {
    try { questResp = await apiGet(`/api/questionnaire?character_id=${char._id}`); } catch { /* none */ }
  }
  const md = await buildExportMd(sub, char, questResp);
  const safeName = (sub.character_name || 'unknown').replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadMd(`downtime_${safeName}.md`, md);
}

async function handleExportAll() {
  if (!submissions.length) return;
  const sorted = [...submissions].sort((a, b) => (a.character_name || '').localeCompare(b.character_name || ''));
  // Load all questionnaire responses in parallel
  const questMap = {};
  await Promise.all(sorted.map(async sub => {
    const char = findCharacter(sub.character_name, sub.player_name);
    if (char) {
      try { questMap[sub._id] = await apiGet(`/api/questionnaire?character_id=${char._id}`); } catch { /* none */ }
    }
  }));
  const parts = [];
  for (const sub of sorted) {
    const char = findCharacter(sub.character_name, sub.player_name);
    parts.push(await buildExportMd(sub, char, questMap[sub._id] || null));
  }
  const cycleLabel = allCycles.find(c => c._id === selectedCycleId)?.label || 'downtime';
  const safeLabel = cycleLabel.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  downloadMd(`export_${safeLabel}_all.md`, parts.join('\n\n---\n\n'));
}

async function handleExportJson() {
  if (!submissions.length) return;
  const cycleLabel = allCycles.find(c => c._id === selectedCycleId)?.label || 'downtime';
  const safeLabel = cycleLabel.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const json = JSON.stringify(submissions, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup_${safeLabel}_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Mechanical Summary (Story 1.8) ───────────────────────────────────────────

function buildMechanicalDraft(sub) {
  const raw = sub._raw || {};
  const projects = raw.projects || [];
  const resolved = sub.projects_resolved || [];
  const meritActions = [
    ...(raw.sphere_actions || []),
    ...((raw.contact_actions?.requests || []).map(r => ({ merit_type: 'Contacts', action_type: 'Gather Info', description: r }))),
    ...((raw.retainer_actions?.actions || []).map(r => ({ merit_type: 'Retainer', action_type: 'Directed Action', description: r }))),
  ];
  const meritResolved = sub.merit_actions_resolved || [];

  let md = '';

  if (projects.length) {
    md += '## Projects\n';
    projects.forEach((proj, i) => {
      const res = resolved[i];
      md += `\n### ${i + 1}. ${proj.action_type || 'Action'}\n`;
      if (proj.desired_outcome) md += `**Desired:** ${proj.desired_outcome}\n`;
      if (res?.pool) md += `**Pool:** ${res.pool.expression || String(res.pool.total)}\n`;
      if (res?.roll) {
        const r = res.roll;
        md += `**Result:** ${r.successes} ${r.successes === 1 ? 'success' : 'successes'}${r.exceptional ? ' (exceptional)' : ''}\n`;
      } else {
        md += '**Result:** Pending\n';
      }
      if (res?.st_note) md += `**Note:** ${res.st_note}\n`;
    });
  }

  if (meritActions.length) {
    md += '\n## Merit Actions\n';
    meritActions.forEach((action, i) => {
      const res = meritResolved[i];
      md += `\n### ${action.merit_type} — ${action.action_type}\n`;
      if (action.description) md += `**Action:** ${action.description}\n`;
      if (res?.no_roll) {
        md += '**Result:** No roll required\n';
      } else if (res?.roll) {
        const r = res.roll;
        md += `**Pool:** ${res.pool?.expression || String(res.pool?.total)}\n`;
        md += `**Result:** ${r.successes} ${r.successes === 1 ? 'success' : 'successes'}${r.exceptional ? ' (exceptional)' : ''}\n`;
      } else {
        md += '**Result:** Pending\n';
      }
      if (res?.st_note) md += `**Note:** ${res.st_note}\n`;
    });
  }

  const fed = sub.feeding_roll;
  if (fed) {
    md += `\n## Feeding\n**Result:** ${fed.successes} ${fed.successes === 1 ? 'success' : 'successes'} — ${fed.successes * 2} Vitae safe\n`;
  }

  return md.trim() || '(No resolved actions yet — resolve projects and merit actions first.)';
}

function renderMechanicalSummaryPanel(s) {
  const summary = (s.st_review?.mechanical_summary || '').trim();
  let h = '<div class="dt-mech-detail">';
  h += '<div class="dt-feed-header">Resolution Summary</div>';
  if (summary) {
    h += `<div class="dt-mech-compiled">${esc(summary)}</div>`;
  } else {
    h += '<div class="dt-mech-compiled dt-mech-empty">No summary drafted yet. Use processing mode to auto-draft from resolved rolls.</div>';
  }
  h += '</div>';
  return h;
}

// ── Publish to Players (Story 1.9) ───────────────────────────────────────────

function renderPublishPanel(s) {
  const visibility = s.st_review?.outcome_visibility;
  const isReady = visibility === 'ready';
  const isPublished = visibility === 'published';
  const canReady = ['approved', 'modified'].includes(s.approval_status || '') && (s.st_review?.mechanical_summary || '').trim().length > 0;

  let h = '<div class="dt-publish-panel">';

  if (isPublished) {
    const when = s.st_review?.published_at
      ? new Date(s.st_review.published_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    h += `<div class="dt-pub-status"><span class="dt-pub-badge">&#x2713; Published to player</span>${when ? ` <span class="dt-pub-when">${esc(when)}</span>` : ''}</div>`;
  } else if (isReady) {
    const when = s.st_review?.ready_at
      ? new Date(s.st_review.ready_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
    h += `<div class="dt-pub-status">
      <span class="dt-ready-badge">&#x23F3; Ready to publish</span>${when ? ` <span class="dt-pub-when">${esc(when)}</span>` : ''}
      <span class="dt-publish-hint">Will go live when next cycle starts</span>
    </div>`;
  } else {
    const narr = s.st_review?.narrative || {};
    const NARR_KEYS = NARR_BLOCKS.map(b => b.key);
    const blocksReady = NARR_KEYS.filter(k => narr[k]?.status === 'ready').length;
    h += `<div class="dt-publish-row">`;
    h += `<button class="dt-btn dt-publish-btn${canReady ? ' dt-publish-ready' : ''}" data-sub-id="${esc(s._id)}"
      ${!canReady ? 'disabled title="Requires approved status + resolution summary"' : ''}>
      Mark Ready to Publish
    </button>`;
    h += `<span class="dt-publish-status">${blocksReady}/4 narrative blocks ready &middot; ${canReady ? 'Ready to mark' : 'Needs approval + summary'}</span>`;
    h += '</div>';
  }

  h += '</div>';
  return h;
}

async function handlePublish(sub) {
  const narr = sub.st_review?.narrative || {};
  const NARR_KEYS = NARR_BLOCKS.map(b => b.key);
  const emptyBlocks = NARR_BLOCKS.filter(b => !(narr[b.key]?.text || '').trim());

  let confirmMsg = `Mark downtime results for ${sub.character_name} as ready to publish?\n\nResults will go live for the player when the next cycle starts.`;
  if (emptyBlocks.length) {
    confirmMsg += `\n\nThe following narrative blocks are empty and will be omitted:\n${emptyBlocks.map(b => '  \u2022 ' + b.label).join('\n')}`;
  }
  if (!confirm(confirmMsg)) return;

  // Assemble outcome_text from all blocks + mechanical summary
  let outcomeText = '';
  for (const block of NARR_BLOCKS) {
    const text = (narr[block.key]?.text || '').trim();
    if (text) outcomeText += `## ${block.label}\n\n${text}\n\n`;
  }
  const mechSummary = (sub.st_review?.mechanical_summary || '').trim();
  if (mechSummary) outcomeText += `## Mechanical Outcomes\n\n${mechSummary}\n`;

  try {
    await updateSubmission(sub._id, {
      'st_review.outcome_text': outcomeText.trim(),
      'st_review.outcome_visibility': 'ready',
      'st_review.ready_at': new Date().toISOString(),
    });
    if (!sub.st_review) sub.st_review = {};
    sub.st_review.outcome_text = outcomeText.trim();
    sub.st_review.outcome_visibility = 'ready';
    sub.st_review.ready_at = new Date().toISOString();
    renderMatchSummary();
    renderSubmissions();
  } catch (err) {
    alert('Mark ready failed: ' + err.message);
  }
}

// ── Investigation Tracker (Story 1.5) ────────────────────────────────────────

const THRESHOLD_TYPES = [
  { id: 'public_identity', label: 'Public Identity', default: 5 },
  { id: 'hidden_identity', label: 'Hidden Identity', default: 10 },
  { id: 'private_activity', label: 'Private Activity', default: 10 },
  { id: 'haven', label: 'Haven (+ Security)', default: 10 },
  { id: 'touchstone', label: 'Touchstone', default: 15 },
  { id: 'bloodline', label: 'Bloodline', default: 15 },
];

let investigations = [];
let invPanelOpen = true;

async function loadInvestigations(cycleId) {
  if (!cycleId) { investigations = []; return; }
  try {
    investigations = await apiGet(`/api/downtime_investigations?cycle_id=${cycleId}`);
  } catch { investigations = []; }
}

function renderInvestigations() {
  const el = document.getElementById('dt-investigations');
  if (!el) return;

  let h = '<div class="dt-inv-panel">';
  h += `<div class="dt-matrix-toggle" id="dt-inv-toggle">${invPanelOpen ? '\u25BC' : '\u25BA'} Investigations <span class="domain-count">${investigations.length}</span></div>`;

  if (invPanelOpen) {
    h += '<div class="dt-inv-body">';

    // New investigation form
    h += `<details class="dt-inv-new-wrap"><summary class="dt-btn dt-summary-btn">+ New Investigation</summary>`;
    h += '<div class="dt-inv-form">';
    h += `<input class="dt-inv-input" id="dt-inv-target" placeholder="Target (name or description)" style="width:100%">`;
    h += '<div class="dt-inv-row">';
    h += `<select class="dt-pool-sel" id="dt-inv-type">`;
    for (const t of THRESHOLD_TYPES) h += `<option value="${esc(t.id)}">${esc(t.label)} (${t.default})</option>`;
    h += '</select>';
    h += `<input class="dt-pool-mod" type="number" id="dt-inv-custom" placeholder="Override threshold" title="Override threshold">`;
    h += `<input class="dt-inv-input" id="dt-inv-investigator" placeholder="Investigating character" style="flex:1">`;
    h += `<button class="dt-btn" id="dt-inv-create">Create</button>`;
    h += '</div></div></details>';

    if (investigations.length === 0) {
      h += '<p class="dt-empty-msg">No active investigations.</p>';
    } else {
      for (const inv of investigations) {
        const pct = Math.min(100, Math.round((inv.successes_accumulated / inv.threshold) * 100));
        const isResolved = inv.status === 'resolved';
        h += `<div class="dt-inv-item${isResolved ? ' dt-inv-resolved' : ''}">`;
        h += `<div class="dt-inv-header">`;
        h += `<span class="dt-inv-target">${esc(inv.target_description)}</span>`;
        const tLabel = THRESHOLD_TYPES.find(t => t.id === inv.threshold_type)?.label || inv.threshold_type;
        h += ` <span class="dt-inv-type-badge">${esc(tLabel)}</span>`;
        if (isResolved) h += ' <span class="dt-proj-done-badge">\u2713 Resolved</span>';
        h += '</div>';
        if (inv.investigating_character_id) h += `<div class="dt-inv-investigator">Investigator: ${esc(inv.investigating_character_id)}</div>`;

        // Progress bar
        h += `<div class="dt-inv-progress-wrap">`;
        h += `<div class="dt-inv-progress-bar" style="width:${pct}%"></div>`;
        h += `<span class="dt-inv-progress-label">${inv.successes_accumulated} / ${inv.threshold} successes</span>`;
        h += '</div>';

        if (!isResolved) {
          h += `<div class="dt-inv-add-row">`;
          h += `<input class="dt-pool-mod" type="number" min="1" value="1" id="dt-inv-add-${esc(inv._id)}" title="Successes to add">`;
          h += `<input class="dt-inv-input" id="dt-inv-note-${esc(inv._id)}" placeholder="Note (source, roll)" style="flex:1">`;
          h += `<button class="dt-btn dt-inv-add-btn" data-inv-id="${esc(inv._id)}">Add successes</button>`;
          h += `<button class="dt-btn dt-btn-muted dt-inv-resolve-btn" data-inv-id="${esc(inv._id)}">Mark resolved</button>`;
          h += '</div>';
        }

        if (inv.notes?.length) {
          h += '<div class="dt-inv-notes">';
          for (const n of inv.notes.slice(-3)) {
            const when = n.added_at ? new Date(n.added_at).toLocaleDateString('en-GB') : '';
            h += `<div class="dt-inv-note-entry">${when ? `<span class="dt-inv-note-when">${when}</span> ` : ''}${esc(n.text)}${n.successes_added ? ` (+${n.successes_added})` : ''}</div>`;
          }
          h += '</div>';
        }

        h += '</div>';
      }
    }

    h += '</div>';
  }

  h += '</div>';
  el.innerHTML = h;

  document.getElementById('dt-inv-toggle')?.addEventListener('click', () => {
    invPanelOpen = !invPanelOpen;
    renderInvestigations();
  });

  document.getElementById('dt-inv-create')?.addEventListener('click', async () => {
    const target = document.getElementById('dt-inv-target')?.value.trim();
    const thresholdType = document.getElementById('dt-inv-type')?.value;
    const customThreshold = document.getElementById('dt-inv-custom')?.value;
    const investigator = document.getElementById('dt-inv-investigator')?.value.trim();
    if (!target) return;
    try {
      await apiPost('/api/downtime_investigations', {
        target_description: target,
        threshold_type: thresholdType,
        custom_threshold: customThreshold ? +customThreshold : undefined,
        investigating_character_id: investigator || null,
        cycle_id: selectedCycleId,
      });
      await loadInvestigations(selectedCycleId);
      renderInvestigations();
    } catch (err) { console.error('Create investigation error:', err.message); }
  });

  el.querySelectorAll('.dt-inv-add-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const invId = btn.dataset.invId;
      const successes = +document.getElementById(`dt-inv-add-${invId}`)?.value || 1;
      const note = document.getElementById(`dt-inv-note-${invId}`)?.value.trim() || '';
      try {
        const updated = await apiPut(`/api/downtime_investigations/${invId}`, { add_successes: successes, note_text: note || undefined });
        const idx = investigations.findIndex(i => i._id === invId);
        if (idx >= 0) investigations[idx] = updated;
        renderInvestigations();
      } catch (err) { console.error('Add successes error:', err.message); }
    });
  });

  el.querySelectorAll('.dt-inv-resolve-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const invId = btn.dataset.invId;
      try {
        const updated = await apiPut(`/api/downtime_investigations/${invId}`, { status: 'resolved' });
        const idx = investigations.findIndex(i => i._id === invId);
        if (idx >= 0) investigations[idx] = updated;
        renderInvestigations();
      } catch (err) { console.error('Resolve investigation error:', err.message); }
    });
  });
}

// ── NPC Register (Story 1.6) ─────────────────────────────────────────────────

let npcs = [];
let npcPanelOpen = false;
let editingNpcId = null;

async function loadNpcs(cycleId) {
  try {
    const url = cycleId ? `/api/npcs?cycle_id=${cycleId}` : '/api/npcs';
    npcs = await apiGet(url);
  } catch { npcs = []; }
}

function renderNpcs() {
  const el = document.getElementById('dt-npcs');
  if (!el) return;

  const active = npcs.filter(n => n.status !== 'archived');

  let h = '<div class="dt-npc-panel">';
  h += `<div class="dt-matrix-toggle" id="dt-npc-toggle">${npcPanelOpen ? '\u25BC' : '\u25BA'} NPC Register <span class="domain-count">${active.length}</span></div>`;

  if (npcPanelOpen) {
    h += '<div class="dt-npc-body">';

    if (editingNpcId === 'new') {
      h += renderNpcForm(null);
    } else {
      h += `<button class="dt-btn" id="dt-npc-add">+ Add NPC</button>`;
    }

    if (active.length === 0 && editingNpcId !== 'new') {
      h += '<p class="dt-empty-msg">No NPCs recorded yet.</p>';
    } else {
      for (const npc of active) {
        if (editingNpcId === npc._id) {
          h += renderNpcForm(npc);
        } else {
          h += renderNpcCard(npc);
        }
      }
    }

    h += '</div>';
  }

  h += '</div>';
  el.innerHTML = h;

  document.getElementById('dt-npc-toggle')?.addEventListener('click', () => {
    npcPanelOpen = !npcPanelOpen;
    renderNpcs();
  });

  document.getElementById('dt-npc-add')?.addEventListener('click', () => {
    editingNpcId = 'new';
    renderNpcs();
  });

  el.querySelectorAll('.dt-npc-edit').forEach(btn => {
    btn.addEventListener('click', () => { editingNpcId = btn.dataset.npcId; renderNpcs(); });
  });

  el.querySelectorAll('.dt-npc-archive').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Archive this NPC?')) return;
      try {
        await apiDelete(`/api/npcs/${btn.dataset.npcId}`);
        npcs = npcs.filter(n => n._id !== btn.dataset.npcId);
        renderNpcs();
      } catch (err) { console.error('Archive NPC error:', err.message); }
    });
  });

  el.querySelectorAll('.dt-npc-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const formId = btn.dataset.formId;
      const name = el.querySelector(`#dt-npc-name-${esc(formId)}`)?.value.trim();
      if (!name) return;
      const body = {
        name,
        description: el.querySelector(`#dt-npc-desc-${esc(formId)}`)?.value.trim() || '',
        status: el.querySelector(`#dt-npc-status-${esc(formId)}`)?.value || 'active',
        notes: el.querySelector(`#dt-npc-notes-${esc(formId)}`)?.value.trim() || '',
        linked_cycle_id: selectedCycleId || null,
      };
      try {
        if (formId === 'new') {
          const created = await apiPost('/api/npcs', body);
          npcs.push(created);
        } else {
          const updated = await apiPut(`/api/npcs/${formId}`, body);
          const idx = npcs.findIndex(n => n._id === formId);
          if (idx >= 0) npcs[idx] = { ...npcs[idx], ...updated };
        }
        editingNpcId = null;
        renderNpcs();
      } catch (err) { console.error('Save NPC error:', err.message); }
    });
  });

  el.querySelectorAll('.dt-npc-cancel').forEach(btn => {
    btn.addEventListener('click', () => { editingNpcId = null; renderNpcs(); });
  });
}

function renderNpcCard(npc) {
  const statusColour = npc.status === 'dead' ? 'dt-npc-dead' : npc.status === 'unknown' ? 'dt-npc-unknown' : '';
  let h = `<div class="dt-npc-card">`;
  h += `<div class="dt-npc-card-header">`;
  h += `<span class="dt-npc-name ${statusColour}">${esc(npc.name)}</span>`;
  h += `<span class="dt-npc-status-badge">${esc(npc.status)}</span>`;
  h += `<button class="dt-btn dt-npc-edit" data-npc-id="${esc(npc._id)}">Edit</button>`;
  h += `<button class="dt-btn dt-btn-dim dt-npc-archive" data-npc-id="${esc(npc._id)}">Archive</button>`;
  h += '</div>';
  if (npc.description) h += `<div class="dt-npc-desc">${esc(npc.description)}</div>`;
  if (npc.notes) h += `<div class="dt-npc-notes">${esc(npc.notes)}</div>`;
  h += '</div>';
  return h;
}

function renderNpcForm(npc) {
  const id = npc?._id || 'new';
  const v = (f) => esc(npc?.[f] || '');
  let h = `<div class="dt-npc-form">`;
  h += `<input class="dt-inv-input" id="dt-npc-name-${id}" placeholder="Name *" value="${v('name')}" style="width:100%">`;
  h += `<textarea class="dt-narr-textarea dt-narr-textarea-sm" id="dt-npc-desc-${id}" placeholder="Description">${v('description')}</textarea>`;
  h += '<div class="dt-npc-form-row">';
  h += `<select class="dt-pool-sel" id="dt-npc-status-${id}">`;
  for (const s of ['active', 'dead', 'unknown']) {
    h += `<option value="${s}"${npc?.status === s ? ' selected' : ''}>${s}</option>`;
  }
  h += '</select>';
  h += `<button class="dt-btn dt-npc-save" data-form-id="${id}">Save</button>`;
  h += `<button class="dt-btn dt-btn-muted dt-npc-cancel">Cancel</button>`;
  h += '</div>';
  h += `<textarea class="dt-narr-textarea dt-narr-textarea-xs" id="dt-npc-notes-${id}" placeholder="Notes (ST only)">${v('notes')}</textarea>`;
  h += '</div>';
  return h;
}

// ── Submission Checklist (feature.55) ───────────────────────────────────────

const CHK_SECTIONS = [
  { key: 'travel',         label: 'Travel' },
  { key: 'feeding',        label: 'Feeding' },
  { key: 'project_1',      label: 'P1' },
  { key: 'project_2',      label: 'P2' },
  { key: 'project_3',      label: 'P3' },
  { key: 'project_4',      label: 'P4' },
  { key: 'allies_1',       label: 'A1' },
  { key: 'allies_2',       label: 'A2' },
  { key: 'allies_3',       label: 'A3' },
  { key: 'allies_4',       label: 'A4' },
  { key: 'allies_5',       label: 'A5' },
  { key: 'contacts_1',     label: 'C1' },
  { key: 'contacts_2',     label: 'C2' },
  { key: 'contacts_3',     label: 'C3' },
  { key: 'contacts_4',     label: 'C4' },
  { key: 'contacts_5',     label: 'C5' },
  { key: 'resources',      label: 'Res.' },
  { key: 'correspondence', label: 'Corresp.' },
  { key: 'xp',             label: 'XP' },
];

function _chkHasContent(sub, key) {
  if (!sub) return false;
  const raw = sub._raw || {};
  const alliesM = key.match(/^allies_(\d+)$/);
  const contactsM = key.match(/^contacts_(\d+)$/);
  if (alliesM)   return !!(raw.sphere_actions?.[parseInt(alliesM[1]) - 1]);
  if (contactsM) return !!(raw.contact_actions?.requests?.[parseInt(contactsM[1]) - 1]);
  switch (key) {
    case 'travel':         return !!(raw.submission?.narrative?.travel_description);
    case 'feeding':        return !!(raw.feeding?.method || sub.responses?.['_feed_method']);
    case 'project_1':      return !!(sub.responses?.project_1_action || raw.projects?.[0]);
    case 'project_2':      return !!(sub.responses?.project_2_action || raw.projects?.[1]);
    case 'project_3':      return !!(sub.responses?.project_3_action || raw.projects?.[2]);
    case 'project_4':      return !!(sub.responses?.project_4_action || raw.projects?.[3]);
    case 'resources':      return !!(raw.retainer_actions?.actions?.length);
    case 'correspondence': return !!(raw.submission?.narrative?.correspondence);
    case 'xp':             return !!(raw.meta?.xp_spend);
    default:               return false;
  }
}

/** Return tooltip text describing what a specific allies/contacts slot contains. */
function _chkTooltip(sub, key) {
  const raw = sub?._raw || {};
  const alliesM = key.match(/^allies_(\d+)$/);
  if (alliesM) {
    const action = raw.sphere_actions?.[parseInt(alliesM[1]) - 1];
    return action ? `${action.merit_type}: ${action.action_type}` : '';
  }
  const contactsM = key.match(/^contacts_(\d+)$/);
  if (contactsM) {
    const req = raw.contact_actions?.requests?.[parseInt(contactsM[1]) - 1];
    if (!req) return '';
    const typeMatch = req.match(/Contact Type:\s*([^\n]+)/i);
    return typeMatch ? `Contact: ${typeMatch[1].trim()}` : 'Contact';
  }
  return '';
}

// _chkState returns one of:
//   'empty'         — section not present in this submission
//   'unsighted'     — present but ST hasn't touched it          ✗
//   'no_action'     — reviewed; skipped / no valid action        □
//   'dice_validated'— pool confirmed and/or dice rolled          ◆
//   'drafted'       — narrative response drafted                 ✎
//   'confirmed'     — fully signed off                           ★
//   'sighted'       — manually marked in-progress               ?
function _chkState(sub, key) {
  if (!_chkHasContent(sub, key)) return 'empty';

  // ── Feeding ──
  if (key === 'feeding') {
    const fr  = sub.feeding_review || {};
    const ps  = fr.pool_status;
    if (ps === 'no_feed')                       return 'no_action';
    if (sub.feeding_roll || ps === 'validated') return 'confirmed';
  }

  // ── Projects ──
  const projM = key.match(/^project_(\d+)$/);
  if (projM) {
    const slot = parseInt(projM[1]) - 1;
    const pr   = (sub.projects_resolved || [])[slot] || {};
    const ps   = pr.pool_status;
    if (ps === 'no_roll' || ps === 'maintenance') return 'no_action';
    if (ps === 'validated') {
      if (pr.response_status === 'reviewed')        return 'confirmed';
      if (pr.st_response)                           return 'drafted';
      return 'dice_validated';
    }
  }

  // ── Allies / sphere merit slots ──
  const raw      = sub._raw || {};
  const resolved = sub.merit_actions_resolved || [];
  const alliesM  = key.match(/^allies_(\d+)$/);
  if (alliesM) {
    const idx = parseInt(alliesM[1]) - 1;
    const ps  = resolved[idx]?.pool_status;
    if (ps === 'no_effect' || ps === 'resolved' || ps === 'no_action' || ps === 'no_roll' || ps === 'skipped') return 'no_action';
    if (ps === 'validated') return 'dice_validated';
  }

  // ── Contacts ──
  const contactsM = key.match(/^contacts_(\d+)$/);
  if (contactsM) {
    const idx = (raw.sphere_actions?.length || 0) + parseInt(contactsM[1]) - 1;
    const ps  = resolved[idx]?.pool_status;
    if (ps === 'no_effect' || ps === 'resolved' || ps === 'no_action' || ps === 'no_roll' || ps === 'skipped') return 'no_action';
    if (ps === 'validated') return 'dice_validated';
  }

  if (sub?.st_review?.sighted?.[key]) return 'sighted';
  return 'unsighted';
}

/** Map a checklist section key to its processing queue entry.key, or null if no queue entry exists. */
function _chkNavKey(sub, section) {
  if (!sub) return null;
  if (section === 'feeding') return `${sub._id}:feeding`;
  const projM = section.match(/^project_(\d+)$/);
  if (projM) return `${sub._id}:proj:${parseInt(projM[1]) - 1}`;
  const alliesM = section.match(/^allies_(\d+)$/);
  if (alliesM) return `${sub._id}:merit:${parseInt(alliesM[1]) - 1}`;
  const contactsM = section.match(/^contacts_(\d+)$/);
  if (contactsM) {
    const raw = sub._raw || {};
    const numSphere = raw.sphere_actions?.length || 0;
    return `${sub._id}:merit:${numSphere + parseInt(contactsM[1]) - 1}`;
  }
  if (section === 'resources') {
    const raw = sub._raw || {};
    const numSphere = raw.sphere_actions?.length || 0;
    const numContacts = raw.contact_actions?.requests?.length || 0;
    return `${sub._id}:merit:${numSphere + numContacts}`;
  }
  return null; // travel, correspondence, xp — no queue entry
}

function renderSubmissionChecklist() {
  const el = document.getElementById('dt-feeding-scene');
  if (!el) return;

  const activeChars = characters.filter(c => !c.retired);
  if (!activeChars.length) { el.innerHTML = ''; return; }

  const subByCharId = new Map();
  for (const s of submissions) {
    const char = findCharacter(s.character_name, s.player_name);
    if (char) subByCharId.set(String(char._id), s);
  }

  const isOpen = el.dataset.open !== 'false';
  const sorted = [...activeChars].sort((a, b) => sortName(a).localeCompare(sortName(b)));

  // Count how many chars have all present sections sighted/validated
  let fullySighted = 0;
  for (const char of sorted) {
    const sub = subByCharId.get(String(char._id)) || null;
    if (!sub) continue;
    const allDone = CHK_SECTIONS.every(sec => {
      const st = _chkState(sub, sec.key);
      return st === 'empty' || st === 'sighted' || st === 'no_action' || st === 'dice_validated' || st === 'drafted' || st === 'confirmed';
    });
    if (allDone) fullySighted++;
  }

  let h = '<div class="dt-chk-panel">';
  h += `<div class="dt-chk-toggle" id="dt-chk-toggle">${isOpen ? '\u25BC' : '\u25BA'} Submission Checklist`;
  h += ` <span class="domain-count">${fullySighted} / ${sorted.length} processed</span>`;
  h += ` <span class="dt-chk-legend">\u2605\u202Fdone &nbsp; \u270E\u202Fdraft &nbsp; \u25C6\u202Fdice &nbsp; \u25A0\u202Fskip &nbsp; ?\u202Fsighted &nbsp; \u2717\u202Fpending &nbsp; \u2014\u202Fn/a</span>`;
  h += `</div>`;

  if (isOpen) {
    h += '<div class="dt-chk-wrap"><table class="dt-chk-table"><thead><tr>';
    h += '<th class="dt-chk-name-col">Character</th>';
    for (const sec of CHK_SECTIONS) h += `<th title="${esc(sec.key)}">${esc(sec.label)}</th>`;
    h += '</tr></thead><tbody>';

    for (const char of sorted) {
      const charId = String(char._id);
      const sub = subByCharId.get(charId) || null;
      const hasSub = !!sub;
      const rowCls = hasSub ? '' : ' dt-chk-nosub';

      h += `<tr class="${rowCls}">`;
      h += `<td class="dt-chk-name">${esc(sortName(char))}`;
      if (!hasSub) h += ' <span class="dt-chk-nosub-badge">No submission</span>';
      h += '</td>';

      for (const sec of CHK_SECTIONS) {
        const state  = _chkState(sub, sec.key);
        const tip    = _chkTooltip(sub, sec.key);
        const navKey = state !== 'empty' ? _chkNavKey(sub, sec.key) : null;
        const navA   = navKey ? ` data-chk-nav-key="${esc(navKey)}"` : '';
        const navCls = navKey ? ' dt-chk-nav' : '';
        const jump   = navKey ? ' \u2014 click to jump' : '';
        const tipPfx = tip ? esc(tip) + ' \u2014 ' : '';
        if (state === 'empty') {
          h += `<td class="dt-chk-empty"${tip ? ` title="${esc(tip)}"` : ''}>\u2014</td>`;
        } else if (state === 'confirmed') {
          h += `<td class="dt-chk-confirmed${navCls}" title="${tipPfx}Confirmed${jump}"${navA}>\u2605</td>`;
        } else if (state === 'drafted') {
          h += `<td class="dt-chk-drafted${navCls}" title="${tipPfx}Draft written${jump}"${navA}>\u270E</td>`;
        } else if (state === 'dice_validated') {
          h += `<td class="dt-chk-dice${navCls}" title="${tipPfx}Dice validated${jump}"${navA}>\u25C6</td>`;
        } else if (state === 'no_action') {
          h += `<td class="dt-chk-no-action${navCls}" title="${tipPfx}No action needed${jump}"${navA}>\u25A0</td>`;
        } else if (state === 'sighted') {
          h += `<td class="dt-chk-sighted dt-chk-cell${navCls}" data-sub-id="${esc(sub._id)}" data-section="${esc(sec.key)}" title="${tipPfx}In progress${jump} \u2014 Ctrl+click to unsight"${navA}>?</td>`;
        } else {
          h += `<td class="dt-chk-unsighted dt-chk-cell${navCls}" data-sub-id="${esc(sub._id)}" data-section="${esc(sec.key)}" title="${tipPfx}Not reviewed${jump} \u2014 Ctrl+click to mark sighted"${navA}>\u2717</td>`;
        }
      }

      h += '</tr>';
    }

    h += '</tbody></table></div>';
  }

  h += '</div>';
  el.innerHTML = h;

  document.getElementById('dt-chk-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderSubmissionChecklist();
  });

  // Navigation — click any cell that has a linked queue entry
  el.querySelectorAll('.dt-chk-nav').forEach(cell => {
    cell.addEventListener('click', e => {
      if (e.ctrlKey) return; // Ctrl+click handled by sighted toggle below
      const navKey = cell.dataset.chkNavKey;
      if (!navKey) return;
      procExpandedKeys.add(navKey);
      const procContainer = document.getElementById('dt-submissions');
      if (!procContainer) return;
      renderProcessingMode(procContainer);
      requestAnimationFrame(() => {
        const entryEl = procContainer.querySelector(`.proc-action-row[data-proc-key="${CSS.escape(navKey)}"]`);
        (entryEl || procContainer).scrollIntoView({ behavior: 'smooth', block: entryEl ? 'center' : 'start' });
      });
    });
  });

  // Sighted toggle — Ctrl+click on pending/sighted cells
  el.querySelectorAll('.dt-chk-cell').forEach(cell => {
    cell.addEventListener('click', async e => {
      if (!e.ctrlKey) return; // navigation handled above
      const subId   = cell.dataset.subId;
      const section = cell.dataset.section;
      if (!subId || !section) return;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const current = sub?.st_review?.sighted?.[section] || false;
      const next = !current;
      await updateSubmission(subId, { [`st_review.sighted.${section}`]: next });
      if (!sub.st_review) sub.st_review = {};
      if (!sub.st_review.sighted) sub.st_review.sighted = {};
      sub.st_review.sighted[section] = next;
      renderSubmissionChecklist();
    });
  });
}

// ── Feeding Scene Summary (GC-2) ────────────────────────────────────────────

/** Derive the primary feeding territory (resident > poacher) from a submission's territory grid. */
function getPrimaryTerritory(sub) {
  if (!sub?.responses?.feeding_territories) return null;
  let grid;
  try { grid = JSON.parse(sub.responses.feeding_territories); } catch { return null; }
  // Prefer resident, fall back to poacher
  for (const status of ['resident', 'poacher']) {
    for (const [key, val] of Object.entries(grid)) {
      if (val === status) {
        return FEEDING_TERRITORIES.find(t =>
          t.toLowerCase().replace(/[^a-z0-9]+/g, '_') === key
        ) || null;
      }
    }
  }
  return null;
}

/** Look up territory record by display name. Returns { ambience, ambienceMod } or null. */
function getTerritoryByName(terrName) {
  if (!terrName) return null;
  return TERRITORY_DATA.find(t =>
    terrName.toLowerCase().includes(t.name.toLowerCase().replace(/^the\s+/i, '')) ||
    t.name.toLowerCase().includes(terrName.toLowerCase().replace(/^the\s+/i, ''))
  ) || null;
}

/** Look up ambience string for a territory display name. */
function getTerritoryAmbienceByName(terrName) {
  return getTerritoryByName(terrName)?.ambience || null;
}

/** Build best generic pool (highest total across all methods) for a character with no submission. */
function bestGenericPool(char) {
  let best = null;
  for (const m of FEED_METHODS) {
    const p = buildFeedingPool(char, m.id, 0);
    if (p && (!best || p.total > best.total)) {
      best = { ...p, methodName: m.name };
    }
  }
  return best;
}

function renderFeedingScene() {
  const el = document.getElementById('dt-feeding-scene');
  if (!el) return;

  const activeChars = characters.filter(c => !c.retired);
  if (!activeChars.length) { el.innerHTML = ''; return; }

  // Build a map from character _id → submission for quick lookup
  const subByCharId = new Map();
  for (const s of submissions) {
    const char = findCharacter(s.character_name, s.player_name);
    if (char) subByCharId.set(String(char._id), s);
  }

  const isOpen = el.dataset.open !== 'false';
  const sorted = [...activeChars].sort((a, b) => sortName(a).localeCompare(sortName(b)));

  let h = '<div class="dt-scene-panel">';
  h += `<div class="dt-scene-toggle" id="dt-scene-toggle">${isOpen ? '\u25BC' : '\u25BA'} Feeding Scene Summary <span class="domain-count">${sorted.length} characters</span></div>`;

  if (isOpen) {
    h += '<table class="dt-scene-table">';
    h += '<thead><tr>';
    h += '<th>Character</th><th>Method</th><th>Territory</th><th>Ambience</th><th>Pool</th><th>Rote</th>';
    h += '</tr></thead><tbody>';

    for (const char of sorted) {
      const charId = String(char._id);
      const sub = subByCharId.get(charId) || null;
      const hasSub = !!sub;

      // Method
      const methodId = sub?.responses?.['_feed_method'] || null;
      const methodObj = FEED_METHODS_DATA.find(m => m.id === methodId);
      const methodName = methodObj?.name || (hasSub ? 'Other / Custom' : null);

      // Territory + ambience
      const territory = getPrimaryTerritory(sub);
      const terrRec = getTerritoryByName(territory);
      const ambience = terrRec?.ambience || null;
      const ambienceMod = terrRec?.ambienceMod ?? 0;
      const ambModStr = ambienceMod > 0 ? `+${ambienceMod}` : String(ambienceMod);

      // Pool
      let poolTotal = '—';
      let poolNote = '';
      if (hasSub && methodId && methodObj) {
        const pool = buildFeedingPool(char, methodId, ambienceMod);
        poolTotal = pool ? pool.total : '?';
      } else if (!hasSub) {
        const best = bestGenericPool(char);
        if (best) { poolTotal = best.total; poolNote = best.methodName; }
      }

      // Rote flag (ST-set, stored on st_review)
      const rote = sub?.st_review?.feeding_rote || false;
      const rowClass = hasSub ? '' : ' dt-scene-nosub';

      h += `<tr class="dt-scene-row${rowClass}" data-char-id="${esc(charId)}">`;
      h += `<td class="dt-scene-name">${esc(displayName(char))}${!hasSub ? ' <span class="dt-scene-nosub-badge">No submission</span>' : ''}</td>`;
      h += `<td>${methodName ? esc(methodName) : '<span class="dt-scene-dim">\u2014</span>'}</td>`;
      h += `<td>${territory ? esc(territory) : '<span class="dt-scene-dim">\u2014</span>'}</td>`;
      h += `<td>${ambience ? `<span class="dt-scene-amb">${esc(ambience)} <span class="dt-scene-mod">(${ambModStr})</span></span>` : '<span class="dt-scene-dim">\u2014</span>'}</td>`;
      h += `<td class="dt-scene-pool">${poolTotal}${poolNote ? ` <span class="dt-scene-dim">(${esc(poolNote)})</span>` : ''}</td>`;
      h += `<td><label class="dt-scene-rote-lbl"><input type="checkbox" class="dt-scene-rote" data-sub-id="${esc(sub?._id || '')}" ${rote ? 'checked' : ''} ${!hasSub ? 'disabled' : ''}></label></td>`;
      h += '</tr>';
    }

    h += '</tbody></table>';
  }

  h += '</div>';
  el.innerHTML = h;

  document.getElementById('dt-scene-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderFeedingScene();
  });

  el.querySelectorAll('.dt-scene-rote').forEach(cb => {
    cb.addEventListener('change', async () => {
      const subId = cb.dataset.subId;
      if (!subId) return;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const val = cb.checked;
      await updateSubmission(subId, { 'st_review.feeding_rote': val });
      if (!sub.st_review) sub.st_review = {};
      sub.st_review.feeding_rote = val;
    });
  });
}

// ── Feeding Matrix (Story 1.4) ───────────────────────────────────────────────

// Ambience step ladder (index 0 = worst, index 8 = best)
const AMBIENCE_STEPS = ['Hostile', 'Barrens', 'Neglected', 'Untended', 'Settled', 'Tended', 'Curated', 'Verdant', 'The Rack'];

// Canonical territory columns for the matrix (CSV keys in feeding.territories)
const MATRIX_TERRS = [
  { csvKey: 'The Academy',              label: 'Academy',     ambienceKey: 'The Academy' },
  { csvKey: 'The Harbour',              label: 'Harbour',     ambienceKey: 'The Harbour' },
  { csvKey: 'The Dockyards',            label: 'Dockyards',   ambienceKey: 'The Dockyards' },
  { csvKey: 'The Second City',          label: 'Second City', ambienceKey: 'The Second City' },
  { csvKey: 'The North Shore',          label: 'North Shore', ambienceKey: 'The North Shore' },
  { csvKey: 'The Barrens (No Territory)', label: 'Barrens',   ambienceKey: null },
];

// Legacy territory name keys from old submissions stored in MongoDB
const LEGACY_TERR_KEY_MAP = {
  'The City Harbour':   'The Harbour',
  'The Northern Shore': 'The North Shore',
  'The Barrens':        'The Barrens (No Territory)',
};

function getTerritoryAmbience(ambienceKey) {
  if (!ambienceKey) return null;
  const td = TERRITORY_DATA.find(t => t.name === ambienceKey);
  return td?.ambience || null;
}

/** Translate legacy territory keys in a raw territories object to canonical names. */
function _normTerrKeys(rawTerrs) {
  if (!rawTerrs) return {};
  const out = {};
  for (const [k, v] of Object.entries(rawTerrs)) {
    const canonical = LEGACY_TERR_KEY_MAP[k] ?? k;
    out[canonical] = v;
  }
  return out;
}

/** Return a Set of MATRIX_TERRS csvKeys where this submission's character actually fed. */
function _getSubFedTerrs(sub) {
  const fed = new Set();
  let grid = null;

  // ST override takes priority: array of TERRITORY_DATA ids set via feeding pills
  const overrideArr = sub.st_review?.territory_overrides?.feeding;
  if (Array.isArray(overrideArr) && overrideArr.length > 0) {
    for (const tid of overrideArr) {
      if (!tid) continue;
      const mt = MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === tid);
      if (mt) fed.add(mt.csvKey);
    }
    return fed;
  }

  // Prefer responses.feeding_territories (slug keys — new form format)
  if (sub.responses?.feeding_territories) {
    try { grid = JSON.parse(sub.responses.feeding_territories); } catch { grid = null; }
  }

  if (grid) {
    for (const [slug, status] of Object.entries(grid)) {
      if (!status || status === 'none' || status === 'Not feeding here') continue;
      const tid = Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, slug)
        ? TERRITORY_SLUG_MAP[slug] : undefined;
      if (tid === undefined) continue;
      const mt = MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === tid);
      if (mt) fed.add(mt.csvKey);
    }
  } else {
    // Fallback: _raw.feeding.territories (display-name keys, legacy)
    const rawTerrs = _normTerrKeys(sub._raw?.feeding?.territories);
    for (const [csvKey, status] of Object.entries(rawTerrs)) {
      if (!status || status === 'Not feeding here' || status === 'none') continue;
      fed.add(csvKey);
    }
  }

  // Default: if feeding method declared but no territory selected, character feeds from Barrens
  if (fed.size === 0 && (sub._raw?.feeding?.method || sub.responses?.['_feed_method'] || (grid && Object.keys(grid).length > 0))) {
    fed.add('The Barrens (No Territory)');
  }

  return fed;
}

function renderFeedingMatrix() {
  const el = document.getElementById('dt-matrix');
  if (!el) return;

  const activeChars = characters.filter(c => !c.retired)
    .sort((a, b) => sortName(a).localeCompare(sortName(b)));

  if (!submissions.length && !activeChars.length) { el.innerHTML = ''; return; }

  // All 6 columns always shown
  const cols = MATRIX_TERRS;

  // Build residency lookup: feeding_rights + regent + lieutenant always count as residents
  const residentsByTerrKey = {};
  for (const mt of cols) {
    const tid = TERRITORY_SLUG_MAP[mt.csvKey] ?? null;
    const td = (cachedTerritories || []).find(t => t.id === tid);
    const residents = new Set(td?.feeding_rights || []);
    if (td?.regent_id) residents.add(String(td.regent_id));
    if (td?.lieutenant_id) residents.add(String(td.lieutenant_id));
    residentsByTerrKey[mt.csvKey] = residents;
  }

  // Map submission by character id for quick lookup
  const subByCharId = new Map();
  for (const s of submissions) {
    const char = findCharacter(s.character_name, s.player_name);
    if (char) subByCharId.set(String(char._id), s);
  }

  const isOpen = el.dataset.open !== 'false';
  const totalChars = activeChars.length + (submissions.filter(s => !findCharacter(s.character_name, s.player_name)).length);

  let h = `<div class="dt-matrix-panel">`;
  h += `<div class="dt-matrix-toggle" id="dt-matrix-toggle">${isOpen ? '\u25BC' : '\u25BA'} Feeding Matrix <span class="domain-count">${activeChars.length} characters</span></div>`;

  if (isOpen) {
    h += `<div class="dt-matrix-wrap"><table class="dt-matrix-table">`;
    h += '<thead><tr><th>Character</th>';
    for (const t of cols) {
      const ambience = getTerritoryAmbience(t.ambienceKey);
      h += `<th title="${esc(ambience || 'No cap')}">${esc(t.label)}<br><span class="dt-matrix-amb">${esc(ambience || 'N/A')}</span></th>`;
    }
    h += '</tr></thead><tbody>';

    // Track how many characters fed in each territory this cycle
    const feederCounts = {};
    for (const t of cols) feederCounts[t.csvKey] = 0;

    for (const char of activeChars) {
      const charId = String(char._id);
      const sub = subByCharId.get(charId) || null;
      const hasSub = !!sub;
      const fedTerrs = hasSub ? _getSubFedTerrs(sub) : new Set();

      h += `<tr class="dt-matrix-row${hasSub ? '' : ' dt-matrix-nosub'}" ${hasSub ? `data-sub-id="${esc(sub._id)}"` : ''}>`;
      h += `<td class="dt-matrix-char">${esc(displayName(char))}${!hasSub ? ' <span class="dt-matrix-nosub-badge">No submission</span>' : ''}</td>`;

      for (const t of cols) {
        const isBarrens = t.ambienceKey === null;
        const fed = fedTerrs.has(t.csvKey);
        if (!fed) {
          h += '<td class="dt-matrix-empty">\u2014</td>';
        } else {
          feederCounts[t.csvKey]++;
          if (!isBarrens && residentsByTerrKey[t.csvKey].has(charId)) {
            h += '<td class="dt-matrix-resident">O</td>';
          } else {
            h += '<td class="dt-matrix-poach">X</td>';
          }
        }
      }
      h += '</tr>';
    }

    h += '</tbody>';

    // Footer: feeders this cycle vs ambience cap
    h += '<tfoot><tr><td><strong>Feeders</strong></td>';
    for (const t of cols) {
      if (t.ambienceKey === null) {
        h += '<td class="dt-matrix-empty">\u2014</td>';
      } else {
        const ambience = getTerritoryAmbience(t.ambienceKey);
        const cap = ambience ? (AMBIENCE_CAP[ambience] ?? null) : null;
        const count = feederCounts[t.csvKey];
        const overCap = cap !== null && count > cap;
        h += `<td class="${overCap ? 'dt-matrix-overcap' : ''}">${count}${cap !== null ? ` / ${cap}` : ''}</td>`;
      }
    }
    h += '</tr></tfoot>';
    h += '</table>';
    h += '<p class="dt-matrix-note">O = resident feeding. X = poaching (non-resident). Feeders / cap from City ambience. Residents set via City tab.</p>';
    h += '</div>';
  }

  h += '</div>';
  el.innerHTML = h;

  document.getElementById('dt-matrix-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderFeedingMatrix();
  });

  el.querySelectorAll('.dt-matrix-row[data-sub-id]').forEach(row => {
    row.addEventListener('click', () => {
      renderSubmissions();
      row.closest('.dt-matrix-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// ── Cross-Character Conflicts (Story 1.11) ───────────────────────────────────

const COMPETING_ACTIONS = ['increase ambience', 'decrease ambience', 'ambience', 'patrol', 'scout', 'attack', 'hide', 'block', 'protect'];

/**
 * Resolve territory for a project action. Priority:
 * 1. ST override saved to st_review.territory_overrides[projIdx]
 * 2. App form field: sub.responses.project_N_territory
 * 3. Free-text scan of description
 * Returns a TERRITORY_DATA id (e.g. 'academy') or null if unknown.
 */
function _resolveProjectTerritory(sub, projIdx) {
  const overrides = sub.st_review?.territory_overrides || {};
  if (overrides[projIdx]) return overrides[projIdx];
  const n = projIdx + 1;
  const formVal = sub.responses?.[`project_${n}_territory`];
  if (formVal) {
    const id = resolveTerrId(formVal);
    if (id) return id;
  }
  const raw = sub._raw || {};
  const proj = raw.projects?.[projIdx];
  const text = [proj?.description, proj?.desired_outcome, proj?.title].filter(Boolean).join(' ');
  return extractTerritoryFromText(text);
}

function renderTerritoriesAtAGlance() {
  const el = document.getElementById('dt-conflicts');
  if (!el) return;
  if (!submissions.length) { el.innerHTML = ''; return; }

  const isOpen = el.dataset.open !== 'false';
  const profile = currentCycle?.discipline_profile || {};

  // ── Build matrix data: phase → territory → [entries] ──
  const TAAG_PHASES = [
    { key: 'ambience',       label: 'Ambience' },
    { key: 'hide_protect',   label: 'Defensive' },
    { key: 'investigate',    label: 'Investigative' },
    { key: 'attack',         label: 'Hostile' },
    { key: 'support_patrol', label: 'Support/Patrol' },
    { key: 'misc',           label: 'Misc' },
  ];

  // matrix[phaseKey][terrId] = [{ key, charName, subId }]
  const matrix = {};
  for (const p of TAAG_PHASES) matrix[p.key] = {};

  const queue = buildProcessingQueue(submissions);
  for (const entry of queue) {
    if (entry.source !== 'project') continue;
    const phaseKey = entry.phase;
    if (!matrix[phaseKey]) continue; // not a territorial phase
    const sub = submissions.find(s => s._id === entry.subId);
    if (!sub) continue;
    const terrId = _resolveProjectTerritory(sub, entry.actionIdx);
    if (!terrId) continue; // no territory — not shown in matrix (pills let STs assign)
    if (!matrix[phaseKey][terrId]) matrix[phaseKey][terrId] = [];
    matrix[phaseKey][terrId].push({ key: entry.key, charName: entry.charName, subId: entry.subId });
  }

  // Only show rows that have at least one assignment
  const activePhases = TAAG_PHASES.filter(p =>
    TERRITORY_DATA.some(t => (matrix[p.key][t.id] || []).length > 0)
  );

  let h = `<div class="dt-conflict-panel">`;
  h += `<div class="dt-matrix-toggle" id="dt-taag-toggle">${isOpen ? '\u25BC' : '\u25BA'} Territories at a Glance`;
  if (!activePhases.length) h += ` <span class="dt-matrix-note">No territory assignments yet</span>`;
  h += `</div>`;

  if (isOpen) {
    h += `<div class="dt-scroll-wrap">`;
    h += `<table class="dt-taag-table">`;
    h += `<thead><tr>`;
    h += `<th>Action</th>`;
    for (const t of TERRITORY_DATA) {
      h += `<th>${esc(t.name.replace(/^The\s+/i, ''))}</th>`;
    }
    h += `</tr></thead>`;
    h += `<tbody>`;

    if (!activePhases.length) {
      h += `<tr class="dt-taag-empty-row"><td colspan="${1 + TERRITORY_DATA.length}">Assign territories to project actions using the pills in the processing queue.</td></tr>`;
    } else {
      for (const p of TAAG_PHASES) {
        const rowEntries = matrix[p.key];
        const hasAny = TERRITORY_DATA.some(t => (rowEntries[t.id] || []).length > 0);
        if (!hasAny) continue;
        h += `<tr>`;
        h += `<td class="dt-taag-phase-lbl">${esc(p.label)}</td>`;
        for (const t of TERRITORY_DATA) {
          const chips = rowEntries[t.id] || [];
          h += `<td class="dt-taag-cell">`;
          if (chips.length) {
            h += `<div class="dt-taag-chips">`;
            for (const c of chips) {
              h += `<span class="dt-taag-chip" data-proc-key="${esc(c.key)}" title="${esc(c.charName)}">${esc(c.charName)}</span>`;
            }
            h += `</div>`;
          } else {
            h += `<span class="dt-taag-empty">\u2014</span>`;
          }
          h += `</td>`;
        }
        h += `</tr>`;
      }
    }
    h += `</tbody></table></div>`;

    // ── Discipline Profile Matrix ──
    h += `<div class="proc-disc-header" data-toggle="disc-dash">`;
    h += `<span class="proc-amb-title">Discipline Profile Matrix</span>`;
    h += `<button class="dt-btn proc-disc-retally" id="disc-retally-btn">Retally</button>`;
    h += `<span class="proc-amb-toggle">${discDashCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
    h += `</div>`;

    if (!discDashCollapsed) {
      const discSet = new Set();
      const terrSet = new Set();
      for (const [terrId, discs] of Object.entries(profile)) {
        for (const [disc, count] of Object.entries(discs)) {
          if (count > 0) { discSet.add(disc); terrSet.add(terrId); }
        }
      }
      const discList = [...discSet].sort();
      const terrList = TERRITORY_DATA.filter(t => terrSet.has(t.id));

      if (!discList.length) {
        h += `<p class="proc-amb-empty">No discipline uses recorded yet. Disciplines are recorded when feeding or ambience project pools are validated.</p>`;
      } else {
        h += `<div class="dt-scroll-wrap">`;
        h += `<table class="proc-disc-table">`;
        h += `<thead><tr><th>Discipline</th>`;
        for (const t of terrList) h += `<th>${esc(t.name.replace(/^The\s+/i, ''))}</th>`;
        h += `</tr></thead><tbody>`;
        for (const disc of discList) {
          h += `<tr><td class="proc-disc-name">${esc(disc)}</td>`;
          for (const t of terrList) {
            const count = profile[t.id]?.[disc] || 0;
            h += `<td class="${count >= 3 ? 'proc-disc-high' : count > 0 ? 'proc-disc-used' : ''}">${count > 0 ? count : ''}</td>`;
          }
          h += `</tr>`;
        }
        h += `</tbody></table></div>`;
      }
    }
  }

  h += `</div>`; // dt-conflict-panel
  el.innerHTML = h;

  // Toggle
  document.getElementById('dt-taag-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderTerritoriesAtAGlance();
  });

  // Chips — jump to action in processing queue
  el.querySelectorAll('.dt-taag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const key = chip.dataset.procKey;
      if (procExpandedKeys.has(key)) { procExpandedKeys.delete(key); } else { procExpandedKeys.add(key); }
      const procContainer = document.getElementById('dt-submissions');
      if (procContainer) {
        renderProcessingMode(procContainer);
        procContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  // Disc-dash toggle
  el.querySelector('[data-toggle="disc-dash"]')?.addEventListener('click', () => {
    discDashCollapsed = !discDashCollapsed;
    renderTerritoriesAtAGlance();
  });

  // Retally button
  el.querySelector('#disc-retally-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.textContent = 'Tallying\u2026';
    btn.disabled = true;
    await recomputeDisciplineProfile();
    renderTerritoriesAtAGlance();
  });
}

// ── Ambience Update After Cycle Close (Story 1.12) ──────────────────────────

async function handleApplyAmbience(cycleId, cycle) {
  if (cycle.ambience_applied) {
    alert('Ambience changes have already been applied for this cycle.');
    return;
  }

  // 1. Fetch territories from DB; seed from TERRITORY_DATA if collection is empty
  let dbTerritories = [];
  try { dbTerritories = await apiGet('/api/territories'); } catch { /* ignore */ }

  if (!dbTerritories.length) {
    for (const td of TERRITORY_DATA) {
      try { await apiPost('/api/territories', { id: td.id, name: td.name, ambience: td.ambience }); } catch { /* ignore */ }
    }
    try { dbTerritories = await apiGet('/api/territories'); } catch { /* ignore */ }
  }

  // Build name → DB record map; fall back to TERRITORY_DATA if DB still empty
  const terrMap = {};
  for (const t of dbTerritories) { if (t.name) terrMap[t.name] = t; }
  if (!Object.keys(terrMap).length) {
    for (const td of TERRITORY_DATA) terrMap[td.name] = { ...td };
  }

  // 2. Scan resolved projects and merit actions for ambience changes
  // Map: territory name → { increases: [successes], decreases: [successes] }
  const ambienceChanges = {};
  function getTerrChanges(name) {
    if (!ambienceChanges[name]) ambienceChanges[name] = { increases: [], decreases: [] };
    return ambienceChanges[name];
  }

  // Extract ambienceKey from a text description
  function extractTerritory(text) {
    if (!text) return null;
    const lc = text.toLowerCase();
    for (const mt of MATRIX_TERRS) {
      if (mt.ambienceKey && (lc.includes(mt.label.toLowerCase()) || lc.includes(mt.csvKey.toLowerCase()))) {
        return mt.ambienceKey;
      }
    }
    return null;
  }

  for (const sub of submissions) {
    const raw = sub._raw || {};

    // Projects
    const projects = raw.projects || [];
    const projResolved = sub.projects_resolved || [];
    projects.forEach((proj, i) => {
      const res = projResolved[i];
      if (!res?.roll) return;
      const at = (proj.action_type || '').toLowerCase();
      const isIncrease = at === 'ambience_increase';
      const isDecrease = at === 'ambience_decrease';
      if (!isIncrease && !isDecrease) return;
      const terrName = extractTerritory(proj.description) || extractTerritory(proj.desired_outcome);
      if (!terrName) return;
      const ch = getTerrChanges(terrName);
      if (isIncrease) ch.increases.push(res.roll.successes || 0);
      else ch.decreases.push(res.roll.successes || 0);
    });

    // Sphere / merit actions
    const sphereActions = raw.sphere_actions || [];
    const meritResolved = sub.merit_actions_resolved || [];
    sphereActions.forEach((action, i) => {
      const res = meritResolved[i];
      if (!res?.roll) return;
      const at = (action.action_type || '').toLowerCase();
      const isIncrease = at === 'ambience_increase';
      const isDecrease = at === 'ambience_decrease';
      if (!isIncrease && !isDecrease) return;
      const terrName = extractTerritory(action.description) || extractTerritory(action.desired_outcome);
      if (!terrName) return;
      const ch = getTerrChanges(terrName);
      if (isIncrease) ch.increases.push(res.roll.successes || 0);
      else ch.decreases.push(res.roll.successes || 0);
    });
  }

  // 3. Calculate net step changes per territory
  // Any net-winning side moves 1 step; decreases cap at -2; increases cap at +1
  const proposed = [];
  for (const [terrName, changes] of Object.entries(ambienceChanges)) {
    const rec = terrMap[terrName];
    if (!rec) continue;
    const currentAmbience = rec.ambience;
    const stepIdx = AMBIENCE_STEPS.indexOf(currentAmbience);
    if (stepIdx < 0) continue;

    const totalInc = changes.increases.reduce((a, b) => a + b, 0);
    const totalDec = changes.decreases.reduce((a, b) => a + b, 0);

    let netSteps = 0;
    if (totalInc > totalDec) {
      netSteps = 1; // cap: +1 per cycle
    } else if (totalDec > totalInc) {
      const decActions = changes.decreases.filter(s => s > 0).length;
      netSteps = -Math.min(2, decActions); // cap: -2 per cycle
    }
    if (netSteps === 0) continue;

    const newIdx = Math.max(0, Math.min(AMBIENCE_STEPS.length - 1, stepIdx + netSteps));
    const newAmbience = AMBIENCE_STEPS[newIdx];
    if (newAmbience !== currentAmbience) {
      proposed.push({ terrName, rec, currentAmbience, newAmbience, netSteps });
    }
  }

  // 4. Confirm with ST
  if (!proposed.length) {
    if (!confirm('No resolved ambience actions found for this cycle.\nMark cycle as ambience-processed anyway?')) return;
    await updateCycle(cycleId, { ambience_applied: true });
    const i = allCycles.findIndex(c => c._id === cycleId);
    if (i >= 0) allCycles[i].ambience_applied = true;
    await loadCycleById(cycleId);
    return;
  }

  const lines = proposed.map(p =>
    `  ${p.terrName}: ${p.currentAmbience} \u2192 ${p.newAmbience} (${p.netSteps > 0 ? '+' : ''}${p.netSteps} step)`
  );
  if (!confirm(`Apply the following ambience changes?\n\n${lines.join('\n')}`)) return;

  // 5. PUT each territory
  for (const { terrName, rec, newAmbience } of proposed) {
    try {
      if (rec._id) {
        await apiPut(`/api/territories/${rec._id}`, { ambience: newAmbience });
      } else {
        await apiPost('/api/territories', { id: rec.id, name: rec.name, ambience: newAmbience });
      }
    } catch (err) {
      console.error(`Failed to update ambience for ${terrName}:`, err.message);
    }
  }

  // 6. Mark cycle as ambience-applied
  await updateCycle(cycleId, { ambience_applied: true });
  const idx = allCycles.findIndex(c => c._id === cycleId);
  if (idx >= 0) allCycles[idx].ambience_applied = true;

  await loadCycleById(cycleId);
}

// ── Generic pool builder (projects + merit actions) ────────────────────────

/**
 * Build a dice pool from explicit attr/skill/disc selections.
 * Applies unskilled penalty: -3 mental at 0 dots, -1 others at 0 dots.
 * Returns { total, expression, unskilled, attrVal, skillVal, discVal, modifier }.
 */
function buildGenericPool(char, attrName, skillName, discName, modifier) {
  const attrVal = attrName ? getAttrVal(char, attrName) : 0;
  const skillVal = skillName ? skTotal(char, skillName) : 0;
  const discVal = (discName && char?.disciplines?.[discName]?.dots) || 0;
  const mod = modifier || 0;
  const unskilled = skillName && skillVal === 0
    ? (SKILLS_MENTAL.includes(skillName) ? -3 : -1)
    : 0;
  const total = Math.max(1, attrVal + skillVal + discVal + mod + unskilled);

  const parts = [];
  if (attrName) parts.push(`${attrVal} ${attrName}`);
  if (skillName) parts.push(`${skillVal} ${skillName}`);
  if (discVal) parts.push(`${discVal} ${discName}`);
  if (mod) parts.push(`${mod > 0 ? '+' : ''}${mod}`);
  if (unskilled) parts.push(`\u2212${Math.abs(unskilled)} unskilled`);
  const expression = (parts.join(' + ') || '0') + ` = ${total}`;

  return { total, expression, unskilled, attrVal, skillVal, discVal, modifier: mod };
}

function attrOptions(char) {
  return ALL_ATTRS.map(a => {
    const v = char ? getAttrVal(char, a) : 0;
    return `<option value="${esc(a)}">${esc(a)} (${v})</option>`;
  }).join('');
}

function skillOptions(char) {
  let h = '<option value="">— Skill —</option>';
  for (const [cat, skills] of Object.entries(SKILL_CATS)) {
    h += `<optgroup label="${esc(cat)}">`;
    for (const s of skills) {
      const v = char ? skTotal(char, s) : 0;
      h += `<option value="${esc(s)}">${esc(s)} (${v})</option>`;
    }
    h += '</optgroup>';
  }
  return h;
}

function discOptions(char) {
  let h = '<option value="">— Discipline —</option>';
  if (!char?.disciplines) return h;
  for (const [d, v] of Object.entries(char.disciplines)) {
    const dv = v?.dots || 0;
    if (dv > 0) h += `<option value="${esc(d)}">${esc(d)} (${dv})</option>`;
  }
  return h;
}

/**
 * @param {string} selClass - CSS class to add to selects (e.g. 'dt-proj-sel' or 'dt-merit-sel')
 * @param {string} modClass - CSS class to add to modifier input
 */
function poolBuilderUI(subId, idxField, idxVal, char, pen, compactPool, selClass = 'dt-proj-sel', modClass = 'dt-proj-mod') {
  const selVal = (v) => v ? ` data-selected="${esc(v)}"` : '';

  let h = `<div class="dt-pool-builder">`;
  h += `<select class="${selClass} dt-pool-sel" data-sub-id="${esc(subId)}" data-${esc(idxField)}="${idxVal}" data-field="attr">`;
  h += `<option value="">— Attr —</option>${attrOptions(char)}`;
  h += '</select>';
  h += `<select class="${selClass} dt-pool-sel" data-sub-id="${esc(subId)}" data-${esc(idxField)}="${idxVal}" data-field="skill">`;
  h += skillOptions(char);
  h += '</select>';
  h += `<select class="${selClass} dt-pool-sel" data-sub-id="${esc(subId)}" data-${esc(idxField)}="${idxVal}" data-field="disc">`;
  h += discOptions(char);
  h += '</select>';
  h += `<input class="${modClass} dt-pool-mod" type="number" value="${pen.modifier || 0}" placeholder="Mod" title="Modifier"
    data-sub-id="${esc(subId)}" data-${esc(idxField)}="${idxVal}">`;

  if (pen.attr) {
    h += `<span class="dt-pool-display">${esc(compactPool.expression)}</span>`;
  }
  // Skill metadata: 9-again badge + spec toggles (feature.57)
  h += skillMetaUI(char, pen.skill, subId, idxField, idxVal, pen);
  h += '</div>';
  return h;
}

/**
 * Render skill metadata block (9-again badge + spec toggles) for pool builders.
 * Returns empty string if no metadata exists.
 */
function skillMetaUI(char, skillName, subId, idxField, idxVal, pen) {
  if (!char || !skillName) return '';
  const nineAgain = skNineAgain(char, skillName);
  const specs = skSpecs(char, skillName);
  if (!nineAgain && !specs.length) return '';
  const activeSpecs = pen.active_specs || [];
  let h = '<div class="dt-skill-meta">';
  if (nineAgain) h += '<span class="dt-pool-9a-auto">9-Again (auto)</span>';
  for (const sp of specs) {
    const checked = activeSpecs.includes(sp);
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-spec-toggle"
      data-sub-id="${esc(subId)}" data-${esc(idxField)}="${idxVal}" data-spec="${esc(sp)}"
      ${checked ? 'checked' : ''}>${esc(sp)} +1</label>`;
  }
  h += '</div>';
  return h;
}

// Render dice result badge for project/merit panels
function renderResolveBadge(roll) {
  if (!roll) return '';
  const rc = roll.exceptional ? 'dt-succ-exc' : roll.successes === 0 ? 'dt-succ-fail' : 'dt-succ-ok';
  return `<span class="dt-resolve-badge ${rc}">${roll.successes} ${roll.successes === 1 ? 'success' : 'successes'}${roll.exceptional ? ' (exceptional)' : ''}</span>`;
}

// ── Project Resolution Panel (Story 1.2) ────────────────────────────────────

function renderProjectsPanel(s, raw, char) {
  let projects = raw.projects || [];
  // Fallback: construct project list from responses when _raw.projects is absent
  // (happens when CSV data was mapped to responses but _raw wasn't restructured)
  if (!projects.length && s.responses) {
    for (let n = 1; n <= 4; n++) {
      const action = s.responses[`project_${n}_action`];
      if (!action) continue;
      projects.push({
        action_type: action,
        action_type_raw: action,
        project_name: s.responses[`project_${n}_title`] || null,
        desired_outcome: s.responses[`project_${n}_outcome`] || '',
        primary_pool: s.responses[`project_${n}_pool_expr`] ? { expression: s.responses[`project_${n}_pool_expr`] } : null,
        secondary_pool: s.responses[`project_${n}_pool2_expr`] ? { expression: s.responses[`project_${n}_pool2_expr`] } : null,
        characters: s.responses[`project_${n}_cast`] || null,
        merits: s.responses[`project_${n}_merits`] || null,
        xp_spend: s.responses[`project_${n}_xp`] || null,
        detail: s.responses[`project_${n}_description`] || null,
      });
    }
  }
  if (!projects.length) return '';

  const resolved = s.projects_resolved || [];
  const pending = s._proj_pending || [];

  let h = '<div class="dt-proj-detail">';
  h += '<div class="dt-feed-header">Projects</div>';

  projects.forEach((proj, i) => {
    const res = resolved[i];
    const pen = pending[i] || {};
    const rote = pen.rote ?? res?.roll?.params?.rote ?? false;
    const pool = buildGenericPool(char, pen.attr, pen.skill, pen.disc, pen.modifier || 0);
    const isResolved = !!res?.roll;

    h += `<div class="dt-proj-slot${isResolved ? ' dt-proj-resolved' : ' dt-proj-unresolved'}">`;
    h += `<div class="dt-proj-header">`;
    h += `<span class="dt-proj-type">${esc(proj.action_type_raw || proj.action_type)}</span>`;
    h += isResolved
      ? ` <span class="dt-proj-done-badge">\u2713 Resolved</span>`
      : ` <span class="dt-proj-pending-badge">\u26A0 Unresolved</span>`;
    h += '</div>';

    // Structured fields extracted from description
    if (proj.project_name) h += `<div class="dt-proj-field"><span class="dt-proj-lbl">Name:</span> ${esc(proj.project_name)}</div>`;
    if (proj.desired_outcome) h += `<div class="dt-proj-field"><span class="dt-proj-lbl">Desired:</span> ${esc(proj.desired_outcome)}</div>`;
    if (proj.characters) h += `<div class="dt-proj-field"><span class="dt-proj-lbl">Characters:</span> ${esc(proj.characters)}</div>`;
    if (proj.primary_pool?.expression) h += `<div class="dt-proj-field"><span class="dt-proj-lbl">Primary Pool:</span> ${esc(proj.primary_pool.expression)}</div>`;
    if (proj.secondary_pool?.expression) h += `<div class="dt-proj-field"><span class="dt-proj-lbl">Secondary Pool:</span> ${esc(proj.secondary_pool.expression)}</div>`;
    if (proj.xp_spend != null) h += `<div class="dt-proj-field"><span class="dt-proj-lbl">XP Spend:</span> ${esc(String(proj.xp_spend))}</div>`;
    if (proj.merits) h += `<div class="dt-proj-field"><span class="dt-proj-lbl">Merits:</span> ${esc(proj.merits)}</div>`;
    if (proj.bonuses) h += `<div class="dt-proj-field"><span class="dt-proj-lbl">Bonuses:</span> ${esc(proj.bonuses)}</div>`;
    if (proj.detail) h += `<div class="dt-proj-desc">${esc(proj.detail)}</div>`;

    // Pool builder
    if (char) {
      h += poolBuilderUI(s._id, 'proj-idx', i, char, pen, pool);
      h += `<label class="dt-proj-rote-lbl"><input type="checkbox" class="dt-proj-rote" data-sub-id="${esc(s._id)}" data-proj-idx="${i}" ${rote ? 'checked' : ''}>Rote</label>`;
      h += `<button class="dt-btn dt-proj-roll-btn" data-sub-id="${esc(s._id)}" data-proj-idx="${i}"
        ${!pen.attr ? 'disabled title="Select an attribute first"' : ''}>${isResolved ? 'Re-roll' : 'Roll'}</button>`;
    }

    if (isResolved) h += renderResolveBadge(res.roll);

    // ST note (internal only)
    const note = res?.st_note || pen.st_note || '';
    h += `<textarea class="dt-proj-note" data-sub-id="${esc(s._id)}" data-proj-idx="${i}" placeholder="ST note for this project (internal)...">${esc(note)}</textarea>`;

    // Player-visible writeup
    const writeup = res?.writeup || '';
    h += `<textarea class="dt-proj-writeup" data-sub-id="${esc(s._id)}" data-proj-idx="${i}" placeholder="Player-visible writeup for this project...">${esc(writeup)}</textarea>`;

    h += '</div>';
  });

  h += '</div>';
  return h;
}

async function handleProjectRollSave(subId, projIdx, pool, rollResult) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  const pending = (sub._proj_pending || [])[projIdx] || {};
  const resolved = [...(sub.projects_resolved || [])];
  while (resolved.length <= projIdx) resolved.push(null);
  resolved[projIdx] = {
    action_type: ((sub._raw || {}).projects || [])[projIdx]?.action_type || '',
    pool: { ...pool },
    roll: rollResult,
    st_note: pending.st_note || '',
    resolved_at: new Date().toISOString(),
  };

  try {
    await updateSubmission(subId, { projects_resolved: resolved });
    sub.projects_resolved = resolved;
    renderSubmissions();
  } catch (err) {
    console.error('Failed to save project roll:', err.message);
  }
}

// ── Merit Actions Panel (Story 1.3) ─────────────────────────────────────────

const PASSIVE_MERIT_ACTIONS = ['no action taken', 'passive', 'none'];
const MERIT_NO_ROLL = ['allies within favour', 'allies_favour'];
const INVESTIGATE_WARNING_TYPES = ['investigate', 'investigation', 'gather info', 'gather information'];

function renderMeritActionsPanel(s, raw, char) {
  const spheres = raw.sphere_actions || [];
  const contacts = raw.contact_actions || {};
  const retainers = raw.retainer_actions || {};

  const allMeritActions = [
    ...spheres,
    ...(contacts.requests || []).map(r => ({ merit_type: 'Contacts', action_type: 'Gather Info', description: r })),
    ...(retainers.actions || []).map(r => ({ merit_type: 'Retainer', action_type: 'Directed Action', description: r })),
  ];

  if (!allMeritActions.length) return '';

  const resolved = s.merit_actions_resolved || [];
  const pending = s._merit_pending || [];

  let h = '<div class="dt-merit-detail">';
  h += '<div class="dt-feed-header">Merit Actions</div>';

  allMeritActions.forEach((action, i) => {
    const res = resolved[i];
    const pen = pending[i] || {};
    const pool = buildGenericPool(char, pen.attr, pen.skill, pen.disc, pen.modifier || 0);
    const isResolved = !!res?.roll || res?.no_roll;
    const actionLower = (action.action_type || '').toLowerCase();
    const isPassive = PASSIVE_MERIT_ACTIONS.some(p => actionLower.includes(p));
    const isInvestigate = INVESTIGATE_WARNING_TYPES.some(p => actionLower.includes(p));

    h += `<div class="dt-proj-slot${isResolved ? ' dt-proj-resolved' : (isPassive ? '' : ' dt-proj-unresolved')}">`;
    h += `<div class="dt-proj-header">`;
    h += `<span class="dt-proj-type">${esc(action.merit_type)}</span>`;
    h += ` <span class="dt-merit-action-type">${esc(action.action_type)}</span>`;
    if (isResolved) {
      h += res.no_roll
        ? ' <span class="dt-proj-done-badge">\u2713 No roll needed</span>'
        : ` <span class="dt-proj-done-badge">\u2713 Resolved</span>`;
    } else if (isPassive) {
      h += ' <span class="dt-merit-passive">Passive — no action</span>';
    } else {
      h += ' <span class="dt-proj-pending-badge">\u26A0 Unresolved</span>';
    }
    h += '</div>';

    if (action.description) h += `<div class="dt-proj-desc">${esc(action.description)}</div>`;
    if (action.desired_outcome) h += `<div class="dt-proj-outcome"><em>Desired:</em> ${esc(action.desired_outcome)}</div>`;

    if (isInvestigate) {
      h += `<div class="dt-merit-warn">\u26A0 Contacts/Allies cannot surface Kindred identities or investigation-threshold intel.</div>`;
    }

    if (!isPassive && char) {
      h += poolBuilderUI(s._id, 'merit-idx', i, char, pen, pool, 'dt-merit-sel', 'dt-merit-mod');
      h += `<button class="dt-btn dt-merit-roll-btn" data-sub-id="${esc(s._id)}" data-merit-idx="${i}"
        ${!pen.attr ? 'disabled title="Select an attribute first"' : ''}>${isResolved ? 'Re-roll' : 'Roll'}</button>`;
      if (!isResolved) {
        h += `<button class="dt-btn dt-btn-muted dt-merit-noroll-btn" data-sub-id="${esc(s._id)}" data-merit-idx="${i}"
          style="margin-left:8px">No roll needed</button>`;
      }
    }

    if (isResolved && res.roll) h += renderResolveBadge(res.roll);

    const note = res?.st_note || pen.st_note || '';
    h += `<textarea class="dt-merit-note" data-sub-id="${esc(s._id)}" data-merit-idx="${i}" placeholder="ST note for this action...">${esc(note)}</textarea>`;

    h += '</div>';
  });

  h += '</div>';
  return h;
}

async function handleMeritRollSave(subId, meritIdx, pool, rollResult) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  const pending = (sub._merit_pending || [])[meritIdx] || {};
  const allActions = [
    ...((sub._raw || {}).sphere_actions || []),
    ...((sub._raw?.contact_actions?.requests || []).map(r => ({ merit_type: 'Contacts', action_type: 'Gather Info', description: r }))),
    ...((sub._raw?.retainer_actions?.actions || []).map(r => ({ merit_type: 'Retainer', action_type: 'Directed Action', description: r }))),
  ];
  const resolved = [...(sub.merit_actions_resolved || [])];
  while (resolved.length <= meritIdx) resolved.push(null);
  resolved[meritIdx] = {
    merit_type: allActions[meritIdx]?.merit_type || '',
    action_type: allActions[meritIdx]?.action_type || '',
    pool: { ...pool },
    roll: rollResult,
    st_note: pending.st_note || '',
    resolved_at: new Date().toISOString(),
  };

  try {
    await updateSubmission(subId, { merit_actions_resolved: resolved });
    sub.merit_actions_resolved = resolved;
    renderSubmissions();
  } catch (err) {
    console.error('Failed to save merit action roll:', err.message);
  }
}
