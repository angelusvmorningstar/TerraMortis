---
issue: 930
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/930
branch: morningstar-issue-930-ordeal-view-display
story: 930
predecessors: [924, 928]
status: review
---

# Story 930: Player ordeal view — approved=all-yes; per-question answer/verdict/feedback

Status: review

## Story

As a player whose ordeal has been graded,
I want my ordeals page to only say "Approved" when every answer passed, and to show me — per question — my
submitted answer, the Yes/Near/No verdict, and the feedback where I fell short,
so that I can actually read and act on my grading in-app instead of seeing a misleading "Approved" or a
bare answer dump.

## Background

Smoke-testing #928 surfaced three display-correctness problems in the player ordeal view (the grading write
and #928's card data-feeding are correct; these are the *display*). Completes the player-feedback arc begun
by #924 (renderFeedback, which deliberately dropped per-question pairing) and #928 (card data-feeding).
Verified against live `tm_suite` Lord Wan Yelong (q-keyed `ordeal_responses`, rules = 55 graded answers).

## What's wrong now

1. **"Approved" ignores the verdicts.** The list card (`getOrdealStatus`, `ordeals-view.js:338-362`) returns
   `approved` when `responseStatus === 'approved'` OR `charApproved` (the character's `ordeals[].complete`),
   regardless of the verdicts; the form badge (`ordeal-form.js:122` `isApproved = status === 'approved'`,
   rendered `:132-133,146-147`) does the same. So an ordeal whose `marking.answers` contain `near`/`no` still
   shows "Approved + 3 XP locked". (Seen on an approved ST stock character whose marking has nears.)
2. **The opened ordeal shows no verdicts/feedback.** `renderOrdealForm` read-only mode
   (`ordeal-form.js:162-168`) shows only the question label + the stored answer (`saved[q.key]`). No verdict,
   no per-answer feedback. The only verdict/feedback renderer (`renderFeedback`, `ordeals-view.js:387-428`,
   from #924/#928) is unpaired (notes only) and lives on the list card, not in the opened ordeal.
3. **"stock answers" leaks.** "Completed with stock answers (ST character)" is `overall_feedback` DATA on
   that ordeal's marking, rendered verbatim by `renderFeedback`. "stock" appears NOWHERE in the codebase.

## The data contract (verified — the dev can rely on this)

- `GET /api/ordeal-responses?type=rules|lore|covenant` returns the player's full response doc INCLUDING
  `marking` (`server/routes/ordeal-responses.js`). `renderOrdealForm` already fetches this as `responseDoc`
  (`ordeal-form.js:108`), so `responseDoc.marking.answers` is available client-side — no new endpoint needed.
- `marking.answers[]` shape: `{ question_index, result: 'yes'|'near'|'no', feedback }`. (`yes` carries empty
  feedback by convention; the player view shows feedback for `near`/`no`.)
- **Pairing (THE key correctness point):** on live Wan Yelong data, `marking.answers[].question_index` is the
  **0-based position in canonical question order** — Q1→0, Q2→1, Q3→2 (verified: index 2 = the Willpower
  question = `RULES_SECTIONS` q3). The player question defs (`RULES_SECTIONS`/`LORE_SECTIONS`/
  `COVENANT_SECTIONS` in `*-data.js`) are in that SAME canonical order, with `q.key` = `q1..qN` and
  `q.label` = "N. ...". So pair by a **running 0-based index** as the form iterates its sections:
  the i-th rendered question pairs with `marking.answers.find(a => a.question_index === i)`. The leading
  number in `q.label` (N) is a cross-check (should equal i+1). This is **frontend-only and player-safe** —
  it needs NO rubric fetch, so the ST-only answer key never reaches the client (the reason #924 dropped
  pairing is avoided entirely: we pair to the player's OWN questions, not the rubric).
- **Residual drift risk + fallback:** if a rubric question was retired (`scored:false`) such that
  `question_index` no longer equals the form's running position for later questions, the running-index
  pairing would misalign. The dev MUST verify on Wan's real 55-answer rules data that every paired verdict
  lands on the right question. If drift is found, the player-safe fallback is a stripped rubric projection
  endpoint (`{ question_index, question_text }` ONLY, no `expected_answer`/`marking_notes`) per #924's
  Deferred note — but do NOT build it unless the simple pairing demonstrably drifts (avoid the server add).

## Acceptance criteria

1. **Approved = all yes (card).** Given an ordeal whose `marking.answers` contains any `near`/`no`, When the
   player views the card, Then it does NOT show "Approved"/"+3 XP" — it shows a feedback-round state — even
   if `responseStatus === 'approved'` or `charApproved` is set. An all-`yes` (or marking-less legacy
   approved) ordeal still shows "Approved (+3 XP)" as today. (`getOrdealStatus`.)
2. **Approved = all yes (form badge).** Same rule in `renderOrdealForm`: the "Approved … locked. +3 XP"
   badge/intro only when all verdicts are `yes` (or no marking); any `near`/`no` shows a feedback-round
   header instead.
3. **Per-question integrated read-only view.** When the player opens a graded ordeal, each question shows:
   the question label, the player's submitted answer, the Yes/Near/No verdict, and (for `near`/`no`) the
   feedback note. Plus `overall_feedback` once at the top. Paired correctly by the running-index rule above,
   verified on Wan Yelong's real rules data (all 55 land on the right question).
4. **Player-safe.** The view never renders the rubric `expected_answer` or `marking_notes`. (No rubric
   fetch; pair to the player's own questions.)
5. **No "stock answers".** `overall_feedback` still renders, but the "Completed with stock answers (ST
   character)" note is reworded as a data op (see Scope notes); no "stock" string is produced by code.
6. **No regression.** A still-editable ordeal (draft/new) still renders the editable form unchanged; a
   submitted-but-ungraded ordeal still shows "Submitted"; #928's card behaviour for an in-progress feedback
   round is preserved.
7. **CSS.** Reuse design-system classes: `.qf-field`/`.qf-label`/`.qf-readonly-value` for the question+answer,
   `.ordeal-fb-item`/`.ordeal-fb-result`/`.or-result-yes|near|no` for the verdict+feedback (in `suite.css`),
   `theme.css` tokens. No inline `style=`, no bare hex/`rgba()`.

## Tasks / Subtasks

- [x] **Shared "is this a clean pass?" check** (AC1, AC2) — implemented inline (identical logic) in both
  files: `markFlagged` / `flagged` = `marking.answers.some(a => a.result==='near'||a.result==='no')`. Any
  near/no => NOT a pass; no marking => legacy pass preserved. (Kept inline in each module to avoid a new
  cross-module import; the logic is one expression.)
- [x] **Card approved logic** (AC1) — `getOrdealStatus`: the approved branch is now gated `!markFlagged &&
  (subStatus==='complete' || responseStatus==='approved' || charApproved)`; a `markFlagged` marking returns
  the `in_review` feedback-round state with the submission attached, ahead of the bare `submitted`. All-yes /
  marking-less legacy approved still returns `approved`.
- [x] **Form badge + per-question view** (AC2, AC3, AC4) — `renderForm` read-only: derives `graded`/`flagged`
  from `responseDoc.marking`; badge shows "Needs revision" (graded+flagged) instead of "Approved/+3 XP
  locked"; `overall_feedback` rendered once at the top; each question renders `q.label` + the player's answer
  + the paired Yes/Near/No chip (`.ordeal-fb-item.or-result-*` + `.ordeal-fb-result`) + (near/no)
  `.ordeal-fb-text` feedback. NO rubric field referenced (player-safe).
- [x] **Verify pairing** (AC3) — pairs by the leading number in `q.label` (N) -> `question_index = N-1`,
  falling back to a running 0-based position when a label has no number (bonus questions, ungraded anyway).
  Confirmed against the captured live Wan Yelong data (rules `question_index` 0,1,2 = Q1,Q2,Q3; index 2 =
  the Willpower question = q3). The live 55-answer ST smoke is the final confirmation (below).
- [x] **"stock answers" data note** (AC5) — confirmed "stock" is code-free (grep clean across all `.js`); the
  "Completed with stock answers (ST character)" string is `overall_feedback` DATA on the ST stock character,
  to be reworded as a data op. No app-code change.
- [x] **Parse + no-regression + CSS check** (AC6, AC7) — `node --check` PASS on both files; draft/submitted/
  editable rendering unchanged (the per-question/verdict logic is gated on `graded` = read-only + has
  marking); #928's in-progress card path intact (markFlagged/in_progress both return `in_review`); reused
  `.qf-*` + `.ordeal-fb-*`/`.or-result-*` (all in `suite.css`); no inline `style=`, no bare hex.
- [ ] **ST dev smoke** (Angelus — cannot test locally) — on `terramortis-dev.netlify.app`: an ordeal with
  nears shows a feedback-round state (not Approved) on card + form; opening it shows question + my answer +
  verdict + feedback per question (all 55 of Wan's land correctly); an all-yes ordeal still shows Approved +
  XP; no rubric text; no console errors.

## Dev Notes

### Files + current state (READ before editing)

- `public/js/tabs/ordeal-form.js` — `renderOrdealForm` (`:101`) fetches `responseDoc` from
  `/api/ordeal-responses?type=`; `renderForm` (`:118`) builds the read-only view from
  `responseDoc.responses` (`saved[q.key]`) and `responseDoc.status`. The read-only loop is `:162-168`. The
  badge/intro is `:132-150`. **This is where #3 + AC2 live.** `responseDoc.marking` is ALREADY fetched
  (same doc) — use it; do not add an endpoint.
- `public/js/tabs/ordeals-view.js` — `getOrdealStatus` (`:338-362`, post-#928), `renderFeedback`
  (`:387-428`, #924/#928 — the card's unpaired notes; leave as is or reuse its chip markup). The card "View
  ->" opens `renderOrdealForm` via `openForm` (`:432`+), so the per-question view in `renderOrdealForm`
  is what the card links into (the issue's open question — resolved: enhance the form, no new nav).
- Question defs: `public/js/tabs/{rules,lore,covenant}-data.js` — `{ key:'qN', label:'N. ...', type, ... }`
  in canonical order.
- Pairing reference (do NOT import; mirror the intent): cockpit `lib/align-ordeal.mjs` /
  `server/scripts/ordeal-grade-worksheet.js` (number-based, drift-aware). Here the simpler running-index
  pairing suffices because we pair to the player's own ordered questions, not the rubric — verify it.

### Why this is player-safe (and why #924 dropped pairing but we can do it)

#924 dropped per-question pairing because its approach pulled the question text from the ST-only rubric. We
do NOT: the player form already HAS every question label (`q.label`) and the player's own answer
(`saved[q.key]`); the marking gives only `{question_index, result, feedback}`. Pairing the marking to the
player's own questions by position needs no rubric and exposes no answer key.

### Out of scope

- The cockpit apply-to-live write (correct) and the ST admin marking UI (`ordeals-admin.js`).
- A player "resubmit" flow.
- The stripped-rubric-projection endpoint — only if the running-index pairing demonstrably drifts (it does
  not on current data). Named fallback, not built here.
- The "stock answers" data reword is a DATA op (Peter/cockpit), not this PR's code.

### Dev guardrails

- **British English**; no em-dashes in user-facing copy.
- **Normalised CSS** — reuse `.qf-*` and `.ordeal-fb-*`/`.or-result-*`; `theme.css` tokens; no inline
  `style=`, no bare hex. See `specs/project-context.md`, `specs/architecture/coding-standards.md`.
- **Frontend only** (target: no server change — the marking is already in `responseDoc`).
- **Smoke on dev**, not locally — Angelus cannot test locally.
- **No regression** to draft/submitted rendering or #928's in-progress card.

## References

- `public/js/tabs/ordeal-form.js`: `renderOrdealForm` (:101), `renderForm` read-only (:118-191, loop
  :162-168, badge :122/:132-150).
- `public/js/tabs/ordeals-view.js`: `getOrdealStatus` (:338-362), `renderFeedback` (:387-428), `openForm`
  (:432+).
- Question defs: `public/js/tabs/rules-data.js` (`RULES_SECTIONS`, `q.key`/`q.label`), `lore-data.js`,
  `covenant-data.js`.
- Data contract: `server/routes/ordeal-responses.js` (GET returns full doc incl marking).
- Pairing intent: cockpit `lib/align-ordeal.mjs`, `server/scripts/ordeal-grade-worksheet.js`.
- Predecessors: #924 (`fix.924.ordeal-feedback-in-app`), #928 (`fix.928.ordeal-feedback-render`, on dev).
- Styles: `.qf-*`; `.ordeal-fb-*` / `.or-result-*` in `public/css/suite.css:2478-2481`.
- Live evidence: Wan Yelong `ordeal_responses` rules (55 answers, `question_index` 0-based = question
  position).

## Dev Agent Record

### Implementation notes
- Frontend-only, two files; no route/schema/server change; the marking rides on the existing
  `/api/ordeal-responses` GET, so no new endpoint (the stripped-rubric-projection fallback was NOT needed).
- **Approved = all-yes** is derived from the verdicts in `marking.answers` (a `near`/`no` => feedback round),
  in both `getOrdealStatus` (card) and `renderForm` (form badge/intro), overriding a stale `status:approved`
  / `complete` / `charApproved` flag. A marking-less legacy approved still reads as approved.
- **Per-question view** lives in `renderOrdealForm` read-only mode (what the card "View ->" opens): per
  question, the label + the player's answer + the Yes/Near/No chip + (near/no) the feedback note, plus
  `overall_feedback` once at the top. PLAYER-SAFE: only the player's own answer + verdict + note; no rubric
  is fetched or rendered (responseDoc carries none).
- **Pairing**: by the leading number in `q.label` -> `question_index = N-1` (verified on real data:
  Q1->0, Q3->2), with a running 0-based position as the fallback for unnumbered (bonus) questions. The
  running counter increments for every question so the fallback stays aligned even when a question is skipped
  from render.
- Reused #924/#928's `.ordeal-fb-item`/`.ordeal-fb-result`/`.ordeal-fb-text`/`.ordeal-fb-overall` +
  `.or-result-yes|near|no` (all in `suite.css`) and the form's `.qf-field`/`.qf-label`/`.qf-readonly-value`.
  No new CSS, no inline `style=`, no bare hex.

### Testing
- Repo convention: manual in-browser verification (CLAUDE.md "No test framework"); the vitest suite is
  server-side and does not cover these DOM-string renderers (matches #924/#928).
- `node --check` PASS on `ordeals-view.js` + `ordeal-form.js`.
- Greps: no `expected_answer`/`marking_notes`/rubric referenced in `ordeal-form.js` (player-safe); no inline
  `style=`/bare hex added; reused classes confirmed present in `suite.css`.
- **Outstanding (the open task):** the live ST dev smoke (all 55 of Wan's verdicts land on the right
  question; approved=all-yes on card + form; no regression) on `terramortis-dev.netlify.app` — Angelus
  cannot test locally.

### File List
- `public/js/tabs/ordeals-view.js` (modified) — `getOrdealStatus` approved=all-yes from verdicts
- `public/js/tabs/ordeal-form.js` (modified) — `renderForm` read-only: badge/intro + per-question
  verdict/feedback view
- `specs/stories/fix.930.ordeal-view-display.story.md` (new — this story)
- `specs/stories/sprint-status.yaml` (modified — issue-930 entry)

### Change Log
- 2026-06-25: Story created (bmad-create-story via tm-gh-issue-pickup #930). Approved=all-yes (card+form) +
  per-question integrated read-only view (player-safe, paired by running index) + "stock answers" data note.
  Status backlog -> ready-for-dev.
- 2026-06-25: Implemented (bmad-dev-story, Opus). getOrdealStatus + renderForm derive approved from the
  verdicts; renderForm read-only gains the per-question answer+verdict+feedback view (paired by label number,
  player-safe). `node --check` PASS; player-safe + CSS greps clean. Frontend-only. Status -> review. ST dev
  smoke is the open gate.
- 2026-06-25: QA (Quinn) — APPROVE, 1 patch applied (dropped the running-position fallback in the pairing,
  a latent mis-pair; number-only now). `node --check` re-PASS.

## QA Review (Quinn) — 2026-06-25

**Verdict: APPROVE** (1 patch applied; no unresolved issues). Verified independently against the live code
(`ordeals-view.js`, `ordeal-form.js`), not just the dev notes.

**Patch applied (1):**
- **[Med] Running-position pairing fallback could mis-pair.** The loop fell back to `markIndex = pos` (a
  running 0-based counter) when a question label had no leading number. Since EVERY graded question is
  numbered ("N. …"), the fallback was unnecessary, and an interleaved unnumbered (bonus) question whose
  `pos` collided with a real graded answer's `question_index` would have shown that other answer's verdict.
  FIXED: pair only by the question's own number (`question_index = n - 1`); an unnumbered label gets no
  verdict (bonus questions are ungraded). Removed the now-unused `qPos`/`pos` counter. `node --check` re-PASS.

**Verified:**
- **Approved = all-yes (AC1, AC2).** `getOrdealStatus` gates the approved branch on `!markFlagged && (…)`,
  and a flagged marking returns `in_review` + submission ahead of the bare `submitted`. The form badge shows
  "Needs revision" when `graded && flagged`, else "Approved". A **marking-less legacy approved** ordeal still
  reads Approved (`graded` is false when `markAnswers` is empty, so the flagged branch is skipped). Correct.
- **No regression (AC6).** The per-question verdict logic is gated on `graded = readOnly && markAnswers.length`,
  so the editing path (`renderQuestion`) and a submitted-but-ungraded read-only view are byte-for-byte
  unchanged. #928's in-progress card path is intact: both `markFlagged` and `subStatus === 'in_progress'`
  return `in_review` + submission.
- **Player-safe (AC4).** `responseDoc` carries no rubric and none is fetched; the view renders only
  `q.label` (the player's own question), `saved[q.key]` (their answer), and the marking's `result`/`feedback`.
  No `expected_answer`/`marking_notes` referenced (grep clean).
- **CSS (AC7).** Reused `.qf-field`/`.qf-label`/`.qf-readonly-value` (form) + `.ordeal-fb-item`/
  `.ordeal-fb-result`/`.ordeal-fb-text`/`.ordeal-fb-overall` + `.or-result-yes|near|no` (all in `suite.css`).
  The descendant selector `.or-result-near .ordeal-fb-result` triggers (the chip span is a descendant of the
  `.ordeal-fb-item.or-result-near` div). No inline `style=`, no bare hex.
- **Edge cases (AC3).** Yes → chip "Yes", no feedback text (gated `result !== 'yes'`). Unanswered-but-graded
  → not skipped (`!val && !mark` is false when `mark` exists) → renders "(no answer)" + the chip. Unnumbered
  bonus → no number → no verdict lookup (post-patch).

**Findings (non-blocking):**
- *Nit (cosmetic):* `.ordeal-fb-overall` is rendered as a direct child of the form container, not inside an
  `.ordeal-feedback` wrapper as on the card. If its styling assumes that ancestor it may sit slightly off —
  eyeball on the dev smoke; trivial to wrap if needed.
- *Info:* no automated test (no frontend harness; manual smoke per CLAUDE.md, as #924/#928). The meaningful
  check is the ST dev smoke — confirm all 55 of Wan's verdicts land on the right question.

Frontend-only; no route/schema/grading-write change; British English.
