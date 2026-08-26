# Adversarial review - gdx-8-roll-history (persisted roll history + live ST roll feed), Terra Mortis TM Game

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
   `specs/stories/code-review/gdx-8-roll-history-codex-findings.md`, before you open anything the next
   pass allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if
   a later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/gdx-8-roll-history-diff.txt` and is relative to that root, taken against
  base commit `6dfd603d` (HEAD at the time this story's work began - the whole diff is uncommitted
  working-tree changes on top of it).
- The diff is **deliberately scoped to source and tooling only** (13 files: 9 modified, 4 new). Two
  things are deliberately absent, for different reasons - do not treat either as an omission or go
  hunting for them:
  - The story spec and sprint-tracking file, so the earlier passes stay genuinely blind to the
    author's own account.
  - **A second, unrelated body of uncommitted changes physically present in this same working tree**:
    a concurrent session (working in this same shared checkout) is mid-flight on an entirely separate
    Allies->Sway merit-name rename, touching files like `public/js/editor/rule_engine/ohm-evaluator.js`,
    `pool-evaluator.js`, `public/js/admin/downtime-constants.js`, `downtime-views.js`,
    `spheres-view.js`, `public/js/editor/domain.js`, `edit-domain.js`, `public/js/editor/sheet.js`, and
    an untracked `server/scripts/migrate-allies-to-sway.js`. **None of this is part of gdx-8 and none
    of it is in the diff you were given.** If `git status`/`git diff` on the live working tree shows
    these files as modified/untracked, that is that other work, not this story - do not review it, do
    not attribute its state to this diff, and do not run anything that would touch it.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This is a standalone repo inside a larger "Terra
  Mortis" umbrella workspace with sibling repos (TM Story, TM Admin, TM Herald, TM Design System) on
  disk nearby - do not read or touch anything outside this repo's own root.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output. Only ever do this to files that are actually
  part of this diff's 13 files - never to the concurrent session's files above.
- Several of the new tests require a local `mongod`. If one isn't running, those tests **skip rather
  than fail** - a skip is not a pass; note which of the DB-dependent tests skipped vs. actually ran.
  A long full-suite run (~10 minutes) is expected; disclose if you truncate or skip it rather than
  silently reporting partial numbers as if they were the whole run.
- **Blast radius**: `broadcastRollLogged` (`server/ws.js`) reuses the same `_fanOut` WS broadcast
  pipeline every other live-update feature in this app depends on (catalogue updates, settings
  changes, bloodline updates) - a mistake there risks breaking those other consumers, not just this
  feature. Likewise the new `roll_log` TTL index is registered in the same `server/index.js` `start()`
  block as every other collection's boot-time index creation - an error there can block server startup
  entirely, not just this collection.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/gdx-8-roll-history.test.js`, `npx vitest run tests/rlv-6-dice-engine-removed.test.js`, and (if
  time allows) `npx vitest run tests/gdx-8-roll-history.test.js tests/rlv-6-dice-engine-removed.test.js
  tests/api-app-settings.test.js tests/stm-9-ws-broadcast.test.js tests/gdx-7-apply-costs-on-roll.test.js
  tests/crd-1-contested-roll-request-shape.test.js`. Report the real numbers even if they disagree
  with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/gdx-8-roll-history-diff.txt` and **nothing else**. No
spec, no story file, no project context. Do not explore the repository. Do not go looking for the
spec. Read other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new persisted-roll-history feature: a `roll_log` MongoDB collection with a 30-day TTL index, a
schema (`server/schemas/roll_log.schema.js`), player-scoped POST / ST-only GET routes
(`server/routes/roll-log.js`), a WS broadcast (`broadcastRollLogged` in `server/ws.js`) fanned out to
connected clients, a client-side WS handler (`public/js/data/ws.js`), three hook points inside an
existing dice-roller's completion logic (`public/js/suite/roll-v2.js`) that POST a roll's shape to the
server, and a new admin-app sidebar domain ("Engine") with a live-updating feed panel
(`public/admin.html`, `public/js/admin.js`, `public/js/admin/roll-feed.js`,
`public/css/admin-layout.css`). Also touches two test-support files (`server/tests/helpers/test-app.js`
to mount the new route in the test app, and `server/tests/rlv-6-dice-engine-removed.test.js`, an
existing regression-guard test whose one assertion is edited) and adds a new test file
(`server/tests/gdx-8-roll-history.test.js`).

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`server/routes/roll-log.js`'s `canAccess()`** - the entire security boundary for who can write a
   roll for which character. Read it byte-for-byte. Does it actually enforce "a player may only POST
   for a character they own" with no gap (role check ordering, an `||` that's too permissive, a missing
   `dev`/`st` bypass check, a type-coercion issue comparing `character_id` string vs ObjectId)? Is there
   any way a `player` role can pass a `character_id` not in their own `character_ids` and still get a
   201?
2. **`player_id` server-derivation.** Confirm the route sets `player_id` only from the authenticated
   session (never from `req.body`), and confirm the schema genuinely rejects a client-supplied
   `player_id` field outright (not just ignores it) - a schema that silently strips unknown fields
   rather than rejecting them is a different, weaker guarantee than one that 400s.
3. **`_logRoll`'s fire-and-forget POST in `roll-v2.js`** - it swallows errors with a bare
   `.catch(() => {})`. Is that appropriate here, or does it mean a broken/misconfigured roll-logging
   path fails completely silently with zero operator-visible signal, forever? Flag as worth checking
   even if you conclude it's an acceptable tradeoff for a fire-and-forget analytics-style write.
4. **The TTL index registration in `server/index.js`** - `createIndex({ rolled_at: 1 }, { name:
   'gdx8_roll_log_ttl', background: true, expireAfterSeconds: 2592000 })`. Is this idempotent across
   repeated server restarts? What happens if an index with that name already exists with different
   options (MongoDB throws `IndexOptionsConflict` in that case) - is there any code path in this repo
   where that could realistically happen?
5. **Assertions whose PASS condition is weaker than its label claims.** Specifically scrutinize the
   edited assertion in `rlv-6-dice-engine-removed.test.js` - does the new check ("engine branch never
   re-wires the deleted dice-engine.js") actually prove what its `it(...)` description claims, or does
   it leave a gap (e.g., a differently-spelled re-import, a dynamic `import()`, a re-export under
   another name) that would let the exact regression the original test existed to catch slip back in
   unnoticed?
6. **`public/js/admin/roll-feed.js`'s rendering** - if it builds HTML strings from server-sourced
   fields (`label`, `pool`, character name, etc.) and injects them via `innerHTML`, is every
   interpolated field actually escaped, or only some of them? A roll's `label`/`pool` string
   ultimately originates from client input (a player's own browser) before being persisted and later
   rendered in an ST's browser - treat it as untrusted output at the render site regardless of what
   validation happened at write time.
7. **Self-contradiction within the diff** - does any comment or code path claim one behaviour while a
   different part of the same diff does something else (e.g., a comment says "no refetch, WS frame has
   everything" while the handler code does trigger a refetch, or vice versa)?
8. Dead code / unused imports / unreachable branches introduced by this diff specifically (not
   pre-existing ones elsewhere).
9. Error paths and async/await misuse in `server/routes/roll-log.js`'s POST/GET handlers - unhandled
   rejections, a missing `await`, a response sent twice, an error thrown after headers are already
   sent.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/gdx-8-roll-history-codex-findings.md`
