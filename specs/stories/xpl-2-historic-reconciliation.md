# Story xpl.2: Historic reconciliation — DT2-DT6 backfill

Status: review

## Story

As a Storyteller running Terra Mortis,
I want the historic XP purchases from past downtime cycles that can be confirmed against a
character's current sheet to appear in that character's XP History alongside new entries,
so that the ledger xpl.1 introduced is not an empty record that only starts mattering from today.

## STALE — corrected 2026-08-17 against the now-live epic-cm rename, re-verified against real data

This story predates `cm-2b` (`downtime_cycles`→`chapters`, `cycle_id`→`chapter_id`) and `cm-4` (the
historical renumber), both now merged to `main` and live in production. This is not just a
terminology change — `cm-4` shifted which `game_number` each cycle's real downtime content is
attached to, and this story's own investigation numbers were captured under the OLD numbering.
**Verified directly against live `tm_suite`, 2026-08-17, not assumed:**

- Every downtime cycle's content moved forward by one `game_number`. What this story's investigation
  recorded as "Game 2" is now attached to the chapter with `game_number: 3`, and so on through
  "Game 6" → `game_number: 7`. Confirmed both in aggregate and by the two specific example rows this
  story cites: Yusuf Kalusicj's `True Worm`/`Safe Place`/`Closed Book` row and Anichka's
  `Mandragora Garden` row are now both under `game_number: 4` (this story recorded them as "Game 3").
- **Re-verified counts (2026-08-17, `chapters`/`chapter_id`, matches the shifted numbering):**
  `game_number:3`=22 of 29, `game_number:4`=19 of 29, `game_number:5`=20 of 29, `game_number:6`=20 of
  27, `game_number:7`=23 of **33** (was "32" under the old numbering — the extra one is the known
  stray post-Game-7 submission by Aleksei Romanov, already flagged elsewhere in `sprint-status.yaml`;
  it is native Game-7 content, not part of the DT2-DT6 historic set this story backfills, and should
  be excluded from the plan the same way any non-historic row would be). **Total xp_spend-bearing
  count is unchanged at 104** — the underlying data didn't move or lose anything, only its
  `game_number` label shifted. This story's own **scope is therefore `game_number: 3` through `7`**,
  not `2` through `6` — the "DT2"/"DT6" identities are unchanged, only which live chapter each one
  now feeds.
- **A separate, unresolved question this correction surfaced (not something to silently decide):**
  this story's original investigation found "DT1 (Game 1)" already had 25 submissions in MongoDB,
  all with empty `responses` and no `xp_spend`, and treated that as confirmation DT1 has no
  structured XP data to backfill. Direct re-verification just now found those same 25 submissions
  now sit under `game_number: 2` — and they are full, rich, already-published in-app downtime
  entries (real feeding/projects/touchstone/letter/territory-report narrative), not the static
  pre-app DT1 content described in story `di-1` (which, per `di-1`'s own corrected Context section,
  has never been imported into MongoDB at all — the Chapter-1 placeholder currently has
  `submission_count: 0`). **This story and `di-1` may be using "DT1"/"Game 1" to mean two different
  things**, or `di-1`'s premise is wrong. Whoever dev-storys `xpl-2` should re-verify what these 25
  `game_number:2` submissions actually are (an early in-app cycle that simply predates the xp_spend
  field?) before relying on this story's DT1-exclusion reasoning at face value — do not just
  relabel `game_number` and proceed unchanged.

Re-derive counts fresh at dev-time rather than trusting the numbers above if this story sits much
longer — the same live-state-drift risk that made this correction necessary once could happen again.

## Why this story exists

Epic XPL's own sequencing named this as the natural follow-up to xpl.1 (the write hook): the ledger
is only useful going forward unless past cycles are represented too. The epic's original one-line
scope ("walk `project_N_xp_rows` per cycle and mint ledger rows for each real historic purchase")
assumed uniform, structurally reliable data across all six downtime cycles and an implicit ability
to know a request was actually applied. This story's own investigation (2026-08-15, real read-only
queries against live `tm_suite`, not assumed) found BOTH assumptions wrong — see Dev Notes for the
full findings and Angelus's resulting ruling on scope.

## What this story is NOT

- NOT a change to `xpl.1`'s live write hook (`diffXpLedgerRows`, the `PUT /api/characters/:id` ledger
  insert) — this story is a separate, one-off backfill script, not a modification to the live path.
