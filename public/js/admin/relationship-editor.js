/* Relationship editor — renders inside the NPC detail pane (NPCR.2).
   Handles list of edges for a given NPC plus add / edit / retire forms.
   State is module-level; a new call to renderRelationshipsSection with a
   different NPC id resets it. */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { esc, displayName, sortName } from '../data/helpers.js';
import {
  RELATIONSHIP_KINDS, FAMILIES,
  kindByCode, kindsByFamily, defaultDirectionFor,
} from '../data/relationship-kinds.js';

let _host = null;
let _npcId = null;
let _chars = [];
let _npcs = [];
let _edges = [];
let _editingId = null;   // null | '__new__' | edge _id
let _loaded = false;

// ── Public entry ────────────────────────────────────────────────────────────

export function renderRelationshipsSection(host, { npcId, chars, npcs }) {
  if (!host || !npcId) return;
  // Reset state if the host NPC changed. Warn if an open edit form
  // would be discarded so a mid-edit click doesn't silently lose input.
  if (String(npcId) !== String(_npcId)) {
    if (_editingId !== null && _npcId !== null) {
      const ok = confirm('You have an open relationship-edit form. Discard changes?');
      if (!ok) return;
    }
    _edges = [];
    _editingId = null;
    _loaded = false;
  }
  _host = host;
  _npcId = String(npcId);
  _chars = Array.isArray(chars) ? chars : [];
  _npcs = Array.isArray(npcs) ? npcs : [];

  _host.innerHTML = `
    <div class="npcr-rels-header">
      <span class="npcr-rels-title">Relationships</span>
      <button class="npcr-btn" id="npcr-rels-add">+ Add Relationship</button>
    </div>
    <div class="npcr-rels-err" id="npcr-rels-err"></div>
    <div class="npcr-rels-list" id="npcr-rels-list">
      ${_loaded ? '' : '<p class="npcr-empty">Loading...</p>'}
    </div>
  `;

  document.getElementById('npcr-rels-add')?.addEventListener('click', () => {
    _editingId = '__new__';
    renderList();
  });

  if (!_loaded) loadEdges();
  else renderList();
}

async function loadEdges() {
  // Capture the NPC id at call start; if the user switches NPCs before the
  // request resolves, drop the stale response.
  const requestedNpcId = _npcId;
  try {
    const edges = await apiGet(`/api/relationships?endpoint=${encodeURIComponent(requestedNpcId)}`);
    if (requestedNpcId !== _npcId) return;
    _edges = edges;
  } catch (err) {
    if (requestedNpcId !== _npcId) return;
    console.error('[relationship-editor] load error:', err);
    _edges = [];
    setError('Failed to load relationships: ' + (err?.message || 'unknown error'));
  }
  _loaded = true;
  renderList();
}

// ── Perspective helpers ─────────────────────────────────────────────────────

function mySide(edge) {
  if (edge.a?.id === _npcId && edge.a?.type === 'npc') return 'a';
  if (edge.b?.id === _npcId && edge.b?.type === 'npc') return 'b';
  return null;
}

function otherEndpoint(edge) {
  const side = mySide(edge);
  if (side === 'a') return edge.b;
  if (side === 'b') return edge.a;
  return null;
}

function endpointLabel(ep) {
  if (!ep) return '(unknown)';
  if (ep.type === 'pc') {
    const c = _chars.find(x => String(x._id) === String(ep.id));
    return c ? 'PC: ' + displayName(c) : `PC: (${ep.id})`;
  }
  if (ep.type === 'npc') {
    const n = _npcs.find(x => String(x._id) === String(ep.id));
    return n ? 'NPC: ' + n.name : `NPC: (${ep.id})`;
  }
  return '(unknown)';
}

// ── List rendering ──────────────────────────────────────────────────────────

