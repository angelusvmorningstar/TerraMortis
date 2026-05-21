/* ST Mods audit view (Epic STM, issue #379; lifecycle migration #439).
 *
 * Read-only paginated lifecycle event stream, sorted newest first. Each
 * row is an event — created / activated / deactivated / deleted — rendered
 * with a distinct badge. STM-11 (issue #439) migrated this from the STM-6
 * creation-rows-with-derived-revoked-marker model to the true event stream:
 * reads canonical `by`/`at`/`event` fields (the server coalesces legacy
 * created_by/created_at/missing-event for pre-STM-11 rows, so no dependence
 * on STM-13's backfill). Filterable by character, ST, date range, and event.
 *
 * Delegated routing (per memory feedback_listener_routing_static_blind_spot):
 * filter dropdowns, date inputs, pagination buttons all listen via a single
 * delegated handler on the container root. NO per-render addEventListener
 * calls — static review cannot catch ad-hoc-listener click handlers, and
 * registering listeners inside a render-after-change handler silently
 * no-ops on subsequent paints.
 */

import { apiGet } from '../data/api.js';
import { labelForPath } from '../data/st-mod-labels.js';
import { esc, displayName, sortName } from '../data/helpers.js';

const PAGE_SIZE = 50;

// STM-11: per-event-type visual treatment + human label.
const EVENT_META = {
  created:     { label: 'Created',     cls: 'stm-ev--created' },
  activated:   { label: 'Activated',   cls: 'stm-ev--activated' },
  deactivated: { label: 'Deactivated', cls: 'stm-ev--deactivated' },
  deleted:     { label: 'Deleted',     cls: 'stm-ev--deleted' },
};

// ── Module-level state ───────────────────────────────────────────────
// Single render pass owns the displayed slice; filters mutate state then
// trigger a refetch + repaint.
const state = {
  characters: [], // {_id, name} pairs for the dropdown — populated lazily
  initialized: false,
  filters: { character_id: '', st: '', from: '', to: '', event: '' },
  page: 1,
  total: 0,
  rows: [],
  loading: false,
  stOptions: [],  // unique discord_name values observed in the latest fetch
};

let _rootEl = null;

/** init — called from admin.js switchDomain when 'st-mods-audit' tab activates.
 *  Idempotent: subsequent calls re-fetch but reuse the existing DOM scaffold. */
export async function initStModsAudit(rootEl, chars) {
  _rootEl = rootEl;
  if (!_rootEl) return;

  // Lazily build the page scaffold once. Subsequent activations reuse it.
  if (!state.initialized) {
    _rootEl.innerHTML = renderScaffold();
    _attachDelegatedHandlers(_rootEl);
    state.initialized = true;
  }

  // Refresh character dropdown from the current admin char list. Excludes
  // retired chars per AC#3.
  state.characters = (chars || [])
    .filter(c => !c.retired)
    .map(c => ({ _id: String(c._id), name: displayName(c) || c.name, sortKey: sortName(c) || c.name }))
    .sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  _renderCharacterDropdown();

  await _refetchAndRender();
}

// ── Scaffold ─────────────────────────────────────────────────────────

function renderScaffold() {
  return `
    <div class="stm-audit-root">
      <header class="stm-audit-head">
        <h2>ST Mods — Audit Log</h2>
        <p class="stm-audit-sub">Full lifecycle event stream: creations, activations, deactivations, and deletions. Sorted newest first.</p>
      </header>
      <div class="stm-audit-filters" data-stm-filters>
        <label>Character
          <select data-stm-filter="character_id">
            <option value="">All characters</option>
          </select>
        </label>
        <label>ST
          <select data-stm-filter="st">
            <option value="">All STs</option>
          </select>
        </label>
        <label>Event
          <select data-stm-filter="event">
            <option value="">All events</option>
            <option value="created">Created</option>
            <option value="activated">Activated</option>
            <option value="deactivated">Deactivated</option>
            <option value="deleted">Deleted</option>
          </select>
        </label>
        <label>From
          <input type="date" data-stm-filter="from">
        </label>
        <label>To
          <input type="date" data-stm-filter="to">
        </label>
        <button class="stm-audit-clear" data-stm-action="clear">Clear filters</button>
      </div>
      <div class="stm-audit-body" data-stm-body>
        <p class="stm-audit-loading">Loading…</p>
      </div>
      <div class="stm-audit-pagination" data-stm-pagination>
        <button data-stm-page="prev" disabled>&laquo; Prev</button>
        <span data-stm-page-label>Page 1</span>
        <button data-stm-page="next" disabled>Next &raquo;</button>
      </div>
    </div>
  `;
}

function _renderCharacterDropdown() {
  const sel = _rootEl.querySelector('[data-stm-filter="character_id"]');
  if (!sel) return;
  const current = state.filters.character_id;
  sel.innerHTML = '<option value="">All characters</option>'
    + state.characters.map(c => `<option value="${esc(c._id)}">${esc(c.name)}</option>`).join('');
  sel.value = current;
}

function _renderStDropdown() {
  const sel = _rootEl.querySelector('[data-stm-filter="st"]');
  if (!sel) return;
  const current = state.filters.st;
  sel.innerHTML = '<option value="">All STs</option>'
    + state.stOptions.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  sel.value = current;
}

