# Story CM-5a: Carry-over survives prep — the tracker reset moves to Prep entry

Status: review

> **Ruling document: `D:\Terra Mortis\cycle-model.md` Rev 2 §2 and §11 (story 5).** No GitHub
> issue — epic-internal story, tracked in sprint-status per §11. Deploy target: **Friday daytime
> 2026-08-14**, go/no-go Angelus Friday evening, Game 7 Saturday.
>
> **Branch from `main` (post-`43fae0fd`, CM-1 live).** PR direct to `main`. Story 5b (player
> spend buttons) remains deferred and is NOT this story.

## The discovery that reshaped this story (research 2026-08-10, verified line refs)

The planned "carry-over apply" ALREADY EXISTS in production:

1. **Feeding confirm writes the tracker — pressed by an ST, not the player.**
   `public/js/tabs/feeding-tab.js:962-964` PUTs `{ vitae, influence }` to
   `/api/tracker_state/:charId` ("single source of truth for tracker state"), keeps tracker.js's
   in-memory cache in sync, and marks `vitae_confirmed`. **CORRECTED AT REVIEW:** this sits
   inside `if (isST)` (`:782`, the ST CONFIRM PANEL) and is the only `tracker_state` PUT in
   `public/`. The player rolls; **an ST presses Confirm Feed per character** and that is what
   carries the vitae. Event-driven and per-character as §2 wants — but it is ST work spread
   across the prep week, not an automatic consequence of the player's roll. The operational win
   is the spreading, not the removal, of those confirmations.
2. **Influence self-reconciles.** `public/js/game/tracker.js:181-230` (`reconcileInfluenceDT`):
   on tracker init, reads the last closed cycle **by game_number**, parses each submission's
   `influence_spend`, and writes `influence = max − spent` as an ABSOLUTE SET — idempotent by
   construction, no marker needed.
3. **Sign-in displays both** (`signin-tab.js:253-261`, `Math.min(feedVitae, vMax)`), read-only —
   correct as the verification surface.

**The actual defect is timing.** Entering Game phase fires `DELETE /api/tracker_state` (all
docs; `cycle-views.js` `writePhase` game branch, confirm dialog + reset), and `defaults(c)`
recreates every tracker at **FULL vitae** (`tracker.js:37-46`, `calcVitaeMax`). Under the old
model players fed AFTER that reset (feeding opened on status game), so their writes landed on
fresh docs and survived. Under CM-1's prep model players feed BEFORE it — **pressing Game on
Saturday would wipe every prep-week feed roll and restore full vitae**, recreating the manual
door nightmare this week exists to kill, but worse (values would LOOK unset rather than be
visibly pending).

## Story

As the Storyteller opening Game 7,
I want the tracker slate-wipe to happen when the chapter enters Prep, and the Prep-to-Game
transition to be non-destructive,
so that feed rolls made during the prep week are the vitae players walk in with, and nothing is
loaded by hand at the door.

## The model argument (for the reviewer)

Rev 2 §2: prep IS the loading of game-starting state, and "prep and game are deliberately
seamless — no gap". The reset's purpose (fresh trackers for a new game: full WP, damage cleared,
stale conditions gone) belongs at the START of that loading window, before carry-over lands, not
at its end where it destroys what was loaded. Moving it to Prep entry makes the machinery match
the ruled model; it is not a new mechanic.

## Acceptance Criteria

1. **Prep entry resets the slate.** Setting a cycle's phase to `prep` (admin Prep button) runs
   the tracker reset that Game entry runs today: same confirm dialog (reworded for prep — plain
   British English, no em-dashes), same `DELETE /api/tracker_state`, ST-only. Cancelling the
   dialog aborts the phase change (as it does for Game today).
2. **Prep→Game is non-destructive.** When the cycle being set to `game` is currently in phase
   `prep` (its own `phase` field — never inferred from `_id` or order), the Game branch SKIPS
   the reset and its dialog entirely. The #1003 zero-submission flip guard still runs.
3. **Legacy Game entry unchanged.** Setting `game` on a cycle NOT in prep (legacy habit, prep
   skipped) behaves byte-identically to today: guard, dialog, reset.
4. **The carry-over paths keep working under prep** (verify, not build): a feed confirm during
   prep writes vitae+influence to the tracker and they SURVIVE the ST later pressing Game;
   `reconcileInfluenceDT` under prep resolves the prep cycle as its "last closed by
   game_number" (its mirror status is `closed`) and deducts the CURRENT chapter's influence
   spend; a straggler feeding at the table (game phase, post-prep) writes normally onto their
   existing tracker doc.
5. **`setCyclePhase` stays the only writer.** The reset relocation happens in the UI layer
   around the canonical writer (as the Game reset does today), not inside it — `setCyclePhase`
   remains side-effect-free data writing.
