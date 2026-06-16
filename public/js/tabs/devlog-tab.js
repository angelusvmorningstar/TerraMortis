import { apiGet } from '../data/api.js';
import { esc }    from '../data/helpers.js';

const DEVLOG_STATUS_LABELS = {
  considering: 'Under Consideration',
  confirmed:   'Confirmed',
  in_progress: 'In Progress',
  implemented: 'Implemented',
  deferred:    'Deferred',
};

export async function renderDevlogTab(el) {
  el.innerHTML = '<p class="placeholder-msg">Loading…</p>';
  let entries = [];
  try {
    entries = await apiGet('/api/devlog');
  } catch (err) {
    el.innerHTML = `<p class="placeholder-msg">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  // Highlighted entries surface in a prominent "Recently Shipped" section at
  // the top regardless of status, instead of falling into the collapsed
  // Resolved group — so a just-implemented change reads as news. Everything
  // else partitions by status as before. Each entry appears in one place only.
  const highlighted = entries.filter(e => e.highlight);
  const rest        = entries.filter(e => !e.highlight);
  const active   = rest.filter(e => e.status !== 'implemented' && e.status !== 'deferred');
  const resolved = rest.filter(e => e.status === 'implemented' || e.status === 'deferred');

  let h = '<div class="devlog-tab">';

  if (highlighted.length) {
    h += `<div class="devlog-section devlog-recent">`;
    h += `<h3 class="devlog-section-heading devlog-recent-heading">Recently Shipped</h3>`;
    for (const entry of highlighted) h += _renderCard(entry);
    h += `</div>`;
  }

  h += _renderSection('Rule Changes',    active.filter(e => e.type === 'rule_change'));
  h += _renderSection('App Development', active.filter(e => e.type === 'app_feature'));

  if (resolved.length) {
    h += `<details class="devlog-resolved">`;
    h += `<summary class="devlog-resolved-toggle">Resolved (${resolved.length})</summary>`;
    h += _renderSection('Rule Changes',    resolved.filter(e => e.type === 'rule_change'));
    h += _renderSection('App Development', resolved.filter(e => e.type === 'app_feature'));
    h += `</details>`;
  }

  if (!entries.length) {
    h += '<p class="placeholder-msg">Nothing posted yet.</p>';
  }

  h += '</div>';
  el.innerHTML = h;
}

function _renderSection(heading, items) {
  if (!items.length) return '';
  let h = `<div class="devlog-section">`;
  h += `<h3 class="devlog-section-heading">${esc(heading)}</h3>`;
  for (const entry of items) h += _renderCard(entry);
  h += `</div>`;
  return h;
}

function _renderCard(entry) {
  const statusLabel = DEVLOG_STATUS_LABELS[entry.status] || entry.status;
  let h = `<div class="devlog-card">`;
  h += `<div class="devlog-card-header">`;
  h += `<span class="devlog-title">${esc(entry.title)}</span>`;
  h += `<span class="devlog-status devlog-status--${esc(entry.status)}">${esc(statusLabel)}</span>`;
  h += `</div>`;
  if (entry.body) h += `<p class="devlog-body">${esc(entry.body)}</p>`;
  if (entry.target_cycle) h += `<div class="devlog-target">Target: ${esc(entry.target_cycle)}</div>`;
  h += `</div>`;
  return h;
}
