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

// Role gate middleware — use after requireAuth
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Insufficient role' });
    }
    next();
  };
}
