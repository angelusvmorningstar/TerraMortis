# Story Feature.325: Delete Dead Render Functions in downtime-views.js

## Status: ready-for-dev

## Metadata
- issue: 325
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/325
- branch: morningstar-issue-325-delete-dead-render-fns

---

## Story

**As an** ST or developer reading `public/js/admin/downtime-views.js`,
**I want** the nine dead render functions and six dormant #320 blur-save handlers removed,
**so that** the file no longer gives the false impression of a second, panel-based render generation running alongside `renderProcessingMode`.

---

## Background

During issue #320 development, five functions were confirmed dead (defined, never called):
`renderStNotes`, `handleSaveNotes`, `renderApproval`, `handleApproval`, `renderSignOffStep`.
Issue #320 asked the dev agent not to delete them — that's this story.

Issue #325 expands the scope to four more dead functions found during the same audit:
`renderNarrativeStep`, `renderNarrativePanel`, `renderProjectsPanel`, `renderMeritActionsPanel`.

Additionally, issue #320 added six blur-save handlers (`_handleProjNoteBlur`,
`_handleProjWriteupBlur`, `_saveProjField`, `_handleMeritNoteBlur`, `_handleNarrBlur`,
`_findProjStatusEl`) and four focusout delegation branches targeting textareas inside those
dead render functions. Those textareas never render, so the handlers and branches are
unreachable dead code too.

---

## Acceptance Criteria

- [ ] All nine dead functions listed below are removed from `public/js/admin/downtime-views.js`.
- [ ] The six dormant #320 handlers (`_findProjStatusEl`, `_handleProjNoteBlur`, `_handleProjWriteupBlur`, `_saveProjField`, `_handleMeritNoteBlur`, `_handleNarrBlur`) are removed.
- [ ] The four matching focusout delegation branches (`.dt-proj-note`, `.dt-proj-writeup`, `.dt-merit-note`, `.dt-narr-textarea`) at lines ~544–551 are removed.
- [ ] `_setAutosaveStatus` is **kept** — it is called by the live `_handleProcFieldBlur`.
- [ ] `_handleProcFieldBlur` is **kept** — it handles live `.proc-feed-desc-ta`, `.proc-merit-desc-ta`, `.proc-sorc-notes-input` textareas.
- [ ] The three live focusout branches for `_handleProcFieldBlur` (`.proc-feed-desc-ta`, `.proc-merit-desc-ta`, `.proc-sorc-notes-input`) are **kept**.
- [ ] CSS `.dt-autosave-status` in `public/css/admin-layout.css` is **kept** — still used by the live `_handleProcFieldBlur` flow.
- [ ] `node --input-type=module --check < public/js/admin/downtime-views.js` passes (no parse errors).
- [ ] `tests/issue-320-autosave-st-notes.spec.js` still passes (4 tests).
- [ ] `specs/stories/issue-320-autosave-st-notes.story.md` updated to note dormant handlers removed.

---

## Tasks

### Task 1 — Grep-verify zero call sites before touching anything

Before any deletion, confirm each target has zero call sites across `public/`:

```
grep -rn "renderStNotes\|handleSaveNotes\|renderApproval\|handleApproval\|renderSignOffStep\|renderNarrativeStep\|renderNarrativePanel\|renderProjectsPanel\|renderMeritActionsPanel" public/ --include="*.js"
```

Expected: only definition lines in `downtime-views.js`, plus **one** internal call:
`renderNarrativePanel` is called at line ~4459 — but that call is **inside `renderNarrativeStep`** (itself dead at line 4414). Both are dead. This is the only cross-reference between the nine functions and is expected. If any caller appears outside `downtime-views.js`, or inside a live function, stop and report before proceeding.

```
grep -rn "_handleProjNoteBlur\|_handleProjWriteupBlur\|_saveProjField\|_handleMeritNoteBlur\|_handleNarrBlur\|_findProjStatusEl" public/ --include="*.js"
```

Expected: only the definition lines (~2323–2414) and the four focusout branches (~544–551). No other callers.

### Task 2 — Delete the nine dead render functions

Delete each function body (signature through closing brace). Exact current start lines confirmed by grep:

