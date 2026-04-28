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

### What already exists

The migration script is **already merged to main**: `server/migrate-dt1.js` (and an earlier sibling `server/migrate-dt1-submissions.js`). Both:

- Create or upsert a `downtime_cycles` document for DT1 (`label: 'Downtime 1'`, `game_number: 1`, `status: 'closed'`, `loaded_at: 2026-02-28`, `closed_at: 2026-03-13`).
- Map 26 raw records from `TM_downtime1_submissions.json` into `downtime_submissions` documents.
- Build `published_outcome` markdown from `st_narrative` sections (Feeding, Projects, Touchstone, Letter, Territory Reports, Merit Actions).
- Set `st_review.outcome_visibility: 'published'` so the Chronicle reader picks them up.
- Apply a `CHAR_ID_FIXES` lookup for the five characters whose source records had blank `character_id` (Charles Mercer-Willows, Eve Lockridge, Ivana Horvat, Kirk Grimm, Tegan Groves).
- Are idempotent: `--force` overwrites; default skips existing.

### What hasn't happened

Per the DI epic file (`specs/epic-data-imports.md` line 31): "**Status: Script written — awaiting run**". DT1 narratives are not in production MongoDB. The Chronicle tab on player.html shows DT2 and DT3 entries only.

### What this story finishes

Two pieces:

1. **Run the script against production** and verify the writes landed cleanly.
2. **Verify Chronicle rendering** — confirm `public/js/tabs/story-tab.js`'s `renderChronicle` (line 124) sorts DT1 entries to the correct chronological position relative to DT2/DT3, and that the rendered markdown reads cleanly inside the existing `renderOutcomeWithCards` pipeline.

There is also a small **discoverable bug**: the script at line 146 reads from `join(__dirname, '../TM_downtime1_submissions.json')` (i.e. project root), but the actual source file lives at `st-working/downtime/dt1/TM_downtime1_submissions.json`. The dev needs to either copy the source file or correct the path before running.

### Why DI-1 ships first in the DI epic

DI-1 is the only DI story with finished tooling. DI-2 is unscoped (source data location unknown). DI-3 is an investigation spike. DI-1 delivers value immediately: 26 characters get their DT1 chronicle entry.

### Files in scope

- **`server/migrate-dt1.js`** — fix source path (line 146), confirm idempotent skip behaviour, run dry-run + apply.
- **`public/js/tabs/story-tab.js`** — verify `renderChronicle` sort order (line 131-133) handles DT1 entries correctly. Sort is currently `String(b._id) > String(a._id) ? 1 : -1` (descending by `_id`); DT1 docs inserted today will have *newer* ObjectIds than DT2/DT3, which would put them at the **top** of the chronicle — incorrect. Fix: sort by `cycle.game_number` (or by `cycle.closed_at`) instead of by submission `_id`.
- **`public/js/tabs/story-tab.js`** — confirm `parseOutcomeSections` and `renderOutcomeWithCards` (used at line 144) render DT1's six markdown sections (Feeding / Projects / Touchstone / Letter / Territory Reports / Merit Actions) without breakage.

### Out of scope

- Editing DT1 narrative text. The migration is a data move, not a content edit.
- Reformatting DT1 to match the v2 six-section player report (`memory/project_dt_report_v2.md`). DT1 was authored before v2 existed; it stays in its original markdown shape.
- Building ST-side editing of imported DT1 entries. DTSR-4 (Inline edit on player Story view, historical cycles only) covers historical-cycle edits more broadly when it ships; until then DT1 entries are read-only.
- Resolving any data quality issues in the source JSON itself. If a character's DT1 narrative is malformed in source, surface the issue and decide per-record; do not add cleanup logic to the script.
- Choosing between `migrate-dt1.js` and `migrate-dt1-submissions.js`. The newer `migrate-dt1.js` is the canonical script per the epic file. The older one can be deleted after this story confirms the new one works (separate cleanup task).

---

## Acceptance Criteria

### Source file path

**Given** the dev attempts to run `node server/migrate-dt1.js`
**When** the script reads the source path at line 146
**Then** the path resolves to a real file. Either:
- `server/TM_downtime1_submissions.json` exists (e.g. copied from `st-working/downtime/dt1/`), or
- The script's path is updated to point at `../st-working/downtime/dt1/TM_downtime1_submissions.json` directly.

### Dry run

**Given** the script runs in dry-run mode (`node server/migrate-dt1.js`)
**Then** the output reports:
- The DT1 cycle: either "WOULD INSERT" or "Cycle already exists" (skip).
- Each of 26 character records: "WOULD INSERT" or "SKIP (exists)".
- A summary of inserted / updated / skipped counts.

**And** zero MongoDB writes occur.

### Apply

**Given** the script runs with `--apply` against production
**When** the cycle does not yet exist
**Then** the `Downtime 1` cycle document is inserted into `downtime_cycles` with `game_number: 1`, `status: 'closed'`.
**And** 26 submission documents are inserted into `downtime_submissions`, each with:
- `character_id` matching the live character (real ObjectId, not blank).
- `cycle_id` pointing at the new DT1 cycle.
- `published_outcome` containing the assembled markdown.
- `st_review.outcome_visibility: 'published'`.

