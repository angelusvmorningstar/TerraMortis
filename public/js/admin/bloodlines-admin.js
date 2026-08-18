/**
 * Bloodlines admin view (BL-4, issue #1008).
 *
 * Epic BL. Browser-side CRUD over the Mongo-backed `bloodlines` collection
 * established by BL-1, read by BL-2's cache and consumed by every costing
 * surface since BL-3a. This screen is where issue #1008's actual promise
 * lands: adding a bloodline stops being a code edit, a PR, a Netlify deploy
 * and a re-run of the seed script.
 *
 * Harvested wholesale from `equipment-catalogue-admin.js` (ECM-6, #873) —
 * the list/toolbar/inline-form shape, `showFormMsg` for inline status,
 * `apiRaw` for the DELETE so the 409 body can be read, and `esc()` on every
 * interpolated value. The `.ec-*` stylesheet is shared rather than copied
 * under a `bl-` prefix; the selectors were generalised in `admin-layout.css`.
 *
 * Three things this screen does that the ECM one does not, all of them
 * consequences of bloodlines carrying rules where the catalogue carries text:
 *
 *   - **No partial save.** Four disciplines is a rule of the game, so a
 *     three-discipline bloodline is invalid, not a draft (ruled 2026-08-10).
 *     Save is refused until four distinct disciplines are chosen, and the
 *     refusal says why. The server enforces the same rule on POST and on the
 *     MERGED document for PATCH; this is the UI mirroring the gate.
 *   - **`name` is read-only in edit mode.** Three separate things key off the
 *     bloodline name as a plain string with no foreign key, so a rename
 *     orphans every holder at once. Correct a typo with delete + recreate,
 *     which stays possible precisely because a fresh typo has no holders. The
 *     reason is rendered on the field, reusing ECM's own immutable-`bucket`
 *     treatment.
 *   - **No grant editing.** Free specialities and merits granted by a
 *     bloodline live in `rule_grant` documents and are edited in the Rules
 *     Engine admin. Creating a bloodline here gives it disciplines and nothing
 *     else, and the screen must not imply otherwise.
 *
 * Reads go through `GET /api/bloodlines/admin` rather than the public list,
 * because `notes` is projected out of the public reads and this screen is
 * allowed to edit it. Holder counts are derived client-side from the
 * character set `switchDomain` passes, as ECM does; the server's
 * `/:id/impact` endpoint is the SSOT for the delete gate and its message is
 * surfaced verbatim if the 409 fires anyway.
 */

import { apiGet, apiPost, apiPatch, apiRaw } from '../data/api.js';
import { esc } from '../data/helpers.js';
import { CLANS, CORE_DISCS, RITUAL_DISCS } from '../data/constants.js';
import { refetchBloodlines } from '../data/bloodlines-cache.js';

/**
 * Every discipline a bloodline may grant. Same set the route checks against,
 * and the same reason the schema carries no enum for it: an enum would put the
 * discipline list back behind a deploy.
 */
const PICKABLE_DISCS = [...CORE_DISCS, ...RITUAL_DISCS];

/** Four is a rule of the game, not a form-design choice. */
export const REQUIRED_DISCIPLINES = 4;

// Module-level state, re-rendered on every mutation. Single-view module (the
// admin sidebar is mutually exclusive), so a singleton is fine.
let _container = null;
let _allChars = [];
let _items = [];
let _searchName = '';
let _sortKey = 'name';        // 'name' | 'clan'
let _sortDir = 'asc';
let _editingId = null;        // ObjectId-string, or null in create mode
let _loadError = null;        // message when the list read itself failed

/** Trim + case-fold. The same normalisation the cache resolves costing
 *  through, and the same one the server's delete guard uses, so the holder
 *  count on screen agrees with the gate that refuses the delete. */
