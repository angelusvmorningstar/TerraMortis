# Issue #320: Autosave ST notes on DT Processing panel

Status: review

issue: 320
issue_url: https://github.com/angelusvmorningstar/issue-320
branch: morningstar-issue-320-autosave-st-notes

## Story

As an ST processing downtimes in the admin DT Processing panel,
I want the per-project ST note, per-project writeup, per-merit-action ST note, and narrative-block textareas to save my typing automatically,
so that any DOM re-render (after Roll, after deadline change, after approval toggle, after page reload, after navigating between cards) can no longer wipe my in-flight ST work.

This bug was reported as "ST notes were wiped" by the ST team after a deploy. The team manually rewrote the lost notes. **Initial diagnosis pointed at `renderStNotes`/`renderApproval` at downtime-views.js:1664/1743, but those functions are dead code (defined but never called)**. The actual wipe surface is four live textareas in DT Processing that render with full CSS styling but have no event listener — they pre-fill from saved values (creating the illusion of persistence) but every keystroke sits in DOM state only and is destroyed on the next re-render. Rescope confirmed 2026-05-17.

## Acceptance Criteria

1. **Per-project ST note autosave**: Given an ST types into a `.dt-proj-note` textarea (`public/js/admin/downtime-views.js:10972`), When the textarea loses focus, Then `projects_resolved[projIdx].st_note` is updated and persisted via `updateSubmission(subId, { projects_resolved })` — without overwriting other fields of that resolved entry (action_type, pool, roll, writeup, resolved_at).

2. **Per-project writeup autosave**: Given an ST types into a `.dt-proj-writeup` textarea (line 10976), When the textarea loses focus, Then `projects_resolved[projIdx].writeup` is updated and persisted via the same `updateSubmission` patch — same non-clobber rule.

3. **Per-merit-action ST note autosave**: Given an ST types into a `.dt-merit-note` textarea (line 11086), When the textarea loses focus, Then `merit_actions_resolved[meritIdx].st_note` is updated and persisted via `updateSubmission(subId, { merit_actions_resolved })` — same non-clobber rule.

4. **Narrative block autosave**: Given an ST types into a `.dt-narr-textarea` textarea (line 8892), When the textarea loses focus, Then `st_narrative[blockKey].text` is updated and persisted via `updateSubmission(subId, { ['st_narrative.' + blockKey + '.text']: text })` — `status` field on the same block is untouched (it has its own draft/ready button-driven save path at lines 8889-8890).

5. **Save indicator**: For each of the four textareas, Given an autosave is in flight, Then a status indicator near the textarea shows "Saving…" → "Saved ✓" (auto-clears after ~1500ms) or "Save failed" on error. A single shared CSS class (e.g. `.dt-autosave-status`) used by all four sites.

6. **Pre-render flush safety net**: Given an ST has typed into any of the four textareas and any control triggers `renderSubmissions()` (Roll buttons, approval toggles, etc.), Then the typed content survives the re-render — either because focusout fires before the DOM is replaced (default browser behaviour when the focused element is removed) or because a manual flush is called before re-render.

7. **No regression on save targets**: Given an existing saved value at `projects_resolved[i].st_note`, `projects_resolved[i].writeup`, `merit_actions_resolved[i].st_note`, or `st_narrative[blockKey].text`, When the panel first renders, Then the textarea pre-fills exactly as today (no regression on the existing read path).

8. **Resolved-entry creation is safe**: Given `projects_resolved[projIdx]` does not yet exist (the project hasn't been Rolled yet), When an ST types into the ST note for that project and blurs, Then an entry is created at that index with at minimum the typed `st_note` value — without faking other required fields. Use the same shape `handleProjectRollSave` uses (`action_type: ((sub._raw || {}).projects || [])[projIdx]?.action_type || ''`, `pool: null`, `roll: null`, `st_note: <typed>`, `resolved_at: null`) but without setting `resolved_at` (the project isn't resolved by typing alone).