| Function | Start line | Approx lines | Notes |
|---|---|---|---|
| `renderStNotes(s, raw)` | 1705 | 26 | ends ~1730 |
| `handleSaveNotes(subId)` | 1732 | 22 | ends ~1753 |
| `renderApproval(s)` | 1784 | 15 | ends ~1798 |
| `handleApproval(subId, newStatus)` | 1800 | 21 | ends ~1820 |
| `renderSignOffStep()` | 4112 | 73 | find closing `}` — next function follows |
| `renderNarrativeStep()` | 4414 | 55 | find closing `}` — next function follows |
| `renderNarrativePanel(s)` | 9121 | 18 | find closing `}` — next function follows |
| `renderProjectsPanel(s, raw, char)` | 11175 | 118 | find closing `}` — next function follows |
| `renderMeritActionsPanel(s, raw, char)` | 11293 | 118 | find closing `}` — next function follows |

**After each deletion: re-run parse-check** (`node --input-type=module --check < public/js/admin/downtime-views.js`) to catch any brace-mismatch immediately. Do not batch all nine and check at the end.

Any section comments (e.g. `// ── Narrative Step ──`) immediately before a deleted function should also be removed.

### Task 3 — Delete the six dormant #320 handlers

These functions live in a `// ── Issue #320: Autosave ST inputs ──` section starting around line 2315. The section contains:

```
_setAutosaveStatus   ← KEEP (used by live _handleProcFieldBlur)
_findProjStatusEl    ← DELETE (targets .dt-narr-textarea — dead render path)
_handleProjNoteBlur  ← DELETE
_handleProjWriteupBlur ← DELETE
_saveProjField       ← DELETE (shared helper for the two above)
_handleMeritNoteBlur ← DELETE
_handleNarrBlur      ← DELETE
_handleProcFieldBlur ← KEEP (handles live proc* textareas)
```

Delete only the six marked DELETE. Keep `_setAutosaveStatus` and `_handleProcFieldBlur` intact.

Run parse-check after.

### Task 4 — Remove the four dead focusout branches

The `document.addEventListener('focusout', ...)` block around line 544 contains these branches — remove only the four marked DELETE:

```js
// KEEP:
const aqNote = e.target.closest('.dt-action-queue-note-input');
if (aqNote) { _handleActionQueueNoteSave(aqNote); return; }

// DELETE — dead path: .dt-proj-note only renders inside dead renderProjectsPanel
const projNote = e.target.closest('.dt-proj-note');
if (projNote) { _handleProjNoteBlur(projNote); return; }

// DELETE — dead path: .dt-proj-writeup only renders inside dead renderProjectsPanel
const projWriteup = e.target.closest('.dt-proj-writeup');
if (projWriteup) { _handleProjWriteupBlur(projWriteup); return; }

// DELETE — dead path: .dt-merit-note only renders inside dead renderMeritActionsPanel
const meritNote = e.target.closest('.dt-merit-note');
if (meritNote) { _handleMeritNoteBlur(meritNote); return; }

// DELETE — dead path: .dt-narr-textarea only renders inside dead renderNarrativePanel/Step
const narrTa = e.target.closest('.dt-narr-textarea');
if (narrTa) { _handleNarrBlur(narrTa); return; }

// KEEP — live: .proc-feed-desc-ta renders in the live processing queue
const procFeedDesc = e.target.closest('.proc-feed-desc-ta');
if (procFeedDesc) { _handleProcFieldBlur(procFeedDesc, 'description'); return; }

// KEEP — live
const procMeritDesc = e.target.closest('.proc-merit-desc-ta');
if (procMeritDesc) { _handleProcFieldBlur(procMeritDesc, 'description'); return; }

// KEEP — live
const procSorcNotes = e.target.closest('.proc-sorc-notes-input');
if (procSorcNotes) { _handleProcFieldBlur(procSorcNotes, 'sorc_notes'); return; }
```

Also update or remove the comment block above these four branches if it only explains the deleted handlers. The comment above the live proc* branches (`// Issue #320 (third pass): live processing-queue description textareas.`) should be kept.

Run parse-check after.

### Task 5 — Run verification tests

```
npx playwright test tests/issue-320-autosave-st-notes.spec.js --reporter=line
```

All 4 tests must pass. If any fail, the live `_handleProcFieldBlur` handler or its focusout branches were accidentally touched — investigate before proceeding.