function normKey(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

/**
 * Holders per bloodline, keyed on the normalised name. Client-side join, as
 * ECM does: `characters.bloodline` is a plain name string, deliberately not an
 * ObjectId foreign key.
 *
 * Exported so it can be tested without a DOM. There is no jsdom in this
 * repo's runner, so the pure decisions this screen makes are the ones a test
 * can reach, and this is one of the two that matter: a count that disagreed
 * with the server's delete guard would show an enabled Delete button on a
 * bloodline the API is going to refuse to delete.
 */
export function buildHoldersIndex(chars) {
  const idx = new Map();
  for (const c of chars || []) {
    const key = normKey(c && c.bloodline);
    if (!key) continue;
    idx.set(key, (idx.get(key) || 0) + 1);
  }
  return idx;
}

export async function initBloodlinesAdmin(container, chars) {
  _container = container;
  _allChars = Array.isArray(chars) ? chars : [];
  _editingId = null;
  _container.innerHTML = '<div class="ec-admin"><div class="ec-empty">Loading bloodlines…</div></div>';
  await loadItems();
  render();
}

async function loadItems() {
  try {
    // The ST-gated read, not the public one: `notes` is projected out of the
    // public list and this screen round-trips it.
    _items = await apiGet('/api/bloodlines/admin');
    _loadError = null;
  } catch (err) {
    console.error('[bloodlines-admin] load failed:', err);
    _items = [];
    // A failed read is NOT an empty collection, and this screen used to say it
    // was: an expired token or a transient API error rendered "No bloodlines
    // in the collection, create one or run the seed", which invites an ST to
    // start correcting a collection that is merely unreadable. Found by this
    // story's review.
    _loadError = err?.message || 'The bloodlines list could not be read.';

  }
}

function filteredSorted() {
  const search = (_searchName || '').toLowerCase();
  const rows = _items.filter(b => !search || (b.name || '').toLowerCase().includes(search));
  const dir = _sortDir === 'desc' ? -1 : 1;
  rows.sort((a, b) => {
    const av = _sortKey === 'clan' ? (a.clan || '') : (a.name || '').toLowerCase();
    const bv = _sortKey === 'clan' ? (b.clan || '') : (b.name || '').toLowerCase();
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  return rows;
}

function render() {
  if (!_container) return;
  const holders = buildHoldersIndex(_allChars);
  const rows = filteredSorted();

  _container.innerHTML = `
    <div class="ec-admin">
      <div class="ec-toolbar">
        <label class="ec-toolbar-field">
          <span>Name search</span>
          <input id="bl-filter-search" type="text" value="${esc(_searchName)}" placeholder="filter…">
        </label>
        <label class="ec-toolbar-field">
          <span>Sort by</span>
          <select id="bl-sort-key">
            <option value="name"${_sortKey === 'name' ? ' selected' : ''}>Name</option>
            <option value="clan"${_sortKey === 'clan' ? ' selected' : ''}>Clan</option>
          </select>
          <button id="bl-sort-dir" class="ec-btn-sm" title="Toggle direction">${_sortDir === 'asc' ? '↑' : '↓'}</button>
        </label>
        <button id="bl-new" class="ec-btn-primary">+ New bloodline</button>
      </div>

      ${_loadError ? '' : `<div class="ec-count">${rows.length} of ${_items.length} bloodline${_items.length === 1 ? '' : 's'}</div>`}

      ${_loadError
        ? `<div class="ec-empty ec-form-msg--error">The bloodlines list could not be loaded, so this screen is showing nothing rather than an empty collection. ${esc(_loadError)}
             <div><button id="bl-retry" class="ec-btn-sm">Try again</button></div>
           </div>`
        : _items.length === 0
        ? `<div class="ec-empty">No bloodlines in the collection. Create one, or run the seed script to import the chronicle's existing set.</div>`
        : `<table class="ec-table">
             <thead>
               <tr>
                 <th>Name</th>
                 <th>Clan</th>
                 <th>Disciplines</th>
                 <th>Holders</th>
                 <th>Actions</th>
               </tr>
             </thead>
             <tbody>
               ${rows.map(b => renderRow(b, holders.get(normKey(b.name)) || 0)).join('')}
             </tbody>
           </table>`}

      <div id="bl-form-host"></div>
    </div>
  `;
  wireListEvents();
}

/**
 * Why Delete is refused for this row, or null when it is offered.
 *
 * AC 12 requires Delete to be hard-disabled whenever the impact join is
 * non-empty, and BL-4 shipped it reading only the client-side holder count, so
 * a bloodline with no holders but a `rule_grant` reference offered an enabled
 * Delete and then took the ST through a destructive confirmation for an
 * operation the API refuses with a 409. Found by this story's review. The
 * grant count comes from `GET /api/bloodlines/admin`, which computes it for
 * the whole list in one read: the client cannot join `rule_grant` itself, and
 * an /impact fetch per row would be an N+1 on a 23-row screen.
 *
 * Exported so it is testable without a DOM, for the same reason as
 * `buildHoldersIndex`: the UI mirrors the gate, and a mirror that disagrees
 * with the gate is worse than no mirror.
 */
export function deleteDisabledReason(holdersCount, grantCount) {
  const holders = Number(holdersCount) || 0;
  const grants = Number(grantCount) || 0;
  if (holders > 0 && grants > 0) {
    return `Held by ${holders} character${holders === 1 ? '' : 's'} and referenced by ${grants} bloodline grant rule${grants === 1 ? '' : 's'}. Edit its clan or disciplines instead.`;
  }
  if (holders > 0) {
    return `Held by ${holders} character${holders === 1 ? '' : 's'}. A bloodline with holders cannot be deleted; edit its clan or disciplines instead.`;
  }
  if (grants > 0) {
    return `Referenced by ${grants} bloodline grant rule${grants === 1 ? '' : 's'} in the rules engine. Remove those grants first, in the Rules Engine admin.`;
  }
  return null;
}

function renderRow(b, holdersCount) {
  const discs = Array.isArray(b.disciplines) ? b.disciplines : [];
  // The UI mirrors the gate; the API is still the gate, and its 409 is
  // surfaced verbatim if it fires anyway.
  const refusal = deleteDisabledReason(holdersCount, b.grant_rule_count);
  const deleteAttrs = refusal ? `disabled title="${esc(refusal)}"` : '';
  return `
    <tr data-id="${esc(String(b._id))}">
      <td>${esc(b.name || '')}</td>
      <td>${esc(b.clan || '')}</td>
      <td class="bl-disc-cell">${discs.map(d => `<span class="bl-disc-tag">${esc(d)}</span>`).join(' ')}</td>
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
  $('bl-filter-search')?.addEventListener('input', e => { _searchName = e.target.value; render(); });
  $('bl-sort-key')?.addEventListener('change', e => { _sortKey = e.target.value; render(); });
  $('bl-sort-dir')?.addEventListener('click', () => { _sortDir = _sortDir === 'asc' ? 'desc' : 'asc'; render(); });
  $('bl-new')?.addEventListener('click', () => openCreateForm());
  $('bl-retry')?.addEventListener('click', async () => { await loadItems(); render(); });

  _container.querySelectorAll('.ec-table tbody tr').forEach(row => {
    const id = row.dataset.id;
    row.querySelector('[data-action="edit"]')?.addEventListener('click', () => openEditForm(id));
    const delBtn = row.querySelector('[data-action="delete"]');
    if (delBtn && !delBtn.disabled) delBtn.addEventListener('click', () => onDelete(id));
  });
}

// ── Forms ──────────────────────────────────────────────────────────────────

function openCreateForm() {
  _editingId = null;
  renderForm({ clan: CLANS[0], disciplines: [] });
}

async function openEditForm(id) {
  _editingId = id;
  const item = _items.find(b => String(b._id) === String(id));
  if (!item) return;
  // The list-view holder count is a client-side join and cannot see grant
  // rules at all; the impact endpoint is the SSOT for both.
  let impact = { holders: 0, character_names: [], grant_rules: 0, grant_rule_labels: [] };
  try {
    impact = await apiGet(`/api/bloodlines/${id}/impact`);
  } catch (err) {
    console.warn('[bloodlines-admin] impact fetch failed:', err);
  }
  // Staleness guard, added by this story's review. `_editingId` is module
  // state set synchronously, but the fetch above is not, so Edit(A) then
  // Edit(B) can resolve in either order. Rendering A's document while
  // `_editingId` still says B would show one bloodline in the form and PATCH
  // the OTHER one on Save, silently re-costing every holder of B. If this call
  // is no longer the open one, it has nothing left to draw.
  if (String(_editingId) !== String(id)) return;
  renderForm(item, impact);
}

function discSelect(index, selected) {
  const opts = ['<option value="">Choose a discipline</option>']
    .concat(PICKABLE_DISCS.map(d => `<option value="${esc(d)}"${d === selected ? ' selected' : ''}>${esc(d)}</option>`))
    .join('');
  return `
    <div class="ec-form-field">
      <label>Discipline ${index + 1} *</label>
      <select class="bl-f-disc" data-disc-index="${index}">${opts}</select>
    </div>
  `;
}

function renderForm(initial, impact = null) {
  const host = document.getElementById('bl-form-host');
  if (!host) return;
  const isEdit = !!_editingId;
  const discs = Array.isArray(initial.disciplines) ? initial.disciplines : [];
  const clanOpts = CLANS.map(c =>
    `<option value="${esc(c)}"${(initial.clan || '') === c ? ' selected' : ''}>${esc(c)}</option>`
  ).join('');

  const banner = isEdit && impact && (impact.holders > 0 || impact.grant_rules > 0)
    ? `<div class="ec-impact-banner">
         <strong>${impact.holders > 0
           ? `Held by ${impact.holders} character${impact.holders === 1 ? '' : 's'}.`
           : 'Referenced by the rules engine.'}</strong>
         Edits to clan or disciplines apply to all current holders, and change what their disciplines cost.
         ${impact.character_names?.length
           ? `<span class="ec-impact-list">(${impact.character_names.map(esc).join(', ')})</span>`
           : ''}
         ${impact.grant_rules > 0
           ? `<span class="ec-impact-list">${impact.grant_rules} bloodline grant rule${impact.grant_rules === 1 ? '' : 's'} reference${impact.grant_rules === 1 ? 's' : ''} this name. Grants are edited in the Rules Engine, not here.</span>`
           : ''}
       </div>`
    : '';

  host.innerHTML = `
    <div class="ec-form-panel">
      <div class="ec-form-header">
        <h3>${isEdit ? 'Edit bloodline' : 'New bloodline'}</h3>
        <button id="bl-form-close" class="ec-btn-sm">Close</button>
      </div>
      ${banner}
      <div class="ec-form-grid">
        ${isEdit
          ? `<div class="ec-form-field"><label>Name</label><div class="ec-form-readonly">${esc(initial.name || '')} <span class="ec-form-hint">(immutable: a character's bloodline, and the rules engine, both match this name as plain text. Correct a typo by deleting and recreating, which is possible while it has no holders.)</span></div></div>`
          : `<div class="ec-form-field"><label>Name *</label><input id="bl-f-name" type="text" value="${esc(initial.name || '')}" required></div>`
        }
        <div class="ec-form-field">
          <label>Parent clan *</label>
          <select id="bl-f-clan">${clanOpts}</select>
        </div>
        <div class="ec-form-field ec-form-field--wide">
          <fieldset class="ec-bucket-fieldset">
            <legend>Disciplines (exactly four, all different)</legend>
            <div class="bl-disc-grid">
              ${Array.from({ length: REQUIRED_DISCIPLINES }, (_, i) => discSelect(i, discs[i] || '')).join('')}
            </div>
          </fieldset>
        </div>
        <div class="ec-form-field ec-form-field--wide">
          <label>Notes <span class="ec-form-hint">(ST bookkeeping, never shown to players)</span></label>
          <textarea id="bl-f-notes" rows="3">${esc(initial.notes || '')}</textarea>
        </div>
      </div>
      <div class="ec-form-actions">
        <span id="bl-form-msg" class="ec-form-msg"></span>
        <button id="bl-form-save" class="ec-btn-primary">${isEdit ? 'Save changes' : 'Create bloodline'}</button>
      </div>
    </div>
  `;
  wireFormEvents();
}

function wireFormEvents() {
  const $ = id => document.getElementById(id);
  $('bl-form-close')?.addEventListener('click', () => {
    const host = document.getElementById('bl-form-host');
    if (host) host.innerHTML = '';
    _editingId = null;
  });
  $('bl-form-save')?.addEventListener('click', () => onSave());
}

function collectFormValues() {
  const $ = id => document.getElementById(id);
  const disciplines = [...document.querySelectorAll('.bl-f-disc')].map(sel => sel.value).filter(Boolean);
  return {
    name: ($('bl-f-name')?.value || '').trim(),
    clan: $('bl-f-clan')?.value || '',
    disciplines,
    notes: ($('bl-f-notes')?.value || '').trim() || null,
  };
}

function showFormMsg(text, kind = 'info') {
  const el = document.getElementById('bl-form-msg');
  if (!el) return;
  el.textContent = text;
  el.className = `ec-form-msg ec-form-msg--${kind}`;
}

/**
 * The no-partial-save gate, stated in the words a human needs. The server
 * enforces the same rule; this exists so the refusal names what is wrong
 * instead of returning a schema error list.
 *
 * Exported for the same reason as `buildHoldersIndex`: it is the other pure
 * decision on this screen, and it is the one AC 2 turns into a rule of the
 * game rather than a form-design choice.
 *
 * @returns {string|null} the refusal to show, or null when the values are fit
 *   to send.
 */
export function validationRefusal(values, { requireName }) {
  if (requireName && !values.name) return 'A name is required.';
  if (!values.clan) return 'A parent clan is required.';
  if (values.disciplines.length !== REQUIRED_DISCIPLINES) {
    return `Choose exactly ${REQUIRED_DISCIPLINES} disciplines. `
      + `${values.disciplines.length} chosen so far. A bloodline with fewer than four is not a draft, it is invalid, so there is no partial save.`;
  }
  if (new Set(values.disciplines).size !== values.disciplines.length) {
    return 'The four disciplines must all be different.';
  }
  return null;
}

async function onSave() {
  const values = collectFormValues();
  const refusal = validationRefusal(values, { requireName: !_editingId });
  if (refusal) { showFormMsg(refusal, 'error'); return; }

  if (!_editingId) {
    // Case-insensitive duplicate check, mirroring the server's own. Blocking
    // rather than ECM's soft warning: two names that differ only by case both
    // satisfy the unique index and then collapse to one cache entry, leaving
    // one document permanently unreachable for costing.
    const dup = _items.find(b => normKey(b.name) === normKey(values.name));
    if (dup) {
      showFormMsg(`"${dup.name}" already exists. Names must be distinct ignoring case.`, 'error');
      return;
    }
  }

  showFormMsg('Saving…', 'info');
  try {
    if (_editingId) {
      // Only the updatable fields are sent. The server allowlist strips the
      // rest anyway; pruning here keeps the payload honest about intent.
      await apiPatch(`/api/bloodlines/${_editingId}`, {
        clan: values.clan,
        disciplines: values.disciplines,
        notes: values.notes,
      });
      showFormMsg('Saved.', 'ok');
    } else {
      await apiPost('/api/bloodlines', values);
      showFormMsg('Created.', 'ok');
    }
    // Refresh the costing cache directly rather than waiting for this client's
    // own WS echo: the write is what changes costing, and the screen should
    // not depend on the socket being up to make that true locally.
    await refetchBloodlines();
    await loadItems();
    _editingId = null;
    render();
  } catch (err) {
    showFormMsg(err.message || 'Save failed.', 'error');
  }
}

async function onDelete(id) {
  const item = _items.find(b => String(b._id) === String(id));
  if (!item) return;
  if (!confirm(
    `Delete "${item.name}" from the collection?\n\n`
    + 'Delete removes a mistake, it does not retire a bloodline. It is refused if any character holds this name or any rules-engine grant references it.'
  )) return;
  try {
    const res = await apiRaw('DELETE', `/api/bloodlines/${id}`);
    if (res.status === 204) {
      await refetchBloodlines();
      await loadItems();
      render();
      return;
    }
    if (res.status === 409 && res.body) {
      // Server hard-block. Surfaced verbatim so the ST is told where to clean
      // up rather than just refused.
      const names = (res.body.character_names || []).join(', ');
      const rules = (res.body.grant_rule_labels || []).join(', ');
      alert(
        `${res.body.message}\n`
        + (names ? `\nHolders: ${names}` : '')
        + (rules ? `\nGrant rules: ${rules}` : '')
      );
      await loadItems();
      render();
      return;
    }
    alert((res.body && (res.body.message || res.body.error)) || 'Delete failed.');
  } catch (err) {
    alert(err.message || 'Delete failed.');
  }
}
