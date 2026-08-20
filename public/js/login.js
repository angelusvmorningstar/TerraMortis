// public/js/login.js — the single, fixed Discord OAuth callback landing page.
// login.html/login.js exists ONLY to process the ?code= Discord sends back and bounce the
// user to wherever they actually started (saved in tm_auth_return by login() in auth/discord.js
// before the redirect to Discord). It never renders an app of its own.

import { handleCallback, isLoggedIn, validateToken, login } from './auth/discord.js';

async function boot() {
  const statusEl = document.getElementById('login-status');
  const btnEl = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');

  try {
    await handleCallback();
  } catch (err) {
    statusEl.textContent = 'Login failed.';
    errorEl.textContent = err.message;
    btnEl.style.display = '';
    btnEl.addEventListener('click', login);
    return;
  }

  if (isLoggedIn()) {
    const valid = await validateToken();
    if (valid) {
      const returnTo = localStorage.getItem('tm_auth_return');
      localStorage.removeItem('tm_auth_return');
      // Never bounce back into login.html itself (e.g. a stale/self-referential
      // tm_auth_return) — that would loop. Default home is the player app.
      const dest = (returnTo && returnTo !== '/login.html' && returnTo !== '/login')
        ? returnTo
        : '/';
      window.location.replace(dest);
      return;
    }
  }

  // No code, not logged in, or validation failed — nothing to bounce back to.
  // Offer a direct login entry point rather than a dead end.
  statusEl.textContent = 'Log in to continue.';
  btnEl.style.display = '';
  btnEl.addEventListener('click', login);
}

boot();
