/**
 * downtime-story.js — DT Story tab module.
 *
 * Handles all narrative authoring, prompt generation, and sign-off work
 * for a downtime cycle. Zero imports from downtime-views.js.
 *
 * Exports:
 *   initDtStory(cycleId)           — called by admin.js on first DT Story tab click
 *   saveNarrativeField(id, patch)  — called by all B stories to persist st_narrative fields
 *   isSectionComplete(sn, key)     — base completion check (status === 'complete')
 */

import { apiGet, apiPut, apiPatch } from '../data/api.js';
import { displayName, esc } from '../data/helpers.js';
import { getUser, isSTRole } from '../auth/discord.js';
import { ACTION_TYPE_LABELS, MERIT_MATRIX, INVESTIGATION_MATRIX, TERRITORY_SLUG_MAP as _TERRITORY_SLUG_MAP_BASE, AMBIENCE_STEPS } from './downtime-constants.js';
import { effectiveFeedViolence } from '../tabs/downtime-data.js';

// ── Section routing ───────────────────────────────────────────────────────────

// Sections whose save buttons route to handleActionSave
const MERIT_SECTIONS = new Set(['allies_actions', 'status_actions', 'retainer_actions', 'contact_requests', 'resource_approvals', 'misc_merit_actions']);

// Maps section key → save handler for sections that accept a status argument.
// Adding a new saveable section requires one entry here, not two if-blocks.
// Populated after handler functions are defined — see bottom of module.
const SECTION_SAVE_HANDLERS = {};

// Per-character collapse-complete state (survives re-renders within session)
const _collapseComplete = new Set(); // char IDs with collapse-complete active

// DTSR-11: global collapse-complete toggle. Persisted to localStorage so the
// preference survives reloads. Per-char toggle still works independently;
// a card collapses if either rule is active (CSS handles the OR).
const COLLAPSE_GLOBAL_KEY = 'tm_dt_story_collapse_global';
function isCollapseGlobalActive() {
  try { return localStorage.getItem(COLLAPSE_GLOBAL_KEY) === '1'; }
  catch { return false; }
}
function setCollapseGlobal(active) {
  try {
    if (active) localStorage.setItem(COLLAPSE_GLOBAL_KEY, '1');
    else localStorage.removeItem(COLLAPSE_GLOBAL_KEY);
  } catch { /* ignore */ }
}

// ── Cacophony Savvy priority order (B7) ──────────────────────────────────────

const CS_ACTION_PRIORITY = [
  'attack',
  'patrol_scout',
  'investigate',
  'ambience_increase',
  'ambience_decrease',
  'support',
  'misc',
  'rumour',
  'grow',
  'acquisition',
  'maintenance',
  'xp_spend',
  'block',
];

// TERRITORY_SLUG_MAP imported from downtime-constants.js (comprehensive version)
const TERRITORY_SLUG_MAP = _TERRITORY_SLUG_MAP_BASE;

const TERRITORY_DISPLAY = {
  academy:    'The Academy',
  harbour:    'The Harbour',
  dockyards:  'The Dockyards',
  secondcity: 'The Second City',
  northshore: 'The North Shore',
};

function resolveTerrId(raw) {
  if (!raw) return null;
  if (Object.prototype.hasOwnProperty.call(TERRITORY_SLUG_MAP, raw)) return TERRITORY_SLUG_MAP[raw];
  const normalised = raw.toLowerCase().replace(/^the[_\s]+/, '').replace(/_/g, ' ').trim();
  for (const [id, name] of Object.entries(TERRITORY_DISPLAY)) {
    const norm = name.toLowerCase().replace(/^the\s+/, '');
    if (normalised === norm || normalised.includes(norm) || norm.includes(normalised)) return id;
  }
  return null;
}

// MERIT_MATRIX and INVESTIGATION_MATRIX imported from downtime-constants.js

// ── Module state ─────────────────────────────────────────────────────────────

let _allSubmissions = [];   // GET /api/downtime_submissions?cycle_id=
let _allCharacters  = [];   // GET /api/characters
let _currentCycle   = null; // GET /api/downtime_cycles/:id — for DTIL-4 territory pulse injection
let _currentTerritories = []; // GET /api/territories — for slug→_id resolution at compile time (ADR-002)
let _currentCharId  = null;
let _currentSub     = null;
const _pushErrors   = new Map(); // charId → error message for failed pushes

// ── Public exports ────────────────────────────────────────────────────────────

/**
 * Initialise the DT Story tab. Fetches active cycle if cycleId is null,
 * then loads all submissions and characters in parallel.
 */
export async function initDtStory(cycleId) {
  const panel = document.getElementById('dt-story-panel');
  if (!panel) return;

  panel.innerHTML = '<div class="dt-story-loading">Loading\u2026</div>';

  let resolvedCycleId = cycleId;
  if (!resolvedCycleId) {
    try {
      const cycles = await apiGet('/api/downtime_cycles');
      if (Array.isArray(cycles) && cycles.length) {
        const sorted = cycles.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        const preferred = sorted.find(c => c.status !== 'complete');
        resolvedCycleId = preferred?._id || null;
      }
    } catch {
      resolvedCycleId = null;
    }
  }

  if (!resolvedCycleId) {
    panel.innerHTML = '<div class="dt-story-empty">No active downtime cycle. The DT Story tab will load when a new cycle is created in DT Processing.</div>';
    return;
  }

  try {
    const [subs, chars, cycles, terrs] = await Promise.all([
      apiGet('/api/downtime_submissions?cycle_id=' + resolvedCycleId),
      apiGet('/api/characters'),
      apiGet('/api/downtime_cycles').catch(() => []),
      apiGet('/api/territories').catch(() => []),
    ]);
    _allSubmissions = (Array.isArray(subs) ? subs : []).map(sub => ({
      ...sub,
      merit_actions: buildMeritActions(sub),
    }));
    _allCharacters  = Array.isArray(chars) ? chars : [];
    _currentCycle   = (Array.isArray(cycles) ? cycles : []).find(c => String(c._id) === String(resolvedCycleId)) || null;
    _currentTerritories = Array.isArray(terrs) ? terrs : [];
  } catch (err) {
    panel.innerHTML = `<div class="dt-story-empty">Failed to load data: ${err.message}</div>`;
    return;
  }

  panel.innerHTML = '';

  // DTSR-9: Player flag inbox — surfaces all open section flags across the cycle
  const inbox = document.createElement('div');
  inbox.id = 'dt-story-flag-inbox';
  inbox.className = 'dt-story-flag-inbox';
  inbox.innerHTML = renderFlagInbox(_allSubmissions);
  panel.appendChild(inbox);

  // Nav rail
  const rail = document.createElement('div');
  rail.id = 'dt-story-nav-rail';
  rail.className = 'dt-story-nav-rail';
  rail.innerHTML = renderNavRail();
  panel.appendChild(rail);

  // Character view area
  const view = document.createElement('div');
  view.id = 'dt-story-char-view';
  view.className = 'dt-story-char-view';
  view.innerHTML = '<div class="dt-story-empty">Select a character from the rail above.</div>';
  panel.appendChild(view);

  // Event delegation — pill clicks, push button, publish all
  rail.addEventListener('click', e => {
    if (e.target.closest('.dt-story-publish-all-btn')) { handlePublishAll(); return; }
    // DTSR-11: global collapse-complete toggle
    const globalBtn = e.target.closest('.dt-story-collapse-global-btn');
    if (globalBtn) {
      const newActive = !isCollapseGlobalActive();
      setCollapseGlobal(newActive);
      for (const el of document.querySelectorAll('.dt-story-char-content')) {
        if (newActive) el.dataset.collapseCompleteGlobal = 'true';
        else delete el.dataset.collapseCompleteGlobal;
      }
      globalBtn.textContent = newActive ? 'Show all (all)' : 'Collapse complete (all)';
      globalBtn.classList.toggle('active', newActive);
      return;
    }
    const pushBtn = e.target.closest('.dt-story-push-btn');
    if (pushBtn) { handlePushCharacter(pushBtn.dataset.subId, pushBtn.dataset.charId); return; }
    const pill = e.target.closest('.dt-story-pill');
    if (!pill) return;
    selectCharacter(pill.dataset.charId);
  });

  // Event delegation — all panel button clicks, routed by section key
  panel.addEventListener('click', e => {
    // DTSR-9: Player flag inbox actions
    const flagOpenBtn = e.target.closest('.dt-flag-inbox-open-btn');
    if (flagOpenBtn) { handleFlagInboxOpen(flagOpenBtn); return; }
    const flagResolveBtn = e.target.closest('.dt-flag-inbox-resolve-btn');
    if (flagResolveBtn) { showFlagInboxResolveForm(flagResolveBtn); return; }
    const flagResolveConfirm = e.target.closest('.dt-flag-inbox-resolve-confirm');
    if (flagResolveConfirm) { handleFlagInboxResolveConfirm(flagResolveConfirm); return; }
    const flagResolveCancel = e.target.closest('.dt-flag-inbox-resolve-cancel');
    if (flagResolveCancel) { hideFlagInboxResolveForm(flagResolveCancel); return; }

    // Collapse-complete toggle
    const collapseToggle = e.target.closest('.dt-story-collapse-toggle');
    if (collapseToggle) {
      e.stopPropagation();
      const charId = collapseToggle.dataset.charId;
      if (_collapseComplete.has(charId)) _collapseComplete.delete(charId);
      else _collapseComplete.add(charId);
      const isNowActive = _collapseComplete.has(charId);
      const content = collapseToggle.closest('.dt-story-char-content');
      if (content) content.dataset.collapseComplete = isNowActive ? 'true' : 'false';
      collapseToggle.textContent = isNowActive ? 'Show all' : 'Collapse complete';
      collapseToggle.classList.toggle('active', isNowActive);
      return;
    }

    // Sign-off (not inside a section)
    const signOffBtn = e.target.closest('.dt-story-sign-off-btn');
    if (signOffBtn && !signOffBtn.disabled) { handleSignOff(signOffBtn); return; }

    // Context toggle (shared across all sections — no routing needed)
    const toggleLink = e.target.closest('.dt-story-context-toggle');
    if (toggleLink) { handleContextToggle(toggleLink); return; }

    // Determine which section the clicked element belongs to
    const sectionKey = e.target.closest('.dt-story-section')?.dataset.section;

    // Copy Context
    const copyBtn = e.target.closest('.dt-story-copy-ctx-btn');
    if (copyBtn) {
      // Territory buttons carry data-terr-id — route on attribute, not section ancestry
      if (copyBtn.dataset.terrId)               { handleCopyTerritoryContext(copyBtn);    return; }
      if (sectionKey === 'project_responses')   { handleCopyProjectContext(copyBtn);     return; }
      if (sectionKey === 'story_moment')        { handleCopyStoryMomentContext(copyBtn); return; }
      if (sectionKey === 'cacophony_savvy')     { handleCopyCacophonyContext(copyBtn);   return; }
      if (MERIT_SECTIONS.has(sectionKey))       { handleCopyActionContext(copyBtn);      return; }
      return;
    }

    // Feeding Validation approve / undo
    const feedApproveBtn = e.target.closest('.dt-feed-val-approve-btn');
    if (feedApproveBtn) { handleFeedingApproval(feedApproveBtn); return; }

    // Save Draft
    const saveDraftBtn = e.target.closest('.dt-story-save-draft-btn');
    if (saveDraftBtn && !saveDraftBtn.disabled) {
      const handler = SECTION_SAVE_HANDLERS[sectionKey];
      if (handler)                              { handler(saveDraftBtn, 'draft');        return; }
      if (MERIT_SECTIONS.has(sectionKey))       { handleActionSave(saveDraftBtn, 'draft'); return; }
      return;
    }

    // Mark Complete
    const completeBtn = e.target.closest('.dt-story-mark-complete-btn');
    if (completeBtn && !completeBtn.disabled) {
      const handler = SECTION_SAVE_HANDLERS[sectionKey];
      if (handler)                        { handler(completeBtn, 'complete');        return; }
      if (MERIT_SECTIONS.has(sectionKey)) { handleActionSave(completeBtn, 'complete'); return; }
      return;
    }

    // Needs Revision — toggle revision area visibility
    const revisionBtn = e.target.closest('.dt-story-revision-note-btn');
    if (revisionBtn) {
      const container = revisionBtn.closest('.dt-story-proj-card, .dt-story-merit-card, .dt-story-terr-section, .dt-story-cs-slot')
                     || revisionBtn.closest('.dt-story-section');
      const area = container?.querySelector('.dt-story-revision-area');
      if (area) {
        area.classList.toggle('hidden');
        if (!area.classList.contains('hidden')) area.querySelector('.dt-story-revision-ta')?.focus();
      }
      return;
    }

    // Save Revision Note
    const revisionSaveBtn = e.target.closest('.dt-story-revision-save-btn');
    if (revisionSaveBtn && !revisionSaveBtn.disabled) {
      const handler = SECTION_SAVE_HANDLERS[sectionKey];
      if (handler)                              { handler(revisionSaveBtn, 'needs_revision'); return; }
      if (MERIT_SECTIONS.has(sectionKey))       { handleActionSave(revisionSaveBtn, 'needs_revision'); return; }
      return;
    }
  });

  // Blur-save for ST Notes free-text field (focusout bubbles, blur doesn't)
  panel.addEventListener('focusout', async e => {
    const notesTa = e.target.closest('#dt-story-notes-ta');
    if (!notesTa || !_currentSub) return;
    const value = notesTa.value;
    const statusEl = document.getElementById('dt-story-notes-status');
    try {
      await saveNarrativeField(_currentSub._id, { 'st_narrative.general_notes': value });
      if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
      _currentSub.st_narrative.general_notes = value;
      if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
    } catch {
      if (statusEl) statusEl.textContent = 'Save failed';
    }
  });
}

/**
 * Persist an st_narrative field via PUT.
 * patch uses dot-notation for nested fields, e.g.:
 *   { 'st_narrative.letter_from_home': { response: '...', author: '...', status: 'draft' } }
 */
export async function saveNarrativeField(submissionId, patch) {
  return apiPut('/api/downtime_submissions/' + submissionId, patch);
}

// ── Completion helpers ─────────────────────────────────────────────────────────

/**
 * Returns true only when stNarrative[sectionKey].status === 'complete'.
 * Array-typed and approval-typed sections use section-specific helpers below.
 */
export function isSectionComplete(stNarrative, sectionKey) {
  return stNarrative?.[sectionKey]?.status === 'complete';
}

/**
 * Project responses complete: all non-skipped project entries have status 'complete'.
 * Used by the sign-off counter and pill rail in place of generic isSectionComplete.
 */
function projectResponsesComplete(sub) {
  const resolved = sub?.projects_resolved || [];
  const responses = sub?.st_narrative?.project_responses || [];
  const applicable = resolved.filter(r => r?.pool_status !== 'skipped');
  if (!applicable.length) return false;
  return applicable.every((_, i) => responses[i]?.status === 'complete');
}

/**
 * Section-aware completion check used by the sign-off counter.
 */
function isSectionDone(stNarrative, sectionKey, sub) {
  if (!stNarrative) return false;
  switch (sectionKey) {
    case 'feeding_validation': {
      const fr = sub?.feeding_review || {};
      const ps = fr.pool_status || 'pending';
      return ps === 'validated' || ps === 'no_feed' || !!sub?.feeding_roll;
    }
    case 'territory_reports':
      return territoryReportsComplete(sub);
    case 'home_report':
      return isSectionComplete(stNarrative, 'home_report');
    case 'project_responses':
      return projectResponsesComplete(sub);
    case 'story_moment':
      // Historical submissions that were marked complete on the legacy
      // letter_from_home or touchstone sections still satisfy sign-off.
      return stNarrative?.story_moment?.status === 'complete'
          || stNarrative?.letter_from_home?.status === 'complete'
          || stNarrative?.touchstone?.status === 'complete';
    case 'resource_approvals':  return actionResponsesComplete(sub, ['resources']);
    case 'cacophony_savvy':
      return cacophonySavvyComplete(getCharForSub(sub), sub);
    case 'allies_actions':   return actionResponsesComplete(sub, ['allies']);
    case 'status_actions':   return actionResponsesComplete(sub, ['status']);
    case 'retainer_actions': return actionResponsesComplete(sub, ['retainer', 'staff']);
    case 'contact_requests':   return actionResponsesComplete(sub, ['contacts']);
    case 'misc_merit_actions': return actionResponsesComplete(sub, ['misc']);
    case 'merit_summary':    return meritSummaryComplete(sub);
    default:
      return isSectionComplete(stNarrative, sectionKey);
  }
}

// ── Clipboard utility ─────────────────────────────────────────────────────────

function copyToClipboard(text, btnEl) {
  const original = btnEl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    btnEl.textContent = 'Copied!';
    setTimeout(() => { btnEl.textContent = original; }, 1500);
  }).catch(() => {
    btnEl.textContent = 'Failed';
    setTimeout(() => { btnEl.textContent = original; }, 1500);
  });
}

// ── Project context builder ───────────────────────────────────────────────────

/**
 * Resolves a JSON cast array (character IDs) to a comma-separated display name list.
 */
function resolveCast(castJson) {
  if (!castJson) return '';
  try {
    const ids = JSON.parse(castJson);
    if (!Array.isArray(ids) || !ids.length) return '';
    return ids.map(id => {
      const c = _allCharacters.find(ch => ch._id === id);
      return c ? displayName(c) : id;
    }).join(', ');
  } catch {
    return castJson;
  }
}

/**
 * Formats a JSON merits array ("Name|qualifier" strings) to readable labels.
 */
function resolveMerits(meritsJson) {
  if (!meritsJson) return '';
  try {
    const arr = JSON.parse(meritsJson);
    if (!Array.isArray(arr) || !arr.length) return '';
    return arr.map(m => {
      const [name, qual] = m.split('|');
      return qual ? `${name} (${qual})` : name;
    }).join(', ');
  } catch {
    return meritsJson;
  }
}

/**
 * Formats a pool value (object or primitive) to a display string.
 */
function formatPool(pool) {
  if (!pool) return '';
  if (typeof pool === 'string') return pool;
  if (typeof pool === 'number') return String(pool);
  if (pool.expression) return `${pool.expression} (${pool.total})`;
  return pool.total != null ? String(pool.total) : '';
}

// ── Copy context header helpers ───────────────────────────────────────────────

/** "Lord Marcus — Ventrue / Invictus — The Politician" */
function _compactCharHeader(char) {
  const name  = [char?.honorific, char ? displayName(char) : 'Unknown'].filter(Boolean).join(' ');
  const ident = [char?.clan, char?.covenant].filter(Boolean).join(' / ');
  return [name, ident, char?.concept || null].filter(Boolean).join(' \u2014 ');
}

/** "Mask: Bon Vivant | Dirge: Martyr | Humanity: 6" */
function _charIdentLine(char) {
  const parts = [];
  if (char?.mask && char?.dirge) parts.push(`Mask: ${char.mask} | Dirge: ${char.dirge}`);
  else if (char?.mask)           parts.push(`Mask: ${char.mask}`);
  else if (char?.dirge)          parts.push(`Dirge: ${char.dirge}`);
  if (char?.humanity != null)    parts.push(`Humanity: ${char.humanity}`);
  return parts.join(' | ');
}

/**
 * Assembles the Copy Context prompt for a single project action.
 * Pure function — no side effects, no DOM access.
 */