function renderList() {
  const list = document.getElementById('npcr-rels-list');
  if (!list) return;

  let h = '';
  if (_editingId === '__new__') h += formHtml(null);

  const grouped = Object.fromEntries(FAMILIES.map(f => [f, []]));
  for (const edge of _edges) {
    const k = kindByCode(edge.kind);
    if (!k) continue;
    grouped[k.family].push(edge);
  }

  const anyEdges = _edges.length > 0;
  if (!anyEdges && _editingId !== '__new__') {
    h += '<p class="npcr-empty">No relationships recorded.</p>';
  }

  for (const family of FAMILIES) {
    const bucket = grouped[family];
    if (bucket.length === 0) continue;
    h += `<div class="npcr-rels-family">`;
    h += `<div class="npcr-rels-family-head">${esc(family)}</div>`;
    for (const edge of bucket) {
      if (String(edge._id) === String(_editingId)) {
        h += formHtml(edge);
      } else {
        h += rowHtml(edge);
      }
    }
    h += `</div>`;
  }

  list.innerHTML = h;
  attachHandlers();
}

function rowHtml(edge) {
  const side = mySide(edge);
  const other = otherEndpoint(edge);
  const k = kindByCode(edge.kind);
  const kindLabel = k ? k.label : edge.kind;
  const customSuffix = edge.kind === 'other' && edge.custom_label ? ` (${esc(edge.custom_label)})` : '';
  const dir = edge.direction === 'mutual' ? '↔' : (side === 'a' ? '→' : '←');
  const retiredCls = edge.status === 'retired' ? ' retired' : '';
  const dispCls = edge.disposition ? ` disp-${edge.disposition}` : '';

  let h = `<div class="npcr-rels-row${retiredCls}${dispCls}" data-edge-id="${esc(edge._id)}">`;
  h += `<div class="npcr-rels-row-head">`;
  h += `<span class="npcr-rels-side">${side === 'a' ? 'A' : 'B'}</span>`;
  h += `<span class="npcr-rels-kind">${esc(kindLabel)}${customSuffix}</span>`;
  h += `<span class="npcr-rels-dir">${dir}</span>`;
  h += `<span class="npcr-rels-other">${esc(endpointLabel(other))}</span>`;
  if (edge.status === 'retired') h += `<span class="npcr-rels-status">retired</span>`;
  if (edge.status === 'pending_confirmation') h += `<span class="npcr-rels-status pending">pending</span>`;
  h += `</div>`;
  if (edge.state) h += `<div class="npcr-rels-state">${esc(edge.state)}</div>`;
  if (edge.disposition) h += `<div class="npcr-rels-disp">Disposition: <b>${esc(edge.disposition)}</b></div>`;
  h += `<div class="npcr-rels-row-actions">`;
  // Retired edges are read-only: hide Edit (ambiguous — server rejects PUT
  // on retired anyway). History remains visible via the History button.
  if (edge.status !== 'retired') {
    h += `<button class="npcr-btn dim" data-act="edit" data-edge-id="${esc(edge._id)}">Edit</button>`;
    h += `<button class="npcr-btn dim" data-act="retire" data-edge-id="${esc(edge._id)}">Retire</button>`;
  }
  if (edge.history?.length > 1) {
    h += `<button class="npcr-btn dim" data-act="history" data-edge-id="${esc(edge._id)}">History (${edge.history.length})</button>`;
  }
  h += `</div>`;
  h += `</div>`;
  return h;
}

// ── Form rendering ──────────────────────────────────────────────────────────

