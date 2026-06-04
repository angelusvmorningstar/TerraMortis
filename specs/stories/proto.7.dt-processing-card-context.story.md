# Story proto.7: DT Processing — Per-Card Cross-Action Context

Status: review

## Story

As an ST,
I want the processing panel to have pre-computed cross-action data available per card,
so that proto.8–proto.13 can render territory presence, blockers, and conflict flags without scanning the full queue on every card render.

## Acceptance Criteria

1. A module-level `_procCtxMap` (`Map<key, ctxObj>`) is built once per `renderProcessingMode` call, immediately after `_procQueueMap` is populated.
2. `_buildProcCtxMap(queue)` performs a two-phase O(n) pass: first builds a `_terrToEntries` index (Map<terrName, Entry[]>), then assembles `ctxObj.sameTerrEntries` for each entry by joining across all of that entry's territories and filtering out self.
3. `_entryTerritories(entry)` (already exists) is used to determine territory membership — do not re-implement territory extraction.
4. A `_getProcCtx(key)` getter returns the `ctxObj` for a key, or a safe empty default `{ sameTerrEntries: [] }` if the key is not in the map.
5. `_renderSnapshotPanel(entry)` is updated to call `_getProcCtx(entry.key)` and pass the result to future section renderers; proto.8–proto.13 will consume `ctx` but it is not used in the panel body yet (the existing sibling and discipline sections are unchanged).
6. No visible change to the Snapshot panel UI — this story is infrastructure only.
7. `_procCtxMap` is reset to `null` when `renderProcessingMode` starts a new build (same lifecycle as `_procQueueMap`).

## Tasks / Subtasks

- [x] Add `_procCtxMap` module-level variable and `_buildProcCtxMap(queue)` (AC: 1, 2, 3, 7)
  - [x] Add `let _procCtxMap = null;` alongside `_procQueueMap` at line ~75
  - [x] Write `_buildProcCtxMap(queue)` — Phase 1: build `_terrToEntries` Map using `_entryTerritories(entry)`; Phase 2: for each entry, collect all entries from `_terrToEntries` across its territories, de-duplicate, filter out self (by `e.key !== entry.key`), assign to `ctxObj.sameTerrEntries`
  - [x] Call `_buildProcCtxMap(queue)` in `renderProcessingMode` right after `_procQueueMap = new Map(...)` at line ~4536

- [x] Add `_getProcCtx(key)` getter (AC: 4)
  - [x] Write `function _getProcCtx(key) { return _procCtxMap?.get(key) ?? { sameTerrEntries: [] }; }` alongside `_getQueueEntry`

- [x] Update `_renderSnapshotPanel` to thread `ctx` (AC: 5, 6)
  - [x] In `_renderSnapshotPanel(entry)`, call `const ctx = _getProcCtx(entry.key);`
  - [x] Leave a comment `/* proto.8: territory presence section — _renderSnapshotTerrPresence(entry, ctx) */` after `_renderSnapshotDisciplines(entry)` to mark the expansion point

- [x] Verify no regression on Snapshot panel output (AC: 6)
  - [x] Parse-check: `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Visual smoke test: Snapshot panels render identically to before (infrastructure only, no UI change)

## Dev Notes

### Depends on
- proto.1–proto.6: existing Snapshot panel, `_procQueueMap`, `_entryTerritories`
- TASK-SA: schema audit complete — confirmed go for proto.7+

### Key file
- `public/js/admin/downtime-views.js` only
- No CSS changes

### Step 1 is mandatory
Read `_entryTerritories` (search `downtime-views.js` for `function _entryTerritories`) before writing any code — do not re-implement territory extraction.

### Two-phase build strategy

```js
function _buildProcCtxMap(queue) {
  // Phase 1 — build territory → entries index
  const terrToEntries = new Map();
  for (const entry of queue) {
    for (const terr of _entryTerritories(entry)) {
      if (!terrToEntries.has(terr)) terrToEntries.set(terr, []);
      terrToEntries.get(terr).push(entry);
    }
  }
  // Phase 2 — assemble per-card context
  const map = new Map();
  for (const entry of queue) {
    const seen = new Set();
    const sameTerrEntries = [];
    for (const terr of _entryTerritories(entry)) {
      for (const e of (terrToEntries.get(terr) || [])) {
        if (e.key !== entry.key && !seen.has(e.key)) {
          seen.add(e.key);
          sameTerrEntries.push(e);
        }
      }
    }
    map.set(entry.key, { sameTerrEntries });
  }
  return map;
}
```

### `_entryTerritories` return type
`_entryTerritories(entry)` returns a `Set<string>`. Iterate with `for...of`.

### Placement of `_buildProcCtxMap` call
Line ~4536 in `renderProcessingMode`:
```js
_procQueueMap = new Map(queue.map(e => [e.key, e]));
_procCtxMap   = _buildProcCtxMap(queue);   // ← new line
```

### `_procCtxMap` reset
It is set to `null` at declaration (module level). It is re-assigned on every `renderProcessingMode` call — no explicit null-reset needed since the function always rebuilds.

### Expansion point comment
Place this after the `_renderSnapshotDisciplines(entry)` call:
```js
h += _renderSnapshotDisciplines(entry);
/* proto.8: territory presence section — _renderSnapshotTerrPresence(entry, ctx) */
```

### Context object shape (proto.7 only)
```js
{ sameTerrEntries: Entry[] }
```
Proto.8–proto.13 will each extend this shape with additional arrays as they implement their sections. Do NOT pre-define fields for future stories — only what proto.7 uses.

### No changes to admin.js or app.js

### References
- `_entryTerritories`: search `downtime-views.js` for `function _entryTerritories`
- `_procQueueMap` declaration: line ~75
- `_getQueueEntry`: line ~4361 (companion getter — place `_getProcCtx` alongside it)
- `_renderSnapshotPanel`: line ~8309
- `renderProcessingMode` → `_procQueueMap` assignment: line ~4536

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `_buildProcCtxMap(queue)` placed alongside `_getQueueEntry` and `_getProcCtx`. Two-phase O(n) build: Phase 1 indexes entries by territory via `_entryTerritories`; Phase 2 assembles `sameTerrEntries` per card using a `seen` Set to prevent duplicates.
- `_procCtxMap` declared at line 76 alongside `_procQueueMap`. Reset/rebuilt on every `renderProcessingMode` call.
- `_renderSnapshotPanel` now calls `_getProcCtx(entry.key)` at the top and has the proto.8 expansion point comment. No visible UI change.
- Parse verified clean: `node --input-type=module --check`.

### File List

- `public/js/admin/downtime-views.js`
