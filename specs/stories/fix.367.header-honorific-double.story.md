# Story fix.367: DT Story — remove double honorific in _compactCharHeader

**Story ID:** fix.367
**Epic:** DT Story tab fixes
**Status:** review
**Date:** 2026-05-18
**Issue:** [#367](https://github.com/angelusvmorningstar/TerraMortis/issues/367)
**Branch:** ms/issue-367-header-honorific-double

---

## User Story

As an ST reviewing a generated context prompt, I want the character header to read "Lord Marcus" rather than "Lord Lord Marcus" — so that the prompt looks professional and the AI is not confused by a malformed name.

---

## Background

### Root cause — `displayName()` already prepends the honorific

`_compactCharHeader` is the function that produces the first line of every context prompt header, e.g.:

```
Lord Marcus — Ventrue / Invictus — The Politician
```

Current implementation (line 472–476):

```js
function _compactCharHeader(char) {
  const name  = [char?.honorific, char ? displayName(char) : 'Unknown'].filter(Boolean).join(' ');
  const ident = [char?.clan, char?.covenant].filter(Boolean).join(' / ');
  return [name, ident, char?.concept || null].filter(Boolean).join(' — ');
}
```

`displayName(c)` is defined in `public/js/data/helpers.js:115–119`:

```js
export function displayName(c) {
  const base = c.moniker || c.name;
  const raw = c.honorific ? c.honorific + ' ' + base : base;
  return isRedactMode() ? _blockOut(raw, 10, 16) : raw;
}
```

`displayName(char)` returns `"Lord Marcus"` (honorific + moniker). `_compactCharHeader` then prepends `char?.honorific` again, producing `"Lord Lord Marcus"`.

### Confirmed DT3 instances

Every character with an honorific (Lord, Lady, Doctor, Sister, etc.) had the honorific doubled in all context prompt headers across all copy-context builders.

---

## Acceptance Criteria

- [x] Copy Context on any project card for a character with an honorific (e.g. "Lord Marcus") produces a header reading "Lord Marcus", not "Lord Lord Marcus"
- [x] Copy Context for characters without an honorific is unchanged
- [x] The fix applies to all context builders that call `_compactCharHeader`: `buildProjectContext`, `buildPatrolContext`, `buildMaintenanceContext`, `buildLetterContext`, `buildTouchstoneContext`

---

## Implementation

### `public/js/admin/downtime-story.js`

#### `_compactCharHeader` — remove explicit honorific prefix (line ~472)

```js
// Before:
function _compactCharHeader(char) {
  const name  = [char?.honorific, char ? displayName(char) : 'Unknown'].filter(Boolean).join(' ');
  const ident = [char?.clan, char?.covenant].filter(Boolean).join(' / ');
  return [name, ident, char?.concept || null].filter(Boolean).join(' — ');
}

// After:
function _compactCharHeader(char) {
  const name  = char ? displayName(char) : 'Unknown';   // displayName already includes honorific
  const ident = [char?.clan, char?.covenant].filter(Boolean).join(' / ');
  return [name, ident, char?.concept || null].filter(Boolean).join(' — ');
}
```

This is a one-line change. The array construction and `.filter(Boolean).join(' ')` are replaced by a direct call to `displayName(char)`.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Remove `char?.honorific` prefix from `_compactCharHeader` name construction |

No schema changes. No API changes. No CSS changes.

---

## Dev Notes

- `displayName(char)` already handles dev-mode redaction via `_blockOut` — no separate redaction needed in `_compactCharHeader`.
- `_charIdentLine` (line 479) does not use honorific — it outputs mask/dirge/humanity. No change needed there.
- The `buildCacophonySavvyContext` function (line 2959) uses `displayName(char)` directly and never calls `_compactCharHeader`. It is not affected by this bug and does not need changing.

---

## Dev Agent Record

**Date:** 2026-05-20

### Completion Notes

Fix implemented in commit `55a0cf4`. `_compactCharHeader` (line 586–590): the array construction `[char?.honorific, displayName(char)]` replaced by a direct `displayName(char)` call. One-line change. Covered by Playwright test in `tests/issue-363-367-dt-story-copy-context.spec.js` (fix.367 describe block) — verifies vignette prompt contains "Lord Marcus Blackwood" and does not contain "Lord Lord".

---

## File List

- `public/js/admin/downtime-story.js` (modified — _compactCharHeader simplified)
- `tests/issue-363-367-dt-story-copy-context.spec.js` (added)

---

## Change Log

- 2026-05-18: fix(#367): remove redundant honorific prefix in _compactCharHeader
- 2026-05-20: test: Playwright test verifying no double-honorific in prompt header
