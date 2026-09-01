# Pass 2 — Edge Case Hunter findings — p0-coordinator-role-ownership-bypass

> Persisted by the orchestrating session from Codex's stdout/`-o` last-message output. Codex's own
> `apply_patch` write to this path was rejected by the read-only sandbox it ran under; the findings
> below are its unmodified final response text.

## High

- None found.

## Medium

- None found.

## Low

### [Pass 2] Coordinator bypass remains on the player-facing attendance PATCH

- **Severity**: Low
- **File:line**: `server/routes/attendance.js:123`
- **Trigger**: A coordinator sends `PATCH /api/attendance/<session>/<another-character>` with `{ "downtime": true }`.
- **Consequence**: The player-only ownership branch is skipped and the other character's `attendance.$.downtime` flag is updated. This field contributes game XP.
- **Confidence**: High.
- **Severity rationale (Codex's own)**: Coordinators can already overwrite this field through the broader authorized `PUT /api/game_sessions/:id`, limiting the net privilege increase.

### [Pass 2] Static regression scan omits relevant authorization surfaces

- **Severity**: Low
- **File:line**: `server/tests/p0-coordinator-role-ownership-bypass.test.js:31`
- **Trigger**: Reintroduce the vulnerable comparison in `characters.js`, `ordeal-retirement.js`, or another route such as `attendance.js`.
- **Consequence**: The static suite still passes because it scans only five hand-picked route files. It omits two files changed by this commit and did not detect the remaining attendance comparison.
- **Confidence**: High.

### [Pass 2] Advertised DB-free static suite is blocked by the global DB precondition

- **Severity**: Low
- **File:line**: `server/tests/p0-coordinator-role-ownership-bypass.test.js:12`; `server/vitest.config.js:12`
- **Trigger**: Run the static suite normally without reachable MongoDB infrastructure.
- **Consequence**: Global setup aborts before collection. The supposedly portable 13-test static gate executes zero tests.
- **Confidence**: High; reproduced directly.

## Validation notes (Codex's own attestation)

- `requireRole('coordinator')` admits coordinator/ST/dev. `requireRole('st')` admits ST/dev and rejects coordinator.
- The five non-game-session routers have authentication-only mounts. `game_sessions` has the coordinator-tier mount.
- Missing, malformed, unknown, player, and coordinator roles all return false from `isStRole`, so the new ownership gates fail closed.
- Coordinator accounts may legally have `character_ids`. Owned-character reads pass; unowned reads fail. Missing arrays are consistently guarded.
- `ORDEALS_RETIRED` and `FORM_RETIRED` are both currently `true`.
- `stripStReview` mutates documents in place and successfully redacts its fields.
- Remaining live player-role comparisons:
  - `attendance.js:123`: reported above.
  - `downtime.js:609,663`: explicit player-only actions that deny coordinators (not a bypass risk shape).
  - `npc-flags.js:57`: explicit player-only signal that denies coordinators (not a bypass risk shape).
- Custom read-only validation: **41/41 passed, 0 failed** (Codex's own hand-written static checks, not this repo's vitest suite).
- Vitest: **0 tests executed**. Default loading failed on read-only temp creation; the runner loader reached global setup but MongoDB failed with `connect EACCES` (sandbox network block, not a real infrastructure failure — see Pass 3 for the orchestrating session's real, already-verified vitest numbers).

Files inspected included the affected routes and middleware, `auth.js`, `index.js`, both retirement constants, `strip-st-review.js`, player/game-session schemas, attendance/npc/player routes, Vitest configuration and setup helpers, and relevant regression tests. Codex states it did not use deferred-work.md or sprint-status.yaml as ground truth.

No source files were modified. The final reviewed-source `git diff` was empty. Additional unrelated worktree files (a concurrent, unrelated audit session in the same checkout) appeared during the review and were left untouched.
