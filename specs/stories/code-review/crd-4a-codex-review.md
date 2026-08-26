# Adversarial review - crd-4a (Defensive City Status advantage at Court), Terra Mortis TM Game

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
   `specs/stories/code-review/crd-4a-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/crd-4a-diff.txt`
  and is relative to that root, taken against base commit `30468501db0c28a63310358524a992b68e953d49`
  (the tip of `main` before this story's work began; HEAD is `5c5e7194`).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Game`) is one of several sibling repos
  in a larger umbrella workspace (`TM Story`, `TM Herald`, `TM Admin`, `TM Design System`) - do not
  read or touch anything outside `D:\Terra Mortis\TM Game` even to look something up.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- Two environment hazards on this machine: (1) several vitest suites need a local `mongod` and
  **skip rather than fail** without one - a skipped suite is not a passing suite, read the summary
  line, not just the exit code; (2) this repo's Playwright specs share port 8080 with
  `reuseExistingServer` - never run two Playwright invocations concurrently, and this session may
  itself be using that port, so disclose rather than fight a conflict if you hit one.
- This diff touches a shared trust-boundary route, `PUT /api/contested_roll_requests/:id/resolve`,
  used by EVERY contested roll in the app, not just power-based ones. A mistake in the new gate's
  short-circuit could silently change behaviour for contests that have nothing to do with this
  story's own feature - check the non-gated path is genuinely byte-for-byte unchanged, not just
  "probably fine because power_name is usually absent."

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/crd-4a-defensive-status-choice.test.js tests/crd-3b-resolution-screen.test.js` (expect
  19+32=51 passing), and a broader changed-area run: `cd server && npx vitest run
  tests/crd-1-contested-roll-request-shape.test.js tests/crd-3a-server-resolve-endpoint.test.js
  tests/crd-4a-defensive-status-choice.test.js tests/crd-3b-resolution-screen.test.js` if time
  allows. Report the real numbers even if they disagree with anything the story claims - especially
  then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/crd-4a-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new server-side gate on a contested-roll resolution endpoint: when a challenge names a
`power_name`, the current game is in an active "game" phase, both the challenger and defender are
marked attended in the current session, and the defender's computed "City Status" exceeds the
challenger's, the endpoint now offers the defender a choice between two dice-pool bonus terms
("Blood Potency" vs a "City Status" gap value) and requires that choice before finalising a pool.
The response carries the two computed values back to the client so it can render a picker; a
matching client-side module renders that picker, never pre-selecting either option. A new optional
field is persisted recording which term (if any) was chosen. New CSS and two test files accompany
the change.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. `_statusChoiceEligibility`'s `attendedIn` closure: trace exactly what happens when
   `challenge.challenger_character_id` or the defender's own id/name resolve to `undefined` or an
   empty string. Could a document with missing/malformed identity fields on either side pass this
   check by accident (e.g. two `undefined`/`undefined` comparisons coincidentally matching)?
2. The final clamp: `if (finalPool != null) finalPool = Math.max(0, Math.min(30, finalPool));`. Walk
   what happens if `statusChoice.bp_value` or `statusChoice.city_value` is ever `NaN` (e.g. a
   character document with a non-numeric `blood_potency`, or a City Status calculation that
   produces `NaN`). `NaN != null` is `true` in JS - does `Math.max(0, Math.min(30, NaN))` silently
   produce `NaN`, and does that `NaN` get persisted as `defender_pool` without any guard catching
   it? Is there an existing pattern elsewhere in this diff (or the surrounding untouched code) that
   would have caught this, that isn't applied here?
3. `defender_status_term` is only ever read from `req.body` INSIDE the `if (statusChoice)` branch.
   Confirm, by reading the code exactly as written (not as it "should" work), that a client
   submitting `defender_status_term` when the gate is closed truly has no effect anywhere - it is
   never stored, never influences `finalPool`, never appears in the response. Also check: is
   `defender_status_term` validated to be exactly `'bp'` or `'city'` (strict `===`), or could a
   near-miss value (e.g. `'BP'`, `'bp '`, an object, an array) slip past the check in some way that
   still causes a side effect?
4. Response shape: `status_choice` is attached to the fetched Mongo document object AFTER the
   `updateOne`/`findOne` round-trip (`updated.status_choice = statusChoice`), not written to the
   database. Confirm this is genuinely never persisted (grep the whole diff for any other write
   path touching this collection) - a computed, per-request-only field masquerading as a stored one
   would be a real data-integrity confusion for any future reader of this collection.
5. Self-contradiction check: does any code path in this diff return an HTTP 400 when
   `defender_status_term` is missing while the gate is open? (One comment explicitly claims this is
   "NOT a 400" - verify the code actually behaves that way in every branch, not just the one the
   comment sits next to.)
6. Escaping: every new dynamic string interpolated into rendered HTML in the client file (character
   names, computed numeric values) - confirm each one is wrapped the same way the surrounding
   pre-existing code already wraps equivalent values, with no new bare interpolation.
7. Dead code / unreachable branches / unused imports introduced by this diff specifically.
8. Assertions in the two test files whose PASS condition is trivially satisfiable (a loose `toBeTruthy`,
   a count check with no lower bound, a mock that would pass even if the code under test did nothing).
9. The new DB queries `_statusChoiceEligibility` performs (`chapters.find()`, `game_sessions.find()`,
   `characters.findOne()` for the challenger, `territories.find()`) all run on every `/resolve` call
   where `power_name` is merely truthy, regardless of whether the gate ultimately opens. Is this
   flagged anywhere as a deliberate tradeoff, or does it read like an oversight? (Note as a finding
   either way - severity is your call.)

**STOP. Write your Pass 1 findings to `specs/stories/code-review/crd-4a-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec
or any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Additionally: this endpoint is `server/routes/contested-rolls.js`'s
`PUT /:id/resolve`, part of a larger epic (crd.1-3b, already shipped) that lets a defending player
build their own dice pool interactively before committing to a roll via a separate `/accept`
endpoint. The client module is `public/js/game/contested-resolve.js`; the surrounding UI already
has an existing generation-counter race-guard (`_resolveGen`/`_mountGen`) for overlapping async
calls that this diff's new interactive control also has to cooperate with correctly.

### What to hunt for

1. Read `_statusChoiceEligibility` in full (`server/routes/contested-rolls.js`) and hand-trace the
   EXACT sequence for a request where `power_name` is set but the current chapter is NOT in `'game'`
   phase: does the function genuinely short-circuit before touching `game_sessions`/`territories` at
   all, or does it do wasted work first? Then trace the reverse: game mode active, but the
   `game_sessions` collection is completely empty (no documents at all) - does `sessions[0] || null`
   correctly return `null` and short-circuit, or could an empty result set cause a different failure
   mode (a thrown error rather than a clean "gate closed")?
2. Read the full `PUT /:id/resolve` handler (`server/routes/contested-rolls.js`) top to bottom and
   confirm: for a challenge with NO `power_name` at all (the overwhelming majority of real
   contests), is the resulting `defender_pool` computation and the persisted document shape
   EXACTLY byte-for-byte identical to what this route computed before this diff existed? Compare
   against `git show 30468501db0c28a63310358524a992b68e953d49:server/routes/contested-rolls.js` for
   the pre-change version of this same route.
3. Client race condition: read `_resolve` and the new status-term click handler in
   `public/js/game/contested-resolve.js`. Walk this exact sequence by hand: player selects an
   aspect (triggers `_resolve` call A, in flight) -> before A returns, player clicks a status-term
   button (triggers `_resolve` call B) -> A returns AFTER B. Confirm, by tracing the actual
   `_resolveGen`/`_mountGen` comparisons in the code, that A's stale response cannot overwrite B's
   newer `state.statusChoice`/`state.pool`. Do not trust the surrounding comments' claims about this
   - trace the actual generation numbers by hand.
4. What happens if the SAME defender re-visits `/resolve` (e.g. tab re-render, or the player
   toggles a merit) AFTER already choosing `'city'`, but the gate has since closed (e.g. a
   hypothetical ST action changed game phase mid-session)? Confirm the client discards the stale
   choice correctly and confirm the SERVER does not silently keep applying a previously-chosen term
   that arrived in a request body from a gate-closed state (re-check point 3 in Pass 1's list from
   the server's actual current-request perspective, not a cached one).
5. `findRegentTerritory`/`calcEffectiveCityStatus` - read both functions in full
   (`public/js/data/helpers.js`, `public/js/data/city-status-calc.js`). Confirm this diff calls them
   with the exact argument shapes those functions expect (not assumed-compatible ones), for BOTH the
   defender and the newly-fetched challenger character document - the challenger document is fetched
   fresh in this diff and may have a different shape than what these functions were originally
   exercised against elsewhere in the codebase (e.g. missing fields a live document always has but a
   test fixture might not).
6. Route/matcher order: does this diff's new code run before or after the existing
   `defender_wp_spent` boolean-type validation and the existing `ASPECT_KEYS` validation earlier in
   the same handler? Could a request crafted to fail one of THOSE existing checks instead reach this
   diff's new code first and behave differently than a well-formed request would (e.g. an invalid
   `defender_aspect` combined with a valid gate-eligible `defender_status_term` - does validation
   order still reject it correctly)?
7. Fixture/mock shape check in the new/modified test files: for each new test, confirm the mocked
   `apiRaw`/database response shape genuinely matches what the REAL server response now looks like
   post-diff (particularly the new `status_choice` field's exact shape), field for field - not an
   approximation that happens to satisfy the assertion.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/crd-4a-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/crd-4a-defensive-status-choice.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (e.g. touching `challenge-initiation.js`,
     changing the Defensive Reaction pool outside the gated context, adding a new HTTP GET,
     generalising `calcEffectiveCityStatus`/`currentCycleInGamePhase`).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope for this story, and deliberate - do not flag these as gaps:
- The attack-penalty half of the wider house rule (a separate, not-yet-created story).
- Any change to `challenge-initiation.js` (the attacker-side module).
- Any change to the OLD standalone ST tool `public/js/game/contested-roll.js` (a different,
  pre-existing "Com+BP" mechanic, unrelated to this diff).
- A cap on the City-Status-difference term itself - ruled uncapped, deliberately.
- A BP=0 floor case - ruled moot (no BP-0 characters exist in this game's ruleset).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - "crd-4a suite 19/19, crd-3b extended 32/32" - exact test counts.
   - A specific full changed-area regression count (read the Dev Agent Record for the exact number
     it states).
   - "One pre-existing, unrelated failure in `gdx-4-css-standards-grep.test.js`, confirmed identical
     on the unmodified base branch via `git stash` A/B" - a specific reproducibility claim.
   - "Verified both themes visually against the real shipped stylesheets (temporary Playwright
     harness, deleted after use)" - note this is now unverifiable as stated since the harness was
     deleted; say so rather than either accepting or rejecting it silently.
   - A claim that the story's own original AC8 wording (Roll button "disabled") conflicted with
     crd-3b's own established AC7 precedent (no client-side duplicate of the server's null-pool
     guard), and was corrected in both the code and the story text during implementation.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run
   the drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and
   say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/crd-4a-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the gate commands above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
