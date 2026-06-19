---
title: 'Discipline Profile: project disciplines never counted (3 root causes)'
type: 'fix'
issue: 912
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/912
branch: morningstar-issue-912-disc-profile-3-root-causes
created: '2026-06-19'
status: review
recommended_model: 'sonnet — two-function edit in one large file, surgical changes, moderate scope'
context:
  - public/js/admin/downtime-views.js
---

## Intent

**Problem:** The Discipline Profile matrix (DT City tab, Retally) has never correctly
counted disciplines from either validated feeding reviews or completed ambience/rote-feed
project actions. After PR #911 (issues #909 + #910), a follow-on commit introduced a
regression that wiped the profile entirely (shows "No discipline uses recorded yet" for
every cycle after Retally). Three distinct root causes are compounding:

### Bug A — Broken `slugToOid` build (regression from follow-on commit to #911)

`recomputeDisciplineProfile` (line 3650) and the display render (~line 12264) both build a
`slug→OID` map to translate territory slugs into the MongoDB `_id` strings used as profile
keys (ADR-002 contract). The follow-on commit changed this from iterating `cachedTerritories`
directly to iterating `TERRITORY_DATA` and calling `find()` to match against
`cachedTerritories`. If the MongoDB territory's `slug` or `name` doesn't exactly match any
`TERRITORY_DATA` entry, `find()` returns `undefined` and the territory is never added to the
map. In practice this silently empties the map for all territories, causing every Retally to
write an empty `discipline_profile`.

**Current broken code (both at line 3654 and line 12275):**
```js
const slugToOid = new Map();
for (const td of TERRITORY_DATA) {
  const cached = (cachedTerritories || []).find(
    t => t.slug === td.slug
      || (t.slug && TERRITORY_SLUG_MAP[t.slug] === td.slug)
      || t.name === td.name
  );
  if (cached) slugToOid.set(td.slug, String(cached._id));
}
```

**Fix — iterate `cachedTerritories` directly, add TERRITORY_SLUG_MAP aliases:**
```js
const slugToOid = new Map();
for (const t of (cachedTerritories || [])) {
  if (!t._id) continue;
  const oid = String(t._id);
  if (t.slug) {
    slugToOid.set(t.slug, oid);
    const canonical = TERRITORY_SLUG_MAP[t.slug];
    if (canonical && !slugToOid.has(canonical)) slugToOid.set(canonical, oid);
  }
  if (t.name) {
    const byName = TERRITORY_SLUG_MAP[t.name];
    if (byName && !slugToOid.has(byName)) slugToOid.set(byName, oid);
  }
}
```

This is safe regardless of what slugs MongoDB territories carry. If MongoDB has
`slug: 'the_north_shore'`, the entry sets both `slugToOid.get('the_north_shore')` and
`slugToOid.get('northshore')`. If it has `slug: 'northshore'` directly, pass-through entries
in `TERRITORY_SLUG_MAP` ensure `'northshore'` is set as well.

---

### Bug B — `pool_status !== 'validated'` rejects all resolved ambience projects

The project scan in `recomputeDisciplineProfile` (line 3692):
```js
if (proj.pool_status !== 'validated') continue;
```

Ambience projects that have been fully resolved through to an outcome outcome are stored with
`pool_status === 'obvious'`, `'neutral'`, or `'subtle'` — not `'validated'`. These are the
three terminal statuses set when the ST finalises the ambience change direction (obvious =
high-impact, neutral = moderate, subtle = low-impact). `_deriveActionRibbonState` (line 8486)
returns `'complete'` for these statuses, which is what the UI "Complete" chip shows. But the
discipline scan never reaches them.

`DONE_STATUSES` (line 280) already includes all three:
```js
const DONE_STATUSES = new Set(['validated', 'no_roll', 'no_feed', 'maintenance',
  'resolved', 'no_effect', 'skipped', 'obvious', 'neutral', 'subtle']);
```

