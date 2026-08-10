# Story CM-1: Phase order as data, `prep` as a first-class phase, feeding opens on prep

Status: ready-for-dev

> **Ruling document: `D:\Terra Mortis\cycle-model.md` (Rev 2, 2026-08-10) — §7 and §11. Read it
> before implementing.** This story extends TM Suite issue #1028; where they differ, Rev 2 wins
> (the phase is named `prep`, not `feeding`; an admin Prep control IS in scope; the server write
> gate IS in scope — all three supersessions are explained in Dev Notes).
>
> **Deploy plan (Rev 2 §11):** branch from `main`, PR direct to `main` (never through `dev`,
> which carries the oath work behind #1128), deploy **Wednesday 2026-08-13**, then merge `main`
> back into `dev`. Angelus owns go/no-go; Symon runs the hand-test script below. Game 7 is
> Saturday 2026-08-15 and this story is what opens feeding for it.

## Story

As the Storyteller running Chapter 7,
I want a cycle's phase to be first-class data with one canonical reader and writer, including a
`prep` phase during which feeding is open,
so that players can make their feed rolls before Game 7 without me falsely asserting a game is
running, and no pair of phase representations can ever desync again.

## Acceptance Criteria

1. **Schema (additive).** `downtimeCycleSchema` (`server/schemas/downtime_submission.schema.js:565`)
   gains `phase_sequence` (array, items enum exactly `['downtime','processing','prep','game']`) and
   `phase` (`{ type: ['string','null'], enum: ['downtime','processing','prep','game', null] }`;
   null = legacy). The legacy `game_phase` enum is unchanged (it never gains `prep`). The legacy
   `status` enum is unchanged.
2. **Pure shared phase module.** A new module (suggested: `public/js/downtime/cycle-phase.js`)
   exports `CYCLE_PHASE_SEQUENCE`, `statusToPhase()`, `cyclePhase(cycle)` (= `cycle.phase` if set,
   else `statusToPhase(deriveCycleStatus(cycle))` with `prep→null, active→'downtime',
   game→'game', closed→'processing'`), `phaseIndex(cycle, phase)`, and the mirror table. It
   imports **nothing with I/O or browser globals** so the client (`db.js`), the **server routes**,
   and the **tests import it directly** — deliberately killing the mirror-the-function-in-the-test
   convention for this logic (that convention exists only because `db.js` imports `api.js`, which
   touches `location` at module load; see `server/tests/derive-cycle-status.test.js:8-12`).
3. **Canonical writer.** `setCyclePhase(cycle, phaseOrNull)` is the ONE place a phase write
   happens: a single PUT writing all three representations atomically per the Rev 2 §7 table —
   `downtime→(downtime, active)`, `processing→(processing, closed)`, **`prep→(processing,
   closed)`**, `game→(game, game)`, `null→(null, legacy phase_signoff derivation)`. The `null` row
   preserves #918 clear-to-neutral semantics exactly.
4. **Every phase write site routes through it.** The verified inventory (Dev Notes §Write sites)
   is rewired: `writePhase` (`cycle-views.js:~229` — its Game-phase confirm dialog and tracker
   reset stay exactly where they are, before the write, and fire **only** on `'game'`, never on
   `'prep'`), `closeCycle` (`db.js:51` — gains its `closed_at` alongside; this is the #1006 fix),
   `openGamePhase` (`db.js:55` — gains `game_phase_at` alongside). `signoffPhase` (`db.js:91`) and
   `setManualOpen` (`db.js:112`) stay **byte-identical** (the legacy sign-off lane derives status
   through `deriveCycleStatus` already and never sets `phase`). `createCycle` (`db.js:19`) is
   unchanged (its `status:'prep'` default is the LEGACY pre-downtime meaning — see the naming
   hazard in Dev Notes). If the enumeration task (AC 10) finds any further write site, it is
   rewired or the story halts for a ruling — no exceptions left standing.
5. **Server write gate becomes phase-aware (the 423 trap).** `requireOpenCycle`
   (`server/routes/downtime.js:~37`) currently returns **423 on every submission PUT when
   `cycle.status === 'closed'`** — and the mirror writes `status:'closed'` during prep, while the
   feed roll is written via exactly that route (`feeding-tab.js:1035` → `PUT
   /api/downtime_submissions/:id`). Without this AC, prep locks feeding. Required behaviour:
   - Cycle has a `phase` field: **feeding-field-only writes** (the existing `FEEDING_FIELDS` set:
     `feeding_roll_player`, `feeding_vitae_allocation`, `feeding_deferred`) are allowed when
     `cyclePhase(cycle) ∈ {prep, game}`; general submission writes are allowed only when
     `cyclePhase(cycle) === 'downtime'`; otherwise 423. The `out_of_window_player_ids` exception
     is preserved unchanged in all cases.
   - Cycle has **no** `phase` field (every existing document): behaviour **byte-identical to
     today**. This is the both-dialects criterion applied to the server.
6. **Feeding opens on `phase ∈ {prep, game}` (client).** The three verified feeding-gate readers
   are rewired through the canonical reader: `getGamePhaseCycle` (`db.js:126-129`) becomes
   phase-aware (a cycle whose `cyclePhase` is `prep` or `game` is the feeding cycle; on legacy
   docs it resolves exactly as today via the `deriveCycleStatus` fallback, closing the #1001
   residue); `feeding-tab.js:111` (primary lookup) and `player.js:450` (the feeding tab's
   `cycle-open` indicator) follow through it. The #537 stale-roll guard in `feeding-tab.js:134-142`
   keeps working against both dialects.
7. **Admin can set Prep.** The Cycle tab's phase buttons (`cycle-views.js:10` `PHASES`) gain
   `prep` (labelled "Prep"), routed through `setCyclePhase`. Setting Prep never triggers the
   tracker reset or its confirm dialog. *(Supersedes #1028's "no UI sets the new phase yet" — Rev
   2 §11 requires Angelus to place Chapter 7 into prep this week; without this control the phase
   would only be settable by script.)*
8. **POST default-injection.** `POST /api/downtime_cycles` (`server/routes/downtime.js:81`)
   default-injects `phase_sequence` when the body lacks it. `phase` is NOT defaulted (new cycles
   start with no phase = legacy null).
9. **The mirror is server-persisted.** Legacy fields are written to the document itself by
   `setCyclePhase`, so a stale browser tab running pre-deploy JS reads a coherent old-model state
   from the API. (Rev 2 §7; verified consequence of AC 3 — called out so nobody "optimises" the
   mirror into a computed response field.)
10. **The four-repo reader enumeration exists as a written artefact** (first task, before any
    code): every reader of `status` / `game_phase` / the phase surface across TM Suite, TM Wiki,
    TM Cockpit, TM Herald, each classified `rewired here` / `correct-under-mirror` /
    `wiki-side follow-up` / `not affected`. The Dev Notes seed below is the starting point, not
    the answer — the enumeration must be re-run, and any NEW finding beyond the seed is flagged
    to Angelus before the mirror mapping is treated as final (Rev 2 §7 holds it open on exactly
    this).
11. **Tests (targeted vitest, `server/tests/`; the full suite is NOT the gate — Dev Notes).**
    - Schema accept/reject matrix: `prep` legal in `phase`, illegal in `game_phase`; sequence enum
      exact.
    - `cyclePhase` mapping matrix including a desynced doc (`status:'active'` stale +
      `game_phase:'game'`) resolving to `'game'`, and every legacy-only doc resolving as today.
    - The `setCyclePhase` five-row table, asserting all three representations per row.
    - `requireOpenCycle` phase-aware matrix: feeding-fields PUT in prep → allowed; general PUT in
      prep → 423; both against a no-`phase` doc → today's behaviour; `out_of_window` exception in
      all branches.
    - A golden transition matrix: every UI-reachable flip produces today's intended
      `{status, game_phase}` pair plus the new `phase`.
    - Existing `derive-cycle-status` and `epic.708.1` suites green unchanged; the pure module
      imported directly, no new mirrors.
12. **Symon's hand-test script** ships in this story file (below), executed against production
    after Wednesday's deploy, initialled before Angelus sets the live chapter to prep.

## Tasks / Subtasks

- [ ] Task 1 (AC 10): Reader/writer enumeration — grep all four repos for `status`, `game_phase`,
      `deriveCycleStatus`, `getGamePhaseCycle`, phase-string literals; write the classified
      artefact into this story's Dev Agent Record; diff against the Dev Notes seed; flag novelties.
- [ ] Task 2 (AC 2): Pure module `cycle-phase.js` — move/implement `deriveCycleStatus` re-export
      or import strategy so client, server, tests share one implementation (keep
      `db.js.deriveCycleStatus` as the imported symbol so its 14-odd readers are untouched).
- [ ] Task 3 (AC 1, 8): Schema fields + POST default-injection.
- [ ] Task 4 (AC 3): `setCyclePhase` in `db.js` (client) writing via one `updateCycle` call.
- [ ] Task 5 (AC 4): Rewire `writePhase`, `closeCycle`, `openGamePhase`; verify `signoffPhase` and
      `setManualOpen` byte-identical.
- [ ] Task 6 (AC 5): Phase-aware `requireOpenCycle` (server imports the pure module).
- [ ] Task 7 (AC 6): Feeding gate + indicator rewiring.
- [ ] Task 8 (AC 7): Admin Prep button.
- [ ] Task 9 (AC 11): Tests.
- [ ] Task 10 (AC 12): Run Symon's script on prod post-deploy; record results here.
- [ ] Task 11: PR to `main`; after merge + deploy, merge `main` back into `dev`.

## Symon Hand-Test Script (AC 12 — run on production, Wednesday, ~10 minutes)

Test cycle: create a THROWAWAY cycle via the admin Cycle tab (never the live Chapter 7 document).

1. New cycle, no phase set → player Downtime tab indicator off, Feeding tab closed. (Legacy null.)
2. Set phase Downtime → downtime form open; feeding closed.
3. Set phase Processing → downtime form closed (423 on a general submission edit); feeding closed.
4. Set phase **Prep** → **feeding form OPEN; a feed-roll save succeeds (200, not 423)**; a general
   submission edit still 423s; no tracker-reset dialog appeared; admin DB view of the cycle shows
   `phase:'prep'`, `game_phase:'processing'`, `status:'closed'`.
5. Set phase Game → confirm dialog appears (do NOT accept on any real data — accept only on the
   throwaway); feeding still open.
6. Stale-tab check: with a tab loaded BEFORE the deploy, view the throwaway cycle in prep → it
   reads as processing/closed, no game-start behaviour, no error.
7. Sign-off lane regression: on the throwaway, toggle a `phase_signoff` sign-off → status derives
   exactly as before (matrix in `derive-cycle-status.test.js:15-20`).
8. Delete the throwaway cycle.

## Dev Notes

### The three meanings of "prep" (naming hazard — do not conflate)

1. `status: 'prep'` (legacy enum, `schema:577`; `createCycle` default `db.js:19`) = "ST is setting
   the cycle up, downtime not yet open" — the START of the cycle.
2. `phase_signoff.prep` (DTUX-1 lane, `db.js:70`) = the first ST sign-off checkbox.
3. **`phase: 'prep'` (THIS story)** = the game-prep window between processing and game — near the
   END of the cycle. `statusToPhase` maps legacy `status:'prep'` to `null`, never to `'prep'`.
   Any test or reader comparing "prep" must say WHICH field it reads.

### Write sites of `status`/`game_phase` (verified 2026-08-10 — the AC 4 inventory seed)

| Site | Writes | Disposition |
|---|---|---|
| `db.js:19` `createCycle` | `status` (default `'prep'`, legacy meaning) | unchanged |
| `db.js:51` `closeCycle` | `status` alone (the #1006 bug) | → `setCyclePhase('processing')` + `closed_at` |
| `db.js:55` `openGamePhase` | `status` alone + `game_phase_at` | → `setCyclePhase('game')` + `game_phase_at` |
| `db.js:91` `signoffPhase` | `status` (derived) + `phase_signoff` | byte-identical |
| `db.js:112` `setManualOpen` | `status` (derived) + `manual_open*` | byte-identical |
| `cycle-views.js:~229` `writePhase` | `game_phase` alone (the #1001 bug) | → `setCyclePhase`; confirm+tracker reset stay, `'game'` only |
| `server routes` | none write phase fields server-side (PUT is a raw `$set` passthrough, `routes/downtime.js:542`) | — |

### Reader seed (AC 10 starting point — re-verify, do not trust)

- **TM Suite:** `db.js:14` (`getActiveCycle`, `status==='active'`), `db.js:126-129` (feeding gate),
  `downtime-views.js:1244` (`isGame`), `downtime-form.js:1718` (`isGame`),
  `feeding-tab.js:111,134-142`, `player.js:450`, `requireOpenCycle` (`routes/downtime.js:~37`,
  **server**, the 423 gate), `confirm-feeding` route (`status==='closed'` check),
  deadline check inside submissions PUT (manual_open + deadline_at). Under the mirror,
  `getActiveCycle` correctly reports no-active during prep (downtime window IS over) and both
  `isGame` readers stay false until real game phase — believed correct-under-mirror; confirm.
- **TM Wiki:** `server/downtime-cycle-phase.js` — the 11-1 stub. Reads `cycle.phase` **verbatim
  when present** and its local `CYCLE_PHASE_SEQUENCE` still says `'feeding'`, not `'prep'`. When
  Suite starts writing `phase:'prep'`, the Wiki's gate reads an unknown-to-it phase and fails
  SAFE (form closed). **Wiki-side constant update is a follow-up in that repo, not this story's
  code** — record it in the enumeration artefact as `wiki-side follow-up`.
- **TM Cockpit:** grep found only a display echo (`scripts/set-cycle-deadline.mjs:81-86`). The
  feared feeding-window inference on `status==='game'` did NOT appear in `lib/`/`scripts/` —
  re-verify during Task 1, then record; the guardrail block in Cockpit's session-start stands
  regardless.
- **TM Herald:** no phase readers found; re-verify.

### Existing behaviour that must not change

- `deriveCycleStatus` (`db.js:72-89`) is richer than #1028 described: `game_phase` override first,
  then closed-wins (`ps.projects`), then `manual_open === true` (strict) → `'active'`, then the
  sign-off ladder. The behaviour matrix is documented at `derive-cycle-status.test.js:15-20`.
  `cyclePhase` wraps it; it does not reimplement it.
- The tracker reset (`writePhase`: confirm dialog + `DELETE /api/tracker_state`) fires ONLY on
  entering `'game'`. Prep must never trigger it — that is the §1 contamination this model exists
  to prevent.
- `_id` is a creation-order proxy in two places (`cycle-views.js:17` `byIdDesc`, and the GET
  cycles sort `routes/downtime.js` issue #321) — display ordering only. Do not introduce any NEW
  `_id`-order dependence; creation order ≠ game order (verified live: 2,3,1,4,5).

### Environment and process

- **Branch from `main`. PR direct to `main`.** Never through `dev` (37 oath commits behind
  release blocker #1128 sit there). After merge: merge `main` back into `dev`.
- **The full test suite is not trusted** (4 permanent reds: `epic.708.3-cycle-phase-controls`
  [#1116], `n7-n9-allocator-readers` [#1115]; `issue-836` errors at collection [#1125]; mongod
  absent silently skips 1074 tests [#1117]). Run ONLY the targeted specs (`cd server && npx
  vitest run <files>`), never piped through `tail`. Note: #1116's stale assertions are in
  `epic.708.3-cycle-phase-controls.test.js`, which covers the exact UI this story touches — do
  not "fix" it in passing; it is its own issue. Symon's hand script is the real gate.
- **Never hand-edit the live cycle document** (`6a57581d08c8efbdee14ca71`, Chapter 7, 32
  submissions, mid-processing). This story must work against un-migrated documents as its primary
  case and must not require stories 2-4 to have run.
- Local dev: root `.env` is active; `node index.js` from `server/`; dev-fixtures interceptor
  patches fetch under local-test-token — no new endpoints are added here so no new handler needed.
- British English, no em-dashes in any player-facing string; new UI reuses `cy-phase-btn` styling
  (the Prep button is a fourth sibling, no new CSS).

### References

- Ruling: `D:\Terra Mortis\cycle-model.md` Rev 2 §1, §6a, §7, §9, §11
- Issue: TerraMortis #1028 (original CM-1; superseded on phase name, UI scope, server-gate scope)
- Code: `public/js/downtime/db.js:14-129`, `public/js/admin/cycle-views.js:4-17,229-241`,
  `server/routes/downtime.js:37-66,81,542,770-830`, `server/schemas/downtime_submission.schema.js:565-600`,
  `public/js/tabs/feeding-tab.js:105-150,1035`, `public/js/player.js:446-457`,
  `server/tests/derive-cycle-status.test.js:1-20`
- Cross-repo: `TM Wiki/server/downtime-cycle-phase.js` (stub contract),
  `TM Cockpit/.claude/session-start.md` Step 0.5 (guardrail)

## Dev Agent Record

### Agent Model Used

### Reader Enumeration Artefact (Task 1 — fill before coding)

### Debug Log References

### Completion Notes List

### File List