now, before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need to
understand what this change is actually plugging into. You still do **not** have the story spec or any
account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1's "What this diff claims to be" - re-derive it against the real surrounding
code rather than trusting the diff's own framing.

### What to hunt for

1. **Read `public/js/suite/roll-v2.js`'s `doRoll()` in full.** Hand-trace all three completion
   branches (chance-die, contested, standard) and confirm, by tracing the actual code, that:
   - `_loggedVitaeSpent`/`_loggedWillpowerSpent` are declared with function-local scope inside
     `doRoll()` itself (not accidentally hoisted to module scope, which would leak a stale spend
     amount from one roll into the next roll's logged payload if the module-level variable were never
     reset before the next call).
   - The new `_logRoll(...)` call in each branch fires with the correct values for that specific
     branch - e.g., does the chance-die branch's log payload actually reflect chance-die semantics
     (single die, no "again" rule) rather than accidentally reusing standard-roll variables in scope?
   - The gating condition `state.rollChar && getGlobalSettings()?.game_in_progress` is evaluated at a
     point in each branch where `state.rollChar` is guaranteed to be the character that was actually
     rolled (not stale from a previous selection, not race-able against a character switch mid-roll).
2. **`getGlobalSettings()` load-order.** Find where/how it's populated on page load. Is there a
   realistic window early after page load where `getGlobalSettings()` returns `undefined`/stale data,
   causing `game_in_progress` to read falsy even when the game is actually live - silently dropping
   roll-log POSTs for real rolls with no error surfaced anywhere?