**Fix:** Replace the single-status check with a set of "rolled-and-resolved" statuses:
```js
const DISC_PROJECT_STATUSES = new Set(['validated', 'obvious', 'neutral', 'subtle', 'resolved']);
if (!DISC_PROJECT_STATUSES.has(proj.pool_status)) continue;
```

Do NOT use `DONE_STATUSES` directly — `'no_roll'`, `'no_feed'`, `'maintenance'`,
`'no_effect'`, `'skipped'` indicate no roll was made and should still be excluded.

---

### Bug C — `_resolveProjectTerritory` misses `project_N_ambience_target`

`_resolveProjectTerritory` (line 11782) resolves which territory a project action belongs to.
Current code (lines 11782–11795):
```js
function _resolveProjectTerritory(sub, projIdx) {
  const overrides = sub.st_review?.territory_overrides || {};
  if (overrides[projIdx]) return overrides[projIdx];
  const n = projIdx + 1;
  const formVal = sub.responses?.[`project_${n}_territory`];
  if (formVal) {
    const id = resolveTerrId(formVal);   // OID → slug converter
    if (id) return id;
  }
  const raw = sub._raw || {};
  const proj = raw.projects?.[projIdx];
  const text = [proj?.description, proj?.desired_outcome, proj?.title].filter(Boolean).join(' ');
  return extractTerritoryFromText(text);
}
```

