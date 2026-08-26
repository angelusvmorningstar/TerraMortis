# Epic ADMR: Admin Feature Retirement (TM Admin Handover)

**Opened** 2026-08-26, scoping session. Note the short code is `ADMR`, not `AR` - `AR` is already a
retired historical epic code (see `specs/stories/sprint-status.yaml`'s own WORKFLOW NOTES: "Historical
epics (1-7, GC, DP, OR, AR) are all complete").

## Goal

Retire the admin-authoring code in this repo that TM Admin (the new shared ST-only admin app) now
genuinely covers, so this repo stops carrying two competing writers against the same collections -
without breaking any live gameplay data-serving path this repo's own app still depends on.

**Getting smaller is the point, not a side effect** - the same framing Epic DBO used for `tm_suite`
itself applies here to this repo's own admin surface.

## Why

TM Admin's own Epic 6 (admin-retirement, on its side) ported Bloodlines, Devlog, and part of Data
Portability off this repo's `admin.html`. This repo's own side of that handover - actually removing
the now-redundant code - was never scoped as its own story. Leaving a second, unused-but-still-live
authoring surface around is exactly the drift class Epic BL/Epic ECM/Epic DBO's own DBO-8 already
existed to close for other domains: two writers against one collection, one of them silently going
stale.

## Verified before scoping (2026-08-26) - do not re-litigate without new evidence

A prior claim that "TM Admin's editor is done, retire TM Game's" was checked against a real handler
count in an unrelated feature (the character/sheet editor) and found overstated - only ~11 of ~60
editor handlers were actually ported (see memory `project-cross-repo-redundancy-review-2026-08-25`).
This epic's own three domains were re-verified from scratch, function-by-function, specifically
*because* that pattern had already burned this project once. See memory
`feedback-admin-retirement-check-live-vs-admin-routes` for the general lesson this scoping pass
produced: **a duplicated admin CRUD screen does not imply a duplicated data-serving path.** Checked by
listing every `apiGet`/`apiPost`/`apiPatch`/`apiRaw`/`fetch` call touching the relevant `/api/*` routes
across the WHOLE of `public/`, not just the admin screen being retired, for each domain below.

## Per-domain verdict

### Bloodlines - SPLIT retirement

`public/js/data/bloodlines-cache.js` calls only the plain `GET /api/bloodlines`, and is read by
`clanDiscList`/`isInClanDisc` (`public/js/data/accessors.js`) on **every character sheet render, in
both `admin.html` and the player-facing suite app**, to decide in-clan (3 XP/dot) vs out-of-clan
(4 XP/dot) discipline costing. This is live gameplay data, not an admin convenience, and the cache's
own deliberate fail-loud design (see its file header) means deleting this route would hard-lock every
bloodline character at 4 XP/dot per discipline the moment the cache next fails to load - not a
hypothetical, that is the documented behaviour on a load failure.

`public/js/admin/bloodlines-admin.js` (the ST authoring screen) calls the other six handlers:
`GET /api/bloodlines/admin`, `GET /api/bloodlines/:id/impact`, `POST /api/bloodlines`,
`PATCH /api/bloodlines/:id`, `DELETE /api/bloodlines/:id` (plain `GET /api/bloodlines/:id` has zero
caller anywhere in this repo - already dead). TM Admin's own `server/routes/bloodlines.js` +
`public/js/bloodlines.js` cover the same six operations (confirmed handler-for-handler; TM Admin
actually merged the list/admin-list split into one richer handler - a real improvement, not a gap).

**Retire:** `public/js/admin/bloodlines-admin.js`, its `admin.html` nav tile/panel, and the five
non-plain-GET handlers in `server/routes/bloodlines.js` (`/admin`, `/:id/impact`, `POST`, `PATCH`,
`DELETE`) plus the already-dead plain `GET /:id`.
**Keep:** plain `GET /api/bloodlines` (the list endpoint `bloodlines-cache.js` reads), mounted exactly
as it is today.

### Devlog - FULL retirement

Every `/api/devlog` call anywhere in `public/` originates from `public/js/admin/devlog-admin.js`
alone (confirmed via a repo-wide grep) - no live-rendering consumer, no player-facing surface, no
second reader. TM Admin's `server/routes/devlog.js` + `public/js/devlog.js` cover all four handlers
(`GET`/`POST`/`PATCH`/`DELETE`), more built out than this repo's original.

**Retire:** `public/js/admin/devlog-admin.js`, its `admin.html` nav tile/panel, and all of
`server/routes/devlog.js` (full unmount).

### Data Portability - PARTIAL retirement only

This repo's `public/js/admin/data-portability.js` + `data-portability-import.js` span ten domains:
characters, territories, game_sessions, chapters, downtime_submissions, npcs, ordeal_rubrics,
ordeal_submissions, ordeal_responses, rules. TM Admin's own `public/js/data-portability.js` covers
five as REAL, working exports/imports (characters, territories, game_sessions+attendance,
downtime_cycles, rules/purchasable powers) - the other six are explicit `placeholder: true` entries in
TM Admin's OWN code (its file's own header and inline labels, "no route, no working button" / "Not
available"), an honest disclosure, not a false claim, but it means "Data Portability is done" is only
true for five of ten domains.

**Retire:** this repo's export/import code paths for the five confirmed-parity domains only
(characters, territories, game_sessions, chapters/downtime_cycles - confirm the chapters<->
downtime_cycles naming lines up exactly before touching this one, epic-cm's own renumber renamed this
collection mid-2026-08 - and rules).
**Keep:** NPCs, Downtime Submissions, Ordeal Rubrics, Ordeal Submissions, Ordeal Responses, and Offices
(if present) - all six until TM Admin ships a real (non-placeholder) equivalent. **Re-verify TM
Admin's placeholder list is not itself stale before executing this story** - this whole epic exists
because a status claim went unchecked once already; do not let this domain be the second time.

## Not this epic

- **No Coordinator-gating build.** The "ST/Coordinator-gated filter on the main app" phrasing from an
  earlier session's continuation notes was a loose paraphrase, not a real requirement - `Coordinator`
  is an existing finance-only role (`specs/epic-finance-coordinator.md`) already excluded from
  `admin.html` entirely (`admin.js:192`: "Coordinators have their own tabs inside the game app; they
  never see this view"). Nothing to build here.
- **Byte-parity verification of TM Admin's Bloodlines/Devlog implementations** (not just handler-count
  parity) is this epic's own Story 1's job at dev-story time, not pre-work done here. This scoping pass
  confirmed the ROUTE SURFACE matches; it did not diff response bodies or behaviour field-by-field.

---

## Stories

### ADMR-1: Retire Bloodlines admin authoring from TM Game

Remove `public/js/admin/bloodlines-admin.js` and its `admin.html` sidebar entry. In
`server/routes/bloodlines.js`, remove the `GET /admin`, `GET /:id`, `GET /:id/impact`, `POST`,
`PATCH`, `DELETE` handlers; keep plain `GET /` mounted unchanged. Confirm at dev-story time (re-verify,
do not trust this scoping pass alone) that `bloodlines-cache.js`'s own `loadBloodlines()`/
`refetchBloodlines()` still resolve cleanly against the trimmed route, and that no other file in
`public/` calls any of the routes being removed. Update `specs/reference-data-ssot.md`'s Bloodlines
entry to point ST-facing authoring at TM Admin.

### ADMR-2: Retire Devlog admin authoring from TM Game

Remove `public/js/admin/devlog-admin.js`, its `admin.html` sidebar entry, and unmount
`server/routes/devlog.js` entirely from `server/index.js`. Confirm via a fresh repo-wide grep at
dev-story time that nothing else references `/api/devlog` before deleting the route file. Update
`specs/reference-data-ssot.md`'s Devlog entry (if one exists) to point at TM Admin.

### ADMR-3: Trim Data Portability to the domains TM Admin doesn't cover yet

Remove this repo's export/import code for characters, territories, game_sessions, the
chapters/downtime_cycles domain, and rules from `data-portability.js`/`data-portability-import.js`,
after re-confirming TM Admin's five working domains are still accurate (not stale) and that this
repo's own removed code paths are genuinely superseded, not merely similar-looking. Leave NPCs,
Downtime Submissions, Ordeal Rubrics, Ordeal Submissions, Ordeal Responses, and Offices untouched.
Flag in the story file, not fixed unilaterally, if TM Admin's placeholder list has changed since
2026-08-26.
