/**
 * downtime-story.js — DT Story tab module.
 *
 * Handles all narrative authoring, prompt generation, and sign-off work
 * for a downtime cycle. Zero imports from downtime-views.js.
 *
 * Exports:
 *   initDtStory(cycleId)           — called by admin.js on first DT Story tab click
 *   saveNarrativeField(id, patch)  — called by all B stories to persist st_narrative fields
 */

import { apiGet, apiPut } from '../data/api.js';
import { displayName } from '../data/helpers.js';

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

  // Event delegation — sign-off button
  panel.addEventListener('click', e => {
    const btn = e.target.closest('.dt-story-sign-off-btn');
    if (!btn || btn.disabled) return;
    handleSignOff(btn);
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
 * For array-typed sections and special approval sections, B4–B7 supplement
 * this with section-specific logic; here it provides the base contract.
 */
export function isSectionComplete(stNarrative, sectionKey) {
  return stNarrative?.[sectionKey]?.status === 'complete';
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
    case 'project_responses': {
      const rsp = stNarrative.project_responses || [];
      const count = sub?.projects_resolved?.length || 0;
      return count > 0 && rsp.length >= count && rsp.every(r => r.status === 'complete');
    }
    case 'resource_approvals': {
      const approvals = stNarrative.resource_approvals || [];
      return approvals.length > 0 && approvals.every(r => r.approved === true);
    }
    case 'cacophony_savvy': {
      const cs = stNarrative.cacophony_savvy || [];
      return cs.length > 0 && cs.every(r => r.status === 'complete');
    }
    // action_responses sections: check if any entries exist and all are complete
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

// ── Character lookup ──────────────────────────────────────────────────────────

function getCharForSub(sub) {
  if (!sub) return null;
  return _allCharacters.find(c =>
    c._id === sub.character_id || c.name === sub.character_name
  ) || null;
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
    { key: 'letter_from_home', label: 'Letter from Home' },
    { key: 'touchstone',       label: 'Touchstone' },
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

  if (hasCategory(['allies']))            sections.push({ key: 'allies_actions',   label: 'Allies Actions' });
  if (hasCategory(['status']))            sections.push({ key: 'status_actions',   label: 'Status Actions' });
  if (hasCategory(['retainer', 'staff'])) sections.push({ key: 'retainer_actions', label: 'Retainer Actions' });
  if (hasCategory(['contacts']))          sections.push({ key: 'contact_requests', label: 'Contact Requests' });
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
    const name = char ? displayName(char) : (sub.character_name || 'Unknown');
    const state = getNavPillState(sub);
    const stateClass = state ? ` ${state}` : '';
    const charId = sub.character_id || sub._id;
    h += `<button class="dt-story-pill${stateClass}" data-char-id="${charId}" data-sub-id="${sub._id}">`;
    h += name;
    if (state) {
      h += `<span class="dt-story-pill-dot"></span>`;
    }
    h += `</button>`;
  }
  return h;
}

// ── Character selection ───────────────────────────────────────────────────────

function selectCharacter(charId) {
  _currentCharId = charId;
  _currentSub = _allSubmissions.find(s => s.character_id === charId || s._id === charId) || null;

  // Update pill active state
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
  h += `<h3 class="dt-story-char-name">${char ? displayName(char) : (sub?.character_name || 'Unknown')}</h3>`;
  if (stNarrative?.locked) {
    h += `<span class="dt-story-locked-badge">Locked</span>`;
  }
  h += `</div>`;

  for (const section of sections) {
    h += renderSectionScaffold(section.key, section.label, stNarrative);
  }

  h += renderSignOffPanel(stNarrative, sections, sub);
  return h;
}

// ── Section scaffold ──────────────────────────────────────────────────────────

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

// ── Sign-off handler ──────────────────────────────────────────────────────────

async function handleSignOff(btn) {
  if (!_currentSub) return;
  btn.disabled = true;
  btn.textContent = 'Saving\u2026';
  try {
    await saveNarrativeField(_currentSub._id, { 'st_narrative.locked': true });
    // Update local cache
    _currentSub.st_narrative = { ...(_currentSub.st_narrative || {}), locked: true };
    // Re-render character view
    const char = getCharForSub(_currentSub);
    const view = document.getElementById('dt-story-char-view');
    if (view) view.innerHTML = renderCharacterView(char, _currentSub);
    // Refresh nav rail pill state
    const rail = document.getElementById('dt-story-nav-rail');
    if (rail) rail.innerHTML = renderNavRail();
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Mark all complete';
    console.error('Sign-off failed:', err);
  }
}
