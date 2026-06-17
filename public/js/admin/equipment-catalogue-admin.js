/**
 * Equipment Catalogue admin view (ECM-6, issue #873).
 *
 * Epic ECM (specs/epic-ecm-equipment-catalogue-migration.md). Browser-side
 * CRUD over the Mongo-backed equipment_catalogue established by ECM-1.
 *
 * UX (epic D4 / D5 / D6):
 *   - List view: filter by bucket, search by name, sort by availability.
 *     Each row shows name / bucket / availability / holders count / actions.
 *   - Create form: bucket selector reveals bucket-specific fields. Soft
 *     duplicate warning when an existing item matches by name+bucket
 *     (case-insensitive). Non-blocking — ST can override.
 *   - Edit form: same field set + impact warning banner ("Held by N
 *     characters; edits will apply to all") sourced from
 *     GET /api/equipment_catalogue/:id/impact.
 *   - Delete control: hard-disabled with explanatory tooltip when
 *     holders > 0. API enforces 409 server-side; UI mirrors the gate.
 *
 * Holders count is derived **client-side** from the character set passed
 * by switchDomain. The server's /:id/impact endpoint is reused for the
 * edit-form banner only (it does the same join but is the SSOT for the
 * delete gate; we render its message inline if the API returns 409).
 *
 * Write paths broadcast `broadcastCatalogueUpdate` server-side (wired in
 * ECM-1); ECM-4 / ECM-5 dropdown clients refresh on receipt. This view
 * refreshes its own list via `loadItems()` on each successful mutation.
 */

import { apiGet, apiPost, apiPatch, apiRaw } from '../data/api.js';
import { esc } from '../data/helpers.js';

const BUCKETS = ['weapon', 'armour', 'equipment', 'asset'];

// Bucket → list of optional fields shown in create/edit forms. Mirrors
// the EQ-1 null-template pattern (EQ_NULLS / WP_NULLS / AR_NULLS / AS_NULLS).
const BUCKET_FIELDS = {
  weapon:    ['damage_mod', 'damage_type', 'weapon_type'],
  armour:    ['armour_value', 'defence_penalty'],
  equipment: ['skill_domain', 'bonus_dice'],
  asset:     ['mechanical_effect'],
};

// Module-level state — re-rendered on every mutation. Single-view module
// (admin sidebar is mutually exclusive), so a singleton is fine.
let _container = null;
let _allChars = [];
let _items = [];
let _filterBucket = '';
let _searchName = '';
let _sortKey = 'name';        // 'name' | 'availability' | 'bucket'
let _sortDir = 'asc';
let _editingId = null;        // ObjectId-string or null when create mode

/**
 * Compute holders count per catalogue _id from the character set.
 * Returns Map<string-id, number>. Pre-ECM-3 character.equipment[].catalogue_id
 * is still a string slug, so this returns 0 for everything; post-ECM-3 it
 * resolves correctly. The delete gate is API-enforced regardless.
 */
function buildHoldersIndex(chars) {
  const idx = new Map();
  for (const c of chars || []) {
    for (const item of c.equipment || []) {
      const key = String(item.catalogue_id);
      idx.set(key, (idx.get(key) || 0) + 1);
    }
  }
  return idx;
}

export async function initEquipmentCatalogueAdmin(container, chars) {
  _container = container;
  _allChars = Array.isArray(chars) ? chars : [];
  _editingId = null;
  _container.innerHTML = '<div class="ec-admin"><div class="ec-empty">Loading equipment catalogue…</div></div>';
  await loadItems();
  render();
}

async function loadItems() {
  try {
    _items = await apiGet('/api/equipment_catalogue');
  } catch (err) {
    console.error('[equipment-catalogue-admin] load failed:', err);
    _items = [];
  }
}

function filteredSorted() {
  const search = (_searchName || '').toLowerCase();
  let rows = _items.filter(it => {
    if (_filterBucket && it.bucket !== _filterBucket) return false;
    if (search && !(it.name || '').toLowerCase().includes(search)) return false;
    return true;
  });
  const dir = _sortDir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    let av, bv;
    if (_sortKey === 'availability') { av = a.availability ?? -1; bv = b.availability ?? -1; }
    else if (_sortKey === 'bucket') { av = a.bucket || ''; bv = b.bucket || ''; }
    else { av = (a.name || '').toLowerCase(); bv = (b.name || '').toLowerCase(); }
    if (av < bv) return -1 * dir;
    if (av > bv) return  1 * dir;
    return 0;
  });
  return rows;
}

