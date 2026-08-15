# Adversarial review — otc-2-status-actions-server-hardening (Status Actions server hardening), TM Suite

## PASS 1 of 3 — BLIND HUNTER (the diff, and nothing else)

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

You get the diff at `specs/stories/code-review/otc-2-diff.txt` and **nothing else**. No spec, no
story file, no project context beyond what's below. Do not explore the repository beyond resolving
an import path the diff itself leaves ambiguous. Do not go looking for a spec file — one exists,
deliberately excluded from this diff, and a later pass in a separate file will hand you its path.
This is pass 1 of 3, each in its own file; work only this one.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/otc-2-diff.txt`, relative to that root, taken against base commit
  `9bdd8ad0`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and
  `sprint-status.yaml` edits are excluded on purpose. Do not treat their absence as an omission.
- This repo sits inside an umbrella workspace (`D:\Terra Mortis`) with sibling repos `TM Wiki`,
  `TM Cockpit`, `TM Herald`. **Do not read or touch anything outside `D:\Terra Mortis\TM Suite`.**
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **MongoDB connectivity is a known hazard in this environment.** The author's own session could
  not reach either the configured Atlas URI (hung indefinitely, no timeout) or a local `mongod`
  (fast `ECONNRESET` — `server/db.js` hardcodes `tls: true`). If you hit the same, disclose it
  plainly rather than silently skipping DB-backed tests — and if you *can* reach a working MongoDB
  in your environment, that is directly useful information: say so and report what you found.
- **Blast radius**: `public/js/data/accessors.js`'s `calcCityStatus`/`titleStatusBonus`/
  `regentAmienceBonus` are consumed by 9 call sites across the whole app (character export/CSV,
  the Status tab in both the admin and player apps, the sheet editor, and the Office tab). A
  mistake in the newly-extracted shared module or in how `accessors.js` now delegates to it
  silently changes City Status values app-wide, not just in the one endpoint this diff is named
  for.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing in a pass or at a severity, say that explicitly rather than omitting the
  section or padding with style opinions.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/otc-2-city-status-calc.test.js` and (attempt it — see the
  MongoDB note above) `cd server && npx vitest run tests/otc-2-office-actions-api.test.js`. Report
  the real numbers even if they disagree with anything a later pass's spec claims — especially
  then.

---

### What this diff claims to be

It hardens a Head of State "Status Actions" HTTP endpoint (`POST /api/office_actions`) two ways:
replacing a hand-duplicated, incomplete City-Status budget formula with a call into a newly
extracted shared calculation module (`public/js/data/city-status-calc.js`), and adding a 403 gate
that rejects all four action types unless a MongoDB `downtime_cycles` document is currently in
`'game'` phase. A companion client file (`public/js/tabs/office-tab.js`) reads the same phase
signal before rendering interactive buttons. Two new test files exercise the change: one is a
pure-function unit suite with no I/O; the other is a supertest-driven integration suite against a
live Express app + MongoDB, whose test-helper file (`server/tests/helpers/test-app.js`) was
modified to mount the router under test for the first time.

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. In `server/routes/office-actions.js`: the new phase-gate query fetches ALL `downtime_cycles`
   documents into memory (`.find().toArray()`), then filters/sorts in JS. Check this is safe
   against an empty or absent collection, and trace whether it runs before or after the
   self-target check and the actor/target lookups — the diff claims it runs first, unconditionally,
   for all four action types. Verify by reading the exact statement order, not the comments.
2. The new territories fetch (`getCollection('territories').find().toArray()`) — trace exactly
   when it runs relative to the actor's `court_category` check. Does it run even when the actor
   holds no office (wasted DB round-trip), or is it correctly gated behind the paid-action check?
3. `findRegentTerritory(territories, actor)` is called with `actor` straight from a
   `characters.findOne(...)` result, so `actor._id` is a real Mongo `ObjectId`. `helpers.js`'s
   `findRegentTerritory` does `String(c._id)` and compares against each territory's `regent_id`
   field. Check the actual stored type of `regent_id` on real territory documents (grep the
   territories route/schema) — if it's ever stored as an `ObjectId` rather than a string, this
   comparison silently returns null forever (bonus always computed as 0), a defect that would
   never throw, just silently under-compute budgets for every regent Head of State.
4. In `public/js/data/city-status-calc.js`: check the null-safety chain in
   `calcEffectiveCityStatus(c, regentAmbience)` — `c?.status?.city`. Is `Math.min(raw, 10)` applied
   correctly after all three terms are summed, not before?
5. `GATED_TYPES` vs `PAID_TYPES` in `office-actions.js` — verify by reading the code (not a
   comment) that the phase gate actually covers `grant_first` and `strip_last`, not just
   `raise`/`lower`.
6. `office-tab.js`: `getGamePhaseCycle()` is awaited inside a bare `try { } catch { /* ignore */ }`.
   If the underlying `apiGet` call fails for a reason OTHER than "no cycle is in game phase" (a
   genuine network error, a 500, an auth failure), does the UI still show "Available once the game
   session opens" — a misleading message that implies a game-state fact when the real problem is
   connectivity? Check whether this is distinguishable in the current code, or silently conflated.
7. Self-contradiction check within the diff: does anything in the new test files assert something
   that is trivially satisfiable regardless of the real logic (e.g. a loop-based budget test whose
   assertion would pass even with an off-by-one in either the test or the implementation)? Read
   `server/tests/otc-2-office-actions-api.test.js` and `server/tests/otc-2-city-status-calc.test.js`
   for this specifically.
8. `server/tests/helpers/test-app.js`'s new mount — `app.use('/api/office_actions', mockAuth,
   noCache(), officeActionsRouter)` — compare its middleware stack against how this router is
   mounted in `server/index.js` (production). Any divergence would make the new integration tests
   unrepresentative of real request handling.
9. Dead code / unused imports / unreachable branches anywhere in the four modified files and three
   new files.
10. Resource cleanup and error handling on thrown paths, not just the happy path, throughout the
    modified route handler.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/otc-2-codex-findings.md` now,
before reading further or opening any other pass's file.**

## Output (append this pass's findings, do not overwrite a later pass's)

Write your findings to `specs/stories/code-review/otc-2-codex-findings.md`, under a `## Pass 1 —
Blind Hunter` heading, grouped `### High` / `### Medium` / `### Low`, each finding tagged
`[Pass 1]`. Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened, and confirmation you did not go looking for the spec.
- Every command you ran, with its real result, including the two vitest commands named above.
- Anything you could not run, and why (name the MongoDB hazard explicitly if it applies to you).
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
