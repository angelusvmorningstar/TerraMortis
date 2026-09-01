# Adversarial review — Pass 1 of 3 (BLIND HUNTER) — p0-coordinator-role-ownership-bypass, TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is pass **1 of 3**, pasted to you in isolation. You will not see the other two passes. Work
only from what this file gives you.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/p0-coordinator-role-ownership-bypass-diff.txt`, relative to that root,
  taken against base commit `e99b6c13` (the diff is `git diff e99b6c13..1b241614 -- server/`).
- The diff is **deliberately scoped to source and tooling only** (everything under `server/`,
  including the two new test files). Story-tracking edits (`specs/stories/deferred-work.md`,
  `specs/stories/sprint-status.yaml`) are excluded from it on purpose, so this pass stays genuinely
  blind to the author's own account of what was intended. Do not treat their absence as an omission
  or go hunting for them.
- Repo root: this checkout is one of four sibling repos in an umbrella workspace at
  `D:\Terra Mortis\`. Do not read or touch `TM Story`, `TM Herald`, `TM Admin`, or `TM Design
  System` — they are unrelated repos with their own remotes; nothing in this review needs them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
  For this pass specifically: you may open files ONLY to resolve an import path the diff itself
  leaves ambiguous (e.g. confirming what `isStRole` actually does, since the diff calls it but does
  not define it). Do not explore beyond that.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm
  the restore with `git diff`, and say so in your output.
- Environment hazards: `server/.env` in this checkout points at the **live production** MongoDB
  Atlas database (`tm_game`), not a local/test instance — there is no separate local DB for manual
  smoke-testing. Do NOT start the server (`node index.js` / `npm run dev`) against it. Vitest is
  safe to run — its own setup file forces every suite onto `tm_game_test`, never live data. Several
  vitest suites additionally need a local `mongod`; without one they **skip rather than fail** — a
  skipped suite is not a passing suite, note it explicitly if you see it.
- Blast radius: this diff touches shared authorization helpers reused across many routes beyond the
  seven files it edits (`isStRole`, and the `requireOrdealNotRetiredForPlayers` middleware shared by
  three different routers). A mistake in how the diff uses those shared primitives — as opposed to a
  mistake local to one route — silently affects every OTHER consumer of the same helper, not just
  the files this diff names.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing in a pass or at a severity, say that explicitly rather than omitting the
  section or padding with style opinions.
- Report the exact current gate numbers you observe (see Output below) — the real numbers, even if
  you have no baseline to compare them to.

---

## What this diff claims to be

A security fix across an Express 5 API. Seven server-side files (five route files, one shared
middleware, plus two new test files) replace an ownership/authorization check that tested the
literal string `req.user.role === 'player'` with a call to a helper `!isStRole(req.user)`. The
stated defect: this API has (at least) four distinct account roles — `player`, `coordinator`, `st`,
`dev` — and the old check only special-cased `player`, so a `coordinator`-role account fell through
every one of these checks as if it were staff, reading and writing data (other players' downtime
submissions, personal history, questionnaire responses, ordeal responses, full character sheets) it
should never have been able to touch, and in one file (`game-sessions.js`) deleting any game session
outright with no role check at all beyond a looser router-level mount.

**That is the shape it claims. Do not trust the shape — verify it.**

## What to hunt for

1. **`server/routes/downtime.js` has four separate call sites touched in this diff**
   (`requireFormNotRetiredForPlayers`, the `GET /hold-flags` character-scoping filter, the main
   `GET /` character-scoping filter + its `stripStReview` call, and the `PUT /:id` ownership+deadline
   check + its own `stripStReview` call). Read all four in the diff. Do they all use the identical
   `!isStRole(req.user)` predicate? Is there any site among the four whose *surrounding* logic (the
   deadline check inside the `PUT` ownership block, in particular) reads differently now that the
   condition is inverted from a positive `role === 'player'` test to a negative `!isStRole()` test —
   i.e. did the diff correctly keep everything that used to be *inside* the player-only `if` block
   still inside the new block, with no logic silently promoted outside it or left orphaned?

2. **`server/routes/game-sessions.js`**: the diff adds `requireRole('st')` as new middleware on the
   `DELETE /:id` route, with a comment claiming the router is mounted behind
   `requireRole('coordinator')` and that `requireRole`'s own implementation "auto-expands" that to
   include `st`/`dev`. You do not have `server/middleware/auth.js` in this diff — flag this claim as
   **"worth checking"** rather than asserting it true or false; a later pass has the file. Separately:
   is `requireRole('st')` actually composed *before* the route handler runs (correct Express
   middleware ordering, comma-separated arguments to `.delete()`), or could it be shadowed/skipped by
   something earlier in the file?

3. **`server/middleware/ordeal-retirement.js`**: `requireOrdealNotRetiredForPlayers` now guards on
   `ORDEALS_RETIRED && !isStRole(req.user)`. You don't have the definition of `ORDEALS_RETIRED` in
   this diff (it's imported from `public/js/ordeals/ordeal-retirement.js`, outside the diff) — flag
   as "worth checking" whether this gate is even currently active, since if the constant is `false`
   this whole code path (and the vulnerability it closes) may not be exercised in production at all.
   This same function is imported and used as route middleware in `history.js`, `ordeal-responses.js`
   and `questionnaire.js` per the diff — check each of those three files' diffs actually still wires
   `requireOrdealNotRetiredForPlayers` onto the routes that need it (the diff hunks for those three
   files do NOT show that middleware being added or removed — confirm it was already present
   pre-diff and nothing here silently drops it).

4. **`server/routes/characters.js`**: the diff's own comment claims this file "already uses
   `!isStRole(req.user)` everywhere else (lines ~247, ~809, ~866, ~1042)" and that `GET /:id` was
   "the one inconsistent spot." You only have the diff, not the full file — you cannot verify the
   other three line numbers exist or are consistent. Flag this specific claim as unverified-in-this-
   pass rather than accepting it.

5. **`server/routes/questionnaire.js`**: the `PUT /:id` approved-lock check changed from
   `req.user.role === 'player' && existing.status === 'approved'` to
   `!isStRole(req.user) && existing.status === 'approved'`. Read the full hunk: is the ownership
   check immediately above it (also changed to `!isStRole`) evaluated and short-circuited (with an
   early `return`) BEFORE the approved-lock check runs, or could a non-owning, non-ST account
   (including a `coordinator`) reach the approved-lock branch at all? Trace the actual control flow
   in the diff, don't assume from the surrounding comments.

6. **Self-contradiction check**: search the diff itself (not the wider repo — you don't have it yet)
   for any place where a comment claims a role is now excluded/blocked, but the code on the very next
   line still contains a residual `=== 'player'` comparison somewhere nearby that the diff did NOT
   touch, which would mean the fix is incomplete even within the lines shown.

7. **The two new test files** (`server/tests/p0-coordinator-role-ownership-bypass.test.js` and
   `-http.test.js`): read them as ordinary test code. Any assertion whose PASS condition is trivially
   satisfiable (a check that would also pass if the code under test were still broken)? Any test that
   asserts on a source-code string/regex match rather than actual behaviour, and if so, is the regex
   loose enough to also match unrelated code (a false-negative risk, not just false-positive)? Any
   `async`/`await` misuse, unhandled promise rejection, or a request assertion whose status-code check
   would also pass on a totally different failure (e.g. asserting `!== 200` when the real intent is
   `=== 403`)?

8. Dead code, unused imports (does every file that now imports `isStRole` actually call it at least
   once?), or unreachable branches introduced by the edits.

**STOP. Write your Pass 1 findings now — do not proceed to explore the wider repo.**

## Output

Write everything to
`specs/stories/code-review/p0-coordinator-role-ownership-bypass-pass1-findings.md`,
grouped `## High` / `## Medium` / `## Low`, each finding tagged `[Pass 1]`. Write `- None found.`
under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened (should be limited to the diff itself, plus at most `isStRole`'s definition
  if you needed to resolve it).
- Every command you ran, with its real result.
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
