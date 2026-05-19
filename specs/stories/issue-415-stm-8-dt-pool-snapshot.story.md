# Issue #415: STM-8 — DT pool snapshot at resolution time

Status: Ready for Review

issue: 415
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/415
branch: piatra/issue-415-stm-8-dt-pool-snapshot
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 3 §D10 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: PROCEED-WITH-NOTICE — D10 fully specified by Thoth's prior + Imhotep's Rev 3

## Story

As a Storyteller resolving a DT submission with a modded pool,
I want the resolved pool to snapshot the mod-affected total AND the per-mod breakdown at the moment of resolution,
so that future ST debugging of the resolution sees the exact mod state that was active when this pool was rolled — even if those mods are later revoked.

## Decisions implemented (from ADR-004 Rev 3 §D10)

Per Thoth's product prior:
1. **Freezing at resolution honours player intent regardless of later mod revocation.** A mod active at resolve-time is part of the resolution's history; revoking it later doesn't retroactively change what happened.
2. **The breakdown is what an ST needs months later to debug a contested resolution.** Final number alone isn't enough — STs need to see "where did the +2 come from".

Snapshot shape (additive — existing submissions without the field are valid):

```js
projects_resolved[j].pool_snapshot = {
  base: <int>,                                  // pool size without overlay
  mods: [{ stat_path, delta, reason }, ...],   // per-mod breakdown
  final: <int>,                                 // base + Σ delta
};
feeding_roll.pool_snapshot = { /* same shape */ };
```

Math invariant: `final === base + Σ mods[].delta`. Server-enforced — reject 400 if violated.

## Tasks / Subtasks

- [x] Task 1 — Server-side validator `_validatePoolSnapshots(req.body)` walks PUT/POST body for any `pool_snapshot` key (direct, dot-notation, or nested in arrays/objects) and enforces the math invariant. Mounted in both POST and PUT handlers.
- [x] Task 2 — Client helper `buildPoolSnapshot(c, finalPool)` reads `c._st_mod_overlay`, emits `{ base, mods, final }` with base = final − Σ delta (invariant holds by construction).
- [x] Task 3 — Wire into four resolution save sites in `public/js/admin/downtime-views.js`:
  - Project roll (in-line `showRollModal` flow)
  - Feeding roll (`feeding_roll` field)
  - Merit roll (in-line `showRollModal` flow)
  - `handleProjectRollSave` (legacy public-shape handler)
- [x] Task 4 — Admin boot wire: `applyOverlayToAll(chars, globalEnabled)` in `admin.js` init so DT view's `characters` array has overlay applied before the ST clicks Resolve (STM-7 only wired suite app's `app.js`, leaving admin parity for STM-8).
- [x] Task 5 — Retroactive STM-7 story file folded into this PR per Khepri's process-restoration note.
- [x] Task 6 — 9 vitest cases covering math-invariant rejection (3 shapes), malformed snapshot, always-write convention (empty mods + base === final), active-mods round-trip, feeding_roll round-trip, survives-mod-revocation regression, and existing player-PUT auth boundary preservation.

## Acceptance Criteria

1. Math invariant enforced server-side; reject 400 if `final !== base + Σ delta` — ✅
2. DT admin resolution writes `pool_snapshot` at resolve time — ✅
3. Always-write convention (empty `mods` + base === final when no mods) — ✅
4. Schema/storage round-trip preserves the field — ✅ (additionalProperties: true + 2 round-trip tests)
5. STM-6 audit view + STM-5 admin panel unchanged (snapshot is its own record) — ✅
6. ≥3 new vitest cases — ✅ 9 added
7. No regression — ✅ 1021/1021 server tests pass
8. Manual smoke — needs Peter (create Presence mod → submit DT action → ST resolves → verify snapshot stored; revoke mod → re-load → snapshot intact)

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **Snapshot scope: captures ALL active mods on the character at resolution, not action-aware filtering.** Per STM-8 issue §scope, the snapshot is a historical record of mod state at resolution, not just the contributing subset. A future story could refine to per-stat-path action-aware filtering if ST debugging surfaces a need. Documented in `buildPoolSnapshot` JSDoc.
- **Math invariant by construction.** Client computes `base = finalPool − Σ delta` so the invariant always holds for client-emitted snapshots. The server validator is a defence against malformed payloads from buggy/malicious clients, not normal flow.
- **Admin-boot overlay parity.** STM-7 wired `applyOverlayToAll` only in `app.js` (suite). STM-8 adds the same boot wire to `admin.js` init because the DT resolution path runs in the admin app and reads `c._st_mod_overlay` — without admin overlay at boot, the snapshot would capture empty mods unless the ST happened to open the character sheet first (which mutates that one char). Scope-creep from STM-7's strict surface but necessary for STM-8 to function; documented in PR body.
- **Validator scope-tight by key name.** `_validatePoolSnapshots` only inspects values when the key is literally `pool_snapshot` (or ends with `.pool_snapshot` for dot-notation). Other objects that happen to have `base/mods/final` fields aren't false-positive flagged.
- **Worktree pattern** continued (no branch-mix-up).

### File List

- `server/routes/downtime.js` (modified) — `_validatePoolSnapshots` helper + invariant guard on POST and PUT handlers
- `public/js/admin/downtime-views.js` (modified) — `buildPoolSnapshot` helper + `_charForSub` resolver + 4 resolution save sites wired
- `public/js/admin.js` (modified) — `applyOverlayToAll` at boot init (admin parity with STM-7's suite-app wire)
- `server/tests/stm-8-pool-snapshot.test.js` (new) — 9 vitest cases
- `specs/stories/issue-415-stm-8-dt-pool-snapshot.story.md` — this file
- `specs/stories/issue-413-stm-7-boot-time-overlay.story.md` — retroactive STM-7 story file folded in per Khepri's process-restoration note

### Change Log

- 2026-05-20 (Ptah): STM-8 initial implementation
