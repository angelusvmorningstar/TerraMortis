# Issue #918: Cycle tab — edit/add/delete cycles, status ribbon, toggleable phases

Status: review

issue: 918
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/918
branch: morningstar-issue-918-cycle-tab-edit-add-delete

## Story

As a Storyteller managing the campaign from the Engine → Cycle tab,
I want full lifecycle control over Game Cycles — edit a cycle's label and chapter, add new cycles, delete redundant ones, freely toggle the phase (including back to neutral), and see at a glance where the campaign currently sits,
so that I can run cycle setup (e.g. opening feeding for the next game) without hand-editing the database or being stuck with read-only rows.

## Background / why now

Raised while setting up Game 5. The Cycle tab can CRUD Chapters but Game Cycle rows are largely read-only: no label edit, no chapter assignment after creation, no add-cycle, no delete (two junk "Test Cycle" rows, `game_number: 99`, sit in the live list), and no indicator of current chapter/cycle/phase. The phase buttons also can't be toggled off — the active one is `disabled`.

This is a single cohesive story (not an epic) because all five features overhaul the **same render module** (`public/js/admin/cycle-views.js`, primarily `buildCyclesPanel` / `buildPhaseCell`). Splitting tightly-coupled edits to one render function across separate stories/branches would create rebase fragility in shared code for no QA benefit. The only naturally-separable piece — the server `DELETE` route — belongs with the delete feature anyway.

## Current behaviour (files read)

**`public/js/admin/cycle-views.js`** (read in full):
- `buildChaptersPanel` (L32-141) — Chapters have inline add-form (L96-138) and per-row Delete (L75-88). This is the **reuse pattern** for cycle add/edit/delete UI.
- `buildCyclesPanel` (L388-523) — renders the cycle table. **Label** rendered as plain text `tdLabel.textContent` (L427). **Chapter** rendered as plain text `tdChapter.textContent` (L432-435). No add-cycle control, no delete control.
- `buildPhaseCell` (L160-201) / `setGamePhase` (L147-158) — three buttons (Game/Downtime/Processing). Active phase button is `disabled` (L178); clicking Game first fires `confirm()` then `apiDelete('/api/tracker_state')` (L148-154) then `PUT { game_phase }`. No way to clear the phase.
- Heavy use of inline `style=` throughout — **legacy tech-debt; do not propagate** (see CSS standards).

**`public/js/downtime/db.js`** (read in full):
- `createCycle(gameNumber, {status, deadlineAt})` (L19-30) — exists, **unwired in admin**. Builds `{ label: 'Downtime '+n, game_number, status, ... }`.
- `updateCycle(id, updates)` (L42-44) — `PUT /api/downtime_cycles/:id`. Use for label/chapter/game_phase writes.
- `deriveCycleStatus(cycle)` (L67-84) — maps `game_phase` → status: `game→game`, `downtime→active`, `processing→closed`; falls back to `phase_signoff` legacy derivation when `game_phase` is unset. **This is why clearing `game_phase` is safe**: it reverts to the legacy derivation.
- `getGamePhaseCycle()` (L121-124) — `cycles.find(c => c.status === 'game')`. Drives whether the Feeding tab opens. A neutral cycle (no `game_phase`) is intentionally NOT picked up here.
- No client-side delete helper exists.

**`server/routes/downtime.js`** (relevant sections read):
- `parseId(id)` (L24-30) — ObjectId parse, returns null on bad format.
- `cyclesRouter.get('/')` (L76-79) — both roles; sorts `_id: -1` (cycles lack `created_at`).
- `cyclesRouter.post('/')` (L82-87) — ST only, `validate(downtimeCycleSchema)`, inserts and returns the doc.
- `cyclesRouter.put('/:id')` (L542-555) — ST only, strips `_id`, `$set` updates, returns updated doc or 404.
- **No `DELETE` route exists** — must be added (see Task 6).
- Auth: `requireRole('st')` from `../middleware/auth.js`. Schema: `downtimeCycleSchema` from `../schemas/downtime_submission.schema.js`.

## Decisions (locked)

- **Phase toggle includes a cleared/neutral state.** Clicking the currently-active phase button **unsets `game_phase`** (clears it). `deriveCycleStatus` then falls back to `phase_signoff`. The status ribbon must show "no phase set" in that state. This is the correct way to CLOSE feeding for a game without forcing the cycle into Processing/closed.

## Open question (carry into implementation — decide before Task 6)

