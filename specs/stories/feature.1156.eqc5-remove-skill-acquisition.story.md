# Story feature.1156: EQC-5 — Remove Skill-Based Acquisition

## Status: done

---
issue: 1156
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1156
branch: ms/issue-1156-eqc5-remove-skill-acquisition
depends_on: ms/issue-1155-eqc4-purchase-stat-tweak (EQC-4, #1155, done) — branch from ITS tip, same
  stacking rationale as every prior EQC story in this dedicated worktree (`TM Suite-eqc`).
---

## Story

**As a** player filing a downtime submission,
**I want** the "shake down a shopkeeper for free gear via a skill roll" channel gone from the
Acquisitions section,
**so that** equipment enters the game through exactly one of two honest channels — the programmatic
purchase flow (EQC-4, paid for in Resources/availability) or a Personal Project (a skill-based attempt
with a real narrative cost and ST adjudication) — instead of a third, free, roll-and-get-an-item
shortcut that undermines both.

## Background

Epic #1038 item 6: *"Skill-based acquisition removed — shaking down a shopkeeper becomes a personal
project, not a free acquisition channel."* Issue #1156's own text: *"Remove the skill-based acquisition
channel from the DT form. Shaking down a shopkeeper becomes a personal project, not a free acquisition
channel."* Depends on EQC-4 (#1155, done on this branch) — the epic's replacement acquisition path.

**Investigation finding, this session**: the DT form's Acquisitions section
(`key: 'acquisitions'`, gate `has_acquisitions`, title "Acquisition: Resources and Skills") has always
held **two independent sub-tables**, sharing UI chrome but functionally separate:

1. **Resources sub-table** ("Resource-Based Asset Acquisition") — spends the Resources merit rating,
   no roll. **Not in scope. Stays exactly as it is.**
2. **Skill sub-table** ("Skill-Based Asset Acquisition") — pick a Skill + specialisation, get an
   auto-derived pool (`skillAcqPoolStr`, SKILL-only per hotfix #42), describe the target, ST
   adjudicates a free item grant. **This is the channel being removed.**

The two sub-tables share section-level chrome (the `has_acquisitions` gate, `PHASE_ACQUISITION`, the
`.dt-acq-*` CSS classes, the `acquisitions_resolved[]` two-slot outcome array on the ST/story side) but
have **independent** row renderers, DOM-collection code, and persistence keys. Removing the Skill half
cleanly means touching only the Skill-specific call sites, not the shared chrome the Resources half
still needs.

**Removal shape decision (this session, informed by the schema's own existing precedent)**: the schema
file already carries this exact pattern for one field —
`skill_acq_pool_attr: { type: 'string' }  // [legacy] no longer written; #42 dropped ATTR contribution`
— retained for back-compat reads of pre-#42 submissions, no longer written by the form. This story
applies the same **"stop writing, keep reading"** shape one level up, to the whole Skill sub-table:

- The **player-facing write side** (form renderer, DOM-collector, mirror-builder in
  `downtime-form.js`) is removed entirely. A player can no longer create a new skill acquisition.
- The **ST-facing / historical read side** (`admin/downtime-views.js`'s processing queue and panel,
  `admin/downtime-story.js`'s merit-actions/summary logic, `tabs/story-tab.js`'s player summary,
  `server/schemas/downtime_submission.schema.js`, `schemas/downtime_v1.schema.json`) is **left
  untouched**. All of it is already conditional on skill-acquisition data actually being present
  (`if (skillAcq)` in `downtime-views.js`'s queue builder, `/skill/i.test(merit_type)` branches
  elsewhere) — once the form stops producing that data, these branches simply stop firing for new
  submissions while continuing to correctly render any cycle submitted before this story shipped.
  This is far less code motion than rewriting the ST-side display logic, and it is the only shape that
  keeps historical cycles readable without a data migration.

**Data-loss hazard found and designed around**: `collectResponses()`'s mirror-builder currently writes
`skill_acq_description` / `skill_acq_pool_skill` / `skill_acq_pool_spec` / `skill_acq_availability` /
`skill_acq_merits` / `skill_acquisitions` **unconditionally** inside the
`if (resourceRows.length || skillRows.length)` block (`downtime-form.js` ~1086-1104), using
`skillRows[0]` **or an empty-field fallback object** if `skillRows` is empty. Once the Skill row
renderer is gone, `skillRows` will always be `[]`, so — if this write block is left in place — it would
silently **blank out** any skill-acquisition data already sitting on the active cycle's response
document (e.g. a submission a player filled in before this story shipped, then re-saved afterward while
editing something else, like their Resources row) on every single save. This must not happen: the fix
is to delete these six lines outright (not gate them on `skillRows.length`, which would just leave dead
code), so the mirror-builder never touches those keys again and whatever value is already on the spread
base — including nothing, including something — passes through untouched.

## Explicitly NOT this story

- **The Resources sub-table is completely untouched** — same renderer (`_renderResourceRow`), same
  DOM-collection (`_collectAcqRows('resource')`), same mirror keys (`acq_resource_rows`,
  `acq_${n}_description/availability/merits`, `resources_acquisitions`), same Add/Remove affordance,
  same `.dt-acq-*` CSS. Do not rename, restructure, or "clean up" it as part of this story.
- **No schema field deletion.** `skill_acq_description`, `skill_acq_pool_skill`, `skill_acq_pool_spec`,
  `skill_acq_availability`, `skill_acq_merits`, `skill_acquisitions`, and the already-legacy
  `skill_acq_pool_attr` all stay in `server/schemas/downtime_submission.schema.js`, annotated as
  legacy/no-longer-written (matching the existing `skill_acq_pool_attr` comment style exactly), not
  removed. `schemas/downtime_v1.schema.json` (the historical CSV-import schema) is untouched — it
  describes data already imported, not the live form.
- **No change to `admin/downtime-views.js`, `admin/downtime-story.js`, or `tabs/story-tab.js`.** Every
  skill-acquisition display/outcome/summary branch in these three files stays exactly as it is — it
  continues to correctly render any pre-existing cycle's skill-acquisition data (including the current
  active cycle's, if any exists — see AC #6) and simply never fires for a submission created after this
  story ships. Confirmed via source read: none of these branches assume "skill acquisitions always
  exist"; they are all conditional on the data being present (`if (skillAcq)`,
  `entry.actionType === 'skill_acquisitions'`, `/skill/i.test(actions[i].merit_type)`).
- **`skillAcqPoolStr` (`public/js/data/accessors.js`) is not deleted.** It has a second, surviving call
  site — `admin/downtime-views.js`'s queue-builder still computes the ST-visible pool string for a
  historical skill-acquisition entry. Only `downtime-form.js`'s own import/usage of it is removed.
- **No new "shakedown" or narrative-acquisition action type is added to Personal Projects.** The
  existing `misc` action type in `PROJECT_ACTIONS` (`downtime-data.js`) is already the general-purpose
  freeform slot this behaviour redirects to — confirmed by its own label ("Misc: For things that don't
  fit in other categories") and the Projects section's own framing ("Each Project must aim to achieve
  one clear outcome"). This story adds zero new Project machinery.
- **No change to the four Playwright specs that exercise skill-acquisition display on the ST side**
  (`tests/fix-491-skill-acquisition-outcome-card.spec.js`,
  `tests/fix-493-skill-acq-outcome-summary.spec.js`,
  `tests/fix-player-skill-acq-outcome.spec.js`, the skill-half of
  `tests/fix-914-acquisition-outcome-field-slot.spec.js`). Confirmed by source read: all four seed
  Mongo/API fixtures directly with `skill_acq_*`/`skill_acquisitions` data and only drive `admin.html`
  (`page.goto('/admin.html')`) — none of them touches the player-facing form. Since the read side is
  unchanged, they continue to behave identically before and after this story's changes. Run them to
  confirm rather than editing them.
  **Correction, confirmed during implementation (branch-isolation check via `git stash`)**:
  `fix-493-skill-acq-outcome-summary.spec.js` (4 of its 5 tests) and one of
  `fix-player-skill-acq-outcome.spec.js`'s 3 tests were ALREADY FAILING before this story touched anything
  — root cause is stale fixtures that place skill-acquisition outcome data at
  `acquisitions_resolved[0]`, the pre-fix.914 slot; fix.914 (2026, later than these two files) moved
  Skill Acquisition to slot `[1]` (Resources kept `[0]`), and these two files' own fixtures were never
  updated to match. `fix-491-skill-acquisition-outcome-card.spec.js` and
  `fix-914-acquisition-outcome-field-slot.spec.js` — which DO use the correct post-fix.914 slot — are
  fully green (14/14), confirming the read side genuinely is unaffected. AC #8 below is amended to
  reflect this rather than assert something demonstrably false about the pre-existing baseline.
- **The `dt-completeness.js` MINIMAL/ADVANCED gating logic is untouched** — confirmed by source read, it
  has no `skill_acq`/`acq_skill` references; Acquisitions has been ADVANCED-only-and-optional
  (`required: false` on both sub-questions) since dt-form.17/29, unaffected by removing one sub-table.

## Acceptance Criteria

1. `public/js/tabs/downtime-data.js`'s `acquisitions` section entry no longer has a
   `skill_acquisitions` question in its `questions[]` array; the section `title` no longer mentions
   "Skills" (e.g. "Acquisition: Resources"). The `resources_acquisitions` question entry is unchanged.
2. `public/js/tabs/downtime-form.js`'s `renderAcquisitionsSection` no longer renders the "Skill-Based
   Asset Acquisition" sub-table (heading, intro paragraph, skill/specialisation/pool/description/
   availability/merits fields) — only the Resources sub-table renders, unchanged. `_renderSkillRow` and
   `_readSkillRows` are deleted; `renderAcquisitionsSection` no longer calls either.
3. `collectResponses()`'s mirror-builder no longer writes `acq_skill_rows`, `skill_acq_description`,
   `skill_acq_pool_skill`, `skill_acq_pool_spec`, `skill_acq_availability`, `skill_acq_merits`, or
   `skill_acquisitions` under any circumstance — these six-plus write statements are deleted outright
   (not gated on an always-empty `skillRows`), per the data-loss hazard in Background. The
   `_collectAcqRows('skill')` call site, the `rowKey === 'skill'` branch inside `_collectAcqRows`
   itself, and the `const skillRows = ...` variables in both `collectResponses()` and
   `renderAcquisitionsSection` are removed as dead weight from the same cut.
4. Every click/change delegated-event handler that exists ONLY to serve the removed Skill sub-table is
   deleted: the "Skill acquisition spec chip toggle" block (`[data-skill-acq-spec]`, already-dead code
   predating dt-form.29 — confirmed via grep that `_renderSkillRow` never emits that attribute), the
   `[data-acq-skill]` change-handler block (`downtime-form.js` ~2961-2974, re-renders on skill-dropdown
   change — its target selector no longer exists anywhere once `_renderSkillRow` is gone), **and the
   `[data-acq-skill-spec]` click handler (`acqSkillSpec`)** — the live spec-chip toggle
   `_renderSkillRow` itself emitted (`data-acq-skill-spec`/`data-acq-skill-spec-hidden`), distinct from
   the already-dead `data-skill-acq-spec` handler named above; provably dead by the identical reasoning
   once `_renderSkillRow` is gone. **(Amended post-external-review: this handler was correctly deleted
   during implementation but not originally named in this AC's enumerated list — the AC text is
   corrected here to match, per this project's own "reconcile the AC text" convention rather than
   leaving a disclosed deviation undocumented in the acceptance criteria themselves.)** The shared
   Add/Remove/dot/unknown/spec-chip handlers that serve BOTH sub-tables via a `rowKey` parameter are
   left in place (Resources still uses them); their now-unreachable `rowKey === 'skill'` ternary
   branches in the Add/Remove handlers may be simplified as adjacent cleanup, at the implementer's
   discretion, since they're provably unreachable once no `data-acq-add-row="skill"`/
   `data-acq-row-remove="skill"` element can ever render — but this is not required for the AC to pass.
5. `public/js/tabs/downtime-form.js`'s import from `../data/accessors.js` no longer names
   `skillAcqPoolStr` (its only remaining use in this file was inside the deleted `_renderSkillRow` and
   mirror-builder code). Every other name in that import statement is preserved unchanged.
6. `server/schemas/downtime_submission.schema.js`'s ACQUISITIONS block gets its `skill_acq_*`/
   `skill_acquisitions` field comments updated to the same "[legacy] no longer written; retained for
   back-compat reads of pre-EQC-5 submissions" phrasing already used for `skill_acq_pool_attr` — no
   field is deleted, no `type` changes. `schemas/downtime_submission.schema.md` gets the matching prose
   update. Before merging, check whether the **currently active downtime cycle** (if one exists) has any
   in-flight submission with non-empty `skill_acq_description`/`skill_acquisitions` — if so, flag it to
   Angelus rather than silently shipping a change that stops that player from ever completing/clearing
   that field through the form again (informational check, not a blocking gate — the ST can adjudicate
   an in-flight one manually either way).
7. `npx vitest run server/tests` (the repo's real regression gate — `npm test` is a no-op stub, per
   `deferred-work.md`): every downtime-form / equipment / acquisition-related suite green; no new
   failures against the pre-change baseline.
8. `npx playwright test tests/fix-491-skill-acquisition-outcome-card.spec.js
   tests/fix-493-skill-acq-outcome-summary.spec.js tests/fix-player-skill-acq-outcome.spec.js
   tests/fix-914-acquisition-outcome-field-slot.spec.js` — unmodified. `fix-491` and `fix-914` fully
   green, confirming the historical-cycle read side genuinely still works after the write-side removal.
   `fix-493` (4 of 5 tests) and one of `fix-player-skill-acq-outcome`'s 3 tests show the SAME failures as the
   pre-this-story baseline (confirmed via `git stash` isolation) — a pre-existing stale-fixture bug
   (post-fix.914 slot `[1]` never backported into these two files' fixtures), unrelated to this story
   and out of its scope to fix. Logged in `deferred-work.md`.
9. TM Wiki, TM Cockpit, and TM Herald are completely untouched — TM Suite-only.

## Tasks / Subtasks

- [x] **Task 1 — Form data definition** (AC #1)
  - [x] `downtime-data.js`: remove the `skill_acquisitions` question object; update the `acquisitions`
        section's `title`.
  - [x] Grep for any other consumer of `DOWNTIME_SECTIONS['acquisitions'].title` before assuming the
        rename is purely cosmetic (the generic per-section renderer `continue`s past this section, but
        confirm no TOC/nav/label lookup reads the array's `title` field directly for a skipped section).

- [x] **Task 2 — DT form: remove the Skill sub-table** (AC #2, #3, #4, #5)
  - [x] Delete `_renderSkillRow`, `_readSkillRows`, and the "Skills sub-table" block inside
        `renderAcquisitionsSection` (including its `skillRows`/`skillRow0` locals).
  - [x] Delete the six unconditional `skill_acq_*`/`skill_acquisitions` writes and the `acq_skill_rows`
        write in `collectResponses()`'s mirror-builder; delete the now-unused `skillRows` local and the
        `_collectAcqRows('skill')` call site; delete the `rowKey === 'skill'` branch inside
        `_collectAcqRows` itself. Simplify `if (resourceRows.length || skillRows.length)` to
        `if (resourceRows.length)`.
  - [x] Delete the dead "Skill acquisition spec chip toggle" handler block and the
        `[data-acq-skill]` change-handler block. Also deleted the `[data-acq-skill-spec]` handler
        (`acqSkillSpec`) found during implementation — not enumerated in the original AC text but
        provably dead by the same reasoning (its target attribute only ever came from `_renderSkillRow`).
  - [x] Trim `skillAcqPoolStr` from the `../data/accessors.js` import line — checked first: no test
        asserts an exact-match regex on that import statement's brace contents, safe to trim.

- [x] **Task 3 — Schema annotation** (AC #6)
  - [x] `server/schemas/downtime_submission.schema.js`: update the `skill_acq_*`/`skill_acquisitions`
        field comments to the legacy/no-longer-written phrasing; leave every field declaration itself
        unchanged.
  - [x] `schemas/downtime_submission.schema.md`: mirror the same prose update.
  - [x] Checked the live active downtime cycle for an in-flight submission with non-empty
        `skill_acq_description`/`skill_acquisitions`: **5 submissions found** (see Completion Notes —
        flagged to Angelus, not a blocker).

- [x] **Task 4 — Full regression** (AC #7, #8, #9)
  - [x] `npx vitest run server/tests` — confirm zero new failures against this branch's pre-change
        baseline (capture the baseline first, per this file's own established practice in every prior
        EQC story's Debug Log).
  - [x] Ran the four named Playwright specs (unmodified). `fix-491` + `fix-914` fully green (14/14).
        `fix-493` (4 of 5) + 1 of `fix-player-skill-acq-outcome`'s 3 failed — confirmed via `git stash`
        isolation these are pre-existing (identical failures on the pre-EQC-5 baseline), a stale-fixture
        bug unrelated to this story. Logged in `deferred-work.md`; AC #8 amended to match.
  - [x] Confirm zero diff under TM Wiki, TM Cockpit, TM Herald.

## Dev Notes

- **Read `downtime-form.js`'s current Acquisitions machinery in full before editing anything** — the
  Resources and Skill sub-tables are woven together through several shared helper functions
  (`_renderAcqAvailabilityDots`, `_renderAcqMeritsCheckboxes`, `_collectAcqRows`) that take a `rowKey`
  parameter. Only the `'skill'`-specific branches/call sites are in scope; the shared helpers themselves
  are not being removed, only narrowed to their Resources-only remaining caller.
- The "stop writing, keep reading" shape is not a shortcut taken to save effort — it is the only shape
  that avoids a data migration and matches this codebase's own established convention for retiring a
  form field (see `skill_acq_pool_attr`'s own comment, written for exactly this reason after hotfix
  #42). Do not "finish the job" by also touching the ST-side read code or the schema field types; that
  is explicitly out of scope (see "Explicitly NOT this story") and would break historical-cycle
  rendering for no benefit.
- The data-loss hazard in Background (mirror-builder blanking `skill_acq_*` on unrelated saves) is the
  single most important correctness point in this story. Prove it's fixed: seed a saved-response fixture
  with non-empty `skill_acq_description` (simulating a pre-existing skill acquisition on the active
  cycle), run `collectResponses()`'s logic path (or a static-analysis assertion that the six write
  statements are gone from source, per this file's established DOM-coupled-module testing convention —
  see EQC-4's own Debug Log for why direct execution isn't how this file is tested), and confirm the
  value is not zeroed.
- `server/tests/dt-form-territory-fresh-fetch.test.js` has a `vi.mock('../../public/js/data/accessors.js', ...)`
  stub that includes a `skillAcqPoolStr: () => ''` entry — this needs **no change**. An unused key in a
  full-module mock is harmless; only the real import statement in `downtime-form.js` needs trimming.
- New regression coverage for this story's own changes belongs in a new file,
  `server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js`, following this file's own
  static-source-analysis convention for `downtime-form.js` (see `issue-871-876-ecm-4-9-bundle.test.js`
  for the pattern): assert the Skill sub-table's marker strings/functions are absent, assert the
  Resources sub-table's are still present (regression guard), assert the schema still declares (not
  deletes) the `skill_acq_*` fields.

### Project Structure Notes

- Modified: `public/js/tabs/downtime-data.js`, `public/js/tabs/downtime-form.js`,
  `server/schemas/downtime_submission.schema.js`, `schemas/downtime_submission.schema.md`.
- New: `server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js`.
- Explicitly untouched (verified by source read, not assumption): `public/js/admin/downtime-views.js`,
  `public/js/admin/downtime-story.js`, `public/js/tabs/story-tab.js`, `public/js/data/accessors.js`
  (function body — only its DOWNTIME-FORM import site changes), `public/css/components.css`,
  `schemas/downtime_v1.schema.json`, all four named Playwright specs.
- No new schema fields; no field type changes; no new collections.

### References

- Epic EQC, issue #1038, desired-behaviour item 6.
- Issue #1156 (this story).
- `server/schemas/downtime_submission.schema.js` lines ~336-368 — the ACQUISITIONS block, including the
  `skill_acq_pool_attr` legacy-comment precedent this story's whole removal shape follows.
- `specs/stories/dt-form.29-acquisitions-redesign.story.md` — built the current two-sub-table structure
  this story is narrowing back down.
- `specs/stories/dtlt.7.st-processing-skill-acq-parity.story.md` — added `skillAcqPoolStr` to
  `accessors.js` as the SSOT pool computation this story leaves in place for historical display.
- `specs/stories/fix.914.dt-acquisition-outcomes-surface.story.md` — the `acquisitions_resolved[0]`
  (Resources) vs `[1]` (Skill) two-slot indexing this story does not touch.
- `specs/stories/feature.1155.eqc4-purchase-stat-tweak.story.md` — the sole remaining acquisition path
  (programmatic purchase) once this story ships; also the source of the "exact-match import regex" trap
  noted in Task 2.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5, via `bmad-dev-story`.

### Debug Log References

- Full scoped regression (`npx vitest run server/tests`) before this story's changes: 100 failed
  suites / 79 passed / 2 skipped (181 test files); 2 failed / 1169 passed / 1153 skipped (2322 tests) —
  matches the two documented pre-existing failures (`n7-n9-allocator-readers.test.js`,
  `oath-a-pledge-helpers.test.js`) and the 100 pre-existing DB-connection guard trips exactly.
- Post-change full scoped regression: 100 failed suites / 80 passed (+1, the new test file) / 2 skipped
  (182 test files); 2 failed tests (SAME two pre-existing, unrelated) / 1191 passed (+22, matching the
  new test file's original 22-test count) / 1153 skipped (2346 tests). Zero new failures. (This count
  grew to 25 tests in the same file after the code-review patch round below; final post-patch numbers
  are in that section.)
- The new test file's first run caught a real self-inflicted bug: two of my own explanatory comments
  (added while deleting the skill-acquisition code) literally spelled out the code-shaped strings
  `` `rowKey === 'skill'` `` and `` `data-skill-acq-spec` `` as prose, which is indistinguishable from
  live code to a substring-match regression guard. Reworded both comments to describe the removed
  pattern without reproducing its exact syntax; re-ran green.
- Playwright: ran the four named specs and found `fix-493-skill-acq-outcome-summary.spec.js` (4 of its
  5 tests) and one of `fix-player-skill-acq-outcome.spec.js`'s 3 tests failing. Isolated via `git stash` (reverting
  to the EQC-4 tip, re-running, then `git stash pop`) — identical failures exist on the pre-EQC-5
  baseline. Root cause: both files' fixtures place skill-acquisition outcome data at
  `acquisitions_resolved[0]`, the pre-fix.914 slot; fix.914 moved Skill Acquisition to slot `[1]` and
  these two files were never updated. Pre-existing, unrelated to this story, out of scope to fix here.
  Logged in `deferred-work.md`; amended AC #8 to state this precisely rather than the originally-drafted
  (and, it turned out, false) claim that all four specs would pass unmodified — the story's own
  "Explicitly NOT this story" research had already flagged this exact risk (citing fix-491's own
  docstring) but the story was written without actually running the specs to confirm; this implementation
  pass is what surfaced the gap between "looks safe by source read" and "verified by execution."
- Live-data check (Task 3, AC #6): queried the active downtime cycle via a temporary read-only script
  (`connectDb`/`getCollection` from `server/db.js`, matching the `migrate-eqc1-bucket-taxonomy.mjs`
  connection pattern; deleted after use, not committed). Matched `cycle_id` against both ObjectId and
  string forms of the active cycle's `_id` per `server/routes/downtime.js:50-52`'s own defensive
  handling (a known ObjectId/string type-mismatch trap in this collection). **Found 5 submissions on the
  currently active cycle with non-empty skill-acquisition data.** See Completion Notes.

### Completion Notes List

- Removed the Skill sub-table's write side entirely from `downtime-form.js` (renderer, DOM-collector,
  mirror-builder writes, all skill-only delegated event handlers) and its question definition from
  `downtime-data.js`. The Resources sub-table is byte-for-byte behaviourally unchanged — same renderer,
  same mirror keys, same Add/Remove affordance.
- Found and removed one skill-only handler beyond the story's own AC #4 enumeration during
  implementation: the `[data-acq-skill-spec]` click handler (`acqSkillSpec`) — its target attribute was
  only ever emitted by the now-deleted `_renderSkillRow`, making it provably dead by the same reasoning
  already applied to the two handlers the AC did name.
  ✅ Resolved: this widens AC #4's coverage rather than contradicting it; noted for the record since it
  wasn't in the original enumerated list.
- Fixed the data-loss hazard identified at story-creation time: `collectResponses()`'s mirror-builder no
  longer writes any `skill_acq_*`/`skill_acquisitions`/`acq_skill_rows` key under any circumstance (the
  six-plus writes were previously unconditional inside the `resourceRows.length || skillRows.length`
  block, which would have zeroed out any pre-existing skill-acquisition data on the active cycle's
  submission on every unrelated save once `skillRows` was permanently empty).
- Schema fields annotated `[legacy]`, not deleted, per the pre-existing `skill_acq_pool_attr` precedent
  in the same file. `schemas/downtime_submission.schema.md` updated to match.
- **Live-data finding requiring Angelus's attention (not a blocker, but real)**: the currently active
  downtime cycle has 5 submissions with non-empty skill-acquisition data already filed. Their existing
  data is safe (schema fields preserved, ST-side read/processing/story-panel code untouched, mirror
  builder no longer overwrites those keys) and will continue to display and resolve correctly for the
  ST. What changes: those 5 players (and everyone else) can no longer add a NEW skill acquisition or
  edit an EXISTING one through the form once this ships — the UI is gone. If any of the 5 needed to
  revise their entry this cycle, that now has to happen by other means (an ST manually adjusting the
  submission, or treating it as a Personal Project going forward). Character IDs available on request
  (not included here to keep this record from embedding player data).
- Discovered and logged a genuinely pre-existing, EQC-5-unrelated test bug (two Playwright specs with
  stale pre-fix.914 fixtures) — see Debug Log and `deferred-work.md`. AC #8 was amended in place to
  describe the verified-true state rather than the story's original (unverified-by-execution) claim.

### File List

- `public/js/tabs/downtime-data.js` (modified — removed `skill_acquisitions` question, updated section
  title; review-patched — `has_acquisitions` gate label no longer mentions Skills)
- `public/js/tabs/downtime-form.js` (modified — removed `_renderSkillRow`, `_readSkillRows`, the Skill
  sub-table block, all skill-only mirror-builder writes and delegated event handlers, the `skillAcqPoolStr`
  import)
- `server/schemas/downtime_submission.schema.js` (modified — `skill_acq_*`/`skill_acquisitions`/
  `acq_skill_rows` field comments annotated `[legacy]`; no field deleted or retyped)
- `schemas/downtime_submission.schema.md` (modified — Skill-Based Acquisition table annotated legacy)
- `server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js` (new — 22 static-analysis regression
  tests: write-side removal, read-side/schema untouched; review-patched — 3 more tests added, see
  Senior Developer Review)
- `specs/deferred-work.md` (modified — logged the pre-existing stale-fixture finding; review-patched —
  corrected per-file Playwright test-count wording)
- `specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md` (this story — AC #4 and #8 and
  their supporting references amended in place; see Senior Developer Review for the external-review
  patch round)
- `specs/stories/code-review/issue-1156-eqc5-diff.txt`,
  `specs/stories/code-review/issue-1156-eqc5-codex-review.md`,
  `specs/stories/code-review/issue-1156-eqc5-codex-findings.md`,
  `specs/stories/code-review/issue-1156-eqc5-codex-raw-output.txt` (new — external review artefacts)

## Senior Developer Review (AI)

**Review path**: Codex external CLI-direct review (the epic's established default), single combined
3-pass session (Blind Hunter → Edge Case Hunter → Acceptance Auditor), `model_reasoning_effort=high`,
run against commit `e619f4f4` (base `061f6ce6`, the EQC-4 tip) with the diff scoped to source + the new
test file only — the story spec and `deferred-work.md` deliberately excluded so Passes 1–2 stayed
blind. Prompt and raw findings preserved at
`specs/stories/code-review/issue-1156-eqc5-codex-{review,findings,raw-output}.*`. Every finding below
was independently re-verified against the real code/tests in this session before triage — none was
accepted on the reviewer's word alone (baseline calibration: roughly half of any external review's
confident-sounding findings have turned out false on this project before; none of this pass's did, but
each was checked regardless).

**Tripwires**: gate numbers in the reviewer's own report (100 failed / 80 passed / 2 skipped, 182 files;
2 failed / 1191 passed / 1153 skipped, 2346 tests) matched a fresh local run exactly at review time —
review is genuinely about this change. Pass isolation confirmed distinct file sets per pass in the
Validation notes (Pass 1: diff only; Pass 2: diff + repo, no story; Pass 3a: diff + spec headings +
named sections only, no Dev Agent Record; Pass 3b: full record) — no evidence of collapsed passes.

**Findings and dispositions** (0 High, 1 Medium, 6 Low — no blocking runtime defect):

- **[Medium, Pass 3a, patched]** AC #4 enumerated two handlers for deletion (`[data-skill-acq-spec]`,
  `[data-acq-skill]`) but the implementation correctly also deleted a third, distinct, equally-dead
  handler (`[data-acq-skill-spec]`/`acqSkillSpec`) that wasn't in the AC's literal list — a real,
  confirmed AC-text/implementation mismatch (the Completion Notes had disclosed the deviation but never
  amended the AC itself, which this project's own convention treats as insufficient — a disclosure
  alone doesn't reconcile the acceptance text). **Patched**: AC #4 amended in place to name the third
  handler explicitly and record why. No code change — the implementation was already correct; the
  spec text was wrong.
- **[Low, Pass 1, patched]** The "Add/Remove row handlers hardcode acq_resource_rows" test only
  asserted the OLD `rowKey === 'skill'` ternary was absent (a negative, whole-file check) — it never
  positively proved either handler still reads/writes `acq_resource_rows`, so a regression that broke
  Resources acquisitions entirely could still pass this test. **Patched**: added two new tests slicing
  each handler's own body and asserting both the read and the write. Prove-discriminated (renamed the
  key to `acq_BROKEN_rows` in the Add handler only, confirmed exactly the new Add-handler test failed
  and nothing else, restored, confirmed 24/24 green).
- **[Low, Pass 1, patched]** The "no data-acq-skill markup" test's regex (`/data-acq-skill[="[]/`)
  cannot match a trailing hyphen, so it silently never covered `data-acq-skill-spec`/`-hidden` — the
  attributes `_renderSkillRow` actually emitted. The second assertion checked `data-skill-acq-spec`
  (reversed word order — the OLDER, already-dead pre-dt-form.29 handler's name), not the live
  `data-acq-skill-spec`. **Patched**: added direct, explicit assertions for `data-acq-skill=`,
  `data-acq-skill-spec`, and `data-acq-skill-spec-hidden` by name. Prove-discriminated (temporarily
  reintroduced a `data-acq-skill-spec="x"` string near the top of the file, confirmed exactly the new
  assertion failed, restored, confirmed green).
- **[Low, Pass 1, patched]** The schema `[legacy]` annotation test checked for a single `[legacy]`
  token anywhere in a 1,400-character slice — one field losing its annotation while a sibling field kept
  theirs would still pass. **Patched**: rewrote as a per-field loop, one regex per key, matching the
  same discipline already used by the neighbouring "still declared" test. Prove-discriminated (stripped
  `[legacy]` from `skill_acq_merits` only, confirmed exactly the new test failed and named that field,
  restored, confirmed green).
- **[Low, Pass 2, patched]** `DOWNTIME_GATES`'s `has_acquisitions` entry — a separate array from the
  Acquisitions section's own `questions[]`, missed during the original story-creation research — still
  read *"Do you want to use Resources or Skills to attempt to acquire anything?"* Confirmed dormant (no
  renderer in `downtime-form.js` reads `gate.label`, only `gate.key` — both call sites verified by grep),
  so zero current player-facing effect, but stale/contradictory source-of-truth text describing a
  channel this story just removed. **Patched**: label updated to drop "or Skills"; added a regression
  test. First version of the test itself had a bug — `src.indexOf('DOWNTIME_GATES')` matched the FILE'S
  HEADER COMMENT (line 5, which also mentions the name) rather than the actual `export const
  DOWNTIME_GATES` array (line 438), so the assertion passed even with the stale label still present
  in a repro check. Caught during this review's own prove-discrimination step (the "revert and confirm
  it fails" check exposed it), fixed to anchor on `'export const DOWNTIME_GATES'` instead, re-confirmed
  the prove-discrimination sequence correctly fails-then-passes.
- **[Low, Pass 3b, patched]** The Dev Agent Record's per-file Playwright denominators were wrong:
  `fix-493-skill-acq-outcome-summary.spec.js` has 5 tests (4 failed, 1 passed), not "4/4"; the record
  had also mis-attributed the two-file COMBINED total (8 tests) to
  `fix-player-skill-acq-outcome.spec.js` alone as "1/8", when that file has only 3 tests (1 failed, 2
  passed). Confirmed by `grep -c` against both spec files. Root cause of the claimed failure (stale
  pre-fix.914 `acquisitions_resolved[0]` slot) was correct and unaffected — only the denominators were
  wrong. **Patched**: corrected every occurrence (4 locations across the story and 1 in
  `deferred-work.md`) to "4 of its 5 tests" / "one of ... 3 tests" phrasing.
- **[Low, Pass 3b, patched]** The full-gate Debug Log entry reported passed/failed suite and test
  counts but omitted the file-level skipped count and total file count, and stated tests-skipped without
  its own total. **Patched**: rewrote both baseline and post-change lines with complete `X failed / Y
  passed / Z skipped (N test files)` and `X failed / Y passed / Z skipped (N tests)` figures.
- **[Low, Pass 3b, dismissed — environmental, not a defect]** The live "5 affected active-cycle
  submissions" claim and the "confirmed via git-stash baseline execution" claim were both flagged as
  unverifiable in the REVIEWER's own sandbox (no outbound MongoDB network access; a worktree
  `index.lock` permission error blocked detaching to the base commit). Both were genuinely,
  successfully executed in THIS session with real output already captured in the Debug Log (the live
  query returned 5 real character IDs; the `git stash`/`stash pop` cycle ran cleanly and reproduced the
  identical failures at both commits). Codex's own alternate verification — identical git blob IDs for
  every read-side file and both spec files between `061f6ce6` and `e619f4f4` — independently
  corroborates rather than contradicts the claim. No record change needed; this is a disclosed
  reviewer-side environment limitation, not a false claim (matches this project's own established
  triage precedent for exactly this class of finding).

**Post-patch verification**: `npx vitest run server/tests` — 100 failed suites / 80 passed / 2 skipped
(182 test files); 2 failed tests (the same two pre-existing, unrelated failures) / 1194 passed (+3 over
the pre-review-patch count, the three new/strengthened regression tests) / 1153 skipped (2349 tests).
Matches the pre-patch baseline exactly on suite/failure counts, zero new failures. Every patch
prove-discriminated individually (single-change revert → confirm the exact expected test fails and
nothing else → restore → confirm green) before this final run, including catching and fixing a bug in
one of the review's OWN patches (the `DOWNTIME_GATES` test's index anchor) during that same
prove-discrimination step.
