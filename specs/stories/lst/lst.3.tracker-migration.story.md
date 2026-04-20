# Story: Tracker Migration — localStorage to MongoDB

**Story ID:** lst.3
**Epic:** Live Session Toolkit — Game App QoL
**Status:** review
**Date:** 2026-04-18

---

## User Story

As an ST managing a game night with up to 30 players, I want character tracker state (vitae, willpower, health) to be stored in MongoDB so that all devices see the same live state, rather than each device having its own isolated localStorage copy.

---

## Background & Architecture

### Why localStorage is unacceptable

Up to 30 players use the app simultaneously at a live LARP. localStorage is per-browser/device — the ST's tablet, each player's phone, and the game app all maintain separate copies. Any adjustment made by the ST is invisible to the player and vice versa. This is broken for live use.

### Server-side API — already built

`server/routes/tracker.js` already implements GET/PUT against a `tracker_state` MongoDB collection:

```js
// GET /api/tracker_state/:character_id — get tracker for character
// PUT /api/tracker_state/:character_id — upsert tracker for character
```

It is registered in `server/index.js` at line 90:
```js
app.use('/api/tracker_state', requireAuth, requireRole('st'), trackerRouter);
```

**Auth: ST-only.** This stays. Future player-facing writes (e.g. auto-deduct vitae on discipline use) are a separate deferred feature.

### Two fragmented client implementations

| File | Key | Used by | Status |
|---|---|---|---|
| `public/js/game/tracker.js` | `tm_tracker_state` (localStorage, keyed by `_id`) | Suite sheet, ST tracker tab | **Canonical — migrate this one** |
| `public/js/suite/tracker.js` | `tm_tracker_{name}` (localStorage, keyed by name) | Feed roller (`tracker-feed.js`) | Legacy — replace its usage |

The canonical `game/tracker.js` already has a clean public API: `trackerRead`, `trackerReadRaw`, `trackerAdj`, `trackerWriteField`, `initTracker`, `trackerReset`. Only the internal `load()`/`save()` functions need to change.

### Scope

**Persist to MongoDB:** `vitae`, `willpower`, `bashing`, `lethal`, `aggravated`

**Stay in localStorage:** `inf` (influence — physical tokens, peer-exchangeable, no server tracking needed), `conditions` (transient per-session state)

---

## Implementation Plan

### 1. `public/js/game/tracker.js` — internal storage layer

Replace the `load()` and `save()` functions with API calls. Keep the public API surface (`trackerRead`, `trackerAdj`, etc.) unchanged — all callers get persistence for free.

**New internal helpers:**

```js
// Optimistic local cache — updated immediately on write, synced to API in background
const _cache = {};

async function loadFromApi(charId) {
  try {
    const res = await fetch(`/api/tracker_state/${charId}`, { credentials: 'include' });
    if (res.ok) {
      const doc = await res.json();
      _cache[charId] = doc;
      return doc;
    }
  } catch { /* network failure — fall back to cache */ }
  return _cache[charId] || null;
}

function saveToApi(charId, fields) {
  // Optimistic: update cache immediately
  _cache[charId] = { ...(_cache[charId] || {}), ...fields };
  // Background write — don't await
  fetch(`/api/tracker_state/${charId}`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  }).catch(() => { /* silent fail — cache remains */ });
}
```

**Update `ensure()`** to be async-aware. On first access for a character, attempt to load from API; fall back to defaults if not found:

```js
async function ensureLoaded(c) {
  const id = String(c._id);
  if (_cache[id]) return _cache[id];
  const remote = await loadFromApi(id);
  if (remote) {
    _cache[id] = remote;
    return remote;
  }
  // New character — seed defaults
  const d = defaults(c);
  _cache[id] = d;
  saveToApi(id, persistedFields(d));
  return d;
}

function persistedFields(cs) {
  // Only vitae/WP/health go to MongoDB; inf and conditions stay local
  return {
    vitae:      cs.vitae,
    willpower:  cs.willpower,
    bashing:    cs.bashing,
    lethal:     cs.lethal,
    aggravated: cs.aggravated,
  };
}
```

**Update `trackerAdj()`:** after modifying the cache, call `saveToApi(charId, persistedFields(cs))`.

**Update `trackerWriteField()`:** after modifying the cache, call `saveToApi(charId, persistedFields(cs))` only if the field is in the persisted set.

**Keep `inf` and `conditions` in localStorage** using a separate local-only key `tm_tracker_local_{charId}`. Read/write those fields to/from localStorage as before. Merge local fields into the returned state so callers see the full object.

**`initTracker(el)`** — now async. Calls `ensureLoaded()` for all characters on init. Show a loading state while fetching.

**`trackerReset()`** — now async. Resets all characters via PUT to API for persisted fields; resets local fields in localStorage.

