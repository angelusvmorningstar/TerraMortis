/* WebSocket client — reconnecting connection for live tracker sync.
 * Receives tracker_state updates broadcast by the server and patches
 * the local tracker cache + re-renders affected UI.
 * Skips echoed-back changes that originated from this client. */

import { trackerRead } from '../game/tracker.js';
import suiteState from '../suite/data.js';

const WS_RECONNECT_BASE = 2000;   // initial reconnect delay
const WS_RECONNECT_MAX  = 30000;  // max backoff

let _ws = null;
let _reconnectDelay = WS_RECONNECT_BASE;
let _reconnectTimer = null;
let _token = null;
let _closed = false;

// Callback for UI updates — set by initWS caller
let _onTrackerUpdate = null;
// STM-9 (issue #416, ADR-004 Rev 3 §D11): callback for st_mod frames.
// Called with (characterId, op, stModId) for remote st_mod changes only.
let _onStModUpdate = null;
// ECM-5 (issue #872): callback for catalogue-update frames. Called with
// (itemId, op) for remote equipment_catalogue create/update/delete events.
// Consumers (the catalogue cache module) refetch on receipt.
let _onCatalogueUpdate = null;
// gdx.5 (#986): callback for settings-update frames. Called with no
// arguments on any remote app_settings PATCH — consumers (the settings
// cache module) refetch the whole doc on receipt, same shape as
// onCatalogueUpdate.
let _onSettingsUpdate = null;
// BL-4 (issue #1008): callback for bloodline-update frames. Called with
// (bloodlineId, op) for remote bloodlines create/update/delete events.
// Consumers (the bloodlines cache module) refetch on receipt.
let _onBloodlineUpdate = null;
// gdx.8 (#989): callback for roll_log frames. Called with the whole roll
// doc (no separate refetch — a high-frequency event during a live session,
// unlike the refetch-on-signal shape catalogue/settings/bloodline use).
let _onRollLogged = null;
// prax.2 (Epic PRAX): callback for praxis_session frames. Called with the
// board's own session_id for any praxis_sessions write broadcast by
// server/ws.js's broadcastPraxisUpdate. Consumers (the admin Praxis board)
// refetch on receipt.
let _onPraxisUpdate = null;
// prax.4b (Epic PRAX): callback for praxis_resolved frames. Called with the
// whole payload ({ session_id, affected_seat_ids, affected_character_ids,
// resolved_office }) for a completed Praxis resolution. A DIFFERENT audience
// from _onPraxisUpdate above: that one is the Praxis board refetching itself,
// this one is every OTHER domain whose office data the mass-clear just
// invalidated (the Office tab, the admin Court panel). Consumers refetch their
// own domain's data on receipt.
let _onPraxisResolved = null;
// gdx.8 review fix (Codex + Edge Case Hunter, independently): callback
// fired on EVERY successful (re)connect, including the first one — a
// dropped connection has no live "catch-up" otherwise; roll_log frames
// broadcast during the outage are simply never delivered (the server only
// fans out at write time), so a consumer with its own catch-up fetch (the
// admin roll feed) needs to know a (re)connect just happened.
let _onReconnect = null;

// Recent local writes — { charId+field → timestamp }. Used to suppress
// WS echo of our own saves (avoids double-render on the originating client).
const _recentWrites = new Map();
const ECHO_WINDOW = 3000; // ms — ignore WS updates within this window of a local write

/**
 * Record a local tracker write so the WS handler can skip the echo.
 * Called from tracker.js saveToApi().
 */
export function markLocalWrite(charId, fields) {
  const now = Date.now();
  for (const key of Object.keys(fields)) {
    _recentWrites.set(charId + ':' + key, now);
  }
  // Prune old entries
  if (_recentWrites.size > 100) {
    for (const [k, ts] of _recentWrites) {
      if (now - ts > ECHO_WINDOW) _recentWrites.delete(k);
    }
  }
}

/**
 * Start the WebSocket connection.
 * @param {object} opts
 * @param {function} [opts.onTrackerUpdate] — called with (characterId, fields) for remote tracker changes
 * @param {function} [opts.onStModUpdate]   — called with (characterId, op, stModId) for remote st_mod changes (STM-9 / issue #416)
 * @param {function} [opts.onCatalogueUpdate] — called with (itemId, op) for remote equipment_catalogue events (ECM-5 / issue #872)
 * @param {function} [opts.onSettingsUpdate] — called with no args for remote app_settings PATCH events (gdx.5 / #986)
 * @param {function} [opts.onBloodlineUpdate] — called with (bloodlineId, op) for remote bloodlines events (BL-4 / issue #1008)
 * @param {function} [opts.onRollLogged] — called with the roll doc for remote roll_log writes (gdx.8 / #989)
 * @param {function} [opts.onPraxisUpdate] - called with (sessionId) for remote praxis_sessions writes (prax.2)
 * @param {function} [opts.onPraxisResolved] - called with the whole payload for a completed Praxis resolution (prax.4b)
 * @param {function} [opts.onReconnect] — called with no args on every successful (re)connect (gdx.8 review fix)
 */