function buildProjectContext(char, sub, idx, cycleData, territories) {
  const slot = idx + 1;
  const title       = sub.responses?.[`project_${slot}_title`]       || '';
  const outcome     = sub.responses?.[`project_${slot}_outcome`]     || '';
  const description = sub.responses?.[`project_${slot}_description`] || '';
  const terrRaw     = sub.responses?.[`project_${slot}_territory`]   || '';
  const castRaw     = sub.responses?.[`project_${slot}_cast`]        || '';
  const meritsRaw   = sub.responses?.[`project_${slot}_merits`]      || '';

  const rev        = sub.projects_resolved?.[idx] || {};
  const actionType = rev.action_type_override || rev.action_type || sub.responses?.[`project_${slot}_action`] || '';
  const pool       = formatPool(rev.pool_validated) || formatPool(rev.pool_player) || '';
  const roll       = rev.roll || null;
  const notes      = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];
  const poolStatus = rev.pool_status || 'pending';

  const cast        = resolveCast(castRaw);
  const merits      = resolveMerits(meritsRaw);
  const actionLabel = ACTION_TYPE_LABELS[actionType] || actionType || 'Unknown';

  // Existing ST draft for this slot
  const existingDraft = sub.st_narrative?.project_responses?.[idx]?.response || '';

  const lines = ['Draft a project response for:', '', _compactCharHeader(char)];
  const identLine = _charIdentLine(char);
  if (identLine) lines.push(identLine);

  lines.push('');
  lines.push(`Action: ${actionLabel}`);
  if (title)   lines.push(`Title: ${title}`);
  if (outcome) lines.push(`Desired Outcome: ${outcome}`);
  if (description) lines.push(`Description: ${description}`);
  if (merits)  lines.push(`Merits & Bonuses: ${merits}`);
  if (cast)    lines.push(`Connected Characters: ${cast}`);

  if (poolStatus === 'no_roll' || poolStatus === 'maintenance') {
    lines.push('No roll required');
  } else {
    if (pool) lines.push(`Validated Pool: ${pool}`);
    if (roll) {
      const diceStr  = roll.dice_string || (Array.isArray(roll.dice) ? '[' + roll.dice.join(', ') + ']' : '');
      const successes = roll.successes ?? 0;
      const exc       = roll.exceptional ? ', Exceptional' : '';
      lines.push(`Roll Result: ${successes} success${successes !== 1 ? 'es' : ''}${exc}${diceStr ? ' \u2014 Dice: ' + diceStr : ''}`);
    }
  }

  // Territory context (when territory assigned and data available).
  // terrId is a TERRITORY_DATA-style slug; Mongo docs key the same value as `slug` (ADR-002).
  const terrId = resolveTerrId(terrRaw);
  if (terrRaw || terrId) {
    const terrName = (terrId && TERRITORY_DISPLAY[terrId]) || terrRaw || 'Unknown';
    const terrObj  = (territories || []).find(t => t.slug === terrId) || null;
    const terrOidStr = terrObj ? String(terrObj._id) : null;
    const currentAmb   = terrObj?.ambience || null;
    const confirmedAmb = (terrOidStr && cycleData?.confirmed_ambience?.[terrOidStr]?.ambience) || null;
    const ambienceLine = confirmedAmb
      ? (currentAmb && confirmedAmb !== currentAmb ? `${confirmedAmb} (was ${currentAmb})` : confirmedAmb)
      : currentAmb;

    // Count residents/poachers from all submissions
    let residents = 0, poachers = 0;
    const terrSlug = terrId ? Object.entries(TERRITORY_SLUG_MAP).find(([, id]) => id === terrId)?.[0] : null;
    if (terrSlug) {
      for (const s of _allSubmissions) {
        let terrs = {};
        try { terrs = JSON.parse(s.responses?.feeding_territories || '{}'); } catch { continue; }
        const val = terrs[terrSlug];
        if (val === 'resident') residents++;
        else if (val && val !== 'none') poachers++;
      }
    }

    // Other actions in this territory this cycle
    const otherActions = [];
    for (const s of _allSubmissions) {
      if (s._id === sub._id) continue;
      (s.projects_resolved || []).forEach((r, i) => {
        if (!r || r.pool_status === 'skipped') return;
        const sl = i + 1;
        if (resolveTerrId(s.responses?.[`project_${sl}_territory`] || '') !== terrId) return;
        const aType = ACTION_TYPE_LABELS[r.action_type] || r.action_type || 'Action';
        otherActions.push(`${s.character_name || 'Unknown'} (${aType})`);
      });
    }

    lines.push('');
    const terrSummary = [`Territory: ${terrName}`];
    if (ambienceLine) terrSummary.push(`Ambience: ${ambienceLine}`);
    lines.push(terrSummary.join(' | '));
    lines.push(`Residents: ${residents} | Poachers: ${poachers}`);
    lines.push(`Other actions in territory: ${otherActions.length ? otherActions.join(', ') : 'None'}`);
  }

  // Story context (ST-written context for AI prompt)
  if (rev.player_feedback) {
    lines.push('');
    lines.push(`Story context (do not contradict): ${rev.player_feedback}`);
  }
  if (rev.player_facing_note) {
    lines.push('');
    lines.push(`Player-facing note: ${rev.player_facing_note}`);
  }

  // ST directives
  const hasDirectives = rev.st_note || notes.length;
  if (hasDirectives) {
    lines.push('');
    lines.push('ST directives (must reflect):');
    if (rev.st_note) lines.push(`- ${rev.st_note}`);
    for (const n of notes) lines.push(`- [${n.author_name || 'ST'}] ${n.text || ''}`);
  }

  // Existing draft
  if (existingDraft) {
    lines.push('');
    lines.push('Existing draft (revise unless told to rewrite):');
    lines.push(existingDraft);
  }

  lines.push('');
  const isInvestigation = actionType === 'investigate';
  const isFeed = actionType === 'feed';
  const rubric = [
    isInvestigation ? 'Apply INVESTIGATION_THRESHOLDS.' : null,
    isFeed ? 'Apply FEEDING_CONSTRAINTS.' : null,
    'One paragraph, 80-120 words. Use house style.',
  ].filter(Boolean).join(' ');
  lines.push(rubric);

  return lines.join('\n');
}

// ── Maintenance context builder ──────────────────────────────────────────────

/**
 * Assembles the Copy Context prompt for a Maintenance project action.
 * Pure function — no side effects, no DOM access.
 */
function buildMaintenanceContext(char, sub, idx) {
  const slot        = idx + 1;
  const title       = sub.responses?.[`project_${slot}_title`]       || '';
  const description = sub.responses?.[`project_${slot}_description`] || '';
  const meritsRaw   = sub.responses?.[`project_${slot}_merits`]      || '';
  const rev         = sub.projects_resolved?.[idx] || {};
  const notes       = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];

  // Derive merit_name (title is the canonical source for maintenance)
  // Derive merit_type: first item in the merits field, stripped of qualifier, or empty
  const meritName = title || description.split('\n')[0] || 'Unnamed Merit';
  let meritType = '';
  if (meritsRaw) {
    const first = meritsRaw.split(',')[0].trim();
    // Strip qualifier in parens: "Allies (Police)" → "Allies"
    meritType = first.replace(/\s*\([^)]*\)/, '').replace(/\s*\|.*$/, '').trim();
  }

  const lines = ['Draft a maintenance response for:', '', _compactCharHeader(char)];
  if (char?.humanity != null) lines.push(`Humanity: ${char.humanity}`);

  lines.push('');
  if (meritType) lines.push(`Merit maintained: ${meritName} (${meritType})`);
  lines.push(`Title: ${meritName}`);
  if (description) lines.push(`Description: ${description}`);

  if (notes.length) {
    lines.push('');
    lines.push('ST notes:');
    for (const n of notes) lines.push(`- [${n.author_name || 'ST'}] ${n.text || ''}`);
  }

  lines.push('');
  lines.push('No roll required. 50-80 words. Use house style.');

  return lines.join('\n');
}

// ── Patrol / Scout context builder ───────────────────────────────────────────

const _PATROL_DISCS = [
  'Animalism', 'Auspex', 'Celerity', 'Dominate', 'Majesty', 'Nightmare',
  'Obfuscate', 'Resilience', 'Vigor', 'Vigour', 'Protean', 'Cruac', 'Theban',
];

/**
 * Assembles the Copy Context prompt for a Patrol / Scout project action.
 * Pure function — reads module-level _allSubmissions / _allCharacters.
 */
function buildPatrolContext(char, sub, idx, cycleData, territories) {
  const slot = idx + 1;
  const title       = sub.responses?.[`project_${slot}_title`]       || '';
  const outcome     = sub.responses?.[`project_${slot}_outcome`]     || '';
  const description = sub.responses?.[`project_${slot}_description`] || '';
  const terrRaw     = sub.responses?.[`project_${slot}_territory`]   || '';
  const meritsRaw   = sub.responses?.[`project_${slot}_merits`]      || '';

  const rev        = sub.projects_resolved?.[idx] || {};
  const pool       = formatPool(rev.pool_validated) || formatPool(rev.pool_player) || '';
  const roll       = rev.roll || null;
  const notes      = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];
  const merits     = resolveMerits(meritsRaw);
  const existingDraft = sub.st_narrative?.project_responses?.[idx]?.response || '';

  const lines = ['Draft a Patrol response for:', '', _compactCharHeader(char)];
  const identLine = _charIdentLine(char);
  if (identLine) lines.push(identLine);

  lines.push('');
  lines.push('Action: Patrol / Scout');
  if (title)   lines.push(`Title: ${title}`);
  if (outcome) lines.push(`Desired Outcome: ${outcome}`);
  if (description) lines.push(`Description: ${description}`);
  if (merits)  lines.push(`Merits & Bonuses: ${merits}`);

  if (pool) lines.push(`Validated Pool: ${pool}`);
  if (roll) {
    const diceStr   = roll.dice_string || (Array.isArray(roll.dice) ? '[' + roll.dice.join(', ') + ']' : '');
    const successes = roll.successes ?? 0;
    const exc       = roll.exceptional ? ', Exceptional' : '';
    lines.push(`Roll Result: ${successes} success${successes !== 1 ? 'es' : ''}${exc}${diceStr ? ' \u2014 Dice: ' + diceStr : ''}`);
  }

  // Territory context
  // terrId is a TERRITORY_DATA-style slug; Mongo docs key the same value as `slug` (ADR-002).
  const terrId   = resolveTerrId(terrRaw);
  const terrName = (terrId && TERRITORY_DISPLAY[terrId]) || terrRaw || 'Unknown';
  const terrObj  = (territories || []).find(t => t.slug === terrId) || null;
  const terrOidStr = terrObj ? String(terrObj._id) : null;
  const regent   = terrObj?.regent || terrObj?.regentName || null;

  const currentAmb   = terrObj?.ambience || null;
  const confirmedAmb = (terrOidStr && cycleData?.confirmed_ambience?.[terrOidStr]?.ambience) || null;
  const netChange    = (terrOidStr && cycleData?.confirmed_ambience?.[terrOidStr]?.net_change) ?? null;

  // Residents and poachers
  const terrSlug = terrId ? Object.entries(TERRITORY_SLUG_MAP).find(([, id]) => id === terrId)?.[0] : null;
  let residentCount = 0, poacherCount = 0;
  const feeders = [];
  if (terrSlug) {
    for (const s of _allSubmissions) {
      let terrs = {};
      try { terrs = JSON.parse(s.responses?.feeding_territories || '{}'); } catch { continue; }
      const val = terrs[terrSlug];
      if (!val || val === 'none') continue;
      const fChar = _allCharacters.find(c => String(c._id) === String(s.character_id));
      const fName = fChar ? displayName(fChar) : (s.character_name || 'Unknown');
      const isResident = val === 'resident';
      if (isResident) residentCount++; else poacherCount++;
      // Feeding method: scan pool_validated for discipline names; fallback to territory value
      const feedRev = s.feeding_review || {};
      let feedMethod = '';
      if (feedRev.pool_validated) {
        const found = _PATROL_DISCS.filter(d => feedRev.pool_validated.includes(d));
        feedMethod = found.length ? found.join(', ') : (val !== 'resident' ? val : 'default');
      } else {
        feedMethod = val !== 'resident' ? val : 'default';
      }
      feeders.push({ name: fName, clan: fChar?.clan || '?', covenant: fChar?.covenant || '?', isResident, feedMethod });
    }
  }

  // Other actions in territory categorised
  const ambienceChars = [], patrolChars = [], investigateChars = [], miscChars = [];
  for (const s of _allSubmissions) {
    if (s._id === sub._id) continue;
    (s.projects_resolved || []).forEach((r, i) => {
      if (!r || r.pool_status === 'skipped') return;
      const sl = i + 1;
      if (resolveTerrId(s.responses?.[`project_${sl}_territory`] || '') !== terrId) return;
      const aType = r.action_type_override || r.action_type || '';
      const cName = s.character_name || 'Unknown';
      if (aType === 'ambience_increase' || aType === 'ambience_decrease') ambienceChars.push(cName);
      else if (aType === 'patrol_scout' || aType === 'support') patrolChars.push(cName);
      else if (aType === 'investigate') investigateChars.push(cName);
      else miscChars.push(cName);
    });
  }

  // Discipline profile for this territory
  const discProfile = cycleData?.discipline_profile?.[terrId] || {};
  const discProfileStr = Object.entries(discProfile).length
    ? Object.entries(discProfile).map(([d, n]) => `${d}${n > 1 ? ` (\u00d7${n})` : ''}`).join(', ')
    : 'None detected';

  lines.push('');
  const ambLine = confirmedAmb || currentAmb;
  const terrLineParts = [`Territory: ${terrName}`];
  if (regent) terrLineParts.push(`Regent: ${regent}`);
  lines.push(terrLineParts.join(' | '));
  if (ambLine) {
    const wasStr = confirmedAmb && currentAmb && confirmedAmb !== currentAmb ? ` (was ${currentAmb})` : '';
    const netStr = netChange != null ? `, net ${netChange > 0 ? '+' : ''}${netChange}` : '';
    lines.push(`Ambience: ${ambLine}${wasStr}${netStr}`);
  }
  lines.push(`Residents: ${residentCount} | Poachers: ${poacherCount}`);

  if (feeders.length) {
    lines.push('');
    lines.push('Feeders in territory this cycle:');
    for (const f of feeders) {
      lines.push(`- ${f.name} (${f.clan}, ${f.covenant}, ${f.isResident ? 'Resident' : 'Poacher'}, ${f.feedMethod})`);
    }
  }

  lines.push('');
  lines.push(`Other actions in territory: ambience ${ambienceChars.join(', ') || 'None'} | patrol ${patrolChars.join(', ') || 'None'} | investigative ${investigateChars.join(', ') || 'None'} | misc ${miscChars.join(', ') || 'None'}`);
  lines.push(`Discipline activity: ${discProfileStr}`);

  // Story context (ST-written context for AI prompt)
  if (rev.player_feedback) {
    lines.push('');
    lines.push(`Story context (do not contradict): ${rev.player_feedback}`);
  }
  if (rev.player_facing_note) {
    lines.push('');
    lines.push(`Player-facing note: ${rev.player_facing_note}`);
  }

  // ST directives
  if (rev.st_note || notes.length) {
    lines.push('');
    lines.push('ST directives (must reflect):');
    if (rev.st_note) lines.push(`- ${rev.st_note}`);
    for (const n of notes) lines.push(`- [${n.author_name || 'ST'}] ${n.text || ''}`);
  }

  if (existingDraft) {
    lines.push('');
    lines.push('Existing draft (revise unless told to rewrite):');
    lines.push(existingDraft);
  }

  lines.push('');
  lines.push('Apply PATROL_SCALE. One paragraph, 80-120 words. Use house style.');

  return lines.join('\n');
}

// ── Project save helper ───────────────────────────────────────────────────────

/**
 * Returns an updated project_responses array with idx patched.
 * Preserves all other existing entries.
 */
function buildUpdatedProjectResponses(sub, idx, patch) {
  const arr = [...(sub.st_narrative?.project_responses || [])];
  while (arr.length <= idx) arr.push(null);
  arr[idx] = { ...(arr[idx] || {}), project_index: idx, ...patch };
  return arr;
}

/**
 * Generic array patcher. Creates/extends arr to include idx, deep-merges patch.
 * Used by merit action and resource approval save handlers.
 */
function buildUpdatedArray(arr, idx, patch) {
  const updated = [...arr];
  while (updated.length <= idx) updated.push(null);
  updated[idx] = { ...(updated[idx] || {}), ...patch };
  return updated;
}

// ── Character lookup ──────────────────────────────────────────────────────────

function getCharForSub(sub) {
  if (!sub) return null;
  return _allCharacters.find(c => c._id === sub.character_id) || null;
}

// ── Section suppression helpers ───────────────────────────────────────────────

function hasCacophonySavvy(char) {
  return char?.merits?.some(m => m.name === 'Cacophony Savvy') || false;
}

function hasHaven(char) {
  return char?.merits?.some(m => m.name === 'Haven') || false;
}

function getApplicableSections(char, sub) {
  const sections = [
    { key: 'story_moment', label: 'Story Moment' },
  ];

  if (char?.home_territory) sections.push({ key: 'home_report', label: 'Home Report' });

  sections.push({ key: 'feeding_validation', label: 'Feeding' });

  if (sub?.projects_resolved?.length) {
    sections.push({ key: 'project_responses', label: 'Project Reports' });
  }

  const hasCategory = (cats) => (sub?.merit_actions || []).some((a, i) => {
    const cat = deriveMeritCategory(a.merit_type);
    if (!cats.includes(cat)) return false;
    const rev = sub?.merit_actions_resolved?.[i] || {};
    return rev.pool_status !== 'skipped';
  });

  // All merit categories consolidated into a single summary ledger (Story 1.13)
  const ALL_MERIT_CATS = ['allies', 'status', 'retainer', 'staff', 'contacts', 'resources', 'misc'];
  if (hasCategory(ALL_MERIT_CATS)) sections.push({ key: 'merit_summary', label: 'Allies & Asset Summary' });

  if (getCSDots(char) > 0) {
    sections.push({ key: 'cacophony_savvy', label: 'Rumours' });
  }

  return sections;
}

// ── Nav rail ──────────────────────────────────────────────────────────────────

function getNavPillState(sub) {
  const char = getCharForSub(sub);
  const stNarrative = sub?.st_narrative;
  const sections = getApplicableSections(char, sub);
  const anyComplete = sections.some(s => isSectionDone(stNarrative, s.key, sub));
  const allComplete = sections.length > 0 && sections.every(s => isSectionDone(stNarrative, s.key, sub));
  if (allComplete) return 'green';
  if (anyComplete) return 'amber';
  return '';
}

function renderNavRail() {
  if (!_allSubmissions.length) {
    return '<div class="dt-story-empty">No submissions for this cycle.</div>';
  }

  const sorted = [..._allSubmissions].sort((a, b) => {
    const ca = getCharForSub(a);
    const cb = getCharForSub(b);
    const na = ca ? (ca.moniker || ca.name).toLowerCase() : '';
    const nb = cb ? (cb.moniker || cb.name).toLowerCase() : '';
    return na.localeCompare(nb);
  });

  const isST = isSTRole();
  let h = '';
  if (isST) {
    const globalActive = isCollapseGlobalActive();
    h += `<div class="dt-story-rail-header">`;
    h += `<button class="dt-story-publish-all-btn">Publish All</button>`;
    h += `<button class="dt-story-collapse-global-btn${globalActive ? ' active' : ''}">${globalActive ? 'Show all (all)' : 'Collapse complete (all)'}</button>`;
    h += `</div>`;
  }
  for (const sub of sorted) {
    const char = getCharForSub(sub);
    const name = char ? (char.moniker || char.name) : 'Unknown';
    const state = getNavPillState(sub);
    const stateClass = state ? ` ${state}` : '';
    const charId = sub.character_id || sub._id;
    const isPublished = sub.st_review?.outcome_visibility === 'published';
    const errMsg = _pushErrors.get(charId);
    h += `<div class="dt-story-pill-row">`;
    h += `<button class="dt-story-pill${stateClass}" data-char-id="${charId}" data-sub-id="${sub._id}">`;
    h += name;
    if (state) h += `<span class="dt-story-pill-dot"></span>`;
    h += `</button>`;
    if (isST) {
      if (isPublished) {
        h += `<span class="dt-proj-done-badge">Published</span>`;
        h += `<button class="dt-story-push-btn dt-story-repush-btn" data-sub-id="${sub._id}" data-char-id="${charId}" title="Re-push narrative to player">↺</button>`;
      } else {
        h += `<button class="dt-story-push-btn" data-sub-id="${sub._id}" data-char-id="${charId}" title="Push narrative to player">Push</button>`;
      }
    }
    if (errMsg) h += `<span class="dt-error-msg">${esc(errMsg)}</span>`;
    h += `</div>`;
  }
  return h;
}

// ── Character selection ───────────────────────────────────────────────────────

function selectCharacter(charId) {
  _currentCharId = charId;
  _currentSub = _allSubmissions.find(s => s.character_id === charId || s._id === charId) || null;

  document.querySelectorAll('.dt-story-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.charId === charId);
  });

  const view = document.getElementById('dt-story-char-view');
  if (!view) return;

  if (!_currentSub) {
    view.innerHTML = '<div class="dt-story-empty">Submission not found.</div>';
    return;
  }

  const char = getCharForSub(_currentSub);
  view.innerHTML = renderCharacterView(char, _currentSub);
}

// ── Progress tracker ──────────────────────────────────────────────────────────

/**
 * Returns { state: 'empty'|'draft'|'complete', done: N, total: N } for a section.
 * Used by the progress tracker chips.
 */
