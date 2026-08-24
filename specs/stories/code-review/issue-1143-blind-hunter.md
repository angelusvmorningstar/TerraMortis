# Adversarial review — issue-1143-status-actions-auth-safety (Status Actions — actor authorization + write safety), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

**This is Pass 1 of 3 (Blind Hunter), run as an ISOLATED session** — you will not see Pass 2 or
Pass 3's material, and they will not see yours until all three are complete.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/issue-1143-diff.txt` and is relative to that root, taken against base
  commit `aca9e996`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/issue-1143-status-actions-auth-safety.md`, `specs/stories/sprint-status.yaml`)
  are excluded from it on purpose, so this pass stays genuinely blind to the author's own account.
  Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Suite`) has sibling repos in the same
  umbrella workspace one level up (`TM Cockpit`, `TM Wiki`, `TM Herald`) — do not read or touch
  them; they are irrelevant to this diff.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm
  the restore with `git diff`, and say so in your output.
- Environment hazards: the local MongoDB (`127.0.0.1:27017`, a Windows service) is a STANDALONE
  instance, not a replica set — do not attempt multi-document transactions against it, they will
  fail unconditionally. Vitest hard-overrides the DB name to `tm_suite_test` under test — never
  target the bare `tm_suite` database. `fileParallelism` is `false` project-wide (tests run
  sequentially in one process) — do not attempt to parallelise test runs. A full `npx vitest run`
  (no filter) takes ~5 minutes and has 6 known-unrelated pre-existing failures across 11 files
  (`oath-a-pledge-helpers.test.js`, `n7-n9-allocator-readers.test.js`,
  `epic.708.3-cycle-phase-controls.test.js`, plus 7 files with pre-existing file-level errors like
  stale `ENOENT`/`SyntaxError`) — prefer the targeted command below unless you need the full run.
- Blast radius: `server/routes/office-actions.js` is a live production route that mutates a
  character's `status.city` (City Status) directly during an in-person LARP session — a bug here
  is not cosmetic, it changes what a Storyteller believes is true about a character's political
  standing. `server/tests/helpers/db-setup.js` is shared test infrastructure imported by roughly
  15+ other test files project-wide. `server/index.js`'s boot sequence runs for every route.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing in a pass or at a severity, say that explicitly rather than omitting the
  section or padding with style opinions.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`.
  Report the real numbers even if they disagree with anything the diff or a comment claims —
  especially then.

---

## PASS 1 — BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1143-diff.txt` and **nothing else**. No spec,
no story file, no project context. Do not explore the repository beyond resolving an import path
the diff itself leaves ambiguous.

### What this diff claims to be

A security-hardening fix to an Express route (`server/routes/office-actions.js`, `POST /`) that:
adds an actor-ownership authorization check before processing; derives the session id it scopes
budget/dedupe queries by from the server's own database query instead of trusting a client-supplied
field; adds a MongoDB partial unique index plus an insert-then-recount-with-compensating-delete
pattern intended to make a budget check and a per-target duplicate check atomic under concurrent
requests; and rewrites a self-target check to compare parsed `ObjectId`s instead of raw strings. It
also adds a non-throwing DB-connectivity probe (`isDbAvailable()`) to shared test helper
`server/tests/helpers/db-setup.js`, and two new test files plus edits to two existing ones.

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. **The compensating-delete window.** In the `POST /` handler's paid-action branch: an
   `insertOne` happens, then a `countDocuments` recount, then — if over budget — a `deleteOne` on
   the just-inserted doc, then a 403. Is there ANY path where the insert succeeds, the recount
   incorrectly reads the count as within-budget (or the delete silently fails/no-ops), and the
   handler proceeds to mutate `characters.status.city` anyway for an over-budget action? Trace the
   exact boundary arithmetic: is it `>` or `>=` against the freshly-inserted count, and does that
   match the STATED intent of "at most `budget` actions may ever land"? Walk a concrete numeric
   example by hand (budget=3, 2 prior successful actions, 1 new request arrives) and confirm the
   arithmetic the diff performs actually produces the claimed boundary.
2. **The duplicate-key catch.** The insert is wrapped in a try/catch checking `err?.code === 11000`
   to detect the new partial unique index's violation and translate it to a 409. Is `err.code` the
   correct property on this MongoDB Node driver's error for a duplicate-key violation, or could the
   real code live at `err.errorResponse.code`, a nested `err.writeErrors[0].code`, or similar,
   meaning this catch silently never fires and an E11000 instead propagates as an unhandled 500?
3. **Trivially-satisfiable checks.** Any assertion, guard, or boundary condition in the diff whose
   pass condition is weaker than its name/comment implies — including in the new/modified test
   files (a test that would pass even if the fix were reverted is worse than no test).
4. **Ordering and information leakage.** The new authorization check runs before the route's
   existing checks (game-phase gate, session lookup, self-target check, actor/target existence).
   Does any error response emitted BEFORE the authorization check — or any response ordering
   overall — leak information a non-owner shouldn't get (e.g., confirming a specific `actor_id`
   exists, or is a valid office-holder, before confirming the caller is allowed to act as them)?
5. **Error paths and unhandled rejections.** Every `await` in the rewritten handler and in the new
   `findLatestSession()` helper — what happens if any of them rejects (a transient Mongo error, not
   a validation failure)? Does the route send a response, or can it hang / double-respond / crash
   the process?
6. **Resource cleanup on the thrown path.** If the `countDocuments` recount itself throws (not just
   returns a bad count), does the already-inserted document get orphaned with no compensating
   delete, since the delete only runs on the "over budget" branch, not on a genuine exception?
7. **Self-contradiction within the diff.** Does any code comment claim a guarantee ("never
   over-accept", "atomic", "single source of truth") that a different part of the same diff
   contradicts? Does the diff claim to leave something unchanged (e.g. a schema, a client) and then
   touch it anyway, or vice versa?
8. **Dead code / unused imports / unreachable branches** introduced by the diff — in particular,
   check whether any import, variable, or helper added is genuinely used on every path that reaches
   it, and whether anything from the pre-diff code is now unreachable but not removed.
9. **The two new test files** (`server/tests/issue-1143-office-actions-auth-safety.test.js`,
   `server/tests/issue-1143-db-setup-skip.test.js`): do their assertions actually exercise the
   claimed behaviour, or could an equally-plausible-looking implementation with a real bug still
   pass them? Pay particular attention to the two concurrency tests (`Promise.all`-based) — is
   there a race in the TEST ITSELF that could make it pass regardless of whether the production
   code is actually atomic (e.g. asserting on a value that both a correct and an incorrect
   implementation would produce)?

Flag anything you cannot judge without the spec as "worth checking" rather than asserting it.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/issue-1143-blind-hunter-findings.md` now.**

## Output

Write your findings to `specs/stories/code-review/issue-1143-blind-hunter-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each tagged `[Pass 1]`. Write `- None found.` under any empty
heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened, and confirmation you stayed within Pass 1's scope (diff only).
- Every command you ran, with its real result, including the gate command above.
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
