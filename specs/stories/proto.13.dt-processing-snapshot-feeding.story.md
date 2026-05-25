# Story proto.13: DT Processing — Snapshot Feeding Cross-Reference

Status: review

## Story

As an ST,
I want the Snapshot panel to show which other characters are feeding in the same territory,
so I can see feeding pressure and discipline activity at a glance without navigating to the Feeding phase.

## Acceptance Criteria

1. `_renderSnapshotFeeding(entry, ctx)` is implemented in `downtime-views.js`, placed after `_renderSnapshotSorcery`.
2. The function returns `''` when no feeding entries exist in `ctx.sameTerrEntries`.
3. Feeding entries are identified by `e.source === 'feeding'` on same-territory entries.
4. Each entry renders: character name (left) + feeding discipline (`e.feedDisc`) or method label (`e.feedMethodLabel`) as fallback, or `'method unknown'` if both absent.
5. Entries with `pool_status` other than `'pending'` (i.e., validated, rolled, or resolved) receive a `proc-snap-feed-done` CSS modifier (muted, progress-indicated rendering).
6. The `/* proto.13: ... */` expansion point comment in `_renderSnapshotPanel` is replaced by `h += _renderSnapshotFeeding(entry, ctx);`.
7. A closing comment `/* Snapshot section complete — proto.14+ are write-back stories */` follows.
8. CSS for `.proc-snap-feed-section`, `.proc-snap-feed-entry`, `.proc-snap-feed-char`, `.proc-snap-feed-disc`, `.proc-snap-feed-done` is added to `admin-layout.css` after the proto.12 block.
9. No regression on existing Snapshot sections.
10. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`

## Tasks / Subtasks

- [x] Write `_renderSnapshotFeeding(entry, ctx)` (AC: 1, 2, 3, 4, 5)
  - [x] Place immediately after `_renderSnapshotSorcery` in `downtime-views.js`
  - [x] Filter `ctx.sameTerrEntries` for `e.source === 'feeding'`; return `''` if none
  - [x] For each entry: read `getEntryReview(e)?.pool_status`; render char name + disc/method; apply `proc-snap-feed-done` if status !== `'pending'`

- [x] Update `_renderSnapshotPanel` (AC: 6, 7)
  - [x] Replace `/* proto.13: feeding cross-ref — _renderSnapshotFeeding(entry, ctx) */` with `h += _renderSnapshotFeeding(entry, ctx);`
  - [x] Add `/* Snapshot section complete — proto.14+ are write-back stories */` on the next line

- [x] Add CSS (AC: 8)
  - [x] Append proto.13 CSS block to `admin-layout.css` after the proto.12 block

- [x] Verify no regression (AC: 9, 10)
  - [x] Parse check: `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Smoke test: section renders with/without feeding entries; existing sections unaffected

## Dev Notes

### Depends on
- proto.7: `ctx.sameTerrEntries` (feeding entries have territories via `feedTerrs` — they appear here already)
- proto.12: `_renderSnapshotSorcery` and the proto.13 expansion point

### No `_buildProcCtxMap` extension needed
Feeding entries have `feedTerrs` populated, so `_entryTerritories` returns their territories. They already appear in `ctx.sameTerrEntries`. A simple `.filter(e => e.source === 'feeding')` is sufficient — same approach as proto.9 (block) and proto.10 (hide_protect).

### Key fields on feeding queue entries
- `e.feedDisc` — discipline name used for feeding (e.g. `'Animalism'`, `'Majesty'`); may be empty string
- `e.feedMethodLabel` — human-readable method label (e.g. `'Herd'`, `'Luring'`); may be empty
- `e.noMethod` — `true` if no feeding method declared

### `_renderSnapshotFeeding` implementation

```js
function _renderSnapshotFeeding(entry, ctx) {
  const feedEntries = ctx.sameTerrEntries.filter(e => e.source === 'feeding');
  if (!feedEntries.length) return '';
  let h = '<div class="proc-snap-feed-section">';
  h += '<div class="proc-snap-subheading">Also Feeding</div>';
  for (const e of feedEntries) {
    const rev = getEntryReview(e);
    const status = rev?.pool_status || 'pending';
    const done = status !== 'pending';
    const disc = e.feedDisc || e.feedMethodLabel || 'method unknown';
    h += `<div class="proc-snap-feed-entry${done ? ' proc-snap-feed-done' : ''}">` +
      `<span class="proc-snap-feed-char">${esc(e.charName)}</span>` +
      `<span class="proc-snap-feed-disc">${esc(disc)}</span>` +
      `</div>`;
  }
  h += '</div>';
  return h;
}
```

### `_renderSnapshotPanel` update

Replace:
```js
/* proto.13: feeding cross-ref — _renderSnapshotFeeding(entry, ctx) */
```
With:
```js
h += _renderSnapshotFeeding(entry, ctx);
/* Snapshot section complete — proto.14+ are write-back stories */
```

### CSS block (append after proto.12 block in admin-layout.css)

```css
/* ── proto.13: Snapshot feeding cross-reference ── */
.proc-snap-feed-section { margin-top: 8px; }
.proc-snap-feed-entry {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
}
.proc-snap-feed-char {
  font-size: 12px;
  color: var(--txt2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proc-snap-feed-disc {
  font-size: 11px;
  color: var(--txt2);
  white-space: nowrap;
  flex-shrink: 0;
}
.proc-snap-feed-done .proc-snap-feed-char,
.proc-snap-feed-done .proc-snap-feed-disc { color: var(--txt3); }
```

### This is the final Snapshot cross-ref section
Proto.7–13 complete the Snapshot intelligence panel.
Proto.14+ cover write-back stories (saving processed outcomes to MongoDB).

### No changes to admin.js or app.js

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `_renderSnapshotFeeding(entry, ctx)` placed after `_renderSnapshotSorcery`. Filters `ctx.sameTerrEntries` for `e.source === 'feeding'` — no `_buildProcCtxMap` extension needed since feeding entries have territories via `feedTerrs`. Shows `e.feedDisc || e.feedMethodLabel || 'method unknown'`; entries with any non-pending pool_status render in muted `--txt3`.
- `_renderSnapshotPanel` updated: proto.13 comment replaced by live call; closing comment marks proto.14+ as write-back territory. Parse check clean. 5 CSS classes added.
- Proto.7–13 Snapshot intelligence panel is now complete.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
