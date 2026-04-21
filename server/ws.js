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
 * Broadcast a tracker update to all connected clients.
 * @param {string} characterId
 * @param {object} fields — the changed tracker fields
 */
export function broadcastTrackerUpdate(characterId, fields) {
  if (!_wss) return;
  const msg = JSON.stringify({ type: 'tracker', characterId, fields });
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
