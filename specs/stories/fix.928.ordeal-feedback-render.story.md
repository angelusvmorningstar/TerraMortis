---
issue: 928
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/928
branch: morningstar-issue-928-ordeal-feedback-render
story: 928
predecessor: 924
status: review
---

# Story 928: Surface in-progress ordeal feedback to players (completes #924)

Status: review

## Story

As a player with a graded-but-incomplete ordeal (a feedback round),
I want my ordeals page to show that feedback is waiting and let me open the ordeal to read the per-answer
Near/No verdicts and the ST's notes,
so that I can act on a feedback round in-app instead of waiting for it over Discord.

## Background

This **completes #924** (`fix.924.ordeal-feedback-in-app`, on this branch, status `review`). #924 fixed
the *leaf* — `renderFeedback` now displays an `in_progress` feedback round (status gate admits
`in_progress`, `RESULT_LABEL` corrected `close → near`, a "Needs revision" cue). But the player STILL sees
nothing, because `renderFeedback` is never handed the data: the bug is UPSTREAM in the loader +
`getOrdealStatus`, which for a rules/lore/covenant ordeal never surface the marking that actually lives in
`ordeal_responses`.

Confirmed against live `tm_suite` for **Lord Wan Yelong**: three `ordeal_responses` docs (rules, lore,
covenant), each `status: "submitted"`, `marking.status: "in_progress"`, `marking.answers` populated (rules
= 55 answers, 11 with feedback; verdicts already normalised to `near`). **Zero `ordeal_submissions` docs**
for this player. The lore/covenant feedback has sat unseen since 2026-06-21. (This was re-confirmed while
validating the cockpit ordeal apply-to-live write, which correctly put the marking in the DB — the write is
not the problem.)

## Live-path verification (carried from #924's QA — dev can rely on this)

`public/js/tabs/ordeals-view.js` is the ONLY live copy (no `public/js/player/ordeals-view.js`), imported by
the unified app (`public/js/app.js:75`) and `public/js/player.js:15`. Edits here render in the live app. All
`.ordeal-fb-*` / `.or-result-*` classes exist in **`suite.css`** (the sheet the unified app loads,
`index.html:22`), so players see the feedback fully styled.

## What's wrong now (`public/js/tabs/ordeals-view.js`)

1. **Loader discards the marking (`initOrdeals` ~:63-88).** It loads `rulesDoc`/`loreDoc`/`covDoc` from
   `/api/ordeal-responses?type=...` (which return the FULL response doc INCLUDING `marking`) but keeps only
   `.status` into `statusCache`. The `.marking` is thrown away. `submissionsMap` is built ONLY from
   `/api/ordeal_submissions/mine`.
2. **`getOrdealStatus` reads the wrong collection (~:324-346).** `subType = KEY_TO_SUBMISSION_TYPE[def.key]`
   (`rules → rules_mastery`, `lore → lore_mastery`, `covenant → covenant_questionnaire`), then
   `sub = submissionsMap[subType]`. For a player whose ordeal lives in `ordeal_responses` (and has NO
   `ordeal_submissions` doc), `sub` is `undefined`, so `subStatus` is `undefined` — the in_progress marking
   is invisible to the status logic.
3. **Precedence masks the feedback round (`:337` before `:340`).** `if (responseStatus === 'submitted')
   return { status: 'submitted' };` fires BEFORE the `if (subStatus === 'in_progress')` check. An
   `ordeal_responses` feedback round keeps top-level `status: 'submitted'` (it only flips to `approved` on
   complete), so even if the marking were available, the bare `submitted` return would pre-empt it.

Net: the card shows "Submitted", `getOrdealStatus` returns no `submission`, `renderFeedback(null)` returns
'' — #924's renderFeedback never runs.

## Fix design (frontend-only, reuse #924's renderFeedback)

Two small changes in `ordeals-view.js`, no server/route/schema change, no new dependency:

