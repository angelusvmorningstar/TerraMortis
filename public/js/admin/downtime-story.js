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

import { apiGet, apiPut } from '../data/api.js';
import { displayName } from '../data/helpers.js';
import { getUser } from '../auth/discord.js';

// ── Action type labels (duplicated from downtime-views.js per NFR-DS-01) ──────

const ACTION_TYPE_LABELS = {
  ambience_increase: 'Ambience Increase',
  ambience_decrease: 'Ambience Decrease',
  attack:            'Attack',
  feed:              'Feed',
  hide_protect:      'Hide / Protect',
  investigate:       'Investigate',
  patrol_scout:      'Patrol / Scout',
  support:           'Support',
  misc:              'Miscellaneous',
  maintenance:       'Maintenance',
  xp_spend:          'XP Spend',
  block:             'Block',
  rumour:            'Rumour',
  grow:              'Grow',
  acquisition:       'Acquisition',
};

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

// ── Territory constants (duplicated from downtime-views.js per NFR-DS-01) ────

const TERRITORY_SLUG_MAP = {
  the_academy:     'academy',
  the_harbour:     'harbour',
  the_dockyards:   'dockyards',
  the_second_city: 'secondcity',
  the_north_shore: 'northshore',
  the_barrens:     null,
};

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

// ── Merit action constants (duplicated from downtime-views.js per NFR-DS-01) ─