function getSectionProgress(stNarrative, sectionKey, sub) {
  const sn = stNarrative || {};

  if (sectionKey === 'feeding_validation') {
    const done = isSectionDone(stNarrative, sectionKey, sub);
    return { state: done ? 'complete' : 'empty', done: done ? 1 : 0, total: 1 };
  }

  if (sectionKey === 'story_moment') {
    // Prefer new field; fall back to whichever legacy section has content
    const entry = sn.story_moment
      || (sn.letter_from_home?.response ? sn.letter_from_home : null)
      || (sn.touchstone?.response       ? sn.touchstone       : null)
      || {};
    if (entry.status === 'complete')        return { state: 'complete',  done: 1, total: 1 };
    if (entry.status === 'needs_revision')  return { state: 'revision',  done: 0, total: 1 };
    if (entry.response)                     return { state: 'draft',     done: 0, total: 1 };
    return { state: 'empty', done: 0, total: 1 };
  }

  if (sectionKey === 'project_responses') {
    const resolved   = sub?.projects_resolved || [];
    const applicable = resolved.filter(r => r?.pool_status !== 'skipped');
    if (!applicable.length) return { state: 'complete', done: 0, total: 0 };
    const responses   = sn.project_responses || [];
    const done        = applicable.filter((_, i) => responses[i]?.status === 'complete').length;
    const hasRevision = applicable.some((_, i) => responses[i]?.status === 'needs_revision');
    const hasDraft    = applicable.some((_, i) => responses[i]?.response);
    const state = done === applicable.length ? 'complete' : hasRevision ? 'revision' : hasDraft ? 'draft' : 'empty';
    return { state, done, total: applicable.length };
  }

  if (sectionKey === 'territory_reports') {
    const feedTerrs   = _feedTerrEntries(sub);
    if (!feedTerrs.length) return { state: 'complete', done: 0, total: 0 };
    const reports     = sn.territory_reports || [];
    const done        = feedTerrs.filter((_, i) => reports[i]?.status === 'complete').length;
    const hasRevision = feedTerrs.some((_, i) => reports[i]?.status === 'needs_revision');
    const hasDraft    = feedTerrs.some((_, i) => reports[i]?.response);
    const state = done === feedTerrs.length ? 'complete' : hasRevision ? 'revision' : hasDraft ? 'draft' : 'empty';
    return { state, done, total: feedTerrs.length };
  }

  if (sectionKey === 'cacophony_savvy') {
    const char   = getCharForSub(sub);
    const csDots = getCSDots(char);
    if (!csDots) return { state: 'complete', done: 0, total: 0 };
    const saved       = sn.cacophony_savvy || [];
    const done        = saved.filter(s => s?.status === 'complete').length;
    const hasRevision = saved.some(s => s?.status === 'needs_revision');
    const hasDraft    = saved.some(s => s?.response);
    const state = done === csDots ? 'complete' : hasRevision ? 'revision' : hasDraft ? 'draft' : 'empty';
    return { state, done, total: csDots };
  }

  // Merit action sections
  const CATEGORY_MAP = {
    allies_actions:     ['allies'],
    status_actions:     ['status'],
    retainer_actions:   ['retainer', 'staff'],
    contact_requests:   ['contacts'],
    resource_approvals: ['resources'],
    misc_merit_actions: ['misc'],
  };
  const cats = CATEGORY_MAP[sectionKey];
  if (cats) {
    const actions  = sub?.merit_actions || [];
    const resolved = sub?.merit_actions_resolved || [];
    const applicable = actions
      .map((a, i) => ({ a, i, rev: resolved[i] || {} }))
      .filter(({ a, rev }) => cats.includes(deriveMeritCategory(a.merit_type)) && rev.pool_status !== 'skipped');
    if (!applicable.length) return { state: 'complete', done: 0, total: 0 };
    const responses   = sn.action_responses || [];
    const done        = applicable.filter(({ i }) => responses[i]?.status === 'complete').length;
    const hasRevision = applicable.some(({ i }) => responses[i]?.status === 'needs_revision');
    const hasDraft    = applicable.some(({ i }) => responses[i]?.response);
    const state = done === applicable.length ? 'complete' : hasRevision ? 'revision' : hasDraft ? 'draft' : 'empty';
    return { state, done, total: applicable.length };
  }

  return { state: 'empty', done: 0, total: 1 };
}

const TRACKER_LABELS = {
  feeding_validation: 'Feeding',
  story_moment:       'Story Moment',
  project_responses:  'Projects',
  territory_reports:  'Territory',
  allies_actions:     'Allies',
  status_actions:     'Status',
  retainer_actions:   'Retainers',
  contact_requests:   'Contacts',
  resource_approvals: 'Resources',
  misc_merit_actions: 'Influence',
  cacophony_savvy:    'Rumours',
};

function renderProgressTracker(char, sub) {
  const stNarrative = sub?.st_narrative;
  const sections    = getApplicableSections(char, sub);

  let h = `<div class="dt-story-progress-tracker">`;
  for (const section of sections) {
    const { state, done, total } = getSectionProgress(stNarrative, section.key, sub);
    const label    = TRACKER_LABELS[section.key] || section.label;
    const countStr = total > 1 ? ` ${done}/${total}` : '';
    h += `<span class="dt-story-tracker-chip ${state}">${label}${countStr}</span>`;
  }
  h += `</div>`;
  return h;
}

// ── Character view ────────────────────────────────────────────────────────────

function renderCharacterView(char, sub) {
  const stNarrative = sub?.st_narrative;
  const sections = getApplicableSections(char, sub);
  const charId = String(char?._id || '');
  const collapseActive = _collapseComplete.has(charId);
  const globalActive   = isCollapseGlobalActive();
  const collapseAttr = `${collapseActive ? ' data-collapse-complete="true"' : ''}${globalActive ? ' data-collapse-complete-global="true"' : ''}`;

  let h = `<div class="dt-story-char-content"${collapseAttr}>`;

  h += `<div class="dt-story-char-header">`;
  h += `<h3 class="dt-story-char-name">${char ? displayName(char) : 'Unknown'}</h3>`;
  if (stNarrative?.locked) h += `<span class="dt-story-locked-badge">Locked</span>`;
  h += `<button class="dt-story-collapse-toggle${collapseActive ? ' active' : ''}" data-char-id="${charId}">${collapseActive ? 'Show all' : 'Collapse complete'}</button>`;
  h += `</div>`;

  h += renderProgressTracker(char, sub);

  for (const section of sections) {
    h += renderSection(section, char, sub, stNarrative);
  }

  h += renderGeneralNotes(sub);
  h += renderSignOffPanel(stNarrative, sections, sub);
  h += `</div>`; // dt-story-char-content
  return h;
}

function renderGeneralNotes(sub) {
  const saved = sub?.st_narrative?.general_notes || '';
  let h = '<div class="dt-story-general-notes">';
  h += '<label class="dt-story-notes-label">ST Notes</label>';
  h += `<textarea id="dt-story-notes-ta" class="dt-story-notes-ta" placeholder="Add any notes, plot hooks, or context not tied to a specific section\u2026">${esc(saved)}</textarea>`;
  h += '<span id="dt-story-notes-status" class="dt-story-save-status"></span>';
  h += '</div>';
  return h;
}

// ── Section dispatch ──────────────────────────────────────────────────────────

/**
 * Routes each section to its specific renderer, or falls back to the scaffold placeholder.
 * B4–B7 add cases here as sections are implemented.
 */
function renderSection(section, char, sub, stNarrative) {
  switch (section.key) {
    case 'feeding_validation': return renderFeedingValidation(char, sub, stNarrative);
    case 'story_moment':       return renderStoryMoment(char, sub, stNarrative);
    case 'project_responses':  return renderProjectSection(char, sub);
    case 'territory_reports':  return renderTerritoryReports(char, sub, stNarrative, _allSubmissions, _allCharacters);
    case 'home_report':        return renderHomeReport(char, sub, stNarrative, _allSubmissions);
    case 'cacophony_savvy':    return renderCacophonySavvy(char, sub, stNarrative, _allSubmissions);
    case 'allies_actions':     return renderAlliesSection(char, sub);
    case 'status_actions':     return renderStatusSection(char, sub);
    case 'retainer_actions':   return renderRetainerSection(char, sub);
    case 'contact_requests':   return renderContactsSection(char, sub);
    case 'resource_approvals':  return renderResourcesSection(char, sub);
    case 'misc_merit_actions':  return renderMiscMeritSection(char, sub);
    case 'merit_summary':       return renderMeritSummary(char, sub);
    default: return renderSectionScaffold(section.key, section.label, stNarrative);
  }
}

// ── Section scaffold (placeholder for unimplemented sections) ─────────────────

function renderSectionScaffold(key, label, stNarrative) {
  const complete = isSectionComplete(stNarrative, key);
  let h = '';
  h += `<div class="dt-story-section${complete ? ' complete' : ''}" data-section="${key}">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">${label}</span>`;
  h += `<span class="dt-story-completion-dot ${complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-empty">Not yet implemented</div>`;
  h += `</div>`;
  return h;
}

// ── Feeding Validation section ────────────────────────────────────────────────

function renderFeedingValidation(char, sub, stNarrative) {
  const fr         = sub.feeding_review || {};
  const roll       = sub.feeding_roll   || null;
  const poolStatus = fr.pool_status     || 'pending';
  const complete   = poolStatus === 'validated' || poolStatus === 'no_feed' || !!roll;

  let h = `<div class="dt-story-section${complete ? ' complete' : ''}" data-section="feeding_validation">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Feeding</span>`;
  h += `<span class="dt-story-completion-dot ${complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  if (poolStatus === 'no_feed') {
    h += `<p class="dt-feed-val-status">No feeding this cycle.</p>`;
  } else if (poolStatus === 'pending' && !roll) {
    h += `<p class="dt-feed-val-status dt-story-section-empty">Feeding not yet validated.</p>`;
  } else {
    h += `<dl class="dt-feed-val-dl">`;

    // Pool
    const poolStr = fr.pool_validated || fr.pool_player || '';
    if (poolStr) {
      const isRote = sub.st_review?.feeding_rote || roll?.params?.rote || false;
      const again  = roll?.params?.again;
      const mods   = [isRote ? 'Rote' : null, again === 8 ? '8-Again' : again === 9 ? '9-Again' : null].filter(Boolean);
      const poolDisp = poolStr + (mods.length ? ` \u2014 ${mods.join(', ')}` : '');
      h += `<div class="dt-feed-val-row"><dt>Pool</dt><dd>${esc(poolDisp)}</dd></div>`;
    }

    // Roll result
    if (roll) {
      const vitae     = roll.successes * 2;
      const resultStr = `${roll.successes} ${roll.successes === 1 ? 'success' : 'successes'}${roll.exceptional ? ' (exceptional)' : ''} \u2014 ${vitae} Vitae`;
      h += `<div class="dt-feed-val-row"><dt>Result</dt><dd>${esc(resultStr)}</dd></div>`;
      if (roll.dice_string) {
        h += `<div class="dt-feed-val-row"><dt>Dice</dt><dd class="dt-feed-val-dice">${esc(roll.dice_string)}</dd></div>`;
      }
    } else if (poolStatus === 'validated') {
      h += `<div class="dt-feed-val-row"><dt>Result</dt><dd class="dt-story-section-empty">Pool validated — roll pending</dd></div>`;
    }

    // DTFP-5: Kiss / Violent declaration (effective value, ST override wins)
    const fv = effectiveFeedViolence(sub);
    const fvLbl = fv === 'kiss' ? 'The Kiss (subtle)' : fv === 'violent' ? 'Violent' : '';
    if (fvLbl) {
      const overrideTag = sub?.st_review?.feed_violence_st_override
        ? ' <span class="dt-feed-val-override-tag">(ST override)</span>'
        : '';
      h += `<div class="dt-feed-val-row"><dt>Declaration</dt><dd>${esc(fvLbl)}${overrideTag}</dd></div>`;
    }

    // Player feedback
    const feedback = fr.player_feedback || '';
    h += `<div class="dt-feed-val-row dt-feed-val-feedback-row"><dt>Player Feedback</dt>`;
    h += feedback
      ? `<dd>${esc(feedback)}</dd>`
      : `<dd class="dt-story-section-empty">None recorded</dd>`;
    h += `</div>`;

    h += `</dl>`;
  }

  // ── DTSR-7: ST-authored feeding narrative (additive; not a completion gate) ──
  // Renders for any feeding state including no_feed (an ST may want to write
  // about the choice not to feed). The Feeding section's overall completion
  // dot remains driven by validation/no_feed/roll, not by narrative state.
  const fn         = stNarrative?.feeding_narrative || {};
  const fnText     = fn.response || '';
  const fnStatus   = fn.status || 'draft';
  const fnRevNote  = fn.revision_note || '';
  const fnComplete = fnStatus === 'complete';
  const fnDotClass = fnComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';
  const fnIsRev    = fnStatus === 'needs_revision';

  h += `<div class="dt-feed-val-narrative-block">`;
  h += `<div class="dt-story-section-subhead">Storyteller narrative</div>`;
  h += `<div class="dt-story-section-prompt">What happened during the feeding that mattered — what did others see, what did the player do, what consequences carry forward?</div>`;
  h += `<textarea class="dt-story-response-ta dt-feed-narrative-ta" placeholder="Write the feeding narrative…">${esc(fnText)}</textarea>`;
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn">Save Draft</button>`;
  h += `<button class="dt-story-revision-note-btn${fnIsRev ? ' active' : ''}">Needs Revision</button>`;
  h += `<button class="dt-story-mark-complete-btn">`;
  h += `<span class="dt-story-completion-dot ${fnDotClass}"></span> Mark Complete`;
  h += `</button>`;
  h += `</div>`;
  h += `<div class="dt-story-revision-area${fnIsRev || fnRevNote ? '' : ' hidden'}">`;
  h += `<textarea class="dt-story-revision-ta" rows="2" placeholder="Revision note…">${esc(fnRevNote)}</textarea>`;
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-revision-save-btn">Save Revision Note</button>`;
  h += `</div></div>`;
  h += `</div>`;

  h += `</div></div>`;
  return h;
}

// ── Project Reports section ───────────────────────────────────────────────────

function renderProjectSection(char, sub) {
  const complete = projectResponsesComplete(sub);
  const dotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  let h = `<div class="dt-story-section" data-section="project_responses">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Project Reports</span>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  const resolved = sub.projects_resolved || [];
  const cards = resolved.slice(0, 4);

  if (!cards.length) {
    h += `<div class="dt-story-section-empty">No project actions for this submission.</div>`;
  } else {
    let rendered = 0;
    for (let i = 0; i < cards.length; i++) {
      const rev = cards[i] || {};
      if (rev.pool_status === 'skipped') continue;
      h += renderProjectCard(char, sub, i);
      rendered++;
    }
    if (!rendered) {
      h += `<div class="dt-story-section-empty">All project actions were skipped.</div>`;
    }
  }

  h += `</div></div>`;
  return h;
}

function renderProjectCard(char, sub, idx) {
  const slot = idx + 1;
  const rev = sub.projects_resolved?.[idx] || {};

  const title       = sub.responses?.[`project_${slot}_title`]       || `Project ${slot}`;
  const outcome     = sub.responses?.[`project_${slot}_outcome`]      || '';
  const territory   = sub.responses?.[`project_${slot}_territory`]    || '';
  const actionType  = rev.action_type_override || rev.action_type || sub.responses?.[`project_${slot}_action`] || '';
  const actionLabel = ACTION_TYPE_LABELS[actionType] || actionType || 'Action';

  const pool = formatPool(rev.pool_validated) || formatPool(rev.pool_player) || '\u2014';
  const roll = rev.roll || null;
  const notes = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];

  const saved      = sub.st_narrative?.project_responses?.[idx] || {};
  const savedTxt   = saved.response || '';
  const isComplete = saved.status === 'complete';
  const isRevision = saved.status === 'needs_revision';
  const revNote    = saved.revision_note || '';

  // Build roll summary
  let rollSummary = '';
  if (roll) {
    const s = roll.successes ?? 0;
    const exc = roll.exceptional ? ', Exceptional' : '';
    rollSummary = `${s} success${s !== 1 ? 'es' : ''}${exc}`;
  } else if (rev.pool_status === 'no_roll') {
    rollSummary = 'No roll';
  }

  // Build context text for display and copy
  const contextText = buildProjectContext(char, sub, idx);

  // Context block starts collapsed if textarea already has content
  const ctxCollapsed = savedTxt ? ' collapsed' : '';
  const ctxToggleLabel = savedTxt ? 'Show context' : 'Hide context';

  let h = `<div class="dt-story-proj-card${isComplete ? ' complete' : isRevision ? ' revision' : ''}" data-proj-idx="${idx}">`;

  // Header row
  h += `<div class="dt-story-proj-header">`;
  h += `<span class="dt-story-action-chip">${actionLabel}</span>`;
  h += `<span class="dt-story-proj-title">${title}</span>`;
  h += `<button class="dt-story-copy-ctx-btn" data-proj-idx="${idx}">Copy Context</button>`;
  h += `</div>`;

  // Meta row
  h += `<div class="dt-story-proj-meta">`;
  if (outcome) h += `<span class="dt-story-proj-outcome">Outcome: ${outcome}</span>`;
  const _showPool = rev.pool_status !== 'no_roll' && rev.pool_status !== 'maintenance' && pool !== '\u2014';
  const poolRoll = [_showPool ? `Pool: ${pool}` : '', rollSummary ? `Roll: ${rollSummary}` : ''].filter(Boolean).join(' \u2502 ');
  if (poolRoll) h += `<span class="dt-story-proj-pool">${poolRoll}</span>`;
  if (territory) h += `<span class="dt-story-proj-territory">Territory: ${territory}</span>`;
  h += `</div>`;

  // Context block (collapsible)
  h += `<div class="dt-story-context-block${ctxCollapsed}">`;
  h += `<pre class="dt-story-context-text">${contextText}</pre>`;
  h += `<a class="dt-story-context-toggle" role="button">${ctxToggleLabel}</a>`;
  h += `</div>`;

  // ST Notes (read-only)
  if (notes.length) {
    h += `<div class="dt-story-notes-thread">`;
    for (const note of notes) {
      h += `<div class="dt-story-note"><span class="dt-story-note-author">${note.author_name || 'ST'}:</span> ${note.text || ''}</div>`;
    }
    h += `</div>`;
  }

  // Response textarea
  h += `<textarea class="dt-story-response-ta" data-proj-idx="${idx}" placeholder="Write narrative response\u2026">${savedTxt}</textarea>`;

  // Action buttons
  const completeDotClass = isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn" data-proj-idx="${idx}">Save Draft</button>`;
  h += `<button class="dt-story-revision-note-btn${isRevision ? ' active' : ''}" data-proj-idx="${idx}">Needs Revision</button>`;
  h += `<button class="dt-story-mark-complete-btn" data-proj-idx="${idx}">`;
  h += `<span class="dt-story-completion-dot ${completeDotClass}"></span> Mark Complete`;
  h += `</button>`;
  h += `</div>`;
  h += `<div class="dt-story-revision-area${isRevision || revNote ? '' : ' hidden'}">`;
  h += `<textarea class="dt-story-revision-ta" data-proj-idx="${idx}" rows="2" placeholder="Revision note for player\u2026">${revNote}</textarea>`;
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-revision-save-btn" data-proj-idx="${idx}">Save Revision</button>`;
  h += `</div>`;
  h += `</div>`;

  h += `</div>`;
  return h;
}

// ── Letter from Home section ──────────────────────────────────────────────────

/**
 * Assembles the Copy Context prompt for the Letter from Home section.
 * Pure function — no side effects, no DOM access.
 * Player letter field confirmed as `correspondence` (schema: "In-character letter to NPC").
 */
function buildLetterContext(char, sub, opts = {}) {
  const { prevCorrespondence = null, prevCycleNumber = null, stVoiceNote = null, storyMomentTarget = null } = opts;
  const humanity = char?.humanity ?? 0;
  const touchstones = char?.touchstones || [];

  // Player's submitted letter — check known field names in priority order
  const playerLetter =
    sub.responses?.correspondence ||
    sub.responses?.letter_to_home ||
    sub.responses?.letter ||
    sub.responses?.narrative_letter ||
    sub.responses?.personal_message ||
    null;

  const playerAspirations = sub.responses?.aspirations || null;

  const lines = ['Draft a Letter from Home for:', '', _compactCharHeader(char)];
  const identLine = _charIdentLine(char);
  if (identLine) lines.push(identLine);

  if (touchstones.length) {
    lines.push('');
    lines.push('Touchstones:');
    for (const t of touchstones) {
      const status = humanity >= (t.humanity || 0) ? 'Attached' : 'Detached';
      lines.push(`- ${t.name} (Humanity ${t.humanity}, ${status})`);
    }
  }

  lines.push('');
  lines.push(`Aspirations: ${playerAspirations ? playerAspirations.trim() : '[No aspirations recorded]'}`);

  // NPCR.12: player's chosen story-moment target (if any). Surfaces name +
  // kind as prompt context so the letter can acknowledge that focus.
  if (storyMomentTarget?.name) {
    const kindLabel = storyMomentTarget.custom_label || storyMomentTarget.kind || '';
    lines.push('');
    lines.push(`Story-moment target: ${storyMomentTarget.name} (${kindLabel})`);
  }

  lines.push('');
  lines.push('Player-submitted letter:');
  lines.push(playerLetter ? playerLetter.trim() : '[No player letter submitted]');

  if (prevCorrespondence) {
    lines.push('');
    lines.push(`Previous letter from this correspondent (Downtime ${prevCycleNumber ?? '?'}):`);
    lines.push(prevCorrespondence.trim());
  }

  if (stVoiceNote) {
    lines.push('');
    lines.push(`Correspondent voice note: ${stVoiceNote.trim()}`);
  }

  lines.push('');
  lines.push('Apply LETTER_CORRESPONDENT_RULES. 100-300 words. Use house style.');

  return lines.join('\n');
}

// ── Touchstone Vignette context builder ───────────────────────────────────────

/**
 * Assembles the Copy Context prompt for the Touchstone Vignette section.
 * Pure function — no side effects, no DOM access.
 */
function buildTouchstoneContext(char, sub) {
  const humanity = char?.humanity ?? 0;
  const touchstones = char?.touchstones || [];
  const playerAspirations = sub.responses?.aspirations || null;

  const lines = ['Draft a Touchstone Vignette for:', '', _compactCharHeader(char)];
  const identLine = _charIdentLine(char);
  if (identLine) lines.push(identLine);

  if (touchstones.length) {
    lines.push('');
    lines.push('Touchstones:');
    for (const t of touchstones) {
      const status = humanity >= (t.humanity || 0) ? 'Attached' : 'Detached';
      lines.push(`- ${t.name} (Humanity ${t.humanity}, ${status})`);
    }
  }

  lines.push('');
  lines.push(`Aspirations: ${playerAspirations ? playerAspirations.trim() : '[No aspirations recorded]'}`);

  lines.push('');
  lines.push('Apply TOUCHSTONE_CALIBRATION. 100-300 words. Use house style.');

  return lines.join('\n');
}

