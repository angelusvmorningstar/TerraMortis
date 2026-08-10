/**
 * Bloodlines cache (Epic BL, BL-2 / issue #1008).
 *
 * Module-level cache fed by `GET /api/bloodlines` at boot, replacing the
 * static `BLOODLINE_DISCS` / `BLOODLINE_CLANS` / `APPROVED_BLOODLINES` exports
 * as the source `clanDiscList` reads. Structurally this follows
 * `equipment-catalogue-cache.js`; its FAILURE semantics deliberately do not.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why this module carries a miss registry
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   The equipment catalogue degrades to an empty dropdown, which a human can
 *   see. This degrades to a wrong XP cost, which a human cannot. Ocka Keats'
 *   disciplines cost 4 per dot instead of 3 for two weeks because
 *   `clanDiscList` fell through to her CLAN list — well-formed, plausible and
 *   wrong (data-map.md drift pattern #15).
 *
 *   Ruled by Angelus 2026-08-10: an unresolved bloodline returns an EMPTY list,
 *   never the clan list. Nothing is silently in-clan, so the error runs
 *   wrong-HIGH (everything 4/dot), which somebody notices and complains about,
 *   rather than wrong-LOW, which nobody ever does. That is only half the
 *   answer though — an empty list is still silent on its own. So every miss is
 *   registered here, the banner renders from the registry, and the editor
 *   refuses discipline edits for an affected character.
 *
 *   Two causes of a miss, deliberately kept apart because they need different
 *   human responses:
 *
 *     MISS_NOT_LOADED  the cache has not loaded, or the load failed. A SYSTEM
 *                      state. Hits every bloodline character at once, is
 *                      transient, and self-heals on reload — which is exactly
 *                      why it would never be reported if it were quiet.
 *     MISS_UNKNOWN     a bloodline the collection does not contain. A DATA
 *                      state. One character, and it persists until someone
 *                      fixes the data.
 *
 * BL-4 added the write path, and with it `refetchBloodlines()` — see its own
 * header for why it is not the two-line ECM refetch.
 */

import { apiGet } from './api.js';

export const MISS_NOT_LOADED = 'cache_not_loaded';
export const MISS_UNKNOWN = 'unknown_bloodline';
/**
 * The fetch succeeded and returned zero bloodlines. Distinct from both of the
 * above because it is a THIRD cause with a third remedy: the collection has
 * almost certainly not been seeded. Without this, an unseeded collection reads
 * as 23 separate "bloodline not found" rows, which points the reader at 23
 * imaginary data problems instead of the one real operational one.
 */
export const MISS_EMPTY_COLLECTION = 'empty_collection';

let _items = [];
let _byName = new Map();
let _loaded = false;
let _loadFailed = false;
let _inFlight = null;

/** key -> { reason, bloodline, characters: Set<string> } */
const _misses = new Map();
const _missListeners = new Set();

/** Trim + case-fold, so a stray " khaibit" from a CSV import still resolves. */
function _key(name) {
  return typeof name === 'string' ? name.trim().toLowerCase() : '';
}

function _index(items) {
  _items = items.slice();
  _byName = new Map();
  for (const b of _items) {
    // Indexed on a normalised key. The old constant lookup was exact-match, so
    // a case or whitespace slip used to degrade silently to the clan list; now
    // it would HARD-LOCK the character, which makes tolerance matter more, not
    // less. `name` stays the display value.
    if (b && typeof b.name === 'string') _byName.set(_key(b.name), b);
  }
  _loaded = true;
  _loadFailed = false;
}

/**
 * Fetch the collection and populate the cache. Idempotent — concurrent callers
 * share one in-flight promise. Never throws: the caller is a boot sequence, and
 * taking the whole app down over a reference-data fetch would be worse than
 * running degraded. A failure sets `loadFailed()`, which the banner reads.
 */
export async function loadBloodlines() {
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const items = await apiGet('/api/bloodlines');
      if (!Array.isArray(items)) {
        // An empty array is a legitimate answer. `null` or an error object is
        // not, and must never read as "there are no bloodlines" — that would
        // turn a broken endpoint into a silent 23-character outage.
        throw new Error('malformed payload: expected an array');
      }
      _index(items);
      // The transient cause is resolved by definition; the data cause is not,
      // and must survive the load that proved it real.
      _clearMisses(MISS_NOT_LOADED);
    } catch (err) {
      console.error('[bloodlines-cache] load failed:', err);
      _items = [];
      _byName = new Map();
      _loaded = false;
      _loadFailed = true;
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}

