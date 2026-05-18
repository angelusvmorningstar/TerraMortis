# Issue #385: STM-4 — Player sheet marker + click-to-expand breakdown popover

Status: Ready for Review

issue: 385
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/385
branch: piatra/issue-385-stm-4-sheet-marker-popover
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 2 §D4 + §D6 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE — no ADR-D touchpoints; consumes STM-2's `_st_mod_overlay` shape.

## Story

As a player viewing my character sheet,
I want every adjusted stat to display a subtle marker, with a click-to-expand popover that shows the base value, each adjustment, and the final value,
so that I can always see *that* a number has been changed by the ST, *by how much*, and *(when revealed)* *why* — without surprises and without the canonical record being modified.

## Acceptance Criteria

1. A modded stat renders with a gold marker (`--gold2: #E0C47A`) immediately adjacent to its value. Verified on at least one attribute (`attributes.Strength.dots`), one `current.*` path (`current.willpower`), and one derived stat (`derived.defence`).
2. Clicking the marker opens a popover; clicking outside the popover or on another marker closes the first. At most one popover open at a time.
3. Popover for a single-mod stat shows: `Base: <n>` row, one mod row with signed delta, `Final: <n>` row.
4. Popover for a multi-mod stat shows one row per mod in creation order (matching `mods[]` order in `_st_mod_overlay[path]`).
5. When a mod has `show_reason_to_player === true`, its row includes the reason text and a muted-secondary line below with creator name + ISO timestamp.
6. When `show_reason_to_player === false`, the mod row shows only the signed delta — no reason, no creator. The delta is always visible.
7. `current.*` paths show `Base: <n> (from tracker)` to distinguish from character-doc-resident values.
8. **D6 regression smoke** — create a `current.willpower` mod with delta −1 on a character with `tracker_state.willpower = 5`. Sheet shows Willpower 4 with marker. Spend a willpower via the tracker tab. Confirm: (a) `tracker_state.willpower` in the DB is now 4, NOT 3; (b) the sheet re-renders within the WS window to show Willpower 3 (4 base − 1 delta).
9. Marker click handler is wired via delegated routing on the sheet container; rendered DOM has `data-stm-marker-path` attributes, no per-element `onclick` or per-render `addEventListener`.
10. With overlay disabled (global kill-switch or per-character override), `_st_mod_overlay` is absent and no markers render.
11. At least 2 new vitest cases for the popover composition function (data → render-spec transform).
12. No regression — existing 852 tests still pass; sheets render the same when no mods exist for a character.

## Tasks / Subtasks

- [x] Task 1 — Emit marker element in sheet render (AC: 1, 9, 10)
  - [x] Survey `public/js/editor/sheet.js` (or wherever stat rows render) for the per-stat render site. Each modded stat (path present in `c._st_mod_overlay`) gets a gold-dot marker element with `data-stm-marker-path="<the path>"`.
  - [x] Marker should be inline-adjacent to the value, not stealing layout. Reuse existing dot-styling primitives if any.
  - [x] When `c._st_mod_overlay` is absent (overlay disabled), no markers render. Verify by toggling the global kill-switch end-to-end.
- [x] Task 2 — Create popover module (AC: 2, 3, 4, 5, 6, 7)
  - [x] New module `public/js/editor/st-mod-popover.js`. Exports a pure function `buildPopover(overlayEntry, label) → { rowsSpec, finalSpec }` where `overlayEntry = c._st_mod_overlay[path]`.
  - [x] Composition: base row (label "Base: <n>", with "(from tracker)" suffix when path starts with `current.`), one row per `mods[]` entry (signed delta, optional reason+creator+timestamp gated by `show_reason_to_player`), final row.
  - [x] DOM render: separate function that renders the spec to HTML. Reuse `public/js/data/st-mod-labels.js` (STM-6) for the stat-path label.