### Task 6 — Update issue-320 story file

In `specs/stories/issue-320-autosave-st-notes.story.md`, add a note under the Dev Agent Record section recording that the dormant handlers added in that story were subsequently removed in issue #325. A one-line addition to the Change Log is sufficient:

```
- **2026-05-17 (issue #325 follow-up)** — Dormant second-pass handlers removed: `_findProjStatusEl`, `_handleProjNoteBlur`, `_handleProjWriteupBlur`, `_saveProjField`, `_handleMeritNoteBlur`, `_handleNarrBlur` and their four focusout branches. `_handleProcFieldBlur` and `_setAutosaveStatus` kept (live).
```

---

## Dev Notes

### The two-generation confusion this story resolves

`downtime-views.js` currently reads as if two render generations coexist:

1. **Queue-based (live):** `renderProcessingMode()` → action queue → processing cards → `_handleProcFieldBlur` for blur-save
2. **Panel-based (dead):** `renderProjectsPanel`, `renderMeritActionsPanel`, `renderNarrativePanel`, `renderStNotes`, `renderApproval`, etc.

Only generation 1 runs. Generation 2 was superseded at some point and its functions were never deleted. The dead code is the source of the false impression that there is a second live render path.

### Why the #320 handlers are also dead

The four focusout branches (`dt-proj-note`, `dt-proj-writeup`, `dt-merit-note`, `dt-narr-textarea`) can only trigger if the matching CSS class exists in the DOM. Those classes are only rendered by the dead panel functions:
- `.dt-proj-note` / `.dt-proj-writeup` — inside `renderProjectsPanel` (dead at line 11175)
- `.dt-merit-note` — inside `renderMeritActionsPanel` (dead at line 11293)
- `.dt-narr-textarea` — inside `renderNarrativePanel` (dead at line 9121) and `renderNarrativeStep` (dead at line 4414)

Since these render functions never execute, these DOM elements never exist, so the focusout branches never fire, and the handler functions are unreachable.

### What stays and why

| Name | Keep | Reason |
|---|---|---|
| `_setAutosaveStatus` | YES | Called by `_handleProcFieldBlur` (live) |
| `_handleProcFieldBlur` | YES | Handles `.proc-feed-desc-ta` / `.proc-merit-desc-ta` / `.proc-sorc-notes-input` — rendered by live processing cards, wired via live focusout branches |
| 3 proc* focusout branches | YES | Target live textareas in the processing queue |
| CSS `.dt-autosave-status` | YES | Used by status spans in live processing cards |
| `_handleCourtPulseSave` | YES | Live, manual-button-driven save. Not in scope (see issue #324) |

### Finding function end boundaries

For the large functions (`renderSignOffStep`, `renderNarrativeStep`, `renderNarrativePanel`, `renderProjectsPanel`, `renderMeritActionsPanel`), the reliable approach:

1. Go to the start line (grep gives this).
2. Search forward for the next `^function ` or `^async function ` or `^// ──` section comment at column 0.
3. The line before that is where the deleted function ends.

Do NOT rely solely on approximate line counts from the issue — the file may have shifted since the issue was written. Always read a few lines before and after to confirm you have the right boundary.

### Parse-check command

```sh
node --input-type=module --check < public/js/admin/downtime-views.js
```

This mirrors the `.githooks/pre-commit` hook. Run it after each task (not just at the end). A brace-mismatch in an 11,500-line file is painful to debug if you batch-delete nine functions before checking.

### No CSS changes required

CSS `.dt-autosave-status` is **kept**. The proc* blur-save flow still uses it. No changes to `public/css/admin-layout.css`.

### No server changes

This is a pure frontend deletion. No API, no schema, no server/ changes.

---

## Dev Agent Record

### Implementation Plan

Pure deletion across one file. Eight logical steps: grep-verify → delete 9 dead render fns (one parse-check each) → delete 6 dormant handlers → remove 4 focusout branches → run Playwright spec → update #320 story.

### Debug Log

_(empty — fill during implementation)_

### Completion Notes

_(empty — fill during implementation)_

## File List

- `public/js/admin/downtime-views.js`
- `specs/stories/issue-320-autosave-st-notes.story.md`

## Change Log

- feat(#325): story created 2026-05-17