6. **Tests** (targeted vitest; the full suite is not trusted): source-wiring per the 708.1
   convention for the relocated reset (prep branch has dialog+DELETE, game branch is
   conditional on prior phase, cancel aborts); pure-logic tests for any extracted
   should-reset decision (e.g. `resetOnTransition(fromPhase, toPhase)` in `cycle-phase.js` —
   preferred, so the matrix is executable: prep→game false, null→game true, downtime→game true,
   anything→prep true); existing cm1 suite green unchanged.
7. **Hand-test script** (below) runs against production post-deploy, before the live chapter is
   put into prep.

## Out of scope (deliberate)

- **Story 5b: player spend buttons** — deferred by Angelus's ruling (hand-adjusting in-game
  spends is tolerable for one more game).
- **Willpower/damage downtime capture** — no capture mechanism exists (§2); nothing to carry.
- **Server-side apply / tracker schema hardening** — the client-write pattern at
  `feeding-tab.js:962` is the existing production pattern; hardening the tracker route
  (direction enforcement, schema) is 5b's remit. Already in the deferred register.
- **A kill-switch flag** — unnecessary here: the natural fallback IS the legacy path (skip
  prep, press Game, get today's exact behaviour, load cubes by hand). Nothing to switch off.
- **`reconcileInfluenceDT`'s session-scoped guard** re-running each session (it absolute-sets,
  so re-runs are idempotent; but note it will also re-set influence mid-game if the tracker tab
  is re-opened after in-game influence spends — PRE-EXISTING behaviour, unchanged by this
  story, recorded in the deferred register for the 5b hardening pass).

## Tasks / Subtasks

- [x] Task 1 (AC 6): extract `resetOnTransition(fromPhase, toPhase)` into `cycle-phase.js` with
      executable matrix tests.
- [x] Task 2 (AC 1-3): rewire `cycle-views.js` `writePhase` — prep branch gains guard-free
      dialog + reset; game branch consults `resetOnTransition(uiPhase(cy), 'game')`.
- [x] Task 3 (AC 4): trace-verify the three carry-over paths under prep against the real code;
      record in Dev Agent Record (no code expected).
- [x] Task 4 (AC 6): tests; run cm1 + new file + derive-cycle-status + 708.1; 708.3 baseline
      check.
- [ ] Task 5 (AC 7): hand-test on production (throwaway cycle; see script), record results.
      *(DEPLOY-GATED.)*
