# Adversarial review - issue-1028-cm1-phase-as-data (Phase order as data, prep phase, feeding opens on prep), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/issue-1028-cm1-codex-findings.md`, before you open anything the next
   pass allows. Do not revise an earlier pass's findings in light of what a later pass taught you -
   if a later pass contradicts an earlier one, say so as a new finding and leave the original
   standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/issue-1028-cm1-diff.txt` and is relative to that root, taken against
  base commit `77bd3d0d`. The implementation is UNCOMMITTED in the working tree on branch
  `cm/issue-1028-phase-as-data`; `git diff 77bd3d0d -- public/js public/css server/routes
  server/schemas server/tests` plus the two untracked files reproduces it.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- An untracked scratch file `server/_probe-cycles.mjs` exists in the tree; it is unrelated debris
  awaiting deletion, not part of this change. Ignore it.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo sits in an umbrella workspace with sibling
  repos `../TM Wiki`, `../TM Cockpit`, `../TM Herald`. You may READ two specific sibling files when
  Pass 3b tells you to verify claims about them; you must not modify anything in any sibling, and do
  not explore them beyond that.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- Environment hazards: **the full test suite is NOT a trustworthy signal in this repo** - with
  mongod absent, over a thousand tests silently SKIP and report success (open issue #1117), and four
  tests fail permanently for stale-assertion reasons unrelated to any real defect. Do not run the
  full suite and treat its result as information. The gate commands below are chosen because they
  need no database and no server; if any of them fails to run at all, disclose it rather than
  substituting a different signal.
- Blast radius: `requireOpenCycle` in `server/routes/downtime.js` is the shared write gate for EVERY
  submission edit in the live game (35 players, next session Saturday), and
  `public/js/downtime/db.js` is the shared cycle data layer for the player app, the admin app, and
  the sign-in flow. A mistake here silently breaks consumers this diff never names.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  - `cd server && npx vitest run tests/cm1-cycle-phase.test.js tests/derive-cycle-status.test.js tests/epic.708.1-cycle-schema-api.test.js`
  - `cd server && npx vitest run tests/epic.708.3-cycle-phase-controls.test.js`
  - `node --check` on each JS file named in the diff.
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1028-cm1-diff.txt` and **nothing else**. No
spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point.

### What this diff claims to be

A game-cycle "phase" becomes first-class data: a new pure module `cycle-phase.js` defines the phase
vocabulary (`downtime, processing, prep, game`), a mirror table mapping each phase onto two legacy
fields (`game_phase`, `status`), one canonical reader (`cyclePhase`) and, in `db.js`, one canonical
writer (`setCyclePhase`). A new `prep` phase opens the feeding window before the game
(`isFeedingOpen`, `getFeedingCycle`), the server's closed-cycle write gate becomes phase-aware via
an extracted pure decision (`openCycleVerdict`), the admin phase buttons gain Prep, and a 46-test
suite covers the contract.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `openCycleVerdict` requires `keys.length > 0` for a body to count as feeding-only. Trace what an
   EMPTY-body player PUT does in each lane (phase lane per phase value, legacy lane per status) and
   whether the two lanes disagree in a way that looks unintended.
2. `openCycleVerdict` checks `PHASE_VALUES.has(cycle.phase)` directly instead of calling
   `cyclePhase()`. The same known-value guard now exists in two places (there and in `cyclePhase`).
   Can they drift, and is there any input on which they already disagree?
3. `setCyclePhase(cycle, phase, extra)` spreads `extra` AFTER the mirror writes. An `extra` of
   `{ status: ... }` or `{ game_phase: ... }` would silently betray the never-desync invariant the
   function exists to enforce. Check every call site in the diff for this, and judge whether the
   function should defend itself.
4. `uiPhase(cy)` in `cycle-views.js` returns `cy.phase || cy.game_phase || null` with NO
   known-value guard, then feeds `PHASE_LABELS[...]` and a CSS class suffix. What renders for a
   hand-edited junk `phase` value? Compare with `cyclePhase`'s stricter handling.
5. The mirror table maps BOTH `processing` and `prep` to `{ game_phase: 'processing', status:
   'closed' }`. That makes the legacy representation lossy: after a reload, what distinguishes a
   prep cycle from a processing cycle for any reader that only has the legacy fields? Find any spot
   in the diff that assumes the distinction survives where it does not.