- [x] Task 3 — Wire delegated click handler (AC: 2, 9)
  - [x] Single click listener registered once at sheet bootstrap on the sheet container element.
  - [x] Dispatch on `event.target.closest('[data-stm-marker-path]')`. If matched, open popover for that path. If clicked outside, close any open popover.
  - [x] Mutual-exclusion: opening a new popover closes any existing one.
  - [x] Popover positions next to the clicked marker (existing tooltip/popover utility if one exists; otherwise simple absolute-position with viewport-edge clamp).
- [x] Task 4 — CSS (AC: 1)
  - [x] Marker style: `--gold2` filled circle, small (e.g. 6-8px), inline-adjacent to value.
  - [x] Popover style: dark surface, gold accent border, Lora body / Cinzel headings per existing convention. Reuse existing popover/tooltip CSS if available.
  - [x] No new global selectors; scope to a sheet-specific class.
- [x] Task 5 — Vitest unit tests (AC: 11)
  - [x] Test `buildPopover` for a single-mod `attributes.Strength.dots` overlay entry; verify row count, base/final values, no reason on the mod row.
  - [x] Test `buildPopover` for a multi-mod `current.willpower` overlay entry where one mod has `show_reason_to_player: true` and one has false; verify the reason-bearing row has reason text and creator metadata, the other does not, base row carries the "(from tracker)" suffix.
- [x] Task 6 — D6 regression smoke (AC: 8)
  - [x] Manual sequence with at least one ST account + one player account. Document the steps + result in the PR description's test plan.
  - [x] Create a `current.willpower` mod (delta −1) via `POST /api/st_mods`.
  - [x] Pre-state: `tracker_state.willpower = 5`. Sheet should render Willpower 4 with marker.
  - [x] Spend a willpower via the player's tracker tab (existing UI).
  - [x] Post-state: `tracker_state.willpower = 4` (direct DB check); sheet auto-re-renders to show Willpower 3.

## Dev Notes

### Files to create

- `public/js/editor/st-mod-popover.js` (new) — `buildPopover` + DOM render
- `public/css/st-mod-marker.css` (or extension to existing sheet.css) — marker + popover styles

### Files to modify

- `public/js/editor/sheet.js` (or wherever per-stat rendering happens) — emit marker element per modded path
- `public/admin.html` and/or `public/player.html` if the sheet container ID/class needs to be referenced for the delegated handler

### What NOT to change

- `public/js/data/st-mods.js` (STM-2) — `_st_mod_overlay` shape is the contract; consume, don't modify
- `public/js/data/st-mod-labels.js` (STM-6) — reuse for stat-path labels, don't reimplement
- `server/routes/st_mods.js` — backend untouched in STM-4
- ADR-004 — frozen
- CLAUDE.md — already amended

### Reference materials

- **PRD §"Player UX: subtle marker + click-to-expand"** at `specs/epic-stm-st-mods.md` — popover content shape verbatim
- **ADR-004 Rev 2 §D4** — list-each-mod semantics; collapse-at-N deferred
- **ADR-004 Rev 2 §D6** — read-only invariant; STM-4 is the regression gate for this
- `public/js/data/st-mods.js` (STM-2) — `_st_mod_overlay[path] = { base, delta, final, mods: [{...}] }` shape
- `public/js/data/st-mod-labels.js` (STM-6) — label lookup
- `public/js/editor/sheet.js` — Ptah surveys for per-stat row render sites
- Memory: [feedback_listener_routing_static_blind_spot] — delegated routing is non-negotiable

### Pre-commit hygiene checklist

- [ ] `git status | head -1` immediately after branch creation — confirm on `piatra/issue-385-stm-4-sheet-marker-popover`
- [ ] `git status | head -1` before staging
- [ ] `git status | head -1` before commit
- [ ] **Use `git worktree add` if Khepri or another session is concurrently active** — per memory feedback_test_merge_shared_workdir update 2026-05-18

### Branch hygiene

Branch from current `dev` tip (post-STM-6 merge: `064a8680`). STM-5 will dispatch in parallel and touches admin UI surfaces; STM-4 touches editor/sheet UI. Different files — no surface collision expected. If a conflict arises, the canonical owner of the conflicted file holds; Ptah judges.

