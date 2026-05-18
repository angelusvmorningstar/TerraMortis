/* Global app settings cache (Epic STM, issue #378).
 *
 * Single GET at boot primes a module-level `globalSettings` object.
 * Consumers in public/js/data/st-mods.js and the admin/player render
 * call sites read `getGlobalSettings()?.st_mods_enabled` synchronously
 * after boot. No live polling — the player app picks up flips on next
 * reload (per ADR-004 Rev 2 §D2 last paragraph; this is a debug/
 * emergency lever, not a live broadcast).
 *
 * STM-5 will call `loadGlobalSettings()` again from the admin settings
 * panel after a PATCH to refresh the cache locally — no full reload
 * needed for the writing ST. */

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