// ── Story Moment section (Letter from Home + Touchstone Vignette consolidated) ──

function renderStoryMoment(char, sub, stNarrative) {
  // Read priority: new consolidated field, then legacy letter, then legacy touchstone
  const sm               = stNarrative?.story_moment;
  const legacyLetter     = stNarrative?.letter_from_home;
  const legacyTouchstone = stNarrative?.touchstone;

  let initialFormat   = 'letter';
  let initialText     = '';
  let initialStatus   = 'draft';
  let initialRevNote  = '';
  let legacyNote      = '';

  if (sm) {
    initialFormat  = sm.format === 'vignette' ? 'vignette' : 'letter';
    initialText    = sm.response || '';
    initialStatus  = sm.status || 'draft';
    initialRevNote = sm.revision_note || '';
  } else if (legacyLetter?.response) {
    initialFormat  = 'letter';
    initialText    = legacyLetter.response;
    initialStatus  = legacyLetter.status || 'draft';
    initialRevNote = legacyLetter.revision_note || '';
    legacyNote     = 'Loaded from Letter from Home';
  } else if (legacyTouchstone?.response) {
    initialFormat  = 'vignette';
    initialText    = legacyTouchstone.response;
    initialStatus  = legacyTouchstone.status || 'draft';
    initialRevNote = legacyTouchstone.revision_note || '';
    legacyNote     = 'Loaded from Touchstone Vignette';
  }

  const complete   = initialStatus === 'complete';
  const isRevision = initialStatus === 'needs_revision';
  const dotClass   = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  const humanity    = char?.humanity ?? 0;
  const touchstones = char?.touchstones || [];
  const playerLetter =
    sub.responses?.correspondence ||
    sub.responses?.letter_to_home ||
    sub.responses?.letter ||
    sub.responses?.narrative_letter ||
    sub.responses?.personal_message ||
    null;
  const playerAspirations = sub.responses?.aspirations || null;

  const ctxCollapsed   = initialText ? ' collapsed' : '';
  const ctxToggleLabel = initialText ? 'Show context' : 'Hide context';

  let h = `<div class="dt-story-section${complete ? ' complete' : ''}" data-section="story_moment">`;

  // Section header
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Story Moment</span>`;
  h += `<div class="dt-story-section-header-actions">`;
  h += `<button class="dt-story-copy-ctx-btn">Copy Context</button>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `</div>`;

  h += `<div class="dt-story-section-body">`;

  // Format selector
  h += `<div class="dt-story-format-row">`;
  h += `<label class="dt-story-format-radio"><input type="radio" name="story-moment-format" value="letter"${initialFormat === 'letter' ? ' checked' : ''}> Letter from Home</label>`;
  h += `<label class="dt-story-format-radio"><input type="radio" name="story-moment-format" value="vignette"${initialFormat === 'vignette' ? ' checked' : ''}> Touchstone Vignette</label>`;
  if (legacyNote) {
    h += `<span class="dt-story-note-author dt-story-legacy-load-note">${legacyNote}</span>`;
  }
  h += `</div>`;

  // Combined context block (collapsible)
  h += `<div class="dt-story-context-block${ctxCollapsed}">`;

  // Touchstone list
  if (touchstones.length) {
    h += `<div class="dt-story-touchstone-list">`;
    for (const t of touchstones) {
      const attached   = humanity >= (t.humanity || 0);
      const stateClass = attached ? 'dt-story-ts-attached' : 'dt-story-ts-detached';
      const stateLabel = attached ? 'Attached' : 'Detached';
      const desc       = t.desc ? ` (${t.desc})` : '';
      h += `<div class="dt-story-touchstone-entry ${stateClass}">`;
      h += `${t.name}${desc} — Hum ${t.humanity} — <em>${stateLabel}</em>`;
      h += `</div>`;
    }
    h += `</div>`;
  } else {
    h += `<div class="dt-story-section-empty">No touchstones on character record.</div>`;
  }

  // Player's submitted letter / message
  h += `<div class="dt-story-player-letter">`;
  h += `<span class="dt-story-note-author">Player's letter:</span> `;
  if (playerLetter) {
    h += `<pre class="dt-story-context-text">${playerLetter.trim()}</pre>`;
  } else {
    h += `<em class="dt-story-section-empty">[No player letter submitted]</em>`;
  }
  h += `</div>`;

  // Player's aspirations
  h += `<div class="dt-story-aspirations">`;
  h += `<span class="dt-story-note-author">Player's aspirations:</span> `;
  if (playerAspirations) {
    const display = playerAspirations.length > 200
      ? playerAspirations.slice(0, 200) + '…'
      : playerAspirations;
    h += `<span>${display}</span>`;
  } else {
    h += `<em class="dt-story-section-empty">[No aspirations recorded]</em>`;
  }
  h += `</div>`;

  h += `<a class="dt-story-context-toggle" role="button">${ctxToggleLabel}</a>`;
  h += `</div>`; // context-block

  // Response textarea
  h += `<textarea class="dt-story-response-ta" placeholder="Write the story moment…">${initialText}</textarea>`;

  // Action buttons
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn">Save Draft</button>`;
  h += `<button class="dt-story-revision-note-btn${isRevision ? ' active' : ''}">Needs Revision</button>`;
  h += `<button class="dt-story-mark-complete-btn">`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span> Mark Complete`;
  h += `</button>`;
  h += `</div>`;
  h += `<div class="dt-story-revision-area${isRevision || initialRevNote ? '' : ' hidden'}">`;
  h += `<textarea class="dt-story-revision-ta" rows="2" placeholder="Revision note for player…">${initialRevNote}</textarea>`;
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-revision-save-btn">Save Revision</button>`;
  h += `</div>`;
  h += `</div>`;

  h += `</div>`; // section-body
  h += `</div>`; // dt-story-section
  return h;
}

// ── Merit action helpers (B3) ─────────────────────────────────────────────────

/**
 * Builds a flat merit_actions array from a submission's raw/response fields.
 * Called at load time for submissions that don't already have merit_actions populated.
 * Ordering: spheres → contacts → retainers (matches downtime-views.js flat index).
 */
function buildMeritActions(sub) {
  const resp = sub.responses || {};
  const raw  = sub._raw || {};
  const actions = [];

  // ── Spheres ──
  const sphereRaw = raw.sphere_actions || [];
  if (sphereRaw.length) {
    sphereRaw.forEach((entry, idx) => {
      const slot = idx + 1;
      actions.push({
        merit_type:      resp[`sphere_${slot}_merit`]                            || '',
        action_type:     entry.action_type                                       || 'misc',
        desired_outcome: entry.desired_outcome || resp[`sphere_${slot}_outcome`] || '',
        description:     entry.detail         || resp[`sphere_${slot}_description`] || '',
      });
    });
  } else {
    for (let n = 1; n <= 5; n++) {
      const mt = resp[`sphere_${n}_merit`];
      if (!mt) continue;
      actions.push({
        merit_type:      mt,
        action_type:     resp[`sphere_${n}_action`]      || 'misc',
        desired_outcome: resp[`sphere_${n}_outcome`]     || '',
        description:     resp[`sphere_${n}_description`] || '',
      });
    }
  }

  // ── Contacts ──
  const contactRaw = raw.contact_actions?.requests || [];
  if (contactRaw.length) {
    contactRaw.forEach(c => actions.push({
      merit_type: 'Contacts', action_type: 'misc', desired_outcome: '',
      description: c.detail || c.description || '',
    }));
  } else {
    for (let n = 1; n <= 5; n++) {
      const req = resp[`contact_${n}_request`];
      if (!req) continue;
      // Use stored merit label (e.g. "Contacts ●●● (Crime)") so qualifier renders
      const meritLbl = resp[`contact_${n}_merit`] || 'Contacts';
      actions.push({ merit_type: meritLbl, action_type: 'misc', desired_outcome: '', description: req });
    }
  }

  // ── Retainers ──
  const retainerRaw = raw.retainer_actions?.actions || [];
  if (retainerRaw.length) {
    retainerRaw.forEach(r => actions.push({
      merit_type: 'Retainer', action_type: 'misc', desired_outcome: '',
      description: r.task || r.description || '',
    }));
  } else {
    for (let n = 1; n <= 4; n++) {
      const task = resp[`retainer_${n}_task`];
      if (!task) continue;
      actions.push({ merit_type: 'Retainer', action_type: 'misc', desired_outcome: '', description: task });
    }
  }

  // ── Resource / skill acquisitions ──
  // Stored separately from sphere actions — appended last so flat indices for
  // spheres/contacts/retainers above are not disturbed.
  const resAcqBlob = raw.acquisitions?.resource_acquisitions || resp['resources_acquisitions'] || '';
  if (resAcqBlob.trim()) {
    const desc = resp['acq_description'] || resAcqBlob;
    let meritsLabel = '';
    try {
      const keys = JSON.parse(resp['acq_merits'] || '[]');
      if (keys.length) meritsLabel = keys.join(', ');
    } catch { /* ignore */ }
    actions.push({
      merit_type:      'Resources',
      action_type:     'acquisition',
      desired_outcome: meritsLabel || '',
      description:     desc,
    });
  }

  const skillAcqBlob = raw.acquisitions?.skill_acquisitions || resp['skill_acquisitions'] || '';
  if (skillAcqBlob.trim()) {
    actions.push({
      merit_type:      'Skill Acquisition',
      action_type:     'acquisition',
      desired_outcome: '',
      description:     skillAcqBlob,
    });
  }

  return actions;
}

/**
 * Derives the merit category from a merit type string.
 * Mirrors _parseMeritType in downtime-views.js — duplicated per NFR-DS-01.
 */
function deriveMeritCategory(meritTypeStr) {
  const s = (meritTypeStr || '').toLowerCase();
  if (/allies/.test(s))    return 'allies';
  if (/status/.test(s))    return 'status';
  if (/retainer/.test(s))  return 'retainer';
  if (/staff/.test(s))     return 'staff';
  if (/contacts?/.test(s)) return 'contacts';
  if (/resources?/.test(s)) return 'resources';
  if (/skill/.test(s))      return 'resources';
  return 'misc';
}

/**
 * Looks up a merit's dot count and qualifier from the character sheet.
 * Returns { dots, qualifier, label }.
 */
function getMeritDetails(char, action) {
  const rawType = action.merit_type || '';

  // Extract qualifier from parentheses in stored merit label:
  // "Allies ●●● (Underworld)" → inlineQualifier = "Underworld"
  const parenMatch = rawType.match(/\(([^)]+)\)/);
  const inlineQualifier = parenMatch ? parenMatch[1].trim() : '';

  // Strip qualifier parens, dot chars, and trailing digits to get base name:
  // "Allies ●●● (Underworld)" → "Allies"
  const meritName = rawType
    .replace(/\s*\([^)]*\)\s*/g, '')
    .replace(/[\u25cf\u25cb●○]+/g, '')
    .replace(/\s*\d+\s*$/, '')
    .trim();

  const merit = char?.merits?.find(m =>
    m.name?.toLowerCase() === meritName.toLowerCase() ||
    m.name?.toLowerCase().includes(meritName.toLowerCase()) ||
    meritName.toLowerCase().includes((m.name || '').toLowerCase())
  );
  return {
    dots:      merit ? (merit.dots || merit.rating || 0) : 0,
    qualifier: inlineQualifier || merit?.qualifier || action.qualifier || '',
    label:     merit?.name || meritName,
  };
}

/**
 * Computes the Investigation Matrix outcome string from a resolved entry.
 * Returns null if rev.roll or rev.inv_secrecy is absent.
 */
function getInvestigateInterpretation(rev) {
  if (!rev.roll || !rev.inv_secrecy) return null;
  const tier = INVESTIGATION_MATRIX.find(t => t.type === rev.inv_secrecy);
  if (!tier) return null;
  let modifier = tier.innate;
  if (!rev.inv_has_lead) modifier += tier.noLead;
  const net = (rev.roll.successes || 0) + modifier;
  if (net < 1) return `Matrix result (${tier.type}, net ${net}): insufficient successes`;
  const resultIdx = Math.min(Math.max(net - 1, 0), tier.results.length - 1);
  return `Matrix result (${tier.type}, net ${net}): ${tier.results[resultIdx]}`;
}

/**
 * Returns true when all non-skipped merit actions in the given categories are complete.
 * Returns true if no applicable actions exist (section suppressed = trivially complete).
 * Uses global indices so responses[idx] aligns with merit_actions[idx].
 */
function actionResponsesComplete(sub, categories) {
  const applicable = [];
  (sub?.merit_actions || []).forEach((a, globalIdx) => {
    const cat = deriveMeritCategory(a.merit_type);
    if (!categories.includes(cat)) return;
    const rev = sub?.merit_actions_resolved?.[globalIdx] || {};
    if (rev.pool_status !== 'skipped') applicable.push(globalIdx);
  });
  if (!applicable.length) return true;
  const responses = sub?.st_narrative?.action_responses || [];
  return applicable.every(globalIdx => responses[globalIdx]?.status === 'complete');
}

function meritSummaryComplete(sub) {
  const actions  = sub?.merit_actions || [];
  const resolved = sub?.merit_actions_resolved || [];
  const applicable = actions.filter((_, i) => (resolved[i]?.pool_status || '') !== 'skipped');
  if (!applicable.length) return true;
  return applicable.every((_, i) => !!(resolved[i]?.outcome_summary?.trim()));
}

const MERIT_CATEGORY_ORDER = ['allies', 'status', 'contacts', 'retainer', 'staff', 'resources', 'misc'];
const MERIT_CATEGORY_LABELS = {
  allies: 'Allies', status: 'Status', contacts: 'Contacts',
  retainer: 'Retainers', staff: 'Staff', resources: 'Resources', misc: 'Influence',
};

function renderMeritSummary(char, sub) {
  const actions  = sub?.merit_actions || [];
  const resolved = sub?.merit_actions_resolved || [];
  const complete = meritSummaryComplete(sub);
  const dotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  // Group non-skipped actions by category
  const groups = {};
  actions.forEach((a, i) => {
    const rev = resolved[i] || {};
    if (rev.pool_status === 'skipped') return;
    const cat = deriveMeritCategory(a.merit_type);
    if (!groups[cat]) groups[cat] = [];
    const { label: meritLabel } = getMeritDetails(char, a);
    groups[cat].push({
      meritLabel: meritLabel || a.merit_type || 'Merit',
      desiredOutcome: a.desired_outcome?.trim() || '',
      outcome: rev.outcome_summary?.trim() || '',
    });
  });

  let h = `<div class="dt-story-section" data-section="merit_summary">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Allies &amp; Asset Summary</span>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  const orderedCats = MERIT_CATEGORY_ORDER.filter(c => groups[c]);
  if (!orderedCats.length) {
    h += `<div class="dt-story-section-empty">No merit actions this cycle.</div>`;
  } else {
    for (const cat of orderedCats) {
      h += `<div class="dt-merit-summary-group">`;
      h += `<div class="dt-merit-summary-group-label">${MERIT_CATEGORY_LABELS[cat] || cat}</div>`;
      h += `<div class="dt-merit-summary-rows">`;
      for (const entry of groups[cat]) {
        const missingClass = entry.outcome ? '' : ' dt-merit-summary-missing';
        h += `<div class="dt-merit-summary-row${missingClass}">`;
        h += `<span class="dt-merit-summary-merit">${esc(entry.meritLabel)}</span>`;
        const desiredEmpty = entry.desiredOutcome ? '' : ' dt-merit-summary-empty';
        h += `<span class="dt-merit-summary-desired${desiredEmpty}">${entry.desiredOutcome ? esc(entry.desiredOutcome) : '— No desired outcome stated —'}</span>`;
        h += `<span class="dt-merit-summary-outcome">${entry.outcome ? esc(entry.outcome) : '— Outcome not yet recorded —'}</span>`;
        h += `</div>`;
      }
      h += `</div></div>`;
    }
  }

  h += `<div class="dt-story-section-actions">`;
  if (complete) {
    h += `<span class="dt-story-complete-badge">&#10003; All outcomes recorded</span>`;
  } else {
    const missing = actions.filter((_, i) => {
      const rev = resolved[i] || {};
      return rev.pool_status !== 'skipped' && !rev.outcome_summary?.trim();
    }).length;
    h += `<span class="dt-story-pending-note">${missing} outcome${missing !== 1 ? 's' : ''} still to record in DT Processing</span>`;
  }
  h += `</div>`;
  h += `</div></div>`;
  return h;
}

// ── A1: Cross-action derivation functions (Story 1.8) ─────────────────────────
// These are pure derivation functions — no new schema fields. Wired into buildActionContext.
// NOTE: The "Supported" chip is not implemented — support_target_char does not exist as a
// structured field. Support context surfaces via notes_thread entries set during DT Processing.

/**
 * Returns hide/protect project actions by the same character in the given territory.
 * Returns [] if terrId is null or no matching actions exist.
 */
function getHideProtectCover(sub, terrId) {
  if (!terrId) return [];
  return (sub.projects_resolved || []).filter((rev, idx) => {
    if (!rev || rev.action_type !== 'hide_protect') return false;
    if (rev.pool_status === 'skipped') return false;
    const slot = idx + 1;
    return resolveTerrId(sub.responses?.[`project_${slot}_territory`] || '') === terrId;
  }).map(rev => ({ successes: rev.roll?.successes ?? null }));
}

/**
 * Returns attack/investigate actions from other characters targeting this character.
 * Checks both projects_resolved and merit_actions_resolved on other submissions.
 */
function getContestingActions(sub, char, allSubmissions) {
  const charName = char ? displayName(char) : '';
  const contesters = [];
  for (const s of allSubmissions) {
    if (s._id === sub._id) continue;
    (s.projects_resolved || []).forEach(rev => {
      if (!rev || rev.pool_status === 'skipped') return;
      const isAttack = rev.action_type === 'attack' && rev.attack_target_char === charName;
      const isInvest = rev.action_type === 'investigate' && rev.investigate_target_char === charName;
      if (!isAttack && !isInvest) return;
      contesters.push({ type: isAttack ? 'attack' : 'investigate', characterName: s.character_name || 'Unknown', successes: rev.roll?.successes ?? null });
    });
    (s.merit_actions_resolved || []).forEach(rev => {
      if (!rev || rev.pool_status === 'skipped') return;
      const isAttack = rev.action_type === 'attack' && rev.attack_target_char === charName;
      const isInvest = rev.action_type === 'investigate' && rev.investigate_target_char === charName;
      if (!isAttack && !isInvest) return;
      contesters.push({ type: isAttack ? 'attack' : 'investigate', characterName: s.character_name || 'Unknown', successes: rev.roll?.successes ?? null });
    });
  }
  return contesters;
}

/**
 * Returns other characters' allies/status/retainer merit actions in the same territory.
 * Territory is read from sub.st_review.territory_overrides[`allies_${meritFlatIdx}`].
 * Returns [] if no territory override is set for this action.
 */
function getTerritoryOverlap(sub, meritFlatIdx, allSubmissions, allChars) {
  const rawOverride = sub.st_review?.territory_overrides?.[`allies_${meritFlatIdx}`] || '';
  const terrId = resolveTerrId(rawOverride);
  if (!terrId) return [];
  const overlaps = [];
  for (const s of allSubmissions) {
    if (s._id === sub._id) continue;
    (s.merit_actions_resolved || []).forEach((rev, idx) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const meritType = (s.merit_actions || [])[idx]?.merit_type || '';
      const cat = deriveMeritCategory(meritType);
      if (!['allies', 'status', 'retainer'].includes(cat)) return;
      const otherTerr = resolveTerrId(s.st_review?.territory_overrides?.[`allies_${idx}`] || '');
      if (otherTerr !== terrId) return;
      overlaps.push({ characterName: s.character_name || 'Unknown', meritType });
    });
  }
  return overlaps;
}

// ── Action context builder (B3 + A1) ─────────────────────────────────────────

/**
 * Specialised prompt for resource acquisition actions.
 */
function _buildResourceAcqContext(char, action, rev, dots) {
  const lines = ['Draft a resources acquisition response for:', '', _compactCharHeader(char)];

  // Resources merit dots
  const resourcesMerit = char?.merits?.find(m => /^resources$/i.test(m.merit_name || m.name || ''));
  const resDots = resourcesMerit ? (resourcesMerit.dots || 0) : (dots || 0);
  lines.push(`Resources: ${'●'.repeat(resDots)} (${resDots} dots)`);

  // Fixer merit
  const hasFixer = char?.merits?.some(m => /fixer/i.test(m.merit_name || m.name || ''));
  if (hasFixer) lines.push('Fixer merit: Yes');

  // Parse item + availability from description blob
  const desc = action.description || '';
  const itemMatch = desc.match(/acquisition description[:\s]+([^\n]+)/i);
  const availMatch = desc.match(/availability[:\s]+([^\n]+)/i);
  const item = itemMatch ? itemMatch[1].trim() : (desc.trim() || 'Not specified');
  const avail = availMatch ? availMatch[1].trim() : null;

  lines.push(`Item: ${item}`);
  if (avail) lines.push(`Availability: ${avail}`);

  // ST notes thread
  const notes = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];
  if (notes.length) {
    lines.push('');
    lines.push('ST directives:');
    notes.forEach(n => lines.push(`- [${n.author_name || 'ST'}] ${n.text || ''}`));
  }

  lines.push('');
  lines.push('This is a purchase, not a contacts report. Register: transactional. Confirm whether the acquisition succeeds, note any complications (cost, time, conditions). 40-80 words. Use house style.');

  return lines.join('\n');
}

