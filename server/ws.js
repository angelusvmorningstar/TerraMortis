/* WebSocket server — live tracker sync.
 * Authenticates on upgrade via Bearer token (same as REST API).
 * Broadcasts tracker_state changes to all connected clients.
 * Heartbeat keeps connections alive through Render's proxy. */

import { WebSocketServer } from 'ws';
import { getCollection } from './db.js';

let _wss = null;

/**
 * Test-only seam (gdx.8 review fix) — injects a fake `{ clients }` in place
 * of the real WebSocketServer so `_fanOutRoles`'s role filtering can be
 * exercised directly, without a real HTTP upgrade/socket. No production
 * caller; only `server/tests/gdx-8-roll-history.test.js` imports this.
 * @param {{ clients: Iterable<object> } | null} fakeWss
 */
export function _setWssForTesting(fakeWss) {
  _wss = fakeWss;
}

/**
 * Attach WebSocket server to an existing HTTP server.
 * @param {import('http').Server} server
 */
export function attachWS(server) {
  _wss = new WebSocketServer({ noServer: true });

  // Handle upgrade manually so we can authenticate before accepting
  server.on('upgrade', async (req, socket, head) => {
    // Only handle /ws path
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== '/ws') { socket.destroy(); return; }

    // Extract Bearer token from query string (WebSocket API can't send headers)
    const token = url.searchParams.get('token');
    if (!token) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }

    // Validate token against players collection (same logic as auth middleware)
    const user = await _resolveUser(token);
    if (!user) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); socket.destroy(); return; }

    _wss.handleUpgrade(req, socket, head, ws => {
      ws.user = user;
      ws.isAlive = true;
      _wss.emit('connection', ws, req);
    });
  });

  _wss.on('connection', (ws) => {
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('error', () => {});
  });

  // Heartbeat — ping every 25s, terminate dead connections
  const interval = setInterval(() => {
    if (!_wss) { clearInterval(interval); return; }
    for (const ws of _wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 25_000);

  _wss.on('close', () => clearInterval(interval));
  console.log('WebSocket server attached on /ws');
}

/**
 * Send one frame to every open client.
 *
 * The per-client try/catch is the point. Every broadcaster is called from a
 * route handler AFTER the Mongo mutation has committed but BEFORE the HTTP
 * response is sent, so a `ws.send` that throws — a socket that closes between
 * the readyState check and the send is the ordinary way that happens — would
 * both skip every client after it in the iteration and reject the route's
 * async handler. Express 5 forwards that rejection, so the ST would see a 500
 * for a write that had already succeeded and might retry it. One bad socket
 * must not be able to do either of those things. Added by the BL-4 review;
 * all four broadcasters shared the gap, so all four share the fix.
 */
function _fanOut(msg) {
  if (!_wss) return;
  for (const ws of _wss.clients) {
    if (ws.readyState !== 1) continue; // not OPEN
    try {
      ws.send(msg);
    } catch (err) {
      console.error('[ws] send failed for one client; continuing:', err?.message || err);
    }
  }
}

/**
 * Same per-client try/catch shape as `_fanOut`, but only to sockets whose
 * connection-time `ws.user.role` (set in `attachWS`'s upgrade handler) is in
 * `roles`. Review fix (gdx.8, Blind Hunter + Acceptance Auditor,
 * independently) — `_fanOut` sends to every open socket regardless of role,
 * which is fine for the existing broadcasters (catalogue/settings/st_mod/
 * tracker frames carry nothing a player shouldn't see), but `roll_log`'s own
 * REST read path (`GET /api/roll_log`) is deliberately `requireRole('st')`
 * (which effectively means st+dev — see `middleware/auth.js`), and its
 * frames carry per-character results and real vitae/willpower spend for
 * EVERY character, not just the connected player's own. Broadcasting that
 * over the shared WS to every player would silently bypass the REST
 * boundary this story's own AC4 established.
 */
function _fanOutRoles(msg, roles) {
  if (!_wss) return;
  for (const ws of _wss.clients) {
    if (ws.readyState !== 1) continue; // not OPEN
    if (!roles.includes(ws.user?.role)) continue;
    try {
      ws.send(msg);
    } catch (err) {
      console.error('[ws] send failed for one client; continuing:', err?.message || err);
    }
  }
}

/**
 * Broadcast a tracker update to all connected clients.
 * @param {string} characterId
 * @param {object} fields — the changed tracker fields
 */
export function broadcastTrackerUpdate(characterId, fields) {
  if (!_wss) return;
  _fanOut(JSON.stringify({ type: 'tracker', characterId, fields }));
}

/**
 * Broadcast an ST mod create/revoke event to all connected clients.
 * STM-9 (issue #416, ADR-004 Rev 3 §D11) — mirrors broadcastTrackerUpdate's
 * dispatch shape so the client's existing reconnect / heartbeat / dedupe
 * machinery applies without extension.
 *
 * Frame shape: { type: 'st_mod', characterId, op, st_mod_id }. The
 * st_mod_id is what the client's markLocalWrite dedupe uses as the
 * unique-mutation token (mirrors how tracker frames use per-field keys).
 *
 * @param {string} characterId
 * @param {'create' | 'activate' | 'deactivate' | 'delete'} op
 *   STM-10 (issue #434, ADR-004 Rev 4 §D18) widened the op set. The
 *   `revoke` op from STM-9 is retired — DELETE now emits `delete`, and
 *   the PATCH toggle emits `activate` / `deactivate`. Clients treat the
 *   op as advisory and refetch the character's mods regardless, so an
 *   unknown op degrades gracefully to "refetch".
 * @param {string} stModId — the affected mod doc _id
 */
export function broadcastStModUpdate(characterId, op, stModId) {
  if (!_wss) return;
  _fanOut(JSON.stringify({
    type: 'st_mod',
    characterId: String(characterId),
    op,
    st_mod_id: String(stModId),
  }));
}

/**
 * Broadcast an equipment catalogue create/update/delete event to all
 * connected clients (Epic ECM, ECM-1 / issue #868).
 *
 * Frame shape: { type: 'catalogue', item_id, op }. Wired in ECM-1 so the
 * route layer already fires the event; ECM-4 / ECM-5 (dropdown clients)
 * and ECM-6 (admin UI) consume it to invalidate their module-level
 * catalogue cache and refetch via GET /api/equipment_catalogue.
 *
 * Clients treat the op as advisory and refetch regardless, so an unknown
 * op degrades gracefully to "refetch" — mirrors broadcastStModUpdate's
 * resilience pattern.
 *
 * @param {string|ObjectId} itemId — the affected catalogue doc _id
 * @param {'create' | 'update' | 'delete'} op
 */
export function broadcastCatalogueUpdate(itemId, op) {
  if (!_wss) return;
  _fanOut(JSON.stringify({
    type: 'catalogue',
    item_id: String(itemId),
    op,
  }));
}

/**
 * Broadcast a newly-persisted roll to ST/dev-role connected clients only
 * (gdx.8, #989).
 *
 * Frame shape: { type: 'roll_log', ...doc } — the whole small doc, not just
 * an id, so the admin live feed renders directly from the frame without a
 * second round-trip per roll (this is a high-frequency event during a live
 * session, unlike catalogue/settings updates).
 *
 * Uses `_fanOutRoles`, NOT `_fanOut` — unlike catalogue/settings/st_mod
 * frames, a roll_log doc carries another character's real dice results and
 * vitae/willpower spend. Broadcasting it to every connected socket would
 * bypass GET /api/roll_log's own ST/dev-only gate (AC4) at the transport
 * layer. Role review fix, gdx.8 — see `_fanOutRoles`'s own doc comment.
 *
 * @param {object} doc — the written roll_log document, including _id
 */
export function broadcastRollLogged(doc) {
  if (!_wss) return;
  _fanOutRoles(JSON.stringify({
    type: 'roll_log',
    ...doc,
    _id: String(doc._id),
  }), ['st', 'dev']);
}

/**
 * Broadcast a Praxis board change to ST/dev-role connected clients only
 * (Epic PRAX, prax.1).
 *
 * Frame shape: { type: 'praxis_session', session_id }. A plain "this document
 * changed, refetch" signal, mirroring `broadcastCatalogueUpdate`'s own
 * minimal-payload contract rather than `broadcastRollLogged`'s whole-document
 * one. A roll is a high-frequency event whose doc is small and final; a Praxis
 * board is a single low-frequency document whose displayed tallies are DERIVED
 * at render time from live character/territory data, so a client that patched
 * from the frame instead of refetching would still be reading stale weights.
 * Refetch is the only correct response, so the frame carries only the id.
 *
 * The richer resolve-time frame ({ type: 'praxis_resolved', affected_seat_ids,
 * ... }) is prax.4b's own addition, deliberately not pre-built here.
 *
 * Uses `_fanOutRoles`, NOT `_fanOut`, for exactly the reason
 * `broadcastRollLogged` does. Every route in server/routes/praxis-sessions.js
 * is `requireRole('st')`, and Praxis claim/support state is permanently
 * ST-only (Angelus's locked ruling for the whole epic - it is never
 * player-visible, in any form, at any point). Sending these frames over the
 * shared WS to every open socket would hand a player a live feed of who is
 * standing and who is backing them, bypassing that REST gate at the transport
 * layer. Even though the frame carries no tally data itself, it is the signal
 * to refetch a document a player cannot read, so it has no business on a
 * player socket.
 *
 * @param {string|ObjectId} sessionId - the affected praxis_sessions doc _id
 */
export function broadcastPraxisUpdate(sessionId) {
  if (!_wss) return;
  _fanOutRoles(JSON.stringify({
    type: 'praxis_session',
    session_id: String(sessionId),
  }), ['st', 'dev']);
}

/**
 * ADMR-1: `broadcastBloodlineUpdate` (Epic BL, BL-4 / issue #1008) removed.
 * It was called only from the three `server/routes/bloodlines.js` write
 * handlers ADMR-1 retired (bloodline authoring now lives entirely in TM
 * Admin), confirmed via a repo-wide search before deletion - no other caller
 * existed. This is the source of the known, accepted live-update gap ADMR-1's
 * own story documents: an edit made through TM Admin no longer live-pushes to
 * an already-open TM Game tab (`public/js/admin.js`'s `onBloodlineUpdate`
 * listener and its `refetchBloodlines()` call are UNCHANGED and still wired -
 * they simply never receive a frame from this repo any more). Re-add a
 * broadcaster here only as part of a deliberate decision to close that gap,
 * not as a reflexive restoration.
 */

/**
 * Broadcast a global app_settings change to all connected clients.
 * gdx.5 (#986) — mirrors broadcastCatalogueUpdate's shape exactly. No
 * payload: the settings doc is a single small document, so the client's
 * job on receipt is just "refetch the whole thing" (same as the
 * catalogue frame's own refetch-not-patch contract), not apply a partial
 * diff. Fired on every successful PATCH /api/settings, whichever key
 * changed.
 */
export function broadcastSettingsUpdate() {
  if (!_wss) return;
  // BL-4 review gap (found 2026-08-18 reconciliation): this broadcaster was
  // added by gdx.5 after BL-4's own review fixed the identical one-bad-socket
  // vulnerability in the other four broadcasters. It had its own unguarded
  // send loop, missing the shared _fanOut try/catch. Routed through _fanOut
  // like every other broadcaster now.
  _fanOut(JSON.stringify({ type: 'settings' }));
}

// ── Token resolution (mirrors middleware/auth.js logic) ──

const _tokenCache = new Map();
const TOKEN_CACHE_TTL = 60_000;

async function _resolveUser(token) {
  // Check cache first
  const cached = _tokenCache.get(token);
  if (cached && Date.now() - cached.ts < TOKEN_CACHE_TTL) return cached.user;

  // Test token bypass (non-production only)
  if (token === 'local-test-token' && process.env.NODE_ENV !== 'production') {
    const players = getCollection('players');
    const player = await players.findOne({ role: { $in: ['st', 'dev'] } });
    if (player) {
      const user = { id: player.discord_id || 'test', role: player.role, player_id: player._id, character_ids: player.character_ids || [] };
      _tokenCache.set(token, { user, ts: Date.now() });
      return user;
    }
    return null;
  }

  // Validate against Discord
  try {
    const res = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const discord = await res.json();

    const players = getCollection('players');
    const player = await players.findOne({ discord_id: discord.id });
    if (!player) return null;

    const user = {
      id: discord.id,
      username: discord.username,
      role: player.role || 'player',
      player_id: player._id,
      character_ids: (player.character_ids || []).map(String),
    };
    _tokenCache.set(token, { user, ts: Date.now() });
    return user;
  } catch {
    return null;
  }
}
