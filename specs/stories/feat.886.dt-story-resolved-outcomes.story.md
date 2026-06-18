---
title: 'DT Story tab: replace narrative-drafting layer with resolved-outcome display (keep Story Moment)'
type: 'feat'
issue: 886
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/886
branch: ms/issue-886-dt-story-resolved-outcomes
created: '2026-06-18'
status: review
recommended_model: 'opus — touches the publish pipeline (compilePushOutcome) and completion-gating across multiple section types; correctness-sensitive, not a mechanical edit'
context:
  - public/js/admin/downtime-story.js
  - public/js/admin/downtime-views.js
  - public/css/admin-layout.css
  - specs/project-context.md
  - specs/architecture/coding-standards.md
---

## Intent

This is a **refactor**, not a new feature. The DT admin **Story** tab currently makes
the ST author a narrative per section via a *Copy Context prompt → (paste into LLM) →
paste response into a draft textarea → Mark Complete* flow. That layer existed because
narratives used to be **generated** from a prompt.

That is no longer the workflow. The ST now writes the player-facing narrative
**directly** during processing, in the processing-tab **Outcome** box
(`rev.outcome`), with player-facing ST feedback in the **Player Feedback** box
(`rev.player_facing_note`). So the Story-tab generate-and-draft layer is **redundant
re-authoring** for every section except Story Moment.

Replace that layer (everywhere **except Story Moment**) with a **read-only display of
the already-resolved action**. Story Moment keeps its prompt → generate → draft →
Mark Complete flow, because it is still genuinely prompt-generated (Letter from
Home / Touchstone Vignette) and has no upstream processing outcome.

### What the user (Angelus) confirmed in chat — source of truth

> The Outcome **is** the player-facing narrative. They're meant to see, per action:
> - **Name (Action type)** — e.g. "The Kiss (Feeding)"
> - **Description** — what the player originally entered
> - **Outcome** — the player-facing outcome (`rev.outcome`)
> - **Dice pool** — the mechanical outcome  *(muted)*
> - **Feedback** — the player-facing ST feedback (`rev.player_facing_note`)  *(muted)*
>
> The last two (Dice pool, Feedback) should be visually muted.
> "Instead of using context prompts to generate a response, they're being written
> directly, so the additional layer for that is now redundant. The prompt is still
> viable for the Story Moment however."

## Scope — REVISED during dev after code analysis + user direction (2026-06-18)

The original issue listed every non-Story-Moment section. Code analysis + two user
clarifications narrowed this. Only **6 sections are live** (`getApplicableSections`):
Story Moment, Home Report, Feeding, Project Reports, Allies & Asset Summary
(`merit_summary`), Rumours (`cacophony_savvy`). Sorting them by the user's principle
("outcomes are now written directly in processing, so the re-authoring layer is
redundant; the prompt is still viable for Story Moment"):

| Section | Decision | Why |
|---|---|---|
| **Feeding** | **Refactor → resolved card** | Has directly-written `rev.outcome` + `rev.player_facing_note` |
| **Project Reports** | **Refactor → resolved card** | Same |
| **Home Report** | **Remove entirely** | User: "redundant, replaced by Territory Pulse." Already vestigial — `compilePushOutcome` has no `home_report` branch, so it never reached players anyway |
| **Allies & Asset Summary** (`merit_summary`) | **Unchanged** | Already a read-only outcome summary (reads `rev.outcome_summary`); no draft box exists |
| **Rumours** (`cacophony_savvy`) | **Unchanged** | No processing outcome; still genuinely prompt-authored, like Story Moment |
| **Story Moment** | **Unchanged** | Prompt still viable (user) |

**In scope**
- Feeding + Project Reports: replace the drafting layer with a read-only resolved card
  (Name (Action type) / Description / Outcome / Dice pool [muted] / Feedback [muted]).
- Remove the Home Report section (drop from `getApplicableSections`; remove dispatch,
  `isSectionDone` case, Copy Context route + handler, and the now-dead
  `renderHomeReport` / `buildHomeReportContext` / re-render handler).
- `compilePushOutcome`: source Feeding + Project bodies from `rev.outcome`
  (+ `rev.player_facing_note`) instead of `st_narrative.*` drafts. Keep Territory
  Pulse injection, joint-project logic, Story Moment + Rumours branches unchanged.
- Completion-gating: Feeding + Project "done" derives from `rev.outcome` present
  (Project gating is mandatory — its old draft-based gate would otherwise never
  complete once the boxes are gone).

**Out of scope / unchanged**
- Story Moment, Rumours, Allies & Asset Summary — untouched.
- Processing-tab authoring (`downtime-views.js` Outcome / Player Feedback boxes).
- The player's delivered report surface (`story-tab.js` `renderHomeReportSection` and
  its `compilePushOutcome` import) — keep `compilePushOutcome` exported and its output
  shape compatible. QA must confirm the delivered report still renders.
