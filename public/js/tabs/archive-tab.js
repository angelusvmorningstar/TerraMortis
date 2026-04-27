/* Archive tab — documents (dossier, downtime responses, history) + retired characters.
 *
 * Dossier detail view (ORD-12) renders three sections:
 *   1. Core Info Card — live from character sheet
 *   2. Questionnaire Details — live from questionnaire_responses
 *   3. History Narrative — archive_documents.content_html, ST-editable via ORD-3 editor
 */

import { apiGet } from '../data/api.js';
import { esc, displayName, clanIcon, covIcon } from '../data/helpers.js';
import { renderSheet } from '../editor/sheet.js';
import { openInlineEditor } from '../editor/archive-inline-editor.js';
import { renderReadOnlyField } from '../editor/questionnaire-render.js';
import { QUESTIONNAIRE_SECTIONS } from './questionnaire-data.js';
import { isSTRole } from '../auth/discord.js';

const TYPE_LABELS = {
  dossier:           'Dossier',
  downtime_response: 'Downtime Response',
  history_submission: 'Character History',
};

let _el          = null;
let _char        = null;
let _retiredChars = [];

export async function initArchiveTab(el, char, retiredChars) {
  _el           = el;
  _char         = char;
  _retiredChars = retiredChars || [];
  await renderArchiveList();
}

// ── List view ─────────────────────────────────────────────────────────────────

async function renderArchiveList() {
  _el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let docs = [];
  try {
    docs = await apiGet(`/api/archive_documents?character_id=${_char._id}`);
  } catch { /* non-fatal — show retired chars anyway */ }

  const dossiers  = docs.filter(d => d.type === 'dossier');
  const downtimes = docs.filter(d => d.type === 'downtime_response')
                        .sort((a, b) => (a.cycle || 0) - (b.cycle || 0));
  const histories = docs.filter(d => d.type === 'history_submission');

  let h = '';

  // ── Documents ──
  if (dossiers.length || downtimes.length || histories.length) {
    h += '<div class="arc-docs">';
    if (dossiers.length)  h += renderDocGroup('Dossier', dossiers);
    if (downtimes.length) h += renderDocGroup('Downtime Reports', downtimes);
    if (histories.length) h += renderDocGroup('Character History', histories);
    h += '</div>';
  }

  // ── Retired characters ──
  if (_retiredChars.length) {
    h += '<div class="arc-retired">';
    h += '<h3 class="arc-section-title">Retired Characters</h3>';
    h += '<div class="archive-grid">';
    for (const c of _retiredChars) {
      const meta = [c.clan, c.covenant].filter(Boolean).join(' \u00B7 ');
      const bp   = c.blood_potency ? `BP ${c.blood_potency}` : '';
      h += `<div class="archive-card" data-char-id="${esc(String(c._id))}">`;
      h += `<div class="archive-card-name">${esc(displayName(c))}</div>`;
      if (meta) h += `<div class="archive-card-meta">${esc(meta)}</div>`;
      if (bp)   h += `<div class="archive-card-bp">${esc(bp)}</div>`;
      h += '<span class="archive-badge">Retired</span>';
      h += '</div>';
    }
    h += '</div>';
    h += '</div>';
  }

  if (!docs.length && !_retiredChars.length) {
    h = '<p class="placeholder-msg">Nothing archived yet.</p>';
  }

  _el.innerHTML = h;

  // Wire doc item clicks
  _el.querySelectorAll('.arc-doc-item').forEach(item => {
    item.addEventListener('click', () => openDocDetail(item.dataset.docId));
  });

  // Wire retired char clicks
  _el.querySelectorAll('.archive-card').forEach(card => {
    card.addEventListener('click', () => {
      const c = _retiredChars.find(r => String(r._id) === card.dataset.charId);
      if (c) openCharSheet(c);
    });
  });
}

function renderDocGroup(heading, docs) {
  let h = `<div class="arc-doc-group">`;
  h += `<div class="arc-doc-group-title">${esc(heading)}</div>`;
  for (const doc of docs) {
    const subtitle = doc.type === 'downtime_response' ? `Cycle ${doc.cycle}` : null;
    h += `<div class="arc-doc-item" data-doc-id="${esc(String(doc._id))}">`;
    h += `<span class="arc-doc-title">${esc(doc.title || TYPE_LABELS[doc.type] || doc.type)}</span>`;
    if (subtitle) h += `<span class="arc-doc-meta">${esc(subtitle)}</span>`;
    h += '<span class="arc-doc-arrow">&rsaquo;</span>';
    h += '</div>';
  }
  h += '</div>';
  return h;
}

// ── Document detail view ──────────────────────────────────────────────────────

