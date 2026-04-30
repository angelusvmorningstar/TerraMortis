/* Story tab — two-pane layout.
 * Left: Chronicle — published downtime narratives, reverse-chronological.
 * Right: Documents — Dossier (character profile from questionnaire) + future static docs.
 */

import { apiGet, apiPost, apiPut, apiPatch } from '../data/api.js';
import { esc, parseOutcomeSections, displayName, clanIcon, covIcon } from '../data/helpers.js';
import { isSTRole, getPlayerInfo } from '../auth/discord.js';
import { compilePushOutcome } from '../admin/downtime-story.js';

// DTSR-4: chronicle context for inline ST edit on historical cycles. Set by
// renderStoryTab on each render so click handlers can locate the active sub
// and re-render the affected entry after a save.
let _chronicleCtx = null; // { char, subs, cycleStatusMap }

const ACTION_TYPE_LABELS = {
  ambience_increase: 'Ambience Increase', ambience_decrease: 'Ambience Decrease',
  attack: 'Attack', feed: 'Feed', hide_protect: 'Hide / Protect',
  investigate: 'Investigate', patrol_scout: 'Patrol / Scout',
  support: 'Support', misc: 'Miscellaneous', maintenance: 'Maintenance',
  xp_spend: 'XP Spend', block: 'Block', rumour: 'Rumour',
  grow: 'Grow', acquisition: 'Acquisition',
};

/**
 * Fetches and renders only the most recent published DT report for a character.
 * Used by the game app (index.html) Downtime tab.
 */
export async function renderLatestReport(el, char) {
  el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';
  let subs = [], cycles = [];
  try {
    [subs, cycles] = await Promise.all([
      apiGet('/api/downtime_submissions'),
      apiGet('/api/downtime_cycles'),
    ]);
    subs.forEach(s => {
      if (!s.published_outcome && s.st_review?.outcome_visibility === 'published') {
        s.published_outcome = s.st_review.outcome_text;
      }
    });
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  const cycleMap = {};
  for (const c of cycles) cycleMap[String(c._id)] = c;

  const charId = String(char._id);
  const published = subs
    .filter(s => String(s.character_id) === charId && s.published_outcome)
    .sort((a, b) => {
      const ga = cycleMap[String(a.cycle_id)]?.game_number ?? 0;
      const gb = cycleMap[String(b.cycle_id)]?.game_number ?? 0;
      return gb - ga;
    });

  if (!published.length) {
    el.innerHTML = '<p class="placeholder-msg">No published downtime narratives yet.</p>';
    return;
  }

  const sub = published[0];
  const cycleLabel = cycleMap[String(sub.cycle_id)]?.label || `Cycle ${String(sub.cycle_id).slice(-4)}`;
  let h = '<div class="story-feed">';
  h += `<div class="story-entry">`;
  h += `<div class="story-cycle-label">${esc(cycleLabel)}</div>`;
  h += renderOutcomeWithCards(sub);
  h += `</div></div>`;
  el.innerHTML = h;
}

export async function renderStoryTab(el, char) {
  el.innerHTML = '<p class="placeholder-msg">Loading...</p>';

  let subs = [], cycles = [], questResponse = null, historyDoc = null;
  try {
    [subs, cycles] = await Promise.all([
      apiGet('/api/downtime_submissions'),
      apiGet('/api/downtime_cycles'),
    ]);
    // STs receive raw docs; promote st_review → published_outcome so ST portal view matches player view
    subs.forEach(s => {
      if (!s.published_outcome && s.st_review?.outcome_visibility === 'published') {
        s.published_outcome = s.st_review.outcome_text;
      }
    });
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  try {
    [questResponse, historyDoc] = await Promise.all([
      apiGet(`/api/questionnaire?character_id=${char._id}`).catch(() => null),
      apiGet(`/api/history?character_id=${char._id}`).catch(() => null),
    ]);
  } catch { /* non-fatal */ }

  // DTSR-4: stash subs/char/cycleStatusMap so chronicle click handlers can find
  // the active sub, persist edits, and re-render the affected entry in place.
  const cycleStatusMap = {};
  for (const c of cycles) cycleStatusMap[String(c._id)] = c.status || '';
  _chronicleCtx = { char, subs, cycleStatusMap };

  // Doc card toggle + DTSR-4 chronicle edit affordances.
  // Single onclick to prevent duplicate listeners on re-render.
  el.onclick = e => {
    const toggle = e.target.closest('.doc-card-toggle');
    if (toggle) {
      const card = toggle.closest('.doc-card');
      const body = card?.querySelector('.doc-card-body');
      if (!body) return;
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!expanded));
      body.hidden = expanded;
      toggle.querySelector('.doc-card-chevron').textContent = expanded ? '▾' : '▴';
      return;
    }
    const editBtn = e.target.closest('.story-section-edit');
    if (editBtn) { handleSectionEditClick(editBtn); return; }
    const saveBtn = e.target.closest('.story-section-save');
    if (saveBtn) { handleSectionSave(saveBtn); return; }
    const cancelBtn = e.target.closest('.story-section-cancel');
    if (cancelBtn) { handleSectionCancel(cancelBtn); return; }
    // DTSR-8: player flag affordances
    const flagBtn = e.target.closest('.story-section-flag-btn');
    if (flagBtn) { openFlagForm(flagBtn); return; }
    const flagSubmit = e.target.closest('.story-section-flag-submit');
    if (flagSubmit) { submitFlagForm(flagSubmit); return; }
    const flagCancel = e.target.closest('.story-section-flag-cancel');
    if (flagCancel) { closeFlagForm(flagCancel); return; }
    const flagRecall = e.target.closest('.story-section-flag-recall');
    if (flagRecall) { recallFlag(flagRecall); return; }
  };

  // Auto-validate the form: enable Submit only when category chosen and
  // Other-category requires reason >= 5 chars.
  el.oninput = e => {
    const form = e.target.closest('.story-section-flag-form');
    if (!form) return;
    _refreshFlagFormSubmitState(form);
  };
  el.onchange = e => {
    const form = e.target.closest('.story-section-flag-form');
    if (!form) return;
    _refreshFlagFormSubmitState(form);
  };

  let h = '<div class="story-split">';

  // ── Left: Chronicle ─────────────────────────────────────────────
  h += '<div class="story-left">';
  h += '<h3 class="story-pane-title">Chronicle</h3>';
  h += renderChronicle(subs, cycles, char);
  h += '</div>';

  // ── Right: Documents ─────────────────────────────────────────────
  h += '<div class="story-right">';
  h += '<h3 class="story-pane-title">Documents</h3>';
  h += renderDossier(char, questResponse);
  h += renderHistoryCard(char, historyDoc?.history_text || null, historyDoc?.source || null);
  h += '</div>';

  h += '</div>';
  el.innerHTML = h;
}