3. **WS reconnect behaviour.** Read `public/js/data/ws.js`'s reconnect logic. Does `onRollLogged` (and
   the other `on*` callbacks) get re-registered exactly once per reconnect, or could a dropped/restored
   connection cause the admin feed to receive duplicate `roll_log` frames, double-render entries, or
   silently stop receiving them after the first reconnect?
4. **Ordering in the live feed vs. the initial paint.** `roll-feed.js` initially paints via `GET
   /api/roll_log` (sorted `rolled_at: -1`, capped 50) then prepends live WS frames as they arrive. If
   the WS connection delivers a frame for a roll that was ALSO just included in the initial GET
   response (a race between the initial fetch completing and a WS frame for a very recent roll
   arriving), does the feed end up showing that roll twice? Is there any de-duplication by `_id`?
5. **`canAccess()` in `roll-log.js` vs. its stated precedent in `server/routes/tracker.js`.** Open both
   side by side and diff them by eye. Are they genuinely identical in shape, or does `roll-log.js`'s
   version diverge in a way that changes the actual access boundary (even subtly - e.g. checking
   `character_ids.includes(id)` vs `character_ids.some(c => String(c) === String(id))`, which behave
   differently if types don't match exactly)?
6. **Route mount order in `server/index.js`.** Is `/api/roll_log` mounted with middleware
   (`requireAuth, noCache()`) consistent with how the GET route's own internal `requireRole('st')`
   check interacts with that - could a `dev`-role user, or a role this app has that isn't `st`/`player`,
   fall through a gap between the two auth layers?
7. **Malformed/absent input at the new POST entry point** - missing `results` array, `results`
   containing values outside 1-10, `successes` as a negative number or a non-integer, an
   extremely-long `label`/`pool` string with no length cap; does the schema (`additionalProperties:
   false`, the listed `required` fields, the `results` item bounds) actually reject all of these, or
   are there gaps (e.g., `successes` has no `minimum`, so can a client POST `successes: -50` and have it
   accepted and broadcast)?
8. **`admin-layout.css`'s new `.engine-feed-*` rules** - do they collide with any pre-existing selector
   of the same name elsewhere in the CSS (a specificity/cascade surprise), and do they follow this
   project's own "no bare hex/rgba/inline style" convention (grep the block for any literal colour
   value not routed through a `var(--token)`)?

**STOP. Write your Pass 2 findings to `specs/stories/code-review/gdx-8-roll-history-codex-findings.md`
now, before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/gdx-8-roll-history.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" or "Senior Developer Review" sections yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written. Pay particular attention to AC6 (the
     `vitae_spent`/`wp_spent` fields) - the spec's own Dev Notes discuss `spend.cost.vitaeCost`/
     `willpowerCost` as the source; check the actual diff against what the AC's literal text says vs.
     what got implemented, and judge for yourself whether any divergence you find is disclosed
     correctly or not.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly touch `public/js/suite/roll.js` (legacy v1 roller), did not
     modify `state.hist`/`addHist`/`renderHist`/`clrHist` themselves (only add alongside), and did not
     touch GDX-7's own spend mechanism (`_currentSpendDecision`, the `trackerAdj` call sites) beyond
     reading values it already computes.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope for this story, and deliberate - do not flag these as gaps:**
