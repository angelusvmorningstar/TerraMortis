# Story Feature.583: Show the investigate lead in the DT Processing details card

## Status: review

> **Implemented 2026-06-05.** Render-only Lead row added to `renderNormalisedCard`; new spec `tests/feature-583-investigate-lead-card.spec.js` (3/3 pass). ESM parse-check green. Not committed/pushed pending Angelus review.
>
> **Regression note:** `downtime-processing.spec.js` shows 13 failures, but these are PRE-EXISTING from the #581 flat-card-wall merge (the suite's `openFirstAction`/setup helpers expect the removed `.proc-phase-section` accordion DOM), confirmed identical across two runs and unrelated to this change. Recommend a separate follow-up to update that suite for the flat card wall (a #581 debt, not #583).

## Metadata
- issue: 583
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/583
- branch: morningstar-issue-583-investigate-lead-card
- type: feature / enhancement (render-only)

---

## Story

**As** an ST resolving an Investigate action in DT Processing,
**I want** the player's submitted investigation lead shown on the action's Details card (Title / Lead / Description),
**so that** I can see the starting point the investigation is built on without digging into the raw submission.

---

## Background

The player DT form makes the lead **mandatory** for Investigate actions ("What is your lead on this investigation? Provide a specific starting point, source, or known fact. Investigations without a lead cannot proceed."). The text is submitted and stored, but it never reaches the ST in DT Processing, so the Storyteller resolving the investigation cannot see the lead. Raised from a live DT3 example (Einar, "Hunting the Hunter"): the lead is in the submission but absent from the processing card.

### The good news: the data is already on the card's entry

This is a **render-only** change. The lead is already plumbed all the way to the card:

- The form persists it under `project_${n}_investigate_lead` (`public/js/tabs/downtime-form.js:3768-3774`, and the shared quick-form path at `:6022-6027`).
- `buildProcessingQueue` reads it into the queue entry as `entry.projInvestigateLead` (`public/js/admin/downtime-views.js:3055` then `:3109`).
- But `renderNormalisedCard` (the project Details card) never draws it. Its view mode shows Title, (Desired Outcome only for `misc`), Description and XP (`downtime-views.js:8847-8858`).
- A comment at `downtime-views.js:8802` records that target/lead/cast were deliberately stripped from Details, which is why the lead is currently dropped for the ST.

So the fix is to render the existing `entry.projInvestigateLead` value as a new row between Title and Description, gated to Investigate actions.

### Current Details-card view mode (the insertion point)

