/**
 * Downtime domain views — admin app.
 * CSV upload, cycle management, submission overview, character bridge, feeding rolls.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { parseDowntimeCSV } from '../downtime/parser.js';
import { getCycles, getActiveCycle, createCycle, updateCycle, closeCycle, openGamePhase, getSubmissionsForCycle, upsertCycle, updateSubmission, mapRawToResponses, signoffPhase, DTUX_PHASES } from '../downtime/db.js';
import { TERRITORY_DATA, AMBIENCE_CAP, AMBIENCE_MODS, FEEDING_TERRITORIES, FEED_METHODS as FEED_METHODS_DATA, MAINTENANCE_MERITS, normaliseSorceryTargets } from '../tabs/downtime-data.js';
import { rollPool, showRollModal, parseDiceString } from '../downtime/roller.js';
import { getAttrEffective as getAttrVal, getSkillObj, skDots, skTotal, skNineAgain, skSpecs } from '../data/accessors.js';
import { displayName, displayNameRaw, sortName, hasAoE, isSpecs } from '../data/helpers.js';
import { calcTotalInfluence, domMeritContrib, ssjHerdBonus, flockHerdBonus, effectiveInvictusStatus } from '../editor/domain.js';
import { applyDerivedMerits } from '../editor/mci.js';
import { SKILLS_MENTAL, ALL_ATTRS, ALL_SKILLS, SKILL_CATS } from '../data/constants.js';
import { getUser } from '../auth/discord.js';
import { ACTION_TYPE_LABELS as _ACTION_TYPE_LABELS_BASE, MERIT_MATRIX, INVESTIGATION_MATRIX, TERRITORY_SLUG_MAP as _TERRITORY_SLUG_MAP_BASE, AMBIENCE_STEPS as _AMBIENCE_STEPS_BASE } from './downtime-constants.js';
import { publishAllForCycle } from './downtime-story.js';

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
let _procQueueMap = null;      // Map<key, entry> built once per renderProcessingMode call; null outside render
let _xrefIndex = new Map();   // cross-reference index built once per renderProcessingMode call
let discDashCollapsed = true;  // collapse state for the Discipline Profile Matrix panel
let matrixCollapsed = true;    // collapse state for the Feeding Matrix section in the dashboard
let ovAmbienceCollapsed = true; // City Overview: ambience section collapse state
let ovSpheresCollapsed = true;  // City Overview: spheres section collapse state
const expandedPhases = new Set(); // phaseKeys currently expanded in Processing Mode (empty = all collapsed)
const preReadExpanded = new Set();   // subIds with pre-read body expanded in processing mode
const narrativeExpanded = new Set(); // subIds with narrative body expanded in processing mode
const xpReviewExpanded  = new Set(); // subIds with XP review body expanded in processing mode
const signOffExpanded   = new Set(); // subIds with sign-off body expanded in processing mode
const stActionAddExpandedSubs = new Set(); // subIds with "Add ST Action" form expanded

// ── Processing Mode constants ────────────────────────────────────────────────

const PHASE_ORDER = {
  resolve_first: 0,
  feeding: 1,
  feed: 1,
  ambience_increase: 2, ambience_decrease: 2,
  hide_protect: 3,
  investigate: 4,
  attack: 5,
  patrol_scout: 6, support: 6,
  misc: 7, xp_spend: 7, maintenance: 7, block: 7, rumour: 7, grow: 7, acquisition: 7,
};

const PHASE_LABELS = {
  travel: 'Step 1 — Travel Review',
  resolve_first: 'Step 2 — Blood Sorcery & Rituals',
  feeding: 'Step 3 — Feeding',
  ambience: 'Step 4 — Ambience',
  hide_protect: 'Step 5 — Defensive',
  investigate: 'Step 6 — Investigative',
  attack: 'Step 7 — Hostile',
  support_patrol: 'Step 8 — Support & Patrol',
  misc: 'Step 9 — Miscellaneous',
  allies: 'Allies',
  status: 'Status',
  retainers: 'Retainers',
  contacts: 'Contacts',
  resources_retainers: 'Retainers',
  resources: 'Resources',
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
  14: 'resources',
};

// Maps simplified ST-created action category to phase number
const ST_ACTION_PHASE_MAP = {
  sorcery: 0,  // resolve_first
  project: 7,  // misc
  merit:   8,  // allies
};

// 'feed' relabelled 'Rote Feed' in processing view to distinguish from the feeding phase
const ACTION_TYPE_LABELS = { ..._ACTION_TYPE_LABELS_BASE, feed: 'Rote Feed' };

const ALL_ACTION_TYPES = [
  'ambience_increase', 'ambience_decrease', 'feed', 'attack', 'hide_protect',
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

// MERIT_MATRIX and INVESTIGATION_MATRIX imported from downtime-constants.js

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
  committed:   'Committed',
  rolled:      'Rolled',
  validated:   'Validated',
  no_roll:     'No Roll',
  no_feed:     'No Valid Feeding',
  maintenance: 'Maintenance',
  resolved:    'Resolved',
  no_effect:   'No Effect',
  obvious:     'Obvious',
  neutral:     'Neutral',
  subtle:      'Subtle',
};

// Statuses considered fully resolved (used for phase counts and hide-done filter)
const DONE_STATUSES = new Set(['validated', 'no_roll', 'no_feed', 'maintenance', 'resolved', 'no_effect', 'skipped', 'obvious', 'neutral', 'subtle']);

/** Format a signed integer as '+N', '−N', or '±0'. */
function _fmtMod(val) {
  if (val === 0) return '\u00B10';
  return val > 0 ? `+${val}` : String(val);
}

/** Returns a stable action_key string for reminder targeting. Returns null for sorcery entries. */
function entryActionKey(entry) {
  if (entry.source === 'feeding') return 'feeding';
  if (entry.source === 'project') return `project_${entry.actionIdx}`;
  if (entry.source === 'merit')   return `merit_${entry.actionIdx}`;
  return null; // sorcery entries are sources, not targets
}

// ── DTUX-1: clickable phase-tab nav with sign-off badges ──────────────────── Replaces the previous
// read-only ribbon, the sub-tab strip, and the "Open City & Feeding Phase \u2192"
// gate button. cycle.status is auto-derived from cycle.phase_signoff by
// signoffPhase() in db.js \u2014 these helpers are display-only.

const DTUX_TAB_LABELS = {
  prep: 'DT Prep', city: 'DT City', projects: 'DT Projects',
  story: 'DT Story', ready: 'DT Ready',
};

const DTUX_TAB_TO_PANEL = {
  prep: 'dt-prep-panel',
  city: 'dt-city-panel',
  projects: 'dt-processing-panel',
  story: 'dt-story-panel',
  ready: 'dt-ready-panel',
};

let _dtuxActiveTab = null; // session-only; null until first cycle load

function _initialDtuxTab(cycle) {
  if (_dtuxActiveTab && DTUX_TAB_TO_PANEL[_dtuxActiveTab]) return _dtuxActiveTab;
  const ps = cycle?.phase_signoff || {};
  const hasSignoff = Object.keys(ps).length > 0;
  if (hasSignoff) {
    for (const p of DTUX_PHASES) if (!ps[p]) return p;
    return 'ready';
  }
  // Legacy cycle without phase_signoff: pick from existing status field.
  switch (cycle?.status) {
    case 'prep':     return 'prep';
    case 'game':     return 'city';
    case 'active':   return 'projects';
    case 'closed':   return 'story';
    case 'complete': return 'ready';
    default:         return 'prep';
  }
}

function renderPhaseRibbon(cycle, _subs) {
  const mainEl = document.getElementById('dt-phase-ribbon');
  const subEl  = document.getElementById('dt-sub-ribbon');
  if (!mainEl) return;
  // Sub-ribbon retired by DTUX-1; hide while the markup remains in admin.html.
  if (subEl) subEl.style.display = 'none';

  if (!cycle) {
    mainEl.style.display = 'none';
    return;
  }

  if (!_dtuxActiveTab) _dtuxActiveTab = _initialDtuxTab(cycle);

  const ps = cycle.phase_signoff || {};
  mainEl.style.display = '';
  mainEl.classList.add('dt-phase-ribbon-tabs');
  mainEl.innerHTML = DTUX_PHASES.map(phase => {
    const signed = !!ps[phase];
    const active = phase === _dtuxActiveTab;
    const cls = ['pr-tab', active ? 'pr-tab-active' : '', signed ? 'pr-tab-signed' : '']
      .filter(Boolean).join(' ');
    const badge = signed
      ? '<span class="pr-tab-badge pr-tab-badge-signed">\u2713</span>'
      : '<span class="pr-tab-badge pr-tab-badge-empty">\u25cb</span>';
    return `<button type="button" class="${cls}" data-phase="${phase}">${badge}<span class="pr-tab-label">${DTUX_TAB_LABELS[phase]}</span></button>`;
  }).join('');
}

function showDtuxPhase(phase) {
  if (!DTUX_TAB_TO_PANEL[phase]) phase = 'prep';
  _dtuxActiveTab = phase;
  for (const p of DTUX_PHASES) {
    const el = document.getElementById(DTUX_TAB_TO_PANEL[p]);
    if (el) el.style.display = (p === phase) ? '' : 'none';
  }
  document.querySelectorAll('#dt-phase-ribbon .pr-tab').forEach(btn => {
    btn.classList.toggle('pr-tab-active', btn.dataset.phase === phase);
  });
  // Lazy-init city/story tabs the first time they're shown.
  if (phase === 'city' && !_dtuxCityInited) { _dtuxCityInited = true; renderCityOverview(); }
  if (phase === 'story' && !_dtuxStoryInited) { _dtuxStoryInited = true; _initDtStoryFromRibbon(); }
}

let _dtuxCityInited = false;
let _dtuxStoryInited = false;

async function _initDtStoryFromRibbon() {
  // Lazily import to avoid a circular dep \u2014 DT Story reads characters via API
  // anyway, so the module-state coupling is fine.
  const { initDtStory } = await import('./downtime-story.js');
  initDtStory(null);
}

async function _handleSignoffClick(btn) {
  if (!currentCycle) return;
  const phase = btn.dataset.signoffPhase;
  if (!phase || !DTUX_PHASES.includes(phase)) return;
  const turningOn = !(currentCycle.phase_signoff || {})[phase];
  const userId = getUser()?._id || getUser()?.user_id || null;
  await signoffPhase(currentCycle, phase, turningOn, userId);
  // Mirror into allCycles so subsequent renders see the new status/signoff.
  const idx = allCycles.findIndex(c => c._id === currentCycle._id);
  if (idx >= 0) {
    allCycles[idx].phase_signoff = currentCycle.phase_signoff;
    allCycles[idx].status = currentCycle.status;
  }
  // Refresh the full panel set so dt-cycle-status, the snapshot panel, and the
  // ambience-apply visibility (all keyed on cycle.status) reflect the new
  // derived status. Same pattern as the retired gate button handler.
  await loadCycleById(currentCycle._id);
}

function renderSignoffButton(phase, cycle) {
  const signed = !!(cycle?.phase_signoff || {})[phase];
  const label = signed ? '\u2713 Signed-off \u2014 undo?' : 'Mark phase signed-off';
  const cls = signed ? 'dt-btn dt-signoff-btn dt-signoff-signed' : 'dt-btn dt-signoff-btn';
  return `<button type="button" class="${cls}" data-signoff-phase="${phase}">${label}</button>`;
}

function renderReadyPanel(cycle, subs) {
  const panel = document.getElementById('dt-ready-panel');
  if (!panel) return;
  if (!cycle) { panel.style.display = 'none'; return; }
  if (_dtuxActiveTab && _dtuxActiveTab !== 'ready') {
    panel.style.display = 'none';
  }
  // Visibility otherwise driven by showDtuxPhase. Render content unconditionally
  // so it's ready when the tab opens.
  const subList = subs || [];
  const total = subList.length;
  const pending = subList.filter(s => !s.approval_status || s.approval_status === 'pending').length;
  const storySigned = !!(cycle.phase_signoff || {}).story;

  let resolvedNote;
  if (total === 0)        resolvedNote = 'no submissions yet';
  else if (pending === 0) resolvedNote = 'all resolved';
  else                    resolvedNote = `${pending} pending`;

  let h = '<div class="dt-ready-content">';
  h += `<h3 class="dt-ready-title">Push Cycle</h3>`;
  h += `<p class="dt-ready-summary">${total} submission${total === 1 ? '' : 's'}\u00a0\u2014\u00a0${resolvedNote}; DT Story ${storySigned ? 'signed off' : 'not yet signed off'}.</p>`;
  h += `<p class="dt-ready-hint">Use the existing Push button on each character\u2019s row in DT Story to publish their narrative. This panel is informational; sign-off below records that the cycle is fully published.</p>`;
  h += `<div class="dt-ready-actions">${renderSignoffButton('ready', cycle)}</div>`;
  h += '</div>';
  panel.innerHTML = h;
}

let _shellInited = false;

