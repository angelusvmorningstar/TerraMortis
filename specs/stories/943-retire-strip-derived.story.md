---
issue: 943
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/943
branch: piatra/issue-943-retire-strip-derived
---

# Story 943: Retire fails silently — strip transient `derived` before character PUT

**Story ID:** fix.943
**Status:** Done
**Date:** 2026-07-03
**Issue:** [#943](https://github.com/angelusvmorningstar/TerraMortis/issues/943)
**Branch:** `piatra/issue-943-retire-strip-derived`

---

## User Story

As an ST using the Admin app,
I want Retire / Unretire to succeed for any character regardless of which views I have opened,
so that I can manage character retirement without silent failures or confusing stalls.

---

## Background

`toggleRetire()` (`public/js/admin.js:710-734`) flips `c.retired` and PUTs the entire
in-memory character object to `PUT /api/characters/:id`. The in-memory object may carry
a `c.derived` object — the render-time materialised defence cache attached by
`materialiseDerivedDefence()` in `public/js/data/equipment-derivation.js:112-113` (ADR-006).
The server schema (`server/schemas/character.schema.js`, `additionalProperties: false`)
rejects the unknown key, returning `400 Bad Request`:

```
must NOT have additional properties: "derived"
```

The `catch` block at line 729 reverts `c.retired` and only `console.error`s, so the ST
sees the button flash "Saving..." and return to "Retire" with no further feedback. The
character is not retired.

`c.derived` is never stored in MongoDB (0 documents carry it). It is a purely client-side
render artefact. The fix is to strip it — and any other transient fields — from the
retire payload. This is the same class of bug as PR #902 (strip `c.assets`), and the
existing `buildSaveBody()` function in `admin.js:956-983` already strips `derived`,
`assets`, `_`-prefixed keys, `current`, and legacy fields. `toggleRetire()` bypasses it.

---

## Acceptance Criteria

- [ ] Given Maibh (or any character with a materialised `c.derived`), When the ST presses
      Retire, Then the save succeeds and the grid moves her to the Retired section.
- [ ] The retire request carries no transient fields (`derived`, `assets`, `_st_mod_*`,
      any `_`-prefixed) — i.e. it is sanitised the same way `charsForSave()` sanitises,
      OR it sends only `{ retired }`.
- [ ] On a save error, the ST sees a visible message (toast/alert), not just a console error.
- [ ] Unretire still works (no regression on #149).

---

## Design Decision: Payload approach

**Decision: use a minimal `{ retired: newState }` payload.**

Rationale:

- `toggleRetire()` is semantically a single-field toggle, not a full document editor.
  Sending a full sanitised PUT body re-validates the entire document unnecessarily.
- Minimal payload is immune to any future new transient field that `buildSaveBody` has
  not yet been updated to strip.
- The server route already supports partial PUTs (`PATCH`-style via `PUT` with only the
  changed fields present): the `character.schema.js` marks all top-level fields as
  optional, and MongoDB `replaceOne`/`findOneAndUpdate` with a `$set` body preserves
  existing fields. Confirm this holds before coding (see Dev Notes below).
- `_omSave` at line 1211-1227 demonstrates the alternative (full raw spread with no
  sanitiser) and shows exactly the same risk surface — that call site is also in scope
  for a follow-up (see Sweep Scope below).

If the server route does NOT support partial PUTs (i.e. it replaces the document
wholesale), fall back to: `const body = buildSaveBody(c); body.retired = newState;`
followed by `apiPut(...)`. This is the safe fallback and avoids adding a new PATCH route.

---

## Error-surfacing: toast vs alert

`admin.html` does NOT have a `#toast` DOM element. The `toast()` function defined in
`public/js/suite/tracker.js` (and re-exported via `public/js/app.js`) targets
`document.getElementById('toast')`, which exists only in `index.html`. Calling `toast()`
from admin context silently no-ops.

`admin.js` currently uses bare `alert()` for the one pre-existing visible user error
(line 945: character creation failure). Using `alert()` for the retire error is
therefore consistent with the current admin error-surfacing pattern and requires no new
infrastructure.

**Instruction to dev:** Use `alert('Retire failed: ' + err.message)` in the catch block.
Do NOT import or call `toast()` — it will silently do nothing in admin context.

If a proper admin notification system is desired, that is a separate story. Do not
implement one here.

---

## Sweep Scope: other `apiPut('/api/characters/...')` call sites

Run:

```bash
grep -n "apiPut('/api/characters/" public/js/**/*.js
```

Identified call sites as of branch creation:

| File | Line | Body passed | Sanitised? |
|---|---|---|---|
| `public/js/admin.js` | 725 | `{ ...c }` (spread minus `_id`) | **No — this is the bug** |
| `public/js/admin.js` | 995 | `buildSaveBody(c)` | Yes |
| `public/js/admin.js` | 1014 | `buildSaveBody(pc)` | Yes |
| `public/js/admin.js` | 1220 | `{ ...c }` (spread minus `_id`) | **No — same class** |
| `public/js/suite/status.js` | 244 | `{ status: { ... } }` | Yes (minimal field) |
| `public/js/editor/edit.js` | 250 | `{ touchstones: ... }` | Yes (minimal field) |
| `public/js/editor/edit.js` | 279 | `{ touchstones: ... }` | Yes (minimal field) |
| `public/js/editor/edit.js` | 330 | `{ touchstones: ... }` | Yes (minimal field) |

Two bypass call sites:

1. **Line 725** (`toggleRetire`) — the primary bug. Fix in this PR.
2. **Line 1220** (`_omSave` — ordeal save) — same class. `_omSave` sends the full
   in-memory character without sanitisation, but note it uses an inline `try`/`catch`
   that surfaces the error in a modal error element (`#om-err`), not silently. The
   failure mode exists but is visible to the ST. **Dev decision:** fix in this PR (one
   line: replace the raw spread with `buildSaveBody(c)`) or file a follow-up issue.
   If fixing in this PR, add a row to the AC table and test coverage.

---

## Implementation

### Pre-flight: confirm base branch

Branch `piatra/issue-943-retire-strip-derived` should already be off `dev`. Verify:

```bash
git log HEAD..origin/dev --oneline
```

Merge any outstanding `dev` commits before starting.

---

### Change 1 — `public/js/admin.js` · `toggleRetire` (lines 710-734)

**Current:**

```js
try {
  c.retired = newState;
  const { _id, ...body } = c;
  const updated = await apiPut('/api/characters/' + _id, body);
  Object.assign(chars[idx], updated);
  btn.textContent = newState ? 'Unretire' : 'Retire';
  renderCharGrid();
} catch (err) {
  c.retired = !newState;
  btn.textContent = newState ? 'Retire' : 'Unretire';
  console.error('Retire failed:', err.message);
}
```

**New (minimal payload + visible error):**

```js
try {
  const updated = await apiPut('/api/characters/' + _id, { retired: newState });
  c.retired = newState;
  Object.assign(chars[idx], updated);
  btn.textContent = newState ? 'Unretire' : 'Retire';
  renderCharGrid();
} catch (err) {
  btn.textContent = newState ? 'Retire' : 'Unretire';
  console.error('Retire failed:', err.message);
  alert('Retire failed: ' + err.message);
}
```

Notes on the reordering: `c.retired = newState` moves AFTER the await so the in-memory
object is only mutated on success. The revert `c.retired = !newState` is no longer
needed. Button text reset in the catch still applies.

If the server does not support partial PUTs (see Design Decision above), use instead:

```js
const body = buildSaveBody(c);
body.retired = newState;
const updated = await apiPut('/api/characters/' + _id, body);
```

Check the server route before choosing.

---

### Change 2 (optional, same PR) — `_omSave` (line 1220)

Replace:

```js
const { _id, ...body } = c;
const updated = await apiPut('/api/characters/' + _id, body);
```

with:

```js
const { _id } = c;
const updated = await apiPut('/api/characters/' + _id, buildSaveBody(c));
```

This aligns `_omSave` with `saveCharToApi` (line 995). `buildSaveBody` already exists
in the same file.

---

### Dev Notes

#### Confirm partial PUT behaviour on the server

Before writing the minimal-payload implementation, grep the characters route handler:

```bash
grep -n "findOneAndUpdate\|replaceOne\|set\b" server/routes/characters.js | head -20
```

If the PUT handler uses `$set` (partial merge), the minimal `{ retired }` payload is
safe. If it uses full document replacement (`replaceOne` without `$set`), use the
`buildSaveBody` fallback instead.

#### Why `buildSaveBody` is the right reference, not `charsForSave`

`charsForSave()` (in `public/js/editor/export.js`) targets the localStorage stash path
and operates on `state.chars` directly. `buildSaveBody(c)` in `admin.js` targets the
API PUT path and takes a single character. Both strip the same fields (`derived`,
`assets`, `_`-prefixed, `current`, legacy). Either would work for the fallback, but
`buildSaveBody` is the right one for an admin PUT call — it already lives in `admin.js`.

#### The `derived` field origin (ADR-006)

`c.derived` is attached by `materialiseDerivedDefence()` during the equipment
render path. Characters without equipment renders (no armour / shield data) never have
it materialised. This explains why the bug is character-specific: Maibh has equipment
that triggers the render path; characters without it are unaffected. `derived` is
explicitly stripped by `buildSaveBody` (`k === 'derived'` exclusion at line 962) and
by `charsForSave` (line 60). Neither was being called by `toggleRetire`.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin.js` | `toggleRetire`: switch to minimal `{ retired }` payload; surface error with `alert()` in catch |
| `public/js/admin.js` | `_omSave` (optional, same PR): replace raw spread with `buildSaveBody(c)` |
| `server/tests/fix.943.retireStripDerived.test.js` | New Vitest mirror-tests (see Testing below) |

No schema changes. No API route changes. No CSS changes.

---

## Testing

Write a new Vitest mirror-test at `server/tests/fix.943.retireStripDerived.test.js`
following the inline-logic mirror-test pattern (no DOM, no browser module imports).

Tests to cover:

- **AC1** — A character object carrying `c.derived` produces a retire PUT body with no
  `derived` key (either via minimal payload or `buildSaveBody`).
- **AC2** — A character object carrying `c.assets` produces a retire PUT body with no
  `assets` key.
- **AC3** — A character object carrying `_st_mod_overlay` and `_st_mod_base` produces a
  retire PUT body with neither key.
- **AC4** — The retire PUT body always contains `{ retired: true }` (or `false`).
- **AC5** — If using `buildSaveBody` fallback: canonical fields (e.g. `name`, `clan`,
  `humanity`) survive into the PUT body.
- **AC6** — Regression guard: a character without `c.derived` also retires successfully
  (payload has no `derived` key).

---

## Dev Agent Record

_(To be completed by dev agent on implementation.)_

### Files Changed

### Completion Notes
