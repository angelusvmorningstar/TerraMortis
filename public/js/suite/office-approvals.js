/* Approval Queue (oaq.3) — ST review surface for pending Status Actions,
 * pending Humanity Checks (gdx.12) and, as of oxp.9, pending Office Purchases
 * (request_type: 'office_purchase' — a holder spending their seat's own
 * office XP on one merit dot or the next manoeuvre rank).
 *
 * Lists every pending record from GET /api/office_actions/pending
 * (oldest-first, widened by gdx.12 and again by oxp.9 to return all three
 * types), with one-click Accept/Decline. Status Actions resolve
 * through the ST-only PUT /api/office_actions/:id/accept and /:id/decline
 * routes built and code-reviewed under oaq.2; Humanity Checks resolve
 * through their own PUT /api/humanity_check_requests/:id/accept and
 * /:id/decline (gdx.12); Office Purchases through PUT
 * /api/office_purchase_requests/:id/accept and /:id/decline (oxp.9) — see
 * _resolve()'s per-request_type routing. This
 * module only submits/reads — it never touches the transaction, budget,
 * precondition, or pool-arithmetic logic those routes own. In particular the
 * office XP budget check lives entirely in office-purchase.js's accept
 * transaction; nothing here decides whether a purchase is affordable.
 *
 * Lives in the main game app (app.js's goTab), not the ST admin app — moved
 * here from public/js/admin/office-approvals.js so it's reachable from the
 * same surface STs already run live at the table, gated stOnly in app.js's
 * MORE_APPS/NAV_ITEMS (same pattern as Territory/Tracker/Combat/Spheres).
 *
 * Delegated routing (per memory feedback_listener_routing_static_blind_spot,
 * mirroring public/js/admin/st-mods-audit.js): a single delegated click
 * listener on the container root, bound once at scaffold time. NO per-render
 * addEventListener calls.
 *
 * Refresh: 10-second poll against GET /pending, mirroring the existing
 * pattern in the contested-roll poller (the modal module this originally
 * cited was retired by crd.2; its successor is
 * public/js/game/pending-queue.js, same contested_roll_requests collection
 * family, same POLL_MS). Race safety already exists
 * server-side (both accept/decline 409 if the record is no longer pending);
 * the poll is purely so a row resolved by another ST disappears without a
 * manual reload. Polling is skipped while this tab isn't the active one —
 * app.js's goTab() never unmounts a tab, it only toggles the `.tab.active`
 * class (public/css/suite.css), so that class is the "is this tab visible"
 * signal here, same idea as the admin app's `.domain.active` this module
 * used before the move.
 */

import { apiGet, apiRaw } from '../data/api.js';
import { esc, redactCharName, redactPlayer } from '../data/helpers.js';

const POLL_MS = 10_000;

// oaq.3 decision: display layer keys off request_type so a second pending-
// item type (Epic OXP's XP-spend approvals) can add its own label later
// without restructuring this module — only 'status_action' is populated
// today.
const ACTION_TYPE_LABELS = {
  raise:       'Raise',
  lower:       'Lower',
  grant_first: 'Grant First Dot',
  strip_last:  'Strip Last Dot',
};

const state = {
  initialized: false,
  rows: [],
  loading: false,
  fetchFailed: false,   // last GET /pending attempt errored — distinct from a genuinely empty queue
  busyIds: new Set(),   // requests currently mid accept/decline — disable their buttons
  errorById: new Map(), // requestId -> last error message (e.g. "already actioned by X")
  // gdx.12: the ST's in-progress breaking-point-level choice for a pending
  // Humanity Check row, persisted across the 10-second poll's re-renders
  // (a fresh GET /pending response never carries this — it's local-only
  // until Accept is actually pressed).
  levelByRequestId: new Map(),
};

let _rootEl = null;
let _pollTimer = null;
let _fetchGen = 0; // review finding: guards against an in-flight poll response landing AFTER a
                    // more recent accept/decline already changed state.rows, resurrecting a
                    // just-resolved row from a stale snapshot.

/** init — called from app.js's goTab() when 'office-approvals' activates.
 *  Idempotent: subsequent calls reuse the existing DOM scaffold. */