- NOT a backfill of `game_number: 1` (the Chapter-1 placeholder — no submissions exist there at all
  as of this correction) or `game_number: 2` — confirmed by direct query that ZERO of `game_number:
  2`'s 25 submissions carry any `responses.xp_spend`/`project_N_xp_rows` data at all; the XP-request
  mechanism did not exist on the form that cycle. There is nothing structural to backfill FROM for
  either. **See the STALE correction note above** — whether `game_number: 2`'s content is actually
  "DT1" in the sense story `di-1` uses that term is now an open question, not a settled fact; the
  exclusion holds either way (no `xp_spend` data present regardless of what the cycle should be
  called), but don't repeat the identity claim without re-checking it. A free-text mining pass over
  `st_review.outcome_text` narrative could theoretically recover SOME of it, but that is a
  fundamentally different (NLP-adjacent, unreliable) undertaking explicitly out of scope here.
- NOT a guess. Per Angelus's ruling (2026-08-15, this story's own scoping): **confirmed-only** — a
  ledger row is written ONLY when the character's current live state demonstrably corroborates the
  historic request. Everything else is surfaced in the plan's own report output for manual ST
  review, never silently written and never silently dropped.
- NOT a live write by this session. Matches the standing convention every migration script in this
  project's history follows (`migrate-office-purchases-to-seats.mjs`, `seed-office-seats.mjs`,
  `dbo-1-purchasable-powers-field-cleanup.mjs`, etc.): dry-run by default, `--apply` required to
  write, and even then running it for real against live `tm_suite` is Angelus's own action, not
  something this or any dev-story session executes.
- NOT a change to `xp_ledger.schema.js` or its shape. Backfilled rows use the exact same document
  shape xpl.1 defined, distinguished only by content (a `reason` explaining they are historic,
  detailed in AC2 below) — no new fields, no schema version flag.

## Acceptance Criteria

1. A new script, `server/scripts/xpl-2-historic-xp-reconciliation.mjs`, follows this project's
   established plan/apply/main shape (`migrate-office-purchases-to-seats.mjs` is the shape
   exemplar): exported pure(ish) `planReconciliation(submissionsCollection, charactersCollection)`,
   `applyReconciliation(ledgerCollection, rows, {apply, log})`, and a `main(argv)` CLI entry with NO
   shebang line (this script will be imported by its own test suite — the shebang-breaks-vitest
   landmine is already documented at length in `CLAUDE.md` and in every sibling migration script's
   own header comment; do not reintroduce it).