Since dt-form.25, ambience actions write the territory as a slug to
`responses.project_N_ambience_target` (e.g. `'northshore'`) and **no longer** set
`responses.project_N_territory` (the OID field used by other action types since #496.2).
If the ST has not manually overridden the territory in `st_review.territory_overrides`, the
function never finds the territory and falls through to free-text extraction, which returns
null for most submission text.

**Fix:** Read `project_N_ambience_target` as a slug-keyed field, normalise via
`TERRITORY_SLUG_MAP`, then fall back to `project_N_territory` (OID path):
```js
function _resolveProjectTerritory(sub, projIdx) {
  const overrides = sub.st_review?.territory_overrides || {};
  if (overrides[projIdx]) return overrides[projIdx];
  const n = projIdx + 1;
  const resp = sub.responses || {};
  // dt-form.25+: ambience actions write a slug to project_N_ambience_target
  const ambienceTarget = resp[`project_${n}_ambience_target`];
  if (ambienceTarget) {
    const id = TERRITORY_SLUG_MAP[ambienceTarget] ?? ambienceTarget;
    if (id) return id;
  }
  // Other project types write an OID to project_N_territory (since #496.2)
  const formVal = resp[`project_${n}_territory`];
  if (formVal) {
    const id = resolveTerrId(formVal);
    if (id) return id;
  }
  const raw = sub._raw || {};
  const proj = raw.projects?.[projIdx];
  const text = [proj?.description, proj?.desired_outcome, proj?.title].filter(Boolean).join(' ');
  return extractTerritoryFromText(text);
}
```

---

## Root cause files

| File | Lines | Role |
|------|-------|------|
| `public/js/admin/downtime-views.js` | 3650–3719 | `recomputeDisciplineProfile` — all three bugs live here |
| `public/js/admin/downtime-views.js` | 11782–11795 | `_resolveProjectTerritory` — Bug C |
| `public/js/admin/downtime-views.js` | 12264–12295 | Display render `slugToOid` — Bug A duplicate |
| `public/js/admin/downtime-constants.js` | 120–159 | `TERRITORY_SLUG_MAP` — used in fixes |
| `public/js/tabs/downtime-data.js` | ~122 | `TERRITORY_DATA` — canonical 5-territory reference |
| `tests/fix-909-910-dt-city-feed-terr-slug.spec.js` | all | Existing 7-test suite — must stay green |

---

## Tasks

### T1 — Fix `slugToOid` in `recomputeDisciplineProfile` (Bug A, instance 1)

**File:** `public/js/admin/downtime-views.js` lines 3654–3662

Replace:
```js
const slugToOid = new Map();
for (const td of TERRITORY_DATA) {
  const cached = (cachedTerritories || []).find(
    t => t.slug === td.slug
      || (t.slug && TERRITORY_SLUG_MAP[t.slug] === td.slug)
      || t.name === td.name
  );
  if (cached) slugToOid.set(td.slug, String(cached._id));
}
```

With:
```js
const slugToOid = new Map();
for (const t of (cachedTerritories || [])) {
  if (!t._id) continue;
  const oid = String(t._id);
  if (t.slug) {
    slugToOid.set(t.slug, oid);
    const canonical = TERRITORY_SLUG_MAP[t.slug];
    if (canonical && !slugToOid.has(canonical)) slugToOid.set(canonical, oid);
  }
  if (t.name) {
    const byName = TERRITORY_SLUG_MAP[t.name];
    if (byName && !slugToOid.has(byName)) slugToOid.set(byName, oid);
  }
}
```

Also update the JSDoc comment above `recomputeDisciplineProfile` from "Build slug→OID using
TERRITORY_DATA canonical slugs..." to reflect the new approach.

---

### T2 — Fix `pool_status` check in project scan (Bug B)

**File:** `public/js/admin/downtime-views.js` line 3692

Replace:
```js
if (proj.pool_status !== 'validated') continue;
```

With:
```js
const DISC_PROJECT_STATUSES = new Set(['validated', 'obvious', 'neutral', 'subtle', 'resolved']);
if (!DISC_PROJECT_STATUSES.has(proj.pool_status)) continue;
```

Place the `const DISC_PROJECT_STATUSES` immediately before the project loop (line ~3689) so
it is hoisted as far up in the function as is readable; it should NOT go to module scope since
it is local logic to this scan.

---

### T3 — Fix `_resolveProjectTerritory` to read ambience_target (Bug C)

**File:** `public/js/admin/downtime-views.js` lines 11782–11795

Replace the entire function body with the fix shown in the Bug C section above. Preserve the
JSDoc comment above the function; update it to add:
```
 * Priority:
 * 1. ST override saved to st_review.territory_overrides[projIdx]
 * 2. Ambience target slug: sub.responses.project_N_ambience_target (dt-form.25+)
 * 3. App form OID field: sub.responses.project_N_territory (non-ambience since #496.2)
 * 4. Free-text scan of description
```

---

### T4 — Fix `slugToOid` in the display render (Bug A, instance 2)

**File:** `public/js/admin/downtime-views.js` lines 12275–12283

The display render has an identical `slugToOid` block (inside the `if (!discDashCollapsed)`
branch, around line 12275). Apply the same fix as T1 — identical replacement. The display
render uses this map only for `slugToOid.get(t.slug)` on line ~12285, so the canonical alias
additions from T1 ensure territory columns appear correctly.

---

### T5 — Update and extend Playwright tests

**File:** `tests/fix-909-910-dt-city-feed-terr-slug.spec.js`

The existing AC-3 test uses a project submission with `pool_status: 'validated'`. After T2's
fix, we also need coverage for 'obvious', 'neutral', and 'subtle'. Add three new tests within
the existing `fix.909 regression: project-action disciplines still count` describe block:

**AC-3b: ambience project with pool_status 'obvious' is counted**
```js
const SUB_AMBIENCE_OBVIOUS = {
  ...SUB_AMBIENCE_PROJECT,
  _id: 'sub-912-obvious',
  projects_resolved: [{
    pool_status: 'obvious',
    pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8',
    action_type: 'ambience_change',
    roll: { successes: 3, exceptional: false },
  }],
};
test('AC-3b: ambience project with pool_status "obvious" counts Majesty', async ({ page }) => {
  await setup(page, [SUB_AMBIENCE_OBVIOUS]);
  await navigateToCityPhase(page);
  await page.waitForSelector('#disc-retally-btn', { timeout: 8000 });
  const putPromise = page.waitForRequest(req =>
    req.method() === 'PUT' && req.url().includes('/api/downtime_cycles/')
  );
  await page.click('#disc-retally-btn');
  const putReq = await putPromise;
  const profile = putReq.postDataJSON()?.discipline_profile;
  expect(profile).toBeTruthy();
  expect(profile['terr-ns-909']?.['Majesty']).toBeGreaterThanOrEqual(1);
});
```

**AC-3c: pool_status 'neutral'** — same structure, `pool_status: 'neutral'`

**AC-3d: pool_status 'subtle'** — same structure, `pool_status: 'subtle'`

Also add a fixture for Bug C (project with `project_1_ambience_target` instead of
`project_1_territory`, no ST territory override):

**AC-3e: ambience project reads project_N_ambience_target for territory**
```js
const SUB_AMBIENCE_TARGET_SLUG = {
  ...SUB_AMBIENCE_PROJECT,
  _id: 'sub-912-ambtarget',
  responses: {
    project_1_action: 'ambience_change',
    project_1_ambience_target: 'northshore',
    // NO project_1_territory — simulates dt-form.25+ behaviour
  },
  projects_resolved: [{
    pool_status: 'validated',
    pool_validated: 'Presence 3 + Expression 2 + Majesty 3 = 8',
    action_type: 'ambience_change',
    roll: { successes: 2, exceptional: false },
  }],
  st_review: { territory_overrides: {} }, // no override — must use ambience_target
};
test('AC-3e: project with project_N_ambience_target resolves territory correctly', async ({ page }) => {
  // ...same PUT-capture pattern; expect profile['terr-ns-909']['Majesty'] >= 1
});
```

Run after each change to confirm tests pass.

---

### T6 — Manual verification checklist

After all code changes are committed and pushed to dev:

1. Open DT City → current cycle → press **Retally**
2. Discipline Profile matrix should show disciplines for all five territories (or at least
   those where submissions are recorded)
3. Anichka's Cruac should appear in the territory where Fostering Mysticism was submitted
   (Ambience Change, pool_status 'obvious'/'neutral'/'subtle')
4. Check that feeding contributions are also present (prior behaviour should be preserved)
5. Smoke-check any character with a confirmed ambience project — "Complete" chip in the
   processing queue should correspond to a discipline entry in the profile

---

## What not to change

- `DONE_STATUSES` (line 280) — leave as-is; it is used for other UI purposes
- The feeding scan's `rev.pool_status !== 'validated'` check (line 3667) — feeding reviews
  only reach 'validated' as a terminal status; this check is correct for feeding
- `_feedTerrIdsForSub` — fixed correctly in PR #911; do not touch
- `resolveTerrId` — the OID→slug converter; still correct for `project_N_territory` (OID)
  lookups in `_resolveProjectTerritory`; do not change its signature or behaviour
- `TERRITORY_DATA` iteration in the display render's `terrList` filter (line ~12285):
  `TERRITORY_DATA.filter(t => terrOidSet.has(slugToOid.get(t.slug)))` — once `slugToOid`
  is built correctly (T1/T4), this filter will resolve correctly; no change needed there

---

## Dev Notes

### Key invariants

- **ADR-002**: `discipline_profile` on the cycle document is keyed by MongoDB territory `_id`
  (string), not by slug. All reads and writes must use OIDs, not slugs. The `slugToOid` map
  is the bridge.
- **`ensureTerritories()`** fetches from `/api/territories` and caches in `cachedTerritories`.
  Falls back to `TERRITORY_DATA.map(t => ({...t}))` (no `_id` fields) if the API call fails.
  T1's fix guards with `if (!t._id) continue` to handle this gracefully.
- **TERRITORY_SLUG_MAP** (imported at line 3833 as `TERRITORY_SLUG_MAP = _TERRITORY_SLUG_MAP_BASE`).
  Pass-through entries for 'academy'→'academy', 'northshore'→'northshore' etc. mean that a
  MongoDB territory with canonical slugs (`slug: 'northshore'`) will correctly alias itself.
- **`project_N_ambience_target`** vs **`project_N_territory`**: `_ambience_target` is a
  TERRITORY_DATA slug (e.g. 'northshore'); `_territory` is a MongoDB OID string. They require
  different resolvers. Bug C's fix reads ambience_target via `TERRITORY_SLUG_MAP` (slug → slug
  normalisation), then falls through to `resolveTerrId` (OID → slug) for `_territory`.

