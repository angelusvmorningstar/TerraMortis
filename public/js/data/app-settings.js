/* Global app settings cache (Epic STM, issue #378; extended gdx.5, #986).
 *
 * Single GET at boot primes a module-level `globalSettings` object.
 * Consumers in public/js/data/st-mods.js and the admin/player render
 * call sites read `getGlobalSettings()?.st_mods_enabled` (or, since
 * gdx.5, `?.game_in_progress`) synchronously after boot.
 *
 * gdx.5: this is now genuinely live, not reload-only. `app.js`'s
 * `initWS({ onSettingsUpdate })` calls `loadGlobalSettings()` again on
 * every `broadcastSettingsUpdate` WS frame (server/ws.js), which fires on
 * any successful `PATCH /api/settings` — so a remote ST toggle reaches
 * every open tab without a reload. This supersedes the original STM-era
 * design note here ("not a live broadcast", ADR-004 Rev 2 §D2), which no
 * longer holds for either flag now sharing this one settings doc.
 *
 * The admin settings panel (public/js/admin/st-mods-panel.js) also calls
 * `loadGlobalSettings()` directly after its own PATCH, so the writing ST
 * sees the change without waiting on its own WS echo. */

const API_BASE = location.hostname === 'localhost' ? 'http://localhost:3000' : '';

function authHeaders() {
  const h = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('tm_auth_token');
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

let _settings = null;

/** Fetches /api/settings and caches the result. Returns the cached
 *  object so the caller can await + read synchronously after.
 *  Network failure leaves the cache as-is (null on first boot, or the
 *  prior value on refresh); the overlay's defensive optional-chain
 *  handles a null cache by treating st_mods_enabled as truthy. */
export async function loadGlobalSettings() {
  try {
    const res = await fetch(`${API_BASE}/api/settings`, { headers: authHeaders() });
    if (!res.ok) return _settings;
    _settings = await res.json();
  } catch {
    // Leave _settings unchanged on network failure
  }
  return _settings;
}

/** Synchronous read of the cached settings. Returns null if
 *  loadGlobalSettings() has not yet completed. STM-2's overlay reads
 *  this and treats null as enabled-by-default. */
export function getGlobalSettings() {
  return _settings;
}
