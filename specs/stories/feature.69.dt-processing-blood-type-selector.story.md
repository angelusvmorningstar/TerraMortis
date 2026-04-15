# Story feature.69: Blood Type Selector (B1)

## Status: ready-for-dev

## Story

**As an** ST coding a feeding action,
**I want** blood type to be a hard selector rather than a free-text field,
**so that** the value is always consistent and unambiguous for the prompt generator.

## Background

The feeding details card in `renderActionPanel` (source: feeding) has a Blood Type field currently rendered as a free-text input (`proc-feed-blood-input`). The valid values are enumerable. This story replaces it with a ticker control using the same save path.

The save path (`rev.blood_type` via `saveEntryReview`) does not change.

---

## Acceptance Criteria

1. The Blood Type field in the feeding details card edit mode is a ticker with four options: Human / Animal / Kindred / Ghoul.
2. The ticker uses the existing `_renderTickerRow` pattern or an equivalent selector — not a free-text input.
3. The selected value saves to `rev.blood_type` via the existing save mechanism.
4. The view mode displays the selected value as before.
5. Existing saved blood type values (free text) are preserved on load — if the saved value matches one of the four options, it pre-selects correctly. If it doesn't match, it defaults to the first option.
6. No other fields in the feeding details card are changed.

---

## Tasks / Subtasks

- [ ] Task 1: Replace text input with selector in edit mode
  - [ ] Find `proc-feed-blood-input` in `renderActionPanel` (feeding block, ~line 6022)
  - [ ] Replace `<input type="text" class="proc-detail-input proc-feed-blood-input"...>` with a `<select class="proc-recat-select proc-feed-blood-sel"...>` with options: Human, Animal, Kindred, Ghoul
  - [ ] Pre-select based on `bloodTypeVal`

- [ ] Task 2: Update event handler
  - [ ] Find the save handler for `proc-feed-blood-input` in event delegation
  - [ ] Update selector class to `proc-feed-blood-sel` and change event from `input`/`change` as appropriate
  - [ ] Save value to `rev.blood_type` via `saveEntryReview` — same field, same path

- [ ] Task 3: Manual verification
  - [ ] Open a feeding action panel, enter edit mode
  - [ ] Confirm Blood Type shows as a four-option selector
  - [ ] Select a value, save — confirm it persists on reload
  - [ ] Confirm view mode displays the selected label

---

## Dev Notes

### Current implementation location

```
renderActionPanel → source === 'feeding' block → proc-feed-desc-card → edit mode
Line ~6022: proc-feed-blood-input
```

### Selector options

```js
const BLOOD_TYPE_OPTIONS = ['Human', 'Animal', 'Kindred', 'Ghoul'];
```

### Save path

```js
saveEntryReview(entry, { blood_type: selectedValue });
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Replace text input with select; update event handler |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
