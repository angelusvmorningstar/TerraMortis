/**
 * Office content cache (oxp.10, split out of oxp.1, 2026-08-13).
 *
 * Module-level cache fed by `GET /api/office_content` at boot, replacing the
 * static `OFFICE_DATA` / `MERIT_DOT_CAPS` exports (`public/js/tabs/office-data.js`,
 * deleted in this same story) as the source every office-content reader uses.
 * Structurally this follows `bloodlines-cache.js` (BL-2, #1008) closely: a
 * single fetch at boot, a monotonic generation counter against overlapping
 * loads, and plain synchronous accessors every render path already expects —
 * office-tab.js and editor/sheet.js both read office content synchronously
 * mid-render, exactly as bloodlines' `clanDiscList` reads discipline lists
 * synchronously mid-render, so there is no fetch-per-render to add here.
 *
 * No miss registry, unlike bloodlines. An unresolved bloodline silently
 * miscosts XP (the wrong-LOW failure `bloodlines-cache.js`'s own header
 * describes) — a genuinely dangerous, quiet failure. A missing office_content
 * entry instead lands on office-tab.js's existing, ALREADY-VISIBLE "Office
 * details for this role are pending." fallback (the same one 'Administrator'
 * uses today, pre-migration), so an unloaded or short cache is honest on
 * screen without a second reporting mechanism.
 */

import { apiGet } from './api.js';

let _byCategory = new Map();
let _meritCaps = {};
let _loaded = false;
let _loadFailed = false;
let _inFlight = null;

/** See bloodlines-cache.js's own header for why this exists: "newest started
 *  wins" survives overlapping loads regardless of response order. */
let _generation = 0;

function _index(docs) {
  const byCategory = new Map();
  let meritCaps = {};
  for (const doc of docs) {
    if (!doc || typeof doc !== 'object') continue;
    if (doc.kind === 'office' && typeof doc.category === 'string') {
      byCategory.set(doc.category, doc);
    } else if (doc.kind === 'merit_caps' && doc.caps && typeof doc.caps === 'object') {
      meritCaps = doc.caps;
    }
  }
  _byCategory = byCategory;
  _meritCaps = meritCaps;
  _loaded = true;
  _loadFailed = false;
}

/**
 * Fetch the collection and populate the cache. Idempotent — concurrent
 * callers share one in-flight promise. Never throws: the caller is a boot
 * sequence, and taking the whole app down over a reference-data fetch would
 * be worse than running degraded (every office falls back to the existing
 * "pending" render, the same one Administrator already uses).
 */
export async function loadOfficeContent() {
  if (_inFlight) return _inFlight;
  const gen = ++_generation;
  _inFlight = (async () => {
    try {
      const docs = await apiGet('/api/office_content');
      if (!Array.isArray(docs)) throw new Error('malformed payload: expected an array');
      if (gen !== _generation) return;
      _index(docs);
    } catch (err) {
      console.error('[office-content-cache] load failed:', err);
      if (gen !== _generation) return;
      _byCategory = new Map();
      _meritCaps = {};
      _loaded = false;
      _loadFailed = true;
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}

export function isLoaded() { return _loaded; }
export function loadFailed() { return _loadFailed; }

/**
 * The `OFFICE_DATA[category]` equivalent. Returns a COPY of the document
 * (`asset`, `style`, `merits`, `manoeuvres`, `statusPower`), never a live
 * reference, so a caller cannot mutate the shared cache — or `undefined`, a
 * real, valid state for 'Administrator' until oxp-8, and for EVERY category
 * before the cache has loaded, both already handled by every existing
 * caller's own "no entry" branch (see e.g. office-tab.js's pending-office
 * fallback). Matches `bloodlineDiscs()`'s own copy-not-reference convention
 * in `bloodlines-cache.js`. Codex review, oxp-10 (High, Pass 3a): an earlier
 * draft returned the cached document directly — no current consumer
 * mutates it, but the story's own AC7 promised copies, and the cost of a
 * shallow-plus-array copy on a ~5-document collection is unmeasurable.
 *
 * @param {string} category
 */
export function officeEntry(category) {
  const doc = _byCategory.get(category);
  if (!doc) return undefined;
  return {
    ...doc,
    merits: doc.merits.slice(),
    manoeuvres: doc.manoeuvres.map(m => ({ ...m })),
    statusPower: doc.statusPower.slice(),
  };
}

/**
 * The `MERIT_DOT_CAPS[merit] || 5` equivalent, folded into one call so every
 * caller keeps the same default-cap convention without re-deriving it.
 *
 * @param {string} merit
 */
export function meritCap(merit) {
  return _meritCaps[merit] || 5;
}
