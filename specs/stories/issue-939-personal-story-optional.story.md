# Issue #939: Make Personal Story (Off-Screen Life) optional; clarify Vamping text

Status: review
<!-- Implemented + verified headless (node --check x3, dt-completeness unit suite 7/7, hold-flag + territory suites green; no spec asserts the changed copy). Open gate: in-browser smoke on dev (Angelus cannot test locally). -->

issue: 939
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/939
branch: ms/issue-939-personal-story-optional

## Story

As a player submitting a downtime,
I want Personal Story (Off-Screen Life) to be optional — and the Vamping section to clearly say it's informational-only —
so that I'm not forced to write an off-screen beat to keep my downtime XP credit, and I understand Vamping won't get a reply from the STs.

## Background / why now

Personal Story (Off-Screen Life) is currently part of the **minimum-complete** gate: leave it blank and the form shows "your downtime XP credit is on hold." The ST (Angelus) wants it optional. Separately, the Vamping section's help text doesn't make clear that it's informational-only — players read it as something the STs will respond to, when in fact STs only take note (no content returned).

Single cohesive story (two small, related edits to the same downtime-form surface): one logic change (drop Personal Story from the completeness gate) plus copy changes to two section texts.

## Current behaviour (files read)

**`public/js/data/dt-completeness.js`** (read in full) — the single source of truth for "minimum-complete":
- `_hasPersonalStory(responses)` (L38-55) — true when `personal_story_kind` + `personal_story_text` present, OR a legacy who+what pair.
- `isMinimalComplete` (L103-113) — **L108 `if (!_hasPersonalStory(responses)) return false;`** is the mandatory gate.
- `missingMinimumPieces` (L122-158) — pushes a `personal_story` entry in the null-responses fallback (**L126**) and in the live branch (**L136-138**). This list drives the "XP credit on hold" banner's missing-pieces UI.
- `_hasPersonalStory` is module-local; its ONLY callers are L108 and L136. Removing both makes it dead → remove the function too.

**`public/js/tabs/downtime-form.js`** (read):
- Personal Story render: section open L4528, intro **L4531** ("Pick one personal-story beat for this cycle: a touchstone moment that anchors your humanity, or a correspondence with someone off-screen."), kind radios L4534-4541, optional NPC name L4549-4550, textarea label L4554 + textarea L4557.
- Min-complete banner L2022-2069 — consumes `missingMinimumPieces` (so removing the gate auto-removes it from the banner).
- Section-tick gate L6854-6861 — independently lights the green tick when `personal_story_kind` + text are set. This is cosmetic (not a submit block); leave as-is (an optional section can still show a tick when filled).

**`public/js/tabs/downtime-data.js`** (read):
- Personal Story section title L245 "Personal Story: Off-Screen Life".
- Vamping section L390-413: title "Vamping: Fever for the Flavour" (L394); main field L399-404 label "Anything you want the STs to know about the other things your character gets up to?" with desc (L403) "Soft RP, general flavour, non-mechanical activities, personal habits, quirks, or fun. This section won't generate rolls but informs ST narration and may influence ongoing plots." — does NOT say the player gets nothing back.

