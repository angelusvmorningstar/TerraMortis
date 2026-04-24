/* NPC Register — first-class admin tab (NPCR.1).
   Two-pane layout: PC picker left, NPC grid + detail right.
   Data loads lazily on first entry; subsequent entries re-render from cache. */

import { apiGet, apiPost, apiPut, apiDelete } from '../data/api.js';
import { esc, sortName, displayName } from '../data/helpers.js';
import { renderRelationshipsSection } from './relationship-editor.js';

const ALL = '__all__';
const UNLINKED = '__unlinked__';

let _chars = [];
let _npcs = [];
let _openFlags = [];     // NPCR.3: all flags with status='open'
let _selectedCharId = ALL;
let _selectedNpcId = null;
let _search = '';
let _activeChip = null;
let _loaded = false;

export function initNpcRegister(chars) {
  _chars = Array.isArray(chars) ? chars : [];
  renderShell();
  if (!_loaded) {
    _loaded = true;
    loadNpcs();
  }
}

async function loadNpcs() {
  try {
    const [npcs, flags] = await Promise.all([
      apiGet('/api/npcs'),
      apiGet('/api/npc-flags?status=open').catch(() => []),
    ]);
    _npcs = npcs;
    _openFlags = Array.isArray(flags) ? flags : [];
  } catch (err) {
    console.error('[npc-register] load error:', err);
    _npcs = [];
    _openFlags = [];
  }
  renderShell();
}

// ── Flags helpers ───────────────────────────────────────────────────────────

function flagsForNpc(npcId) {
  const id = String(npcId);
  return _openFlags.filter(f => String(f.npc_id) === id);
}

function openFlagCount(npcId) {
  return flagsForNpc(npcId).length;
}

// ── Indexing ────────────────────────────────────────────────────────────────

function activeNpcs() {
  return _npcs.filter(n => n.status !== 'archived');
}

function indexByChar() {
  const idx = {};
  const unlinked = [];
  for (const n of activeNpcs()) {
    const ids = Array.isArray(n.linked_character_ids) ? n.linked_character_ids : [];
    if (ids.length === 0) {
      unlinked.push(n);
      continue;
    }
    for (const id of ids) (idx[id] = idx[id] || []).push(n);
  }
  return { idx, unlinked };
}

function npcsForSelection() {
  const { idx, unlinked } = indexByChar();
  if (_selectedCharId === ALL) return activeNpcs();
  if (_selectedCharId === UNLINKED) return unlinked;
  return idx[_selectedCharId] || [];
}

function visibleNpcs() {
  let list = npcsForSelection();
  if (_activeChip === 'pending') {
    list = list.filter(n => n.status === 'pending');
  } else if (_activeChip === 'correspondents') {
    list = list.filter(n => n.is_correspondent);
  } else if (_activeChip === 'suggested') {
    list = list.filter(n => Array.isArray(n.st_suggested_for) && n.st_suggested_for.length > 0);
  } else if (_activeChip === 'flagged') {
    list = list.filter(n => openFlagCount(n._id) > 0);
  }
  if (_search) {
    const q = _search.toLowerCase();
    list = list.filter(n =>
      (n.name || '').toLowerCase().includes(q) ||
      (n.description || '').toLowerCase().includes(q)
    );
  }
  return list;
}

function labelForSelection() {
  if (_selectedCharId === ALL) return 'All NPCs';
  if (_selectedCharId === UNLINKED) return 'Unlinked';
  const c = _chars.find(x => String(x._id) === String(_selectedCharId));
  return c ? displayName(c) : '(unknown)';
}

// ── Render ──────────────────────────────────────────────────────────────────

