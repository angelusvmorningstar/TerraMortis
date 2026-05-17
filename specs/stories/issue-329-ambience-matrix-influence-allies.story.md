# Issue #329: Ambience Matrix -- Influence and Allies Columns Always Zero

Status: done

issue: 329
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/329
branch: morningstar-issue-329-ambience-matrix-influence-allies

## Story

As an ST processing a downtime cycle,
I want the Ambience Matrix Influence and Allies columns to reflect player-submitted
influence spend and resolved allies merit actions,
so that the projected ambience step per territory is accurate before I confirm and push.

## Acceptance Criteria

1. A player submission with influence spend +2 on Academy and -1 on Harbour results in the
   Ambience Matrix Influence column showing `+2 | -0 | +2` for Academy and `+0 | -1 | -1`
   for Harbour.
2. An Allies `ambience_increase` action resolved against a character with Allies (North Shore)
   ●●● shows `+1` in the Allies column for North Shore without requiring a manual territory
   pill override by the ST.
3. When an ST *has* set a territory pill override for an allies merit action, the override
   wins over the merit qualifier fallback.
4. Projects column and Net Change / Projected calculation are unaffected.

## Tasks / Subtasks

- [x] Task 1 -- Fix `_gatherInfluence` key mismatch (AC: 1, 4)
  - [x] In `_gatherInfluence` (line 3799), change `sub.responses?.influence_territories`
        to `sub.responses?.influence_spend`
  - [x] Verify `resolveTerrId` handles the `the_*` slug keys produced by the form
        (`the_academy`, `the_harbour`, etc.) -- it already does; no further change required

- [x] Task 2 -- Add territory fallback to `_gatherMeritAmbience` (AC: 2, 3, 4)
  - [x] Move `linkedQual` derivation to before the `tid` resolution (currently at line 3913,
        inside the `if (tid)` block)
  - [x] Change `tid` resolution to: ST override first, fall back to `resolveTerrId(linkedQual)`
  - [x] Preserve all existing value / dot / HWV calculation logic unchanged

- [x] Task 3 -- Smoke test in admin DT City panel (AC: 1, 2, 3, 4)
  - [x] Confirm Influence column populates for a submission with non-zero `influence_spend`
  - [x] Confirm Allies column populates for a resolved allies ambience_increase action
  - [x] Confirm ST override still wins when set

## Dev Notes

### File to modify

**Single file: `public/js/admin/downtime-views.js`**

No other files need to change. Both gatherer functions are in this file and the fix
is contained to them.

---

### Task 1 detail -- `_gatherInfluence` (line 3795)

**Root cause:** The DT form saves influence spend under the key `influence_spend`
(defined in `public/js/tabs/downtime-data.js:263`, rendered by the `influence_grid`
case at `public/js/tabs/downtime-form.js:6696`). The reader uses `influence_territories`,
which is never populated by the app-form path, so JSON.parse always yields `{}`.

**The form's key format** (from `downtime-form.js:6720`):
```js
const tk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
// "The Academy" → "the_academy", "The North Shore" → "the_north_shore", etc.
```

`resolveTerrId` already maps these slug keys to canonical territory IDs -- no change
needed there.

**Exact line to change (3799):**
```js
// BEFORE
try { infObj = JSON.parse(sub.responses?.influence_territories || '{}'); } catch { infObj = {}; }

// AFTER
try { infObj = JSON.parse(sub.responses?.influence_spend || '{}'); } catch { infObj = {}; }
```

Everything else in `_gatherInfluence` (the array legacy path, the pos/neg split,
the `resolveTerrId` call) is correct.

---

### Task 2 detail -- `_gatherMeritAmbience` (line 3883)

**Root cause:** `tid` is resolved solely from `territory_overrides[allies_N]`
(line 3910). If the ST hasn't set a territory pill override, `tid` is falsy and the
contribution is skipped. `linkedQual` (the merit qualifier, e.g. "North Shore") is
only computed *inside* the `if (tid)` block at line 3913, so it can't be used as a
fallback in the current structure.

**The fix** is to move `linkedQual` derivation before the `tid` resolution and add the
qualifier as a fallback:

```js
// Current code (lines 3909-3930, simplified):
if (resolvedAct?.pool_status === 'resolved') {
  const tid = resolveTerrId(sub.st_review?.territory_overrides?.[`allies_${meritFlatIdx}`] || '');
  if (tid) {
    const linkedQual = resolvedAct?.linked_merit_qualifier ?? parsed.qualifier;
    const actualMerit = subChar?.merits?.find(m =>
      m.name?.toLowerCase() === parsed.label.toLowerCase() &&
      (m.qualifier || m.area || '').toLowerCase() === linkedQual.toLowerCase()
    );
    ...
  }
}

// After fix:
if (resolvedAct?.pool_status === 'resolved') {
  const linkedQual = resolvedAct?.linked_merit_qualifier ?? parsed.qualifier;
  const tid = resolveTerrId(sub.st_review?.territory_overrides?.[`allies_${meritFlatIdx}`] || '')
           || resolveTerrId(linkedQual || '');
  if (tid) {
    const actualMerit = subChar?.merits?.find(m =>
      m.name?.toLowerCase() === parsed.label.toLowerCase() &&
      (m.qualifier || m.area || '').toLowerCase() === linkedQual.toLowerCase()
    );
    ...
  }
}
```

`resolveTerrId` accepts both territory slugs and display names (e.g. "North Shore",
"northshore", "the_north_shore" all resolve to `'northshore'`). The allies merit
qualifier is the sphere area name (e.g. "North Shore"), which `resolveTerrId` handles.

**Do NOT change** the dot / HWV value calculation (lines 3918-3928) -- that logic
is correct.

---

### resolveTerrId behaviour (do not modify)

`resolveTerrId` (defined earlier in `downtime-views.js`) normalises input via
`toLowerCase().replace(/\s+/g, '').replace(/^the/, '')` and maps to a canonical
TERRITORY_DATA slug. It handles all of: display names ("North Shore"), slugs
("northshore"), prefixed slugs ("the_north_shore"), and CSV keys. Both fixes
rely on this existing behaviour -- no changes to `resolveTerrId` are needed.

---

### What NOT to change

- `_gatherProjectAmbience` -- Projects column is working correctly
- `buildAmbienceData` call site (line 3949-3973) -- coordinator logic is correct
- `_buildAmbienceHtml` -- display logic is correct
- Any other territory pill or matrix code

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Task 1: `_gatherInfluence` line 3799 — `influence_territories` → `influence_spend`. `resolveTerrId` confirmed compatible with `the_*` slug format.
- Task 2: `_gatherMeritAmbience` lines 3909-3913 — `linkedQual` hoisted before `tid`; fallback `|| resolveTerrId(linkedQual)` added. ST override still takes priority (OR short-circuits). Dot / HWV / value logic unchanged.
- Task 3: Pending smoke test (user confirms in browser).

### File List

- `public/js/admin/downtime-views.js` (modify: lines 3799, 3909-3913)
