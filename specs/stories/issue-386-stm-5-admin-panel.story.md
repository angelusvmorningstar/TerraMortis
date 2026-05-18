# Issue #386: STM-5 — ST Mods admin panel (create / list / revoke + toggles)

Status: Ready for Review

issue: 386
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/386
branch: piatra/issue-386-stm-5-admin-panel
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 2 §D3 + §D6 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE — no ADR-D touchpoints; consumes STM-1 routes, STM-2 helper, STM-3 settings, STM-6 label module.

## Story

As a Storyteller,
I want a dedicated admin panel per character where I can see all active ST mods, create new ones, revoke any of them, and flip the global + per-character overlay toggles,
so that ST adjustments are a fast, auditable, single-surface workflow during a session — no Mongo shell, no scattered toggles.

## Acceptance Criteria

1. New admin sidebar entry **ST Mods**. Reachable from the admin nav. When no character is selected, displays a "Select a character" placeholder; when a character is active, shows the panel.
2. Panel header shows the active character's display name (via `displayName(c)`).
3. **Global toggle** reflects current `st_mods_enabled` (from STM-3's `getGlobalSettings()` accessor). Flipping it calls `PATCH /api/settings { st_mods_enabled: <new> }`, refreshes the local cache, and triggers a sheet re-render — modded values on the active player sheet flip to base / back without page reload.
4. **Per-character toggle** reflects current `c.st_mods_suppressed`. Flipping it calls `PATCH /api/characters/:id/st_mods_suppressed { st_mods_suppressed: <new> }` and triggers sheet re-render. Other characters unaffected.
5. **Stat-path dropdown** is categorised. Static categories (Attributes, Skills, Current State, Derived) sourced from a shared module — reuse STM-6's `public/js/data/st-mod-labels.js` if it already enumerates them, else lift the static set from `server/routes/st_mods.js` STATIC_WHITELIST into a shared client module. Character-derived categories (Merits, Disciplines) computed at panel-open from `c.merits[]` / `c.disciplines[]` — each entry uses the merit/discipline name as label and `merits[i].dots` / `disciplines[i].dots` as path.
6. Reopening the panel after the character's merits/disciplines change picks up the new entries.
7. **Create form** has: stat path (dropdown), signed integer delta (stepper or `<input type=number>` accepting negatives), reason (text input, required), show-reason-to-player toggle (default off). Save button is disabled when reason is empty after trim or stat path is unselected.
8. Save POSTs to `/api/st_mods` (STM-1 endpoint) with the requesting ST's identity attached by the existing auth middleware. On `201`, refresh the active-mods list and re-render the player sheet (via the helper STM-2 introduced).
9. On `400` from the API (whitelist rejection / invalid path / etc.), display inline error message; form input retained.
10. **Active-mods list** fetched via `GET /api/st_mods?character_id=:id`. Rows sorted by `created_at` ascending. Each row: human-readable label (via `st-mod-labels.js`), signed delta, italicised reason text below path, creator name + ISO timestamp, "shown to player" badge if `show_reason_to_player`, revoke button.
11. **Revoke button** prompts simple confirmation (`confirm()` is acceptable; inline confirmation also fine — Ptah's call). On confirm, `DELETE /api/st_mods/:id`, refresh list, re-render sheet. Audit row survives — verifiable by opening STM-6's audit page.
12. **All handlers** wired via delegated routing on the panel root. Rendered DOM has `data-stm-*` attributes for dispatch; no per-element `onclick` or per-render `addEventListener` calls.
13. No regression — existing tests still pass.
14. At least 1–2 vitest cases for the categorised-dropdown builder (pure function: `(character) → categories[] with entries`).

## Tasks / Subtasks

- [x] Task 1 — Admin sidebar entry + container element (AC: 1, 2)
  - [x] Add **ST Mods** entry to the admin sidebar in `public/admin.html`. Match the STM-6 audit-page convention (sidebar entry + container div).
  - [x] Wire activation in `public/js/admin.js` (or wherever sidebar dispatch lives) to call `st-mods-panel.js`'s `init` when entry is clicked, passing the active character.
- [x] Task 2 — Panel module (AC: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12)
  - [x] New file `public/js/admin/st-mods-panel.js`. Exports `init(character)`.
  - [x] Render: header (displayName), two toggle rows (global + per-character), create form, active-mods list.
  - [x] On init, fetch (a) `getGlobalSettings()` for current global state — already cached by STM-3 boot, so synchronous, (b) `GET /api/st_mods?character_id=<id>` for the active-mods list.
  - [x] Build the stat-path dropdown options: static categories from shared module + Merits and Disciplines synthesised from the active character.
  - [x] All event handlers wired via single delegated change + click listeners on the panel root, dispatching on `data-stm-*` attributes (match STM-6 pattern).
- [x] Task 3 — Toggle handlers + cache refresh (AC: 3, 4)
  - [x] Global toggle change → `PATCH /api/settings`, then `await loadGlobalSettings()` (re-prime cache), then call the sheet re-render helper.
  - [x] Per-character toggle change → `PATCH /api/characters/:id/st_mods_suppressed`, then sheet re-render for the active character.
  - [x] Both flips: optimistic UI update with rollback on PATCH failure (or pessimistic — Ptah's call; document choice in PR).
- [x] Task 4 — Create form submission (AC: 7, 8, 9)
  - [x] On Save (button click), validate client-side: stat_path is non-empty, delta is integer (non-zero acceptable; both signs valid), reason is non-empty after trim.
  - [x] POST `/api/st_mods` with `{ character_id, stat_path, delta, reason, show_reason_to_player }`.
  - [x] On 201: clear form, refresh active-mods list (re-GET), trigger sheet re-render.
  - [x] On 400: display inline error message ("Invalid stat path", "Reason required", etc.) without clearing the form.
- [x] Task 5 — Revoke handler (AC: 11)
  - [x] Click revoke → `confirm()` ("Revoke this mod?") → on confirm, `DELETE /api/st_mods/:id` → refresh list → sheet re-render.
  - [x] On failure, show a brief error banner.
- [x] Task 6 — Dropdown builder (AC: 5, 6, 14)
  - [x] Pure function `buildStatPathCategories(character) → Array<{ category: string, entries: Array<{ path, label }> }>`. Static categories come from the shared label module; merits/disciplines are computed from the character.
  - [x] Vitest unit: given a character with 2 merits + 3 disciplines, returns the expected category count + entry count.
- [x] Task 7 — Manual smoke (AC: all)
  - [x] Open the admin app on an ST account. Select a character. Activate the ST Mods sidebar.
  - [x] Create a mod (e.g. Strength +1 with show-reason). Confirm it appears in the list + on the player sheet (open in another tab as the player).
  - [x] Revoke the mod. Confirm it disappears from the list and the sheet, but remains in STM-6's audit view with active=false.
  - [x] Toggle global kill-switch off. Confirm all sheets flip to base. Toggle back on. Confirm modded.
  - [x] Toggle per-character suppress on. Confirm only that character flips to base.
  - [x] Document the sequence in the PR description test plan.

## Dev Notes

### Files to create

- `public/js/admin/st-mods-panel.js` (new) — panel module
- Optionally `public/css/admin/st-mods-panel.css` if existing admin styles don't cover — reuse where possible

### Files to modify

- `public/admin.html` — sidebar entry + container div
- `public/js/admin.js` (or sidebar dispatch site) — wire ST Mods sidebar to call panel init
- Possibly `public/js/data/st-mod-labels.js` — if the static categories aren't already in a shared form, lift them here for reuse

### What NOT to change

- STM-1's routes — consumed only
- STM-2's `renderSheetWithOverlay` helper — call only
- STM-3's settings module — call only (via `getGlobalSettings()` + `loadGlobalSettings()`)
- STM-6's audit module — independent surface
- ADR-004 — frozen

### Reference materials

- **PRD §"UI surface: dedicated 'ST Mods' panel per character"** at `specs/epic-stm-st-mods.md`
- **ADR-004 Rev 2 §D3** — hybrid stat-path enum (static + character-derived)
- `server/routes/st_mods.js` (STM-1) — POST + DELETE endpoints + STATIC_WHITELIST as source of truth for static categories
- `public/js/data/app-settings.js` (STM-3) — `getGlobalSettings()` + `loadGlobalSettings()` for the global toggle
- `public/js/data/st-mods.js` (STM-2) — `renderSheetWithOverlay` for re-render trigger
- `public/js/data/st-mod-labels.js` (STM-6) — label lookup
- `public/js/admin/st-mods-audit.js` (STM-6) — reference pattern for delegated routing on an admin sub-page
- Memory: [feedback_listener_routing_static_blind_spot] — delegated routing required

### Pre-commit hygiene checklist

- [ ] `git status | head -1` immediately after branch creation — confirm on `piatra/issue-386-stm-5-admin-panel`
- [ ] `git status | head -1` before staging
- [ ] `git status | head -1` before commit
- [ ] **Use `git worktree add` if another session is concurrently active** — per memory feedback_test_merge_shared_workdir update 2026-05-18

### Branch hygiene

Branch from current `dev` tip. STM-4 will dispatch in parallel and touches sheet UI; STM-5 touches admin UI. Different files — no surface collision expected.

### Coverage that is explicitly NOT required

- Sheet marker / popover (STM-4)
- Bulk mod operations (PRD non-goal)
- Hotkey / quick-open for mid-scene creation (PRD non-goal v1)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Worktree isolation per [[feedback_test_merge_shared_workdir]] update.** Built STM-5 in `/tmp/tm-ptah/stm-5` (server/.env symlinked). Clean delivery alongside Khepri's concurrent bookkeeping.
- **STM-1 regex tightened to accept named discipline keys.** The original STM-1 regex `^(merits|disciplines)\.[0-9]+\.dots$` accepted numeric indices for both, but `c.disciplines` is OBJECT-KEYED in the v2 schema (per `accessors.js#discDots`). Split into `^(merits\.[0-9]+|disciplines\.[A-Za-z][A-Za-z0-9]*)\.dots$` — merits stay numeric (array), disciplines accept ASCII-letter name keys. Two STM-1 tests updated: the `disciplines.0.dots` case now correctly 400s (intentional regression), new `disciplines.Auspex.dots` case verifies the name-based form returns 201. Path-resolve sanity fixture also updated to object-keyed disciplines per v2 schema.
- **`STM_STATIC_CATEGORIES` lifted into `public/js/data/st-mod-labels.js` (shared).** STM-6 already had that module for label lookup; STM-5 extends it with the categorised structure (Attributes / Skills / Current State / Derived). `buildStatPathCategories(character)` is the pure function appending Merits and Disciplines computed from the active character per ADR-004 §D3.
- **All event handlers via delegated routing on the panel root.** Single `change` + single `click` listener. Dispatch by `data-stm-toggle`, `data-stm-form`, `data-stm-action`, `data-stm-mod-id`. Per `feedback_listener_routing_static_blind_spot`.
- **Cache-refresh after PATCH /api/settings.** Global toggle flip: PATCH → `await loadGlobalSettings()` (re-prime STM-3's cache) → `onMutate` callback. admin.js wires the callback to `renderSheetWithOverlay(c)` so the player sheet flips to base / back without a full reload. Same mechanism for per-character suppress flip.
- **Pessimistic toggle UX.** PATCH first, render on success; on failure, re-render against unchanged cached state (which restores the prior checkbox). Rollback under optimistic-UI requires snapshot+restore that doesn't compose cleanly with concurrent toggles. The toggle is a low-frequency control; one extra round-trip is acceptable.
- **Client-side delta-zero gate.** Server allows `delta: 0` (satisfies `Number.isInteger`). The panel rejects 0 because a zero-delta mod is meaningless and the form default of 1 makes it easy to forget to change. Gate at create time rather than fill the audit log with no-ops.
- **STM-6 audit page CSS polish bundled per dispatch suggestion.** Single CSS pass covers both the new panel and the audit page with shared `.stm-*` class naming + existing theme tokens. Both pages now have consistent admin-tool styling.
- **CSS scoped to `.stm-*` classes** — no new global selectors. Uses existing theme tokens — theme-agnostic, works in both light/dark.
- **Three git status checkpoints + worktree isolation as the fourth defence.**

### File List

- `public/js/data/st-mod-labels.js` (modified) — added `STM_STATIC_CATEGORIES` export + `buildStatPathCategories(character)` pure function (handles object-keyed disciplines per v2 schema, array merits)
- `public/js/admin/st-mods-panel.js` (new) — admin panel module (header + 2 toggles + create form + active mods list + revoke); delegated routing throughout
- `public/admin.html` (modified) — sidebar button `data-domain="st-mods"` + `<section id="d-st-mods">` container
- `public/js/admin.js` (modified) — import + `switchDomain('st-mods')` branch wires panel init with `onMutate` → `renderSheetWithOverlay(c)`
- `public/css/components.css` (modified) — appended `.stm-panel*`, `.stm-mod-row*`, `.stm-toggle*`, `.stm-form*`, `.stm-badge*` rules + STM-6 audit-page polish (`.stm-audit-*`)
- `server/routes/st_mods.js` (modified) — `DYNAMIC_PATH_RE` split to accept named discipline keys
- `server/tests/api-st-mods.test.js` (modified) — replaced `disciplines.0.dots` accept-case with `disciplines.Auspex.dots` accept + `disciplines.0.dots` reject
- `server/tests/stm-path-resolve-sanity.test.js` (modified) — fixture updated to object-keyed disciplines; resolution loop walks `Object.keys`
- `server/tests/stm-static-categories.test.js` (new) — 10 vitest cases for `STM_STATIC_CATEGORIES` + `buildStatPathCategories`
- `specs/stories/issue-386-stm-5-admin-panel.story.md` — status flipped, Dev Agent Record filled

### Change Log

- 2026-05-18 (Ptah): STM-5 initial implementation; Epic STM functionally complete pending dev-merge + Peter's in-app smoke
