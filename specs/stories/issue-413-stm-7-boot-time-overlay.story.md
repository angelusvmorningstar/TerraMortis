# Issue #413: STM-7 — Boot-time overlay propagation

Status: Done

issue: 413
issue_url: https://github.com/angelusvmorningstar/terramortis/issues/413
branch: piatra/issue-413-stm-7-boot-time-overlay
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 3 §D8/D9/D13/D14 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE — Angelus D8/D9 dissent window closed by Peter's direct sign-off
pr: https://github.com/angelusvmorningstar/TerraMortis/pull/414 (merged 2026-05-20 as 343e5bac)

_Retroactive story file — created during STM-8 (PR #415) per Khepri's process-restoration note. STM-7 shipped without a story file due to dispatch-window drift; this captures the contract for documentation parity with STM-1..6._

## Story

As a Storyteller (and player viewing modded values),
I want every read site — sheet, roll calculator, DT player form pool, DT admin resolution view — to display modded character values without per-site instrumentation,
so that ST mods propagate transparently through the existing accessor chain and don't require touching 213 callsites.

## Decisions implemented (from ADR-004 Rev 3)

- **D9** — `applyOverlayToAll(chars, globalEnabled)` helper in `public/js/data/st-mods.js`; bulk endpoint `GET /api/st_mods?character_ids=<csv>` returning `{ [character_id]: [...mods] }`; boot-path call in `public/js/app.js` after `applyDerivedMerits` and combat-char merge.
- **D8** — Cache-entry invariant established. Every in-memory `chars[]` entry has `applyStMods` applied at boot (one bulk RTT regardless of N). All 213 accessor callsites funnel through ~6 functions in `public/js/data/accessors.js` which already read the paths `applyStMods` mutates — so no per-callsite refactor.
- **D13** — localStorage cache stays base-only. `charsForSave` in `public/js/editor/export.js` calls `stripOverlay` on each deep clone before stash so the next boot doesn't compound mods on already-modded "canonical" values.
- **D14** — CLAUDE.md derived-stats carve-out expanded to name the cache-entry invariant, the accessor chain, the new read sites, and the editor-strip + localStorage-strip exceptions.

## Tasks / Subtasks

- [x] Task 1 — Server bulk endpoint with per-id `canAccessMods` (capped at 200)
- [x] Task 2 — Client `loadStModsBulk` + `applyOverlayToAll`
- [x] Task 3 — Boot wire in `app.js` (after combat-char merge to include resist-target lookups)
- [x] Task 4 — `charsForSave` strips overlay before stash
- [x] Task 5 — CLAUDE.md + SSOT amendments
- [x] Task 6 — 14 vitest cases (bulk shape, sort order, caps, auth boundaries atomic per-id, backwards-compat single-char, `applyOverlayToAll` contract incl. per-char suppress + globalEnabled=false + defensive null entries)

## Acceptance Criteria

1. `applyOverlayToAll(chars, globalEnabled)` exported from `public/js/data/st-mods.js` — ✅
2. Bulk endpoint accepts up to 200 ids; rejects 400 above — ✅
3. Bulk response shape `{ [character_id]: [...mods] }` with empty arrays for no-mod chars — ✅
4. Single-char GET backwards-compat — ✅
5. Boot-path call in `app.js` after `applyDerivedMerits` — ✅
6. Suite roll calculator displays modded pool values — ✅ structural; needs Peter's smoke (deferred to STM-8 / polish)
7. DT player form pool reflects mods — ✅ structural (STM-8 wires the resolution-time snapshot which reads the same overlay state)
8. DT admin resolution shows modded pool values — ✅ structural (same)
9. CLAUDE.md amendment — ✅
10. SSOT amendment — ✅
11. No regression — ✅ 1012/1012 server tests pass
12. No regression on existing STM-2/4/5 sheet display — ✅

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **CSV cap at 200** — picked against current campaign size (~31 active + ~15 retired). 4x headroom for organic growth. Pathological inputs (e.g. 10k random ids) get a clean 400 rather than a slow `$in`.
- **Empty arrays for no-mod chars in bulk shape** — every requested id is a key in the response, so the client (`applyOverlayToAll`) doesn't need to defend against missing keys.
- **Atomic per-id auth** — a player request with any non-own id returns 403 with no rows leaked (no partial results that would signal mod presence on other characters).
- **Boot overlay applied to `suiteState.chars` (post-merge)**, not `editorState.chars` directly, so combat-only chars (resist-target lookups) also see modded values.
- **`charsForSave` strips overlay via deep-clone + `stripOverlay`** — the silent-drift risk was that `JSON.stringify(c)` would capture modded `.dots`/`.bonus` + overlay metadata into `tm_chars_db`, then the next boot would apply overlay on top of an already-modded "canonical" → compounding mods every session.
- **Worktree pattern** continued (no branch-mix-up).

### File List

- `server/routes/st_mods.js` (modified) — bulk GET branched on `character_ids` query param; cap + per-id auth; single-char shape preserved
- `public/js/data/st-mods.js` (modified) — `loadStModsBulk` + `applyOverlayToAll` exports
- `public/js/app.js` (modified) — boot-path wire after combat-char merge
- `public/js/editor/export.js` (modified) — `charsForSave` calls `stripOverlay` on each clone (D13 invariant)
- `CLAUDE.md` (modified) — derived-stats carve-out extended with cache-entry invariant paragraph
- `specs/reference-data-ssot.md` (modified) — bulk endpoint added to the `st_mods` row
- `server/tests/stm-7-bulk-endpoint.test.js` (new) — 14 vitest cases

### Change Log

- 2026-05-20 (Ptah): STM-7 initial implementation, merged as 343e5bac
- 2026-05-20 (Ptah): Retroactive story file added during STM-8 (PR #415) per process restoration