**Other consumers to verify (don't break):**
- `public/js/data/dt-hold-flag.js` — computes the XP-hold flag from completeness. Confirm it relies on `isMinimalComplete`/`missingMinimumPieces` and needs no separate personal_story reference.
- `server/schemas/downtime_submission.schema.js` — grep hit; confirm it does NOT server-side-enforce personal_story (the module is currently client-only per its header comment).
- Existing specs/tests that may assert the old mandatory behaviour: `tests/issue-24-story-freetext.spec.js`, `server/tests/dt-form-territory-fresh-fetch.test.js`. Update any assertion that requires Personal Story for completeness.

## Decisions (locked)

1. Personal Story stays **visible and fully usable** — it just no longer gates minimum-complete.
2. Direction: remove the `_hasPersonalStory` checks from the completeness gate (not a feature-flag).
3. Vamping behaviour is unchanged (already `required:false`, non-mechanical); only its help text changes.
4. UI copy reuses existing classes (`.qf-section-intro`, `.qf-label`, `.qf-textarea`); no inline `style=`, no new CSS, British/Australian spelling, no em-dashes.

## Acceptance Criteria

1. Given a submission with no Personal Story (no `personal_story_kind`/`personal_story_text` and no legacy pair), `isMinimalComplete(responses, ctx)` returns true when the other minimum pieces (game recount, feeding, project 1, regency-if-regent) are present.
2. `missingMinimumPieces` never returns a `personal_story` entry (neither the null-responses fallback nor the live branch).
3. The "downtime XP credit is on hold" banner does not appear solely because Personal Story is blank.
4. The Personal Story section text explicitly states it is **optional**.
5. The Vamping section text explicitly states it is **informational-only** and that the player will **not** receive content / a written response back from the STs.
6. No regression to the other minimum-complete rules (court/feeding/projects/regency) or to Personal Story rendering when it IS filled.
7. Copy uses design-system classes and tokens (no inline `style=`, no bare hex). British/Australian spelling, no em-dashes.

## Tasks / Subtasks

- [x] **Task 1 — Drop Personal Story from the completeness gate (AC: 1,2,3,6).**
  - [x] `dt-completeness.js`: removed the `_hasPersonalStory` check from `isMinimalComplete`; removed the `personal_story` push from `missingMinimumPieces` (null-responses fallback + live branch); removed the now-dead `_hasPersonalStory` helper (replaced with a #939 note).
  - [x] Added `server/tests/issue-939-personal-story-optional.test.js` — 7/7 green: blank Personal Story is now complete; personal_story never in `missingMinimumPieces`; game-recount / feeding / project-1 / regency still gate.
  - [x] Verified consumers: `dt-hold-flag.js` reads the server `/hold-flags` map (no PS ref); the server endpoint (`downtime.js:710-741`) only READS the stored `responses._has_minimum`; the client writes `_has_minimum = isMinimalComplete(...)` (`downtime-form.js:1156-1157`), so the gate change propagates to the persisted flag on next save. Schema declares `personal_story` as an allowed (not required) field. No test asserted the old mandatory behaviour (`dt-form-territory-fresh-fetch` stubs the module; `issue-24` checks rendering/tick only).
- [x] **Task 2 — Personal Story text says optional (AC: 4,7).**
  - [x] Reworded the intro (`downtime-form.js:4531`) to lead with "Optional." and "You can leave this blank and still submit your downtime"; added "(optional)" to the section title (`downtime-data.js:245`). Reuses `.qf-section-intro`/`.qf-section-title`. Also tidied a stale `_hasPersonalStory` comment at `downtime-form.js:543`.
- [x] **Task 3 — Vamping text says informational-only (AC: 5,7).**
  - [x] Reworded the Vamping field desc (`downtime-data.js:403`) to state it is just to let the STs know what the character gets up to, that it is informational only, and that the player will not get content or a written response back. Example retained.
- [x] **Task 4 — Verify (AC: 6).** `node --check` clean on all 3 frontend files; `dt-completeness` suite 7/7; `dt-form-territory-fresh-fetch` + `api-downtime-hold-flags` green (19 tests total); no spec asserts the changed copy. In-browser smoke on `dev` is the open gate (cannot test locally).

## Dev Notes

- The gate is the ONLY hard enforcement. The section-tick (downtime-form.js:6856) is cosmetic — safe to leave; an optional section showing a tick when filled is fine.
- `dt-completeness.js` is pure ESM (no DOM) and unit-testable directly — that's where the headless test belongs.
- Keep the legacy-shape tolerance out of scope: since the whole personal_story check is removed from the gate, the legacy who/what branch in `_hasPersonalStory` goes away with the function. No data migration.
- Copy: British/Australian spelling, no em-dashes (project conventions). Vamping wording should be unambiguous that STs take note but do not reply with content.

### Project Structure Notes

- Frontend-only. No server route or schema changes (verify the schema grep hit is not an enforcement). No DB writes.

### References

- `public/js/data/dt-completeness.js` — `_hasPersonalStory` L38-55, `isMinimalComplete` L108, `missingMinimumPieces` L126 + L136-138
- `public/js/tabs/downtime-form.js` — Personal Story intro L4531 (render L4528-4557), min-complete banner L2022-2069, section-tick L6854-6861
- `public/js/tabs/downtime-data.js` — Personal Story title L245, Vamping section L390-413 (desc L403)
- Consumers: `public/js/data/dt-hold-flag.js`, `server/schemas/downtime_submission.schema.js`
- Issue: https://github.com/angelusvmorningstar/TerraMortis/issues/939

## QA Results (Quinn, 2026-06-27)

**Gate: PASS** (headless) — clear to deploy to `dev`. In-browser smoke is the only remaining confirmation (deploy-gated).

**Regression:** 103 tests green across 9 suites touching the changed modules / hold path — including the DB-backed `api-downtime-hold-flags` and `epic.708.6-attendance-xp-absorption`. `node --check` clean on all changed files. New `dt-completeness` unit suite 7/7.

**Edge cases reviewed:**
- Gate now = game-recount (if attended) + feeding + project 1 + regency-if-regent; Personal Story removed from both `isMinimalComplete` and `missingMinimumPieces` (incl. the null-responses fallback). Other rules verified still gating (negative tests).
- No live code references the removed `_hasPersonalStory` — only comments remained; the stale ones (`downtime-form.js:543` and the section-tick comment `:6854`) were tidied. Cosmetic section-tick behaviour unchanged (lights when filled; an optional section showing a tick is fine).
- Hold path: `_has_minimum` is written client-side from `isMinimalComplete` and only read back by the server `/hold-flags` endpoint — so the change correctly lifts the XP hold on save. Schema declares `personal_story` allowed (not required) — no server enforcement.
- Copy: British/Australian spelling retained ("flavour"), no em-dashes; reuses existing component classes.

**Low-severity note (non-blocking):**
1. `_has_minimum` is a save-time snapshot. Submissions already on hold *solely* because Personal Story was blank will not auto-flip to "not on hold" until the player re-opens and saves the form (recomputing the flag). For a live cycle this is self-healing on next save; a one-off backfill is only needed if STs want existing holds cleared without a player re-save.

**Smoke for `dev` (open gate):** submit a downtime with the other minimum pieces present but Personal Story blank → confirm no "downtime credit on hold" and that the optional/Vamping wording reads correctly.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD dev-story, Amelia)

### Debug Log References

- `dt-completeness` test: RED 4 fail / 3 pass → GREEN 7/7 (`server/tests/issue-939-personal-story-optional.test.js`).
- `node --check` clean on `dt-completeness.js`, `downtime-form.js`, `downtime-data.js`.
- Verify run: `issue-939` + `dt-form-territory-fresh-fetch` + `api-downtime-hold-flags` → 19/19 green.

### Completion Notes List

- **Architecture confirmed:** `_has_minimum` is computed client-side via `isMinimalComplete` (`downtime-form.js:1156-1157`) and persisted on the submission; the server `/hold-flags` endpoint only reads the stored boolean. So `dt-completeness.js` is the single correct seam — the change lifts the XP hold on the player's next save and removes Personal Story from the on-hold banner's missing-pieces list.
- Personal Story remains visible and fully usable; only its gating + copy changed. The cosmetic section-tick still lights when filled (left as-is).
- British/Australian spelling, no em-dashes; copy reuses existing component classes (no new CSS, no new inline styles introduced).
- No DB writes, no server route/schema changes, no new dependencies.

### File List

- `public/js/data/dt-completeness.js` (modified) — removed Personal Story from `isMinimalComplete` + `missingMinimumPieces`; removed dead `_hasPersonalStory`
- `public/js/tabs/downtime-form.js` (modified) — Personal Story intro reworded to "optional"; tidied stale comment
- `public/js/tabs/downtime-data.js` (modified) — Personal Story title "(optional)"; Vamping desc reworded to informational-only / no content back
- `server/tests/issue-939-personal-story-optional.test.js` (new) — completeness unit tests

### Change Log

- 2026-06-27: Personal Story (Off-Screen Life) made optional (removed from minimum-complete gate); Personal Story + Vamping help text clarified. Frontend + pure completeness module only; no server/DB changes. Unit tests 7/7; verify suite 19/19. In-browser smoke pending dev deploy.
