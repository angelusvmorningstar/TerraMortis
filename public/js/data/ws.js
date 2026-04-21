/* WebSocket client — reconnecting connection for live tracker sync.
 * Receives tracker_state updates broadcast by the server and patches
 * the local tracker cache + re-renders affected UI. */

import { trackerRead, trackerWriteField } from '../game/tracker.js';
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

/**
 * Start the WebSocket connection.
 * @param {object} opts
 * @param {function} [opts.onTrackerUpdate] — called with (characterId, fields) when a tracker update arrives
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

  // Patch local cache — use trackerWriteField for each changed field
  // Map API field names to tracker cache field names
  const FIELD_MAP = { influence: 'inf' };
  for (const [key, value] of Object.entries(fields)) {
    const cacheKey = FIELD_MAP[key] || key;
    // Write directly to cache without triggering another API save
    const current = trackerRead(characterId);
    if (current && current[cacheKey] !== value) {
      current[cacheKey] = value;
    }
  }

  // Notify the UI to re-render
  if (_onTrackerUpdate) _onTrackerUpdate(characterId, fields);
}
