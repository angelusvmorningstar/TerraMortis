---
id: dt-form.17
task: 17
epic: epic-dt-form-mvp-redesign
status: Ready for Review
priority: high
depends_on: ['dt-form.16']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q1, §Q2, §Q3, §Q4, §Q8, §Q11)
issue: 56
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/56
---

# Story dt-form.17 — Minimal/Advanced mode + soft-submit lifecycle + auto-XP mirror

As a player using the DT form,
I should see a Minimal mode by default that surfaces only what I need to submit, with my downtime-XP credit auto-awarded the moment my form is minimum-complete and auto-revoked if I drop below — visibly, with a banner and XP-Available annotation explaining the state,
So that the form is honest about its state and the manual "Submit Downtime" workflow is retired.

This is **foundation story #2 of 2**. Lands after #16. **All other per-section stories depend on this.**

---

## Context

ADR-003 locks five intertwined decisions in this single story:
- **§Q1 mode persistence**: `responses._mode = 'minimal' | 'advanced'`, default minimal, mode-switch preserves entered data.
- **§Q2 MINIMAL set composition**: court + personal_story (reduced) + feeding (simplified) + 1 project + regency-if-regent. Sections outside this set are not rendered in MINIMAL.
- **§Q3 derived-bool lifecycle (HARD MIRROR, rev 2)**: `responses._has_minimum: boolean` derived from `isMinimalComplete(responses)`. On every save: if changed, PATCH submission status + PATCH attendance.downtime to mirror.
- **§Q4 auto-XP timing**: `attendance.downtime` flips both ways with `_has_minimum`, immediately. Cycle close is the only true seal.
- **§Q8 location**: `isMinimalComplete()` in `public/js/data/dt-completeness.js` (separate module).
- **§Q11 cycle-close server gate**: `PATCH /api/downtime_submissions/:id` returns 423 Locked when `cycle.status === 'closed'`.

The ADR is explicit (§Q3 / §Q4) that hard mirror requires three UI affordances or "feels broken to players":
1. **Persistent banner** when `_has_minimum` is false
2. **XP-Available delta annotation** ("(downtime credit on hold)")
3. **Negative-`xpLeft()` red treatment** in the player view

These three affordances are **non-negotiable acceptance criteria for this story**. They ship together with the lifecycle wiring or this story does not ship.

### Files in scope