### Module-level variables touched

- `cachedTerritories` (line 83) — the territories array, may be null before first fetch
- `submissions` (module-level) — all current cycle submissions iterated in both scans
- `TERRITORY_DATA` (imported from `../tabs/downtime-data.js`) — for the display terrList
  filter and text-extraction fallback only; NOT for slugToOid build after this fix

### Testing framework

No test framework on the server. The project uses **Playwright** for E2E browser tests.
Test file: `tests/fix-909-910-dt-city-feed-terr-slug.spec.js`. Run with:
```
npx playwright test tests/fix-909-910-dt-city-feed-terr-slug.spec.js
```
The server runs at `localhost:3000` (Node, `node index.js`). The test server runs at
`localhost:8080` (http-server). Both must be running before tests execute.

Use the Playwright `waitForRequest` pattern with `req.method() === 'PUT'` (not PATCH) —
`updateCycle` uses `apiPut` which sends HTTP PUT.

### Prior story context

- `fix.909-910.dt-city-feed-terr-slug-resolution.story.md` — the story for PR #911; Dev
  Agent Record has the full history of what was tried and what broke.
- The follow-on commit to #911 (commit `6592d7f4`) introduced Bug A. That commit's intent
  was correct (handle TERRITORY_SLUG_MAP aliases for MongoDB variant slugs) but the
  direction of iteration (TERRITORY_DATA → find in cached) is fragile; T1 reverses it.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

