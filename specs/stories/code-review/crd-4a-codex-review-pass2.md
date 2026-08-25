# Adversarial review - crd-4a (Defensive City Status advantage at Court), Terra Mortis TM Game

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

This is a standalone pass, run independently of Pass 1 (which already ran and is frozen at
`specs/stories/code-review/crd-4a-codex-findings.md` under `## High`/`## Medium`/`## Low` headings
tagged `[Pass 1]`). You have full read access to `D:\Terra Mortis\TM Game`. Read whatever
surrounding code you need to understand what this change is actually plugging into. You still do
**not** have the story spec (`specs/stories/crd-4a-defensive-status-choice.md`) or any account of
the author's intent - do not open that file. Work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/crd-4a-diff.txt`
  and is relative to that root, taken against base commit `30468501db0c28a63310358524a992b68e953d49`
  (the tip of `main` before this story's work began; HEAD is `5c5e7194`).
- **Do not open `specs/stories/crd-4a-defensive-status-choice.md`** (the story spec) - that is
  reserved for a later pass you are not running.
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
  `reuseExistingServer` - never run two Playwright invocations concurrently.
- This diff touches a shared trust-boundary route, `PUT /api/contested_roll_requests/:id/resolve`,
  used by EVERY contested roll in the app, not just power-based ones. A mistake in the new gate's
  short-circuit could silently change behaviour for contests that have nothing to do with this
  story's own feature - check the non-gated path is genuinely byte-for-byte unchanged, not just
  "probably fine because power_name is usually absent."

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**.
- If you found nothing at a severity, **say that explicitly** rather than omitting the section.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/crd-4a-defensive-status-choice.test.js tests/crd-3b-resolution-screen.test.js` (expect
  19+32=51 passing).

## Orientation (not ground truth - verify against the code)

A new server-side gate on a contested-roll resolution endpoint: when a challenge names a
`power_name`, the current game is in an active "game" phase, both the challenger and defender are
marked attended in the current session, and the defender's computed "City Status" exceeds the
challenger's, the endpoint now offers the defender a choice between two dice-pool bonus terms
("Blood Potency" vs a "City Status" gap value) and requires that choice before finalising a pool.
The response carries the two computed values back to the client so it can render a picker; a
matching client-side module renders that picker, never pre-selecting either option. A new optional
field is persisted recording which term (if any) was chosen.

This endpoint is `server/routes/contested-rolls.js`'s `PUT /:id/resolve`, part of a larger epic
(crd.1-3b, already shipped) that lets a defending player build their own dice pool interactively
before committing to a roll via a separate `/accept` endpoint. The client module is
`public/js/game/contested-resolve.js`; the surrounding UI already has an existing generation-counter
race-guard (`_resolveGen`/`_mountGen`) for overlapping async calls that this diff's new interactive
control also has to cooperate with correctly.

## What to hunt for

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
   the pre-change version of this same route. (Pass 1 already flagged that `defender_status_term:
   null` is now always written and returned even on a non-gated resolve - confirm/extend that
   finding rather than duplicating it verbatim; check whether anything ELSE differs too.)
3. Client race condition: read `_resolve` and the new status-term click handler in
   `public/js/game/contested-resolve.js`. Walk this exact sequence by hand: player selects an
   aspect (triggers `_resolve` call A, in flight) -> before A returns, player clicks a status-term
   button (triggers `_resolve` call B) -> A returns AFTER B. Confirm, by tracing the actual
   `_resolveGen`/`_mountGen` comparisons in the code, that A's stale response cannot overwrite B's
   newer `state.statusChoice`/`state.pool`. Do not trust the surrounding comments' claims about this
   - trace the actual generation numbers by hand. (Pass 1 flagged that the CLIENT TEST for this
   never actually exercises an overlap - that is a test-quality finding; this pass's job is to
   determine whether the underlying CODE is actually race-safe regardless of test coverage.)
4. What happens if the SAME defender re-visits `/resolve` (e.g. tab re-render, or the player
   toggles a merit) AFTER already choosing `'city'`, but the gate has since closed (e.g. a
   hypothetical ST action changed game phase mid-session)? Confirm the client discards the stale
   choice correctly and confirm the SERVER does not silently keep applying a previously-chosen term
   that arrived in a request body from a gate-closed state.
5. `findRegentTerritory`/`calcEffectiveCityStatus` - read both functions in full
   (`public/js/data/helpers.js`, `public/js/data/city-status-calc.js`). Confirm this diff calls them
   with the exact argument shapes those functions expect, for BOTH the defender and the newly-fetched
   challenger character document - the challenger document is fetched fresh in this diff and may
   have a different shape than what these functions were originally exercised against elsewhere in
   the codebase (e.g. missing fields a live document always has but a test fixture might not).
6. Route/matcher order: does this diff's new code run before or after the existing
   `defender_wp_spent` boolean-type validation and the existing `ASPECT_KEYS` validation earlier in
   the same handler? Could a request crafted to fail one of THOSE existing checks instead reach this
   diff's new code first and behave differently than a well-formed request would?
7. Fixture/mock shape check in the new/modified test files: for each new test, confirm the mocked
   `apiRaw`/database response shape genuinely matches what the REAL server response now looks like
   post-diff (particularly the new `status_choice` field's exact shape), field for field.

## Output

**Append** your findings to `specs/stories/code-review/crd-4a-codex-findings.md` under its existing
`## High` / `## Medium` / `## Low` headings (add to those sections, do not create new duplicate
headings; if a section doesn't exist yet, add it in the right place). **Do NOT delete, rewrite, or
reorder anything already in that file from Pass 1** - read the file first, then append. Tag every
new finding `[Pass 2]`. Write `[Pass 2] - None found.` under `## High` if you found nothing there.

For each finding: **One-line title**, **Severity**, **File:line**, **The triggering input or
sequence**, **The observable consequence**, **Confidence**.

At the end, append a `## Pass 2 validation notes` section (do not touch/replace the existing
Validation notes placeholder) stating: which files you opened, every command you ran with its real
result (including the gate command above), anything you could not run and why, and confirmation you
modified nothing unintended (`git status --short` clean).