- **Soft-delete vs hard-delete** for a cycle that has `downtime_submissions` referencing it. Hard delete would orphan submissions; the live DT1-4 cycles each have submissions. Recommendation: **hard-delete only when the cycle has zero submissions** (the two Test Cycles qualify); block deletion of cycles with submissions behind a hard error from the server, with the UI surfacing it. Defer a true archive/soft-delete model unless the ST needs to remove a cycle that has submissions. Confirm with Angelus during dev if a submission-bearing cycle must be deletable.

## Acceptance Criteria

1. A cycle row's **label** can be edited inline (reuse the chapters inline-edit pattern) and persists across reload via `PUT /api/downtime_cycles/:id`.
2. A cycle can be **assigned/reassigned to a Chapter** (or cleared to none) from its row via a dropdown of existing chapters; persists `chapter_id`.
3. A **status ribbon** at the top of the Cycle tab shows current **Chapter / Game Cycle / Phase**. "Current" = the cycle whose `game_phase` is set; if none, the newest non-closed cycle. Ribbon updates live when the phase changes, and shows "no phase set" when the current cycle has no `game_phase`.
4. **All three phase buttons are interactive**; the active phase is visually distinct; switching phases still fires the existing Game-phase tracker-reset `confirm()` + `apiDelete('/api/tracker_state')`.
5. **Clicking the active phase clears it** (`game_phase` unset); the ribbon reflects "no phase set" and `deriveCycleStatus` falls back to `phase_signoff`.
6. A **"+ New Cycle"** control creates a cycle (label + game_number, optional chapter) that appears in the list without a full reload (mirror the chapters add-form flow).
7. A cycle can be **deleted** from the UI; a cycle **with submissions cannot be deleted** without explicit confirmation (or is blocked per the resolved open question); the two "Test Cycle" rows can be removed.
8. `DELETE /api/downtime_cycles/:id` exists, is **ST-only**, returns 404 for unknown id and a clear error for a guarded/blocked delete.
9. **Styling uses design-system tokens and reuses existing component classes** — no inline `style=`, no bare hex/`rgba()`. New ribbon styling goes in `admin-layout.css` using `theme.css` tokens.

## Tasks / Subtasks

