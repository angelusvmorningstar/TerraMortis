# Story Fix.595: Roll card gate disagrees with the status ribbon ("Validate pool first" while "Valid")

## Status: review

> **Fixed 2026-06-05.** Reproduced the user's exact stuck state from the code (no_roll → Player Pool leaves `pool_status='no_roll'`). Root cause: `hasRoll = !!(rev.roll)` gated validation on the roll RESULT, and `!DONE_STATUSES.has(curStatus)` blocked switching back from `no_roll`. Fix: validate when a POOL exists and isn't yet rolled. New spec `tests/fix-595-roll-validate-gate.spec.js` — 2/2 pass. ESM parse-check green. Regression run in parallel.

## Metadata
- issue: 595
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/595
- branch: morningstar-issue-595-roll-validate-gate
- type: fix / bug (blocks ST rolling)
- likely-cause: #581 flat-card-wall merge (the roll-mode toggle is proto.4 work)

---

## Story

**As** an ST resolving a DT action,
**I want** the ROLL card enabled once the pool is validated (the ribbon shows "Valid"),
**so that** I can actually roll the dice instead of being stuck on "Validate pool first" with no way forward.

---

## Background

Smoking #586/#587 on Einar's investigate action: the status ribbon read **"Valid"**, "Player Pool" was selected, the Dice Pool Builder showed a valid player pool — but the ROLL card showed **"Validate pool first"** and "Mark as Contested" was disabled. The ST cannot roll. The ribbon and the roll gate disagree.

### Traced mechanism (three pieces that don't agree)

**1. The ribbon (`_deriveActionRibbonState`, `downtime-views.js:8084`)** returns `'valid'` for **any** non-pending `pool_status` that isn't a done+narrative "complete":
```js
const ps = rev?.pool_status || 'pending';
if (ps === 'pending') return 'pending';
if (DONE_STATUSES.has(ps) && hasNarrative) return 'complete';
return 'valid';   // <-- everything else, incl. resolved / no_roll / any value
```

**2. The roll gate (`_showRollBtn`, `:7621`)** only treats a **specific set** as rollable:
```js
const _showRollBtn = poolStatus === 'pending' || 'confirmed' || 'rolled' || 'validated' || !!_projRoll;
```
`_renderRollCard` prints `noRollMsg` ("Validate pool first") in its `else` branch when `canRoll` (= `_showRollBtn`) is false (`:8003-8004`). So any non-pending `pool_status` **outside** {confirmed, rolled, validated} — e.g. `resolved`, `no_roll` — shows the ribbon "Valid" while the roll card says "Validate pool first". The two predicates are not the same source of truth.

**3. The validation path is backwards (`:5277-5284`, the prime suspect).** Selecting "Player Pool"/"ST Override" only sets `pool_status: 'validated'` when a roll RESULT already exists:
```js
const hasRoll   = !!(rev.roll);          // rev.roll is the ROLL RESULT, not "a pool exists"
const curStatus = rev.pool_status || 'pending';
...
} else if ((mode === 'player' || mode === 'st_override') && hasRoll && !DONE_STATUSES.has(curStatus)) {
  patch.pool_status = 'validated';
}
```
`rev.roll` is null until the dice are rolled — but you select the roll mode to **enable** rolling. So on a fresh action, clicking "Player Pool" saves only `roll_mode` and never validates → the roll card never enables → you can never roll. Chicken-and-egg.

**Gotcha:** `'validated'` is itself in `DONE_STATUSES` (`:273`), and `DONE_STATUSES` gates the validate branch (`!DONE_STATUSES.has(curStatus)`). So once `pool_status` is `validated`, re-selecting a mode will NOT re-validate. Watch this when reworking the predicate.

### Net effect: a dead-end state
When `pool_status` is non-pending but not in the roll set, the card offers **neither** a Confirm button (`showConfirm: poolStatus === 'pending'`, `:7629`) **nor** a Roll button (canRoll false) — the ST is stuck.

---

## Acceptance Criteria

