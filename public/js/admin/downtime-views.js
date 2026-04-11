/**
 * Downtime domain views — admin app.
 * CSV upload, cycle management, submission overview, character bridge, feeding rolls.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { parseDowntimeCSV } from '../downtime/parser.js';
import { getCycles, getActiveCycle, createCycle, updateCycle, closeCycle, openGamePhase, getSubmissionsForCycle, upsertCycle, updateSubmission, mapRawToResponses } from '../downtime/db.js';
import { TERRITORY_DATA, AMBIENCE_CAP, FEEDING_TERRITORIES, FEED_METHODS as FEED_METHODS_DATA, DOWNTIME_SECTIONS } from '../player/downtime-data.js';
import { rollPool } from '../downtime/roller.js';
import { getAttrEffective as getAttrVal, getSkillObj, skDots } from '../data/accessors.js';
import { displayName, displayNameRaw, sortName } from '../data/helpers.js';
import { calcTotalInfluence } from '../editor/domain.js';
import { SKILLS_MENTAL, ALL_ATTRS, ALL_SKILLS, SKILL_CATS } from '../data/constants.js';
import { showRollModal } from '../downtime/roller.js';
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
let expandedId = null;
let processingMode = false;
let procExpandedKey = null;    // tracks which action row is expanded in processing mode
let cycleReminders = [];       // processing_reminders from the current cycle document
let attachReminderKey = null;  // key of the sorcery entry with Attach Reminder panel open
let cachedTerritories = null;  // territories from DB (for ambience dashboard); null = not yet loaded
let ambDashCollapsed = false;  // collapse state for the Ambience Dashboard panel
let discDashCollapsed = false; // collapse state for the Discipline Profile Matrix panel

// ── Processing Mode constants ────────────────────────────────────────────────

const PHASE_ORDER = {
  resolve_first: 0,
  feeding: 1,
  ambience_increase: 2, ambience_decrease: 2,
  hide_protect: 3,
  investigate: 4,
  attack: 5,
  patrol_scout: 6, support: 6,
  misc: 7, xp_spend: 7,
  block: 8, rumour: 8, grow: 8, acquisition: 8,
  allies: 9,
  contacts: 10,
  resources_retainers: 11,
};

const PHASE_LABELS = {
  resolve_first: 'Resolve First — Sorcery & Rituals',
  feeding: 'Phase 1 — Feeding',
  ambience: 'Phase 2 — Ambience',
  hide_protect: 'Phase 3 — Defensive',
  investigate: 'Phase 4 — Investigative',
  attack: 'Phase 5 — Hostile',
  support_patrol: 'Phase 6 — Support & Patrol',
  misc: 'Phase 7 — Miscellaneous',
  sphere: 'Sphere Actions',
  allies: 'Allies & Status',
  contacts: 'Contacts',
  resources_retainers: 'Resources & Retainers',
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
  8: 'sphere',
  9: 'allies',
  10: 'contacts',
  11: 'resources_retainers',
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
  xp_spend: 'XP Spend',
  block: 'Block',
  rumour: 'Rumour',
  grow: 'Grow',
  acquisition: 'Acquisition',
};

const ALL_ACTION_TYPES = [
  'ambience_increase', 'ambience_decrease', 'attack', 'hide_protect',
  'investigate', 'patrol_scout', 'support', 'misc', 'xp_spend',
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

// Human-readable labels for pool_status values across all action types
const POOL_STATUS_LABELS = {
  pending:   'Pending',
  validated: 'Validated',
  no_roll:   'No Roll',
  resolved:  'Resolved',
  no_effect: 'No Effect',
};

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
        { label: 'Regent Confirmed', done: !!cycle.regency_character_id },
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

export async function initDowntimeView() {
  const container = document.getElementById('downtime-content');
  if (!container) return;

  container.innerHTML = buildShell();

  document.getElementById('dt-file-input').addEventListener('change', handleFileSelect);
  document.getElementById('dt-drop-zone').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
  document.getElementById('dt-drop-zone').addEventListener('dragleave', e => { e.currentTarget.classList.remove('drag-over'); });
  document.getElementById('dt-drop-zone').addEventListener('drop', handleDrop);
  document.getElementById('dt-new-cycle').addEventListener('click', openResetWizard);
  document.getElementById('dt-close-cycle').addEventListener('click', handleCloseCycle);
  document.getElementById('dt-open-game').addEventListener('click', handleOpenGamePhase);
  document.getElementById('dt-export-all').addEventListener('click', handleExportAll);
  document.getElementById('dt-processing-btn').addEventListener('click', async () => {
    processingMode = !processingMode;
    procExpandedKey = null;
    document.getElementById('dt-processing-btn').classList.toggle('active', processingMode);
    if (processingMode) {
      await ensureTerritories();
      renderProcessingMode(document.getElementById('dt-submissions'));
    } else {
      renderSubmissions();
    }
  });
  document.getElementById('dt-cycle-sel').addEventListener('change', e => {
    selectedCycleId = e.target.value;
    loadCycleById(selectedCycleId);
  });
  await loadCharacters();
  await loadAllCycles();

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
      btn.className = 'dt-btn';
      btn.textContent = 'Preview CSV';
      btn.title = 'Load CSV for local preview — not saved to MongoDB';
      btn.style.cssText = 'border-color:var(--gold2);color:var(--gold2)';
      btn.addEventListener('click', () => inp.click());

      toolbar.appendChild(inp);
      toolbar.appendChild(btn);
    }
  }
}

function buildShell() {
  return `
    <div class="dt-toolbar">
      <div id="dt-drop-zone" class="dt-drop-zone">
        <span>Drop CSV here or </span>
        <label class="dt-file-label">
          choose file<input type="file" id="dt-file-input" accept=".csv" style="display:none">
        </label>
      </div>
      <button class="dt-btn" id="dt-new-cycle">New Cycle</button>
      <button class="dt-btn" id="dt-close-cycle" style="display:none">Close Cycle</button>
      <button class="dt-btn dt-btn-game" id="dt-open-game" style="display:none">Open Game Phase</button>
      <button class="dt-btn dt-btn-export" id="dt-export-all" style="display:none">Export All</button>
      <button class="dt-btn proc-mode-btn" id="dt-processing-btn">Processing</button>
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
    <div id="dt-matrix"></div>
    <div id="dt-conflicts"></div>
    <div id="dt-investigations"></div>
    <div id="dt-npcs"></div>
    <div id="dt-submissions" class="dt-submissions"></div>`;
}

// ── Character + player data bridge ──────────────────────────────────────────

let players = [];

async function loadCharacters() {
  try {
    characters = await apiGet('/api/characters');
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
    statusHtml += `<button class="dt-btn" id="dt-apply-ambience" style="${alreadyApplied ? 'opacity:.5' : ''}" title="${alreadyApplied ? 'Ambience already applied for this cycle' : 'Apply ambience changes from this cycle\'s resolved projects'}">
      ${alreadyApplied ? '\u2713 Ambience applied' : 'Apply Ambience Changes'}
    </button>`;
  }

  // ── GC-1: Regency Lock-In ──
  if (isActive || isGame) {
    const activeChars = characters.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
    const currentRegId = cycle.regency_character_id ? String(cycle.regency_character_id) : '';
    const opts = activeChars.map(c =>
      `<option value="${esc(String(c._id))}"${String(c._id) === currentRegId ? ' selected' : ''}>${esc(displayNameRaw(c))}</option>`
    ).join('');
    statusHtml += `<label class="dt-regency-edit"><span>Regent</span>
      <select id="dt-regency-sel" class="dt-regency-sel">
        <option value="">-- None --</option>${opts}
      </select>
    </label>`;
  } else if (isClosed && cycle.regency_character_name) {
    statusHtml += `<span class="dt-regency-badge">\u265D Regent: ${esc(cycle.regency_character_name)}</span>`;
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

  // Wire regency selector (GC-1)
  document.getElementById('dt-regency-sel')?.addEventListener('change', async e => {
    const charId = e.target.value;
    const char = charId ? characters.find(c => String(c._id) === charId) : null;
    await updateCycle(cycleId, {
      regency_character_id:   charId || null,
      regency_character_name: char ? displayName(char) : null,
    });
    const idx = allCycles.findIndex(c => c._id === cycleId);
    if (idx >= 0) {
      allCycles[idx].regency_character_id   = charId || null;
      allCycles[idx].regency_character_name = char ? displayName(char) : null;
    }
    // Show confirmation flash on the select
    const sel = document.getElementById('dt-regency-sel');
    if (sel) { sel.style.outline = '2px solid var(--gold2)'; setTimeout(() => { sel.style.outline = ''; }, 1500); }
  });

  expandedId = null;
  procExpandedKey = null;
  submissions = await getSubmissionsForCycle(cycleId);
  renderPhaseRibbon(currentCycle, submissions); // update sub-ribbon now submissions are loaded
  document.getElementById('dt-export-all').style.display = submissions.length ? '' : 'none';
  // Keep processing mode on across cycle switches — just re-render appropriately
  document.getElementById('dt-processing-btn').classList.toggle('active', processingMode);
  renderMatchSummary();
  renderFeedingScene();
  renderFeedingMatrix();
  renderConflicts();
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
  if (processingMode) {
    renderProcessingMode(document.getElementById('dt-submissions'));
    return;
  }
  const el = document.getElementById('dt-submissions');
  if (!submissions.length) {
    el.innerHTML = '<p class="placeholder">No submissions in this cycle.</p>';
    return;
  }

  const sorted = [...submissions].sort((a, b) => (a.character_name || '').localeCompare(b.character_name || ''));

  el.innerHTML = '<div class="dt-sub-list">' + sorted.map(s => {
    const raw = s._raw || {};
    const sub = raw.submission || {};
    const projects = (raw.projects || []).length;
    const spheres = (raw.sphere_actions || []).length;
    const feedMethod = raw.feeding?.method || '';
    const attended = sub.attended_last_game ? '\u2713' : '\u2717';
    const attendedClass = sub.attended_last_game ? 'dt-attended' : 'dt-absent';

    const char = findCharacter(s.character_name, s.player_name);
    const matchIcon = char ? '<span class="dt-match-icon">\u2713</span>' : '<span class="dt-unmatch-icon">\u26A0</span>';
    const clan = char ? esc(char.clan || '') : '';
    const isExpanded = expandedId === s._id;
    const rollResult = s.feeding_roll;
    const rollBadge = rollResult
      ? `<span class="dt-roll-badge rolled">${rollResult.successes} succ</span>`
      : '<span class="dt-roll-badge unrolled">No roll</span>';
    const status = s.approval_status || 'pending';
    const statusBadge = `<span class="dt-status-badge dt-status-${status}">${status}</span>`;
    const narr = s.st_review?.narrative || {};
    const NARR_KEYS = ['letter_from_home', 'touchstone_vignette', 'territory_report', 'intelligence_dossier'];
    const narrativeComplete = NARR_KEYS.every(k => narr[k]?.status === 'ready');
    const isReady = s.st_review?.outcome_visibility === 'ready';
    const isPublished = s.st_review?.outcome_visibility === 'published';
    const narrativeBadge = narrativeComplete && !isReady && !isPublished ? '<span class="dt-narr-badge">&#x2710; Narrative ready</span>' : '';
    const publishedBadge = isPublished ? '<span class="dt-pub-badge">&#x2713; Published</span>'
      : isReady ? '<span class="dt-ready-badge">&#x23F3; Ready</span>' : '';

    let h = `<div class="dt-sub-card${char ? '' : ' dt-sub-unmatched'}${isExpanded ? ' dt-sub-expanded' : ''} dt-sub-${status}" data-id="${s._id}">
      <div class="dt-sub-top dt-sub-clickable">
        ${matchIcon}
        <span class="dt-sub-name">${esc(s.character_name || '?')}</span>
        <span class="dt-sub-player">${esc(s.player_name || '')}</span>
        <span class="${attendedClass}">${attended}</span>
        ${statusBadge}
        ${rollBadge}
        ${narrativeBadge}${publishedBadge}
      </div>
      <div class="dt-sub-stats">
        ${clan ? `<span class="dt-sub-tag">${clan}</span>` : ''}
        ${projects ? `<span class="dt-sub-tag">${projects} project${projects > 1 ? 's' : ''}</span>` : ''}
        ${spheres ? `<span class="dt-sub-tag">${spheres} sphere</span>` : ''}
        ${feedMethod ? `<span class="dt-sub-tag">${esc(feedMethod)}</span>` : ''}
      </div>`;

    if (isExpanded) {
      h += renderPlayerResponses(s);
      h += renderFeedingDetail(s, raw, char);
      h += renderProjectsPanel(s, raw, char);
      h += renderMeritActionsPanel(s, raw, char);
      h += renderNarrativePanel(s);
      h += renderMechanicalSummaryPanel(s);
      h += renderStNotes(s, raw);
      h += renderApproval(s);
      h += renderExpenditurePanel(s);
      h += renderPublishPanel(s);
      h += renderExportRow(s);
    }

    h += '</div>';
    return h;
  }).join('') + '</div>';

  // Card click delegation
  // Narrative textarea autosave on blur
  el.querySelectorAll('.dt-narr-textarea').forEach(ta => {
    ta.addEventListener('blur', async e => {
      e.stopPropagation();
      const subId = ta.dataset.subId;
      const blockKey = ta.dataset.blockKey;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const text = ta.value;
      const statusKey = `st_review.narrative.${blockKey}.text`;
      try {
        await updateSubmission(subId, { [statusKey]: text });
        if (!sub.st_review) sub.st_review = {};
        if (!sub.st_review.narrative) sub.st_review.narrative = {};
        if (!sub.st_review.narrative[blockKey]) sub.st_review.narrative[blockKey] = {};
        sub.st_review.narrative[blockKey].text = text;
      } catch (err) { console.error('Narrative save error:', err.message); }
    });
  });

  // Narrative block status toggle (draft/ready)
  el.querySelectorAll('.dt-narr-status-btn').forEach(btn => {
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
        renderSubmissions();
      } catch (err) { console.error('Narrative status error:', err.message); }
    });
  });

  // Mechanical summary textarea autosave on blur
  el.querySelectorAll('.dt-mech-textarea').forEach(ta => {
    ta.addEventListener('blur', async e => {
      e.stopPropagation();
      const subId = ta.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      try {
        await updateSubmission(subId, { 'st_review.mechanical_summary': ta.value });
        if (!sub.st_review) sub.st_review = {};
        sub.st_review.mechanical_summary = ta.value;
      } catch (err) { console.error('Mech summary save error:', err.message); }
    });
  });

  // Expenditure inputs autosave on blur (GC-3)
  el.querySelectorAll('.dt-exp-input').forEach(input => {
    input.addEventListener('blur', async e => {
      e.stopPropagation();
      const subId = input.dataset.subId;
      const field = input.dataset.expField;
      const val = parseInt(input.value, 10);
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      try {
        await updateSubmission(subId, { [field]: isNaN(val) ? 0 : val });
        if (!sub.st_review) sub.st_review = {};
        const key = field.replace('st_review.', '');
        sub.st_review[key] = isNaN(val) ? 0 : val;
      } catch (err) { console.error('Expenditure save error:', err.message); }
    });
  });

  // Mechanical summary auto-draft button
  el.querySelectorAll('.dt-mech-autodraft').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const draft = buildMechanicalDraft(sub);
      const ta = btn.closest('.dt-mech-detail')?.querySelector('.dt-mech-textarea');
      if (ta) { ta.value = draft; ta.dispatchEvent(new Event('blur')); }
    });
  });

  // Publish button
  el.querySelectorAll('.dt-publish-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (sub) handlePublish(sub);
    });
  });

  // Restore pool builder select values (innerHTML can't set selected across render)
  el.querySelectorAll('.dt-pool-sel').forEach(sel => {
    const subId = sel.dataset.subId;
    const field = sel.dataset.field;
    const projIdx = sel.dataset.projIdx !== undefined ? +sel.dataset.projIdx : null;
    const meritIdx = sel.dataset.meritIdx !== undefined ? +sel.dataset.meritIdx : null;
    const sub = submissions.find(s => s._id === subId);
    if (!sub) return;
    let val = '';
    if (projIdx !== null) val = (sub._proj_pending || [])[projIdx]?.[field] || '';
    else if (meritIdx !== null) val = (sub._merit_pending || [])[meritIdx]?.[field] || '';
    if (val) sel.value = val;
  });

  el.querySelectorAll('.dt-sub-clickable').forEach(row => {
    row.addEventListener('click', () => {
      const card = row.closest('.dt-sub-card');
      const id = card.dataset.id;
      expandedId = expandedId === id ? null : id;
      renderSubmissions();
    });
  });

  // Method button delegation
  el.querySelectorAll('.dt-method-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const sub = submissions.find(s => s._id === btn.dataset.subId);
      if (sub) { sub._feed_method = btn.dataset.method; renderSubmissions(); }
    });
  });

  // Notes save delegation
  el.querySelectorAll('.dt-notes-save').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); handleSaveNotes(btn.dataset.subId); });
  });

  // Approval button delegation
  el.querySelectorAll('.dt-approval-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); handleApproval(btn.dataset.subId, btn.dataset.status); });
  });

  // Project pool select delegation
  el.querySelectorAll('.dt-proj-sel').forEach(sel => {
    sel.addEventListener('change', e => {
      e.stopPropagation();
      const subId = sel.dataset.subId;
      const idx = +sel.dataset.projIdx;
      const field = sel.dataset.field;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      if (!sub._proj_pending) sub._proj_pending = [];
      if (!sub._proj_pending[idx]) sub._proj_pending[idx] = {};
      sub._proj_pending[idx][field] = sel.value;
      renderSubmissions();
    });
  });

  // Project modifier input delegation
  el.querySelectorAll('.dt-proj-mod').forEach(inp => {
    inp.addEventListener('change', e => {
      e.stopPropagation();
      const subId = inp.dataset.subId;
      const idx = +inp.dataset.projIdx;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      if (!sub._proj_pending) sub._proj_pending = [];
      if (!sub._proj_pending[idx]) sub._proj_pending[idx] = {};
      sub._proj_pending[idx].modifier = parseInt(inp.value) || 0;
      renderSubmissions();
    });
  });

  // Project roll button delegation
  el.querySelectorAll('.dt-proj-roll-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const idx = +btn.dataset.projIdx;
      const sub = submissions.find(s => s._id === subId);
      const char = sub ? findCharacter(sub.character_name, sub.player_name) : null;
      const pen = (sub?._proj_pending || [])[idx] || {};
      const pool = buildGenericPool(char, pen.attr, pen.skill, pen.disc, pen.modifier || 0);
      showRollModal({ size: pool.total, expression: pool.expression, success: 8, exc: 5, again: 10 }, result => {
        handleProjectRollSave(subId, idx, pool, result);
      });
    });
  });

  // Project note delegation (save on blur)
  el.querySelectorAll('.dt-proj-note').forEach(ta => {
    ta.addEventListener('blur', e => {
      e.stopPropagation();
      const subId = ta.dataset.subId;
      const idx = +ta.dataset.projIdx;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      if (!sub._proj_pending) sub._proj_pending = [];
      if (!sub._proj_pending[idx]) sub._proj_pending[idx] = {};
      sub._proj_pending[idx].st_note = ta.value;
    });
  });

  // Merit action pool select/mod delegation
  el.querySelectorAll('.dt-merit-sel').forEach(sel => {
    sel.addEventListener('change', e => {
      e.stopPropagation();
      const subId = sel.dataset.subId;
      const idx = +sel.dataset.meritIdx;
      const field = sel.dataset.field;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      if (!sub._merit_pending) sub._merit_pending = [];
      if (!sub._merit_pending[idx]) sub._merit_pending[idx] = {};
      sub._merit_pending[idx][field] = sel.value;
      renderSubmissions();
    });
  });

  // Merit modifier input delegation
  el.querySelectorAll('.dt-merit-mod').forEach(inp => {
    inp.addEventListener('change', e => {
      e.stopPropagation();
      const subId = inp.dataset.subId;
      const idx = +inp.dataset.meritIdx;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      if (!sub._merit_pending) sub._merit_pending = [];
      if (!sub._merit_pending[idx]) sub._merit_pending[idx] = {};
      sub._merit_pending[idx].modifier = parseInt(inp.value) || 0;
      renderSubmissions();
    });
  });

  // Merit roll button delegation
  el.querySelectorAll('.dt-merit-roll-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const idx = +btn.dataset.meritIdx;
      const sub = submissions.find(s => s._id === subId);
      const char = sub ? findCharacter(sub.character_name, sub.player_name) : null;
      const pen = (sub?._merit_pending || [])[idx] || {};
      const pool = buildGenericPool(char, pen.attr, pen.skill, pen.disc, pen.modifier || 0);
      showRollModal({ size: pool.total, expression: pool.expression, success: 8, exc: 5, again: 10 }, result => {
        handleMeritRollSave(subId, idx, pool, result);
      });
    });
  });

  // Merit note delegation (save on blur)
  el.querySelectorAll('.dt-merit-note').forEach(ta => {
    ta.addEventListener('blur', e => {
      e.stopPropagation();
      const subId = ta.dataset.subId;
      const idx = +ta.dataset.meritIdx;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      if (!sub._merit_pending) sub._merit_pending = [];
      if (!sub._merit_pending[idx]) sub._merit_pending[idx] = {};
      sub._merit_pending[idx].st_note = ta.value;
    });
  });

  // Merit "no roll needed" delegation
  el.querySelectorAll('.dt-merit-noroll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const subId = btn.dataset.subId;
      const idx = +btn.dataset.meritIdx;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const pending = (sub._merit_pending || [])[idx] || {};
      const resolved = [...(sub.merit_actions_resolved || [])];
      while (resolved.length <= idx) resolved.push(null);
      resolved[idx] = { no_roll: true, st_note: pending.st_note || '', resolved_at: new Date().toISOString() };
      try {
        await updateSubmission(subId, { merit_actions_resolved: resolved });
        sub.merit_actions_resolved = resolved;
        renderSubmissions();
      } catch (err) { console.error('Failed to save merit no-roll:', err.message); }
    });
  });

  // Rote toggle delegation (submission review feeding row)
  el.querySelectorAll('.dt-feed-rote-chk').forEach(cb => {
    cb.addEventListener('change', async e => {
      e.stopPropagation();
      const subId = cb.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const val = cb.checked;
      await updateSubmission(subId, { 'st_review.feeding_rote': val });
      if (!sub.st_review) sub.st_review = {};
      sub.st_review.feeding_rote = val;
    });
  });

  // Pool modifier — persist on change and update display
  el.querySelectorAll('.dt-pool-mod').forEach(inp => {
    inp.addEventListener('change', async e => {
      e.stopPropagation();
      const subId = inp.dataset.subId;
      const sub = submissions.find(s => s._id === subId);
      if (!sub) return;
      const val = parseInt(inp.value) || 0;
      await updateSubmission(subId, { 'st_review.feeding_modifier': val });
      if (!sub.st_review) sub.st_review = {};
      sub.st_review.feeding_modifier = val;
      renderSubmissions();
    });
  });

  // Roll button delegation
  el.querySelectorAll('.dt-feed-roll-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.subId;
      const sub = submissions.find(s => s._id === id);
      const char = sub ? findCharacter(sub.character_name, sub.player_name) : null;

      let poolSize = 1, expression = '';
      if (char && sub._feed_method) {
        const modInput = btn.closest('.dt-feed-detail')?.querySelector('.dt-pool-mod');
        const stMod = modInput ? (parseInt(modInput.value) || 0) : (sub.st_review?.feeding_modifier || 0);
        const pool = buildFeedingPool(char, sub._feed_method, stMod);
        poolSize = pool ? pool.total : 1;
        if (pool) {
          const bd = pool.breakdown;
          expression = `${bd.attrVal} ${bd.attr} + ${bd.skillVal} ${bd.skill}`;
          if (bd.fg) expression += ` + ${bd.fg} FG`;
          if (stMod) expression += ` ${stMod >= 0 ? '+' : '-'} ${Math.abs(stMod)} ST`;
          expression += ` = ${pool.total}`;
        }
      } else {
        const input = btn.closest('.dt-feed-detail')?.querySelector('.dt-pool-input');
        poolSize = input ? parseInt(input.value) || 1 : 1;
        expression = `${poolSize} dice`;
      }

      const isRote = sub?.st_review?.feeding_rote || false;
      const existingRoll = sub?.feeding_roll || rollPool(poolSize, 10, 8, 5, isRote);
      showRollModal(
        { size: poolSize, expression: `Feeding: ${expression}`, existingRoll },
        async result => {
          await updateSubmission(id, { feeding_roll: result });
          const s = submissions.find(s => s._id === id);
          if (s) s.feeding_roll = result;
          renderMatchSummary();
          renderSubmissions();
        }
      );
    });
  });

  // Export button delegation
  el.querySelectorAll('.dt-export-btn').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); handleExportSingle(btn.dataset.subId); });
  });
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
        h += `<span class="dt-pool-mod-wrap"><label class="dt-feed-lbl" style="display:inline">Mod</label> <input type="number" class="dt-pool-mod" data-sub-id="${esc(s._id)}" value="${stMod}" min="-20" max="20" step="1" style="width:52px"></span>`;
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

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) processFile(file);
}

function handleDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) processFile(file);
}

async function processFile(file) {
  const warnEl = document.getElementById('dt-warnings');
  warnEl.innerHTML = '';

  const text = await file.text();
  const { submissions: parsed, warnings } = parseDowntimeCSV(text);

  if (warnings.length) {
    warnEl.innerHTML = warnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('');
  }

  if (!parsed.length) {
    warnEl.innerHTML += '<div class="dt-warn">No submissions found in CSV.</div>';
    return;
  }

  // Enrich each parsed submission with character_id via combined fuzzy matching
  const matchWarnings = [];
  for (const sub of parsed) {
    const { character, warnings: mw } = matchSubmission(sub);
    if (character) sub._character_id = character._id;
    matchWarnings.push(...mw);
  }
  if (matchWarnings.length) {
    warnEl.innerHTML += matchWarnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('');
  }

  try {
    const result = await upsertCycle(parsed, characters);
    const matched = parsed.filter(s => s._character_id).length;
    const unmatched = parsed.length - matched;
    let msg = `Loaded ${result.created} new, ${result.updated} updated submissions.`;
    if (unmatched) msg += ` ${unmatched} submission${unmatched > 1 ? 's' : ''} could not be linked to a character.`;
    warnEl.innerHTML = (matchWarnings.length ? matchWarnings.map(w => `<div class="dt-warn">${esc(w)}</div>`).join('') : '')
      + `<div class="dt-success">${esc(msg)}</div>`;
    await loadAllCycles();
  } catch (err) {
    warnEl.innerHTML += `<div class="dt-warn">Import failed: ${esc(err.message)}</div>`;
    console.error('Downtime CSV import failed:', err);
  }
}

// ── Dev CSV Preview (localhost only — no MongoDB writes) ─────────────────────

async function processFilePreview(file) {
  const warnEl = document.getElementById('dt-warnings');
  warnEl.innerHTML = '<div class="dt-warn" style="background:rgba(224,196,122,.08);border-color:var(--gold2);color:var(--gold2)">&#9888; Preview mode — data is not saved to MongoDB.</div>';

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
  document.getElementById('dt-close-cycle').style.display = 'none';
  document.getElementById('dt-open-game').style.display = 'none';
  document.getElementById('dt-cycle-status').innerHTML =
    `<span class="dt-status-badge dt-status-approved">preview</span><span class="domain-count">${devSubs.length} submissions</span>`;
  renderSnapshotPanel(devCycle);
  renderMatchSummary();
  renderFeedingScene();
  renderFeedingMatrix();
  renderConflicts();
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
  overlay.querySelector('#gc-begin').addEventListener('click', () => {
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
  if (pendingSubs.length) items += `<li class="gc-chk-warn">&#9651; ${pendingSubs.length} submission${pendingSubs.length !== 1 ? 's' : ''} not yet reviewed</li>`;
  if (missingExp.length) items += `<li class="gc-chk-warn">&#9651; ${missingExp.length} approved submission${missingExp.length !== 1 ? 's' : ''} missing expenditure data</li>`;
  if (noFeed.length) items += `<li class="gc-chk-warn">&#9651; ${noFeed.length} submission${noFeed.length !== 1 ? 's' : ''} with no feeding roll</li>`;
  if (!items) items = '<li class="gc-chk-ok">&#10003; All checks passed</li>';

  const hasWarnings = pendingSubs.length || missingExp.length || noFeed.length;

  return `<div class="gc-wizard-box">
    <div class="gc-wizard-title">Cycle Reset Wizard</div>
    <div class="gc-wizard-sub">Closing: <strong>${esc(cycle.label || 'Unnamed')}</strong></div>
    <ul class="gc-checklist">${items}</ul>
    ${hasWarnings ? '<p class="gc-chk-note">Warnings are advisory. You may still proceed.</p>' : ''}
    <div class="gc-label-row">
      <span class="gc-label-lbl">New cycle</span>
      <span class="gc-next-cycle-name">Downtime ${nextNum}</span>
    </div>
    <div class="gc-wizard-actions">
      <button id="gc-cancel" class="dt-btn">Cancel</button>
      <button id="gc-begin" class="dt-btn dt-btn-gold">Begin Reset</button>
    </div>
  </div>`;
}

const RESET_PHASES = [
  { id: 'snapshot',  label: 'Capture cycle snapshot' },
  { id: 'income',    label: 'Apply influence income' },
  { id: 'mutations', label: 'Confirm XP mutations' },
  { id: 'publish',   label: 'Publish outcomes to players' },
  { id: 'tracks',    label: 'Reset character tracks' },
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

    const resolve   = (char.attributes?.mental?.resolve?.dots   || 0) + (char.attributes?.mental?.resolve?.bonus   || 0);
    const composure = (char.attributes?.social?.composure?.dots || 0) + (char.attributes?.social?.composure?.bonus || 0);
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

  // Phase 6: Close old cycle + create new
  setPhaseState(overlay, 'new-cycle', 'running');
  try {
    await closeCycle(cycleId);
    await createCycle(nextNum);
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
    const charName = sub.character_name || '?';

    // ── Sorcery (resolve_first) ──
    const sorcCount = parseInt(resp['sorcery_slot_count'] || '1', 10);
    // Tradition detection: check character disciplines for Cruac or Theban
    const sorcChar = charMap.get((charName || '').toLowerCase().trim());
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
      const feedMethod  = resp['_feed_method'] || '';
      const feedDisc    = resp['_feed_disc']   || '';
      const feedDesc    = resp['feeding_description'] || '';
      const feedSpec    = resp['_feed_spec']   || '';
      const feedRote    = resp['_feed_rote'] === 'yes' || sub.st_review?.feeding_rote || false;
      let   feedTerrs   = {};
      try { feedTerrs = JSON.parse(resp['feeding_territories'] || '{}'); } catch { feedTerrs = {}; }
      const primaryTerr = Object.keys(feedTerrs).find(k => feedTerrs[k] === 'resident')
                       || Object.keys(feedTerrs).find(k => feedTerrs[k] && feedTerrs[k] !== 'none')
                       || '';
      const methodLabel = feedMethod ? (FEED_METHOD_LABELS_MAP[feedMethod] || feedMethod) : '';
      const poolLabel   = [methodLabel, feedDisc].filter(Boolean).join(' + ');
      queue.push({
        key: `${sub._id}:feeding`,
        subId: sub._id,
        charName,
        phase: PHASE_NUM_TO_LABEL[1],
        phaseNum: 1,
        actionType: 'feeding',
        label: 'Feeding',
        description: feedDesc || poolLabel || 'No feeding method declared',
        source: 'feeding',
        actionIdx: 0,
        poolPlayer: poolLabel,
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
      const phaseNum = PHASE_ORDER[actionType] ?? 7;
      const phaseKey = PHASE_NUM_TO_LABEL[phaseNum];
      const slot = idx + 1; // 1-indexed response key
      queue.push({
        key: `${sub._id}:proj:${idx}`,
        subId: sub._id,
        charName,
        phase: phaseKey,
        phaseNum,
        actionType,
        label: ACTION_TYPE_LABELS[actionType] || actionType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        description: proj.detail || proj.desired_outcome || '',
        source: 'project',
        actionIdx: idx,
        projSlot: slot,
        poolPlayer: proj.primary_pool?.expression || resp[`project_${slot}_pool_expr`] || '',
        projTitle:     resp[`project_${slot}_title`]    || '',
        projOutcome:   proj.desired_outcome || resp[`project_${slot}_outcome`] || '',
        projCast:      resp[`project_${slot}_cast`]     || '',
        projMerits:    resp[`project_${slot}_merits`]   || '',
        projTerritory: resp[`project_${slot}_territory`] || '',
      });
    });

    // ── Merit/Sphere actions ──
    const spheres  = raw.sphere_actions || [];
    const contacts = raw.contact_actions?.requests || [];
    const retainers = raw.retainer_actions?.actions || [];

    // merit_actions_resolved uses a flat index: spheres, then contacts, then retainers
    let meritFlatIdx = 0;

    spheres.forEach((action, idx) => {
      const actionType = action.action_type || 'misc';
      const meritType  = (action.merit_type || '').toLowerCase();
      let phaseNum;
      const isAlliesAction = /allies|status/.test(meritType);
      if (isAlliesAction) {
        phaseNum = 9;
      } else if (/contact/.test(meritType)) {
        phaseNum = 10;
      } else if (/retainer|resource/.test(meritType)) {
        phaseNum = 11;
      } else {
        phaseNum = PHASE_ORDER[actionType] ?? 8;
      }
      const phaseKey = PHASE_NUM_TO_LABEL[phaseNum];
      queue.push({
        key: `${sub._id}:merit:${meritFlatIdx}`,
        subId: sub._id,
        charName,
        phase: phaseKey,
        phaseNum,
        actionType,
        label: `${action.merit_type || 'Merit'}: ${ACTION_TYPE_LABELS[actionType] || actionType}`,
        description: action.description || action.desired_outcome || '',
        source: 'merit',
        actionIdx: meritFlatIdx,
        poolPlayer: action.primary_pool?.expression || '',
        isAlliesAction,
      });
      meritFlatIdx++;
    });

    contacts.forEach((req, idx) => {
      queue.push({
        key: `${sub._id}:merit:${meritFlatIdx}`,
        subId: sub._id,
        charName,
        phase: PHASE_NUM_TO_LABEL[10],
        phaseNum: 10,
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
        phase: PHASE_NUM_TO_LABEL[11],
        phaseNum: 11,
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
    const active = Object.entries(feedTerrs).filter(([, v]) => v && v !== 'none').map(([k]) => k);
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
      const territory = sub.responses?.[`project_${pIdx + 1}_territory`] || '';
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
  the_city_harbour:         'harbour',
  the_dockyards:            'dockyards',
  the_docklands:            'dockyards',   // legacy
  the_second_city:          'secondcity',
  the_northern_shore:       'northshore',
  the_barrens__no_territory_: null,  // no territory
  // MATRIX_TERRS display-name keys (from _raw.feeding.territories)
  'The Academy':            'academy',
  'The City Harbour':       'harbour',
  'The Harbour':            'harbour',   // short form used in _raw.influence
  'The Dockyards':          'dockyards',
  'The Docklands':          'dockyards',   // legacy
  'The Second City':        'secondcity',
  'The Northern Shore':     'northshore',
  'The Shore':              'northshore', // short form used in _raw.influence
  'The Barrens':            null,
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

/**
 * Build the per-territory aggregation data for the ambience dashboard.
 * Returns an array of row objects (one per territory).
 */