9. **Court Pulse, Resolution Note (dead), ST Notes (dead) — verify, don't fix**: Verify during implementation that:
   - `_handleCourtPulseSave` at `downtime-views.js:2091` has only a button-driven save (no autosave). Same pattern, separate concern. File a follow-up issue post-implementation.
   - `renderStNotes` (1664), `renderApproval` (1743), `renderSignOffStep` (3876), `handleSaveNotes` (1691), `handleApproval` (1759) are dead code — no call sites anywhere in `public/`. Note this in Completion Notes and file a follow-up cleanup issue ("Delete dead renderStNotes/renderApproval/renderSignOffStep blocks in downtime-views.js"). Do NOT delete them in this story — separate change, separate review.

## Tasks / Subtasks

- [x] **Task 1 — Extend the existing focusout event delegation** (AC: 1, 2, 3, 4)
  - [x] Locate the existing focusout listener at `public/js/admin/downtime-views.js:524-527` (DTIL-2 Action Queue note save). This is the canonical pattern.
  - [x] Add four more branches to the same listener, in order:
    - `.dt-proj-note` → `_handleProjNoteBlur(ta)`
    - `.dt-proj-writeup` → `_handleProjWriteupBlur(ta)`
    - `.dt-merit-note` → `_handleMeritNoteBlur(ta)`
    - `.dt-narr-textarea` → `_handleNarrBlur(ta)`
  - [x] All branches use `e.target.closest('.<class>')` matched in order; each returns after handling.

- [x] **Task 2 — Implement `_handleProjNoteBlur` and `_handleProjWriteupBlur`** (AC: 1, 2, 7, 8)
  - [x] Read `data-sub-id` and `data-proj-idx` from the textarea.
  - [x] Find `sub = submissions.find(s => s._id === subId)`. If not found, return silently.
  - [x] Clone `resolved = [...(sub.projects_resolved || [])]`. Pad to length with `null` until `resolved[projIdx]` exists. Stub shape matches the precedent at `handleProjectRollSave`.
  - [x] Set the appropriate field (`st_note` or `writeup`) via `{ ...existing, [field]: newVal }` partial-update merge. Preserves all other fields.
  - [x] Status span flashes "Saving…" → "Saved ✓" (clear after 1500ms) / "Save failed" on error.
  - [x] No `renderSubmissions()` call after save — confirmed; only the in-memory mirror is updated.
  - [x] No-op guard: skips the API call if the textarea value already matches the saved value.
  - [x] Implemented as a single `_saveProjField(ta, field)` helper shared by both blur handlers (reduces duplication).

- [x] **Task 3 — Implement `_handleMeritNoteBlur`** (AC: 3, 7, 8)
  - [x] Same shape as Task 2 but operates on `merit_actions_resolved` and `data-merit-idx`.
  - [x] Stub shape: `{ action_type: '', pool: null, roll: null, st_note: '', resolved_at: null }` (no writeup field in merit_actions_resolved per schema).
  - [x] `await updateSubmission(subId, { merit_actions_resolved: resolved })`.
  - [x] No `renderSubmissions()` after save.
  - [x] No-op guard included.

- [x] **Task 4 — Implement `_handleNarrBlur`** (AC: 4, 7)
  - [x] Reads `data-sub-id` and `data-block-key`.
  - [x] Dotted patch: `updateSubmission(subId, { ['st_narrative.' + blockKey + '.text']: newText })` — no `.trim()` so narrative whitespace is preserved.
  - [x] In-memory mirror updates only `.text`; the `.status` field owned by the Draft/Ready buttons is untouched.
  - [x] Status span lifecycle wired same as the other three.
  - [x] No-op guard against re-saving unchanged content.