`public/js/admin/downtime-views.js:8847-8858`:
```js
// View mode
h += `<div class="proc-feed-desc-view">`;
if (titleVal)                  h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Title</span> ${esc(titleVal)}</div>`;
if (showOutcome && outcomeVal) h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Desired Outcome</span> ${esc(outcomeVal)}</div>`;
if (descVal)                   h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Description</span> ${esc(descVal)}</div>`;
// ... XP rows ...
if (!titleVal && !(showOutcome && outcomeVal) && !descVal) h += `<div class="proc-proj-field proc-feed-desc-empty">— No details recorded</div>`;
h += `</div>`;
```

The new Lead row goes immediately **after the Title row** (between Title and Description).

---

## Acceptance Criteria

- [x] **AC1** — Investigate project with a non-empty lead renders a **Lead** row between Title and Description, showing the escaped text. _(Test: "investigate action shows a Lead row with the player text" — pass.)_
- [x] **AC2** — Lead row gated on `entry.actionType === 'investigate' && entry.projInvestigateLead`; a non-investigate (ambience) action carrying a stray `investigate_lead` key shows no Lead row. _(Test: "non-investigate action does NOT show a Lead row" — pass.)_
- [x] **AC3** — Empty-state guard updated to `!titleVal && !leadVal && !(showOutcome && outcomeVal) && !descVal`, so a lead does not produce a stray row and does not break "— No details recorded".
- [x] **AC4** — No new CSS: reuses `proc-proj-field` + `proc-feed-lbl`, identical to Title/Description.

---

## Decision (defaulted; confirm if you disagree)

**Read-only display** is the spec'd behaviour, matching the literal ask (the card "should show" Title/Lead/Description). The lead is a player-submitted fact, like the Player's Pool, so it is shown read-only in view mode and is **not** added to the card's Edit mode. Making the lead ST-editable (a persisted `rev.investigate_lead` override + save wiring, mirroring Title/Description) is **out of scope** here; raise a follow-up if wanted.

---

## Tasks

### Task 1 — Render the Lead row (AC1, AC2, AC4) — [x] DONE
In `renderNormalisedCard` (`public/js/admin/downtime-views.js`, view mode ~`:8849`), after the Title row and before the Description row, add:
```js
if (entry.actionType === 'investigate' && entry.projInvestigateLead) {
  h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Lead</span> ${esc(entry.projInvestigateLead)}</div>`;
}
```
Use `entry.projInvestigateLead` (already populated at `:3109`). Do NOT add a `rev` override or Edit-mode input (per Decision).

### Task 2 — Empty-state safety (AC3) — [x] DONE
Confirm the `!titleVal && !(showOutcome && outcomeVal) && !descVal` empty-state guard at `:8857` still reads correctly. The lead row is additive and gated on its own non-empty check, so a lead-only (no title/desc) investigate action will now show the Lead row instead of "— No details recorded" — verify that is acceptable (it is: a lead IS a detail). Do not let an empty lead render a stray row.

### Task 3 — Test (AC1, AC2) — [x] DONE
New Playwright spec `tests/feature-583-investigate-lead-card.spec.js`, 3 tests, all passing (chromium): Lead row shows with text; Lead sits between Title and Description (label-order assertion); non-investigate action shows no Lead row. Modelled on `downtime-processing.spec.js` harness. Note: the queue auto-renders a Feeding row alongside the project action, so the helper targets the action row by visible title text rather than `.first()`.

---

## Dev Notes

### Files / artifacts
- `public/js/admin/downtime-views.js:8847-8858` — Details card view mode (the only edit site).
- `public/js/admin/downtime-views.js:3055,3109` — where `projInvestigateLead` is read and attached to the entry (no change needed; reference).
- `public/js/tabs/downtime-form.js:3768-3774` — the form field (source of the data; no change).
- `public/css/admin-layout.css` — `proc-proj-field` / `proc-feed-lbl` already defined (`:5747` etc.); reuse, do NOT add styles.

### Must preserve / watch-outs
- Gate strictly on `entry.actionType === 'investigate'` AND a non-empty lead. Do not show the row for other action types (the field is only populated for investigate, but the explicit guard documents intent and is cheap insurance).
- Escape with `esc()` (the lead is free player text).
- Read-only only: do NOT touch the Edit-mode block (`:8861-8868`) or add a `rev` field / save handler — that is the deliberately-deferred editable variant.
- This is the **project** investigate card path. Merit/sphere/status-driven investigate leads (`sphere_${n}_investigate_lead`, `status_${n}_investigate_lead`) render via a different card and are out of scope (issue #583 scope note).
- British English in any new label text (the label is simply "Lead").

### References
- [Source: public/js/admin/downtime-views.js:8847-8858] — insertion point
- [Source: public/js/admin/downtime-views.js:3109] — `projInvestigateLead` on entry
- [Source: public/js/tabs/downtime-form.js:3768-3774] — form capture
- [GitHub issue #583] — https://github.com/angelusvmorningstar/TerraMortis/issues/583
- `reference_downtime_system`, `reference_downtime_mechanics` — DT processing context

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- `node --input-type=module --check < public/js/admin/downtime-views.js` — PASS.
- `npx playwright test feature-583-investigate-lead-card.spec.js --project=chromium` — 3 passed.
- Diagnostic during test bring-up: the processing queue renders a Feeding row in addition to the project action row (so a `.first()` row click hit Feeding, not Investigate). Fixed the spec helper to target the action row by its title text.

### Completion Notes List

- Implemented as a render-only addition in `renderNormalisedCard` view mode: a `leadVal` const gated on `entry.actionType === 'investigate' && entry.projInvestigateLead`, a Lead row drawn between Title and Description, and the empty-state guard extended with `!leadVal`. No Edit-mode change, no `rev` override, no new CSS (read-only per Decision).
- Data was already on the entry (`entry.projInvestigateLead`, populated at downtime-views.js:3109); no plumbing or form change needed.
- Scope respected: project investigate only; merit/sphere/status investigate leads untouched.

### File List

- `public/js/admin/downtime-views.js` (modified — Lead row + empty-state guard in `renderNormalisedCard`)
- `tests/feature-583-investigate-lead-card.spec.js` (new — 3 Playwright tests)
- `specs/stories/feature.583.investigate-lead-details-card.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Added read-only investigate Lead row to the DT Processing Details card (Title / Lead / Description). New Playwright spec, 3 tests passing. Status → review.
