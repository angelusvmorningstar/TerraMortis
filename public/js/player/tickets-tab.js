/* Tickets tab — player-facing ticket submission and list view */

import { apiGet, apiPost, apiPut } from '../data/api.js';
import { esc } from '../data/helpers.js';

const TYPE_LABELS = {
  bug:      'Bug',
  feature:  'Feature',
  question: 'Question',
  sheet:    'Sheet Issue',
  other:    'Other',
};

const STATUS_LABELS = {
  open:        'Open',
  in_progress: 'In Progress',
  resolved:    'Resolved',
  closed:      'Closed',
};

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

export async function renderTicketsTab(containerEl) {
  if (!containerEl) return;

  containerEl.innerHTML = `
    <div class="tk-tab">
      <div class="tk-submit-form">
        <h4>Submit a Ticket</h4>
        <div class="tk-form-row">
          <label class="tk-form-label" for="tk-type">Type</label>
          <select class="tk-select" id="tk-type">
            <option value="bug">Bug Report</option>
            <option value="feature">Feature Request</option>
            <option value="question">Question</option>
            <option value="sheet">Sheet Issue</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="tk-form-row">
          <label class="tk-form-label" for="tk-title">Title</label>
          <input class="tk-input" id="tk-title" type="text" placeholder="Short summary" maxlength="200">
        </div>
        <div class="tk-form-row">
          <label class="tk-form-label" for="tk-body">Details</label>
          <textarea class="tk-textarea" id="tk-body" rows="4" placeholder="Describe the issue or request..."></textarea>
        </div>
        <div id="tk-error" class="tk-error" style="display:none"></div>
        <button class="tk-btn-submit" id="tk-submit">Submit</button>
      </div>
      <div id="tk-list-container"></div>
    </div>`;

  const typeEl   = containerEl.querySelector('#tk-type');
  const titleEl  = containerEl.querySelector('#tk-title');
  const bodyEl   = containerEl.querySelector('#tk-body');
  const errorEl  = containerEl.querySelector('#tk-error');
  const submitEl = containerEl.querySelector('#tk-submit');
  const listEl   = containerEl.querySelector('#tk-list-container');

  let allTickets = [];
  let expandedId = null;

  function render() {
    if (!allTickets.length) {
      listEl.innerHTML = `<p class="tk-empty">No tickets yet. Use the form above to submit one.</p>`;
      return;
    }

    listEl.innerHTML = `<div class="tk-list">` + allTickets.map(t => {
      const isExpanded  = String(t._id) === expandedId;
      const typeBadge   = buildBadge(`tk-badge-${t.type}`,   TYPE_LABELS[t.type]   || esc(t.type));
      const statusBadge = buildBadge(`tk-badge-${t.status}`, STATUS_LABELS[t.status] || esc(t.status));
      const date        = formatDate(t.created_at);
      const canEdit     = t.status === 'open';

      let detailHtml = '';
      if (isExpanded) {
        if (canEdit) {
          detailHtml = `
            <div class="tk-detail">
              <div class="tk-form-row">
                <label class="tk-form-label">Title</label>
                <input class="tk-input tk-edit-title" data-id="${esc(String(t._id))}" value="${esc(t.title)}" maxlength="200">
              </div>
              <div class="tk-form-row">
                <label class="tk-form-label">Details</label>
                <textarea class="tk-textarea tk-edit-body" data-id="${esc(String(t._id))}" rows="4">${esc(t.body || '')}</textarea>
              </div>
              <div class="tk-edit-error" style="display:none"></div>
              <button class="tk-btn-save" data-id="${esc(String(t._id))}">Save Changes</button>
            </div>`;
        } else {
          detailHtml = `<div class="tk-detail"><div class="tk-item-body-full">${esc(t.body || '')}</div></div>`;
        }
      }

      const rowClass = isExpanded ? ' tk-item-expanded' : '';
      const editHint = canEdit && !isExpanded ? '<span class="tk-edit-hint">click to edit</span>' : '';
      return `
        <div class="tk-item${rowClass}">
          <div class="tk-item-header tk-item-toggle" data-id="${esc(String(t._id))}">
            <span class="tk-item-title">${esc(t.title)}</span>
            ${typeBadge}
            ${statusBadge}
            ${editHint}
            <span class="tk-item-meta">${esc(date)}</span>
            <span class="tk-item-chevron">${isExpanded ? '\u2303' : '\u2304'}</span>
          </div>
          ${detailHtml}
        </div>`;
    }).join('') + `</div>`;

    bindListEvents();
  }

  function bindListEvents() {
    listEl.querySelectorAll('.tk-item-toggle').forEach(el => {
      el.addEventListener('click', () => {
        const id = el.dataset.id;
        expandedId = expandedId === id ? null : id;
        render();
      });
    });

    listEl.querySelectorAll('.tk-btn-save').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id      = btn.dataset.id;
        const row     = btn.closest('.tk-item');
        const titleIn = row.querySelector('.tk-edit-title');
        const bodyIn  = row.querySelector('.tk-edit-body');
        const errEl   = row.querySelector('.tk-edit-error');

        const newTitle = titleIn.value.trim();
        const newBody  = bodyIn.value.trim();

        if (!newTitle) {
          errEl.textContent = 'Title cannot be empty.';
          errEl.style.display = '';
          return;
        }
        errEl.style.display = 'none';
        btn.disabled = true;

        try {
          await apiPut(`/api/tickets/${id}`, { title: newTitle, body: newBody });
          const t = allTickets.find(x => String(x._id) === id);
          if (t) { t.title = newTitle; t.body = newBody; }
          expandedId = null;
          render();
        } catch (err) {
          errEl.textContent = err.message || 'Failed to save.';
          errEl.style.display = '';
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function loadTickets() {
    try {
      allTickets = await apiGet('/api/tickets');
      render();
    } catch (err) {
      listEl.innerHTML = `<p class="tk-empty">Failed to load tickets: ${esc(err.message)}</p>`;
    }
  }

  submitEl.addEventListener('click', async () => {
    errorEl.style.display = 'none';
    errorEl.textContent = '';

    const title = titleEl.value.trim();
    const body  = bodyEl.value.trim();
    const type  = typeEl.value;

    if (!title) {
      errorEl.textContent = 'Title is required.';
      errorEl.style.display = '';
      return;
    }

    submitEl.disabled = true;
    try {
      await apiPost('/api/tickets', { title, body, type });
      titleEl.value = '';
      bodyEl.value  = '';
      typeEl.value  = 'bug';
      await loadTickets();
    } catch (err) {
      errorEl.textContent = err.message || 'Failed to submit ticket.';
      errorEl.style.display = '';
    } finally {
      submitEl.disabled = false;
    }
  });

  await loadTickets();
}