function renderShell() {
  const host = document.getElementById('npcs-content');
  if (!host) return;
  host.innerHTML = `
    <div class="npcr-layout">
      <aside class="npcr-picker">
        <div class="npcr-picker-header">Characters</div>
        <div class="npcr-picker-list" id="npcr-picker-list"></div>
      </aside>
      <section class="npcr-main">
        <div class="npcr-main-header" id="npcr-main-header"></div>
        <div class="npcr-grid" id="npcr-grid"></div>
        <div class="npcr-detail" id="npcr-detail"></div>
      </section>
    </div>
  `;
  const count = document.getElementById('npcs-count');
  if (count) count.textContent = _loaded ? String(activeNpcs().length) : '';
  renderPicker();
  renderMain();
}

function renderPicker() {
  const host = document.getElementById('npcr-picker-list');
  if (!host) return;

  if (!_loaded) {
    host.innerHTML = '<p class="npcr-empty">Loading...</p>';
    return;
  }

  const { idx, unlinked } = indexByChar();
  const allCount = activeNpcs().length;

  const sortedChars = [..._chars].sort((a, b) =>
    sortName(a).localeCompare(sortName(b), undefined, { sensitivity: 'base' })
  );

  let h = '';
  h += rowHtml(ALL, 'All NPCs', allCount, false);

  for (const c of sortedChars) {
    const id = String(c._id);
    const count = (idx[id] || []).length;
    const label = displayName(c) + (c.retired ? ' (retired)' : '');
    h += rowHtml(id, label, count, !!c.retired);
  }

  h += rowHtml(UNLINKED, 'Unlinked', unlinked.length, false);

  host.innerHTML = h;

  host.querySelectorAll('.npcr-row').forEach(btn => {
    btn.addEventListener('click', () => {
      _selectedCharId = btn.dataset.charId;
      _selectedNpcId = null;
      renderPicker();
      renderMain();
    });
  });
}

function rowHtml(id, label, count, dim) {
  const sel = String(_selectedCharId) === String(id) ? ' on' : '';
  const dimCls = dim ? ' dim' : '';
  return `
    <button class="npcr-row${sel}${dimCls}" data-char-id="${esc(id)}">
      <span class="npcr-row-name">${esc(label)}</span>
      <span class="npcr-row-count">${count}</span>
    </button>
  `;
}

function renderMain() {
  renderHeader();
  renderGrid();
  renderDetail();
}

function renderHeader() {
  const header = document.getElementById('npcr-main-header');
  if (!header) return;
  const list = visibleNpcs();
  const flaggedTotal = _openFlags.length;
  const chips = [
    ['pending', 'Pending', null],
    ['correspondents', 'Correspondents', null],
    ['suggested', 'Suggested', null],
    ['flagged', 'Flagged', flaggedTotal > 0 ? flaggedTotal : null],
  ];
  header.innerHTML = `
    <div class="npcr-main-head-row">
      <div class="npcr-main-title">${esc(labelForSelection())}</div>
      <div class="npcr-main-sub">${list.length} NPC${list.length === 1 ? '' : 's'}</div>
    </div>
    <div class="npcr-toolbar">
      <input type="search" id="npcr-search" class="npcr-search" placeholder="Search name or description..." value="${esc(_search)}" />
      <div class="npcr-chips-filter">
        ${chips.map(([k, l, n]) => {
          const isFlag = k === 'flagged';
          const cls = `npcr-chip-btn${_activeChip === k ? ' on' : ''}${isFlag && n > 0 ? ' flagged' : ''}`;
          const count = (n != null) ? ` · ${n}` : '';
          return `<button class="${cls}" data-chip="${k}">${esc(l)}${count}</button>`;
        }).join('')}
      </div>
    </div>
  `;

  const searchEl = document.getElementById('npcr-search');
  searchEl?.addEventListener('input', (e) => {
    _search = e.target.value;
    renderGrid();
    const sub = header.querySelector('.npcr-main-sub');
    if (sub) {
      const count = visibleNpcs().length;
      sub.textContent = `${count} NPC${count === 1 ? '' : 's'}`;
    }
  });

  header.querySelectorAll('.npcr-chip-btn').forEach(b => {
    b.addEventListener('click', () => {
      const chip = b.dataset.chip;
      _activeChip = _activeChip === chip ? null : chip;
      renderHeader();
      renderGrid();
    });
  });
}

