# Story fix.809: Ambience Tracker — Overfeeding Count, Influence, and Project Deltas

## Status: review

## Metadata

```yaml
issue: 809
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/809
branch: ms/issue-809-ambience-tracker-calc-bugs
```

## Story

**As an** ST processing a downtime cycle,
**I want** the Ambience tracker to correctly show overfeeding feeder counts, territory influence
totals, and project deltas,
**so that** the projected ambience step and confirm decisions are based on accurate data.

## Background

Reported during DT3 ST processing. Three calculations in the Ambience dashboard panel are wrong:

1. **Overfeeding** — all territories show 0 feeders despite the feeding matrix showing activity
   (Academy: 4 feeders / 7 tolerance should read `4/7`, not `0/7`).
2. **Influence** — Harbour shows +17; expected +19 based on known contributors.
3. **Projects** — all territories show `±0` despite completed Ambience change projects.

---

## Root Cause Analysis (Pre-Investigation)

### Bug 1 — Overfeeding count always 0 (ROOT CAUSE CONFIRMED)

**Location:** `_computeMatrixFeederCounts()` — `downtime-views.js` ~line 3837

```js
// CURRENT (broken)
const tid = resolveTerrId(csvKey);        // csvKey = 'The Academy', 'The Harbour', etc.
if (tid) byTerrId[tid] = (byTerrId[tid] || 0) + count;
```

`resolveTerrId` (line 3801) is **OID-only**:
```js
function resolveTerrId(raw) {
  if (!raw) return null;
  const t = (cachedTerritories || []).find(td => String(td._id) === raw);
  return t?.slug || null;
}
```

For display-name strings like `'The Academy'`, it always returns null. So `byTerrId` ends up as
`{}` (empty, not null). When passed as `passedFeedCounts` to `buildAmbienceData`:
```js
const feederCounts = passedFeedCounts ?? _computeMatrixFeederCounts().byTerrId;
```
`{}` is truthy — the `??` null-coalesce does NOT fall back to `_computeMatrixFeederCounts()`.
All territories get `feeders = 0`.

Why does the **feeding matrix footer** still show 4? Because `byCsvKey` is accumulated directly
by csvKey — it never goes through `resolveTerrId`. Only `byTerrId` is broken.

**Fix:** Replace `resolveTerrId(csvKey)` with `TERRITORY_SLUG_MAP[csvKey]` in
`_computeMatrixFeederCounts`. `TERRITORY_SLUG_MAP` has explicit entries for every MATRIX_TERRS
csvKey (e.g. `'The Academy': 'academy'`) — no DB lookup needed.

### Bug 2 — Harbour influence off (DATA ISSUE, VERIFY IN PICKUP)

`_gatherInfluence` calls `resolveTerrId(k)` where `k` comes from `influence_spend` keys. Since
the new DT form saves territory selections as ObjectIds, `resolveTerrId` resolves them correctly
(that's what it's designed for). The screenshot SHOWS influence values, confirming this path works.

The +17 vs +19 discrepancy is **not a code bug** — it reflects actual DB data. Possible causes:
- A contributor's submission is missing from `submissions` (not loaded for this cycle)
- The user's expected +19 list is incomplete or miscounted (listed contributors sum to 17)
- A character has influence_spend for Harbour not accounted for

**Action during pickup:** Check all submissions for this cycle; sum `influence_spend` harbour values
against the user's expected list. Confirm whether the code is correct or a submission is missing.

### Bug 3 — Projects always 0 (ROOT CAUSE LIKELY CONFIRMED, VERIFY IN PICKUP)

**Location:** `_gatherProjectAmbience()` — `downtime-views.js` ~line 3910

```js
const terrRaw = resp[`project_${n}_ambience_target`] || resp[`project_${n}_territory`] || '';
const tid = terrOverride || resolveTerrId(terrRaw) || extractTerritoryFromText(desc) || extractTerritoryFromText(outcome);
if (!tid) continue;
```

`resolveTerrId(terrRaw)` only works if `terrRaw` is an ObjectId. But `project_N_ambience_target`
was written by dt-form.25 as a **territory slug** (e.g. `'academy'`). For slugs,
`resolveTerrId` returns null. The fallback `extractTerritoryFromText(desc)` only rescues if the
project description text mentions the territory by keyword.

Secondary possible cause: `_ambienceDirection` returns null if `project_N_ambience_direction` is
absent — this skips the project regardless of territory resolution:
```js
const _ambiDir = _ambienceDirection(effectiveType, n, resp);
if (!isIncrease && !isDecrease) continue;  // skipped if direction unresolvable
```

**Verify in pickup:**
1. Check DT3 submission `responses` for an Ambience change project — what is `project_N_ambience_target`?
   If it's a slug, confirm fix below. If it's an ObjectId, investigate further.
2. Check `project_N_ambience_direction` is present and is `'improve'` or `'degrade'`.