### 2. `public/js/suite/tracker-feed.js` — replace legacy tracker calls

`feedApplyVitae()` currently calls `stGetTracker`/`stSetTracker` from `public/js/suite/tracker.js` (legacy).

Replace with canonical tracker calls:

```js
// REMOVE:
import { stGetTracker, stSetTracker, stMaxVitae, toast } from './tracker.js';

// ADD:
import { trackerAdj } from '../game/tracker.js';
import { toast } from './tracker.js';  // toast is still used from here
```

Replace `feedApplyVitae()` body:

```js
async function feedApplyVitae(safeMax) {
  const c = feedGetChar();
  if (!c) return;
  const n = parseInt(document.getElementById('feed-apply-n').textContent) || 0;
  if (n === 0) { toast('0 vitae — nothing to apply'); return; }
  await trackerAdj(String(c._id), 'vitae', n);
  const over = n > safeMax ? ' ⚠ Humanity check required' : '';
  toast(`${displayName(c)}: +${n} Vitae${over}`);
}
```

Remove the slug-based DOM update (`stv-v-${slug}`) — that was for the old ST overview tracker, not the canonical tracker tab.

### 3. Migration from old localStorage keys

On `ensureLoaded()`, if the API returns 404 (no entry) and `tm_tracker_state` (old localStorage key) has an entry for this character, migrate it:

```js
if (!remote) {
  // Attempt migration from old localStorage store
  try {
    const oldStore = JSON.parse(localStorage.getItem('tm_tracker_state') || '{}');
    const old = oldStore[id];
    if (old) {
      const migrated = {
        vitae:      old.vitae      ?? defaults(c).vitae,
        willpower:  old.willpower  ?? defaults(c).willpower,
        bashing:    old.bashing    ?? 0,
        lethal:     old.lethal     ?? 0,
        aggravated: old.aggravated ?? 0,
      };
      saveToApi(id, migrated);
      _cache[id] = { ...migrated, inf: old.inf ?? influenceTotal(c), conditions: old.conditions ?? [] };
      return _cache[id];
    }
  } catch { /* ignore */ }
}
```

After migration, leave the old localStorage entry in place — do not delete it.

---

## Acceptance Criteria

- [ ] Adjusting vitae on the ST tracker tab writes to MongoDB `tracker_state` collection
- [ ] Adjusting vitae on the player's suite sheet also writes to MongoDB (via canonical tracker)
- [ ] Opening the tracker tab on a different device shows the same values as the first device (within one API round-trip)
- [ ] `inf` (influence) and `conditions` remain localStorage-only and do not appear in API calls
- [ ] `trackerReset()` resets MongoDB state for all characters
- [ ] First load for a character with no MongoDB entry seeds defaults correctly
- [ ] Migration: a character with existing `tm_tracker_state` localStorage data is migrated to MongoDB on first access
- [ ] Feed roller `feedApplyVitae()` uses `trackerAdj` from `game/tracker.js` — no longer calls legacy `stSetTracker`
- [ ] No regression in tracker UI — all existing counter UI, health damage columns, condition chips still work
- [ ] Optimistic UI: tap response is immediate; API write is background

---

## Files to Change

| File | Change |
|---|---|
| `public/js/game/tracker.js` | Replace `load()`/`save()` with API-backed cache; keep public API surface unchanged |
| `public/js/suite/tracker-feed.js` | Replace `stGetTracker`/`stSetTracker` with `trackerAdj` from `game/tracker.js` |

---

## Critical Constraints

- **Public API surface of `game/tracker.js` is unchanged** — `trackerRead`, `trackerAdj`, `trackerWriteField`, `initTracker`, `trackerReset` signatures stay the same. All callers (suite sheet, tracker tab) get persistence for free.
- **ST-auth only** — `/api/tracker_state` requires `requireRole('st')`. Do not change the server auth. Player auto-deduct is a separate deferred feature (task #11).
- **Optimistic UI is mandatory** — tracker adjustments must feel instant. Never block the UI on the API response.
- **`toast` is still imported from `suite/tracker.js`** — that file is not deleted. Only the `stGetTracker`/`stSetTracker` usage is removed.
- **Influence stays localStorage** — do not add `inf` to `persistedFields()`.
- **Conditions stay localStorage** — do not add `conditions` to `persistedFields()`.
- **This story does not change the server** — `server/routes/tracker.js` is already correct.

---

## Reference

- SSOT: `specs/reference-data-ssot.md`
- Server route: `server/routes/tracker.js` — GET/PUT `/api/tracker_state/:character_id`
- Auth boundary: `requireRole('st')` — ST only
- Blocks: lst.4 (ST sheet swap) and lst.5 (ST feeding confirm)