function formHtml(edge) {
  const isNew = !edge;
  // For new edges, this NPC defaults to side a.
  const meSide = isNew ? 'a' : mySide(edge);
  const meIsA = meSide === 'a';
  const other = isNew ? { type: 'pc', id: '' } : otherEndpoint(edge);
  const kind = isNew ? 'contact' : edge.kind;
  const kindObj = kindByCode(kind);
  const direction = isNew ? defaultDirectionFor(kind) : edge.direction;
  const disposition = edge?.disposition || '';
  const state = edge?.state || '';
  const customLabel = edge?.custom_label || '';
  const id = isNew ? 'new' : edge._id;

  const byFam = kindsByFamily();

  let h = `<div class="npcr-rels-form" data-form-id="${esc(id)}">`;
  h += `<div class="npcr-rels-form-title">${isNew ? 'New relationship' : 'Edit relationship'}</div>`;

  // Endpoint picker — only editable on create
  h += `<div class="npcr-rels-form-row">`;
  h += `<label class="npcr-field">
    <span class="npcr-field-label">Other party type</span>
    <select id="npcr-rels-f-other-type-${id}" class="npcr-input"${isNew ? '' : ' disabled'}>
      <option value="pc"${other?.type === 'pc' ? ' selected' : ''}>PC</option>
      <option value="npc"${other?.type === 'npc' ? ' selected' : ''}>NPC</option>
    </select>
  </label>`;
  h += `<label class="npcr-field">
    <span class="npcr-field-label">Other party</span>
    ${endpointPickerHtml(id, other)}
  </label>`;
  h += `</div>`;

  // Kind
  h += `<label class="npcr-field">
    <span class="npcr-field-label">Kind</span>
    <select id="npcr-rels-f-kind-${id}" class="npcr-input">
      ${FAMILIES.map(f => `
        <optgroup label="${esc(f)}">
          ${byFam[f].map(k => `<option value="${esc(k.code)}"${k.code === kind ? ' selected' : ''}>${esc(k.label)}</option>`).join('')}
        </optgroup>
      `).join('')}
    </select>
  </label>`;

  // Custom label — shown/hidden via CSS class toggle
  const customHidden = kind === 'other' ? '' : ' npcr-hidden';
  h += `<label class="npcr-field${customHidden}" id="npcr-rels-f-custom-wrap-${id}">
    <span class="npcr-field-label">Custom label *</span>
    <input type="text" id="npcr-rels-f-custom-${id}" class="npcr-input" value="${esc(customLabel)}" placeholder="e.g., blood-oath partner" />
  </label>`;

  // Direction (only meaningful for directed kinds)
  const dirHidden = (kindObj?.direction === 'mutual') ? ' npcr-hidden' : '';
  h += `<label class="npcr-field${dirHidden}" id="npcr-rels-f-dir-wrap-${id}">
    <span class="npcr-field-label">Direction</span>
    <select id="npcr-rels-f-dir-${id}" class="npcr-input">
      <option value="a_to_b"${direction === 'a_to_b' ? ' selected' : ''}>A → B (a is [kind] of b)</option>
      <option value="mutual"${direction === 'mutual' ? ' selected' : ''}>A ↔ B (mutual)</option>
    </select>
  </label>`;

  // This NPC side indicator (read-only on edit; locked to a on create)
  if (!isNew) {
    h += `<div class="npcr-field">
      <span class="npcr-field-label">This NPC is on side</span>
      <div class="npcr-rels-side-indicator">${meSide.toUpperCase()}</div>
    </div>`;
  }

  // Disposition
  h += `<div class="npcr-field">
    <span class="npcr-field-label">Disposition</span>
    <div class="npcr-rels-disp-chips" id="npcr-rels-f-disp-wrap-${id}">
      ${['positive', 'neutral', 'negative'].map(d => `
        <button type="button" class="npcr-chip-btn${disposition === d ? ' on' : ''}" data-disp="${d}">${esc(d)}</button>
      `).join('')}
      <button type="button" class="npcr-chip-btn dim${!disposition ? ' on' : ''}" data-disp="">clear</button>
    </div>
    <input type="hidden" id="npcr-rels-f-disp-${id}" value="${esc(disposition)}" />
  </div>`;

  // State
  h += `<label class="npcr-field">
    <span class="npcr-field-label">State (freeform)</span>
    <textarea id="npcr-rels-f-state-${id}" class="npcr-textarea" rows="2">${esc(state)}</textarea>
  </label>`;

  // st_hidden removed: NPC visibility is scoped automatically by linked
  // characters / connection edges; per-edge hide flag is no longer surfaced.

  // History log
  if (!isNew && edge.history?.length) {
    h += `<details class="npcr-rels-history">
      <summary>History (${edge.history.length})</summary>
      <ul>`;
    for (const row of edge.history) {
      const when = new Date(row.at).toLocaleString();
      const by = `${row.by?.type || '?'}:${row.by?.id || '?'}`;
      h += `<li><b>${esc(row.change)}</b> <span class="npcr-meta-label">at ${esc(when)} by ${esc(by)}</span>`;
      if (Array.isArray(row.fields) && row.fields.length) {
        h += '<ul class="npcr-rels-history-fields">';
        for (const f of row.fields) {
          const before = f.before === undefined ? '(unset)' : JSON.stringify(f.before);
          const after  = f.after  === undefined ? '(unset)' : JSON.stringify(f.after);
          h += `<li>${esc(f.name)}: <span class="before">${esc(before)}</span> → <span class="after">${esc(after)}</span></li>`;
        }
        h += '</ul>';
      }
      h += `</li>`;
    }
    h += `</ul></details>`;
  }

  // Actions
  h += `<div class="npcr-actions">`;
  h += `<button type="button" class="npcr-btn save" data-act="save" data-form-id="${esc(id)}">Save</button>`;
  h += `<button type="button" class="npcr-btn muted" data-act="cancel">Cancel</button>`;
  h += `</div>`;
  h += `</div>`;
  return h;
}