export async function initOfficeApprovals(rootEl) {
  _rootEl = rootEl;
  if (!_rootEl) return;

  if (!state.initialized) {
    _rootEl.innerHTML = renderScaffold();
    _attachDelegatedHandlers(_rootEl);
    state.initialized = true;
  }

  await _refetchAndRender();

  if (!_pollTimer) _pollTimer = setInterval(_pollTick, POLL_MS);
}

// ── Scaffold ─────────────────────────────────────────────────────────

function renderScaffold() {
  return `
    <div class="stm-audit-root">
      <header class="stm-audit-head">
        <h2>Approval Queue</h2>
        <p class="stm-audit-sub">Pending Status Actions, Humanity Checks and Office Purchases awaiting sign-off. Oldest first.</p>
      </header>
      <div class="oaq-queue-list" data-oaq-body>
        <p class="stm-audit-loading">Loading…</p>
      </div>
    </div>
  `;
}

// ── Poll ─────────────────────────────────────────────────────────────

function _pollTick() {
  if (!_rootEl || !_rootEl.closest('.tab')?.classList.contains('active')) return;
  _refetchAndRender();
}

// ── Delegated event handler ─────────────────────────────────────────

function _attachDelegatedHandlers(root) {
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-oaq-action]');
    if (!btn) return;
    const requestId = btn.dataset.oaqId;
    const action = btn.dataset.oaqAction;
    if (!requestId || !action) return;
    _resolve(requestId, action);
  });
  // gdx.12: the breaking-point-level <select> on a pending Humanity Check
  // row — stores the ST's choice and re-renders just the Accept button's
  // disabled state, without waiting for the next poll tick.
  root.addEventListener('change', (e) => {
    const sel = e.target.closest('[data-oaq-level-select]');
    if (!sel) return;
    const requestId = sel.dataset.oaqId;
    if (!requestId) return;
    const level = sel.value ? Number(sel.value) : null;
    if (level) state.levelByRequestId.set(requestId, level);
    else state.levelByRequestId.delete(requestId);
    _renderBody();
  });
}

// ── Fetch + render ───────────────────────────────────────────────────

async function _refetchAndRender() {
  if (!_rootEl) return;
  const gen = ++_fetchGen;
  state.loading = true;
  _renderBody();

  let rows, failed = false;
  try {
    rows = await apiGet('/api/office_actions/pending');
  } catch (err) {
    console.error('[office-approvals] fetch failed:', err);
    failed = true;
  }

  // A newer fetch (a poll tick, or the refetch triggered by an accept/decline
  // elsewhere) already landed while this one was in flight — applying this
  // stale response would resurrect an already-resolved row (review finding).
  if (gen !== _fetchGen) return;

  if (failed) {
    state.fetchFailed = true;
  } else {
    state.fetchFailed = false;
    state.rows = Array.isArray(rows) ? rows : [];
  }

  state.loading = false;
  _renderBody();
}

async function _resolve(requestId, action) {
  if (state.busyIds.has(requestId)) return;

  // gdx.12: route to the right endpoint per request_type — status_action's
  // own lifecycle lives in office-actions.js, humanity_check's in
  // humanity-check.js, sharing this one queue view but not one route file.
  const row = state.rows.find(r => String(r._id) === requestId);
  if (!row) {
    // review finding: a poll or another ST already changed this row since
    // the last render — don't guess which endpoint to call (that silently
    // misrouted humanity_check ids to /api/office_actions), just resync.
    _refetchAndRender();
    return;
  }
  // oxp.9 adds a third branch. Kept as an explicit lookup rather than a
  // request_type-to-path string transform: the three paths do not share a
  // naming rule (office_actions / humanity_check_requests /
  // office_purchase_requests), and a derived path would silently 404 the day
  // a fourth type is named differently again.
  const isHumanityCheck = row.request_type === 'humanity_check';
  const endpoint = row.request_type === 'office_purchase'
    ? '/api/office_purchase_requests'
    : isHumanityCheck ? '/api/humanity_check_requests' : '/api/office_actions';
  // Office Purchase accept carries no body — every decision the ST is making
  // is already recorded on the pending document, and the route re-reads and
  // re-validates all of it live inside its own transaction.
  let body = {};
  if (isHumanityCheck && action === 'accept') {
    const level = state.levelByRequestId.get(requestId);
    if (!level) return; // Accept button is disabled until a level is chosen — defence in depth.
    body = { breaking_point_level: level };
  }

  state.busyIds.add(requestId);
  state.errorById.delete(requestId);
  _renderBody();

  const res = await apiRaw('PUT', `${endpoint}/${requestId}/${action}`, body);
  if (res.ok) {
    state.rows = state.rows.filter(r => String(r._id) !== requestId);
    state.levelByRequestId.delete(requestId);
    // Refetch rather than trust the local removal alone — keeps the queue
    // consistent with the server after a resolve, same generation guard as
    // the poll so an even-newer response still wins.
    _refetchAndRender();
  } else {
    // review finding: the server's own 409 message may name the acting ST
    // (resolved_by/declined_by) — build the client-side message from those
    // fields directly, through redactPlayer, rather than displaying the
    // server's pre-formatted string verbatim (which would leak a raw
    // Discord username to a privacy-redacted dev-role viewer).
    const by = res.body?.resolved_by || res.body?.declined_by;
    state.errorById.set(requestId, by
      ? `Already actioned by ${redactPlayer(by)}`
      : (res.body?.message || 'Failed to resolve request.'));
  }

  state.busyIds.delete(requestId);
  _renderBody();
}

