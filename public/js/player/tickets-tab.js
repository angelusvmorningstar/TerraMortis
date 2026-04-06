/* Tickets tab — player-facing ticket submission and list view */

import { apiGet, apiPost } from '../data/api.js';
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

function truncate(text, max = 120) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max) + '\u2026' : text;
}

function buildBadge(cls, label) {
  return `<span class="tk-badge ${esc(cls)}">${esc(label)}</span>`;
}

function renderList(tickets) {
  if (!tickets.length) {
    return `<p class="tk-empty">No tickets yet. Use the form above to submit one.</p>`;
  }

  return `<div class="tk-list">` + tickets.map(t => {
    const typeBadge   = buildBadge(`tk-badge-${t.type}`,   TYPE_LABELS[t.type]   || esc(t.type));
    const statusBadge = buildBadge(`tk-badge-${t.status}`, STATUS_LABELS[t.status] || esc(t.status));
    const date        = formatDate(t.created_at);
    const bodyText    = truncate(t.body);
    return `
      <div class="tk-item">
        <div class="tk-item-header">
          <span class="tk-item-title">${esc(t.title)}</span>
          ${typeBadge}
          ${statusBadge}
          <span class="tk-item-meta">${esc(date)}</span>
        </div>
        ${bodyText ? `<div class="tk-item-body">${esc(bodyText)}</div>` : ''}
      </div>`;
  }).join('') + `</div>`;
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

  async function loadTickets() {
    try {
      const tickets = await apiGet('/api/tickets');
      listEl.innerHTML = renderList(tickets);
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
