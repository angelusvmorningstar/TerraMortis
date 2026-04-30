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
import { isSTRole } from '../auth/discord.js';
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

// NPCR.10: PC-PC-eligible kinds are the subset where b can be 'any'
// (Lineage + Political + 'romantic' + 'other'). Mortal kinds that are
// b='npc'-only (family, contact, retainer, correspondent) stay excluded.
function playerPcPcKinds() {
  return RELATIONSHIP_KINDS.filter(k => {
    if (k.code === 'touchstone') return false;
    return k.typicalEndpoints?.b === 'any';
  });
}

const LAST_SEEN_PREFIX     = 'tm:rel_last_seen:';
const DISMISSED_PREFIX     = 'tm:rel_dismissed_updates:';
const COLLAPSED_PREFIX     = 'tm:rel_family_collapsed:';
const DISMISSED_FLAGS_PFX  = 'tm:rel_dismissed_flags:'; // NPCR.11: keyed by char; value { npc_id: resolved_at }

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

function dismissedFlagsKey(charId) { return DISMISSED_FLAGS_PFX + String(charId); }
function readDismissedFlags(charId) {
  try {
    const raw = localStorage.getItem(dismissedFlagsKey(charId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function writeDismissedFlags(charId, map) {
  try { localStorage.setItem(dismissedFlagsKey(charId), JSON.stringify(map)); } catch { /* */ }
}

// NPCR.11: simple themed modal for the flag-reason prompt. Returns a Promise
// that resolves to the trimmed reason string on submit, or null on cancel.
function openFlagModal({ npcName }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'npcr-modal-overlay';
    overlay.innerHTML = `
      <div class="npcr-modal" role="dialog" aria-labelledby="rel-flag-modal-title">
        <div class="npcr-modal-title" id="rel-flag-modal-title">Flag ${esc(npcName)} for ST review</div>
        <div class="npcr-modal-body">
          <label class="npcr-field">
            <span class="npcr-field-label">What feels off? (required)</span>
            <textarea id="rel-flag-reason" class="npcr-textarea" rows="4" maxlength="2000" placeholder="The ST will read this and either edit the record or reply with a resolution note."></textarea>
          </label>
        </div>
        <div class="npcr-modal-actions">
          <button class="npcr-btn muted" data-act="cancel">Cancel</button>
          <button class="npcr-btn save" data-act="submit">Submit</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const textarea = overlay.querySelector('#rel-flag-reason');
    setTimeout(() => textarea?.focus(), 0);

    function close(result) {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        const v = textarea.value.trim();
        if (v) close(v);
      }
    }
    document.addEventListener('keydown', onKey);
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(null));
    overlay.querySelector('[data-act="submit"]').addEventListener('click', () => {
      const v = textarea.value.trim();
      if (!v) {
        textarea.focus();
        return;
      }
      close(v);
    });
    overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
  });
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

function statusChip(edge, char) {
  if (edge.status === 'active') return '';
  if (edge.status === 'pending_confirmation') {
    // If this char is endpoint a (the initiator), they're "awaiting" the
    // other PC. If they're endpoint b, the banner handles it; chip on the
    // card is a fallback.
    const isInitiator = edge.a?.type === 'pc' && String(edge.a?.id) === String(char?._id);
    const label = isInitiator
      ? 'Awaiting ' + (edge._other_name || 'other PC')
      : 'awaiting confirmation';
    return `<span class="rel-status-chip pending">${esc(label)}</span>`;
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
            <h2 class="rel-tab-title">NPCs</h2>
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
        <p class="rel-empty-title">Start your first relationship</p>
        <p>Tap <strong>+ Add Relationship</strong> above to link your character to an NPC or propose a connection with another PC.</p>
        <p class="rel-empty-hint">When STs or fellow players connect you to someone, they'll appear here too.</p>
      </div>
    `;
    writeLastSeen(charId, new Date().toISOString());
    return;
  }

  // NPCR.10: pending incoming banners — edges where this char is endpoint b
  // and status='pending_confirmation'. Rendered above the family sections so
  // the user sees actionable items first.
  const incoming = edges.filter(e =>
    e.status === 'pending_confirmation' &&
    e.b?.type === 'pc' &&
    String(e.b?.id) === String(char._id)
  );
  let html = '';
  for (const edge of incoming) {
    const kindLabel = kindByCode(edge.kind)?.label || edge.kind;
    const proposer = edge._other_name || '(another character)';
    const dispChip = edge.disposition
      ? `<span class="${dispositionClass(edge.disposition)}" title="Disposition: ${esc(edge.disposition)}">${esc(dispositionLabel(edge.disposition))}</span>`
      : '';
    html += `
      <div class="rel-pending-banner" role="alert" data-edge-id="${esc(String(edge._id))}">
        <div class="rel-pending-text">
          <div class="rel-pending-head">
            <strong>${esc(proposer)}</strong> wants to connect as <strong>${esc(kindLabel)}</strong>.
            ${dispChip}
          </div>
          ${edge.state ? `<div class="rel-pending-state">${esc(edge.state)}</div>` : ''}
        </div>
        <div class="rel-pending-actions">
          <button type="button" class="rel-add-btn primary" data-act="confirm-edge" data-edge-id="${esc(String(edge._id))}">Accept</button>
          <button type="button" class="rel-add-btn muted" data-act="decline-edge" data-edge-id="${esc(String(edge._id))}">Decline</button>
        </div>
      </div>
    `;
  }

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
          ${bucket.map(e => renderEdgeCard(e, lastSeen, dismissed, char)).join('')}
        </div>
      </section>
    `;
  }

  body.innerHTML = html;

  attachHandlers(body, charId, char, edges);

  // Mark the tab visited — future "New" badges key off this timestamp.
  // Persist AFTER render so "New" badges remain correct for this session.
  writeLastSeen(charId, new Date().toISOString());
}

// ── Card rendering ──────────────────────────────────────────────────────────

function canEditEdge(edge, char) {
  // NPCR.9 edit-rights gate: active edge owned by the active character.
  return edge.status === 'active'
    && String(edge.created_by_char_id || '') === String(char?._id || '');
}

function renderEdgeCard(edge, lastSeen, dismissed, char) {
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

  const editable = canEditEdge(edge, char);
  const isEditing = editable && _tabState?.editing_edge_id === String(edge._id);

  if (isEditing) {
    return renderEdgeEditForm(edge);
  }

  // NPCR.11: flag state for NPC-endpoint edges. The "Other" side is either
  // b (when a=this char) or a (when b=this char). Only surface the flag
  // affordance when the other side is an NPC.
  const otherEp = String(edge.a?.id) === String(char?._id) ? edge.b : edge.a;
  const isNpcEdge = otherEp?.type === 'npc';
  const flagState = edge._flag_state;
  let flagAffordance = '';
  if (isNpcEdge) {
    const dismissed = readDismissedFlags(char._id);
    const npcId = String(otherEp.id);
    const dismissedAt = dismissed[npcId];
    if (flagState?.status === 'open') {
      flagAffordance = '<span class="rel-flag-chip flagged" title="Awaiting ST review">⚑ Flagged</span>';
    } else if (flagState?.status === 'resolved' && flagState.resolved_at !== dismissedAt) {
      flagAffordance = `<span class="rel-flag-chip resolved" data-act="dismiss-flag" data-npc-id="${esc(npcId)}" data-resolved-at="${esc(flagState.resolved_at || '')}" title="Click to dismiss">⚑ ST resolved · ${esc(flagState.resolution_note || '(no note)')} ✕</span>`;
    } else {
      flagAffordance = `<button type="button" class="rel-flag-btn" data-act="flag-npc" data-npc-id="${esc(npcId)}" title="Something off about this NPC?">⚑</button>`;
    }
  }

  return `
    <article class="rel-edge-card" data-edge-id="${esc(String(edge._id))}">
      <header class="rel-edge-head">
        <div class="rel-edge-head-main">
          <span class="rel-edge-name">${esc(otherName)}</span>
          <span class="rel-edge-kind">${esc(kindLabel)}${custom}</span>
        </div>
        <div class="rel-edge-head-chips">
          ${dispChip}
          ${statusChip(edge, char)}
          ${showNew ? '<span class="rel-new-badge" title="Added since your last visit">New</span>' : ''}
          ${showUpdated ? `<span class="rel-updated-chip" data-act="dismiss-update" data-at="${esc(stUpdate.at)}" title="Dismiss">Updated ✕</span>` : ''}
          ${flagAffordance}
        </div>
      </header>
      ${stateText ? `
        <div class="rel-edge-state ${truncated ? 'truncated' : ''}" data-act="${truncated ? 'expand-state' : ''}">
          <span class="rel-edge-state-text">${esc(displayState)}</span>
          ${truncated ? '<button class="rel-edge-state-more" type="button">Show more</button>' : ''}
          <span class="rel-edge-state-full" hidden>${esc(stateText)}</span>
        </div>
      ` : ''}
      ${editable ? `
        <div class="rel-edge-actions">
          <button type="button" class="rel-edit-btn" data-act="start-edit" data-edge-id="${esc(String(edge._id))}">Edit</button>
        </div>
      ` : ''}
    </article>
  `;
}

function renderEdgeEditForm(edge) {
  const draft = _tabState.edit_draft || {};
  const state = draft.state ?? edge.state ?? '';
  const disposition = draft.disposition !== undefined ? draft.disposition : (edge.disposition || '');
  const customLabel = draft.custom_label !== undefined ? draft.custom_label : (edge.custom_label || '');
  const showCustomLabel = edge.kind === 'other';
  const stateLen = String(state).length;
  const capClass = stateLen > 2000 ? ' over-cap' : '';
  const submitting = !!_tabState.editing_submitting;

  return `
    <article class="rel-edge-card rel-edge-card-editing" data-edge-id="${esc(String(edge._id))}">
      <header class="rel-edge-head">
        <div class="rel-edge-head-main">
          <span class="rel-edge-name">${esc(edge._other_name || '(unknown)')}</span>
          <span class="rel-edge-kind">Editing · ${esc(kindByCode(edge.kind)?.label || edge.kind)}</span>
        </div>
      </header>
      ${_tabState.edit_error ? `<div class="rel-error" role="alert">${esc(_tabState.edit_error)}</div>` : ''}
      <label class="rel-add-field">
        <span class="rel-add-field-label">State</span>
        <textarea class="rel-add-input rel-add-textarea${capClass}" data-edit-field="state" rows="4" maxlength="2000">${esc(state)}</textarea>
        <span class="rel-edit-counter${capClass}">${stateLen} / 2000</span>
      </label>
      <div class="rel-add-field">
        <span class="rel-add-field-label">Disposition</span>
        <div class="rel-disp-chips" role="radiogroup">
          ${['positive', 'neutral', 'negative'].map(d => `
            <button type="button" class="rel-disp-chip ${d}${disposition === d ? ' on' : ''}" data-edit-disp="${d}">${d}</button>
          `).join('')}
          <button type="button" class="rel-disp-chip clear${!disposition ? ' on' : ''}" data-edit-disp="">clear</button>
        </div>
      </div>
      ${showCustomLabel ? `
        <label class="rel-add-field">
          <span class="rel-add-field-label">Custom label</span>
          <input class="rel-add-input" data-edit-field="custom_label" value="${esc(customLabel)}" placeholder="Custom label" />
        </label>
      ` : ''}
      <div class="rel-add-actions">
        <button type="button" class="rel-add-btn primary" data-act="save-edit" data-edge-id="${esc(String(edge._id))}"${submitting ? ' disabled' : ''}>${submitting ? 'Saving…' : 'Save'}</button>
        <button type="button" class="rel-add-btn muted" data-act="cancel-edit"${submitting ? ' disabled' : ''}>Cancel</button>
      </div>
    </article>
  `;
}

// ── Handlers ────────────────────────────────────────────────────────────────

function attachHandlers(root, charId, char, edges) {
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

  // NPCR.11 flag NPC for review
  root.querySelectorAll('[data-act="flag-npc"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const npcId = btn.dataset.npcId;
      const card = btn.closest('.rel-edge-card');
      const nameEl = card?.querySelector('.rel-edge-name');
      const npcName = nameEl?.textContent?.trim() || 'this NPC';
      const reason = await openFlagModal({ npcName });
      if (!reason) return;
      const { status, ok, body: resBody } = await apiRaw('POST', '/api/npc-flags', {
        npc_id: npcId,
        character_id: String(char._id),
        reason,
      });
      if (ok) {
        renderRelationshipsTab(document.getElementById('t-relationships'), char);
        return;
      }
      if (status === 409) {
        // Already an open flag — refresh to pick up the chip.
        renderRelationshipsTab(document.getElementById('t-relationships'), char);
      } else {
        const msg = resBody?.message || `Flag failed (HTTP ${status}).`;
        alert(msg);
      }
    });
  });
  root.querySelectorAll('[data-act="dismiss-flag"]').forEach(chip => {
    chip.addEventListener('click', () => {
      const npcId = chip.dataset.npcId;
      const at = chip.dataset.resolvedAt;
      const map = readDismissedFlags(char._id);
      map[npcId] = at;
      writeDismissedFlags(char._id, map);
      chip.remove();
    });
  });

  // NPCR.10 accept/decline on incoming pending banners
  root.querySelectorAll('[data-act="confirm-edge"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const edgeId = btn.dataset.edgeId;
      btn.disabled = true;
      const { status, ok, body: resBody } = await apiRaw('POST', `/api/relationships/${edgeId}/confirm`, {});
      if (ok) {
        renderRelationshipsTab(document.getElementById('t-relationships'), char);
        return;
      }
      btn.disabled = false;
      const banner = btn.closest('.rel-pending-banner');
      if (banner && !banner.querySelector('.rel-error')) {
        const err = document.createElement('div');
        err.className = 'rel-error';
        err.setAttribute('role', 'alert');
        err.textContent = resBody?.message || `Accept failed (HTTP ${status}).`;
        banner.insertBefore(err, banner.firstChild);
      }
    });
  });
  root.querySelectorAll('[data-act="decline-edge"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const edgeId = btn.dataset.edgeId;
      btn.disabled = true;
      const { status, ok, body: resBody } = await apiRaw('POST', `/api/relationships/${edgeId}/decline`, {});
      if (ok) {
        renderRelationshipsTab(document.getElementById('t-relationships'), char);
        return;
      }
      btn.disabled = false;
      const banner = btn.closest('.rel-pending-banner');
      if (banner && !banner.querySelector('.rel-error')) {
        const err = document.createElement('div');
        err.className = 'rel-error';
        err.setAttribute('role', 'alert');
        err.textContent = resBody?.message || `Decline failed (HTTP ${status}).`;
        banner.insertBefore(err, banner.firstChild);
      }
    });
  });

  // NPCR.9 edit controls
  root.querySelectorAll('[data-act="start-edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const edgeId = btn.dataset.edgeId;
      const edge = (edges || []).find(e => String(e._id) === String(edgeId));
      if (!edge) return;
      _tabState.editing_edge_id = String(edgeId);
      _tabState.edit_draft = {
        state: edge.state || '',
        disposition: edge.disposition || '',
        custom_label: edge.custom_label || '',
      };
      _tabState.edit_error = null;
      _tabState.editing_submitting = false;
      // Re-render the whole tab to swap the card into edit mode.
      renderRelationshipsTab(document.getElementById('t-relationships'), char);
    });
  });

  root.querySelectorAll('[data-edit-field]').forEach(input => {
    input.addEventListener('input', () => {
      if (!_tabState.edit_draft) _tabState.edit_draft = {};
      _tabState.edit_draft[input.dataset.editField] = input.value;
      // Live-update the counter next to the textarea.
      if (input.dataset.editField === 'state') {
        const counter = input.parentElement?.querySelector('.rel-edit-counter');
        const len = input.value.length;
        if (counter) {
          counter.textContent = `${len} / 2000`;
          counter.classList.toggle('over-cap', len > 2000);
          input.classList.toggle('over-cap', len > 2000);
        }
      }
    });
  });

  root.querySelectorAll('[data-edit-disp]').forEach(chip => {
    chip.addEventListener('click', () => {
      if (!_tabState.edit_draft) _tabState.edit_draft = {};
      _tabState.edit_draft.disposition = chip.dataset.editDisp || '';
      const wrap = chip.closest('.rel-disp-chips');
      wrap?.querySelectorAll('.rel-disp-chip').forEach(c => c.classList.remove('on'));
      chip.classList.add('on');
    });
  });

  root.querySelector('[data-act="cancel-edit"]')?.addEventListener('click', () => {
    delete _tabState.editing_edge_id;
    delete _tabState.edit_draft;
    delete _tabState.edit_error;
    renderRelationshipsTab(document.getElementById('t-relationships'), char);
  });

  root.querySelector('[data-act="save-edit"]')?.addEventListener('click', async (e) => {
    const edgeId = e.currentTarget.dataset.edgeId;
    const edge = (edges || []).find(e2 => String(e2._id) === String(edgeId));
    if (!edge) return;
    const draft = _tabState.edit_draft || {};
    const newState = String(draft.state ?? edge.state ?? '');
    if (newState.length > 2000) {
      _tabState.edit_error = 'State exceeds 2000 character limit.';
      renderRelationshipsTab(document.getElementById('t-relationships'), char);
      return;
    }
    if (edge.kind === 'other' && !String(draft.custom_label ?? edge.custom_label ?? '').trim()) {
      _tabState.edit_error = 'Custom label is required for kind=other.';
      renderRelationshipsTab(document.getElementById('t-relationships'), char);
      return;
    }

    _tabState.editing_submitting = true;
    _tabState.edit_error = null;
    renderRelationshipsTab(document.getElementById('t-relationships'), char);

    const body = {
      a: edge.a, b: edge.b, kind: edge.kind,
      direction: edge.direction || 'a_to_b',
      st_hidden: !!edge.st_hidden,
      status: edge.status,
      state: newState,
    };
    if (draft.disposition !== undefined) body.disposition = draft.disposition || null;
    if (edge.kind === 'other') body.custom_label = String(draft.custom_label ?? edge.custom_label ?? '').trim();

    const { status, ok, body: resBody } = await apiRaw('PUT', '/api/relationships/' + edgeId, body);
    if (ok) {
      delete _tabState.editing_edge_id;
      delete _tabState.edit_draft;
      delete _tabState.edit_error;
      _tabState.editing_submitting = false;
      renderRelationshipsTab(document.getElementById('t-relationships'), char);
      return;
    }
    _tabState.editing_submitting = false;
    if (status === 403) {
      _tabState.edit_error = 'You can only edit relationships you created. Flag for ST review instead.';
    } else if (status === 400) {
      _tabState.edit_error = resBody?.message || 'Edit rejected by the server.';
    } else if (status === 409) {
      _tabState.edit_error = 'This edge was modified by someone else. Reload and retry.';
    } else {
      _tabState.edit_error = resBody?.message || `Save failed (HTTP ${status}).`;
    }
    renderRelationshipsTab(document.getElementById('t-relationships'), char);
  });
}

// ── NPCR.7: Add Relationship picker ─────────────────────────────────────────

async function openAddPicker(el, char) {
  _tabState.mode = 'add';
  _tabState.npc_mode = 'existing';
  _tabState.error = null;
  _tabState.submitting = false;
  _tabState.draft = {
    npc_id: '', pc_id: '',
    new_name: '', new_relationship_note: '', new_general_note: '',
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
  if (!_tabState.pcs) {
    try {
      _tabState.pcs = await apiGet('/api/characters/public');
    } catch (err) {
      console.warn('[relationships-tab] Failed to load PC directory:', err);
      _tabState.pcs = [];
    }
    renderAddPanel(el, char);
  }
}

function setNpcMode(el, char, mode) {
  _tabState.npc_mode = (mode === 'new' || mode === 'pc') ? mode : 'existing';
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
  const pcsLoading = _tabState.pcs === null;
  const draft = _tabState.draft;
  const npcMode = _tabState.npc_mode;
  // PC mode uses a different kind list (b='any' only). Other modes use the
  // broader PC-to-NPC list.
  const kinds = npcMode === 'pc' ? playerPcPcKinds() : playerCreatableKinds();

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

      <div class="rel-add-mode-chips" role="radiogroup" aria-label="Connection target">
        <button type="button" class="rel-add-mode-chip${npcMode === 'existing' ? ' on' : ''}" data-npc-mode="existing">Existing NPC</button>
        <button type="button" class="rel-add-mode-chip${npcMode === 'new' ? ' on' : ''}" data-npc-mode="new">New NPC (pending)</button>
        <button type="button" class="rel-add-mode-chip${npcMode === 'pc' ? ' on' : ''}" data-npc-mode="pc">Another PC</button>
      </div>

      ${npcMode === 'existing' ? `
        <label class="rel-add-field">
          <span class="rel-add-field-label">NPC *</span>
          ${loading
            ? '<div class="rel-add-loading">Loading NPCs…</div>'
            : (_tabState.npcs && _tabState.npcs.length === 0 && !isSTRole())
              ? `<div class="rel-add-hint">You haven't created any NPCs yet. Use <strong>New NPC (pending)</strong> to add one, or ask the ST to link you to a register NPC.</div>`
              : `<select class="rel-add-input" data-field="npc_id">
                   <option value="">(pick an NPC)</option>
                   ${npcOpts}
                 </select>`}
        </label>
        ${!isSTRole() && _tabState.npcs && _tabState.npcs.length > 0 ? `<div class="rel-add-hint">Only NPCs you have quick-added appear here. STs handle links to register NPCs.</div>` : ''}
      ` : npcMode === 'new' ? `
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
      ` : `
        <label class="rel-add-field">
          <span class="rel-add-field-label">Character *</span>
          ${pcsLoading
            ? '<div class="rel-add-loading">Loading characters…</div>'
            : `<select class="rel-add-input" data-field="pc_id">
                 <option value="">(pick a character)</option>
                 ${(_tabState.pcs || [])
                   .filter(p => String(p._id) !== String(char._id))
                   .sort((a, b) => String((a.moniker || a.name)).localeCompare(String(b.moniker || b.name), undefined, { sensitivity: 'base' }))
                   .map(p => {
                     const label = (p.honorific ? p.honorific + ' ' : '') + (p.moniker || p.name || '');
                     return `<option value="${esc(String(p._id))}"${String(draft.pc_id) === String(p._id) ? ' selected' : ''}>${esc(label.trim())}</option>`;
                   }).join('')}
               </select>`}
        </label>
        <div class="rel-add-hint">They will see this proposal in their own Relationships tab and can Accept or Decline. The edge stays in "awaiting confirmation" until they respond.</div>
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

  // Validate target source up front.
  let targetType = 'npc';
  let targetIdForEdge = null;
  if (_tabState.npc_mode === 'existing') {
    if (!draft.npc_id) {
      _tabState.error = 'Pick an NPC before saving.';
      renderAddPanel(el, char);
      return;
    }
    targetIdForEdge = String(draft.npc_id);
  } else if (_tabState.npc_mode === 'new') {
    if (!String(draft.new_name || '').trim()) {
      _tabState.error = 'Name is required for a new NPC.';
      renderAddPanel(el, char);
      return;
    }
  } else if (_tabState.npc_mode === 'pc') {
    if (!draft.pc_id) {
      _tabState.error = 'Pick a character before proposing.';
      renderAddPanel(el, char);
      return;
    }
    if (String(draft.pc_id) === String(char._id)) {
      _tabState.error = 'You cannot propose a relationship with yourself.';
      renderAddPanel(el, char);
      return;
    }
    targetType = 'pc';
    targetIdForEdge = String(draft.pc_id);
  }

  _tabState.submitting = true;
  _tabState.error = null;
  renderAddPanel(el, char);

  try {
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
      targetIdForEdge = String(qbody._id);
      if (Array.isArray(_tabState.npcs)) _tabState.npcs.push(qbody);
    }

    // Step 2: create the relationship edge.
    const edgeBody = {
      a: { type: 'pc',         id: String(char._id) },
      b: { type: targetType,   id: targetIdForEdge },
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
      _tabState.error = resBody?.message || 'A relationship with this target and kind already exists.';
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
