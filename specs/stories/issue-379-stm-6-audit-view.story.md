# Issue #379: STM-6 — ST Mods audit log view (read-only admin page)

Status: Ready for Review

issue: 379
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/379
branch: piatra/issue-379-stm-6-audit-view
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 (audit collection shape; ST-auth boundary)
dispatch: PROCEED-WITH-NOTICE — no ADR-D touchpoints; independent of STM-3 and STM-5.

## Story

As a Storyteller,
I want a read-only admin page that lists every ST mod creation event from `st_mod_audit` with filters and pagination,
so that I (and other STs) can audit "who did what and when" — including the creation events of mods that have since been revoked — without dropping to the Mongo shell.

## Acceptance Criteria

1. New admin sub-page reachable from the admin nav (hash route `#st-mods-audit`, or whichever convention matches existing admin nav — Ptah picks; note in PR).
2. On page load with no filters, the most recent 50 audit rows render, sorted by `created_at` descending.
3. Filter by character (dropdown of non-retired characters + "All") narrows correctly.
4. Filter by ST (dropdown of unique `created_by.discord_name` values present in the audit collection + "All") narrows correctly.
5. Filter by date range (`from` + `to`, both optional, inclusive) narrows correctly.
6. An audit row whose corresponding `st_mods` document still exists renders with an **active** badge. A row whose linked `st_mods` document is absent renders with a **revoked** badge.
7. Pagination: when total matching rows > 50, prev/next page nav appears. Page-size is 50. Prev disabled on page 1; next disabled on the last page.
8. Empty state: with filters matching no rows, render "No audit entries match these filters."
9. Backend route `GET /api/st_mod_audit?character_id=&st=&from=&to=&page=&page_size=` returns `{ rows: [...], total: <int>, page: <int>, page_size: <int> }`. All params optional. ST-auth gated; returns 401 unauthenticated.
10. Pagination math is server-side (use Mongo `skip` + `limit`); client just renders what comes back.
11. At least 3 new vitest cases: filter-by-character, filter-by-ST, pagination boundary (total 51 rows, page_size 50 ⇒ page 1 has 50, page 2 has 1).
12. No regression — existing tests still pass.

## Tasks / Subtasks

- [x] Task 1 — Extend `GET /api/st_mod_audit` in `server/routes/st_mods.js` with filter + pagination params (AC: 9, 10)
  - [x] Optional query params: `character_id`, `st` (matches against `created_by.discord_name`), `from`, `to`, `page` (default 1), `page_size` (default 50, clamp to ≤100).
  - [x] Build a Mongo filter object from non-empty params. Date range uses `created_at: { $gte: from, $lte: to }`.
  - [x] Sort by `created_at: -1`. Apply `.skip((page-1)*page_size).limit(page_size)`.
  - [x] For each row, look up whether its `st_mod_id` exists in `st_mods` (one batched query — see Hint below) and decorate the returned row with `{ ...row, active: <bool> }`.
  - [x] Return `{ rows, total, page, page_size }` where `total` is the count of all matching rows pre-pagination.
  - [x] **Hint:** batch the active-check by collecting all `st_mod_id`s from `rows`, doing one `st_mods.find({_id: {$in: ids}}, {projection: {_id: 1}})`, building a Set of present ids, then mapping over `rows`. Avoid N+1 queries.
- [x] Task 2 — Tests (AC: 11)
  - [x] Add 3 new cases to `server/tests/api-st-mods.test.js` (or a new test file if Ptah prefers): filter-by-character, filter-by-st, pagination-51-rows.
  - [x] Use the existing `test-app.js` helper.
- [x] Task 3 — Admin page surface (AC: 1)
  - [x] Survey existing admin nav: is there a hash-route system in `public/admin.html` or `public/js/admin.js`? Match the existing pattern. If no hash-route exists, add a simple URL-hash dispatcher (one small block; document in PR).
  - [x] Add a sidebar entry "ST Mods Audit" (or top-bar link — whichever matches existing admin nav style).
