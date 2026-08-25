# Story DBO.5: Location data handover to TM Wiki (joint with Wiki 31-2)

Status: done

## Story

As the ecosystem's data owner,
I want `st_map_locations` and `locations` fully handed over to TM Wiki (the repo that already reads
and presents them) and dropped from `tm_suite` once the handover is verified,
So that `tm_suite` stops holding presentation data with zero mechanical function at the table, per
the 2026-08-14 ruling: *"All location data moves to wiki. Location has no relevance at game."*

---

## Context

Covers `st_map_locations` (130 docs) and `locations` (42 docs, 26 polygons). **Stays here:**
`territories` identity/governance — `regent_id`, `lieutenant_id`, `feeding_rights`, `ambience`,
`ambienceMod`, `slug`, `name` — game-relevant, written through real routes. *"A polygon is
presentation; a regent is a rule."*

Per `specs/epic-dbo-database-ownership.md` (DBO-5), the work is:
(a) move 130 `st_map_locations` docs to `tm_wiki`, (b) repoint the Wiki's own reader
(`mongo-store.js:151-153`), (c) port the six `_reveal-*.mjs` scripts into TM Wiki (they live in
`server/scripts/` **only** because Cockpit's scoped Mongo user cannot write `st_map_locations` — a
credentials accident the move dissolves), (d) retire the Suite-side raw-client importer, (e) drop
both source collections from `tm_suite` **after** the Wiki verifies a real read end to end.

Per the shared `../../data-map.md` (last updated on this point 2026-08-15): **(a)/(b)/(c) are
DONE** — `TM Wiki/specs/stories/31-2-location-data-migration.md` shipped 2026-08-14 (copy/verify/
repoint against `tm_wiki_dev`, reveal scripts ported). (d), the Suite-side drop, has a
**committed, unmerged** branch — see Dev Notes. **Production cutover itself had NOT happened as of
2026-08-15** (confirmed then: production `tm_wiki` had no `st_map_locations`/`locations`
collections yet).

### Re-verified today, 2026-08-18 (this pass)

- **This repo's own reader/writer side is confirmed clean**: `git grep` across all tracked `.js`/
  `.mjs` files found zero references to `st_map_locations` or a `locations` collection anywhere in
  live route/service code. Nothing here still builds against either collection.
