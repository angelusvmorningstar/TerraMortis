# Story xpl.2: Historic reconciliation — DT2-DT6 backfill

Status: ready-for-dev

## Story

As a Storyteller running Terra Mortis,
I want the historic XP purchases from past downtime cycles that can be confirmed against a
character's current sheet to appear in that character's XP History alongside new entries,
so that the ledger xpl.1 introduced is not an empty record that only starts mattering from today.

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
- NOT a backfill of DT1 (Game 1) — confirmed by direct query that ZERO of DT1's 25 submissions carry
  any `responses.xp_spend`/`project_N_xp_rows` data at all; the XP-request mechanism did not exist
  on the form that cycle. There is nothing structural to backfill FROM for DT1. A free-text mining
  pass over `st_review.outcome_text` narrative could theoretically recover SOME of it, but that is a
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
2. `planReconciliation` walks every `downtime_submissions` document across the five cycles Game 2
   through Game 6 ONLY (Game 1 explicitly excluded per "What this story is NOT" — the plan function
   itself refuses to process a Game-1 `cycle_id`, it does not merely happen not to find data there),
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

- [ ] Task 1 — Script skeleton + plan phase (AC: 1, 2, 3)
  - [ ] `server/scripts/xpl-2-historic-xp-reconciliation.mjs`, no shebang, connection via `../db.js`
        (matches every sibling migration script's own convention).
  - [ ] Item-string parser: one function per category shape (`parseAttributeSkillDisciplineItem` —
        trivial, the item IS the trait name; `parseMeritItem` — splits on `|`, handles both `flat`
        and `grad` forms, returns `{name, form, currentDots, maxTarget}` or `{name, form: 'flat',
        rating}`). Write this as its own small pure function with direct unit coverage — this parser
        is the single most likely place for a subtle real-data shape this story's investigation
        didn't sample to break silently.
  - [ ] `planReconciliation`: query `downtime_cycles` for game_number 2-6's `_id`s fresh (do not
        hardcode the ObjectIds this story's own investigation found — cycle IDs are stable but
        re-deriving by `game_number` is one query and removes any risk of a stale hardcoded id),
        query `downtime_submissions` for those cycle_ids with `responses.xp_spend` present, parse
        each row via the parsers above, classify per AC2, cross-reference confirmed candidates
        against a fresh live fetch of the character's CURRENT `merits[]`.
