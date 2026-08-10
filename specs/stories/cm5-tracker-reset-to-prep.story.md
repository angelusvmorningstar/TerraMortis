# Story CM-5a: Carry-over survives prep — the tracker reset moves to Prep entry

Status: ready-for-dev

> **Ruling document: `D:\Terra Mortis\cycle-model.md` Rev 2 §2 and §11 (story 5).** No GitHub
> issue — epic-internal story, tracked in sprint-status per §11. Deploy target: **Friday daytime
> 2026-08-14**, go/no-go Angelus Friday evening, Game 7 Saturday.
>
> **Branch from `main` (post-`43fae0fd`, CM-1 live).** PR direct to `main`. Story 5b (player
> spend buttons) remains deferred and is NOT this story.

## The discovery that reshaped this story (research 2026-08-10, verified line refs)

The planned "carry-over apply" ALREADY EXISTS in production:

1. **Feeding confirm writes the tracker.** `public/js/tabs/feeding-tab.js:962-964`: on vitae
   confirmation the player's own client PUTs `{ vitae, influence }` to
   `/api/tracker_state/:charId` ("single source of truth for tracker state"), keeps tracker.js's
   in-memory cache in sync, and marks `vitae_confirmed`. Event-driven, per-character — exactly
   the §2 design, already shipped.
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

- [ ] Task 1 (AC 6): extract `resetOnTransition(fromPhase, toPhase)` into `cycle-phase.js` with
      executable matrix tests.
- [ ] Task 2 (AC 1-3): rewire `cycle-views.js` `writePhase` — prep branch gains guard-free
      dialog + reset; game branch consults `resetOnTransition(uiPhase(cy), 'game')`.
- [ ] Task 3 (AC 4): trace-verify the three carry-over paths under prep against the real code;
      record in Dev Agent Record (no code expected).
- [ ] Task 4 (AC 6): tests; run cm1 + new file + derive-cycle-status + 708.1; 708.3 baseline
      check.
- [ ] Task 5 (AC 7): hand-test on production (throwaway cycle; see script), record results.
- [ ] Task 6: PR to `main` (Angelus's word), merge `main` back into `dev` after.

## Hand-test script (production, throwaway cycle, ~8 minutes)

1. Create a throwaway cycle. Set **Prep** → reset dialog appears; accept → all tracker cards
   reload at full defaults. *(Do NOT accept on any real data.)*
2. As a test player character: feeding tab open → make a roll, confirm allocation → tracker
   card shows the fed vitae (< max) and reduced influence.
3. Set **Game** on the same cycle → NO dialog, NO reset → tracker card still shows the fed
   values. This is the story.
4. On a second throwaway with phase never set to prep: set **Game** → dialog + reset appear as
   today (legacy parity).
5. Delete both throwaways.

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

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