function render() {
  if (!_container) return;
  const holders = buildHoldersIndex(_allChars);
  const rows = filteredSorted();
  const bucketOpts = ['<option value="">All buckets</option>']
    .concat(BUCKETS.map(b => `<option value="${b}"${_filterBucket === b ? ' selected' : ''}>${b}</option>`))
    .join('');

  const html = `
    <div class="ec-admin">
      <div class="ec-toolbar">
        <label class="ec-toolbar-field">
          <span>Bucket</span>
          <select id="ec-filter-bucket">${bucketOpts}</select>
        </label>
        <label class="ec-toolbar-field">
          <span>Name search</span>
          <input id="ec-filter-search" type="text" value="${esc(_searchName)}" placeholder="filter…">
        </label>
        <label class="ec-toolbar-field">
          <span>Sort by</span>
          <select id="ec-sort-key">
            <option value="name"${_sortKey === 'name' ? ' selected' : ''}>Name</option>
            <option value="bucket"${_sortKey === 'bucket' ? ' selected' : ''}>Bucket</option>
            <option value="availability"${_sortKey === 'availability' ? ' selected' : ''}>Availability</option>
          </select>
          <button id="ec-sort-dir" class="ec-btn-sm" title="Toggle direction">${_sortDir === 'asc' ? '↑' : '↓'}</button>
        </label>
        <button id="ec-new" class="ec-btn-primary">+ New item</button>
      </div>

      <div class="ec-count">${rows.length} of ${_items.length} item${_items.length === 1 ? '' : 's'}</div>

      <table class="ec-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Bucket</th>
            <th>Avail.</th>
            <th>Holders</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(it => renderRow(it, holders.get(String(it._id)) || 0)).join('')}
        </tbody>
      </table>

      <div id="ec-form-host"></div>
    </div>
  `;
  _container.innerHTML = html;
  wireListEvents();
}

function renderRow(it, holdersCount) {
  const deleteAttrs = holdersCount > 0
    ? `disabled title="Held by ${holdersCount} character${holdersCount === 1 ? '' : 's'} — remove from holders before deleting."`
    : '';
  return `
    <tr data-id="${esc(String(it._id))}">
      <td>${esc(it.name || '')}</td>
      <td><span class="ec-bucket-tag ec-bucket-${esc(it.bucket || '')}">${esc(it.bucket || '')}</span></td>
      <td>${it.availability ?? '—'}</td>
      <td>${holdersCount > 0 ? `<strong>${holdersCount}</strong>` : '0'}</td>
      <td class="ec-row-actions">
        <button class="ec-btn-sm" data-action="edit">Edit</button>
        <button class="ec-btn-sm ec-btn-danger" data-action="delete" ${deleteAttrs}>Delete</button>
      </td>
    </tr>
  `;
}

function wireListEvents() {
  const $ = id => document.getElementById(id);
  $('ec-filter-bucket')?.addEventListener('change', e => { _filterBucket = e.target.value; render(); });
  $('ec-filter-search')?.addEventListener('input', e => { _searchName = e.target.value; render(); });
  $('ec-sort-key')?.addEventListener('change', e => { _sortKey = e.target.value; render(); });
  $('ec-sort-dir')?.addEventListener('click', () => { _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'; render(); });
  $('ec-new')?.addEventListener('click', () => openCreateForm());

  _container.querySelectorAll('.ec-table tbody tr').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditForm(id));
    const delBtn = row.querySelector('[data-action="delete"]');
    if (delBtn && !delBtn.disabled) {
      delBtn.addEventListener('click', () => onDelete(id));
    }
  });
}

// ── Forms ──────────────────────────────────────────────────────────────────

function openCreateForm() {
  _editingId = null;
  renderForm({ bucket: 'equipment', tags: [] });
}

async function openEditForm(id) {
  _editingId = id;
  const item = _items.find(it => String(it._id) === String(id));
  if (!item) return;
  // Fetch authoritative impact info for the banner. The list-view holders
  // count is a client-side join (may be stale); the API count is SSOT.
  let impact = { holders: 0, character_names: [] };
  try {
    impact = await apiGet(`/api/equipment_catalogue/${id}/impact`);
  } catch (err) {
    console.warn('[equipment-catalogue-admin] impact fetch failed:', err);
  }
  renderForm(item, impact);
}

