# Story EPA.2: Centralise Tracker State — Add Influence to API, Remove localStorage Bridge

Status: done

## Story

**As an** ST running a live game session,
**I want** vitae, willpower, and influence to persist in MongoDB and stay in sync across all surfaces,
**so that** navigating between characters, tabs, or devices never loses resource state.

## Background

The exhaustive architecture audit (2026-04-19) identified that the game tracker has a split-storage problem:

- **Vitae, WP, bashing, lethal, aggravated** → written to `/api/tracker_state` (MongoDB). ✓
- **Influence** → written to `localStorage['tm_tracker_local_{id}'].inf` ONLY. ✗
- **Conditions** → localStorage only (out of scope for this story — acceptable).

Additionally, when the ST confirms a feeding result in `player.html`, a `vitae_confirmed` key is written to localStorage as a bridge so the game app tracker picks up the new vitae value. This hack exists because the feeding confirm writes to the API but the tracker reads the API value on init — the bridge was added to prevent stale API data overwriting the fresh confirm.

**This story removes the bridge** by making the feeding confirm write influence directly to the API alongside vitae, and by removing the localStorage override read in the tracker.

### Current (broken) flow

```
Feeding confirm (player.html):
  → PUT /api/tracker_state/{id}  { vitae: N }              ← API ✓
  → localStorage['tm_tracker_local_{id}'].vitae_confirmed = N  ← bridge ✗
  → localStorage['tm_tracker_local_{id}'].inf = infAfter       ← localStorage ✗

Game tracker tab init (ensureLoaded):
  → GET /api/tracker_state/{id}                              ← reads API
  → if remote.vitae: use local.vitae_confirmed ?? remote.vitae  ← bridge read ✗
  → inf: local.inf ?? calcTotalInfluence(c)                  ← localStorage ✗
```

### Required (fixed) flow

```
Feeding confirm (player.html):
  → PUT /api/tracker_state/{id}  { vitae: N, influence: infAfter }  ← API ✓

Game tracker tab init (ensureLoaded):
  → GET /api/tracker_state/{id}
  → vitae:     remote.vitae     ?? defaults(c).vitae
  → willpower: remote.willpower ?? defaults(c).willpower
  → influence: remote.influence ?? calcTotalInfluence(c)    ← from API ✓
  → (no localStorage bridge reads)
```

## Acceptance Criteria

1. `tracker_state` documents in MongoDB gain an `influence` field that is written and read by the game tracker.
2. `trackerAdj(charId, 'inf', delta)` in `game/tracker.js` writes influence to the API (not localStorage).
3. `ensureLoaded()` reads `remote.influence` from the API response — no longer reads `local.vitae_confirmed` or `local.inf` as overrides.
4. The feeding confirm handler in `player/feeding-tab.js` writes `{ vitae: N, influence: infAfter }` to `/api/tracker_state/{id}` in a single PUT — no longer writes `vitae_confirmed` or `inf` to localStorage.
5. After feeding confirm, the game app tracker tab shows the correct vitae AND influence without requiring a page reload or tab navigation.
6. Navigating away from a character and returning shows the same values (persisted to API, not local).
7. No regression to vitae/WP/damage tracking — these continue to work as before.
8. The `tm_tracker_local_{id}` localStorage key is no longer written for `inf` or `vitae_confirmed`. Old keys are not actively deleted (harmless stale data).

## Tasks / Subtasks