export function initWS(opts = {}) {
  _onTrackerUpdate = opts.onTrackerUpdate || null;
  _onStModUpdate = opts.onStModUpdate || null;
  _onCatalogueUpdate = opts.onCatalogueUpdate || null;
  _onSettingsUpdate = opts.onSettingsUpdate || null;
  _onBloodlineUpdate = opts.onBloodlineUpdate || null;
  _onRollLogged = opts.onRollLogged || null;
  _onPraxisUpdate = opts.onPraxisUpdate || null;
  _onPraxisResolved = opts.onPraxisResolved || null;
  _onReconnect = opts.onReconnect || null;
  _token = localStorage.getItem('tm_auth_token');
  _closed = false;
  if (!_token) return; // not logged in
  _connect();
}

/** Cleanly close the WebSocket (e.g. on logout). */
export function closeWS() {
  _closed = true;
  clearTimeout(_reconnectTimer);
  if (_ws) { _ws.close(); _ws = null; }
}

function _wsUrl() {
  const isLocal = location.hostname === 'localhost';
  const base = isLocal
    ? 'ws://localhost:3000'
    : 'wss://tm-game-api.onrender.com';
  return `${base}/ws?token=${encodeURIComponent(_token)}`;
}

function _connect() {
  if (_closed || _ws) return;

  try {
    _ws = new WebSocket(_wsUrl());
  } catch {
    _scheduleReconnect();
    return;
  }

  _ws.onopen = () => {
    _reconnectDelay = WS_RECONNECT_BASE;
    console.log('[WS] connected');
    _onReconnect?.();
  };

  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'tracker') _handleTrackerMsg(msg);
      else if (msg.type === 'st_mod') _handleStModMsg(msg);
      else if (msg.type === 'catalogue') _handleCatalogueMsg(msg);
      else if (msg.type === 'settings') _handleSettingsMsg();
      else if (msg.type === 'bloodline') _handleBloodlineMsg(msg);
      else if (msg.type === 'roll_log') _handleRollLoggedMsg(msg);
      else if (msg.type === 'praxis_session') _handlePraxisMsg(msg);
      else if (msg.type === 'praxis_resolved') _handlePraxisResolvedMsg(msg);
    } catch { /* ignore non-JSON */ }
  };

  _ws.onclose = () => {
    _ws = null;
    if (!_closed) _scheduleReconnect();
  };

  _ws.onerror = () => {
    // onclose will fire after onerror
  };
}

function _scheduleReconnect() {
  clearTimeout(_reconnectTimer);
  _reconnectTimer = setTimeout(() => {
    _reconnectDelay = Math.min(_reconnectDelay * 1.5, WS_RECONNECT_MAX);
    _connect();
  }, _reconnectDelay);
}

function _handleTrackerMsg(msg) {
  const { characterId, fields } = msg;
  if (!characterId || !fields) return;

  // Skip if all fields in this message were recently written locally (echo suppression)
  const now = Date.now();
  const allLocal = Object.keys(fields).every(key => {
    const ts = _recentWrites.get(characterId + ':' + key);
    return ts && (now - ts) < ECHO_WINDOW;
  });
  if (allLocal) return;

  // Patch the suite app's tracker cache when the char is in suiteState.chars.
  // The cache patch is suite-specific (admin/player don't share suiteState),
  // so it's gated; the callback below fires regardless so admin/player WS
  // subscribers can react to the remote change too. Issue #372 (STM-2 D5).
  const FIELD_MAP = { influence: 'inf' };
  const char = (suiteState.chars || []).find(c => String(c._id) === characterId);
  if (char) {
    const current = trackerRead(characterId);
    if (current) {
      for (const [key, value] of Object.entries(fields)) {
        const cacheKey = FIELD_MAP[key] || key;
        current[cacheKey] = value;
      }
    }
  }

  // Notify the UI — this is a remote change, safe to re-render
  if (_onTrackerUpdate) _onTrackerUpdate(characterId, fields);
}

/** STM-9 (issue #416, ADR-004 Rev 3 §D11) — handle st_mod create/revoke
 *  frames. Mirrors _handleTrackerMsg's local-write dedupe shape but uses
 *  a constant 'st_mod' token rather than per-field keys:
 *
 *  Why constant-token instead of st_mod_id matching: POST doesn't know
 *  the new mod's _id until the response returns, and the WS frame
 *  typically arrives a few ms BEFORE the HTTP response. Per-id matching
 *  would force the panel to call markLocalWrite after the response,
 *  which races the frame. Constant-token avoids the race — the panel
 *  marks `charId:st_mod` immediately before POST/DELETE, and any
 *  st_mod frame for that character within ECHO_WINDOW is suppressed
 *  (the panel's own _refetchMods + onMutate chain already handles
 *  the refresh on the originating client).
 *
 *  When the frame is remote (no local-write match), fire _onStModUpdate
 *  so the consumer (app boot path) can refetch mods + re-apply overlay
 *  + re-render the active sheet. */
