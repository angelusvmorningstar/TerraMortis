---
issue: 821
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/821
branch: piatra/issue-821-game-xp-attendance-id-match
---

# Story 821: Game-XP attendance name fallbacks mis-attribute XP for rows without `character_id`

**Story ID:** fix.821
**Status:** To Do
**Date:** 2026-07-03
**Issue:** [#821](https://github.com/angelusvmorningstar/TerraMortis/issues/821)
**Branch:** `piatra/issue-821-game-xp-attendance-id-match`

---

## User Story

As an ST reviewing XP totals,
I want attendance rows matched to characters by `character_id` first and name only as a last
resort for legacy rows,
so that XP attribution is stable and correct even when two characters share the same display name.

---

## Background

`loadGameXP()` in `public/js/data/game-xp.js:32-37` locates each attendance row's character
using a single OR chain:

```js
const c = chars.find(ch =>
  (a.character_id && ch._id === a.character_id) ||
  ch.name === a.character_name ||
  ch.name === a.name ||
  displayName(ch) === (a.display_name || a.character_display)
);
```

The three name fallbacks run unconditionally — even when `character_id` is present.
Because `Array.find` returns the first match, a name collision between two characters
can cause the wrong character to absorb XP for a row that has a perfectly good
`character_id` on it.

For legacy rows that genuinely lack `character_id` (CLAUDE.md: "Game 2 XP: attendance data
partially entered"), name matching is the only available path and must be retained. The fix
is to restructure from a flat OR-chain into a two-phase find so the intent is explicit:
id-first, name only as fallback.

The companion issue in `public/js/admin/attendance.js` is that the renderGrid id comparison
at line 205 also chains name fallbacks without any `character_id` presence guard, and the
id comparisons at lines 56/58 and 98 use uncoerced `===` across potentially mixed-type
values.

---

## Acceptance Criteria

- [ ] Attendance rows with `character_id` match by id only, using
      `String(ch._id) === String(a.character_id)`
- [ ] Name matching is retained only as a fallback for rows missing `character_id`
- [ ] A character sharing a display name with another is attributed the correct
      attendance/XP
- [ ] No regression to `xpEarned`/game-XP totals for current rows

---

## Design Decision: Two-Phase Find

Replace the single OR-chain with an explicit two-pass lookup in `loadGameXP`. The shape:

```js
// Phase 1: match by id (authoritative; coerce both sides for type safety)
let c = a.character_id
  ? chars.find(ch => String(ch._id) === String(a.character_id))
  : null;

// Phase 2: name fallback only for legacy rows that have no character_id
if (!c && !a.character_id) {
  c = chars.find(ch =>
    ch.name === a.character_name ||
    ch.name === a.name ||
    displayName(ch) === (a.display_name || a.character_display)
  );
}
```

Rationale:

- The two-phase structure makes the "id-first, name as exception path" policy readable in
  code, not implied by short-circuit evaluation order in a flat OR.
- Phase 2 runs only when `a.character_id` is absent (`!a.character_id` guard), so a row
  with a bad/mistyped id still fails cleanly rather than silently falling through to name
  matching. If a row has `character_id` set but no character matches, `c` stays `null` and
  the row's XP goes unattributed — which is the correct observable signal that the id is
  stale and needs remediation (rather than silently attributing to a name-match that may
  be wrong).
- `String()` coercion on both sides is defensive: JSON parse always yields strings for
  these values, but if any server path ever returns an ObjectId object rather than a
  serialised string, the coercion prevents a silent `false`.

Apply the same two-phase structure to `renderGrid` in `attendance.js` at line 205 (see
String-Coercion Sweep below).

---

## String-Coercion Sweep: `attendance.js` Call Sites

The issue references four line numbers in `public/js/admin/attendance.js`. Exact analysis
against the current file:

| Line | Current code | Action |
|------|-------------|--------|
| 56 | `activeSession.attendance.map(a => a.character_id)` — builds a `Set` of id values | No comparison here; value is a bare string extraction. **No change needed.** Add a comment: `// character_id values are always strings from JSON; Set membership via ===` |
| 58 | `!presentIds.has(c._id)` — `Set.has` uses SameValueZero, works for strings | Both sides are client-side character `_id` strings. **Low-risk; no-op change.** Verify with a comment and leave; do not alter. |
| 98 | `chars.find(ch => ch._id === sel.value)` | `sel.value` is populated from `c._id` at line 76 via `esc(c._id)` (HTML attribute round-trip). Both sides are strings from the same source. **Low-risk; add `String()` coercion for consistency:** `String(ch._id) === String(sel.value)` |
| 205 | `ch._id === a.character_id \|\| ch.name === a.character_name \|\| ch.name === a.name` | **Primary fix site.** Replace with a two-phase find matching the `loadGameXP` pattern (see Design Decision above). `a.character_id` presence guards the name fallback. Apply `String()` coercion on the id-path. |

Summary: one genuine fix (line 205), one defensive coercion (line 98), two annotated
no-ops (lines 56, 58).

---

## Duplicate-Name Test Fixture

The AC requires a test for "a character sharing a display name with another." There are no
known duplicate `name` or `displayName` values among the 31 active characters in
production. Use a **synthetic fixture** in the Vitest test file:

```js
const chars = [
  { _id: 'aaa111', name: 'James', honorific: null, moniker: null },
  { _id: 'bbb222', name: 'James', honorific: null, moniker: null }, // duplicate name
];
const session = {
  attendance: [
    // Row with character_id — must resolve to bbb222 regardless of name order
    { character_id: 'bbb222', character_name: 'James', attended: true },
    // Row without character_id — must resolve to aaa111 (first-match by name)
    { character_id: null,    character_name: 'James', attended: true },
  ]
};
```

Assert:
- Row 0 resolves to `bbb222` (id-phase match).
- Row 1 resolves to `aaa111` (name-phase match, first in array).
- `chars[1]._gameXP === 1` and `chars[0]._gameXP === 1` — each gets exactly one row, not
  two.

This fixture does not require a real duplicate on prod. The synthetic case is sufficient to
prove the two-phase logic is correct.

---

## Regression Coverage

AC: "no regression to `xpEarned`/game-XP totals for current rows."

Test approach:

1. Construct a mixed attendance fixture with:
   - Rows that have `character_id` set (simulates current/new rows).
   - Rows that lack `character_id` but have `character_name` (simulates Game 2 legacy rows).
2. Run the matching logic for both old (OR-chain) and new (two-phase) implementations as
   pure functions in the test, operating on the same `chars` array and fixture.
3. Assert:
   - For rows WITH `character_id`: resolved character is identical under old and new logic.
     These are the "no regression" rows.
   - For rows WITHOUT `character_id` where name is unique: resolved character is identical
     under old and new logic.
   - For rows WITHOUT `character_id` where the name is a duplicate: surfaced in test output
     as a "correction" — the new logic may resolve differently (or not at all) compared to
     the old OR-chain, and that is the **intentional fix**, not a regression.

Implement this as a Vitest mirror-test at
`server/tests/fix.821.game-xp-attendance-id-match.test.js`. Extract the matching predicate
from `loadGameXP` into a standalone function (or inline-replicate it in the test as a pure
function) so the test does not need DOM or ES module browser imports.

---

## Implementation

### Pre-flight: confirm base branch

Branch `piatra/issue-821-game-xp-attendance-id-match` should already be off `dev`. Verify:

```bash
git log HEAD..origin/dev --oneline
```

Merge any outstanding `dev` commits before starting.

---

### Change 1 — `public/js/data/game-xp.js` (lines 32-37)

**Current:**

```js
const c = chars.find(ch =>
  (a.character_id && ch._id === a.character_id) ||
  ch.name === a.character_name ||
  ch.name === a.name ||
  displayName(ch) === (a.display_name || a.character_display)
);
```

**New:**

```js
// Phase 1: id match (authoritative). Coerce both sides — both are JSON strings
// in practice, but guard against any path that supplies a non-string ObjectId.
let c = a.character_id
  ? chars.find(ch => String(ch._id) === String(a.character_id))
  : null;

// Phase 2: name fallback — only for legacy rows that genuinely lack character_id.
// Rows with a character_id that fails to match stay unattributed (signal to backfill).
if (!c && !a.character_id) {
  c = chars.find(ch =>
    ch.name === a.character_name ||
    ch.name === a.name ||
    displayName(ch) === (a.display_name || a.character_display)
  );
}
```

---

### Change 2 — `public/js/admin/attendance.js` · `renderGrid` (line 205)

**Current:**

```js
const c = chars.find(ch => ch._id === a.character_id || ch.name === a.character_name || ch.name === a.name);
```

**New (same two-phase pattern):**

```js
// Phase 1: id match
let c = a.character_id
  ? chars.find(ch => String(ch._id) === String(a.character_id))
  : null;
// Phase 2: name fallback for legacy rows only
if (!c && !a.character_id) {
  c = chars.find(ch => ch.name === a.character_name || ch.name === a.name);
}
```

Note: `renderGrid` does not use the `displayName` fallback branch that `loadGameXP` uses.
Retain parity with the existing behaviour (no `displayName` fallback in `renderGrid`) —
do not add it.

---

### Change 3 — `public/js/admin/attendance.js` · `confirmAddCharacter` (line 98) — defensive coercion

**Current:**

```js
const c = chars.find(ch => ch._id === sel.value);
```

**New:**

```js
const c = chars.find(ch => String(ch._id) === String(sel.value));
```

Both sides are strings from a controlled path (option value seeded from `c._id`). This is
a defensive no-op coercion for consistency. Add a comment:

```js
// sel.value is seeded from c._id at render time (both strings); String() is defensive
const c = chars.find(ch => String(ch._id) === String(sel.value));
```

---

### Change 4 — `public/js/admin/attendance.js` · `getEligibleChars` (lines 56/58) — annotate as verified no-op

Lines 56 and 58:

```js
const presentIds = new Set(activeSession.attendance.map(a => a.character_id));
return chars
  .filter(c => !presentIds.has(c._id))
```

Both `a.character_id` and `c._id` are JSON-derived strings. `Set.has` uses SameValueZero,
which is equivalent to `===` for strings. This is correct as written.

**Action:** Add an inline comment only — do not change the logic:

```js
// character_id and c._id are both JSON strings; Set.has uses SameValueZero (safe)
const presentIds = new Set(activeSession.attendance.map(a => a.character_id));
```

---

## Files to Change

| File | Change |
|------|--------|
| `public/js/data/game-xp.js` | Lines 32-37: replace OR-chain with two-phase find + `String()` coercion |
| `public/js/admin/attendance.js` | Line 205: two-phase find (renderGrid) |
| `public/js/admin/attendance.js` | Line 98: `String()` coercion (confirmAddCharacter) |
| `public/js/admin/attendance.js` | Lines 56/58: add no-op comment (getEligibleChars) |
| `server/tests/fix.821.game-xp-attendance-id-match.test.js` | New Vitest mirror-tests (see Testing below) |

No schema changes. No API route changes. No CSS changes.

---

## Testing

Write `server/tests/fix.821.game-xp-attendance-id-match.test.js` as a Vitest mirror-test.
No DOM, no browser module imports. Copy the matching predicate logic inline.

### Test cases

**Suite 1: two-phase id/name logic (unit)**

- `id present, unique name` — resolves correct character by id.
- `id present, duplicate name, correct id wins` — the synthetic "James/James" fixture above;
  the row with `character_id: 'bbb222'` resolves to `bbb222`, not `aaa111`.
- `id absent, unique name` — falls through to name-phase, resolves correct character.
- `id absent, duplicate name` — resolves to the first match by name (array order); this is
  documented behaviour, not a fix target.
- `id present, no match` — `c` stays `null`; XP goes unattributed.
- `id absent, no name match` — `c` stays `null`; XP goes unattributed.

**Suite 2: XP totals regression (mixed fixture)**

Construct a `chars` array and a `gameSessions` array with:

- 3 rows with `character_id` set (names may be non-unique).
- 2 rows with no `character_id`, unique names.

Run the new two-phase logic. Assert:
- Each `character._gameXP` matches the expected value.
- Total XP attributed across all characters equals the sum for all rows that resolved.
- No character has absorbed XP from more than the rows that legitimately belong to it.

Rows that legitimately differ from old-logic (e.g. duplicate-name collision) are NOT
present in this regression suite — the regression suite only covers rows where old and new
logic should agree.

---

## Dev Agent Record

_(To be completed by dev agent on implementation.)_

### Files Changed

### Completion Notes
