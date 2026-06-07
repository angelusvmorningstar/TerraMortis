# Story proto.11: DT Processing — Snapshot Investigate Cross-Reference

Status: review

## Story

As an ST,
I want the Snapshot panel to show which characters are running Investigate actions in the same territory,
along with what secrecy level they're targeting and whether they have a lead,
so I can assess investigation pressure without opening each card.

## Acceptance Criteria

1. `_renderSnapshotInvestigate(entry, ctx)` is implemented in `downtime-views.js`, placed after `_renderSnapshotHideProtect`.
2. The function returns `''` when no `investigate` entries exist in `ctx.sameTerrEntries`.
3. Investigate entries are identified by `e.actionType === 'investigate'` on same-territory entries.
4. For each entry, `getEntryReview(e)` is called to read `inv_secrecy` (type label) and `inv_has_lead` (boolean/null).
5. The right-hand column shows: the secrecy label (`inv_secrecy`) if set, or `'pending'` if not; followed by `' ✓'` when `inv_has_lead === true` or `' ✗'` when `inv_has_lead === false`.
6. When `inv_secrecy` is null/empty the right column renders in muted style (`proc-snap-inv-pending`).
7. The `/* proto.11: ... */` expansion point comment in `_renderSnapshotPanel` is replaced by `h += _renderSnapshotInvestigate(entry, ctx);`.
8. A `/* proto.12: sorcery cross-ref — _renderSnapshotSorcery(entry, ctx) */` expansion point comment follows the new call.
9. CSS for `.proc-snap-inv-section`, `.proc-snap-inv-entry`, `.proc-snap-inv-char`, `.proc-snap-inv-detail`, `.proc-snap-inv-pending` is added to `admin-layout.css` after the proto.10 block.
10. No regression on existing Snapshot sections.
11. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`

## Tasks / Subtasks

- [x] Write `_renderSnapshotInvestigate(entry, ctx)` (AC: 1, 2, 3, 4, 5, 6)
  - [x] Place immediately after `_renderSnapshotHideProtect` in `downtime-views.js`
  - [x] Filter `ctx.sameTerrEntries` for `actionType === 'investigate'`; return `''` if none
  - [x] For each entry: call `getEntryReview(e)`, read `inv_secrecy` and `inv_has_lead`
  - [x] Build detail string: `inv_secrecy || 'pending'`, append `' ✓'`/`' ✗'` based on `inv_has_lead`
  - [x] Apply `proc-snap-inv-pending` class when `inv_secrecy` is falsy

- [x] Update `_renderSnapshotPanel` (AC: 7, 8)
  - [x] Replace `/* proto.11: investigate cross-ref — _renderSnapshotInvestigate(entry, ctx) */` with `h += _renderSnapshotInvestigate(entry, ctx);`
  - [x] Add `/* proto.12: sorcery cross-ref — _renderSnapshotSorcery(entry, ctx) */` on the next line

- [x] Add CSS (AC: 9)
  - [x] Append proto.11 CSS block to `admin-layout.css` after the proto.10 block

- [x] Verify no regression (AC: 10, 11)
  - [x] Parse check: `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Smoke test: section renders correctly with/without investigate entries

## Dev Notes

### Depends on
- proto.7: `ctx.sameTerrEntries`
- proto.10: `_renderSnapshotHideProtect` and the proto.11 expansion point in `_renderSnapshotPanel`

### Key files
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`

### `inv_secrecy` values
From `INVESTIGATION_MATRIX` (downtime-constants.js): `'Public'`, `'Internal'`, `'Confidential'`, `'Restricted'`. Stored as the exact label string on `st_review`. Null/empty when the ST hasn't set the secrecy level yet.

### `inv_has_lead` values
Saved via `saveEntryReview(entry, { inv_has_lead: bool })`. Can be `true`, `false`, or `null` (not yet set).

### `_renderSnapshotInvestigate` implementation

```js
function _renderSnapshotInvestigate(entry, ctx) {
  const invEntries = ctx.sameTerrEntries.filter(e => e.actionType === 'investigate');
  if (!invEntries.length) return '';
  let h = '<div class="proc-snap-inv-section">';
  h += '<div class="proc-snap-subheading">Investigating</div>';
  for (const e of invEntries) {
    const rev = getEntryReview(e);
    const secrecy = rev?.inv_secrecy || null;
    const hasLead = rev?.inv_has_lead;
    let detail = secrecy || 'pending';
    if (secrecy && hasLead === true)  detail += ' ✓';
    if (secrecy && hasLead === false) detail += ' ✗';
    h += `<div class="proc-snap-inv-entry">` +
      `<span class="proc-snap-inv-char">${esc(e.charName)}</span>` +
      `<span class="proc-snap-inv-detail${secrecy ? '' : ' proc-snap-inv-pending'}">${esc(detail)}</span>` +
      `</div>`;
  }
  h += '</div>';
  return h;
}
```

`✓` = ✓, `✗` = ✗ — avoids smart-quote/literal emoji risks in the JS file.

### `_renderSnapshotPanel` update

Replace:
```js
/* proto.11: investigate cross-ref — _renderSnapshotInvestigate(entry, ctx) */
```
With:
```js
h += _renderSnapshotInvestigate(entry, ctx);
/* proto.12: sorcery cross-ref — _renderSnapshotSorcery(entry, ctx) */
```

### CSS block (append after proto.10 block in admin-layout.css)

```css
/* ── proto.11: Snapshot investigate cross-reference ── */
.proc-snap-inv-section { margin-top: 8px; }
.proc-snap-inv-entry {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 6px;
  padding: 2px 6px;
  border-radius: 3px;
}
.proc-snap-inv-char {
  font-size: 12px;
  color: var(--txt2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.proc-snap-inv-detail {
  font-size: 11px;
  color: var(--txt2);
  white-space: nowrap;
  flex-shrink: 0;
}
.proc-snap-inv-pending { color: var(--txt3); font-style: italic; }
```

### No changes to admin.js or app.js

### References
- `_renderSnapshotHideProtect`: ends at line ~8405 (proto.10)
- proto.11 expansion point in `_renderSnapshotPanel`: follows `_renderSnapshotHideProtect` call
- CSS insert point: after `.proc-snap-hp-unknown` block in `admin-layout.css`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `_renderSnapshotInvestigate(entry, ctx)` placed after `_renderSnapshotHideProtect`. Filters sameTerrEntries for `actionType === 'investigate'`, calls `getEntryReview(e)` on each to read `inv_secrecy` (secrecy level) and `inv_has_lead` (boolean/null). Detail string shows secrecy label or 'pending', appended with ✓/✗ when lead status is set. Pending entries render muted italic.
- Proto.12 sorcery expansion point added in `_renderSnapshotPanel`. Parse check clean. 5 CSS classes added.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
