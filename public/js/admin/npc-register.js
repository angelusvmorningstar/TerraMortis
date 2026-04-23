/* NPC Register — first-class admin tab (NPCR.1).
   Two-pane layout: PC picker left, NPC grid + detail right.
   Data loads lazily on first entry; subsequent entries re-render from cache. */

import { apiGet } from '../data/api.js';
import { esc, sortName, displayName } from '../data/helpers.js';

const ALL = '__all__';
const UNLINKED = '__unlinked__';

let _chars = [];
let _npcs = [];
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
    _npcs = await apiGet('/api/npcs');
  } catch (err) {
    console.error('[npc-register] load error:', err);
    _npcs = [];
  }
  renderShell();
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
  const list = npcsForSelection();
  header.innerHTML = `
    <div class="npcr-main-title">${esc(labelForSelection())}</div>
    <div class="npcr-main-sub">${list.length} NPC${list.length === 1 ? '' : 's'}</div>
  `;
}

function renderGrid() {
  const grid = document.getElementById('npcr-grid');
  if (!grid) return;

  const list = npcsForSelection().slice().sort((a, b) =>
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
  const status = n.status || 'active';
  const statusCls = status === 'pending' ? ' pending'
                  : status === 'inactive' || status === 'destroyed' ? ' inactive' : '';
  let h = `<button class="npcr-card" data-npc-id="${esc(n._id)}">`;
  h += `<div class="npcr-card-head">`;
  h += `<span class="npcr-card-name">${esc(n.name)}</span>`;
  h += `<span class="npcr-card-status${statusCls}">${esc(status)}</span>`;
  h += `</div>`;
  const badges = [];
  if (isCorr) badges.push('<span class="npcr-badge corr" title="Correspondent">C</span>');
  if (suggestedCount > 0) badges.push(`<span class="npcr-badge sug" title="ST-suggested for ${suggestedCount} character${suggestedCount === 1 ? '' : 's'}">S${suggestedCount}</span>`);
  if (badges.length) h += `<div class="npcr-card-badges">${badges.join('')}</div>`;
  if (n.description) h += `<div class="npcr-card-desc">${esc(n.description)}</div>`;
  h += `</button>`;
  return h;
}

function renderDetail() {
  const detail = document.getElementById('npcr-detail');
  if (!detail) return;
  if (!_selectedNpcId) {
    detail.innerHTML = '';
    return;
  }
  if (_selectedNpcId === '__new__') {
    detail.innerHTML = '<div class="npcr-detail-placeholder">New NPC form lands in task 4.</div>';
    return;
  }
  const npc = _npcs.find(n => String(n._id) === String(_selectedNpcId));
  if (!npc) {
    detail.innerHTML = '';
    return;
  }
  let h = '<div class="npcr-detail-preview">';
  h += `<div class="npcr-detail-title">${esc(npc.name)}</div>`;
  h += `<div class="npcr-detail-row"><span class="npcr-detail-label">Status</span><span>${esc(npc.status || 'active')}</span></div>`;
  if (npc.description) h += `<div class="npcr-detail-row"><span class="npcr-detail-label">Description</span><span>${esc(npc.description)}</span></div>`;
  if (npc.notes) h += `<div class="npcr-detail-row"><span class="npcr-detail-label">Notes</span><span>${esc(npc.notes)}</span></div>`;
  h += `<div class="npcr-detail-row"><span class="npcr-detail-label">Correspondent</span><span>${npc.is_correspondent ? 'yes' : 'no'}</span></div>`;
  h += '<div class="npcr-detail-placeholder">Editor lands in task 4.</div>';
  h += '</div>';
  detail.innerHTML = h;
}
