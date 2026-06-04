# Story proto.12: DT Processing — Snapshot Sorcery Cross-Reference

Status: review

## Story

As an ST,
I want the Snapshot panel to show which same-territory characters are also casting sorcery this cycle,
so I can see ritual activity alongside territory actions without navigating to the Sorcery phase separately.

## Acceptance Criteria

1. `_buildProcCtxMap` is extended with a second index pass — `sorcByChar` (Map<charName, sorcEntry[]>) — that collects all `source === 'sorcery'` entries by character name.
2. The assembled `ctxObj` gains a `sorcEntries` array: sorcery entries for any character that also appears in `sameTerrEntries`, de-duplicated by entry key.
3. `_renderSnapshotSorcery(entry, ctx)` is implemented in `downtime-views.js`, placed after `_renderSnapshotInvestigate`.
4. The function returns `''` when `ctx.sorcEntries` is empty.
5. Each sorcery entry renders: character name (left) + rite name from `e.riteName || e.label` (right).
6. Resolved entries (`pool_status === 'resolved'` or `'no_effect'`) receive a `proc-snap-sorc-done` CSS modifier (muted rendering).
7. The `/* proto.12: ... */` expansion point comment in `_renderSnapshotPanel` is replaced by `h += _renderSnapshotSorcery(entry, ctx);`.
8. A `/* proto.13: feeding cross-ref — _renderSnapshotFeeding(entry, ctx) */` expansion point comment follows the new call.
9. CSS for `.proc-snap-sorc-section`, `.proc-snap-sorc-entry`, `.proc-snap-sorc-char`, `.proc-snap-sorc-rite`, `.proc-snap-sorc-done` is added to `admin-layout.css` after the proto.11 block.
10. No regression on existing Snapshot sections.
11. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`

## Tasks / Subtasks

- [x] Extend `_buildProcCtxMap` (AC: 1, 2)
  - [x] Add a `sorcByChar` Map pass before the Phase 2 loop: collect all `entry.source === 'sorcery'` entries keyed by `entry.charName`
  - [x] In Phase 2, for each entry's `sameTerrEntries`, gather sorcery entries from `sorcByChar` for each same-terr character, de-duplicate via a `sorcSeen` Set
  - [x] Add `sorcEntries` to the `ctxObj`: `map.set(entry.key, { sameTerrEntries, sorcEntries })`

- [x] Write `_renderSnapshotSorcery(entry, ctx)` (AC: 3, 4, 5, 6)
  - [x] Place immediately after `_renderSnapshotInvestigate` in `downtime-views.js`
  - [x] Return `''` if `ctx.sorcEntries` is empty
  - [x] For each sorcery entry: read `getEntryReview(e)?.pool_status`; render char name + rite name; apply `proc-snap-sorc-done` if resolved/no_effect

- [x] Update `_renderSnapshotPanel` (AC: 7, 8)
  - [x] Replace `/* proto.12: sorcery cross-ref — _renderSnapshotSorcery(entry, ctx) */` with `h += _renderSnapshotSorcery(entry, ctx);`
  - [x] Add `/* proto.13: feeding cross-ref — _renderSnapshotFeeding(entry, ctx) */` on the next line

- [x] Add CSS (AC: 9)
  - [x] Append proto.12 CSS block to `admin-layout.css` after the proto.11 block

- [x] Verify no regression (AC: 10, 11)
  - [x] Parse check: `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Smoke test: section renders with/without sorcery entries; existing sections unaffected

## Dev Notes

### Depends on
- proto.7: `_buildProcCtxMap`, `ctx.sameTerrEntries`
- proto.11: `_renderSnapshotInvestigate` and the proto.12 expansion point

### Why extend `_buildProcCtxMap` (not filter queue at render time)
Sorcery entries have no territory (`_entryTerritories` returns empty Set), so they never appear in `sameTerrEntries`. They can only be surfaced via character-name join. The build phase already iterates the queue; adding a char-keyed sorcery index there is O(n) and keeps renderers pure.