function renderGrid() {
  const grid = document.getElementById('npcr-grid');
  if (!grid) return;

  const list = visibleNpcs().slice().sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })
  );

  let h = '';
  h += `<button class="npcr-add-btn" id="npcr-add-btn">+ Add NPC</button>`;

  if (list.length === 0) {
    h += '<p class="npcr-empty">No NPCs in this bucket.</p>';
  } else {
    h += '<div class="npcr-cards">';
    for (const n of list) h += cardHtml(n);
    h += '</div>';
  }

  grid.innerHTML = h;

  document.getElementById('npcr-add-btn')?.addEventListener('click', () => {
    _selectedNpcId = '__new__';
    renderDetail();
  });

  grid.querySelectorAll('.npcr-card').forEach(card => {
    card.addEventListener('click', () => {
      _selectedNpcId = card.dataset.npcId;
      renderDetail();
      updateCardSelection();
    });
  });

  updateCardSelection();
}

function updateCardSelection() {
  const grid = document.getElementById('npcr-grid');
  if (!grid) return;
  grid.querySelectorAll('.npcr-card').forEach(c => {
    c.classList.toggle('on', c.dataset.npcId === _selectedNpcId);
  });
}

function cardHtml(n) {
  const isCorr = !!n.is_correspondent;
  const suggestedCount = Array.isArray(n.st_suggested_for) ? n.st_suggested_for.length : 0;
  const flagCount = openFlagCount(n._id);
  const status = n.status || 'active';
  const statusCls = status === 'pending' ? ' pending'
                  : status === 'inactive' || status === 'destroyed' ? ' inactive' : '';
  const flaggedCls = flagCount > 0 ? ' flagged' : '';
  let h = `<button class="npcr-card${flaggedCls}" data-npc-id="${esc(n._id)}">`;
  h += `<div class="npcr-card-head">`;
  h += `<span class="npcr-card-name">${esc(n.name)}</span>`;
  h += `<span class="npcr-card-status${statusCls}">${esc(status)}</span>`;
  h += `</div>`;
  const badges = [];
  if (flagCount > 0) badges.push(`<span class="npcr-badge flag" title="${flagCount} open flag${flagCount === 1 ? '' : 's'}">F${flagCount}</span>`);
  if (isCorr) badges.push('<span class="npcr-badge corr" title="Correspondent">C</span>');
  if (suggestedCount > 0) badges.push(`<span class="npcr-badge sug" title="ST-suggested for ${suggestedCount} character${suggestedCount === 1 ? '' : 's'}">S${suggestedCount}</span>`);
  if (badges.length) h += `<div class="npcr-card-badges">${badges.join('')}</div>`;
  if (n.description) h += `<div class="npcr-card-desc">${esc(n.description)}</div>`;
  h += `</button>`;
  return h;
}

function charNameFor(id) {
  const c = _chars.find(x => String(x._id) === String(id));
  return c ? displayName(c) : `(${id})`;
}

