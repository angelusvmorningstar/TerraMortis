/**
 * Equipment catalogue cache (Epic ECM, ECM-5 / issue #872).
 *
 * Module-level cache fed by `GET /api/equipment_catalogue` at boot. Consumers
 * (currently `editor/edit.js` per ECM-5; `editor/sheet.js` and `suite/roll-v2.js`
 * — roll.js retired outright by rlv.2, 2026-08-24 — fold in alongside the
 * static-module deletion in ECM-7) read from the cache
 * rather than the static `EQUIPMENT_CATALOGUE` import. Refetches on receipt
 * of a `broadcastCatalogueUpdate` WS frame so admin catalogue edits propagate
 * to every open dropdown without a page reload.
 *
 * Lookup keys (post-ECM-3 canonical shape):
 *   - `_id` is an ObjectId on disk; the JSON-serialized 24-hex string is what
 *     the cache stores and what consumers reference (matches the wire format
 *     of `character.equipment[].catalogue_id`).
 *   - `getCatalogueEntry` accepts either the 24-hex `_id` string (canonical)
 *     or the legacy `id` slug (returns the matching doc if either is found —
 *     legacy fallback retained until ECM-7 deletes the static module).
 */

import { apiGet } from './api.js';

let _items = [];
let _byId = new Map();
let _byBucket = new Map();
let _loaded = false;
let _inFlight = null;
const _onChangeListeners = new Set();

function _index(items) {
  _items = items.slice();
  _byId = new Map();
  _byBucket = new Map();
  for (const it of _items) {
    const id = String(it._id);
    _byId.set(id, it);
    if (!_byBucket.has(it.bucket)) _byBucket.set(it.bucket, []);
    _byBucket.get(it.bucket).push(it);
  }
  // Stable alphabetical order within each bucket for the dropdown UX.
  for (const arr of _byBucket.values()) {
    arr.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }
  _loaded = true;
}

/**
 * Fetch the catalogue from the API and populate the cache. Idempotent —
 * concurrent callers share the same in-flight promise. After load, every
 * registered `onCatalogueChange` listener fires.
 */
export async function loadCatalogue() {
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const items = await apiGet('/api/equipment_catalogue');
      _index(Array.isArray(items) ? items : []);
    } catch (err) {
      console.error('[equipment-catalogue-cache] load failed:', err);
      _index([]);   // empty cache rather than throw — consumers degrade to no-options
    } finally {
      _inFlight = null;
    }
    for (const fn of _onChangeListeners) {
      try { fn(); } catch (e) { console.error('[equipment-catalogue-cache] listener err:', e); }
    }
  })();
  return _inFlight;
}

export function isLoaded() { return _loaded; }

export function getCatalogue() { return _items.slice(); }

export function getCatalogueByBucket(bucket) {
  return (_byBucket.get(bucket) || []).slice();
}

export function getCatalogueEntry(idOrSlug) {
  if (idOrSlug == null) return null;
  const key = String(idOrSlug);
  const byId = _byId.get(key);
  if (byId) return byId;
  // Legacy fallback — slug field on items from the pre-ECM-3 era. Should be
  // absent on post-ECM-2 docs; ECM-7 removes the static module + this branch.
  return _items.find(it => it.id === idOrSlug) || null;
}

/**
 * Register a listener that fires after every successful cache reload.
 * Returns an unsubscribe function. Used by edit.js to re-render the
 * dropdown when a remote catalogue edit lands via WS.
 */
export function onCatalogueChange(fn) {
  _onChangeListeners.add(fn);
  return () => _onChangeListeners.delete(fn);
}

/**
 * Force a refetch. Wired to the `broadcastCatalogueUpdate` WS frame in
 * `public/js/data/ws.js`. Cheap because the catalogue is small (~70 docs
 * pre-ECM-9; an item-request flow may push that higher but stays bounded).
 */
export async function refetchCatalogue() {
  _inFlight = null;
  return loadCatalogue();
}