export async function initDowntimeView(passedChars) {
  const container = document.getElementById('downtime-content');
  if (!container) return;

  if (!_shellInited) {
    _shellInited = true;
    container.innerHTML = buildShell();

    document.getElementById('dt-new-cycle').addEventListener('click', handleNewCycle);
    document.getElementById('dt-close-cycle').addEventListener('click', handleCloseCycle);
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

    // DTUX-1: phase ribbon click delegation — drives panel visibility and
    // sign-off button clicks. Wired once on shell init.
    document.getElementById('dt-phase-ribbon')?.addEventListener('click', e => {
      const tab = e.target.closest('[data-phase]');
      if (tab) { showDtuxPhase(tab.dataset.phase); return; }
    });
    document.addEventListener('click', e => {
      const signoff = e.target.closest('[data-signoff-phase]');
      if (signoff) { _handleSignoffClick(signoff); return; }
      // DTIL-1: Court Pulse copy + save buttons
      const cpCopy = e.target.closest('.dt-court-pulse-copy-btn');
      if (cpCopy) { _handleCourtPulseCopy(cpCopy); return; }
      const cpSave = e.target.closest('.dt-court-pulse-save-btn');
      if (cpSave) { _handleCourtPulseSave(cpSave); return; }
    });
    // Dev-only: preview CSV button (no MongoDB writes)
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
    <div id="dt-snapshot"></div>
    <div id="dt-warnings" class="dt-warnings"></div>
    <div id="dt-match-summary"></div>
    <div id="dt-feeding-scene"></div>
    <div id="dt-submissions" class="dt-submissions"></div>`;
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
 * Resolve a submission to its matched character and display name in one call.
 * @param {object} s - submission object with character_name and player_name
 * @param {string} [fallback='Unknown'] - name to use when no match found and character_name is blank
 * @returns {{ char: object|null, charName: string }}
 */
function resolveSubChar(s, fallback = 'Unknown') {
  const char = findCharacter(s.character_name, s.player_name);
  const charName = char ? (char.moniker || char.name) : (s.character_name || fallback);
  return { char, charName };
}

/**
 * Build a phase/character progress badge string.
 * Returns a dt-narr-badge span when all done, a proc-narr-progress span when partially done,
 * or an empty string when nothing is done yet.
 * @param {number} done
 * @param {number} total
 * @param {string} [doneLabel='Done'] - text after ✓ when complete; pass '' for checkmark only
 * @returns {string} HTML string (includes leading space when non-empty)
 */
function _progressBadge(done, total, doneLabel = 'Done') {
  if (done === total && total > 0)
    return ` <span class="dt-narr-badge">\u2713${doneLabel ? ' ' + doneLabel : ''}</span>`;
  if (done > 0)
    return ` <span class="proc-narr-progress">${done}/${total}</span>`;
  return '';
}

/**
 * Resolve the nine_again checkbox state for a reviewed action.
 * Character-derived nine_again (PT / MCI / skill flag) always wins over a
 * saved false — a false in the review only applies when the character
 * genuinely has no nine_again on the validated skill.
 * Explicit saved true always wins regardless.
 * @param {object} rev          - st_review object
 * @param {string|null} poolValidated
 * @param {object|null} char
 * @returns {boolean}
 */
function _resolveNineAgainState(rev, poolValidated, char) {
  if (rev.nine_again === true) return true;
  if (char && poolValidated) {
    const discs   = _charDiscsArray(char).filter(d => d.dots > 0).map(d => d.name);
    const parsed  = _parsePoolExpr(poolValidated, ALL_ATTRS, ALL_SKILLS, discs);
    if (parsed?.skill && skNineAgain(char, parsed.skill)) return true;
  }
  if (rev.nine_again != null) return rev.nine_again;
  return false;
}

/**
 * Augment a pool_validated expression string with active spec bonuses.
 * E.g. "Wits 3 + Stealth 2 = 5" + ['Shadowing'] → "Wits 3 + Stealth 2 + Shadowing +1 = 6"
 * Returns the original string unchanged if no active specs or no '=' found.
 * @param {string|null} poolValidated
 * @param {string[]} activeSpecs
 * @param {object|null} char
 * @returns {string|null}
 */
function _augmentPoolWithSpecs(poolValidated, activeSpecs, char, nineAgain) {
  if (!poolValidated || !activeSpecs.length) return poolValidated;
  const eqIdx = poolValidated.lastIndexOf('=');
  if (eqIdx === -1) return poolValidated;
  const base     = poolValidated.slice(0, eqIdx).trim();
  const tot      = parseInt(poolValidated.slice(eqIdx + 1).trim()) || 0;
  const specTotal = activeSpecs.reduce((s, sp) => s + ((nineAgain || (char && hasAoE(char, sp))) ? 2 : 1), 0);
  const specLabel = activeSpecs.map(sp => `${sp} +${(nineAgain || (char && hasAoE(char, sp))) ? 2 : 1}`).join(', ');
  return `${base} + ${specLabel} = ${tot + specTotal}`;
}

/**
 * Render a collapsible phase header row (without the outer section wrapper).
 * @param {string} phaseKey - data-toggle-phase value
 * @param {string} label    - full label HTML (may include badge spans)
 * @param {number} count    - item count
 * @param {string} unit     - singular unit word ('submission', 'action', 'character')
 * @param {boolean} isExpanded
 * @returns {string} HTML string
 */
function _renderPhaseHeader(phaseKey, label, count, unit, isExpanded) {
  const s = count !== 1 ? 's' : '';
  let h = `<div class="proc-phase-header" data-toggle-phase="${esc(phaseKey)}">`;
  h += `<span class="proc-phase-label">${label}</span>`;
  h += `<span class="proc-phase-count">${count} ${unit}${s}</span>`;
  h += `<span class="proc-phase-toggle">${isExpanded ? '&#9650; Hide' : '&#9660; Show'}</span>`;
  h += `</div>`;
  return h;
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

function buildFeedingPool(char, methodId, ambienceMod) {
  if (!char) return null;
  const method = FEED_METHODS_DATA.find(m => m.id === methodId);
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
    prestige: (c.status?.clan || 0) + (c.status?.covenant?.[c.covenant] || 0),
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

  const isPrep   = cycle.status === 'prep';
  const isActive = cycle.status === 'active';
  const isGame   = cycle.status === 'game';
  const isClosed = cycle.status === 'closed';
  const deadlineStr = cycle.deadline_at
    ? new Date(cycle.deadline_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const deadlinePast = cycle.deadline_at && new Date(cycle.deadline_at) < new Date();
  const statusLabel = isPrep ? 'prep' : isActive ? 'active' : isGame ? 'game' : 'closed';
  const statusCss   = isPrep ? 'prep' : isActive ? 'pending' : isGame ? 'game' : 'approved';
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

  // ── Snapshot panel (GC-4) ──
  renderSnapshotPanel(cycle);

  // ── DTUX-1: phase ribbon + panel set; show the chosen tab ──
  if (!_dtuxActiveTab) _dtuxActiveTab = _initialDtuxTab(cycle);
  renderPhaseRibbon(cycle, []);
  renderPrepPanel(cycle);
  renderReadyPanel(cycle, []);
  showDtuxPhase(_dtuxActiveTab);

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
  renderPhaseRibbon(currentCycle, submissions);
  renderReadyPanel(currentCycle, submissions);
  // DTIL: refresh cycle-level intelligence layer now that submissions are loaded
  renderCycleIntelligence(currentCycle, submissions, characters);
  document.getElementById('dt-export-all').style.display = submissions.length ? '' : 'none';
  document.getElementById('dt-export-json').style.display = submissions.length ? '' : 'none';
  renderMatchSummary();
  renderSubmissionChecklist();
  await ensureTerritories();
  renderCityOverview();
  await loadInvestigations(cycleId);
  renderInvestigations();
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
    FEED_METHODS_DATA.forEach(m => {
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
    h += row('Method', FEED_METHOD_LABELS_MAP[feedMethod] || feedMethod);
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
  const courtKeys = ['travel', 'game_recount', 'rp_shoutout', 'correspondence'];
  const courtLabels = { travel: 'Travel', game_recount: 'Game Recount', rp_shoutout: 'Shoutout', correspondence: 'Correspondence' };
  const courtVals = courtKeys.filter(k => r[k] && r[k].trim());
  const aspLines = [1,2,3].map(n => {
    const t = r[`aspiration_${n}_type`]; const v = r[`aspiration_${n}_text`];
    return (t && v) ? `${t}: ${v}` : null;
  }).filter(Boolean);
  const hasCourtContent = courtVals.length || aspLines.length || r['aspirations'];
  if (hasCourtContent) {
    h += '<div class="dt-resp-section"><div class="dt-resp-section-title">Court</div>';
    for (const k of courtVals) {
      let val = r[k];
      if (k === 'rp_shoutout') { try { val = JSON.parse(val).filter(Boolean).map(id => { const ch = characters.find(c => String(c._id) === String(id)); return ch ? (ch.moniker || ch.name) : id; }).join(', '); } catch { /* ignore */ } }
      h += row(courtLabels[k] || k, val);
    }
    if (aspLines.length) {
      h += row('Aspirations', aspLines.join('\n'));
    } else if (r['aspirations']) {
      h += row('Aspirations', r['aspirations']);
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
    if (action === 'xp_spend') {
      const cat = r[`project_${n}_xp_category`]; const item = r[`project_${n}_xp_item`];
      if (cat && item) desc = `${cat}: ${item}`;
    }
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
    const targets = normaliseSorceryTargets(r[`sorcery_${n}_targets`]);
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
  document.getElementById('dt-cycle-status').innerHTML =
    `<span class="dt-status-badge dt-status-approved">preview</span><span class="domain-count">${devSubs.length} submissions</span>`;
  renderSnapshotPanel(devCycle);
  renderMatchSummary();
  renderSubmissionChecklist();
  renderCityOverview();
  renderInvestigations();
  renderSubmissions();
}


async function handleNewCycle() {
  const all = await import('../downtime/db.js').then(m => m.getCycles()).catch(() => []);
  const closedCount = (all || []).filter(c => c.status === 'closed').length;
  const gameNum = closedCount + 2;
  if (!confirm('Create a new prep cycle for Downtime ' + gameNum + '?')) return;
  const { createCycle } = await import('../downtime/db.js');
  await createCycle(gameNum, { status: 'prep' });
  await loadAllCycles();
}

// CHM-2: holdings detection for the maintenance audit. PT is a flat
// boolean; MCI may be multiple rows (one per cult), so collect the cult
// names for context. Mirrors the m.active !== false guard used elsewhere
// when iterating MCI merits.
function maintenanceHoldings(c) {
  const merits = c.merits || [];
  const pt = merits.some(m => m.name === 'Professional Training');
  const mciMerits = merits.filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false);
  return {
    pt,
    mci: mciMerits.length > 0,
    mciCults: mciMerits.map(m => m.cult_name).filter(Boolean),
  };
}

function maintenanceEligibleChars() {
  return (characters || [])
    .filter(c => !c.retired)
    .filter(c => (c.merits || []).some(m => MAINTENANCE_MERITS.includes(m.name)))
    .sort((a, b) => sortName(a).localeCompare(sortName(b)));
}

// Patches a single audit cell ({pt|mci}) on cycle.maintenance_audit.
// Sends the whole audit object on each tick — fine at <=30 chars.
async function setMaintenanceAudit(cycle, charId, key, value) {
  const audit = { ...(cycle.maintenance_audit || {}) };
  audit[charId] = { pt: false, mci: false, ...(audit[charId] || {}), [key]: value };
  await updateCycle(cycle._id, { maintenance_audit: audit });
  cycle.maintenance_audit = audit;
  const idx = allCycles.findIndex(c => c._id === cycle._id);
  if (idx >= 0) allCycles[idx].maintenance_audit = audit;
}

function renderMaintenanceAuditPanel(cycle) {
  if (cycle.is_chapter_finale !== true) return '';
  const eligible = maintenanceEligibleChars();
  const audit = cycle.maintenance_audit || {};
  const subLabel = cycle.chapter_label ? ` <span class="dt-maintenance-sub-label">(${esc(cycle.chapter_label)})</span>` : '';

  let html = '<section class="dt-maintenance-audit">';
  html += `<h4 class="dt-maintenance-title">Chapter Finale — Maintenance Audit${subLabel}</h4>`;
  html += '<p class="dt-maintenance-sub">Tick a box once you have confirmed the player has maintained this standing merit during the chapter.</p>';

  if (eligible.length === 0) {
    html += '<p class="dt-maintenance-empty">No characters hold Professional Training or Mystery Cult Initiation.</p>';
    html += '</section>';
    return html;
  }

  html += '<table class="dt-maintenance-table"><thead><tr><th>Character</th><th>PT</th><th>MCI</th></tr></thead><tbody>';
  for (const c of eligible) {
    const id = String(c._id);
    const h = maintenanceHoldings(c);
    const row = audit[id] || {};
    const ptCell = h.pt
      ? `<input type="checkbox" class="dt-maintenance-tick" data-char-id="${esc(id)}" data-key="pt"${row.pt ? ' checked' : ''}>`
      : '';
    let mciCell = '';
    if (h.mci) {
      mciCell = `<input type="checkbox" class="dt-maintenance-tick" data-char-id="${esc(id)}" data-key="mci"${row.mci ? ' checked' : ''}>`;
      if (h.mciCults.length) {
        mciCell += `<div class="dt-maintenance-cults">${esc(h.mciCults.join(', '))}</div>`;
      }
    }
    html += `<tr><td>${esc(displayName(c))}</td><td class="dt-maintenance-cell">${ptCell}</td><td class="dt-maintenance-cell">${mciCell}</td></tr>`;
  }
  html += '</tbody></table></section>';
  return html;
}

// ── DT Intelligence Layer (DTIL) ─────────────────────────────────────────────
// Cycle-level synthesis surfaces mounted into #dt-cycle-intelligence (inside
// the DT Prep panel): Court Pulse (DTIL-1), Action Queue (DTIL-2/3).

function renderCycleIntelligence(cycle, subs, chars) {
  const container = document.getElementById('dt-cycle-intelligence');
  if (!container || !cycle) return;
  container.innerHTML = renderCourtPulsePanel(cycle, subs || [], chars || []);
}

function _buildCourtPulsePromptText(cycle, subs, chars) {
  const charById = new Map((chars || []).map(c => [String(c._id), c]));
  const blocks = [];
  const sorted = (subs || [])
    .filter(sub => {
      for (let n = 1; n <= 5; n++) {
        if ((sub.responses?.[`game_recount_${n}`] || '').trim()) return true;
      }
      return false;
    })
    .map(sub => ({ sub, char: charById.get(String(sub.character_id)) }))
    .sort((a, b) => sortName(a.char || {}).localeCompare(sortName(b.char || {})));

  for (const { sub, char } of sorted) {
    const lines = [];
    let count = 0;
    for (let n = 1; n <= 5; n++) {
      const txt = (sub.responses?.[`game_recount_${n}`] || '').trim();
      if (!txt) continue;
      count += 1;
      lines.push(`  ${count}. ${txt}`);
    }
    const name = (char ? displayName(char) : null) || sub.character_name || 'Unknown';
    blocks.push(`Highlights from ${name}:\n${lines.join('\n')}`);
  }

  if (!blocks.length) return '';

  const framing = "You are reading the game-night highlights of every player who attended the most recent game of a Vampire: The Requiem 2nd Edition LARP. Each highlight is one moment that stood out for that player. Synthesise the gestalt of the night: the dominant moods, recurring themes, social undercurrents, and any notable events that resurface across multiple players' accounts. Write a Court Pulse summary in 250 to 400 words, suitable for the Storyteller's reference. Use British English. Do not invent details not present in the highlights.";

  return `${framing}\n\n${blocks.join('\n\n')}`;
}

function renderCourtPulsePanel(cycle, subs, chars) {
  const promptText = _buildCourtPulsePromptText(cycle, subs, chars);
  const synthesis = cycle.st_court_synthesis_draft || '';
  const isEmpty = !promptText;
  const cycleId = esc(String(cycle._id));

  return `<section class="dt-court-pulse-panel" data-cycle-id="${cycleId}">
    <h3 class="dt-court-pulse-title">Court Pulse</h3>
    <p class="dt-court-pulse-hint">Build a structured prompt from every player's game-night highlights, run it through your LLM of choice, and paste the synthesis back below for cycle reference.</p>
    <div class="dt-court-pulse-prompt-block">
      <label class="dt-court-pulse-label">Prompt (copy and paste to your LLM):</label>
      ${isEmpty
        ? '<div class="dt-court-pulse-placeholder">No game highlights yet.</div>'
        : `<textarea class="dt-court-pulse-prompt-ta" readonly>${esc(promptText)}</textarea>
           <div class="dt-court-pulse-actions">
             <button type="button" class="dt-btn dt-court-pulse-copy-btn">Copy prompt</button>
             <span class="dt-court-pulse-copy-status"></span>
           </div>`
      }
    </div>
    <div class="dt-court-pulse-synthesis-block">
      <label class="dt-court-pulse-label" for="dt-court-pulse-synthesis-ta">Court Pulse synthesis (paste here):</label>
      <textarea id="dt-court-pulse-synthesis-ta" class="dt-court-pulse-synthesis-ta" placeholder="Paste the LLM's synthesis here…">${esc(synthesis)}</textarea>
      <div class="dt-court-pulse-actions">
        <button type="button" class="dt-btn dt-court-pulse-save-btn">Save synthesis</button>
        <span class="dt-court-pulse-save-status"></span>
      </div>
    </div>
  </section>`;
}

async function _handleCourtPulseCopy(btn) {
  const panel = btn.closest('.dt-court-pulse-panel');
  const ta = panel?.querySelector('.dt-court-pulse-prompt-ta');
  const status = panel?.querySelector('.dt-court-pulse-copy-status');
  if (!ta) return;
  try {
    await navigator.clipboard.writeText(ta.value);
    if (status) {
      status.textContent = 'Copied';
      setTimeout(() => { if (status) status.textContent = ''; }, 1500);
    }
  } catch {
    if (status) status.textContent = 'Copy failed';
  }
}

async function _handleCourtPulseSave(btn) {
  const panel = btn.closest('.dt-court-pulse-panel');
  const cycleId = panel?.dataset.cycleId;
  const ta = panel?.querySelector('.dt-court-pulse-synthesis-ta');
  const status = panel?.querySelector('.dt-court-pulse-save-status');
  if (!cycleId || !ta) return;
  const text = ta.value;
  if (status) status.textContent = 'Saving…';
  try {
    await updateCycle(cycleId, { st_court_synthesis_draft: text });
    if (currentCycle && String(currentCycle._id) === cycleId) {
      currentCycle.st_court_synthesis_draft = text;
    }
    const idx = allCycles.findIndex(c => String(c._id) === cycleId);
    if (idx >= 0) allCycles[idx].st_court_synthesis_draft = text;
    if (status) {
      status.textContent = 'Saved';
      setTimeout(() => { if (status) status.textContent = ''; }, 1500);
    }
  } catch {
    if (status) status.textContent = 'Save failed';
  }
}

function renderPrepPanel(cycle) {
  const panel = document.getElementById('dt-prep-panel');
  if (!panel) return;
  if (!cycle) { panel.style.display = 'none'; return; }
  // DTUX-1: visibility is now driven by the phase ribbon (showDtuxPhase),
  // not cycle.status. The panel always renders its content; show/hide is
  // handled by the ribbon's tab click.
  if (_dtuxActiveTab && _dtuxActiveTab !== 'prep') {
    panel.style.display = 'none';
  }

  const autoVal = cycle.auto_open_at ? isoToLocalInput(cycle.auto_open_at) : '';
  const deadlineVal = cycle.deadline_at ? isoToLocalInput(cycle.deadline_at) : '';
  const finaleChecked = cycle.is_chapter_finale ? ' checked' : '';

  const earlyIds = new Set((cycle.early_access_player_ids || []).map(String));

  // Active players — those with at least one non-retired linked character
  const activePlayers = (players || [])
    .filter(p => {
      const charIds = (p.character_ids || []).map(String);
      return characters.some(c => !c.retired && charIds.includes(String(c._id)));
    })
    .sort((a, b) => (a.player_name || a.username || '').localeCompare(b.player_name || b.username || ''));

  const toggleHtml = activePlayers.map(p => {
    const id = String(p._id);
    const checked = earlyIds.has(id) ? ' checked' : '';
    const name = esc(p.player_name || p.username || id);
    return `<label class="dt-early-toggle-row" data-player-id="${esc(id)}">
      <span class="dt-early-name">${name}</span>
      <input type="checkbox" class="dt-early-toggle"${checked}>
    </label>`;
  }).join('');

  const earlyContent = activePlayers.length
    ? toggleHtml
    : `<p class="placeholder">No active players.</p>`;

  panel.innerHTML =
    `<div class="dt-prep-grid">` +
    `<div class="dt-prep-field"><label class="dt-lbl">Auto-Open Date/Time</label>` +
    `<input type="datetime-local" id="dt-auto-open-input" class="dt-deadline-input" value="${esc(autoVal)}"></div>` +
    `<div class="dt-prep-field"><label class="dt-lbl">Deadline Date/Time</label>` +
    `<input type="datetime-local" id="dt-prep-deadline-input" class="dt-deadline-input" value="${esc(deadlineVal)}"></div>` +
    `<div class="dt-prep-field"><label class="dt-lbl" style="display:flex;align-items:center;gap:.5rem;cursor:pointer;">` +
    `<input type="checkbox" id="dt-chapter-finale-input"${finaleChecked}><span>Chapter Finale</span></label></div>` +
    `</div>` +
    `<div class="dt-prep-early">` +
    `<div class="dt-prep-early-title">Early Access Players</div>` +
    `<div class="dt-early-list">${earlyContent}</div>` +
    `</div>` +
    `<div class="dt-prep-actions">` +
    renderSignoffButton('prep', cycle) +
    `</div>` +
    renderMaintenanceAuditPanel(cycle) +
    `<div id="dt-cycle-intelligence" class="dt-cycle-intelligence"></div>`;

  // DTIL: populate Court Pulse / Action Queue intelligence layer. First call
  // (before subs load) renders empty placeholders; loadCycleById re-renders
  // after submissions arrive.
  renderCycleIntelligence(cycle, submissions, characters);

  document.getElementById('dt-auto-open-input')?.addEventListener('change', async e => {
    const val = e.target.value;
    await updateCycle(cycle._id, { auto_open_at: val ? new Date(val).toISOString() : null });
    const idx = allCycles.findIndex(c => c._id === cycle._id);
    if (idx >= 0) allCycles[idx].auto_open_at = val ? new Date(val).toISOString() : null;
    renderPhaseRibbon(allCycles[idx] || cycle, []);
  });

  document.getElementById('dt-prep-deadline-input')?.addEventListener('change', async e => {
    const val = e.target.value;
    await updateCycle(cycle._id, { deadline_at: val ? new Date(val).toISOString() : null });
    const idx = allCycles.findIndex(c => c._id === cycle._id);
    if (idx >= 0) allCycles[idx].deadline_at = val ? new Date(val).toISOString() : null;
  });

  document.getElementById('dt-chapter-finale-input')?.addEventListener('change', async e => {
    const val = e.target.checked;
    await updateCycle(cycle._id, { is_chapter_finale: val });
    const idx = allCycles.findIndex(c => c._id === cycle._id);
    if (idx >= 0) allCycles[idx].is_chapter_finale = val;
    cycle.is_chapter_finale = val;
    renderPrepPanel(cycle);
  });

  panel.querySelectorAll('.dt-maintenance-tick').forEach(cb => {
    cb.addEventListener('change', async e => {
      const charId = cb.dataset.charId;
      const key = cb.dataset.key;
      if (!charId || !key) return;
      await setMaintenanceAudit(cycle, charId, key, e.target.checked);
    });
  });

  panel.querySelectorAll('.dt-early-toggle').forEach(cb => {
    cb.addEventListener('change', async () => {
      const row = cb.closest('.dt-early-toggle-row');
      const pid = row?.dataset.playerId;
      if (!pid) return;
      const current = new Set((cycle.early_access_player_ids || []).map(String));
      if (cb.checked) current.add(pid); else current.delete(pid);
      const updated = [...current];
      await updateCycle(cycle._id, { early_access_player_ids: updated });
      const idx = allCycles.findIndex(c => c._id === cycle._id);
      if (idx >= 0) allCycles[idx].early_access_player_ids = updated;
      cycle.early_access_player_ids = updated;
    });
  });

  // DTUX-1: gate button "Open City & Feeding Phase →" replaced by the sign-off
  // button rendered above; the per-tab click handler in initDowntimeView
  // dispatches sign-off clicks via [data-signoff-phase].
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
  // Per-submission set of deleted action key-parts (e.g. 'proj:0', 'feeding')
  const _deletedKeysBySub = new Map(
    subs.map(s => [s._id, new Set((s.st_review?.deleted_action_keys || []).map(k => `${s._id}:${k}`))])
  );

  for (const sub of subs) {
    const raw = sub._raw || {};
    const resp = sub.responses || {};
    const { char: _subChar, charName } = resolveSubChar(sub, '?');

    // ── Travel Review (Step 1 — phaseNum -1 sorts before sorcery) ──
    const travelDesc = (raw.submission?.narrative?.travel_description || resp.travel || '').trim();
    if (travelDesc) {
      const shortDesc = travelDesc.length > 80 ? travelDesc.slice(0, 77) + '\u2026' : travelDesc;
      queue.push({
        key: `${sub._id}:travel`,
        subId: sub._id,
        charName,
        phase: 'travel',
        phaseNum: -1,
        actionType: 'travel',
        label: 'Travel',
        description: shortDesc,
        source: 'travel',
        actionIdx: 0,
        poolPlayer: '',
        travelDesc,
      });
    }

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
      const targetsText = normaliseSorceryTargets(resp[`sorcery_${n}_targets`]);
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
      const primaryTerr = Object.keys(feedTerrs).find(k => feedTerrs[k] === 'feeding_rights' || feedTerrs[k] === 'resident')
                       || Object.keys(feedTerrs).find(k => feedTerrs[k] === 'poaching' || feedTerrs[k] === 'poacher')
                       || Object.keys(feedTerrs).find(k => feedTerrs[k] && feedTerrs[k] !== 'none')
                       || '';
      const truncDesc = feedDesc.length > 40 ? feedDesc.slice(0, 40) + '\u2026' : feedDesc;
      let methodLabel = '';
      if (feedMethod) {
        const baseLabel = FEED_METHOD_LABELS_MAP[feedMethod] || feedMethod;
        if (feedMethod === 'other' && truncDesc) {
          methodLabel = truncDesc;
        } else if (truncDesc && truncDesc !== baseLabel) {
          methodLabel = `${baseLabel} \u2014 ${truncDesc}`;
        } else {
          methodLabel = baseLabel;
        }
      }
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
      const slot = idx + 1; // 1-indexed response key

      // ── Shared field extraction (used by both rote-feed and regular projects) ──
      const projDescription = resp[`project_${slot}_description`] || '';

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

      // ── Rote feed project — render in Feed phase (phaseNum 1), after standard feeding ──
      if (actionType === 'feed') {
        const feedMethod2 = resp[`project_${slot}_feed_method2`] || '';
        const method2Label = feedMethod2 ? `Secondary method: ${feedMethod2}` : '';
        const descWithMethod = [projDescription, method2Label].filter(Boolean).join(' \u2014 ');
        queue.push({
          key: `${sub._id}:proj:${idx}`,
          subId: sub._id,
          charName,
          phase: PHASE_NUM_TO_LABEL[1],
          phaseNum: 1,
          actionType: 'feed',
          originalActionType: 'feed',
          label: 'Rote Feed',
          description: descWithMethod || proj.desired_outcome || '',
          source: 'project',
          actionIdx: idx,
          projSlot: slot,
          poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || '',
          projTitle:       resp[`project_${slot}_title`]     || '',
          projOutcome:     proj.desired_outcome || resp[`project_${slot}_outcome`] || '',
          projDescription: descWithMethod,
          projCast:        projCastResolved,
          projMerits:      projMeritsResolved,
          projTerritory:   resp[`project_${slot}_territory`] || '',
        });
        return;
      }

      // ST recategorisation override — changes phase and label without altering player data
      const projReview = (sub.projects_resolved || [])[idx] || {};
      const effectiveActionType = projReview.action_type_override || actionType;

      const phaseNum = PHASE_ORDER[effectiveActionType] ?? 7;
      const phaseKey = PHASE_NUM_TO_LABEL[phaseNum];

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
    let spheres  = raw.sphere_actions || [];
    if (!spheres.length) {
      // App-form submissions store sphere actions as flat response keys (sphere_N_merit etc.)
      for (let n = 1; n <= 5; n++) {
        const meritType = resp[`sphere_${n}_merit`];
        if (!meritType) continue;
        spheres = [...spheres, {
          merit_type:      meritType,
          action_type:     resp[`sphere_${n}_action`]      || 'misc',
          desired_outcome: resp[`sphere_${n}_outcome`]     || '',
          description:     resp[`sphere_${n}_description`] || '',
          primary_pool:    resp[`sphere_${n}_pool_expr`] ? { expression: resp[`sphere_${n}_pool_expr`] } : null,
        }];
      }
    }
    let contacts = raw.contact_actions?.requests || [];
    if (!contacts.length) {
      const contactList = [];
      for (let n = 1; n <= 5; n++) {
        const req = resp[`contact_${n}_request`] || resp[`contact_${n}`];
        if (!req) continue;
        contactList.push(req);
      }
      contacts = contactList;
    }
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
        meritCategory: 'contacts',
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

    // ── Acquisitions (resource and skill, from raw.acquisitions form section) ──
    const resAcq   = (raw.acquisitions?.resource_acquisitions || '').trim();
    const skillAcq = (raw.acquisitions?.skill_acquisitions   || '').trim();
    /** Extract the first "Description: ..." value from an acquisitions blob for the row summary. */
    function _acqRowSummary(text) {
      const m = text.match(/description[:\s]+([^\n]+)/i);
      if (m) return m[1].trim();
      // Fall back to first non-empty line
      return text.split('\n').map(l => l.trim()).find(l => l) || text;
    }
    if (resAcq) {
      queue.push({
        key: `${sub._id}:acq:resources`,
        subId: sub._id,
        charName,
        phase: PHASE_NUM_TO_LABEL[14],
        phaseNum: 14,
        actionType: 'resources_acquisitions',
        label: 'Resources Acquisitions',
        description: _acqRowSummary(resAcq),
        acqNotes: resAcq,
        source: 'acquisition',
        actionIdx: 0,
        poolPlayer: '',
      });
    }
    if (skillAcq) {
      queue.push({
        key: `${sub._id}:acq:skills`,
        subId: sub._id,
        charName,
        phase: PHASE_NUM_TO_LABEL[7],
        phaseNum: 7,
        actionType: 'skill_acquisitions',
        label: 'Skill Acquisitions',
        description: _acqRowSummary(skillAcq),
        acqNotes: skillAcq,
        source: 'acquisition',
        actionIdx: 1,
        poolPlayer: '',
      });
    }

    // ── ST-created actions ──
    for (let idx = 0; idx < (sub.st_actions || []).length; idx++) {
      const stAction = sub.st_actions[idx];
      if (stAction._deleted) continue;
      const phaseNum = ST_ACTION_PHASE_MAP[stAction.action_type] ?? 7;
      const phase = PHASE_NUM_TO_LABEL[phaseNum];
      queue.push({
        key: `${sub._id}:st:${idx}`,
        subId: sub._id,
        source: 'st_created',
        actionIdx: idx,
        charName,
        phase,
        phaseNum,
        actionType: stAction.action_type,
        label: stAction.label,
        description: stAction.description || '',
        poolPlayer: stAction.pool_player || '',
        riteName:  stAction.rite_name || stAction.label,
        tradition: stAction.tradition || '',
      });
    }
  }

  // Sort: phase first, then source type, then character name
  const SOURCE_ORDER = { project: 0, sorcery: 1, merit: 2, feeding: 3, st_created: 4 };
  queue.sort((a, b) => {
    if (a.phaseNum !== b.phaseNum) return a.phaseNum - b.phaseNum;
    const sa = SOURCE_ORDER[a.source] ?? 9;
    const sb = SOURCE_ORDER[b.source] ?? 9;
    if (sa !== sb) return sa - sb;
    return a.charName.localeCompare(b.charName);
  });

  // Filter out any entries the ST has permanently deleted
  return queue.filter(e => {
    const del = _deletedKeysBySub.get(e.subId);
    return !del || !del.has(e.key);
  });
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
  // Also scan territory-relevant project actions: ambience and rote feed
  // Rote feed (+1, or +2 exceptional) and ambience (+1, or +2 exceptional)
  for (const sub of submissions) {
    for (const [pIdx, proj] of (sub.projects_resolved || []).entries()) {
      if (!proj?.pool_validated) continue;
      if (proj.pool_status !== 'validated') continue;
      const actionType = proj.action_type_override || proj.action_type;
      const isAmbience = actionType === 'ambience_increase' || actionType === 'ambience_decrease';
      const isRoteFeed = actionType === 'feed';
      if (!isAmbience && !isRoteFeed) continue;
      const territory = _resolveProjectTerritory(sub, pIdx);
      if (!territory) continue;
      const foundDiscs = KNOWN_DISCIPLINES.filter(d => proj.pool_validated.includes(d));
      if (!foundDiscs.length) continue;
      const points = proj.roll?.exceptional ? 2 : 1;
      if (!profile[territory]) profile[territory] = {};
      for (const disc of foundDiscs) {
        profile[territory][disc] = (profile[territory][disc] || 0) + points;
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
  if (entry.source === 'travel')   return { pool_status: sub.st_review?.travel_discretion || 'pending' };
  if (entry.source === 'feeding') return sub.feeding_review || null;
  if (entry.source === 'project') return (sub.projects_resolved || [])[entry.actionIdx] || null;
  if (entry.source === 'merit')   return (sub.merit_actions_resolved || [])[entry.actionIdx] || null;
  if (entry.source === 'sorcery') return (sub.sorcery_review || {})[entry.actionIdx] || null;
  if (entry.source === 'st_created') return (sub.st_actions_resolved || [])[entry.actionIdx] || null;
  if (entry.source === 'acquisition') return (sub.acquisitions_resolved || [])[entry.actionIdx] || null;
  return null;
}

/** Save a partial update to a queue entry's review object. */
async function saveEntryReview(entry, patch) {
  const sub = submissions.find(s => s._id === entry.subId);
  if (!sub) return;

  if (entry.source === 'travel') {
    const stReview = { ...(sub.st_review || {}), travel_discretion: patch.pool_status };
    await updateSubmission(entry.subId, { st_review: stReview });
    sub.st_review = stReview;
    return;
  }

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
  } else if (entry.source === 'st_created') {
    const resolved = [...(sub.st_actions_resolved || [])];
    while (resolved.length <= entry.actionIdx) resolved.push(null);
    const current = resolved[entry.actionIdx] || { pool_player: entry.poolPlayer, pool_validated: '', pool_status: 'pending', notes_thread: [], player_feedback: '' };
    resolved[entry.actionIdx] = { ...current, ...patch };
    await updateSubmission(entry.subId, { st_actions_resolved: resolved });
    sub.st_actions_resolved = resolved;
  } else if (entry.source === 'acquisition') {
    const resolved = [...(sub.acquisitions_resolved || [])];
    while (resolved.length <= entry.actionIdx) resolved.push(null);
    const current = resolved[entry.actionIdx] || { pool_player: '', pool_validated: '', pool_status: 'pending', notes_thread: [], player_feedback: '' };
    resolved[entry.actionIdx] = { ...current, ...patch };
    await updateSubmission(entry.subId, { acquisitions_resolved: resolved });
    sub.acquisitions_resolved = resolved;
  }
}

// ── Ambience Dashboard (feature.47) ─────────────────────────────────────────

const AMBIENCE_STEPS_LIST = [
  'Hostile', 'Barrens', 'Neglected', 'Untended',
  'Settled', 'Tended', 'Curated', 'Verdant', 'The Rack',
];

/** Called by city-views.js after saving an ambience override so Processing Mode refetches. */
export function invalidateCachedTerritories() {
  cachedTerritories = null;
}

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

// TERRITORY_SLUG_MAP imported from downtime-constants.js
const TERRITORY_SLUG_MAP = _TERRITORY_SLUG_MAP_BASE;

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
 * Single source of truth for feeder counts — used by both the feeding matrix footer
 * and the ambience Overfeeding column so the two can never diverge.
 *
 * Iterates non-retired characters (matching the matrix body), calls _getSubFedTerrs
 * for each matched submission, and returns counts in two key formats:
 *   byCsvKey  — { [MATRIX_TERRS csvKey]: count }  — for the matrix footer
 *   byTerrId  — { [TERRITORY_DATA id]: count }     — for the ambience calculation
 *   subByCharId — Map<charId, sub>                 — reusable by _buildFeedingMatrixHtml
 */
function _computeMatrixFeederCounts() {
  const byCsvKey = {};
  for (const mt of MATRIX_TERRS) byCsvKey[mt.csvKey] = 0;
  const byTerrId = {};

  // subByCharId still needed for _buildFeedingMatrixHtml body rendering
  const subByCharId = new Map();
  for (const s of submissions) {
    const c = findCharacter(s.character_name, s.player_name);
    if (c && !c.retired) subByCharId.set(String(c._id), s);
  }

  // Build terrId → csvKey lookup from MATRIX_TERRS (handles legacy key variants via resolveTerrId)
  const terrIdToCsvKey = {};
  for (const mt of MATRIX_TERRS) {
    if (mt.ambienceKey === null) continue; // skip Barrens
    const tid = resolveTerrId(mt.csvKey);
    if (tid) terrIdToCsvKey[tid] = mt.csvKey;
  }

  // Count from queue feeding entries — same source as Actions in Territories FEEDING row
  // so matrix footer, ambience overfeeding, and TAAG chip counts all stay consistent.
  const queue = buildProcessingQueue(submissions);
  for (const entry of queue) {
    if (entry.source !== 'feeding') continue;
    for (const [terrKey, val] of Object.entries(entry.feedTerrs || {})) {
      if (!val || val === 'none') continue;
      const tid = resolveTerrId(terrKey);
      if (!tid) continue; // null = Barrens or unmapped
      const csvKey = terrIdToCsvKey[tid];
      if (!csvKey) continue;
      byCsvKey[csvKey]++;
      byTerrId[tid] = (byTerrId[tid] || 0) + 1;
    }
  }
  return { byCsvKey, byTerrId, subByCharId };
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
 * Sum ambience project contributions per territory.
 * 1–4 successes = 1 point; 5+ successes = 2 points; 0 successes = 0.
 * Returns { projPos: { [terrId]: n }, projNeg: { [terrId]: n }, pendingCount: n }
 */
function _gatherProjectAmbience(subs) {
  const projPos = {}, projNeg = {};
  let pendingCount = 0;
  for (const sub of subs) {
    const raw  = sub._raw || {};
    const resp = sub.responses || {};
    // Build the project list the same way buildProcessingQueue does
    let projects = raw.projects?.length ? raw.projects : [];
    if (!projects.length) {
      for (let n = 1; n <= 4; n++) {
        const a = resp[`project_${n}_action`];
        if (a) projects.push({ action_type: a, desired_outcome: resp[`project_${n}_outcome`] || '', detail: resp[`project_${n}_description`] || '' });
      }
    }
    for (const [idx, proj] of projects.entries()) {
      const n = idx + 1;
      const resolved = (sub.projects_resolved || [])[idx] || {};
      // Effective action type: ST override takes priority over player submission
      const effectiveType = resolved.action_type_override || proj.action_type || resp[`project_${n}_action`] || '';
      const isIncrease = effectiveType === 'ambience_increase';
      const isDecrease = effectiveType === 'ambience_decrease';
      if (!isIncrease && !isDecrease) continue;
      // Pending: not yet rolled (pool_status is never updated on project roll, so use roll presence)
      if (!resolved.roll) { pendingCount++; continue; }
      const terrOverride = resolveTerrId(sub.st_review?.territory_overrides?.[String(idx)] || '');
      const terrRaw = resp[`project_${n}_territory`] || '';
      const desc    = resp[`project_${n}_description`] || proj.detail || '';
      const outcome = proj.desired_outcome || resp[`project_${n}_outcome`] || '';
      const tid = terrOverride || resolveTerrId(terrRaw) || extractTerritoryFromText(desc) || extractTerritoryFromText(outcome);
      if (!tid) continue;
      const successes = resolved.roll.successes ?? 0;
      const contrib = successes >= 5 ? 2 : successes > 0 ? 1 : 0;
      if (isIncrease) projPos[tid] = (projPos[tid] || 0) + contrib;
      else            projNeg[tid] = (projNeg[tid] || 0) + contrib;
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
    const resp      = sub.responses || {};
    const spheres   = raw.sphere_actions || [];
    let contacts = raw.contact_actions?.requests || [];
    if (!contacts.length) {
      const cl = [];
      for (let n = 1; n <= 5; n++) { const r = resp[`contact_${n}_request`] || resp[`contact_${n}`]; if (!r) continue; cl.push(r); }
      contacts = cl;
    }
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
function buildAmbienceData(terrs, passedFeedCounts = null) {
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
  // Use passed feed counts (from TAAG matrix) when available so the numbers always match.
  const feederCounts = passedFeedCounts ?? _computeMatrixFeederCounts().byTerrId;
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
    const entropy = -3;
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
      if (net >= 3) delta = 1;
      else if (net <= -5) delta = -2;
      else if (net < 0) delta = -1;
      const newIdx = Math.max(0, Math.min(AMBIENCE_STEPS_LIST.length - 1, startIdx + delta));
      projStep = AMBIENCE_STEPS_LIST[newIdx];
    }
    const ambienceMod = startingAmbienceMod[id] ?? td.ambienceMod;
    return { id, name: td.name, ambience, ambienceMod, entropy, overfeed: overfeedVal, feeders, cap, inf_pos, inf_neg, influence, proj_pos, proj_neg, projects, allies_pos, allies_neg, allies, net, projStep };
  });
  return { rows, pendingAmbienceCount };
}

// ── Pre-read Panel (Epic 1 — Story 1.1 + 1.2) ────────────────────────────────

const COURT_KEYS = ['travel', 'game_recount', 'rp_shoutout', 'correspondence'];
const COURT_LABELS = {
  travel: 'Travel', game_recount: 'Game Recount', rp_shoutout: 'Shoutout',
  correspondence: 'Dear X',
};

function renderPreReadSection() {
  const readable = submissions
    .filter(s => {
      const r = s.responses || {};
      const hasAsp = [1,2,3].some(n => r[`aspiration_${n}_text`]?.trim?.()) || r.aspirations?.trim?.();
      return COURT_KEYS.some(k => r[k]?.trim?.()) || hasAsp || r.vamping?.trim?.() || r.lore_request?.trim?.();
    })
    .sort((a, b) => (a.character_name || '').localeCompare(b.character_name || ''));

  if (!readable.length) return '';

  const isExpanded = expandedPhases.has('preread');

  let h = '<div class="proc-phase-section">';
  h += _renderPhaseHeader('preread', 'Step 0 \u2014 Pre-read', readable.length, 'submission', isExpanded);

  if (isExpanded) {
    for (const s of readable) {
      const r = s.responses || {};
      const { char, charName } = resolveSubChar(s);
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
        const preReadAspLines = [1,2,3].map(n => {
          const t = r[`aspiration_${n}_type`]; const v = r[`aspiration_${n}_text`];
          return (t && v) ? `${t}: ${v}` : null;
        }).filter(Boolean);
        if (courtVals.length || preReadAspLines.length || r.aspirations) {
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
          if (preReadAspLines.length) {
            h += `<div class="dt-resp-row"><span class="dt-resp-label">Aspirations</span><span class="dt-resp-val">${preReadAspLines.map(esc).join('<br>')}</span></div>`;
          } else if (r.aspirations) {
            h += `<div class="dt-resp-row"><span class="dt-resp-label">Aspirations</span><span class="dt-resp-val">${esc(r.aspirations)}</span></div>`;
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
  const stepBadge = _progressBadge(doneCount, submissions.length, 'All staged');

  let h = '<div class="proc-phase-section">';
  h += _renderPhaseHeader('sign_off', `Step 11 \u2014 Sign-off${stepBadge}`, submissions.length, 'submission', isExpanded);

  if (isExpanded) {
    for (const s of submissions) {
      const { char, charName } = resolveSubChar(s);
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

// ── Deleted Actions Recovery ─────────────────────────────────────────────────

let procDeletedOpen = false;

/**
 * Returns a flat list of all deleted actions across all subs:
 * { subId, charName, keyPart, label, description, source: 'player'|'st' }
 */
function _buildDeletedList(subs) {
  const list = [];
  for (const sub of subs) {
    const { charName } = resolveSubChar(sub, '?');
    const resp = sub.responses || {};
    const raw  = sub._raw    || {};

    // ── Player-deleted actions ──
    for (const keyPart of (sub.st_review?.deleted_action_keys || [])) {
      let label = keyPart;
      let description = '';

      if (keyPart === 'feeding') {
        label = 'Feeding';
        description = raw.feeding?.method || resp.feeding_description || '';
      } else if (keyPart === 'travel') {
        label = 'Travel';
        description = raw.submission?.narrative?.travel_description || resp.travel || '';
      } else if (keyPart === 'acq:resources') {
        label = 'Resource Acquisitions';
      } else if (keyPart === 'acq:skills') {
        label = 'Skill Acquisitions';
      } else {
        const projM    = keyPart.match(/^proj:(\d+)$/);
        const meritM   = keyPart.match(/^merit:(\d+)$/);
        const sorceryM = keyPart.match(/^sorcery:(\d+)$/);

        if (projM) {
          const idx  = parseInt(projM[1]);
          const slot = idx + 1;
          const title  = resp[`project_${slot}_title`] || `Project ${slot}`;
          const action = resp[`project_${slot}_action`] || '';
          label = `Project ${slot}: ${title}`;
          description = action ? ACTION_TYPE_LABELS?.[action] || action : '';
        } else if (meritM) {
          const idx    = parseInt(meritM[1]);
          const action = sub.merit_actions?.[idx] || {};
          label = action.merit_type ? (ACTION_TYPE_LABELS?.[action.merit_type] || action.merit_type) : `Merit action ${idx + 1}`;
          description = action.desired_outcome || action.description || '';
        } else if (sorceryM) {
          const n    = parseInt(sorceryM[1]);
          const rite = resp[`sorcery_${n}_rite`] || `Sorcery ${n}`;
          const trad = resp['sorcery_1_tradition'] || resp['sorcery_tradition'] || 'Sorcery';
          label = `${trad}: ${rite}`;
          description = normaliseSorceryTargets(resp[`sorcery_${n}_targets`]);
        }
      }

      list.push({ subId: sub._id, charName, keyPart, label, description: description.slice(0, 80), source: 'player' });
    }

    // ── ST-deleted actions ──
    for (let idx = 0; idx < (sub.st_actions || []).length; idx++) {
      const a = sub.st_actions[idx];
      if (!a._deleted) continue;
      list.push({
        subId: sub._id,
        charName,
        keyPart: `st:${idx}`,
        label: a.label || a.action_type || 'ST Action',
        description: (a.description || '').slice(0, 80),
        source: 'st',
      });
    }
  }
  return list;
}

function renderDeletedActionsSection(subs) {
  const list = _buildDeletedList(subs);
  if (!list.length) return '';

  let h = `<div class="proc-phase-section proc-deleted-section">`;
  h += `<div class="proc-phase-header proc-deleted-toggle" data-deleted-toggle>`;
  h += `<span class="proc-phase-chevron">${procDeletedOpen ? '\u25BC' : '\u25BA'}</span>`;
  h += ` Deleted Actions <span class="proc-phase-badge">${list.length}</span>`;
  h += `</div>`;

  if (procDeletedOpen) {
    h += `<div class="proc-deleted-list">`;
    for (const item of list) {
      const srcBadge = item.source === 'st' ? ' <span class="proc-row-st-badge">[ST]</span>' : '';
      const desc = item.description ? ` \u2014 ${esc(item.description)}` : '';
      h += `<div class="proc-deleted-row">`;
      h += `<span class="proc-row-char">${esc(item.charName)}</span>`;
      h += `<span class="proc-deleted-label">${esc(item.label)}${srcBadge}${desc}</span>`;
      h += `<button class="proc-restore-btn dt-btn dt-btn-sm" data-sub-id="${esc(item.subId)}" data-key-part="${esc(item.keyPart)}" data-source="${item.source}">Restore</button>`;
      h += `</div>`;
    }
    h += `</div>`;
  }

  h += `</div>`;
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
  const stepBadge = _progressBadge(totalApproved, totalRows, 'All approved');

  let h = '<div class="proc-phase-section">';
  h += _renderPhaseHeader('xp_review', `Step 10 \u2014 XP Review${stepBadge}`, xpSubs.length, 'submission', isExpanded);

  if (isExpanded) {
    for (const s of xpSubs) {
      let rows = [];
      // New format: project_N_xp_category/item
      for (let n = 1; n <= 4; n++) {
        if (s.responses?.[`project_${n}_action`] !== 'xp_spend') continue;
        const cat  = s.responses?.[`project_${n}_xp_category`] || '';
        const item = s.responses?.[`project_${n}_xp_item`] || '';
        if (cat && item) {
          const costMap = { attribute: 4, skill: 2, discipline: 3, rite: 4, devotion: 2 };
          const cost = costMap[cat] || 1;
          rows.push({ category: cat, item, cost, dotsBuying: 1, _proj: n });
        } else {
          // Legacy free-text fallback
          const legacy = s.responses?.[`project_${n}_xp_trait`] || s.responses?.[`project_${n}_xp`];
          if (legacy) rows.push({ category: 'xp_spend', item: legacy, cost: null, _proj: n });
        }
      }
      // Also include admin xp_grid rows (free merits)
      try {
        const adminRows = JSON.parse(s.responses?.xp_spend || '[]').filter(r => r.category || r.item);
        rows = rows.concat(adminRows);
      } catch { /* ignore */ }
      if (!rows.length) continue;

      const { char, charName } = resolveSubChar(s);
      const isBlockExpanded = xpReviewExpanded.has(s._id);
      const approvals = s.st_review?.xp_approvals || {};
      const doneHere = rows.filter((_, i) => approvals[i]?.status === 'approved').length;
      const charBadge = _progressBadge(doneHere, rows.length, 'Done');

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


  const isExpanded = expandedPhases.has('narrative');
  const queue = buildProcessingQueue(submissions);

  let h = '<div class="proc-phase-section">';
  h += _renderPhaseHeader('narrative', 'Step 9 \u2014 Narrative Output', submissions.length, 'submission', isExpanded);

  if (isExpanded) {
    for (const s of submissions) {
      const { char, charName } = resolveSubChar(s);
      const isBlockExpanded = narrativeExpanded.has(s._id);
      const narr = s.st_review?.narrative || {};
      const doneCount = NARR_KEYS.filter(k => narr[k]?.status === 'ready').length;
      const statusBadge = _progressBadge(doneCount, NARR_KEYS.length, 'All ready');

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
    const { char, charName: name } = resolveSubChar(s, '?');
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
      const str = _fmtMod(val);
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
  renderCityOverview();

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

  // ── Cross-reference index (single O(n) pass) ──
  // Keys: 'terr:<territory>' | 'inv-target:<charName>'
  // Values: [{ charName, label, phase }, ...] — excludes self at render time
  _xrefIndex = new Map();
  for (const e of queue) {
    if (e.projTerritory) {
      const k = `terr:${e.projTerritory}`;
      if (!_xrefIndex.has(k)) _xrefIndex.set(k, []);
      _xrefIndex.get(k).push({ charName: e.charName, label: e.label, phase: e.phase });
    }
    if (e.feedTerrs) {
      for (const terr of Object.keys(e.feedTerrs)) {
        const k = `terr:${terr}`;
        if (!_xrefIndex.has(k)) _xrefIndex.set(k, []);
        _xrefIndex.get(k).push({ charName: e.charName, label: 'Feeding', phase: e.phase });
      }
    }
    if (e.actionType === 'investigate') {
      const eSub = submissions.find(s => String(s._id) === String(e.subId));
      const eRev = e.source === 'project'
        ? (eSub?.projects_resolved?.[e.actionIdx] || {})
        : (eSub?.merit_actions_resolved?.[e.actionIdx] || {});
      const target = eRev.investigate_target_char;
      if (target) {
        const k = `inv-target:${target}`;
        if (!_xrefIndex.has(k)) _xrefIndex.set(k, []);
        _xrefIndex.get(k).push({ charName: e.charName, label: e.label, phase: e.phase });
      }
    }
  }

  let h = '<div class="proc-queue">';

  // Controls bar — queue-level toggles
  h += `<div class="proc-queue-controls">`;
  h += `<button class="proc-hide-done-btn${procHideDone ? ' active' : ''}" id="proc-hide-done-toggle">${procHideDone ? 'Show all' : 'Hide done'}</button>`;
  h += `</div>`;

  // Character status strip — at-a-glance state + jump-to navigation
  h += renderCharacterStrip(queue);

  // Pre-read — Step 0, player questionnaire responses
  h += renderPreReadSection();

  for (const [phaseKey, entries] of byPhase) {
    const label = PHASE_LABELS[phaseKey] || phaseKey;
    const isCollapsed = !expandedPhases.has(phaseKey);

    // Completion count for this phase
    const doneCount = entries.filter(e => DONE_STATUSES.has(getEntryReview(e)?.pool_status)).length;
    const phaseProgressBadge = _progressBadge(doneCount, entries.length, '');

    // When hiding done, skip phases where every action is resolved
    const visibleEntries = procHideDone
      ? entries.filter(e => !DONE_STATUSES.has(getEntryReview(e)?.pool_status))
      : entries;
    if (procHideDone && visibleEntries.length === 0) continue;

    h += `<div class="proc-phase-section">`;
    h += _renderPhaseHeader(phaseKey, `${esc(label)}${phaseProgressBadge}`, entries.length, 'action', !isCollapsed);

    if (!isCollapsed) {
      for (const entry of visibleEntries) {
        const isExpanded = procExpandedKeys.has(entry.key);
        const review = getEntryReview(entry);
        const status = review?.pool_status || 'pending';
        const shortDesc = entry.description.length > 80 ? entry.description.slice(0, 77) + '...' : entry.description;
        h += `<div class="proc-action-row${isExpanded ? ' expanded' : ''}" data-proc-key="${esc(entry.key)}">`;
        h += `<span class="proc-row-char">${esc(entry.charName)}</span>`;
        h += `<span class="proc-row-label">${esc(entry.label)}${entry.source === 'st_created' ? ' <span class="proc-row-st-badge">[ST]</span>' : ''}</span>`;
        h += `<span class="proc-row-desc" title="${esc(entry.description)}">${esc(shortDesc || '—')}</span>`;
        const _attributedName =
          (status === 'validated' && review?.pool_validated_by) ? review.pool_validated_by :
          (status === 'committed' && review?.pool_committed_by) ? review.pool_committed_by :
          (status === 'resolved'  && review?.pool_resolved_by)  ? review.pool_resolved_by  : '';
        h += `<span class="proc-row-status-cell">`;
        if (_attributedName) h += `<span class="proc-row-validator">${esc(_attributedName)}</span>`;
        h += `<span class="proc-row-status ${status}">${POOL_STATUS_LABELS[status] || status}</span>`;
        h += `</span>`;
        if (review?.second_opinion) h += `<span class="proc-row-second-opinion-dot" title="Flagged for second opinion">\u25CF</span>`;
        h += `<span class="proc-row-actions">`;
        h += `<button class="proc-duplicate-btn dt-btn dt-btn-sm" data-proc-key="${esc(entry.key)}" title="Duplicate">Dup</button>`;
        h += `<button class="proc-delete-row-btn dt-btn dt-btn-sm" data-proc-key="${esc(entry.key)}" title="Delete">Del</button>`;
        h += `</span>`;
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
    h += _renderPhaseHeader('investigate', PHASE_LABELS.investigate, 0, 'action', expandedPhases.has('investigate'));
    if (expandedPhases.has('investigate')) {
      h += '<div id="dt-investigations"></div>';
    }
    h += '</div>';
  }

  // XP Review — Step 10
  h += renderXpReviewStep();

  // Add ST Action form
  h += _renderAddStActionForm(submissions);

  // Deleted Actions recovery
  h += renderDeletedActionsSection(submissions);

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

  // DTFP-5: Wire feed-violence ST override selects
  container.querySelectorAll('.proc-feed-violence-st-override').forEach(sel => {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const subId = sel.dataset.subId;
      const newVal = sel.value || null;
      const sub = submissions.find(s => s._id === subId);
      if (sub) {
        if (!sub.st_review) sub.st_review = {};
        if (newVal) sub.st_review.feed_violence_st_override = newVal;
        else delete sub.st_review.feed_violence_st_override;
      }
      await updateSubmission(subId, { 'st_review.feed_violence_st_override': newVal });
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
          sel.classList.contains('proc-inv-secrecy-sel') ||
          sel.classList.contains('proc-feed-blood-sel') ||
          sel.classList.contains('proc-sorc-tradition-sel') ||
          sel.classList.contains('proc-sorc-rite-sel')) return;
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
      renderCityOverview();
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
      const statusPatch = { pool_status: status };
      if (['validated', 'committed', 'resolved'].includes(status)) {
        const user = getUser();
        const stName = user?.global_name || user?.username || 'ST';
        if (status === 'validated')  statusPatch.pool_validated_by  = stName;
        if (status === 'committed')  statusPatch.pool_committed_by  = stName;
        if (status === 'resolved')   statusPatch.pool_resolved_by   = stName;
      }
      await saveEntryReview(entry, statusPatch);

      // When committing a feeding pool, persist the vitae tally so the player
      // portal can show correct values in the ready state (before they roll).
      if (status === 'committed' && entry.source === 'feeding') {
        const vitaePanel = container.querySelector(`.proc-feed-vitae-panel[data-proc-key="${key}"]`);
        if (vitaePanel) {
          const vitateTally = {
            herd:               parseInt(vitaePanel.dataset.herd,       10) || 0,
            ambience:           parseInt(vitaePanel.dataset.ambience,   10) || 0,
            ambience_territory: vitaePanel.dataset.terrLabel || '',
            oath_of_fealty:     parseInt(vitaePanel.dataset.oof,        10) || 0,
            ghouls:             parseInt(vitaePanel.dataset.ghouls,     10) || 0,
            rite_cost:          parseInt(vitaePanel.dataset.riteCost,   10) || 0,
            manual:             parseInt(vitaePanel.dataset.manual,     10) || 0,
            total_bonus:        parseInt(vitaePanel.dataset.totalBonus, 10) || 0,
          };
          await updateSubmission(entry.subId, { feeding_vitae_tally: vitateTally });
          const sub = submissions.find(s => s._id === entry.subId);
          if (sub) sub.feeding_vitae_tally = vitateTally;
        }
      }

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
  container.querySelectorAll('.proc-feed-desc-ta, .proc-feed-name-input, .proc-feed-pool-input, .proc-feed-bonuses-input, .proc-proj-name-input, .proc-proj-title-input, .proc-proj-outcome-input, .proc-proj-merits-input, .proc-sorc-notes-input').forEach(el => {
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
      const tradition  = card.querySelector('.proc-sorc-tradition-sel').value;
      const riteName   = card.querySelector('.proc-sorc-rite-sel').value;
      const notes      = card.querySelector('.proc-sorc-notes-input').value.trim();
      await saveEntryReview(entry, {
        sorc_tradition: tradition || null,
        sorc_rite_name: riteName  || null,
        rite_override:  riteName  || null,
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
      if (modDisp) modDisp.textContent = _fmtMod(val);
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
      if (modDisp) modDisp.textContent = _fmtMod(val);
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

  // Wire player_facing_note textarea (save on blur)
  container.querySelectorAll('.proc-player-note-input').forEach(ta => {
    ta.addEventListener('click', e => e.stopPropagation());
    ta.addEventListener('blur', async e => {
      const key = ta.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { player_facing_note: ta.value.trim() });
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
      const skillSel = container.querySelector(`.proc-pool-builder[data-proc-key="${key}"] .proc-pool-skill`);
      const skillNa = char && skillSel ? skNineAgain(char, skillSel.value) : false;
      const specBonus = activeFeedSpecs.reduce((sum, sp) => sum + ((skillNa || (char && hasAoE(char, sp))) ? 2 : 1), 0);
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
      // Read vitae tally data attrs from the rendered panel
      const vitaePanel = container.querySelector(`.proc-feed-vitae-panel[data-proc-key="${key}"]`);
      const vtHerd    = vitaePanel ? (parseInt(vitaePanel.dataset.herd,   10) || 0) : 0;
      const vtOof     = vitaePanel ? (parseInt(vitaePanel.dataset.oof,    10) || 0) : 0;
      const vtAmb     = vitaePanel ? (parseInt(vitaePanel.dataset.ambience, 10) || 0) : 0;
      const vtGhouls  = vitaePanel ? (parseInt(vitaePanel.dataset.ghouls, 10) || 0) : 0;
      const vtRite    = vitaePanel ? (parseInt(vitaePanel.dataset.riteCost, 10) || 0) : 0;
      const vtManual  = vitaePanel ? (parseInt(vitaePanel.dataset.manual,  10) || 0) : 0;
      const vtTotal   = vitaePanel ? (parseInt(vitaePanel.dataset.totalBonus, 10) || 0) : 0;
      const vtTerrLbl = vitaePanel ? (vitaePanel.dataset.terrLabel || '') : '';
      const vitateTally = {
        herd:               vtHerd,
        ambience:           vtAmb,
        ambience_territory: vtTerrLbl,
        oath_of_fealty:     vtOof,
        ghouls:             vtGhouls,
        rite_cost:          vtRite,
        manual:             vtManual,
        total_bonus:        vtTotal,
      };

      showRollModal(
        { size: diceCount, expression: `Feeding: ${poolValidated}`, existingRoll: sub?.feeding_roll,
          again, rote: isRote },
        async result => {
          await updateSubmission(subId, { feeding_roll: result, feeding_vitae_tally: vitateTally });
          if (sub) { sub.feeding_roll = result; sub.feeding_vitae_tally = vitateTally; }
          const cur = getEntryReview(entry)?.pool_status || 'pending';
          if (cur === 'pending' || cur === 'committed') {
            await saveEntryReview(entry, { pool_status: 'rolled' });
          }
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
        // Save both roll result AND pool object so the player story tab
        // can display both the expression and the outcome.
        await saveEntryReview(entry, {
          roll: result,
          pool: { expression: poolValidated, total: diceCount },
        });
        const cur = getEntryReview(entry)?.pool_status || 'pending';
        if (cur === 'pending' || cur === 'committed') {
          await saveEntryReview(entry, { pool_status: 'rolled' });
        }
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
      const meritExpr = `(${entry.meritDots || '?'} \u00d7 2) + 2`;
      showRollModal({
        size: diceCount, expression: meritExpr,
        existingRoll: review?.roll || null,
        again: 10, initialRote: false,
      }, async result => {
        await saveEntryReview(entry, {
          roll: result,
          pool: { expression: meritExpr, total: diceCount },
        });
        const cur = getEntryReview(entry)?.pool_status || 'pending';
        if (cur === 'pending' || cur === 'committed') {
          await saveEntryReview(entry, { pool_status: 'rolled' });
        }
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

  // Wire sorcery target checkboxes (auto-save on change)
  container.querySelectorAll('.proc-sorc-target-chk').forEach(cb => {
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = cb.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const allChks = container.querySelectorAll(`.proc-sorc-target-chk[data-proc-key="${key}"]`);
      const targets = [...allChks].filter(c => c.checked).map(c => c.dataset.charName).join(', ');
      await saveEntryReview(entry, { sorc_targets: targets || null });
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

  // Wire contacts target text input
  container.querySelectorAll('.proc-contacts-target-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('blur', async e => {
      e.stopPropagation();
      const key   = inp.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { contacts_target: inp.value.trim() || null });
    });
  });

  // Wire contacts info type selector
  container.querySelectorAll('.proc-contacts-info-type-sel').forEach(sel => {
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { contacts_info_type: sel.value || null });
    });
  });

  // Wire contacts subject text input
  container.querySelectorAll('.proc-contacts-subject-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('blur', async e => {
      e.stopPropagation();
      const key   = inp.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { contacts_subject: inp.value.trim() || null });
    });
  });

  // Wire patrol/scout detail level selector
  container.querySelectorAll('.proc-patrol-detail-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { patrol_detail_level: sel.value || null });
    });
  });

  // Wire patrol/scout observed textarea
  container.querySelectorAll('.proc-patrol-observed-ta').forEach(ta => {
    ta.addEventListener('click', e => e.stopPropagation());
    ta.addEventListener('blur', async e => {
      e.stopPropagation();
      const key   = ta.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { patrol_observed: ta.value.trim() || null });
    });
  });

  // Wire block confirm button
  container.querySelectorAll('.proc-block-confirm-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { pool_status: 'no_roll' });
      renderProcessingMode(container);
    });
  });

  // Wire support target selector
  container.querySelectorAll('.proc-support-target-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { support_target_key: sel.value || null });
    });
  });

  // Wire rumour detail level selector
  container.querySelectorAll('.proc-rumour-detail-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { rumour_detail_level: sel.value || null });
    });
  });

  // Wire rumour content textarea
  container.querySelectorAll('.proc-rumour-content-ta').forEach(ta => {
    ta.addEventListener('click', e => e.stopPropagation());
    ta.addEventListener('blur', async e => {
      e.stopPropagation();
      const key   = ta.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { rumour_content: ta.value.trim() || null });
    });
  });

  // Wire investigate target radio list — save without re-render
  container.querySelectorAll('.proc-inv-target-radio').forEach(radio => {
    radio.addEventListener('click', e => e.stopPropagation());
    radio.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = radio.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { investigate_target_char: radio.value });
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

  // Wire custom rite level input — save rite_custom_level on change and re-render
  container.querySelectorAll('.proc-rite-custom-level-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('mousedown', e => e.stopPropagation());
    inp.addEventListener('change', async e => {
      e.stopPropagation();
      const key   = inp.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const val = parseInt(inp.value, 10);
      if (val >= 1 && val <= 5) {
        await saveEntryReview(entry, { rite_custom_level: val });
        renderProcessingMode(container);
      }
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


  // Wire second-opinion flag toggle
  container.querySelectorAll('.proc-second-opinion-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const review = getEntryReview(entry);
      await saveEntryReview(entry, { second_opinion: !review?.second_opinion });
      renderProcessingMode(container);
    });
  });

  // Wire compact merit outcome toggle
  container.querySelectorAll('.proc-merit-outcome-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { merit_outcome: btn.dataset.outcome, pool_status: 'resolved' });
      renderProcessingMode(container);
    });
  });

  // ── Outcome summary input (compact merit panel) ──
  container.querySelectorAll('.proc-outcome-summary-input').forEach(inp => {
    inp.addEventListener('blur', async () => {
      const key   = inp.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { outcome_summary: inp.value.trim() });
    });
  });

  // ── Travel discretion buttons ──
  container.querySelectorAll('.proc-travel-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { pool_status: btn.dataset.discretion });
      renderProcessingMode(container);
    });
  });

  // ── Contested toggle ──
  container.querySelectorAll('.proc-contested-toggle').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const rev   = getEntryReview(entry) || {};
      if (rev.contested) {
        await saveEntryReview(entry, { contested: false, contested_char: '', contested_pool_label: '', contested_roll: null });
      } else {
        await saveEntryReview(entry, { contested: true });
      }
      renderProcessingMode(container);
    });
  });

  // ── Contested char selector ──
  container.querySelectorAll('.proc-contested-char-sel').forEach(sel => {
    sel.addEventListener('change', async e => {
      const key   = sel.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { contested_char: sel.value });
      renderProcessingMode(container);
    });
  });

  // ── Contested pool label input ──
  container.querySelectorAll('.proc-contested-pool-input').forEach(input => {
    input.addEventListener('change', async e => {
      const key   = input.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      await saveEntryReview(entry, { contested_pool_label: input.value.trim() });
      renderProcessingMode(container);
    });
  });

  // ── Roll defence button ──
  container.querySelectorAll('.proc-contested-roll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const rev   = getEntryReview(entry) || {};
      const poolLabel = rev.contested_pool_label || '';
      const match = poolLabel.match(/=\s*(\d+)\s*$/);
      if (!match) return;
      const poolTotal = parseInt(match[1], 10);
      if (!poolTotal || poolTotal < 1) return;
      const result = await rollPool(poolTotal, false, false, false);
      await saveEntryReview(entry, { contested_roll: result });
      renderProcessingMode(container);
    });
  });

  // ── Duplicate action (any type) ──
  container.querySelectorAll('.proc-duplicate-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      const rev       = getEntryReview(entry) || {};
      const tradition = rev.sorc_tradition || entry.tradition || '';
      const riteName  = rev.sorc_rite_name || rev.rite_override || entry.riteName || '';
      const notes     = rev.sorc_notes || entry.projDescription || entry.description || '';
      const label     = (entry.actionType === 'sorcery' && riteName) ? riteName : entry.label;
      await addStAction(entry.subId, {
        action_type: entry.actionType,
        label,
        description: notes,
        pool_player: entry.poolPlayer || '',
        tradition,
        rite_name:   riteName,
      });
      const sub    = submissions.find(s => s._id === entry.subId);
      const newIdx = (sub?.st_actions || []).length - 1;
      if (newIdx >= 0) procExpandedKeys.add(`${entry.subId}:st:${newIdx}`);
      renderProcessingMode(container);
    });
  });

  // ── Delete action ──
  container.querySelectorAll('.proc-delete-row-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = _getQueueEntry(key);
      if (!entry) return;
      if (entry.source === 'st_created') {
        await deleteStAction(entry.subId, entry.actionIdx);
      } else {
        // Extract the key-part after subId: (e.g. 'proj:0', 'feeding', 'sorcery:1')
        const keyPart = key.slice(entry.subId.length + 1);
        await deletePlayerAction(entry.subId, keyPart);
      }
      renderProcessingMode(container);
    });
  });

  // Wire Delete ST action buttons (expanded panel delete, kept for backwards compat)
  container.querySelectorAll('.proc-delete-st-action').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const actionIdx = parseInt(btn.dataset.actionIdx, 10);
      await deleteStAction(subId, actionIdx);
      renderProcessingMode(container);
    });
  });

  // ── Toggle deleted actions panel ──
  container.querySelector('[data-deleted-toggle]')?.addEventListener('click', () => {
    procDeletedOpen = !procDeletedOpen;
    renderProcessingMode(container);
  });

  // ── Restore deleted action ──
  container.querySelectorAll('.proc-restore-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId   = btn.dataset.subId;
      const keyPart = btn.dataset.keyPart;
      const source  = btn.dataset.source;
      if (source === 'st') {
        const idx = parseInt(keyPart.slice(3), 10);
        await restoreStAction(subId, idx);
      } else {
        await restorePlayerAction(subId, keyPart);
      }
      renderProcessingMode(container);
    });
  });

  // ── Add ST Action form ──
  container.querySelector('[data-toggle-add-st-form]')?.addEventListener('click', () => {
    const form = container.querySelector('#proc-add-st-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  const stTypeEl = container.querySelector('#proc-add-st-type');
  const stSorcEl = container.querySelector('#proc-add-st-sorcery');
  const stGenEl  = container.querySelector('#proc-add-st-general');
  function _updateStActionFields() {
    if (!stTypeEl || !stSorcEl || !stGenEl) return;
    const isSorc = stTypeEl.value === 'sorcery';
    stSorcEl.style.display = isSorc ? '' : 'none';
    stGenEl.style.display  = isSorc ? 'none' : '';
  }
  stTypeEl?.addEventListener('change', _updateStActionFields);
  _updateStActionFields();

  container.querySelector('#proc-add-st-submit')?.addEventListener('click', async () => {
    const subId    = container.querySelector('#proc-add-st-char')?.value;
    const type     = container.querySelector('#proc-add-st-type')?.value;
    const isSorc   = type === 'sorcery';
    const tradition = isSorc ? (container.querySelector('#proc-add-st-tradition')?.value || '') : '';
    const riteName  = isSorc ? (container.querySelector('#proc-add-st-rite')?.value || '') : '';
    const label     = isSorc
      ? (riteName || tradition || 'Sorcery')
      : (container.querySelector('#proc-add-st-label')?.value?.trim() || type);
    const desc = container.querySelector('#proc-add-st-desc')?.value?.trim() || '';

    if (!subId) { alert('Select a character first.'); return; }
    await addStAction(subId, { action_type: type, label, description: desc, tradition, rite_name: riteName });
    const sub    = submissions.find(s => s._id === subId);
    const newIdx = (sub?.st_actions || []).length - 1;
    if (newIdx >= 0) procExpandedKeys.add(`${subId}:st:${newIdx}`);
    renderProcessingMode(container);
  });

}

function _renderAddStActionForm(subs) {
  const activeSubs = subs.filter(s => s.status !== 'draft' || s.character_name);
  let h = '<div class="proc-phase-section proc-add-st-section">';
  h += '<div class="proc-phase-header" data-toggle-add-st-form>';
  h += '<span class="proc-phase-label">+ Add ST Action</span>';
  h += '</div>';
  h += '<div class="proc-add-st-form" id="proc-add-st-form" style="display:none;">';
  h += '<div class="proc-add-st-row">';
  // Character selector
  h += '<select class="qf-select proc-add-st-char" id="proc-add-st-char">';
  h += '<option value="">— Character —</option>';
  for (const s of activeSubs) {
    h += `<option value="${esc(s._id)}">${esc(s.character_name || s._id)}</option>`;
  }
  h += '</select>';
  // Action type selector
  h += '<select class="qf-select proc-add-st-type" id="proc-add-st-type">';
  for (const [val, label] of [
    ['sorcery', 'Sorcery'], ['project', 'Project'], ['attack', 'Attack'],
    ['investigate', 'Investigate'], ['patrol_scout', 'Patrol/Scout'],
    ['support', 'Support'], ['misc', 'Misc'],
  ]) {
    h += `<option value="${val}">${label}</option>`;
  }
  h += '</select>';
  h += '</div>';
  // Sorcery fields (shown when type=sorcery)
  h += '<div class="proc-add-st-sorcery" id="proc-add-st-sorcery">';
  h += '<select class="qf-select proc-add-st-tradition" id="proc-add-st-tradition">';
  h += '<option value="">— Tradition —</option>';
  h += '<option value="Cruac">Cruac</option>';
  h += '<option value="Theban">Theban Sorcery</option>';
  h += '</select>';
  const allRites = (_getRulesDB() || []).filter(r => r.category === 'rite');
  const byTrad = {};
  for (const r of allRites) { const t = r.parent || 'Unknown'; if (!byTrad[t]) byTrad[t] = []; byTrad[t].push(r); }
  h += '<select class="qf-select proc-add-st-rite" id="proc-add-st-rite">';
  h += '<option value="">— Rite —</option>';
  for (const trad of ['Cruac', 'Theban']) {
    if (!byTrad[trad]) continue;
    const grp = byTrad[trad].slice().sort((a, b) => (a.rank || 0) - (b.rank || 0) || a.name.localeCompare(b.name));
    h += `<optgroup label="${esc(trad)}">${grp.map(r => `<option value="${esc(r.name)}">${esc(r.name)} (Lvl ${r.rank || '?'})</option>`).join('')}</optgroup>`;
  }
  h += '</select>';
  h += '</div>';
  // Label field (shown for non-sorcery)
  h += '<div class="proc-add-st-general" id="proc-add-st-general" style="display:none;">';
  h += '<input type="text" class="qf-input proc-add-st-label" id="proc-add-st-label" placeholder="Action label...">';
  h += '</div>';
  // Description (always shown)
  h += '<textarea class="proc-note-textarea proc-add-st-desc" id="proc-add-st-desc" rows="2" placeholder="Description / notes (optional)..." style="margin-top:6px;"></textarea>';
  h += '<div style="margin-top:6px;">';
  h += '<button class="dt-btn" id="proc-add-st-submit">Add Action</button>';
  h += '</div>';
  h += '</div>';
  h += '</div>';
  return h;
}

/** Add an ST-created action to a submission's st_actions array. */
async function addStAction(subId, actionDef) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;
  const stActions = [...(sub.st_actions || [])];
  stActions.push({
    action_type: actionDef.action_type,
    label:       actionDef.label,
    description: actionDef.description || '',
    pool_player: actionDef.pool_player || '',
    tradition:   actionDef.tradition   || '',
    rite_name:   actionDef.rite_name   || '',
  });
  await updateSubmission(subId, { st_actions: stActions });
  sub.st_actions = stActions;
}

/** Soft-delete an ST-created action by marking _deleted: true (preserves for restore). */
async function deleteStAction(subId, actionIdx) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;
  const stActions = [...(sub.st_actions || [])];
  if (!stActions[actionIdx]) return;
  stActions[actionIdx] = { ...stActions[actionIdx], _deleted: true };
  await updateSubmission(subId, { st_actions: stActions });
  sub.st_actions = stActions;
  procExpandedKeys.delete(`${subId}:st:${actionIdx}`);
}

/** Restore a soft-deleted ST-created action. */
async function restoreStAction(subId, actionIdx) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;
  const stActions = [...(sub.st_actions || [])];
  if (!stActions[actionIdx]) return;
  const { _deleted, ...rest } = stActions[actionIdx];
  stActions[actionIdx] = rest;
  await updateSubmission(subId, { st_actions: stActions });
  sub.st_actions = stActions;
}

/** Restore a soft-deleted player action by removing its key-part from deleted_action_keys. */
async function restorePlayerAction(subId, keyPart) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;
  const deleted = (sub.st_review?.deleted_action_keys || []).filter(k => k !== keyPart);
  await updateSubmission(subId, { 'st_review.deleted_action_keys': deleted });
  if (!sub.st_review) sub.st_review = {};
  sub.st_review.deleted_action_keys = deleted;
}

/** Permanently delete a player-submitted action by recording its key-part in st_review. */
async function deletePlayerAction(subId, actionKeyPart) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;
  const deleted = [...(sub.st_review?.deleted_action_keys || [])];
  if (!deleted.includes(actionKeyPart)) deleted.push(actionKeyPart);
  await updateSubmission(subId, { 'st_review.deleted_action_keys': deleted });
  if (!sub.st_review) sub.st_review = {};
  sub.st_review.deleted_action_keys = deleted;
  // Remove from expanded keys too
  procExpandedKeys.delete(`${subId}:${actionKeyPart}`);
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
  h += `<input class="proc-attach-text proc-section" type="text" data-proc-key="${esc(entry.key)}" placeholder="e.g. +4 to pool, Rote quality, -1 Vitae">`;
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
 * Render spec-toggle checkboxes for a pool builder row.
 * Covers native specs on the selected skill + IS specs from all skills.
 * @param {object|null} char
 * @param {string} preSkill  — currently selected skill name
 * @param {string} procKey   — entry key for data-proc-key attributes
 * @param {string[]} activeSpecs — already-checked specs from review
 * @param {string} disabled  — ' disabled' or ''
 * @returns {string} HTML string
 */
function _buildSpecTogglesHtml(char, preSkill, procKey, activeSpecs, disabled) {
  if (!char || !preSkill) return '';
  let h = '';
  for (const sp of skSpecs(char, preSkill)) {
    const checked = activeSpecs.includes(sp) ? ' checked' : '';
    const aoe = hasAoE(char, sp);
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${esc(procKey)}" data-spec="${esc(sp)}"${checked}${disabled}>${esc(sp)} ${aoe ? '+2' : '+1'}</label>`;
  }
  for (const { spec: isSp, fromSkill } of isSpecs(char)) {
    if (fromSkill === preSkill) continue; // already present as a native spec on this skill
    const checked = activeSpecs.includes(isSp) ? ' checked' : '';
    const aoe = hasAoE(char, isSp);
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${esc(procKey)}" data-spec="${esc(isSp)}"${checked}${disabled}>${esc(isSp)} (${esc(fromSkill)}) ${aoe ? '+2' : '+1'}</label>`;
  }
  return h;
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
  if (totalEl) totalEl.textContent = _fmtMod(total);

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
      const bon = (nineA || hasAoE(char, sp)) ? 2 : 1;
      h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${key}" data-spec="${esc(sp)}"${checked ? ' checked' : ''}>${esc(sp)} +${bon}</label>`;
    }
    for (const { spec: isSp, fromSkill } of isSpecs(char)) {
      if (fromSkill === skillName) continue; // already present as a native spec on this skill
      const checked = activeSpecs.includes(isSp);
      const bon = (nineA || hasAoE(char, isSp)) ? 2 : 1;
      h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${key}" data-spec="${esc(isSp)}"${checked ? ' checked' : ''}>${esc(isSp)} (${esc(fromSkill)}) +${bon}</label>`;
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
        const specBonus2 = activeSpecs2.reduce((sum, sp) => sum + ((nineA || hasAoE(char, sp)) ? 2 : 1), 0);
        await saveEntryReview(entry2, { active_feed_specs: activeSpecs2, pool_mod_spec: specBonus2 });
      });
    });
    return;
  }

  // Feeding: 9-again lives in the right panel; sync auto-detected state to sidebar checkbox.
  // Always sync when char has nine_again on this skill — character data takes priority over
  // a saved false (which may be stale from a commit before PT was entered).
  const sidebarNineAFeed = container.querySelector(`.proc-proj-9a[data-proc-key="${key}"]`);
  if (sidebarNineAFeed && (nineA || review.nine_again == null)) {
    sidebarNineAFeed.checked = nineA;
  }
  let h = '';
  for (const sp of specs) {
    const checked = activeSpecs.includes(sp);
    const bon = (nineA || hasAoE(char, sp)) ? 2 : 1;
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${key}" data-spec="${esc(sp)}"${checked ? ' checked' : ''}>${esc(sp)} +${bon}</label>`;
  }
  for (const { spec: isSp, fromSkill } of isSpecs(char)) {
    if (fromSkill === skillName) continue; // already present as a native spec on this skill
    const checked = activeSpecs.includes(isSp);
    const bon = (nineA || hasAoE(char, isSp)) ? 2 : 1;
    h += `<label class="dt-spec-toggle-lbl"><input type="checkbox" class="dt-feed-spec-toggle" data-proc-key="${key}" data-spec="${esc(isSp)}"${checked ? ' checked' : ''}>${esc(isSp)} (${esc(fromSkill)}) +${bon}</label>`;
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
      const specBonus2 = activeSpecs2.reduce((sum, sp) => sum + ((nineA || hasAoE(char, sp)) ? 2 : 1), 0);
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
 * Returns true when a merit entry should render the compact panel instead of the full
 * pool-builder pipeline. Compact mode applies to auto/blocked/fixed-effect actions and
 * to contacts/retainer category entries which have no meaningful dice pool.
 */
function _isCompactMerit(entry, mode, formula) {
  if (entry.source !== 'merit') return false;
  if (mode === 'auto' || mode === 'blocked') return true;
  if (formula === 'none') return true;
  if (entry.meritCategory === 'contacts') return true;
  if (entry.meritCategory === 'retainer') return true;
  return false;
}

const MODE_LABELS = { instant: 'Instant', contested: 'Contested', auto: 'Automatic', blocked: 'Cannot' };

/**
 * Compact right-panel for binary/fixed-effect merit actions.
 * Renders: effect chip, auto successes (if auto), outcome toggle, ST notes textarea.
 * Omits: pool builder, roll card, success modifier, validation status buttons.
 */
/**
 * DTSR-5: Outcome zone for merit actions. Renders Approved / Partial / Failed
 * buttons + one-line outcome summary input. Suppressed for blocked actions.
 * Lives in the merit panel's left column so resolution sits with the action
 * details (four-zone canon: Action Definition -> Outcome).
 */
function _renderMeritOutcomeZone(entry, rev) {
  const category   = entry.meritCategory || 'misc';
  const actionType = entry.actionType    || 'misc';
  const matrixRow  = MERIT_MATRIX[category]?.[actionType] || null;
  const mode       = matrixRow?.mode || 'auto';
  if (mode === 'blocked') return '';

  const key            = entry.key;
  const outcome        = rev.merit_outcome   || '';
  const outcomeSummary = rev.outcome_summary || '';

  let h = `<div class="proc-feed-mod-panel proc-merit-outcome-zone" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">Outcome</div>`;
  h += `<div class="proc-merit-outcome-btns">`;
  for (const [val, label] of [['approved', 'Approved'], ['partial', 'Partial'], ['failed', 'Failed']]) {
    h += `<button class="proc-merit-outcome-btn${outcome === val ? ' active' : ''}" data-proc-key="${esc(key)}" data-outcome="${val}">${label}</button>`;
  }
  h += `</div>`;
  h += `<input type="text" class="proc-outcome-summary-input" data-proc-key="${esc(key)}" value="${esc(outcomeSummary)}" placeholder="One-line outcome summary (shown to player)...">`;
  h += `</div>`;
  return h;
}

function _renderCompactMeritPanel(entry, rev) {
  const key        = entry.key;
  const category   = entry.meritCategory || 'misc';
  const actionType = entry.actionType || 'misc';
  const dots       = entry.meritDots;
  const matrixRow  = MERIT_MATRIX[category]?.[actionType] || null;
  const mode       = matrixRow?.mode || 'auto';
  const effect     = matrixRow?.effect || '';
  const effectAuto = matrixRow?.effectAuto || '';
  const isAuto     = mode === 'auto';
  const autoSucc   = isAuto && dots != null ? dots : null;
  const thread     = rev.notes_thread     || [];

  let h = `<div class="proc-feed-right proc-compact-merit-panel" data-proc-key="${esc(key)}">`;

  // ── Effect panel ──
  h += `<div class="proc-feed-mod-panel proc-merit-effect-panel" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-merit-mode-row">`;
  h += `<span class="proc-mod-label">Action Mode</span>`;
  h += `<span class="proc-merit-mode-chip proc-merit-mode-${mode}">${MODE_LABELS[mode] || mode}</span>`;
  h += `</div>`;
  if (effect) {
    h += `<div class="proc-merit-effect-row"><span class="proc-mod-label">Effect</span><span class="proc-merit-effect-text">${esc(effect)}</span></div>`;
  }
  if (effectAuto) {
    h += `<div class="proc-merit-effect-row proc-merit-effect-auto"><span class="proc-mod-label">Auto</span><span class="proc-merit-effect-text">${esc(effectAuto)}</span></div>`;
  }
  h += `</div>`; // proc-merit-effect-panel

  // ── Auto successes (auto mode only) ──
  if (isAuto && autoSucc !== null) {
    h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
    h += `<div class="proc-mod-panel-title">Automatic Successes</div>`;
    h += `<div class="proc-mod-row"><span class="proc-mod-label">Base successes</span><span class="proc-mod-static">${autoSucc}</span></div>`;
    h += `</div>`;
  }

  // ── ST Notes (compact) ──
  h += `<div class="proc-feed-mod-panel proc-compact-notes-panel" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">ST Notes <span class="proc-label-sub">— visible to Claude</span></div>`;
  if (thread.length) {
    h += `<div class="proc-notes-thread">`;
    for (let noteIdx = 0; noteIdx < thread.length; noteIdx++) {
      const note = thread[noteIdx];
      const time = note.created_at
        ? new Date(note.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '';
      h += `<div class="proc-note-entry">`;
      h += `<div class="proc-note-meta">${esc(note.author_name)}${time ? '  \u00B7  ' + esc(time) : ''}<button class="proc-note-delete-btn" data-proc-key="${esc(key)}" data-note-idx="${noteIdx}" title="Delete note">\u00D7</button></div>`;
      h += `<div class="proc-note-text">${esc(note.text)}</div>`;
      h += `</div>`;
    }
    h += `</div>`;
  }
  h += `<div class="proc-note-add">`;
  h += `<textarea class="proc-note-textarea" data-proc-key="${esc(key)}" placeholder="Add ST note..." rows="2"></textarea>`;
  h += `<button class="dt-btn proc-add-note-btn" data-proc-key="${esc(key)}">Add Note</button>`;
  h += `</div>`;
  h += `</div>`;

  h += `</div>`; // proc-compact-merit-panel
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
  const eqStr      = _fmtMod(eqMod);

  const matrixRow  = MERIT_MATRIX[category]?.[actionType] || null;
  const formula    = matrixRow?.poolFormula || 'none';
  const mode       = matrixRow?.mode || 'instant';
  const effect     = matrixRow?.effect || '';
  const effectAuto = matrixRow?.effectAuto || '';

  const basePool   = formula === 'dots2plus2' && dots != null ? (dots * 2) + 2 : null;
  const totalPool  = basePool != null ? basePool + eqMod : null;
  const roll       = rev.roll || null;
  const isRolled   = formula === 'dots2plus2';
  const isAuto     = mode === 'auto';
  const isBlocked  = mode === 'blocked';

  // Compact path for binary/fixed-effect actions — no pool builder needed
  if (_isCompactMerit(entry, mode, formula)) return _renderCompactMeritPanel(entry, rev);


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
  } else if (actionType === 'block') {
    // Block — auto-resolution display with confirm button
    const blockLevel = dots != null ? `${dots} or lower` : 'same level or lower';
    const blockConfirmed = poolStatus === 'no_roll';
    h += `<div class="proc-feed-right-section proc-proj-roll-card">`;
    h += `<div class="proc-mod-panel-title">Block Resolution</div>`;
    h += `<div class="proc-mod-row"><span class="proc-mod-label">Auto-blocks</span><span class="proc-mod-static">Merits of level ${esc(blockLevel)}</span></div>`;
    h += `<div class="proc-mod-row" style="margin-top:8px">`;
    if (blockConfirmed) {
      h += `<span class="dt-dim-italic" style="color:var(--gold2)">&#10003; Block confirmed</span>`;
    } else {
      h += `<button class="dt-btn proc-block-confirm-btn" data-proc-key="${esc(key)}">Confirm Block</button>`;
    }
    h += `</div>`;
    h += `</div>`;
  } else if (isAuto) {
    // Auto effect — no roll needed
    h += `<div class="proc-feed-right-section proc-proj-roll-card">`;
    h += `<div class="proc-mod-panel-title">Automatic</div>`;
    h += `<span class="dt-dim-italic">No roll required — effect applies automatically.</span>`;
    h += `</div>`;
  } else if (isRolled) {
    // Merit actions do not use dice pools — show automatic successes instead
    const autoSucc = dots != null ? dots : 0;
    h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
    h += `<div class="proc-mod-panel-title">Automatic Successes</div>`;
    h += `<div class="proc-mod-row"><span class="proc-mod-label">Base successes</span><span class="proc-mod-static">${autoSucc}</span></div>`;
    h += `</div>`; // mod panel
  } else if (formula === 'none') {
    // Staff — fixed effect, no roll
    h += `<div class="proc-feed-right-section proc-proj-roll-card">`;
    h += `<div class="proc-mod-panel-title">Fixed Effect</div>`;
    h += `<span class="dt-dim-italic">No dice pool — effect applies as stated.</span>`;
    h += `</div>`;
  }

  // ── Success Modifier ──
  if (isRolled) {
    const succMod = rev.succ_mod_manual !== undefined ? rev.succ_mod_manual : 0;
    const succStr = _fmtMod(succMod);
    h += `<div class="proc-proj-succ-panel" data-proc-key="${esc(key)}">`;
    h += `<div class="proc-mod-panel-title">Success Modifier</div>`;
    h += _renderTickerRow(key, 'Manual adj.', 'proc-succmod', succStr, succMod);
    h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Net modifier</span>`;
    h += `<span class="proc-proj-succ-total-val" data-proc-key="${esc(key)}">${succStr}</span>`;
    h += `</div>`;
    h += `</div>`;
  }

  // ── Status ──
  h += `<div class="proc-feed-right-section proc-feed-right-validation">`;
  h += `<div class="proc-mod-panel-title">Validation Status</div>`;
  const meritBtns = isAuto
    ? [['pending', 'Pending'], ['resolved', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']]
    : [['pending', 'Pending'], ['committed', 'Committed'], ['rolled', 'Rolled'], ['resolved', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']];
  h += _renderValStatusButtons(key, poolStatus, meritBtns);
  // Committed pool display
  const poolValidatedMerit = rev.pool_validated || '';
  h += `<div class="proc-feed-committed-pool" data-proc-key="${esc(key)}">${poolValidatedMerit ? esc(poolValidatedMerit) : '<span class="dt-dim-italic">Not yet committed</span>'}</div>`;
  if (poolValidatedMerit) h += `<button class="dt-btn dt-btn-sm proc-pool-clear-btn" data-proc-key="${esc(key)}">Clear Pool</button>`;
  const _isSO_merit = !!rev.second_opinion;
  h += `<button class="proc-second-opinion-btn${_isSO_merit ? ' active' : ''}" data-proc-key="${esc(key)}">${_isSO_merit ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
  h += `</div>`;

  h += `</div>`; // proc-feed-right
  return h;
}

function _renderSorceryRightPanel(entry, char, sub, rev) {
  const key         = entry.key;
  const poolStatus  = rev.pool_status || 'pending';
  const selectedRite = rev.rite_override || entry.riteName || '';
  const ritInfo      = selectedRite ? _getRiteInfo(selectedRite) : null;

  const isCruac      = (rev.sorc_tradition || entry.tradition) === 'Cruac';
  const mandUsed     = rev.ritual_mg_used || false;
  const mgMerit      = isCruac ? (char?.merits || []).find(m => m.name === 'Mandragora Garden') : null;
  const mgPool       = mgMerit ? (mgMerit.rating || mgMerit.dots || 0) + (mgMerit.bonus || 0) : 0;
  const mgDots       = (isCruac && mandUsed) ? mgPool : 0;
  const eqMod        = rev.pool_mod_equipment || 0;
  const eqStr        = _fmtMod(eqMod);
  const base         = ritInfo ? _computeRitePool(char, ritInfo.attr, ritInfo.skill, ritInfo.disc) : 0;
  const total        = base + 3 + mgDots + eqMod;

  const _sorcCommitted = poolStatus === 'committed';
  const _sorcDis = _sorcCommitted ? ' disabled' : '';

  let h = `<div class="proc-feed-right" data-proc-key="${esc(key)}">`;

  // ── Dice Pool Modifiers ──
  h += `<div class="proc-feed-mod-panel${_sorcCommitted ? ' proc-pool-committed' : ''}" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">Dice Pool Modifiers${_sorcCommitted ? ' <span class="proc-pool-committed-badge">[Committed]</span>' : ''}</div>`;

  // +3 Downtime bonus (always on)
  h += `<div class="proc-mod-row"><span class="proc-mod-label">Downtime bonus</span><span class="proc-mod-static">+3</span></div>`;

  // Mandragora Garden toggle (Cruac only — only if this character has the merit)
  if (isCruac && mgPool > 0) {
    h += `<div class="proc-mod-row">`;
    h += `<label class="proc-pool-rote-label proc-feed-rote-right">`;
    h += `<input type="checkbox" class="proc-ritual-mg-toggle" data-proc-key="${esc(key)}"${mandUsed ? ' checked' : ''}${_sorcDis}> Mandragora Garden (+${mgPool})`;
    h += `</label></div>`;
  }

  // Equipment / other ticker
  h += _renderTickerRow(key, 'Equipment / other', 'proc-equip-mod', eqStr, eqMod);

  h += `</div>`; // proc-feed-mod-panel

  // ── Roll card ──
  const ritRoll = rev.ritual_roll || null;
  const canRoll = !!ritInfo;
  h += _renderRollCard(key, ritRoll, canRoll ? total : null, {
    btnClass:        'proc-ritual-roll-btn',
    canRoll,
    noRollMsg:       'Select a rite first',
    targetSuccesses:  ritInfo?.target ?? null,
  });

  // ── Validation Status ──
  h += `<div class="proc-feed-right-section proc-feed-right-validation">`;
  h += `<div class="proc-mod-panel-title">Validation Status</div>`;
  h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['committed', 'Committed'], ['rolled', 'Rolled'], ['resolved', 'Resolved'], ['no_effect', 'No Effect'], ['skipped', 'Skip']]);
  // Committed pool display — shows computed total when rite is selected
  if (canRoll) {
    const poolExprSorc = `${base} + 3${mgDots ? ` + ${mgDots} (Mandragora)` : ''}${eqMod ? ` ${eqMod > 0 ? '+' : ''}${eqMod}` : ''} = ${total} dice`;
    h += `<div class="proc-feed-committed-pool" data-proc-key="${esc(key)}">${esc(poolExprSorc)}</div>`;
  } else {
    h += `<div class="proc-feed-committed-pool" data-proc-key="${esc(key)}"><span class="dt-dim-italic">Select a rite to compute pool</span></div>`;
  }
  const _isSO_sorc = !!rev.second_opinion;
  h += `<button class="proc-second-opinion-btn${_isSO_sorc ? ' active' : ''}" data-proc-key="${esc(key)}">${_isSO_sorc ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
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
  const eqStr = _fmtMod(eqMod);
  const poolModTotalStr = eqStr;

  const succMod = rev.succ_mod_manual !== undefined ? rev.succ_mod_manual : 0;
  const succStr = _fmtMod(succMod);

  let h = `<div class="proc-feed-right" data-proc-key="${esc(key)}">`;

  // ── Dice Pool Modifiers (equipment only) ──
  h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}" data-fg="">`;
  h += `<div class="proc-mod-panel-title">Dice Pool Modifiers</div>`;
  h += _renderTickerRow(key, 'Equipment / other', 'proc-equip-mod', eqStr, eqMod);
  h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Total</span>`;
  h += `<span class="proc-mod-total-val" data-proc-key="${esc(key)}">${poolModTotalStr}</span>`;
  h += `</div>`;
  h += `</div>`; // proc-feed-mod-panel

  // ── Investigation: Target Secrecy + Lead toggle (project investigate only) ──
  if (entry.actionType === 'investigate') {
    const invSecrecy = rev.inv_secrecy || '';
    const invHasLead = rev.inv_has_lead; // true | false | undefined
    const invRow     = invSecrecy ? (INVESTIGATION_MATRIX.find(r => r.type === invSecrecy) || null) : null;
    const innateMod  = invRow ? invRow.innate : 0;
    const noLeadMod  = invRow && invHasLead === false ? invRow.noLead : 0;
    const innateStr  = innateMod > 0 ? `+${innateMod}` : innateMod < 0 ? String(innateMod) : '';
    const innateCls  = innateMod > 0 ? ' proc-mod-pos' : innateMod < 0 ? ' proc-mod-neg' : ' proc-mod-muted';
    const noLeadStr  = noLeadMod < 0 ? String(noLeadMod) : '';

    h += `<div class="proc-feed-mod-panel" data-proc-key="${esc(key)}">`;
    h += `<div class="proc-mod-panel-title">Investigation</div>`;
    // Target Secrecy
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
    // Lead toggle
    h += `<div class="proc-mod-row">`;
    h += `<span class="proc-mod-label">Lead</span>`;
    h += `<div class="proc-inv-lead-btns">`;
    h += `<button class="proc-inv-lead-btn${invHasLead === true ? ' active' : ''}" data-proc-key="${esc(key)}" data-lead="true">Lead</button>`;
    h += `<button class="proc-inv-lead-btn${invHasLead === false ? ' active' : ''}" data-proc-key="${esc(key)}" data-lead="false">No Lead</button>`;
    h += `</div>`;
    if (noLeadStr) h += `<span class="proc-mod-val proc-mod-neg">${noLeadStr}</span>`;
    h += `</div>`;
    h += `</div>`; // proc-feed-mod-panel
  }

  // ── Success Modifier ──
  h += `<div class="proc-proj-succ-panel" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">Success Modifier</div>`;
  h += _renderTickerRow(key, 'Manual adj.', 'proc-succmod', succStr, succMod);
  h += `<div class="proc-mod-total-row"><span class="proc-mod-label">Net modifier</span>`;
  h += `<span class="proc-proj-succ-total-val" data-proc-key="${esc(key)}">${succStr}</span>`;
  h += `</div>`;
  h += `</div>`; // proc-proj-succ-panel

  // ── Contested Roll ──
  {
    const isContested   = !!rev.contested;
    const contestedChar = rev.contested_char        || '';
    const contestedPool = rev.contested_pool_label  || '';
    const contestedRoll = rev.contested_roll        || null;
    h += `<div class="proc-proj-contested-panel" data-proc-key="${esc(key)}">`;
    h += `<div class="proc-mod-panel-title">Contested Roll</div>`;
    h += `<button class="proc-contested-toggle${isContested ? ' active' : ''}" data-proc-key="${esc(key)}">${isContested ? 'Contested \u2014 ON' : 'Mark as Contested'}</button>`;
    if (isContested) {
      h += `<div class="proc-mod-row" style="margin-top:8px">`;
      h += `<span class="proc-mod-label">Opposing Char</span>`;
      h += `<select class="proc-contested-char-sel" data-proc-key="${esc(key)}">`;
      h += `<option value="">\u2014 Select \u2014</option>`;
      for (const c of [...characters].filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
        const val = sortName(c);
        const lbl = c.moniker || c.name;
        h += `<option value="${esc(val)}"${val === contestedChar ? ' selected' : ''}>${esc(lbl)}</option>`;
      }
      h += `</select>`;
      h += `</div>`;
      h += `<div class="proc-mod-row">`;
      h += `<span class="proc-mod-label">Resistance Pool</span>`;
      h += `<input type="text" class="proc-contested-pool-input" data-proc-key="${esc(key)}" placeholder="e.g. Resolve + BP = 4" value="${esc(contestedPool)}" />`;
      h += `</div>`;
      if (contestedPool) {
        const defBtnLabel = contestedRoll ? 'Re-roll Defence' : 'Roll Defence';
        h += `<button class="dt-btn proc-contested-roll-btn" data-proc-key="${esc(key)}">${defBtnLabel}</button>`;
        if (contestedRoll) {
          const dStr = _formatDiceString(contestedRoll.dice_string);
          h += `<div class="proc-proj-roll-result">${esc(dStr)} ${contestedRoll.successes} defence success${contestedRoll.successes !== 1 ? 'es' : ''}</div>`;
        }
      }
    }
    h += `</div>`;
  }

  // ── Roll toggles: Rote, 9-Again, 8-Again ──
  const isRote        = rev.rote        || false;
  const eightAgainState = rev.eight_again || false;
  // Auto-detect nine_again from the character's validated skill — only when not explicitly saved
  const nineAgainState = _resolveNineAgainState(rev, poolValidated, char);
  h += `<div class="proc-feed-right-section proc-feed-toggles-row">`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-pool-rote" data-proc-key="${esc(key)}"${isRote ? ' checked' : ''}> Rote Action</label>`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-proj-9a" data-proc-key="${esc(key)}"${nineAgainState ? ' checked' : ''}> 9-Again</label>`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-proj-8a" data-proc-key="${esc(key)}"${eightAgainState ? ' checked' : ''}> 8-Again</label>`;
  h += `</div>`;

  // ── Validation Status ──
  h += `<div class="proc-feed-right-section proc-feed-right-validation">`;
  h += `<div class="proc-mod-panel-title">Validation Status</div>`;
  h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['committed', 'Committed'], ['rolled', 'Rolled'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed'], ['skipped', 'Skip']]);
  // Committed pool expression with active specs
  const displayPool = _augmentPoolWithSpecs(poolValidated, rev.active_feed_specs || [], char, nineAgainState);
  h += `<div class="proc-feed-committed-pool" data-proc-key="${esc(key)}">${displayPool ? esc(displayPool) : '<span class="dt-dim-italic">Not yet committed</span>'}</div>`;
  // Validation notation: show active flags + validator chip when validated
  if (poolStatus === 'validated') {
    const notes = [];
    if (isRote) notes.push('Rote');
    if (nineAgainState) notes.push('9-Again');
    if (eightAgainState) notes.push('8-Again');
    if (notes.length > 0) {
      h += `<div class="proc-proj-val-notation">${esc(notes.join(' \u00B7 '))}</div>`;
    }
    if (rev.pool_validated_by) {
      h += `<div class="proc-validated-chip">[Validated \u00B7 ${esc(rev.pool_validated_by)}]</div>`;
    }
  }
  if (poolValidated) h += `<button class="dt-btn dt-btn-sm proc-pool-clear-btn" data-proc-key="${esc(key)}">Clear Pool</button>`;
  const _isSO_proj = !!rev.second_opinion;
  h += `<button class="proc-second-opinion-btn${_isSO_proj ? ' active' : ''}" data-proc-key="${esc(key)}">${_isSO_proj ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
  h += `</div>`;

  // ── Roll card ──
  const projRoll    = rev.roll || null;
  const showRollBtn = poolStatus === 'committed' || poolStatus === 'validated' || !!projRoll;
  h += _renderRollCard(key, projRoll, null, {
    btnClass:        'proc-proj-roll-btn',
    btnDataAttrs:    ` data-pool-validated="${esc(poolValidated)}"`,
    canRoll:          showRollBtn,
    noRollMsg:       'Validate pool first',
    successModifier:  succMod,
    contestedRoll:    rev.contested_roll || null,
  });

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
  const eqStr = _fmtMod(eqMod);
  const poolModTotal = (fgDice ?? 0) + initUnskilled + eqMod;
  const poolModTotalStr = _fmtMod(poolModTotal);

  // fgDice data attr: '' when char null (so live update can detect "unknown")
  const fgDataAttr = fgDice !== null ? String(fgDice) : '';
  const fgDisplay  = fgDice !== null ? (fgDice > 0 ? `+${fgDice}` : String(fgDice)) : '\u2014';

  let h = `<div class="proc-feed-right" data-proc-key="${esc(key)}">`;

  // ── Dice Pool Modifiers ──
  h += `<div class="proc-feed-right-section proc-feed-mod-panel" data-proc-key="${esc(key)}" data-fg="${esc(fgDataAttr)}">`;
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
  const oofVitae = hasOoF ? effectiveInvictusStatus(char) : 0;

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
  // No territory resolved = Barrens: −4 ambience
  if (ambienceVitae === null) {
    ambienceVitae = -4;
    bestTerrLabel = 'Barrens';
  }

  const ghoulCount = (char?.merits || []).filter(m =>
    m.name === 'Retainer' && (m.area || m.qualifier || '').toLowerCase().includes('ghoul')
  ).length;

  const vitaeMod  = rev.vitae_mod_manual !== undefined ? rev.vitae_mod_manual : 0;
  const feedSubForRite = submissions.find(s => s._id === entry.subId);
  const computedRiteCost = feedSubForRite ? _computeRiteVitaeCost(feedSubForRite, char) : 0;
  const vitaeRite = rev.vitae_rite_cost  !== undefined ? rev.vitae_rite_cost  : computedRiteCost;
  const wpCost = feedSubForRite ? _computeRiteWpCost(feedSubForRite, char) : 0;
  const manStr    = _fmtMod(vitaeMod);

  const autoSum = (herdVitae ?? 0) + oofVitae + (ambienceVitae ?? 0) - ghoulCount;
  const finalVitae = Math.max(0, autoSum + vitaeMod - vitaeRite);

  // data attrs for live recalculation
  const herdData      = herdVitae     !== null ? String(herdVitae)    : '';
  const ambienceData  = ambienceVitae !== null ? String(ambienceVitae): '';

  h += `<div class="proc-feed-right-section proc-feed-vitae-panel" data-proc-key="${esc(key)}" data-herd="${esc(herdData)}" data-oof="${oofVitae}" data-ambience="${esc(ambienceData)}" data-ghouls="${ghoulCount}" data-terr-label="${esc(bestTerrLabel || '')}" data-rite-cost="${vitaeRite}" data-manual="${vitaeMod}" data-total-bonus="${finalVitae}">`;
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

  // Theban WP cost — informational only, does not affect vitae total
  if (wpCost > 0) {
    h += `<div class="proc-mod-row">`;
    h += `<span class="proc-mod-label">Theban Sorcery <span class="proc-mod-muted">(vitae unaffected)</span></span>`;
    h += `<span class="proc-mod-val proc-mod-neg">\u2212${wpCost}\u202FWP</span>`;
    h += `</div>`;
  }

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
  const nineAgainStateFeed = _resolveNineAgainState(rev, poolValidated, char);
  h += `<div class="proc-feed-right-section proc-feed-toggles-row">`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-pool-rote" data-proc-key="${esc(key)}"${isRote ? ' checked' : ''}> Rote Action</label>`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-proj-9a" data-proc-key="${esc(key)}"${nineAgainStateFeed ? ' checked' : ''}> 9-Again</label>`;
  h += `<label class="proc-pool-rote-label proc-feed-rote-right"><input type="checkbox" class="proc-proj-8a" data-proc-key="${esc(key)}"${eightAgainStateFeed ? ' checked' : ''}> 8-Again</label>`;
  h += `</div>`;

  // ── Validation Status ──
  const poolStatus = rev.pool_status || 'pending';
  h += `<div class="proc-feed-right-section proc-feed-right-validation">`;
  h += `<div class="proc-mod-panel-title">Validation Status</div>`;
  h += _renderValStatusButtons(key, poolStatus, [['pending', 'Pending'], ['committed', 'Committed'], ['rolled', 'Rolled'], ['validated', 'Validated'], ['no_feed', 'No Valid Feeding']]);
  // Committed pool expression display — augmented with active spec names if any
  const displayPool = _augmentPoolWithSpecs(poolValidated, rev.active_feed_specs || [], char, nineAgainStateFeed);
  h += `<div class="proc-feed-committed-pool" data-proc-key="${esc(key)}">${displayPool ? esc(displayPool) : '<span class="dt-dim-italic">Not yet committed</span>'}</div>`;
  if (poolValidated) {
    const feedNotes = [];
    if (isRote) feedNotes.push('Rote');
    if (nineAgainStateFeed) feedNotes.push('9-Again');
    if (eightAgainStateFeed) feedNotes.push('8-Again');
    if (feedNotes.length > 0) h += `<div class="proc-proj-val-notation">${esc(feedNotes.join(' \u00B7 '))}</div>`;
    if (poolStatus === 'validated' && rev.pool_validated_by) {
      h += `<div class="proc-validated-chip">[Validated \u00B7 ${esc(rev.pool_validated_by)}]</div>`;
    }
    h += `<button class="dt-btn dt-btn-sm proc-pool-clear-btn" data-proc-key="${esc(key)}">Clear Pool</button>`;
  }
  const _isSO_feed = !!rev.second_opinion;
  h += `<button class="proc-second-opinion-btn${_isSO_feed ? ' active' : ''}" data-proc-key="${esc(key)}">${_isSO_feed ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;

  h += `</div>`;

  // ── Roll card ──
  const feedRollObj = feedSub?.feeding_roll || null;
  const showFeedRollBtn = poolStatus === 'committed' || poolStatus === 'rolled' || poolStatus === 'validated' || !!feedRollObj;
  h += _renderRollCard(key, feedRollObj, null, {
    btnClass:  'proc-feed-roll-btn',
    btnDataAttrs: ` data-sub-id="${esc(entry.subId)}" data-rote="${isRote}"`,
    canRoll:   showFeedRollBtn,
    noRollMsg: 'Commit pool first',
  });

  // ── DTFP-5: feed-violence ST override ──
  // Player declared (read-only) + ST override dropdown.
  const playerVi   = feedSub?.responses?.feed_violence || '';
  const stViOverride = feedSub?.st_review?.feed_violence_st_override || '';
  const _viLabel = (v) => v === 'kiss' ? 'The Kiss (subtle)' : v === 'violent' ? 'Violent' : '';
  h += `<div class="proc-feed-mod-panel proc-feed-violence-block" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">Feed declaration</div>`;
  h += `<div class="proc-mod-row"><span class="proc-mod-label">Player declared</span><span class="proc-feed-violence-val">${esc(_viLabel(playerVi)) || '<em>Not specified</em>'}</span></div>`;
  h += `<div class="proc-mod-row"><span class="proc-mod-label">ST override</span>`;
  h += `<select class="proc-feed-violence-st-override" data-sub-id="${esc(entry.subId)}">`;
  h += `<option value="">No override</option>`;
  h += `<option value="kiss"${stViOverride === 'kiss' ? ' selected' : ''}>The Kiss (subtle)</option>`;
  h += `<option value="violent"${stViOverride === 'violent' ? ' selected' : ''}>Violent</option>`;
  h += `</select>`;
  h += `</div>`;
  h += `</div>`;

  h += `</div>`; // proc-feed-right
  return h;
}

/**
 * Resolve a character object from a submission.
 * Tries character_id first, then character_name via charMap.
 */
function _findCharForSub(sub) {
  if (!sub) return null;
  const charIdStr   = sub.character_id ? String(sub.character_id) : null;
  const charNameKey = (sub.character_name || '').toLowerCase().trim();
  return (charIdStr && characters.find(ch => String(ch._id) === charIdStr)) ||
         charMap.get(charNameKey) || null;
}

/**
 * Renders the standard roll card section for a right-panel.
 * @param {string} key          - proc entry key
 * @param {object|null} roll    - the roll object (rev.roll / rev.ritual_roll etc.)
 * @param {number|null} poolTotal - total dice to display in card title (null = omit)
 * @param {object} opts
 *   @param {string}  opts.btnClass        - CSS class on the Roll button
 *   @param {string}  opts.btnDataAttrs    - extra data-* attrs string for the button
 *   @param {boolean} opts.canRoll         - whether the Roll button should appear (default true)
 *   @param {string}  opts.noRollMsg       - hint shown when canRoll is false
 *   @param {number}  opts.targetSuccesses - sorcery: target for potency/fail display
 */
function _renderRollCard(key, roll, poolTotal, opts = {}) {
  const {
    btnClass        = 'proc-proj-roll-btn',
    btnDataAttrs    = '',
    canRoll         = true,
    noRollMsg       = 'No roll available',
    targetSuccesses = null,
    successModifier = 0,   // DTR-1: succ_mod_manual from rev
    contestedRoll   = null, // DTR-2: defender roll object
  } = opts;

  const poolLabel   = (poolTotal != null && canRoll) ? ` \u2014 ${poolTotal} dice` : '';
  const targetLabel = (targetSuccesses != null && canRoll) ? ` \u00b7 target ${targetSuccesses}` : '';

  let h = `<div class="proc-feed-right-section proc-proj-roll-card">`;
  h += `<div class="proc-mod-panel-title">Roll${poolLabel}${targetLabel}</div>`;

  if (canRoll) {
    const btnLabel = roll ? 'Re-roll' : 'Roll';
    h += `<button class="dt-btn ${esc(btnClass)}" data-proc-key="${esc(key)}"${btnDataAttrs}>${btnLabel}</button>`;
    if (roll) {
      const dStr   = _formatDiceString(roll.dice_string);
      const suc    = roll.successes ?? 0;
      const excTag = roll.exceptional ? ' \u00b7 Exceptional' : '';
      if (targetSuccesses != null) {
        const hit     = suc >= targetSuccesses;
        const failCls = hit ? '' : ' proc-ritual-fail';
        const resText = hit ? ` \u2014 Potency ${suc}` : ' \u2014 no effect';
        h += `<div class="proc-proj-roll-result${failCls}">${esc(dStr)} ${suc} success${suc !== 1 ? 'es' : ''}${resText}${excTag}</div>`;
      } else {
        const defSuc  = contestedRoll ? (contestedRoll.successes ?? 0) : 0;
        const net     = suc - defSuc + successModifier;
        const defPart = contestedRoll ? ` \u2212 ${defSuc} def` : '';
        const manPart = successModifier !== 0 ? (successModifier > 0 ? ` +${successModifier}` : ` ${successModifier}`) : '';
        const netCls  = (contestedRoll || successModifier !== 0) && net <= 0 ? ' proc-roll-net-zero' : '';
        const netExc  = (contestedRoll || successModifier !== 0) && net >= 5 ? ' \u00b7 Exceptional' : excTag;
        if (contestedRoll || successModifier !== 0) {
          const attLabel = contestedRoll ? 'att' : `success${suc !== 1 ? 'es' : ''}`;
          h += `<div class="proc-proj-roll-result${netCls}">${esc(dStr)} ${suc} ${attLabel}${defPart}${manPart} = ${net} net${netExc}</div>`;
        } else {
          h += `<div class="proc-proj-roll-result">${esc(dStr)} ${suc} success${suc !== 1 ? 'es' : ''}${excTag}</div>`;
        }
      }
    }
  } else {
    h += `<span class="dt-dim-italic dt-hint">${esc(noRollMsg)}</span>`;
  }

  h += `</div>`;
  return h;
}

/**
 * Renders the action-type recategorisation row (dropdown + conditional target selectors).
 * Handles the full recat row content for both project and merit entries.
 *
 * For merit entries, also renders the merit-link dropdown and territory pills that appear
 * within the same row. For project entries, renders territory pills and the original-type badge.
 *
 * @param {object} entry  - queue entry
 * @param {object} rev    - review object for the entry
 * @param {object|null} char - resolved character (used for hide_protect merit list and merit-link)
 */
function _renderActionTypeRow(entry, rev, char) {
  const key        = entry.key;
  const actionType = entry.actionType;
  const isMerit    = entry.source === 'merit';
  let h = '';

  h += `<div class="proc-recat-row">`;
  h += `<span class="proc-feed-lbl">Action Type</span>`;
  h += `<select class="proc-recat-select" data-proc-key="${esc(key)}">`;
  for (const [val, lbl] of Object.entries(ACTION_TYPE_LABELS)) {
    h += `<option value="${esc(val)}"${actionType === val ? ' selected' : ''}>${esc(lbl)}</option>`;
  }
  h += `</select>`;

  // Project only: show original action type badge when overridden
  if (!isMerit) {
    const isOverridden = entry.originalActionType && entry.originalActionType !== actionType;
    if (isOverridden) {
      h += `<span class="proc-recat-original">Player: ${esc(ACTION_TYPE_LABELS[entry.originalActionType] || entry.originalActionType)}</span>`;
    }
  }

  if (actionType === 'investigate') {
    const _invT = rev.investigate_target_char || '';
    h += `<span class="proc-feed-lbl">Target</span>`;
    h += `<div class="proc-investigate-target-list">`;
    for (const c of [...characters].filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
      const lbl = sortName(c).replace(/\b\w/g, l => l.toUpperCase());
      const sel = c.name === _invT ? ' checked' : '';
      h += `<label class="proc-conn-char-lbl"><input type="radio" class="proc-inv-target-radio" name="proc-inv-target-${esc(key)}" data-proc-key="${esc(key)}" value="${esc(c.name || '')}"${sel}> ${esc(lbl)}</label>`;
    }
    h += `</div>`;
    // Add territory pills for project-based investigate (not merit)
    if (!isMerit) {
      const _invSub = submissions.find(s => s._id === entry.subId);
      const _invCtx = String(entry.actionIdx);
      const _invTid = _invSub?.st_review?.territory_overrides?.[_invCtx] || '';
      h += _renderInlineTerrPills(entry.subId, _invCtx, _invTid);
    }
  } else if (actionType === 'attack') {
    const _atkT = rev.attack_target_char || '';
    h += `<span class="proc-feed-lbl">Target</span>`;
    h += `<select class="proc-recat-select proc-attack-char-sel" data-proc-key="${esc(key)}">`;
    h += `<option value="">\u2014 Select \u2014</option>`;
    for (const c of [...characters].sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
      const lbl = sortName(c).replace(/\b\w/g, l => l.toUpperCase());
      h += `<option value="${esc(c.name || '')}"${c.name === _atkT ? ' selected' : ''}>${esc(lbl)}</option>`;
    }
    h += `</select>`;
  } else if (actionType === 'hide_protect' && isMerit) {
    const _protName  = rev?.protected_merit_name      ?? '';
    const _protQual  = rev?.protected_merit_qualifier ?? '';
    const _allMerits = (char?.merits || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    h += `<span class="proc-feed-lbl">Protects</span>`;
    h += `<select class="proc-recat-select proc-prot-merit-sel" data-proc-key="${esc(key)}">`;
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
  } else if (actionType === 'ambience_increase' || actionType === 'ambience_decrease') {
    if (!isMerit) {
      const _ambiSub = submissions.find(s => s._id === entry.subId);
      const _ambiCtx = String(entry.actionIdx);
      const _ambiTid = _ambiSub?.st_review?.territory_overrides?.[_ambiCtx] || '';
      h += _renderInlineTerrPills(entry.subId, _ambiCtx, _ambiTid);
    }
    // merit ambience: territory handled via isAlliesAction pills below
  } else if (!isMerit) {
    // All other project action types get territory pills inline
    const _projCtx = String(entry.actionIdx);
    const _projSub = submissions.find(s => s._id === entry.subId);
    const _projTid = _projSub?.st_review?.territory_overrides?.[_projCtx] || '';
    h += _renderInlineTerrPills(entry.subId, _projCtx, _projTid);
  }

  // Merit: merit-link dropdown (allies/status/retainer/contacts/staff) + territory pills
  if (isMerit) {
    if (['allies', 'status', 'retainer', 'contacts', 'staff'].includes(entry.meritCategory)) {
      const _linkedQual   = rev?.linked_merit_qualifier ?? entry.meritQualifier ?? '';
      const _meritNameKey = (entry.meritLabel || '').toLowerCase();
      const _charMerits   = (char?.merits || [])
        .filter(m => {
          const mName = (m.name || '').toLowerCase();
          return mName === _meritNameKey || _meritNameKey.includes(mName) || mName.includes(_meritNameKey);
        })
        .sort((a, b) => (a.qualifier || a.area || '').localeCompare(b.qualifier || b.area || ''));
      const _isAmb = actionType === 'ambience_increase' || actionType === 'ambience_decrease';
      const _hasHWV = _isAmb && (char?.merits || []).some(m => /honey with vinegar/i.test(m.name || ''));
      h += `<span class="proc-feed-lbl">Merit</span>`;
      h += `<select class="proc-recat-select proc-merit-link-sel" data-proc-key="${esc(key)}">`;
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
    // Territory pills — allies/status/retainer actions
    if (entry.isAlliesAction) {
      const _mCtx = `allies_${entry.actionIdx}`;
      const _mSub = submissions.find(s => s._id === entry.subId);
      const _mTid = _mSub?.st_review?.territory_overrides?.[_mCtx] || '';
      h += _renderInlineTerrPills(entry.subId, _mCtx, _mTid);
    }
  }

  h += `</div>`;

  // Attack merit dropdown (second row, shown for both project and merit)
  if (actionType === 'attack') {
    const _atkChar  = characters.find(c => c.name === (rev.attack_target_char || '')) || null;
    const _atkMerit = rev.attack_target_merit || '';
    h += `<div class="proc-recat-row proc-recat-row-tight">`;
    h += `<span class="proc-feed-lbl">Merit</span>`;
    h += `<select class="proc-recat-select proc-attack-merit-sel" data-proc-key="${esc(key)}">`;
    h += `<option value="">\u2014 Select merit \u2014</option>`;
    if (_atkChar) {
      for (const m of [...(_atkChar.merits || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''))) {
        const mRating = (m.rating || m.dots || 0) + (m.bonus || 0);
        const mQual   = m.qualifier ? ` (${m.qualifier})` : '';
        h += `<option value="${esc(m.name || '')}"${m.name === _atkMerit ? ' selected' : ''}>${esc(m.name || '')}${esc(mQual)} \u25CF${mRating}</option>`;
      }
    }
    h += `</select>`;
    h += `</div>`;
  }

  return h;
}

/** Render the expanded detail panel for a single action row. */
function renderActionPanel(entry, review) {
  const rev = review || {};
  const poolStatus    = rev.pool_status    || 'pending';

  // ── Travel Review — simple layout, no pool builder ──
  if (entry.source === 'travel') {
    const discretion = poolStatus; // 'obvious' | 'neutral' | 'subtle' | 'pending'
    let h = `<div class="proc-action-detail proc-travel-detail" data-proc-key="${esc(entry.key)}">`;
    h += `<div class="proc-travel-desc">${esc(entry.travelDesc || entry.description)}</div>`;
    h += `<div class="proc-travel-btns">`;
    for (const [val, lbl] of [['obvious', 'Obvious'], ['neutral', 'Neutral'], ['subtle', 'Subtle']]) {
      h += `<button class="proc-travel-btn${discretion === val ? ' active' : ''}" data-proc-key="${esc(entry.key)}" data-discretion="${val}">${lbl}</button>`;
    }
    h += `</div>`;
    h += `</div>`;
    return h;
  }

  const poolPlayer    = rev.pool_player    || entry.poolPlayer || '';
  const poolValidated = rev.pool_validated || '';
  const thread            = rev.notes_thread        || [];
  const feedback          = rev.player_feedback     || '';
  const playerFacingNote  = rev.player_facing_note  || '';
  const isSorcery        = entry.source === 'sorcery'
                        || (entry.source === 'st_created' && entry.actionType === 'sorcery');
  const isAmbienceMerit  = entry.source === 'merit' && (entry.actionType === 'ambience_increase' || entry.actionType === 'ambience_decrease');

  // Single character lookup — resolved once for all source types
  const entrySub  = submissions.find(s => s._id === entry.subId) || null;
  const entryChar = _findCharForSub(entrySub);

  // Source-specific aliases (used by downstream renderers and pool builders)
  const feedSub      = entry.source === 'feeding' ? entrySub  : null;
  const feedChar     = entry.source === 'feeding' ? entryChar : null;
  const projSub      = entry.source === 'project' ? entrySub  : null;
  const projChar     = entry.source === 'project' ? entryChar : null;
  const sorcSub      = isSorcery               ? entrySub  : null;
  const sorcChar     = isSorcery               ? entryChar : null;
  const meritEntSub  = entry.source === 'merit' ? entrySub  : null;
  const meritEntChar = entry.source === 'merit' ? entryChar : null;

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
      // For rote feed projects, show player's nominated feeding territories
      if (entry.actionType === 'feed') {
        const _nomText = _playerFeedTerrsText(projSub2);
        if (_nomText) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Territories</span> ${esc(_nomText)}</div>`;
      }
      // Characters Involved (read-only — structural, not editable here)
      if (entry.projCast) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Characters Involved</span> ${esc(entry.projCast)}</div>`;
    }

    // ── Action type recategorisation ──
    h += _renderActionTypeRow(entry, rev, projChar);
  }

  // ── Action type recategorisation for merit/sphere entries ──
  if (entry.source === 'merit' && entry.meritCategory !== 'contacts') {
    h += _renderActionTypeRow(entry, rev, meritEntChar);
  }
  if (entry.source === 'merit') {
    // Contacts target + info type + subject fields
    if (entry.meritCategory === 'contacts') {
      const _ciTarget   = rev.contacts_target    || '';
      const _ciInfoType = rev.contacts_info_type || '';
      const _ciSubject  = rev.contacts_subject   || '';
      h += `<div class="proc-recat-row proc-recat-row-tight">`;
      h += `<span class="proc-feed-lbl">Target</span>`;
      h += `<input type="text" class="proc-detail-input proc-contacts-target-input" data-proc-key="${esc(entry.key)}" value="${esc(_ciTarget)}" placeholder="Person or group\u2026">`;
      h += `</div>`;
      h += `<div class="proc-recat-row proc-recat-row-spaced">`;
      h += `<span class="proc-feed-lbl">Info Type</span>`;
      h += `<select class="proc-recat-select proc-contacts-info-type-sel" data-proc-key="${esc(entry.key)}"><option value="">\u2014 Select \u2014</option>${['Public', 'Internal', 'Confidential', 'Restricted'].map(t => `<option value="${t}"${_ciInfoType === t ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select>`;
      h += `</div>`;
      h += `<div class="proc-recat-row proc-recat-row-tight">`;
      h += `<span class="proc-feed-lbl">Subject</span>`;
      h += `<input type="text" class="proc-detail-input proc-contacts-subject-input" data-proc-key="${esc(entry.key)}" value="${esc(_ciSubject)}" placeholder="Topic or sphere\u2026">`;
      h += `</div>`;
    }
    // Patrol/Scout outcome fields
    if (entry.actionType === 'patrol_scout') {
      const _patObs   = rev.patrol_observed     || '';
      const _patLevel = rev.patrol_detail_level || '';
      const _patLevels = ['1 \u2014 Vague', '2', '3', '4', '5+ \u2014 Detailed'];
      h += `<div class="proc-recat-row proc-recat-row-spaced">`;
      h += `<span class="proc-feed-lbl">Detail Level</span>`;
      h += `<select class="proc-recat-select proc-patrol-detail-sel" data-proc-key="${esc(entry.key)}"><option value="">\u2014 Select \u2014</option>${_patLevels.map(l => `<option value="${l}"${_patLevel === l ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
      h += `</div>`;
      h += `<div class="proc-recat-row proc-recat-row-tight">`;
      h += `<span class="proc-feed-lbl">Observed</span>`;
      h += `<textarea class="proc-detail-ta proc-patrol-observed-ta" data-proc-key="${esc(entry.key)}" rows="3" placeholder="What was observed\u2026">${esc(_patObs)}</textarea>`;
      h += `</div>`;
    }
    // Support target selector
    if (entry.actionType === 'support') {
      const _supportKey = rev.support_target_key || '';
      const _queueEntries = _procQueueMap ? [..._procQueueMap.values()] : [];
      h += `<div class="proc-recat-row proc-recat-row-spaced">`;
      h += `<span class="proc-feed-lbl">Supporting</span>`;
      h += `<select class="proc-recat-select proc-support-target-sel" data-proc-key="${esc(entry.key)}">`;
      h += `<option value="">\u2014 Select action \u2014</option>`;
      for (const qe of _queueEntries) {
        if (qe.key === entry.key) continue;
        const qLabel = `${qe.charName} \u2014 ${qe.label}`;
        h += `<option value="${esc(qe.key)}"${_supportKey === qe.key ? ' selected' : ''}>${esc(qLabel)}</option>`;
      }
      h += `</select>`;
      h += `</div>`;
    }
    // Rumour outcome fields
    if (entry.actionType === 'rumour') {
      const _rumCont  = rev.rumour_content      || '';
      const _rumLevel = rev.rumour_detail_level || '';
      const _rumLevels = ['1 \u2014 Vague', '2', '3', '4', '5+ \u2014 Detailed'];
      h += `<div class="proc-recat-row proc-recat-row-spaced">`;
      h += `<span class="proc-feed-lbl">Detail Level</span>`;
      h += `<select class="proc-recat-select proc-rumour-detail-sel" data-proc-key="${esc(entry.key)}"><option value="">\u2014 Select \u2014</option>${_rumLevels.map(l => `<option value="${l}"${_rumLevel === l ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
      h += `</div>`;
      h += `<div class="proc-recat-row proc-recat-row-tight">`;
      h += `<span class="proc-feed-lbl">Rumour Surfaced</span>`;
      h += `<textarea class="proc-detail-ta proc-rumour-content-ta" data-proc-key="${esc(entry.key)}" rows="3" placeholder="What was heard\u2026">${esc(_rumCont)}</textarea>`;
      h += `</div>`;
    }
    // DTSR-5: Outcome zone, relocated from right sidebar (also new on rolled merits)
    h += _renderMeritOutcomeZone(entry, rev);
  }

  // ── Sorcery details card (editable) — above connected characters ──
  if (isSorcery) {
    const sorcRawNotes    = sorcSub?.responses?.[`sorcery_${entry.actionIdx}_notes`]   || '';
    const sorcRawTargets  = normaliseSorceryTargets(sorcSub?.responses?.[`sorcery_${entry.actionIdx}_targets`]) || entry.targetsText || '';
    const targetsVal      = rev.sorc_targets    ?? sorcRawTargets;
    const blobAsNotes     = (entry.riteName && entry.riteName.length > 60) ? entry.riteName : '';
    const notesVal        = rev.sorc_notes      ?? (sorcRawNotes || blobAsNotes);
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
    if (notesVal)         h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Notes</span> ${esc(notesVal)}</div>`;
    if (entry.poolPlayer) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Player's Pool</span> ${esc(entry.poolPlayer)}</div>`;
    h += `</div>`;
    // Edit mode (hidden by default)
    h += `<div class="proc-feed-desc-edit" style="display:none">`;
    // Tradition selector
    const _tradOpts = ['Cruac', 'Theban Sorcery'];
    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Tradition</span><select class="proc-recat-select proc-sorc-tradition-sel" data-proc-key="${esc(entry.key)}">${_tradOpts.map(o => `<option value="${o}"${traditionVal === o ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
    // Rite dropdown — same structure as right-panel rite selector
    {
      const _allRites = (_getRulesDB() || []).filter(r => r.category === 'rite');
      const _tradOrder = ['Cruac', 'Theban'];
      const _byTrad = {};
      for (const r of _allRites) { const t = r.parent || 'Unknown'; if (!_byTrad[t]) _byTrad[t] = []; _byTrad[t].push(r); }
      const _tradKeys = [..._tradOrder.filter(t => _byTrad[t]), ...Object.keys(_byTrad).filter(t => !_tradOrder.includes(t))];
      let _riteOpts = `<option value="">\u2014 Select Rite \u2014</option>`;
      for (const trad of _tradKeys) {
        const grp = (_byTrad[trad] || []).slice().sort((a, b) => (a.rank || 0) - (b.rank || 0) || a.name.localeCompare(b.name));
        _riteOpts += `<optgroup label="${esc(trad)}">${grp.map(r => `<option value="${esc(r.name)}"${riteVal === r.name ? ' selected' : ''}>${esc(r.name)} (Level ${r.rank || _getRiteLevel(r.name) || '?'})</option>`).join('')}</optgroup>`;
      }
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Rite</span><select class="proc-recat-select proc-sorc-rite-sel" data-proc-key="${esc(entry.key)}">${_riteOpts}</select></div>`;
    }
    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Notes</span><textarea class="proc-detail-ta proc-sorc-notes-input" data-proc-key="${esc(entry.key)}" rows="3">${esc(notesVal)}</textarea></div>`;
    h += `<div class="proc-feed-desc-actions"><button class="dt-btn proc-sorc-desc-save-btn" data-proc-key="${esc(entry.key)}">Save</button><button class="dt-btn proc-feed-desc-cancel-btn" data-proc-key="${esc(entry.key)}">Cancel</button></div>`;
    h += `</div>`;
    h += `</div>`;
  }

  // ── Targets — wide checkbox section, above connected characters ──
  if (isSorcery) {
    const _tRaw         = normaliseSorceryTargets(sorcSub?.responses?.[`sorcery_${entry.actionIdx}_targets`]) || entry.targetsText || '';
    const _tVal         = rev.sorc_targets ?? _tRaw;
    const _tActiveChars = characters.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
    const _tSelected    = new Set((_tVal || '').split(',').map(s => s.trim()).filter(Boolean));
    h += `<div class="proc-connected-section">`;
    h += `<div class="proc-detail-label">Targets</div>`;
    h += `<div class="proc-connected-list">`;
    for (const c of _tActiveChars) {
      const n = sortName(c);
      const lbl = c.moniker || c.name;
      const chk = _tSelected.has(n) ? ' checked' : '';
      h += `<label class="proc-conn-char-lbl"><input type="checkbox" class="proc-sorc-target-chk" data-proc-key="${esc(entry.key)}" data-char-name="${esc(n)}"${chk}> ${esc(lbl)}</label>`;
    }
    h += `</div></div>`;
  }

  // ── Connected Characters (project + merit + sorcery) — inside left column, below description ──
  // Ambience merit actions are level-based automatic effects; no connected characters needed
  if (!isAmbienceMerit && (entry.source === 'project' || entry.source === 'merit' || isSorcery)) {
    const connectedChars = rev.connected_chars || [];
    const otherChars = characters
      .filter(c => !c.retired)
      .map(c => ({ key: sortName(c), label: c.moniker || c.name }))
      .filter(({ key }) => key !== entry.charName.toLowerCase())
      .sort((a, b) => a.key.localeCompare(b.key));
    if (otherChars.length > 0) {
      h += `<div class="proc-connected-section">`;
      h += `<div class="proc-detail-label">Connected Characters</div>`;
      h += `<div class="proc-connected-list">`;
      for (const { key, label } of otherChars) {
        const chk = connectedChars.includes(key) ? ' checked' : '';
        h += `<label class="proc-conn-char-lbl"><input type="checkbox" class="proc-conn-char-chk" data-proc-key="${esc(entry.key)}" data-char-name="${esc(key)}"${chk}> ${esc(label)}</label>`;
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
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Name</span><input type="text" class="proc-detail-input proc-feed-name-input" data-proc-key="${esc(entry.key)}" value="${esc(nameVal)}" placeholder="e.g. The Thirsty Blade, quiet back alley\u2026"></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Description</span><textarea class="proc-detail-ta proc-feed-desc-ta" data-proc-key="${esc(entry.key)}" rows="3" placeholder="How does the character typically feed? What\u2019s the cover story?">${esc(descVal)}</textarea></div>`;
      const _btOpts = ['Human', 'Animal', 'Kindred', 'Ghoul'];
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Blood Type</span><select class="proc-recat-select proc-feed-blood-sel" data-proc-key="${esc(entry.key)}">${_btOpts.map(o => `<option value="${o}"${bloodTypeVal === o ? ' selected' : ''}>${o}</option>`).join('')}</select></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Player's Pool</span><input type="text" class="proc-detail-input proc-feed-pool-input" data-proc-key="${esc(entry.key)}" value="${esc(poolPlayer || playerPoolStr)}"></div>`;
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Bonuses</span><input type="text" class="proc-detail-input proc-feed-bonuses-input" data-proc-key="${esc(entry.key)}" value="${esc(bonusesVal)}" placeholder="e.g. Herd +2, Rote"></div>`;
      h += `<div class="proc-feed-desc-actions"><button class="dt-btn proc-feed-desc-save-btn" data-proc-key="${esc(entry.key)}">Save</button><button class="dt-btn proc-feed-desc-cancel-btn" data-proc-key="${esc(entry.key)}">Cancel</button></div>`;
      h += `</div>`;
      h += `</div>`;
    }
    // Player's nominated feeding territories (informational — ST override is the pills below)
    {
      const _nomText = _playerFeedTerrsText(feedSub);
      if (_nomText) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Territories</span> ${esc(_nomText)}</div>`;
    }
    // ── Resident/poacher mismatch flag ──
    {
      const _charId = String(feedChar?._id || '');
      let _feedGrid = {};
      try { _feedGrid = JSON.parse(feedSub?.responses?.feeding_territories || '{}'); } catch { /* ignore */ }
      const _terrDocs = cachedTerritories || [];
      const _mismatches = [];
      for (const [terrKey, val] of Object.entries(_feedGrid)) {
        if (!val || val === 'none') continue;
        // Resolve territory doc by slug key
        const _td = _terrDocs.find(t =>
          (t.id && t.id === terrKey) ||
          (t.name && t.name.toLowerCase().replace(/[^a-z0-9]+/g, '_') === terrKey)
        );
        if (!_td) continue;
        // Rights-holders: regent, lieutenant, or anyone on the explicit list.
        // regent_id and lieutenant_id are implicit — not duplicated into feeding_rights[].
        const _hasRights = _charId && (
          String(_td.regent_id || '') === _charId ||
          String(_td.lieutenant_id || '') === _charId ||
          (Array.isArray(_td.feeding_rights) && _td.feeding_rights.some(id => String(id) === _charId))
        );
        if (val === 'feeding_rights' && !_hasRights) {
          _mismatches.push(`Claims feeding rights in ${_td.name} — not on Regent's list`);
        } else if (val === 'poaching' && _hasRights) {
          _mismatches.push(`Has feeding rights in ${_td.name} — declared as poaching`);
        }
      }
      for (const _msg of _mismatches) {
        h += `<div class="proc-mismatch-flag">\u26A0 ${esc(_msg)}</div>`;
      }
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

      const _feedCommitted = poolStatus === 'committed';
      const _feedDis = _feedCommitted ? ' disabled' : '';
      h += `<div class="proc-pool-builder${_feedCommitted ? ' proc-pool-committed' : ''}" data-proc-key="${esc(entry.key)}">`;
      h += `<div class="proc-detail-label">ST Pool Builder${!char ? ' <span class="dt-hint">(dot values unavailable \u2014 character not loaded)</span>' : ''}${_feedCommitted ? ' <span class="proc-pool-committed-badge">[Committed]</span>' : ''}</div>`;
      if (showParseRef) {
        h += `<div class="proc-pool-parse-ref">Could not restore selection \u2014 previous: "${esc(poolValidated)}"</div>`;
      }
      h += '<div class="proc-pool-builder-selects">';
      h += `<select class="proc-pool-attr" data-proc-key="${esc(entry.key)}"${_feedDis}>${attrOptHtml}</select>`;
      h += `<span class="proc-pool-plus">+</span>`;
      h += `<select class="proc-pool-skill" data-proc-key="${esc(entry.key)}"${_feedDis}>${skillOptHtml}</select>`;
      h += `<span class="proc-pool-plus">+</span>`;
      h += `<select class="proc-pool-disc" data-proc-key="${esc(entry.key)}"${_feedDis}>${discOptHtml}</select>`;
      h += '</div>'; // proc-pool-builder-selects
      // Hidden modifier input — receives right-panel pool mod total so _readBuilderExpr includes it
      h += `<input type="hidden" class="proc-pool-mod-val" data-proc-key="${esc(entry.key)}" value="${initModForDisplay}">`;
      h += `<div class="proc-pool-total" data-proc-key="${esc(entry.key)}">${esc(initTotalStr)}</div>`;
      // Skill metadata: spec checkboxes only (9-again lives in the right panel)
      h += `<div class="dt-feed-builder-meta dt-skill-meta" data-proc-key="${esc(entry.key)}" data-sub-id="${esc(entry.subId)}">`;
      h += _buildSpecTogglesHtml(char, preSkill, entry.key, rev.active_feed_specs || [], _feedDis);
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

    const _projCommitted = poolStatus === 'committed';
    const _projDis = _projCommitted ? ' disabled' : '';
    h += `<div class="proc-pool-builder${_projCommitted ? ' proc-pool-committed' : ''}" data-proc-key="${esc(entry.key)}">`;
    h += `<div class="proc-detail-label">ST Pool Builder${!char ? ' <span class="dt-hint">(dot values unavailable \u2014 character not loaded)</span>' : ''}${_projCommitted ? ' <span class="proc-pool-committed-badge">[Committed]</span>' : ''}</div>`;
    if (showParseRef) {
      h += `<div class="proc-pool-parse-ref">Could not restore selection \u2014 previous: "${esc(poolValidated)}"</div>`;
    }
    h += '<div class="proc-pool-builder-selects">';
    h += `<select class="proc-pool-attr" data-proc-key="${esc(entry.key)}"${_projDis}>${attrOptHtml}</select>`;
    h += `<span class="proc-pool-plus">+</span>`;
    h += `<select class="proc-pool-skill" data-proc-key="${esc(entry.key)}"${_projDis}>${skillOptHtml}</select>`;
    h += `<span class="proc-pool-plus">+</span>`;
    h += `<select class="proc-pool-disc" data-proc-key="${esc(entry.key)}"${_projDis}>${discOptHtml}</select>`;
    h += '</div>';
    h += `<input type="hidden" class="proc-pool-mod-val" data-proc-key="${esc(entry.key)}" value="${initModForDisplay}">`;
    h += `<div class="proc-pool-total" data-proc-key="${esc(entry.key)}" data-nine-again="${_pnA ? '1' : '0'}">${esc(initTotalStr)}</div>`;
    // Spec toggles only — 9-again moved to right sidebar for project entries
    h += `<div class="dt-feed-builder-meta dt-skill-meta" data-proc-key="${esc(entry.key)}" data-sub-id="${esc(entry.subId)}">`;
    h += _buildSpecTogglesHtml(char, preSkill, entry.key, rev.active_feed_specs || [], _projDis);
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
    h += `<option value="__custom__"${selectedRite === '__custom__' ? ' selected' : ''}>Custom\u2026</option>`;
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
    // Custom level input — only when Custom is selected
    if (selectedRite === '__custom__') {
      const lvl = rev.rite_custom_level || '';
      h += `<label class="proc-rite-custom-lbl">Level <input type="number" class="proc-rite-custom-level-input dt-num-input-sm" min="1" max="5" data-proc-key="${esc(entry.key)}" value="${esc(String(lvl))}"></label>`;
    }
    // Override indicator — only for short rite names (suppress blobs from CSV submissions)
    const shortRiteName = entry.riteName && entry.riteName.length <= 60;
    if (overridden && shortRiteName) h += `<span class="proc-recat-original">Player: ${esc(entry.riteName)}</span>`;
    h += '</div>';

    // Pool + target display (auto-computed from selected rite + char)
    // For Custom, build a fake ritInfo from tradition pool + entered level
    let resolvedRitInfo = ritInfo;
    if (!resolvedRitInfo && selectedRite === '__custom__' && rev.rite_custom_level) {
      const pool = TRADITION_POOL[entry.tradition] || null;
      if (pool) {
        resolvedRitInfo = {
          attr: pool.attr, skill: pool.skill, disc: pool.disc,
          poolExpr: [pool.attr, pool.skill, pool.disc].filter(Boolean).join(' + '),
          target: rev.rite_custom_level,
        };
      }
    }

    if (resolvedRitInfo) {
      const base         = _computeRitePool(sorcChar, resolvedRitInfo.attr, resolvedRitInfo.skill, resolvedRitInfo.disc);
      const isCruac      = entry.tradition === 'Cruac';
      const mandUsed     = rev.ritual_mg_used || false;
      const mgMeritL     = isCruac ? (sorcChar?.merits || []).find(m => m.name === 'Mandragora Garden') : null;
      const mgPoolL      = mgMeritL ? (mgMeritL.rating || mgMeritL.dots || 0) + (mgMeritL.bonus || 0) : 0;
      const mgDots       = (isCruac && mandUsed) ? mgPoolL : 0;
      const eqMod        = rev.pool_mod_equipment || 0;
      const total        = base + 3 + mgDots + eqMod;

      const _slEntry = resolvedRitInfo.disc ? _charDiscsArray(sorcChar).find(d => d.name === resolvedRitInfo.disc) : null;
      let exprParts = sorcChar
        ? [
            `${resolvedRitInfo.attr} ${getAttrVal(sorcChar, resolvedRitInfo.attr) || 0}`,
            `${resolvedRitInfo.skill} ${skTotal(sorcChar, resolvedRitInfo.skill) || 0}`,
            resolvedRitInfo.disc ? `${resolvedRitInfo.disc} ${_slEntry?.dots || 0}` : null,
            '+3',
          ].filter(Boolean)
        : [resolvedRitInfo.poolExpr, '+3'];
      if (mgDots) exprParts.push(`+${mgDots}`);
      if (eqMod)  exprParts.push(eqMod > 0 ? `+${eqMod}` : String(eqMod));

      h += `<div class="proc-ritual-info">`;
      h += `<span class="proc-ritual-info-item"><span class="proc-feed-lbl">Pool</span> ${esc(exprParts.join(' + '))} = ${total}</span>`;
      h += `<span class="proc-ritual-info-item"><span class="proc-feed-lbl">Target</span> ${resolvedRitInfo.target} success${resolvedRitInfo.target !== 1 ? 'es' : ''} (Level ${resolvedRitInfo.target})</span>`;
      h += '</div>';
    } else if (selectedRite && selectedRite !== '__custom__') {
      h += `<div class="proc-ritual-no-rule">Rite not found in rules database.</div>`;
    }

    // Mechanical result note
    const resultNote = rev.ritual_result_note || '';
    h += '<div class="proc-section">';
    h += '<div class="proc-detail-label">Mechanical Result</div>';
    h += `<textarea class="proc-ritual-note-input" data-proc-key="${esc(entry.key)}" rows="2" placeholder="Potency, duration, effect on target\u2026">${esc(resultNote)}</textarea>`;
    h += '</div>';
  } else if (entry.source === 'acquisition') {
    // Acquisitions: show full player-submitted text, no pool needed
    h += '<div class="proc-section">';
    h += '<div class="proc-detail-label">Player Notes</div>';
    h += `<div class="proc-acq-notes">${esc(entry.acqNotes || entry.description).replace(/\n/g, '<br>')}</div>`;
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
    {
      const _isSO_inline = !!rev.second_opinion;
      h += `<div class="proc-section">`;
      h += `<button class="proc-second-opinion-btn${_isSO_inline ? ' active' : ''}" data-proc-key="${esc(entry.key)}">${_isSO_inline ? 'Second Opinion' : 'Flag for 2nd opinion'}</button>`;
      h += `</div>`;
    }
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

  // ST Notes thread
  h += '<div class="proc-section proc-notes-panel proc-notes-primary">';
  h += '<div class="proc-detail-label">ST Notes <span class="proc-label-sub">— visible to Claude</span></div>';
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
  h += `<textarea class="proc-note-textarea" data-proc-key="${esc(entry.key)}" placeholder="Add ST note..." rows="3"></textarea>`;
  h += `<button class="dt-btn proc-add-note-btn" data-proc-key="${esc(entry.key)}">Add Note</button>`;
  h += '</div>';
  h += '</div>';

  // Story Context (ST-written; fed into AI prompts — not shown directly to player)
  h += '<div class="proc-section proc-feedback-section">';
  h += '<div class="proc-detail-label">Story Context</div>';
  h += `<input class="proc-feedback-input" type="text" data-proc-key="${esc(entry.key)}" value="${esc(feedback)}" placeholder="Context for AI prompt (not sent directly to player)...">`;
  h += '</div>';

  // Player Feedback (player_facing_note — included verbatim in published outcome)
  h += '<div class="proc-section proc-player-note-section">';
  h += '<div class="proc-detail-label">Player Feedback <span class="proc-label-sub">— sent to player</span></div>';
  h += `<textarea class="proc-player-note-input" data-proc-key="${esc(entry.key)}" rows="2" placeholder="Plain-language note included verbatim in player outcome...">${esc(playerFacingNote)}</textarea>`;
  h += '</div>';

  // ── Cross-reference callout (read-only, derived from xrefIndex) ──
  {
    const xrefLines = [];

    // Project territory overlap
    if (entry.projTerritory) {
      const others = (_xrefIndex.get(`terr:${entry.projTerritory}`) || [])
        .filter(r => r.charName !== entry.charName);
      if (others.length) {
        const names = others.map(r => `${r.charName} (${r.label})`).join(', ');
        xrefLines.push(`Also in ${entry.projTerritory}: ${names}`);
      }
    }

    // Feeding territory overlap
    if (entry.source === 'feeding' && entry.primaryTerr) {
      const others = (_xrefIndex.get(`terr:${entry.primaryTerr}`) || [])
        .filter(r => r.charName !== entry.charName);
      if (others.length) {
        const names = others.map(r => `${r.charName} (${r.label})`).join(', ');
        xrefLines.push(`Also feeding ${entry.primaryTerr}: ${names}`);
      }
    }

    // Investigate target overlap + hide/protect check
    if (entry.actionType === 'investigate' && rev.investigate_target_char) {
      const target = rev.investigate_target_char;
      const others = (_xrefIndex.get(`inv-target:${target}`) || [])
        .filter(r => r.charName !== entry.charName);
      if (others.length) {
        xrefLines.push(`Also investigating ${target}: ${others.map(r => r.charName).join(', ')}`);
      }
      // hide/protect: the target's own submission having a hide_protect action
      // charName uses display capitalisation; target (investigate_target_char) is stored as sortName (lowercase)
      if ([..._procQueueMap.values()].some(e => e.actionType === 'hide_protect' && e.charName.toLowerCase() === target)) {
        xrefLines.push(`${target} has an active hide/protect action this cycle`);
      }
    }

    if (xrefLines.length) {
      h += `<div class="proc-xref-callout">`;
      for (const line of xrefLines) h += `<div class="proc-xref-line">${esc(line)}</div>`;
      h += `</div>`;
    }
  }

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

  // Delete button for ST-created actions
  if (entry.source === 'st_created') {
    h += `<div class="proc-section">`;
    h += `<button class="dt-btn proc-delete-st-action" data-proc-key="${esc(entry.key)}" data-sub-id="${esc(entry.subId)}" data-action-idx="${entry.actionIdx}">Delete action</button>`;
    h += `</div>`;
  }

  h += '</div>'; // proc-action-detail
  return h;
}

// ── Ritual helpers ────────────────────────────────────────────────────────────

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
/** Compute total Cruac vitae cost from a submission's sorcery slots. Theban rites cost WP, not vitae. */
function _computeRiteVitaeCost(sub, char) {
  const subChar = char || findCharacter(sub.character_name, sub.player_name);
  const discs = subChar?.disciplines || {};
  if (!discs.Cruac) return 0;
  const resp = sub.responses || {};
  const count = parseInt(resp['sorcery_slot_count'] || '1', 10);
  let total = 0;
  for (let n = 1; n <= count; n++) {
    const rite = resp[`sorcery_${n}_rite`];
    if (!rite) continue;
    const level = _getRiteLevel(rite) || 0;
    total += level >= 4 ? 2 : level >= 1 ? 1 : 0;
  }
  return total;
}

/** Compute total Theban WP cost from a submission's sorcery slots (1 WP per rite). */
function _computeRiteWpCost(sub, char) {
  const subChar = char || findCharacter(sub.character_name, sub.player_name);
  const discs = subChar?.disciplines || {};
  if (!(discs['Theban Sorcery'] || discs.Theban)) return 0;
  const resp = sub.responses || {};
  const count = parseInt(resp['sorcery_slot_count'] || '1', 10);
  let total = 0;
  for (let n = 1; n <= count; n++) {
    if (resp[`sorcery_${n}_rite`]) total++;
  }
  return total;
}

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

const NARR_KEYS = NARR_BLOCKS.map(b => b.key);

const STYLE_RULES = [
  'No success counts, discipline names, or mechanical terms in player-facing prose.',
  'No editorialising about what results mean.',
  'No stacked declaratives — fold short sentences together.',
  'No negative framing openers — start with what the character found, not what they didn\'t.',
  'Never dictate what a player has chosen, felt, or done.',
];

function renderNarrativePanel(s) {
  const narr = s.st_review?.narrative || {};

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
  const resp = sub.responses || {};
  const r = questResp?.responses || {};
  const projects = raw.projects || [];
  const projResolved = sub.projects_resolved || [];
  let _exportContactReqs = raw.contact_actions?.requests || [];
  if (!_exportContactReqs.length) {
    const cl = [];
    for (let n = 1; n <= 5; n++) { const rr = resp[`contact_${n}_request`] || resp[`contact_${n}`]; if (!rr) continue; cl.push(rr); }
    _exportContactReqs = cl;
  }
  const meritActions = [
    ...(raw.sphere_actions || []),
    ..._exportContactReqs.map(req => ({ merit_type: 'Contacts', action_type: 'Gather Info', description: req })),
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
  const resp = sub.responses || {};
  const projects = raw.projects || [];
  const resolved = sub.projects_resolved || [];
  let _mechContactReqs = raw.contact_actions?.requests || [];
  if (!_mechContactReqs.length) {
    const cl = [];
    for (let n = 1; n <= 5; n++) { const r = resp[`contact_${n}_request`] || resp[`contact_${n}`]; if (!r) continue; cl.push(r); }
    _mechContactReqs = cl;
  }
  const meritActions = [
    ...(raw.sphere_actions || []),
    ..._mechContactReqs.map(r => ({ merit_type: 'Contacts', action_type: 'Gather Info', description: r })),
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
    h += `<input class="dt-inv-input" id="dt-inv-target" placeholder="Target (name or description)">`;
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

// ── Submission Checklist (feature.55) ───────────────────────────────────────

const CHK_SECTIONS = [
  { key: 'travel',       label: 'Travel'   },
  { key: 'feeding',      label: 'Feeding'  },
  { key: 'project_1',    label: 'P1' },
  { key: 'project_2',    label: 'P2' },
  { key: 'project_3',    label: 'P3' },
  { key: 'project_4',    label: 'P4' },
  { key: 'allies_1',     label: 'A1' },
  { key: 'allies_2',     label: 'A2' },
  { key: 'allies_3',     label: 'A3' },
  { key: 'allies_4',     label: 'A4' },
  { key: 'allies_5',     label: 'A5' },
  { key: 'status_1',     label: 'S1' },
  { key: 'status_2',     label: 'S2' },
  { key: 'status_3',     label: 'S3' },
  { key: 'retainers_1',  label: 'R1' },
  { key: 'retainers_2',  label: 'R2' },
  { key: 'retainers_3',  label: 'R3' },
  { key: 'contacts_1',   label: 'C1' },
  { key: 'contacts_2',   label: 'C2' },
  { key: 'contacts_3',   label: 'C3' },
  { key: 'contacts_4',   label: 'C4' },
  { key: 'contacts_5',   label: 'C5' },
  { key: 'resources',    label: 'Resources' },
];

/**
 * Returns the flat merit_actions array for a submission.
 * Order: spheres → contacts → retainers (mirrors buildProcessingQueue).
 * Uses sub.merit_actions if already built; otherwise reconstructs from _raw / responses.
 * NFR-DS-01: no import from downtime-story.js.
 */
function _getSubMeritActions(sub) {
  if (sub.merit_actions?.length) return sub.merit_actions;
  const raw  = sub._raw    || {};
  const resp = sub.responses || {};
  const result = [];
  // spheres
  const spheres = raw.sphere_actions || [];
  if (spheres.length) {
    spheres.forEach((a, i) => result.push({ merit_type: resp[`sphere_${i + 1}_merit`] || a.merit_type || '', action_type: a.action_type || '' }));
  } else {
    for (let n = 1; n <= 5; n++) {
      const mt = resp[`sphere_${n}_merit`];
      if (mt) result.push({ merit_type: mt, action_type: resp[`sphere_${n}_action`] || '' });
    }
  }
  // contacts
  const contactRaw = raw.contact_actions?.requests || [];
  if (contactRaw.length) {
    contactRaw.forEach(() => result.push({ merit_type: 'Contacts', action_type: '' }));
  } else {
    for (let n = 1; n <= 5; n++) { if (resp[`contact_${n}_request`]) result.push({ merit_type: 'Contacts', action_type: '' }); }
  }
  // retainers
  const retainerRaw = raw.retainer_actions?.actions || [];
  if (retainerRaw.length) {
    retainerRaw.forEach(() => result.push({ merit_type: 'Retainer', action_type: '' }));
  } else {
    for (let n = 1; n <= 4; n++) { if (resp[`retainer_${n}_task`]) result.push({ merit_type: 'Retainer', action_type: '' }); }
  }
  return result;
}

/**
 * Returns a map of global merit_actions_resolved indices per category:
 *   { allies: [0, 3], status: [1], retainers: [2], contacts: [4, 5] }
 * Cached per sub._id on the sub object itself to avoid repeated iteration.
 */
function _buildMeritSlotMap(sub) {
  if (sub._chkSlotMap) return sub._chkSlotMap;
  const actions = _getSubMeritActions(sub);
  const map = { allies: [], status: [], retainers: [], contacts: [] };
  actions.forEach((a, i) => {
    const cat = _parseMeritType(a.merit_type || '').category;
    if      (cat === 'allies')                           map.allies.push(i);
    else if (cat === 'status')                           map.status.push(i);
    else if (cat === 'retainer' || cat === 'staff')      map.retainers.push(i);
    else if (cat === 'contacts')                         map.contacts.push(i);
  });
  sub._chkSlotMap = map;
  return map;
}

function _chkHasContent(sub, key) {
  if (!sub) return false;
  const raw  = sub._raw || {};
  const resp = sub.responses || {};

  const alliesM    = key.match(/^allies_(\d+)$/);
  const statusM    = key.match(/^status_(\d+)$/);
  const retainersM = key.match(/^retainers_(\d+)$/);
  const contactsM  = key.match(/^contacts_(\d+)$/);

  if (alliesM)    return _buildMeritSlotMap(sub).allies[parseInt(alliesM[1]) - 1]    !== undefined;
  if (statusM)    return _buildMeritSlotMap(sub).status[parseInt(statusM[1]) - 1]    !== undefined;
  if (retainersM) return _buildMeritSlotMap(sub).retainers[parseInt(retainersM[1]) - 1] !== undefined;
  if (contactsM)  return _buildMeritSlotMap(sub).contacts[parseInt(contactsM[1]) - 1]  !== undefined;

  switch (key) {
    case 'travel':    return !!(raw.submission?.narrative?.travel_description || resp.travel);
    case 'feeding':   return !!(raw.feeding?.method || resp['_feed_method']);
    case 'project_1': return !!(resp.project_1_action || raw.projects?.[0]);
    case 'project_2': return !!(resp.project_2_action || raw.projects?.[1]);
    case 'project_3': return !!(resp.project_3_action || raw.projects?.[2]);
    case 'project_4': return !!(resp.project_4_action || raw.projects?.[3]);
    case 'resources': return !!(raw.acquisitions?.resource_acquisitions || resp.resources_acquisitions);
    default:          return false;
  }
}

/** Return tooltip text describing what a specific merit slot contains. */
function _chkTooltip(sub, key) {
  if (!sub) return '';
  const actions = _getSubMeritActions(sub);
  const map = _buildMeritSlotMap(sub);

  const alliesM    = key.match(/^allies_(\d+)$/);
  const statusM    = key.match(/^status_(\d+)$/);
  const retainersM = key.match(/^retainers_(\d+)$/);
  const contactsM  = key.match(/^contacts_(\d+)$/);

  if (alliesM || statusM || retainersM) {
    const [, n] = (alliesM || statusM || retainersM);
    const cat    = alliesM ? 'allies' : statusM ? 'status' : 'retainers';
    const gIdx   = map[cat][parseInt(n) - 1];
    if (gIdx === undefined) return '';
    const a = actions[gIdx];
    if (!a) return '';
    return a.action_type ? `${a.merit_type}: ${a.action_type}` : a.merit_type || '';
  }

  if (contactsM) {
    const n   = parseInt(contactsM[1]);
    const raw = sub._raw || {};
    const resp = sub.responses || {};
    const req = raw.contact_actions?.requests?.[n - 1] || resp[`contact_${n}_request`] || '';
    if (!req) return '';
    const typeMatch = req.match(/Contact Type:\s*([^\n]+)/i);
    return typeMatch ? `Contact: ${typeMatch[1].trim()}` : 'Contact';
  }

  return '';
}

// _chkState returns one of:
//   'empty'     — section not present in this submission
//   'unsighted' — present but ST hasn't touched it          O
//   'no_action' — reviewed; skipped / no valid action       X
//   'confirmed' — pool validated or fully signed off        ★
//   'sighted'   — manually marked in-progress              ?
const _CHK_TERMINAL_STATUSES = new Set(['no_effect', 'resolved', 'no_action', 'no_roll', 'skipped', 'maintenance']);

function _chkState(sub, key) {
  if (!_chkHasContent(sub, key)) return 'empty';

  // ── Travel ──
  if (key === 'travel') {
    if (DONE_STATUSES.has(sub.st_review?.travel_discretion)) return 'confirmed';
  }

  // ── Feeding ──
  if (key === 'feeding') {
    const fr = sub.feeding_review || {};
    const ps = fr.pool_status;
    if (ps === 'no_feed')                        return 'no_action';
    if (sub.feeding_roll || ps === 'validated')  return 'confirmed';
  }

  // ── Projects ──
  const projM = key.match(/^project_(\d+)$/);
  if (projM) {
    const slot = parseInt(projM[1]) - 1;
    const pr   = (sub.projects_resolved || [])[slot] || {};
    const ps   = pr.pool_status;
    const rawProjType = pr.action_type_override
      || (sub._raw?.projects || [])[slot]?.action_type
      || sub.responses?.[`project_${slot + 1}_action`]
      || '';
    if (_CHK_TERMINAL_STATUSES.has(ps)) return 'no_action';
    if (rawProjType === 'no_action_taken')        return 'no_action';
    if (ps === 'validated')                       return 'confirmed';
  }

  // ── Merit slots: Allies / Status / Retainers / Contacts ──
  const alliesM    = key.match(/^allies_(\d+)$/);
  const statusM    = key.match(/^status_(\d+)$/);
  const retainersM = key.match(/^retainers_(\d+)$/);
  const contactsM  = key.match(/^contacts_(\d+)$/);

  if (alliesM || statusM || retainersM || contactsM) {
    const resolved = sub.merit_actions_resolved || [];
    const map      = _buildMeritSlotMap(sub);
    let gIdx;
    if (alliesM)    gIdx = map.allies[parseInt(alliesM[1]) - 1];
    else if (statusM)    gIdx = map.status[parseInt(statusM[1]) - 1];
    else if (retainersM) gIdx = map.retainers[parseInt(retainersM[1]) - 1];
    else                 gIdx = map.contacts[parseInt(contactsM[1]) - 1];
    if (gIdx !== undefined) {
      const ps = resolved[gIdx]?.pool_status;
      if (_CHK_TERMINAL_STATUSES.has(ps)) return 'no_action';
      if (ps === 'validated')             return 'confirmed';
    }
  }

  // ── Resources acquisition ──
  if (key === 'resources') {
    const ps = sub.st_review?.actions?.['acq:resources']?.pool_status;
    if (_CHK_TERMINAL_STATUSES.has(ps)) return 'no_action';
    if (ps === 'validated')             return 'confirmed';
  }

  if (sub?.st_review?.sighted?.[key]) return 'sighted';
  return 'unsighted';
}

/** Map a checklist section key to its processing queue entry.key, or null if no queue entry exists. */
function _chkNavKey(sub, section) {
  if (!sub) return null;
  if (section === 'feeding')   return `${sub._id}:feeding`;
  if (section === 'resources') return `${sub._id}:acq:resources`;

  const projM = section.match(/^project_(\d+)$/);
  if (projM) return `${sub._id}:proj:${parseInt(projM[1]) - 1}`;

  const alliesM    = section.match(/^allies_(\d+)$/);
  const statusM    = section.match(/^status_(\d+)$/);
  const retainersM = section.match(/^retainers_(\d+)$/);
  const contactsM  = section.match(/^contacts_(\d+)$/);

  if (alliesM || statusM || retainersM || contactsM) {
    const map = _buildMeritSlotMap(sub);
    let gIdx;
    if (alliesM)         gIdx = map.allies[parseInt(alliesM[1]) - 1];
    else if (statusM)    gIdx = map.status[parseInt(statusM[1]) - 1];
    else if (retainersM) gIdx = map.retainers[parseInt(retainersM[1]) - 1];
    else                 gIdx = map.contacts[parseInt(contactsM[1]) - 1];
    if (gIdx !== undefined) return `${sub._id}:merit:${gIdx}`;
  }

  return null;
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

  // Count how many chars have all present sections confirmed or skipped (no remaining O/?).
  let fullySighted = 0;
  const submittedCount = sorted.filter(c => subByCharId.has(String(c._id))).length;
  for (const char of sorted) {
    const sub = subByCharId.get(String(char._id)) || null;
    if (!sub) continue;
    const allDone = CHK_SECTIONS.every(sec => {
      const st = _chkState(sub, sec.key);
      return st === 'empty' || st === 'no_action' || st === 'confirmed';
    });
    if (allDone) fullySighted++;
  }

  let h = '<div class="dt-chk-panel">';
  h += `<div class="dt-chk-toggle" id="dt-chk-toggle">${isOpen ? '\u25BC' : '\u25BA'} Submission Checklist`;
  h += ` <span class="domain-count">${fullySighted} / ${submittedCount} processed</span>`;
  h += ` <span class="dt-chk-legend">\u2605\u202Fdone &nbsp; ?\u202Fin\u00A0progress &nbsp; X\u202Fskipped &nbsp; O\u202Fnot\u00A0touched &nbsp; \u2014\u202Fn/a</span>`;
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
          h += `<td class="dt-chk-confirmed${navCls}" title="${tipPfx}Done${jump}"${navA}>\u2605</td>`;
        } else if (state === 'no_action') {
          h += `<td class="dt-chk-no-action${navCls}" title="${tipPfx}Skipped${jump}"${navA}>X</td>`;
        } else if (state === 'sighted') {
          h += `<td class="dt-chk-sighted dt-chk-cell${navCls}" data-sub-id="${esc(sub._id)}" data-section="${esc(sec.key)}" title="${tipPfx}In progress${jump} \u2014 Ctrl+click to unsight"${navA}>?</td>`;
        } else {
          h += `<td class="dt-chk-unsighted dt-chk-cell${navCls}" data-sub-id="${esc(sub._id)}" data-section="${esc(sec.key)}" title="${tipPfx}Not touched${jump} \u2014 Ctrl+click to mark in progress"${navA}>O</td>`;
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
  // Prefer feeding_rights, fall back to poaching (include legacy values)
  for (const status of ['feeding_rights', 'resident', 'poaching', 'poacher']) {
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
  for (const m of FEED_METHODS_DATA) {
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
      const ambModStr = _fmtMod(ambienceMod);

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
  if (!td) return null;
  // Prefer live DB record so matrix cap matches the ambience table (both use cachedTerritories)
  if (cachedTerritories?.length) {
    const dbRec = cachedTerritories.find(t => t.id === td.id || t.name === td.name);
    if (dbRec?.ambience) return dbRec.ambience;
  }
  return td.ambience;
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

/** Return a display string of the player's nominated feeding territories (e.g. "Academy, Harbour").
 *  Returns null if no territories could be determined. */
function _playerFeedTerrsText(sub) {
  let terrs = null;
  if (sub?.responses?.feeding_territories) {
    try { terrs = JSON.parse(sub.responses.feeding_territories); } catch { terrs = null; }
  }
  const labels = [];
  if (terrs) {
    for (const [slug, status] of Object.entries(terrs)) {
      if (!status || status === 'none' || status === 'Not feeding here') continue;
      const tid = Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, slug) ? TERRITORY_SLUG_MAP[slug] : null;
      if (!tid) continue;
      const mt = MATRIX_TERRS.find(m => TERRITORY_SLUG_MAP[m.csvKey] === tid);
      if (mt) labels.push(mt.label);
    }
  } else {
    // Legacy: _raw.feeding.territories (display-name keys)
    const rawTerrs = _normTerrKeys(sub?._raw?.feeding?.territories || {});
    for (const [csvKey, status] of Object.entries(rawTerrs)) {
      if (!status || status === 'Not feeding here' || status === 'none') continue;
      const mt = MATRIX_TERRS.find(m => m.csvKey === csvKey);
      if (mt) labels.push(mt.label);
    }
  }
  return labels.length > 0 ? labels.join(', ') : null;
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

/**
 * Build the feeding matrix <table> HTML only.
 * Callers handle the outer wrapper, toggle, and feeder-count footer.
 * @param {object[]} chars — sorted active characters
 * @param {Map<string,object>} subByCharId — charId → submission
 * @param {Object<string,Set<string>>} residentsByTerrKey — csvKey → Set<charId>
 * @returns {string} HTML string (<table>…</table> + note)
 */
function _buildMatrixTableHtml(chars, subByCharId, residentsByTerrKey) {
  const cols = MATRIX_TERRS;
  let h = '<table class="dt-matrix-table"><thead><tr><th>Character</th>';
  for (const t of cols) {
    const amb = getTerritoryAmbience(t.ambienceKey);
    h += `<th title="${esc(amb || 'No cap')}">${esc(t.label)}<br><span class="dt-matrix-amb">${esc(amb || 'N/A')}</span></th>`;
  }
  h += '</tr></thead><tbody>';
  for (const char of chars) {
    const charId = String(char._id);
    const sub = subByCharId.get(charId) || null;
    const hasSub = !!sub;
    const fedTerrs = hasSub ? _getSubFedTerrs(sub) : new Set();
    h += `<tr class="dt-matrix-row${hasSub ? '' : ' dt-matrix-nosub'}"${hasSub ? ` data-sub-id="${esc(sub._id)}"` : ''}>`;
    h += `<td class="dt-matrix-char">${esc(displayName(char))}${!hasSub ? ' <span class="dt-matrix-nosub-badge">No submission</span>' : ''}</td>`;
    for (const t of cols) {
      const isBarrens = t.ambienceKey === null;
      const fed = fedTerrs.has(t.csvKey);
      if (!fed) {
        h += '<td class="dt-matrix-empty">\u2014</td>';
      } else if (!isBarrens && residentsByTerrKey[t.csvKey].has(charId)) {
        h += '<td class="dt-matrix-resident">O</td>';
      } else {
        h += '<td class="dt-matrix-poach">X</td>';
      }
    }
    h += '</tr>';
  }
  h += '</tbody></table>';
  h += '<p class="dt-matrix-note">O = feeding rights. X = poaching. Rights set via City tab.</p>';
  return h;
}

function renderFeedingMatrix() {
  const el = document.getElementById('dt-matrix');
  if (!el) return;

  const activeChars = characters.filter(c => !c.retired)
    .sort((a, b) => sortName(a).localeCompare(sortName(b)));

  if (!submissions.length && !activeChars.length) { el.innerHTML = ''; return; }

  // Build residency lookup: feeding_rights + regent + lieutenant always count as residents
  const residentsByTerrKey = {};
  for (const mt of MATRIX_TERRS) {
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

  let h = `<div class="dt-matrix-panel">`;
  h += `<div class="dt-matrix-toggle" id="dt-matrix-toggle">${isOpen ? '\u25BC' : '\u25BA'} Feeding Matrix <span class="domain-count">${activeChars.length} characters</span></div>`;

  if (isOpen) {
    h += `<div class="dt-matrix-wrap">`;
    h += _buildMatrixTableHtml(activeChars, subByCharId, residentsByTerrKey);
    h += `</div>`;
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

// ── City Overview helpers ─────────────────────────────────────────

function _buildAmbienceHtml(feedCountsByTerrId = null) {
  const terrs = cachedTerritories || TERRITORY_DATA;
  const { rows } = buildAmbienceData(terrs, feedCountsByTerrId);

  let h = `<div class="dt-scroll-wrap">`;
  h += `<table class="proc-amb-table">`;
  h += `<thead><tr>
    <th>Territory</th>
    <th title="Current ambience step">Starting</th>
    <th title="Fixed -3 entropy per cycle">Entropy</th>
    <th title="Feeders vs cap">Overfeeding</th>
    <th title="Influence spend: +positive / -negative / net">Influence</th>
    <th title="Ambience project contributions: 1–4 successes = 1 pt, 5+ = 2 pts">Projects</th>
    <th title="Allies / Status / Retainer automatic actions">Allies</th>
    <th title="Sum of all columns">Net Change</th>
    <th title="Projected new ambience step">Projected</th>
    <th title="Confirm this ambience change for cycle push">Confirm</th>
  </tr></thead><tbody>`;
  for (const r of rows) {
    const netClass = r.net > 0 ? 'proc-amb-pos' : r.net < 0 ? 'proc-amb-neg' : '';
    const projClass = r.projStep !== r.ambience ? (r.net > 0 ? 'proc-amb-pos' : 'proc-amb-neg') : '';
    const netStr = _fmtMod(r.net);
    const gap = r.cap - r.feeders;
    const gapStr = gap >= 0 ? `+${gap}` : String(gap);
    const gapClass = gap < 0 ? 'proc-amb-neg' : '';
    const infNet = r.inf_pos - r.inf_neg;
    const infNetStr = _fmtMod(infNet);
    const infNetClass = infNet > 0 ? 'proc-amb-pos' : infNet < 0 ? 'proc-amb-neg' : '';
    const infDisplay = `<span class="proc-amb-pos">+${r.inf_pos}</span> | <span class="proc-amb-neg">-${r.inf_neg}</span> | <span class="${infNetClass}">${infNetStr}</span>`;
    const projNet = r.proj_pos - r.proj_neg;
    const projNetStr = _fmtMod(projNet);
    const projNetClass = projNet > 0 ? 'proc-amb-pos' : projNet < 0 ? 'proc-amb-neg' : '';
    const projDisplay = `<span class="proc-amb-pos">+${r.proj_pos}</span> | <span class="proc-amb-neg">-${r.proj_neg}</span> | <span class="${projNetClass}">${projNetStr}</span>`;
    const alliesNet = r.allies_pos - r.allies_neg;
    const alliesNetStr = _fmtMod(alliesNet);
    const alliesNetClass = alliesNet > 0 ? 'proc-amb-pos' : alliesNet < 0 ? 'proc-amb-neg' : '';
    const alliesDisplay = `<span class="proc-amb-pos">+${r.allies_pos}</span> | <span class="proc-amb-neg">-${r.allies_neg}</span> | <span class="${alliesNetClass}">${alliesNetStr}</span>`;
    const confirmed = currentCycle?.confirmed_ambience?.[r.id];
    const projMod = AMBIENCE_MODS[r.projStep] ?? r.ambienceMod ?? 0;
    const confirmCell = confirmed
      ? `<td class="proc-amb-confirmed">\u2713 ${esc(confirmed.ambience)} <button class="city-amb-confirm-btn proc-amb-reconfirm" data-terr-id="${esc(r.id)}" data-proj-step="${esc(r.projStep)}" data-proj-mod="${projMod}">Re-confirm</button></td>`
      : `<td><button class="city-amb-confirm-btn" data-terr-id="${esc(r.id)}" data-proj-step="${esc(r.projStep)}" data-proj-mod="${projMod}">Confirm ${esc(r.projStep)}</button></td>`;
    h += `<tr>`;
    h += `<td class="proc-amb-terr">${esc(r.name)}</td>`;
    h += `<td>${esc(r.ambience)}</td>`;
    h += `<td class="proc-amb-neg">${r.entropy}</td>`;
    h += `<td>${r.cap}/${r.feeders} | <span class="${gapClass}">${gapStr}</span></td>`;
    h += `<td>${infDisplay}</td>`;
    h += `<td>${projDisplay}</td>`;
    h += `<td>${alliesDisplay}</td>`;
    h += `<td class="proc-amb-net ${netClass}">${netStr}</td>`;
    h += `<td class="${projClass}">${esc(r.projStep)}${r.projStep !== r.ambience ? (r.net > 0 ? ' \u2191' : ' \u2193') : ''}</td>`;
    h += confirmCell;
    h += `</tr>`;
  }
  h += `</tbody></table></div>`;
  h += `<p class="proc-amb-note">Net +3 or above = +1 step. Net negative = \u22121 step. Net \u22125 or worse = \u22122 steps. Projects: 1\u20134 successes = 1 pt, 5+ = 2 pts.</p>`;
  return h;
}

function _buildFeedingMatrixHtml() {
  const mResidents = {};
  for (const mt of MATRIX_TERRS) {
    const tid = TERRITORY_SLUG_MAP[mt.csvKey] ?? null;
    const td = (cachedTerritories || TERRITORY_DATA).find(t => t.id === tid);
    const residents = new Set(td?.feeding_rights || []);
    if (td?.regent_id) residents.add(String(td.regent_id));
    if (td?.lieutenant_id) residents.add(String(td.lieutenant_id));
    mResidents[mt.csvKey] = residents;
  }
  // Share feeder counts with the ambience Overfeeding column — single source of truth
  const { subByCharId: mSubByCharId } = _computeMatrixFeederCounts();
  const mChars = characters.filter(c => !c.retired)
    .sort((a, b) => sortName(a).localeCompare(sortName(b)));

  return `<div class="dt-matrix-wrap">${_buildMatrixTableHtml(mChars, mSubByCharId, mResidents)}</div>`;
}

function _buildSpheresHtml() {
  function _normSphere(raw) {
    return raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }
  const active = characters.filter(c => !c.retired);
  const spheres = {};
  for (const c of active) {
    const cid = String(c._id || c.name);
    for (const m of (c.merits || [])) {
      if (m.category !== 'influence') continue;
      const dots = m.rating || 0;
      const raw = (m.area || m.qualifier || '').toString();
      if (!raw) continue;
      const ensureRow = key => {
        if (!spheres[key]) spheres[key] = {};
        if (!spheres[key][cid]) spheres[key][cid] = { name: displayName(c), allies: 0, status: 0, hasContacts: false };
        return spheres[key][cid];
      };
      if (m.name === 'Contacts') {
        for (const part of raw.split(',')) { const k = _normSphere(part); if (k) ensureRow(k).hasContacts = true; }
      } else if (m.name === 'Allies' || m.name === 'Status') {
        for (const part of raw.split(',')) {
          const k = _normSphere(part); if (!k) continue;
          const row = ensureRow(k);
          if (m.name === 'Allies') row.allies += dots; else row.status += dots;
        }
      }
    }
  }
  const data = Object.keys(spheres).map(sphere => {
    const rows = Object.values(spheres[sphere]).map(r => ({ ...r, total: r.allies + r.status }));
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    return { sphere, rows, total: rows.reduce((s, r) => s + r.total, 0) };
  }).sort((a, b) => b.total - a.total || a.sphere.localeCompare(b.sphere));

  if (!data.length) return '<p class="proc-amb-empty">No sphere data. Add Allies, Status, or Contacts influence merits with sphere qualifiers.</p>';

  let h = '<div class="spheres-grid">';
  for (const { sphere, rows, total } of data) {
    h += `<div class="sphere-card">`;
    h += `<div class="sphere-head"><span class="sphere-name">${esc(sphere)}</span><span class="sphere-total">${total} dots</span></div>`;
    h += `<ol class="sphere-card-list">`;
    for (const r of rows) {
      const parts = [];
      if (r.allies)       parts.push(`${r.allies}A`);
      if (r.status)       parts.push(`${r.status}S`);
      if (r.hasContacts)  parts.push('\u2713');
      const meta = parts.join(' \u00B7 ') || '\u2014';
      h += `<li class="sphere-card-item">`
        + `<span class="sphere-char-name">${esc(r.name)}</span>`
        + `<span class="sphere-char-meta">${meta}</span>`
        + `</li>`;
    }
    h += `</ol></div>`;
  }
  h += '</div>';
  return h;
}

function _exportCityOverview(matrix) {
  const profile = currentCycle?.discipline_profile || {};
  const notes   = currentCycle?.ambience_notes    || '';

  // Feeding data
  const _mSubByCharId = new Map();
  for (const s of submissions) {
    const c = findCharacter(s.character_name, s.player_name);
    if (c) _mSubByCharId.set(String(c._id), s);
  }
  const feeding = {};
  for (const char of characters.filter(c => !c.retired)) {
    const sub = _mSubByCharId.get(String(char._id));
    if (!sub) continue;
    const fedTerrs = _getSubFedTerrs(sub);
    if (!fedTerrs.size) continue;
    const entries = [];
    for (const csvKey of fedTerrs) {
      const mt  = MATRIX_TERRS.find(t => t.csvKey === csvKey);
      const tid = TERRITORY_SLUG_MAP[csvKey] ?? null;
      const td  = (cachedTerritories || TERRITORY_DATA).find(t => t.id === tid);
      const res = new Set(td?.feeding_rights || []);
      if (td?.regent_id)      res.add(String(td.regent_id));
      if (td?.lieutenant_id)  res.add(String(td.lieutenant_id));
      const resident = (!mt || mt.ambienceKey === null) ? null : res.has(String(char._id));
      entries.push({ territory: mt?.label || csvKey, resident });
    }
    feeding[displayName(char)] = entries;
  }

  // Actions matrix
  const PHASES = [
    { key: 'feeding', label: 'Feeding' }, { key: 'ambience', label: 'Ambience' },
    { key: 'hide_protect', label: 'Defensive' }, { key: 'investigate', label: 'Investigative' },
    { key: 'attack', label: 'Hostile' }, { key: 'support_patrol', label: 'Support/Patrol' },
    { key: 'misc', label: 'Misc' },
  ];
  const actions = {};
  for (const p of PHASES) {
    const rows = {};
    for (const t of TERRITORY_DATA) {
      const chars = (matrix?.[p.key]?.[t.id] || []).map(e => e.charName);
      if (chars.length) rows[t.name] = chars;
    }
    if (Object.keys(rows).length) actions[p.label] = rows;
  }

  // Ambience data (per territory)
  const { rows: ambienceRows } = buildAmbienceData(cachedTerritories || TERRITORY_DATA);
  const ambience_by_territory = {};
  for (const r of ambienceRows) {
    const confirmed = currentCycle?.confirmed_ambience?.[r.id];
    ambience_by_territory[r.name] = {
      current_state:    r.ambience,
      entropy:          r.entropy,
      overfeeding_gap:  r.cap - r.feeders,
      influence_net:    r.inf_pos - r.inf_neg,
      projects_net:     r.proj_pos - r.proj_neg,
      allies_net:       r.allies_pos - r.allies_neg,
      net_change:       r.net,
      projected_state:  r.projStep,
      confirmed_state:  confirmed?.ambience || null,
    };
  }

  // Territory summary (regent, residents, poachers)
  const terrs = cachedTerritories || TERRITORY_DATA;
  const territories = {};
  for (const td of terrs) {
    if (!td.name) continue;
    const regentChar = td.regent_id ? characters.find(c => String(c._id) === String(td.regent_id)) : null;
    const residents = new Set(td.feeding_rights || []);
    if (td.regent_id)      residents.add(String(td.regent_id));
    if (td.lieutenant_id)  residents.add(String(td.lieutenant_id));
    // Count poachers: chars who fed here but are not residents
    const mt = MATRIX_TERRS.find(t => (TERRITORY_SLUG_MAP[t.csvKey] ?? null) === td.id);
    let poachers = 0;
    if (mt) {
      for (const [charId, sub] of _mSubByCharId) {
        if (residents.has(charId)) continue;
        const fedTerrs = _getSubFedTerrs(sub);
        if (fedTerrs.has(mt.csvKey)) poachers++;
      }
    }
    const amb = td.ambienceKey ? getTerritoryAmbience(td.ambienceKey) : null;
    territories[td.name] = {
      ambience_state: amb || 'Unknown',
      regent:         regentChar ? displayName(regentChar) : null,
      residents:      residents.size,
      poachers,
    };
  }

  // Spheres — canonical only, retainers/job-status filtered out
  const CANONICAL_SPHERES = new Set([
    'Bureaucracy', 'Church', 'Finance', 'Health', 'High Society',
    'Industry', 'Legal', 'Media', 'Military', 'Occult',
    'Police', 'Politics', 'Street', 'Transportation', 'Underworld', 'University',
  ]);
  function _ns(raw) { return raw.trim().toLowerCase().replace(/\s+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
  const spheres = {};
  for (const c of characters.filter(ch => !ch.retired)) {
    for (const m of (c.merits || [])) {
      if (m.category !== 'influence') continue;
      const raw = (m.area || m.qualifier || '').toString();
      if (!raw) continue;
      for (const part of raw.split(',')) {
        const key = _ns(part);
        if (!key || !CANONICAL_SPHERES.has(key)) continue;
        if (!spheres[key]) spheres[key] = {};
        const cn = displayName(c);
        if (!spheres[key][cn]) spheres[key][cn] = { allies: 0, status: 0, contacts: false };
        if (m.name === 'Allies')         spheres[key][cn].allies   += m.rating || 0;
        else if (m.name === 'Status')    spheres[key][cn].status   += m.rating || 0;
        else if (m.name === 'Contacts')  spheres[key][cn].contacts  = true;
      }
    }
  }

  const payload = {
    generated_at: new Date().toISOString(),
    cycle: currentCycle?.label || 'Unknown',
    territories,
    ambience_by_territory,
    feeding_matrix: feeding,
    actions_in_territories: actions,
    discipline_profile: profile,
    spheres_of_influence: spheres,
    st_notes: notes,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `city-overview-${(currentCycle?.label || 'unknown').replace(/\s+/g, '-').toLowerCase()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function renderCityOverview() {
  const el = document.getElementById('dt-city-panel');
  if (!el) return;
  if (!submissions.length) {
    el.innerHTML = '<p class="placeholder-msg" style="padding:24px;color:var(--txt3);">No submissions yet for this cycle. The City overview populates once players submit.</p>';
    return;
  }

  const isOpen  = el.dataset.open !== 'false';
  const profile = currentCycle?.discipline_profile || {};
  const notes   = currentCycle?.ambience_notes    || '';

  // ── Build actions matrix data ──
  const TAAG_PHASES = [
    { key: 'feeding',        label: 'Feeding' },
    { key: 'ambience',       label: 'Ambience' },
    { key: 'hide_protect',   label: 'Defensive' },
    { key: 'investigate',    label: 'Investigative' },
    { key: 'attack',         label: 'Hostile' },
    { key: 'support_patrol', label: 'Support/Patrol' },
    { key: 'misc',           label: 'Misc' },
  ];
  const matrix = {};
  for (const p of TAAG_PHASES) matrix[p.key] = {};
  const queue = buildProcessingQueue(submissions);
  for (const entry of queue) {
    if (entry.source === 'project') {
      const phaseKey = entry.phase;
      if (!matrix[phaseKey]) continue;
      const sub = submissions.find(s => s._id === entry.subId);
      if (!sub) continue;
      const terrId = _resolveProjectTerritory(sub, entry.actionIdx);
      if (!terrId) continue;
      if (!matrix[phaseKey][terrId]) matrix[phaseKey][terrId] = [];
      matrix[phaseKey][terrId].push({ key: entry.key, charName: entry.charName, subId: entry.subId });
    } else if (entry.source === 'feeding') {
      for (const [terrKey, val] of Object.entries(entry.feedTerrs || {})) {
        if (!val || val === 'none') continue;
        const terrId = resolveTerrId(terrKey);
        if (!terrId) continue;
        if (!matrix['feeding'][terrId]) matrix['feeding'][terrId] = [];
        matrix['feeding'][terrId].push({ key: entry.key, charName: entry.charName, subId: entry.subId });
      }
    }
  }
  const activePhases = TAAG_PHASES.filter(p =>
    TERRITORY_DATA.some(t => (matrix[p.key][t.id] || []).length > 0)
  );

  // ── HTML ──
  let h = `<div class="dt-conflict-panel">`;

  // Header row: title toggle + export button
  h += `<div class="dt-city-panel-head">`;
  h += `<div class="dt-matrix-toggle dt-city-title" id="dt-city-toggle">${isOpen ? '\u25BC' : '\u25BA'} City Overview</div>`;
  h += `<button class="dt-city-export-btn" id="dt-city-export-btn">\u2193 Export JSON</button>`;
  h += `</div>`;

  if (isOpen) {

    // ── 1. Feeding Matrix ─────────────────────────────────────────
    h += `<div class="proc-disc-header" data-toggle="city-feed-matrix">`;
    h += `<span class="proc-amb-title">Feeding Matrix</span>`;
    h += `<span class="proc-amb-toggle">${matrixCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
    h += `</div>`;
    if (!matrixCollapsed) h += _buildFeedingMatrixHtml();

    // ── 2. Ambience ───────────────────────────────────────────────
    h += `<div class="proc-disc-header" data-toggle="city-ambience">`;
    h += `<span class="proc-amb-title">Ambience</span>`;
    h += `<button class="city-amb-recalc-btn dt-btn-sm" title="Write projected ambience to all territory records now">Recalculate Territories</button>`;
    h += `<span class="proc-amb-toggle">${ovAmbienceCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
    h += `</div>`;
    if (!ovAmbienceCollapsed) {
      // Extract TAAG feeding counts so Ambience overfeeding uses the exact same numbers
      const feedCountsByTerrId = {};
      for (const td of TERRITORY_DATA) {
        feedCountsByTerrId[td.id] = (matrix['feeding'][td.id] || []).length;
      }
      h += _buildAmbienceHtml(feedCountsByTerrId);
    }

    // ── 3. Actions in Territories ─────────────────────────────────
    h += `<div class="proc-disc-header dt-city-actions-head">`;
    h += `<span class="proc-amb-title">Actions in Territories</span>`;
    if (!activePhases.length) h += ` <span class="dt-matrix-note">No territory assignments yet</span>`;
    h += `</div>`;
    h += `<div class="dt-scroll-wrap"><table class="dt-taag-table"><thead><tr><th>Action</th>`;
    for (const t of TERRITORY_DATA) h += `<th>${esc(t.name.replace(/^The\s+/i, ''))}</th>`;
    h += `</tr></thead><tbody>`;
    if (!activePhases.length) {
      h += `<tr class="dt-taag-empty-row"><td colspan="${1 + TERRITORY_DATA.length}">Assign territories to project actions using the pills in the processing queue.</td></tr>`;
    } else {
      for (const p of TAAG_PHASES) {
        const rowEntries = matrix[p.key];
        if (!TERRITORY_DATA.some(t => (rowEntries[t.id] || []).length > 0)) continue;
        h += `<tr><td class="dt-taag-phase-lbl">${esc(p.label)}</td>`;
        for (const t of TERRITORY_DATA) {
          const chips = rowEntries[t.id] || [];
          h += `<td class="dt-taag-cell">`;
          if (chips.length) {
            h += `<div class="dt-taag-chips">`;
            for (const c of chips) h += `<span class="dt-taag-chip" data-proc-key="${esc(c.key)}" title="${esc(c.charName)}">${esc(c.charName)}</span>`;
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

    // ── 3. Discipline Profile Matrix ──────────────────────────────
    h += `<div class="proc-disc-header" data-toggle="city-disc-dash">`;
    h += `<span class="proc-amb-title">Discipline Profile</span>`;
    h += `<button class="dt-btn proc-disc-retally" id="disc-retally-btn">Retally</button>`;
    h += `<span class="proc-amb-toggle">${discDashCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
    h += `</div>`;
    if (!discDashCollapsed) {
      const discSet = new Set(), terrSet = new Set();
      for (const [terrId, discs] of Object.entries(profile)) {
        for (const [disc, count] of Object.entries(discs)) {
          if (count > 0) { discSet.add(disc); terrSet.add(terrId); }
        }
      }
      const discList = [...discSet].sort();
      const terrList = TERRITORY_DATA.filter(t => terrSet.has(t.id));
      if (!discList.length) {
        h += `<p class="proc-amb-empty">No discipline uses recorded yet.</p>`;
      } else {
        h += `<div class="dt-scroll-wrap"><table class="proc-disc-table"><thead><tr><th>Discipline</th>`;
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

    // ── 4. Spheres of Influence ───────────────────────────────────
    h += `<div class="proc-disc-header" data-toggle="city-spheres">`;
    h += `<span class="proc-amb-title">Spheres of Influence</span>`;
    h += `<span class="proc-amb-toggle">${ovSpheresCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
    h += `</div>`;
    if (!ovSpheresCollapsed) h += _buildSpheresHtml();

    // ── 5. ST Notes ───────────────────────────────────────────────
    h += `<div class="proc-amb-notes-block">`;
    h += `<label class="proc-amb-notes-lbl">ST Notes</label>`;
    h += `<textarea class="proc-amb-notes city-ov-notes" placeholder="Working notes about the city this cycle...">${esc(notes)}</textarea>`;
    h += `</div>`;
  }

  h += `</div>`; // dt-conflict-panel
  el.innerHTML = h;

  // ── Event wiring ──

  document.getElementById('dt-city-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderCityOverview();
  });

  document.getElementById('dt-city-export-btn')?.addEventListener('click', e => {
    e.stopPropagation();
    _exportCityOverview(matrix);
  });

  el.querySelector('[data-toggle="city-feed-matrix"]')?.addEventListener('click', () => {
    matrixCollapsed = !matrixCollapsed;
    renderCityOverview();
  });

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

  el.querySelector('[data-toggle="city-ambience"]')?.addEventListener('click', () => {
    ovAmbienceCollapsed = !ovAmbienceCollapsed;
    renderCityOverview();
  });

  el.querySelector('.city-amb-recalc-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    await _applyProjectedAmbience(false);
    renderCityOverview();
  });

  el.querySelectorAll('.city-amb-confirm-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!currentCycle) return;
      const terrId      = btn.dataset.terrId;
      const ambience    = btn.dataset.projStep;
      const ambienceMod = parseInt(btn.dataset.projMod, 10);
      const updated = { ...(currentCycle.confirmed_ambience || {}), [terrId]: { ambience, ambienceMod } };
      try {
        await updateCycle(currentCycle._id, { confirmed_ambience: updated });
        currentCycle.confirmed_ambience = updated;
        renderCityOverview();
      } catch (err) { console.error('Failed to confirm ambience:', err.message); }
    });
  });

  el.querySelector('[data-toggle="city-disc-dash"]')?.addEventListener('click', () => {
    discDashCollapsed = !discDashCollapsed;
    renderCityOverview();
  });

  el.querySelector('#disc-retally-btn')?.addEventListener('click', async e => {
    e.stopPropagation();
    const btn = e.currentTarget;
    btn.textContent = 'Tallying\u2026';
    btn.disabled = true;
    await recomputeDisciplineProfile();
    renderCityOverview();
  });

  el.querySelector('[data-toggle="city-spheres"]')?.addEventListener('click', () => {
    ovSpheresCollapsed = !ovSpheresCollapsed;
    renderCityOverview();
  });

  el.querySelector('.city-ov-notes')?.addEventListener('blur', async e => {
    const val = e.target.value;
    try {
      await updateCycle(selectedCycleId, { ambience_notes: val });
      const idx = allCycles.findIndex(c => c._id === selectedCycleId);
      if (idx >= 0) allCycles[idx].ambience_notes = val;
      if (currentCycle) currentCycle.ambience_notes = val;
    } catch (err) { console.error('Failed to save city notes:', err.message); }
  });
}

// ── Ambience Update After Cycle Close (Story 1.12) ──────────────────────────

/**
 * Write projected ambience (from buildAmbienceData) to all territory records.
 * @param {boolean} markApplied — if true, sets cycle.ambience_applied = true (end-of-cycle only)
 */
async function _applyProjectedAmbience(markApplied) {
  // 1. Fetch / seed territory records
  let dbTerritories = [];
  try { dbTerritories = await apiGet('/api/territories'); } catch { /* ignore */ }
  if (!dbTerritories.length) {
    for (const td of TERRITORY_DATA) {
      try { await apiPost('/api/territories', { id: td.id, name: td.name, ambience: td.ambience }); } catch { /* ignore */ }
    }
    try { dbTerritories = await apiGet('/api/territories'); } catch { /* ignore */ }
  }
  // Build id → DB record map
  const terrRecMap = {};
  for (const t of dbTerritories) { if (t.id || t.name) terrRecMap[t.id || t.name] = t; }

  // 2. Get projected values from the dashboard calculation
  const { rows } = buildAmbienceData(dbTerritories.length ? dbTerritories : TERRITORY_DATA);

  // 3. Write ALL territories (including unchanged ones — caller requested full sync)
  for (const r of rows) {
    const rec = terrRecMap[r.id];
    try {
      if (rec?._id) {
        await apiPut(`/api/territories/${rec._id}`, { ambience: r.projStep });
      } else {
        await apiPost('/api/territories', { id: r.id, name: r.name, ambience: r.projStep });
      }
      // Update cachedTerritories in-memory so dashboard reflects new values immediately
      if (cachedTerritories) {
        const ct = cachedTerritories.find(t => t.id === r.id);
        if (ct) ct.ambience = r.projStep;
      }
    } catch (err) {
      console.error(`Failed to update ambience for ${r.name}:`, err.message);
    }
  }

  // 4. Optionally mark cycle as ambience-applied
  if (markApplied && currentCycle) {
    await updateCycle(currentCycle._id, { ambience_applied: true });
    const i = allCycles.findIndex(c => c._id === currentCycle._id);
    if (i >= 0) allCycles[i].ambience_applied = true;
    if (currentCycle) currentCycle.ambience_applied = true;
  }
}

async function handleApplyAmbience(cycleId, cycle) {
  if (cycle.ambience_applied) {
    alert('Ambience changes have already been applied for this cycle.');
    return;
  }
  if (!confirm('Apply projected ambience to all territories and mark this cycle as processed?')) return;
  await _applyProjectedAmbience(true);
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
  const discVal = discName ? (_charDiscsArray(char).find(d => d.name === discName)?.dots || 0) : 0;
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
  const resp = s.responses || {};
  const spheres = raw.sphere_actions || [];
  const contacts = raw.contact_actions || {};
  const retainers = raw.retainer_actions || {};

  let contactRequests = contacts.requests || [];
  if (!contactRequests.length) {
    const cl = [];
    for (let n = 1; n <= 5; n++) { const r = resp[`contact_${n}_request`] || resp[`contact_${n}`]; if (!r) continue; cl.push(r); }
    contactRequests = cl;
  }

  const allMeritActions = [
    ...spheres,
    ...contactRequests.map(r => ({ merit_type: 'Contacts', action_type: 'Gather Info', description: r })),
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
  const _raw = sub._raw || {};
  const _resp = sub.responses || {};
  let _contactReqs = _raw.contact_actions?.requests || [];
  if (!_contactReqs.length) {
    const cl = [];
    for (let n = 1; n <= 5; n++) { const r = _resp[`contact_${n}_request`] || _resp[`contact_${n}`]; if (!r) continue; cl.push(r); }
    _contactReqs = cl;
  }
  const allActions = [
    ...(_raw.sphere_actions || []),
    ..._contactReqs.map(r => ({ merit_type: 'Contacts', action_type: 'Gather Info', description: r })),
    ...((_raw.retainer_actions?.actions || []).map(r => ({ merit_type: 'Retainer', action_type: 'Directed Action', description: r }))),
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