function endpointPickerHtml(formId, current) {
  const currentType = current?.type || 'pc';
  const currentId = String(current?.id || '');
  // A single select populated with the matching list (PC or NPC); switched
  // on other-type change via rePopulateEndpointPicker.
  const options = (currentType === 'pc') ? pcOptions(currentId) : npcOptions(currentId);
  return `<select id="npcr-rels-f-other-id-${formId}" class="npcr-input">${options}</select>`;
}

function pcOptions(selectedId) {
  const sorted = [..._chars].sort((a, b) =>
    sortName(a).localeCompare(sortName(b), undefined, { sensitivity: 'base' })
  );
  let out = '<option value="">(pick a PC)</option>';
  for (const c of sorted) {
    const id = String(c._id);
    out += `<option value="${esc(id)}"${id === selectedId ? ' selected' : ''}>${esc(displayName(c))}${c.retired ? ' (retired)' : ''}</option>`;
  }
  return out;
}

function npcOptions(selectedId) {
  const sorted = [..._npcs].filter(n => String(n._id) !== _npcId).sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  );
  let out = '<option value="">(pick an NPC)</option>';
  for (const n of sorted) {
    const id = String(n._id);
    out += `<option value="${esc(id)}"${id === selectedId ? ' selected' : ''}>${esc(n.name || '')}</option>`;
  }
  return out;
}

// ── Event wiring ────────────────────────────────────────────────────────────