2. `planReconciliation` walks every `downtime_submissions` document across the five chapters with
   `game_number: 3` through `7` ONLY (`game_number: 1` and `2` explicitly excluded per "What this
   story is NOT" — the plan function itself refuses to process a `chapter_id` resolving to either,
   it does not merely happen not to find data there),
   parses each non-empty `responses.xp_spend` row (`{category, item, dotsBuying, xpCost?}`), and
   classifies each row with a non-zero `dotsBuying` into exactly one of:
   - **`confirmed`** — category is `merit`, the `item` string is the graduated form
     (`"Name|grad|currentDots|maxTarget"`), and the character's CURRENT live `merits[]` entry with
     that name has a rating/dots value `>= maxTarget`. This is the ONLY row shape this story
     confirms automatically (see Dev Notes — Confirmation Coverage for exactly why attribute/skill/
     discipline rows and flat-form merit rows cannot be confirmed the same way from available data).
   - **`unconfirmable`** — every other real (non-zero `dotsBuying`) row: attribute/skill/discipline
     categories (no before/after dots snapshot is embedded in those rows at all), flat-form merit
     rows (`"Name|flat|rating|0"` — no target to compare against, only a rating that may already be
     fully represented by the character's current state with no way to attribute it to THIS request
     specifically), and any graduated-merit row whose current rating is BELOW `maxTarget` (requested
     but apparently never granted, OR granted partially in a later cycle this row can't distinguish).
   - **`zero`** — rows with `dotsBuying: 0` are real form artifacts (unused row slots in a multi-row
     form, or a category/item note with no dots requested) — excluded from output entirely, not
     reported as unconfirmable noise.
3. `planReconciliation` returns a plain report object (counts by classification, and the full list of
   `confirmed`/`unconfirmable` rows with enough detail — character name, cycle/game number, category,
   trait name, requested dots/target, current live value — for an ST to read and act on the
   `unconfirmable` list by hand). `main()`'s default (no `--apply`) invocation prints this report and
   writes nothing.
4. `applyReconciliation`, called only with `--apply`, inserts one `xp_ledger` document per `confirmed`
   row from the plan, in the exact shape `xpl.1` defined (`character_id`, `category`, `trait_name`,
   `delta`, `new_total`, `at`, `st_username`, `reason`). Historic-specific values: `delta` = the
   XP cost of the confirmed dots (see Dev Notes — Cost Reconstruction for how `xpCost` is resolved
   when the row itself doesn't carry one); `at` = the submission's own `submitted_at` (a real
   historic date, never "now" — the whole point is this is a dated history); `st_username` =
   `'historic-reconciliation'` (a literal, recognisable marker — there is no real per-row ST identity
   to recover, and inventing one would misrepresent the record); `reason` = a fixed, non-empty string
   naming this as a backfilled historic entry and citing the source submission's `_id` and cycle
   (e.g. `"Historic backfill (xpl.2) from downtime_submissions <id>, Game <n>"`), so a reader can
   always trace a backfilled row back to its real source document.
5. Idempotent: running `applyReconciliation` twice does not create duplicate ledger rows for the same
   source submission/row. Achieved by checking for an existing `xp_ledger` document whose `reason`
   already cites the same source submission `_id` before inserting (a targeted `findOne`/upsert-style
   guard, not a blanket unique index — this collection's shape doesn't have a natural compound key
   for one, and inventing one is out of this story's scope).
6. Real test coverage: unit tests for `planReconciliation`'s classification logic (confirmed vs
   unconfirmable vs zero, for representative real row shapes pulled from this story's own
   investigation), and a live-DB integration test proving one real confirmed row round-trips into a
   correctly-shaped `xp_ledger` document via `--apply`, and that a second `--apply` run does not
   duplicate it.
7. This story does NOT run `--apply` against live `tm_suite`. The script exists, is tested against
   `tm_suite_test`, and is left for Angelus to run for real — same convention as every other
   migration script in this project.

## Tasks / Subtasks

- [x] Task 1 — Script skeleton + plan phase (AC: 1, 2, 3)
  - [x] `server/scripts/xpl-2-historic-xp-reconciliation.mjs`, no shebang, connection via `../db.js`
        (matches every sibling migration script's own convention).
  - [x] Item-string parser: `parseMeritItem` (splits on `|`, handles both `flat` and `grad` forms,
        returns `{name, form, currentDots, maxTarget}` or `{name, form: 'flat', rating}`). No
        separate attribute/skill/discipline parser was needed — `classifyRow` reads those rows'
        `item` as the bare trait name directly and never calls `parseMeritItem` on them (they're
        never merit-form strings), so a dedicated pass-through function would have been a no-op
        wrapper. Covered directly with unit tests (real + synthetic shapes).
  - [x] `planReconciliation`: query `chapters` for `game_number: 3` through `7`'s `_id`s fresh (never
        hardcoded), query `downtime_submissions` for those `chapter_id`s with `responses.xp_spend`
        present, parse each row, classify per AC2, cross-reference confirmed candidates against a
        fresh live fetch of the character's CURRENT `merits[]`. **Deviation from the AC1 signature
        as illustrated**: `planReconciliation` takes a third parameter, `chaptersCollection` —
        functionally required by this same task's own instruction to re-derive chapter ids by
        `game_number`, and the AC1 parenthetical (`submissionsCollection, charactersCollection`) reads
        as illustrative rather than an exhaustive interface contract given that requirement.
- [x] Task 2 — Cost reconstruction (AC: 4)
  - [x] When a row carries its own `xpCost`, use it directly.
  - [x] When absent, reconstruct from `dotsBuying * MERIT_XP_RATE` (1 XP/dot, per `CLAUDE.md`'s XP
        cost rates section) — verified needed on real data (Anichka's actual production
        "Mandragora Garden|grad|0|3" row carries no `xpCost` key).
  - [x] **`new_total` — not specified by this story's own AC4** (which lists historic-specific values
        for `delta`/`at`/`st_username`/`reason` but is silent on this field). Resolved by reading
        xpl.1's real write hook (`server/lib/xp-ledger-diff.js`, pulled via `git show` from the
        still-unmerged `ms/xpl-1-xp-ledger-write-hook` branch, since `xp_ledger.schema.js` does not
        exist on `dev`/`main` yet — see Dev Agent Record for why): `new_total` there is the trait's
        cumulative XP-spent tally immediately after the write, not that write's own cost alone. The
        historic-backfill equivalent, consistent across multiple confirmed rows for the same merit
        in different cycles, is `maxTarget * MERIT_XP_RATE`. Documented at length in the script's own
        header comment rather than left implicit.