/**
 * Re-fetch the collection after an ST write, driven by the `bloodline` WS
 * frame (BL-4, #1008). Returns true when the index was replaced, false when
 * the fetch failed and the previous index was kept.
 *
 * ──────────────────────────────────────────────────────────────────────────
 *   Why this is not `refetchCatalogue()`
 * ──────────────────────────────────────────────────────────────────────────
 *
 *   The equipment catalogue's refetch is two lines: null the in-flight
 *   promise, call the loader again. Copying that here would be a live defect,
 *   because `loadBloodlines()`'s failure path wipes `_items`, sets
 *   `_loaded = false` and `_loadFailed = true`. ECM can afford that; it
 *   degrades to an empty dropdown, which a human can see. This degrades to
 *   every bloodline character hard-locked in the editor and costed at 4
 *   XP/dot, from one transient network blip, behind a banner blaming the
 *   system rather than the blip.
 *
 *   So the failure path here keeps the last good index and logs. Only the boot
 *   load, which has nothing to lose, may empty the cache.
 *
 *   It also deliberately does NOT share `_inFlight`. Boot priming is awaited
 *   before `initWS` is called in both apps, so the two cannot overlap in
 *   practice; joining them would mean a boot load that fails AFTER a
 *   successful refetch could still wipe what the refetch had just repaired.
 *
 * An EMPTY array is a legitimate answer, not a failure: the last bloodline
 * having been deleted is a real state the cache must reflect. Only a genuine
 * fetch error or a malformed (non-array) payload preserves the old index.
 */
export async function refetchBloodlines() {
  try {
    const items = await apiGet('/api/bloodlines');
    if (!Array.isArray(items)) throw new Error('malformed payload: expected an array');
    _index(items);
    _clearResolvedMisses();
    return true;
  } catch (err) {
    console.error('[bloodlines-cache] refetch failed; keeping the last good index:', err);
    return false;
  }
}

export function isLoaded() { return _loaded; }
export function loadFailed() { return _loadFailed; }
/**
 * True when the cache can actually answer a question about bloodlines.
 * Added by BL-3a's review: three separate call sites were about to branch on
 * their own combination of isLoaded/loadFailed/isEmpty, and one of them was a
 * destructive write. One predicate, one meaning.
 */
export function bloodlinesResolvable() { return _loaded && !_loadFailed && _items.length > 0; }

/** Loaded successfully but the collection is empty — almost certainly unseeded. */
export function isEmpty() { return _loaded && _items.length === 0; }

/**
 * The `BLOODLINE_DISCS[name]` equivalent. Returns a COPY so a caller cannot
 * mutate the cache, or `null` when the name is not in the collection.
 * `null` is the miss signal; an empty array would be indistinguishable from a
 * bloodline that grants nothing.
 */
export function bloodlineDiscs(name) {
  if (!name) return null;
  const doc = _byName.get(_key(name));
  // A document present but carrying no usable discipline list is a miss, not a
  // bloodline that grants nothing. Returning `[]` here would sail past the
  // caller's miss check and lock the character with no banner and no reason.
  if (!doc || !Array.isArray(doc.disciplines) || doc.disciplines.length === 0) return null;
  return doc.disciplines.slice();
}

/**
 * The `BLOODLINE_CLANS` equivalent, DERIVED. Never stored: two hand-maintained
 * structures that can disagree is the drift this epic exists to delete.
 */
export function bloodlinesByClan() {
  const out = {};
  for (const b of _items) {
    if (!b || !b.clan || !b.name) continue;
    (out[b.clan] ||= []).push(b.name);
  }
  for (const list of Object.values(out)) list.sort((a, b) => a.localeCompare(b));
  return out;
}