1. **Feed the `ordeal_responses` marking into the existing path.** In `initOrdeals`, after building
   `submissionsMap` from `ordeal_submissions/mine`, seed it for rules/lore/covenant from the response docs'
   marking when present and not already populated — e.g. for each of `{rules: rulesDoc, lore: loreDoc,
   covenant: covDoc}`, if `doc?.marking` exists and `submissionsMap[KEY_TO_SUBMISSION_TYPE[key]]` is empty,
   set it to a minimal submission-shaped object `{ marking: doc.marking }` (only `marking` is needed by
   `getOrdealStatus`/`renderFeedback`). This makes the EXISTING `sub = submissionsMap[subType]` logic find
   the marking with no other change to its body. Prefer a real `ordeal_submissions` entry if one exists
   (do not overwrite it).
2. **Fix the precedence so an in_progress/complete marking wins over a bare `submitted`.** Reorder
   `getOrdealStatus` so the marking-driven states are evaluated before the `responseStatus === 'submitted'`
   early-return: a `subStatus === 'in_progress'` returns `{ status: 'in_review', submission: sub }` (the
   card's existing `in_review` → "In Review" state, with the submission attached so `renderFeedback` runs);
   `subStatus === 'complete'` keeps returning `approved` with the submission. The plain `submitted`/
   `unmarked`/`draft` returns stay as the fallbacks for when there is no actionable marking.

This keeps the card-state vocabulary the player already has (`in_review` → "In Review"; the #924 block adds
the in-panel "Needs revision" cue). If the ST wants a distinct list-card label for a feedback round (e.g.
"Feedback ready" rather than "In Review"), that is a one-line label change in `ordealCard` (`stateLabel`,
`:358`) reusing the existing `.in_review` state class — see AC1.

## Acceptance criteria (from issue #928)

1. Given an `ordeal_responses` ordeal with `marking.status='in_progress'` and answer feedback, When the
   owning player opens their ordeals list, Then the card shows a distinct "needs revision / feedback" state
   (not the plain "Submitted") — the `in_review` state (label per ST: "In Review" or "Feedback ready").
2. Given that ordeal, When the player opens/expands it, Then they see the per-answer Near/No verdicts and
   the ST's feedback notes plus `overall_feedback` (via #924's `renderFeedback`).
3. `getOrdealStatus`/the loader source the marking from the `ordeal_responses` doc for rules/lore/covenant,
   not only `submissionsMap`.
4. A `submitted` top-level status no longer masks an `in_progress` marking (precedence fix).
5. No regression: completed/approved ordeals and any `ordeal_submissions`-backed ordeals render exactly as
   before. Verified against Lord Wan Yelong (q-keyed `ordeal_responses`) and a sparse `ordeal_submissions`
   case (a real `ordeal_submissions` entry must still take precedence and render unchanged).
