# Issue #440: STM-12 — panel UI for persistent toggleable mods (filter / muted-inactive / reactivate / soft-warn)

Status: Ready for Review

issue: 440
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/440
branch: piatra/issue-440-stm-12-panel-lifecycle
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 4 §D15/D17 + Rev 1 §D4 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE. PRD Rev 4 ACs are verbatim; this story implements them. Last piece of the Rev 4 chapter.

## Story

As a Storyteller,
I want the ST Mods panel to show active AND inactive mods (inactive visually muted, each with a Reactivate affordance), with All/Active/Inactive filtering, per-row Deactivate/Reactivate/Delete, a delete-confirmation modal that names the tombstone behaviour, and a soft-duplicate warning that fires only when my new mod's path matches a dormant mod,
so that I can pause/resume mods without losing them, permanently delete for list cleanliness with a clear warning, and avoid accidentally re-creating a mod that is merely dormant.

## Decisions implemented

- **Load-bearing AC 1** — inactive mods stay visible, rendered muted (reduced opacity, no gold border-glow, `◌` outline glyph, dimmed text) with a Reactivate button on every inactive row.
- **Load-bearing AC 2** — the soft-duplicate warning fires ONLY when the create form's path matches an INACTIVE mod on this character. Active-path stacking is silent (multi-mod stacking is by design, ADR Rev 1 §D4). The banner names the specific dormant match and offers to reactivate it.
- **§D15/D17** — Deactivate/Reactivate call `PATCH /api/st_mods/:id { active }`; Delete calls `DELETE` (STM-10's tombstone-before-destroy).

## Tasks / Subtasks

- [x] Task 1 — pure-logic module `public/js/admin/st-mods-panel-logic.js` (`isActive`, `partitionMods`, `filterMods`, `findDormantMatch`), import-free so vitest exercises it directly in Node.
- [x] Task 2 — panel render expansion: All/Active/Inactive filter bar; Active group (Deactivate/Delete); muted Inactive group (Reactivate/Delete), shown in `all` view only when non-empty.
- [x] Task 3 — soft-duplicate banner in the create form, re-evaluated on stat-path change; dismissible per-path; "Reactivate dormant" button targets the specific match.
- [x] Task 4 — delete confirmation modal with "permanently delete" copy + explicit tombstone wording ("the audit log will record this deletion; the mod itself will be gone"); backdrop-click + Cancel dismiss.
- [x] Task 5 — delegated routing: one `change` listener (toggles + form fields), one `click` listener (save / deactivate / reactivate / delete / confirm / cancel / filter views / dormant reactivate+dismiss). No per-row addEventListener. `markLocalWrite` + `onMutate` on every mutation.
- [x] Task 6 — CSS: muted-inactive row, filter buttons, dormant banner, modal overlay.
- [x] Task 7 — 11 vitest cases (the 3 required + 8 supporting).

## Acceptance Criteria

1. Panel renders active + inactive, inactive muted — ✅
2. Reactivate on every inactive row → PATCH active:true → moves to active, WS broadcast — ✅ (markLocalWrite before PATCH; STM-10 broadcasts `activate`)
3. Deactivate on every active row → PATCH active:false → moves to inactive — ✅
4. Delete → confirmation modal → DELETE → row gone; `deleted` tombstone created — ✅ (modal copy names the tombstone; STM-10 writes it)
5. Soft warning fires on inactive-path match; active-path silent; dismissible — ✅ (`findDormantMatch`, unit-tested both ways)
6. Filter All/Active/Inactive; defaults to All on open — ✅
7. All handlers via delegated routing on the panel root — ✅
8. Cross-client smoke — ⚠️ not run (OAuth-gated admin; see notes). WS path unchanged from STM-9/10.
9. No regression — ✅ 1068/1068; STM-5 create/list/global-toggle/suppress paths untouched
10. ≥3 vitest cases (dormant fires / active-path silent / reactivate updates UI) — ✅ all three present (+8 more)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Pure-logic split for testability.** The soft-warn and partition rules are the load-bearing logic, so they live in `st-mods-panel-logic.js` with NO browser imports — vitest imports them directly (the panel itself can't be imported in Node because of its api/ws/app-settings deps). This is the "pure-function units where possible" the issue asked for; the three required cases are pure-function assertions.
- **Soft-warn semantics.** `findDormantMatch` returns the first INACTIVE mod sharing the form's path, else null. An active mod on the same path returns null (silent) — even when an active AND inactive mod both exist on that path, the inactive one is the reactivation target and is returned. A pre-Rev 4 mod with no `active` field counts as active (silent), matching §D19.
- **Inactive group visibility.** In `all` view the muted Inactive group is shown only when non-empty, so an all-active character isn't cluttered with an empty heading. In `inactive` view the empty-state message shows.
- **Delete is a real modal, not `confirm()`.** The issue requires a confirmation modal with tombstone copy; native `confirm()` can't carry that wording. The modal mounts at the panel root (outside the list body) via `_renderModal()` so list re-renders don't clobber it; backdrop-click and Cancel both dismiss. STM-5's `revoke` button + native confirm are retired.
- **Delegated routing discipline** (memory feedback_listener_routing_static_blind_spot). Click handlers are in the `click` listener and change handlers in the `change` listener — never crossed. The click handler resolves the acted element via `t.closest('[data-stm-action],[data-stm-view]')` so clicks on button text/icons still route. Filter-view switching repaints only the list body + button states (no full scaffold redraw); the dormant banner has its own slot re-render so a stat-path change updates it without rebuilding the form.
- **WS dedupe unchanged.** `markLocalWrite(charId, { st_mod: true })` fires before every PATCH/DELETE (same shape as STM-9's POST path), so the originating client's WS echo is suppressed and the panel refreshes via its own `_refetchMods`.
- **Browser smoke NOT performed.** The admin panel is behind Discord OAuth + requires a selected character; it can't be exercised end-to-end in this session. Per CLAUDE.md I am flagging this rather than claiming success. Mitigations: 11 passing units on the load-bearing logic, parse-checks on both modules, and correctly-separated delegated listeners (the specific failure mode the listener-routing memory warns about — click handlers registered inside a `change` listener — is not present here). Recommend a QA browser pass for the cross-client (AC#8) and modal/banner interaction.
- **Worktree pattern continued** (`/tmp/tm-ptah/stm-12`, node_modules + server/.env symlinked from main; base forked from dev tip 47b5b6b7 which already includes STM-11).

### File List

- `public/js/admin/st-mods-panel-logic.js` (new) — pure helpers: isActive / partitionMods / filterMods / findDormantMatch
- `public/js/admin/st-mods-panel.js` (modified) — lifecycle render (active/inactive/filter), Deactivate/Reactivate/Delete handlers, delete modal, dormant soft-warn banner; STM-5 revoke + native confirm retired
- `public/css/components.css` (modified) — muted-inactive row, filter bar, dormant banner, delete modal; retired unused `.stm-mod-revoke`
- `server/tests/stm-12-panel-logic.test.js` (new) — 11 vitest cases
- `specs/stories/issue-440-stm-12-panel-lifecycle-ui.story.md` — this file

### Change Log

- 2026-05-20 (Ptah): STM-12 panel lifecycle UI