function attachHandlers() {
  const list = document.getElementById('npcr-rels-list');
  if (!list) return;

  // Row actions
  list.querySelectorAll('[data-act="edit"]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      _editingId = b.dataset.edgeId;
      renderList();
    });
  });
  list.querySelectorAll('[data-act="retire"]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      retireEdge(b.dataset.edgeId);
    });
  });
  list.querySelectorAll('[data-act="history"]').forEach(b => {
    b.addEventListener('click', e => {
      e.stopPropagation();
      _editingId = b.dataset.edgeId;
      renderList();
    });
  });

  // Form actions
  list.querySelectorAll('[data-act="save"]').forEach(b => {
    b.addEventListener('click', () => saveEdge(b.dataset.formId));
  });
  list.querySelectorAll('[data-act="cancel"]').forEach(b => {
    b.addEventListener('click', () => {
      _editingId = null;
      renderList();
    });
  });

  // Other-type toggle: swap the endpoint options
  list.querySelectorAll('[id^="npcr-rels-f-other-type-"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const formId = sel.id.replace('npcr-rels-f-other-type-', '');
      const idSel = document.getElementById(`npcr-rels-f-other-id-${formId}`);
      if (!idSel) return;
      idSel.innerHTML = sel.value === 'pc' ? pcOptions('') : npcOptions('');
    });
  });

  // Kind change: show/hide custom_label and direction
  list.querySelectorAll('[id^="npcr-rels-f-kind-"]').forEach(sel => {
    sel.addEventListener('change', () => {
      const formId = sel.id.replace('npcr-rels-f-kind-', '');
      const kind = sel.value;
      const kindObj = kindByCode(kind);
      const customWrap = document.getElementById(`npcr-rels-f-custom-wrap-${formId}`);
      const dirWrap = document.getElementById(`npcr-rels-f-dir-wrap-${formId}`);
      if (customWrap) customWrap.classList.toggle('npcr-hidden', kind !== 'other');
      if (dirWrap) dirWrap.classList.toggle('npcr-hidden', kindObj?.direction === 'mutual');
      // Also reset direction to default for the new kind
      const dirSel = document.getElementById(`npcr-rels-f-dir-${formId}`);
      if (dirSel) dirSel.value = defaultDirectionFor(kind);
    });
  });

  // Disposition chips
  list.querySelectorAll('.npcr-rels-disp-chips').forEach(wrap => {
    wrap.querySelectorAll('.npcr-chip-btn').forEach(b => {
      b.addEventListener('click', e => {
        e.preventDefault();
        const val = b.dataset.disp;
        const formId = wrap.id.replace('npcr-rels-f-disp-wrap-', '');
        const hidden = document.getElementById(`npcr-rels-f-disp-${formId}`);
        if (hidden) hidden.value = val;
        wrap.querySelectorAll('.npcr-chip-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
    });
  });
}

// ── Save / retire ───────────────────────────────────────────────────────────

async function saveEdge(formId) {
  const isNew = formId === 'new';
  clearError();

  const otherType = document.getElementById(`npcr-rels-f-other-type-${formId}`)?.value;
  const otherId   = document.getElementById(`npcr-rels-f-other-id-${formId}`)?.value;
  const kind      = document.getElementById(`npcr-rels-f-kind-${formId}`)?.value;
  const direction = document.getElementById(`npcr-rels-f-dir-${formId}`)?.value || defaultDirectionFor(kind);
  const disposition = document.getElementById(`npcr-rels-f-disp-${formId}`)?.value || '';
  const state     = document.getElementById(`npcr-rels-f-state-${formId}`)?.value.trim() || '';
  const customLabel = document.getElementById(`npcr-rels-f-custom-${formId}`)?.value.trim() || '';

  if (!otherId) return setError('Pick the other party.');
  if (kind === 'other' && !customLabel) return setError("kind='other' requires a custom label.");
  // Mirror server-side endpoint-identity check for instant feedback.
  if (otherType === 'npc' && String(otherId) === _npcId) {
    return setError('An edge must connect two different endpoints.');
  }

  // On create, this NPC is side a; on edit, preserve the original sides.
  let a, b;
  if (isNew) {
    a = { type: 'npc', id: _npcId };
    b = { type: otherType, id: otherId };
  } else {
    const existing = _edges.find(e => String(e._id) === String(_editingId));
    if (!existing) return setError('Edge vanished. Reload the detail pane.');
    const side = mySide(existing);
    if (side === 'a') {
      a = { type: 'npc', id: _npcId };
      b = { type: otherType, id: otherId };
    } else {
      a = { type: otherType, id: otherId };
      b = { type: 'npc', id: _npcId };
    }
  }

  const body = {
    a, b, kind, direction, state, st_hidden: false,
  };
  // Only send custom_label when kind === 'other'; otherwise clear it so a
  // prior label from the 'other' kind can't persist after a kind change.
  body.custom_label = kind === 'other' ? customLabel : '';
  // disposition: send null to clear; server $unsets when null.
  body.disposition = disposition || null;

  try {
    if (isNew) {
      const created = await apiPost('/api/relationships', body);
      _edges.push(created);
    } else {
      // PUT requires the full schema-valid body; include status to avoid losing it
      const existing = _edges.find(e => String(e._id) === String(_editingId));
      body.status = existing?.status || 'active';
      const updated = await apiPut(`/api/relationships/${_editingId}`, body);
      const idx = _edges.findIndex(e => String(e._id) === String(_editingId));
      if (idx >= 0) _edges[idx] = updated;
    }
    _editingId = null;
    renderList();
  } catch (err) {
    console.error('[relationship-editor] save error:', err);
    setError('Save failed: ' + (err?.message || 'unknown error'));
  }
}

async function retireEdge(edgeId) {
  if (!confirm('Retire this relationship? It will stay in the history but be marked retired.')) return;
  clearError();
  try {
    const updated = await apiDelete(`/api/relationships/${edgeId}`);
    const idx = _edges.findIndex(e => String(e._id) === String(edgeId));
    if (idx >= 0) _edges[idx] = updated;
    renderList();
  } catch (err) {
    console.error('[relationship-editor] retire error:', err);
    setError('Retire failed: ' + (err?.message || 'unknown error'));
  }
}

function setError(msg) {
  const el = document.getElementById('npcr-rels-err');
  if (el) el.textContent = msg;
}

function clearError() {
  const el = document.getElementById('npcr-rels-err');
  if (el) el.textContent = '';
}