async function openDocDetail(docId) {
  _el.innerHTML = '<p class="placeholder-msg">Loading\u2026</p>';

  let doc;
  try {
    doc = await apiGet(`/api/archive_documents/${docId}`);
  } catch (err) {
    _el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  // For dossiers, also fetch the questionnaire response so we can render
  // the live Questionnaire Details section. Other document types don't
  // need it. Fetch is best-effort: null response just hides that section.
  let questionnaireResponses = null;
  if (doc.type === 'dossier' && _char?._id) {
    try {
      const qDoc = await apiGet(`/api/questionnaire?character_id=${_char._id}`);
      questionnaireResponses = qDoc?.responses || null;
    } catch { /* non-fatal \u2014 render without it */ }
  }

  renderDocDetail(doc, questionnaireResponses);
}

function renderDocDetail(doc, questionnaireResponses) {
  const subtitle = doc.type === 'downtime_response' ? ` \u2014 Cycle ${doc.cycle}` : '';
  const canEdit  = isSTRole();
  const isDossier = doc.type === 'dossier';

  let h = '<div class="arc-detail">';
  h += `<button class="qf-back-btn" id="arc-back">&larr; Back to Archive</button>`;
  h += `<div class="arc-detail-header">`;
  h += `<div class="arc-detail-title">${esc(doc.title || TYPE_LABELS[doc.type] || doc.type)}${esc(subtitle)}</div>`;
  if (canEdit) {
    h += '<button class="arc-btn-edit" id="arc-edit">Edit</button>';
  }
  h += '</div>';

  if (isDossier) {
    // Three sections stacked inside a single reading-pane so the dossier
    // reads as one cohesive document rather than three boxed cards.
    h += '<div class="arc-detail-body reading-pane">';
    // Section 1: Core Info Card (live from character sheet)
    h += renderCoreInfoCard(_char);
    // Section 2: Questionnaire Details (live from questionnaire_responses)
    if (questionnaireResponses) {
      h += renderQuestionnaireDetails(questionnaireResponses);
    }
    // Section 3: History Narrative (ST-editable content_html)
    h += '<div class="arc-history-section">';
    h += '<h3 class="arc-history-heading">History</h3>';
    h += `<div class="arc-history-body">${doc.content_html || ''}</div>`;
    h += '</div>';
    h += '</div>';
  } else {
    h += `<div class="arc-detail-body reading-pane">${doc.content_html || ''}</div>`;
  }

  h += '</div>';

  _el.innerHTML = h;

  document.getElementById('arc-back').addEventListener('click', renderArchiveList);

  if (canEdit) {
    document.getElementById('arc-edit').addEventListener('click', () => {
      openInlineEditor(_el, doc._id, doc.content_html || '', {
        onSaved: (html) => {
          doc.content_html = html;
          renderDocDetail(doc, questionnaireResponses);
        },
        onCancelled: () => {
          renderDocDetail(doc, questionnaireResponses);
        },
      });
    });
  }
}

// \u2500\u2500 Core Info Card \u2014 live from character sheet \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function renderCoreInfoCard(c) {
  if (!c) return '';

  const embraceDisp = c.date_of_embrace
    ? new Date(c.date_of_embrace + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';

  const bp = c.blood_potency;
  const bpDisp = (bp != null && bp !== '')
    ? (('\u25cf'.repeat(parseInt(bp) || 0)) || String(bp))
    : '';

  let h = '<div class="arc-core-card">';

  // Identity row \u2014 name, clan, covenant with icons (matches questionnaire char-header pattern)
  h += `<div class="arc-core-name">${esc(displayName(c))}</div>`;
  h += '<div class="arc-core-identity">';
  if (c.clan) {
    h += `<span class="arc-core-clan">${clanIcon(c.clan, 18)}<span>${esc(c.clan)}</span>`;
    if (c.bloodline) h += ` <span class="arc-core-bloodline">/ ${esc(c.bloodline)}</span>`;
    h += '</span>';
  }
  if (c.covenant) {
    h += `<span class="arc-core-cov">${covIcon(c.covenant, 18)}<span>${esc(c.covenant)}</span></span>`;
  }
  h += '</div>';

  // Grid of the remaining fields
  const rows = [];
  if (c.mask)          rows.push(['Mask',        c.mask]);
  if (c.dirge)         rows.push(['Dirge',       c.dirge]);
  if (bpDisp)          rows.push(['Blood Potency', bpDisp]);
  if (c.apparent_age)  rows.push(['Apparent Age', c.apparent_age]);
  if (c.humanity != null) rows.push(['Humanity',  String(c.humanity)]);
  if (embraceDisp)     rows.push(['Embraced',    embraceDisp]);
  if (c.city_status != null)     rows.push(['City Status',     String(c.city_status)]);
  if (c.clan_status != null)     rows.push(['Clan Status',     String(c.clan_status)]);
  if (c.covenant_status != null) rows.push(['Covenant Status', String(c.covenant_status)]);

  if (rows.length) {
    h += '<dl class="arc-core-grid">';
    for (const [label, value] of rows) {
      h += `<dt class="arc-core-label">${esc(label)}</dt>`;
      h += `<dd class="arc-core-value">${esc(value)}</dd>`;
    }
    h += '</dl>';
  }

  h += '</div>';
  return h;
}

// \u2500\u2500 Questionnaire Details \u2014 live from questionnaire_responses \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
function renderQuestionnaireDetails(responses) {
  if (!responses) return '';

  // Skip Player Info (meta, not narrative).
  const narrativeSections = QUESTIONNAIRE_SECTIONS.filter(s => s.key !== 'player_info');

  // Build per-section content; only render sections that have at least one answered field.
  let anyContent = false;
  let inner = '';

  for (const section of narrativeSections) {
    let sectionHtml = '';
    for (const q of section.questions) {
      const value = responses[q.key];
      const rendered = renderReadOnlyField(q, value === undefined ? '' : value);
      if (rendered) sectionHtml += rendered;
    }
    if (sectionHtml) {
      anyContent = true;
      inner += `<div class="arc-quest-section">`;
      inner += `<h4 class="arc-quest-section-title">${esc(section.title)}</h4>`;
      inner += sectionHtml;
      inner += '</div>';
    }
  }

  if (!anyContent) return '';

  return `<div class="arc-quest-details">${inner}</div>`;
}

// ── Retired character sheet view ──────────────────────────────────────────────

function openCharSheet(c) {
  let h = '<div class="archive-detail">';
  h += '<button class="qf-back-btn" id="arc-back">&larr; Back to Archive</button>';
  h += '<div id="archive-sheet-target"></div>';
  h += '</div>';
  _el.innerHTML = h;

  document.getElementById('arc-back').addEventListener('click', renderArchiveList);
  renderSheet(c, document.getElementById('archive-sheet-target'));
}
