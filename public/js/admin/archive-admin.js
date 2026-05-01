/* AR-3: Admin archive management for a character.
 * Lists existing documents; provides .docx upload with type/cycle/title fields. */

import { apiGet, apiPost } from '../data/api.js';
import { displayName } from '../data/helpers.js';
import { renderSheet } from '../editor/sheet.js';
import { openInlineEditor } from '../editor/archive-inline-editor.js';

function esc(s) {
  const d = document.createElement('div');
  d.textContent = String(s ?? '');
  return d.innerHTML;
}

const TYPE_LABELS = {
  dossier:            'Dossier',
  downtime_response:  'Downtime Response',
  history_submission: 'Character History',
};

const TYPE_OPTIONS = Object.entries(TYPE_LABELS)
  .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

let _el   = null;
let _char = null;

export async function initAdminArchive(el, char) {
  _el   = el;
  _char = char;
  await renderArchiveAdmin();
}

async function renderArchiveAdmin() {
  _el.innerHTML = '<p class="placeholder">Loading archive\u2026</p>';

  let docs = [];
  try {
    docs = await apiGet(`/api/archive_documents?character_id=${_char._id}`);
  } catch (err) {
    _el.innerHTML = `<p class="placeholder">Failed to load: ${esc(err.message)}</p>`;
    return;
  }

  const sorted = [...docs].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return (b.cycle ?? 0) - (a.cycle ?? 0);
  });

  let h = '<div class="ar-admin-shell">';

  // Header
  h += '<div class="ar-admin-header">';
  h += `<span class="ar-admin-title">Archive &mdash; ${esc(displayName(_char))}</span>`;
  h += `<button class="dt-btn" id="ar-back-sheet">&#8592; Sheet</button>`;
  h += '</div>';

  // Document list
  h += '<div class="ar-admin-list">';
  if (!sorted.length) {
    h += '<p class="placeholder">No documents yet.</p>';
  } else {
    h += '<table class="ar-admin-table">';
    h += '<thead><tr><th>Type</th><th>Title</th><th>Cycle</th><th>Created</th></tr></thead><tbody>';
    for (const doc of sorted) {
      const created = doc.created_at
        ? new Date(doc.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : '\u2014';
      h += `<tr>`;
      h += `<td>${esc(TYPE_LABELS[doc.type] || doc.type)}</td>`;
      h += `<td>${esc(doc.title || '\u2014')}</td>`;
      h += `<td>${doc.cycle != null ? doc.cycle : '\u2014'}</td>`;
      h += `<td>${esc(created)}</td>`;
      h += `</tr>`;
    }
    h += '</tbody></table>';
  }
  h += '</div>';

  // Create blank
  h += '<div class="ar-create-row">';
  h += '<button class="dt-btn" id="ar-new-dossier">+ New Dossier</button>';
  h += '<button class="dt-btn" id="ar-new-history">+ New History</button>';
  h += '<span id="ar-create-status" class="ar-upload-status"></span>';
  h += '</div>';

  // Upload form
  h += '<div class="ar-upload-form">';
  h += '<div class="ar-upload-title">Upload Document</div>';
  h += '<div class="ar-upload-fields">';
  h += `<label class="ar-upload-label">File (.docx)
    <input type="file" id="ar-file" accept=".docx">
  </label>`;
  h += `<label class="ar-upload-label">Type
    <select id="ar-type" class="ar-upload-select">${TYPE_OPTIONS}</select>
  </label>`;
  h += `<label class="ar-upload-label">Cycle <span class="ar-optional">(optional)</span>
    <input type="number" id="ar-cycle" class="ar-upload-input" min="1" placeholder="e.g. 2">
  </label>`;
  h += `<label class="ar-upload-label">Title <span class="ar-optional">(optional)</span>
    <input type="text" id="ar-title" class="ar-upload-input" placeholder="Auto-generated if blank">
  </label>`;
  h += '</div>';
  h += '<div class="ar-upload-actions">';
  h += '<button class="dt-btn" id="ar-upload-btn">Upload</button>';
  h += '<span id="ar-upload-status" class="ar-upload-status"></span>';
  h += '</div>';
  h += '</div>';

  h += '</div>';
  _el.innerHTML = h;

  document.getElementById('ar-back-sheet').addEventListener('click', () => {
    renderSheet(_char, _el);
  });

  document.getElementById('ar-new-dossier').addEventListener('click', () => handleCreateBlank('dossier', 'Dossier'));
  document.getElementById('ar-new-history').addEventListener('click', () => handleCreateBlank('history_submission', 'Character History'));

  document.getElementById('ar-upload-btn').addEventListener('click', handleUpload);
}

async function handleCreateBlank(type, title) {
  const statusEl = document.getElementById('ar-create-status');
  statusEl.textContent = 'Creating…';

  try {
    const doc = await apiPost('/api/archive_documents', {
      character_id: String(_char._id),
      type,
      title,
      content_html: '',
      visible_to_player: true,
    });

    await renderArchiveAdmin();
    openInlineEditor(_el, doc._id, '', {
      onSaved:     () => renderArchiveAdmin(),
      onCancelled: () => renderArchiveAdmin(),
    });
  } catch (err) {
    const msg = err?.message || 'Unknown error';
    statusEl.textContent = msg.includes('already has') ? msg : `Create failed: ${msg}`;
  }
}

async function handleUpload() {
  const fileInput  = document.getElementById('ar-file');
  const typeSelect = document.getElementById('ar-type');
  const cycleInput = document.getElementById('ar-cycle');
  const titleInput = document.getElementById('ar-title');
  const statusEl   = document.getElementById('ar-upload-status');

  const file = fileInput.files?.[0];
  if (!file) { statusEl.textContent = 'Select a .docx file first.'; return; }

  const params = new URLSearchParams({
    character_id: String(_char._id),
    type:         typeSelect.value,
  });
  if (cycleInput.value) params.set('cycle', cycleInput.value);
  if (titleInput.value.trim()) params.set('title', titleInput.value.trim());

  const btn = document.getElementById('ar-upload-btn');
  btn.disabled = true;
  statusEl.textContent = 'Uploading\u2026';

  try {
    const token = localStorage.getItem('tm_auth_token');
    const res = await fetch(`/api/archive_documents/upload?${params}`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: file,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(err.message || res.statusText);
    }

    statusEl.textContent = 'Uploaded successfully.';
    await renderArchiveAdmin(); // refresh list
  } catch (err) {
    statusEl.textContent = `Upload failed: ${err.message}`;
    btn.disabled = false;
  }
}