function renderDetail() {
  const detail = document.getElementById('npcr-detail');
  if (!detail) return;
  if (!_selectedNpcId) { detail.innerHTML = ''; return; }

  const isNew = _selectedNpcId === '__new__';
  const npc = isNew ? {} : _npcs.find(n => String(n._id) === String(_selectedNpcId));
  if (!isNew && !npc) { detail.innerHTML = ''; return; }

  const status = npc.status || 'active';
  const statusOpts = ['active', 'pending', 'inactive', 'destroyed'];
  const linkedIds = Array.isArray(npc.linked_character_ids) ? npc.linked_character_ids : [];
  const suggestedFor = Array.isArray(npc.st_suggested_for) ? npc.st_suggested_for : [];

  const npcFlags = isNew ? [] : flagsForNpc(npc._id);

  let h = '<div class="npcr-detail-form">';
  h += `<div class="npcr-detail-err" id="npcr-detail-err"></div>`;
  const flaggedChip = npcFlags.length > 0
    ? ` <span class="npcr-chip-flagged">Flagged · ${npcFlags.length}</span>`
    : '';
  h += `<div class="npcr-detail-title">${isNew ? 'New NPC' : esc(npc.name || '')}${flaggedChip}</div>`;

  h += `<label class="npcr-field">
    <span class="npcr-field-label">Name *</span>
    <input type="text" id="npcr-f-name" class="npcr-input" value="${esc(npc.name || '')}" />
  </label>`;

  h += `<label class="npcr-field">
    <span class="npcr-field-label">Description</span>
    <textarea id="npcr-f-desc" class="npcr-textarea" rows="2">${esc(npc.description || '')}</textarea>
  </label>`;

  h += `<div class="npcr-field-row">`;
  h += `<label class="npcr-field">
    <span class="npcr-field-label">Status</span>
    <select id="npcr-f-status" class="npcr-input">
      ${statusOpts.map(s => `<option value="${s}"${status === s ? ' selected' : ''}>${s}</option>`).join('')}
    </select>
  </label>`;
  h += `<label class="npcr-field-inline">
    <input type="checkbox" id="npcr-f-corr"${npc.is_correspondent ? ' checked' : ''} />
    <span>Correspondent</span>
  </label>`;
  h += `</div>`;

  h += `<label class="npcr-field">
    <span class="npcr-field-label">Notes (ST only)</span>
    <textarea id="npcr-f-notes" class="npcr-textarea" rows="2">${esc(npc.notes || '')}</textarea>
  </label>`;

  if (linkedIds.length > 0) {
    h += `<div class="npcr-field">
      <span class="npcr-field-label">Linked to</span>
      <div class="npcr-chips">${linkedIds.map(id => `<span class="npcr-chip">${esc(charNameFor(id))}</span>`).join('')}</div>
    </div>`;
  }

  if (suggestedFor.length > 0) {
    h += `<div class="npcr-field">
      <span class="npcr-field-label">ST-suggested for</span>
      <div class="npcr-chips">${suggestedFor.map(id => `<span class="npcr-chip">${esc(charNameFor(id))}</span>`).join('')}</div>
    </div>`;
  }

  if (!isNew && npcFlags.length > 0) {
    h += `<div class="npcr-flags-section">`;
    h += `<div class="npcr-flags-head">Open flags (${npcFlags.length})</div>`;
    for (const f of npcFlags) {
      const who = charNameFor(f.flagged_by?.character_id);
      const when = f.created_at ? new Date(f.created_at).toLocaleString() : '';
      h += `<div class="npcr-flag-row" data-flag-id="${esc(f._id)}">`;
      h += `<div class="npcr-flag-meta"><b>${esc(who)}</b> <span class="npcr-meta-label">${esc(when)}</span></div>`;
      h += `<div class="npcr-flag-reason">${esc(f.reason || '')}</div>`;
      h += `<div class="npcr-flag-actions"><button class="npcr-btn dim" data-act="resolve-flag" data-flag-id="${esc(f._id)}">Resolve</button></div>`;
      h += `</div>`;
    }
    h += `</div>`;
  }

  if (!isNew) {
    h += `<div class="npcr-rels-mount" id="npcr-rels-mount"></div>`;
  }

  if (!isNew) {
    const meta = [];
    if (npc.created_by?.type) {
      let creator = npc.created_by.type;
      if (npc.created_by.character_id) creator += ' - ' + charNameFor(npc.created_by.character_id);
      meta.push(['Created by', creator]);
    }
    if (npc.created_at) meta.push(['Created', new Date(npc.created_at).toLocaleString()]);
    if (npc.updated_at) meta.push(['Updated', new Date(npc.updated_at).toLocaleString()]);
    if (meta.length > 0) {
      h += '<div class="npcr-meta">';
      for (const [label, value] of meta) {
        h += `<div class="npcr-meta-row"><span class="npcr-meta-label">${esc(label)}</span><span>${esc(value)}</span></div>`;
      }
      h += '</div>';
    }
  }

  h += '<div class="npcr-actions">';
  h += `<button class="npcr-btn save" id="npcr-save">Save</button>`;
  h += `<button class="npcr-btn muted" id="npcr-cancel">Cancel</button>`;
  if (!isNew) h += `<button class="npcr-btn dim" id="npcr-retire">Retire</button>`;
  h += '</div>';
  h += '</div>';

  detail.innerHTML = h;

  document.getElementById('npcr-cancel')?.addEventListener('click', () => {
    _selectedNpcId = null;
    renderDetail();
    updateCardSelection();
  });
  document.getElementById('npcr-save')?.addEventListener('click', () => saveNpc(isNew));
  if (!isNew) {
    document.getElementById('npcr-retire')?.addEventListener('click', () => retireNpc(npc._id));
    detail.querySelectorAll('[data-act="resolve-flag"]').forEach(btn => {
      btn.addEventListener('click', () => resolveFlag(btn.dataset.flagId));
    });
  }

  if (isNew) document.getElementById('npcr-f-name')?.focus();

  if (!isNew) {
    const mount = document.getElementById('npcr-rels-mount');
    if (mount) {
      renderRelationshipsSection(mount, {
        npcId: String(npc._id),
        chars: _chars,
        npcs:  _npcs,
      });
    }
  }
}

