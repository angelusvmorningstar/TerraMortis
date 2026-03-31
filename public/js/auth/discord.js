// Discord OAuth2 client-side flow for ST Admin app.
// Handles login redirect, callback code exchange, token storage, and logout.

const DISCORD_CLIENT_ID = '1488404820917223484';
const REDIRECT_URI = location.origin + '/admin';
const SCOPES = 'identify';

const API_BASE = location.hostname === 'localhost'
  ? 'http://localhost:3000'
  : '';

// ── Token storage ──

export function getToken() {
  const token = localStorage.getItem('tm_auth_token');
  const expires = localStorage.getItem('tm_auth_expires');
  if (!token || !expires) return null;
  if (Date.now() > Number(expires)) {
    clearAuth();
    return null;
  }
  return token;
}

export function getUser() {
  const raw = localStorage.getItem('tm_auth_user');
  return raw ? JSON.parse(raw) : null;
}

function saveAuth(data) {
  localStorage.setItem('tm_auth_token', data.access_token);
  localStorage.setItem('tm_auth_expires', String(Date.now() + data.expires_in * 1000));
  localStorage.setItem('tm_auth_user', JSON.stringify(data.user));
}

function clearAuth() {
  localStorage.removeItem('tm_auth_token');
  localStorage.removeItem('tm_auth_expires');
  localStorage.removeItem('tm_auth_user');
}

// ── Login flow ──

export function login() {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPES,
  });
  window.location.href = `https://discord.com/oauth2/authorize?${params}`;
}

export function logout() {
  clearAuth();
  window.location.reload();
}

// ── Callback handling ──
// Called on page load — checks URL for ?code= parameter from Discord redirect

export async function handleCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get('code');
  if (!code) return false;

  // Clean the code from the URL immediately
  url.searchParams.delete('code');
  window.history.replaceState({}, '', url.pathname);

  // Exchange code for token via our server
  const res = await fetch(`${API_BASE}/api/auth/discord/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'Login failed');
  }

  const data = await res.json();
  saveAuth(data);
  return true;
}

// ── Token validation ──
// Checks if the stored token is still valid with the server

export async function validateToken() {
  const token = getToken();
  if (!token) return false;

  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    clearAuth();
    return false;
  }

  // Update stored user info
  const user = await res.json();
  localStorage.setItem('tm_auth_user', JSON.stringify(user));
  return true;
}

export function isLoggedIn() {
  return !!getToken();
}