- [ ] Task 6: PR to `main` (Angelus's word), merge `main` back into `dev` after.
      *(GATED on Angelus's explicit word.)*

## Hand-test script (production, throwaway cycle, ~8 minutes)

1. Create a throwaway cycle. Set **Prep** → reset dialog appears; accept → all tracker cards
   reload at full defaults. *(Do NOT accept on any real data.)*
2. **As ST**, on a test character: feeding tab → make/see the roll → **press Confirm Feed**
   (the ST confirm panel; a player confirming their allocation writes nothing to the tracker —
   corrected at review). Tracker card now shows fed vitae (< max) and reduced influence.
3. Set **Game** on the same cycle → NO dialog, NO reset → tracker card still shows the fed
   values. **This is the story.**
4. **Influence-survival check (finding H).** Hard-reload the admin app and re-open the tracker.
   Does the influence deduction from step 2 survive, or has it snapped back to
   `max − downtime spend`? If it snapped back, feeding-influence must be re-applied at the
   table on Saturday — vitae is unaffected either way. Record the answer here.
5. Press **Prep** again on the same throwaway → NO reset (re-entry guard); press **Prep** while
   it is in game → NO reset. Confirmed feeds survive both.
6. On a second throwaway with phase never set to prep: set **Game** → dialog + reset appear as
   today (legacy parity).
7. Delete both throwaways.

## Dev Notes

- The Game reset today lives in `cycle-views.js` `writePhase` (`if (phaseOrNull === 'game')`:
  #1003 guard → confirm → `apiDelete('/api/tracker_state')`). The DELETE route is ST-only
  (`server/routes/tracker.js:50-56`) — unchanged.
- `uiPhase(cy)` (cycle-views) is the correct "current phase" read for the transition decision —
  label-map-guarded post-review.
- `defaults(c)` full-vitae recreation (`tracker.js:37`) is CORRECT under this design: it is the
  prep-entry slate, immediately overwritten per character as they feed.
- Do not touch `setCyclePhase`, `openGamePhase` (`db.js`) — AC 5. `handleOpenGamePhase`
  (downtime-views) enters game from the processing view; decide its reset behaviour by the SAME
  `resetOnTransition` rule (it currently has NO reset at all — a pre-existing inconsistency
  with the Cycle tab button; under this story both routes consult the same pure decision.
  Flag in review if its behaviour changes observably).
- British English, no em-dashes in dialog strings; reuse the existing confirm-dialog pattern.
- **Never touch the live cycle document** (`6a57581d…`). Branch from `main`, PR to `main`.

## Senior Developer Review

**Internal, 3 layers as parallel subagents (Blind Hunter / Edge Case Hunter / Acceptance
Auditor), Opus, 2026-08-10.** Every accepted finding was reproduced against the real code before
being acted on. Two findings falsified the story's own research premise; both are corrected in
the story text above rather than only noted here.

### The two premise corrections (the story was wrong; this is the truth)

1. **The tracker write is ST-only, not the player's.** `feeding-tab.js:964` sits inside
   `if (isST) {` — the ST CONFIRM PANEL (`:782`). It is the only `tracker_state` PUT in
   `public/`. So carry-over is not automatic on a player's roll: **an ST presses Confirm Feed
   per character**, and that is what writes vitae and influence. The win is real but smaller
   than claimed — the same confirmations, spread across a prep week instead of crammed into
   twenty minutes at the door, with the roll itself already done by the player. The research
   preamble and hand-test script are corrected accordingly.
2. **`handleOpenGamePhase` is dead code.** Repo-wide grep: one reference, its own definition.
   The "second game-entry route" this story set out to unify is unreachable, so the
   `downtime-views.js` hunk was **reverted entirely** rather than wiring a reset into a
   function nobody can call. That single revert resolved five findings at once (the
   two-different-`fromPhase`-reads hazard, the unanchored 2500-char slice test, the stale
   `allCycles` reset path, and the triple-confirm stack).

| # | Finding (layer, severity) | Triage | Resolution |
|---|---|---|---|
| A | Entering prep reset from **any** source, so a misclick on Prep (which sits beside Game in the button row) during a live session wipes all vitae/WP/damage; re-entering prep discards feeds already confirmed that week (Edge H1/M2, Blind H2, Auditor L2) | **patch** | `resetOnTransition(from,'prep')` now requires `from` to be neither `prep` nor `game`. Fails safe in code, not via a dialog STs are trained to click through. PD: revert → both new guard tests fail → restore. |
| B | Dead-code unification (Edge L1; Blind H1, Auditor M3/L1/L3 all downstream of it) | **patch (revert)** | `downtime-views.js` restored to `main`. Test rewritten to assert the route stays dead *or* gains the rule if revived. |
| C | `cm1-cycle-phase.test.js:317` still asserted "reset fires only on game, never prep" and **passed** against code that resets on prep (Auditor M1, Edge M3) | **patch** | Inverted to assert the real decision (`resetOnTransition` guard, exactly one DELETE, ordered). Comment records why, so the intent survives. |
| D | Two comments in `cycle-views.js` (`:12-14`, `:249-251`) stated the opposite of shipped behaviour (Auditor M2) | **patch** | Both rewritten. In a repo whose tests grep source text, a lying comment is how the next agent re-derives the wrong rule. |
| E | Cancel-path test regex `[\s\S]{0,120}` could match a `return false;` from another branch (Blind M5) | **patch** | Replaced with index ordering: confirm → `return false` between confirm and DELETE → DELETE → `setCyclePhase`. |
| F | "Prep gets its own wording" asserted only that `PHASE_LABELS[phaseOrNull]` is *called* — would pass while rendering "Setting to undefined phase" (Blind M6) | **patch** | Now asserts both resettable phases have real labels in the map. |
| G | **Pre-existing, caused by CM-1, shipped to production:** `issue-918-cycle-tab-management.test.js:60` asserted the pre-CM-1 toggle read and had been red since #1129 merged; its neighbour at `:63` passed vacuously (Edge L5) | **patch** | Both repaired — the toggle assertion updated to `uiPhase`, the reset assertion rewritten against `resetOnTransition`. **The external Codex review of CM-1 did not catch this**; the internal Edge layer did. Suite is green again. |
| H | `reconcileInfluenceDT` re-runs on every page load and absolute-sets `influence = max − DT spend`, discarding the feeding-influence deduction the ST confirmed during prep (Auditor H1) | **defer, with briefing** | Real, and the story's own out-of-scope note understated it: the reconcile target now lands on the *current* prep cycle, so what was an occasional reload hazard becomes likely at the prep→game boundary. The fix needs a persistent per-cycle marker — 5b-shaped, not improvised four days before a game. Added to the deferred register, to the hand-test script as an explicit check, and to the operator briefing. **Vitae carry-over is unaffected.** |
| I | DELETE precedes the phase write with no compensation; a failed write leaves the tracker wiped and the phase unchanged (Blind H3, Edge M4) | **defer** | Pre-existing shape (true of the legacy game reset too), unchanged in kind by this story. Registered. The confirm dialog already gates it and the failure surfaces inline. |
| J | Prep entry lacks the zero-submission guard that game entry has (Blind M3) | **dismiss** | That guard is about *feeding pulling from the wrong cycle*, a game-semantics check, not a wipe-safety one. Finding A addresses the wipe risk directly. |
| K | Tracker DELETE broadcasts nothing, so an open tab can resurrect wiped state on its next write; legacy localStorage migration can re-upload pre-wipe values (Edge M1/L4) | **defer** | Pre-existing across all resets; this story changes when it fires, not whether. Registered for the 5b tracker-hardening pass. |
| L | Double-click on Prep can fire two confirms/DELETEs (Edge L3); test file cwd-dependence (Blind L4); test placement under `server/tests` (Blind L5) | **dismiss** | Second DELETE is a no-op on an empty collection; cwd is fixed by the repo's own `cd server &&` convention; test placement follows every other suite here. |

**Gates after patches: 119/119 across five suites** (cm5 10, cm1 54, derive-cycle-status,
708.1, issue-918 21 — the last green for the first time since CM-1 merged). 708.3 unchanged at
its three #1116 reds. Prove-discrimination on finding A with a single-change revert.

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5), 2026-08-10 (midday AEST), bmad-dev-story inside bmad-loop.

### Task 3 — carry-over path trace (AC 4, verified against real code)

1. **Feed confirm during prep → tracker write:** feeding tab opens in prep via `getFeedingCycle`
   (CM-1, live). The confirm flow's tracker write (`feeding-tab.js:962-964`, PUT
   `/api/tracker_state/:charId` with `{vitae, influence}`) has NO phase gate on the tracker
   route (`server/routes/tracker.js` `canAccess` is ownership/role only), so it works in prep
   unchanged. With this story, pressing Game afterwards skips the reset, so the written values
   survive. VERIFIED by code read; production proof is hand-test step 3.
2. **`reconcileInfluenceDT` under prep:** selects last closed by `game_number`
   (`tracker.js:186-190`); a prep cycle mirrors to `status:'closed'` and carries the highest
   game_number, so the CURRENT chapter's influence spend is what gets deducted — the §2
   requirement, already satisfied by the existing code under the mirror. Absolute-set
   (`influence = max − spent`) so re-runs are idempotent.
3. **Straggler at the table:** game phase, tracker docs exist (created at prep-entry reset or by
   first tracker load), feed confirm writes onto the existing doc; no reset intervenes after
   prep. VERIFIED by code read.

### Debug Log References

- `npx vitest run tests/cm5-reset-transition.test.js tests/cm1-cycle-phase.test.js
  tests/derive-cycle-status.test.js tests/epic.708.1-cycle-schema-api.test.js` — **96/96**,
  2026-08-10 (cm5 suite contributes 8: the full executable transition matrix + 4 wiring checks
  with slice-boundary guards per the CM-1 review lesson).
- `epic.708.3` — 3 failed | 11 passed, exactly the #1116 stale set. Baseline preserved.
- `node --check` clean on the three edited files.

### Completion Notes List

1. **Behaviour change flagged for review (per the story's own Dev Note):** the processing view's
   "Open game phase" button historically performed NO tracker reset (inconsistent with the Cycle
   tab's Game button, which always reset). Both routes now consult `resetOnTransition`: from
   prep, neither resets; from a non-prep state, BOTH reset (with the confirm dialog). Net: an ST
   using the processing-view button on a legacy-state cycle now gets a reset-with-dialog where
   they previously got a silent no-reset transition. Cancelling aborts the transition. The
   prep-first flow avoids the reset entirely and is the intended path.
2. The prep dialog reuses the exact legacy wording with the phase label substituted ("Setting to
   Prep phase will reset the live tracker..."), British English, no em-dashes.
3. `setCyclePhase` untouched (AC 5): the reset stays a UI-layer concern around the canonical
   writer, and the pure decision lives in `cycle-phase.js` where client, server and tests share
   it.
4. Tasks 5-6 deploy/approval-gated, deliberately unchecked.

### File List

- `public/js/downtime/cycle-phase.js` (modified — resetOnTransition)
- `public/js/admin/cycle-views.js` (modified — writePhase reset relocation, phase-aware dialog)
- `public/js/admin/downtime-views.js` (modified — handleOpenGamePhase consults the same rule)
- `server/tests/cm5-reset-transition.test.js` (new — 8 tests)
- `specs/stories/cm5-tracker-reset-to-prep.story.md`, `specs/stories/sprint-status.yaml`
