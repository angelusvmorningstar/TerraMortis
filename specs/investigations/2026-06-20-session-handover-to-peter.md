# Session handover → Peter (2026-06-20)

Angelus here. I touched DT territory-resolution code that overlaps your #920 area, and I hit a pre-existing test failure that's yours to be aware of. Read this before you next work in `downtime-story.js`, `feeding-tab.js`, or the territory-pulse path.

## What I changed (#922 — shipped to dev + main)

**One line**, `public/js/admin/downtime-story.js`, `_feedTerrEntries()` (~line 3076):

```js
// before
const rawId = TERRITORY_SLUG_MAP[slug];
// after
const rawId = TERRITORY_SLUG_MAP[slug] || resolveTerrId(slug);
```

**Why:** post-ADR-002 the `feeding_territories` grid keys are Mongo `_id`s, which aren't in `TERRITORY_SLUG_MAP`, so real territories collapsed to `{ id: 'barrens' }`. In `compilePushOutcome` the Territory Pulse loop `continue`s on `id === 'barrens'` (`:3572`), so **every real-territory feeder silently lost their Territory Pulse from the pushed downtime report**. The fallback reuses your-era `resolveTerrId` (`_id → slug` via `_currentTerritories`); legacy slug keys still hit the map first, so no regression.

- PR #923 → dev → main (pushed, deploy triggered). Issue #922 closed.
- New spec: `tests/issue-922-dt-story-pulse-territory-resolve.spec.js` (3 tests, red-green verified).
- Story: `specs/stories/fix.922.dt-story-feeding-territory-barrens.story.md`.

**This is the same root-cause class as your #920.** Same bug (`_id`-post-migration territory keys), different surface/file. Worth noting if you ever consolidate.

## Surface clarification (so we don't double-fix)

The player's original report ("my DT feeding says the Barrens") was the **feeding tab** — `public/js/tabs/feeding-tab.js` `computeVitateTally` — which **your #920 already fixes**. #922 is a *different* surface (the pushed-report Territory Pulse) found while diagnosing. The player won't see either until the main deploy lands.

## Dead code you'll trip over near here

Post-#886, `getApplicableSections` (`downtime-story.js:1148`) no longer includes `territory_reports`. So two things are now dead and I left them alone:
- the `key === 'territory_reports'` branch in `compilePushOutcome` (`:3601`)
- `renderTerritoryReports` (`:3216`, switch `:1458`, save re-render `:4225`)

If you intend territory reports to still publish, that's a real gap — the section was dropped from the list. Flagging, not fixing.

## Issue I flagged (NOT mine, pre-existing — for your awareness)

Running the territory/pulse regression batch, **5 tests fail on dev/main**, and they fail identically with my #922 change reverted — so they predate this work:

- `tests/fix-814-dt-territory-resolveterrid.spec.js` — AC1 "project Copy Context shows discipline activity, not 'None detected'" (discipline profile OID key, Bug A). 1 failure.
- `tests/issue-332-territory-pulse-influence-exceptional.spec.js` — AC1/AC2 influence contributor in the pulse **prompt** (covenant name + spend total). 4 failures.

Both are in the territory-pulse / prompt area you've worked in. Not triaged or filed yet — left for you to call (could be a real regression on dev, or stale specs). `issue-922` + `fix-470` are green, so the pulse render/resolve path itself is fine.

## Standing consolidation

This is now the Nth instance of the `_id`-post-migration territory-resolution bug (yours #920, #733; mine #922; plus #814). #816 / #496 already track a single `normaliseTerritoryId()` boundary to kill the whole class. When you next touch this, that's the clean fix.