function renderForm(initial, impact = null) {
  const host = document.getElementById('ec-form-host');
  if (!host) return;
  const isEdit = !!_editingId;
  const bucket = initial.bucket || 'equipment';
  const bucketOpts = BUCKETS.map(b =>
    `<option value="${b}"${bucket === b ? ' selected' : ''}>${b}</option>`
  ).join('');

  const banner = isEdit && impact && impact.holders > 0
    ? `<div class="ec-impact-banner">
         <strong>Held by ${impact.holders} character${impact.holders === 1 ? '' : 's'}.</strong>
         Edits will apply to all current holders.
         <span class="ec-impact-list">(${impact.character_names.map(esc).join(', ')})</span>
       </div>`
    : '';

  host.innerHTML = `
    <div class="ec-form-panel">
      <div class="ec-form-header">
        <h3>${isEdit ? 'Edit item' : 'New item'}</h3>
        <button id="ec-form-close" class="ec-btn-sm">Close</button>
      </div>
      ${banner}
      <div class="ec-form-grid">
        ${isEdit
          ? `<div class="ec-form-field"><label>Bucket</label><div class="ec-form-readonly">${esc(bucket)} <span class="ec-form-hint">(immutable — delete + recreate to change bucket)</span></div></div>`
          : `<div class="ec-form-field"><label>Bucket</label><select id="ec-f-bucket">${bucketOpts}</select></div>`
        }
        <div class="ec-form-field">
          <label>Name *</label>
          <input id="ec-f-name" type="text" value="${esc(initial.name || '')}" required>
        </div>
        <div class="ec-form-field ec-form-field--wide">
          <label>Description</label>
          <textarea id="ec-f-description" rows="3">${esc(initial.description || '')}</textarea>
        </div>
        <div class="ec-form-field">
          <label>Availability (0-5)</label>
          <input id="ec-f-availability" type="number" min="0" max="5" value="${initial.availability ?? ''}">
        </div>
        <div class="ec-form-field">
          <label>Tags <span class="ec-form-hint">(comma-separated)</span></label>
          <input id="ec-f-tags" type="text" value="${esc((initial.tags || []).join(', '))}">
        </div>
        <div id="ec-bucket-fields" class="ec-form-field--wide">
          ${renderBucketFields(bucket, initial)}
        </div>
      </div>
      <div class="ec-form-actions">
        <span id="ec-form-msg" class="ec-form-msg"></span>
        <button id="ec-form-save" class="ec-btn-primary">${isEdit ? 'Save changes' : 'Create item'}</button>
      </div>
    </div>
  `;
  wireFormEvents(initial);
}

function renderBucketFields(bucket, initial) {
  const fields = BUCKET_FIELDS[bucket] || [];
  if (!fields.length) return '';
  const labels = {
    damage_mod: 'Damage mod',
    damage_type: 'Damage type (lethal / bashing)',
    weapon_type: 'Weapon type',
    armour_value: 'Armour value',
    defence_penalty: 'Defence penalty',
    skill_domain: 'Skill domain',
    bonus_dice: 'Bonus dice',
    mechanical_effect: 'Mechanical effect',
  };
  const numericFields = new Set(['damage_mod', 'armour_value', 'defence_penalty', 'bonus_dice']);
  const longFields = new Set(['mechanical_effect']);
  return `<fieldset class="ec-bucket-fieldset"><legend>${bucket}-specific</legend>${
    fields.map(f => {
      const val = initial[f];
      const type = numericFields.has(f) ? 'number' : 'text';
      const inputHtml = longFields.has(f)
        ? `<textarea id="ec-f-${f}" rows="2">${esc(val ?? '')}</textarea>`
        : `<input id="ec-f-${f}" type="${type}" value="${esc(val ?? '')}">`;
      return `<div class="ec-form-field"><label>${labels[f] || f}</label>${inputHtml}</div>`;
    }).join('')
  }</fieldset>`;
}