// ── Delegated event handler ─────────────────────────────────────────
// Single listener at the root; dispatches by data-* attributes.

function _attachDelegatedHandlers(root) {
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const filter = t.dataset.stmFilter;
    if (!filter) return;
    state.filters[filter] = (t.value || '').trim();
    state.page = 1;
    _refetchAndRender();
  });

  root.addEventListener('click', (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const action = t.dataset.stmAction;
    if (action === 'clear') {
      state.filters = { character_id: '', st: '', from: '', to: '', event: '' };
      state.page = 1;
      // Reset the visible controls
      root.querySelectorAll('[data-stm-filter]').forEach(el => { el.value = ''; });
      _refetchAndRender();
      return;
    }
    const page = t.dataset.stmPage;
    if (page === 'prev' && state.page > 1) {
      state.page -= 1;
      _refetchAndRender();
    } else if (page === 'next' && state.page * PAGE_SIZE < state.total) {
      state.page += 1;
      _refetchAndRender();
    }
  });
}

// ── Fetch + render ───────────────────────────────────────────────────

async function _refetchAndRender() {
  if (!_rootEl) return;
  state.loading = true;
  _renderBody();

  const qs = new URLSearchParams();
  if (state.filters.character_id) qs.set('character_id', state.filters.character_id);
  if (state.filters.st) qs.set('st', state.filters.st);
  if (state.filters.event) qs.set('event', state.filters.event);
  if (state.filters.from) qs.set('from', state.filters.from);
  if (state.filters.to) qs.set('to', state.filters.to);
  qs.set('page', String(state.page));
  qs.set('page_size', String(PAGE_SIZE));

  try {
    const res = await apiGet(`/api/st_mod_audit?${qs.toString()}`);
    state.rows = Array.isArray(res?.rows) ? res.rows : [];
    state.total = typeof res?.total === 'number' ? res.total : 0;
    // Refresh ST dropdown if the union of observed names changed. Only
    // appends — never removes — so a filter selection that hides rows
    // doesn't make the option disappear mid-session.
    const seen = new Set(state.stOptions);
    for (const r of state.rows) {
      const n = r?.by?.discord_name;
      if (n && !seen.has(n)) { seen.add(n); state.stOptions.push(n); }
    }
    state.stOptions.sort();
    _renderStDropdown();
  } catch (err) {
    console.error('[stm-audit] fetch failed:', err);
    state.rows = [];
    state.total = 0;
  }

  state.loading = false;
  _renderBody();
  _renderPagination();
}

function _renderBody() {
  const body = _rootEl.querySelector('[data-stm-body]');
  if (!body) return;

  if (state.loading) {
    body.innerHTML = '<p class="stm-audit-loading">Loading…</p>';
    return;
  }

  if (state.rows.length === 0) {
    body.innerHTML = '<p class="stm-audit-empty">No audit entries match these filters.</p>';
    return;
  }

  const charNameMap = new Map(state.characters.map(c => [c._id, c.name]));

  const rowsHtml = state.rows.map(r => {
    const charName = charNameMap.get(String(r.character_id)) || `Character ${r.character_id}`;
    const deltaSign = r.delta > 0 ? '+' : '';
    const stName = r?.by?.discord_name || 'unknown';
    const when = r.at ? r.at.replace('T', ' ').replace(/\..*$/, '') : '';
    const meta = EVENT_META[r.event] || { label: r.event || 'event', cls: 'stm-ev--created' };
    // A 'deleted' event is terminal — the mod no longer exists, so the
    // current-active state of the doc is irrelevant; the row is the gravestone.
    const eventClass = r.event === 'deleted' ? 'stm-audit-row--deleted' : '';
    return `
      <article class="stm-audit-row ${eventClass}">
        <div class="stm-audit-row-head">
          <span class="stm-ev-badge ${meta.cls}">${esc(meta.label)}</span>
          <span class="stm-audit-char">${esc(charName)}</span>
          <span class="stm-audit-path">${esc(labelForPath(r.stat_path))}</span>
          <span class="stm-audit-delta">${esc(deltaSign + String(r.delta))}</span>
        </div>
        <div class="stm-audit-row-meta">
          <span>by ${esc(stName)}</span>
          <span>${esc(when)}</span>
        </div>
        ${r.reason ? `<div class="stm-audit-row-reason"><em>${esc(r.reason)}</em></div>` : ''}
      </article>
    `;
  }).join('');

  body.innerHTML = rowsHtml;
}

function _renderPagination() {
  const root = _rootEl.querySelector('[data-stm-pagination]');
  if (!root) return;
  const prev = root.querySelector('[data-stm-page="prev"]');
  const next = root.querySelector('[data-stm-page="next"]');
  const label = root.querySelector('[data-stm-page-label]');
  const totalPages = Math.max(1, Math.ceil(state.total / PAGE_SIZE));
  if (prev) prev.disabled = state.page <= 1;
  if (next) next.disabled = state.page >= totalPages;
  if (label) label.textContent = `Page ${state.page} of ${totalPages} (${state.total} entries)`;
}