function _renderBody() {
  const body = _rootEl.querySelector('[data-oaq-body]');
  if (!body) return;

  if (state.loading && state.rows.length === 0) {
    body.innerHTML = '<p class="stm-audit-loading">Loading…</p>';
    return;
  }

  // review finding: a failed fetch must never render as "nothing pending" —
  // that reads as a false all-clear when the real queue state is simply
  // unknown right now.
  if (state.fetchFailed && state.rows.length === 0) {
    body.innerHTML = '<p class="ch-error">Could not load the queue. Retrying automatically…</p>';
    return;
  }

  if (state.rows.length === 0) {
    body.innerHTML = '<p class="stm-audit-empty">Nothing pending.</p>';
    return;
  }

  // gdx.12: Humanity Check rows need a distinct shape (level picker gating
  // Accept) — dispatched here rather than restructuring _renderRow itself,
  // per this module's own extension-point design (see file header). oxp.9
  // adds a third arm the same way; _renderRow and _renderHumanityCheckRow are
  // both untouched by it.
  body.innerHTML = state.rows.map(r => (
    r.request_type === 'office_purchase'
      ? _renderOfficePurchaseRow(r)
      : r.request_type === 'humanity_check' ? _renderHumanityCheckRow(r) : _renderRow(r)
  )).join('');
}

function _renderRow(r) {
  const id = String(r._id);
  const busy = state.busyIds.has(id);
  const error = state.errorById.get(id);
  const label = r.request_type === 'status_action'
    ? (ACTION_TYPE_LABELS[r.action_type] || r.action_type)
    : r.request_type;
  const when = r.created_at ? r.created_at.replace('T', ' ').replace(/\..*$/, '') : '';

  return `
    <div class="oaq-queue-row-wrap" data-oaq-row="${esc(id)}">
      <div class="oaq-queue-row">
        <span class="oaq-queue-name">${esc(redactCharName(r.actor_name || 'Unknown'))} → ${esc(redactCharName(r.target_name || 'Unknown'))}</span>
        <div class="oaq-queue-actions">
          <span class="dtl-badge">${esc(label)}</span>
          <span class="derived-note">${esc(when)}</span>
          <div class="ch-modal-actions oaq-queue-btns">
            <button class="ch-btn ch-btn-accept" data-oaq-action="accept" data-oaq-id="${esc(id)}" ${busy ? 'disabled' : ''}>Accept</button>
            <button class="ch-btn ch-btn-decline" data-oaq-action="decline" data-oaq-id="${esc(id)}" ${busy ? 'disabled' : ''}>Decline</button>
          </div>
        </div>
      </div>
      ${error ? `<div class="ch-error oaq-queue-error">${esc(error)}</div>` : ''}
    </div>
  `;
}

// gdx.12: Humanity Check's own row shape — a breaking-point-level picker
// (the ST's judgement call, per the rulebook — not automated) gates Accept;
// pool arithmetic itself happens server-side once accepted (AC2).
const BREAKING_POINT_LEVELS = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];