function wireFormEvents(initial) {
  const $ = id => document.getElementById(id);
  $('ec-form-close')?.addEventListener('click', () => {
    document.getElementById('ec-form-host').innerHTML = '';
    _editingId = null;
  });
  $('ec-f-bucket')?.addEventListener('change', e => {
    // Re-render only the bucket-specific fieldset; keep other field values intact.
    const fresh = collectFormValues(false);
    fresh.bucket = e.target.value;
    document.getElementById('ec-bucket-fields').innerHTML = renderBucketFields(fresh.bucket, fresh);
  });
  $('ec-form-save')?.addEventListener('click', () => onSave(initial));
}

/**
 * Read current form values. `coerce=true` casts numeric fields to numbers /
 * null for the API. `coerce=false` (used by bucket-switch re-render) keeps
 * raw strings so the form preserves user input across renders.
 */
function collectFormValues(coerce = true) {
  const $ = id => document.getElementById(id);
  const bucket = $('ec-f-bucket')?.value || (_editingId ? (_items.find(it => String(it._id) === String(_editingId))?.bucket) : 'equipment');
  const name = ($('ec-f-name')?.value || '').trim();
  const description = ($('ec-f-description')?.value || '').trim() || null;
  const availRaw = $('ec-f-availability')?.value;
  const availability = availRaw === '' || availRaw === undefined ? null : Number(availRaw);
  const tagsRaw = $('ec-f-tags')?.value || '';
  const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);

  const out = { bucket, name, description, availability, tags };

  const fields = BUCKET_FIELDS[bucket] || [];
  const numericFields = new Set(['damage_mod', 'armour_value', 'defence_penalty', 'bonus_dice']);
  for (const f of fields) {
    const raw = $(`ec-f-${f}`)?.value;
    if (raw === undefined) continue;
    if (!coerce) { out[f] = raw; continue; }
    if (raw === '' || raw === null) { out[f] = null; continue; }
    out[f] = numericFields.has(f) ? Number(raw) : raw;
  }
  return out;
}

function showFormMsg(text, kind = 'info') {
  const el = document.getElementById('ec-form-msg');
  if (!el) return;
  el.textContent = text;
  el.className = `ec-form-msg ec-form-msg--${kind}`;
}

async function onSave(initial) {
  const values = collectFormValues(true);
  if (!values.name) { showFormMsg('Name is required.', 'error'); return; }
  if (!values.bucket) { showFormMsg('Bucket is required.', 'error'); return; }

  if (!_editingId) {
    // Soft duplicate warning per epic D6 — non-blocking. Match by
    // name+bucket, case-insensitive.
    const dup = _items.find(it =>
      it.bucket === values.bucket &&
      (it.name || '').toLowerCase() === values.name.toLowerCase()
    );
    if (dup && !confirm(
      `An item with name "${dup.name}" already exists in bucket "${dup.bucket}". ` +
      `Continue anyway? (Inspect the existing item by closing this form.)`
    )) return;
  }

  showFormMsg('Saving…', 'info');
  try {
    if (_editingId) {
      // PATCH — only send updatable fields. The server allowlist also
      // strips, but pruning client-side keeps the payload small.
      const { bucket: _b, ...patchBody } = values;
      await apiPatch(`/api/equipment_catalogue/${_editingId}`, patchBody);
      showFormMsg('Saved.', 'ok');
    } else {
      await apiPost('/api/equipment_catalogue', values);
      showFormMsg('Created.', 'ok');
    }
    await loadItems();
    _editingId = null;
    render();
  } catch (err) {
    showFormMsg(err.message || 'Save failed.', 'error');
  }
}

async function onDelete(id) {
  const item = _items.find(it => String(it._id) === String(id));
  if (!item) return;
  if (!confirm(`Delete "${item.name}" from the catalogue?`)) return;
  try {
    const res = await apiRaw('DELETE', `/api/equipment_catalogue/${id}`);
    if (res.status === 204) {
      await loadItems();
      render();
      return;
    }
    if (res.status === 409 && res.body) {
      // Server hard-block (epic D5 + ECM-6 HALT-DAR). Surface the holder
      // names so the ST knows where to clean up.
      alert(
        `Cannot delete — held by ${res.body.holders} character${res.body.holders === 1 ? '' : 's'}: ` +
        `${(res.body.character_names || []).join(', ')}.`
      );
      // Refresh the list so the holders column reflects fresh truth.
      await loadItems();
      render();
      return;
    }
    alert((res.body && (res.body.message || res.body.error)) || 'Delete failed.');
  } catch (err) {
    alert(err.message || 'Delete failed.');
  }
}