- [ ] Update `game/tracker.js` — add influence to API persistence (AC: #1, #2, #3)
  - [ ] Add `influence` to `persistedFields(cs)` return object
  - [ ] In `ensureLoaded()`: read `remote.influence ?? calcTotalInfluence(c)` — remove `local.vitae_confirmed` and `local.inf` reads
  - [ ] In `trackerAdj()` for field `'inf'`: call `saveToApi()` instead of `saveLocal()`
  - [ ] Remove the `vitae_confirmed` localStorage read from `ensureLoaded()` — the tracker now trusts the API fully
  - [ ] Keep `saveLocal()` only for `conditions` — that is the only field that remains localStorage
- [ ] Update `player/feeding-tab.js` — write influence to API on confirm (AC: #4, #5)
  - [ ] In the `#feed-confirm-btn` click handler (approx line 874): change the API PUT to include `{ vitae: n, influence: infAfter }`
  - [ ] Remove the localStorage writes for `vitae_confirmed` and `inf` (lines 895–900)
  - [ ] Remove the `tm_st_feed_{id}` localStorage write — replace with in-memory `_stConfirmed` only (already used for same-session display)
- [ ] Verify API accepts influence field (AC: #1)
  - [ ] `PUT /api/tracker_state/:id` uses MongoDB `$set` with no schema validation — it will accept any fields. No server change needed.
  - [ ] `GET /api/tracker_state/:id` returns the full document including any new fields. No server change needed.
- [ ] Manual test (AC: #5, #6, #7, #8)
  - [ ] Confirm a feeding result in player.html
  - [ ] Open game app tracker tab — vitae and influence should match confirmed values
  - [ ] Navigate to another character and back — values should be unchanged
  - [ ] Adjust influence via tracker +/- buttons — confirm value persists after tab switch

## Dev Notes

### Key Files

- `public/js/game/tracker.js` — canonical game tracker. Lines 35–44: `persistedFields()`. Lines 72–120: `ensureLoaded()`. Lines 191–224: `trackerAdj()`.
- `public/js/player/feeding-tab.js` — feeding confirm handler at lines 874–914. The `_stConfirmed` in-memory object at line 53 is fine to keep — it drives the same-session confirmed display badge.

### Critical Code Sections to Change

**`game/tracker.js` — `persistedFields()`** (line 35–44):
```js
// BEFORE
function persistedFields(cs) {
  return {
    vitae: cs.vitae, willpower: cs.willpower,
    bashing: cs.bashing, lethal: cs.lethal, aggravated: cs.aggravated,
  };
}

// AFTER
function persistedFields(cs) {
  return {
    vitae: cs.vitae, willpower: cs.willpower,
    bashing: cs.bashing, lethal: cs.lethal, aggravated: cs.aggravated,
    influence: cs.inf,
  };
}
```

**`game/tracker.js` — `ensureLoaded()`** (line 79–94) — remove bridge reads:
```js
// BEFORE
_cache[id] = {
  vitae:      local.vitae_confirmed ?? remote.vitae      ?? defaults(c).vitae,
  willpower:  remote.willpower  ?? defaults(c).willpower,
  ...
  inf:        local.inf         ?? calcTotalInfluence(c),
  ...
};

// AFTER
_cache[id] = {
  vitae:      remote.vitae      ?? defaults(c).vitae,
  willpower:  remote.willpower  ?? defaults(c).willpower,
  ...
  inf:        remote.influence  ?? calcTotalInfluence(c),
  ...
};
```

**`game/tracker.js` — `trackerAdj()` for inf** (line 209–213):
```js
// BEFORE
} else if (field === 'inf') {
  const maxInf = calcTotalInfluence(c);
  cs.inf = clamp((cs.inf ?? maxInf) + delta, 0, maxInf);
  saveLocal(charId, { inf: cs.inf });   // ← localStorage
  patchCard(charId, c, cs);
  return;
}

// AFTER
} else if (field === 'inf') {
  const maxInf = calcTotalInfluence(c);
  cs.inf = clamp((cs.inf ?? maxInf) + delta, 0, maxInf);
  saveToApi(charId, { influence: cs.inf });   // ← API
  patchCard(charId, c, cs);
  return;
}
```

**`player/feeding-tab.js` — confirm handler** (line 874–914):
```js
// BEFORE
await apiPut('/api/tracker_state/' + charId, { vitae: n });
// Then writes localStorage bridge...

// AFTER
await apiPut('/api/tracker_state/' + charId, { vitae: n, influence: infAfter });
// No localStorage writes
```

### What NOT to Change

- `suite/tracker.js` — legacy module, not used in the live game app. Out of scope.
- `admin/session-tracker.js` — Engine tab tracker, also out of scope (Engine tab is being removed in Epic D).
- `admin/feeding-engine.js` — Engine tab feeding, out of scope.
- `conditions` — remain in localStorage. Acceptable for now.
- `tracker_state` API route (`server/routes/tracker.js`) — no changes needed. The PUT uses `$set` and accepts any fields.

### Stepper Display Rule

Per project memory: resource steppers always show `current / max`. The influence tracker header row already shows this pattern. Do not change the display format.

### References

- [Source: specs/architecture/system-map.md#Section 5] — State management fragmentation
- [Source: specs/architecture/system-map.md#Section 6] — Feeding roll data flow
- [Source: public/js/game/tracker.js#lines 1-10] — Module comment confirming localStorage-only influence
- [Source: public/js/player/feeding-tab.js#lines 874-914] — Feeding confirm handler
- [Source: server/routes/tracker.js] — Tracker API (GET/PUT, no schema validation)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