- Data migration / backfill of historical `st_narrative.*` drafts.

## Architecture — read this before touching code

### A. The two surfaces and where each field lives

| Surface | File | Role |
|---|---|---|
| DT **Processing** tab | `public/js/admin/downtime-views.js` | ST resolves each action: validates pool, rolls, writes **Outcome** (`rev.outcome`, textarea at ~`9444`) and **Player Feedback** (`rev.player_facing_note`, ~`9452`). Persisted per-entry via `saveEntryReview`. **Do not change this authoring.** |
| DT **Story** tab | `public/js/admin/downtime-story.js` | Currently re-authors narrative into `st_narrative.*`; then **Push** publishes. This is what the refactor changes. |

Per-action resolved fields (the read source for the new cards), where `rev` is the
resolved entry for the action:
- Feeding: `rev = sub.feeding_review`; roll = `sub.feeding_roll`
- Project: `rev = sub.projects_resolved[idx]`
- Merit: `rev = sub.merit_actions_resolved[idx]`
- `rev.outcome` — player-facing **Outcome** (the narrative)
- `rev.player_facing_note` — player-facing **Feedback**
- `rev.pool_validated` / `rev.pool_player` — dice pool
- `rev.roll` (project/merit) or `sub.feeding_roll` (feeding) — `{ successes, exceptional, dice_string }`

> NOTE — correction to the issue body: issue #886 referenced `st_review.outcome_text`
> (`downtime-views.js:9442`) as the per-action outcome. That is wrong.
> `st_review.outcome_text` (set at `downtime-story.js:3835` / `downtime-views.js:10853`)
> is the **assembled whole-submission published markdown**. The **per-action** outcome
> is `rev.outcome` (defined `downtime-views.js:9250`, rendered `9444`). Use `rev.outcome`.

### B. The publish pipeline — the load-bearing consequence (do NOT miss this)

`compilePushOutcome(sub, char, cycle)` (`downtime-story.js:3582`) assembles the
player-facing markdown that **Push** publishes to `st_review.outcome_text` with
`outcome_visibility: 'published'` (`handlePushCharacter`, `3817-3851`).

Today it reads the **drafts**: `sn.feeding_narrative.response`,
`sn.project_responses[i].response`, `sn.action_responses[i].response`,
`sn.territory_reports[i].response`, `sn.story_moment` (`3596-3711`). It already
appends `rev.player_facing_note` after project (`3689`) and merit (`3707`) responses.

**If you delete the draft boxes without changing this, Push publishes nothing for
those sections** (only `_GAP_TEXT`). So the refactor MUST repoint each non-Story-Moment
branch of `compilePushOutcome` to source the section body from `rev.outcome`
(falling back to empty/omit when absent), keeping `rev.player_facing_note` appended.
Story Moment's branch (`3629-3642`) stays exactly as is.

Also confirm the **second caller**: `story-tab.js` calls `compilePushOutcome` for
inline player edits (the export is used outside this module — see the comment at
`3583`). Re-test that path.

### C. Completion-gating — repoint from draft status to resolved status

`isSectionDone(stNarrative, sectionKey, sub)` (`526-558`) and the per-section helpers
drive the sign-off counter, the nav-rail pills, and the section completion dots.
Today, for project/merit/territory/cacophony sections, "done" means the **draft** was
marked complete (`projectResponsesComplete` checks
`st_narrative.project_responses[idx].status === 'complete'`, `513-521`;
`actionResponsesComplete`, `meritSummaryComplete`, `cacophonySavvyComplete` similar).

