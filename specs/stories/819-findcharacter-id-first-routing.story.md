---
issue: 819
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/819
branch: piatra/issue-819-findcharacter-id-first
---

# Story 819: Route DT submission-to-character resolution through `_findCharForSub` (id-first)

**Story ID:** fix.819
**Status:** Done
**Date:** 2026-07-03
**Issue:** [#819](https://github.com/angelusvmorningstar/TerraMortis/issues/819)
**Branch:** `piatra/issue-819-findcharacter-id-first`

---

## User Story

As an ST processing downtime submissions,
I want each submission resolved to its character by `character_id` first and by name only as
a last resort for legacy CSV rows,
so that a submission never silently binds to the wrong character because of a fuzzy name hit.

---

## Background

`findCharacter(submissionCharName, submissionPlayerName)` at
`public/js/admin/downtime-views.js:689` scores character-name similarity via `_wordOverlap`
and `_containsScore`, combines `charScore * 0.7 + playerScore * 0.3`, and returns the best
match if `bestScore >= 0.4`. Every DT submission already carries a canonical `character_id`,
so the fuzzy threshold is unnecessary and dangerous: two characters sharing name-words can
produce a wrong binding, and a score below 0.4 silently drops the submission from feeding
matrices and jump strips entirely.

An id-first helper already exists at line 8285:

```js
function _findCharForSub(sub) {
  if (!sub) return null;
  const charIdStr   = sub.character_id ? String(sub.character_id) : null;
  const charNameKey = (sub.character_name || '').toLowerCase().trim();
  return (charIdStr && characters.find(ch => String(ch._id) === charIdStr)) ||
         charMap.get(charNameKey) || null;
}
```

It does an exact id match first, then falls back to the `charMap` name lookup for legacy
CSV rows that genuinely lack `character_id`. This is the correct resolution path for all DT
call sites.

The issue lists approximately 18 call sites. After auditing the file, the actual breakdown
is:

| Line | Function | Variable | Status |
|------|----------|----------|--------|
| 689  | `findCharacter` definition | — | **DO NOT change** (definition) |
| 751  | `resolveSubChar` definition | `s` | **Migrate** (DT resolution helper) |
| 962  | `matchSubmission` (export) | CSV import path — `sub.submission.character_name` | **DO NOT change** (CSV import flow) |
| 3583 | `buildProcessingQueue` | `sub` | **Migrate** |
| 3887 | `_computeMatrixFeederCounts` | `s` | **Migrate** |
| 4013 | (merit action loop) | `sub` | **Migrate** |
| 4405 | `renderCharacterStrip` sort comparator | `a` | **Migrate** |
| 4406 | `renderCharacterStrip` sort comparator | `b` | **Migrate** |
| 7055 | feed-builder meta handler | `sub` | **Migrate** |
| 10441 | `_computeRiteVitaeCost` | `sub` | **Migrate** (special — see notes) |
| 10458 | `_computeRiteWpCost` | `sub` | **Migrate** (special — see notes) |
| 10718 | `handleExportSingle` | `sub` | **Migrate** |
| 10734 | `handleExportAll` (parallel map) | `sub` | **Migrate** |
| 10741 | `handleExportAll` (render loop) | `sub` | **Migrate** |
| 11336 | `renderFeedingScene` (sub map build) | `s` | **Migrate** |
| 11513 | `renderSorceryScene` (sub map build) | `s` | **Migrate** |
| 12032 | `_exportCityOverview` (sub map build) | `s` | **Migrate** |

Line 962 (`matchSubmission`) is the CSV import flow. The function is exported, receives
`sub.submission.character_name` (not `sub.character_name`), and explicitly exists to surface
fuzzy-match warnings during import. It must not be changed.

**Total migration targets: 15 direct call sites + `resolveSubChar` definition at line 751
= 16 changes.**

---

## Special Cases

### Lines 10441 and 10458 — `_computeRiteVitaeCost` / `_computeRiteWpCost`

Both functions receive an optional pre-resolved `char` parameter:

```js
function _computeRiteVitaeCost(sub, char) {
  const subChar = char || findCharacter(sub.character_name, sub.player_name);
  ...
}
function _computeRiteWpCost(sub, char) {
  const subChar = char || findCharacter(sub.character_name, sub.player_name);
  ...
}
```

The `char ||` guard means `findCharacter` is only reached when `char` is null/undefined.
Replace the fallback with `_findCharForSub(sub)`:

```js
const subChar = char || _findCharForSub(sub);
```

Do not remove the `char ||` guard — callers that pre-resolve the character bypass this path
deliberately.

### Lines 4405 and 4406 — sort comparator in `renderCharacterStrip`

The sort uses `findCharacter(a.character_name, a.player_name)` and
`findCharacter(b.character_name, b.player_name)` to get sort keys. Both `a` and `b` are
elements from the `submissions` array, so both have `character_id` available.
Replace both with `_findCharForSub(a)` and `_findCharForSub(b)` respectively.

### Line 751 — `resolveSubChar` definition

`resolveSubChar` is a thin wrapper that calls `findCharacter` and packages the result with a
display name:

```js
function resolveSubChar(s, fallback = 'Unknown') {
  const char = findCharacter(s.character_name, s.player_name);
  const charName = char ? (char.moniker || char.name) : (s.character_name || fallback);
  return { char, charName };
}
```

Replace the inner call with `_findCharForSub(s)`. The function body and signature are
otherwise unchanged. Its four downstream callers (lines 2847, 4163, 4318, 4416) require no
changes — they already receive `sub`/`s` objects in scope.

---

## What NOT to Change

- `findCharacter` function body (lines 689-737) and its scoring helpers `_wordOverlap`
  (line 658) and `_containsScore` (line 665) — keep intact, CSV import path uses them.
- `matchSubmission` at line 962 — CSV import flow, must keep fuzzy matching.
- `_charForSub` at line 69 — id-only helper, not touched by this story.
- `_findCharForSub` itself at line 8285 — no modification, callers route through it.
- Any server-side route or write path.
- Dev-fixture files.

---

## Acceptance Criteria

- [ ] All 16 migration targets (`resolveSubChar` definition + 15 direct call sites) use
      `_findCharForSub(sub)` or `_findCharForSub(s)` as appropriate.
- [ ] `findCharacter(` appears exactly once in `downtime-views.js` (the definition at
      line 689), plus once in `matchSubmission` at line 962 (CSV import — unchanged).
      Total occurrences of `findCharacter(` in the file: **2**.
- [ ] `_findCharForSub(` call count in the file increases by at least 16 from its
      pre-change baseline.
- [ ] No new null-guards added beyond what callers already have — the existing
      `if (!char)` patterns at each call site remain the guard.
- [ ] `findCharacter`, `_wordOverlap`, `_containsScore`, and `matchSubmission` are
      untouched.
- [ ] Vitest static-analysis test passes (see Testing section).

---

## Files to Change

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | 16 substitutions: `resolveSubChar` body + 15 direct call sites |
| `server/tests/fix.819.findcharacter-id-first.test.js` | New Vitest static-analysis test |
| `specs/stories/819-findcharacter-id-first-routing.story.md` | This file — include in same PR |

No schema changes. No API route changes. No CSS changes.

---

## Implementation

### Pre-flight: confirm base branch

```bash
git log HEAD..origin/dev --oneline
```

Merge any outstanding `dev` commits before starting. Branch
`piatra/issue-819-findcharacter-id-first` should already be off `dev`.

---

### Step 1 — Edit `public/js/admin/downtime-views.js`

Apply the following substitutions in order from top to bottom. Use exact string replacement
for each site to avoid accidental collisions. Verify line numbers against the file before
editing — the grep-confirmed lines from audit are the ground truth, but shifts from other
open PRs are possible.

**Line 751 (`resolveSubChar` body)**

Old:
```js
  const char = findCharacter(s.character_name, s.player_name);
```
New:
```js
  const char = _findCharForSub(s);
```

**Line 3583**

Old:
```js
      const _skAcqChar = findCharacter(sub.character_name, sub.player_name);
```
New:
```js
      const _skAcqChar = _findCharForSub(sub);
```

**Line 3887**

Old:
```js
    const c = findCharacter(s.character_name, s.player_name);
```
New:
```js
    const c = _findCharForSub(s);
```
(This line is inside `_computeMatrixFeederCounts`. Confirm by checking the surrounding
`for (const s of submissions)` loop header.)

**Line 4013**

Old:
```js
    const subChar   = findCharacter(sub.character_name, sub.player_name);
```
New:
```js
    const subChar   = _findCharForSub(sub);
```

**Lines 4405 and 4406**

Old (two adjacent lines):
```js
    const ca = findCharacter(a.character_name, a.player_name);
    const cb = findCharacter(b.character_name, b.player_name);
```
New:
```js
    const ca = _findCharForSub(a);
    const cb = _findCharForSub(b);
```

**Line 7055**

Old:
```js
  const char = sub ? findCharacter(sub.character_name, sub.player_name) : null;
```
New:
```js
  const char = sub ? _findCharForSub(sub) : null;
```

**Line 10441 (`_computeRiteVitaeCost`)**

Old:
```js
  const subChar = char || findCharacter(sub.character_name, sub.player_name);
```
New:
```js
  const subChar = char || _findCharForSub(sub);
```

**Line 10458 (`_computeRiteWpCost`)**

Old:
```js
  const subChar = char || findCharacter(sub.character_name, sub.player_name);
```
New:
```js
  const subChar = char || _findCharForSub(sub);
```

**Line 10718 (`handleExportSingle`)**

Old:
```js
  const char = findCharacter(sub.character_name, sub.player_name);
```
New:
```js
  const char = _findCharForSub(sub);
```

**Lines 10734 and 10741 (`handleExportAll`)**

Old (line 10734, inside the parallel map):
```js
    const char = findCharacter(sub.character_name, sub.player_name);
```
New:
```js
    const char = _findCharForSub(sub);
```

Old (line 10741, inside the render loop):
```js
    const char = findCharacter(sub.character_name, sub.player_name);
```
New:
```js
    const char = _findCharForSub(sub);
```

(These two lines have identical text but different surrounding context — one is inside
`Promise.all(sorted.map(async sub => {` and one is inside a `for (const sub of sorted)`
loop. Edit each by its surrounding context, not as a global replace-all.)

**Line 11336 (`renderFeedingScene` sub map build)**

Old:
```js
    const char = findCharacter(s.character_name, s.player_name);
```
New:
```js
    const char = _findCharForSub(s);
```
(Context: inside `for (const s of submissions)` building `subByCharId`.)

**Line 11513 (`renderSorceryScene` sub map build)**

Old (same text, different function):
```js
    const char = findCharacter(s.character_name, s.player_name);
```
New:
```js
    const char = _findCharForSub(s);
```
(Context: inside `for (const s of submissions)` building `subByCharId` in the sorcery
scene panel function.)

**Line 12032 (`_exportCityOverview`)**

Old:
```js
    const c = findCharacter(s.character_name, s.player_name);
```
New:
```js
    const c = _findCharForSub(s);
```

---

### Step 2 — Verify occurrence counts

After all edits, confirm:

```bash
grep -n "findCharacter(" public/js/admin/downtime-views.js
```

Expected output: exactly two lines — the `export function findCharacter(` definition and the
`findCharacter(charName, playerName)` call inside `matchSubmission`.

Any additional occurrences indicate a missed site; fix before proceeding.

---

### Step 3 — Write `server/tests/fix.819.findcharacter-id-first.test.js`

Static-analysis test only — no DOM, no ES module browser imports.
Follow the pattern from `server/tests/fix.821.game-xp-attendance-id-match.test.js`
(REPO_ROOT + `read` helper via `fs.readFileSync`).

```js
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
function read(rel) { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); }

const src = read('public/js/admin/downtime-views.js');
```

**Suite 1: `findCharacter(` occurrence count**

```js
describe('#819 — findCharacter( occurrence count', () => {
  it('findCharacter( appears exactly twice (definition + matchSubmission CSV path)', () => {
    const matches = src.match(/findCharacter\(/g) || [];
    expect(matches.length).toBe(2);
  });
});
```

**Suite 2: `_findCharForSub(` presence at migrated sites**

Write individual `toContain` assertions to confirm the id-first helper is present in the
regions near each formerly-fuzzy call. Use distinct surrounding tokens that appear in each
function body to anchor the search:

```js
describe('#819 — _findCharForSub present at migrated sites', () => {
  it('resolveSubChar body uses _findCharForSub', () => {
    // resolveSubChar is the only function with this exact return shape
    expect(src).toMatch(/_findCharForSub\(s\)[\s\S]{0,200}return \{ char, charName \}/);
  });

  it('_computeMatrixFeederCounts uses _findCharForSub', () => {
    expect(src).toContain('_computeMatrixFeederCounts');
    const fnStart = src.indexOf('function _computeMatrixFeederCounts');
    const snippet = src.slice(fnStart, fnStart + 1500);
    expect(snippet).toContain('_findCharForSub(s)');
  });

  it('_computeRiteVitaeCost uses _findCharForSub fallback', () => {
    const fnStart = src.indexOf('function _computeRiteVitaeCost');
    const snippet = src.slice(fnStart, fnStart + 400);
    expect(snippet).toContain('_findCharForSub(sub)');
  });

  it('_computeRiteWpCost uses _findCharForSub fallback', () => {
    const fnStart = src.indexOf('function _computeRiteWpCost');
    const snippet = src.slice(fnStart, fnStart + 400);
    expect(snippet).toContain('_findCharForSub(sub)');
  });

  it('handleExportSingle uses _findCharForSub', () => {
    const fnStart = src.indexOf('async function handleExportSingle');
    const snippet = src.slice(fnStart, fnStart + 400);
    expect(snippet).toContain('_findCharForSub(sub)');
  });

  it('handleExportAll parallel-map path uses _findCharForSub', () => {
    const fnStart = src.indexOf('async function handleExportAll');
    const snippet = src.slice(fnStart, fnStart + 1000);
    // Both loop and map path should be present
    const count = (snippet.match(/_findCharForSub\(sub\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it('_exportCityOverview uses _findCharForSub', () => {
    const fnStart = src.indexOf('function _exportCityOverview');
    const snippet = src.slice(fnStart, fnStart + 500);
    expect(snippet).toContain('_findCharForSub(s)');
  });
});
```

**Suite 3: `findCharacter` definition and CSV path preserved**

```js
describe('#819 — findCharacter definition and CSV path intact', () => {
  it('findCharacter function is still exported (definition intact)', () => {
    expect(src).toContain('export function findCharacter(');
  });

  it('matchSubmission still calls findCharacter (CSV import path unchanged)', () => {
    const fnStart = src.indexOf('export function matchSubmission');
    const snippet = src.slice(fnStart, fnStart + 400);
    expect(snippet).toContain('findCharacter(');
  });

  it('_wordOverlap helper is still present', () => {
    expect(src).toContain('function _wordOverlap(');
  });

  it('_containsScore helper is still present', () => {
    expect(src).toContain('function _containsScore(');
  });

  it('_findCharForSub definition is still present', () => {
    expect(src).toContain('function _findCharForSub(sub)');
  });
});
```

---

## Testing

Run after completing both steps:

```bash
cd /Volumes/EXT.2T.1/Git/Misc/TerraMortis && npx vitest run server/tests/fix.819.findcharacter-id-first.test.js
```

Also run a broader sanity check to confirm no existing tests regressed:

```bash
cd /Volumes/EXT.2T.1/Git/Misc/TerraMortis && npx vitest run
```

Manual smoke test: open the DT admin view in the browser with the local server running,
load a cycle with submissions, and confirm the processing queue renders character names
correctly. Confirm the feeding scene and jump strip both show characters.

---

## Dev Agent Record

_(To be completed by dev agent on implementation.)_

### Files Changed

### Completion Notes
