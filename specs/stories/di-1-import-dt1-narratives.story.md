---
id: di.1
epic: di
status: ready-for-dev
priority: medium
depends_on: []
---

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