// ── Chronicle ─────────────────────────────────────────────────────

function renderChronicle(subs, cycles, char) {
  const cycleMap = {};
  const cycleStatusMap = {};
  for (const c of cycles) {
    cycleMap[String(c._id)] = c;
    cycleStatusMap[String(c._id)] = c.status || '';
  }

  const charId = String(char._id);
  const published = subs
    .filter(s => String(s.character_id) === charId && s.published_outcome)
    .sort((a, b) => {
      const ga = cycleMap[String(a.cycle_id)]?.game_number ?? 0;
      const gb = cycleMap[String(b.cycle_id)]?.game_number ?? 0;
      return gb - ga;
    });

  if (!published.length) {
    return '<p class="placeholder-msg story-placeholder">No published downtime narratives yet.</p>';
  }

  const isST = isSTRole();
  let h = '<div class="story-feed">';
  for (const sub of published) {
    const cycleLabel = cycleMap[String(sub.cycle_id)]?.label || `Cycle ${String(sub.cycle_id).slice(-4)}`;
    const cycleStatus = cycleStatusMap[String(sub.cycle_id)] || '';
    // DTSR-4: ST inline edit gated to historical cycles (closed/complete only).
    const editable = isST && (cycleStatus === 'closed' || cycleStatus === 'complete');
    h += `<div class="story-entry" data-sub-id="${esc(String(sub._id))}">`;
    h += `<div class="story-cycle-label">${esc(cycleLabel)}</div>`;
    h += renderOutcomeWithCards(sub, { editable });
    h += `</div>`;
  }
  h += '</div>';
  return h;
}