/** The `APPROVED_BLOODLINES` equivalent, DERIVED. */
export function approvedBloodlines() {
  return _items.map(b => b && b.name).filter(Boolean).sort((a, b) => a.localeCompare(b));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Miss registry
// ─────────────────────────────────────────────────────────────────────────────

function _notify() {
  for (const fn of _missListeners) {
    try { fn(); } catch (e) { console.error('[bloodlines-cache] miss listener err:', e); }
  }
}

function _clearMisses(reason) {
  let changed = false;
  for (const [key, miss] of _misses) {
    if (miss.reason === reason) { _misses.delete(key); changed = true; }
  }
  if (changed) _notify();
}

/**
 * Drop every miss the CURRENT index now answers. Called from
 * `refetchBloodlines` on the success path only (BL-4 AC 10).
 *
 * `MISS_UNKNOWN` entries deliberately survive a load — the data cause outlives
 * the load that proved it real — and `clearBloodlineMissesFor` only fires from
 * `clanDiscList`'s success path, i.e. when the affected character next
 * renders. Between the two, an ST who creates the very bloodline the banner is
 * complaining about would keep seeing the row until something happened to
 * re-render that character. A banner that keeps asserting a fixed problem is
 * how a warning stops being read, which is the same argument
 * `clearBloodlineMissesFor` was written from.
 *
 * Keyed on the bloodline value rather than the character, because here it is
 * the collection that changed, not the character.
 */
function _clearResolvedMisses() {
  let changed = false;
  for (const [key, miss] of _misses) {
    let resolved;
    if (miss.reason === MISS_UNKNOWN) resolved = _byName.has(_key(miss.bloodline));
    else if (miss.reason === MISS_EMPTY_COLLECTION) resolved = _items.length > 0;
    else if (miss.reason === MISS_NOT_LOADED) resolved = _loaded && !_loadFailed;
    else resolved = false;
    if (resolved) { _misses.delete(key); changed = true; }
  }
  if (changed) _notify();
}

/**
 * Register that a character's bloodline could not be resolved. Called from
 * `clanDiscList`, which runs on every render, so this must stay cheap and must
 * only notify when the registry actually changes — otherwise a re-render loop
 * would fire the banner listener on every pass.
 *
 * @param {string} reason        MISS_NOT_LOADED or MISS_UNKNOWN
 * @param {string} bloodline     the unresolved value, verbatim
 * @param {string} characterLabel display name, for the banner
 */
export function recordBloodlineMiss(reason, bloodline, characterLabel) {
  if (!reason || !bloodline) return;

  // GLOBAL causes collapse to a single row. The cache being unloaded, or the
  // collection being empty, is one fact about the system, not one fact per
  // bloodline — keying those on the value produced a banner that repeated the
  // same sentence 13 times, once per distinct bloodline on the roster. Only
  // MISS_UNKNOWN is genuinely per-bloodline, because there the value IS the
  // problem and the reader needs to see which name failed.
  const isGlobal = reason === MISS_NOT_LOADED || reason === MISS_EMPTY_COLLECTION;
  const key = isGlobal ? reason : reason + '|' + bloodline;

  let miss = _misses.get(key);
  if (!miss) {
    miss = { reason, bloodline: isGlobal ? null : bloodline, characters: new Set() };
    _misses.set(key, miss);
  } else if (!characterLabel || miss.characters.has(characterLabel)) {
    return; // nothing new to say
  }
  if (characterLabel) miss.characters.add(characterLabel);
  _notify();
}

/** Snapshot of the registry, with character sets flattened to sorted arrays. */
export function getBloodlineMisses() {
  return [..._misses.values()].map(m => ({
    reason: m.reason,
    bloodline: m.bloodline,
    characters: [...m.characters].sort((a, b) => a.localeCompare(b)),
  }));
}

/**
 * Drop every miss recorded against this character. Called from `clanDiscList`
 * on the SUCCESS path, so the banner is self-correcting: the moment an ST fixes
 * a typo'd bloodline and the sheet re-renders, the row naming them disappears.
 *
 * Without this the registry is append-only and the banner keeps asserting a
 * problem that has been fixed, which is how a warning stops being read. The
 * clear is keyed on the character, not the bloodline value, precisely because
 * the value is the thing that changed.
 */
export function clearBloodlineMissesFor(characterLabel) {
  if (!characterLabel || !_misses.size) return;
  let changed = false;
  for (const [key, miss] of _misses) {
    if (!miss.characters.delete(characterLabel)) continue;
    changed = true;
    if (miss.characters.size === 0) _misses.delete(key);
  }
  if (changed) _notify();
}

/** Register a listener fired whenever the registry changes. Returns unsubscribe. */
export function onBloodlineMiss(fn) {
  _missListeners.add(fn);
  return () => _missListeners.delete(fn);
}