- [x] Task 3 — Apply phase + idempotency (AC: 4, 5)
  - [x] `applyReconciliation`: dry-run by default (prints what it would insert), `--apply` to write.
  - [x] Idempotency guard: before each insert, `findOne` on `xp_ledger` for a `reason` containing the
        source submission's `_id`; skip if found, log the skip. Verified idempotent by an actual
        second `--apply`-mode call in the integration test, not merely asserted.
- [x] Task 4 — Tests (AC: 6)
  - [x] `server/tests/xpl-2-historic-xp-reconciliation.test.js` — unit tests for the item parser and
        `classifyRow`'s classification, built from REAL row shapes AND real live character-merit data
        pulled directly from production `tm_suite` while dev-storying this (2026-08-18): Yusuf
        Kalusicj's Safe Place/Closed Book rows (unconfirmable — he holds neither merit at all live),
        Anichka's Mandragora Garden row (unconfirmable — live rating 1 vs target 3), Macheath's
        Allies/Contacts rows (confirmed) and Investigation skill row (unconfirmable). Macheath's case
        surfaced a real design point beyond the story's own text: he holds two merits both named
        "Allies" (Street rating 5, Underworld rating 1) — see Dev Agent Record.
  - [x] Live integration test against `tm_suite_test` (seeded fixture data, NOT live `tm_suite`):
        one confirmed merit row round-trips through `--apply` into a correctly-shaped `xp_ledger`
        document; a second `--apply` run does not duplicate it (asserted `{inserted:0, skipped:1}`
        and a `countDocuments` of 1, not just "no error"); an unconfirmable row never gets written
        even though `--apply` ran, and a submission on an out-of-scope chapter (`game_number: 2`) is
        excluded from the plan entirely. 20/20 passing.
- [x] Task 5 — Full changed-area regression (AC: 7)
  - [x] Ran the new suite plus `oxp-11-office-purchase-seat-keying.test.js` (the plan/apply/main shape
        precedent this story names) as a sanity comparison of test style and to confirm no collision:
        46/46 passing. **`xpl-1-xp-ledger-diff.test.js`/`xpl-1-xp-ledger-api.test.js` could not be run
        — they do not exist on `dev`/`main`.** xpl.1 itself is not merged; it lives only on the
        unmerged `ms/xpl-1-xp-ledger-write-hook` branch (confirmed via `git diff dev
        ms/xpl-1-xp-ledger-write-hook --stat`, a ~280-file diff cut from a much older base, predating
        cm-2/cm-2b/cm-4/cm-7/gdx-5/6/7/di-1). This is a real, disclosed gap, not a skipped step: this
        story's own script does not depend on xpl.1's code at runtime (it writes to the `xp_ledger`
        collection directly, matching every other migration script's convention of bypassing the
        Express/schema layer), so it works correctly regardless — but the "confirm this story's new
        script doesn't collide with or duplicate anything the live write hook does" check named in
        this task cannot be run as a live test suite until xpl.1 merges. Flagged for Angelus.
  - [x] Confirmed via a manual read of this session's own tool history that `--apply` was never
        passed to the script in any run, and every run pointed at `MONGODB_DB=tm_suite_test`, never
        live `tm_suite` — this story's own AC7.

## Dev Notes

### Investigation findings (2026-08-15, live read-only queries against `tm_suite`)

**Game-number labels below are AS RECORDED 2026-08-15, BEFORE `cm-4`'s renumber shifted every
cycle's content forward by one `game_number`.** See the STALE correction note at the top of this
file for the re-verified 2026-08-17 mapping and numbers — use those for the actual `game_number`
range to query (`3` through `7`), not the labels in this historical section. Kept as-written below
because the underlying counts/row shapes/character examples are still accurate, only their
game-number labels moved.

