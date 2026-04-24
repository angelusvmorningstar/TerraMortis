/* Player Relationships tab (NPCR.6 scaffold, NPCR.7 adds PC-to-NPC creation).
 *
 * NPCR.6: read-only list view of edges involving the active character,
 * grouped by kind family. Server-side `_other_name` enrichment lets the
 * tab render NPC and PC names without calling ST-only routes. "New" badge
 * and dismissable "Updated" chip use localStorage per character.
 *
 * NPCR.7: "Add Relationship" picker lets the player POST a new PC-to-NPC
 * edge. Picker draft state + loaded NPC directory + kind metadata live on
 * module-scoped _tabState, rebuilt on character switch.
 */

import { apiGet, apiPost, apiRaw } from '../data/api.js';
import { esc } from '../data/helpers.js';
import {
  FAMILIES,
  RELATIONSHIP_KINDS,
  kindByCode,
} from '../data/relationship-kinds.js';

// Per-character picker state: { charId, mode: 'closed'|'add', draft, npcs, error }
let _tabState = null;

function resetTabState(charId) {
  _tabState = {
    charId: String(charId),
    mode: 'closed',
    // NPCR.7 + NPCR.8: picker has two sub-modes — pick an existing NPC or
    // quick-add a new pending one. npc_mode = 'existing' | 'new'.
    npc_mode: 'existing',
    draft: {
      npc_id: '',
      new_name: '',
      new_relationship_note: '',
      new_general_note: '',
      kind: '',
      disposition: '',
      state: '',
      custom_label: '',
    },
    npcs: null,
    error: null,
    submitting: false,
  };
}

// Kinds players may create from the Relationships tab: anything with b='npc'
// or b='any', MINUS touchstone (lives on character.touchstones[] via the sheet
// picker in NPCR.4). Grouped by family for the picker dropdown.
function playerCreatableKinds() {
  return RELATIONSHIP_KINDS.filter(k => {
    if (k.code === 'touchstone') return false;
    const bType = k.typicalEndpoints?.b;
    return bType === 'npc' || bType === 'any';
  });
}

const LAST_SEEN_PREFIX    = 'tm:rel_last_seen:';
const DISMISSED_PREFIX    = 'tm:rel_dismissed_updates:';
const COLLAPSED_PREFIX    = 'tm:rel_family_collapsed:';

function lastSeenKey(charId)   { return LAST_SEEN_PREFIX   + String(charId); }
function dismissedKey(charId)  { return DISMISSED_PREFIX   + String(charId); }
function collapsedKey(charId)  { return COLLAPSED_PREFIX   + String(charId); }

function readLastSeen(charId) {
  try { return localStorage.getItem(lastSeenKey(charId)) || null; }
  catch { return null; }
}

function writeLastSeen(charId, iso) {
  try { localStorage.setItem(lastSeenKey(charId), iso); } catch { /* quota etc */ }
}

