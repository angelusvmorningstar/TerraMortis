# Adversarial review — Pass 2 of 3 (EDGE CASE HUNTER) — p0-coordinator-role-ownership-bypass, TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is pass **2 of 3**, pasted to you in isolation. You will not see the other two passes. You have
full read access to the repository now, but you still do NOT have the author's own account of intent
(no story spec, no commit narrative beyond the commit message itself) — work from the code.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/p0-coordinator-role-ownership-bypass-diff.txt`, relative to that root,
  taken against base commit `e99b6c13` (the diff is `git diff e99b6c13..1b241614 -- server/`). The
  full commit is `1b241614` — you may `git show`/`git log` it directly if useful.
- The diff is **deliberately scoped to source and tooling only**. Story-tracking edits
  (`specs/stories/deferred-work.md`, `specs/stories/sprint-status.yaml`) are excluded from the diff
  file on purpose — you may read them if you want the author's own contemporaneous account (they are
  real files in the repo, not hidden from you at this pass), but they are not required, and doing so
  is optional context rather than ground truth to be trusted.
- This checkout is one of four sibling repos in an umbrella workspace at `D:\Terra Mortis\`. Do not
  read or touch `TM Story`, `TM Herald`, `TM Admin`, or `TM Design System` — unrelated repos, nothing
  here needs them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm
  the restore with `git diff`, and say so in your output.
- Environment hazards: `server/.env` in this checkout points at the **live production** MongoDB
  Atlas database (`tm_game`) — there is no local/test DB config for manual smoke-testing. Do NOT
  start the server (`node index.js` / `npm run dev`) against it under any circumstances. Vitest is
  safe — its setup file forces every suite onto `tm_game_test`. Some suites need a local `mongod` and
  **skip rather than fail** without one; a skipped suite is not a passing suite, note it if you hit
  it.
- Blast radius: this diff's real subject is two shared authorization primitives —
  `isStRole()` (`server/middleware/auth.js`) and the `requireOrdealNotRetiredForPlayers` middleware
  (`server/middleware/ordeal-retirement.js`, shared by three different routers) — not just the seven
  files that call them. A mistake in either primitive, or in the role-hierarchy logic inside
  `requireRole()` in the same file, silently affects every OTHER route that already depends on them,
  not only the ones this diff touches.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly.
- Report the exact current gate numbers you observe (see Output below).

---

## Orientation (not ground truth — verify against the code)

Seven server-side files replace a role check that special-cased only `'player'`
(`req.user.role === 'player'`) with `!isStRole(req.user)`, on the theory that this API has a fourth
role, `coordinator` (non-ST staff scoped to check-in/finance/emergency duties — see
`isCoordinatorRole` in `server/middleware/auth.js`), which the old checks let fall through as if it
were staff. `game-sessions.js`'s `DELETE /:id` additionally gains its own `requireRole('st')`
middleware, on the claim that the router's mount-level `requireRole('coordinator')` (see
`server/index.js`) "auto-expands" to admit `st`/`dev`, leaving the handler with no real role
restriction of its own before this diff.

## What to hunt for

1. **Read `requireRole()` and `isStRole()`/`isCoordinatorRole()` in full**, in
   `server/middleware/auth.js`. Hand-trace `requireRole('coordinator')`: does it actually expand to
   admit `st` and `dev`, confirming the game-sessions.js comment's central claim? Hand-trace
   `requireRole('st')`: does it expand to admit `dev` but explicitly NOT `coordinator`? Walk the
   exact branches (`if (roles.includes('st') ...)`, `if (roles.includes('coordinator')) ...`) by hand
   rather than trusting the variable names — confirm the array mutation logic (`effective.push(...)`)
   produces the set the comment claims for both calls actually used in this diff and in the pre-
   existing mount at `server/index.js`.

2. **Read `server/index.js`'s mount lines for every router this diff touches**
   (`/api/characters`, `/api/downtime_submissions`, `/api/questionnaire`, `/api/history`,
   `/api/ordeal-responses`, `/api/game_sessions`). For each: what role gate, if any, applies at the
   mount level, before the request ever reaches the route-level checks this diff edited? Confirm
   whether any of the five non-`game_sessions` routers already had a coarser mount-level gate that
   would have made the underlying bug less severe than the diff's own account claims (i.e. is the
   diff's framing of "any authenticated player-or-coordinator-or-worse reaches these handlers"
   actually accurate, or does `requireAuth` alone — no role restriction — gate all five?).

3. **Completeness sweep — is the fix actually complete?** `grep -rn "role === 'player'"` and
   `grep -rn "role !== 'player'"` (and any near variants: `.role == 'player'`,
   `user.role === "player"`, double-quoted) across `server/routes/` and `server/middleware/`. List
   every remaining hit. For each one found OUTSIDE the seven files this diff touches, determine
   whether it represents the same unfixed vulnerability class (a `coordinator` account falling
   through an ownership check meant to exclude only staff) or is legitimately different (e.g. a
   genuinely player-specific UX branch, not a security gate). Do NOT assume `attendance.js` is safe
   just because a comment elsewhere claims it's deliberately out of scope — read its actual check and
   form your own judgement about whether coordinator access there is bounded the way check-in/finance
   work should be, or whether it's the same open gate.

4. **Role-hierarchy edge case**: can a single account simultaneously be `role: 'coordinator'` AND
   have a non-empty `character_ids` array (i.e. a coordinator who is also a player, owning their own
   character)? If `player` schema/data allows this, trace what the FIXED code now does for such an
   account in `characters.js` `GET /:id`, `downtime.js`, `history.js`, `questionnaire.js`: does
   `!isStRole(req.user)` correctly let them through to their OWN owned character/data (since the
   ownership sub-check runs identically for `player` and `coordinator` now), or does the fix
   accidentally block a coordinator from data they legitimately own? This is the kind of "fixed too
   hard" edge case a Blind Hunter pass cannot see without the ownership-check code beneath the outer
   `if`.

5. **Malformed/missing role.** What does `isStRole(user)` return for `user.role === undefined`,
   `null`, an empty string, or a role string that doesn't exist in this app's real role set at all
   (typo, stale token, future role added later without updating this helper)? Confirm it fails
   CLOSED (treated as non-ST, so ownership checks still apply) rather than open. Same question for
   `isCoordinatorRole`. This matters because a fail-open here would be the exact same bug class this
   diff is fixing, just relocated.

6. **`stripStReview` mutation semantics** (`server/helpers/strip-st-review.js`): does it mutate the
   document object in place, or return a new object? `downtime.js`'s `GET /` does
   `docs.forEach(doc => stripStReview(doc))` — if the helper returns a new object rather than
   mutating, this line is a silent no-op and every non-ST caller (players AND, after this fix,
   correctly-blocked coordinators who somehow still reach this far) would see unredacted `st_review`
   fields. This is pre-existing code, not introduced by this diff, but the diff's own commit message
   claims this exact code path is now correctly gated — verify the claim by testing the mutation
   behaviour directly, not by reading the function name.

7. **`ORDEALS_RETIRED`** (`public/js/ordeals/ordeal-retirement.js`, imported by
   `server/middleware/ordeal-retirement.js`): read its actual current value/definition. Is the gate
   this diff hardens (`ORDEALS_RETIRED && !isStRole(...)`) currently active in this codebase, or is
   the constant `false`/conditionally computed such that the vulnerability this part of the diff
   closes was never actually reachable? State plainly either way — this affects how much real-world
   exposure this specific piece of the fix represents.

8. **Malformed or absent input at the new entry points**: for `characters.js` `GET /:id`,
   `history.js`, `questionnaire.js`, `ordeal-responses.js` — what happens when `req.user` is present
   but `req.user.character_ids` is `undefined` (not just empty) for a role that now falls into the
   `!isStRole` branch? Does `(req.user.character_ids || [])` appear consistently, or did the diff
   introduce or leave any call site missing that guard?

9. **Route matcher / middleware order**: for `game-sessions.js`, confirm `requireRole('st')` is
   registered as actual Express middleware ahead of the handler (correct argument position in
   `.delete(path, requireRole('st'), handler)`), not accidentally placed somewhere it would never
   run (e.g. inside the handler body as a plain function call with no `next()`/response wiring).

**STOP. Write your Pass 2 findings now — do not read the deferred-work.md/sprint-status.yaml entries
as ground truth even if you opened them for orientation; a later pass owns that comparison.**

## Output

Write everything to
`specs/stories/code-review/p0-coordinator-role-ownership-bypass-pass2-findings.md`,
grouped `## High` / `## Medium` / `## Low`, each finding tagged `[Pass 2]`. Write `- None found.`
under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened, beyond the diff itself.
- Every command you ran, with its real result.
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
