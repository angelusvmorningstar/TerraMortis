/* Shared read-only renderer for questionnaire fields.
 * Used by:
 *   - public/js/tabs/questionnaire-form.js (when the form is locked / submitted / approved)
 *   - public/js/tabs/archive-tab.js (dossier detail view — Questionnaire Details section)
 *
 * Keeps rendering of dynamic lists, tag-lists, radio/select labels, and plain values
 * in one place so both surfaces stay visually consistent.
 */

import { esc } from '../data/helpers.js';

export function renderReadOnlyField(q, value) {
  const isEmpty = Array.isArray(value) ? value.length === 0 : !value;
  if (isEmpty) return '';
  let h = `<div class="qf-field">`;
  h += `<label class="qf-label">${esc(q.label)}</label>`;

  if (q.type === 'dynamic_list' && !Array.isArray(value)) {
    // Legacy import: stored as a plain string rather than structured array
    h += `<div class="qf-readonly-value">${esc(value)}</div>`;
  } else if (q.type === 'dynamic_list') {
    h += `<div class="qf-dynlist-readonly">`;
    for (const entry of value) {
      h += `<div class="qf-dynlist-card">`;
      for (const sf of q.subfields) {
        if (entry[sf.key]) {
          h += `<div class="qf-dynlist-card-row">`;
          h += `<span class="qf-dynlist-card-label">${esc(sf.label)}</span>`;
          h += `<span class="qf-dynlist-card-value">${esc(entry[sf.key])}</span>`;
          h += `</div>`;
        }
      }
      h += `</div>`;
    }
    h += `</div>`;
  } else if (Array.isArray(value)) {
    // checkbox / character_select: render as tags
    const labels = value.map(v => {
      const opt = (q.options || []).find(o => o.value === v);
      return esc(opt ? opt.label : v);
    });
    h += `<div class="qf-tag-list">${labels.map(l => `<span class="qf-tag">${l}</span>`).join('')}</div>`;
  } else if (q.type === 'radio' || q.type === 'select') {
    // Resolve option label; fall back to raw value for legacy free-text imports
    const opt = (q.options || []).find(o => o.value === value);
    h += opt
      ? `<div class="qf-tag-list"><span class="qf-tag">${esc(opt.label)}</span></div>`
      : `<div class="qf-readonly-value">${esc(value)}</div>`;
  } else {
    h += `<div class="qf-readonly-value">${esc(value)}</div>`;
  }

  h += '</div>';
  return h;
}