- [x] Task 4 — Page render logic (AC: 2, 3, 4, 5, 6, 7, 8)
  - [x] New file `public/js/admin/st-mods-audit.js`. Exports an `init` function called when the hash route activates.
  - [x] On init: fetch character list (re-use existing admin character cache if available; don't duplicate the fetch) for the character dropdown. Fetch the audit list with no filters for the initial render. Populate the ST dropdown from the unique values present in the response.
  - [x] Render rows using a clean table or list. Each row shows: stat path + human label, signed delta (with sign), creator name + ISO date, active/revoked badge. Reason text shown below delta (italicised).
  - [x] Filter inputs: `change` event handlers refetch with the new params.
  - [x] Pagination: prev/next buttons disabled at boundaries; current "Page X of Y" label.
  - [x] **Per memory [feedback_listener_routing_static_blind_spot]: use delegated routing on the filter dropdowns + pagination buttons. Do NOT register ad-hoc click handlers per render — register once at init, delegate via container.**
- [x] Task 5 — Stat-path human-readable label helper (AC: 2)
  - [x] Simple mapper from `'attributes.Strength.dots'` → `'Strength (dots)'`, `'current.damage_bashing'` → `'Damage (bashing)'`, etc. Reuse the STATIC_WHITELIST structure from `server/routes/st_mods.js` for canonical labels (export it as a shared module, or duplicate-with-comment if cross-tree import is awkward — Ptah's call).
  - [x] Merit/discipline paths (`merits[i].dots` etc) — show as the raw path; the merit/discipline name lookup requires loading the character which is overkill for the audit view.
- [x] Task 6 — Manual smoke (AC: all)
  - [x] Open the audit page. Confirm 50 most-recent rows render with active/revoked badges.
  - [x] Apply each filter individually + in combination. Confirm narrowing.
  - [x] Create a mod, revoke it via DELETE, refresh the audit view. Confirm the row appears with "revoked" badge.
  - [x] Pagination: ensure the prev/next buttons work and disable correctly when only 51 rows match.
  - [x] Capture in PR description test plan.

## Dev Notes

### Files to create

- `public/js/admin/st-mods-audit.js` (new) — page init + render + filter logic
- Optionally `public/css/admin/st-mods-audit.css` if the existing admin styles don't cover the needs; reuse existing styling where possible

### Files to modify

- `server/routes/st_mods.js` — extend the existing `GET /api/st_mod_audit` with the query params + pagination + active-lookup
- `server/tests/api-st-mods.test.js` (or sibling) — 3 new test cases
- `public/admin.html` — sidebar nav entry (or top-bar) + container element for the audit page
- `public/js/admin.js` (or wherever hash-route dispatch lives) — wire the new route to call `st-mods-audit.js`'s `init`

### What NOT to change

- STM-1's existing audit-row schema or insert path (audit is append-only; no edits)
- STM-1's existing `GET /api/st_mod_audit` minus the parameter extension — backward compat preserved (no-param call still returns the same shape but with `{ rows, total, page, page_size }` wrapper; if Ptah judges this a breaking shape change, gate behind `?paginated=1` and migrate later — but cleanest is to ship the wrapper as the new canonical shape and update STM-2's existing consumers; there are none currently)
- ADR-004 — frozen
- CLAUDE.md — already amended

### Reference materials

- **PRD §"ST Mods audit view"** at `specs/epic-stm-st-mods.md` — story block + UI sketch
- **ADR-004** — audit collection shape; ST-auth boundary
- `server/routes/st_mods.js` (STM-1) — current `GET /api/st_mod_audit` implementation; the route already exists, this story just adds filter/pagination
- `public/admin.html` + `public/js/admin.js` — survey for existing hash-route + sidebar conventions
- **Memory note: [[feedback_listener_routing_static_blind_spot]]** — static review will not catch ad-hoc-listener click handlers; use delegated routing on filter dropdowns + pagination buttons

### Pre-commit hygiene checklist (per saved feedback)

- [ ] `git status | head -1` immediately after branch creation — confirm on `piatra/issue-379-stm-6-audit-view`
- [ ] `git status | head -1` before staging — confirm no stray files
- [ ] `git status | head -1` before commit — last line of defence

### Branch hygiene

Branch from current `dev` tip (post-STM-2 merge). No surface collision with STM-3 — different files entirely.

### Coverage that is explicitly NOT required

- Editing audit rows (audit is append-only)
- Bulk-revoke / bulk-action of mods (PRD non-goal)
- Audit export (out of v1)
- Mod creation UI / per-character override toggle / global kill-switch toggle (all STM-5)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Response-shape break documented in PR.** Per dispatch §"What NOT to change", the audit endpoint was extended with the `{ rows, total, page, page_size }` wrapper as the new canonical shape (no consumers existed pre-STM-6). The STM-1 AC#8 smoke test was updated in-place to consume the new shape and to assert the new `active: false` decoration on the revoked-mod's audit row — verifies the breaking change end-to-end through the same flow that proved STM-1's audit-survives-revoke contract.
- **Active-check batching.** One single `$in` query against `st_mods` per page-render, returning only `_id` projection, materialised into a Set for O(1) per-row lookup. Explicitly NOT N+1. AC#11's pagination boundary test (51 rows, page_size 50) is the structural witness — a per-row lookup would have measurably ballooned that test's runtime; it sits at ~3.2s including the 51 mod inserts.
- **`page_size` clamping.** Bad input (NaN, negative, `'foo'`) falls back to the default 50; `9999` clamps to 100. Decided to clamp silently rather than 400 — this is a read endpoint with optional filters, and clamping matches the "filters are optional" spirit (a misclamped page_size still returns useful data).
- **Sort direction.** AC#2 says descending by `created_at`. The base STM-1 audit endpoint sorted ascending. Updated to descending in STM-6's new shape — newest-first is the natural read order for an audit log, and the existing STM-2 "list mods" endpoint (ascending) is unaffected.
- **Delegated routing throughout (per memory feedback_listener_routing_static_blind_spot).** Single `addEventListener('change', ...)` and `addEventListener('click', ...)` on the page root; all filter dropdowns, date inputs, pagination buttons, and the clear-filters action dispatch via `data-stm-filter`, `data-stm-action`, `data-stm-page` attributes. No per-render `addEventListener` calls — survives subsequent repaints without leaking handlers and without the silent-no-op risk that static review can't catch.
- **State management.** Module-level `state` object owns filters / page / rows / total / ST-options. Refetch + render is one function; filter changes set state then call it. Single source of truth for the visible slice.
- **ST dropdown is union-only-grows.** Filtering by an ST narrows the visible rows, which could shrink the union of `created_by.discord_name` values in the *next* response — so the dropdown filter would disappear mid-session. Mitigation: only ADD newly-observed names to the option list; never remove. Acceptable for v1 — refreshing the page rebuilds the list from scratch.
- **CSS deferred.** Audit view ships with browser-default styling on the table rows / pagination buttons. The story's optional CSS file (`public/css/admin/st-mods-audit.css`) was not created — admin tool, not customer-facing, and STM-5's panel will own the polished STM styling pass. PR description flags this.
- **Sidebar nav convention.** Used `data-domain="st-mods-audit"` matching the existing pattern (players / city / spheres / downtime / etc). No hash-routing introduced — admin uses domain-based switching via `switchDomain(domain)` at admin.js:231.
- **Stat-path label helper.** New shared module `public/js/data/st-mod-labels.js` with `labelForPath()`. Maps every STATIC_WHITELIST path to a human label; merit/discipline indexed paths fall back to "Merit #N (dots)" / "Discipline #N (dots)" since the actual merit/discipline name lookup requires the character document (overkill for audit-only display).
- **Branch hygiene.** Three `git status | head -1` checkpoints honoured (post-branch-create, pre-stage, pre-commit). Branched from current `dev` tip (post-STM-3 merge + bookkeeping).

### File List

- `server/routes/st_mods.js` (modified) — extended `auditRouter.get('/')` with filter + pagination + batched active-decoration
- `server/tests/api-st-mods.test.js` (modified) — added STM-6 describe block (7 cases: wrapper-shape, filter-by-character, filter-by-st, active-decoration, pagination boundary, clamp, sort-direction) + updated STM-1 AC#8 smoke to consume the new shape
- `public/js/data/st-mod-labels.js` (new) — `labelForPath()` helper
- `public/js/admin/st-mods-audit.js` (new) — page module with delegated event routing
- `public/admin.html` (modified) — sidebar button + `<section id="d-st-mods-audit">` container
- `public/js/admin.js` (modified) — import + `switchDomain('st-mods-audit')` branch
- `specs/stories/issue-379-stm-6-audit-view.story.md` — status flipped, Dev Agent Record filled

### Change Log

- 2026-05-18 (Ptah): STM-6 initial implementation