6. Verdict vocabulary is normalised end-to-end: the player side is already `near` (#924). Confirm the
   deployed ST marking UI's middle verdict (`ordeals-admin.js`) is normalised to "Near" and that no live
   record still stores `close` (the player maps only `{yes,near,no}`); if a stored `close` exists, note the
   migration path rather than silently mis-rendering. (Verification + a note; the data migration itself, if
   needed, is a separate data op.)
7. Styling reuses the design-system classes (`.ordeal-fb-item` / `.ordeal-fb-q` / `.ordeal-fb-text` /
   `.ordeal-fb-result` / `.or-result-yes|near|no`, and the existing `.ordeal-card` state classes
   `.in_review`/`.done`/`.pending`); any new state class uses `theme.css` tokens. No inline `style=`, no
   bare hex/`rgba()`.

## Tasks / Subtasks

- [x] **Retain the `ordeal_responses` marking in the loader** (AC3) — `initOrdeals` now seeds
  `submissionsMap` for rules/lore/covenant from `rulesDoc`/`loreDoc`/`covDoc` `.marking` as a `{ marking }`
  shape, keyed by ordeal_submissions type (`rules_mastery`/`lore_mastery`/`covenant_questionnaire`), ONLY
  when no real `ordeal_submissions` entry exists for that type. The marking is no longer discarded.
- [x] **Fix `getOrdealStatus` precedence** (AC1, AC4) — moved `if (subStatus === 'in_progress') return
  { status: 'in_review', submission: sub }` ABOVE the `responseStatus === 'submitted'` early-return.
  `complete` still returns `approved` with the submission; `submitted`/`unmarked`/`draft` remain fallbacks.
- [x] **Card label for the feedback round** (AC1) — used the existing `in_review` state ("In Review"),
  which is already distinct from "Submitted" and carries #924's in-panel "Needs revision" cue + the notes.
  Did NOT invent a new state/label (avoids scope creep / a new state machine). The wording "In Review" vs a
  distinct "Feedback ready" is a one-line `stateLabel` (`:367`) change reusing `.in_review` if the ST wants
  it on the dev smoke — flagged, not changed.
- [x] **Verify the close→near normalisation** (AC6) — this branch's `ordeals-admin.js:251` uses value
  `near` / label `Near`; #924 fixed the player `RESULT_LABEL` to `near`. So the vocabulary is normalised on
  this branch. The "Close" the ST saw is the DEPLOYED (main) admin, which lacks this branch's normalisation
  — a deploy gap, resolved by shipping this branch + #924, NOT a code change here. No `close` result key
  remains in the player view (the one `close` hit is `.closest()`). A scan/migration of any legacy stored
  `close` result values is a separate data op (the live Wan Yelong data is all `near`).
- [x] **Parse + no-regression check** (AC5, AC7) — `node --check public/js/tabs/ordeals-view.js` PASS. The
  `approved`/`complete` branch and the `ordeal_submissions` precedence are untouched (a real submission
  still wins; the seed only fills an empty slot). No CSS touched (no inline `style=`, no bare hex); the card
  reuses the existing `.in_review` state class and #924's `.ordeal-fb-*` panel.
- [ ] **ST dev smoke** (AC1-AC5, Angelus — cannot test locally) — on `terramortis-dev.netlify.app` once on
  dev: Wan Yelong's rules/lore/covenant show a feedback-round card state ("In Review") + the Near notes +
  overall on open; a completed ordeal still shows its feedback (no regression); no console errors.

## Dev guardrails

- **Frontend only** — `public/js/tabs/ordeals-view.js`. No route/schema/grading-write change. Reuse #924's
  `renderFeedback` (do NOT re-implement it); this story only changes what FEEDS it (loader + `getOrdealStatus`).
- **No player-safe leak** — only `marking.answers` `{result, feedback}` + `overall_feedback` reach the player
  (as in #924). Never surface the rubric/answer key.
- **Normalised CSS** — reuse `.ordeal-fb-*` / `.or-result-*` / `.ordeal-card` state classes; `theme.css`
  tokens; no inline `style=`, no bare hex. See `specs/project-context.md`, `specs/architecture/coding-standards.md`.
- **British English** in any user-facing copy.
- **Smoke on dev, not locally** — Angelus cannot test locally; verify on `terramortis-dev.netlify.app`.
- **No regression** to completed-ordeal feedback visibility or to `ordeal_submissions`-backed ordeals.

## Out of scope

- The cockpit ordeal apply-to-live write (validated; the marking is correctly in the DB).
- The ST marking UI in `ordeals-admin.js`, except VERIFYING the `close → near` normalisation (AC6).
- Any new player "resubmit" flow.
- Per-question headings on notes (dropped in #924 by ST decision; still out of scope).
- The `close → near` DATA migration itself, if any `close` records are found (a separate data op; this story
  only flags it).

## References

- Target: `public/js/tabs/ordeals-view.js` — `initOrdeals` (~:63-88), `KEY_TO_SUBMISSION_TYPE` (:35-41),
  `getOrdealStatus` (~:324-346), `ordealCard`/`stateLabel` (~:350-369), `renderFeedback` (~:387-428, #924).
- API: `GET /api/ordeal-responses?type=rules|lore|covenant` returns the full response doc incl `marking`
  (`server/routes/ordeal-responses.js`); `GET /api/ordeal_submissions/mine` strips marking unless complete
  (`server/routes/ordeal-submissions.js:90-114`) — the asymmetry that makes the `ordeal_responses` path the
  one that must be read directly.
- Predecessor: `specs/stories/fix.924.ordeal-feedback-in-app.story.md` (status review; fixed `renderFeedback`).
- Styles: `.ordeal-fb-*` / `.or-result-*` in `public/css/suite.css` (loaded sheet) + `public/css/player-layout.css`.
- Live evidence: Wan Yelong `ordeal_responses` (rules/lore/covenant) `in_progress` with `near` + feedback;
  zero `ordeal_submissions`.

## Dev Agent Record

### Implementation notes
- Single-file frontend change in `public/js/tabs/ordeals-view.js`. No route/schema/grading-write change; no
  new dependency. Reuses #924's `renderFeedback` unchanged — this story only fixes what FEEDS it.
- **Loader (`initOrdeals`):** after building `submissionsMap` from `/api/ordeal_submissions/mine`, seed it
  for `rules_mastery`/`lore_mastery`/`covenant_questionnaire` from `rulesDoc`/`loreDoc`/`covDoc` `.marking`
  (`{ marking }` shape), only when no real `ordeal_submissions` entry exists. The existing
  `getOrdealStatus` lookup (`submissionsMap[subType]`) then finds the `ordeal_responses` marking with no
  further change to its body.
- **`getOrdealStatus`:** moved the `subStatus === 'in_progress'` return (→ `in_review` + `submission: sub`)
  above the `responseStatus === 'submitted'` early-return, so a feedback round on a still-`submitted`
  `ordeal_responses` doc surfaces (and hands the submission to `renderFeedback`) instead of being masked.
  The `approved`/`complete` precedence and the `submitted`/`unmarked`/`draft` fallbacks are unchanged.
- **AC1 card state:** reused the existing `in_review` state ("In Review"); the action signal is #924's
  in-panel "Needs revision" cue + the Near/No notes. No new state/label invented (scope discipline).
- **AC6:** verified — on this branch the admin and player verdict vocabulary are both `near`; the deployed
  "Close" is a stale main deploy, fixed by shipping this branch + #924, not by a code change here.

### Testing
- Repo convention is manual in-browser verification (CLAUDE.md: "No test framework"); the vitest suite is
  server-side and does not cover this DOM-string renderer, so no automated test added (matches #924).
- `node --check public/js/tabs/ordeals-view.js` → PASS.
- Grep confirmed: the `in_progress` branch precedes the `submitted` return; the `approved`/`complete` and
  `ordeal_submissions` paths are untouched; no `close` result key remains in the player view; no inline
  `style=`/bare hex added.
- **Outstanding (the one open task):** the live ST dev smoke (AC1-AC5 against Wan Yelong + a completed-ordeal
  no-regression check) on `terramortis-dev.netlify.app` once on dev — Angelus cannot test locally.

### File List
- `public/js/tabs/ordeals-view.js` (modified) — `initOrdeals` loader seeding + `getOrdealStatus` precedence
- `specs/stories/fix.928.ordeal-feedback-render.story.md` (new — this story)
- `specs/stories/sprint-status.yaml` (modified — added the issue-928 entry)

### Change Log
- 2026-06-25: Story created (bmad-create-story via tm-gh-issue-pickup #928). Completes #924 — fixes the
  loader + `getOrdealStatus` so the `ordeal_responses` in_progress marking reaches #924's `renderFeedback`.
  Status backlog -> ready-for-dev.
- 2026-06-25: Implemented (bmad-dev-story, Opus). Loader seeds the ordeal_responses marking into
  submissionsMap; getOrdealStatus surfaces in_progress before the bare submitted. `node --check` PASS;
  no-regression + AC6 greps clean. Frontend-only. Status ready-for-dev -> review. ST dev smoke is the open gate.

## QA Review (Quinn) — 2026-06-25

**Verdict: APPROVE.** No changes required. Ready for the ST dev smoke, then commit/PR. Verified independently
against the live code (`ordeals-view.js`, the two API routes), not just the dev notes.

**The reorder is surgical (the key no-regression proof).** `getOrdealStatus` (`:338-362`) only changes one
case: where `responseStatus === 'submitted'` AND `subStatus === 'in_progress'` coexist. That is exactly the
`ordeal_responses` feedback round (top-level `submitted` + an `in_progress` marking). For an
`ordeal_submissions`-backed ordeal there is no `ordeal-responses` doc, so `responseStatus` is `null` and the
`submitted` early-return never fired for it even before this change — it already fell through to the
`in_progress` branch. So `ordeal_submissions` behaviour is byte-for-byte unchanged. (AC5 met.)

**The loader seed is safe.** `submissionsMap[subType] = { marking }` only fills an EMPTY slot
(`!submissionsMap[subType]`), so a real `ordeal_submissions` entry always wins (AC3, AC5). Keys
(`rules_mastery`/`lore_mastery`/`covenant_questionnaire`) match `KEY_TO_SUBMISSION_TYPE`, so the existing
`getOrdealStatus` lookup finds them with no other change. A null `rulesDoc`/absent `.marking` simply isn't
seeded. (AC3 met.)

**Data contract checks out.** `GET /api/ordeal-responses?type=...` returns the full doc incl `marking`
(`server/routes/ordeal-responses.js`), so the seed has real data; the marking-status vocabulary the admin
writes is `complete`/`in_progress`/`unmarked` (`ordeals-admin.js:442`), matching the `subStatus` branches.
`renderFeedback` is called unconditionally in `ordealCard` (`:369`) and gates on `['complete','in_progress']`
(#924), so attaching the submission is sufficient to render. (AC1, AC2 met.)

**Positive side effect (not a regression):** a COMPLETED `ordeal_responses` ordeal now also attaches the
submission (`subStatus === 'complete'` in the approved branch), so a pass-with-notes shows its feedback too;
a clean all-yes pass shows nothing (renderFeedback's empty-feedback guard `:397`). Consistent with #924's
intent. Worth an eyeball on the smoke.

**AC6 (vocabulary):** confirmed `ordeals-admin.js:251` uses value `near` / label `Near`, and #924 fixed the
player `RESULT_LABEL` to `near`. Normalised on this branch; the deployed "Close" is stale `main`, fixed by
shipping this + #924, not by a code change here. No `close` result key remains in the player view. (AC6 met
as a verification.)

**CSS (AC7):** no CSS touched. The card reuses the existing `.in_review` state class and #924's
`.ordeal-fb-*` panel (in `suite.css`, the loaded sheet). No inline `style=`, no bare hex. (AC7 met.)

**Findings:**
- *Info (out of scope, issue-noted):* an `ordeal_submissions` `in_progress` feedback round still shows the
  "In Review" card but NO notes, because `GET /api/ordeal_submissions/mine` strips `marking.answers` until
  `complete` (`ordeal-submissions.js:90-114`). This is the pre-existing visibility asymmetry the issue
  flagged; #928 fully fixes the `ordeal_responses` path (rules/lore/covenant — including Wan Yelong), which
  is the actual blocker. Surfacing `ordeal_submissions` feedback rounds would need a `/mine` change (out of
  scope).
- *Low (ST decision):* the feedback-round card reads "In Review". If you'd rather it read "Feedback ready"
  to signal player action, that's a one-line `stateLabel` change reusing `.in_review` — decide on the smoke.
- *Info:* no automated test (no frontend harness; manual smoke per CLAUDE.md, as with #924). The meaningful
  check is the ST dev smoke (the one open task).

`node --check` PASS. Frontend-only; no route/schema/grading-write change; British English.