/**
 * Assembles the Copy Context prompt for a single merit action.
 * Pure function — reads module-level _allSubmissions / _allCharacters for cross-action chips.
 */
function buildActionContext(char, sub, idx) {
  const action = sub.merit_actions?.[idx] || {};
  const rev    = sub.merit_actions_resolved?.[idx] || {};

  const actionType  = rev.action_type_override || action.action_type || '';
  const meritCat    = deriveMeritCategory(action.merit_type);
  const { dots, qualifier, label } = getMeritDetails(char, action);

  // ── Resource acquisition: specialised prompt ──────────────────────────────
  if (meritCat === 'resources' && actionType === 'acquisition') {
    return _buildResourceAcqContext(char, action, rev, dots);
  }

  const matrixEntry = MERIT_MATRIX[meritCat]?.[actionType] || {};
  const isAuto      = matrixEntry.poolFormula === 'none';
  const mode        = isAuto ? 'Auto (no roll)' : 'Rolled';

  // Pool display
  const basePool = matrixEntry.poolFormula === 'dots2plus2' ? (dots * 2) + 2 : null;
  const pool = rev.pool_validated || action.primary_pool ||
    (basePool ? `${basePool} dice` : (matrixEntry.poolFormula === 'contacts' ? 'Contacts pool' : 'Auto'));

  // Territory (allies/status only)
  const territory = ['allies', 'status'].includes(meritCat)
    ? (sub.st_review?.territory_overrides?.[`allies_${idx}`] || '')
    : '';

  // Cross-action context (A1)
  const terrId    = territory ? resolveTerrId(territory) : null;
  const covered   = getHideProtectCover(sub, terrId);
  const contested = getContestingActions(sub, char, _allSubmissions);
  const overlaps  = getTerritoryOverlap(sub, idx, _allSubmissions, _allCharacters);

  // Investigation interpretation (investigate actions only)
  const matrixNote = (actionType === 'investigate') ? getInvestigateInterpretation(rev) : null;

  const notes = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];

  const dotStr = dots ? '\u25CF'.repeat(dots) : '';
  const qualStr = qualifier ? ` (${qualifier})` : '';
  const meritDisplay = `${label}${dotStr ? ' ' + dotStr : ''}${qualStr}`;

  const actionLabel = ACTION_TYPE_LABELS[actionType] || actionType || 'Unknown';
  const effect = (isAuto && matrixEntry.effectAuto) ? matrixEntry.effectAuto : (matrixEntry.effect || '');

  const lines = ['Draft a merit action response for:', '', _compactCharHeader(char)];

  lines.push('');
  lines.push(`Merit: ${meritDisplay}`);
  lines.push(`Action: ${actionLabel}`);
  if (territory) lines.push(`Territory: ${territory}`);
  if (action.desired_outcome) lines.push(`Desired Outcome: ${action.desired_outcome}`);
  if (action.description)     lines.push(`Description: ${action.description}`);

  if (isAuto) {
    lines.push('No roll required.');
  } else {
    if (pool) lines.push(`Pool: ${pool}`);
    if (rev.roll) {
      const diceStr = rev.roll.dice_string || (Array.isArray(rev.roll.dice) ? '[' + rev.roll.dice.join(', ') + ']' : '');
      const s = rev.roll.successes ?? 0;
      const exc = rev.roll.exceptional ? ' (Exceptional)' : '';
      lines.push(`Roll: ${s} successes${exc}${diceStr ? ' \u2014 Dice: ' + diceStr : ''}`);
    }
  }

  if (matrixNote) lines.push(`Matrix Outcome: ${matrixNote}`);
  if (effect)     lines.push(`Effect: ${effect}`);
  if (actionType === 'block' && dots) lines.push(`Auto-blocks: merits of level ${dots} or lower`);

  if (rev.contacts_info_type) lines.push(`Info Type: ${rev.contacts_info_type}`);
  if (rev.contacts_subject)   lines.push(`Subject: ${rev.contacts_subject}`);

  if (rev.patrol_detail_level) lines.push(`Detail Level: ${rev.patrol_detail_level}`);
  if (rev.patrol_observed)     lines.push(`Observed: ${rev.patrol_observed}`);

  if (rev.rumour_detail_level) lines.push(`Detail Level: ${rev.rumour_detail_level}`);
  if (rev.rumour_content)      lines.push(`Rumour Surfaced: ${rev.rumour_content}`);

  if (rev.support_target_key) {
    const _tParts = rev.support_target_key.split(':');
    const _tSub   = _allSubmissions.find(s => s._id === _tParts[0]);
    const _tChar  = _tSub ? (_allCharacters.find(c => c._id === _tSub.character_id) || null) : null;
    const _tName  = _tChar ? (_tChar.moniker || _tChar.name) : (_tSub?.character_name || _tParts[0]);
    const _tType  = _tParts[1] || '';
    lines.push(`Supporting Action: ${_tName} (${_tType})`);
  }

  // Cross-action context chips
  const chips = [];
  if (covered.length) {
    covered.forEach(c => chips.push(`Covered by Hide/Protect (${c.successes !== null ? c.successes + ' successes' : 'unresolved'})`));
  }
  if (contested.length) {
    contested.forEach(c => {
      const sStr = c.successes !== null ? ` (${c.successes} successes)` : '';
      chips.push(`${c.type === 'attack' ? 'Under Attack' : 'Under Investigation'} by ${c.characterName}${sStr}`);
    });
  }
  if (overlaps.length) {
    overlaps.forEach(o => chips.push(`Territory Overlap: ${o.characterName} (${o.meritType})`));
  }
  if (chips.length) {
    lines.push('');
    lines.push('Cross-action context:');
    chips.forEach(chip => lines.push(`- ${chip}`));
  }

  if (notes.length) {
    lines.push('');
    lines.push('ST directives:');
    notes.forEach(n => lines.push(`- [${n.author_name || 'ST'}] ${n.text || ''}`));
  }

  if (rev.player_feedback) {
    lines.push('');
    lines.push(`Story context (do not contradict): ${rev.player_feedback}`);
  }
  if (rev.player_facing_note) {
    lines.push('');
    lines.push(`Player-facing note: ${rev.player_facing_note}`);
  }

  lines.push('');
  lines.push('Apply FEEDING_CONSTRAINTS for merit-source rules. 50-80 words. Intermediary voice businesslike, not dramatic. Use house style.');

  return lines.join('\n');
}

// ── Merit action section renderers (B3) ───────────────────────────────────────

/**
 * Renders a single merit action card (shared by allies/status/retainer/contacts sections).
 */
function renderActionCard(char, sub, idx) {
  const action = sub.merit_actions?.[idx] || {};
  const rev    = sub.merit_actions_resolved?.[idx] || {};

  const actionType  = rev.action_type_override || action.action_type || '';
  const meritCat    = deriveMeritCategory(action.merit_type);
  const { dots, qualifier, label } = getMeritDetails(char, action);
  const matrixEntry = MERIT_MATRIX[meritCat]?.[actionType] || {};
  const isAuto      = matrixEntry.poolFormula === 'none';
  const modeLabel   = isAuto ? 'Auto' : 'Rolled';

  const basePool = matrixEntry.poolFormula === 'dots2plus2' ? (dots * 2) + 2 : null;
  const pool = formatPool(rev.pool_validated) || action.primary_pool ||
    (basePool ? `${basePool} dice` : (matrixEntry.poolFormula === 'contacts' ? 'Contacts pool' : 'Auto'));

  const territory = ['allies', 'status'].includes(meritCat)
    ? (sub.st_review?.territory_overrides?.[`allies_${idx}`] || '')
    : '';

  const roll  = (!isAuto && rev.roll) ? rev.roll : null;
  const notes = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];

  const saved      = sub.st_narrative?.action_responses?.[idx] || {};
  const savedTxt   = saved.response || '';
  const isComplete = saved.status === 'complete';
  const isRevision = saved.status === 'needs_revision';
  const revNote    = saved.revision_note || '';

  // Contacts and resources: show qualifier only (no dot count — qualifier is the identifier)
  const showDots = meritCat !== 'contacts' && meritCat !== 'resources';
  const dotStr  = (showDots && dots) ? '\u25CF'.repeat(dots) : '';
  const qualStr = qualifier ? ` (${qualifier})` : '';
  const actionLabel = ACTION_TYPE_LABELS[actionType] || actionType || 'Action';

  // Roll summary
  let rollSummary = '';
  if (roll) {
    const s   = roll.successes ?? 0;
    const exc = roll.exceptional ? ' \u2014 Exceptional' : '';
    const againVal = roll.params?.again ?? 10;
    const againStr = againVal === 8 ? ' \u00b7 8-Again' : againVal === 9 ? ' \u00b7 9-Again' : '';
    const roteStr  = roll.params?.rote ? ' \u00b7 Rote' : '';
    const diceStr  = roll.dice_string ? ` ${roll.dice_string}` : '';
    rollSummary = `${s} success${s !== 1 ? 'es' : ''}${exc}${againStr}${roteStr}${diceStr}`;
  } else if (rev.pool_status === 'no_roll') {
    rollSummary = 'No roll';
  }

  const ctxCollapsed   = savedTxt ? ' collapsed' : '';
  const ctxToggleLabel = savedTxt ? 'Show context' : 'Hide context';
  const completeDotClass = isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  let h = `<div class="dt-story-merit-card${isComplete ? ' complete' : isRevision ? ' revision' : ''}" data-action-idx="${idx}">`;

  // Header
  h += `<div class="dt-story-merit-header">`;
  const chipLabel = meritCat === 'resources' ? 'Request' : modeLabel;
  const chipClass = (meritCat === 'resources' || isAuto) ? 'auto' : 'rolled';
  h += `<span class="dt-story-mode-chip ${chipClass}">${chipLabel}</span>`;
  h += `<span class="dt-story-merit-label">${label}${dotStr ? ' ' + dotStr : ''}${qualStr}</span>`;
  h += `<button class="dt-story-copy-ctx-btn" data-action-idx="${idx}">Copy Context</button>`;
  h += `</div>`;

  // Meta row
  h += `<div class="dt-story-merit-meta">`;
  // Contacts and resources: no action chip (contacts have no action type; resources show request description instead)
  if (meritCat !== 'contacts' && meritCat !== 'resources') h += `<span class="dt-story-action-chip">${actionLabel}</span>`;
  if (territory) h += `<span class="dt-story-proj-territory">Territory: ${territory}</span>`;
  if (meritCat !== 'resources') {
    const poolRoll = [pool ? `Pool: ${pool}` : '', rollSummary ? `Roll: ${rollSummary}` : ''].filter(Boolean).join(' \u2502 ');
    if (poolRoll) h += `<span class="dt-story-proj-pool">${poolRoll}</span>`;
  }
  if (action.desired_outcome) h += `<span class="dt-story-proj-outcome">${meritCat === 'resources' ? 'Requested: ' : 'Outcome: '}${action.desired_outcome}</span>`;
  h += `</div>`;

  // Collapsible context block
  h += `<div class="dt-story-context-block${ctxCollapsed}">`;
  h += `<pre class="dt-story-context-text">${buildActionContext(char, sub, idx)}</pre>`;
  h += `<a class="dt-story-context-toggle" role="button">${ctxToggleLabel}</a>`;
  h += `</div>`;

  // ST Notes (read-only)
  if (notes.length) {
    h += `<div class="dt-story-notes-thread">`;
    notes.forEach(n => { h += `<div class="dt-story-note"><span class="dt-story-note-author">${n.author_name || 'ST'}:</span> ${n.text || ''}</div>`; });
    h += `</div>`;
  }

  // Response textarea
  h += `<textarea class="dt-story-response-ta" data-action-idx="${idx}" placeholder="Write narrative note\u2026">${savedTxt}</textarea>`;

  // Buttons
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn" data-action-idx="${idx}">Save Draft</button>`;
  h += `<button class="dt-story-revision-note-btn${isRevision ? ' active' : ''}" data-action-idx="${idx}">Needs Revision</button>`;
  h += `<button class="dt-story-mark-complete-btn" data-action-idx="${idx}">`;
  h += `<span class="dt-story-completion-dot ${completeDotClass}"></span> Mark Complete`;
  h += `</button>`;
  h += `</div>`;
  h += `<div class="dt-story-revision-area${isRevision || revNote ? '' : ' hidden'}">`;
  h += `<textarea class="dt-story-revision-ta" data-action-idx="${idx}" rows="2" placeholder="Revision note for player\u2026">${revNote}</textarea>`;
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-revision-save-btn" data-action-idx="${idx}">Save Revision</button>`;
  h += `</div>`;
  h += `</div>`;

  h += `</div>`;
  return h;
}

/**
 * Renders a section containing merit action cards for the given categories.
 * Skipped actions are suppressed. Returns '' if all actions in the category are skipped.
 */