- [x] **Task 1 — Inline edit label (AC: 1).** `buildLabelCell` renders label text + a ✎ edit button; clicking swaps to an input with Save/Cancel (Enter saves, Esc cancels). Save via `updateCycle(cy._id, { label })`, mutate `cy.label`, re-render cell, refresh ribbon. No full reload.
- [x] **Task 2 — Chapter assignment dropdown (AC: 2).** `buildChapterSelect` renders a `.form-select` of chapters (+ "none"). On change, `updateCycle(cy._id, { chapter_id })` (null clears); mutate `cy.chapter_id`, refresh ribbon; reverts the select on failure.
- [x] **Task 3 — Status ribbon (AC: 3).** `buildRibbon`/`renderRibbon` at the top of `initCycleView`. `deriveCurrentCycle` = cycle in `game` phase → else newest with any phase → else newest non-closed (via `deriveCycleStatus`). Shows Chapter / Game Cycle / Phase, "No phase set" when unset. Module-level `view` state lets it refresh after any mutation without a re-fetch.
- [x] **Task 4 — Toggleable phases incl. neutral (AC: 4, 5).** `buildPhaseCell` buttons are all interactive; active one carries `.is-active`. Clicking the active phase writes `{ game_phase: null }` (clears). `writePhase` keeps the Game-phase `confirm()` + `apiDelete('/api/tracker_state')` — and that reset is gated strictly inside the `phaseOrNull === 'game'` branch, so clearing never wipes the tracker. `null` via `$set` works because `deriveCycleStatus` uses strict `=== 'game'` etc. and falls through to the legacy branch.
- [x] **Task 5 — Add new cycle (AC: 6).** "+ New Cycle" button toggles an inline form (game # prefilled to max+1, label, chapter `.form-select`). Save calls `createCycle(num, { label, chapterId })` (extended in db.js) then `refresh()`.
- [x] **Task 6 — Delete cycle: server route (AC: 8) + client (AC: 7).** Resolved open question with the recommended default — **block hard-delete of submission-bearing cycles**.
  - Server: `cyclesRouter.delete('/:id', requireRole('st'), ...)` — `parseId`→400; `countDocuments({ cycle_id: oid })`; if > 0 → **409 `CYCLE_HAS_SUBMISSIONS`** with a clear message; else `deleteOne`, 404 if nothing matched.
  - Client: per-row Delete button (`.btn-danger`); `confirm()`; on success `refresh()`; the 409 message surfaces via the API client's thrown `Error.message`. `deleteCycle(id)` helper added to `db.js`.
- [x] **Task 7 — CSS pass (AC: 9).** New `cy-*` block appended to `admin-layout.css`, all `theme.css` tokens, reusing `.btn-sm`/`.form-input`/`.form-select`. The rewrite removed ALL inline `style=`/`cssText` from the file (was previously ~50 inline styles); a test asserts neither string remains.
- [x] **Task 8 — Smoke / contract.** `server/tests/issue-918-cycle-tab-management.test.js` — 20 source-contract cases (server route auth/guard/404, db.js helpers, view wiring incl. the tracker-reset-gating assertion, CSS classes). All pass. **Live click-through deferred**: the new `DELETE` route won't exist on `dev`'s proxied prod API until merged to `main`, and Angelus can't run a local API — so deleting the two Test Cycles must be verified post-merge.

## Dev Notes

- **Do NOT change `deriveCycleStatus`'s model** — out of scope. The neutral state relies on its existing fallback; just stop writing a `game_phase` value.
- **Tracker reset is load-bearing.** The Game-phase confirm + `apiDelete('/api/tracker_state')` (cycle-views.js:147-154) wipes live vitae/WP/influence for all characters by design. Preserve it exactly; do not let the new "toggle off" path trigger it (clearing phase should NOT reset the tracker — only entering Game phase does).
- **Cycles have no `created_at`** — order/"newest" must use `_id` (server already sorts `_id: -1`).
- **`game_phase: null` vs `$unset`** — `deriveCycleStatus` checks `cycle?.game_phase === 'game'` etc. with strict equality, so a `null` value falls through to the legacy branch correctly. `null` via `$set` is simplest; only reach for `$unset` if a downstream reader treats `null` differently (none found). Flag if you change the server contract.
- **British English** in any user-facing copy. **No em-dashes** in output text. Dots via `'●'.repeat(n)`.
- **Server changes are NOT testable on `dev`** — `dev`'s frontend proxies `/api/*` to the production Render (built from `main`). The new `DELETE` route won't exist on the live API until merged to `main`. Plan QA accordingly (contract test locally; full delete verification post-merge or against a local API).
- The two redundant cycles to delete: `Test Cycle` `game_number: 99` — ids `6a30b3a45aafa000cac30110` and `6a30b3fe8dc95c95e3f1b6f5`. Their *data* removal also overlaps with #823; this story delivers the *capability*.

### Project Structure Notes

- All client work in `public/js/admin/cycle-views.js` + a `deleteCycle` helper (and possibly a `createCycle` extension) in `public/js/downtime/db.js`.
- Server: one new route in `server/routes/downtime.js` (cyclesRouter). No schema change expected (DELETE takes no body).
- New CSS: `public/css/admin-layout.css` (ribbon class + any chip reuse), tokens from `public/css/theme.css`.

### References

- [Source: public/js/admin/cycle-views.js#buildCyclesPanel L388-523, buildPhaseCell L160-201, setGamePhase L147-158, buildChaptersPanel L32-141 (reuse pattern)]
- [Source: public/js/downtime/db.js#createCycle L19, updateCycle L42, deriveCycleStatus L67, getGamePhaseCycle L121]
- [Source: server/routes/downtime.js#parseId L24, post '/' L82, put '/:id' L542, requireOpenCycle L37 (submission-guard precedent)]
- [Source: public/css/admin-layout.css#.btn-sm L195, .dl-status-chip L234, .terr-chip L861]
- Prior art: specs/stories/feature.96.dt-status-ribbon.story.md, specs/stories/dtux-1-phase-ribbon-nav.story.md, specs/stories/issue-231-dt-prep-open-override.story.md (manual_open/phase model)
- Related: #823 (data purge of Test Cycle docs); CYCLE epic #708 (introduced `game_phase`)
- Standards: specs/project-context.md (critical CSS standards), specs/architecture/coding-standards.md (CSS Standards)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (bmad-dev-story)

### Debug Log References

- `npx vitest run tests/issue-918-cycle-tab-management.test.js` → 20/20 pass.
- Regression: `epic.708.1`, `epic.708.2`, `derive-cycle-status`, `api-publish-cycle`, `api-chapters` → 82/82 pass.
- `node --check` clean on `cycle-views.js`, `db.js`, `downtime.js`.

### Completion Notes List

- **Open question resolved (default):** submission-bearing cycles are blocked from deletion server-side (409 `CYCLE_HAS_SUBMISSIONS`). The two live "Test Cycle" docs have zero submissions and will delete cleanly. If Angelus later needs to delete a cycle that has submissions, that's a follow-up (soft-delete/archive or a force flag) — not built here.
- **Tracker-reset safety is the load-bearing invariant.** The clear-to-neutral path deliberately does NOT reset the tracker; only entering Game phase does. A structural test pins `apiDelete('/api/tracker_state')` as occurring only inside the `phaseOrNull === 'game'` branch, so a future edit can't accidentally make "clear phase" wipe live vitae/WP/influence.
- **Full inline-style removal.** The file was entirely inline-styled (`style.cssText` / `style="..."`). The rewrite moved all of it to a normalised `cy-*` CSS block; a test asserts neither `cssText` nor `style="` remains, enforcing AC9 going forward.
- **Server change is not testable on `dev`** (dev proxies `/api/*` to prod Render built from `main`). Contract test covers the route's shape; the actual delete of the two Test Cycles needs verification after merge to `main`.
- Em-dashes in dropdown placeholders ("— none —", "— not linked —") and `${n} — ${label}` were preserved verbatim from the pre-existing UI strings (not new prose).

### File List

- `public/js/admin/cycle-views.js` (rewritten) — ribbon, inline label edit, chapter dropdown, toggleable/neutral phases, add + delete cycle; all inline styles removed.
- `public/js/downtime/db.js` (modified) — `createCycle` accepts `label`/`chapterId`; new `deleteCycle`; `apiDelete` import.
- `server/routes/downtime.js` (modified) — new ST-only `DELETE /api/downtime_cycles/:id` with submission guard.
- `public/css/admin-layout.css` (modified) — new `cy-*` normalised CSS block (ribbon, phase buttons, inline forms, tables) using theme tokens.
- `server/tests/issue-918-cycle-tab-management.test.js` (new) — 20 source-contract cases.
- `specs/stories/issue-918-cycle-tab-management.story.md` — this file.

### Change Log

- 2026-06-20 (DEV): Implemented #918 — Cycle tab full lifecycle management (edit label/chapter, status ribbon, toggleable phases incl. clear-to-neutral, add cycle, delete cycle + server DELETE route). 20 contract tests + 82 regression green.
- 2026-06-20 (QA): Found + fixed High bug in add-cycle chapter picker; added regression test. 21 contract + 103 cycle-area regression green.

## QA Review (Quinn)

**Outcome: PASS (with 1 bug fixed during review).**

### Fixed during QA

- **[High] Add-cycle chapter picker was unusable.** The add form reused `buildChapterSelect({ chapter_id: null }, ...)`, whose change handler persists to an existing cycle via `updateCycle(cy._id, ...)`. With no real cycle, every chapter pick fired `updateCycle(undefined, ...)` → `PUT /api/downtime_cycles/undefined` → 400 → the `catch` reverted the dropdown to "none", so a chapter could never be chosen when adding a cycle (broke AC6). **Fix:** split `buildChapterPicker` (options-only, no handler — used by the add form) from `buildChapterSelect` (row-level, persists on change). Regression test added (`add-cycle form uses the handler-free chapter picker`).

### Documented, not fixed (pre-existing data-hygiene, root cause is the junk Test Cycles — #823, removable via this story's own delete feature)

- **[Low] Ribbon fallback can surface a Test Cycle.** When no cycle has a phase set (e.g. DT4 cleared to neutral), `deriveCurrentCycle`'s "newest non-closed by `_id`" picks a `Test Cycle` (higher `_id`, derives to `prep`). Spec-faithful behaviour; resolves when the two Test Cycle docs are deleted. Not patched with a `game_number===99` filter (hacky).
- **[Low] Add-form Game # prefills to 100.** `max(game_number)+1` = 99+1 because of the Test Cycles. Field is editable; resolves on Test Cycle deletion.

### AC verification

All 9 ACs verified against the code: 1 label inline edit ✓, 2 chapter dropdown ✓ (post-fix), 3 ribbon ✓ (with caveat above), 4 interactive phases + Game confirm ✓, 5 clear-to-neutral + `deriveCycleStatus` fallback ✓, 6 add cycle ✓ (post-fix), 7 delete + submission guard ✓, 8 ST-only DELETE route + 404 + clear error ✓, 9 no inline styles (test-guarded) ✓.

### Tracker-reset safety invariant

Verified: `apiDelete('/api/tracker_state')` sits only inside the `phaseOrNull === 'game'` branch of `writePhase`; clearing a phase or switching to downtime/processing never resets the tracker. Pinned by a structural test.

### Note on live verification

The DELETE route and the live deletion of the two Test Cycles remain verifiable only after merge to `main` (dev proxies `/api/*` to prod). Recommend confirming the delete + the two Low findings clear in the same post-merge smoke.
