/* Archive tab — documents (dossier, downtime responses, history) + retired characters. */

import { apiGet } from '../data/api.js';
import { esc, displayName } from '../data/helpers.js';
import { renderSheet } from '../editor/sheet.js';

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
  const downtime  = docs.filter(d => d.type === 'downtime_response')
                        .sort((a, b) => (b.cycle ?? 0) - (a.cycle ?? 0));
  const histories = docs.filter(d => d.type === 'history_submission');

  let h = '';

  // ── Documents ──
  if (docs.length) {
    h += '<div class="arc-docs">';
    if (dossiers.length)  h += renderDocGroup('Dossier', dossiers);
    if (downtime.length)  h += renderDocGroup('Downtime Responses', downtime);
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

  const subtitle = doc.type === 'downtime_response' ? ` \u2014 Cycle ${doc.cycle}` : '';

  let h = '<div class="arc-detail">';
  h += `<button class="qf-back-btn" id="arc-back">&larr; Back to Archive</button>`;
  h += `<div class="arc-detail-header">`;
  h += `<div class="arc-detail-title">${esc(doc.title || TYPE_LABELS[doc.type] || doc.type)}${esc(subtitle)}</div>`;
  h += '</div>';
  h += `<div class="arc-detail-body reading-pane">${doc.content_html}</div>`;
  h += '</div>';

  _el.innerHTML = h;
  document.getElementById('arc-back').addEventListener('click', renderArchiveList);
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