function renderMeritSection(char, sub, sectionKey, sectionLabel, categories) {
  const actions    = sub.merit_actions || [];
  const resolved   = sub.merit_actions_resolved || [];
  const stNarrative = sub.st_narrative;

  const applicable = actions
    .map((a, i) => ({ a, i, rev: resolved[i] || {} }))
    .filter(({ a, rev }) => categories.includes(deriveMeritCategory(a.merit_type)) && rev.pool_status !== 'skipped');

  const complete = actionResponsesComplete(sub, categories);
  const dotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  let h = `<div class="dt-story-section" data-section="${sectionKey}">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">${sectionLabel}</span>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  if (!applicable.length) {
    h += `<div class="dt-story-section-empty">No actions for this section.</div>`;
  } else {
    applicable.forEach(({ i }) => { h += renderActionCard(char, sub, i); });
  }

  h += `</div></div>`;
  return h;
}

function renderAlliesSection(char, sub)   { return renderMeritSection(char, sub, 'allies_actions',   'Allies Actions',   ['allies']); }
function renderStatusSection(char, sub)   { return renderMeritSection(char, sub, 'status_actions',   'Status Actions',   ['status']); }
function renderRetainerSection(char, sub) { return renderMeritSection(char, sub, 'retainer_actions', 'Retainer Actions', ['retainer', 'staff']); }
function renderContactsSection(char, sub) { return renderMeritSection(char, sub, 'contact_requests',  'Contact Requests',  ['contacts']); }
function renderMiscMeritSection(char, sub){ return renderMeritSection(char, sub, 'misc_merit_actions', 'Influence Actions', ['misc']); }

function renderResourcesSection(char, sub) {
  return renderMeritSection(char, sub, 'resource_approvals', 'Resources / Skill Acquisitions', ['resources']);
}

// ── Territory Report helpers ──────────────────────────────────────────────────

/**
 * Parses sub.responses.feeding_territories JSON string safely.
 * Returns array of [slugKey, value] pairs, or [] on failure.
 */
function parseFeedingTerritories(sub) {
  try {
    return Object.entries(JSON.parse(sub.responses?.feeding_territories || '{}'));
  } catch {
    return [];
  }
}

/**
 * Finds all other characters resident in the same territory slug this cycle.
 * Returns array of { name, clan, covenant }.
 */
function getCoResidents(territorySlug, thisSub, allSubmissions, allChars) {
  return allSubmissions
    .filter(s => s._id !== thisSub._id)
    .filter(s => {
      let terrs = {};
      try { terrs = JSON.parse(s.responses?.feeding_territories || '{}'); } catch { return false; }
      return terrs[territorySlug] === 'resident';
    })
    .map(s => {
      const char = allChars.find(c => c._id === s.character_id || displayName(c) === s.character_name);
      return { name: s.character_name || 'Unknown', clan: char?.clan || '', covenant: char?.covenant || '' };
    });
}

/**
 * Finds notable public-facing project actions by other characters in this territory.
 * Excludes skipped actions and hide/protect actions with net successes > 0.
 * Returns array of { characterName, actionType, outcome, successes }.
 */
function getNotableEvents(terrId, thisSub, allSubmissions) {
  const events = [];
  for (const s of allSubmissions) {
    if (s._id === thisSub._id) continue;
    const resolved = s.projects_resolved || [];
    resolved.forEach((rev, idx) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const slot = idx + 1;
      const rawTerr = s.responses?.[`project_${slot}_territory`] || '';
      if (resolveTerrId(rawTerr) !== terrId) return;
      // Exclude hidden: hide_protect with net successes > 0
      if (rev.action_type === 'hide_protect' && (rev.roll?.successes || 0) > 0) return;
      events.push({
        characterName: s.character_name || 'Unknown',
        actionType: ACTION_TYPE_LABELS[rev.action_type] || rev.action_type,
        outcome: s.responses?.[`project_${slot}_outcome`] || '',
        successes: rev.roll?.successes ?? null,
      });
    });
  }
  return events;
}

/**
 * Assembles the Copy Context prompt for a single territory.
 * Pure function — no side effects, no DOM access.
 */
function buildTerritoryContext(char, sub, terrId, allSubmissions, allChars, cycleData, territories) {
  const terrName = terrId === 'barrens' ? 'The Barrens' : (TERRITORY_DISPLAY[terrId] || terrId || 'The Barrens');

  // Territory object (from live API data if available).
  // terrId is a TERRITORY_DATA-style slug; Mongo docs match by `slug` (ADR-002).
  const terrObj    = (territories || []).find(t => t.slug === terrId) || null;
  const terrOidStr = terrObj ? String(terrObj._id) : null;
  const regentChar = terrObj?.regent_id
    ? allChars.find(c => String(c._id) === String(terrObj.regent_id)) || null
    : null;
  const regentName = regentChar ? displayName(regentChar) : null;

  // Ambience state — confirmed_ambience is _id-keyed post-ADR-002.
  const confirmedAmb = (terrOidStr && cycleData?.confirmed_ambience?.[terrOidStr]?.ambience) || null;
  const currentAmb   = terrObj?.ambience || null;
  let ambienceLine = null;
  if (confirmedAmb || currentAmb) {
    const base = confirmedAmb || currentAmb;
    if (confirmedAmb && currentAmb && confirmedAmb !== currentAmb) {
      ambienceLine = `${confirmedAmb} (was ${currentAmb} last cycle)`;
    } else {
      ambienceLine = base;
    }
  }

  // Resident/poacher counts and lists this cycle
  const feedEntries = parseFeedingTerritories(sub);
  const terrSlug    = feedEntries.find(([slug]) => TERRITORY_SLUG_MAP[slug] === terrId)?.[0] || null;
  const coResidents = terrSlug ? getCoResidents(terrSlug, sub, allSubmissions, allChars) : [];

  // Poachers: other chars feeding in this territory as non-resident
  const poachers = [];
  for (const s of allSubmissions) {
    if (s._id === sub._id) continue;
    let terrs = {};
    try { terrs = JSON.parse(s.responses?.feeding_territories || '{}'); } catch { continue; }
    for (const [slug, val] of Object.entries(terrs)) {
      if (TERRITORY_SLUG_MAP[slug] !== terrId) continue;
      if (val && val !== 'none' && val !== 'resident') {
        const c = allChars.find(ch => String(ch._id) === String(s.character_id)) || null;
        const name = c ? displayName(c) : (s.character_name || 'Unknown');
        const tags = [c?.clan, c?.covenant].filter(Boolean).join(', ');
        poachers.push({ name, tags });
      }
    }
  }

  // Discipline activity in territory
  const discProfile = cycleData?.discipline_profile?.[terrId] || {};
  const discEntries = Object.entries(discProfile).filter(([, n]) => n > 0);

  // Actions in territory this cycle by phase (all submissions)
  const ACTION_PHASES = [
    { key: 'feeding',        label: 'Feeding' },
    { key: 'ambience',       label: 'Ambience' },
    { key: 'support_patrol', label: 'Support/Patrol' },
    { key: 'investigate',    label: 'Investigative' },
    { key: 'attack',         label: 'Hostile' },
    { key: 'misc',           label: 'Misc' },
  ];
  // Feeding actors
  const feedActors = [];
  for (const s of allSubmissions) {
    let terrs = {};
    try { terrs = JSON.parse(s.responses?.feeding_territories || '{}'); } catch { continue; }
    for (const [slug, val] of Object.entries(terrs)) {
      if (TERRITORY_SLUG_MAP[slug] === terrId && val && val !== 'none') {
        feedActors.push(s.character_name || 'Unknown');
      }
    }
  }
  // Project-based phase actors
  const phaseActors = {};
  for (const p of ACTION_PHASES.filter(p => p.key !== 'feeding')) phaseActors[p.key] = [];
  for (const s of allSubmissions) {
    (s.projects_resolved || []).forEach((rev, idx) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const slot = idx + 1;
      const rawTerr = s.responses?.[`project_${slot}_territory`] || '';
      if (resolveTerrId(rawTerr) !== terrId) return;
      const phase = rev.action_type || '';
      const bucket = phase === 'support' || phase === 'patrol_scout' ? 'support_patrol'
        : phase === 'hide_protect' ? 'support_patrol'
        : phaseActors[phase] !== undefined ? phase : 'misc';
      if (phaseActors[bucket] !== undefined) {
        phaseActors[bucket].push(s.character_name || 'Unknown');
      }
    });
  }

  // ── Build prompt ──

  // Net ambience change
  const confirmedIdx = AMBIENCE_STEPS.indexOf(confirmedAmb);
  const currentIdx   = AMBIENCE_STEPS.indexOf(currentAmb);
  const netChange    = (confirmedIdx >= 0 && currentIdx >= 0) ? confirmedIdx - currentIdx : null;
  const netChangeStr = netChange !== null ? (netChange > 0 ? `+${netChange}` : String(netChange)) : null;

  const lines = ['Draft a Territory Report for:', '', _compactCharHeader(char)];
  const identLine = _charIdentLine(char);
  if (identLine) lines.push(identLine);

  lines.push('');
  if (regentName) {
    lines.push(`Territory: ${terrName} | Regent: ${regentName}`);
  } else {
    lines.push(`Territory: ${terrName}`);
  }
  if (confirmedAmb && currentAmb && confirmedAmb !== currentAmb && netChangeStr !== null) {
    lines.push(`Ambience: ${confirmedAmb} (was ${currentAmb}, net ${netChangeStr})`);
  } else if (confirmedAmb || currentAmb) {
    lines.push(`Ambience: ${confirmedAmb || currentAmb}`);
  }
  if (terrId !== 'barrens') {
    lines.push(`Residents: ${coResidents.length + 1} | Poachers: ${poachers.length}`);
  }

  lines.push('');
  lines.push('Discipline activity detected:');
  if (discEntries.length) {
    for (const [disc, count] of discEntries) lines.push(`- ${disc}: ${count}`);
  } else {
    lines.push('- None');
  }

  if (terrId !== 'barrens') {
    lines.push('');
    lines.push('Co-residents:');
    if (coResidents.length) {
      for (const r of coResidents) {
        lines.push(`- ${r.name} (${[r.clan, r.covenant].filter(Boolean).join(', ')})`);
      }
    } else {
      lines.push('- None');
    }
  }

  if (poachers.length) {
    lines.push('');
    lines.push('Poachers:');
    for (const p of poachers) lines.push(`- ${p.name}${p.tags ? ` (${p.tags})` : ''}`);
  }

  lines.push('');
  lines.push('Actions in territory this cycle:');
  lines.push(`- Feeding: ${feedActors.join(', ') || 'None'}`);
  lines.push(`- Ambience: ${(phaseActors['ambience'] || []).join(', ') || 'None'}`);
  lines.push(`- Patrol: ${(phaseActors['support_patrol'] || []).join(', ') || 'None'}`);
  lines.push(`- Investigative: ${(phaseActors['investigate'] || []).join(', ') || 'None'}`);
  lines.push(`- Misc: ${(phaseActors['misc'] || []).join(', ') || 'None'}`);

  if (cycleData?.ambience_notes) {
    lines.push('');
    lines.push(`ST notes: ${cycleData.ambience_notes}`);
  }

  lines.push('');
  lines.push('Apply AMBIENCE_SIGNATURE and DISCIPLINE_TRACE. One paragraph, 80-120 words. Use house style.');

  return lines.join('\n');
}

/** Resolve the array of territory entries for this submission (all fed territories, defaulting to Barrens). */
// JDT-5: find the joint a given (sub, slot) belongs to, with the participant's
// role. Returns { joint, role } or null. Used by compilePushOutcome to inject
// joint outcomes into participants' published outcomes in place of the per-slot
// solo project response.
function _findJointForSlot(sub, slot, cyc) {
  if (!cyc?.joint_projects || !sub?._id) return null;
  for (const j of cyc.joint_projects) {
    if (j.cancelled_at) continue;
    if (String(j.lead_submission_id) === String(sub._id) && Number(j.lead_project_slot) === Number(slot)) {
      return { joint: j, role: 'lead' };
    }
    for (const p of (j.participants || [])) {
      if (p.decoupled_at) continue;
      if (String(p.submission_id) === String(sub._id) && Number(p.project_slot) === Number(slot)) {
        return { joint: j, role: 'support' };
      }
    }
  }
  return null;
}

function _feedTerrEntries(sub) {
  const raw = parseFeedingTerritories(sub)
    .filter(([, v]) => v && v !== 'none' && v !== 'Not feeding here')
    .map(([slug]) => {
      const rawId = TERRITORY_SLUG_MAP[slug];
      return { slug, id: rawId || 'barrens', name: (rawId && TERRITORY_DISPLAY[rawId]) || 'The Barrens' };
    });
  // Deduplicate by id
  const seen = new Set();
  const deduped = raw.filter(t => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
  // Every player gets at least a Barrens entry
  return deduped.length ? deduped : [{ slug: 'the_barrens', id: 'barrens', name: 'The Barrens' }];
}

/**
 * Returns true when all territory reports for this submission are complete.
 * All players require at least one report (Barrens is the default when no territory is declared).
 */
function territoryReportsComplete(sub) {
  const feedTerrs = _feedTerrEntries(sub);
  const reports = sub.st_narrative?.territory_reports || [];
  return reports.filter(r => r?.territory_id).length >= feedTerrs.length
    && reports.every(r => !r || r.status === 'complete');
}

// ── Territory Report section ──────────────────────────────────────────────────

/**
 * Scans allSubmissions for public-facing activity in the given territory name.
 * Returns an array of { charName, actionType, detail } objects.
 * Excludes hidden actions (hide_protect with successes > 0) and skipped.
 */
function _homeTerrActivity(territoryName, thisSub, allSubmissions) {
  const terrId = resolveTerrId(territoryName);
  const events = [];

  for (const s of allSubmissions) {
    if (String(s._id) === String(thisSub._id)) continue;
    const char = _allCharacters.find(c => String(c._id) === String(s.character_id));
    const charName = char ? displayName(char) : (s.character_name || 'Unknown');
    const resolved = s.projects_resolved || [];

    resolved.forEach((rev, pIdx) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const slot = pIdx + 1;
      const rawTerr = s.responses?.[`project_${slot}_territory`] || '';
      if (resolveTerrId(rawTerr) !== terrId) return;
      // Exclude hidden actions that succeeded
      if (rev.action_type === 'hide_protect' && (rev.roll?.successes ?? 0) > 0) return;
      events.push({
        charName,
        actionType: ACTION_TYPE_LABELS[rev.action_type] || rev.action_type || 'Action',
        detail: s.responses?.[`project_${slot}_outcome`] || '',
      });
    });
  }
  return events;
}

export function buildHomeReportContext(char, sub, allSubmissions) {
  const territory = char?.home_territory || '';
  if (!territory) return '';

  const charName  = displayName(char);
  const activity  = _homeTerrActivity(territory, sub, allSubmissions);

  let ctx = `Home Report — ${charName}\n`;
  ctx += `Home territory: ${territory}\n\n`;
  ctx += `Context: This is where ${charName} lives day-to-day. They notice things around home — not because they're actively investigating, but because they're present. Write a short ambient paragraph (1–3 sentences) about what they experience in their neighbourhood this month.\n\n`;

  if (activity.length) {
    ctx += `Activity in ${territory} this cycle:\n`;
    for (const e of activity) {
      ctx += `  - ${e.charName}: ${e.actionType}${e.detail ? ` — ${e.detail}` : ''}\n`;
    }
    ctx += '\n';
  } else {
    ctx += `No notable activity recorded in ${territory} this cycle. This may be a quiet month.\n\n`;
  }

  ctx += `Style: Second person, present tense. No mechanical terms. British English. No em-dashes. ~50–100 words.`;
  return ctx;
}

function renderHomeReport(char, sub, stNarrative, allSubmissions) {
  const territory = char?.home_territory || '';
  const complete  = isSectionComplete(stNarrative, 'home_report');
  const dotClass  = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';
  const savedTxt  = stNarrative?.home_report?.response || '';
  const isRevision = stNarrative?.home_report?.status === 'needs_revision';
  const revNote    = stNarrative?.home_report?.revision_note || '';
  const ctxCollapsed = savedTxt ? ' collapsed' : '';

  const activity = _homeTerrActivity(territory, sub, allSubmissions);

  let h = `<div class="dt-story-section${complete ? ' complete' : ''}" data-section="home_report">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Home Report</span>`;
  h += `<div class="dt-story-section-header-actions">`;
  h += `<button class="dt-story-copy-ctx-btn">Copy Context</button>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div></div>`;

  h += `<div class="dt-story-section-body">`;
  h += `<div class="dt-story-context-block${ctxCollapsed}">`;
  h += `<div class="dt-story-note-author">Home territory: <strong>${esc(territory)}</strong></div>`;

  if (activity.length) {
    h += `<div class="dt-story-terr-own-actions"><span class="dt-story-note-author">Activity near home this cycle:</span><ul class="dt-story-terr-list">`;
    for (const e of activity) {
      h += `<li><strong>${esc(e.charName)}</strong> — ${esc(e.actionType)}${e.detail ? `: ${esc(e.detail)}` : ''}</li>`;
    }
    h += `</ul></div>`;
  } else {
    h += `<div class="dt-story-section-empty">No notable activity recorded in ${esc(territory)} this cycle — quiet month near home.</div>`;
  }

  h += `<a class="dt-story-context-toggle" role="button">${savedTxt ? 'Show context' : 'Hide context'}</a>`;
  h += `</div>`; // context-block

  h += `<textarea class="dt-story-response-ta" placeholder="Write the home report\u2026">${savedTxt}</textarea>`;

  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn">Save Draft</button>`;
  h += `<button class="dt-story-revision-note-btn${isRevision ? ' active' : ''}">Needs Revision</button>`;
  h += `<button class="dt-story-mark-complete-btn">`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span> Mark Complete`;
  h += `</button></div>`;

  h += `<div class="dt-story-revision-area${isRevision || revNote ? '' : ' hidden'}">`;
  h += `<textarea class="dt-story-revision-ta" rows="2" placeholder="Revision note\u2026">${revNote}</textarea>`;
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-revision-save-btn">Save Revision Note</button>`;
  h += `</div></div>`;

  h += `</div></div>`;
  return h;
}

function renderTerritoryReports(char, sub, stNarrative, allSubmissions, allChars) {
  const feedTerrs = _feedTerrEntries(sub);

  const complete = territoryReportsComplete(sub);
  const dotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  let h = `<div class="dt-story-section${complete ? ' complete' : ''}" data-section="territory_reports">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Territory Report</span>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  for (let idx = 0; idx < feedTerrs.length; idx++) {
    const terr = feedTerrs[idx];
    const terrId = terr.id;
    const terrName = terr.name;

    const stNarrEntry = stNarrative?.territory_reports?.[idx];
    const legacyText  = idx === 0 ? (sub.st_review?.narrative?.territory_report?.text || '') : '';
    const savedTxt    = stNarrEntry?.response || legacyText;
    const isComplete  = stNarrEntry?.status === 'complete';
    const isRevision  = stNarrEntry?.status === 'needs_revision';
    const revNote     = stNarrEntry?.revision_note || '';

    const ctxCollapsed = savedTxt ? ' collapsed' : '';
    const ctxToggleLabel = savedTxt ? 'Show context' : 'Hide context';

    h += `<div class="dt-story-terr-section${isComplete ? ' complete' : ''}" data-terr-idx="${idx}" data-terr-id="${terrId}">`;

    // Territory sub-section header
    h += `<div class="dt-story-terr-header">`;
    h += `<span class="dt-story-terr-name">${terrName.toUpperCase()}</span>`;
    h += `<span class="dt-story-completion-dot ${isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span>`;
    h += `<button class="dt-story-copy-ctx-btn" data-terr-idx="${idx}" data-terr-id="${terrId}">Copy Context</button>`;
    h += `</div>`;

    // Collapsible context block
    h += `<div class="dt-story-context-block${ctxCollapsed}">`;

    // Co-residents block — suppressed for The Barrens (feeding there is isolated)
    if (terr.id !== 'barrens') {
      const coResidents = getCoResidents(terr.slug, sub, allSubmissions, allChars);
      h += `<div class="dt-story-terr-coresidents">`;
      h += `<span class="dt-story-note-author">Co-residents:</span>`;
      if (coResidents.length) {
        h += `<ul class="dt-story-terr-list">`;
        for (const r of coResidents) {
          const tags = [r.clan, r.covenant].filter(Boolean).join(', ');
          h += `<li>${r.name}${tags ? ` (${tags})` : ''}</li>`;
        }
        h += `</ul>`;
      } else {
        h += ` <em class="dt-story-section-empty">No other residents this cycle</em>`;
      }
      h += `</div>`;
    }

    // Own actions block
    const ownActions = [];
    const feedingResolved = sub.st_review?.feeding_status === 'approved';
    if (feedingResolved && sub.feeding_roll) {
      const poolSize = sub.feeding_roll.params?.size;
      ownActions.push({ label: 'Feeding', detail: poolSize ? `pool: ${poolSize} dice` : null });
    }
    const projResolved = sub.projects_resolved || [];
    projResolved.forEach((rev, pIdx) => {
      if (!rev || rev.pool_status === 'skipped') return;
      const slot = pIdx + 1;
      const rawTerr = sub.responses?.[`project_${slot}_territory`] || '';
      if (resolveTerrId(rawTerr) !== terrId) return;
      ownActions.push({
        label: ACTION_TYPE_LABELS[rev.action_type] || rev.action_type || 'Action',
        detail: sub.responses?.[`project_${slot}_outcome`] || '',
        successes: rev.roll?.successes ?? null,
      });
    });

    if (ownActions.length) {
      h += `<div class="dt-story-terr-own-actions">`;
      h += `<span class="dt-story-note-author">Own actions in ${terrName}:</span>`;
      h += `<ul class="dt-story-terr-list">`;
      for (const a of ownActions) {
        let item = a.label;
        if (a.detail) item += `: ${a.detail}`;
        if (a.successes !== null && a.successes !== undefined) {
          item += ` \u2014 ${a.successes} success${a.successes !== 1 ? 'es' : ''}`;
        }
        h += `<li>${item}</li>`;
      }
      h += `</ul>`;
      h += `</div>`;
    }

    // Notable events block
    const notableEvents = getNotableEvents(terrId, sub, allSubmissions);
    h += `<div class="dt-story-terr-events">`;
    h += `<span class="dt-story-note-author">Notable events:</span>`;
    if (notableEvents.length) {
      h += `<ul class="dt-story-terr-list">`;
      for (const ev of notableEvents) {
        const succStr = ev.successes !== null ? ` \u2014 ${ev.successes} success${ev.successes !== 1 ? 'es' : ''}` : '';
        const outcomeStr = ev.outcome ? `: ${ev.outcome}` : '';
        h += `<li>${ev.characterName} ran ${ev.actionType}${outcomeStr}${succStr}</li>`;
      }
      h += `</ul>`;
    } else {
      h += ` <em class="dt-story-section-empty">No notable public events recorded</em>`;
    }
    h += `</div>`;

    h += `<a class="dt-story-context-toggle" role="button">${ctxToggleLabel}</a>`;
    h += `</div>`; // context-block

    // Response textarea
    h += `<textarea class="dt-story-response-ta" data-terr-idx="${idx}" data-terr-id="${terrId}" placeholder="Write territory report\u2026">${savedTxt}</textarea>`;

    // Action buttons
    h += `<div class="dt-story-card-actions">`;
    h += `<button class="dt-story-save-draft-btn" data-terr-idx="${idx}" data-terr-id="${terrId}">Save Draft</button>`;
    h += `<button class="dt-story-revision-note-btn${isRevision ? ' active' : ''}" data-terr-idx="${idx}" data-terr-id="${terrId}">Needs Revision</button>`;
    h += `<button class="dt-story-mark-complete-btn" data-terr-idx="${idx}" data-terr-id="${terrId}">`;
    h += `<span class="dt-story-completion-dot ${isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span> Mark Complete`;
    h += `</button>`;
    h += `</div>`;
    h += `<div class="dt-story-revision-area${isRevision || revNote ? '' : ' hidden'}">`;
    h += `<textarea class="dt-story-revision-ta" data-terr-idx="${idx}" data-terr-id="${terrId}" rows="2" placeholder="Revision note for player\u2026">${revNote}</textarea>`;
    h += `<div class="dt-story-card-actions">`;
    h += `<button class="dt-story-revision-save-btn" data-terr-idx="${idx}" data-terr-id="${terrId}">Save Revision</button>`;
    h += `</div>`;
    h += `</div>`;

    h += `</div>`; // dt-story-terr-section
  }

  h += `</div></div>`;
  return h;
}

// ── B7: Cacophony Savvy section ───────────────────────────────────────────────

function getCSDots(char) {
  const m = (char?.merits || []).find(m => m.name === 'Cacophony Savvy');
  return m ? (m.rating || 0) : 0;
}

/**
 * Scans all submissions (excluding the current character's) for noisy project actions.
 * Returns up to csDots candidates sorted by CS_ACTION_PRIORITY index (ascending = highest priority).
 * Tie-breaking within the same action type preserves source order.
 */
function scanNoisyActions(allSubmissions, currentCharId, csDots) {
  const candidates = [];
  for (const s of allSubmissions) {
    if (s.character_id === currentCharId) continue;
    const resolved = s.projects_resolved || [];
    resolved.forEach((rev, idx) => {
      if (!rev) return;
      if (rev.pool_status === 'skipped') return;
      if (rev.action_type === 'hide_protect' && (rev.roll?.successes || 0) > 0) return;
      const priorityIdx = CS_ACTION_PRIORITY.indexOf(rev.action_type);
      if (priorityIdx === -1) return;
      const slot = idx + 1;
      candidates.push({
        priorityIdx,
        characterName: s.character_name || 'Unknown',
        actionType: rev.action_type,
        territory: s.responses?.[`project_${slot}_territory`] || '',
        outcome: s.responses?.[`project_${slot}_outcome`] || '',
        successes: rev.roll?.successes ?? null,
      });
    });
  }
  candidates.sort((a, b) => a.priorityIdx - b.priorityIdx);
  return candidates.slice(0, csDots);
}

function buildCacophonySavvyContext(char, noisyAction, slotIdx, csDots) {
  const lines = [];
  lines.push('You are helping a Storyteller write a Cacophony Savvy intelligence vignette for a Vampire: The Requiem 2nd Edition LARP character.');
  lines.push('');
  lines.push(`Character: ${char ? displayName(char) : 'Unknown'}`);
  lines.push(`Cacophony Savvy: ${csDots} dots (slot ${slotIdx + 1} of ${csDots})`);
  lines.push('');
  lines.push('This slot covers a noisy event that filtered through the Cacophony this cycle:');
  lines.push('');
  lines.push(`Source: ${noisyAction.characterName}`);
  lines.push(`Action: ${ACTION_TYPE_LABELS[noisyAction.actionType] || noisyAction.actionType}`);
  if (noisyAction.territory) lines.push(`Territory: ${noisyAction.territory}`);
  if (noisyAction.outcome)   lines.push(`Declared intent: ${noisyAction.outcome}`);
  lines.push('');
  lines.push(`Write a short vignette (~75 words) of what ${char ? displayName(char) : 'the character'} heard via the Cacophony about this event.`);
  lines.push('');
  lines.push('Style rules:');
  lines.push('- Third person \u2014 the character hears about someone else, not about themselves');
  lines.push('- British English');
  lines.push('- No mechanical terms \u2014 no discipline names, success counts, dot ratings');
  lines.push('- No em dashes');
  lines.push('- Cacophony impressions are distorted \u2014 facts may be garbled, emphasis skewed, source obscured');
  lines.push('- Do not state what actually happened precisely; write what filtered through the rumour network');
  lines.push('- Do not editorialise about significance');
  lines.push('- No sentence fragments \u2014 every sentence must be grammatically complete');
  return lines.join('\n');
}

/**
 * Returns true if the cacophony_savvy section is considered complete.
 * Re-scans _allSubmissions each call to reflect current cycle state.
 */
function cacophonySavvyComplete(char, sub) {
  const csDots = getCSDots(char);
  if (csDots === 0) return true;
  const noisyCount = scanNoisyActions(_allSubmissions, sub.character_id, csDots).length;
  if (noisyCount === 0) return true;
  const slots = sub.st_narrative?.cacophony_savvy || [];
  return slots.slice(0, noisyCount).every(s => s?.status === 'complete');
}

