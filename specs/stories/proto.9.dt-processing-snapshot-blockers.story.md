# Story proto.9: DT Processing — Snapshot Block Conflicts

Status: review

## Story

As an ST,
I want the Snapshot panel to flag block actions that are active in the same territory as the current card,
so I can spot potential merit-action conflicts without hunting through the queue manually.

## Acceptance Criteria

1. `_renderSnapshotBlockers(entry, ctx)` is implemented in `downtime-views.js`, placed after `_renderSnapshotTerrPresence`.
2. The function returns `''` when no block entries exist in `ctx.sameTerrEntries` — no empty-state noise.
3. Block entries are identified by `e.actionType === 'block'` on same-territory entries.
4. Each block entry renders as: character name (left) + dot level indicator (right), formatted as `'●'.repeat(e.meritDots) + ' or lower'` (or `'? or lower'` if `meritDots` is falsy).
5. The block level indicator uses the crimson (`--crim`) colour token to signal a conflict.
6. The `/* proto.9: ... */` expansion point comment in `_renderSnapshotPanel` is replaced by `h += _renderSnapshotBlockers(entry, ctx);`.
7. A `/* proto.10: hide_protect disc section — _renderSnapshotHideProtect(entry, ctx) */` expansion point comment follows the new call.
8. CSS for `.proc-snap-block-section`, `.proc-snap-block-entry`, `.proc-snap-block-char`, `.proc-snap-block-level` is added to `admin-layout.css` after the proto.8 block.
9. No regression on existing Snapshot panel sections (siblings, disciplines, territory presence).
10. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`

## Tasks / Subtasks

- [x] Write `_renderSnapshotBlockers(entry, ctx)` (AC: 1, 2, 3, 4, 5)
  - [x] Place the function immediately after `_renderSnapshotTerrPresence` in `downtime-views.js`
  - [x] Filter `ctx.sameTerrEntries` for `e.actionType === 'block'`; return `''` if none
  - [x] Render each block entry: char name + dot level (`'●'.repeat(e.meritDots) + ' or lower'` or `'? or lower'` fallback)

- [x] Update `_renderSnapshotPanel` (AC: 6, 7)
  - [x] Replace `/* proto.9: blocker/conflict section — _renderSnapshotBlockers(entry, ctx) */` with `h += _renderSnapshotBlockers(entry, ctx);`
  - [x] Add `/* proto.10: hide_protect disc section — _renderSnapshotHideProtect(entry, ctx) */` on the next line

- [x] Add CSS (AC: 8)
  - [x] Append proto.9 CSS block to `admin-layout.css` immediately after the proto.8 block

- [x] Verify no regression (AC: 9, 10)
  - [x] Parse check: `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Smoke test: Snapshot panels render correctly with and without block entries

## Dev Notes

### Depends on
- proto.7: `ctx.sameTerrEntries` already populated
- proto.8: `_renderSnapshotTerrPresence` and `.proc-snap-terr-*` CSS already in place

### Key files
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`

### Data available on block queue entries
- `entry.actionType === 'block'` — the discriminator
- `entry.meritDots` — dot rating of the blocker's merit (may be 0/falsy if unresolvable)
- `entry.charName` — display name
- `entry.meritLabel` — label of the merit being used to block (e.g. 'Allies')

### `_renderSnapshotBlockers` implementation

```js
function _renderSnapshotBlockers(entry, ctx) {
  const blockEntries = ctx.sameTerrEntries.filter(e => e.actionType === 'block');
  if (!blockEntries.length) return '';
  let h = '<div class="proc-snap-block-section">';
  h += '<div class="proc-snap-subheading">Block in Territory</div>';
  for (const e of blockEntries) {
    const level = e.meritDots ? `${'●'.repeat(e.meritDots)} or lower` : '? or lower';
    h += `<div class="proc-snap-block-entry">` +
      `<span class="proc-snap-block-char">${esc(e.charName)}</span>` +
      `<span class="proc-snap-block-level">${esc(level)}</span>` +
      `</div>`;
  }
  h += '</div>';
  return h;
}
```

### `_renderSnapshotPanel` update

Replace:
```js
/* proto.9: blocker/conflict section — _renderSnapshotBlockers(entry, ctx) */
```
With:
```js
h += _renderSnapshotBlockers(entry, ctx);
/* proto.10: hide_protect disc section — _renderSnapshotHideProtect(entry, ctx) */
```

### CSS block (append after proto.8 block in admin-layout.css)

```css
/* ── proto.9: Snapshot block conflicts ── */
.proc-snap-block-section { margin-top: 8px; }
.proc-snap-block-entry {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
}
.proc-snap-block-char {
  font-size: 12px;
  color: var(--txt2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proc-snap-block-level {
  font-size: 11px;
  color: var(--crim);
  white-space: nowrap;
  flex-shrink: 0;
}
```

### Why no `_buildProcCtxMap` extension
`ctx.sameTerrEntries` is already the right set. Filtering for `actionType === 'block'` is O(n) over a small slice — no reason to pre-compute a separate array in the map build phase.

### `--crim` for block level
`--crim: #8B0000` (CLAUDE.md) is the project's conflict/damage token. Block-level indicator in crimson immediately signals a threat to the ST.

### No changes to admin.js or app.js

### References
- `_renderSnapshotTerrPresence`: line ~8343 (proto.8, placed before `_renderSnapshotPanel`)
- proto.9 expansion point in `_renderSnapshotPanel`: follows `_renderSnapshotTerrPresence` call
- CSS insert point: after `.proc-snap-terr-hp` block in `admin-layout.css`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `_renderSnapshotBlockers(entry, ctx)` placed after `_renderSnapshotTerrPresence`. Filters `ctx.sameTerrEntries` for `actionType === 'block'` directly — no `_buildProcCtxMap` extension needed (O(n) over an already-small slice). Dot level uses `'●'.repeat(e.meritDots)` with `'? or lower'` fallback for zero/falsy ratings.
- Block level indicator rendered in `--crim` to immediately flag a conflict threat to the ST.
- `_renderSnapshotPanel` updated: proto.9 comment replaced by live call; proto.10 expansion point added.
- Parse check clean. 4 CSS classes added to `admin-layout.css` after proto.8 block.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
