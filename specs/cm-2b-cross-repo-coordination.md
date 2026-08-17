# cm-2b cross-repo coordination — `downtime_cycles` → `chapters`

**Status: TM Suite's side is built and dry-run-verified. `--apply` is HELD.**
**Owner of the unblock: whoever picks up the TM Cockpit side.**

Written 2026-08-17 as story `cm-2b`'s Task 8 deliverable
(`specs/stories/cm-2b-downtime-cycles-to-chapters-rename.md`, AC9). Every file and line below was
re-verified against the sibling repos' working trees on that date, not copied from the story's own
earlier snapshot. Where the re-verification disagreed with the story, the corrected figure is used
and the discrepancy is called out.

---

## 1. What TM Suite changed

| Thing | Before | After |
|---|---|---|
| MongoDB collection | `downtime_cycles` | `chapters` |
| FK on a submission | `downtime_submissions.cycle_id` | `downtime_submissions.chapter_id` |
| HTTP route | `/api/downtime_cycles` | `/api/chapters` |
| Route file | `cyclesRouter` inside `server/routes/downtime.js` | its own `server/routes/chapters.js` |
| Submissions query param | `?cycle_id=` | `?chapter_id=` (`?cycle_id=` still READ, see §2a) |
| Migration script | — | `server/scripts/cm-2b-downtime-cycles-to-chapters.mjs` |
| Dual-read shim | — | `server/helpers/chapter-fk.js` |

`downtime_submissions` the **collection** is NOT renamed. Neither are `project_invitations.cycle_id`
or `ranking_ballots.cycle_id`, which are different collections' own FKs that happen to share the old
name (see §6).

