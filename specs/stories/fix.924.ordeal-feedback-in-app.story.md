---
issue: 924
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/924
branch: morningstar-issue-924-ordeal-feedback-in-app
story: 924
status: review
---

# Story 924: Show in-progress ordeal feedback in-app

Status: review

## Story

As a player with a graded-but-incomplete ordeal,
I want to see the feedback notes the ST wrote and whether each flagged answer was Near or No,
so that I can act on a feedback round in-app instead of waiting for it over Discord.

## Background

The Rules ordeal grading pilot surfaced that the player-facing feedback renderer cannot deliver a *feedback round* — a submission graded but deliberately left open (`marking.status = 'in_progress'`) because the player has `near`/`no` answers to fix. The ST grading/marking write works (notes land in `marking.answers`), but the player sees nothing in-app. Surfaced while grading **Wan Yelong** and **Charles Mercer-Willows**. A standing code comment already flags the limitation: `server/scripts/ordeal-record-feedback.js:7`.

## Scope decision (agreed with ST — the simple version)

The player should get back, for each flagged answer, **the ST's feedback note and the result (Near / No)**, plus the **overall note**. That is the whole requirement. The ST's notes are self-contained (they say what they are about), so we **do not** pair each note to its question text.

This deliberately **drops** the issue's "pair by rubric index" idea: that only bought a question heading per note, and it dragged in the ST-only rubric (which holds the answer key — not player-safe). Removing it makes this a small **frontend-only** change with no rubric access and no server work. (Per-question headings can be revisited later if the ST ever wants them — see Deferred.)

## Live-path verification (done — dev can rely on this)

The pickup flagged the "is this a dead `tabs/*` file?" risk. **Confirmed live:** `public/js/tabs/ordeals-view.js` is the only copy (no `public/js/player/ordeals-view.js` — older references to that path are stale), and it is imported by the unified app at `public/js/app.js:75` and by `public/js/player.js:15` (`import { initOrdeals } from './tabs/ordeals-view.js'`). Edits here render in the live app.

## What's wrong now (`public/js/tabs/ordeals-view.js`, `renderFeedback` `:387-420`)

1. **Status gate (`:388`)** — `if (!sub?.marking || sub.marking.status !== 'complete') return '';`. Anything graded `in_progress` renders nothing. **Fix:** admit `in_progress` as well as `complete`.
2. **Stale result vocabulary (`:397`)** — `const RESULT_LABEL = { yes: 'Yes', close: 'Close', no: 'No' };` still uses the old `close` key. The vocab was renamed `close → near`, and the CSS already moved (`.or-result-near` exists in `player-layout.css:737,759` and `suite.css:2478,2481`; there is no `.or-result-close`). So a `near` result currently renders **no label**. **Fix:** `RESULT_LABEL = { yes: 'Yes', near: 'Near', no: 'No' }`.
3. **Fragile question pairing (`:408`)** — `responses[a.question_index]?.question` mis-indexes (it assumes a dense array; real data is q-keyed or sparse), so it shows the wrong/generic question. **Fix:** with the simple version we **remove the question line entirely** rather than repair it — each item shows just the result chip and the note text.

## Desired rendering (both `in_progress` and `complete`, identical format)

```
Your <Ordeal> — needs revision
<overall_feedback>
• [Near]  <feedback note>
• [No]    <feedback note>
```

