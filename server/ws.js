/* WebSocket server — live tracker sync.
 * Authenticates on upgrade via Bearer token (same as REST API).
 * Broadcasts tracker_state changes to all connected clients.
 * Heartbeat keeps connections alive through Render's proxy. */

import { WebSocketServer } from 'ws';
import { getCollection } from './db.js';

let _wss = null;

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
 * Broadcast a bloodline create/update/delete event to all connected clients
 * (Epic BL, BL-4 / issue #1008).
 *
 * Frame shape: { type: 'bloodline', bloodline_id, op }. Same advisory-op
 * contract as broadcastCatalogueUpdate: clients refetch regardless, so an
 * unknown op degrades gracefully to "refetch".
 *
 * BL-1 deliberately shipped no broadcaster because there was no write path and
 * an unused broadcast is a claim the code cannot keep. BL-4 is the write path,
 * so the claim is now good. Both boot paths listen (`public/js/admin.js` and
 * `public/js/app.js`): the player app matters as much as the admin one,
 * because the downtime form free-rides on app.js's cache priming, so an ST
 * adding a bloodline mid-session would otherwise not reach an open DT form
 * until the player reloads.
 *
 * @param {string|ObjectId} bloodlineId — the affected bloodline doc _id
 * @param {'create' | 'update' | 'delete'} op
 */
export function broadcastBloodlineUpdate(bloodlineId, op) {
  if (!_wss) return;
  _fanOut(JSON.stringify({
    type: 'bloodline',
    bloodline_id: String(bloodlineId),
    op,
  }));
}

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
  const msg = JSON.stringify({ type: 'settings' });
  for (const ws of _wss.clients) {
    if (ws.readyState === 1) { // OPEN
      ws.send(msg);
    }
  }
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
