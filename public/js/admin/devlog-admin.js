import { apiGet, apiPost, apiPatch, apiDelete } from '../data/api.js';
import { esc } from '../data/helpers.js';

const STATUS_OPTS = [
  { value: 'considering', label: 'Under Consideration' },
  { value: 'confirmed',   label: 'Confirmed' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'implemented', label: 'Implemented' },
  { value: 'deferred',    label: 'Deferred' },
];

const TYPE_OPTS = [
  { value: 'rule_change', label: 'Rule Change' },
  { value: 'app_feature', label: 'App Feature' },
];

let _entries   = [];
let _editingId = null;

export async function initDevlogAdmin(contentEl) {
  contentEl.innerHTML = '<p class="placeholder">Loading…</p>';
  try {
    _entries = await apiGet('/api/devlog');
  } catch (err) {
    contentEl.innerHTML = `<p class="placeholder">Failed: ${esc(err.message)}</p>`;
    return;
  }
  _editingId = null;
  _render(contentEl);
}

function _render(root) {
  let h = `<div class="dl-admin-toolbar"><button class="btn-sm dl-add-btn">+ Add Entry</button></div>`;
  if (_editingId === 'new') h += _form(null);
  h += `<div class="dl-admin-list">`;
  for (const entry of _entries) {
    h += _editingId === entry._id ? _form(entry) : _card(entry);
  }
  h += `</div>`;
  root.innerHTML = h;
  _bindEvents(root);
}

function _form(entry) {
  const id         = entry?._id || '';
  const statusOpts = STATUS_OPTS.map(o =>
    `<option value="${o.value}"${entry?.status === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
  ).join('');
  const typeOpts = TYPE_OPTS.map(o =>
    `<option value="${o.value}"${entry?.type === o.value ? ' selected' : ''}>${esc(o.label)}</option>`
  ).join('');
  return `
    <form class="dl-form" data-id="${esc(id)}">
      <div class="form-grid">
        <div class="form-row">
          <label class="form-label">Type</label>
          <select class="form-select" name="type">${typeOpts}</select>
        </div>
        <div class="form-row">
          <label class="form-label">Status</label>
          <select class="form-select" name="status">${statusOpts}</select>
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">Title</label>
        <input class="form-input" type="text" name="title" value="${esc(entry?.title || '')}" required>
      </div>
      <div class="form-row">
        <label class="form-label">Body</label>
        <textarea class="form-input" name="body" rows="4">${esc(entry?.body || '')}</textarea>
      </div>
      <div class="form-row">
        <label class="form-label">Target cycle</label>
        <input class="form-input" type="text" name="target_cycle" value="${esc(entry?.target_cycle || '')}" placeholder="e.g. Game 4">
      </div>
      <label class="dl-check-label">
        <input type="checkbox" name="highlight"${entry?.highlight ? ' checked' : ''}>
        Highlight as new (show in the player "Recently Shipped" section)
      </label>
      <div class="dl-form-actions">
        <button type="submit" class="btn-sm">${entry ? 'Save' : 'Create'}</button>
        <button type="button" class="btn-sm dl-cancel-btn">Cancel</button>
        <span class="dl-form-error"></span>
      </div>
    </form>`;
}

function _card(entry) {
  const statusLabel = STATUS_OPTS.find(o => o.value === entry.status)?.label || entry.status;
  const typeLabel   = TYPE_OPTS.find(o => o.value === entry.type)?.label   || entry.type;
  return `
    <div class="dl-card" data-id="${esc(entry._id)}">
      <div class="dl-card-meta">
        <span class="dl-type-chip">${esc(typeLabel)}</span>
        <span class="dl-status-chip dl-status--${esc(entry.status)}">${esc(statusLabel)}</span>
        ${entry.highlight ? `<span class="dl-new-chip">New</span>` : ''}
        ${entry.target_cycle ? `<span class="dl-target">Target: ${esc(entry.target_cycle)}</span>` : ''}
      </div>
      <div class="dl-card-title">${esc(entry.title)}</div>
      ${entry.body ? `<div class="dl-card-body">${esc(entry.body)}</div>` : ''}
      <div class="dl-card-actions">
        <button class="btn-sm dl-edit-btn">Edit</button>
        <button class="btn-sm dl-delete-btn" style="color:var(--crim)">Delete</button>
      </div>
    </div>`;
}

function _bindEvents(root) {
  root.querySelector('.dl-add-btn')?.addEventListener('click', () => {
    _editingId = 'new';
    _render(root);
  });

  root.querySelectorAll('.dl-edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _editingId = btn.closest('.dl-card').dataset.id;
      _render(root);
    });
  });

  root.querySelectorAll('.dl-delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.dl-card').dataset.id;
      if (!confirm('Delete this devlog entry?')) return;
      try {
        await apiDelete(`/api/devlog/${id}`);
        _entries = _entries.filter(e => e._id !== id);
        _render(root);
      } catch (err) {
        alert(`Delete failed: ${err.message}`);
      }
    });
  });

  root.querySelectorAll('.dl-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _editingId = null;
      _render(root);
    });
  });

  root.querySelectorAll('.dl-form').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const errEl = form.querySelector('.dl-form-error');
      const id    = form.dataset.id;
      const data  = Object.fromEntries(new FormData(form));
      // FormData omits an unchecked box and gives "on" when checked; the schema
      // wants a real boolean, so read the element directly.
      data.highlight = !!form.elements.highlight?.checked;
      try {
        if (!id) {
          const created = await apiPost('/api/devlog', data);
          _entries.unshift(created);
        } else {
          const updated = await apiPatch(`/api/devlog/${id}`, data);
          const idx = _entries.findIndex(e => e._id === id);
          if (idx !== -1) _entries[idx] = updated;
        }
        _editingId = null;
        _render(root);
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  });
}
