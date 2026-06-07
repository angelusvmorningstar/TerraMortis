# Story proto.8: DT Processing — Snapshot Territory Presence

Status: review

## Story

As an ST,
I want the Snapshot panel to show which other characters are active in the same territory as the current card,
so I can see territory overlap at a glance without scanning the full queue.

## Acceptance Criteria

1. `_renderSnapshotTerrPresence(entry, ctx)` is implemented in `downtime-views.js`, placed after `_renderSnapshotDisciplines`.
2. The function returns `''` when `ctx.sameTerrEntries` is empty — no empty-state noise.
3. Same-territory entries are grouped by territory name; each territory sub-label is rendered only when at least one entry shares it with the current card.
4. Each entry renders as: character name (left) + action label from `entry.label` (right).
5. `hide_protect` action type entries receive CSS modifier class `proc-snap-terr-hp` for visual distinction (gold action label).
6. The `/* proto.8: ... */` expansion point comment in `_renderSnapshotPanel` is replaced by `h += _renderSnapshotTerrPresence(entry, ctx);`.
7. A `/* proto.9: blocker/conflict section — _renderSnapshotBlockers(entry, ctx) */` expansion point comment follows the new call.
8. CSS for `.proc-snap-terr-section`, `.proc-snap-terr-name`, `.proc-snap-terr-entry`, `.proc-snap-terr-char`, `.proc-snap-terr-action`, `.proc-snap-terr-hp` is added to `admin-layout.css` after the proto.6 block.
9. No regression on existing Snapshot panel sections (siblings, disciplines).
10. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`

## Tasks / Subtasks

- [x] Write `_renderSnapshotTerrPresence(entry, ctx)` (AC: 1, 2, 3, 4, 5)
  - [x] Place the function in `downtime-views.js` immediately after `_renderSnapshotDisciplines`
  - [x] Return `''` if `ctx.sameTerrEntries.length === 0`
  - [x] Build `byTerr` map: for each of this entry's territories, collect sameTerrEntries that share that territory via `_entryTerritories(e)`
  - [x] Render grouped: territory sub-label, then each entry as char name + action label; add `proc-snap-terr-hp` class for `actionType === 'hide_protect'`

- [x] Update `_renderSnapshotPanel` (AC: 6, 7)
  - [x] Replace `/* proto.8: territory presence section — _renderSnapshotTerrPresence(entry, ctx) */` with `h += _renderSnapshotTerrPresence(entry, ctx);`
  - [x] Add `/* proto.9: blocker/conflict section — _renderSnapshotBlockers(entry, ctx) */` on the next line

- [x] Add CSS (AC: 8)
  - [x] Append proto.8 CSS block to `admin-layout.css` immediately after `.proc-snap-disc-dots` block

- [x] Verify no regression (AC: 9, 10)
  - [x] Parse check: `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Smoke test: Snapshot panels render correctly with and without territory-sharing entries

## Dev Notes

### Depends on
- proto.7: `_procCtxMap`, `_buildProcCtxMap`, `_getProcCtx` — `ctx.sameTerrEntries` is already populated

### Key files
- `public/js/admin/downtime-views.js` only (plus CSS)
- `public/css/admin-layout.css`

### `_renderSnapshotTerrPresence` implementation

```js
function _renderSnapshotTerrPresence(entry, ctx) {
  if (!ctx.sameTerrEntries.length) return '';
  const myTerrs = _entryTerritories(entry);
  const byTerr = new Map();
  for (const terr of myTerrs) byTerr.set(terr, []);
  for (const e of ctx.sameTerrEntries) {
    for (const terr of _entryTerritories(e)) {
      if (byTerr.has(terr)) byTerr.get(terr).push(e);
    }
  }
  const populated = [...byTerr.entries()].filter(([, arr]) => arr.length > 0);
  if (!populated.length) return '';
  let h = '<div class="proc-snap-terr-section">';
  for (const [terrName, entries] of populated) {
    h += `<div class="proc-snap-terr-name">${esc(terrName)}</div>`;
    for (const e of entries) {
      const hp = e.actionType === 'hide_protect';
      h += `<div class="proc-snap-terr-entry${hp ? ' proc-snap-terr-hp' : ''}">` +
        `<span class="proc-snap-terr-char">${esc(e.charName)}</span>` +
        `<span class="proc-snap-terr-action">${esc(e.label)}</span>` +
        `</div>`;
    }
  }
  h += '</div>';
  return h;
}
```

### `_renderSnapshotPanel` update

Replace the `/* proto.8 */` comment with:
```js
h += _renderSnapshotTerrPresence(entry, ctx);
/* proto.9: blocker/conflict section — _renderSnapshotBlockers(entry, ctx) */
```

### CSS block (append after `.proc-snap-disc-dots` in admin-layout.css)

```css
/* ── proto.8: Snapshot territory presence ── */
.proc-snap-terr-section { margin-top: 8px; }
.proc-snap-terr-name {
  font-family: var(--fl);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--txt3);
  margin: 4px 0 2px;
}
.proc-snap-terr-entry {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
}
.proc-snap-terr-char {
  font-size: 12px;
  color: var(--txt2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proc-snap-terr-action {
  font-size: 11px;
  color: var(--txt3);
  white-space: nowrap;
  flex-shrink: 0;
}
.proc-snap-terr-hp .proc-snap-terr-action { color: var(--gold2); }
```

### `entry.label` is the right field
Project entries: `ACTION_TYPE_LABELS[effectiveActionType]` (e.g., "Patrol / Scout", "Investigate", "Hide / Protect")
Merit entries: `"[merit_type]: [ACTION_TYPE_LABELS[actionType]]"` (e.g., "Allies: Investigate")
Both are already human-readable — no further translation needed.

### D10 gap note
TASK-SA confirmed Obfuscate discipline selection is only in `pool_validated` text, not a structured field.
Proto.8 marks all `hide_protect` entries with `proc-snap-terr-hp` for ST awareness.
Proto.10 will add `hide_protect_disc` for structured discipline filtering.

### No changes to admin.js or app.js

### References
- `_entryTerritories`: line ~4402 in `downtime-views.js`
- `_renderSnapshotDisciplines`: ends at line ~8341
- `_renderSnapshotPanel` proto.8 expansion point: line ~8350
- CSS insert point: after `.proc-snap-disc-dots` block, line ~7937 in `admin-layout.css`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `_renderSnapshotTerrPresence(entry, ctx)` placed after `_renderSnapshotDisciplines` at line ~8343. Two-pass approach: first builds `byTerr` map keyed on this entry's territories; second iterates `sameTerrEntries` to populate each territory bucket. Returns `''` for empty entries or no overlap (two guard clauses).
- `hide_protect` entries get `proc-snap-terr-hp` modifier; CSS sets their action label to `--gold2` so STs immediately spot defensive actions in the territory.
- `_renderSnapshotPanel` updated: `/* proto.8 */` comment replaced by live call; `/* proto.9 */` expansion point added.
- Parse check clean. 6 CSS classes added to `admin-layout.css` after proto.6 block.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