6. `closeCycle`/`openGamePhase` changed write shapes but kept id-based signatures. Check the diff's
   own call sites for stale assumptions about what those writes contain (e.g. the local-state patch
   in `downtime-views.js` - does it now match what the server document actually holds?).
7. The schema adds `phase_sequence` with no `minItems` and no uniqueness constraint. The POST
   default-inject guards empty arrays; nothing guards `['game']` or duplicates. Judge the risk given
   `phaseIndex` consumes it.
8. Error paths: `phaseWrites` throws on unknown phase - trace every caller for what happens if that
   throw fires at runtime (who catches it, what does the user see?).
9. Dead code and leftovers: is `getGamePhaseCycle`/`isInGamePhase` still referenced anywhere after
   the feeding tab moved to `getFeedingCycle`? Unused imports in the edited files?
10. The new test file asserts heavily on SOURCE TEXT with regexes tied to exact current formatting.
    Flag any assertion whose pass condition is trivially satisfiable or that would survive a real
    regression it claims to guard.

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/issue-1028-cm1-codex-findings.md` now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec
or any account of the author's intent - work from the code itself.

### Orientation (not ground truth - verify against the code)

Same shape as Pass 1's summary: phase-as-data, a prep phase that opens feeding early, a phase-aware
server write gate, one canonical writer mirroring every phase onto the legacy fields.

### What to hunt for

1. **Walk the full feed-roll write path for a prep cycle, by hand.** Player PUTs
   `{ feeding_vitae_allocation: [...] }` to `/api/downtime_submissions/:id`
   (`public/js/tabs/feeding-tab.js:~1035`): `requireOpenCycle` (verdict, phase lane) -> the
   handler's deadline carve-out (`allFieldsFeeding`) -> the `$set`. Confirm each step by reading the
   real code, including that the middleware's projection actually fetches every field the verdict
   reads. Then walk the same path for an out-of-window player making a GENERAL edit during prep:
   middleware allows on `oowMatch` - but does the handler's own deadline check then 403 them anyway,
   and is that the same outcome the legacy lane produced? Parity matters more than either lane's
   individual behaviour.
2. **`getFeedingCycle` picks the FIRST match in API order, which is `_id`-descending - creation
   order, not game order.** Read `server/routes/downtime.js` (the cycles GET sort) and
   `public/js/downtime/db.js`. Construct the multi-candidate case: a stale legacy document whose
   raw `status` is `'game'` coexisting with a new prep-phase cycle. Which wins, and is the winner
   creation-order-dependent? (This repo has been bitten by `_id`-order-as-game-order before.)
3. **The feeding tab's fallback lane (#537 guard).** Read `public/js/tabs/feeding-tab.js:105-150`.
   With a prep cycle found by the primary lookup, `mySub` stays null - walk what the tab does next
   to find the player's submission for that cycle, and whether a prep cycle (raw status 'closed')
   trips the `status !== 'closed'` filter inside the fallback in any reachable branch.
4. **Sign-in carry-over ordering.** `public/js/game/signin-tab.js:78-120` picks the highest
   `game_number` cycle with `status !== 'open'`. Confirm a prep-phase cycle is selected (its status
   is 'closed'), and check nothing else in that function assumes "closed means processing finished
   long ago".
5. **The admin ribbon and buttons under every phase value.** `deriveCurrentCycle`
   (`cycle-views.js:~62`) picks by `game_phase === 'game'`, then any `game_phase`, then non-closed
   by `deriveCycleStatus`. Walk it for: a prep cycle (game_phase 'processing'), a cleared cycle
   (both nulls), and two cycles where one is prep and another is downtime. Does the ribbon show the
   cycle an ST would expect?
6. **The null-clear path.** `writePhase(cy, null)` -> `setCyclePhase(cy, null)`: status is
   re-derived from `{ ...cycle, game_phase: null }` while the spread still carries the old `phase`
   value. Confirm `deriveCycleStatus` genuinely ignores `phase`, and that the final document state
   after `Object.assign` has all three fields coherent.
7. **Route order and shadowing in `cyclesRouter`.** The POST `/` change sits among
   `/:id/confirm-feeding` and PUT/DELETE `/:id` routes. Confirm nothing about the new import or the
   injected default changes matching order or breaks the `validate(downtimeCycleSchema)` middleware
   contract (the injected `phase_sequence` happens AFTER validation - is that shape still
   schema-legal, and does anything re-validate on the way out?).
8. **The server importing browser-adjacent code.** `server/routes/downtime.js` now imports from
   `public/js/downtime/cycle-phase.js`. Verify the module genuinely has zero imports and zero
   browser globals, and check the server's start path (`node index.js` from `server/`) resolves that
   relative path on this platform. Run `node --check` and, if cheap, a bare
   `node -e "import('./public/js/downtime/cycle-phase.js').then(m => console.log(Object.keys(m)))"`
   from the repo root.
9. **The dev-fixtures interceptor.** `public/js/dev-fixtures.js` patches fetch under the local test
   token. Check whether PUT `/api/downtime_cycles/:id` and the new fields pass through it without a
   new handler being needed (this repo's convention is that NEW endpoints need explicit handlers;
   this change reuses existing endpoints - confirm that holds).
10. **State leakage in `buildPhaseCell`.** After a click, the refresh loop recomputes `is-active`
    from `uiPhase(cy)` where `cy` was mutated in place by `setCyclePhase`. Walk a
    prep -> processing -> clear -> game click sequence on one row and confirm the buttons and
    ribbon stay truthful at each step (no stale highlight from the closure capturing an old value).

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/issue-1028-cm1-codex-findings.md` now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/issue-1028-cm1-phase-as-data.story.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record yet.** Skip past it entirely.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative.
   - Deviations from stated intent, including anything the story scopes OUT that the change
     quietly did anyway.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Settled decisions - already ruled, do not re-litigate (but DO review their implementations):