- **The drop script exists and is real**: commit `fb36768c` ("feat(31-2): Suite-side drop script
  for TM Wiki's location data migration"), on branch `ms/31-2-suite-location-data-drop-script-
  onmain`, **pushed to `origin`** but **not merged** into `dev` or `main`. `server/scripts/_drop-
  31-2-location-data.mjs` (168 lines per its own commit message) does not exist in the current
  working tree — it only exists on that unmerged branch.
- **The six `_reveal-*.mjs` scripts could not be located or verified.** No file matching that
  pattern exists anywhere in this checkout — tracked or untracked. This session's environment also
  has no `TM Wiki` or `TM Cockpit` directory present alongside this repo (the umbrella `D:\Terra
  Mortis` folder currently holds neither), so there is no way from here to confirm whether those six
  scripts still exist somewhere, were already ported/removed, or were miscounted/misdescribed in the
  epic doc. **This is a genuine blind spot of this session, not a finding that the work is done or
  undone** — flagged for Angelus to check directly against whichever machine holds the Cockpit
  checkout.
- **Live production cutover status not re-checked this pass** (would require a live write-side
  MongoDB query against `tm_wiki`, which this session did not run — read-only queries against
  `tm_suite` were done for an unrelated story earlier the same day, but `tm_wiki` was never
  connected to). Treat the 2026-08-15 data-map finding ("production `tm_wiki` has no
  `st_map_locations`/`locations` collections yet") as the most recent known-good answer, not
  re-confirmed today.

### Out of scope

- Running `--apply`/`--write` against production. Standing convention for every drop/trim script in
  this epic: Angelus's own action, never a dev agent's.
- Merging the drop-script branch into `dev`/`main`. A single-commit cherry-pick onto `dev` would be
  low-risk (the branch itself is cut from a very stale base and a full merge would drag in hundreds
  of unrelated file changes), but that is itself a decision worth surfacing explicitly rather than
  doing silently — not done in this pass.
- Locating or porting the six `_reveal-*.mjs` scripts — blocked on sibling-repo access this session
  does not have (see above).
- Any change to `territories` — out of scope by the epic's own "stays here" ruling.

---

## Acceptance Criteria

**Given** the TM Suite codebase
**Then** no route, service, or client code references `st_map_locations` or a `locations`
collection. *(Verified 2026-08-18 — met.)*

**Given** the six `_reveal-*.mjs` scripts in `server/scripts/`
**Then** they have been ported into TM Wiki and removed from (or clearly marked deprecated in)
this repo. *(Verified 2026-08-19 — met. No `_reveal-*.mjs` file exists anywhere in the current
`server/scripts/` checkout, tracked or untracked; matches TM Story's own 31-2 record that all six
were ported and confirmed equivalent before deletion. The earlier "genuine blind spot" note above
is resolved.)*

**Given** the Wiki has verified a real end-to-end read of the migrated location data
**Then** the Suite-side drop script (`server/scripts/_drop-31-2-location-data.mjs`, on branch
`ms/31-2-suite-location-data-drop-script-onmain`) is run with `--apply`/`--write` against production
by Angelus, and both source collections are confirmed empty/absent afterward. *(Met — 2026-08-19.
`--write` run for real against production: the script's own live re-verify immediately before
dropping reported st_map_locations 130/130 and locations 42/42, both CLEAN; both collections then
dropped. Independently re-confirmed via a direct `listCollections` query against `tm_suite`
afterward — neither collection exists among the remaining 43. Pre-drop backup:
`server/scripts/_backups/dbo-5-6-predrop-*-2026-08-19T08-16-04-152Z.json`, parse-verified,
130/42 docs.)*

---

## Dev Notes

- Drop script commit: `fb36768c`, branch `ms/31-2-suite-location-data-drop-script-onmain`, pushed to
  `origin`, not merged. Re-verifies `tm_wiki` matches `tm_suite` FIELD BY FIELD (not just counts/ids
  — a real defect its own external review caught), refuses unless the resolved Wiki database is
  exactly `tm_wiki`. `--write` has never been run by any automated pass.
- Paired Wiki story: `TM Wiki/specs/stories/31-2-location-data-migration.md` — done, externally
  code-reviewed (Codex: 5 High + 8 Medium + 6 Low, all verified), per the Wiki's own
  `sprint-status.yaml` as last known 2026-08-15. Not re-checked this pass (TM Wiki repo absent from
  this session's environment).
- Full shared context: `../../data-map.md`, the `st_map_locations` and `locations` entries.

---

## Definition of Done

- This repo has zero readers/writers for `st_map_locations`/`locations`. **Met.**
- The six `_reveal-*.mjs` scripts are confirmed ported/removed. **Met (2026-08-19).**
- Wiki confirms a real end-to-end read of the migrated data. **Met (2026-08-19) — production
  cutover complete, independently re-verified live against `tm_wiki` directly, not just trusted
  from the Wiki session's own report.**
- Production drop run by Angelus, both collections confirmed empty/absent. **Met (2026-08-19) —
  `--write` run for real, both collections dropped, independently re-confirmed absent.**

---

## Change Log

- 2026-08-18: Story file created (previously tracked only via `sprint-status.yaml` inline comments,
  per `/bmad-loop`'s own position check finding no story file existed). Re-verified this repo's own
  reader/writer state and the drop-script branch's real commit/push status directly. Flagged the
  `_reveal-*.mjs` handover step as unverifiable from this session's environment rather than guessed
  at. No code changed. Status stays `in-progress` — real, cross-repo work remains outstanding.
- 2026-08-19: `_reveal-*.mjs` blind spot resolved (confirmed gone from this checkout, matching TM
  Story's own port-then-delete record). Wiki-side production cutover confirmed complete and
  independently re-verified live against `tm_wiki` directly (130/42, exact match). Drop script's
  dry run re-run against production: clean. Pre-drop `tm_suite` backup taken and parse-verified.
- 2026-08-19 (later, same day): Angelus ran `--write` for real. Both collections dropped from
  production `tm_suite`, independently re-confirmed absent via a direct `listCollections` query.
  All Definition-of-Done items met. Status: in-progress -> done.
