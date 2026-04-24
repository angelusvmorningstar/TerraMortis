/* Player Relationships tab (NPCR.6).
 *
 * Read-only list view of edges involving the active character, grouped by
 * kind family. PC-to-PC creation + flag + edit flows land in later stories
 * (NPCR.7+, .10, .11).
 *
 * Server-side `_other_name` enrichment lets the tab render NPC and PC names
 * without calling ST-only routes. The "New" badge and "Updated · dismiss"
 * chip use localStorage per character so the server never tracks read-state.
 */

import { apiGet } from '../data/api.js';
import { esc } from '../data/helpers.js';
import {
  FAMILIES,
  kindByCode,
} from '../data/relationship-kinds.js';

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

  el.innerHTML = `
    <div class="rel-tab">
      <div class="rel-tab-head">
        <h2 class="rel-tab-title">Relationships</h2>
        <div class="rel-tab-sub">Edges involving ${esc(char.moniker || char.name)}.</div>
      </div>
      <div id="rel-tab-body">
        <div class="rel-loading">Loading…</div>
      </div>
    </div>
  `;

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
