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
  const header = document.getElementById('npcr-main-header');
  const grid = document.getElementById('npcr-grid');
  const detail = document.getElementById('npcr-detail');
  if (!header || !grid || !detail) return;

  const list = npcsForSelection();
  header.innerHTML = `
    <div class="npcr-main-title">${esc(labelForSelection())}</div>
    <div class="npcr-main-sub">${list.length} NPC${list.length === 1 ? '' : 's'}</div>
  `;
  grid.innerHTML = '<p class="npcr-empty">Grid renders in task 3.</p>';
  detail.innerHTML = '';
}
