/**
 * auth.js
 * Discord OAuth2 Implicit Grant flow.
 * Works on static hosting (GitHub Pages) -- no backend or client_secret required.
 *
 * Depends on: config.js (DISCORD_CONFIG must be loaded first)
 */

const Auth = (() => {
  const KEY_TOKEN   = 'tm_discord_token';
  const KEY_EXPIRES = 'tm_discord_expires';
  const KEY_USER    = 'tm_discord_user';
  const KEY_STATE   = 'tm_discord_state';

  // Strip query/hash to get a clean redirect URI matching what Discord expects
  function _redirectUri() {
    return window.location.origin + window.location.pathname;
  }

  // ── OAuth flow ──────────────────────────────────────────────────────────────

  function login() {
    if (!DISCORD_CONFIG.CLIENT_ID) {
      alert('Discord Client ID not configured -- edit js/config.js.');
      return;
    }
    // Generate random state for CSRF protection
    const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(KEY_STATE, state);

    const params = new URLSearchParams({
      client_id:     DISCORD_CONFIG.CLIENT_ID,
      redirect_uri:  _redirectUri(),
      response_type: 'token',
      scope:         'identify email',
      state,
    });
    window.location.href = `https://discord.com/api/oauth2/authorize?${params}`;
  }

  /**
   * Call once on page load.
   * If Discord redirected back with #access_token in the URL fragment,
   * stores the token and cleans the URL.
   * Returns the raw token string on a fresh callback, null otherwise.
   */
  function handleCallback() {
    if (!window.location.hash || !window.location.hash.includes('access_token')) return null;

    const params = new URLSearchParams(window.location.hash.slice(1));
    const token  = params.get('access_token');
    if (!token) return null;

    // Validate CSRF state if present
    const savedState    = localStorage.getItem(KEY_STATE);
    const returnedState = params.get('state');
    localStorage.removeItem(KEY_STATE);

    if (savedState && returnedState && savedState !== returnedState) {
      console.error('[Auth] OAuth state mismatch -- ignoring callback');
      history.replaceState(null, '', window.location.pathname);
      return null;
    }

    const expiresIn = parseInt(params.get('expires_in') || '604800', 10);
    localStorage.setItem(KEY_TOKEN,   token);
    localStorage.setItem(KEY_EXPIRES, String(Date.now() + expiresIn * 1000));

    // Remove token from URL without a page reload
    history.replaceState(null, '', window.location.pathname);
    return token;
  }

  // ── Token / user accessors ──────────────────────────────────────────────────

  function getToken() {
    const token   = localStorage.getItem(KEY_TOKEN);
    const expires = parseInt(localStorage.getItem(KEY_EXPIRES) || '0', 10);
    if (!token || Date.now() > expires) return null;
    return token;
  }

  async function fetchUser(token) {
    try {
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const user = await res.json();
      localStorage.setItem(KEY_USER, JSON.stringify(user));
      return user;
    } catch { return null; }
  }

  function getStoredUser() {
    const s = localStorage.getItem(KEY_USER);
    return s ? JSON.parse(s) : null;
  }

  function logout() {
    [KEY_TOKEN, KEY_EXPIRES, KEY_USER, KEY_STATE].forEach(k => localStorage.removeItem(k));
  }

  // ── Role helpers ────────────────────────────────────────────────────────────

  /**
   * Returns the role for a Discord user object:
   *   'st'      -- listed in ST_IDS, full dashboard access
   *   'player'  -- listed in PLAYER_MAP, sees only their character
   *   'unknown' -- logged in but not mapped
   *   null      -- not logged in
   */
  function getRole(user) {
    if (!user) return null;
    if ((DISCORD_CONFIG.ST_IDS || []).includes(user.id)) return 'st';
    if ((DISCORD_CONFIG.PLAYER_MAP || {})[user.id])       return 'player';
    return 'unknown';
  }

  /** Returns the character name for a player, or null. */
  function getCharacterName(user) {
    if (!user) return null;
    return (DISCORD_CONFIG.PLAYER_MAP || {})[user.id] || null;
  }

  return {
    login,
    handleCallback,
    getToken,
    fetchUser,
    getStoredUser,
    logout,
    getRole,
    getCharacterName,
  };
})();