async function saveNpc(isNew) {
  const errEl = document.getElementById('npcr-detail-err');
  if (errEl) errEl.textContent = '';

  const name = document.getElementById('npcr-f-name')?.value.trim() || '';
  if (!name) {
    if (errEl) errEl.textContent = 'Name is required.';
    return;
  }

  const body = {
    name,
    description: document.getElementById('npcr-f-desc')?.value.trim() || '',
    status: document.getElementById('npcr-f-status')?.value || 'active',
    notes: document.getElementById('npcr-f-notes')?.value.trim() || '',
    is_correspondent: !!document.getElementById('npcr-f-corr')?.checked,
  };

  try {
    if (isNew) {
      const linked = [];
      if (_selectedCharId !== ALL && _selectedCharId !== UNLINKED) {
        linked.push(String(_selectedCharId));
      }
      body.linked_character_ids = linked;
      const created = await apiPost('/api/npcs', body);
      _npcs.push(created);
      _selectedNpcId = String(created._id);
    } else {
      const updated = await apiPut(`/api/npcs/${_selectedNpcId}`, body);
      const idx = _npcs.findIndex(n => String(n._id) === String(_selectedNpcId));
      if (idx >= 0) _npcs[idx] = updated;
    }
    renderShell();
  } catch (err) {
    console.error('[npc-register] save error:', err);
    if (errEl) errEl.textContent = 'Save failed: ' + (err?.message || 'unknown error');
  }
}

async function retireNpc(id) {
  if (!confirm('Retire this NPC? It will be archived and removed from the default view.')) return;
  const errEl = document.getElementById('npcr-detail-err');
  if (errEl) errEl.textContent = '';
  try {
    await apiDelete(`/api/npcs/${id}`);
    const idx = _npcs.findIndex(n => String(n._id) === String(id));
    if (idx >= 0) _npcs[idx].status = 'archived';
    _selectedNpcId = null;
    renderShell();
  } catch (err) {
    console.error('[npc-register] retire error:', err);
    if (errEl) errEl.textContent = 'Retire failed: ' + (err?.message || 'unknown error');
  }
}

async function resolveFlag(flagId) {
  const note = prompt('Resolution note (optional):', '');
  if (note === null) return; // cancelled
  const errEl = document.getElementById('npcr-detail-err');
  if (errEl) errEl.textContent = '';
  try {
    await apiPut(`/api/npc-flags/${flagId}/resolve`, { resolution_note: note.trim() });
    _openFlags = _openFlags.filter(f => String(f._id) !== String(flagId));
    renderShell();
  } catch (err) {
    console.error('[npc-register] resolve error:', err);
    if (errEl) errEl.textContent = 'Resolve failed: ' + (err?.message || 'unknown error');
  }
}