function buildAmbienceData(terrs) {
  // terrs: array from cachedTerritories / TERRITORY_DATA, keyed by .id
  const terrById = {};
  for (const t of TERRITORY_DATA) terrById[t.id] = t;

  // Find current ambience from DB records (which may differ from TERRITORY_DATA defaults)
  const startingAmbience = {};
  if (terrs && terrs.length) {
    for (const t of terrs) {
      const td = TERRITORY_DATA.find(d => d.id === t.id || d.name === t.name);
      if (td) startingAmbience[td.id] = t.ambience || td.ambience;
    }
  }
  // Fallback to TERRITORY_DATA
  for (const td of TERRITORY_DATA) {
    if (!startingAmbience[td.id]) startingAmbience[td.id] = td.ambience;
  }

  // ── Overfeeding: count feeders per territory ──
  // Reads from responses.feeding_territories (slug keys) with fallback to _raw.feeding.territories
  // (display-name keys) for submissions uploaded before normaliseTerritoryGrid was added.
  const feederCounts = {};
  for (const sub of submissions) {
    let grid = {};
    const respStr = sub.responses?.feeding_territories;
    if (respStr) {
      try { grid = JSON.parse(respStr); } catch { grid = {}; }
    } else {
      // Fallback: _raw feeding territories use display-name keys ('The Academy': 'Resident')
      grid = sub._raw?.feeding?.territories || {};
    }
    for (const [k, v] of Object.entries(grid)) {
      if (!v || v === 'none' || v === 'Not feeding here') continue;
      const tid = resolveTerrId(k);
      if (!tid) continue; // skip barrens / unrecognised
      feederCounts[tid] = (feederCounts[tid] || 0) + 1;
    }
  }

  // ── Influence: sum numeric amounts per territory ──
  // influence_territories stores { "The Academy": 3, "The Dockyards": -2, ... }
  // Positive values = ambience increase; negative = decrease.
  const infPos = {}, infNeg = {};
  for (const sub of submissions) {
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
    // Resolved merit actions (ST-tagged post-processing)
    for (const act of (sub.merit_actions_resolved || [])) {
      if (!['validated', 'no_roll'].includes(act.status)) continue;
      const tid = resolveTerrId(act.territory || '');
      if (!tid) continue;
      if (act.action_type === 'ambience_increase') infPos[tid] = (infPos[tid] || 0) + 1;
      else if (act.action_type === 'ambience_decrease') infNeg[tid] = (infNeg[tid] || 0) + 1;
    }
  }

  // ── Projects: sum roll successes from ambience project actions ──
  const projPos = {}, projNeg = {};
  let pendingAmbienceCount = 0;
  for (const sub of submissions) {
    // Count pending: ambience project actions in form responses with no resolved roll
    for (let n = 1; n <= 4; n++) {
      const action = sub.responses?.[`project_${n}_action`];
      if (action !== 'ambience_increase' && action !== 'ambience_decrease') continue;
      const resolved = (sub.projects_resolved || [])[n - 1];
      if (!resolved?.roll) pendingAmbienceCount++;
    }
    // Sum resolved roll successes
    for (const [idx, proj] of (sub.projects_resolved || []).entries()) {
      if (!proj) continue;
      if (proj.action_type !== 'ambience_increase' && proj.action_type !== 'ambience_decrease') continue;
      if (!proj.roll) continue;
      const n = idx + 1;
      const terrRaw = sub.responses?.[`project_${n}_territory`] || '';
      const desc = sub.responses?.[`project_${n}_description`] || '';
      const outcome = sub.responses?.[`project_${n}_outcome`] || '';
      const tid = resolveTerrId(terrRaw) || extractTerritoryFromText(desc) || extractTerritoryFromText(outcome);
      if (!tid) continue;
      const successes = proj.roll.successes ?? 0;
      if (proj.action_type === 'ambience_increase') projPos[tid] = (projPos[tid] || 0) + successes;
      else projNeg[tid] = (projNeg[tid] || 0) + successes;
    }
  }

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
    const net = entropy + overfeedVal + influence + projects;
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
    return { id, name: td.name, ambience, entropy, overfeed: overfeedVal, feeders, cap, inf_pos, inf_neg, influence, proj_pos, proj_neg, projects, net, projStep };
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
      <th title="Sum of all columns">Net Change</th>
      <th title="Projected new ambience step (preview only)">Projected</th>
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
      h += `<td class="proc-amb-net ${netClass}">${netStr}</td>`;
      h += `<td class="${projClass}">${esc(r.projStep)}${r.projStep !== r.ambience ? (r.net > 0 ? ' &#8593;' : ' &#8595;') : ''}</td>`;
      h += `</tr>`;
    }
    h += `</tbody></table>`;
    h += `<p class="proc-amb-note">Net change is informational. Positive net = +1 step. Negative net = -1 step. Net below -5 = -2 steps.</p>`;

    // ── Discipline Profile Matrix ──
    h += `<div class="proc-disc-header" data-toggle="disc-dash">`;
    h += `<span class="proc-amb-title">Discipline Profile Matrix</span>`;
    h += `<span class="proc-amb-toggle">${discDashCollapsed ? '&#9660; Show' : '&#9650; Hide'}</span>`;
    h += `</div>`;

    if (!discDashCollapsed) {
      // Find disciplines and territories with any count > 0
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
        h += `</tbody></table>`;
      }
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