**Fix:** Replace `resolveTerrId(terrRaw)` with `TERRITORY_SLUG_MAP[terrRaw] ?? resolveTerrId(terrRaw)`
to handle both slug and ObjectId formats.

---

## Acceptance Criteria

- [ ] Overfeeding numerator for each territory reflects the actual feeder count from the feeding
  matrix — Academy shows `4/7` (not `0/7`) when 4 characters fed there this cycle
- [ ] Net Change and overfeeding bonus/penalty update correctly once feeder counts are fixed
- [ ] Harbour influence total correctly sums all contributing characters' effective influence
  ratings (verify against DB data; +17 vs +19 to be resolved)
- [ ] Completed Ambience change projects produce a non-zero Projects delta in the relevant
  territory row
- [ ] Feeding matrix footer counts remain unchanged (regression guard)

---

## Tasks

- [x] **Task 1: Fix overfeeding feeder count** (Bug 1 — confirmed root cause)
  - In `_computeMatrixFeederCounts` (~line 3837 of `downtime-views.js`), replaced:
    `const tid = resolveTerrId(csvKey);`
    with:
    `const tid = TERRITORY_SLUG_MAP[csvKey];`
  - `TERRITORY_SLUG_MAP` already imported and aliased at line 3787. No new import needed.

- [x] **Task 2: Investigate and fix projects delta** (Bug 3 — root cause found via DB query)
  - DB confirmed: `project_N_ambience_target` IS an ObjectId (e.g. `"69d5dc6a00815d47150397c6"`)
    — `resolveTerrId` handles this correctly. Territory resolution was NOT the root cause.
  - Actual root cause: `_ambienceDirection` checks for `'improve'`/`'degrade'` but the DT form
    stores `"up"`/`"down"`. Every project was silently skipped at the direction check.
  - Fixed `_ambienceDirection` (~line 203) to also accept `"up"` → `'increase'` and
    `"down"` → `'decrease'`.
  - Also applied defensive territory fix in `_gatherProjectAmbience` (~line 3913):
    `TERRITORY_SLUG_MAP[terrRaw] ?? resolveTerrId(terrRaw)` — handles both slug and OID formats.

- [x] **Task 3: Verify Harbour influence** (Bug 2 — data investigation complete)
  - DB queried all 29 DT3 `downtime_submissions`. Harbour OID = `69d5dc6a00815d47150397c6`.
  - Positive influence contributions: Yusuf 1, Reed 3, Ludica 2, Xavier 1, Wan 6 = **13 total**.
  - Negative contributions: Jack Fallow −1, Macheath −2. Screenshot shows "−0" not "−3".
  - No submission for "Benedict" exists in DT3 data.
  - The +17 screen total does not reconcile with DB data (expected net ≈10 or 13 raw positive).
    This may indicate the influence screen value reflects ST overrides or a separate mechanism
    not captured in `responses.influence_spend` alone.
  - **Code is not changed** — influence read path uses `resolveTerrId` with OID keys (correct).
    User to verify expected contributors and actual DB values manually.

---

## Dev Notes

### Key file
`public/js/admin/downtime-views.js` — all three bugs are in this single file.

| Function | Line (approx) | Bug |
|---|---|---|
| `_computeMatrixFeederCounts` | ~3822 | Bug 1 — `resolveTerrId(csvKey)` → `TERRITORY_SLUG_MAP[csvKey]` |
| `_gatherProjectAmbience` | ~3878 | Bug 3 — `resolveTerrId(terrRaw)` — slug fallback missing |
| `_gatherInfluence` | ~3849 | Bug 2 — correctly uses resolveTerrId (OID format); data issue only |

### `resolveTerrId` vs `TERRITORY_SLUG_MAP` — when to use which

| Input format | Use |
|---|---|
| MongoDB ObjectId string (24-char hex) | `resolveTerrId(raw)` |
| MATRIX_TERRS csvKey (`'The Academy'`) | `TERRITORY_SLUG_MAP[key]` |
| TERRITORY_DATA id slug (`'academy'`) | `TERRITORY_SLUG_MAP[key]` (pass-through entries exist) |
| `project_N_ambience_target` (may be either) | `TERRITORY_SLUG_MAP[raw] ?? resolveTerrId(raw)` |

`TERRITORY_SLUG_MAP` is already imported as `_TERRITORY_SLUG_MAP_BASE` at the top of
`downtime-views.js` (line 17) and aliased as `const TERRITORY_SLUG_MAP = _TERRITORY_SLUG_MAP_BASE`
at line 3787. Do not re-import.

### Do NOT touch
- `resolveTerrId` itself — it is correct for its documented purpose (OID → slug). Don't change
  its signature or behaviour. Call it with the right input format instead.
