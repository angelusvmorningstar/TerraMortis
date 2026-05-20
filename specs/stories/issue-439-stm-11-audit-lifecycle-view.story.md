# Issue #439: STM-11 — audit view migrates to lifecycle event stream (by/at canonical, drop dual-stamp aliases)

Status: Done

issue: 439
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/439
branch: piatra/issue-439-stm-11-audit-lifecycle-view
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 4 §D16-D19 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE. Closes the STM-10 dual-stamp transition window while STM-10 is still in HEAD.

## Story

As a Storyteller,
I want the ST Mods audit view to read as a true lifecycle event stream (created / activated / deactivated / deleted) rather than creation rows with a derived active-vs-revoked marker,
so that every lifecycle event is individually accountable and visually distinct, and the transitional dual-stamp audit fields are retired in favour of the canonical `by` / `at` shape.

## Decisions implemented (ADR-004 Rev 4 §D16-D19)

- **D16/D17** — the audit reader consumes the lifecycle event stream directly. Each row is one event with its own per-event-type badge; the STM-6 active/revoked badge derived from st_mods doc-presence retires.
- **Dual-stamp window closed** — `buildAuditEvent` drops the back-compat `created_by`/`created_at` aliases STM-10 wrote during the transition. New audit rows carry canonical `by`/`at`/`event` only.
- **D19 backfill-independence** — the reader does not depend on STM-13 running first. The GET aggregation coalesces legacy rows (`created_by`/`created_at`, no `event`) into canonical fields via `$ifNull` (`at = at ?? created_at`, `by = by ?? created_by`, `event = event ?? 'created'`), so old and new rows filter/sort uniformly.

## Tasks / Subtasks

- [x] Task 1 — `buildAuditEvent`: drop `created_by`/`created_at` aliases; write `by`/`at`/`event` only.
- [x] Task 2 — audit GET migrated to an aggregation pipeline: `$addFields` coalesce (legacy → canonical) → `$match` (character / by.discord_name / event / date-range on coalesced `at`) → `$facet` { rows: sort `at` desc + skip + limit, total: count }. Batched `$in` active-decoration preserved (not N+1).
- [x] Task 3 — optional `event` filter param (created/activated/deactivated/deleted); unknown values ignored (full stream returned).
- [x] Task 4 — client `st-mods-audit.js`: read `by.discord_name` + `at`; render per-event-type badge; deleted rows rendered as dimmed/struck tombstones; active/revoked badge retired; ST-dropdown built from `by.discord_name`.
- [x] Task 5 — event-type filter affordance added to the filter bar (the recommended-but-optional AC item).
- [x] Task 6 — CSS: retire `.stm-badge--active`/`--revoked` (unused, grep-confirmed); add `.stm-ev-badge` + per-event-type modifiers + `.stm-audit-row--deleted` tombstone treatment.
- [x] Task 7 — tests: migrate stale `created_by`/`created_at` assertions to `by`/`at`; update the STM-10 created-event test (aliases now absent); add 4 new event-stream vitest cases.

## Acceptance Criteria

1. Rows render by `event` type with distinct treatment (created neutral / activated gold / deactivated muted / deleted tombstone) — ✅
2. Sort defaults to `at` descending — ✅ (aggregation `$sort: { at: -1 }`)
3. Row reads use `by.discord_name` + `at`; legacy `created_by`/`created_at` reads removed — ✅
4. Backend writes drop dual-stamp aliases; legacy rows without `event` still readable (`event ?? 'created'`) — ✅
5. Filter UI works against event-stream shape: ST → `by.discord_name`, date → `at`, plus new event-type filter — ✅
6. Active/revoked badge retires; per-row event type replaces doc-presence derivation — ✅
7. ≥3 new vitest cases (event-rendering shape, by/at-not-created_by/created_at, filter-by-event) — ✅ 4 added
8. No regression — ✅ 1057/1057

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Reader as aggregation, not find().** Coalescing legacy → canonical must happen BEFORE match/sort so that filter-by-ST, date-range, and sort all see one field regardless of row vintage. A plain `find()` can't `$ifNull`, so the endpoint moved to a `$addFields → $match → $facet` pipeline. `$facet` returns rows + total in one round-trip; total reads `agg[0].total[0].n` (empty result → 0).
- **Active decoration kept, but no longer drives the badge.** The server still returns `active` (batched `$in` against st_mods presence) — cheap, and the STM-6 AC#6 test still asserts it. But the CLIENT no longer renders an active/revoked badge; each row's visual state now comes from its own `event` type. This is the cleaner realization of the AC ("read the event, not doc-presence"): every row IS an event, so per-row event rendering needs no most-recent-event lookup. `active` survives as decoration metadata, not display state.
- **Deleted rows are gravestones.** A `deleted` event is terminal; the underlying mod no longer exists, so its current-active state is meaningless. The row is dimmed + struck (`.stm-audit-row--deleted`) and the badge reads "Deleted". The decoration `active:false` on these rows is incidental, not displayed.
- **Event filter is forgiving.** Unknown `?event=` values are ignored (full stream returned) rather than 400 — matches the STM-6 "filters are optional" spirit; bad input never errors the page.
- **Dual-stamp window closed in the right order.** STM-10's note said "STM-11 migrates the reader to by/at, then drops the alias writes." Done in that order within this branch: reader migrated (aggregation coalesce handles BOTH old alias-only legacy rows AND new canonical rows) FIRST, so dropping the write-side aliases in `buildAuditEvent` cannot strand the reader. The STM-10 created-event test that asserted the aliases were present is inverted to assert they are absent.
- **CSS cleanup.** `.stm-badge`/`--active`/`--revoked` had no remaining consumers after the client migration (grep-confirmed across `public/js` + html) — removed rather than left as dead rules.
- **Worktree pattern continued** (`/tmp/tm-ptah/stm-11`, node_modules symlinked from main for the test run).

### File List

- `server/routes/st_mods.js` (modified) — `buildAuditEvent` drops `created_by`/`created_at`; audit GET rewritten as coalesce → match → facet aggregation with event filter + `at`-desc sort, batched `$in` active-decoration preserved
- `public/js/admin/st-mods-audit.js` (modified) — reads `by`/`at`; per-event-type badge render; deleted-tombstone rows; event-type filter affordance; ST-dropdown from `by.discord_name`
- `public/css/components.css` (modified) — retired `.stm-badge*`; added `.stm-ev-badge` + per-event-type modifiers + `.stm-audit-row--deleted`
- `server/tests/api-st-mods.test.js` (modified) — migrated `created_by`/`created_at` assertions to `by`/`at`; new STM-11 describe block (4 cases: event-stream shape, event filter, unknown-event-ignored, legacy coalesce)
- `server/tests/stm-10-lifecycle.test.js` (modified) — created-event test inverted to assert aliases absent
- `specs/stories/issue-439-stm-11-audit-lifecycle-view.story.md` — this file

### Change Log

- 2026-05-20 (Ptah): STM-11 audit lifecycle view migration