- [x] **Task 5 — Add status spans to the four render sites** (AC: 5)
  - [x] `.dt-proj-note` site: status span inserted immediately after the textarea, keyed on `data-sub-id` + `data-proj-idx`.
  - [x] `.dt-proj-writeup` site: status span keyed on `data-sub-id` + `data-proj-idx` + `data-field="writeup"` to distinguish from the note span.
  - [x] `.dt-merit-note` site: status span keyed on `data-sub-id` + `data-merit-idx`.
  - [x] `.dt-narr-textarea` site: status span keyed on `data-sub-id` + `data-block-key`.
  - [x] Handlers locate their status element via matching `data-*` query selectors.

- [x] **Task 6 — Minimal CSS for `.dt-autosave-status`** (AC: 5)
  - [x] Added to `public/css/admin-layout.css` directly after the `.dt-notes-*` block — same neighbourhood, easy to find.
  - [x] Confirmed `--gold3` and `--crim` tokens exist (75 combined uses in the file).
  - [x] Four selectors total: base state (muted italic), `[data-state="saving"]`, `[data-state="saved"]`, `[data-state="error"]`.

- [x] **Task 7 — Verify Court Pulse parity + dead-code follow-ups** (AC: 9)
  - [x] Verified `_handleCourtPulseSave` at line 2091 — still manual-button-only.
  - [x] Verified `renderStNotes`/`renderApproval`/`renderSignOffStep`/`handleSaveNotes`/`handleApproval` — still dead. Zero call sites across `public/`.
  - [x] Follow-up issues to file (deferred to user's next session via `tm-gh-issue-create`):
    - "Autosave Court Pulse synthesis (`st_court_synthesis_draft`)"
    - "Delete dead `renderStNotes`/`renderApproval`/`renderSignOffStep`/`handleSaveNotes`/`handleApproval` from downtime-views.js (~120 lines)"
  - [x] **Additional non-clobber fix included** beyond original task scope: `handleProjectRollSave` (line 10985) and `handleMeritRollSave` (line 11221) both previously replaced the entire resolved entry on Roll, which would have wiped the new autosaved `writeup` field. Both now use `{ ...existing, action_type, pool, roll, st_note, resolved_at }` merge with `existing.st_note || pending.st_note` to prefer the autosaved value. Necessary to satisfy AC #8 (race-against-Roll preserves typed content).

- [x] **Task 9 — Third-pass: live processing-queue textareas** (added during QA discovery; prevention focus)
  - **Discovery**: Tasks 1-7 targeted four textareas all in dead code paths (`renderProjectsPanel`, `renderMeritActionsPanel`, `renderNarrativeStep`/`renderNarrativePanel` — all defined but never called). Implementation is correct but dormant. Three additional LIVE textareas in the processing queue lacked any autosave: `.proc-feed-desc-ta` (feeding + project contexts), `.proc-merit-desc-ta`, `.proc-sorc-notes-input`. Each had button-driven save only via "Save card" buttons, so typed-but-not-clicked content was lossy on re-render — same wipe mechanism as the originally-described bug.
  - [x] Added 3 more focusout branches (`.proc-feed-desc-ta` / `.proc-merit-desc-ta` / `.proc-sorc-notes-input`) to the same delegation block at `downtime-views.js:524`.
  - [x] Added shared `_handleProcFieldBlur(ta, field)` handler in the same `// ── Issue #320 ──` section. Reuses canonical TM `saveEntryReview(entry, { [field]: value })` flow (same precedent as `.proc-player-note-input` at line 5082).
  - [x] Added 4 status spans to the 4 markup sites (the two `.proc-feed-desc-ta` contexts both got spans). Spans keyed by `data-proc-key` + `data-field` to avoid cross-card collisions.
  - [x] No-op guard included: handler returns early if textarea value matches saved value.
  - [x] **Behaviour shift documented**: typing into a description and clicking "Cancel" now PRESERVES the typed content (because blur saves on focus shift to Cancel button). Previously Cancel discarded. Aligned with prevention goal — user-typed content is never silently lost. Cancel button is now "close editor, keep content" rather than "discard".
  - [x] Parse-check clean after all edits.

- [x] **Task 10 — Playwright spec** (added during Quinn QA, automated coverage)
  - `tests/issue-320-autosave-st-notes.spec.js` (4 tests, run-time ~12s on chromium).
  - Coverage:
    1. Project description blur-save fires PUT with `{ projects_resolved: [{ description: ..., <preserved fields> }] }` — exercises the non-clobber merge by seeding the resolved entry with action_type / pool_status / pool_validated / notes_thread and asserting all four survive.
    2. Cancel button preserves typed content via blur (regression check for the behaviour shift).
    3. Status span flashes "Saved ✓" after successful save.
    4. No-op guard: blur with unchanged value does NOT fire a PUT.
  - All 4 pass first run after one setup-helper iteration (action row needed explicit click to expand action-detail before the desc card became visible).
  - Other live contexts (`.proc-feed-desc-ta` feeding, `.proc-merit-desc-ta`, `.proc-sorc-notes-input`) flow through the same shared `_handleProcFieldBlur` handler that the project context exercises — covered by the test of that shared path.

- [ ] **Task 8 — Manual browser verification** (AC: 1-9) — **awaiting final ST confirmation in real admin UI**
  - Automated layer above covers the contract. Manual verification by the ST in the live admin UI is still the final acceptance step — particularly to confirm the Cancel-preserves-content behaviour shift is comfortable in practice.
  - Quick manual matrix:
    - Project description card: type → click elsewhere → "Saved ✓" → reload → persists.
    - Feeding description card: same on a feeding queue row.
    - Merit description card: same on a merit/sphere/contact row.
    - Sorcery notes: same on a sorcery row.
    - Cancel-preserves: type → click Cancel → reload → content still there.
  - [ ] Open admin DT Processing on a test cycle. Pick a submission with both a project and a merit action.
  - [ ] **Per-project ST note**: type two sentences into the `.dt-proj-note` textarea. Click anywhere outside (the writeup, the merit note, the page background). Confirm "Saving…" → "Saved ✓" appears. Reload the page. Confirm the note is still there.
  - [ ] **Per-project writeup**: same test on `.dt-proj-writeup`.
  - [ ] **Per-merit ST note**: same test on `.dt-merit-note`.
  - [ ] **Narrative block**: same test on `.dt-narr-textarea`.
  - [ ] **Pre-existing entry preserved**: open a project that's already been Rolled (has a saved roll). Type a new ST note. Blur. Confirm:
    - "Saved ✓" appears,
    - the roll badge is still visible,
    - reloading the page shows both the new ST note AND the original roll (verify the non-clobber rule).
  - [ ] **Not-yet-resolved project**: open a project that hasn't been Rolled (no roll badge). Type an ST note. Blur. Confirm the note is saved but the project still shows as not rolled (no `resolved_at`, no roll badge). Click Roll. Confirm both the roll and the previously-typed ST note are persisted.
  - [ ] **Race against re-render**: type into a `.dt-proj-note`, then *without clicking elsewhere* click the project's "Roll" button. Confirm:
    - the roll fires (you see a roll result),
    - the ST note you typed is NOT lost (it's been merged into `_proj_pending` or saved separately, then preserved through the post-Roll re-render).

## Dev Notes

### Existing canonical TM autosave pattern (USE THIS — same file)

`public/js/admin/downtime-views.js:5080-5088` already implements blur-save for an analogous per-action textarea (`.proc-player-note-input` → `saveEntryReview(..., { player_facing_note: ta.value.trim() })`). The patrol-observed textarea (line 5562), rumour-content textarea (line 5610), and ritual-note textarea (line 5662) follow the same shape. **All use direct per-element `.addEventListener('blur', ...)` wired after each render via `container.querySelectorAll(...)` loops.**

Two implementation options for the new handlers:

**Option X — Direct per-element wiring (matches existing TM patterns in this file)**: Add four `container.querySelectorAll('.dt-proj-note').forEach(ta => ta.addEventListener('blur', ...))` loops in the same place where the other `proc-*` textarea handlers are wired (somewhere around line 5080-5670). Pro: consistent with existing TM patterns. Con: re-wires after every render, has to be re-located inside the right re-render path.

**Option Y — Document-level focusout delegation (matches DTIL-2 pattern at line 524)**: Extend the existing `document.addEventListener('focusout', ...)` listener at line 524 with four more branches. Pro: wired once, never needs re-attachment, survives any re-render. Con: slight pattern split (most textarea blur handlers in this file use Option X, but Option Y has precedent at line 524 for the action queue note input — exactly the same kind of blur-save).

**Recommended: Option Y.** Document-level delegation is more robust for this specific bug (the whole point is to survive aggressive re-renders), and has precedent in the same file. The story tasks above describe Option Y.

### Why the four textareas aren't already wired

This is dead/incomplete legacy code. The textareas were rendered at some point with the expectation that a save mechanism would be added later, but the save mechanism never landed. There's no comment indicating intent, no TODO, no half-wired handler. They've been silently lossy since they were introduced.

`handleProjectRollSave` (line 10985) and `handleMeritRollSave` (line 11095) save `st_note: pending.st_note || ''` from `_proj_pending` / `_merit_pending`, but those in-memory pending objects are *never* updated from the textareas' DOM values. So clicking Roll on a project actually saves an empty `st_note`, *blanking any typed value*. This is itself a regression case — typing then clicking Roll explicitly wipes the note. The fix in this story closes that gap because the focusout will fire (focused element removed when Roll triggers a re-render) and the save will land before Roll's save does.

### `updateSubmission` API contract

From `public/js/admin/downtime/db.js` — already imported at `downtime-views.js:8`. Signature:

```js
updateSubmission(submissionId, patch) // → Promise<updatedDoc>
```

PUTs to `/api/downtime_submissions/:id` with the patch body. Schema (`server/schemas/downtime_submission.schema.js`) already permits all four target fields. Dotted-key patches (e.g. `'st_narrative.letter_from_home.text'`) are supported by the existing API — see DT Story's `saveNarrativeField` at `downtime-story.js:312` for precedent.

### Non-clobber pattern

The `projects_resolved` and `merit_actions_resolved` arrays carry multiple fields per entry. A blur on the ST note must not destroy the saved roll, action_type, etc. The pattern: clone the array, find/create the indexed entry, mutate ONLY the target field, save the whole array back. See `handleProjectRollSave:10985-11007` for the existing precedent of replacing a single resolved entry while preserving array shape.

### Files Touched

- `public/js/admin/downtime-views.js` — primary file.
  - Line 524 area: extend focusout delegation with four branches.
  - Lines 8892, 10972, 10976, 11086: add `<span class="dt-autosave-status">` after each textarea.
  - New handler functions (place near existing focusout handlers, around line 530, or near the dead code as a separate section with a clear `// ── Issue #320: Autosave ST inputs ──` header).
- `public/css/admin-layout.css` — one new rule for `.dt-autosave-status` (~5 lines).
- **No** changes to `server/`.
- **No** schema changes.

### Out of scope (do NOT bundle)

- Court Pulse synthesis (`_handleCourtPulseSave`, line 2091) — Task 7 verifies and files follow-up.
- Dead code (`renderStNotes`/`renderApproval`/`renderSignOffStep`/`handleSaveNotes`/`handleApproval`) — Task 7 verifies and files follow-up. Don't delete here.
- The cycle resolver bug (issue #321) — separate branch, separate scope.
- DT Story rail character_name fallback (issue #322) — separate.
- Engine domain tracker textareas — different code paths entirely.

### Testing standards

Per CLAUDE.md: "No test framework. Verify changes manually in-browser." Task 8 manual matrix is the test bar. The git pre-commit hook (`.githooks/`) will run a parse-check on staged JS — must pass.

### Deployment notes

- Branch: `morningstar-issue-320-autosave-st-notes` (already checked out).
- Per CLAUDE.md HARD RULE: do NOT push to origin or merge to main without explicit instruction. Commit → PR → wait for ST signoff.

### Risk assessment

**Risk: low-to-medium.** Mostly additive — four new event-listener branches plus four new handler functions plus four status spans plus one CSS rule. The main risk surface is the non-clobber pattern in `projects_resolved` / `merit_actions_resolved`: a bug in the array-merge could overwrite a saved roll. Task 8 verification specifically tests this (the "Pre-existing entry preserved" matrix item). Mitigated by reading carefully from `handleProjectRollSave:10992-10998` (the existing precedent shape) and never touching fields the handler isn't supposed to.

## Dev Agent Record

### Agent Model Used

Claude Opus 4.7 (claude-opus-4-7) — dev cycle 2026-05-17

### Debug Log References

- Parse-check via `node --input-type=module --check < public/js/admin/downtime-views.js` → OK (mirrors the `.githooks/pre-commit` hook). Run 2026-05-17 post-edit.

### Completion Notes List

**Rescope record (2026-05-17, story-creation phase):**

The original story scope referenced `renderStNotes`/`renderApproval`/`renderSignOffStep` in `downtime-views.js` (lines 1664/1743/3876). During the dev-story discovery phase, all three were confirmed to be **dead code** — defined but never called anywhere in `public/`. Their handlers (`handleSaveNotes`, `handleApproval`, `proc-signoff-ready-btn`) have zero `addEventListener` matches.

The actual ST-notes wipe surface is four LIVE textareas in DT Processing that render with CSS styling but have no event listener of any kind:
- `.dt-proj-note` (line 10972) — per-project internal ST note
- `.dt-proj-writeup` (line 10976) — per-project player-visible writeup
- `.dt-merit-note` (line 11086) — per-merit-action ST note
- `.dt-narr-textarea` (line 8892) — narrative blocks

The pre-fill at render creates the illusion of persistence (`const note = res?.st_note || pen.st_note || ''`); the wipe happens because nothing reads from the textarea on its way out. `handleProjectRollSave` even actively clobbers typed values by saving `pending.st_note` (always empty) on Roll.

The ST team reported the wipe after a deploy on or around 2026-05-16 and manually rewrote the lost notes. Cycle 3 backup JSON (`backup_downtime_3_2026-05-16.json`) confirmed `st_notes_len: 0` across all 28 submissions, consistent with the wipe.

**Implementation notes (2026-05-17):**

- The four blur handlers are wired via a single `document.addEventListener('focusout', ...)` delegation at `downtime-views.js:524` — extending the existing DTIL-2 Action Queue note pattern. Document-level delegation chosen over per-element wiring so the handlers survive aggressive re-renders without needing re-attachment.
- `_handleProjNoteBlur` and `_handleProjWriteupBlur` share a `_saveProjField(ta, field)` helper to reduce duplication; same partial-update merge pattern. The merit handler doesn't share because the array key and stub shape differ.
- `_setAutosaveStatus(statusEl, state)` is the single status-span lifecycle helper. The 1500ms auto-clear on "saved" uses a guarded setTimeout that checks `dataset.state === 'saved'` before clearing — so a fresh save mid-clear doesn't get blanked.
- **Extra non-clobber fix included**: `handleProjectRollSave` (line 10985) and `handleMeritRollSave` (line 11221) both used to *replace* the resolved entry on Roll, which would have wiped the autosaved `writeup` field. Both now use `{ ...existing, ... }` merge with `existing.st_note || pending.st_note` so an autosaved value wins over the (always-empty) pending value. This is necessary to satisfy AC #8 — without it, typing a writeup then Rolling would discard the writeup.
- `_handleNarrBlur` uses a dotted-key patch (`'st_narrative.' + blockKey + '.text'`) rather than full-object replacement, so the per-block `status` field (owned by the Draft/Ready buttons at lines 8889-8890) is left strictly alone.

**Follow-up issues to file after manual verification passes:**
- "Delete dead `renderStNotes`/`renderApproval`/`renderSignOffStep`/`handleSaveNotes`/`handleApproval` from downtime-views.js (~120 lines)" — to be filed by user via `tm-gh-issue-create`.
- "Autosave Court Pulse synthesis (`st_court_synthesis_draft`)" — same. `_handleCourtPulseSave` at line 2091 confirmed manual-button-only during this session.

### File List

- `public/js/admin/downtime-views.js` — modified:
  - Line 524-538 (was 524-527): focusout listener extended with four new branches.
  - New section ~line 2278-2390 (after `_handleActionQueueNoteSave`): `_setAutosaveStatus`, `_findProjStatusEl`, `_handleProjNoteBlur`, `_handleProjWriteupBlur`, `_saveProjField`, `_handleMeritNoteBlur`, `_handleNarrBlur` — wrapped in `// ── Issue #320: Autosave ST inputs ──` header/footer.
  - Line ~8893 (was 8892): `<span class="dt-autosave-status" data-sub-id data-block-key>` inserted after `.dt-narr-textarea`.
  - Line ~10973 (was 10972): same after `.dt-proj-note`.
  - Line ~10977 (was 10976): same after `.dt-proj-writeup` (with `data-field="writeup"` to distinguish).
  - Line ~11091 (was 11086): same after `.dt-merit-note`.
  - `handleProjectRollSave` (~line 10985): preserved-existing-fields merge.
  - `handleMeritRollSave` (~line 11221): preserved-existing-fields merge.
- `public/css/admin-layout.css` — modified:
  - New `.dt-autosave-status` rule block inserted after `.dt-notes-xp` (line ~2375). Four selectors covering base state + saving/saved/error data-state variants.
- `tests/issue-320-autosave-st-notes.spec.js` — new (4 Playwright tests, all passing in ~12s).

## Change Log

- **2026-05-17 — Rescoped during dev-story discovery.** Original references to `renderStNotes`/`renderApproval` removed; story now targets the four live unwired textareas. AC count expanded from 8 → 9; tasks restructured 5 → 8. GitHub issue body updated to match.
- **2026-05-17 — Implementation complete.** Four blur-save handlers wired via document-level focusout delegation. Status spans + CSS added. Non-clobber merge applied to `handleProjectRollSave` and `handleMeritRollSave` to satisfy race-against-Roll AC. Parse-check clean. Status → review pending manual browser verification (Task 8).
- **2026-05-17 (third pass) — Live coverage added during Quinn QA discovery.** QA found the second-pass surfaces (`renderProjectsPanel`, `renderMeritActionsPanel`, `renderNarrativeStep`→`renderNarrativePanel`) are all dead code, making those 4 handlers dormant. Added 3 more blur-save branches for live processing-queue textareas (`.proc-feed-desc-ta` ×2 contexts, `.proc-merit-desc-ta`, `.proc-sorc-notes-input`) via shared `_handleProcFieldBlur(ta, field)` using canonical `saveEntryReview` flow. 4 status spans added to live markup. **Behaviour shift**: typing in a card description then clicking Cancel now preserves content (was discarded before) — aligned with prevention goal. Parse-check clean. Dormant second-pass code retained as defence-in-depth if those render functions revive.
- **2026-05-17 (Playwright spec) — Automated coverage added.** `tests/issue-320-autosave-st-notes.spec.js` with 4 tests: blur-save dispatches with non-clobber merge, Cancel-preserves-content, status-span lifecycle, no-op guard. All 4 pass in ~12s on chromium. Test stub follows the issue-317 pattern (localStorage auth + page.route API mocking). Other live contexts (feeding/merit/sorcery) exercise the same shared `_handleProcFieldBlur` handler so the project-context tests provide functional coverage by proxy.

## Change Log

- **2026-05-17 — Rescoped during dev-story discovery.** Original references to `renderStNotes`/`renderApproval` removed; story now targets the four live unwired textareas. AC count expanded from 8 → 9; tasks restructured 5 → 8. GitHub issue body updated to match.
