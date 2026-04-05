/* Tickets admin view — ST queue management */

import { apiGet, apiPut } from '../data/api.js';
import { esc } from '../data/helpers.js';

const TYPE_LABELS = {
  bug:      'Bug',
  feature:  'Feature',
  question: 'Question',
  other:    'Other',
};

const STATUS_LABELS = {
  open:        'Open',
  in_progress: 'In Progress',
  resolved:    'Resolved',
  closed:      'Closed',
};

const STATUS_OPTIONS = ['open', 'in_progress', 'resolved', 'closed'];
const FILTER_OPTIONS = ['all', 'open', 'in_progress', 'resolved', 'closed'];

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const dd  = String(d.getDate()).padStart(2, '0');
  const mon = d.toLocaleString('en-GB', { month: 'short' });
  const yr  = d.getFullYear();
  return `${dd} ${mon} ${yr}`;
}

function buildBadge(cls, label) {
  return `<span class="tk-badge ${esc(cls)}">${esc(label)}</span>`;
}

export async function initTicketsView(containerEl) {
  if (!containerEl) return;

  let allTickets   = [];
  let activeFilter = 'all';
  let expandedId   = null;

  containerEl.innerHTML = `<div class="tk-admin"><div id="tk-adm-inner"></div></div>`;
  const inner = containerEl.querySelector('#tk-adm-inner');

  async function load() {
    try {
      allTickets = await apiGet('/api/tickets');
    } catch (err) {
      inner.innerHTML = `<p class="tk-empty">Failed to load tickets: ${esc(err.message)}</p>`;
      return;
    }
    render();
  }

  function countByStatus(status) {
    if (status === 'all') return allTickets.length;
    return allTickets.filter(t => t.status === status).length;
  }

  function filtered() {
    if (activeFilter === 'all') return allTickets;
    return allTickets.filter(t => t.status === activeFilter);
  }

  function filterLabel(f) {
    if (f === 'all') return 'All';
    return STATUS_LABELS[f] || f;
  }

  function render() {
    const tickets = filtered();

    const filterBar = FILTER_OPTIONS.map(f => {
      const on = f === activeFilter ? ' tk-filter-btn-on' : '';
      const count = countByStatus(f);
      return `<button class="tk-filter-btn${on}" data-filter="${esc(f)}">${esc(filterLabel(f))} (${count})</button>`;
    }).join('');

    let listHtml;
    if (!tickets.length) {
      listHtml = `<p class="tk-empty">No tickets.</p>`;
    } else {
      listHtml = `<div class="tk-admin-list">` + tickets.map(t => {
        const isExpanded = String(t._id) === expandedId;
        const typeBadge   = buildBadge(`tk-badge-${t.type}`,   TYPE_LABELS[t.type]   || esc(t.type));
        const statusBadge = buildBadge(`tk-badge-${t.status}`, STATUS_LABELS[t.status] || esc(t.status));
        const date        = formatDate(t.created_at);
        const priorityHigh = t.priority === 'high';

        let detailHtml = '';
        if (isExpanded) {
          const statusOpts = STATUS_OPTIONS.map(s =>
            `<option value="${s}"${t.status === s ? ' selected' : ''}>${esc(STATUS_LABELS[s])}</option>`
          ).join('');

          detailHtml = `
            <div class="tk-admin-detail">
              <div class="tk-admin-body">${esc(t.body || '')}</div>
              <div class="tk-admin-controls">
                <div class="tk-admin-note">
                  <label>ST Note</label>
                  <textarea rows="3" data-id="${esc(String(t._id))}" data-field="st_note">${esc(t.st_note || '')}</textarea>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;align-self:flex-end;">
                  <select class="tk-status-sel" data-id="${esc(String(t._id))}" data-field="status">${statusOpts}</select>
                  <button class="tk-priority-btn${priorityHigh ? ' tk-priority-high' : ''}" data-id="${esc(String(t._id))}" data-priority="${priorityHigh ? 'normal' : 'high'}">
                    Priority: ${priorityHigh ? 'High' : 'Normal'}
                  </button>
                </div>
              </div>
            </div>`;
        }

        const rowClass = isExpanded ? ' tk-admin-row-expanded' : '';
        return `
          <div class="tk-admin-row${rowClass}" data-id="${esc(String(t._id))}">
            <div class="tk-admin-top" data-toggle="${esc(String(t._id))}">
              <span class="tk-admin-title">${esc(t.title)}</span>
              ${typeBadge}
              ${statusBadge}
              <span class="tk-admin-sub">${esc(t.submitted_by || '')} &middot; ${esc(date)}</span>
            </div>
            ${detailHtml}
          </div>`;
      }).join('') + `</div>`;
    }

    inner.innerHTML = `
      <div class="tk-filter-bar">${filterBar}</div>
      ${listHtml}`;

    bindEvents();
  }

  function bindEvents() {
    // Filter buttons
    inner.querySelectorAll('.tk-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        activeFilter = btn.dataset.filter;
        render();
      });
    });

    // Row expand/collapse
    inner.querySelectorAll('[data-toggle]').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.toggle;
        expandedId = expandedId === id ? null : id;
        render();
      });
    });

    // Status select — save on change
    inner.querySelectorAll('.tk-status-sel').forEach(sel => {
      sel.addEventListener('change', async () => {
        const id = sel.dataset.id;
        try {
          await apiPut(`/api/tickets/${id}`, { status: sel.value });
          const t = allTickets.find(x => String(x._id) === id);
          if (t) { t.status = sel.value; if (sel.value === 'resolved' || sel.value === 'closed') t.resolved_at = new Date().toISOString(); }
          render();
        } catch (err) {
          // Silently re-render to revert selection
          render();
        }
      });
    });

    // ST Note textarea — save on blur
    inner.querySelectorAll('.tk-admin-note textarea').forEach(ta => {
      ta.addEventListener('blur', async () => {
        const id = ta.dataset.id;
        try {
          await apiPut(`/api/tickets/${id}`, { st_note: ta.value });
          const t = allTickets.find(x => String(x._id) === id);
          if (t) t.st_note = ta.value;
        } catch (_) {
          // No visible feedback needed — note will persist in textarea
        }
      });
    });

    // Priority toggle button
    inner.querySelectorAll('.tk-priority-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id       = btn.dataset.id;
        const newPriority = btn.dataset.priority;
        try {
          await apiPut(`/api/tickets/${id}`, { priority: newPriority });
          const t = allTickets.find(x => String(x._id) === id);
          if (t) t.priority = newPriority;
          render();
        } catch (_) {
          render();
        }
      });
    });
  }

  await load();
}
