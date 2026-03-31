import { Router } from 'express';
import { config } from '../config.js';

const router = Router();

const DISCORD_API = 'https://discord.com/api/v10';
const SCOPES = 'identify';

// GET /api/auth/discord — redirect user to Discord OAuth2 consent screen
router.get('/discord', (req, res) => {
  const params = new URLSearchParams({
    client_id: config.DISCORD_CLIENT_ID,
    redirect_uri: config.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
  });
  res.redirect(`https://discord.com/oauth2/authorize?${params}`);
});

// POST /api/auth/discord/callback — exchange authorisation code for access token
router.post('/discord/callback', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'AUTH_ERROR', message: 'Missing authorisation code' });

  // Exchange code for token with Discord
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.DISCORD_CLIENT_ID,
      client_secret: config.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.DISCORD_REDIRECT_URI,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.json().catch(() => ({}));
    return res.status(401).json({ error: 'AUTH_ERROR', message: err.error_description || 'Token exchange failed' });
  }

  const tokenData = await tokenRes.json();

  // Fetch Discord user profile
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    return res.status(401).json({ error: 'AUTH_ERROR', message: 'Failed to fetch Discord user' });
  }

  const user = await userRes.json();

  // Check ST whitelist
  if (!config.ST_IDS.includes(user.id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Access restricted to Storytellers' });
  }

  res.json({
    access_token: tokenData.access_token,
    expires_in: tokenData.expires_in,
    user: {
      id: user.id,
      username: user.username,
      global_name: user.global_name,
      avatar: user.avatar,
    },
  });
});

// GET /api/auth/me — validate current token and return user info
router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'AUTH_ERROR', message: 'No token provided' });
  }

  const token = authHeader.slice(7);

  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!userRes.ok) {
    return res.status(401).json({ error: 'AUTH_ERROR', message: 'Invalid or expired token' });
  }

  const user = await userRes.json();

  if (!config.ST_IDS.includes(user.id)) {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Access restricted to Storytellers' });
  }

  res.json({
    id: user.id,
    username: user.username,
    global_name: user.global_name,
    avatar: user.avatar,
  });
});

export default router;