function _handleStModMsg(msg) {
  const { characterId, op, st_mod_id } = msg;
  if (!characterId) return;

  // Echo suppression — constant 'st_mod' token mirrors the tracker
  // pattern's per-field key shape (just one key per character instead
  // of multiple).
  const recentTs = _recentWrites.get(characterId + ':st_mod');
  if (recentTs && (Date.now() - recentTs) < ECHO_WINDOW) return;

  if (_onStModUpdate) _onStModUpdate(characterId, op, st_mod_id);
}

/** ECM-5 (issue #872): handle catalogue create/update/delete frames. The
 *  catalogue cache refetches regardless of `op` — the op is advisory per
 *  the server-side comment in `server/ws.js`. No echo suppression: the
 *  admin UI broadcasts on local writes too, but the refetch is cheap (~70
 *  docs) and the alternative (per-op deduping) duplicates the server-side
 *  state machine. */
function _handleCatalogueMsg(msg) {
  const { item_id, op } = msg;
  if (_onCatalogueUpdate) _onCatalogueUpdate(item_id, op);
}

/** gdx.5 (#986): no payload to read — the frame itself is the signal.
 *  Mirrors _handleCatalogueMsg's shape; no echo suppression needed, a
 *  settings refetch is cheap and idempotent unlike per-field tracker state. */
function _handleSettingsMsg() {
  if (_onSettingsUpdate) _onSettingsUpdate();
}

/** BL-4 (issue #1008): handle bloodline create/update/delete frames. Same
 *  advisory-op contract as the catalogue frame — the cache refetches
 *  regardless of `op`, so an unknown op degrades to "refetch". No echo
 *  suppression, for the catalogue's reason (the refetch is ~23 documents and
 *  per-op deduping would duplicate the server-side state machine) and one of
 *  its own: the admin screen that fires the write is also the screen most
 *  likely to be showing a stale holder count, so refetching on its own echo is
 *  a feature. */
function _handleBloodlineMsg(msg) {
  const { bloodline_id, op } = msg;
  if (_onBloodlineUpdate) _onBloodlineUpdate(bloodline_id, op);
}

/** gdx.8 (#989): the frame carries the whole roll doc (high-frequency event
 *  during a live session, unlike the refetch-on-signal frames above) — pass
 *  it straight through, no fetch. No echo suppression: the roller's own
 *  in-tab addHist() already shows the roll locally the instant it fires, so
 *  a duplicate arriving back over WS is harmless for the player, and the
 *  admin feed (the only other consumer) needs every roll including the
 *  ST's own if they roll from a character sheet. */
function _handleRollLoggedMsg(msg) {
  const { type, ...doc } = msg;
  if (_onRollLogged) _onRollLogged(doc);
}

/** prax.2 (Epic PRAX): handle praxis_session frames. The frame carries only the
 *  board's own `session_id` (see server/ws.js's broadcastPraxisUpdate), so the
 *  consumer's job on receipt is "refetch that board", exactly the
 *  refetch-on-signal contract the catalogue / settings / bloodline frames use.
 *
 *  Deliberately NOT _handleTrackerMsg's local-write dedupe. That pattern exists
 *  for high-frequency per-field tracker state where an echo would double-render
 *  a sheet mid-session; a Praxis write is an infrequent ST-only board mutation,
 *  the refetch is one small document, and the tab that fired the write is the
 *  one most likely to be showing a stale tally, so refetching on our own echo
 *  is a feature rather than waste. */
function _handlePraxisMsg(msg) {
  const { session_id } = msg;
  _onPraxisUpdate?.(session_id);
}

/** prax.4b (Epic PRAX): handle praxis_resolved frames. Unlike every other frame
 *  in this file the payload names SEVERAL entities at once - a Praxis resolve
 *  mass-clears an unknown number of office seats in one commit - so both id
 *  fields are arrays and are normalised to arrays here rather than at each
 *  consumer.
 *
 *  The arrays are ADVISORY, exactly like the `op` fields above. A consumer's job
 *  on receipt is still "refetch my own domain", the same refetch-not-patch
 *  contract every broadcast frame in this codebase uses; the ids are there so a
 *  consumer can decide WHETHER what it is showing is affected, never so it can
 *  reconstruct the new state from the frame. Office data is derived across two
 *  collections (`office_seats` and `characters`), and a patch applied from this
 *  payload alone would get the winner's headline wrong for any dual-seat holder.
 *
 *  No echo suppression, for the reason the praxis_session frame gives: this is
 *  an infrequent ST-only event, and the tab that fired it is the one most likely
 *  to be showing stale office data. */
function _handlePraxisResolvedMsg(msg) {
  _onPraxisResolved?.({
    session_id: msg.session_id,
    affected_seat_ids: Array.isArray(msg.affected_seat_ids) ? msg.affected_seat_ids : [],
    affected_character_ids: Array.isArray(msg.affected_character_ids) ? msg.affected_character_ids : [],
    resolved_office: msg.resolved_office ?? null,
  });
}