None — all three bugs diagnosed before story creation; implementation was surgical.

### Completion Notes List

- T1: `slugToOid` in `recomputeDisciplineProfile` (line ~3654) reverted to iterating
  `cachedTerritories` directly with TERRITORY_SLUG_MAP aliases. Guards `!t._id` for the
  TERRITORY_DATA fallback case where no MongoDB `_id` exists.
- T2: Project scan pool_status check replaced with `DISC_PROJECT_STATUSES` Set accepting
  `'validated'`, `'obvious'`, `'neutral'`, `'subtle'`, `'resolved'`. The feeding scan's
  `'validated'-only` check is intentionally untouched (correct for that path).
- T3: `_resolveProjectTerritory` JSDoc updated to reflect 4-priority resolution chain
  (override → ambience_target → OID territory → free text). The ambience_target code itself
  was already present from the follow-on commit to #911.
- T4: `slugToOid` in the display render (line ~12286) fixed identically to T1.
- T5: Pre-existing test stale name (PATCH→PUT) corrected. Added 4 new tests:
  AC-3b (pool_status 'obvious'), AC-3c ('neutral'), AC-3d ('subtle'), AC-3e
  (project_1_ambience_target slug, no ST override). 11/11 tests passed.
- T6: Manual verification pending smoke check on dev after PR merge.

### File List

- `public/js/admin/downtime-views.js` — T1 (slugToOid in recomputeDisciplineProfile), T2 (DISC_PROJECT_STATUSES), T3 (JSDoc update), T4 (slugToOid in display render)
- `tests/fix-909-910-dt-city-feed-terr-slug.spec.js` — T5 (AC-3b/3c/3d/3e added, stale PATCH→PUT name fixed)
- `specs/stories/fix.912.disc-profile-3-root-causes.story.md` — this story file

### Change Log

- 2026-06-19: Implemented T1–T5. Three root causes fixed: slugToOid regression (Bug A,
  both instances), pool_status check missing terminal statuses (Bug B), JSDoc-only update
  for already-fixed Bug C. 4 new Playwright tests added; 11/11 green.