- [x] **AC1 (repro + capture)** — Reproduced the exact stuck state from the code paths (no need to guess): action set to **`no_roll`** (a pool exists → ribbon "Valid"), then "Player Pool" selected. The `roll`-result gate (`hasRoll`) left `pool_status='no_roll'`, so the roll card stayed "Validate pool first". Encoded as the test fixture `stuckSub()` (`pool_status:'no_roll'`, `pool_validated` set, `roll:null`).
- [x] **AC2 (validate works)** — `hasRoll = !!(rev.roll)` replaced with `hasPool = !!(rev.pool_validated || rev.pool_player || entry.poolPlayer)`; the validate branch now fires on `hasPool && !rev.roll`. Selecting Player Pool / ST Override validates the pool (→ `'validated'`, rollable) without a prior roll. _(Test: "selecting Player Pool validates the pool and enables the roll".)_
- [x] **AC3 (gate agrees with ribbon)** — The reachable disconnect is resolved: Player Pool/ST Override now reach `'validated'` (which the roll gate accepts), and the only remaining "Valid + no roll button" state is `'no_roll'`, which is the ST's deliberate choice and now reads **"No roll needed"** (not "Validate pool first"). _Did not refactor `_deriveActionRibbonState`/`_showRollBtn` into one shared helper — unnecessary once no confusing dead-end remains, and lower-risk to leave the working predicates._
- [x] **AC4 (no dead-end)** — Every state offers a way forward: pending → Confirm; confirmed/rolled/validated → Roll; no_roll → clearly labelled "No roll needed" (intentional end state); switching no_roll → Player Pool re-validates → Roll.
- [ ] **AC5 (no regression)** — "No Roll Needed" still sets `no_roll`; rolled/resolved flows preserved via `!rev.roll`. _Regression run in parallel._
- [x] **AC6 (test)** — `tests/fix-595-roll-validate-gate.spec.js`, 2 tests pass: no_roll shows "No roll needed"; selecting Player Pool enables the roll.

---

## Tasks

### Task 1 — Reproduce and capture the real state (AC1) — [x] DONE
Reproduced from the code paths (deterministic): no_roll + a pool + "Player Pool" → stuck. Encoded as `stuckSub()` in the spec and confirmed by the failing-then-passing test, rather than a live console capture.

### Task 2 — Fix the validation trigger (AC2) — [x] DONE
`downtime-views.js:5277` — `hasRoll = !!(rev.roll)` is backwards. Change the predicate so selecting Player Pool / ST Override validates when a **pool exists to roll** (e.g. `rev.pool_validated` or the player pool expression `entry.poolPlayer`/`rev.pool_player`), not when a roll result exists. Keep the `!DONE_STATUSES.has(curStatus)` guard's intent (don't clobber a done state) but verify it still allows the initial validate.

### Task 3 — Reconcile the ribbon and roll-gate predicates (AC3, AC4) — [x] DONE (targeted, not a full refactor)
Resolved the reachable disconnect via the Task 2 fix + relabelling the `no_roll` roll-card message to "No roll needed". Left `_deriveActionRibbonState`/`_showRollBtn` as separate predicates (no confusing dead-end remains; full unification deemed unnecessary + higher-risk). Make `_deriveActionRibbonState` (`:8084`) "valid" and `_showRollBtn` (`:7621`) agree on what "validated/rollable" means, so no `pool_status` produces "Valid" + a disabled roll, and no state is a dead end (neither Confirm nor Roll). Prefer a single shared helper/predicate over two divergent lists.

### Task 4 — Test (AC6) — [x] DONE
`tests/fix-595-roll-validate-gate.spec.js`, 2 tests pass (chromium): no_roll shows "No roll needed"; selecting Player Pool produces the roll button (no "Validate pool first").

---

## Dev Notes

