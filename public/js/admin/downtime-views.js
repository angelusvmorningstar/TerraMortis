/**
 * Downtime domain views — admin app.
 * CSV upload, cycle management, submission overview, character bridge, feeding rolls.
 */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { parseDowntimeCSV } from '../downtime/parser.js';
import { getCycles, getActiveCycle, createCycle, updateCycle, closeCycle, getSubmissionsForCycle, upsertCycle, updateSubmission } from '../downtime/db.js';
import { TERRITORY_DATA, AMBIENCE_CAP, FEEDING_TERRITORIES, FEED_METHODS as FEED_METHODS_DATA } from '../player/downtime-data.js';
import { rollPool } from '../downtime/roller.js';
import { getAttrVal, getSkillObj, skDots } from '../data/accessors.js';
import { displayName } from '../data/helpers.js';
import { SKILLS_MENTAL, ALL_ATTRS, ALL_SKILLS, SKILL_CATS } from '../data/constants.js';
import { showRollModal } from '../downtime/roller.js';

let submissions = [];
let characters = [];
let charMap = new Map();
let allCycles = [];
let activeCycle = null;
let selectedCycleId = null;
let expandedId = null;

export async function initDowntimeView() {
  const container = document.getElementById('downtime-content');
  if (!container) return;

  container.innerHTML = buildShell();

  document.getElementById('dt-file-input').addEventListener('change', handleFileSelect);
  document.getElementById('dt-drop-zone').addEventListener('dragover', e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); });
  document.getElementById('dt-drop-zone').addEventListener('dragleave', e => { e.currentTarget.classList.remove('drag-over'); });
  document.getElementById('dt-drop-zone').addEventListener('drop', handleDrop);
  document.getElementById('dt-new-cycle').addEventListener('click', handleNewCycle);
  document.getElementById('dt-close-cycle').addEventListener('click', handleCloseCycle);
  document.getElementById('dt-cycle-sel').addEventListener('change', e => {
    selectedCycleId = e.target.value;
    loadCycleById(selectedCycleId);
  });
  await loadCharacters();
  await loadAllCycles();
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
    </div>
    <div id="dt-cycle-bar" class="dt-cycle-bar">
      <select id="dt-cycle-sel" class="dt-cycle-sel"></select>
      <span id="dt-cycle-status" class="dt-cycle-status"></span>
    </div>
    <div id="dt-regency-bar"></div>
    <div id="dt-warnings" class="dt-warnings"></div>
    <div id="dt-match-summary"></div>
    <div id="dt-feeding-scene"></div>
    <div id="dt-matrix"></div>
    <div id="dt-conflicts"></div>
    <div id="dt-investigations"></div>
    <div id="dt-npcs"></div>
    <div id="dt-submissions" class="dt-submissions"></div>`;
}

// ── Character data bridge ───────────────────────────────────────────────────

async function loadCharacters() {
  try {
    characters = await apiGet('/api/characters');
    charMap = new Map(characters.map(c => [(c.name || '').toLowerCase().trim(), c]));
  } catch {
    characters = [];
    charMap = new Map();
  }
}

export function findCharacter(submissionName) {
  if (!submissionName) return null;
  return charMap.get(submissionName.toLowerCase().trim()) || null;
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

function renderRegencyBar(cycle, isActive) {
  const el = document.getElementById('dt-regency-bar');
  if (!el) return;

  const currentId = cycle.regency_character_id ? String(cycle.regency_character_id) : '';
  const currentName = cycle.regency_character_name || '';

  if (!isActive) {
    // Closed cycle — read-only display
    el.innerHTML = currentName
      ? `<div class="dt-regency-bar"><span class="dt-regency-label">Regent</span><span class="dt-regency-confirmed">\u2713 ${esc(currentName)}</span></div>`
      : `<div class="dt-regency-bar"><span class="dt-regency-label">Regent</span><span class="dt-regency-none">Not recorded</span></div>`;
    return;
  }

  // Active cycle — editable dropdown
  const activeChars = characters.filter(c => !c.retired);
  let opts = '<option value="">— None —</option>';
  for (const c of activeChars) {
    const id = String(c._id);
    const name = esc(displayName(c));
    opts += `<option value="${id}"${id === currentId ? ' selected' : ''}>${name}</option>`;
  }

  el.innerHTML = `<div class="dt-regency-bar">` +
    `<span class="dt-regency-label">Regent</span>` +
    `<select id="dt-regent-sel" class="dt-regent-sel">${opts}</select>` +
    `<button class="dt-btn dt-btn-sm" id="dt-regent-save">Save</button>` +
    (currentName ? `<span class="dt-regency-confirmed">\u2713 ${esc(currentName)}</span>` : '') +
    `</div>`;

  document.getElementById('dt-regent-save').addEventListener('click', async () => {
    const sel = document.getElementById('dt-regent-sel');
    const chosenId = sel.value;
    const chosenChar = characters.find(c => String(c._id) === chosenId) || null;
    const chosenName = chosenChar ? displayName(chosenChar) : '';
    await updateCycle(cycle._id, {
      regency_character_id: chosenId || null,
      regency_character_name: chosenName || null,
    });
    // Update local cache and re-render bar
    const idx = allCycles.findIndex(c => c._id === cycle._id);
    if (idx >= 0) {
      allCycles[idx].regency_character_id = chosenId || null;
      allCycles[idx].regency_character_name = chosenName || null;
    }
    renderRegencyBar({ ...cycle, regency_character_id: chosenId, regency_character_name: chosenName }, true);
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

  const isActive = cycle.status === 'active';
  const deadlineStr = cycle.deadline_at
    ? new Date(cycle.deadline_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : null;
  const deadlinePast = cycle.deadline_at && new Date(cycle.deadline_at) < new Date();
  let statusHtml = `<span class="dt-status-badge dt-status-${isActive ? 'pending' : 'approved'}">${isActive ? 'active' : 'closed'}</span>` +
    `<span class="domain-count">${cycle.submission_count || 0} submissions</span>`;
  if (deadlineStr) {
    statusHtml += `<span class="dt-deadline${deadlinePast ? ' dt-deadline-past' : ''}">Deadline: ${esc(deadlineStr)}</span>`;
  }
  if (isActive) {
    const dtVal = cycle.deadline_at ? cycle.deadline_at.slice(0, 16) : '';
    statusHtml += `<label class="dt-deadline-edit"><span>Set deadline</span><input type="datetime-local" class="dt-deadline-input" id="dt-deadline-input" value="${esc(dtVal)}"></label>`;
  }
  if (!isActive) {
    const alreadyApplied = cycle.ambience_applied;
    statusHtml += `<button class="dt-btn" id="dt-apply-ambience" style="${alreadyApplied ? 'opacity:.5' : ''}" title="${alreadyApplied ? 'Ambience already applied for this cycle' : 'Apply ambience changes from this cycle\'s resolved projects'}">
      ${alreadyApplied ? '\u2713 Ambience applied' : 'Apply Ambience Changes'}
    </button>`;
  }
  statusEl.innerHTML = statusHtml;
  closeBtn.style.display = isActive ? '' : 'none';

  // ── Regency bar (GC-1) ──
  renderRegencyBar(cycle, isActive);

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

  expandedId = null;
  submissions = await getSubmissionsForCycle(cycleId);
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

  const matched = submissions.filter(s => findCharacter(s.character_name));
  const unmatched = submissions.filter(s => !findCharacter(s.character_name));
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

    const char = findCharacter(s.character_name);
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
      h += renderFeedingDetail(s, raw, char);
      h += renderProjectsPanel(s, raw, char);
      h += renderMeritActionsPanel(s, raw, char);
      h += renderNarrativePanel(s);
      h += renderMechanicalSummaryPanel(s);
      h += renderStNotes(s, raw);
      h += renderApproval(s);
      h += renderPublishPanel(s);
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
      const char = sub ? findCharacter(sub.character_name) : null;
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
      const char = sub ? findCharacter(sub.character_name) : null;
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

  // Roll button delegation
  el.querySelectorAll('.dt-feed-roll-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.subId;
      const sub = submissions.find(s => s._id === id);
      const char = sub ? findCharacter(sub.character_name) : null;

      let poolSize;
      if (char && sub._feed_method) {
        const pool = buildFeedingPool(char, sub._feed_method, 0);
        poolSize = pool ? pool.total : 1;
      } else {
        const input = btn.closest('.dt-feed-detail')?.querySelector('.dt-pool-input');
        poolSize = input ? parseInt(input.value) || 1 : 1;
      }
      handleFeedingRoll(id, poolSize);
    });
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
      const pool = buildFeedingPool(char, selectedMethod, 0);
      if (pool) {
        const bd = pool.breakdown;
        h += '<div class="dt-feed-row"><span class="dt-feed-lbl">Pool</span>';
        h += `<span class="dt-pool-breakdown">${bd.attrVal} ${esc(bd.attr)} + ${bd.skillVal} ${esc(bd.skill)}`;
        if (bd.fg) h += ` + ${bd.fg} FG`;
        if (bd.unskilled) h += ` \u2212 ${Math.abs(bd.unskilled)} (unskilled)`;
        h += ` = <b>${pool.total}</b></span></div>`;
      }
    }
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

// ── Feeding rolls ───────────────────────────────────────────────────────────

async function handleFeedingRoll(subId, poolSize) {
  const result = rollPool(poolSize);
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  try {
    await updateSubmission(subId, { feeding_roll: result });
    sub.feeding_roll = result;
    renderMatchSummary();
    renderSubmissions();
  } catch (err) {
    console.error('Failed to save feeding roll:', err.message);
  }
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

  // Enrich each parsed submission with character_id (needed for player-side filtering)
  for (const sub of parsed) {
    const char = findCharacter(sub.submission.character_name);
    if (char) sub._character_id = char._id;
  }

  try {
    const result = await upsertCycle(parsed, file.name.replace('.csv', ''));
    warnEl.innerHTML = `<div class="dt-success">Loaded ${result.created} new, ${result.updated} updated submissions.</div>`;
    await loadAllCycles();
  } catch (err) {
    warnEl.innerHTML += `<div class="dt-warn">Import failed: ${esc(err.message)}</div>`;
    console.error('Downtime CSV import failed:', err);
  }
}

async function handleNewCycle() {
  const label = prompt('Cycle label (e.g. "March 2026"):');
  if (!label) return;

  // Batch-publish all submissions marked ready before the new cycle goes live
  const readySubs = submissions.filter(s => s.st_review?.outcome_visibility === 'ready');
  if (readySubs.length) {
    const pubAt = new Date().toISOString();
    await Promise.all(readySubs.map(sub =>
      updateSubmission(sub._id, {
        'st_review.outcome_visibility': 'published',
        'st_review.published_at': pubAt,
      }).catch(err => console.error('Publish failed for', sub.character_name, err.message))
    ));
  }

  await createCycle(label);
  await loadAllCycles();
}

async function handleCloseCycle() {
  if (!selectedCycleId) return;
  const cycle = allCycles.find(c => c._id === selectedCycleId);
  if (!cycle || cycle.status !== 'active') return;
  if (!confirm(`Close cycle "${cycle.label || 'Unnamed'}"? This cannot be undone.`)) return;
  await closeCycle(selectedCycleId);
  await loadAllCycles();
}

function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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

/** Look up ambience string for a territory display name. */
function getTerritoryAmbienceByName(terrName) {
  if (!terrName) return null;
  // TERRITORY_DATA names may differ slightly from FEEDING_TERRITORIES labels
  const td = TERRITORY_DATA.find(t =>
    terrName.toLowerCase().includes(t.name.toLowerCase().replace(/^the\s+/i, '')) ||
    t.name.toLowerCase().includes(terrName.toLowerCase().replace(/^the\s+/i, ''))
  );
  return td?.ambience || null;
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
    const char = findCharacter(s.character_name);
    if (char) subByCharId.set(String(char._id), s);
  }

  const isOpen = el.dataset.open !== 'false';
  const sorted = [...activeChars].sort((a, b) => (displayName(a)).localeCompare(displayName(b)));

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
      const ambience = getTerritoryAmbienceByName(territory);

      // Pool
      let poolTotal = '—';
      let poolNote = '';
      if (hasSub && methodId && methodObj) {
        const pool = buildFeedingPool(char, methodId, 0);
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
      h += `<td>${ambience ? `<span class="dt-scene-amb">${esc(ambience)}</span>` : '<span class="dt-scene-dim">\u2014</span>'}</td>`;
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
  const discVal = (discName && char?.disciplines?.[discName]) || 0;
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
    if (v > 0) h += `<option value="${esc(d)}">${esc(d)} (${v})</option>`;
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
  const projects = raw.projects || [];
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
    h += `<span class="dt-proj-type">${esc(proj.action_type)}</span>`;
    h += isResolved
      ? ` <span class="dt-proj-done-badge">\u2713 Resolved</span>`
      : ` <span class="dt-proj-pending-badge">\u26A0 Unresolved</span>`;
    h += '</div>';

    if (proj.desired_outcome) h += `<div class="dt-proj-outcome"><em>Desired:</em> ${esc(proj.desired_outcome)}</div>`;
    if (proj.description) h += `<div class="dt-proj-desc">${esc(proj.description)}</div>`;

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