function renderCacophonySavvy(char, sub, stNarrative, allSubmissions) {
  const csDots = getCSDots(char);
  if (csDots === 0) return '';

  const noisyActions = scanNoisyActions(allSubmissions, sub.character_id, csDots);
  const saved = stNarrative?.cacophony_savvy || [];

  let h = `<div class="dt-story-section" data-section="cacophony_savvy">`;
  h += `<div class="dt-story-cs-header">`;
  h += `<span class="dt-story-section-header">RUMOURS (${csDots} dot${csDots !== 1 ? 's' : ''})</span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  for (let slotIdx = 0; slotIdx < csDots; slotIdx++) {
    const noisyAction = noisyActions[slotIdx] || null;
    const savedSlot   = saved[slotIdx] || null;
    const savedTxt    = savedSlot?.response || '';
    const isComplete  = savedSlot?.status === 'complete';
    const isRevision  = savedSlot?.status === 'needs_revision';
    const revNote     = savedSlot?.revision_note || '';
    const dotClass    = isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

    h += `<div class="dt-story-cs-slot${isComplete ? ' complete' : isRevision ? ' revision' : ''}" data-slot-idx="${slotIdx}">`;
    h += `<div class="dt-story-cs-slot-header">`;
    h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
    h += `<span class="dt-story-cs-slot-label">Slot ${slotIdx + 1}</span>`;

    if (noisyAction) {
      h += `<button class="dt-story-copy-ctx-btn" data-slot-idx="${slotIdx}">Copy Context</button>`;
    }
    h += `</div>`; // cs-slot-header

    if (!noisyAction) {
      h += `<div class="dt-story-cs-empty">No noisy actions found for this slot this cycle.</div>`;
    } else {
      const ctxCollapsed   = savedTxt ? ' collapsed' : '';
      const ctxToggleLabel = savedTxt ? 'Show context' : 'Hide context';

      // Context block
      h += `<div class="dt-story-context-block${ctxCollapsed}">`;
      h += `<div class="dt-story-context-text">`;
      h += `<span class="dt-story-cs-meta"><strong>Source:</strong> ${noisyAction.characterName}</span>`;
      h += `<span class="dt-story-cs-meta"><strong>Action:</strong> ${ACTION_TYPE_LABELS[noisyAction.actionType] || noisyAction.actionType}</span>`;
      if (noisyAction.territory) h += `<span class="dt-story-cs-meta"><strong>Territory:</strong> ${noisyAction.territory}</span>`;
      if (noisyAction.outcome)   h += `<span class="dt-story-cs-meta"><strong>Intent:</strong> \u201C${noisyAction.outcome}\u201D</span>`;
      h += `</div>`;
      h += `<a class="dt-story-context-toggle" role="button">${ctxToggleLabel}</a>`;
      h += `</div>`; // context-block

      // Textarea
      h += `<textarea class="dt-story-response-ta" data-slot-idx="${slotIdx}" placeholder="Write Rumours vignette\u2026">${savedTxt}</textarea>`;

      // Action buttons
      h += `<div class="dt-story-card-actions">`;
      h += `<button class="dt-story-save-draft-btn" data-slot-idx="${slotIdx}">Save Draft</button>`;
      h += `<button class="dt-story-revision-note-btn${isRevision ? ' active' : ''}" data-slot-idx="${slotIdx}">Needs Revision</button>`;
      h += `<button class="dt-story-mark-complete-btn" data-slot-idx="${slotIdx}">`;
      h += `<span class="dt-story-completion-dot ${dotClass}"></span> Mark Complete`;
      h += `</button>`;
      h += `</div>`;
      h += `<div class="dt-story-revision-area${isRevision || revNote ? '' : ' hidden'}">`;
      h += `<textarea class="dt-story-revision-ta" data-slot-idx="${slotIdx}" rows="2" placeholder="Revision note for player\u2026">${revNote}</textarea>`;
      h += `<div class="dt-story-card-actions">`;
      h += `<button class="dt-story-revision-save-btn" data-slot-idx="${slotIdx}">Save Revision</button>`;
      h += `</div>`;
      h += `</div>`;
    }

    h += `</div>`; // cs-slot
  }

  h += `</div></div>`; // section-body + section
  return h;
}

// ── Sign-off panel ────────────────────────────────────────────────────────────

// ── Single-character push ─────────────────────────────────────────────────────

// Maps merit section keys to the category strings used by deriveMeritCategory.
const MERIT_SECTION_CATEGORIES = {
  allies_actions:     ['allies'],
  status_actions:     ['status'],
  retainer_actions:   ['retainer', 'staff'],
  contact_requests:   ['contacts'],
  resource_approvals: ['resources'],
  misc_merit_actions: ['misc'],
};

const _GAP_TEXT = '*Your Storyteller is still finalising this section \u2014 contact them if you have questions.*';

/**
 * Compiles applicable st_narrative sections for a submission into a markdown string.
 * Only sections with status === 'complete' include their content.
 * Applicable sections that are NOT complete appear as gap placeholders.
 * Returns an empty string if zero sections are complete (push blocked).
 */
export function compilePushOutcome(sub, char, cycle) {
  // char is optional; when called from outside this module (e.g. story-tab.js)
  // _allCharacters is empty, so callers must pass char explicitly.
  if (!char) char = getCharForSub(sub);
  // cycle is optional; falls back to module-level _currentCycle so that the
  // DT Story tab's loaded cycle is used by all push paths transparently.
  // Story-tab.js (player inline edit) calls without cycle and relies on this
  // fallback being null — Territory Pulse is then omitted from the recompile.
  const cyc = cycle || _currentCycle;
  const sn = sub.st_narrative || {};
  const sections = getApplicableSections(char, sub);
  const parts = [];
  let hasContent = false;

  for (const section of sections) {
    const key = section.key;

    if (key === 'feeding_validation') {
      // DTSR-7: when the ST has authored a feeding narrative (status complete,
      // non-empty response), publish it under "## Feeding". When absent, the
      // section is omitted unless DTIL-4 territory pulses contribute content.
      const narrativeText = (sn.feeding_narrative?.status === 'complete'
        && sn.feeding_narrative?.response?.trim())
        ? sn.feeding_narrative.response.trim()
        : '';

      // DTIL-4: append per-territory pulses for territories the player fed in.
      // Skipped for no_feed submissions and when no cycle.territory_pulse map exists.
      // territory_pulse is _id-keyed post-ADR-002; resolve slug→_id via _currentTerritories.
      const pulseChunks = [];
      const noFeed = sub.feeding_review?.pool_status === 'no_feed';
      if (!noFeed && cyc?.territory_pulse) {
        for (const terr of _feedTerrEntries(sub)) {
          if (terr.id === 'barrens') continue; // Barrens fallback has no broadcast pulse
          const tDoc = _currentTerritories.find(t => t.slug === terr.id);
          const tOid = tDoc ? String(tDoc._id) : null;
          const pulse = tOid && cyc.territory_pulse[tOid]?.draft;
          if (pulse?.trim()) {
            pulseChunks.push(`### Territory Pulse — ${terr.name}\n\n${pulse.trim()}`);
          }
        }
      }

      if (narrativeText || pulseChunks.length) {
        const sectionParts = ['## Feeding'];
        if (narrativeText) sectionParts.push(narrativeText);
        if (pulseChunks.length) sectionParts.push(pulseChunks.join('\n\n'));
        parts.push(sectionParts.join('\n\n'));
        hasContent = true;
      }
      continue;

    } else if (key === 'story_moment') {
      // Prefer new consolidated field; fall back to legacy letter or touchstone
      // for historical submissions that have not been re-saved post-DTSR-2.
      const sm     = sn.story_moment;
      const legacy = sn.letter_from_home?.status === 'complete' ? sn.letter_from_home
                   : sn.touchstone?.status === 'complete'       ? sn.touchstone
                   : null;
      const source = sm?.status === 'complete' ? sm : legacy;
      if (source?.response?.trim()) {
        parts.push(`## ${section.label}\n\n${source.response.trim()}`);
        hasContent = true;
      } else {
        parts.push(`## ${section.label}\n\n${_GAP_TEXT}`);
      }

    } else if (key === 'territory_reports') {
      _feedTerrEntries(sub).forEach((terr, i) => {
        if (sn.territory_reports?.[i]?.status === 'complete') {
          const response = sn.territory_reports?.[i]?.response;
          if (response?.trim()) { parts.push(`## ${terr.name}\n\n${response.trim()}`); hasContent = true; }
        } else {
          parts.push(`## ${terr.name}\n\n${_GAP_TEXT}`);
        }
      });

    } else if (key === 'project_responses') {
      (sub.projects_resolved || []).forEach((rev, i) => {
        const slot = i + 1;
        // JDT-5: detect whether this slot is part of a joint. Joint slots
        // pull their outcome from cycle.joint_projects[*].st_joint_outcome
        // instead of the per-slot st_narrative.project_responses entry.
        const jointInfo = _findJointForSlot(sub, slot, cyc);
        if (jointInfo) {
          const joint = jointInfo.joint;
          const role = jointInfo.role;
          const titleSnip = (joint.description || '').trim().slice(0, 60) || 'Joint Project';
          const leadChar = _allCharacters.find(c => String(c._id) === String(joint.lead_character_id));
          const leadName = leadChar ? displayName(leadChar) : 'a fellow Kindred';
          const heading = role === 'lead'
            ? `## ${titleSnip} (Joint, you led)`
            : `## ${titleSnip} (Joint with ${leadName})`;
          const outcomeText = (joint.st_joint_outcome || '').trim();
          const personalNotes = (sub.responses?.[`project_${slot}_personal_notes`] || '').trim();
          if (outcomeText) {
            let block = `${heading}\n\n${outcomeText}`;
            if (personalNotes && role === 'support') {
              block += `\n\n*Your contribution: ${personalNotes}*`;
            }
            parts.push(block);
            hasContent = true;
          } else {
            parts.push(`${heading}\n\n${_GAP_TEXT}`);
          }
          return;
        }

        const label = sub.responses?.[`project_${i + 1}_title`] || `Project ${i + 1}`;
        if (sn.project_responses?.[i]?.status === 'complete') {
          const response = sn.project_responses?.[i]?.response;
          if (response?.trim()) {
            const pfn = rev?.player_facing_note?.trim();
            parts.push(`## ${label}\n\n${response.trim()}${pfn ? `\n\n${pfn}` : ''}`);
            hasContent = true;
          }
        } else {
          parts.push(`## ${label}\n\n${_GAP_TEXT}`);
        }
      });

    } else if (MERIT_SECTIONS.has(key)) {
      const categories = MERIT_SECTION_CATEGORIES[key] || [];
      (sub.merit_actions || []).forEach((action, i) => {
        const cat = deriveMeritCategory(action.merit_type);
        if (!categories.includes(cat)) return;
        const label = action.merit_type || `Action ${i + 1}`;
        if (sn.action_responses?.[i]?.status === 'complete') {
          const response = sn.action_responses?.[i]?.response;
          if (response?.trim()) {
            const pfn = sub.merit_actions_resolved?.[i]?.player_facing_note?.trim();
            parts.push(`## ${label}\n\n${response.trim()}${pfn ? `\n\n${pfn}` : ''}`);
            hasContent = true;
          }
        } else {
          parts.push(`## ${label}\n\n${_GAP_TEXT}`);
        }
      });

    } else if (key === 'cacophony_savvy') {
      (sn.cacophony_savvy || []).forEach((slot, i) => {
        const label = `Rumours ${i + 1}`;
        if (slot?.status === 'complete') {
          const response = slot?.response;
          if (response?.trim()) { parts.push(`## ${label}\n\n${response.trim()}`); hasContent = true; }
        } else {
          parts.push(`## ${label}\n\n${_GAP_TEXT}`);
        }
      });
    }
  }

  // General notes — free text, always include if present (no status gate)
  const generalNotes = sn.general_notes?.trim();
  if (generalNotes) { parts.push(generalNotes); hasContent = true; }

  return hasContent ? parts.join('\n\n') : '';
}

/**
 * Publishes all submissions that have at least one complete section.
 * Returns { published, skipped } counts.
 */
async function _publishAllSubmissions(submissions) {
  let published = 0, skipped = 0;
  const now = new Date().toISOString();
  await Promise.all(submissions.map(async sub => {
    const md = compilePushOutcome(sub);
    if (!md.trim()) { skipped++; return; }
    const patch = {
      'st_review.outcome_text':       md,
      'st_review.outcome_visibility': 'published',
      'st_review.published_at':       now,
    };
    try {
      await apiPut('/api/downtime_submissions/' + sub._id, patch);
      if (!sub.st_review) sub.st_review = {};
      sub.st_review.outcome_text       = md;
      sub.st_review.outcome_visibility = 'published';
      published++;
    } catch { skipped++; }
  }));
  return { published, skipped };
}

/**
 * Exported: load submissions for a cycle and publish all with at least one
 * complete section. Called from the cycle reset wizard (new game creation).
 */
export async function publishAllForCycle(cycleId) {
  try {
    const [subs, chars, cycles] = await Promise.all([
      apiGet('/api/downtime_submissions?cycle_id=' + cycleId),
      _allCharacters.length ? Promise.resolve(_allCharacters) : apiGet('/api/characters'),
      apiGet('/api/downtime_cycles').catch(() => []),
    ]);
    if (!_allCharacters.length) _allCharacters = Array.isArray(chars) ? chars : [];
    // DTIL-4: ensure _currentCycle is populated so compilePushOutcome can
    // inject Territory Pulse when this path runs from the cycle reset wizard
    // (which doesn't go through initDtStory first).
    const cyc = (Array.isArray(cycles) ? cycles : []).find(c => String(c._id) === String(cycleId));
    if (cyc) _currentCycle = cyc;
    const submissions = (Array.isArray(subs) ? subs : []).map(sub => ({
      ...sub,
      merit_actions: buildMeritActions(sub),
    }));
    return await _publishAllSubmissions(submissions);
  } catch {
    return { published: 0, skipped: 0 };
  }
}

/**
 * Publishes all loaded submissions that have at least one complete section.
 * Shows a summary in the rail once complete.
 */
async function handlePublishAll() {
  const rail = document.getElementById('dt-story-nav-rail');
  const btn = rail?.querySelector('.dt-story-publish-all-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Publishing\u2026'; }

  const { published, skipped } = await _publishAllSubmissions(_allSubmissions);

  if (rail) {
    rail.innerHTML = renderNavRail();
    // Show summary above the pill list
    const summary = document.createElement('div');
    summary.className = 'dt-story-publish-summary';
    summary.textContent = `Published ${published} / ${_allSubmissions.length}${skipped ? ` \u2014 ${skipped} skipped (no sections complete)` : ''}.`;
    rail.prepend(summary);
    setTimeout(() => summary.remove(), 6000);
  }
}

/**
 * Compiles and pushes a character's narrative immediately.
 * Writes outcome_text + sets outcome_visibility = 'published'.
 * Idempotent — re-pushing overwrites cleanly.
 */
async function handlePushCharacter(subId, charId) {
  const sub = _allSubmissions.find(s => String(s._id) === String(subId));
  if (!sub) return;

  _pushErrors.delete(charId);

  const rail = document.getElementById('dt-story-nav-rail');
  const pushBtn = rail?.querySelector(`.dt-story-push-btn[data-sub-id="${subId}"]`);
  if (pushBtn) { pushBtn.disabled = true; pushBtn.textContent = 'Pushing\u2026'; }

  try {
    const md = compilePushOutcome(sub);
    if (!md.trim()) {
      _pushErrors.set(charId, 'Nothing to push — no sections are marked complete yet.');
      if (rail) rail.innerHTML = renderNavRail();
      return;
    }
    const patch = {
      'st_review.outcome_text':        md,
      'st_review.outcome_visibility':  'published',
      'st_review.published_at':        new Date().toISOString(),
    };
    await apiPut('/api/downtime_submissions/' + subId, patch);

    if (!sub.st_review) sub.st_review = {};
    sub.st_review.outcome_text       = md;
    sub.st_review.outcome_visibility = 'published';

    if (rail) rail.innerHTML = renderNavRail();
  } catch (err) {
    _pushErrors.set(charId, err.message || 'Push failed');
    if (rail) rail.innerHTML = renderNavRail();
  }
}