/** Render the phase-ordered processing queue into the given container. */
function renderProcessingMode(container) {
  if (!submissions.length) {
    container.innerHTML = '<p class="placeholder">No submissions in this cycle.</p>';
    return;
  }

  const queue = buildProcessingQueue(submissions);
  if (!queue.length) {
    container.innerHTML = '<p class="placeholder">No actions found in this cycle.</p>';
    return;
  }

  // Group by phase
  const byPhase = new Map();
  for (const entry of queue) {
    if (!byPhase.has(entry.phase)) byPhase.set(entry.phase, []);
    byPhase.get(entry.phase).push(entry);
  }

  let h = '<div class="proc-queue">';

  // Ambience Dashboard — always shown at top of Processing Mode
  h += renderAmbienceDashboard();

  for (const [phaseKey, entries] of byPhase) {
    const label = PHASE_LABELS[phaseKey] || phaseKey;
    h += `<div class="proc-phase-section">`;
    h += `<div class="proc-phase-header">${esc(label)} <span class="proc-phase-count">${entries.length} action${entries.length !== 1 ? 's' : ''}</span></div>`;

    for (const entry of entries) {
      const isExpanded = procExpandedKey === entry.key;
      const review = getEntryReview(entry);
      const status = review?.pool_status || 'pending';
      const shortDesc = entry.description.length > 80 ? entry.description.slice(0, 77) + '...' : entry.description;

      h += `<div class="proc-action-row${isExpanded ? ' expanded' : ''}" data-proc-key="${esc(entry.key)}">`;
      h += `<span class="proc-row-char">${esc(entry.charName)}</span>`;
      h += `<span class="proc-row-label">${esc(entry.label)}</span>`;
      h += `<span class="proc-row-desc" title="${esc(entry.description)}">${esc(shortDesc || '—')}</span>`;
      h += `<span class="proc-row-status ${status}">${POOL_STATUS_LABELS[status] || status}</span>`;
      h += '</div>';

      if (isExpanded) {
        h += renderActionPanel(entry, review);
      }
    }

    h += '</div>'; // proc-phase-section
  }

  h += '</div>'; // proc-queue
  container.innerHTML = h;

  // Wire row clicks
  container.querySelectorAll('.proc-action-row').forEach(row => {
    row.addEventListener('click', () => {
      const key = row.dataset.procKey;
      procExpandedKey = procExpandedKey === key ? null : key;
      renderProcessingMode(container);
    });
  });

  // Wire validation status buttons (stop propagation so row click doesn't fire)
  container.querySelectorAll('.proc-val-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key = btn.dataset.procKey;
      const status = btn.dataset.status;
      const entry = buildProcessingQueue(submissions).find(q => q.key === key);
      if (!entry) return;
      await saveEntryReview(entry, { pool_status: status });
      renderProcessingMode(container);
    });
  });

  // Wire pool_validated input (save on blur)
  container.querySelectorAll('.proc-pool-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('blur', async e => {
      const key = inp.dataset.procKey;
      const entry = buildProcessingQueue(submissions).find(q => q.key === key);
      if (!entry) return;
      await saveEntryReview(entry, { pool_validated: inp.value.trim() });
    });
  });

  // Wire player_feedback input (save on blur)
  container.querySelectorAll('.proc-feedback-input').forEach(inp => {
    inp.addEventListener('click', e => e.stopPropagation());
    inp.addEventListener('blur', async e => {
      const key = inp.dataset.procKey;
      const entry = buildProcessingQueue(submissions).find(q => q.key === key);
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
      const entry = buildProcessingQueue(submissions).find(q => q.key === key);
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

  // Wire re-tag selects
  container.querySelectorAll('.proc-retag-sel').forEach(sel => {
    sel.addEventListener('click', e => e.stopPropagation());
    sel.addEventListener('change', async e => {
      e.stopPropagation();
      const key = sel.dataset.procKey;
      const newType = sel.value;
      const entry = buildProcessingQueue(submissions).find(q => q.key === key);
      if (!entry) return;
      // Save the new action_type on the appropriate resolved object
      if (entry.source === 'project') {
        const sub = submissions.find(s => s._id === entry.subId);
        if (!sub) return;
        const resolved = [...(sub.projects_resolved || [])];
        while (resolved.length <= entry.actionIdx) resolved.push(null);
        resolved[entry.actionIdx] = { ...(resolved[entry.actionIdx] || {}), action_type: newType };
        await updateSubmission(entry.subId, { projects_resolved: resolved });
        sub.projects_resolved = resolved;
      }
      procExpandedKey = null;
      renderProcessingMode(container);
    });
  });

  // Wire project / merit roll buttons
  container.querySelectorAll('.proc-action-roll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const entry = buildProcessingQueue(submissions).find(q => q.key === key);
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
  container.querySelectorAll('.proc-feed-roll-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const key   = btn.dataset.procKey;
      const subId = btn.dataset.subId;
      const isRote = btn.dataset.rote === 'true';
      const entry = buildProcessingQueue(submissions).find(q => q.key === key);
      if (!entry) return;
      const review = getEntryReview(entry);
      const poolValidated = review?.pool_validated || '';
      if (!poolValidated) return;
      const match = poolValidated.match(/(\d+)\s*$/);
      const diceCount = match ? parseInt(match[1], 10) : 0;
      if (!diceCount) { alert('Cannot parse dice count from validated pool expression.'); return; }
      const sub = submissions.find(s => s._id === subId);
      showRollModal(
        { size: diceCount, expression: `Feeding: ${poolValidated}`, existingRoll: sub?.feeding_roll, rote: isRote },
        async result => {
          await updateSubmission(subId, { feeding_roll: result });
          if (sub) sub.feeding_roll = result;
          renderProcessingMode(container);
        }
      );
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

      const entry = buildProcessingQueue(submissions).find(q => q.key === key);
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

  // Wire Ambience Dashboard collapse toggles
  container.querySelector('[data-toggle="amb-dash"]')?.addEventListener('click', () => {
    ambDashCollapsed = !ambDashCollapsed;
    renderProcessingMode(container);
  });
  container.querySelector('[data-toggle="disc-dash"]')?.addEventListener('click', () => {
    discDashCollapsed = !discDashCollapsed;
    renderProcessingMode(container);
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

  // Wire open-sub links
  container.querySelectorAll('.proc-open-sub-link').forEach(link => {
    link.addEventListener('click', e => {
      e.stopPropagation();
      const subId = link.dataset.subId;
      // Switch to per-character view and expand the relevant submission
      processingMode = false;
      procExpandedKey = null;
      document.getElementById('dt-processing-btn').classList.remove('active');
      expandedId = subId;
      renderSubmissions();
      // Scroll to submission card
      setTimeout(() => {
        const card = document.querySelector(`.dt-sub-card[data-id="${subId}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
    });
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
  h += '<div class="proc-detail-label" style="margin-bottom:6px">Reminder Text</div>';
  h += `<input class="proc-attach-text" type="text" data-proc-key="${esc(entry.key)}" placeholder="e.g. +4 to pool, Rote quality, -1 Vitae" style="width:100%;margin-bottom:12px">`;
  h += '<div class="proc-detail-label" style="margin-bottom:6px">Attach to Actions:</div>';
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
    h += '<p style="color:var(--txt3);font-size:12px">No other actions in this cycle.</p>';
  }

  h += '</div>'; // proc-attach-actions
  h += '<div class="proc-attach-btn-row">';
  h += `<button class="dt-btn proc-attach-confirm-btn" data-proc-key="${esc(entry.key)}">Attach</button>`;
  h += `<button class="dt-btn proc-attach-cancel-btn" data-proc-key="${esc(entry.key)}">Cancel</button>`;
  h += '</div>';
  h += '</div>'; // proc-attach-panel
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
  const isSorcery     = entry.source === 'sorcery';

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

  // Full description if it was truncated
  if (entry.description && entry.description.length > 80) {
    h += `<p style="font-size:13px;color:var(--txt1);margin:0 0 12px">${esc(entry.description)}</p>`;
  }

  // ── Project-specific detail display ──
  if (entry.source === 'project') {
    const hasExtra = entry.projTitle || entry.projOutcome || entry.projCast || entry.projMerits || entry.projTerritory;
    if (hasExtra) {
      h += '<div class="proc-proj-detail">';
      if (entry.projTitle)     h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Title</span> ${esc(entry.projTitle)}</div>`;
      if (entry.projOutcome)   h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Desired Outcome</span> ${esc(entry.projOutcome)}</div>`;
      if (entry.projTerritory) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Territory</span> ${esc(entry.projTerritory)}</div>`;
      if (entry.projCast)      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Characters Involved</span> ${esc(entry.projCast)}</div>`;
      if (entry.projMerits)    h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Merits Used</span> ${esc(entry.projMerits)}</div>`;
      h += '</div>';
    }
    // Previous roll result
    const projSub = submissions.find(s => s._id === entry.subId);
    const projRoll = projSub?.projects_resolved?.[entry.actionIdx]?.roll;
    if (projRoll) {
      h += `<div class="proc-feed-roll-result">\u2713 Rolled: ${esc(String(projRoll.successes))} success${projRoll.successes !== 1 ? 'es' : ''}${projRoll.exceptional ? ' \u2014 exceptional' : ''}</div>`;
    }
  }

  // ── Merit action previous roll result ──
  if (entry.source === 'merit') {
    const meritSub  = submissions.find(s => s._id === entry.subId);
    const meritRoll = meritSub?.merit_actions_resolved?.[entry.actionIdx]?.roll;
    if (meritRoll) {
      h += `<div class="proc-feed-roll-result">\u2713 Rolled: ${esc(String(meritRoll.successes))} success${meritRoll.successes !== 1 ? 'es' : ''}${meritRoll.exceptional ? ' \u2014 exceptional' : ''}</div>`;
    }
    if (entry.isAlliesAction && poolStatus === 'pending') {
      h += `<div class="proc-allies-hint">Allies actions within favour rating are typically automatic \u2014 consider "No Roll Needed".</div>`;
    }
  }

  // ── Feeding-specific detail display ──
  if (entry.source === 'feeding') {
    if (entry.noMethod) {
      h += `<div class="proc-feed-no-method">No feeding method declared by player.</div>`;
    } else {
      h += '<div class="proc-feed-info">';
      h += `<span class="proc-feed-field"><span class="proc-feed-lbl">Method</span> ${esc(entry.feedMethodLabel || entry.feedMethod)}</span>`;
      if (entry.feedDisc) h += `<span class="proc-feed-field"><span class="proc-feed-lbl">Discipline</span> ${esc(entry.feedDisc)}</span>`;
      if (entry.feedSpec) h += `<span class="proc-feed-field"><span class="proc-feed-lbl">Specialisation</span> ${esc(entry.feedSpec)}</span>`;
      if (entry.feedRote) h += `<span class="proc-feed-field proc-feed-rote-badge">Rote</span>`;
      const activeTerms = Object.entries(entry.feedTerrs || {}).filter(([, v]) => v && v !== 'none')
        .map(([k, v]) => `${k.replace(/_/g, ' ')} (${v})`).join(', ');
      if (activeTerms) h += `<span class="proc-feed-field"><span class="proc-feed-lbl">Territory</span> ${esc(activeTerms)}</span>`;
      if (entry.primaryTerr) {
        const terrRec = TERRITORY_DATA.find(t => t.id === entry.primaryTerr || t.name === entry.primaryTerr || t.name?.toLowerCase() === entry.primaryTerr.replace(/_/g, ' ').toLowerCase());
        const amb = terrRec?.ambienceMod ?? 0;
        if (amb !== 0) h += `<span class="proc-feed-field"><span class="proc-feed-lbl">Ambience</span> ${amb > 0 ? '+' : ''}${amb}</span>`;
      }
      h += '</div>';
    }
    // Previous roll result
    const feedSub = submissions.find(s => s._id === entry.subId);
    const feedRoll = feedSub?.feeding_roll;
    if (feedRoll) {
      const roteTag = feedRoll.params?.rote ? ' (rote)' : '';
      h += `<div class="proc-feed-roll-result">\u2713 Rolled: ${esc(String(feedRoll.successes))} success${feedRoll.successes !== 1 ? 'es' : ''}${feedRoll.exceptional ? ' \u2014 exceptional' : ''}${roteTag}</div>`;
    }
  }

  // Pool row
  h += '<div class="proc-detail-grid">';
  h += '<div class="proc-detail-col">';
  h += `<div class="proc-detail-label">Player's Submitted Pool</div>`;
  h += `<div class="proc-detail-value">${esc(poolPlayer || '—')}</div>`;
  h += '</div>';
  h += '<div class="proc-detail-col">';
  h += `<div class="proc-detail-label">ST Validated Pool</div>`;
  h += `<input class="proc-pool-input" type="text" data-proc-key="${esc(entry.key)}" value="${esc(poolValidated)}" placeholder="Enter validated pool...">`;
  h += '</div>';
  h += '</div>'; // proc-detail-grid

  // Validation status — sorcery uses Resolved/No Effect labels
  const statusOptions = isSorcery
    ? [['pending', 'Pending'], ['resolved', 'Resolved'], ['no_effect', 'No Effect']]
    : [['pending', 'Pending'], ['validated', 'Validated'], ['no_roll', 'No Roll Needed']];

  h += '<div style="margin-bottom:12px">';
  h += '<div class="proc-detail-label" style="margin-bottom:6px">Validation Status</div>';
  h += '<div class="proc-val-status">';
  for (const [val, label] of statusOptions) {
    h += `<button class="proc-val-btn${poolStatus === val ? ` active ${val}` : ''}" data-proc-key="${esc(entry.key)}" data-status="${val}">${label}</button>`;
  }
  h += '</div>';
  h += '</div>';

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
        h += `<div style="margin-bottom:12px">`;
        h += `<button class="dt-btn proc-attach-open-btn" data-proc-key="${esc(entry.key)}">Attach Reminder</button>`;
        if (reminderCount) {
          h += ` <span class="proc-attach-count">Reminders attached to ${reminderCount} action${reminderCount !== 1 ? 's' : ''}.</span>`;
        }
        h += `</div>`;
      }
    } else if (reminderCount) {
      h += `<div class="proc-attach-count" style="margin-bottom:12px">Reminders attached to ${reminderCount} action${reminderCount !== 1 ? 's' : ''}.</div>`;
    }
  }

  // Roll button for validated project / merit entries
  if ((entry.source === 'project' || entry.source === 'merit') && poolStatus === 'validated') {
    h += '<div style="margin-bottom:12px">';
    h += `<button class="dt-btn proc-action-roll-btn" data-proc-key="${esc(entry.key)}" data-sub-id="${esc(entry.subId)}">Roll</button>`;
    h += '</div>';
  }

  // Roll button for validated feeding entries
  if (entry.source === 'feeding' && poolStatus === 'validated') {
    const feedSub  = submissions.find(s => s._id === entry.subId);
    const isRote   = entry.feedRote || feedSub?.st_review?.feeding_rote || false;
    h += '<div style="margin-bottom:12px">';
    h += `<button class="dt-btn proc-feed-roll-btn" data-proc-key="${esc(entry.key)}" data-sub-id="${esc(entry.subId)}" data-rote="${isRote}">Roll Feeding</button>`;
    h += '</div>';
  }

  // Player feedback
  h += '<div style="margin-bottom:12px">';
  h += '<div class="proc-detail-label" style="margin-bottom:6px">Player Feedback</div>';
  h += `<input class="proc-feedback-input" type="text" data-proc-key="${esc(entry.key)}" value="${esc(feedback)}" placeholder="Visible to player (pool correction reason, etc.)...">`;
  h += '</div>';

  // ST Notes thread
  h += '<div style="margin-bottom:12px">';
  h += '<div class="proc-detail-label" style="margin-bottom:6px">ST Notes (ST only)</div>';
  if (thread.length) {
    h += '<div class="proc-notes-thread">';
    for (const note of thread) {
      const time = note.created_at
        ? new Date(note.created_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        : '';
      h += '<div class="proc-note-entry">';
      h += `<div class="proc-note-meta">${esc(note.author_name)}${time ? '  \u00B7  ' + esc(time) : ''}</div>`;
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

  // Re-tag action type (for project actions only)
  if (entry.source === 'project') {
    h += '<div class="proc-retag-row">';
    h += '<span class="proc-detail-label" style="text-transform:none;letter-spacing:0">Re-tag action type:</span>';
    h += `<select class="proc-retag-sel" data-proc-key="${esc(entry.key)}">`;
    for (const type of ALL_ACTION_TYPES) {
      h += `<option value="${type}"${type === entry.actionType ? ' selected' : ''}>${ACTION_TYPE_LABELS[type] || type}</option>`;
    }
    h += '</select>';
    h += '</div>';
  }

  // Open full submission link
  h += `<div style="margin-top:10px"><a class="proc-open-sub-link" data-sub-id="${esc(entry.subId)}">Open full submission for ${esc(entry.charName)}</a></div>`;

  h += '</div>'; // proc-action-detail
  return h;
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
  h += `<div class="dt-feed-header">Narrative Output ${allReady ? '<span class="dt-narr-badge" style="margin-left:8px">&#x2713; All ready</span>' : ''}</div>`;

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
  const summary = s.st_review?.mechanical_summary || '';
  const hasResolved = (s.projects_resolved?.some(r => r?.roll)) || (s.merit_actions_resolved?.some(r => r?.roll || r?.no_roll));

  let h = '<div class="dt-mech-detail">';
  h += '<div class="dt-feed-header">Resolution Summary</div>';
  h += '<div class="dt-mech-actions">';
  h += `<button class="dt-btn dt-mech-autodraft" data-sub-id="${esc(s._id)}"${!hasResolved ? ' disabled title="Resolve projects/merits first"' : ''}>Auto-draft</button>`;
  h += '<span class="dt-mech-hint">Assembles from resolved rolls. Edit freely before publishing.</span>';
  h += '</div>';
  h += `<textarea class="dt-mech-textarea" data-sub-id="${esc(s._id)}" placeholder="Mechanical resolution summary...">${esc(summary)}</textarea>`;
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
    h += `<details class="dt-inv-new-wrap"><summary class="dt-btn" style="display:inline-block;cursor:pointer;margin-bottom:8px">+ New Investigation</summary>`;
    h += '<div class="dt-inv-form">';
    h += `<input class="dt-inv-input" id="dt-inv-target" placeholder="Target (name or description)" style="width:100%;margin-bottom:6px">`;
    h += '<div class="dt-inv-row">';
    h += `<select class="dt-pool-sel" id="dt-inv-type">`;
    for (const t of THRESHOLD_TYPES) h += `<option value="${esc(t.id)}">${esc(t.label)} (${t.default})</option>`;
    h += '</select>';
    h += `<input class="dt-pool-mod" type="number" id="dt-inv-custom" placeholder="Override threshold" title="Override threshold">`;
    h += `<input class="dt-inv-input" id="dt-inv-investigator" placeholder="Investigating character" style="flex:1">`;
    h += `<button class="dt-btn" id="dt-inv-create">Create</button>`;
    h += '</div></div></details>';

    if (investigations.length === 0) {
      h += '<p class="placeholder" style="font-size:12px;padding:8px 0;">No active investigations.</p>';
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
          h += `<button class="dt-btn dt-inv-resolve-btn" data-inv-id="${esc(inv._id)}" style="opacity:.6">Mark resolved</button>`;
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
      h += '<p class="placeholder" style="font-size:12px;padding:8px 0;">No NPCs recorded yet.</p>';
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
  h += `<button class="dt-btn dt-npc-archive" data-npc-id="${esc(npc._id)}" style="opacity:.5">Archive</button>`;
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
  h += `<input class="dt-inv-input" id="dt-npc-name-${id}" placeholder="Name *" value="${v('name')}" style="width:100%;margin-bottom:6px">`;
  h += `<textarea class="dt-narr-textarea" id="dt-npc-desc-${id}" placeholder="Description" style="min-height:48px;margin-bottom:6px">${v('description')}</textarea>`;
  h += '<div class="dt-npc-form-row">';
  h += `<select class="dt-pool-sel" id="dt-npc-status-${id}">`;
  for (const s of ['active', 'dead', 'unknown']) {
    h += `<option value="${s}"${npc?.status === s ? ' selected' : ''}>${s}</option>`;
  }
  h += '</select>';
  h += `<button class="dt-btn dt-npc-save" data-form-id="${id}">Save</button>`;
  h += `<button class="dt-btn dt-npc-cancel" style="opacity:.6">Cancel</button>`;
  h += '</div>';
  h += `<textarea class="dt-narr-textarea" id="dt-npc-notes-${id}" placeholder="Notes (ST only)" style="min-height:36px;margin-top:6px">${v('notes')}</textarea>`;
  h += '</div>';
  return h;
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
  { csvKey: 'The Academy',      label: 'Academy',     ambienceKey: 'The Academy' },
  { csvKey: 'The City Harbour', label: 'Harbour',     ambienceKey: 'The Harbour' },
  { csvKey: 'The Docklands',    label: 'Docklands',   ambienceKey: 'The Dockyards' },
  { csvKey: 'The Second City',  label: 'Second City', ambienceKey: 'The Second City' },
  { csvKey: 'The Northern Shore', label: 'North Shore', ambienceKey: 'The North Shore' },
  { csvKey: 'The Barrens',      label: 'Barrens',     ambienceKey: null },
];

function getTerritoryAmbience(ambienceKey) {
  if (!ambienceKey) return null;
  const td = TERRITORY_DATA.find(t => t.name === ambienceKey);
  return td?.ambience || null;
}

function renderFeedingMatrix() {
  const el = document.getElementById('dt-matrix');
  if (!el) return;
  if (!submissions.length) { el.innerHTML = ''; return; }

  // Determine which territory columns actually have any data
  const activeCols = MATRIX_TERRS.filter(t =>
    submissions.some(s => {
      const terrs = (s._raw || {}).feeding?.territories || {};
      const v = terrs[t.csvKey];
      return v && v !== 'Not feeding here';
    })
  );

  if (!activeCols.length) { el.innerHTML = ''; return; }

  // Count residents per territory (residents only, not poachers — poachers don't count toward cap)
  const residentCounts = {};
  for (const t of activeCols) {
    residentCounts[t.csvKey] = submissions.filter(s => {
      const v = ((s._raw || {}).feeding?.territories || {})[t.csvKey];
      return v === 'Resident';
    }).length;
  }

  const sorted = [...submissions].sort((a, b) => (a.character_name || '').localeCompare(b.character_name || ''));

  // Collapsible state via data attr
  const isOpen = el.dataset.open !== 'false';

  let h = `<div class="dt-matrix-panel">`;
  h += `<div class="dt-matrix-toggle" id="dt-matrix-toggle">${isOpen ? '\u25BC' : '\u25BA'} Feeding Matrix <span class="domain-count">${sorted.length} characters</span></div>`;

  if (isOpen) {
    h += `<div class="dt-matrix-wrap"><table class="dt-matrix-table">`;
    h += '<thead><tr><th>Character</th>';
    for (const t of activeCols) {
      const ambience = getTerritoryAmbience(t.ambienceKey);
      h += `<th title="${esc(ambience || 'No cap')}">${esc(t.label)}<br><span class="dt-matrix-amb">${esc(ambience || 'N/A')}</span></th>`;
    }
    h += '</tr></thead><tbody>';

    for (const s of sorted) {
      const terrs = (s._raw || {}).feeding?.territories || {};
      h += `<tr class="dt-matrix-row" data-sub-id="${esc(s._id)}"><td class="dt-matrix-char">${esc(s.character_name || '?')}</td>`;
      for (const t of activeCols) {
        const status = terrs[t.csvKey];
        if (!status || status === 'Not feeding here') {
          h += '<td class="dt-matrix-empty">—</td>';
        } else {
          const cls = status === 'Resident' ? 'dt-matrix-resident' : status === 'Poaching' ? 'dt-matrix-poach' : 'dt-matrix-other';
          h += `<td class="${cls}">${esc(status)}</td>`;
        }
      }
      h += '</tr>';
    }

    // Footer: counts vs caps
    h += '<tfoot><tr><td><strong>Residents</strong></td>';
    for (const t of activeCols) {
      const ambience = getTerritoryAmbience(t.ambienceKey);
      const cap = ambience ? (AMBIENCE_CAP[ambience] ?? null) : null;
      const count = residentCounts[t.csvKey] || 0;
      const overCap = cap !== null && count > cap;
      h += `<td class="${overCap ? 'dt-matrix-overcap' : ''}">${count}${cap !== null ? ` / ${cap}` : ''}</td>`;
    }
    h += '</tr></tfoot>';
    h += '</table>';
    h += '<p class="dt-matrix-note">Cap = Resident PCs only. Herds, cults, and animal feeding do not count toward territory cap.</p>';
    h += '</div>';
  }

  h += '</div>';
  el.innerHTML = h;

  document.getElementById('dt-matrix-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderFeedingMatrix();
  });

  el.querySelectorAll('.dt-matrix-row').forEach(row => {
    row.addEventListener('click', () => {
      const id = row.dataset.subId;
      expandedId = expandedId === id ? null : id;
      renderSubmissions();
      row.closest('.dt-matrix-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  });
}

// ── Cross-Character Conflicts (Story 1.11) ───────────────────────────────────

const COMPETING_ACTIONS = ['increase ambience', 'decrease ambience', 'ambience', 'patrol', 'scout', 'attack', 'hide', 'block', 'protect'];

function renderConflicts() {
  const el = document.getElementById('dt-conflicts');
  if (!el) return;
  if (!submissions.length) { el.innerHTML = ''; return; }

  const conflicts = [];

  // Check for competing territory actions across submissions
  const byTerritory = {};
  for (const s of submissions) {
    const raw = s._raw || {};
    const projects = raw.projects || [];
    for (const proj of projects) {
      if (!proj.action_type) continue;
      const lc = proj.action_type.toLowerCase();
      const isCompeting = COMPETING_ACTIONS.some(a => lc.includes(a));
      if (!isCompeting) continue;
      const territory = proj.description?.match(/The (Academy|Harbour|Docklands|Second City|North(?:ern)? Shore)/i)?.[0] || 'Unknown territory';
      const key = lc + '::' + territory.toLowerCase();
      if (!byTerritory[key]) byTerritory[key] = [];
      byTerritory[key].push({ subId: s._id, name: s.character_name, action: proj.action_type, territory });
    }
  }
  for (const [, entries] of Object.entries(byTerritory)) {
    if (entries.length >= 2) {
      conflicts.push({ type: 'Competing territory action', entries, detail: `${entries[0].action} — ${entries[0].territory}` });
    }
  }

  // Check for characters targeting each other (Attack)
  for (const s of submissions) {
    const projects = (s._raw || {}).projects || [];
    for (const proj of projects) {
      if (!proj.action_type?.toLowerCase().includes('attack')) continue;
      const targetName = proj.description?.match(/\b([A-Z][a-z]+(?: [A-Z][a-z]+)*)\b/)?.[0];
      if (targetName && submissions.some(s2 => s2 !== s && (s2.character_name || '').includes(targetName))) {
        conflicts.push({ type: 'Direct attack', entries: [{ subId: s._id, name: s.character_name, action: proj.action_type }], detail: `${s.character_name} targeting ${targetName}` });
      }
    }
  }

  const isOpen = el.dataset.open !== 'false';

  let h = `<div class="dt-conflict-panel">`;
  h += `<div class="dt-matrix-toggle" id="dt-conflicts-toggle">${isOpen ? '\u25BC' : '\u25BA'} Conflicts <span class="domain-count">${conflicts.length} detected</span>`;
  if (!conflicts.length) h += ' <span class="dt-matrix-note" style="display:inline;margin-left:8px;">None detected</span>';
  h += '</div>';

  if (isOpen && conflicts.length) {
    h += '<div class="dt-conflict-list">';
    for (const c of conflicts) {
      h += `<div class="dt-conflict-item"><span class="dt-conflict-type">${esc(c.type)}</span> — ${esc(c.detail)}: `;
      h += c.entries.map(e => `<span class="dt-conflict-char" data-sub-id="${esc(e.subId)}">${esc(e.name)}</span>`).join(', ');
      h += '</div>';
    }
    h += '</div>';
  }

  h += '</div>';
  el.innerHTML = h;

  document.getElementById('dt-conflicts-toggle')?.addEventListener('click', () => {
    el.dataset.open = isOpen ? 'false' : 'true';
    renderConflicts();
  });

  el.querySelectorAll('.dt-conflict-char').forEach(span => {
    span.addEventListener('click', () => {
      expandedId = span.dataset.subId;
      renderSubmissions();
      document.getElementById('dt-submissions')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
  const skillVal = skillName ? skDots(char, skillName) : 0;
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
      const v = char ? skDots(char, s) : 0;
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
      h += `<button class="dt-btn dt-proj-roll-btn" data-sub-id="${esc(s._id)}" data-proj-idx="${i}"
        ${!pen.attr ? 'disabled title="Select an attribute first"' : ''}>${isResolved ? 'Re-roll' : 'Roll'}</button>`;
    }

    if (isResolved) h += renderResolveBadge(res.roll);

    // ST note
    const note = res?.st_note || pen.st_note || '';
    h += `<textarea class="dt-proj-note" data-sub-id="${esc(s._id)}" data-proj-idx="${i}" placeholder="ST note for this project...">${esc(note)}</textarea>`;

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
        h += `<button class="dt-btn dt-merit-noroll-btn" data-sub-id="${esc(s._id)}" data-merit-idx="${i}"
          style="margin-left:8px;opacity:.7">No roll needed</button>`;
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
