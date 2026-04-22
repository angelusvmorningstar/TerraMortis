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
 * @param {function} [opts.onTrackerUpdate] — called with (characterId, fields) for remote changes only
 */
export function initWS(opts = {}) {
  _onTrackerUpdate = opts.onTrackerUpdate || null;
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
    : 'wss://tm-suite-api.onrender.com';
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
  };

  _ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'tracker') _handleTrackerMsg(msg);
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

  // Check if this character is one we care about
  const char = (suiteState.chars || []).find(c => String(c._id) === characterId);
  if (!char) return;

  // Skip if all fields in this message were recently written locally (echo suppression)
  const now = Date.now();
  const allLocal = Object.keys(fields).every(key => {
    const ts = _recentWrites.get(characterId + ':' + key);
    return ts && (now - ts) < ECHO_WINDOW;
  });
  if (allLocal) return;

  // Patch local cache directly (don't use trackerWriteField to avoid re-saving to API)
  const FIELD_MAP = { influence: 'inf' };
  const current = trackerRead(characterId);
  if (current) {
    for (const [key, value] of Object.entries(fields)) {
      const cacheKey = FIELD_MAP[key] || key;
      current[cacheKey] = value;
    }
  }

  // Notify the UI — this is a remote change, safe to re-render
  if (_onTrackerUpdate) _onTrackerUpdate(characterId, fields);
}
