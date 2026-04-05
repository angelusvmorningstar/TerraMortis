/**
 * Ordeals domain — admin app.
 * OR-2: Marking UI — review and mark ordeal submissions against rubric.
 * OR-3: Rubric Editor — edit expected answers and marking notes per question.
 */

import { apiGet, apiPut } from '../data/api.js';
import { displayName } from '../data/helpers.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

const ORDEAL_LABELS = {
  lore_mastery:           'Lore Mastery',
  rules_mastery:          'Rules Mastery',
  covenant_questionnaire: 'Covenant Questionnaire',
  character_history:      'Character History',
};

const ORDEAL_TYPES = Object.keys(ORDEAL_LABELS);

const STATUS_LABELS = {
  unmarked:    'Unmarked',
  in_progress: 'In Progress',
  complete:    'Complete',
};

let submissions  = [];  // all ordeal_submissions
let rubrics      = [];  // all ordeal_rubrics docs
let characters   = [];  // passed-in char array
let activeType   = 'all';
let activeSubId  = null;
let activeView   = 'marking'; // 'marking' | 'rubric'
let pendingAnswers = {}; // { [subId]: { [idx]: { result, feedback } } }
let pendingOverall = {}; // { [subId]: overallFeedback }

export async function initOrdealsAdminView(chars) {
  characters = chars || [];
  const container = document.getElementById('ordeals-content');
  if (!container) return;

  container.innerHTML = '<p class="placeholder">Loading ordeals\u2026</p>';

  try {
    [submissions, rubrics] = await Promise.all([
      apiGet('/api/ordeal_submissions'),
      apiGet('/api/ordeal_rubrics'),
    ]);
  } catch (err) {
    container.innerHTML = `<p class="placeholder">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  pendingAnswers = {};
  pendingOverall = {};
  activeSubId = null;

  render(container);
}

// ── Render ───────────────────────────────────────────────────────────────────

function render(container) {
  container = container || document.getElementById('ordeals-content');
  if (!container) return;

  let h = '<div class="or-shell">';

  // ── View toggle (Marking / Rubric) ──
  h += '<div class="or-view-toggle">';
  h += `<button class="or-toggle-btn${activeView === 'marking' ? ' on' : ''}" data-view="marking">Marking</button>`;
  h += `<button class="or-toggle-btn${activeView === 'rubric' ? ' on' : ''}" data-view="rubric">Rubric Editor</button>`;
  h += '</div>';

  if (activeView === 'marking') {
    h += renderMarkingView();
  } else {
    h += renderRubricView();
  }

  h += '</div>';
  container.innerHTML = h;
  bindEvents(container);
}

// ── Marking View ─────────────────────────────────────────────────────────────

function renderMarkingView() {
  let h = '<div class="or-marking-shell">';
  h += renderLeft();
  h += renderRight();
  h += '</div>';
  return h;
}

function renderLeft() {
  // Type filter tabs
  const visible = activeType === 'all'
    ? submissions
    : submissions.filter(s => s.ordeal_type === activeType);

  const sorted = [...visible].sort((a, b) => {
    const nameA = charNameForSub(a);
    const nameB = charNameForSub(b);
    if (a.ordeal_type !== b.ordeal_type) return a.ordeal_type.localeCompare(b.ordeal_type);
    return nameA.localeCompare(nameB);
  });

  let h = '<div class="or-left">';

  // Type tabs
  h += '<div class="or-type-tabs">';
  h += tabBtn('all', 'All');
  for (const t of ORDEAL_TYPES) h += tabBtn(t, ORDEAL_LABELS[t]);
  h += '</div>';

  // Summary counts
  const total    = submissions.length;
  const complete = submissions.filter(s => s.marking?.status === 'complete').length;
  const pending  = total - complete;
  h += `<div class="or-list-summary"><span>${total} submissions</span><span class="or-complete-count">${complete} marked</span>${pending ? `<span class="or-pending-count">${pending} pending</span>` : ''}</div>`;

  // Submission list
  h += '<div class="or-list">';
  if (!sorted.length) {
    h += '<p class="placeholder">No submissions found.</p>';
  } else {
    let lastType = null;
    for (const sub of sorted) {
      if (activeType === 'all' && sub.ordeal_type !== lastType) {
        h += `<div class="or-list-heading">${esc(ORDEAL_LABELS[sub.ordeal_type] || sub.ordeal_type)}</div>`;
        lastType = sub.ordeal_type;
      }
      const status = sub.marking?.status || 'unmarked';
      const isActive = sub._id === activeSubId;
      h += `<div class="or-list-item${isActive ? ' active' : ''} or-status-${status}" data-sub-id="${esc(sub._id)}">
        <span class="or-list-name">${esc(charNameForSub(sub))}</span>
        <span class="or-status-badge or-status-${status}">${esc(STATUS_LABELS[status] || status)}</span>
      </div>`;
    }
  }
  h += '</div>';
  h += '</div>';
  return h;
}

function tabBtn(type, label) {
  const count = type === 'all'
    ? submissions.length
    : submissions.filter(s => s.ordeal_type === type).length;
  return `<button class="or-tab-btn${activeType === type ? ' on' : ''}" data-type="${esc(type)}">${esc(label)} <span class="or-tab-count">${count}</span></button>`;
}

function renderRight() {
  let h = '<div class="or-right">';
  if (!activeSubId) {
    h += '<p class="or-placeholder">Select a submission to review.</p>';
    h += '</div>';
    return h;
  }

  const sub = submissions.find(s => s._id === activeSubId);
  if (!sub) { h += '<p class="or-placeholder">Submission not found.</p></div>'; return h; }

  const char    = characters.find(c => String(c._id) === String(sub.character_id));
  const charName = char ? displayName(char) : (sub.character_name || 'Unknown');
  const typeLabel = ORDEAL_LABELS[sub.ordeal_type] || sub.ordeal_type;
  const status  = sub.marking?.status || 'unmarked';
  const isComplete = status === 'complete';

  // Find matching rubric
  const rubric = rubrics.find(r =>
    r.ordeal_type === sub.ordeal_type &&
    (sub.ordeal_type !== 'covenant_questionnaire' || r.covenant === sub.covenant || !r.covenant)
  );
  const rubricQs = rubric?.questions || [];

  h += `<div class="or-detail-header">`;
  h += `<div class="or-detail-title"><span class="or-detail-char">${esc(charName)}</span> <span class="or-detail-type">${esc(typeLabel)}</span></div>`;
  if (char) {
    const meta = [char.clan, char.covenant].filter(Boolean).join(' \u00B7 ');
    if (meta) h += `<div class="or-detail-meta">${esc(meta)}</div>`;
  }
  h += `<span class="or-status-badge or-status-${status}">${esc(STATUS_LABELS[status] || status)}</span>`;
  if (isComplete && sub.marking?.marked_at) {
    const d = new Date(sub.marking.marked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    h += `<span class="or-marked-at">Marked ${esc(d)}</span>`;
  }
  h += '</div>';

  // Q&A table
  const responses = sub.responses || [];
  const savedAnswers  = sub.marking?.answers || [];
  const pending       = pendingAnswers[sub._id] || {};

  h += '<div class="or-qa-table">';
  h += '<div class="or-qa-head"><span>Question</span><span>Player Answer</span><span>Expected Answer</span></div>';

  responses.forEach((row, i) => {
    const saved     = savedAnswers.find(a => a.question_index === i) || {};
    const pend      = pending[i] || {};
    const result    = pend.result    !== undefined ? pend.result    : saved.result    || null;
    const feedback  = pend.feedback  !== undefined ? pend.feedback  : saved.feedback  || '';
    const rubricQ   = rubricQs.find(q => q.index === i);
    const expected  = rubricQ?.expected_answer || '';
    const isPlaceholder = expected.startsWith('[PLACEHOLDER');

    h += `<div class="or-qa-row${result ? ' or-result-' + result : ''}">`;
    h += `<div class="or-qa-cell or-qa-question">${esc(row.question)}</div>`;
    h += `<div class="or-qa-cell or-qa-answer">${esc(row.answer || '(no answer)')}</div>`;
    h += `<div class="or-qa-cell or-qa-expected${isPlaceholder ? ' or-placeholder-text' : ''}">${esc(expected || '\u2014')}</div>`;

    if (!isComplete) {
      h += `<div class="or-qa-mark-row">`;
      h += `<div class="or-ync-btns" data-sub-id="${esc(sub._id)}" data-idx="${i}">`;
      for (const [val, label] of [['yes', 'Yes'], ['close', 'Close'], ['no', 'No']]) {
        h += `<button class="or-ync-btn${result === val ? ' active' : ''}" data-result="${val}">${label}</button>`;
      }
      h += '</div>';
      h += `<textarea class="or-feedback-input" data-sub-id="${esc(sub._id)}" data-idx="${i}" placeholder="Per-answer feedback (optional)\u2026" rows="2">${esc(feedback)}</textarea>`;
      h += '</div>';
    } else {
      if (feedback) h += `<div class="or-qa-saved-feedback">${esc(feedback)}</div>`;
    }

    h += '</div>';
  });
  h += '</div>';

  // Overall feedback
  const savedOverall  = sub.marking?.overall_feedback || '';
  const pendOverall   = pendingOverall[sub._id] !== undefined ? pendingOverall[sub._id] : savedOverall;

  h += '<div class="or-overall-section">';
  h += '<div class="or-overall-label">Overall feedback</div>';
  if (!isComplete) {
    h += `<textarea class="or-overall-input" data-sub-id="${esc(sub._id)}" rows="3" placeholder="Overall comments for the player (optional)\u2026">${esc(pendOverall)}</textarea>`;
  } else {
    h += `<div class="or-overall-saved">${esc(savedOverall || '(none)')}</div>`;
  }
  h += '</div>';

  // Actions
  if (!isComplete) {
    const pendingCount = Object.keys(pending).length;
    const allAnswered  = responses.every((_, i) => {
      const p = pending[i];
      const s = savedAnswers.find(a => a.question_index === i);
      return (p?.result || s?.result);
    });

    h += '<div class="or-actions">';
    h += `<button class="dt-btn or-save-btn" data-sub-id="${esc(sub._id)}"${!pendingCount ? ' disabled' : ''}>Save Progress</button>`;
    h += `<button class="dt-btn or-complete-btn" data-sub-id="${esc(sub._id)}"${!allAnswered ? ' disabled title="Mark all questions first"' : ''}>Mark Complete</button>`;
    h += '</div>';
  }

  h += '</div>';
  return h;
}

// ── Rubric View ───────────────────────────────────────────────────────────────

function renderRubricView() {
  const filterType = activeType === 'all' ? 'lore_mastery' : activeType;
  const rubric = rubrics.find(r => r.ordeal_type === filterType);

  let h = '<div class="or-rubric-shell">';

  // Type tabs (reuse)
  h += '<div class="or-type-tabs">';
  for (const t of ORDEAL_TYPES) h += tabBtn(t, ORDEAL_LABELS[t]);
  h += '</div>';

  if (!rubric) {
    h += `<p class="placeholder">No rubric found for ${esc(ORDEAL_LABELS[filterType] || filterType)}. Run the import script to seed rubrics.</p>`;
    h += '</div>';
    return h;
  }

  h += `<div class="or-rubric-header">`;
  h += `<span class="or-rubric-type">${esc(ORDEAL_LABELS[rubric.ordeal_type] || rubric.ordeal_type)}</span>`;
  h += `<span class="or-rubric-count">${rubric.questions?.length || 0} questions</span>`;
  h += '</div>';

  h += '<div class="or-rubric-list">';
  for (const q of (rubric.questions || [])) {
    const isPlaceholder = (q.expected_answer || '').startsWith('[PLACEHOLDER');
    h += `<div class="or-rubric-row${isPlaceholder ? ' or-rubric-unfilled' : ''}" data-rubric-id="${esc(rubric._id)}" data-q-idx="${q.index}">`;
    h += `<div class="or-rubric-q">${esc(q.question)}</div>`;
    h += `<div class="or-rubric-fields">`;
    h += `<label class="or-rubric-label">Expected answer
      <textarea class="or-rubric-expected" data-rubric-id="${esc(rubric._id)}" data-q-idx="${q.index}" rows="3">${esc(q.expected_answer || '')}</textarea>
    </label>`;
    h += `<label class="or-rubric-label">Marking notes (ST only)
      <textarea class="or-rubric-notes" data-rubric-id="${esc(rubric._id)}" data-q-idx="${q.index}" rows="2">${esc(q.marking_notes || '')}</textarea>
    </label>`;
    h += '</div>';
    h += `<button class="dt-btn or-rubric-save-btn" data-rubric-id="${esc(rubric._id)}" data-q-idx="${q.index}">Save</button>`;
    h += '</div>';
  }
  h += '</div>';
  h += '</div>';
  return h;
}

// ── Event binding ─────────────────────────────────────────────────────────────

function bindEvents(container) {
  // View toggle
  container.querySelectorAll('.or-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeView = btn.dataset.view;
      render();
    });
  });

  // Type filter tabs
  container.querySelectorAll('.or-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeType = btn.dataset.type;
      if (activeView === 'marking') activeSubId = null;
      render();
    });
  });

  // Submission list item click
  container.querySelectorAll('.or-list-item').forEach(item => {
    item.addEventListener('click', () => {
      activeSubId = item.dataset.subId;
      render();
    });
  });

  // Yes/Close/No buttons
  container.querySelectorAll('.or-ync-btns').forEach(group => {
    group.querySelectorAll('.or-ync-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const subId = group.dataset.subId;
        const idx   = +group.dataset.idx;
        if (!pendingAnswers[subId]) pendingAnswers[subId] = {};
        // Get current feedback from textarea
        const ta = container.querySelector(`.or-feedback-input[data-sub-id="${subId}"][data-idx="${idx}"]`);
        const fb = ta ? ta.value : (pendingAnswers[subId][idx]?.feedback || '');
        pendingAnswers[subId][idx] = { result: btn.dataset.result, feedback: fb };
        render();
      });
    });
  });

  // Per-answer feedback (capture on input to preserve across re-renders)
  container.querySelectorAll('.or-feedback-input').forEach(ta => {
    ta.addEventListener('input', () => {
      const subId = ta.dataset.subId;
      const idx   = +ta.dataset.idx;
      if (!pendingAnswers[subId]) pendingAnswers[subId] = {};
      if (!pendingAnswers[subId][idx]) pendingAnswers[subId][idx] = {};
      pendingAnswers[subId][idx].feedback = ta.value;
    });
  });

  // Overall feedback
  container.querySelectorAll('.or-overall-input').forEach(ta => {
    ta.addEventListener('input', () => {
      pendingOverall[ta.dataset.subId] = ta.value;
    });
  });

  // Save Progress
  container.querySelectorAll('.or-save-btn').forEach(btn => {
    btn.addEventListener('click', () => handleSave(btn.dataset.subId, false));
  });

  // Mark Complete
  container.querySelectorAll('.or-complete-btn').forEach(btn => {
    btn.addEventListener('click', () => handleSave(btn.dataset.subId, true));
  });

  // Rubric save buttons
  container.querySelectorAll('.or-rubric-save-btn').forEach(btn => {
    btn.addEventListener('click', () => handleRubricSave(btn.dataset.rubricId, +btn.dataset.qIdx));
  });
}

// ── Save logic ────────────────────────────────────────────────────────────────

async function handleSave(subId, markComplete) {
  const sub = submissions.find(s => s._id === subId);
  if (!sub) return;

  const pend = pendingAnswers[subId] || {};

  // Merge pending into saved answers
  const existing = [...(sub.marking?.answers || [])];
  for (const [idxStr, val] of Object.entries(pend)) {
    const idx = +idxStr;
    const pos = existing.findIndex(a => a.question_index === idx);
    if (pos >= 0) {
      existing[pos] = { question_index: idx, result: val.result, feedback: val.feedback || '' };
    } else {
      existing.push({ question_index: idx, result: val.result, feedback: val.feedback || '' });
    }
  }

  const overall = pendingOverall[subId] !== undefined
    ? pendingOverall[subId]
    : (sub.marking?.overall_feedback || '');

  const updates = {
    marking: {
      ...(sub.marking || {}),
      status:           markComplete ? 'complete' : (existing.length ? 'in_progress' : 'unmarked'),
      overall_feedback: overall,
      answers:          existing,
    },
  };

  try {
    const updated = await apiPut('/api/ordeal_submissions/' + subId, updates);
    const idx = submissions.findIndex(s => s._id === subId);
    if (idx >= 0) submissions[idx] = updated;
    delete pendingAnswers[subId];
    delete pendingOverall[subId];
    render();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

async function handleRubricSave(rubricId, qIdx) {
  const rubric = rubrics.find(r => String(r._id) === rubricId);
  if (!rubric) return;

  const expectedEl = document.querySelector(`.or-rubric-expected[data-rubric-id="${rubricId}"][data-q-idx="${qIdx}"]`);
  const notesEl    = document.querySelector(`.or-rubric-notes[data-rubric-id="${rubricId}"][data-q-idx="${qIdx}"]`);
  if (!expectedEl) return;

  const questions = rubric.questions.map(q =>
    q.index === qIdx
      ? { ...q, expected_answer: expectedEl.value, marking_notes: notesEl?.value || q.marking_notes }
      : q
  );

  try {
    const updated = await apiPut('/api/ordeal_rubrics/' + rubricId, { questions });
    const idx = rubrics.findIndex(r => String(r._id) === rubricId);
    if (idx >= 0) rubrics[idx] = updated;
    render();
  } catch (err) {
    alert('Rubric save failed: ' + err.message);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function charNameForSub(sub) {
  const char = characters.find(c => String(c._id) === String(sub.character_id));
  return char ? displayName(char) : (sub.character_name || 'Unknown');
}
