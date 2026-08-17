---
id: di.1
epic: di
status: done
priority: medium
depends_on: []
---

> ## ✅ RESOLVED 2026-08-18 — retired, not reworked. `--apply` never run; do not run it.
>
> **2026-08-18 update:** the wrong-target finding below (found while dev-storying `xpl-2`) led to
> checking the follow-up question it raised: does `game_number: 2`'s already-live content actually
> equal this story's own source data, or is there a real gap left to fill? It's a byte-for-byte
> match. `st-working/downtime/dt1/TM_downtime1_submissions.json`'s own Alice Vunder record — the
> "Party with Cyrus" project narrative — is **word-for-word identical** to the live `game_number: 2`
> submission's `st_review.outcome_text`/`published_outcome`, right down to shared phrasing like "the
> club is loud, the lights are wrong." The source JSON self-identifies as `"cycle_id": "downtime_1"`.
> This is not a coincidence or a similar-but-different retelling — it is the same file (or an
> unmodified copy of it), already imported for real back on 2026-04-17.
>
> This story's actual goal — DT1 narrative visible in the player's Chronicle/Story tab alongside
> DT2/DT3 — is **already met**, and not just at the data layer: `public/js/tabs/story-tab.js`'s
> Chronicle render filters purely on `character_id` + a truthy `published_outcome`, with no
> chapter-number gate of any kind, and the live `game_number: 2` submissions already carry a
> populated `published_outcome`. Every player who was in DT1 already sees it in their Chronicle
> today. There is nothing left for this story to do.
>
> **Retired, not implemented further.** `server/scripts/di-1-import-dt1-narratives.mjs` (this story's
> own new script) was never run with `--apply` and never will be; moved to `server/scripts/archive/`
> alongside the original `migrate-dt1.js`/`migrate-dt1-submissions.js` it was written to replace, all
> three now dead code for the same reason: the job they exist to do is already done.
>
> ### Original wrong-target finding (2026-08-18, superseded by the above but kept for the record)
>
> Direct queries against live `tm_suite`, while dev-storying `xpl-2` (which flagged an unresolved
> "DT1 identity" question this story's own 2026-08-17 correction surfaced — see that story's Context
> section), found this story's premise is **factually wrong**, not merely stale terminology:
>
> - `chapters` at `game_number: 2` already holds **25 fully-published submissions** — real feeding /
>   projects / touchstone / letter / territory-report prose, not stubs.
> - Their character roster is an **exact 25/25 match** against this story's own source JSON
>   (`st-working/downtime/dt1/TM_downtime1_submissions.json`), including the 5 blank-`character_id`
>   names this story's own header names individually (Charles Mercer-Willows, Eve Lockridge, Ivana
>   Horvat, Kirk Grimm, Tegan Groves).
> - Their `created_at` is `2026-02-28T00:00:00.000Z` — identical, to the millisecond, to this script's
>   own invented `DT1_LOADED_AT` constant.
> - `git log`: `439a9ebb` (2026-04-17) — *"migrate-dt1-submissions.js — import DT1 historical
>   submissions with compiled outcome_text **(applied)**"*. DT1 was already imported to live Mongo
>   four months before this story was written, under the old `downtime_cycles` collection. `cm-4`'s
>   renumber (its own commit message: *"each chapter's downtime moves forward to feed the next
>   chapter's game"*) shifted that real content from `game_number: 1` to `game_number: 2`, and
>   *separately* created the empty Chapter-1 placeholder this story targets — which, under that same
>   chapter-anchor model, structurally represents the downtime that would have preceded Game 1. Nothing
>   preceded Game 1, so there is nothing that belongs there. The placeholder's own note
>   ("represented by character creation, January–February 2026") already said as much; this story's
>   2026-08-17 correction pass verified the chapter was empty and re-derivable but did not check
>   whether the JSON source content was already represented elsewhere under a different chapter — it
>   was.

# Story DI-1: Import DT1 Narratives into Chronicles

As a player viewing the Story / Chronicle tab,
I want my Downtime 1 narrative (written before the app form existed) to appear in my chronicle alongside DT2 and DT3 entries,
So that my full story history is accessible in one place rather than living in static documents the ST has to hand me out-of-band.

---

## Context

### STALE — corrected 2026-08-17 against the now-live epic-cm rename

This story predates `cm-2b`/`cm-4` (the `downtime_cycles`→`chapters` rename, `downtime_submissions.cycle_id`→`chapter_id`, and the historical chapter renumber), all now merged to `main` and live in production. Two things changed underneath this story, not just terminology:

1. **The script this story pointed at no longer exists at that path.** `server/migrate-dt1.js` and `server/migrate-dt1-submissions.js` were moved to `server/scripts/archive/` during `cm-2b`'s own review (2026-08-17), specifically *because* they still read `downtime_cycles`/wrote `cycle_id` — re-running either unmodified post-migration would write invisible orphans (matching on a collection nothing reads any more) or, post-`--drop-source`, crash on a null cycle lookup with no guard. They were archived rather than rewritten in place, because a spent one-off migration is correctly archival, not maintenance — this story's own script is a **new** script, written fresh against `chapters`/`chapter_id`, not a resurrection of the archived one (though the archived file's mapping/parsing logic is still a valid reference for the shape of the transform).
2. **The target Chapter document already exists.** `cm-4`'s historical renumber created a Chapter-1 placeholder (`chapters._id: 69f2dc48a77e2f00eb39a43c`, `game_number: 1`, `label: "Game 1"`, `status: "closed"`, `placeholder: true`, `placeholder_note: "This downtime was represented by character creation, January–February 2026."`) precisely because nothing in `downtime_submissions` currently carries `chapter_id` pointing at it (`submission_count: 0` as of the renumber). **DI-1's job is to attach the 26 DT1 submissions to this EXISTING chapter, not create a new one.** The placeholder's note is a factual claim made at renumber time by someone who did not know DT1 existed as importable data — once this story lands, that note is no longer accurate and should be cleared (or replaced with something like "Represented by the imported DT1 narratives, see di-1") as part of this story's own write, not left for a future session to notice the contradiction.

Confirm both facts directly against MongoDB before writing the script (`db.chapters.findOne({game_number: 1})`, `db.downtime_cycles.findOne({game_number: 1})` — same `_id`, since `cm-2b` copied it across) rather than trusting this note if picking this story up much later; live state can move.

### What already exists

Nothing runnable. The prior script generation is archived and dead (see above). The source data (`st-working/downtime/dt1/TM_downtime1_submissions.json`, 26 records) and the transform logic it needs (building `published_outcome` markdown from `st_narrative` sections — Feeding, Projects, Touchstone, Letter, Territory Reports, Merit Actions — plus the `CHAR_ID_FIXES` lookup for five characters with blank source `character_id`: Charles Mercer-Willows, Eve Lockridge, Ivana Horvat, Kirk Grimm, Tegan Groves) are still valid reference material inside the archived script.

### What hasn't happened

DT1 narratives are not in production MongoDB — confirmed directly (`downtime_submissions` has no DT1-sourced content; the Chapter-1 placeholder has `submission_count: 0`). The Chronicle tab on player.html shows DT2 and DT3 entries only.

### What this story finishes

1. **Write a new script** (`server/scripts/di-1-import-dt1-narratives.mjs`, following this project's plan/apply/main convention, no shebang) that maps the 26 source records into `downtime_submissions` documents with `chapter_id: ObjectId("69f2dc48a77e2f00eb39a43c")` (re-derive by querying `chapters` for `game_number: 1` rather than hardcoding — same discipline this project's other migration scripts already follow), and updates that chapter document to clear the placeholder flag/note once the real submissions land.
2. **Run the script against production** and verify the writes landed cleanly.
3. **Verify Chronicle rendering.** This is now a verification step, not an implementation step — `public/js/tabs/story-tab.js`'s `renderChronicle` and `renderLatestReport` were already updated by `cm-2b`/`cm-4` to sort by `cycleMap[String(sub.chapter_id)]?.game_number` (descending), which is exactly the fix this story used to propose writing. Confirm it already does the right thing with real DT1 data present; do not re-implement it.

### Why DI-1 ships first in the DI epic

DI-1 is the only DI story with finished tooling. DI-2 is unscoped (source data location unknown). DI-3 is an investigation spike. DI-1 delivers value immediately: 26 characters get their DT1 chronicle entry.

### Files in scope

- **`server/scripts/di-1-import-dt1-narratives.mjs`** (new) — write the transform, re-deriving the target chapter's `_id` by `game_number: 1` query, run dry-run + apply.
- **`public/js/tabs/story-tab.js`** — verify only, do not edit unless real DT1 data reveals a gap: `renderChronicle`/`renderLatestReport` already sort by `chapter_id`→`game_number` (shipped in `cm-2b`/`cm-4`).
- **`public/js/tabs/story-tab.js`** — confirm `parseOutcomeSections` and `renderOutcomeWithCards` render DT1's six markdown sections (Feeding / Projects / Touchstone / Letter / Territory Reports / Merit Actions) without breakage.

### Out of scope

- Editing DT1 narrative text. The migration is a data move, not a content edit.
- Reformatting DT1 to match the v2 six-section player report (`memory/project_dt_report_v2.md`). DT1 was authored before v2 existed; it stays in its original markdown shape.
- Building ST-side editing of imported DT1 entries. DTSR-4 (Inline edit on player Story view, historical cycles only) covers historical-cycle edits more broadly when it ships; until then DT1 entries are read-only.
- Resolving any data quality issues in the source JSON itself. If a character's DT1 narrative is malformed in source, surface the issue and decide per-record; do not add cleanup logic to the script.
- Reworking the Chronicle sort fix. It already shipped as part of `cm-2b`/`cm-4` — this story verifies it, does not implement it.
- Deleting the archived `server/scripts/archive/migrate-dt1*.js` files. They're already correctly parked as dead/historical; leave them alone.

---

## Acceptance Criteria

### Source file path

**Given** the dev writes the new script
**When** it resolves the source path
**Then** it reads from `st-working/downtime/dt1/TM_downtime1_submissions.json` directly (relative to the script's own location) — no copy-to-project-root step, and no repeat of the archived script's wrong-relative-path bug.

### Dry run

**Given** the script runs in dry-run mode (no `--apply`)
**Then** the output reports:
- The target chapter: `chapters` document for `game_number: 1`, confirmed found by query (not hardcoded), current `placeholder`/`submission_count` state shown.
- Each of 26 character records: "WOULD INSERT" or "SKIP (exists)".
- A summary of inserted / updated / skipped counts.

**And** zero MongoDB writes occur.

### Apply

**Given** the script runs with `--apply` against production
**When** the target chapter is found by `game_number: 1` query
**Then** 26 submission documents are inserted into `downtime_submissions`, each with:
- `character_id` matching the live character (real ObjectId, not blank).
- `chapter_id` pointing at the existing Chapter-1 document's `_id` (`69f2dc48a77e2f00eb39a43c` as of this story's writing — re-derive, do not hardcode).
- `published_outcome` containing the assembled markdown.
- `st_review.outcome_visibility: 'published'`.

**And** the Chapter-1 document's `placeholder`/`placeholder_note` fields are cleared (or the note replaced to reflect that DT1 content now lives there) and `submission_count` updated to reflect the 26 new submissions.
**And** any of the 5 characters in `CHAR_ID_FIXES` resolve to a valid character ObjectId.
**And** all 26 records are present in MongoDB after the script completes.

**If the target chapter is NOT found by `game_number: 1` query** (live state has moved since this story was corrected 2026-08-17): halt and report rather than guessing or creating a new chapter — this is exactly the kind of drift the re-derive-don't-hardcode discipline above exists to catch.

### Idempotency

**Given** the script has already been run successfully
**When** the script is re-run with `--apply` (no `--force`)
**Then** zero new documents are inserted.
**And** the script reports "SKIP (exists)" for each existing record.

### Chronicle rendering — sort order

**Given** a character with DT1, DT2, and DT3 published submissions
**When** the player loads the Story tab on player.html
**Then** the Chronicle pane lists entries in **reverse chronological by cycle**: DT3 at top, DT2 in the middle, DT1 at the bottom.
**And** the sort key is `chapter.game_number` (descending), not submission `_id` — already the case in production; this AC is a regression check, not new work.

### Chronicle rendering — markdown

**Given** a character with a DT1 entry imported via the script
**When** the Chronicle pane renders that entry
**Then** all six sections present in the source render under their correct headings:
- Feeding
- Projects (one card per project)
- Touchstone
- Letter
- Territory Reports
- Merit Actions (when present)

**And** no section renders as raw markdown (no `##` characters in display, no broken backticks).
**And** existing DT2/DT3 entries are unchanged (no regression to v2 six-section rendering).

### Smoke test sample size

**Given** the import has been applied
**When** the dev manually verifies the Chronicle tab
**Then** at least **three characters with very different DT1 content** are checked:
- One simple-feeding-only character.
- One character with a full Letter + Touchstone narrative.
- One of the `CHAR_ID_FIXES` characters (Charles Mercer-Willows, Eve Lockridge, Ivana Horvat, Kirk Grimm, or Tegan Groves) — to confirm the lookup resolved to the correct character.

### No regressions

**Given** existing DT2 and DT3 entries in production
**Then** they remain unchanged after the script runs.
**And** the existing Chronicle render path (`renderOutcomeWithCards`, `parseOutcomeSections`) handles DT1's older markdown shape without errors thrown to the console.

---

## Tasks / Subtasks

- [x] Task 1: Write `server/scripts/di-1-import-dt1-narratives.mjs` (AC: source path, dry run, apply, idempotency)
  - [x] Follow the project's plan/apply/main convention (mirrored off `dbo-2-dossier-fact-key-backfill.mjs`): `loadSourceRecords`, `planImport` (pure, read-only), `applyImport` (writes, dry-run default), `main`.
  - [x] Source path resolved relative to the script's own location (`server/scripts/` → `../../st-working/...`), not hardcoded to project root — confirmed correct against the archived script's own documented wrong-relative-path bug (it lived one directory level shallower).
  - [x] Target chapter re-derived by `game_number: 1` query every run, never hardcoded to the `_id` named in this story's Context.
  - [x] Halts (does not guess or create) if the chapter is missing, or found but not carrying `placeholder: true` / `submission_count: 0`.
  - [x] Idempotent: an existing `(character_id, chapter_id)` submission is reported `SKIP (exists)` and left untouched unless `--force`.
- [x] Task 2: Resolve all 26 characters correctly (AC: Apply — `CHAR_ID_FIXES` characters resolve to a valid character ObjectId)
  - [x] Read-only live query against `tm_suite.characters` for the 5 blank-`character_id` names (Charles Mercer-Willows, Eve Lockridge, Ivana Horvat, Kirk Grimm, Tegan Groves) — found the archived script's own hardcoded `CHAR_ID_FIXES` map is **stale**: all 5 of its ids belong to a prior, no-longer-live character import (`69cf7da8...` prefix), while the real live ids (confirmed by exact name match) share the `69d73ea4...` prefix the other 21 source records already carry inline. Fixed by resolving these 5 by a live `characters.name` lookup at run time instead of trusting any hardcoded map — re-derive, don't hardcode, same discipline this project's other migration scripts already follow.
  - [x] Verified the other 21 inline source `character_id`s still resolve against live `characters` (20/21 exact `_id` matches; the 21st, "Cazz" → `69d73ea49162ece35897a480`, is a genuine character rename to "Casamir" since DT1 was recorded — harmless, since the script trusts the given `character_id` over the source's snapshot `character_name`).
- [x] Task 3: Build clean `published_outcome` markdown (AC: Chronicle rendering — markdown)
  - [x] Read the real DT1 source data directly rather than trusting the archived script's shape: found `merit_actions_resolved[i].header` (not `st_narrative.action_responses[i].response`, which is empty string on every record with real merit-action content) is where the actual narrative text lives.
  - [x] Found and avoided a genuine defect the archived script's own approach would have reproduced: nesting `### Title` sub-headings inside one `## Projects` block leaks literal `#` characters into the rendered page, because `parseOutcomeSections` only consumes a line starting with exactly `## `. Used one top-level `## <Title>` heading per project instead (matching the live `compilePushOutcome` convention for DT2/DT3), and single `## Territory Reports` / `## Merit Actions` headings with plain-text (no markdown) per-item paragraphs for the two grouped sections.
  - [x] Verified `st_narrative` is written verbatim (plain-string `touchstone`/`letter_from_home`, not the DTSR-2 `{status, response}` shape) so `renderStoryMoment()` cannot fire a second, duplicate render of the same content — confirmed by reading its exact truthiness check against `.response`.
  - [x] Ran `buildPublishedOutcome` directly (no DB) against all 26 real source records: zero lines starting with a bare `#` outside a proper `## ` heading, zero backticks, zero empty outputs.
  - [x] Found and fixed a cosmetic redundancy while doing that direct check: `feeding_review.best_ambience` already names its own territory (e.g. "The Second City — +2"), so unconditionally prepending `feeding_review.territories` produced "The Second City — The Second City — +2" for every single-territory character. Now only prepends `territories` when `best_ambience` doesn't already start with it.
- [x] Task 4: Verify the render path needs no changes (AC: Chronicle rendering — sort order, No regressions)
  - [x] Read `story-tab.js`'s `renderChronicle`/`renderLatestReport`/`renderOutcomeWithCards` in full — confirmed the `chapter_id` → `game_number` sort (shipped in `cm-2b`/`cm-4`) needs no DT1-specific change.
  - [x] Confirmed `buildPlayerMeritActions`/`renderMeritActionCards` (the legacy per-action card path) safely no-op on a DT1 document (`responses: {}`, no `sphere_N_*`/`status_N_*` keys), so DT1's Merit Actions content only ever renders once, via the `published_outcome` heading — no duplicate-card risk.
  - [x] No edits made to `story-tab.js`, matching the story's own "verify only" scope.
- [x] Task 5: Dry-run verification against live `tm_suite` (AC: Dry run)
  - [x] Ran the script with no `--apply` (read-only) against the real configured database: target chapter found and reported correctly (`game_number: 1`, `placeholder: true`, `submission_count: 0`), all 26 records reported `WOULD INSERT`, 0 skipped, all 5 blank-id characters correctly resolved via `live-lookup-by-name`.
- [ ] Task 6: Run the script with `--apply` against production, and manually verify Chronicle rendering for 3 sample characters (AC: Apply, Chronicle rendering — sort order & markdown, Smoke test sample size)
  - [ ] **NOT DONE IN THIS SESSION, DELIBERATELY.** Per `memory/feedback_imports.md` and this story's own "Production credentials" note: the user runs MongoDB import scripts personally; the dev's job is to deliver a script that's ready to run with clear output, not to run it themselves. The script is dry-run-verified and ready; running `node scripts/di-1-import-dt1-narratives.mjs --apply` from `server/` against live `tm_suite`, then spot-checking the Chronicle tab for the 3 sample characters named in the AC, is Angelus's own next action.

## Dev Notes

See "Tasks / Subtasks" above for the investigation trail — this story's own Context section already carried most of the design groundwork (it was corrected once already, 2026-08-17, against the live `cm-2b`/`cm-4` rename), so no separate Dev Notes duplication here. Two genuinely new findings surfaced during this dev pass, beyond what the Context predicted:

1. The archived `migrate-dt1.js`'s `CHAR_ID_FIXES` map is stale (wrong `_id`s for all 5 characters it names) — this story's own re-derive-by-name fix is a **new** finding, not something the Context flagged in advance.
2. `merit_actions_resolved[i].header`, not `action_responses[i].response`, is where DT1's real merit-action narrative text lives — the archived script's reference logic would have produced a silently blank Merit Actions section for the 20 characters that have one.

---

## Implementation Notes

### Sequence

1. Write `server/scripts/di-1-import-dt1-narratives.mjs` against `chapters`/`chapter_id`, re-deriving the target chapter by `game_number: 1` query (see AC — Apply).
2. Run it (dry run). Inspect output: chapter found, 1 chapter-update + 26 submission inserts expected.
3. If output looks clean: run with `--apply`.
4. Verify in MongoDB Atlas: the `game_number: 1` `chapters` doc has `placeholder` cleared; `tm_suite.downtime_submissions` has 26 new docs with that `chapter_id`.
5. Open player.html locally (or against production), pick three test characters from §Smoke test sample size above, verify Chronicle renders correctly.
6. Chronicle sort order should already be correct (shipped in `cm-2b`/`cm-4`) — if DT1 renders out of order, that's a genuine regression to investigate, not an expected fix-it-here step.

### Production credentials

Per memory `feedback_imports`: the user runs MongoDB import scripts personally. The dev's job is to deliver a script that's ready to run with clear output, not to run it themselves.

Per memory `feedback_live_credentials`: do not suggest resetting `MONGODB_URI` or other secrets. The user has the URI set in their local environment.

### What to do if the target chapter's state doesn't match what this story expects

Re-derive by `game_number: 1` query rather than trusting the `_id`/state described above — this story was corrected once already (2026-08-17) against live-state drift, and the same could happen again by the time it's picked up. If the chapter is missing entirely, already has submissions attached, or `placeholder` is already `false`, halt and report to Angelus rather than guessing at intent.

### What to do if any character record fails

If `CHAR_ID_FIXES` is missing an entry for a character with a blank source `character_id`, the script prints `SKIP (no character_id) | <name>` and continues. The dev should:
- Record which characters were skipped.
- Look them up in `tm_suite.characters` by name.
- Add the ObjectId to `CHAR_ID_FIXES` and re-run with `--force` for that character (or just re-run; the skip-existing logic only matters if the character was already imported).

### British English

The migration is server-side and produces no user-visible strings beyond the existing markdown content (which is already in the source). No British/US concern in this story unless the dev adds new strings — they should not.

### No tests required

This is a one-shot import + render verification. Manual smoke test as described above is the verification.

---

## Files Expected to Change

- **`server/scripts/di-1-import-dt1-narratives.mjs`** (new) — the import script, against `chapters`/`chapter_id`.
- **`public/js/tabs/story-tab.js`** — verify only; no change expected (sort fix already shipped in `cm-2b`/`cm-4`).
- **No schema changes.** The script writes into the existing `chapters` and `downtime_submissions` collections using existing field shapes.

---

## Definition of Done

- All AC verified.
- Chapter-1 document in production `tm_suite.chapters` (`game_number: 1`) has `placeholder` cleared and 26 submissions attached.
- 26 DT1 submission documents present in production `tm_suite.downtime_submissions`, each with `chapter_id` pointing at that chapter.
- Chronicle tab on player.html shows DT1 entries in correct chronological position for at least three sampled characters.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `di-1-import-dt1-narratives: backlog → ready-for-dev → in-progress → review` as work proceeds.
- The archived `server/scripts/archive/migrate-dt1*.js` files are left alone — not touched by this story.

---

## Dependencies and ordering

- **No upstream dependencies.** The source data exists; the script is new work.
- **No downstream blockers.** DI-2 (Game 1 letters) and DI-3 (ordeal data sync) do not depend on DI-1.
- **Pairs well with DTSR-4** (inline edit on historical cycles, ready-for-dev): once DT1 exists in MongoDB, DTSR-4's edit surface naturally applies to DT1 entries too. Land DI-1 first so DTSR-4 has DT1 data to test against.

---

## References

- `specs/epic-data-imports.md` — DI epic; DI-1 acceptance criteria and dev notes (itself may still describe the pre-rename script — verify against this story's own corrected Context section, not the epic file, if the two disagree).
- `server/scripts/archive/migrate-dt1.js` / `migrate-dt1-submissions.js` — archived, dead, but still valid reference for the transform/mapping logic (`CHAR_ID_FIXES`, the six-section markdown assembly).
- `st-working/downtime/dt1/TM_downtime1_submissions.json` — source data (26 records).
- `public/js/tabs/story-tab.js` — `renderChronicle`/`renderLatestReport` (already sort correctly; verify only).
- `memory/feedback_imports.md` — user runs all MongoDB import scripts personally; the dev delivers ready-to-run tooling.

---

## Dev Agent Record

### Completion Notes

Script written and dry-run-verified against live `tm_suite`; the real `--apply` and the manual
Chronicle smoke test are Angelus's own next action (see Task 6). No tests were written — the story's
own "No tests required" note is explicit, and this is a one-shot import script, matching the
convention of every other `dbo-*`/`cm-*` migration script in this repo.

Verification actually performed, in place of the automated tests this story explicitly waives:

- `buildPublishedOutcome` (the pure markdown-assembly function) run directly against all 26 real
  source records, no DB involved. Zero lines starting with a bare `#` outside a proper `## ` heading,
  zero backticks, zero empty outputs.
- The full script run in dry-run mode (no `--apply`, read-only) against the real configured
  `tm_suite`: target chapter found and reported correctly, all 26 records `WOULD INSERT`, 0 skipped,
  the 5 blank-`character_id` records all correctly resolved via live name lookup.
- Both genuine defects below were found by this direct verification, not predicted by the story text,
  and are now fixed:
  1. **The archived `migrate-dt1.js`'s `CHAR_ID_FIXES` map is stale.** All 5 hardcoded ids belong to a
     prior, no-longer-live character import (confirmed: none of the 5 ids resolve in live
     `characters`; the real ids, found by exact name match, share the `69d73ea4...` prefix the other
     21 source records already carry). Fixed by resolving these 5 dynamically by name at run time
     instead of trusting the hardcoded map — this also happens to be the correct convention (re-derive,
     don't hardcode) independent of the staleness bug.
  2. **`merit_actions_resolved[i].header`, not `st_narrative.action_responses[i].response`, holds the
     real narrative text.** Confirmed by reading several non-empty records directly — every record with
     merit-action content has `action_responses[*].response === ''`. The archived script read the empty
     field; had this story literally copied that logic, 20 of 26 characters would have gotten a
     silently blank Merit Actions section.
  3. (Cosmetic, also caught by the direct check) `feeding_review.best_ambience` already names its own
     territory, so unconditionally prepending `feeding_review.territories` produced a duplicated
     territory name for every single-territory character (e.g. "The Second City — The Second City —
     +2"). Fixed to only prepend `territories` when `best_ambience` doesn't already start with it.
- One deliberate structural deviation from the archived script's reference shape: `published_outcome`
  uses only single-level `## ` headings (one per project, one grouped `## Territory Reports` / `##
  Merit Actions` heading with plain-text per-item paragraphs) rather than nesting `### Title`
  sub-headings inside `## Projects`. `parseOutcomeSections` (`public/js/data/helpers.js`) only consumes
  a line starting with exactly `## `, so a `### ` line renders as literal text with visible hash
  characters — directly violating this story's own "no ## characters in display" AC. This still
  delivers "one card per project" (each project genuinely gets its own heading/section) without
  reformatting DT1 to the full v2 six-section shape, which stays explicitly out of scope.
- A genuine, unrelated, pre-existing character rename was found and is **not** a defect: DT1's source
  calls one character "Cazz" (`character_id: 69d73ea49162ece35897a480`); the live `characters`
  document at that same `_id` is now named "Casamir". Harmless — the script trusts the given
  `character_id` over the source's snapshot `character_name`, and `character_name` is written as
  DT1 recorded it (a timestamped snapshot, same convention every other submission's `character_name`
  already follows).

### File List

- `server/scripts/archive/di-1-import-dt1-narratives.mjs` (moved from `server/scripts/`, 2026-08-18 —
  the import script, never applied, retired) — the import script.
- `specs/stories/di-1-import-dt1-narratives.story.md` (this file) — Status, Tasks/Subtasks, Dev Notes,
  Dev Agent Record.
- `specs/stories/sprint-status.yaml` — `di-1-import-dt1-narratives` row: `ready-for-dev` → `review` →
  `done`.

No changes to `public/js/tabs/story-tab.js` or any other runtime file — verify-only, as scoped.

### Change Log

- 2026-08-18: Story implemented (script written, dry-run-verified against live `tm_suite`, two real
  pre-existing defects found and fixed via direct verification against real source data). Status
  `ready-for-dev` → `review`. Production `--apply` and the manual Chronicle smoke test are deliberately
  not done in this session — see Task 6.
- 2026-08-18 (later same day): while dev-storying `xpl-2`, found the target chapter was wrong (see the
  flag at the top of this file). Follow-up check found the deeper reason why: `game_number: 2` already
  holds this exact source data, imported for real back on 2026-04-17, and the player-facing Chronicle
  already renders it with no chapter-number gate. Story goal already met by pre-existing means. Script
  retired to `server/scripts/archive/`, never applied. Status `review` → `done`.