After the refactor there is no per-section Mark Complete for those sections, so their
"done" state must derive from the **resolved outcome being present** (e.g. terminal
`rev.pool_status` and/or non-empty `rev.outcome`). Note Feeding already keys off
`feeding_review.pool_status` rather than the narrative (`529-533`) — follow that
precedent. Story Moment's branch (`540-545`) is unchanged.

Update `getNavPillState` (`1181+`) and the sign-off panel (`renderSignOffPanel`,
`3853`) consistently so the "X/Y sections complete" count and pill colours still make
sense with the new completion source.

### D. Files / functions to touch

`public/js/admin/downtime-story.js`
- `renderFeedingValidation` — feeding section (`~1477-1575`). Keep the existing
  `dt-feed-val-dl` mechanical block (Pool / Result / Declaration). **Remove** the
  DTSR-7 `dt-feed-val-narrative-block` (`1543-1571`: subhead + Copy Context + prompt +
  `dt-feed-narrative-ta` + Save Draft / Needs Revision / Mark Complete + revision
  area). **Add** the read-only resolved card (5 fields below).
- `renderProjectSection` / `renderProjectCard` (`1579-1705`) — remove the response
  textarea + action buttons + revision area (`1684-1701`) and the Copy Context button
  (`1657`); keep/feed the read-only card. The existing meta row already shows
  Outcome/Pool/Roll (`1660-1667`) — fold into the new 5-field card layout.
- `renderHomeReport` (`3203`), `renderCacophonySavvy` (`3485`), `renderMeritSummary`
  (`2312`), and the merit-section renderers (`renderAlliesSection`,
  `renderStatusSection`, `renderRetainerSection`, `renderContactsSection`,
  `renderResourcesSection`, `renderMiscMeritSection`) and `renderTerritoryReports` —
  same treatment: strip the drafting layer, render the read-only card.
- `renderStoryMoment` (`1863`) — **DO NOT CHANGE.** Keep Copy Context, format radios,
  draft textarea, Mark Complete.
- `compilePushOutcome` (`3582`) — repoint non-Story-Moment branches to `rev.outcome` (§B).
- `isSectionDone` + helpers (`526-558`, `510-521`) — repoint to resolved status (§C).
- Event delegation in the panel click/blur handlers (`~299-360`, `230-292`): the
  Save Draft / Mark Complete / Needs Revision / blur-autosave handlers for
  `.dt-story-response-ta` / `.dt-feed-narrative-ta` will become dead for the
  refactored sections. They MUST remain wired for Story Moment (and any retained
  textareas). Remove only the now-unreachable branches; do not break Story Moment.
- The **Copy Context** routing (`277-288`) keeps `story_moment` (and any retained
  context paths); remove routes that no longer have a button.

`public/css/admin-layout.css`
- Reuse the `dt-feed-val-dl` / `dt-feed-val-row` (`dt`/`dd`) pattern (`7399-7402`)
  for the resolved card. Labels already use `var(--txt3)` (muted) and values
  `var(--txt1)`.
- For the two **muted** fields (Dice pool, Feedback): render their values with a
  muted token (e.g. `var(--txt2)`/`var(--txt3)`) via a small modifier class added to
  the stylesheet — **no inline `style=`, no bare hex** (see CSS Standards below).
- Dead CSS for the removed drafting chrome (`dt-feed-val-narrative-block`,
  unused `dt-story-response-ta` rules, etc.) can be removed if no longer referenced;
  verify Story Moment still uses what it needs before deleting.

## The resolved card — required fields and order

Per action, read-only, in this order (British English; no em-dashes in player-facing text):

1. **Name (Action type)** — action title + type in parentheses. Feeding: declaration
   label (e.g. "The Kiss (Feeding)"); Project: `project_N_title` + action-type label;
   Merit: merit/action name + category label. Dev to confirm the exact title field per
   section type against existing render code (`ACTION_TYPE_LABELS`, `responses[...]`).
2. **Description** — what the player originally submitted (the player's pool /
   description text for that action).
3. **Outcome** — `rev.outcome` (the player-facing narrative).
4. **Dice pool** — validated pool with Rote / 8/9-again modifiers + roll result
   (successes / exceptional / Vitae for feeding). *Muted.*
5. **Feedback** — `rev.player_facing_note`. *Muted.*

Empty-state: if an action has no resolved outcome yet, show a clear muted "Not yet
resolved" line — never an editable box.