- The ST/dev unconditional-allow in the phase lane of `openCycleVerdict` deviates from AC 5's
  literal text DELIBERATELY: the ruling document (`D:\Terra Mortis\cycle-model.md` Rev 2, section
  2) defines the processing phase as the ST writing resolutions, so a literal AC 5 would lock the
  ST out. Review whether the implementation of that deviation is correct and safe; do not flag the
  deviation's existence.
- `prep` mirrors to the processing/closed legacy pair by explicit ruling. Do not propose mirroring
  it to the game pair; that exact option was vetoed.
- The admin DT processing header badge reading "closed" during prep is a KNOWN deferred cosmetic.
- `epic.708.3-cycle-phase-controls.test.js` fails on exactly three stale assertions
  (`setGamePhase`, `data-phase`, `gold2`); that is pre-existing issue #1116, not this story.
  Flag it ONLY if the current failure set differs from those three.
- Tasks 10 and 11 are deliberately unchecked (deploy-gated); not a completeness gap.
- A player's general edit during the `game` phase being locked in the phase lane is an accepted,
  documented tightening.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims. Attack these:
   - "80/80 passed" across the three named test files, and "46 passed" for
     `cm1-cycle-phase.test.js` alone. Run them yourself.
   - "3 failed | 11 passed" for `epic.708.3`, failing on exactly `setGamePhase`, `data-phase`,
     `gold2`. Run it yourself and compare the names.
   - "`node --check` clean on all seven edited/created JS files." Run it.
   - "`signoffPhase` and `setManualOpen` are byte-identical." Verify with
     `git diff 77bd3d0d -- public/js/downtime/db.js` restricted to those functions.
   - "TM Cockpit has no live coupling to `status === 'game'`; the only hit is a display echo in
     `scripts/set-cycle-deadline.mjs`." Verify by grepping `../TM Cockpit/lib`,
     `../TM Cockpit/scripts`, `../TM Cockpit/server.mjs` yourself (read-only).
   - "TM Wiki's stub reads `cycle.phase` verbatim and its sequence constant still says 'feeding',
     so a Suite-written 'prep' fails safe (form closed)." Verify by reading
     `../TM Wiki/server/downtime-cycle-phase.js` (read-only) and tracing what its gate does with a
     phase value it does not recognise.
   - "The enumeration is complete." Grep this repo for any reader of a cycle's `status`/`game_phase`
     that the Dev Agent Record's artefact does NOT list, and name any you find.
   - "confirm-feeding callers operate on the active cycle only, so prep never blocks regent
     confirmation." Verify the callers' cycle source yourself.
6. **Verify each claim by running it, not by reading it.** If a first run is inconsistent, run it
   twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem - bearing in mind it is scheduled to deploy to production Wednesday for a
   Saturday live game whose feeding depends on it.

---

## Output

Write everything to `specs/stories/code-review/issue-1028-cm1-codex-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`,
`[Pass 2]`, `[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than
dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the gate commands from the Honesty section.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
