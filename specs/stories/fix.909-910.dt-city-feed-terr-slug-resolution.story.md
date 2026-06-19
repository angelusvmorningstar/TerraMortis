# fix.909+910 — DT City: feeding territory slug mis-routing in discipline profile and territory pulse

```yaml
issue: 909
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/909
issue_2: 910
issue_url_2: https://github.com/angelusvmorningstar/TerraMortis/issues/910
branch: morningstar-issue-909-910-dt-city-feed-terr-slug
status: review
type: bug
```

## Story

As an ST, when I view the Discipline Profile in DT Processing and generate a
Territory Pulse prompt, I want both features to accurately count/list disciplines
and feeders from all validated feeding submissions, so I have correct information
for storytelling decisions.

## Acceptance criteria

- [ ] **AC-1 (#909)** — After Retally, disciplines from validated feeding reviews
  appear in the Discipline Profile per territory (previously: feeding disciplines
  never counted; only project-sourced disciplines appeared)
- [ ] **AC-2 (#910)** — The Territory Pulse prompt `feeders` array is populated for
  territories with feeding submissions (previously: always empty for every territory)
- [ ] **AC-3** — Project-action discipline tally (ambience/rote-feed) continues to
  work correctly (existing behaviour preserved)
- [ ] **AC-4** — `_feedTerrIdsForSub` returns `[]` for submissions with
  `pool_status === "no_feed"` (existing gate preserved)
- [ ] **AC-5** — `_feedTerrIdsForSub` returns `[]` when all `feeding_territories`
  values are `"none"` or `"Not feeding here"` (existing filter preserved)

## Scope

**In scope**
- `public/js/admin/downtime-views.js` — two one-line fixes:
  1. `recomputeDisciplineProfile()` line 3664 (#909)
  2. `_feedTerrIdsForSub()` line 2362 (#910)

**Out of scope**
- `_gatherInfluence()` — influence_spend keys are OIDs; `resolveTerrId` is correct
  there and requires no change
- Project-action discipline scan (lines 3679–3699) — correct, no change needed
- `_buildTerritoryPulsePromptText` call site — no change needed once
  `_feedTerrIdsForSub` returns correct values

---

## Dev Notes

### Root cause (shared)

`resolveTerrId(raw)` (`downtime-views.js:3837`) is an OID → slug converter: it
finds the territory where `String(td._id) === raw` and returns `t.slug`. It is
**only correct when `raw` is a MongoDB OID string**.

`feeding_territories` JSON (from `sub.responses.feeding_territories`) is keyed by
territory **slugs** (e.g. `"north-shore"`, `"second-city"`). These are written by
the player form's territory pill switcher which uses TERRITORY_DATA slugs. Passing
a slug to `resolveTerrId` finds no `_id` match and returns `null`.

Both bugs are instances of calling `resolveTerrId(slug)` when the key is already
a slug.

### Fix 1 — `recomputeDisciplineProfile` (#909) at line 3664

```js
// CURRENT (broken) — line 3664
.map(([k]) => slugToOid.get(resolveTerrId(k)))

// FIXED — k is already a slug; slugToOid is built as slug → OID
.map(([k]) => slugToOid.get(k))
```

`slugToOid` is built at line 3653–3656:
```js
const slugToOid = new Map();
for (const t of (cachedTerritories || [])) {
  if (t.slug) slugToOid.set(t.slug, String(t._id));
}
```
So `slugToOid.get(slug)` is the correct lookup — no intermediate conversion needed.

### Fix 2 — `_feedTerrIdsForSub` (#910) at line 2362

```js
// CURRENT (broken) — line 2362
const id = resolveTerrId(slug);   // slug in → null out
if (id) ids.add(id);

// FIXED — keys are slugs; function is supposed to return slugs (per the comment
// at line 2396 in its consumer)
ids.add(slug);
```

The function's consumer at line 2398 compares against `territory.slug`, so
returning slugs (not OIDs) is correct. No conversion needed at all.

### Reference: `resolveTerrId` definition (line 3837)

```js
function resolveTerrId(raw) {
  if (!raw) return null;
  const t = (cachedTerritories || []).find(td => String(td._id) === raw);
  return t?.slug || null;
}
```

Direction: OID string in → slug out. Only call this when you have an OID and need
a slug. `feeding_territories` keys are slugs; `influence_spend` keys are OIDs
(written as OIDs since #496.2 — `_gatherInfluence` uses `resolveTerrId` correctly).

### Confirming feeding_territories key format

`downtime-form.js:513–530` (territory_grid render) and the feeding territory pill
switcher (`renderFeedingTerritoryPills`) write slug keys. Example stored value:
`{"north-shore": "feeding_rights", "second-city": "none"}`.

### The correct pattern for slug → OID (for reference)

The project-action scan (lines 3679–3699) gets this right:
```js
const slug = _resolveProjectTerritory(sub, pIdx);   // returns slug
const terrOid = slug ? slugToOid.get(slug) : null;  // slug → OID directly
```
Fix 1 adopts this same approach.

---

## Testing

Create `tests/fix-909-910-dt-city-feed-terr-slug.spec.js` with Playwright E2E tests
covering both fixes.

Both fixes are in server-rendered admin UI logic that runs in the browser, so
Playwright with `page.route()` mocking is the right approach (same pattern as
other admin DT tests).

**Test setup:** Boot admin app via `localTestLogin()` bypass, mock `/api/*` routes
to return controlled submissions. Trigger the DT Processing panel rendering.

**AC-1 test (recomputeDisciplineProfile / #909):**

The discipline profile is stored on the cycle document and read by the processing
panel. The simplest approach is to mock `GET /api/downtime_cycles` to return a
cycle where `discipline_profile` is pre-computed (since `recomputeDisciplineProfile`
runs on save events, not on initial render).

Alternative: call `recomputeDisciplineProfile()` directly via `page.evaluate` if
the function is accessible on `window`. Check first.

Simpler fallback: unit-test the function logic via a mock environment — read the
function body, extract the slug→OID mapping logic, and verify directly. But since
there's no test framework for JS modules, stick with Playwright.

**AC-2 test (_feedTerrIdsForSub / #910):**

The Territory Pulse prompt builder (`_buildTerritoryPulsePromptText`) is called
when the ST views the Territory Pulse panel. Mock submissions to include a character
with `feeding_territories: '{"north-shore":"feeding_rights"}'` and a validated
`feeding_review`. Then trigger the Territory Pulse panel render and assert the
feeder section includes that character's name.

**AC-3, AC-4, AC-5:** Guard against regressions with negative fixtures (no-feed
submission, all-none feeding territories).

---

## Dev Agent Record

### Files changed

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Line 3636: `.map(([k]) => slugToOid.get(k))` — removed `resolveTerrId` wrapper; line 2332: `ids.add(slug)` — removed `resolveTerrId` call |
| `tests/fix-909-910-dt-city-feed-terr-slug.spec.js` | New: 7 Playwright tests, all passing |

### Completion notes

Both one-line fixes applied. Root cause: `resolveTerrId(raw)` converts OID→slug; both call sites passed slugs (already the right format), so it returned null and silently dropped every feeding territory. Fix: remove the intermediate conversion and use the slug key directly.

- AC-1 (#909): Retally now writes feeding disciplines to `discipline_profile` per territory OID
- AC-2 (#910): Territory Pulse prompt feeder list now populated from `_feedTerrIdsForSub`
- AC-3: Project-action disciplines (ambience/rote-feed) unaffected — confirmed by test
- AC-4: `no_feed` gate preserved
- AC-5: `"none"` value filter preserved

7/7 tests pass in 21.4s.

### Change log

- 2026-06-19: fix #909+#910 — feeding territory slug mis-routing in discipline profile tally and territory pulse feeder list