## Acceptance Criteria

1. In the Story tab, every section **except Story Moment** no longer renders a Copy
   Context button, a "Write the … narrative…" textarea, or Save Draft / Needs
   Revision / Mark Complete actions.
2. Each such section instead shows, read-only per action: Name (Action type),
   Description, Outcome, Dice pool, Feedback — with **Dice pool and Feedback visually
   muted**. Sourced from resolved processing data (`rev.outcome`,
   `rev.player_facing_note`, pool/roll); no re-entry.
3. **Story Moment is unchanged** — Copy Context, draft textarea, and Mark Complete
   still work, and it still publishes via `st_narrative.story_moment`.
4. **Push still works and is correctly sourced**: `compilePushOutcome` produces the
   player-facing report from `rev.outcome` (+ `rev.player_facing_note`) for the
   refactored sections and from `st_narrative.story_moment` for Story Moment. A pushed
   submission's delivered player report contains the processing Outcomes, not blank /
   `_GAP_TEXT` sections. Both callers (`handlePushCharacter` and the `story-tab.js`
   inline-edit path) verified.
5. Completion-gating reflects the new source: the nav-rail pills, section completion
   dots, and the sign-off "X/Y sections complete" counter mark a refactored section
   done when its outcome is resolved (not when a draft was marked complete). Story
   Moment completion still gates on its draft status.
6. Actions with no resolved outcome show a muted "Not yet resolved" state, not an
   editable drafting box.
7. **CSS:** the resolved card reuses the existing `dt-feed-val-dl` / `dt-feed-val-row`
   component pattern and `theme.css` tokens; muting uses a token-backed class. No
   inline `style=`, no bare hex, no `rgba()` in markup or JS-rendered HTML.
8. No regression: Story Moment authoring, Copy Context for Story Moment, the
   processing-tab Outcome/Feedback authoring, and the published player report all
   continue to function.

## Tasks / Subtasks

- [x] **T1 — Read pass (AC: all).** Done. Found: only 6 sections live; `merit_summary`
  already read-only; Home Report has no processing outcome (superseded by Territory
  Pulse) and was never published; per-action outcome is `rev.outcome` (not
  `st_review.outcome_text`). Scope narrowed per user direction (see Scope section).
- [x] **T2 — Resolved card renderer (AC 1,2,6,7).** Added `renderResolvedActionCard()`
  (`downtime-story.js:1489`) on the `dt-feed-val-row` pattern; muted modifier class
  `.dt-story-muted-row` + card classes added to `admin-layout.css` using `var(--txt3)`.
- [x] **T3 — Swap section bodies (AC 1,2).** `renderFeedingValidation` and
  `renderProjectCard` now emit the resolved card; Home Report removed from
  `getApplicableSections` + dispatch. Story Moment / Rumours / merit_summary untouched.
- [x] **T4 — Publish pipeline (AC 4).** `compilePushOutcome` feeding + project branches
  now source `rev.outcome` (+ `rev.player_facing_note`); skipped projects omitted;
  Territory Pulse + joint + Story Moment branches unchanged.
- [x] **T5 — Completion-gating (AC 5).** `projectResponsesComplete` and the feeding
  case of `isSectionDone` now derive from `rev.outcome`; dropped the
  `if (!stNarrative) return false` early-out so resolved-data cases work without a
  draft object. `getNavPillState` / `renderSignOffPanel` consume these unchanged.
- [x] **T6 — Handler cleanup (AC 1,8).** Removed `handleFeedingNarrativeSave`,
  `handleHomeReportSave`, their `SECTION_SAVE_HANDLERS` entries, and the dead
  `.dt-feed-narrative-ta` blur selector. (Residual dead code intentionally left — see
  Completion Notes.)
- [x] **T7 — Tests (AC 4,5,8).** Added `server/tests/issue-886-dt-story-resolved-push.test.js`
  (6 tests); updated `server/tests/fix.398...` for the removed feeding/project drafting
  UI. 36/36 pass (incl. existing joint suite, no regression).

## Testing

- No browser test framework for UI; verify in-browser on dev after merge (Angelus
  cannot test locally — smoke requires code on dev; see project memory).