The ruling is `cycle-model.md` §11a: `downtime_cycles` named its container after one phase within it
when CM-1 (#1028) had already made the document span all four (downtime → processing → prep → game),
which is a Chapter.

---

## 2. The ruling that governs sequencing (Open Question 1, Angelus, 2026-08-17)

> **Hold `--apply` until TM Cockpit coordinates.**
>
> TM Suite's own `--apply` does not run until a TM Cockpit-side story has (a) updated its
> direct-access files and (b) had its Atlas custom role re-scoped to grant `readWrite` on `chapters`,
> not just `downtime_cycles`.

This is the safest of the three shapes considered. It accepts that cm-2b's live cutover waits on a
second repo, rather than opening a window in which TM Suite silently stops seeing TM Cockpit's real
downtime-processing writes.

**Concretely, for anyone reading this later:**

- The migration script is merged but INERT. Nobody has run it with `--apply` against live
  `tm_suite`. Running it is Angelus's action and needs a fresh, explicit go-ahead.
- **The CODE change is not inert.** This is the one thing that differs from cm-2's precedent and
  the single easiest thing to get wrong here. TM Suite's deployed app now reads the `chapters`
  collection and the `chapter_id` field. Merging this branch to `main` deploys that (Netlify +
  Render both build from `main`). So the live order is fixed and one-way:
  1. TM Cockpit's own side lands, and its Atlas role gains `readWrite` on `chapters`;
  2. `node scripts/cm-2b-downtime-cycles-to-chapters.mjs` — dry run, read the plan;
  3. `... --apply` — copies the collection and renames the FK. `downtime_cycles` survives untouched
     as the rollback;
  4. **only then** merge cm-2b to `main` and let it deploy;
  5. burn in; much later, `... --drop-source --apply`.

### 2a. CORRECTION (2026-08-17, post-review): the gap between (3) and (4) was NOT safe

An earlier draft of this document said "between (3) and (4) both field names coexist happily: the
copy is additive". **That is true of the collection and false of the field.** The collection copy is
additive; the FK rename is destructive — `$rename` REMOVES `cycle_id`. Two independent review
layers found that neither deploy order avoided an outage:

- **Migrate first, deploy second** (the order above): between (3) and (4) the still-live OLD server
  is filtering submissions on `cycle_id`, which no longer exists. Every player's Downtime, Feeding
  and Archive view is empty for the whole deploy window.
- **Deploy first, migrate second:** the new server filters on `chapter_id`, which does not exist
  yet. Same empty views, other way round.

**Angelus's ruling: a dual-read compatibility shim**, mirroring this project's own CM-1
legacy-mirror precedent (`cycle-model.md` §7). It lives in `server/helpers/chapter-fk.js` and is
deliberately asymmetric:

| Direction | Behaviour |
|---|---|
| READ (route filters, `requireOpenCycle`, the deadline gate, the joint-project delete cascade, `chapters.js`'s DELETE-orphan and `/publish` checks, `territories.js`'s feeding-rights lock, the `?chapter_id=` query param) | `chapter_id`, falling back to `cycle_id` when `chapter_id` is ABSENT. Both storage types (ObjectId and string — issue #497), through the same helper. |
| WRITE | `chapter_id` **only**. A request body still carrying a `cycle_id` key is **rejected, 400 `LEGACY_CYCLE_ID_REJECTED`**. |

The asymmetry is load-bearing. Accepting legacy writes would re-admit the defect the shim exists to
route around — a stale browser bundle or stale Cockpit script writing a `cycle_id`-only submission
that no list, publish or delete guard can see.

**What this changes about the order above:** step (4) may now precede step (3). The deployed code
tolerates both field names, so merging and deploying ahead of `--apply` no longer empties anyone's
view. Steps (1) and (2) are unchanged, and (5) is unchanged. What has NOT changed is that
`--apply` still waits on TM Cockpit — Cockpit writing to `downtime_cycles` while TM Suite reads
`chapters` is a different problem, and the shim does not touch it.

**The shim is transitional.** Once `--apply` has run and burnt in (the same gate as
`--drop-source`), a follow-up story deletes the `cycle_id` half of every helper in
`server/helpers/chapter-fk.js`. Grep for `LEGACY_CHAPTER_FK` to find every site in one pass.

---

## 3. TM Cockpit — the blocking dependency

Repo path: `D:\Terra Mortis\TM Admin\TM Cockpit` (moved under `TM Admin/`; the umbrella
`CLAUDE.md`'s "alongside TM Suite" description is stale).

A handoff document has ALREADY been written into that repo and does not need recreating:

> `D:\Terra Mortis\TM Admin\TM Cockpit\specs\cockpit\cm-2b-downtime-cycles-rename-handoff.md`

**On the apparent contradiction with story cm-2b's own boundary.** The story says twice that it is
"NOT the TM Cockpit or TM Wiki code change" and that "this story can't write to sibling repos",
which reads as if that handoff document were a breach of its own scope. It is not, and the exception
is deliberate: Angelus asked for it explicitly (story Open Question 2, "please pass a prompt over to
TM Admin for this"), and what was written is **prose, not code** — a spec file telling that repo's
future session what to do, exactly as this project has done before (the TM Cockpit Ordeals-ingest
handover, dbo-2's TM Wiki notification). No TM Cockpit source file was touched by this story, and
none should be.

### 3a. The Atlas role — infrastructure, not code

`TM Cockpit/lib/connect.mjs:1-20` is the single database access point for that repo. Quoted
verbatim (re-confirmed 2026-08-17):

> MONGODB_URI is INTENDED to be backed by a single Atlas custom role scoped to `read` on all of
> tm_suite plus `readWrite` on exactly SEVEN named collections (ordeal_responses,
> ordeal_submissions, questionnaire_responses, characters, downtime_submissions, downtime_cycles,
> game_sessions).

The same header records the role as PROVISIONED and confirmed by a live write-probe on 2026-07-02.

**Renaming the collection in Mongo does not extend that grant to `chapters`.** A Cockpit script that
gets code-updated to target `chapters` without a matching Atlas change has its writes **rejected by
Atlas itself** — not a stale read, an authorisation failure. Re-scoping the custom role is a console
action outside every git repo. It is not something a dev agent can do or should attempt.

Note also that the role's `read` grant covers *all* of `tm_suite`, so Cockpit's READS of `chapters`
will work as soon as the code is updated. Only its WRITES need the role change. The writing scripts
are the subset listed in 3b that use `db.collection(...)` directly rather than
`conn.projectionCollection(...)`.

### 3b. The file list — CORRECTED

The story estimated "~11 files". **The re-verification found 33 code files** referencing
`downtime_cycles`. The story's list of 11 was exactly the set using a literal
`db.collection('downtime_cycles')`; it missed the roughly 20 that reach the same collection through
`conn.projectionCollection('downtime_cycles')` or a local `col('downtime_cycles')` wrapper. Anyone
updating that repo on the story's figure alone would leave two thirds of the surface behind.

**How the 33 adds up** (this arithmetic was wrong in the first draft of this document and is
restated here so the next reader does not have to re-derive it): 11 files in the direct block below
+ 17 in the wrapper block + **5 more that appear ONLY in the third, prose/config block**
(`lib/connect.mjs`, `lib/resolve-cycle-selector.mjs`, `lib/roster-exclusions.mjs`, `server.mjs`,
`scripts/publish-cycle-reports.mjs`) = 33. The other five entries in that third block are second
mentions inside files the first two blocks already list. Two non-code files (`README.md`,
`specs/project-context.md`) name it as well and are not counted in the 33.

**Direct `.collection('downtime_cycles')` — 13 call sites in 11 files** (the writing set, and the
ones the Atlas role change gates):

| File | Line(s) |
|---|---|
| `scripts/build-downtime-connections.mjs` | 37 |
| `scripts/build-downtime-data-map.mjs` | 76 |
| `scripts/build-downtime-map.mjs` | 56 |
| `scripts/export-downtime.mjs` | 57 |
| `scripts/fix-keeper-g6-has-minimum.mjs` | 54 |
| `scripts/open-dt6-game-phase.mjs` | 28 |
| `scripts/resolve-cycle.mjs` | 89 |
| `scripts/restore-wan-g6-refused-edits.mjs` | 67 |
| `scripts/seed-sandbox-downtime.mjs` | 49, 110, 111 |
| `scripts/set-cycle-deadline.mjs` | 76 |
| `scripts/travel-determination.mjs` | 67 |

**Via a wrapper (`conn.projectionCollection(...)` / `col(...)`) — 17 sites in 17 files, one each:**

`scripts/ambience-report.mjs:50` · `scripts/ambience-table.mjs:62` · `scripts/check-constants.mjs:119`
· `scripts/check-lane.mjs:92` · `scripts/compose-polish.mjs:29` · `scripts/get-action.mjs:55` ·
`scripts/get-downtime.mjs:46` · `scripts/get-xp-history.mjs:39` · `scripts/grep-downtime.mjs:55` ·
`scripts/intel-contacts.mjs:39` · `scripts/intel-surveillance.mjs:40` · `scripts/list-cycles.mjs:23`
· `scripts/maintenance-matrix.mjs:91` · `scripts/resolve-acquisitions.mjs:92` ·
`scripts/roll-cycle.mjs:101` · `scripts/set-territory-override.mjs:65` · `scripts/suggest-pool.mjs:62`

**Prose / config that also names it:** `lib/connect.mjs:8` (the role list itself),
`lib/resolve-cycle-selector.mjs:3`, `lib/roster-exclusions.mjs:41`, `server.mjs:74`,
`scripts/check-constants.mjs:256`, `scripts/export-downtime.mjs:64`, `scripts/get-downtime.mjs:54`,
`scripts/publish-cycle-reports.mjs:7,162`, `scripts/resolve-cycle.mjs:96`,
`scripts/seed-sandbox-downtime.mjs:58,109,112`, `README.md`, `specs/project-context.md`.

**Rebuild this list from the repo rather than trusting this table.** It is a snapshot of
2026-08-17, and the story it corrects was itself only a day old.

### 3c. The FK, too

TM Cockpit reads `downtime_submissions` as well, and that collection's `cycle_id` becomes
`chapter_id`. Any Cockpit query filtering submissions by cycle needs the same rename. `grep` for
`cycle_id` in that repo separately from `downtime_cycles` — they are two different changes and the
second is easy to miss because the collection it lives in keeps its name.

**Cockpit gets no help from TM Suite's dual-read shim.** The shim is inside TM Suite's Express
routes (`server/helpers/chapter-fk.js`); Cockpit talks to Atlas directly and never goes through
them. So a Cockpit query filtering on `cycle_id` will match nothing the moment `--apply` runs, and
one filtering on `chapter_id` matches nothing until it does. Cockpit's own update therefore wants
the same dual-read shape for the window — match either field name — or it wants to be timed tightly
around the `--apply` run. That is a decision for the Cockpit session; flagged here so it is not
discovered live.

---

## 4. TM Wiki (TM Story) — narrow, read-only

Repo path: `D:\Terra Mortis\TM Story`.

**Four call sites, one file, all reads** — confirmed unchanged at `server/mongo-store.js`:

| Line | Function |
|---|---|
| 472 | `getDowntimeCycleById` |
| 480 | `getActiveDowntimeCycle` |
| 494 | `getCurrentDowntimeCycle` |
| 527 | `getPreviousDowntimeCycle` |

All go through `getCanonCollection('downtime_cycles')`. Lower risk than Cockpit: read-only, one file,
and TM Wiki's canon connection is already broadly read-scoped, so there is **no Atlas role to
re-provision**. But it is still genuinely coupled — the moment `--drop-source` runs, those four
functions silently return nothing rather than erroring.

**The naming footgun, restated so nobody "fixes" the wrong thing.** TM Wiki has its OWN, separate
`tm_wiki.downtime_cycles` overlay collection — a different collection in a different database, with
its own schema (`server/wiki-schemas/downtime-cycles.schema.js`), its own route
(`server/routes/wiki-downtime-cycles.js`) and its own write endpoints. **That one is not affected and
must not be renamed.** Only the four `getCanonCollection('downtime_cycles')` reads point at
`tm_suite`. See `cycle-model.md` §11a's "naming footgun, not a coupling risk" note.

TM Wiki does not need a standalone handoff document; this section is it (story cm-2b's Open Question
2 left that choice to dev-story time).

---

## 5. TM Herald — CORRECTED: it IS affected

The story recorded TM Herald as unaffected, on the basis of `cycle-model.md` §10 (it reads TM Suite's
public HTTP API only, never Mongo directly). **The Mongo half of that is confirmed** — a grep of
`D:\Terra Mortis\TM Herald` finds no `MongoClient`, no driver import, no direct collection access.

**But this story renames the HTTP route as well, and TM Herald calls it:**

- `TM Herald/services/announcements.js:101` — `await apiFetch('/api/downtime_cycles')`.
- `TM Herald/specs/suite-notification-endpoints.md` names `/api/downtime_cycles` in five places as
  one of the two endpoints Herald polls.

Mitigating context, from Herald's own spec: those polls are **already** failing. Herald sends no
`Authorization` header and every TM Suite route sits behind `requireAuth`, so both of its polls
401 silently on every tick today. So this is a broken thing getting a second reason to be broken,
not a working integration this story takes down. It still needs the one-line path change whenever
Herald's auth is fixed, and the planned `/api/herald/*` service-authed endpoints in that spec should
be specified against `/api/chapters` from the start.

---

## 6. Out of scope, and deliberately so

Three FK fields named `cycle_id` survive this rename untouched, because they belong to other
collections and cm-2b's ruling was about the Chapter container and the one FK that names it from a
submission. A blanket find-and-replace across all of them is exactly what AC6 forbade.

| Field | Collection | Declared in | Now inconsistent with |
|---|---|---|---|
| `cycle_id` | `project_invitations` | `server/schemas/project_invitation.schema.js:30` (required) | points at a `chapters` document |
| `cycle_id` | `ranking_ballots` | `server/schemas/ranking_ballot.schema.js:31` (required) | points at a `chapters` document |
| `linked_cycle_id` | `npcs` | queried at `server/routes/npcs.js:141-145` | points at a `chapters` document |

Each is a live, required field with its own route surface (`/api/project_invitations?cycle_id=`,
`/api/ranking_ballots?cycle_id=`, `/api/npcs?cycle_id=`) and its own client callers. Renaming them is
a follow-up story, not a tidy-up: each needs its own migration, its own dry run and its own client
sweep. **This is a correction to the story's own claim that `downtime_submissions` was "the one place
the field lives".**

Also left alone, and why:

- `server/scripts/cm-2-chapters-to-story-cycles.mjs` and its suite still refer to `downtime_cycles`.
  That is correct: cm-2 has already run to completion, the script is a historical artefact, and its
  source-shape guard is written specifically to refuse a re-run in the post-cm-2b world.
- `server/scripts/archive/**` — historical one-offs, already run, archived. Left verbatim.
- `server/migrate-dt1.js` and `server/migrate-dt1-submissions.js` were NOT in `archive/` and were
  therefore not covered by that reasoning — an omission review caught. Both still read
  `downtime_cycles` and wrote `cycle_id`, so re-running either post-migration would have written
  invisible orphans, and post-`--drop-source` either would have proceeded on a null cycle lookup
  with no guard. Nothing in the repo references them. **Moved to `server/scripts/archive/`**
  (2026-08-17) rather than re-pointed, because the correct action for a spent one-off is archival.

---

## 7. The mechanical gate cm-2b added

cm-2's header states that cm-2b "literally cannot start until the drop has happened", and gives the
gate as `db.getCollectionNames()` must not contain `chapters`. cm-2b does not leave that to memory:
`targetShapeRefusals` in the migration script refuses outright if `chapters` still holds cm-2-era
Story-grouping documents (`{_id, number, label, created_at, final_chapter_id?}` and nothing else),
and the guard is evaluated by BOTH `planRename` and `dropSource`, so neither entry point can be
reached around it. The mirror guard, `sourceShapeRefusals`, refuses if `downtime_cycles` somehow
holds Story-groupings.

**Added after review (2026-08-17): `targetPhantomRefusals`.** The guard above only catches cm-2-era
Story-groupings, which is the wrong hazard for this migration. The one that actually matters is a
CHAPTER-shaped document sitting in `chapters` with no counterpart in `downtime_cycles` — which is
exactly what the code deploying before `--apply` produces, the moment an ST creates a Chapter
through the now-live `POST /api/chapters`. It collided with nothing, was copied past in silence, and
became a permanent phantom with no rollback copy once `--drop-source` ran. It is now a **refusal in
`planRename`** (before the cutover, every `chapters` document should be a copy) and an **advisory
only in `dropSource`** (after the cutover, every genuinely new Chapter looks like this by design,
and refusing would block the drop forever — and nothing in the source is lost by dropping it).

---

## 8. Checklist for the TM Cockpit session

- [ ] Re-derive the file list from the repo (§3b is a snapshot, and the one it corrects was a day old).
- [ ] Update every `downtime_cycles` collection reference to `chapters`.
- [ ] Separately, update every `downtime_submissions` query filtering on `cycle_id` to `chapter_id`.
- [ ] Get the Atlas custom role re-scoped: `readWrite` on `chapters` (Angelus, console action).
      Keep `downtime_cycles` in the grant until `--drop-source` has run, so rollback stays free.
- [ ] Confirm against Atlas that the role change took, with a write-probe, as Story 9.2 did in July.
- [ ] Tell Angelus cm-2b is unblocked. **That is the actual unblock for cm-2b's live cutover, not an
      afterthought** — nothing else is waiting on anything else.
