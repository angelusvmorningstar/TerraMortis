# Story proto.15: DT Processing — hide_protect_disc Consume in Snapshot Renderer

Status: review

## Story

As an ST,
when I view the Snapshot panel's Hide / Protect section,
I want it to show the authoritative structured discipline field (`hide_protect_disc`) when available,
so the display is derived from the structured field proto.14 writes rather than text extraction.

## Acceptance Criteria

1. `_renderSnapshotHideProtect` reads `rev?.hide_protect_disc` as its primary discipline source.
2. Text extraction (`KNOWN_DISCIPLINES.find(d => poolValidated.includes(d))`) remains as a fallback for legacy entries that were validated before proto.14 (where `hide_protect_disc` is absent/undefined).
3. When `hide_protect_disc` is an empty string (the pool was validated but no known discipline was found), the fallback text extraction is still attempted.
4. Displayed value and CSS modifier are unchanged from proto.10 — gold `proc-snap-hp-disc` when disc found; italic `proc-snap-hp-unknown` with text `'unconfirmed'` when absent.
5. Parse check clean: `node --input-type=module --check < public/js/admin/downtime-views.js`
6. No regression on other Snapshot sections.

## Tasks / Subtasks

- [x] Update `_renderSnapshotHideProtect` (AC: 1, 2, 3, 4)
  - [x] On line 8422 (approx), change `const disc = KNOWN_DISCIPLINES.find(d => poolValidated.includes(d)) || null;`
    to `const disc = rev?.hide_protect_disc || KNOWN_DISCIPLINES.find(d => poolValidated.includes(d)) || null;`
  - [x] No other change in the function

- [x] Verify parse check and no regression (AC: 5, 6)
  - [x] `node --input-type=module --check < public/js/admin/downtime-views.js` — clean
  - [x] Confirm all other Snapshot renderer functions unaffected

## Dev Notes

### Depends on

- proto.10: `_renderSnapshotHideProtect` function (current implementation uses text extraction only).
- proto.14: `hide_protect_disc` is now written to `merit_actions_resolved[i]` when pool_validated is saved for hide_protect actions.

### Implementation — exact diff

Current (line 8420-8422):
```js
const rev = getEntryReview(e);
const poolValidated = rev?.pool_validated || '';
const disc = KNOWN_DISCIPLINES.find(d => poolValidated.includes(d)) || null;
```

Replace with:
```js
const rev = getEntryReview(e);
const poolValidated = rev?.pool_validated || '';
const disc = rev?.hide_protect_disc || KNOWN_DISCIPLINES.find(d => poolValidated.includes(d)) || null;
```

### Why `||` not `?? `

`hide_protect_disc` is `''` (empty string, falsy) when the field exists but no discipline was found at validation time. Falling back through `||` to text extraction on the same `poolValidated` expression will return the same null result — so the behaviour is identical. Using `||` is correct here.

### No CSS changes

`.proc-snap-hp-disc` and `.proc-snap-hp-unknown` classes are unchanged.

### No changes to admin.js or app.js

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- `_renderSnapshotHideProtect` updated: `disc` now reads `rev?.hide_protect_disc` first, falls back to `KNOWN_DISCIPLINES.find(d => poolValidated.includes(d))` for legacy entries. Single-character addition to existing line — no other change. `||` used intentionally (not `??`) so empty-string hide_protect_disc falls through to text extraction. Closes D10 display gap on the consumer side. Parse check clean.

### File List

- `public/js/admin/downtime-views.js`