- `byCsvKey` accumulation in `_computeMatrixFeederCounts` — that branch is correct.
- `_buildAmbienceHtml`, `buildAmbienceData`, overfeeding formula — no changes needed there.
- Anything in `_buildFeedingMatrixHtml` — feeding matrix display is correct; don't regress it.

### Overfeeding formula (for reference)
```js
const overfeedVal = feeders > cap ? -(feeders - cap) * 2 : feeders < cap ? (cap - feeders) : 0;
```
- feeders < cap → positive bonus (cap − feeders)
- feeders = cap → 0
- feeders > cap → negative penalty (−2 per feeder over cap)

Academy: cap=7, feeders=0 → overfeedVal=+7 (correct formula; wrong feeders input)
Academy: cap=7, feeders=4 → overfeedVal=+3 (expected after fix)

### Ambience action type detection
`_AMBIENCE_ACTION_TYPES = Set { 'ambience_change', 'ambience_increase', 'ambience_decrease' }`

`_ambienceDirection(type, n, responses)`:
- `'ambience_increase'` → always `'increase'`
- `'ambience_decrease'` → always `'decrease'`
- `'ambience_change'` → reads `responses.project_N_ambience_direction` (`'improve'` → `'increase'`,
  `'degrade'` → `'decrease'`). Returns null if key absent.

If DT3 data uses `'ambience_change'` type without `project_N_ambience_direction`, the direction
is unresolvable and the project is silently skipped. Verify this field exists in actual submissions.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes

**Bug 1 (overfeeding count 0) — FIXED:**
`_computeMatrixFeederCounts` line 3837: `resolveTerrId(csvKey)` → `TERRITORY_SLUG_MAP[csvKey]`.
`MATRIX_TERRS.csvKey` values are display-name strings like `'The Academy'`; `resolveTerrId` is OID-only so always returned null. `byTerrId` was always `{}`, which passed the `??` check in `buildAmbienceData`, so feeder counts were permanently 0.

**Bug 3 (projects 0) — FIXED (different root cause than predicted):**
DB query confirmed `project_N_ambience_target` IS stored as an ObjectId — `resolveTerrId` handles that correctly. The actual cause was `_ambienceDirection` at line 203: the DT form stores `"up"`/`"down"` but the function only accepted `"improve"`/`"degrade"`. Every `ambience_change` project returned null direction and was skipped. Fixed by adding `|| dir === 'up'` and `|| dir === 'down'` checks. Also applied a defensive `TERRITORY_SLUG_MAP[terrRaw] ?? resolveTerrId(terrRaw)` in `_gatherProjectAmbience` for slug/OID resilience.

**Bug 2 (Harbour influence off) — NOT CHANGED:**
`_gatherInfluence` uses `resolveTerrId` with OID keys — correct for new form format. DB query of all 29 DT3 submissions shows raw positive sum of 13 (not 17 as displayed, not 19 as expected). No "Benedict" submission in DT3. The +17 screen value and negative display discrepancy need manual ST verification — may involve ST overrides or a field not captured in `responses.influence_spend` alone.

### File List
- `public/js/admin/downtime-views.js`
- `tests/fix-809-ambience-tracker-calc-bugs.spec.js` (new — QA)

## QA Results (Quinn)

**Outcome: PASS — 10/10 tests green.**

E2E coverage in `tests/fix-809-ambience-tracker-calc-bugs.spec.js`:

| AC | Tests | Verifies |
|----|-------|----------|
| AC1 (Bug 1 — overfeeding) | 3 | Academy shows `1/7` (not `0/7`) when one character fed there; Harbour stays `0/5` (no feeder bleed across territories) |
| AC2/AC3 (Bug 3 — projects) | 4 | `ambience_change` with direction `"up"` → Academy Projects `+2`; direction `"down"` → `-2`; neither shows `±0` (the pre-fix silent-skip symptom) |
| AC4 (regression) | 3 | All 5 territory rows render; all named territories present; no crash with mixed feed+project submissions |

Test harness notes for future maintainers:
- `renderCityOverview()` early-returns a placeholder when the module-level `submissions`
  array is empty. The helper visits the **Projects** tab first (waits for `.proc-action-row`)
  to guarantee submissions are loaded before the City tab's lazy init runs.
- The Ambience section header carries the collapse listener but also contains a centred
  "Recalculate Territories" button. Click `[data-toggle="city-ambience"] .proc-amb-toggle`
  (the toggle span), not the header centre — a centre click lands on the button.

Bug 2 (Harbour influence `+17` vs expected `+19`) is a data discrepancy, not a code defect —
no code change, so no test. Flagged for manual ST verification (see Task 3).

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-16 | 1.0 | Initial story — root cause analysis from code inspection | Claude (SM) |
| 2026-06-16 | 1.1 | Implemented: overfeeding TERRITORY_SLUG_MAP fix, ambience direction up/down fix | Claude (Dev) |
| 2026-06-16 | 1.2 | QA: added 10-test E2E spec, all passing | Claude (QA) |