function _renderHumanityCheckRow(r) {
  const id = String(r._id);
  const busy = state.busyIds.has(id);
  const error = state.errorById.get(id);
  const when = r.created_at ? r.created_at.replace('T', ' ').replace(/\..*$/, '') : '';
  const chosenLevel = state.levelByRequestId.get(id);
  const canAccept = !!chosenLevel && !busy;

  const levelOptions = BREAKING_POINT_LEVELS
    .map(lvl => `<option value="${lvl}" ${chosenLevel === lvl ? 'selected' : ''}>Humanity ${lvl}</option>`)
    .join('');

  return `
    <div class="oaq-queue-row-wrap" data-oaq-row="${esc(id)}">
      <div class="oaq-queue-row">
        <span class="oaq-queue-name">${esc(redactCharName(r.character_name || 'Unknown'))}</span>
        <div class="oaq-queue-actions">
          <span class="dtl-badge">Humanity Check</span>
          <select class="form-select oaq-hc-level-select" data-oaq-level-select data-oaq-id="${esc(id)}" ${busy ? 'disabled' : ''}>
            <option value="">Breaking point level…</option>
            ${levelOptions}
          </select>
          <span class="derived-note">${esc(when)}</span>
          <div class="ch-modal-actions oaq-queue-btns">
            <button class="ch-btn ch-btn-accept" data-oaq-action="accept" data-oaq-id="${esc(id)}" ${canAccept ? '' : 'disabled'}>Accept</button>
            <button class="ch-btn ch-btn-decline" data-oaq-action="decline" data-oaq-id="${esc(id)}" ${busy ? 'disabled' : ''}>Decline</button>
          </div>
        </div>
      </div>
      ${error ? `<div class="ch-error oaq-queue-error">${esc(error)}</div>` : ''}
    </div>
  `;
}

// oxp.9: Office Purchase's own row shape. No in-row input (unlike gdx.12's
// level picker), so no new listener and no new state map are needed — the
// existing delegated click handler, busyIds and errorById cover it unchanged.
//
// The row shows the ST everything they need to judge without leaving the tab:
// which SEAT (office plus its label, where the office has more than one), who
// asked, and what they are buying. It deliberately does NOT show a balance:
// the authoritative one is computed server-side inside the accept
// transaction, against documents re-read at that moment, and a number
// rendered here from a 10-second-old poll would be a second, staler answer to
// the same question.
function _renderOfficePurchaseRow(r) {
  const id = String(r._id);
  const busy = state.busyIds.has(id);
  const error = state.errorById.get(id);
  const when = r.created_at ? r.created_at.replace('T', ' ').replace(/\..*$/, '') : '';

  const seat = r.seat_label ? `${r.office_category || 'Office'} (${r.seat_label})` : (r.office_category || 'Office');
  // A null requester means an ST submitted on the seat's behalf (see
  // office-purchase.js's POST) — named plainly rather than rendered as
  // "Unknown", which would read as missing data.
  const who = r.requested_by_character_name
    ? redactCharName(r.requested_by_character_name)
    : 'Storyteller';
  const what = r.purchase_kind === 'merit'
    ? `Merit: ${r.merit || 'Unknown'}`
    : 'Next manoeuvre rank';

  return `
    <div class="oaq-queue-row-wrap" data-oaq-row="${esc(id)}">
      <div class="oaq-queue-row">
        <span class="oaq-queue-name">${esc(who)} &rsaquo; ${esc(seat)}</span>
        <div class="oaq-queue-actions">
          <span class="dtl-badge">${esc(what)}</span>
          <span class="derived-note">${esc(when)}</span>
          <div class="ch-modal-actions oaq-queue-btns">
            <button class="ch-btn ch-btn-accept" data-oaq-action="accept" data-oaq-id="${esc(id)}" ${busy ? 'disabled' : ''}>Accept</button>
            <button class="ch-btn ch-btn-decline" data-oaq-action="decline" data-oaq-id="${esc(id)}" ${busy ? 'disabled' : ''}>Decline</button>
          </div>
        </div>
      </div>
      ${error ? `<div class="ch-error oaq-queue-error">${esc(error)}</div>` : ''}
    </div>
  `;
}
