import { getCollection } from '../db.js';

const DISCORD_API = 'https://discord.com/api/v10';

// Cache validated tokens briefly to avoid hitting Discord on every request.
// Map<token, { user, expiresAt }>
const tokenCache = new Map();
const CACHE_TTL = 60_000; // 1 minute

export async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'AUTH_ERROR', message: 'Authentication required' });
  }

  const token = authHeader.slice(7);

  // Local test bypass — only active when NODE_ENV !== 'production'.
  // 'local-test-token' is the localhost-only test bypass; unrelated to
  // Peter's real 'dev' role (set in MongoDB, validated via Discord OAuth).
  if (process.env.NODE_ENV !== 'production' && token === 'local-test-token') {
    req.user = {
      id: 'local-test',
      username: 'local-test',
      global_name: 'Local Test',
      avatar: null,
      role: 'st',
      player_id: null,
      character_ids: [],
      is_dual_role: false,
    };
    return next();
  }

  // Check cache first
  const cached = tokenCache.get(token);
  if (cached && cached.expiresAt > Date.now()) {
    req.user = cached.user;
    return next();
  }

  // Validate token against Discord
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!userRes.ok) {
    tokenCache.delete(token);
    return res.status(401).json({ error: 'AUTH_ERROR', message: 'Invalid or expired token' });
  }

  const discordUser = await userRes.json();

  // Look up player in the players collection
  const player = await getCollection('players').findOne({ discord_id: discordUser.id });

  if (!player) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'No player record found — contact an ST' });
  }

  const userInfo = {
    id: discordUser.id,
    username: discordUser.username,
    global_name: discordUser.global_name,
    avatar: discordUser.avatar,
    role: player.role,
    player_id: player._id,
    character_ids: player.character_ids || [],
    is_dual_role: player.role === 'st' && (player.character_ids || []).length > 0,
  };

  tokenCache.set(token, { user: userInfo, expiresAt: Date.now() + CACHE_TTL });
  req.user = userInfo;
  next();
}

/**
 * "dev" is a privacy-redacted ST role — full read/write access, but the
 * client UI redacts character and player names. For access-control
 * purposes it's equivalent to 'st' everywhere.
 */
export function isStRole(user) {
  const r = user?.role;
  return r === 'st' || r === 'dev';
}

// Role gate middleware — use after requireAuth
export function requireRole(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role' });
    }
    // dev is treated as st for all access checks
    const effective = roles.includes('st') && !roles.includes('dev') ? [...roles, 'dev'] : roles;
    if (!effective.includes(role)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role' });
    }
    next();
  };
}