const MERIT_MATRIX = {
  allies: {
    ambience_increase: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3\u20134: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3\u20134: \u22121 ambience; Lvl 5: \u22122 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk \u2212 Hide/Protect) halved (round up) removed from target merit level', effectAuto: '(Level \u2212 Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit', effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool', effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1\u20135+)', effectAuto: '(Level \u2212 Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate \u2212 Hide/Protect = net successes)', effectAuto: 'See Investigation Matrix (Level \u2212 Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1\u20135+)', effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'auto',      effect: 'Auto blocks merit of same level or lower' },
  },
  status: {
    ambience_increase: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3\u20134: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3\u20134: \u22121 ambience; Lvl 5: \u22122 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk \u2212 Hide/Protect) halved (round up) removed from target merit level', effectAuto: '(Level \u2212 Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit', effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool', effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1\u20135+)', effectAuto: '(Level \u2212 Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate \u2212 Hide/Protect = net successes)', effectAuto: 'See Investigation Matrix (Level \u2212 Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1\u20135+)', effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'auto',      effect: 'Auto blocks merit of lower level' },
  },
  retainer: {
    ambience_increase: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3\u20134: +1 ambience; Lvl 5: +2 ambience' },
    ambience_decrease: { poolFormula: 'none',       mode: 'auto',      effect: 'Lvl 3\u20134: \u22121 ambience; Lvl 5: \u22122 ambience' },
    attack:            { poolFormula: 'dots2plus2', mode: 'contested', effect: '(Atk \u2212 Hide/Protect) halved (round up) removed from target merit level', effectAuto: '(Level \u2212 Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes subtracted from any Attack, Scout, or Investigate targeting this merit', effectAuto: 'Level subtracted from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'dots2plus2', mode: 'instant',   effect: 'Successes added as uncapped Teamwork bonus to supported action pool', effectAuto: 'Dots added as uncapped Teamwork bonus' },
    patrol_scout:      { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 action revealed per success (Attack > Scout > Investigate > Ambience > Support priority; detail scales 1\u20135+)', effectAuto: '(Level \u2212 Hide/Protect) successes; same info return' },
    investigate:       { poolFormula: 'dots2plus2', mode: 'contested', effect: 'See Investigation Matrix (Investigate \u2212 Hide/Protect = net successes)', effectAuto: 'See Investigation Matrix (Level \u2212 Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'dots2plus2', mode: 'instant',   effect: '1 similar-merit action revealed per success (Attack > Scout > Investigate > Ambience > Support; detail 1\u20135+)', effectAuto: 'Merit Level = successes' },
    block:             { poolFormula: 'none',       mode: 'blocked',   effect: 'Cannot perform Block' },
  },
  staff: {
    ambience_increase: { poolFormula: 'none', mode: 'auto',      effect: '+1 ambience' },
    ambience_decrease: { poolFormula: 'none', mode: 'auto',      effect: '\u22121 ambience' },
    attack:            { poolFormula: 'none', mode: 'contested', effect: '(1 \u2212 Hide/Protect) halved (round up) removed from target merit level' },
    hide_protect:      { poolFormula: 'none', mode: 'instant',   effect: '\u22121 success from any Attack, Scout, or Investigate targeting this merit' },
    support:           { poolFormula: 'none', mode: 'instant',   effect: '+1 success to supported action' },
    patrol_scout:      { poolFormula: 'none', mode: 'contested', effect: '1 action revealed (1 \u2212 Hide/Protect = net successes; detail scales 1\u20135+)' },
    investigate:       { poolFormula: 'none', mode: 'contested', effect: 'See Investigation Matrix (1 \u2212 Hide/Protect = net successes)' },
    rumour:            { poolFormula: 'none', mode: 'instant',   effect: '1 similar-merit action revealed (1 success)' },
    block:             { poolFormula: 'none', mode: 'blocked',   effect: 'Cannot perform Block' },
  },
  contacts: {
    investigate:  { poolFormula: 'contacts', mode: 'contested', effect: 'If \u22651 success: information appropriate to sphere/theme asked' },
    patrol_scout: { poolFormula: 'contacts', mode: 'contested', effect: 'If \u22651 success: information appropriate to sphere/theme asked' },
    rumour:       { poolFormula: 'contacts', mode: 'contested', effect: 'If \u22651 success: information appropriate to sphere/theme asked' },
  },
};

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

// ── Module state ─────────────────────────────────────────────────────────────

let _allSubmissions = [];   // GET /api/downtime_submissions?cycle_id=
let _allCharacters  = [];   // GET /api/characters
let _currentCharId  = null;
let _currentSub     = null;

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
      const active = Array.isArray(cycles) ? cycles.find(c => c.status === 'active') : null;
      resolvedCycleId = active?._id || null;
    } catch {
      resolvedCycleId = null;
    }
  }

  if (!resolvedCycleId) {
    panel.innerHTML = '<div class="dt-story-empty">No active downtime cycle. Select a cycle in DT Processing first.</div>';
    return;
  }

  try {
    const [subs, chars] = await Promise.all([
      apiGet('/api/downtime_submissions?cycle_id=' + resolvedCycleId),
      apiGet('/api/characters'),
    ]);
    _allSubmissions = Array.isArray(subs) ? subs : [];
    _allCharacters  = Array.isArray(chars) ? chars : [];
  } catch (err) {
    panel.innerHTML = `<div class="dt-story-empty">Failed to load data: ${err.message}</div>`;
    return;
  }

  panel.innerHTML = '';

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

  // Event delegation — pill clicks
  rail.addEventListener('click', e => {
    const pill = e.target.closest('.dt-story-pill');
    if (!pill) return;
    selectCharacter(pill.dataset.charId);
  });

  // Event delegation — all panel button clicks, routed by section key
  panel.addEventListener('click', e => {
    // Sign-off (not inside a section)
    const signOffBtn = e.target.closest('.dt-story-sign-off-btn');
    if (signOffBtn && !signOffBtn.disabled) { handleSignOff(signOffBtn); return; }

    // Context toggle (shared across all sections — no routing needed)
    const toggleLink = e.target.closest('.dt-story-context-toggle');
    if (toggleLink) { handleContextToggle(toggleLink); return; }

    // Determine which section the clicked element belongs to
    const sectionKey = e.target.closest('.dt-story-section')?.dataset.section;

    const MERIT_SECTIONS = new Set(['allies_actions', 'status_actions', 'retainer_actions', 'contact_requests']);

    // Copy Context
    const copyBtn = e.target.closest('.dt-story-copy-ctx-btn');
    if (copyBtn) {
      if (sectionKey === 'project_responses')   { handleCopyProjectContext(copyBtn);    return; }
      if (sectionKey === 'letter_from_home')    { handleCopyLetterContext(copyBtn);     return; }
      if (sectionKey === 'touchstone')          { handleCopyTouchstoneContext(copyBtn); return; }
      if (sectionKey === 'territory_reports')   { handleCopyTerritoryContext(copyBtn);    return; }
      if (sectionKey === 'cacophony_savvy')     { handleCopyCacophonyContext(copyBtn);   return; }
      if (MERIT_SECTIONS.has(sectionKey))       { handleCopyActionContext(copyBtn);      return; }
      return;
    }

    // Approve / Flag (resources only)
    const approveBtn = e.target.closest('.dt-story-approve-btn, .dt-story-flag-btn');
    if (approveBtn && sectionKey === 'resource_approvals') { handleResourceApproval(approveBtn); return; }

    // Save Draft
    const saveDraftBtn = e.target.closest('.dt-story-save-draft-btn');
    if (saveDraftBtn && !saveDraftBtn.disabled) {
      if (sectionKey === 'project_responses')   { handleProjectSave(saveDraftBtn, 'draft');    return; }
      if (sectionKey === 'letter_from_home')    { handleLetterSave(saveDraftBtn, 'draft');     return; }
      if (sectionKey === 'touchstone')          { handleTouchstoneSave(saveDraftBtn, 'draft'); return; }
      if (sectionKey === 'territory_reports')   { handleTerritorySave(saveDraftBtn, 'draft');    return; }
      if (sectionKey === 'cacophony_savvy')     { handleCacophonySave(saveDraftBtn, 'draft');   return; }
      if (MERIT_SECTIONS.has(sectionKey))       { handleActionSave(saveDraftBtn, 'draft');       return; }
      if (sectionKey === 'resource_approvals')  { handleFlagNoteSave(saveDraftBtn);            return; }
      return;
    }

    // Mark Complete
    const completeBtn = e.target.closest('.dt-story-mark-complete-btn');
    if (completeBtn && !completeBtn.disabled) {
      if (sectionKey === 'project_responses')   { handleProjectSave(completeBtn, 'complete');    return; }
      if (sectionKey === 'letter_from_home')    { handleLetterSave(completeBtn, 'complete');     return; }
      if (sectionKey === 'touchstone')          { handleTouchstoneSave(completeBtn, 'complete'); return; }
      if (sectionKey === 'territory_reports')   { handleTerritorySave(completeBtn, 'complete');    return; }
      if (sectionKey === 'cacophony_savvy')     { handleCacophonySave(completeBtn, 'complete');   return; }
      if (MERIT_SECTIONS.has(sectionKey))       { handleActionSave(completeBtn, 'complete');       return; }
      return;
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
 * Handles feeding_validation (approved boolean) and array sections.
 */
function isSectionDone(stNarrative, sectionKey, sub) {
  if (!stNarrative) return false;
  switch (sectionKey) {
    case 'feeding_validation':
      return stNarrative.feeding_validation?.approved === true;
    case 'territory_reports':
      return territoryReportsComplete(sub);
    case 'project_responses':
      return projectResponsesComplete(sub);
    case 'resource_approvals': {
      // Complete when every resource action has been reviewed (approved or flagged)
      const applicable = (sub?.merit_actions || []).filter((a, i) => {
        const cat = deriveMeritCategory(a.merit_type);
        const rev = sub?.merit_actions_resolved?.[i] || {};
        return cat === 'resources' && rev.pool_status !== 'skipped';
      });
      if (!applicable.length) return true;
      const approvals = stNarrative.resource_approvals || [];
      return applicable.every((_, i) => approvals[i]?.approved !== undefined);
    }
    case 'cacophony_savvy':
      return cacophonySavvyComplete(getCharForSub(sub), sub);
    case 'allies_actions':   return actionResponsesComplete(sub, ['allies']);
    case 'status_actions':   return actionResponsesComplete(sub, ['status']);
    case 'retainer_actions': return actionResponsesComplete(sub, ['retainer', 'staff']);
    case 'contact_requests': return actionResponsesComplete(sub, ['contacts']);
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

/**
 * Assembles the Copy Context prompt for a single project action.
 * Pure function — no side effects, no DOM access.
 */
function buildProjectContext(char, sub, idx) {
  const slot = idx + 1;
  const title       = sub.responses?.[`project_${slot}_title`]       || '';
  const outcome     = sub.responses?.[`project_${slot}_outcome`]     || '';
  const description = sub.responses?.[`project_${slot}_description`] || '';
  const territory   = sub.responses?.[`project_${slot}_territory`]   || '';
  const castRaw     = sub.responses?.[`project_${slot}_cast`]        || '';
  const meritsRaw   = sub.responses?.[`project_${slot}_merits`]      || '';

  const rev        = sub.projects_resolved?.[idx] || {};
  const actionType = rev.action_type || sub.responses?.[`project_${slot}_action`] || '';
  const pool       = formatPool(rev.pool_validated) || formatPool(rev.pool_player) || '\u2014';
  const roll       = rev.roll || null;
  const notes      = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];

  const cast   = resolveCast(castRaw);
  const merits = resolveMerits(meritsRaw);

  const actionLabel = ACTION_TYPE_LABELS[actionType] || actionType || 'Unknown';

  const lines = [
    'You are helping a Storyteller draft a narrative response for a Vampire: The Requiem 2nd Edition LARP downtime action.',
    '',
    `Character: ${char ? displayName(char) : 'Unknown'}`,
    `Action: ${actionLabel}`,
  ];

  if (territory) lines.push(`Territory: ${territory}`);
  if (title)     lines.push(`Title: ${title}`);
  if (outcome)   lines.push(`Desired Outcome: ${outcome}`);
  if (description) lines.push(`Description: ${description}`);
  if (cast)      lines.push(`Characters Involved: ${cast}`);
  if (merits)    lines.push(`Merits & Bonuses: ${merits}`);

  const poolStatus = rev.pool_status || 'pending';
  if (poolStatus === 'no_roll' || poolStatus === 'maintenance') {
    lines.push('No roll required');
  } else {
    if (pool && pool !== '\u2014') lines.push(`Validated Pool: ${pool}`);
    if (roll) {
      const diceStr = roll.dice_string
        || (Array.isArray(roll.dice) ? '[' + roll.dice.join(', ') + ']' : '');
      const successes = roll.successes ?? 0;
      const plural = successes !== 1 ? 'es' : '';
      const exc = roll.exceptional ? ', Exceptional' : '';
      lines.push(`Roll Result: ${successes} success${plural}${exc}${diceStr ? ' \u2014 Dice: ' + diceStr : ''}`);
    }
  }

  if (notes.length) {
    lines.push('');
    lines.push('ST Notes:');
    for (const note of notes) {
      lines.push(`- ${note.author_name || 'ST'}: ${note.text || ''}`);
    }
  }

  if (rev.player_feedback) {
    lines.push('');
    lines.push(`Player Feedback: ${rev.player_feedback}`);
  }
  if (sub.st_notes) {
    lines.push('');
    lines.push(`ST Notes (not for player): ${sub.st_notes}`);
  }

  lines.push('');
  lines.push('Write a narrative response (2\u20134 paragraphs) describing what happened during this action from the Storyteller\u2019s perspective.');
  lines.push('');
  lines.push('Note: Character dossiers (background, relationships, voice, touchstones) are held in the project files for this chronicle. If you have access to them, calibrate the narrative to the character\u2019s established details. If not, flag any assumptions made.');
  lines.push('');
  lines.push('Style rules:');
  lines.push('- Second person, present tense');
  lines.push('- British English');
  lines.push('- No mechanical terms \u2014 no discipline names, dot ratings, or success counts in narrative');
  lines.push('- No em dashes');
  lines.push('- Do not editorialise about what the result means mechanically');
  lines.push('- Never dictate what the character felt or chose');
  lines.push('- Target length: ~100 words');

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
    { key: 'letter_from_home',   label: 'Letter from Home' },
    { key: 'touchstone',         label: 'Touchstone' },
    { key: 'feeding_validation', label: 'Feeding Validation' },
  ];

  if (hasHaven(char)) {
    sections.push({ key: 'territory_reports', label: 'Territory Report' });
  }

  if (sub?.projects_resolved?.length) {
    sections.push({ key: 'project_responses', label: 'Project Reports' });
  }

  const hasCategory = (cats) => (sub?.merit_actions || []).some((a, i) => {
    const cat = deriveMeritCategory(a.merit_type);
    if (!cats.includes(cat)) return false;
    const rev = sub?.merit_actions_resolved?.[i] || {};
    return rev.pool_status !== 'skipped';
  });

  if (hasCategory(['allies']))            sections.push({ key: 'allies_actions',     label: 'Allies Actions' });
  if (hasCategory(['status']))            sections.push({ key: 'status_actions',     label: 'Status Actions' });
  if (hasCategory(['retainer', 'staff'])) sections.push({ key: 'retainer_actions',  label: 'Retainer Actions' });
  if (hasCategory(['contacts']))          sections.push({ key: 'contact_requests',   label: 'Contact Requests' });
  if (hasCategory(['resources']))         sections.push({ key: 'resource_approvals', label: 'Resources/Skill Acquisitions' });

  if (hasCacophonySavvy(char)) {
    sections.push({ key: 'cacophony_savvy', label: 'Cacophony Savvy' });
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

  let h = '';
  for (const sub of _allSubmissions) {
    const char = getCharForSub(sub);
    const name = char ? displayName(char) : 'Unknown';
    const state = getNavPillState(sub);
    const stateClass = state ? ` ${state}` : '';
    const charId = sub.character_id || sub._id;
    h += `<button class="dt-story-pill${stateClass}" data-char-id="${charId}" data-sub-id="${sub._id}">`;
    h += name;
    if (state) h += `<span class="dt-story-pill-dot"></span>`;
    h += `</button>`;
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

// ── Character view ────────────────────────────────────────────────────────────

function renderCharacterView(char, sub) {
  const stNarrative = sub?.st_narrative;
  const sections = getApplicableSections(char, sub);

  let h = '';
  h += `<div class="dt-story-char-header">`;
  h += `<h3 class="dt-story-char-name">${char ? displayName(char) : 'Unknown'}</h3>`;
  if (stNarrative?.locked) h += `<span class="dt-story-locked-badge">Locked</span>`;
  h += `</div>`;

  for (const section of sections) {
    h += renderSection(section, char, sub, stNarrative);
  }

  h += renderSignOffPanel(stNarrative, sections, sub);
  return h;
}

// ── Section dispatch ──────────────────────────────────────────────────────────

/**
 * Routes each section to its specific renderer, or falls back to the scaffold placeholder.
 * B4–B7 add cases here as sections are implemented.
 */
function renderSection(section, char, sub, stNarrative) {
  switch (section.key) {
    case 'letter_from_home':   return renderLetterFromHome(char, sub, stNarrative);
    case 'touchstone':         return renderTouchstone(char, sub, stNarrative);
    case 'project_responses':  return renderProjectSection(char, sub);
    case 'territory_reports':  return renderTerritoryReports(char, sub, stNarrative, _allSubmissions, _allCharacters);
    case 'cacophony_savvy':    return renderCacophonySavvy(char, sub, stNarrative, _allSubmissions);
    case 'allies_actions':     return renderAlliesSection(char, sub);
    case 'status_actions':     return renderStatusSection(char, sub);
    case 'retainer_actions':   return renderRetainerSection(char, sub);
    case 'contact_requests':   return renderContactsSection(char, sub);
    case 'resource_approvals': return renderResourcesSection(char, sub);
    default: return renderSectionScaffold(section.key, section.label, stNarrative);
  }
}

// ── Section scaffold (placeholder for unimplemented sections) ─────────────────

function renderSectionScaffold(key, label, stNarrative) {
  const complete = isSectionComplete(stNarrative, key);
  let h = '';
  h += `<div class="dt-story-section" data-section="${key}">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">${label}</span>`;
  h += `<span class="dt-story-completion-dot ${complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-empty">Not yet implemented</div>`;
  h += `</div>`;
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
  const actionType  = rev.action_type || sub.responses?.[`project_${slot}_action`] || '';
  const actionLabel = ACTION_TYPE_LABELS[actionType] || actionType || 'Action';

  const pool = formatPool(rev.pool_validated) || formatPool(rev.pool_player) || '\u2014';
  const roll = rev.roll || null;
  const notes = Array.isArray(rev.notes_thread) ? rev.notes_thread : [];

  const saved    = sub.st_narrative?.project_responses?.[idx] || {};
  const savedTxt = saved.response || '';
  const isComplete = saved.status === 'complete';

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

  let h = `<div class="dt-story-proj-card${isComplete ? ' complete' : ''}" data-proj-idx="${idx}">`;

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
  h += `<textarea class="dt-story-response-ta" data-proj-idx="${idx}" rows="4" placeholder="Write narrative response\u2026">${savedTxt}</textarea>`;

  // Action buttons
  const completeDotClass = isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn" data-proj-idx="${idx}">Save Draft</button>`;
  h += `<button class="dt-story-mark-complete-btn" data-proj-idx="${idx}">`;
  h += `<span class="dt-story-completion-dot ${completeDotClass}"></span> Mark Complete`;
  h += `</button>`;
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
function buildLetterContext(char, sub) {
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

  const lines = [
    'You are helping a Storyteller draft a Letter from Home for a Vampire: The Requiem 2nd Edition LARP character.',
    '',
    `Character: ${char ? displayName(char) : 'Unknown'}`,
  ];

  if (char?.clan)     lines.push(`Clan: ${char.clan}`);
  if (char?.covenant) lines.push(`Covenant: ${char.covenant}`);

  if (touchstones.length) {
    lines.push('');
    lines.push('Touchstones:');
    for (const t of touchstones) {
      const attached = humanity >= (t.humanity || 0) ? 'Attached' : 'Detached';
      const desc = t.desc ? ` (${t.desc})` : '';
      lines.push(`- ${t.name}${desc} \u2014 Humanity ${t.humanity} \u2014 ${attached}`);
    }
  }

  lines.push('');
  lines.push('Player\'s submitted letter:');
  lines.push(playerLetter ? playerLetter.trim() : '[No player letter submitted]');

  lines.push('');
  lines.push('Write a reply letter (~100 words) from one of the above touchstones (or an invented correspondent if none fit) to the character.');
  lines.push('');
  lines.push('Style rules:');
  lines.push('- Written by the NPC to the character, never from the character');
  lines.push('- Character moments only \u2014 no plot hooks, no hints of future events');
  lines.push('- Match the correspondent\'s voice based on their relationship to the character');
  lines.push('- Second person (the NPC writes "you" addressing the character)');
  lines.push('- British English');
  lines.push('- No mechanical terms \u2014 no discipline names, dot ratings');
  lines.push('- No em dashes');
  lines.push('- Do not editorialise \u2014 write the scene, not its significance');

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

  const lines = [
    'You are helping a Storyteller write a Touchstone Vignette for a Vampire: The Requiem 2nd Edition LARP character.',
    '',
    `Character: ${char ? displayName(char) : 'Unknown'}`,
  ];

  if (char?.clan)           lines.push(`Clan: ${char.clan}`);
  if (char?.covenant)       lines.push(`Covenant: ${char.covenant}`);
  if (char?.humanity != null) lines.push(`Humanity: ${char.humanity}`);
  if (char?.mask)           lines.push(`Mask: ${char.mask}`);
  if (char?.dirge)          lines.push(`Dirge: ${char.dirge}`);

  if (touchstones.length) {
    lines.push('');
    lines.push('Touchstones:');
    for (const t of touchstones) {
      const attached = humanity >= (t.humanity || 0) ? 'Attached' : 'Detached';
      const desc = t.desc ? ` (${t.desc})` : '';
      lines.push(`- ${t.name}${desc} \u2014 Humanity ${t.humanity} \u2014 ${attached}`);
    }
  }

  lines.push('');
  lines.push('Player\'s aspirations:');
  lines.push(playerAspirations ? playerAspirations.trim() : '[No aspirations recorded]');

  lines.push('');
  lines.push('Write a short vignette (~100 words) of an in-person moment between the character and one of the above touchstones (or an invented mortal if none fit).');
  lines.push('');
  lines.push('Style rules:');
  lines.push('- Second person, present tense \u2014 the ST narrates to the character');
  lines.push('- The living mortal is the primary subject of the scene');
  lines.push('- The first referent cannot be a pronoun \u2014 open with the mortal\'s name');
  lines.push('- In-person contact only \u2014 not a letter or phone call');
  lines.push('- Character moments only \u2014 no plot hooks, no supernatural revelations, no foreshadowing');
  lines.push('- No mechanical terms \u2014 no discipline names, dot ratings');
  lines.push('- No em dashes');
  lines.push('- British English');
  lines.push('- Do not editorialise \u2014 write the scene, not its significance');

  return lines.join('\n');
}

function renderLetterFromHome(char, sub, stNarrative) {
  const complete = isSectionComplete(stNarrative, 'letter_from_home');
  const dotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  // Pre-fill: st_narrative first, then DT1 legacy fallback
  const savedTxt =
    stNarrative?.letter_from_home?.response ||
    sub.st_review?.narrative?.letter_from_home?.text ||
    '';

  const humanity = char?.humanity ?? 0;
  const touchstones = char?.touchstones || [];
  const playerLetter =
    sub.responses?.correspondence ||
    sub.responses?.letter_to_home ||
    sub.responses?.letter ||
    sub.responses?.narrative_letter ||
    sub.responses?.personal_message ||
    null;

  const ctxCollapsed = savedTxt ? ' collapsed' : '';
  const ctxToggleLabel = savedTxt ? 'Show context' : 'Hide context';

  let h = `<div class="dt-story-section" data-section="letter_from_home">`;

  // Section header
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Letter from Home</span>`;
  h += `<div class="dt-story-section-header-actions">`;
  h += `<button class="dt-story-copy-ctx-btn">Copy Context</button>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `</div>`;

  // Context block (collapsible)
  h += `<div class="dt-story-section-body">`;
  h += `<div class="dt-story-context-block${ctxCollapsed}">`;

  // Touchstone list
  if (touchstones.length) {
    h += `<div class="dt-story-touchstone-list">`;
    for (const t of touchstones) {
      const attached = humanity >= (t.humanity || 0);
      const stateClass = attached ? 'dt-story-ts-attached' : 'dt-story-ts-detached';
      const stateLabel = attached ? 'Attached' : 'Detached';
      const desc = t.desc ? ` (${t.desc})` : '';
      h += `<div class="dt-story-touchstone-entry ${stateClass}">`;
      h += `${t.name}${desc} \u2014 Hum ${t.humanity} \u2014 <em>${stateLabel}</em>`;
      h += `</div>`;
    }
    h += `</div>`;
  } else {
    h += `<div class="dt-story-section-empty">No touchstones on character record.</div>`;
  }

  // Player's submitted letter
  h += `<div class="dt-story-player-letter">`;
  h += `<span class="dt-story-note-author">Player's letter:</span> `;
  if (playerLetter) {
    h += `<pre class="dt-story-context-text">${playerLetter.trim()}</pre>`;
  } else {
    h += `<em class="dt-story-section-empty">[No player letter submitted]</em>`;
  }
  h += `</div>`;

  h += `<a class="dt-story-context-toggle" role="button">${ctxToggleLabel}</a>`;
  h += `</div>`; // context-block

  // Response textarea
  h += `<textarea class="dt-story-response-ta" rows="5" placeholder="Write the letter from home\u2026">${savedTxt}</textarea>`;

  // Action buttons
  const completeDotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn">Save Draft</button>`;
  h += `<button class="dt-story-mark-complete-btn">`;
  h += `<span class="dt-story-completion-dot ${completeDotClass}"></span> Mark Complete`;
  h += `</button>`;
  h += `</div>`;

  h += `</div>`; // section-body
  h += `</div>`; // dt-story-section
  return h;
}

// ── Touchstone Vignette section ───────────────────────────────────────────────

function renderTouchstone(char, sub, stNarrative) {
  const complete = isSectionComplete(stNarrative, 'touchstone');
  const dotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  // Pre-fill: st_narrative first, then DT1 legacy fallback (legacy key: touchstone_vignette)
  const savedTxt =
    stNarrative?.touchstone?.response ||
    sub.st_review?.narrative?.touchstone_vignette?.text ||
    '';

  const humanity = char?.humanity ?? 0;
  const touchstones = char?.touchstones || [];
  const playerAspirations = sub.responses?.aspirations || null;

  const ctxCollapsed = savedTxt ? ' collapsed' : '';
  const ctxToggleLabel = savedTxt ? 'Show context' : 'Hide context';

  let h = `<div class="dt-story-section" data-section="touchstone">`;

  // Section header
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Touchstone Vignette</span>`;
  h += `<div class="dt-story-section-header-actions">`;
  h += `<button class="dt-story-copy-ctx-btn">Copy Context</button>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `</div>`;

  // Section body + collapsible context block
  h += `<div class="dt-story-section-body">`;
  h += `<div class="dt-story-context-block${ctxCollapsed}">`;

  // Character identity row
  const identityParts = [
    char?.clan     ? `Clan: ${char.clan}`         : null,
    char?.covenant ? `Covenant: ${char.covenant}` : null,
    char?.humanity != null ? `Humanity: ${char.humanity}` : null,
    char?.mask     ? `Mask: ${char.mask}`         : null,
    char?.dirge    ? `Dirge: ${char.dirge}`       : null,
  ].filter(Boolean);
  if (identityParts.length) {
    h += `<div class="dt-story-context-identity">${identityParts.join(' \u00b7 ')}</div>`;
  }

  // Touchstone list (classes shared with Letter from Home / B4)
  if (touchstones.length) {
    h += `<div class="dt-story-touchstone-list">`;
    for (const t of touchstones) {
      const attached = humanity >= (t.humanity || 0);
      const stateClass = attached ? 'dt-story-ts-attached' : 'dt-story-ts-detached';
      const stateLabel = attached ? 'Attached' : 'Detached';
      const desc = t.desc ? ` (${t.desc})` : '';
      h += `<div class="dt-story-touchstone-entry ${stateClass}">`;
      h += `${t.name}${desc} \u2014 Hum ${t.humanity} \u2014 <em>${stateLabel}</em>`;
      h += `</div>`;
    }
    h += `</div>`;
  } else {
    h += `<div class="dt-story-section-empty">No touchstones on character record.</div>`;
  }

  // Player's aspirations
  h += `<div class="dt-story-aspirations">`;
  h += `<span class="dt-story-note-author">Player's aspirations:</span> `;
  if (playerAspirations) {
    const display = playerAspirations.length > 200
      ? playerAspirations.slice(0, 200) + '\u2026'
      : playerAspirations;
    h += `<span>${display}</span>`;
  } else {
    h += `<em class="dt-story-section-empty">[No aspirations recorded]</em>`;
  }
  h += `</div>`;

  h += `<a class="dt-story-context-toggle" role="button">${ctxToggleLabel}</a>`;
  h += `</div>`; // context-block

  // Response textarea
  h += `<textarea class="dt-story-response-ta" rows="5" placeholder="Write the touchstone vignette\u2026">${savedTxt}</textarea>`;

  // Action buttons
  const completeDotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn">Save Draft</button>`;
  h += `<button class="dt-story-mark-complete-btn">`;
  h += `<span class="dt-story-completion-dot ${completeDotClass}"></span> Mark Complete`;
  h += `</button>`;
  h += `</div>`;

  h += `</div>`; // section-body
  h += `</div>`; // dt-story-section
  return h;
}

// ── Merit action helpers (B3) ─────────────────────────────────────────────────

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
  return 'misc';
}

/**
 * Looks up a merit's dot count and qualifier from the character sheet.
 * Returns { dots, qualifier, label }.
 */
function getMeritDetails(char, action) {
  const meritName = (action.merit_type || '').replace(/\s*\d+\s*$/, '').trim();
  const merit = char?.merits?.find(m =>
    m.name?.toLowerCase().includes(meritName.toLowerCase()) ||
    meritName.toLowerCase().includes((m.name || '').toLowerCase())
  );
  return {
    dots:      merit ? (merit.dots || 0) : 0,
    qualifier: merit?.qualifier || action.qualifier || '',
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
      const cat = deriveMeritCategory(rev.merit_type || '');
      if (!['allies', 'status', 'retainer'].includes(cat)) return;
      const otherTerr = resolveTerrId(s.st_review?.territory_overrides?.[`allies_${idx}`] || '');
      if (otherTerr !== terrId) return;
      overlaps.push({ characterName: s.character_name || 'Unknown', meritType: rev.merit_type || '' });
    });
  }
  return overlaps;
}

// ── Action context builder (B3 + A1) ─────────────────────────────────────────

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

  const lines = [
    'You are helping a Storyteller draft a narrative response for a Vampire: The Requiem 2nd Edition LARP downtime action.',
    '',
    `Character: ${char ? displayName(char) : 'Unknown'}`,
    `Action: ${meritDisplay} \u2014 ${actionLabel}`,
    `Mode: ${mode}`,
  ];

  if (territory) lines.push(`Territory: ${territory}`);
  if (action.desired_outcome) lines.push(`Desired Outcome: ${action.desired_outcome}`);
  if (action.description)     lines.push(`Description: ${action.description}`);

  if (!isAuto) lines.push(`Validated Pool: ${pool}`);

  if (rev.roll && !isAuto) {
    const diceStr = rev.roll.dice_string || (Array.isArray(rev.roll.dice) ? '[' + rev.roll.dice.join(', ') + ']' : '');
    const s = rev.roll.successes ?? 0;
    const exc = rev.roll.exceptional ? ', Exceptional' : '';
    lines.push(`Roll Result: ${s} success${s !== 1 ? 'es' : ''}${exc}${diceStr ? ' \u2014 Dice: ' + diceStr : ''}`);
  }

  if (matrixNote) lines.push(`Matrix Outcome: ${matrixNote}`);
  if (effect)     lines.push(`Effect: ${effect}`);

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
    lines.push('ST Notes:');
    notes.forEach(n => lines.push(`- ${n.author_name || 'ST'}: ${n.text || ''}`));
  }

  if (rev.player_feedback) {
    lines.push('');
    lines.push(`Player Feedback: ${rev.player_feedback}`);
  }
  if (sub.st_notes) {
    lines.push('');
    lines.push(`ST Notes (not for player): ${sub.st_notes}`);
  }

  lines.push('');
  lines.push('Write a brief narrative note (1\u20132 sentences, ~50 words) from the Storyteller\u2019s perspective describing the outcome of this action through the merit/contact/ally.');
  lines.push('');
  lines.push('Note: Character dossiers (background, relationships, voice, touchstones) are held in the project files for this chronicle. If you have access to them, calibrate the narrative to the character\u2019s established details. If not, flag any assumptions made.');
  lines.push('');
  lines.push('Style rules:');
  lines.push('- Third person (the action is by an NPC merit, not the player character directly)');
  lines.push('- British English');
  lines.push('- No mechanical terms \u2014 no dot ratings, pool numbers, or success counts');
  lines.push('- No em dashes');
  lines.push('- Do not name game-mechanical concepts (no "Investigate", "Patrol/Scout", etc.)');
  lines.push('- Focus on what the ally/contact/retainer actually did');

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

  const dotStr  = dots ? '\u25CF'.repeat(dots) : '';
  const qualStr = qualifier ? ` (${qualifier})` : '';
  const actionLabel = ACTION_TYPE_LABELS[actionType] || actionType || 'Action';

  // Roll summary
  let rollSummary = '';
  if (roll) {
    const s = roll.successes ?? 0;
    const exc = roll.exceptional ? ', Exceptional' : '';
    rollSummary = `${s} success${s !== 1 ? 'es' : ''}${exc}`;
  } else if (rev.pool_status === 'no_roll') {
    rollSummary = 'No roll';
  }

  const ctxCollapsed   = savedTxt ? ' collapsed' : '';
  const ctxToggleLabel = savedTxt ? 'Show context' : 'Hide context';
  const completeDotClass = isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  let h = `<div class="dt-story-merit-card${isComplete ? ' complete' : ''}" data-action-idx="${idx}">`;

  // Header
  h += `<div class="dt-story-merit-header">`;
  h += `<span class="dt-story-mode-chip ${isAuto ? 'auto' : 'rolled'}">${modeLabel}</span>`;
  h += `<span class="dt-story-merit-label">${label}${dotStr ? ' ' + dotStr : ''}${qualStr}</span>`;
  h += `<button class="dt-story-copy-ctx-btn" data-action-idx="${idx}">Copy Context</button>`;
  h += `</div>`;

  // Meta row
  h += `<div class="dt-story-merit-meta">`;
  h += `<span class="dt-story-action-chip">${actionLabel}</span>`;
  if (territory) h += `<span class="dt-story-proj-territory">Territory: ${territory}</span>`;
  const poolRoll = [pool ? `Pool: ${pool}` : '', rollSummary ? `Roll: ${rollSummary}` : ''].filter(Boolean).join(' \u2502 ');
  if (poolRoll) h += `<span class="dt-story-proj-pool">${poolRoll}</span>`;
  if (action.desired_outcome) h += `<span class="dt-story-proj-outcome">Outcome: ${action.desired_outcome}</span>`;
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
  h += `<textarea class="dt-story-response-ta" data-action-idx="${idx}" rows="3" placeholder="Write narrative note\u2026">${savedTxt}</textarea>`;

  // Buttons
  h += `<div class="dt-story-card-actions">`;
  h += `<button class="dt-story-save-draft-btn" data-action-idx="${idx}">Save Draft</button>`;
  h += `<button class="dt-story-mark-complete-btn" data-action-idx="${idx}">`;
  h += `<span class="dt-story-completion-dot ${completeDotClass}"></span> Mark Complete`;
  h += `</button>`;
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
function renderContactsSection(char, sub) { return renderMeritSection(char, sub, 'contact_requests', 'Contact Requests', ['contacts']); }

// ── Resources/Skill Acquisitions section (B3 Task 5) ─────────────────────────

function renderResourcesSection(char, sub) {
  const actions    = sub.merit_actions || [];
  const resolved   = sub.merit_actions_resolved || [];
  const stNarrative = sub.st_narrative;

  const applicable = actions
    .map((a, i) => ({ a, i, rev: resolved[i] || {} }))
    .filter(({ a, rev }) => deriveMeritCategory(a.merit_type) === 'resources' && rev.pool_status !== 'skipped');

  // Resources complete when all have approved !== undefined
  const approvals    = stNarrative?.resource_approvals || [];
  const allApproved  = applicable.length > 0
    && applicable.every(({ i }) => approvals[i]?.approved !== undefined);
  const dotClass = allApproved ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  let h = `<div class="dt-story-section" data-section="resource_approvals">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Resources / Skill Acquisitions</span>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  if (!applicable.length) {
    h += `<div class="dt-story-section-empty">No resource actions for this submission.</div>`;
  } else {
    applicable.forEach(({ a, i }) => {
      const approval     = approvals[i] || {};
      const isApproved   = approval.approved === true;
      const isFlagged    = approval.approved === false;
      const flagNote     = approval.flag_note || '';
      const { dots, qualifier, label } = getMeritDetails(char, a);
      const dotStr  = dots ? '\u25CF'.repeat(dots) : '';
      const qualStr = qualifier ? ` (${qualifier})` : '';

      h += `<div class="dt-story-resources-card" data-action-idx="${i}">`;
      h += `<div class="dt-story-merit-header">`;
      h += `<span class="dt-story-merit-label">${label}${dotStr ? ' ' + dotStr : ''}${qualStr}</span>`;
      h += `<div class="dt-story-resource-btns">`;
      h += `<button class="dt-story-approve-btn${isApproved ? ' active' : ''}" data-action-idx="${i}" data-approved="true">Approve</button>`;
      h += `<button class="dt-story-flag-btn${isFlagged ? ' active' : ''}" data-action-idx="${i}" data-approved="false">Flag</button>`;
      h += `</div>`;
      h += `</div>`;
      if (a.desired_outcome || a.description) {
        h += `<div class="dt-story-merit-meta">`;
        if (a.desired_outcome) h += `<span class="dt-story-proj-outcome">Requested: ${a.desired_outcome}</span>`;
        if (a.description)     h += `<span class="dt-story-proj-outcome">${a.description}</span>`;
        h += `</div>`;
      }
      if (isFlagged) {
        h += `<textarea class="dt-story-response-ta" data-action-idx="${i}" rows="2" placeholder="Flag note\u2026">${flagNote}</textarea>`;
        h += `<div class="dt-story-card-actions">`;
        h += `<button class="dt-story-save-draft-btn dt-story-flag-note-save" data-action-idx="${i}">Save Note</button>`;
        h += `</div>`;
      }
      h += `</div>`;
    });
  }

  h += `</div></div>`;
  return h;
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
function buildTerritoryContext(char, sub, terrId, allSubmissions, allChars) {
  const terrName = TERRITORY_DISPLAY[terrId] || terrId;

  // Find slug for co-resident lookup
  const feedEntries = parseFeedingTerritories(sub);
  const terrSlug = feedEntries.find(([slug]) => TERRITORY_SLUG_MAP[slug] === terrId)?.[0] || null;

  const coResidents = terrSlug ? getCoResidents(terrSlug, sub, allSubmissions, allChars) : [];
  const notableEvents = getNotableEvents(terrId, sub, allSubmissions);

  // Character's own actions in this territory
  const ownActions = [];
  const feedingResolved = sub.st_review?.feeding_status === 'approved';
  if (feedingResolved && sub.feeding_roll) {
    const poolSize = sub.feeding_roll.params?.size;
    ownActions.push(`Feeding${poolSize ? ` (pool: ${poolSize} dice)` : ''}`);
  }
  const resolved = sub.projects_resolved || [];
  resolved.forEach((rev, idx) => {
    if (!rev || rev.pool_status === 'skipped') return;
    const slot = idx + 1;
    const rawTerr = sub.responses?.[`project_${slot}_territory`] || '';
    if (resolveTerrId(rawTerr) !== terrId) return;
    const actionLabel = ACTION_TYPE_LABELS[rev.action_type] || rev.action_type || 'Action';
    const outcome = sub.responses?.[`project_${slot}_outcome`] || '';
    const successes = rev.roll?.successes ?? null;
    let line = actionLabel;
    if (outcome) line += `: ${outcome}`;
    if (successes !== null) line += ` (${successes} success${successes !== 1 ? 'es' : ''})`;
    ownActions.push(line);
  });

  const lines = [
    'You are helping a Storyteller write a Territory Report for a Vampire: The Requiem 2nd Edition LARP character.',
    '',
    `Character: ${char ? displayName(char) : 'Unknown'}`,
  ];
  if (char?.clan)     lines.push(`Clan: ${char.clan}`);
  if (char?.covenant) lines.push(`Covenant: ${char.covenant}`);
  lines.push(`Territory: ${terrName}`);

  lines.push('');
  lines.push('Co-residents this cycle:');
  if (coResidents.length) {
    for (const r of coResidents) {
      const tags = [r.clan, r.covenant].filter(Boolean).join(', ');
      lines.push(`- ${r.name}${tags ? ` (${tags})` : ''}`);
    }
  } else {
    lines.push('No other residents this cycle');
  }

  if (ownActions.length) {
    lines.push('');
    lines.push(`This character\u2019s actions in ${terrName}:`);
    for (const a of ownActions) lines.push(`- ${a}`);
  }

  lines.push('');
  lines.push(`Notable events in ${terrName} (public-facing):`);
  if (notableEvents.length) {
    for (const ev of notableEvents) {
      const succStr = ev.successes !== null ? ` (${ev.successes} success${ev.successes !== 1 ? 'es' : ''})` : '';
      const outcomeStr = ev.outcome ? `: ${ev.outcome}` : '';
      lines.push(`- ${ev.characterName} ran ${ev.actionType}${outcomeStr}${succStr}`);
    }
  } else {
    lines.push('No notable events recorded');
  }

  lines.push('');
  lines.push(`Write a short territory report (~100 words) describing what the character observed and experienced in ${terrName} this cycle.`);
  lines.push('');
  lines.push('Style rules:');
  lines.push('- Second person, present tense');
  lines.push('- British English');
  lines.push('- No mechanical terms \u2014 no discipline names, success counts, dot ratings');
  lines.push('- No em dashes');
  lines.push('- Do not reveal hidden actions or information the character could not have witnessed');
  lines.push('- Character moments only \u2014 no foreshadowing or plot hooks');
  lines.push('- Do not editorialise');

  return lines.join('\n');
}

/**
 * Returns true when all resident-territory reports are complete,
 * or when no resident territory was declared (trivially complete).
 */
function territoryReportsComplete(sub) {
  const residentTerrs = parseFeedingTerritories(sub)
    .filter(([, v]) => v === 'resident')
    .map(([slug]) => TERRITORY_SLUG_MAP[slug] || null)
    .filter(id => id !== null);
  if (residentTerrs.length === 0) return true;
  const reports = sub.st_narrative?.territory_reports || [];
  return reports.filter(r => r?.territory_id).length >= residentTerrs.length
    && reports.every(r => !r || r.status === 'complete');
}

// ── Territory Report section ──────────────────────────────────────────────────

function renderTerritoryReports(char, sub, stNarrative, allSubmissions, allChars) {
  const residentTerrs = parseFeedingTerritories(sub)
    .filter(([, v]) => v === 'resident')
    .map(([slug]) => ({
      slug,
      id: TERRITORY_SLUG_MAP[slug] || null,
      name: TERRITORY_DISPLAY[TERRITORY_SLUG_MAP[slug]] || slug,
    }))
    .filter(t => t.id !== null);

  const complete = territoryReportsComplete(sub);
  const dotClass = complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

  let h = `<div class="dt-story-section" data-section="territory_reports">`;
  h += `<div class="dt-story-section-header">`;
  h += `<span class="dt-story-section-label">Territory Report</span>`;
  h += `<span class="dt-story-completion-dot ${dotClass}"></span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  if (!residentTerrs.length) {
    h += `<div class="dt-story-terr-no-territory">No resident territory declared this cycle. No territory report required.</div>`;
    h += `</div></div>`;
    return h;
  }

  for (let idx = 0; idx < residentTerrs.length; idx++) {
    const terr = residentTerrs[idx];
    const terrId = terr.id;
    const terrName = terr.name;

    const stNarrEntry = stNarrative?.territory_reports?.[idx];
    const legacyText = idx === 0 ? (sub.st_review?.narrative?.territory_report?.text || '') : '';
    const savedTxt = stNarrEntry?.response || legacyText;
    const isComplete = stNarrEntry?.status === 'complete';

    const ctxCollapsed = savedTxt ? ' collapsed' : '';
    const ctxToggleLabel = savedTxt ? 'Show context' : 'Hide context';

    h += `<div class="dt-story-terr-section" data-terr-idx="${idx}" data-terr-id="${terrId}">`;

    // Territory sub-section header
    h += `<div class="dt-story-terr-header">`;
    h += `<span class="dt-story-terr-name">${terrName.toUpperCase()}</span>`;
    h += `<span class="dt-story-completion-dot ${isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span>`;
    h += `<button class="dt-story-copy-ctx-btn" data-terr-idx="${idx}" data-terr-id="${terrId}">Copy Context</button>`;
    h += `</div>`;

    // Collapsible context block
    h += `<div class="dt-story-context-block${ctxCollapsed}">`;

    // Co-residents block
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
    h += `<textarea class="dt-story-response-ta" data-terr-idx="${idx}" data-terr-id="${terrId}" rows="4" placeholder="Write territory report\u2026">${savedTxt}</textarea>`;

    // Action buttons
    h += `<div class="dt-story-card-actions">`;
    h += `<button class="dt-story-save-draft-btn" data-terr-idx="${idx}" data-terr-id="${terrId}">Save Draft</button>`;
    h += `<button class="dt-story-mark-complete-btn" data-terr-idx="${idx}" data-terr-id="${terrId}">`;
    h += `<span class="dt-story-completion-dot ${isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span> Mark Complete`;
    h += `</button>`;
    h += `</div>`;

    h += `</div>`; // dt-story-terr-section
  }

  h += `</div></div>`;
  return h;
}

// ── B7: Cacophony Savvy section ───────────────────────────────────────────────

function getCSDots(char) {
  const m = (char.merits || []).find(m => m.name === 'Cacophony Savvy');
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
  lines.push(`Character: ${displayName(char)}`);
  lines.push(`Cacophony Savvy: ${csDots} dots (slot ${slotIdx + 1} of ${csDots})`);
  lines.push('');
  lines.push('This slot covers a noisy event that filtered through the Cacophony this cycle:');
  lines.push('');
  lines.push(`Source: ${noisyAction.characterName}`);
  lines.push(`Action: ${ACTION_TYPE_LABELS[noisyAction.actionType] || noisyAction.actionType}`);
  if (noisyAction.territory) lines.push(`Territory: ${noisyAction.territory}`);
  if (noisyAction.outcome)   lines.push(`Declared intent: ${noisyAction.outcome}`);
  lines.push('');
  lines.push(`Write a short vignette (~75 words) of what ${displayName(char)} heard via the Cacophony about this event.`);
  lines.push('');
  lines.push('Style rules:');
  lines.push('- Third person \u2014 the character hears about someone else, not about themselves');
  lines.push('- British English');
  lines.push('- No mechanical terms \u2014 no discipline names, success counts, dot ratings');
  lines.push('- No em dashes');
  lines.push('- Cacophony impressions are distorted \u2014 facts may be garbled, emphasis skewed, source obscured');
  lines.push('- Do not state what actually happened precisely; write what filtered through the rumour network');
  lines.push('- Do not editorialise about significance');
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
  h += `<span class="dt-story-section-header">CACOPHONY SAVVY (${csDots} dot${csDots !== 1 ? 's' : ''})</span>`;
  h += `</div>`;
  h += `<div class="dt-story-section-body">`;

  for (let slotIdx = 0; slotIdx < csDots; slotIdx++) {
    const noisyAction = noisyActions[slotIdx] || null;
    const savedSlot   = saved[slotIdx] || null;
    const savedTxt    = savedSlot?.response || '';
    const isComplete  = savedSlot?.status === 'complete';
    const dotClass    = isComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';

    h += `<div class="dt-story-cs-slot${isComplete ? ' complete' : ''}" data-slot-idx="${slotIdx}">`;
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
      h += `<textarea class="dt-story-response-ta" data-slot-idx="${slotIdx}" rows="5" placeholder="Write Cacophony Savvy vignette\u2026">${savedTxt}</textarea>`;

      // Action buttons
      h += `<div class="dt-story-card-actions">`;
      h += `<button class="dt-story-save-draft-btn" data-slot-idx="${slotIdx}">Save Draft</button>`;
      h += `<button class="dt-story-mark-complete-btn" data-slot-idx="${slotIdx}">`;
      h += `<span class="dt-story-completion-dot ${dotClass}"></span> Mark Complete`;
      h += `</button>`;
      h += `</div>`;
    }

    h += `</div>`; // cs-slot
  }

  h += `</div></div>`; // section-body + section
  return h;
}

// ── Sign-off panel ────────────────────────────────────────────────────────────

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

function handleCopyLetterContext(btn) {
  if (!_currentSub) return;
  const char = getCharForSub(_currentSub);
  const text = buildLetterContext(char, _currentSub);
  copyToClipboard(text, btn);
}

async function handleLetterSave(btn, status) {
  const section = btn.closest('.dt-story-section[data-section="letter_from_home"]');
  if (!section || !_currentSub) return;

  const ta = section.querySelector('.dt-story-response-ta');
  const text = ta?.value || '';

  const user = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.textContent = 'Saving\u2026';

  try {
    await saveNarrativeField(_currentSub._id, {
      'st_narrative.letter_from_home': { response: text, author, status },
    });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.letter_from_home = {
      ...(_currentSub.st_narrative.letter_from_home || {}),
      response: text, author, status,
    };

    const char = getCharForSub(_currentSub);
    const newHtml = renderLetterFromHome(char, _currentSub, _currentSub.st_narrative);
    const tmp = document.createElement('div');
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
    console.error('Letter save failed:', err);
  }
}

function handleCopyProjectContext(btn) {
  if (!_currentSub) return;
  const card = btn.closest('.dt-story-proj-card');
  if (!card) return;
  const idx = parseInt(card.dataset.projIdx, 10);
  const char = getCharForSub(_currentSub);
  const text = buildProjectContext(char, _currentSub, idx);
  copyToClipboard(text, btn);
}

function handleContextToggle(toggleEl) {
  const block = toggleEl.closest('.dt-story-context-block');
  if (!block) return;
  const collapsed = block.classList.toggle('collapsed');
  toggleEl.textContent = collapsed ? 'Show context' : 'Hide context';
}

function handleCopyTouchstoneContext(btn) {
  if (!_currentSub) return;
  const char = getCharForSub(_currentSub);
  const text = buildTouchstoneContext(char, _currentSub);
  copyToClipboard(text, btn);
}

async function handleTouchstoneSave(btn, status) {
  const section = btn.closest('.dt-story-section[data-section="touchstone"]');
  if (!section || !_currentSub) return;

  const ta = section.querySelector('.dt-story-response-ta');
  const text = ta?.value || '';

  const user = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.textContent = 'Saving\u2026';

  try {
    await saveNarrativeField(_currentSub._id, {
      'st_narrative.touchstone': { response: text, author, status },
    });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.touchstone = {
      ...(_currentSub.st_narrative.touchstone || {}),
      response: text, author, status,
    };

    const char = getCharForSub(_currentSub);
    const newHtml = renderTouchstone(char, _currentSub, _currentSub.st_narrative);
    const tmp = document.createElement('div');
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
    console.error('Touchstone save failed:', err);
  }
}

async function handleProjectSave(btn, status) {
  const card = btn.closest('.dt-story-proj-card');
  if (!card || !_currentSub) return;
  const idx = parseInt(card.dataset.projIdx, 10);

  const ta = card.querySelector('.dt-story-response-ta');
  const text = ta?.value || '';

  const user = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalText = btn.textContent;
  // Strip out the dot span from button text for restoration
  btn.textContent = 'Saving\u2026';

  try {
    const updatedResponses = buildUpdatedProjectResponses(_currentSub, idx, {
      response: text,
      author,
      status,
    });

    await saveNarrativeField(_currentSub._id, {
      'st_narrative.project_responses': updatedResponses,
    });

    // Update local cache
    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.project_responses = updatedResponses;

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

function handleCopyTerritoryContext(btn) {
  if (!_currentSub) return;
  const char = getCharForSub(_currentSub);
  const terrId = btn.dataset.terrId;
  if (!terrId) return;
  const text = buildTerritoryContext(char, _currentSub, terrId, _allSubmissions, _allCharacters);
  copyToClipboard(text, btn);
}

async function handleTerritorySave(btn, status) {
  const terrSection = btn.closest('.dt-story-terr-section');
  if (!terrSection || !_currentSub) return;
  const idx = parseInt(terrSection.dataset.terrIdx, 10);
  const terrId = terrSection.dataset.terrId;

  const ta = terrSection.querySelector('.dt-story-response-ta');
  const text = ta?.value || '';

  const user = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.textContent = 'Saving\u2026';

  try {
    const existing = [...(_currentSub.st_narrative?.territory_reports || [])];
    while (existing.length <= idx) existing.push(null);
    existing[idx] = { ...(existing[idx] || {}), territory_id: terrId, response: text, author, status };

    await saveNarrativeField(_currentSub._id, {
      'st_narrative.territory_reports': existing,
    });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.territory_reports = existing;

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

  const ta   = card.querySelector('.dt-story-response-ta');
  const text = ta?.value || '';
  const user = getUser();
  const author = user?.global_name || user?.username || 'ST';

  btn.disabled = true;
  const originalHTML = btn.innerHTML;
  btn.textContent = 'Saving\u2026';

  try {
    const existing   = _currentSub.st_narrative?.action_responses || [];
    const updated    = buildUpdatedArray(existing, idx, { action_index: idx, response: text, author, status });

    await saveNarrativeField(_currentSub._id, { 'st_narrative.action_responses': updated });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.action_responses = updated;

    const char       = getCharForSub(_currentSub);
    const sectionKey = card.closest('.dt-story-section')?.dataset.section;
    const sectionEl  = document.querySelector(`.dt-story-section[data-section="${sectionKey}"]`);
    if (sectionEl) {
      const renderers = {
        allies_actions:   () => renderAlliesSection(char, _currentSub),
        status_actions:   () => renderStatusSection(char, _currentSub),
        retainer_actions: () => renderRetainerSection(char, _currentSub),
        contact_requests: () => renderContactsSection(char, _currentSub),
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

async function handleResourceApproval(btn) {
  const card = btn.closest('.dt-story-resources-card');
  if (!card || !_currentSub) return;
  const idx      = parseInt(card.dataset.actionIdx, 10);
  const approved = btn.dataset.approved === 'true';

  btn.disabled = true;
  try {
    const user   = getUser();
    const author = user?.global_name || user?.username || 'ST';
    const existing = _currentSub.st_narrative?.resource_approvals || [];
    const updated  = buildUpdatedArray(existing, idx, { action_index: idx, approved, flag_note: '', reviewed_by: author });

    await saveNarrativeField(_currentSub._id, { 'st_narrative.resource_approvals': updated });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.resource_approvals = updated;

    const char      = getCharForSub(_currentSub);
    const sectionEl = document.querySelector('.dt-story-section[data-section="resource_approvals"]');
    if (sectionEl) {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderResourcesSection(char, _currentSub);
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
    btn.disabled = true;
    console.error('Resource approval failed:', err);
  }
}

async function handleFlagNoteSave(btn) {
  const card = btn.closest('.dt-story-resources-card');
  if (!card || !_currentSub) return;
  const idx      = parseInt(card.dataset.actionIdx, 10);
  const ta       = card.querySelector('.dt-story-response-ta');
  const flagNote = ta?.value || '';

  btn.disabled = true;
  btn.textContent = 'Saving\u2026';
  try {
    const user     = getUser();
    const author   = user?.global_name || user?.username || 'ST';
    const existing = _currentSub.st_narrative?.resource_approvals || [];
    const updated  = buildUpdatedArray(existing, idx, { action_index: idx, approved: false, flag_note: flagNote, reviewed_by: author });

    await saveNarrativeField(_currentSub._id, { 'st_narrative.resource_approvals': updated });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.resource_approvals = updated;

    btn.textContent = 'Saved';
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Save Note'; }, 1500);

  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Save Note';
    console.error('Flag note save failed:', err);
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

  const ta   = slot.querySelector('.dt-story-response-ta');
  const text = ta?.value || '';

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
    });

    await saveNarrativeField(_currentSub._id, { 'st_narrative.cacophony_savvy': updated });

    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.cacophony_savvy = updated;

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