- Iterate `marking.answers`, keep entries with a non-empty `feedback`.
- Each item: the result chip ([Near]/[No]/[Yes]) + the feedback text. No question heading.
- Show `overall_feedback` above the list when present.
- A small "needs revision" heading on the block when `marking.status === 'in_progress'` (so the player knows it's a feedback round, not a final pass). Reuse existing type/spacing tokens — no new state machine on the ordeal card.

## Acceptance criteria

1. A submission with `marking.status = 'in_progress'` and feedback in `marking.answers` shows the per-answer notes **and** `overall_feedback` to the owning player. (Status gate admits `in_progress`.)
2. A `complete` ordeal still shows its feedback — now in this same simplified format (note + result + overall). Feedback that rendered before still renders; this is not a regression of *visibility*. (The previously-shown, frequently-wrong question heading is intentionally removed for both states.)
3. A `near` result renders its label ("Near"); `yes`/`no` unchanged. (`RESULT_LABEL` `close → near`.)
4. No rubric access, no server change — frontend only. No answer-key/marking-note ever reaches the player.
5. Styling reuses existing classes only — `.ordeal-feedback`, `.ordeal-fb-overall`, `.ordeal-fb-answers`, `.ordeal-fb-item`, `.ordeal-fb-q` (now holding just the result chip), `.ordeal-fb-text`, `.ordeal-fb-result`, `.or-result-yes|near|no`. **No inline `style=`, no bare hex** (tokens from `public/css/theme.css`).

## Tasks / Subtasks

- [x] **Open the status gate** (AC 1, 2) — `renderFeedback` (`:390`) returns feedback for `marking.status` of both `complete` and `in_progress`; otherwise still returns empty.
- [x] **Fix the result vocabulary** (AC 3) — `RESULT_LABEL` → `{ yes:'Yes', near:'Near', no:'No' }` (`:399`).
- [x] **Remove the question pairing** (AC 2, 4) — deleted the `responses[a.question_index]?.question` lookup and the now-unused `responses` local; each `.ordeal-fb-item` shows the result chip (in `.ordeal-fb-q`) + `.ordeal-fb-text` note only (`:414-422`).
- [x] **Add the "needs revision" cue** for `in_progress` blocks (AC 1) — reuses `.or-result-near` + `.ordeal-fb-result` (no new CSS) (`:404-406`).
- [ ] **Verify live on dev** (ST smoke — Angelus, can't be done locally) — a Wan Yelong-style in-progress submission shows its notes + results + overall; a completed ordeal still shows its feedback; no console errors.

## Dev Agent Record

### Implementation notes
- Single-file frontend change in `public/js/tabs/ordeals-view.js`, function `renderFeedback`. No route/schema/grading-write touched; no new dependency.
- Status gate now admits `complete` and `in_progress`. Added an `inProgress` flag driving a "Needs revision" cue rendered as a `.ordeal-fb-result` chip inside a `.or-result-near` wrapper, so it reuses the existing amber chip styling (`.or-result-near .ordeal-fb-result`) with no new CSS, no inline `style=`, no bare hex.
- Removed the fragile `responses[a.question_index]?.question` pairing and the now-unused `responses` local. Each feedback item renders the result chip + the ST's note only (question heading intentionally dropped per the simple-version ST decision — applies to both `complete` and `in_progress`).
- `RESULT_LABEL` corrected `close → near`, matching the live vocab and the existing `.or-result-near` CSS, so `near` results now show their "Near" label (they previously rendered no label).

### Testing
- Repo convention is manual in-browser verification (CLAUDE.md: "No test framework"); the vitest suite is server-side and does not cover this DOM-string renderer, so no automated test was added (consistent with prior frontend stories).
- `node --check public/js/tabs/ordeals-view.js` → parse OK (matches the repo's staged-JS parse hook).
- Grep confirmed no `close:` label, no `responses[a.question_index]` lookup, and no `Question N` fallback remain.
- **Outstanding:** the live dev smoke (AC 1-3 against a real in-progress submission such as Wan Yelong, plus a completed-ordeal no-regression check) must be run by the ST on `terramortis-dev.netlify.app` once this is on dev — Angelus cannot test locally.

### File List
- `public/js/tabs/ordeals-view.js` (modified) — `renderFeedback`

### Change Log
- 2026-06-24: Show ordeal feedback for `in_progress` submissions (feedback rounds), not only `complete`; drop the fragile question-index pairing and show result + note only; fix `RESULT_LABEL` `close → near`; add a "Needs revision" cue reusing existing classes. Frontend-only (issue #924).

## QA Review (Quinn) — 2026-06-24

**Verdict: APPROVE.** No changes required. Ready for the ST dev smoke, then PR.

Verified independently against the live code (not just the dev notes):
- **Data contract matches the gate.** The live admin marking UI (`ordeals-admin.js:442`) writes `marking.status` as exactly `complete` / `in_progress` / `unmarked`, and the grading scripts (`ordeal-*-record-feedback.js`) write `in_progress`. The gate `['complete','in_progress']` is correct; `unmarked` correctly renders nothing. (AC 1)
- **No regression risk beyond the documented one.** `renderFeedback` is module-internal (one caller, `ordealCard:369`, not exported), so the removed `responses` pairing had no external dependents. Completed ordeals still render feedback (AC 2). The empty-feedback early return (`:397`) is preserved, so an `in_progress` marking with no notes shows nothing (the "Needs revision" cue sits after the guard).
- **`near` label fixed** (AC 3); `.or-result-near` exists in both sheets.
- **CSS compliance** (AC 5): the cue reuses `.or-result-near` (ancestor) + `.ordeal-fb-result` (descendant) — the existing `.or-result-near .ordeal-fb-result` selector triggers, so the amber chip styling applies with no new CSS, no inline `style=`, no bare hex. All `.ordeal-fb-*` classes exist in **suite.css** (the sheet the unified app loads, `index.html:22`), so players see it fully styled. (AC 4, 5)
- Frontend-only; no route/schema/grading-write change; British English.

**Findings:**
- *Low (ST-awareness, not a defect):* completed/passed ordeals also lose the per-question heading (intentional, the simple version applies to both states). Confirm you're happy that a *passed* ordeal's feedback shows note + result without the question line.
- *Nit (cosmetic):* the "Needs revision" chip inherits `.ordeal-fb-result`'s `margin-left:6px`, so it's slightly indented. Harmless; eyeball it on the dev smoke.
- *Info:* no automated test (no frontend harness; manual smoke per CLAUDE.md). The meaningful check is the ST dev smoke, already tracked as the one open task.

## Dev guardrails

- **British English** in any user-facing copy.
- **Normalised CSS** — reuse the `.ordeal-fb-*` / `.or-result-*` classes; tokens already wired (`--green2`, `--accent`, `--crim`, `--result-*`). No new bare hex or inline styles. See `specs/project-context.md`, `specs/architecture/coding-standards.md`.
- **Frontend only** — no route, schema, or grading-write change.
- **Smoke-test on dev**, not locally — Angelus cannot test locally; verify on `terramortis-dev.netlify.app`.
- No regression to feedback **visibility** on completed ordeals.

## Out of scope

- The grading/marking write (`server/scripts/ordeal-*`).
- The ST marking UI (`public/js/admin/ordeals-admin.js`).
- Any new player "resubmit" flow.

## Deferred (not now)

- **Per-question headings** on each note. If ever wanted, the player-safe route is a stripped rubric projection (question text + index only, no answers) feeding a `question_index → text` lookup; pairing logic to mirror is `server/scripts/ordeal-grade-worksheet.js:46-79`. Out of scope for this story by ST decision.

## References

- Target: `public/js/tabs/ordeals-view.js` — `renderFeedback` `:387-420` (status gate `:388`, `RESULT_LABEL` `:397`, pairing `:408`), called from `ordealCard` `:369`.
- Styles: `public/css/player-layout.css:736-760`, `public/css/suite.css:2478-2481`.
- Standing limitation note: `server/scripts/ordeal-record-feedback.js:7`.