### Key files
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`

### Extended `_buildProcCtxMap` — full replacement

```js
function _buildProcCtxMap(queue) {
  // Phase 1a — territory → entries index
  const terrToEntries = new Map();
  for (const entry of queue) {
    for (const terr of _entryTerritories(entry)) {
      if (!terrToEntries.has(terr)) terrToEntries.set(terr, []);
      terrToEntries.get(terr).push(entry);
    }
  }
  // Phase 1b — char → sorcery entries index (proto.12)
  const sorcByChar = new Map();
  for (const entry of queue) {
    if (entry.source === 'sorcery') {
      if (!sorcByChar.has(entry.charName)) sorcByChar.set(entry.charName, []);
      sorcByChar.get(entry.charName).push(entry);
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
    const sorcSeen = new Set();
    const sorcEntries = [];
    for (const e of sameTerrEntries) {
      for (const sorc of (sorcByChar.get(e.charName) || [])) {
        if (!sorcSeen.has(sorc.key)) {
          sorcSeen.add(sorc.key);
          sorcEntries.push(sorc);
        }
      }
    }
    map.set(entry.key, { sameTerrEntries, sorcEntries });
  }
  return map;
}
```

### `_renderSnapshotSorcery` implementation

```js
function _renderSnapshotSorcery(entry, ctx) {
  if (!ctx.sorcEntries.length) return '';
  let h = '<div class="proc-snap-sorc-section">';
  h += '<div class="proc-snap-subheading">Sorcery This Cycle</div>';
  for (const e of ctx.sorcEntries) {
    const rev = getEntryReview(e);
    const status = rev?.pool_status || 'pending';
    const done = status === 'resolved' || status === 'no_effect';
    h += `<div class="proc-snap-sorc-entry${done ? ' proc-snap-sorc-done' : ''}">` +
      `<span class="proc-snap-sorc-char">${esc(e.charName)}</span>` +
      `<span class="proc-snap-sorc-rite">${esc(e.riteName || e.label)}</span>` +
      `</div>`;
  }
  h += '</div>';
  return h;
}
```

### `_renderSnapshotPanel` update

Replace:
```js
/* proto.12: sorcery cross-ref — _renderSnapshotSorcery(entry, ctx) */
```
With:
```js
h += _renderSnapshotSorcery(entry, ctx);
/* proto.13: feeding cross-ref — _renderSnapshotFeeding(entry, ctx) */
```

### CSS block (append after proto.11 block in admin-layout.css)

```css
/* ── proto.12: Snapshot sorcery cross-reference ── */
.proc-snap-sorc-section { margin-top: 8px; }
.proc-snap-sorc-entry {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
}
.proc-snap-sorc-char {
  font-size: 12px;
  color: var(--txt2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proc-snap-sorc-rite {
  font-size: 11px;
  color: var(--txt2);
  white-space: nowrap;
  flex-shrink: 0;
}
.proc-snap-sorc-done .proc-snap-sorc-char,
.proc-snap-sorc-done .proc-snap-sorc-rite { color: var(--txt3); text-decoration: line-through; }
```

### `ctx.sorcEntries` is safe to default
`_getProcCtx` already returns `{ sameTerrEntries: [] }` for unresolved keys. After proto.12,
the map always has `sorcEntries` too. No renderer change needed for the default — proto.12 renderer
checks `ctx.sorcEntries.length` which is 0 on the safe default (accessing `.length` on
`undefined` would throw, so `_getProcCtx` default must also include `sorcEntries: []`).

### Update `_getProcCtx` default
Change:
```js
function _getProcCtx(key) { return _procCtxMap?.get(key) ?? { sameTerrEntries: [] }; }
```
To:
```js
function _getProcCtx(key) { return _procCtxMap?.get(key) ?? { sameTerrEntries: [], sorcEntries: [] }; }
```

### No changes to admin.js or app.js

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Extended `_buildProcCtxMap` with Phase 1b: `sorcByChar` Map indexes all `source === 'sorcery'` entries by character name. Phase 2 joins sorcery for each same-territory character into `ctx.sorcEntries`, de-duplicated by key. `ctxObj` shape now `{ sameTerrEntries, sorcEntries }`.
- Updated `_getProcCtx` safe default to include `sorcEntries: []` to prevent `.length` throws on unmapped keys.
- `_renderSnapshotSorcery` placed after `_renderSnapshotInvestigate`. Resolved/no_effect rites render with strikethrough + muted text via `proc-snap-sorc-done`.
- Proto.13 expansion point added. Parse check clean. 5 CSS classes added.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