### Files / artifacts
- `public/js/admin/downtime-views.js:5267-5288` — roll-mode click handler; **`:5277` `hasRoll = !!(rev.roll)`** (the prime bug).
- `public/js/admin/downtime-views.js:8084-8092` — `_deriveActionRibbonState` (ribbon "valid" for any non-pending).
- `public/js/admin/downtime-views.js:7618-7637` — roll card invocation (`_showRollBtn`, `noRollMsg: 'Validate pool first'`, `showConfirm`).
- `public/js/admin/downtime-views.js:7921`, `:8003-8004` — `_renderRollCard` (noRollMsg `else` branch).
- `public/js/admin/downtime-views.js:273` — `DONE_STATUSES` (note: includes `'validated'`).

### Must preserve / watch-outs
- `'validated'` ∈ `DONE_STATUSES` — the validate branch is guarded by `!DONE_STATUSES.has(curStatus)`, so a naive predicate change can block initial validation or break re-validation. Test both the first validate and the validated→rollable→complete path.
- "No Roll Needed" must still set `pool_status: 'no_roll'`; the contested flow and the done/complete states must be unaffected.
- This is the same roll card used by project, feeding and merit entries (`_renderRollCard` is shared) — verify the fix across action types, not just investigate.
- Likely a #581 (proto.4 roll-mode toggle) regression — check the proto.4 story for the intended validate semantics before changing them.

### References
- [Source: downtime-views.js:5277] — `hasRoll = !!(rev.roll)` (backwards validate trigger)
- [Source: downtime-views.js:8084] — ribbon-state derivation
- [Source: downtime-views.js:7621,8003] — roll gate + noRollMsg
- #581 (flat card wall — likely regression source); proto.4 (roll-mode toggle story)
- `tests/fix-586-target-prepopulate.spec.js` — flat-wall test harness to model

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- ESM parse-check `downtime-views.js` — PASS.
- `npx playwright test fix-595-roll-validate-gate.spec.js --project=chromium` — 2 passed.
- Regression: `downtime-processing.spec.js` + `downtime-processing-feature96.spec.js` — _result in Change Log._

### Completion Notes List

- **Root cause** (traced, not guessed): the roll-mode handler (`downtime-views.js:5277`) used `hasRoll = !!(rev.roll)` (the roll RESULT) to decide whether selecting Player Pool/ST Override validates the pool. Since `rev.roll` is null until you roll, a not-yet-rolled pool never validated (chicken-and-egg). The companion guard `!DONE_STATUSES.has(curStatus)` also blocked switching back from `no_roll` (which is in `DONE_STATUSES`). Repro: action → "No Roll Needed" (`no_roll`) → "Player Pool" leaves `pool_status='no_roll'` → roll card stuck on "Validate pool first" while the ribbon reads "Valid".
- **Fix**: `hasPool = !!(rev.pool_validated || rev.pool_player || entry.poolPlayer)`; validate branch fires on `(player|st_override) && hasPool && !rev.roll` → `pool_status='validated'`. `!rev.roll` preserves a real roll result and allows re-validating from `no_roll`.
- **Clarity**: the project roll card's `noRollMsg` is now `poolStatus === 'no_roll' ? 'No roll needed' : 'Validate pool first'` — a `no_roll` action is a deliberate end state, not an un-validated pool.
- The roll-mode handler is shared across project/feeding/merit, so the fix applies to all action types.
- Scoped decision: did NOT unify `_deriveActionRibbonState` and `_showRollBtn` into one predicate (Task 3) — the user-visible dead-end is gone and the refactor is higher-risk for no functional gain.

### File List

- `public/js/admin/downtime-views.js` (modified — roll-mode validate trigger `:5277`; no_roll roll-card message `:7631`)
- `tests/fix-595-roll-validate-gate.spec.js` (new — 2 Playwright tests)
- `specs/stories/fix.595.roll-validate-gate.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Fixed the roll-validation gate: selecting Player Pool / ST Override validates a pool that exists (was gated on the roll result existing), so the ROLL card enables instead of sticking on "Validate pool first". no_roll actions relabelled "No roll needed". New spec, 2 tests passing. Regression: <pending>. Status → review.