- Targeted Playwright/spec coverage **only for the changed area** — do not run the
  full suite. Existing relevant specs to consult/extend (grep `tests/` for
  `dt-story`): `tests/fix-466-dt-report-rendering-bugs.spec.js`,
  `tests/feature-368-371-dt-story-prompt-improvements.spec.js`,
  `tests/issue-352-dt-story-prompt-assembly.spec.js`, and the `compilePushOutcome`
  publish-path tests. Add/adjust a spec asserting Push output is sourced from
  `rev.outcome` and that Story Moment still publishes from `st_narrative.story_moment`.
- When running test files: capture to a file and check the exit code; do **not**
  `| tail` (pipeline exit code masks failures). Single Playwright server only.

## Critical standards (from specs/project-context.md — non-negotiable)

- **Normalised CSS:** tokens from `public/css/theme.css`; reuse component classes
  (`dt-feed-val-dl`/`dt-feed-val-row` here). No inline `style=`, no bare hex/`rgba()`.
  Muted text via a token-backed class, never an inline colour.
- **British English**, no em-dashes in player-facing output.
- **Derived stats never stored** — N/A here, but do not introduce new persisted
  derived fields; the card reads existing resolved data only.

## References

- `public/js/admin/downtime-story.js:1477-1575` — `renderFeedingValidation` (drafting block `1543-1571`)
- `public/js/admin/downtime-story.js:1579-1705` — `renderProjectSection` / `renderProjectCard`
- `public/js/admin/downtime-story.js:1863+` — `renderStoryMoment` (DO NOT CHANGE)
- `public/js/admin/downtime-story.js:3582-3711` — `compilePushOutcome` (publish source)
- `public/js/admin/downtime-story.js:3817-3851` — `handlePushCharacter` (publishes `st_review.outcome_text`)
- `public/js/admin/downtime-story.js:510-558` — `projectResponsesComplete` / `isSectionDone`
- `public/js/admin/downtime-story.js:1443-1460` — `renderSection` dispatcher
- `public/js/admin/downtime-views.js:9249-9250, 9440-9453` — per-action `rev.outcome` + `rev.player_facing_note` authoring
- `public/css/admin-layout.css:7399-7402` — `dt-feed-val-dl` / `dt-feed-val-row` tokens
- `specs/project-context.md`, `specs/architecture/coding-standards.md` — CSS Standards

## Open detail for dev to confirm (non-blocking)

- Exact "Name" title field per section type (feeding declaration vs `project_N_title`
  vs merit/action name) — confirm against existing render code; the chat direction is
  "action title + type in parentheses".

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD dev-story)

### File List

- `public/js/admin/downtime-story.js` — MODIFIED: `renderResolvedActionCard()` (new);
  `renderFeedingValidation` + `renderProjectCard` rewritten to the read-only card;
  Home Report removed from `getApplicableSections`, `renderSection` dispatch, the Copy
  Context route, and `SECTION_SAVE_HANDLERS`; `compilePushOutcome` feeding + project
  branches repointed to `rev.outcome`; `projectResponsesComplete` + `isSectionDone`
  (feeding) repointed to resolved status; deleted `handleFeedingNarrativeSave` and
  `handleHomeReportSave`; removed dead `.dt-feed-narrative-ta` blur selector.
- `public/css/admin-layout.css` — MODIFIED: added `.dt-story-resolved-card`,
  `.dt-story-resolved-title`, `.dt-story-muted-row`, `.dt-story-resolved-empty`
  (token-backed; muting via `var(--txt3)`).
- `server/tests/issue-886-dt-story-resolved-push.test.js` — NEW: 6 unit tests for the
  feeding/project publish source.
- `server/tests/fix.398.revision-note-prompt-injection.test.js` — MODIFIED: updated the
  two assertions invalidated by the removed feeding/project drafting UI (7→5
  placeholders; feeding/project revision textareas asserted absent).

### Completion Notes

- **Scope narrowed from the issue** after code analysis + two user clarifications:
  refactor Feeding + Project Reports; **remove** Home Report (redundant — Territory
  Pulse replaced it, and it was never published anyway); keep Story Moment, Rumours,
  and the already-read-only Allies & Asset Summary. See Scope table.
- **Issue fact corrected:** per-action outcome is `rev.outcome` / `rev.player_facing_note`,
  not `st_review.outcome_text` (that is the assembled whole-submission published markdown).