**Cycle count re-verified**: still 6 `downtime_cycles` documents (Game 1 through Game 6) as of
tonight (Game 7's own session) — Game 6 is `status: 'active'` (not yet closed), Games 1-5 are
`'closed'`. No Game 7 cycle document exists yet. This story's scope is Game 2 through Game 6
inclusive (**re-verified 2026-08-17: now `game_number: 3` through `7`** — see correction note);
Game 6 being still-active at investigation time means its own downtime processing may still have
been incomplete then — the plan function should process whatever real submissions exist without
treating "still active" as a reason to skip a cycle, since a partial-but-real backfill is still more
useful than none, and re-running the plan later naturally picks up anything new.

**"DT1" has NO structured XP data — confirmed by direct query, not inference. Re-verify what "DT1"
actually refers to before trusting this section — see the STALE correction note's open question.**
`db.downtime_submissions.countDocuments({cycle_id: <Game1_id>, "responses.xp_spend": {$exists:
true}})` returns **0** (of 25 total submissions, now living under `game_number: 2`). A direct fetch
of a sampled document's full `responses` object showed `{}` — completely empty, despite that same
document carrying a full, substantial `st_review.outcome_text` narrative (feeding rolls, project
outcomes, in-character prose). This is not a data-quality accident; it means the XP-purchase-request
section of the downtime form did not exist yet when this cycle was processed. The exclusion itself
(no `xp_spend` data present) is solid and re-confirmed 2026-08-17; whether this cycle is correctly
called "DT1" is not.

**Real data volume, five historic cycles (originally labelled DT2-DT6, now `game_number: 3-7`)**:
`responses.xp_spend` exists on **104 of ~162** submissions across the five cycles (as originally
recorded: Game2=22 of 29, Game3=19 of 29, Game4=20 of 29, Game5=20 of 27, Game6=23 of 32 — **re-
verified 2026-08-17 under the current `game_number` labels: `3`=22 of 29, `4`=19 of 29, `5`=20 of
29, `6`=20 of 27, `7`=23 of 33, the one extra being the known stray post-Game-7 submission, see
correction note**) — but most of those are placeholder/empty rows. Only **34 total submissions**
(across all five cycles) contain at least one row with a real non-zero `dotsBuying`. That is the
entire real universe of "actual purchase requests" this story processes — small enough for the plan
report's `unconfirmable` list to be a genuinely useful, human-reviewable size, not a wall of noise.

**No approval signal exists anywhere — confirmed, not assumed.** The schema declares a submission-
level `approval_status` enum (`'pending' | 'approved' | 'modified' | 'rejected'`,
`downtime_submission.schema.js:204`) that looks exactly like what this story would want. Queried
directly: **it is `null`/absent on every single one of the 104 real xp_spend-bearing submissions.**
It is a declared-but-dead field in practice. `st_review` is also an empty `{}` object on every
sampled xp_spend-bearing submission checked — no per-row or per-submission ST annotation of what was
actually granted exists anywhere in this data. This is the finding that drove Angelus's
confirmed-only ruling: there is no field to trust, only the character's own current state to
cross-check against.

**Real row shape, sampled directly (six real documents, originally recorded as Game 3/DT3 cycle —
re-verified 2026-08-17: Yusuf's and Anichka's rows below are now under `game_number: 4`, confirmed
by direct query; Macheath's is presumed to have moved the same way, same original sample batch, not
individually re-checked):**
```json
// Yusuf Kalusicj, game_number: 4 (recorded as "Game 3" pre-renumber)
"[{\"category\":\"merit\",\"item\":\"True Worm|flat|2|0\",\"dotsBuying\":0,\"xpCost\":2},
  {\"category\":\"merit\",\"item\":\"Safe Place|grad|2|3\",\"dotsBuying\":1,\"xpCost\":1},
  {\"category\":\"merit\",\"item\":\"Closed Book|grad|0|3\",\"dotsBuying\":1,\"xpCost\":1}]"
// Anichka, game_number: 4 (recorded as "Game 3" pre-renumber)
"[{\"category\":\"merit\",\"item\":\"Mandragora Garden|grad|0|3\",\"dotsBuying\":1}]"  // NO xpCost key
// Macheath, game_number: 4 presumed (recorded as "Game 3" pre-renumber, not individually re-checked)
"[{\"category\":\"merit\",\"item\":\"Allies|grad|2|3\",\"dotsBuying\":1},
  {\"category\":\"merit\",\"item\":\"Contacts|grad|4|5\",\"dotsBuying\":1},
  {\"category\":\"skill\",\"item\":\"Investigation\",\"dotsBuying\":0}]"
```
Confirms: (a) `xpCost` is sometimes absent even on a real non-zero row (Anichka's Mandragora Garden
row) — Task 2's cost-reconstruction fallback is not a hypothetical, it is needed on real data; (b)
the `item` string format genuinely differs by category — merits embed a `Name|form|current|target`
shape (informative), skills/attributes/disciplines carry only the bare trait name (uninformative for
before/after comparison) — this is WHY AC2 can only auto-confirm merit rows; (c) `dotsBuying: 0`
rows sit alongside real non-zero rows in the SAME array (True Worm above, Investigation above) —
confirms AC2's `zero` classification needs to filter row-by-row, not submission-by-submission.

### Confirmation Coverage (why merit-only, spelled out for the dev agent)

A graduated merit row (`"Name|grad|currentDots|maxTarget"`) is self-describing: it states the
character's dots AT REQUEST TIME and the target being bought toward. Comparing the CURRENT live
`merits[]` rating against that target is a real, meaningful check — if current >= target, the
request's own claim is corroborated by the present-day sheet.

A flat merit row (`"Name|flat|rating|0"`) states only a rating, no before/after — there is nothing
to compare against that isn't circular (the character having ANY rating in that merit doesn't tell
you whether THIS historic request is what produced it, especially if the merit was also touched in
a different cycle).