**And** any of the 5 characters in `CHAR_ID_FIXES` resolve to a valid character ObjectId.
**And** all 26 records are present in MongoDB after the script completes.

### Idempotency

**Given** the script has already been run successfully
**When** the script is re-run with `--apply` (no `--force`)
**Then** zero new documents are inserted.
**And** the script reports "SKIP (exists)" for each existing record.

### Chronicle rendering — sort order

**Given** a character with DT1, DT2, and DT3 published submissions
**When** the player loads the Story tab on player.html
**Then** the Chronicle pane lists entries in **reverse chronological by cycle**: DT3 at top, DT2 in the middle, DT1 at the bottom.
**And** the sort key is `cycle.game_number` (descending), not submission `_id`.

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

1. Fix source-file path in `server/migrate-dt1.js:146` (or copy the JSON to the expected location).
2. Run `node server/migrate-dt1.js` (dry run). Inspect output: 1 cycle insert + 26 submission inserts expected.
3. If output looks clean: `node server/migrate-dt1.js --apply`.
4. Verify in MongoDB Atlas: `tm_suite.downtime_cycles` has a `game_number: 1` doc; `tm_suite.downtime_submissions` has 26 docs with that `cycle_id`.
5. Open player.html locally (or against production), pick three test characters from §Smoke test sample size above, verify Chronicle renders correctly.
6. If sort order is wrong (DT1 at top): fix `renderChronicle` sort key to use `cycle.game_number`.

### Sort fix in `renderChronicle`

Current sort at `public/js/tabs/story-tab.js:131-133`:

```js
const published = subs
  .filter(s => String(s.character_id) === charId && s.published_outcome)
  .sort((a, b) => (String(b._id) > String(a._id) ? 1 : -1));
```

Replace with:

```js
const published = subs
  .filter(s => String(s.character_id) === charId && s.published_outcome)
  .sort((a, b) => {
    const ga = cycleMap[String(a.cycle_id)]?.game_number ?? 0;
    const gb = cycleMap[String(b.cycle_id)]?.game_number ?? 0;
    return gb - ga; // descending: newest game first
  });
```

This requires `cycleMap` values to carry the cycle object (or at least `game_number`), not just the label string. Update the `cycleMap` construction at line 125-128 accordingly:

```js
const cycleMap = {};
for (const c of cycles) {
  cycleMap[String(c._id)] = c; // store the whole cycle, not just the label
}
```

Then update the label read at line 141 from `cycleMap[...]` to `cycleMap[...]?.label || ...`.

The same fix is needed in `renderLatestReport` at lines 40-46 if the same sort issue exists there (the game-app's "latest report" view). Worth fixing both at once.

### Production credentials

Per memory `feedback_imports`: the user runs MongoDB import scripts personally. The dev's job is to deliver a script that's ready to run with clear output, not to run it themselves.

Per memory `feedback_live_credentials`: do not suggest resetting `MONGODB_URI` or other secrets. The user has the URI set in their local environment.

### What to do if the cycle already exists in production

If MongoDB already has a `game_number: 1` cycle (e.g. from an earlier partial run), the script's default behaviour is to skip and reuse that `cycle_id`. That is correct — do not pass `--force` unless the existing cycle's metadata is wrong. Inspect first.

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

- **`server/migrate-dt1.js`** — single-line fix at line 146 to correct source path.
- **`public/js/tabs/story-tab.js`** — sort key fix in `renderChronicle` (and possibly `renderLatestReport`); cycleMap construction adjusted to carry full cycle objects.
- **No schema changes.** The script writes into the existing `downtime_cycles` and `downtime_submissions` collections using existing field shapes.

---

## Definition of Done

- All AC verified.
- DT1 cycle present in production `tm_suite.downtime_cycles`.
- 26 DT1 submission documents present in production `tm_suite.downtime_submissions`.
- Chronicle tab on player.html shows DT1 entries in correct chronological position for at least three sampled characters.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `di-1-import-dt1-narratives: backlog → ready-for-dev → in-progress → review` as work proceeds.
- The older `server/migrate-dt1-submissions.js` either flagged for deletion in completion notes or deleted (separate small commit acceptable).

---

## Dependencies and ordering

- **No upstream dependencies.** The script and source data both exist.
- **No downstream blockers.** DI-2 (Game 1 letters) and DI-3 (ordeal data sync) do not depend on DI-1.
- **Pairs well with DTSR-4** (inline edit on historical cycles, ready-for-dev): once DT1 exists in MongoDB, DTSR-4's edit surface naturally applies to DT1 entries too. Land DI-1 first so DTSR-4 has DT1 data to test against.

---

## References

- `specs/epic-data-imports.md` — DI epic; DI-1 acceptance criteria and dev notes.
- `server/migrate-dt1.js` — the canonical migration script (written 2026-04-17).
- `server/migrate-dt1-submissions.js` — earlier sibling; safe to retire after DI-1 verifies the canonical script works.
- `st-working/downtime/dt1/TM_downtime1_submissions.json` — source data (26 records).
- `public/js/tabs/story-tab.js:124-148` — `renderChronicle` (current sort behaviour and fix point).
- `memory/feedback_imports.md` — user runs all MongoDB import scripts personally; the dev delivers ready-to-run tooling.