- `public/js/admin/session-log.js`'s `initSessionLog` export being imported in `admin.js` but never
  called (a pre-existing dead-code gap from a prior, unrelated cleanup, not introduced by this diff).
- The pre-existing "Admin - Next Session Panel" Playwright suite in `tests/admin.spec.js` clicking
  `data-domain="engine"` to reach `#next-session-content` (which actually lives under a different,
  `attendance`, domain) - a separate, already-broken, pre-existing bug unrelated to this diff. You are
  welcome to independently verify this claim (it's checkable: read `public/admin.html` for where
  `#next-session-content` actually sits, and where `initNextSession()` is actually called from in
  `admin.js`) as part of Pass 3b's "verify the record" step below - this is exactly the kind of claim
  that should not be taken on faith.
- Manual browser smoke-testing of the live feed (documented as not-executed, deployed-environment-only,
  per this project's own `CLAUDE.md`).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - "17 new tests, all pass" for `server/tests/gdx-8-roll-history.test.js`.
   - The `rolled_at` TTL field is a genuine BSON `Date`, not an ISO string (contrasted against a named,
     already-documented sibling bug in `contested_roll_requests.updated_at`).
   - `broadcastRollLogged` fires on a successful POST and does NOT fire on a 400 or 403.
   - The disclosed AC6 deviation (recording actual-deducted spend via new
     `_loggedVitaeSpent`/`_loggedWillpowerSpent` locals, not the AC's literally-cited
     `spend.cost.vitaeCost`/`willpowerCost`) - is this deviation real, and is the stated reasoning
     (offered-cost vs. actually-deducted-cost) actually correct against `doRoll()`'s real code?
   - The `rlv-6-dice-engine-removed.test.js` fix: that the corrected assertion still guards against the
     regression the original test existed to catch (dead `dice-engine.js` wiring reappearing), while no
     longer false-failing on this story's own unrelated, deliberate reuse of the `'engine'` domain id.
   - The Task 8 regression claim: two full-suite `npx vitest run` executions inside `server/`, both
     reporting `19 failed | 223 passed (242)` test files and `21 failed | 4222 passed | 76 skipped
     (4319)` tests, with every non-baseline-documented failing file individually traced to something
     other than this diff (two CSS assertions failing against `public/css/components.css`, which this
     diff never touches and which predates this story's branch per `git log`; `rule-engine-integration.
     test.js` traced to the concurrent session's own uncommitted Allies->Sway rename WIP described in
     Ground rules above, not this diff; 8 `*-parallel-write.test.js` files attributed to a documented
     Atlas-connection-contention flake class; `issue-823-test-db-guard.test.js` attributed to a stale
     pre-rebrand `tm_suite_test` vs `tm_game_test` assertion; `bl3a-one-inclan-implementation.test.js`
     and `fix.943.retireStripDerived.test.js` attributed to unrelated drift in files this diff never
     touches).
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run
   `cd server && npx vitest run tests/gdx-8-roll-history.test.js` and confirm the real pass count. Run
   `npx vitest run tests/rlv-6-dice-engine-removed.test.js` and confirm it's green. If time allows, run
   the cross-file quartet named in Ground rules, and/or a fresh full-suite run - if you run the full
   suite, compare your own failing-file list against the one the Dev Agent Record claims, and flag any
   discrepancy explicitly (a different failing-file list on your run, even for reasons outside this
   diff's control such as `mongod` availability, is itself worth reporting).
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/gdx-8-roll-history-codex-findings.md`, grouped
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
- Every command you ran, with its real result, including the gate commands named in Ground rules
  above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change, and specifically clean with respect to the 13
  files in this diff - the concurrent session's own unrelated files being dirty is expected and not
  something to report as a problem).
