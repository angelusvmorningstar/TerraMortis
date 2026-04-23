/* NPC Register — first-class admin tab (NPCR.1).
   Two-pane layout: PC picker left, NPC grid + detail right.
   Data loads lazily on first entry; subsequent entries re-render from cache. */

import { apiGet } from '../data/api.js';
import { esc, sortName, displayName } from '../data/helpers.js';

let _chars = [];
let _npcs = [];
let _selectedCharId = null;
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

function renderShell() {
  const host = document.getElementById('npcs-content');
  if (!host) return;
  host.innerHTML = `
    <div class="npcr-layout">
      <aside class="npcr-picker">
        <div class="npcr-picker-header">Characters</div>
        <div class="npcr-picker-list" id="npcr-picker-list">
          <p class="npcr-empty">Loading...</p>
        </div>
      </aside>
      <section class="npcr-main">
        <div class="npcr-main-header" id="npcr-main-header"></div>
        <div class="npcr-grid" id="npcr-grid"></div>
        <div class="npcr-detail" id="npcr-detail"></div>
      </section>
    </div>
  `;
  const count = document.getElementById('npcs-count');
  if (count) count.textContent = _loaded ? String(_npcs.length) : '';
}