- **Publish pipeline change is the load-bearing part:** Push now compiles Feeding +
  Project bodies from `rev.outcome`. Both callers exercised by tests
  (`handlePushCharacter` and the `story-tab.js` inline-edit path share
  `compilePushOutcome`); the existing joint-project test suite still passes, confirming
  no-outcome solo slots still emit gap-text.
- **Verification:** `node --check` clean; 36/36 server unit tests pass. UI changes
  (card rendering, muted rows, pills/sign-off) have **no local browser test harness** —
  must be smoke-checked on dev after merge (Angelus cannot test locally).
- **Residual dead code left intentionally (minimal-risk):** `renderHomeReport`,
  `buildHomeReportContext`, `handleCopyHomeReportContext`, and `handleCopyFeedingContext`
  remain defined but are now unreachable (no dispatch / no button). Two `fix.398`
  field-access *simulations* still reference those data paths (they don't call the
  functions). Optional follow-up: delete these + the orphaned
  `.dt-feed-val-narrative-block` / prompt CSS once confirmed unused elsewhere.

### Change Log

- 2026-06-18 — Implemented #886: Feeding + Project Reports show a read-only resolved
  card sourced from DT Processing (`rev.outcome` / `rev.player_facing_note`); Push
  repointed to the same source; Home Report removed (superseded by Territory Pulse);
  completion-gating moved from draft-status to resolved-outcome. Tests added/updated;
  36/36 pass. Status → review.
- 2026-06-18 (QA, Quinn) — Reviewed diff for correctness/regression/AC + CSS. Verified
  data assumptions (`feeding_review.outcome`, `projects_resolved[].outcome` via
  `saveEntryReview` source-branching, `downtime-views.js:3709/3718`;
  `project_N_description` = the form's "Approach" field). Found + fixed one E2E
  regression the dev pass missed (`fix-814` AC4). Cleared `fix-470`/`fix-464`/`issue-430`
  as safe. 64/64 server unit tests pass.

## QA Results (Quinn)

**Verdict: PASS** (implementation correct + AC-complete; one E2E regression found and
fixed). One caveat: Playwright specs can't be run locally — see below.

**Verified**
- All 8 ACs met against the diff.
- Riskiest data assumptions hold: the feeding/project Outcome box (`proc-outcome-input`)
  persists to `feeding_review.outcome` / `projects_resolved[i].outcome` (generic
  `saveEntryReview`, `downtime-views.js:3696-3724`); `project_N_description` is a real
  submission field (the DT form's "Approach", `downtime-form.js:662`).
- CSS additions are token-only (`var(--txt3)`); no inline `style=`, hex, or `rgba()`.
- Removing the `if (!stNarrative) return false` guard in `isSectionDone` is safe — every
  remaining branch uses optional chaining or sub-derived helpers.
- Server unit tests: 64/64 pass (new #886 suite + updated `fix.398` + joint +
  build-merit-actions, no regression).

**Regression found and fixed**
- `tests/fix-814-dt-territory-resolveterrid.spec.js` AC4 (2 tests) asserted the admin
  `home_report` section renders — #886 removed it. Updated AC4 to assert the section is
  now absent (locks in the removal). The dev pass updated the server `fix.398` test but
  missed this E2E spec.

**Cleared as safe (no change needed)**
- `fix-470` (feeding/pulse headings) and `fix-464` (home-report dedup) — both player-side,
  inject `published_outcome` as a fixture and exercise the unchanged `story-tab.js`
  renderer, not `compilePushOutcome`.
- `issue-430` (async race save) — targets the `story_moment` save-draft button, unchanged.

**Caveats / must-do before/at merge**
- **Playwright specs cannot run locally** (no server; Angelus cannot test locally; each
  ~7-8 min). The `fix-814` edit is static — confirm green on dev/CI. A full DT-story
  Playwright pass on dev is the real gate.
- **In-browser smoke on dev** still required for the card rendering, muted rows,
  nav-rail pills, and sign-off counter, and for the pushed player report.
- **Cutover behaviour note (not a bug):** any cycle currently mid-processing with old
  `feeding_narrative` / `project_responses` drafts but no `rev.outcome` will now publish
  gap-text / omit those sections. STs author outcomes in Processing now, so this is the
  intended new flow — worth a heads-up at deploy.