- [ ] Task 2 — Cost reconstruction (AC: 4)
  - [ ] When a row carries its own `xpCost`, use it directly.
  - [ ] When absent (real data shows this happens — see Dev Notes), reconstruct from this project's
        own flat merit-XP rate (1 XP/dot, per `CLAUDE.md`'s XP cost rates section) for the merit
        category, since every row this story confirms is a merit row (AC2's confirmed classification
        is merit-only) — no discipline/attribute/skill cost lookup is needed here.
- [ ] Task 3 — Apply phase + idempotency (AC: 4, 5)
  - [ ] `applyReconciliation`: dry-run by default (prints what it would insert), `--apply` to write.
  - [ ] Idempotency guard: before each insert, `findOne` on `xp_ledger` for a `reason` containing the
        source submission's `_id`; skip if found, log the skip.
- [ ] Task 4 — Tests (AC: 6)
  - [ ] `server/tests/xpl-2-historic-xp-reconciliation.test.js` — unit tests for the item parsers and
        `planReconciliation`'s classification, built from REAL row shapes this story's own
        investigation pulled (cite them directly — Yusuf Kalusicj's True Worm/Safe Place/Closed Book
        row, Anichka's Mandragora Garden row, Macheath's Investigation skill row as an unconfirmable
        example, etc. — see Dev Notes for the full real samples).
  - [ ] Live integration test against `tm_suite_test` (seeded fixture data, NOT live `tm_suite`):
        one confirmed merit row round-trips through `--apply` into a correctly-shaped `xp_ledger`
        document; a second `--apply` run does not duplicate it; an unconfirmable row never gets
        written even with `--apply`.
- [ ] Task 5 — Full changed-area regression (AC: 7)
  - [ ] Run the new suite plus `xpl-1-xp-ledger-diff.test.js`/`xpl-1-xp-ledger-api.test.js` (confirm
        this story's new script doesn't collide with or duplicate anything the live write hook does)
        and this project's other migration-script test files for the same plan/apply/main shape
        precedent (`oxp-11-office-purchase-seat-keying.test.js`) for a sanity comparison of test
        style, not because they share code.
  - [ ] Confirm via `git diff`/manual read that no `--apply` was ever actually run against
        `MONGODB_URI` (live) in this session — this story's own AC7.

## Dev Notes

### Investigation findings (2026-08-15, live read-only queries against `tm_suite` — do not re-derive, these are real and current as of tonight)

**Cycle count re-verified**: still 6 `downtime_cycles` documents (Game 1 through Game 6) as of
tonight (Game 7's own session) — Game 6 is `status: 'active'` (not yet closed), Games 1-5 are
`'closed'`. No Game 7 cycle document exists yet. This story's scope is Game 2 through Game 6
inclusive; Game 6 being still-active means its own downtime processing may still be incomplete —
the plan function should process whatever real submissions exist for it today without treating
"still active" as a reason to skip the cycle, since a partial-but-real backfill is still more
useful than none, and re-running the plan later naturally picks up anything new.

**DT1 has NO structured XP data — confirmed by direct query, not inference.**
`db.downtime_submissions.countDocuments({cycle_id: <Game1_id>, "responses.xp_spend": {$exists:
true}})` returns **0** (of 25 total DT1 submissions). A direct fetch of a sampled DT1 document's
full `responses` object showed `{}` — completely empty, despite that same document carrying a full,
substantial `st_review.outcome_text` narrative (feeding rolls, project outcomes, in-character prose).
This is not a data-quality accident; it means the XP-purchase-request section of the downtime form
did not exist yet when DT1 was processed. AC/task text above locks this in as a hard exclusion, not
an assumption to re-verify at dev time.

**Real data volume, DT2-DT6**: `responses.xp_spend` exists on **104 of ~162** submissions across the
five cycles (Game2=22 of 29, Game3=19 of 29, Game4=20 of 29, Game5=20 of 27, Game6=23 of 32) — but
most of those are placeholder/empty rows. Only **34 total submissions** (across all five cycles)
contain at least one row with a real non-zero `dotsBuying`. That is the entire real universe of
"actual purchase requests" this story processes — small enough for the plan report's
`unconfirmable` list to be a genuinely useful, human-reviewable size, not a wall of noise.

**No approval signal exists anywhere — confirmed, not assumed.** The schema declares a submission-
level `approval_status` enum (`'pending' | 'approved' | 'modified' | 'rejected'`,
`downtime_submission.schema.js:204`) that looks exactly like what this story would want. Queried
directly: **it is `null`/absent on every single one of the 104 real xp_spend-bearing submissions.**
It is a declared-but-dead field in practice. `st_review` is also an empty `{}` object on every
sampled xp_spend-bearing submission checked — no per-row or per-submission ST annotation of what was
actually granted exists anywhere in this data. This is the finding that drove Angelus's
confirmed-only ruling: there is no field to trust, only the character's own current state to
cross-check against.

**Real row shape, sampled directly (six real documents, Game 3/DT3 cycle):**
```json
// Yusuf Kalusicj, Game 3
"[{\"category\":\"merit\",\"item\":\"True Worm|flat|2|0\",\"dotsBuying\":0,\"xpCost\":2},
  {\"category\":\"merit\",\"item\":\"Safe Place|grad|2|3\",\"dotsBuying\":1,\"xpCost\":1},
  {\"category\":\"merit\",\"item\":\"Closed Book|grad|0|3\",\"dotsBuying\":1,\"xpCost\":1}]"
// Anichka, Game 3
"[{\"category\":\"merit\",\"item\":\"Mandragora Garden|grad|0|3\",\"dotsBuying\":1}]"  // NO xpCost key
// Macheath, Game 3
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
  backfilled rows must match exactly.