An attribute/skill/discipline row carries no dots snapshot at all in this data — only
`{category, item: <bare trait name>, dotsBuying, xpCost?}`. There is no way to know from the row
itself what the trait's dots were before or after, and a trait bought across MULTIPLE cycles (a
character raising Strength in both DT2 and DT4, say) cannot be disambiguated per-cycle from current
state alone — the live total is a single cumulative number that could have come from either request,
both, or neither. Confirming these would require either a full derivation ledger (which does not
exist prior to this story — the reason it's being built) or trusting the request at face value
(exactly what "confirmed-only" was chosen specifically to avoid). Leaving these as `unconfirmable`
is not a shortcut — it is the honest limit of what this data supports automatically.

### Project Structure Notes

- New files: `server/scripts/xpl-2-historic-xp-reconciliation.mjs`, `server/tests/
  xpl-2-historic-xp-reconciliation.test.js`.
- No modified files outside those two plus this story's own doc bookkeeping — this story does not
  touch `xpl.1`'s live code path (`server/routes/characters.js`, `server/lib/xp-ledger-diff.js`,
  `public/js/editor/sheet.js`) at all.
- Follows `migrate-office-purchases-to-seats.mjs`'s exact conventions: no shebang (this script's own
  test suite imports it directly, same landmine), dry-run default, `--apply` to write,
  `MONGODB_DB=tm_suite_test` override supported for testing against the throwaway database.

### References

