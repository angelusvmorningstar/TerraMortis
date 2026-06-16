# Story proto.10: DT Processing — Snapshot Hide/Protect Disciplines

Status: review

## Story

As an ST,
I want the Snapshot panel to show which discipline same-territory characters are using for their Hide/Protect actions,
so I can apply the correct rules (Obfuscate vs Dominate vs other) without opening each card.

## Acceptance Criteria

1. `_renderSnapshotHideProtect(entry, ctx)` is implemented in `downtime-views.js`, placed after `_renderSnapshotBlockers`.
2. The function returns `''` when no `hide_protect` entries exist in `ctx.sameTerrEntries`.
3. Hide/Protect entries are identified by `e.actionType === 'hide_protect'` on same-territory entries.
4. For each entry, the discipline is extracted from `getEntryReview(e)?.pool_validated` using `KNOWN_DISCIPLINES.find(d => poolValidated.includes(d))` — the same pattern used at line ~3607 for the feeding discipline profile.
5. When a discipline is found, it is rendered as the right-hand column in gold (`--gold2`).
6. When no discipline is found (pool not yet validated), render `'unconfirmed'` in muted colour (`--txt3`).
7. The `/* proto.10: ... */` expansion point comment in `_renderSnapshotPanel` is replaced by `h += _renderSnapshotHideProtect(entry, ctx);`.
8. A `/* proto.11: investigate cross-ref — _renderSnapshotInvestigate(entry, ctx) */` expansion point comment follows the new call.
9. CSS for `.proc-snap-hp-section`, `.proc-snap-hp-entry`, `.proc-snap-hp-char`, `.proc-snap-hp-disc`, `.proc-snap-hp-unknown` is added to `admin-layout.css` after the proto.9 block.
10. No regression on existing Snapshot sections.
11. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`

## Tasks / Subtasks

- [x] Write `_renderSnapshotHideProtect(entry, ctx)` (AC: 1, 2, 3, 4, 5, 6)
  - [x] Place immediately after `_renderSnapshotBlockers` in `downtime-views.js`
  - [x] Filter `ctx.sameTerrEntries` for `actionType === 'hide_protect'`; return `''` if none
  - [x] For each entry: call `getEntryReview(e)`, extract discipline via `KNOWN_DISCIPLINES.find(d => poolValidated.includes(d))`
  - [x] Render: char name (left) + discipline or `'unconfirmed'` (right)

- [x] Update `_renderSnapshotPanel` (AC: 7, 8)
  - [x] Replace `/* proto.10: hide_protect disc section — _renderSnapshotHideProtect(entry, ctx) */` with `h += _renderSnapshotHideProtect(entry, ctx);`
  - [x] Add `/* proto.11: investigate cross-ref — _renderSnapshotInvestigate(entry, ctx) */` on the next line

- [x] Add CSS (AC: 9)
  - [x] Append proto.10 CSS block to `admin-layout.css` after the proto.9 block

- [x] Verify no regression (AC: 10, 11)
  - [x] Parse check: `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Smoke test: section renders correctly with validated/unvalidated hide_protect entries

## Dev Notes

### Depends on
- proto.7: `ctx.sameTerrEntries`
- proto.9: `_renderSnapshotBlockers` and the proto.10 expansion point in `_renderSnapshotPanel`

### Key files
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`

### Discipline extraction pattern
Already used at line ~3607 for feeding discipline profile:
```js
KNOWN_DISCIPLINES.filter(d => rev.pool_validated.includes(d))
```
Proto.10 uses `.find()` (first match only) since hide_protect typically uses one discipline:
```js
const disc = KNOWN_DISCIPLINES.find(d => poolValidated.includes(d)) || null;
```
`KNOWN_DISCIPLINES` is already in scope at module level (line ~223).

### `getEntryReview(e)` is already in scope
Same function used throughout the file. Returns the review sub-object for an entry or `null`.

### `_renderSnapshotHideProtect` implementation

```js
function _renderSnapshotHideProtect(entry, ctx) {
  const hpEntries = ctx.sameTerrEntries.filter(e => e.actionType === 'hide_protect');
  if (!hpEntries.length) return '';
  let h = '<div class="proc-snap-hp-section">';
  h += '<div class="proc-snap-subheading">Hide / Protect</div>';
  for (const e of hpEntries) {
    const rev = getEntryReview(e);
    const poolValidated = rev?.pool_validated || '';
    const disc = KNOWN_DISCIPLINES.find(d => poolValidated.includes(d)) || null;
    h += `<div class="proc-snap-hp-entry">` +
      `<span class="proc-snap-hp-char">${esc(e.charName)}</span>` +
      `<span class="proc-snap-hp-disc${disc ? '' : ' proc-snap-hp-unknown'}">${esc(disc || 'unconfirmed')}</span>` +
      `</div>`;
  }
  h += '</div>';
  return h;
}
```

### `_renderSnapshotPanel` update

Replace:
```js
/* proto.10: hide_protect disc section — _renderSnapshotHideProtect(entry, ctx) */
```
With:
```js
h += _renderSnapshotHideProtect(entry, ctx);
/* proto.11: investigate cross-ref — _renderSnapshotInvestigate(entry, ctx) */
```

### CSS block (append after proto.9 block in admin-layout.css)

```css
/* ── proto.10: Snapshot hide/protect disciplines ── */
.proc-snap-hp-section { margin-top: 8px; }
.proc-snap-hp-entry {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
}
.proc-snap-hp-char {
  font-size: 12px;
  color: var(--txt2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proc-snap-hp-disc {
  font-size: 11px;
  color: var(--gold2);
  white-space: nowrap;
  flex-shrink: 0;
}
.proc-snap-hp-unknown { color: var(--txt3); font-style: italic; }
```

### D10 gap resolved (partially)
TASK-SA flagged: discipline selection only in `pool_validated` text, no structured field.
Proto.10 resolves the display gap via text extraction using `KNOWN_DISCIPLINES`.
The structured `hide_protect_disc` field on `projects_resolved[i]` remains a future write-back story
if structured querying is needed later. For the Snapshot panel, text extraction is sufficient.

### No changes to admin.js or app.js

### References
- `KNOWN_DISCIPLINES`: line ~223 in `downtime-views.js`
- `getEntryReview`: already in scope throughout the file
- proto.10 expansion point in `_renderSnapshotPanel`: follows `_renderSnapshotBlockers` call
- CSS insert point: after `.proc-snap-block-level` block in `admin-layout.css`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `_renderSnapshotHideProtect(entry, ctx)` placed after `_renderSnapshotBlockers`. Filters sameTerrEntries for `actionType === 'hide_protect'`, calls `getEntryReview(e)` on each, and extracts discipline via `KNOWN_DISCIPLINES.find(d => poolValidated.includes(d))` — same pattern used at line ~3607 for the feeding discipline profile.
- Renders discipline in gold (`--gold2`) when found; falls back to italic "unconfirmed" in `--txt3` when pool not yet validated. Resolves the D10 display gap without requiring the new `hide_protect_disc` write-back field.
- Proto.11 expansion point added in `_renderSnapshotPanel`. Parse check clean. 5 CSS classes added.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