function renderSignOffPanel(stNarrative, applicableSections, sub) {
  const total = applicableSections.length;
  const complete = applicableSections.filter(s => isSectionDone(stNarrative, s.key, sub)).length;
  const allDone = total > 0 && complete === total;
  const locked = stNarrative?.locked === true;

  let h = '<div class="dt-story-sign-off">';
  h += `<span class="dt-story-sign-off-count">${complete}/${total} sections complete</span>`;
  if (locked) {
    h += `<span class="dt-story-locked-label">Narrative locked</span>`;
  } else {
    h += `<button class="dt-story-sign-off-btn" ${allDone ? '' : 'disabled'}>Mark all complete</button>`;
  }
  h += '</div>';
  return h;
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleSignOff(btn) {
  if (!_currentSub) return;
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';
  try {
    await saveNarrativeField(_currentSub._id, { 'st_narrative.locked': true });
    _currentSub.st_narrative = { ...(_currentSub.st_narrative || {}), locked: true };
    const char = getCharForSub(_currentSub);
    const view = document.getElementById('dt-story-char-view');
    if (view) view.innerHTML = renderCharacterView(char, _currentSub);
    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Mark all complete';
    console.error('Sign-off failed:', err);
  }
}

// ── Story Moment handlers (Copy Context + Save) ──────────────────────────────

async function handleCopyStoryMomentContext(btn) {
  if (!_currentSub) return;
  const char = getCharForSub(_currentSub);

  const card   = btn.closest('.dt-story-section[data-section="story_moment"]');
  const format = card?.querySelector('input[name="story-moment-format"]:checked')?.value || 'letter';

  if (format === 'vignette') {
    copyToClipboard(buildTouchstoneContext(char, _currentSub), btn);
    return;
  }

  // Letter format: assemble previous-cycle correspondence + story-moment target,
  // same as the pre-DTSR-2 handleCopyLetterContext logic.
  let prevCorrespondence = null;
  let prevCycleNumber    = null;
  try {
    const cycleId   = _currentSub.cycle_id;
    const allCycles = await apiGet('/api/downtime_cycles').catch(() => []);
    const cycles    = Array.isArray(allCycles) ? allCycles : [];
    const currentCycle   = cycles.find(c => String(c._id) === String(cycleId));
    const currentGameNum = currentCycle?.game_number ?? null;

    if (currentGameNum != null) {
      const prevCycle = cycles.find(c => c.game_number === currentGameNum - 1);
      if (prevCycle) {
        const prevSubs = await apiGet(`/api/downtime_submissions?cycle_id=${prevCycle._id}`).catch(() => []);
        const prevSub  = (Array.isArray(prevSubs) ? prevSubs : [])
          .find(s => String(s.character_id) === String(_currentSub.character_id));
        prevCorrespondence = prevSub?.st_narrative?.story_moment?.response
          || prevSub?.st_narrative?.letter_from_home?.response
          || null;
        prevCycleNumber = prevCycle.game_number;
      }
    }
  } catch { /* leave nulls */ }

  const stVoiceNote = _currentSub.st_narrative?.story_moment?.voice_note
    || _currentSub.st_narrative?.letter_from_home?.voice_note
    || null;

  // NPCR.12: resolve story-moment relationship target name for the prompt.
  let storyMomentTarget = null;
  const relId = _currentSub.responses?.story_moment_relationship_id;
  if (relId) {
    try {
      const edge = await apiGet(`/api/relationships/${encodeURIComponent(relId)}`);
      if (edge?.kind) {
        storyMomentTarget = {
          kind: edge.kind,
          custom_label: edge.custom_label || null,
          name: null,
        };
        const charId = String(_currentSub.character_id);
        const other  = String(edge.a?.id) === charId ? edge.b : edge.a;
        if (other?.type === 'npc' && other.id) {
          const npcs = await apiGet('/api/npcs').catch(() => []);
          const npc  = (Array.isArray(npcs) ? npcs : []).find(n => String(n._id) === String(other.id));
          if (npc) storyMomentTarget.name = npc.name;
        } else if (other?.type === 'pc' && other.id) {
          const otherChar = getCharForSub({ character_id: other.id });
          if (otherChar) storyMomentTarget.name = (otherChar.moniker || otherChar.name || '').trim();
        }
      }
    } catch { /* leave null */ }
  }

  const text = buildLetterContext(char, _currentSub, {
    prevCorrespondence, prevCycleNumber, stVoiceNote, storyMomentTarget,
  });
  copyToClipboard(text, btn);
}

async function handleStoryMomentSave(btn, status) {
  const section = btn.closest('.dt-story-section[data-section="story_moment"]');
  if (!section || !_currentSub) return;

  const ta      = section.querySelector('.dt-story-response-ta');
  const text    = ta?.value || '';
  const revTa   = section.querySelector('.dt-story-revision-ta');
  const revNote = revTa?.value || '';
  const format  = section.querySelector('input[name="story-moment-format"]:checked')?.value || 'letter';

  const user   = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.textContent = 'Saving…';

  try {
    await saveNarrativeField(_currentSub._id, {
      'st_narrative.story_moment': { response: text, format, author, status, revision_note: revNote },
    });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.story_moment = {
      ...(_currentSub.st_narrative.story_moment || {}),
      response: text, format, author, status, revision_note: revNote,
    };

    _refreshProgressTracker();
    btn.textContent = 'Saved';
    btn.disabled = false;
    await new Promise(r => setTimeout(r, 900));

    const char    = getCharForSub(_currentSub);
    const newHtml = renderStoryMoment(char, _currentSub, _currentSub.st_narrative);
    const tmp     = document.createElement('div');
    tmp.innerHTML = newHtml;
    section.replaceWith(tmp.firstElementChild);

    const signOff = document.querySelector('.dt-story-sign-off');
    if (signOff) {
      const sections = getApplicableSections(char, _currentSub);
      const tmp2 = document.createElement('div');
      tmp2.innerHTML = renderSignOffPanel(_currentSub.st_narrative, sections, _currentSub);
      signOff.replaceWith(tmp2.firstElementChild);
    }

    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();

  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    console.error('Story Moment save failed:', err);
  }
}

function _refreshProgressTracker() {
  if (!_currentSub) return;
  const tracker = document.querySelector('.dt-story-progress-tracker');
  if (!tracker) return;
  const char = getCharForSub(_currentSub);
  const tmp  = document.createElement('div');
  tmp.innerHTML = renderProgressTracker(char, _currentSub);
  tracker.replaceWith(tmp.firstElementChild);
}

async function handleCopyProjectContext(btn) {
  if (!_currentSub) return;
  const card = btn.closest('.dt-story-proj-card');
  if (!card) return;
  const idx  = parseInt(card.dataset.projIdx, 10);
  const char = getCharForSub(_currentSub);

  const rev        = _currentSub.projects_resolved?.[idx] || {};
  const slot       = idx + 1;
  const actionType = rev.action_type_override || rev.action_type
    || _currentSub.responses?.[`project_${slot}_action`] || '';

  let cycleData = null, territories = [];
  try {
    const cycleId = _currentSub.cycle_id;
    const [allCycles, terrs] = await Promise.all([
      apiGet('/api/downtime_cycles').catch(() => []),
      apiGet('/api/territories').catch(() => []),
    ]);
    cycleData   = (Array.isArray(allCycles) ? allCycles : []).find(c => String(c._id) === String(cycleId)) || null;
    territories = Array.isArray(terrs) ? terrs : [];
  } catch { /* leave nulls */ }

  const isMainten = actionType === 'maintenance' || rev.pool_status === 'maintenance';
  const text = actionType === 'patrol_scout'
    ? buildPatrolContext(char, _currentSub, idx, cycleData, territories)
    : isMainten
      ? buildMaintenanceContext(char, _currentSub, idx)
      : buildProjectContext(char, _currentSub, idx, cycleData, territories);
  copyToClipboard(text, btn);
}

function handleContextToggle(toggleEl) {
  const block = toggleEl.closest('.dt-story-context-block');
  if (!block) return;
  const collapsed = block.classList.toggle('collapsed');
  toggleEl.textContent = collapsed ? 'Show context' : 'Hide context';
}

async function handleProjectSave(btn, status) {
  const card = btn.closest('.dt-story-proj-card');
  if (!card || !_currentSub) return;
  const idx = parseInt(card.dataset.projIdx, 10);

  const ta      = card.querySelector('.dt-story-response-ta');
  const text    = ta?.value || '';
  const revTa   = card.querySelector('.dt-story-revision-ta');
  const revNote = revTa?.value || '';

  const user = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Saving\u2026';

  try {
    const updatedResponses = buildUpdatedProjectResponses(_currentSub, idx, {
      response: text,
      author,
      status,
      revision_note: revNote,
    });

    await saveNarrativeField(_currentSub._id, {
      'st_narrative.project_responses': updatedResponses,
    });

    // Update local cache
    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.project_responses = updatedResponses;

    _refreshProgressTracker();
    btn.textContent = 'Saved';
    btn.disabled = false;
    await new Promise(r => setTimeout(r, 900));

    // Re-render the project section in place
    const char = getCharForSub(_currentSub);
    const sectionEl = document.querySelector('.dt-story-section[data-section="project_responses"]');
    if (sectionEl) {
      const newHtml = renderProjectSection(char, _currentSub);
      const tmp = document.createElement('div');
      tmp.innerHTML = newHtml;
      sectionEl.replaceWith(tmp.firstElementChild);
    }

    // Re-render sign-off panel (completion count may have changed)
    const signOff = document.querySelector('.dt-story-sign-off');
    if (signOff) {
      const stNarrative = _currentSub.st_narrative;
      const sections = getApplicableSections(char, _currentSub);
      const tmp = document.createElement('div');
      tmp.innerHTML = renderSignOffPanel(stNarrative, sections, _currentSub);
      signOff.replaceWith(tmp.firstElementChild);
    }

    // Refresh nav rail pill
    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();

  } catch (err) {
    btn.disabled = false;
    btn.textContent = originalText;
    console.error('Project save failed:', err);
  }
}

async function handleCopyTerritoryContext(btn) {
  if (!_currentSub) return;
  const char   = getCharForSub(_currentSub);
  const terrId = btn.dataset.terrId;
  if (!terrId) return;

  let cycleData = null, territories = [];
  try {
    const cycleId = _currentSub.cycle_id;
    const [allCycles, terrs] = await Promise.all([
      apiGet('/api/downtime_cycles').catch(() => []),
      apiGet('/api/territories').catch(() => []),
    ]);
    cycleData  = (Array.isArray(allCycles) ? allCycles : []).find(c => String(c._id) === String(cycleId)) || null;
    territories = Array.isArray(terrs) ? terrs : [];
  } catch { /* use nulls */ }

  const text = buildTerritoryContext(char, _currentSub, terrId, _allSubmissions, _allCharacters, cycleData, territories);
  copyToClipboard(text, btn);
}

async function handleTerritorySave(btn, status) {
  const terrSection = btn.closest('.dt-story-terr-section');
  if (!terrSection || !_currentSub) return;
  const idx = parseInt(terrSection.dataset.terrIdx, 10);
  const terrId = terrSection.dataset.terrId;

  const ta      = terrSection.querySelector('.dt-story-response-ta');
  const text    = ta?.value || '';
  const revTa   = terrSection.querySelector('.dt-story-revision-ta');
  const revNote = revTa?.value || '';

  const user = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.textContent = 'Saving\u2026';

  try {
    const existing = [...(_currentSub.st_narrative?.territory_reports || [])];
    while (existing.length <= idx) existing.push(null);
    existing[idx] = { ...(existing[idx] || {}), territory_id: terrId, response: text, author, status, revision_note: revNote };

    await saveNarrativeField(_currentSub._id, {
      'st_narrative.territory_reports': existing,
    });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.territory_reports = existing;

    _refreshProgressTracker();
    btn.textContent = 'Saved';
    btn.disabled = false;
    await new Promise(r => setTimeout(r, 900));

    const char = getCharForSub(_currentSub);
    const sectionEl = document.querySelector('.dt-story-section[data-section="territory_reports"]');
    if (sectionEl) {
      const newHtml = renderTerritoryReports(char, _currentSub, _currentSub.st_narrative, _allSubmissions, _allCharacters);
      const tmp = document.createElement('div');
      tmp.innerHTML = newHtml;
      sectionEl.replaceWith(tmp.firstElementChild);
    }

    const signOff = document.querySelector('.dt-story-sign-off');
    if (signOff) {
      const sections = getApplicableSections(char, _currentSub);
      const tmp2 = document.createElement('div');
      tmp2.innerHTML = renderSignOffPanel(_currentSub.st_narrative, sections, _currentSub);
      signOff.replaceWith(tmp2.firstElementChild);
    }

    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();

  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    console.error('Territory save failed:', err);
  }
}

// ── Merit action event handlers (B3) ─────────────────────────────────────────

function handleCopyActionContext(btn) {
  if (!_currentSub) return;
  const card = btn.closest('.dt-story-merit-card');
  if (!card) return;
  const idx  = parseInt(card.dataset.actionIdx, 10);
  const char = getCharForSub(_currentSub);
  copyToClipboard(buildActionContext(char, _currentSub, idx), btn);
}

async function handleActionSave(btn, status) {
  const card = btn.closest('.dt-story-merit-card');
  if (!card || !_currentSub) return;
  const idx  = parseInt(card.dataset.actionIdx, 10);

  const ta      = card.querySelector('.dt-story-response-ta');
  const text    = ta?.value || '';
  const revTa   = card.querySelector('.dt-story-revision-ta');
  const revNote = revTa?.value || '';
  const user    = getUser();
  const author  = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.textContent = 'Saving\u2026';

  try {
    const existing   = _currentSub.st_narrative?.action_responses || [];
    const updated    = buildUpdatedArray(existing, idx, { action_index: idx, response: text, author, status, revision_note: revNote });

    await saveNarrativeField(_currentSub._id, { 'st_narrative.action_responses': updated });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.action_responses = updated;

    _refreshProgressTracker();
    btn.textContent = 'Saved';
    btn.disabled = false;
    await new Promise(r => setTimeout(r, 900));

    const char       = getCharForSub(_currentSub);
    const sectionKey = card.closest('.dt-story-section')?.dataset.section;
    const sectionEl  = document.querySelector(`.dt-story-section[data-section="${sectionKey}"]`);
    if (sectionEl) {
      const renderers = {
        allies_actions:     () => renderAlliesSection(char, _currentSub),
        status_actions:     () => renderStatusSection(char, _currentSub),
        retainer_actions:   () => renderRetainerSection(char, _currentSub),
        contact_requests:   () => renderContactsSection(char, _currentSub),
        resource_approvals: () => renderResourcesSection(char, _currentSub),
        misc_merit_actions: () => renderMiscMeritSection(char, _currentSub),
      };
      const render = renderers[sectionKey];
      if (render) {
        const tmp = document.createElement('div');
        tmp.innerHTML = render();
        sectionEl.replaceWith(tmp.firstElementChild);
      }
    }

    const signOff = document.querySelector('.dt-story-sign-off');
    if (signOff) {
      const sections = getApplicableSections(char, _currentSub);
      const tmp2 = document.createElement('div');
      tmp2.innerHTML = renderSignOffPanel(_currentSub.st_narrative, sections, _currentSub);
      signOff.replaceWith(tmp2.firstElementChild);
    }

    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();

  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    console.error('Action save failed:', err);
  }
}

async function handleFeedingApproval(btn) {
  if (!_currentSub) return;
  const approved = btn.dataset.approve === 'true';
  btn.disabled = true;
  try {
    await saveNarrativeField(_currentSub._id, {
      'st_narrative.feeding_validation': { approved },
    });
    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.feeding_validation = { approved };
    selectCharacter(_currentCharId);
  } catch (err) {
    console.error('Failed to save feeding validation:', err.message);
    btn.disabled = false;
  }
}

// ── Cacophony Savvy event handlers (B7) ───────────────────────────────────────

function handleCopyCacophonyContext(btn) {
  if (!_currentSub) return;
  const char     = getCharForSub(_currentSub);
  const slotIdx  = parseInt(btn.dataset.slotIdx, 10);
  const csDots   = getCSDots(char);
  const noisy    = scanNoisyActions(_allSubmissions, _currentSub.character_id, csDots);
  const action   = noisy[slotIdx];
  if (!action) return;
  copyToClipboard(buildCacophonySavvyContext(char, action, slotIdx, csDots), btn);
}

async function handleCacophonySave(btn, status) {
  const slot = btn.closest('.dt-story-cs-slot');
  if (!slot || !_currentSub) return;
  const slotIdx = parseInt(slot.dataset.slotIdx, 10);

  const ta      = slot.querySelector('.dt-story-response-ta');
  const text    = ta?.value || '';
  const revTa   = slot.querySelector('.dt-story-revision-ta');
  const revNote = revTa?.value || '';

  const char    = getCharForSub(_currentSub);
  const csDots  = getCSDots(char);
  const noisy   = scanNoisyActions(_allSubmissions, _currentSub.character_id, csDots);
  const action  = noisy[slotIdx];

  const user   = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.textContent = 'Saving\u2026';

  try {
    const existing = _currentSub.st_narrative?.cacophony_savvy || [];
    const updated  = buildUpdatedArray(existing, slotIdx, {
      slot: slotIdx,
      action_ref: action ? {
        character_name: action.characterName,
        action_type:    action.actionType,
        territory:      action.territory,
      } : null,
      response: text,
      author,
      status,
      revision_note: revNote,
    });

    await saveNarrativeField(_currentSub._id, { 'st_narrative.cacophony_savvy': updated });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.cacophony_savvy = updated;

    _refreshProgressTracker();
    btn.textContent = 'Saved';
    btn.disabled = false;
    await new Promise(r => setTimeout(r, 900));

    const sectionEl = document.querySelector('.dt-story-section[data-section="cacophony_savvy"]');
    if (sectionEl) {
      const newHtml = renderCacophonySavvy(char, _currentSub, _currentSub.st_narrative, _allSubmissions);
      const tmp = document.createElement('div');
      tmp.innerHTML = newHtml;
      sectionEl.replaceWith(tmp.firstElementChild);
    }

    const signOff = document.querySelector('.dt-story-sign-off');
    if (signOff) {
      const sections = getApplicableSections(char, _currentSub);
      const tmp2 = document.createElement('div');
      tmp2.innerHTML = renderSignOffPanel(_currentSub.st_narrative, sections, _currentSub);
      signOff.replaceWith(tmp2.firstElementChild);
    }

    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();

  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = originalHTML;
    console.error('Cacophony save failed:', err);
  }
}

// Populate after all handlers are defined
async function handleFeedingNarrativeSave(btn, status) {
  // DTSR-7. Mirrors handleHomeReportSave but writes to st_narrative.feeding_narrative
  // and re-renders the Feeding section in place. The section's completion dot
  // (validated/no_feed/roll) is unaffected by this save.
  const section = btn.closest('.dt-story-section[data-section="feeding_validation"]');
  if (!section || !_currentSub) return;

  const ta      = section.querySelector('.dt-feed-narrative-ta');
  const text    = ta?.value || '';
  const revTa   = section.querySelector('.dt-story-revision-ta');
  const revNote = revTa?.value || '';
  const user    = getUser();
  const author  = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    await saveNarrativeField(_currentSub._id, {
      'st_narrative.feeding_narrative': { response: text, author, status, revision_note: revNote },
    });
    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.feeding_narrative = { response: text, author, status, revision_note: revNote };
    _refreshProgressTracker();
    btn.textContent = 'Saved';
    btn.disabled = false;
    await new Promise(r => setTimeout(r, 900));
    const char = getCharForSub(_currentSub);
    const newHtml = renderFeedingValidation(char, _currentSub, _currentSub.st_narrative);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    section.replaceWith(tmp.firstElementChild);
    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();
  } catch (err) {
    btn.textContent = 'Error';
    btn.disabled = false;
    console.error('handleFeedingNarrativeSave', err);
  }
}

async function handleHomeReportSave(btn, status) {
  const section = btn.closest('.dt-story-section[data-section="home_report"]');
  if (!section || !_currentSub) return;

  const ta      = section.querySelector('.dt-story-response-ta');
  const text    = ta?.value || '';
  const revTa   = section.querySelector('.dt-story-revision-ta');
  const revNote = revTa?.value || '';
  const user    = getUser();
  const author  = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  btn.textContent = 'Saving\u2026';
  try {
    await saveNarrativeField(_currentSub._id, {
      'st_narrative.home_report': { response: text, author, status, revision_note: revNote },
    });
    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.home_report = { response: text, author, status, revision_note: revNote };
    _refreshProgressTracker();
    btn.textContent = 'Saved';
    btn.disabled = false;
    await new Promise(r => setTimeout(r, 900));
    const char   = getCharForSub(_currentSub);
    const newHtml = renderHomeReport(char, _currentSub, _currentSub.st_narrative, _allSubmissions);
    const tmp = document.createElement('div');
    tmp.innerHTML = newHtml;
    section.replaceWith(tmp.firstElementChild);
    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();
  } catch (err) {
    btn.textContent = 'Error';
    btn.disabled = false;
    console.error('handleHomeReportSave', err);
  }
}

Object.assign(SECTION_SAVE_HANDLERS, {
  project_responses:  handleProjectSave,
  story_moment:       handleStoryMomentSave,
  territory_reports:  handleTerritorySave,
  cacophony_savvy:    handleCacophonySave,
  home_report:        handleHomeReportSave,
  feeding_validation: handleFeedingNarrativeSave,
});

// ── DTSR-9: Player flag inbox ───────────────────────────────────────

const FLAG_CATEGORY_LABELS = {
  inconsistent: 'Inconsistent',
  wrong_story:  'Wrong story',
  other:        'Other',
};

function _collectOpenFlags(subs) {
  const flags = [];
  for (const sub of subs) {
    for (const flag of (sub.section_flags || [])) {
      if (flag.status !== 'open') continue;
      flags.push({ ...flag, _sub_id: String(sub._id), _character_id: String(sub.character_id || '') });
    }
  }
  flags.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  return flags;
}

function _flagInboxSectionLabel(flag, sub, char) {
  const key = flag.section_key;
  if (key === 'project_responses' && flag.section_idx != null) {
    const slot = Number(flag.section_idx) + 1;
    const title = sub?.responses?.[`project_${slot}_title`] || `Project ${slot}`;
    return `Project: ${title}`;
  }
  if (key === 'cacophony_savvy' && flag.section_idx != null) {
    return `Rumour ${Number(flag.section_idx) + 1}`;
  }
  const labelMap = {
    story_moment:       'Story Moment',
    home_report:        'Home Report',
    feeding_validation: 'Feeding',
    merit_summary:      'Allies & Asset Summary',
    cacophony_savvy:    'Rumours',
  };
  if (labelMap[key]) return labelMap[key];
  // Fallback: try the section list helper
  try {
    const sections = getApplicableSections(char, sub);
    const match = sections.find(s => s.key === key);
    if (match?.label) return match.label;
  } catch { /* ignore */ }
  return key || 'Unknown section';
}

function _relTime(iso) {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!t) return '';
  const diff = Date.now() - t;
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d}d ago`;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function renderFlagInbox(subs) {
  const flags = _collectOpenFlags(subs);
  if (!flags.length) {
    return '<div class="dt-flag-inbox-empty">No open player flags this cycle.</div>';
  }
  let h = `<div class="dt-flag-inbox-header"><h3>Player Flags (${flags.length} open)</h3></div>`;
  h += '<div class="dt-flag-inbox-rows">';
  for (const flag of flags) {
    const sub = _allSubmissions.find(s => String(s._id) === flag._sub_id);
    const char = _allCharacters.find(c => String(c._id) === String(sub?.character_id));
    const charName = char ? displayName(char) : (sub?.character_name || 'Unknown');
    const label = _flagInboxSectionLabel(flag, sub, char);
    const cat = FLAG_CATEGORY_LABELS[flag.category] || 'Flagged';
    const reasonShort = (flag.reason || '').length > 120
      ? (flag.reason.slice(0, 117) + '…')
      : (flag.reason || '');
    const charId = String(sub?.character_id || '');
    h += `<div class="dt-flag-inbox-row" data-flag-id="${esc(String(flag._id))}" data-sub-id="${esc(flag._sub_id)}">`;
    h += `<div class="dt-flag-inbox-row-meta">`;
    h += `<span class="dt-flag-inbox-char">${esc(charName)}</span>`;
    h += `<span class="dt-flag-inbox-section">${esc(label)}</span>`;
    h += `<span class="dt-flag-inbox-cat dt-flag-inbox-cat-${esc(flag.category)}">${esc(cat)}</span>`;
    h += `<span class="dt-flag-inbox-time">${esc(_relTime(flag.created_at))}</span>`;
    h += `</div>`;
    if (reasonShort) {
      h += `<div class="dt-flag-inbox-reason" title="${esc(flag.reason || '')}">${esc(reasonShort)}</div>`;
    }
    h += `<div class="dt-flag-inbox-actions">`;
    h += `<button type="button" class="dt-flag-inbox-open-btn" data-char-id="${esc(charId)}" data-section-key="${esc(flag.section_key)}"${flag.section_idx != null ? ` data-section-idx="${esc(String(flag.section_idx))}"` : ''}>Open section</button>`;
    h += `<button type="button" class="dt-flag-inbox-resolve-btn">Resolve</button>`;
    h += `</div>`;
    h += `</div>`;
  }
  h += '</div>';
  return h;
}

function _refreshFlagInbox() {
  const inbox = document.getElementById('dt-story-flag-inbox');
  if (inbox) inbox.innerHTML = renderFlagInbox(_allSubmissions);
}

function handleFlagInboxOpen(btn) {
  const charId = btn.dataset.charId;
  if (charId) selectCharacter(charId);
  // Best-effort scroll to the matching section after the character view renders
  const sectionKey = btn.dataset.sectionKey;
  requestAnimationFrame(() => {
    const sectionEl = document.querySelector(`.dt-story-section[data-section="${sectionKey}"]`);
    if (sectionEl) sectionEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function showFlagInboxResolveForm(btn) {
  const row = btn.closest('.dt-flag-inbox-row');
  if (!row) return;
  if (row.querySelector('.dt-flag-inbox-resolve-form')) return;
  const form = document.createElement('div');
  form.className = 'dt-flag-inbox-resolve-form';
  form.innerHTML =
    '<textarea class="dt-flag-inbox-resolve-note" rows="2" placeholder="What did you do? (optional)"></textarea>'
    + '<div class="dt-flag-inbox-resolve-actions">'
      + '<button type="button" class="dt-flag-inbox-resolve-confirm">Confirm Resolve</button>'
      + '<button type="button" class="dt-flag-inbox-resolve-cancel">Cancel</button>'
      + '<span class="dt-flag-inbox-resolve-status"></span>'
    + '</div>';
  row.appendChild(form);
}

function hideFlagInboxResolveForm(btn) {
  const form = btn.closest('.dt-flag-inbox-resolve-form');
  if (form) form.remove();
}

async function handleFlagInboxResolveConfirm(btn) {
  const row = btn.closest('.dt-flag-inbox-row');
  if (!row) return;
  const subId = row.dataset.subId;
  const flagId = row.dataset.flagId;
  const note = (row.querySelector('.dt-flag-inbox-resolve-note')?.value || '').trim();
  const statusEl = row.querySelector('.dt-flag-inbox-resolve-status');
  btn.disabled = true;
  if (statusEl) statusEl.textContent = 'Resolving…';
  try {
    await apiPatch(`/api/downtime_submissions/${subId}/section-flag/${flagId}`, {
      status: 'resolved', resolution_note: note,
    });
    // Update in-memory and refresh the inbox
    const sub = _allSubmissions.find(s => String(s._id) === String(subId));
    if (sub) {
      const flag = (sub.section_flags || []).find(f => String(f._id) === String(flagId));
      if (flag) {
        flag.status = 'resolved';
        flag.resolved_at = new Date().toISOString();
        flag.resolution_note = note || null;
      }
    }
    _refreshFlagInbox();
  } catch (err) {
    btn.disabled = false;
    if (statusEl) statusEl.textContent = `Failed: ${err?.message || 'error'}`;
  }
}