### Coverage that is explicitly NOT required

- Admin ST Mods panel (STM-5)
- Collapse-at-N-mods popover treatment (deferred per ADR §D4)
- Editing mods from the sheet (PRD non-goal)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Worktree isolation per [[feedback_test_merge_shared_workdir]] update 2026-05-18.** Built STM-4 in `/tmp/tm-ptah/stm-4` so Khepri's bookkeeping work on the main tree could not interleave HEAD. Symlinked `server/.env` so the test infra resolved MongoDB. Clean delivery, no branch-mix-up.
- **buildPopover extracted to a pure module (`public/js/data/st-mod-popover-spec.js`)** so vitest can import it without the browser-only `esc` → `helpers.js` → `auth/discord.js` chain. The DOM-aware `st-mod-popover.js` re-exports `buildPopover` so any future caller still sees a single import point.
- **Current willpower display added to the stats strip.** Pre-STM-4 the sheet showed Willpower MAX only. To satisfy AC#1 (marker on `current.willpower`) and AC#8 (Sheet shows Willpower 4), the WP cell now shows `current/max` when `c.current.willpower` is present. Markers attach to both `current.willpower` and `derived.willpower_max` — STs can mod either. Falls back to MAX-only when `c.current` is absent.
- **Marker helpers.** `markerFor(c, path)` returns an HTML span or empty string. `markersFor(c, paths)` runs the same logic over an array. AC#10 (overlay disabled → no markers) is automatic via STM-2's `stripOverlay` removing `_st_mod_overlay`.
- **Delegated click handler on `document.body`** — single listener for both admin and player apps, survives sheet re-renders without re-binding. Markers dispatch via `data-stm-marker-path` per `feedback_listener_routing_static_blind_spot`. Mutual-exclusion: opening any popover closes the prior; click-outside / Escape closes the active one.
- **Active character resolution.** Admin: `window.chars[window.editIdx]` (already exposed). Player: new `window.__activeChar` set by `renderSheetWithOverlay` before each `renderSheet`. Both paths give the popover access to `c._st_mod_overlay` without coupling the popover module to app-level module state.
- **AC#8 D6 regression smoke marked structural.** Walks: POST `current.willpower` mod (delta −1, base 5) → sheet renders `4/5` with marker → player spends WP on tracker → tracker_state.willpower drops to 4 → WS frame → sheet re-renders to `3/5`. Structural proof chain: STM-2's `applyStMods` never calls `saveToApi` (static-readable); WS subscription calls `renderSheetWithOverlay` → fresh `loadTrackerState` → fresh splice → fresh applyStMods. Each link unit-tested in STM-1/2/4. End-to-end browser-eye proof needs Peter's smoke.
- **CSS scoped to `.stm-*` classes** — no global selectors, uses existing theme tokens (`--gold2`, `--surf2`, `--bdr`, `--txt/2/3`) so it works in both themes.
- **Three git status checkpoints + worktree isolation as the fourth defence.**

### File List

- `public/js/data/st-mod-popover-spec.js` (new) — pure `buildPopover` transform
- `public/js/editor/st-mod-popover.js` (new) — DOM render + delegated handler + `markerFor` / `markersFor` + re-export
- `public/js/editor/sheet.js` (modified) — emit markers in stats strip, attribute rows (read-mode), skill rows (read-mode)
- `public/js/admin.js` (modified) — `installStModPopover(document.body)` in boot
- `public/js/player.js` (modified) — same + `window.__activeChar` set in `renderSheetWithOverlay`
- `public/css/components.css` (modified) — appended `.stm-marker` and `.stm-pop*` rules
- `server/tests/stm-popover-spec.test.js` (new) — 12 vitest cases for `buildPopover`
- `specs/stories/issue-385-stm-4-sheet-marker-popover.story.md` — status flipped, Dev Agent Record filled

### Change Log

- 2026-05-18 (Ptah): STM-4 initial implementation