- `public/js/data/dt-completeness.js` (new) — exports `isMinimalComplete(responses)`. ESM module, importable client + server.
- `public/js/tabs/downtime-form.js` — mode selector at top of form; rendering gate per `_mode`; lifecycle hook in `scheduleSave()` / `saveDraft()`; the three UI affordances (banner, annotation, negative-XP-Left).
- `public/js/tabs/downtime-data.js` — `DOWNTIME_SECTIONS` annotated with which sections render in MINIMAL.
- `public/js/data/game-xp.js` — consumers must respect the new auto-derived `attendance[i].downtime` flow (no manual ST-flip dependency for the auto-flipped path).
- `server/routes/downtime.js` — new middleware: cycle-close 423 gate on `PATCH /api/downtime_submissions/:id`.
- `server/schemas/downtime_submission.schema.js` — document new fields under `properties`: `_mode`, `_has_minimum`, `_final_submitted_at` (last for compat with §Q5 / story #31).
- Player XP panel render path (suite — likely `public/js/suite/xp.js` or similar) — negative-`xpLeft()` red treatment + tooltip.

### Files NOT in scope

- The Submit Final modal itself — that's story #31. This story sets up the lifecycle the modal depends on.
- Per-section MINIMAL UI changes — those are stories #18, #20, #22, #23, #24. This story sets up the rendering gate; per-section authors respect it.
- Server-side validation of `_has_minimum` — Q7 deferred (server trusts the client PATCH).
- `game_session.schema.js` — **no schema delta** per ADR-003 rev 2 hard-mirror decision.

---

## Acceptance Criteria

### Mode selector (Q1, Q2)

**Given** a player opens a fresh DT submission
**When** the form renders
**Then** the mode selector at the top of the form defaults to MINIMAL. `responses._mode` is `'minimal'` on the persisted document.

**Given** a player switches MINIMAL → ADVANCED
**When** the form re-renders
**Then** all 11 sections from `DOWNTIME_SECTIONS` render. Previously-entered MINIMAL fields are preserved unchanged.

**Given** a player switches ADVANCED → MINIMAL
**When** the form re-renders
**Then** only the MINIMAL sections render (court + personal_story + feeding + 1 project + regency-if-regent). Previously-entered ADVANCED fields are NOT cleared from the persisted document — they remain in `responses` even though their UI is hidden. Switching back to ADVANCED reveals them unchanged.

**Given** a regent character (auto-detected from territory ownership per `downtime-form.js:1337`)
**When** the form is in MINIMAL mode
**Then** the regency section renders.

**Given** a non-regent character
**When** the form is in MINIMAL mode
**Then** the regency section does not render.

### Soft-submit lifecycle (Q3)

**Given** the form auto-saves (every keystroke + 2s debounce per existing `scheduleSave()`)
**When** the save fires
**Then** `isMinimalComplete(responses)` runs; if its result differs from the previous `responses._has_minimum`, the new value is written AND a PATCH fires to update `submission.status` (`'submitted'` ↔ `'draft'`) AND a PATCH fires to update `attendance[i].downtime` for the player's character on the active cycle's `game_session`.

**Given** the player flips from below-minimum to above-minimum
**When** the lifecycle PATCHes fire
**Then** `submission.status === 'submitted'`, `attendance[i].downtime === true`, the banner disappears, the XP-Available annotation disappears, and `xpGame()` recomputes to include the +1 downtime credit.

**Given** the player flips from above-minimum to below-minimum
**When** the lifecycle PATCHes fire
**Then** `submission.status === 'draft'`, `attendance[i].downtime === false`, the banner reappears, the XP-Available annotation reappears, and `xpGame()` recomputes to drop the +1 downtime credit.

**Given** the cycle is closed (`cycle.status === 'closed'`)
**When** the player attempts to PATCH the submission
**Then** the server middleware returns 423 Locked. The client surfaces a "Cycle closed; submission locked" message and does not retry.

### `isMinimalComplete()` (Q8)

**Given** the function lives at `public/js/data/dt-completeness.js`
**When** a developer reads it
**Then** it exports a single `isMinimalComplete(responses)` function returning a boolean. The function encodes the MINIMAL-completeness rules from §Q2:
- Court section has been touched (recount text non-empty)
- Personal Story has the binary Touchstone-or-Correspondence + text input filled
- Feeding (PRIMARY hunt) has territory + method + blood type + violence-mode set. **ROTE in a project slot does NOT satisfy this rule** (per Piatra clarification 2026-05-06: ROTE is a personal-project-action variant, not a feeding-section action; primary feeding must be filled independently).
- Project slot 1 has at least an action selected (any action type, including ROTE if the player chooses; further per-action validation TBD per §future-work)
- For regents: regency confirmation is positive

**Given** the same function
**When** imported from a server-side context (potential Q7 future-work)
**Then** the import succeeds without browser-only globals. The module has no `document` / `window` / DOM dependencies.

### The three UI affordances (Q3 hard mirror is honest)

**Given** `_has_minimum === false`
**When** the form renders
**Then** a persistent banner displays at the top of the form (or below the mode selector — implementer's call) with text approximately:
> *"Your form is below minimum-complete. Your downtime XP credit is on hold. Add the missing pieces to restore it: [list]."*

The list of missing pieces is derived from inverting `isMinimalComplete()`'s logic — each rule that fails contributes a one-line "[section]: [what's missing]" item.

**Given** `_has_minimum === false`
**When** the player's XP-Available number renders (anywhere it surfaces — sheet, suite, player tabs)
**Then** a small "(downtime credit on hold)" annotation appears immediately after the number. When `_has_minimum === true`, the annotation disappears.

**Given** the player has spent XP that subsequently flipped back below minimum (so `xpLeft()` returns negative)
**When** the player view renders XP-Left
**Then** the value is shown in red with a hover tooltip explaining the temporary deficit and how to resolve it ("restore the form to minimum-complete, or reverse the spend").

### Cycle-close server gate (Q11)

**Given** middleware on `PATCH /api/downtime_submissions/:id`
**When** the request fires
**Then** the middleware looks up the submission's `cycle_id`, fetches the cycle, and if `cycle.status === 'closed'` returns 423 Locked with `{ error: 'CYCLE_CLOSED', message: 'Cycle is closed; submissions are locked' }`. Otherwise, the request proceeds normally.

**Given** the middleware is implemented
**When** server tests run
**Then** all existing suites pass + at least one new test covers the 423 path.

---

## Implementation Notes

### Sequencing within this PR

1. Land `public/js/data/dt-completeness.js` first. Pure module, no DOM. Easy to test in isolation.
2. Land the rendering gate in `downtime-form.js`. `_mode` is read; sections in MINIMAL render; sections outside MINIMAL render only when `_mode === 'advanced'`.
3. Land the lifecycle wiring in `scheduleSave()` / `saveDraft()`. Compute `_has_minimum`; if changed from previous, PATCH the two artefacts.
4. Land the three UI affordances (banner, annotation, negative-XP-Left treatment). These are the user-facing signals that make hard mirror legible.
5. Land the server middleware (`server/routes/downtime.js`). One small `requireOpenCycle` middleware applied to the PATCH route.

### Banner copy (lock)

The exact wording is in §Q3:
> *"Your form is below minimum-complete. Your downtime XP credit is on hold. Add the missing pieces to restore it."*

Plus a list of missing pieces below. Implementer's call on visual treatment (yellow banner, blue info banner, etc.) — it should match existing form-banner styling if any (search `dt-banner-*` or similar).

### XP-Available annotation copy (lock)

The exact wording is in §Q3:
> *"(downtime credit on hold)"*

In parentheses, immediately after the XP-Available number. Smaller font / muted colour to not crowd the number.

### `attendance[i].downtime` PATCH endpoint

ADR-003 §Q3 sketches:
```
PATCH /api/game_sessions/.../attendance/:char_id { downtime: has_minimum }
```

If this endpoint doesn't exist yet, surface in DAR — may need a new route. Most likely it does (the ST attendance UI flips this flag manually; the same path applies).

### MINIMAL set per-section behaviour table (lock)

| Section | MINIMAL renders? | MINIMAL state |
|---|---|---|
| court | Yes | Full section as today |
| personal_story | Yes | Reduced binary (Touchstone-or-Correspondence + 1 text input) per #18 |
| feeding | Yes | Simplified per #20 |
| projects | Yes — 1 slot only | First slot rendered; ADVANCED renders all 4 |
| regency | Yes — only if regent | Confirmation UI per #23 |
| blood_sorcery | No | Hidden |
| territory | No | Hidden |
| acquisitions | No | Hidden |
| equipment | No | Hidden (also #30 hides for ADVANCED in this cycle) |
| vamping | No | Hidden |
| admin | No | Removed entirely (#31 replaces with submit-final modal) |

---

## Test Plan

1. **Server tests** — territory + downtime suites should remain green; new test for the 423 cycle-close path.
2. **Static review (Ma'at)** — three UI affordances are present in the diff; lifecycle PATCH calls are idempotent; mode-switch preserves data.
3. **Browser smoke (DEFERRED to user/SM)**:
   - Open a fresh submission → MINIMAL by default → only MINIMAL sections visible
   - Fill enough fields to flip `_has_minimum` true → banner disappears, annotation disappears, XP-Available updates
   - Empty a field to flip back to false → banner reappears, annotation reappears, XP-Available drops
   - Spend XP while above minimum, then drop below → red XP-Left + tooltip appears
   - Switch MINIMAL → ADVANCED → MINIMAL → no data lost
   - ST closes cycle → player attempts edit → 423 + locked message
   - Regent character: regency section appears in MINIMAL; non-regent: it does not

---

## Definition of Done

- [x] `public/js/data/dt-completeness.js` ships with `isMinimalComplete(responses)` exported
- [x] Mode selector renders at top of form; persistence in `responses._mode` works; default MINIMAL; switch preserves data
- [x] Lifecycle wiring in `scheduleSave()`/`saveDraft()` PATCHes both submission status + attendance.downtime on transition
- [x] All three UI affordances ship: banner, XP-Available annotation, negative-XP-Left red treatment
- [x] Cycle-close server gate returns 423 Locked
- [x] Schema documents new fields (`_mode`, `_has_minimum`, `_final_submitted_at`) under `downtime_submission.schema.js properties`
- [x] No `game_session.schema.js` delta (per ADR rev 2)
- [x] Server tests green; new 423 test added (plus 5 new tests for the attendance.downtime PATCH route)
- [ ] Browser smoke completes the 7-step plan in §Test Plan §3 *(deferred to user/SM per Test Plan)*
- [x] PR opened by `tm-gh-pr-for-branch` into `dev`, body links ADR-003 §Q1/Q2/Q3/Q4/Q8/Q11

---

## Dev Agent Record

**Agent Model Used:** James (BMAD `dev`) — Claude Opus 4.7

### Tasks
- [x] Build `public/js/data/dt-completeness.js` — pure ESM, no DOM. Exports `isMinimalComplete(responses, ctx)` and `missingMinimumPieces(responses, ctx)`.
- [x] Top-of-form Minimal/Advanced mode selector + section rendering gate. Mode-switch preserves entered data via spread-base in `collectResponses` and per-block mode gating.
- [x] Soft-submit lifecycle hook in `saveDraft()`: writes `_has_minimum` to responses; on transition pushes `submission.status` (in the PUT body) and `attendance[i].downtime` (PATCH `/api/attendance/:session_id/:character_id`).
- [x] UI affordance #1 — persistent below-minimum banner with locked copy + missing-pieces list at top of form.
- [x] UI affordance #2 — `(downtime credit on hold)` annotation in player XP panel + suite sheet badge. Cached on `c._dtHoldFlag` via new `loadDowntimeHoldFlag()` (browser-only loader).
- [x] UI affordance #3 — `xpLeft()` rendered red with hover tooltip when negative.
- [x] Server middleware `requireOpenCycle` on `PUT /api/downtime_submissions/:id` returns 423 `CYCLE_CLOSED`.
- [x] New PATCH route `/api/attendance/:session_id/:character_id { downtime }` for the lifecycle mirror (player-accessible; ST may flip any).
- [x] Schema additions on `downtime_submission` (`_mode`, `_has_minimum`, `_final_submitted_at`). No `game_session.schema` delta.
- [x] 7 new server tests (2 cycle-close + 5 attendance PATCH) — all green; 641/643 total pass (2 pre-existing dev failures unrelated).
- [x] Story status → Ready for Review; PR opened.

### File List

**New**
- `public/js/data/dt-completeness.js`
- `public/js/data/dt-hold-flag.js`

**Modified**
- `public/js/tabs/downtime-form.js`
- `public/js/tabs/xp-log-tab.js`
- `public/js/suite/sheet.js`
- `public/js/player.js`
- `public/js/app.js`
- `public/css/components.css`
- `server/routes/downtime.js`
- `server/routes/attendance.js`
- `server/schemas/downtime_submission.schema.js`
- `server/tests/api-downtime.test.js`
- `server/tests/api-game-sessions.test.js`
- `specs/stories/dt-form.17-minimal-advanced-lifecycle.story.md` (Dev Agent Record only)

### Completion Notes

- DAR raised early (chat → Khepri) on the missing `attendance[i].downtime` PATCH route. Implemented option 1 from the DAR — added `PATCH /api/attendance/:session_id/:character_id { downtime: bool }` under the player-accessible `/api/attendance` mount (the `/api/game_sessions` route is `requireRole('coordinator')` in prod, so the new route had to live elsewhere). Also extended `GET /api/attendance` to surface `session_id` so the client can address the PATCH without reaching the ST-only `/api/game_sessions` listing.
- Cycle-close gate: ADR §Q11 wording is `PATCH /api/downtime_submissions/:id`, but the live mutation path is `PUT /api/downtime_submissions/:id` (the route is named PUT but accepts partial-body patch-semantic updates via `$set`). Gate applied to PUT with the AC's contract (423 + `CYCLE_CLOSED` body) preserved verbatim. If a literal HTTP-PATCH alias is wanted later, it's a one-line addition.
- Mode-switch data preservation: `collectResponses()` now starts from `..._prior` spread and skips iteration over ADVANCED-only blocks (sorcery, spheres, status, contacts, retainers, acquisitions, equipment, skill acq) when the form is in MINIMAL mode. Project slot collection caps at slot 1 in MINIMAL; slots 2-4 retain their prior values from the spread. ADVANCED-only sections are not rendered in MINIMAL (per ADR §Q2 lock — "not rendered, not just display:none").
- The XP-Available annotation needs the active cycle's submission status to be known on every char render. Added `loadDowntimeHoldFlag(chars)` (browser-only, in `dt-hold-flag.js` to keep `dt-completeness.js` pure ESM importable server-side). Called from both `player.js` and `app.js` after `loadGameXP`. Trusts persisted `_has_minimum` when present; falls back to the submission's coarse `status` when not.
- Two pre-existing server test failures on `dev` are unrelated to this branch (`api-relationships-player-create.test.js > GET /api/npcs/directory`; `rule_engine_grep.test.js` flagging `m.cp || 0` and `m.xp || 0` in `auto-bonus-evaluator.js` and `pool-evaluator.js`). Same as the dt-form.16 PR.

### Change Log
| Date | Author | Change |
|---|---|---|
| 2026-05-06 | James (dev) | Implemented all six ADR-locked decisions (§Q1, §Q2, §Q3, §Q4, §Q8, §Q11) plus the three non-negotiable UI affordances. Added the player-accessible attendance PATCH route per DAR. Status → Ready for Review. |

---

## Dependencies

- **Upstream**: #16 (universal character picker — used by feeding section's territory/method UI in the simplified MINIMAL variant if it consumes a picker; #17 doesn't directly call it but per-section MINIMAL stories depend on both)
- **Downstream**: blocks every per-section story (#18, #19, #20, #21, #22, #23, #24, #25, #26, #27, #28, #29, #30, #31). The mode/lifecycle gate is the rendering contract those stories respect.