function readDismissed(charId) {
  try {
    const raw = localStorage.getItem(dismissedKey(charId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeDismissed(charId, map) {
  try { localStorage.setItem(dismissedKey(charId), JSON.stringify(map)); } catch { /* */ }
}

function readCollapsed(charId) {
  try {
    const raw = localStorage.getItem(collapsedKey(charId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function writeCollapsed(charId, map) {
  try { localStorage.setItem(collapsedKey(charId), JSON.stringify(map)); } catch { /* */ }
}

// ── Derivation helpers ──────────────────────────────────────────────────────

function edgeCreatedAt(edge) {
  return edge.created_at || edge.history?.[0]?.at || null;
}

function lastStHistory(edge) {
  if (!Array.isArray(edge.history)) return null;
  for (let i = edge.history.length - 1; i >= 0; i--) {
    const h = edge.history[i];
    if (h?.by?.type === 'st') return h;
  }
  return null;
}

function isNew(edge, lastSeenIso) {
  if (!lastSeenIso) return false; // first visit: don't badge everything
  const createdAt = edgeCreatedAt(edge);
  if (!createdAt) return false;
  return createdAt > lastSeenIso;
}

function lastStUpdateSince(edge, lastSeenIso) {
  if (!lastSeenIso) return null;
  const st = lastStHistory(edge);
  if (!st || st.change === 'created') return null;
  if (!st.at || st.at <= lastSeenIso) return null;
  return st;
}

function dispositionClass(d) {
  if (d === 'positive') return 'rel-disp positive';
  if (d === 'negative') return 'rel-disp negative';
  if (d === 'neutral')  return 'rel-disp neutral';
  return 'rel-disp unset';
}

function dispositionLabel(d) {
  if (d === 'positive') return 'positive';
  if (d === 'negative') return 'negative';
  if (d === 'neutral')  return 'neutral';
  return '—';
}

function statusChip(edge) {
  if (edge.status === 'active') return '';
  if (edge.status === 'pending_confirmation') {
    return '<span class="rel-status-chip pending">awaiting confirmation</span>';
  }
  if (edge.status === 'retired') {
    return '<span class="rel-status-chip retired">retired</span>';
  }
  if (edge.status === 'rejected') {
    return '<span class="rel-status-chip rejected">declined</span>';
  }
  return '';
}

// ── Public entry ────────────────────────────────────────────────────────────

export async function renderRelationshipsTab(el, char) {
  if (!el || !char?._id) return;
  const charId = String(char._id);

  // Rebuild picker state on character switch or first render.
  if (!_tabState || _tabState.charId !== charId) resetTabState(charId);

  el.innerHTML = `
    <div class="rel-tab">
      <div class="rel-tab-head">
        <div class="rel-tab-head-row">
          <div>
            <h2 class="rel-tab-title">Relationships</h2>
            <div class="rel-tab-sub">Edges involving ${esc(char.moniker || char.name)}.</div>
          </div>
          <button class="rel-add-btn" type="button" data-act="open-add">+ Add Relationship</button>
        </div>
      </div>
      <div id="rel-add-panel"></div>
      <div id="rel-tab-body">
        <div class="rel-loading">Loading…</div>
      </div>
    </div>
  `;

  // Wire the Add button now; the picker panel renders only when opened.
  el.querySelector('[data-act="open-add"]')?.addEventListener('click', () => openAddPicker(el, char));
  renderAddPanel(el, char);

  const body = el.querySelector('#rel-tab-body');
  let edges;
  try {
    edges = await apiGet('/api/relationships/for-character/' + charId);
  } catch (err) {
    body.innerHTML = `<div class="rel-error" role="alert">Failed to load relationships: ${esc(err?.message || 'unknown error')}</div>`;
    return;
  }

  const lastSeen = readLastSeen(charId);
  const dismissed = readDismissed(charId);
  const collapsed = readCollapsed(charId);

  // Group by family
  const grouped = Object.fromEntries(FAMILIES.map(f => [f, []]));
  for (const e of edges) {
    const k = kindByCode(e.kind);
    const fam = k?.family || 'Other';
    grouped[fam].push(e);
  }

  if (edges.length === 0) {
    body.innerHTML = `
      <div class="rel-empty">
        <p>No relationships yet.</p>
        <p class="rel-empty-hint">When an ST or your fellow players connect you to someone, they'll appear here.</p>
      </div>
    `;
    writeLastSeen(charId, new Date().toISOString());
    return;
  }

  let html = '';
  for (const family of FAMILIES) {
    const bucket = grouped[family];
    if (bucket.length === 0) continue;
    const isCollapsed = !!collapsed[family];
    html += `
      <section class="rel-family${isCollapsed ? ' collapsed' : ''}" data-family="${esc(family)}">
        <header class="rel-family-head" data-act="toggle-family">
          <span class="rel-family-name">${esc(family)}</span>
          <span class="rel-family-count">${bucket.length}</span>
          <span class="rel-family-caret">${isCollapsed ? '▸' : '▾'}</span>
        </header>
        <div class="rel-family-body">
          ${bucket.map(e => renderEdgeCard(e, lastSeen, dismissed)).join('')}
        </div>
      </section>
    `;
  }

  body.innerHTML = html;

  attachHandlers(body, charId);

  // Mark the tab visited — future "New" badges key off this timestamp.
  // Persist AFTER render so "New" badges remain correct for this session.
  writeLastSeen(charId, new Date().toISOString());
}

// ── Card rendering ──────────────────────────────────────────────────────────

function renderEdgeCard(edge, lastSeen, dismissed) {
  const k = kindByCode(edge.kind);
  const kindLabel = k?.label || edge.kind;
  const custom = edge.kind === 'other' && edge.custom_label ? ` (${esc(edge.custom_label)})` : '';
  const otherName = edge._other_name || '(unknown)';

  const showNew = isNew(edge, lastSeen);
  const stUpdate = lastStUpdateSince(edge, lastSeen);
  const dismissedTs = dismissed[String(edge._id)];
  const showUpdated = !!stUpdate && stUpdate.at !== dismissedTs;

  const stateText = edge.state || '';
  const truncated = stateText.length > 180;
  const displayState = truncated ? stateText.slice(0, 180).trim() + '…' : stateText;

  const dispChip = edge.disposition
    ? `<span class="${dispositionClass(edge.disposition)}" title="Disposition: ${esc(edge.disposition)}">${esc(dispositionLabel(edge.disposition))}</span>`
    : '';

  return `
    <article class="rel-edge-card" data-edge-id="${esc(String(edge._id))}">
      <header class="rel-edge-head">
        <div class="rel-edge-head-main">
          <span class="rel-edge-name">${esc(otherName)}</span>
          <span class="rel-edge-kind">${esc(kindLabel)}${custom}</span>
        </div>
        <div class="rel-edge-head-chips">
          ${dispChip}
          ${statusChip(edge)}
          ${showNew ? '<span class="rel-new-badge" title="Added since your last visit">New</span>' : ''}
          ${showUpdated ? `<span class="rel-updated-chip" data-act="dismiss-update" data-at="${esc(stUpdate.at)}" title="Dismiss">Updated ✕</span>` : ''}
        </div>
      </header>
      ${stateText ? `
        <div class="rel-edge-state ${truncated ? 'truncated' : ''}" data-act="${truncated ? 'expand-state' : ''}">
          <span class="rel-edge-state-text">${esc(displayState)}</span>
          ${truncated ? '<button class="rel-edge-state-more" type="button">Show more</button>' : ''}
          <span class="rel-edge-state-full" hidden>${esc(stateText)}</span>
        </div>
      ` : ''}
    </article>
  `;
}

// ── Handlers ────────────────────────────────────────────────────────────────

function attachHandlers(root, charId) {
  root.querySelectorAll('[data-act="toggle-family"]').forEach(head => {
    head.addEventListener('click', () => {
      const section = head.closest('.rel-family');
      if (!section) return;
      const family = section.dataset.family;
      section.classList.toggle('collapsed');
      const isCollapsed = section.classList.contains('collapsed');
      const caret = head.querySelector('.rel-family-caret');
      if (caret) caret.textContent = isCollapsed ? '▸' : '▾';
      const map = readCollapsed(charId);
      if (isCollapsed) map[family] = true;
      else delete map[family];
      writeCollapsed(charId, map);
    });
  });

  root.querySelectorAll('[data-act="dismiss-update"]').forEach(chip => {
    chip.addEventListener('click', e => {
      e.stopPropagation();
      const card = chip.closest('.rel-edge-card');
      if (!card) return;
      const edgeId = card.dataset.edgeId;
      const at = chip.dataset.at;
      const map = readDismissed(charId);
      map[edgeId] = at;
      writeDismissed(charId, map);
      chip.remove();
    });
  });

  root.querySelectorAll('.rel-edge-state.truncated').forEach(wrap => {
    const moreBtn = wrap.querySelector('.rel-edge-state-more');
    const text = wrap.querySelector('.rel-edge-state-text');
    const full = wrap.querySelector('.rel-edge-state-full');
    if (!moreBtn || !text || !full) return;
    moreBtn.addEventListener('click', e => {
      e.stopPropagation();
      text.textContent = full.textContent;
      wrap.classList.remove('truncated');
      moreBtn.remove();
    });
  });
}

// ── NPCR.7: Add Relationship picker ─────────────────────────────────────────

async function openAddPicker(el, char) {
  _tabState.mode = 'add';
  _tabState.npc_mode = 'existing';
  _tabState.error = null;
  _tabState.submitting = false;
  _tabState.draft = {
    npc_id: '', new_name: '', new_relationship_note: '', new_general_note: '',
    kind: '', disposition: '', state: '', custom_label: '',
  };
  renderAddPanel(el, char);
  if (!_tabState.npcs) {
    try {
      _tabState.npcs = await apiGet('/api/npcs/directory');
    } catch (err) {
      _tabState.error = 'Failed to load NPC list: ' + (err?.message || 'unknown error');
      _tabState.npcs = [];
    }
    renderAddPanel(el, char);
  }
}

function setNpcMode(el, char, mode) {
  _tabState.npc_mode = mode === 'new' ? 'new' : 'existing';
  _tabState.error = null;
  renderAddPanel(el, char);
}

function closeAddPicker(el, char) {
  _tabState.mode = 'closed';
  _tabState.error = null;
  renderAddPanel(el, char);
}

function renderAddPanel(el, char) {
  const panel = el.querySelector('#rel-add-panel');
  if (!panel) return;
  if (_tabState.mode !== 'add') { panel.innerHTML = ''; return; }

  const loading = _tabState.npcs === null;
  const draft = _tabState.draft;
  const npcMode = _tabState.npc_mode;
  const kinds = playerCreatableKinds();

  const npcOpts = (_tabState.npcs || [])
    .filter(n => n.status === 'active' || n.status === 'pending')
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }))
    .map(n => `<option value="${esc(String(n._id))}"${String(draft.npc_id) === String(n._id) ? ' selected' : ''}>${esc(n.name || '(unnamed)')}${n.status === 'pending' ? ' (pending)' : ''}</option>`)
    .join('');

  const kindGroups = FAMILIES.map(family => {
    const bucket = kinds.filter(k => k.family === family);
    if (bucket.length === 0) return '';
    const opts = bucket
      .map(k => `<option value="${esc(k.code)}"${draft.kind === k.code ? ' selected' : ''}>${esc(k.label)}</option>`)
      .join('');
    return `<optgroup label="${esc(family)}">${opts}</optgroup>`;
  }).join('');

  const showCustomLabel = draft.kind === 'other';
  const saveLabel = _tabState.submitting ? 'Saving…' : 'Save';

  panel.innerHTML = `
    <section class="rel-add-form" role="dialog" aria-label="Add relationship">
      <div class="rel-add-form-head">New relationship</div>
      ${_tabState.error ? `<div class="rel-error" role="alert">${esc(_tabState.error)}</div>` : ''}

      <div class="rel-add-mode-chips" role="radiogroup" aria-label="NPC source">
        <button type="button" class="rel-add-mode-chip${npcMode === 'existing' ? ' on' : ''}" data-npc-mode="existing">Existing NPC</button>
        <button type="button" class="rel-add-mode-chip${npcMode === 'new' ? ' on' : ''}" data-npc-mode="new">New NPC (pending)</button>
      </div>

      ${npcMode === 'existing' ? `
        <label class="rel-add-field">
          <span class="rel-add-field-label">NPC *</span>
          ${loading
            ? '<div class="rel-add-loading">Loading NPCs…</div>'
            : `<select class="rel-add-input" data-field="npc_id">
                 <option value="">(pick an NPC)</option>
                 ${npcOpts}
               </select>`}
        </label>
      ` : `
        <label class="rel-add-field">
          <span class="rel-add-field-label">Name *</span>
          <input class="rel-add-input" data-field="new_name" value="${esc(draft.new_name)}" placeholder="NPC name" />
        </label>
        <label class="rel-add-field">
          <span class="rel-add-field-label">Relationship note (optional)</span>
          <input class="rel-add-input" data-field="new_relationship_note" value="${esc(draft.new_relationship_note)}" placeholder="What's the situation with them?" />
        </label>
        <label class="rel-add-field">
          <span class="rel-add-field-label">General note (optional)</span>
          <input class="rel-add-input" data-field="new_general_note" value="${esc(draft.new_general_note)}" placeholder="Short description for the register" />
        </label>
        <div class="rel-add-hint">The ST will review this NPC; it appears in your relationships immediately.</div>
      `}

      <label class="rel-add-field">
        <span class="rel-add-field-label">Kind *</span>
        <select class="rel-add-input" data-field="kind">
          <option value="">(pick a kind)</option>
          ${kindGroups}
        </select>
      </label>
      ${showCustomLabel ? `
        <label class="rel-add-field">
          <span class="rel-add-field-label">Custom label *</span>
          <input class="rel-add-input" data-field="custom_label" value="${esc(draft.custom_label)}" placeholder="e.g., blood-oath partner" />
        </label>
      ` : ''}
      <div class="rel-add-field">
        <span class="rel-add-field-label">Disposition (optional)</span>
        <div class="rel-disp-chips" role="radiogroup">
          ${['positive', 'neutral', 'negative'].map(d => `
            <button type="button" class="rel-disp-chip ${d}${draft.disposition === d ? ' on' : ''}" data-disp="${d}">${d}</button>
          `).join('')}
          <button type="button" class="rel-disp-chip clear${!draft.disposition ? ' on' : ''}" data-disp="">clear</button>
        </div>
      </div>
      <label class="rel-add-field">
        <span class="rel-add-field-label">State (optional)</span>
        <textarea class="rel-add-input rel-add-textarea" data-field="state" rows="3" placeholder="How does this relationship stand?">${esc(draft.state)}</textarea>
      </label>
      <div class="rel-add-actions">
        <button type="button" class="rel-add-btn primary" data-act="save-add"${_tabState.submitting ? ' disabled' : ''}>${esc(saveLabel)}</button>
        <button type="button" class="rel-add-btn muted" data-act="cancel-add"${_tabState.submitting ? ' disabled' : ''}>Cancel</button>
      </div>
    </section>
  `;

  // Handlers
  panel.querySelectorAll('[data-field]').forEach(input => {
    const handler = () => {
      _tabState.draft[input.dataset.field] = input.value;
      if (input.dataset.field === 'kind') renderAddPanel(el, char);
    };
    input.addEventListener('change', handler);
    if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
      input.addEventListener('input', () => {
        _tabState.draft[input.dataset.field] = input.value;
      });
    }
  });
  panel.querySelectorAll('.rel-disp-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      _tabState.draft.disposition = chip.dataset.disp || '';
      panel.querySelectorAll('.rel-disp-chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
    });
  });
  panel.querySelectorAll('.rel-add-mode-chip').forEach(chip => {
    chip.addEventListener('click', () => setNpcMode(el, char, chip.dataset.npcMode));
  });
  panel.querySelector('[data-act="cancel-add"]')?.addEventListener('click', () => closeAddPicker(el, char));
  panel.querySelector('[data-act="save-add"]')?.addEventListener('click', () => saveAddEdge(el, char));
}

async function saveAddEdge(el, char) {
  if (_tabState.submitting) return; // Guard against double-click.
  const draft = _tabState.draft;

  if (!draft.kind) { _tabState.error = 'Pick a kind before saving.'; renderAddPanel(el, char); return; }
  if (draft.kind === 'other' && !String(draft.custom_label).trim()) {
    _tabState.error = 'Custom label is required for kind=other.';
    renderAddPanel(el, char);
    return;
  }

  // Validate NPC source up front.
  let npcIdForEdge = null;
  if (_tabState.npc_mode === 'existing') {
    if (!draft.npc_id) {
      _tabState.error = 'Pick an NPC before saving.';
      renderAddPanel(el, char);
      return;
    }
    npcIdForEdge = String(draft.npc_id);
  } else {
    if (!String(draft.new_name || '').trim()) {
      _tabState.error = 'Name is required for a new NPC.';
      renderAddPanel(el, char);
      return;
    }
  }

  _tabState.submitting = true;
  _tabState.error = null;
  renderAddPanel(el, char);

  try {
    // Step 1 (new-NPC only): quick-add the pending NPC first.
    if (_tabState.npc_mode === 'new') {
      const quickBody = {
        name: String(draft.new_name).trim(),
        relationship_note: String(draft.new_relationship_note || '').trim(),
        general_note: String(draft.new_general_note || '').trim(),
        character_id: String(char._id),
      };
      const { status: qs, ok: qok, body: qbody } = await apiRaw('POST', '/api/npcs/quick-add', quickBody);
      if (!qok) {
        if (qs === 429) {
          _tabState.error = qbody?.message || 'Please wait before creating another NPC.';
        } else if (qs === 403) {
          _tabState.error = 'You cannot create an NPC for that character.';
        } else if (qs === 400) {
          _tabState.error = qbody?.message || 'NPC name is required.';
        } else {
          _tabState.error = qbody?.message || `Quick-add failed (HTTP ${qs}).`;
        }
        _tabState.submitting = false;
        renderAddPanel(el, char);
        return;
      }
      npcIdForEdge = String(qbody._id);
      // Keep the new NPC in _tabState.npcs so subsequent interactions see it.
      if (Array.isArray(_tabState.npcs)) _tabState.npcs.push(qbody);
    }

    // Step 2: create the relationship edge.
    const edgeBody = {
      a: { type: 'pc',  id: String(char._id) },
      b: { type: 'npc', id: npcIdForEdge },
      kind: draft.kind,
      direction: 'a_to_b',
      state: String(draft.state || ''),
      st_hidden: false,
    };
    if (draft.disposition) edgeBody.disposition = draft.disposition;
    if (draft.kind === 'other') edgeBody.custom_label = String(draft.custom_label).trim();

    const { status, ok, body: resBody } = await apiRaw('POST', '/api/relationships', edgeBody);
    if (ok && status === 201) {
      _tabState.submitting = false;
      closeAddPicker(el, char);
      renderRelationshipsTab(el, char);
      return;
    }

    if (status === 409) {
      _tabState.error = resBody?.message || 'A relationship with this NPC and kind already exists.';
    } else if (status === 403) {
      _tabState.error = 'You do not have permission to create this relationship.';
    } else {
      _tabState.error = resBody?.message || `Edge save failed (HTTP ${status}).`;
    }
  } finally {
    _tabState.submitting = false;
    renderAddPanel(el, char);
  }
}