- [Source: server/schemas/downtime_submission.schema.js#L27-30,94-105,201-204,279-388] — the action
  enum, `project_${n}_xp_rows`/`project_${n}_xp`, `status`/`approval_status`, and the ADMIN-block
  `xp_spend` field this story reads.
- [Source: server/scripts/migrate-office-purchases-to-seats.mjs] — the plan/apply/main shape
  exemplar, including its refuse-rather-than-guess convention (AC2's Game-1 refusal and the
  unconfirmable bucket both follow this same instinct).
- [Source: CLAUDE.md — XP cost rates] — 1 XP/dot flat merit rate, used by Task 2's cost fallback.
- [Source: 2026-08-15 live queries against tm_suite, this story's own investigation] — cycle count,
  DT1 exclusion, 104/34 real counts, `approval_status`/`st_review` dead-field finding, the three real
  row samples above. Not re-derivable from any existing doc; this story file is now the record.
- [Source: specs/epic-xpl-xp-ledger.md] — parent epic, corrected sequencing notes.
- [Source: specs/stories/xpl-1-xp-ledger-write-hook.md] — the `xp_ledger` document shape this story's
  backfilled rows must match exactly. **Not present on `dev`/`main`** as of this dev-story pass — see
  Dev Agent Record; read via `git show ms/xpl-1-xp-ledger-write-hook:specs/stories/xpl-1-xp-ledger-write-hook.md`
  instead if picking this up before xpl.1 merges.

---

## Dev Agent Record
### Agent Model Used
claude-sonnet-5
### Completion Notes

**The "DT1 identity" question this story's own STALE correction flagged is resolved, and resolves in
the direction this story already assumed.** Queried live `tm_suite` directly (2026-08-18): the 25
submissions now at `game_number: 2` carry `responses: {}` (confirmed, matches this story's own
finding) but rich, already-published `st_review.outcome_text`/`published_outcome` narrative — real
in-app downtime content, not the static pre-app DT1 material story `di-1` targets. Their character
roster is an exact 25/25 match against `di-1`'s own source JSON, and `git log` confirms why:
`439a9ebb` (2026-04-17) already imported DT1 into MongoDB, well before `cm-4`'s renumber shifted it
from `game_number: 1` to `2`. This story's exclusion of `game_number: 2` (no `xp_spend` data present,
confirmed both in 2026-08-15's original investigation and again here) holds regardless of the
identity question — but the identity question itself surfaced a real, separate problem in story
`di-1` (which is about to `--apply` a duplicate import against the wrong, structurally-empty
`game_number: 1` chapter). Flagged prominently on `di-1`'s own story file and in `sprint-status.yaml`;
not this story's own scope to fix, and this story's scope/exclusions are unaffected either way.

**xpl.1 is not merged.** `xp_ledger.schema.js`, `server/lib/xp-ledger-diff.js`, and
`xpl-1-xp-ledger-write-hook.md`/`xpl-1-xp-ledger-{diff,api}.test.js` all exist only on the unmerged
`ms/xpl-1-xp-ledger-write-hook` branch (confirmed via `git diff dev ms/xpl-1-xp-ledger-write-hook
--stat`), not on `dev`/`main`. This did not block implementation — the script writes directly to the
`xp_ledger` collection via the Mongo driver, matching every other migration script's convention of
bypassing the Express/schema-validation layer entirely, and `xp_ledger.schema.js`'s own header notes
it "is not currently wired to Ajv/route validation anywhere" regardless. It DID mean: (a) the exact
`xp_ledger` document shape was read via `git show <branch>:server/schemas/xp_ledger.schema.js` rather
than from a file on disk in this checkout; (b) `new_total`'s semantics (not spelled out by this
story's own AC4) were resolved by reading the real `diffXpLedgerRows` logic the same way, rather than
guessed; (c) Task 5's "run alongside xpl-1's own test suite" instruction could not be carried out as a
live check — see Task 5's own notes for what was run instead. None of this required copying xpl.1's
files into this branch, and none were copied.

**A same-named-merit ambiguity, not called out in this story's own AC2/Dev Notes, was found and
handled during test-writing against real production data.** Macheath's live sheet holds two merits
both named "Allies" (Street rating 5, Underworld rating 1). A historic `xp_spend` row's `item` string
carries no qualifier (`"Allies|grad|2|3"` only), and `xp_ledger.trait_name` has no qualifier slot
either, so `classifyRow` confirms a graduated row if ANY live entry sharing that name meets the
target, rather than keying a name-to-single-entry map (which would have non-deterministically refused
a real, corroborated purchase depending on merit array order). This mirrors a real bug xpl.1's own
code review already found and fixed in `xp-ledger-diff.js`'s `meritKey` function for the identical
shape — documented at length in the script's own header comment. Verified against Macheath's actual
live data, not synthetic-only.

**Confirmed-only philosophy held throughout**: no row was written speculatively; every unconfirmable
row (including the flat-form and attribute/skill/discipline cases, and every same-named-merit case
where no entry met the target) is surfaced in the plan's own report, never silently dropped or
silently written.

**`--apply` was never run against live `tm_suite`** in this pass — every script run in this session
used `MONGODB_DB=tm_suite_test`, and the vitest suite's own `assertTestDbSafety` guard
(`server/db.js`) would refuse a live connection under `VITEST` regardless. Running it for real
against production is Angelus's own action, per this story's own Definition of Done and this
project's standing convention.

### File List
- `server/scripts/xpl-2-historic-xp-reconciliation.mjs` (new)
- `server/tests/xpl-2-historic-xp-reconciliation.test.js` (new, 20 tests, all passing)
- `specs/stories/xpl-2-historic-reconciliation.md` (this file — task checkboxes, Status, Dev Agent Record)
- `specs/stories/sprint-status.yaml` (`xpl-2-historic-reconciliation: ready-for-dev → review`)
- `specs/stories/di-1-import-dt1-narratives.story.md` (flagged, not reworked — see that story's own
  "DO NOT --apply" note, added as a direct consequence of this story's DT1-identity investigation)
