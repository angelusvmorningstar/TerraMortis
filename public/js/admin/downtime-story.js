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

    // Copy Context
    const copyBtn = e.target.closest('.dt-story-copy-ctx-btn');
    if (copyBtn) {
      if (sectionKey === 'project_responses') { handleCopyProjectContext(copyBtn);   return; }
      if (sectionKey === 'letter_from_home')  { handleCopyLetterContext(copyBtn);    return; }
      if (sectionKey === 'touchstone')        { handleCopyTouchstoneContext(copyBtn); return; }
      return;
    }

    // Save Draft
    const saveDraftBtn = e.target.closest('.dt-story-save-draft-btn');
    if (saveDraftBtn && !saveDraftBtn.disabled) {
      if (sectionKey === 'project_responses') { handleProjectSave(saveDraftBtn, 'draft');    return; }
      if (sectionKey === 'letter_from_home')  { handleLetterSave(saveDraftBtn, 'draft');     return; }
      if (sectionKey === 'touchstone')        { handleTouchstoneSave(saveDraftBtn, 'draft'); return; }
      return;
    }

    // Mark Complete
    const completeBtn = e.target.closest('.dt-story-mark-complete-btn');
    if (completeBtn && !completeBtn.disabled) {
      if (sectionKey === 'project_responses') { handleProjectSave(completeBtn, 'complete');    return; }
      if (sectionKey === 'letter_from_home')  { handleLetterSave(completeBtn, 'complete');     return; }
      if (sectionKey === 'touchstone')        { handleTouchstoneSave(completeBtn, 'complete'); return; }
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
    case 'territory_reports': {
      const reports = stNarrative.territory_reports || [];
      return reports.length > 0 && reports.every(r => r.status === 'complete');
    }
    case 'project_responses':
      return projectResponsesComplete(sub);
    case 'resource_approvals': {
      const approvals = stNarrative.resource_approvals || [];
      return approvals.length > 0 && approvals.every(r => r.approved === true);
    }
    case 'cacophony_savvy': {
      const cs = stNarrative.cacophony_savvy || [];
      return cs.length > 0 && cs.every(r => r.status === 'complete');
    }
    case 'allies_actions':
    case 'status_actions':
    case 'retainer_actions':
    case 'contact_requests': {
      const catMap = {
        allies_actions:   ['allies'],
        status_actions:   ['status'],
        retainer_actions: ['retainer', 'staff'],
        contact_requests: ['contacts'],
      };
      const cats = catMap[sectionKey];
      const indices = (sub?.merit_actions_resolved || [])
        .map((a, i) => ({ a, i }))
        .filter(({ a }) => cats.includes(a.meritCategory))
        .map(({ i }) => i);
      if (!indices.length) return false;
      const responses = stNarrative.action_responses || [];
      return indices.every(idx => {
        const rsp = responses.find(r => r.action_index === idx);
        return rsp?.status === 'complete';
      });
    }
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

  lines.push(`Validated Pool: ${pool}`);

  if (roll) {
    const diceStr = roll.dice_string
      || (Array.isArray(roll.dice) ? '[' + roll.dice.join(', ') + ']' : '');
    const successes = roll.successes ?? 0;
    const plural = successes !== 1 ? 'es' : '';
    const exc = roll.exceptional ? ', Exceptional' : '';
    lines.push(`Roll Result: ${successes} success${plural}${exc}${diceStr ? ' \u2014 Dice: ' + diceStr : ''}`);
  }

  if (notes.length) {
    lines.push('');
    lines.push('ST Notes:');
    for (const note of notes) {
      lines.push(`- ${note.author_name || 'ST'}: ${note.text || ''}`);
    }
  }

  lines.push('');
  lines.push('Write a narrative response (2\u20134 paragraphs) describing what happened during this action from the Storyteller\u2019s perspective.');
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

  const meritActions = sub?.merit_actions_resolved || [];
  const hasCategory = (cats) => meritActions.some(a => cats.includes(a.meritCategory));

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
    case 'letter_from_home':  return renderLetterFromHome(char, sub, stNarrative);
    case 'touchstone':        return renderTouchstone(char, sub, stNarrative);
    case 'project_responses': return renderProjectSection(char, sub);
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
  const poolRoll = [pool ? `Pool: ${pool}` : '', rollSummary ? `Roll: ${rollSummary}` : ''].filter(Boolean).join(' \u2502 ');
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