/** Normalise a heading/title for fuzzy matching (lowercase, collapse non-alpha). */
function _normTitle(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// ── Six-section report wrapper ────────────────────────────────────

function _storyNarrSection(label, text, opts = {}) {
  if (!text?.trim()) return '';
  const { editable, sectionKey, sectionIdx = '', sub = null } = opts;
  let h = `<div class="story-section" data-section-key="${esc(sectionKey || '')}" data-section-idx="${esc(String(sectionIdx))}">`;
  h += '<div class="story-section-header">';
  h += `<h4 class="story-section-head">${esc(label)}</h4>`;
  if (editable && sectionKey) h += _renderEditButton();
  if (sub && sectionKey) h += renderFlagAffordance(sub, sectionKey);
  h += '</div>';
  h += '<div class="story-section-body">';
  const paras = text.trim().split(/\n{2,}/).filter(Boolean);
  h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
  h += '</div></div>';
  return h;
}

function _renderEditButton() {
  return `<button type="button" class="story-section-edit" title="Edit (ST only)">Edit</button>`;
}

// ── DTSR-8: per-section flag affordance ─────────────────────────────
// Players can flag any section of their published outcome as Inconsistent /
// Wrong story / Other. STs see the flag in the DTSR-9 inbox. Owning-player
// only — the affordance is hidden for STs and other characters' viewers.

const FLAG_CATEGORY_LABELS = {
  inconsistent: 'Inconsistent',
  wrong_story:  'Wrong story',
  other:        'Other',
};

function _myOpenFlagsFor(sub, sectionKey, sectionIdx) {
  const me = getPlayerInfo();
  const myId = me ? String(me.player_id || '') : '';
  if (!myId) return [];
  return (sub.section_flags || []).filter(f =>
    f.status === 'open' &&
    f.section_key === sectionKey &&
    (sectionIdx == null ? f.section_idx == null : Number(f.section_idx) === Number(sectionIdx)) &&
    String(f.player_id) === myId
  );
}

function renderFlagAffordance(sub, sectionKey, sectionIdx = null) {
  if (!sectionKey) return '';
  if (isSTRole()) return '';
  const me = getPlayerInfo();
  if (!me) return '';
  const subId = String(sub._id || '');
  const idxAttr = sectionIdx == null ? '' : ` data-section-idx="${esc(String(sectionIdx))}"`;

  const open = _myOpenFlagsFor(sub, sectionKey, sectionIdx);
  if (open.length) {
    const f = open[0];
    const cat = FLAG_CATEGORY_LABELS[f.category] || 'Flagged';
    const reason = f.reason || '';
    return `<span class="story-section-flagged" title="${esc(reason)}">`
      + `<span class="story-section-flagged-label">⚑ Flagged: ${esc(cat)}</span>`
      + `<button type="button" class="story-section-flag-recall" data-sub-id="${esc(subId)}" data-flag-id="${esc(String(f._id))}">Recall flag</button>`
      + `</span>`;
  }
  return `<button type="button" class="story-section-flag-btn" data-sub-id="${esc(subId)}" data-section-key="${esc(sectionKey)}"${idxAttr}>⚑ Flag for review</button>`;
}

function renderStoryMoment(sub, opts = {}) {
  const { editable } = opts;
  // Read order matches DTSR-2's consolidated field (story_moment) first, then
  // older personal_story, then the pre-DTSR-2 letter_from_home + touchstone
  // legacy. Edit targets story_moment so saves match the admin's write path
  // and compilePushOutcome's read path.
  const smText = sub.st_narrative?.story_moment?.response;
  if (smText) return _storyNarrSection('Story Moment', smText, { editable, sectionKey: 'story_moment', sub });

  const psText = sub.st_narrative?.personal_story?.response;
  if (psText) return _storyNarrSection('Story Moment', psText, { editable: false, sectionKey: 'story_moment', sub });

  const letter    = sub.st_narrative?.letter_from_home?.response;
  const touchstone = sub.st_narrative?.touchstone?.response;
  if (!letter && !touchstone) return '';
  // Legacy display only — no Edit button on the legacy path; editing requires
  // the new personal_story field. ST should re-author rather than patch legacy.
  let h = '<div class="story-section">';
  h += '<div class="story-section-header">';
  h += `<h4 class="story-section-head">Story Moment</h4>`;
  h += '</div>';
  h += '<div class="story-section-body">';
  if (touchstone) {
    const paras = touchstone.trim().split(/\n{2,}/).filter(Boolean);
    h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
  }
  if (letter) {
    if (touchstone) h += '<hr class="story-moment-divider">';
    const paras = letter.trim().split(/\n{2,}/).filter(Boolean);
    h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
  }
  h += '</div></div>';
  return h;
}

function renderHomeReportSection(sub, opts = {}) {
  const { editable } = opts;
  return _storyNarrSection('Home Report', sub.st_narrative?.home_report?.response, {
    editable, sectionKey: 'home_report', sub,
  });
}

// DTSR-8: map outcome-section heading text to a section_key. Returns null
// for headings without a flaggable identity (e.g. raw prose, mechanical-only).
function _flagSectionKeyForHeading(heading) {
  const h = (heading || '').toLowerCase().trim();
  if (h === 'feeding')                          return 'feeding_validation';
  if (h.startsWith('home report'))              return 'home_report';
  if (h.startsWith('story moment'))             return 'story_moment';
  if (h.includes('asset summary') || h.includes('allies & assets')) return 'merit_summary';
  if (h === 'rumours')                          return 'cacophony_savvy';
  return null;
}

function renderRumoursSection(sub, opts = {}) {
  const { editable } = opts;
  const slots = sub.st_narrative?.cacophony_savvy || [];
  const rumours = sub.st_narrative?.rumours || [];
  // Build editable + non-editable lines together. Cacophony Savvy slots have
  // an index → editable per slot. The newer rumours[] array (text-only) is
  // appended without per-slot edit; editing it would need a different shape.
  const slotEntries = slots.map((s, i) => ({ text: s?.response || '', idx: i, editable: true }))
                           .filter(e => e.text);
  const rumourEntries = rumours.map(r => ({ text: r?.text || r || '', idx: null, editable: false }))
                               .filter(e => e.text);
  const all = [...slotEntries, ...rumourEntries];
  if (!all.length) return '';
  let h = '<div class="story-section story-section-rumours">';
  h += '<div class="story-section-header">';
  h += `<h4 class="story-section-head">Rumours</h4>`;
  h += '</div>';
  h += '<ul class="story-rumours-list">';
  for (const r of all) {
    const rText = String(r.text).trim();
    if (editable && r.editable && r.idx != null) {
      h += `<li data-section-key="cacophony_savvy" data-section-idx="${r.idx}">`;
      h += `<span class="story-rumour-text">${esc(rText)}</span>`;
      h += `<button type="button" class="story-section-edit story-rumour-edit" title="Edit (ST only)">Edit</button>`;
      h += renderFlagAffordance(sub, 'cacophony_savvy', r.idx);
      h += `</li>`;
    } else if (r.idx != null) {
      h += `<li data-section-key="cacophony_savvy" data-section-idx="${r.idx}">`;
      h += `<span class="story-rumour-text">${esc(rText)}</span>`;
      h += renderFlagAffordance(sub, 'cacophony_savvy', r.idx);
      h += `</li>`;
    } else {
      h += `<li>${esc(rText)}</li>`;
    }
  }
  h += '</ul></div>';
  return h;
}

/**
 * Render the published narrative with project cards injected immediately
 * after their matching section heading. Unmatched cards and merit action
 * cards are appended at the bottom.
 */
export function renderOutcomeWithCards(sub, opts = {}) {
  const { editable = false } = opts;
  const sections = parseOutcomeSections(sub.published_outcome);

  // Build project card lookup: normalisedTitle → { html, used, idx }
  const cardLookup = {};
  const responses  = sub.st_narrative?.project_responses || [];
  const resolved   = sub.projects_resolved || [];
  const unmatched  = [];

  for (let i = 0; i < 4; i++) {
    const n     = i + 1;
    const title = sub.responses?.[`project_${n}_title`] || sub[`project_${n}_title`];
    if (!title) continue;

    const resp     = responses[i]?.response || '';
    const rev      = resolved[i] || {};
    const actType  = rev.action_type || sub.responses?.[`project_${n}_action`] || sub[`project_${n}_action`] || '';
    const typeLabel = ACTION_TYPE_LABELS[actType] || actType;

    let cardHtml;
    if (!resp) {
      cardHtml  = '<div class="proj-card proj-card-withheld">';
      cardHtml += `<div class="proj-card-name">${esc(title)}</div>`;
      cardHtml += '<p class="proj-card-withheld-msg">Project withheld — see your Storytellers.</p>';
      cardHtml += '</div>';
    } else {
      cardHtml  = '<div class="proj-card">';
      cardHtml += '<div class="proj-card-header">';
      if (typeLabel) cardHtml += `<span class="proj-card-type-chip">${esc(typeLabel)}</span>`;
      cardHtml += `<span class="proj-card-name">${esc(title)}</span>`;
      cardHtml += '</div>';


      const poolExpr = rev.pool?.expression || rev.pool_validated || (rev.pool?.total ? String(rev.pool.total) : '');
      if (!rev.no_roll && poolExpr) {
        cardHtml += `<div class="proj-card-pool"><span class="proj-card-pool-label">Pool</span> <span class="proj-card-pool-val">${esc(poolExpr)}</span></div>`;
      }

      if (rev.roll) {
        const suc = rev.roll.successes ?? 0;
        const exc = rev.roll.exceptional;
        const label = exc ? 'Exceptional Success' : suc === 0 ? 'Failure' : `${suc} Success${suc !== 1 ? 'es' : ''}`;
        const cls   = exc ? ' proj-card-roll-exc' : suc === 0 ? ' proj-card-roll-fail' : '';
        cardHtml += `<div class="proj-card-roll${cls}">${esc(label)}</div>`;
        if (rev.roll.dice_string) cardHtml += `<div class="proj-card-dice">${esc(rev.roll.dice_string)}</div>`;
      }

      const note = rev.player_facing_note || rev.player_feedback || '';
      if (note) cardHtml += `<div class="proj-card-feedback"><span class="proj-card-feedback-label">ST Note</span>${esc(note)}</div>`;

      cardHtml += '</div>';
    }

    cardLookup[_normTitle(title)] = { html: cardHtml, used: false, idx: i };
    unmatched.push(_normTitle(title));
  }

  // ── Sections 1-2: Story Moment + Home Report (above main narrative) ──
  let h = '<div class="story-narrative">';
  h += renderStoryMoment(sub, { editable });
  h += renderHomeReportSection(sub, { editable });
  for (const sec of sections) {
    if (sec.heading) {
      const isMech = sec.heading === 'Mechanical Outcomes';
      // Match the parsed heading to a project card to find its index. When
      // editable, the heading section is treated as the editable surface for
      // st_narrative.project_responses[idx].response.
      const norm = _normTitle(sec.heading);
      const projHit = cardLookup[norm];
      const sectionEditable = editable && !isMech && projHit && !projHit.used;
      const dataAttrs = sectionEditable
        ? ` data-section-key="project_responses" data-section-idx="${projHit.idx}"`
        : '';
      h += `<div class="story-section${isMech ? ' story-section-mech' : ''}"${dataAttrs}>`;
      h += '<div class="story-section-header">';
      h += `<h4 class="story-section-head">${esc(sec.heading)}</h4>`;
      if (sectionEditable) h += _renderEditButton();
      // DTSR-8: flag affordance per section. Project headings + a few well-known
      // parsed-outcome headings get a per-section flag; raw prose without a
      // recognised section key does not.
      if (projHit) {
        h += renderFlagAffordance(sub, 'project_responses', projHit.idx);
      } else {
        const headingKey = _flagSectionKeyForHeading(sec.heading);
        if (headingKey) h += renderFlagAffordance(sub, headingKey);
      }
      h += '</div>';
      h += '<div class="story-section-body">';
      const body = sec.lines.join('\n').trim();
      if (isMech) {
        h += `<pre class="story-pre">${esc(body)}</pre>`;
      } else {
        const paras = body.split(/\n{2,}/).filter(Boolean);
        h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
      }
      h += '</div></div>';

      // Inject matching project card immediately after this section
      if (projHit && !projHit.used) {
        projHit.used = true;
        h += projHit.html;
      }
    } else {
      const body = sec.lines.join('\n').trim();
      const paras = body.split(/\n{2,}/).filter(Boolean);
      h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
    }
  }
  h += '</div>';

  // Unmatched project cards at the bottom
  for (const key of unmatched) {
    if (cardLookup[key] && !cardLookup[key].used) {
      h += cardLookup[key].html;
    }
  }

  // Section 5: Allies & Asset Summary
  // DTSR-4: not editable in v1. Merit content lives in merit_actions_resolved
  // and st_narrative.action_responses (two surfaces); the right edit shape is
  // tied up with DTSR-5/6 work. Defer until those land.
  h += renderMeritSummarySection(sub);

  // Section 6: Rumours
  h += renderRumoursSection(sub, { editable });

  return h;
}

// ── Merit action summary / cards ─────────────────────────────────

function _deriveMeritCat(meritTypeStr) {
  const s = (meritTypeStr || '').toLowerCase();
  if (/allies/.test(s))    return 'allies';
  if (/status/.test(s))    return 'status';
  if (/retainer/.test(s))  return 'retainer';
  if (/contacts?/.test(s)) return 'contacts';
  if (/resources?/.test(s)) return 'resources';
  return 'misc';
}

const _MERIT_CAT_ORDER  = ['allies', 'status', 'contacts', 'retainer', 'resources', 'misc'];
const _MERIT_CAT_LABELS = {
  allies: 'Allies', status: 'Status', contacts: 'Contacts',
  retainer: 'Retainers', resources: 'Resources', misc: 'Influence',
};

/**
 * Renders merit action outcomes. If outcome_summary strings are present
 * (set during DT Processing), renders a grouped ledger. Otherwise falls
 * back to the legacy card-per-action rendering for older submissions.
 */
function renderMeritSummarySection(sub) {
  const actions  = buildPlayerMeritActions(sub);
  const resolved = sub.merit_actions_resolved || [];

  const hasOutcomeSummaries = resolved.some(rev => rev?.outcome_summary?.trim());

  if (!hasOutcomeSummaries) {
    return renderMeritActionCards(sub);
  }

  // Group by category — only show entries with a recorded outcome
  const groups = {};
  actions.forEach((a, i) => {
    const rev = resolved[i] || {};
    if (rev.pool_status === 'skipped') return;
    const summary = rev.outcome_summary?.trim();
    if (!summary) return;
    const cat = _deriveMeritCat(a.merit_type);
    if (!groups[cat]) groups[cat] = [];
    const meritLabel = (a.merit_type || '').replace(/\s*[●○\u25cf\u25cb]+\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    groups[cat].push({
      meritLabel,
      actionLabel: cat === 'contacts' ? '' : (ACTION_TYPE_LABELS[a.action_type] || a.action_type || ''),
      summary,
    });
  });

  const orderedCats = _MERIT_CAT_ORDER.filter(c => groups[c]);
  if (!orderedCats.length) return '';

  let h = '<div class="merit-summary-section">';
  h += '<h4 class="story-section-head merit-summary-head">Allies &amp; Asset Summary</h4>';
  for (const cat of orderedCats) {
    h += `<div class="merit-summary-group">`;
    h += `<div class="merit-summary-cat-label">${_MERIT_CAT_LABELS[cat] || cat}</div>`;
    for (const entry of groups[cat]) {
      h += `<div class="merit-summary-row">`;
      h += `<span class="merit-summary-merit">${esc(entry.meritLabel)}</span>`;
      if (entry.actionLabel) h += `<span class="merit-summary-action-type">${esc(entry.actionLabel)}</span>`;
      h += `<span class="merit-summary-text">${esc(entry.summary)}</span>`;
      h += `</div>`;
    }
    h += `</div>`;
  }
  h += '</div>';
  return h;
}

// ── Merit action cards (legacy — used as fallback when outcome_summary absent) ─

/**
 * Reconstructs the ordered list of merit actions from the submission's
 * form responses. Ordering matches downtime-views.js flat index:
 * spheres → contacts → retainers → resources.
 */
function buildPlayerMeritActions(sub) {
  const resp = sub.responses || {};
  const raw  = sub._raw    || {};
  const actions = [];

  // Spheres (Allies, Status, etc.)
  const sphereRaw = raw.sphere_actions || [];
  if (sphereRaw.length) {
    sphereRaw.forEach((entry, idx) => {
      const slot = idx + 1;
      actions.push({
        merit_type:  resp[`sphere_${slot}_merit`] || '',
        action_type: entry.action_type || '',
      });
    });
  } else {
    for (let n = 1; n <= 5; n++) {
      const mt = resp[`sphere_${n}_merit`];
      if (!mt) continue;
      actions.push({ merit_type: mt, action_type: resp[`sphere_${n}_action`] || '' });
    }
  }

  // Contacts
  const contactRaw = raw.contact_actions?.requests || [];
  if (contactRaw.length) {
    contactRaw.forEach((_, idx) => {
      const n = idx + 1;
      actions.push({ merit_type: resp[`contact_${n}_merit`] || resp[`contact_1_merit`] || 'Contacts', action_type: 'misc' });
    });
  } else {
    for (let n = 1; n <= 5; n++) {
      if (!resp[`contact_${n}_request`]) continue;
      actions.push({ merit_type: resp[`contact_${n}_merit`] || 'Contacts', action_type: 'misc' });
    }
  }

  // Retainers
  const retainerRaw = raw.retainer_actions?.actions || [];
  if (retainerRaw.length) {
    retainerRaw.forEach(() => actions.push({ merit_type: 'Retainer', action_type: 'misc' }));
  } else {
    for (let n = 1; n <= 4; n++) {
      if (!resp[`retainer_${n}_task`]) continue;
      actions.push({ merit_type: 'Retainer', action_type: 'misc' });
    }
  }

  // Resources
  const resBlob = raw.acquisitions?.resource_acquisitions || resp['resources_acquisitions'] || '';
  if (resBlob.trim()) {
    actions.push({ merit_type: 'Resources', action_type: 'acquisition' });
  }

  return actions;
}

function renderMeritActionCards(sub) {
  const actions  = buildPlayerMeritActions(sub);
  if (!actions.length) return '';

  const resolved = sub.merit_actions_resolved || [];
  const cards = actions
    .map((a, i) => ({ a, rev: resolved[i] || {} }))
    .filter(({ rev }) => rev.pool || rev.pool_validated || rev.roll);

  if (!cards.length) return '';

  let h = '';
  for (const { a, rev } of cards) {
    // Strip dot characters from stored label: "Allies ●●● (Finance)" → "Allies (Finance)"
    const meritLabel = (a.merit_type || '').replace(/\s*[●○\u25cf\u25cb]+\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    const actionLabel = _deriveMeritCat(a.merit_type) === 'contacts' ? '' : (ACTION_TYPE_LABELS[a.action_type] || a.action_type || '');

    h += '<div class="proj-card">';
    h += '<div class="proj-card-header">';
    if (actionLabel) h += `<span class="proj-card-type-chip">${esc(actionLabel)}</span>`;
    h += `<span class="proj-card-name">${esc(meritLabel)}</span>`;
    h += '</div>';

    const poolExpr = rev.pool?.expression || rev.pool_validated || (rev.pool?.total ? String(rev.pool.total) : '');
    if (poolExpr) h += `<div class="proj-card-pool"><span class="proj-card-pool-label">Pool</span> <span class="proj-card-pool-val">${esc(poolExpr)}</span></div>`;

    if (rev.roll) {
      const suc = rev.roll.successes ?? 0;
      const exc = rev.roll.exceptional;
      const label = exc ? 'Exceptional Success'
        : suc === 0 ? 'Failure'
        : `${suc} Success${suc !== 1 ? 'es' : ''}`;
      const cls = exc ? ' proj-card-roll-exc' : suc === 0 ? ' proj-card-roll-fail' : '';
      h += `<div class="proj-card-roll${cls}">${esc(label)}</div>`;
      if (rev.roll.dice_string) h += `<div class="proj-card-dice">${esc(rev.roll.dice_string)}</div>`;
    }

    const note = rev.player_facing_note || rev.player_feedback || '';
    if (note) {
      h += `<div class="proj-card-feedback"><span class="proj-card-feedback-label">ST Note</span>${esc(note)}</div>`;
    }

    h += '</div>';
  }
  return h;
}

// ── Dossier ───────────────────────────────────────────────────────

function renderDossier(char, quest) {
  const r = quest?.responses || {};
  const name = displayName(char);

  // Format embrace date from YYYY-MM-DD
  const embraceRaw = char.date_of_embrace || '';
  const embraceDisp = embraceRaw
    ? new Date(embraceRaw + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  let h = '<div class="doc-card">';

  // ── Card header (always visible, click to expand) ──
  h += '<button class="doc-card-toggle" aria-expanded="false">';
  h += '<div class="doc-card-header-inner">';
  h += `<span class="doc-card-eyebrow">Dossier</span>`;
  h += `<span class="doc-card-title">${esc(name)}</span>`;
  if (char.concept) h += `<span class="doc-card-subtitle">${esc(char.concept)}</span>`;
  h += '</div>';
  h += '<span class="doc-card-chevron">▾</span>';
  h += '</button>';

  // ── Card body (collapsible) ──
  h += '<div class="doc-card-body reading-pane" hidden>';

  // Identity strip
  h += '<div class="dos-identity">';
  if (char.clan) {
    h += `<span class="dos-identity-item">${clanIcon(char.clan, 16)}<span>${esc(char.clan)}</span>`;
    if (char.bloodline) h += ` <span class="dos-bloodline">/ ${esc(char.bloodline)}</span>`;
    h += '</span>';
  }
  if (char.covenant) {
    h += `<span class="dos-identity-item">${covIcon(char.covenant, 16)}<span>${esc(char.covenant)}</span></span>`;
  }
  if (char.mask || char.dirge) {
    h += `<span class="dos-archetypes">`;
    if (char.mask)  h += `<span><em>Mask:</em> ${esc(char.mask)}</span>`;
    if (char.dirge) h += `<span><em>Dirge:</em> ${esc(char.dirge)}</span>`;
    h += '</span>';
  }
  const stats = [];
  if (char.apparent_age) stats.push(`Apparent age ${esc(char.apparent_age)}`);
  if (embraceDisp) stats.push(`Embraced ${esc(embraceDisp)}`);
  if (stats.length) h += `<span class="dos-stats">${stats.join(' · ')}</span>`;
  h += '</div>';

  // Profile section
  h += dosSection('Character Profile', [
    r.covenant_factions   && dosField('Covenant Faction', r.covenant_factions),
    r.conflict_approach   && dosField('Conflict Approach', resolveConflict(r.conflict_approach)),
    r.aspired_role_tag    && dosField('Aspired Role', resolveRole(r.aspired_role_tag)),
    r.aspired_position    && dosField('Ambition', r.aspired_position),
  ]);

  // Motivations section
  h += dosSection('Motivations', [
    r.court_motivation    && dosField('Why Court?', r.court_motivation),
    r.ambitions_sydney    && dosField('Goals in Sydney', r.ambitions_sydney),
    r.why_sydney          && dosField('Why Sydney?', r.why_sydney),
    r.why_covenant        && dosField('Why their Covenant?', r.why_covenant),
    r.covenant_goals      && dosField('Covenant Goals', r.covenant_goals),
    r.clan_goals          && dosField('Clan Goals', r.clan_goals),
  ]);

  // Views section
  h += dosSection('Views', [
    r.view_traditions     && dosField('The Traditions', r.view_traditions),
    r.view_elysium        && dosField('Elysium', r.view_elysium),
    r.view_mortals        && dosField('Mortals and Ghouls', r.view_mortals),
    r.intolerable_behaviours && dosField('Will Not Tolerate', r.intolerable_behaviours),
  ]);

  // History section
  h += dosSection('History', [
    r.embrace_story       && dosField('The Embrace', r.embrace_story),
    (r.sire_name || r.sire_story) && dosField('Sire', [r.sire_name, r.sire_story].filter(Boolean).join(' — ')),
    r.early_city          && dosField('City of Embrace', r.early_city),
    r.early_nights        && dosField('First Nights', r.early_nights),
    r.last_city_politics  && dosField('Previous City', r.last_city_politics),
    r.touchstones         && dosField('Touchstones', r.touchstones),
    r.common_indulgences  && dosField('Indulgences', r.common_indulgences),
  ]);

  // Mortal family
  if (r.mortal_family) {
    if (Array.isArray(r.mortal_family) && r.mortal_family.length) {
      let fh = '<div class="dos-field"><div class="dos-field-label">Mortal Family</div>';
      for (const m of r.mortal_family) {
        fh += `<div class="dos-family-entry">`;
        if (m.name || m.relationship) {
          fh += `<span class="dos-family-name">${esc([m.name, m.relationship].filter(Boolean).join(', '))}</span>`;
        }
        if (m.description) fh += `<span class="dos-family-desc">${esc(m.description)}</span>`;
        fh += '</div>';
      }
      fh += '</div>';
      h += `<details class="dos-section"><summary class="dos-section-title">Mortal Family</summary><div class="dos-section-body">${fh}</div></details>`;
    } else if (typeof r.mortal_family === 'string' && r.mortal_family) {
      h += dosSection('Mortal Family', [dosField('', r.mortal_family)]);
    }
  }

  // Hunting
  h += dosSection('Hunting', [
    r.hunting_method_tags?.length && dosField('Methods', Array.isArray(r.hunting_method_tags) ? r.hunting_method_tags.join(', ') : r.hunting_method_tags),
    r.hunting_style_note  && dosField('Style', r.hunting_style_note),
    r.first_kill          && dosField('First Kill', r.first_kill),
  ]);

  // Connections
  h += dosSection('Connections', [
    r.allies              && dosField('Allies', r.allies),
    r.coterie             && dosField('Coterie', r.coterie),
    r.enemies             && dosField('Rivals', r.enemies),
    r.opposed_covenant    && dosField('Opposed Covenant', r.opposed_covenant),
  ]);

  h += '</div>'; // doc-card-body
  h += '</div>'; // doc-card
  return h;
}

// ── History card ─────────────────────────────────────────────────

function renderHistoryCard(char, historyText, source) {
  let h = '<div class="doc-card">';
  h += '<button class="doc-card-toggle" aria-expanded="false">';
  h += '<div class="doc-card-header-inner">';
  h += '<span class="doc-card-eyebrow">Character History</span>';
  h += `<span class="doc-card-title">${esc(displayName(char))}</span>`;
  h += '</div>';
  h += '<span class="doc-card-chevron">▾</span>';
  h += '</button>';

  h += '<div class="doc-card-body reading-pane" hidden>';

  if (!historyText) {
    h += '<p class="placeholder-msg">No history submitted yet.</p>';
  } else {
    // Word doc imports are stored as HTML; portal submissions are plain text
    const isHtml = source === 'word_doc' || /<[a-z][\s\S]*>/i.test(historyText);
    if (isHtml) {
      h += `<div class="doc-history-body">${historyText}</div>`;
    } else {
      const paras = historyText.split(/\n{2,}/).filter(Boolean);
      h += '<div class="doc-history-body">';
      h += paras.map(p => `<p>${esc(p.replace(/\n/g, ' '))}</p>`).join('');
      h += '</div>';
    }
  }

  h += '</div>';
  h += '</div>';
  return h;
}

// ── Dossier helpers ───────────────────────────────────────────────

function dosSection(title, fields) {
  const content = fields.filter(Boolean).join('');
  if (!content) return '';
  return `<details class="dos-section"><summary class="dos-section-title">${esc(title)}</summary><div class="dos-section-body">${content}</div></details>`;
}

function dosField(label, value) {
  if (!value) return '';
  return `<div class="dos-field">${label ? `<div class="dos-field-label">${esc(label)}</div>` : ''}<div class="dos-field-value">${esc(String(value))}</div></div>`;
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

// ── DTSR-4: ST inline edit on historical chronicle entries ────────────────
// Gate is enforced at render time (entries on closed/complete cycles get
// .story-section-edit buttons). These handlers swap the section body for a
// textarea + Save/Cancel, then on Save patch st_narrative.<key>.response,
// recompile the published outcome, persist, and re-render the entry.

function _findSubById(subId) {
  return _chronicleCtx?.subs?.find(s => String(s._id) === String(subId)) || null;
}

function _renderEntryInPlace(entryEl, sub) {
  // Recompute editability from the same gate the original render used.
  const cycleStatus = _chronicleCtx?.cycleStatusMap?.[String(sub.cycle_id)] || '';
  const editable = isSTRole() && (cycleStatus === 'closed' || cycleStatus === 'complete');
  const body = renderOutcomeWithCards(sub, { editable });
  const cycleLabel = entryEl.querySelector('.story-cycle-label')?.outerHTML || '';
  entryEl.innerHTML = cycleLabel + body;
}

function _readSectionText(sub, sectionKey, sectionIdx) {
  const sn = sub.st_narrative || {};
  if (sectionIdx === '' || sectionIdx == null) {
    return sn[sectionKey]?.response || '';
  }
  const i = parseInt(sectionIdx, 10);
  return sn[sectionKey]?.[i]?.response || '';
}

function _editorContainer(sectionEl) {
  // For rumour <li>, swap the whole <li> contents (including the Edit button)
  // so the textarea isn't a block-in-span layout. For section <div>, swap
  // only .story-section-body so the header (with Edit button) stays put.
  return sectionEl.tagName === 'LI'
    ? sectionEl
    : sectionEl.querySelector('.story-section-body');
}

function handleSectionEditClick(btn) {
  const sectionEl = btn.closest('.story-section, li[data-section-key]');
  if (!sectionEl) return;
  const sectionKey = sectionEl.dataset.sectionKey;
  const sectionIdx = sectionEl.dataset.sectionIdx ?? '';
  if (!sectionKey) return;

  const entryEl = sectionEl.closest('.story-entry');
  const subId = entryEl?.dataset.subId;
  const sub = _findSubById(subId);
  if (!sub) return;

  const currentText = _readSectionText(sub, sectionKey, sectionIdx);
  const isRumourLi = sectionEl.tagName === 'LI';
  const container = _editorContainer(sectionEl);
  if (!container) return;

  container.dataset.originalHtml = container.innerHTML;
  const rows = isRumourLi ? 2 : 6;
  container.innerHTML =
    `<textarea class="story-section-edit-ta" rows="${rows}">${esc(currentText)}</textarea>` +
    '<div class="story-section-edit-actions">' +
      '<button type="button" class="story-section-save">Save</button>' +
      '<button type="button" class="story-section-cancel">Cancel</button>' +
      '<span class="story-section-edit-status"></span>' +
    '</div>';
  sectionEl.classList.add('story-section-editing');
  container.querySelector('.story-section-edit-ta')?.focus();

  // Hide the section's Edit button on the section <div> path. For rumour
  // <li> it's part of container.innerHTML and goes away naturally.
  if (!isRumourLi) btn.style.display = 'none';
}

function handleSectionCancel(btn) {
  const sectionEl = btn.closest('.story-section, li[data-section-key]');
  if (!sectionEl) return;
  const container = _editorContainer(sectionEl);
  if (!container || container.dataset.originalHtml == null) return;
  container.innerHTML = container.dataset.originalHtml;
  delete container.dataset.originalHtml;
  sectionEl.classList.remove('story-section-editing');
  const editBtn = sectionEl.querySelector('.story-section-edit');
  if (editBtn) editBtn.style.display = '';
}

async function handleSectionSave(btn) {
  const sectionEl = btn.closest('.story-section, li[data-section-key]');
  if (!sectionEl) return;
  const sectionKey = sectionEl.dataset.sectionKey;
  const sectionIdx = sectionEl.dataset.sectionIdx ?? '';
  if (!sectionKey) return;

  const entryEl = sectionEl.closest('.story-entry');
  const subId = entryEl?.dataset.subId;
  const sub = _findSubById(subId);
  const char = _chronicleCtx?.char;
  if (!sub || !char) return;

  const ta = sectionEl.querySelector('.story-section-edit-ta');
  const statusEl = sectionEl.querySelector('.story-section-edit-status');
  if (!ta) return;
  const newText = ta.value;

  // Build the dotted-path patch. Mongo $set treats numeric path segments as
  // array indices, so st_narrative.cacophony_savvy.0.response works directly.
  let patchPath;
  if (sectionIdx === '' || sectionIdx == null) {
    patchPath = `st_narrative.${sectionKey}.response`;
  } else {
    patchPath = `st_narrative.${sectionKey}.${parseInt(sectionIdx, 10)}.response`;
  }

  // Apply locally so compilePushOutcome reads the new text.
  const sn = sub.st_narrative = sub.st_narrative || {};
  if (sectionIdx === '' || sectionIdx == null) {
    sn[sectionKey] = { ...(sn[sectionKey] || {}), response: newText };
  } else {
    const i = parseInt(sectionIdx, 10);
    sn[sectionKey] = sn[sectionKey] || [];
    sn[sectionKey][i] = { ...(sn[sectionKey][i] || {}), response: newText };
  }

  const recompiled = compilePushOutcome(sub, char);
  sub.published_outcome = recompiled;
  sub.st_review = { ...(sub.st_review || {}), outcome_text: recompiled };

  const patch = {
    [patchPath]: newText,
    'st_review.outcome_text': recompiled,
  };

  if (statusEl) statusEl.textContent = 'Saving…';
  btn.disabled = true;

  try {
    await apiPut(`/api/downtime_submissions/${subId}`, patch);
    if (statusEl) statusEl.textContent = 'Saved';
    // Re-render the whole entry so any sections affected by the recompile
    // (project sections embedded in published_outcome) update consistently.
    if (entryEl) _renderEntryInPlace(entryEl, sub);
  } catch (err) {
    btn.disabled = false;
    if (statusEl) statusEl.textContent = `Failed: ${err?.message || 'error'}`;
  }
}

// ── DTSR-8: player flag form lifecycle ──────────────────────────────

function _findSubInChronicle(subId) {
  const subs = _chronicleCtx?.subs || [];
  return subs.find(s => String(s._id) === String(subId)) || null;
}

function openFlagForm(btn) {
  const subId = btn.dataset.subId;
  const sectionKey = btn.dataset.sectionKey;
  const sectionIdx = btn.dataset.sectionIdx ?? '';
  // Replace the button with a small inline form. Submit is gated by category
  // selection (and a 5-char minimum reason for category=other).
  const form = document.createElement('form');
  form.className = 'story-section-flag-form';
  form.dataset.subId = subId;
  form.dataset.sectionKey = sectionKey;
  if (sectionIdx !== '') form.dataset.sectionIdx = sectionIdx;
  form.innerHTML =
    '<div class="story-section-flag-form-row">'
    + '<label class="story-section-flag-radio"><input type="radio" name="flag-cat" value="inconsistent"> Inconsistent</label>'
    + '<label class="story-section-flag-radio"><input type="radio" name="flag-cat" value="wrong_story"> Wrong story</label>'
    + '<label class="story-section-flag-radio"><input type="radio" name="flag-cat" value="other"> Other</label>'
    + '</div>'
    + '<textarea class="story-section-flag-reason" rows="3" placeholder="Tell your Storyteller what is up (5+ characters for Other)."></textarea>'
    + '<div class="story-section-flag-actions">'
      + '<button type="button" class="story-section-flag-submit" disabled>Submit flag</button>'
      + '<button type="button" class="story-section-flag-cancel">Cancel</button>'
      + '<span class="story-section-flag-status"></span>'
    + '</div>';
  btn.replaceWith(form);
}

function closeFlagForm(cancelBtn) {
  const form = cancelBtn.closest('.story-section-flag-form');
  if (!form) return;
  const sub = _findSubInChronicle(form.dataset.subId);
  if (!sub) { form.remove(); return; }
  const sectionKey = form.dataset.sectionKey;
  const sectionIdx = form.dataset.sectionIdx ?? null;
  const replacement = document.createElement('div');
  replacement.innerHTML = renderFlagAffordance(sub, sectionKey, sectionIdx === null ? null : Number(sectionIdx));
  const node = replacement.firstChild;
  if (node) form.replaceWith(node);
  else form.remove();
}

function _refreshFlagFormSubmitState(form) {
  const cat = form.querySelector('input[name="flag-cat"]:checked')?.value || '';
  const reason = (form.querySelector('.story-section-flag-reason')?.value || '').trim();
  const submitBtn = form.querySelector('.story-section-flag-submit');
  if (!submitBtn) return;
  const ok = !!cat && (cat !== 'other' || reason.length >= 5);
  submitBtn.disabled = !ok;
}

async function submitFlagForm(submitBtn) {
  const form = submitBtn.closest('.story-section-flag-form');
  if (!form) return;
  const subId = form.dataset.subId;
  const sectionKey = form.dataset.sectionKey;
  const sectionIdxRaw = form.dataset.sectionIdx;
  const sectionIdx = sectionIdxRaw == null || sectionIdxRaw === '' ? null : Number(sectionIdxRaw);
  const category = form.querySelector('input[name="flag-cat"]:checked')?.value || '';
  const reason = (form.querySelector('.story-section-flag-reason')?.value || '').trim();
  const statusEl = form.querySelector('.story-section-flag-status');

  if (!category) return;
  if (category === 'other' && reason.length < 5) return;

  submitBtn.disabled = true;
  if (statusEl) statusEl.textContent = 'Submitting…';

  try {
    const flag = await apiPost(`/api/downtime_submissions/${subId}/section-flag`, {
      section_key: sectionKey,
      section_idx: sectionIdx,
      category,
      reason,
    });
    // Optimistic local update — push into the in-memory submission so the
    // re-rendered affordance shows the Flagged state.
    const sub = _findSubInChronicle(subId);
    if (sub) {
      if (!Array.isArray(sub.section_flags)) sub.section_flags = [];
      sub.section_flags.push(flag);
      const entryEl = document.querySelector(`.story-entry[data-sub-id="${CSS.escape(subId)}"]`);
      if (entryEl) _renderEntryInPlace(entryEl, sub);
    } else {
      form.remove();
    }
  } catch (err) {
    submitBtn.disabled = false;
    if (statusEl) statusEl.textContent = `Failed: ${err?.message || 'error'}`;
  }
}

async function recallFlag(btn) {
  const subId = btn.dataset.subId;
  const flagId = btn.dataset.flagId;
  btn.disabled = true;
  btn.textContent = 'Recalling…';
  try {
    await apiPatch(`/api/downtime_submissions/${subId}/section-flag/${flagId}`, { status: 'recalled' });
    const sub = _findSubInChronicle(subId);
    if (sub) {
      const flag = (sub.section_flags || []).find(f => String(f._id) === String(flagId));
      if (flag) flag.status = 'recalled';
      const entryEl = document.querySelector(`.story-entry[data-sub-id="${CSS.escape(subId)}"]`);
      if (entryEl) _renderEntryInPlace(entryEl, sub);
    }
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Recall flag';
    alert(`Recall failed: ${err?.message || 'error'}`);
  }
}
