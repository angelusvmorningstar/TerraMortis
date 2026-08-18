# Adversarial review — oaq-2-pending-status-actions-accept-decline (Pending Status Actions — submit, ST accept/decline), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written — you are here to catch what the author could not catch
about their own work.

**This is Pass 1 of 3 (Blind Hunter).**

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/oaq-2-diff.txt`, taken against base commit `ed181d8f`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  are excluded on purpose — stay genuinely blind to the author's own account for this pass.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo has sibling repos one level up (`TM
  Cockpit`, `TM Wiki`, `TM Herald`) — do not read or touch them.
- Temporarily editing a file to prove something (revert one line, confirm it fails the way you
  expect, restore it) is allowed — restore it exactly, confirm via `git diff`, and say so.
- Environment: the real `MONGODB_URI` (root `.env`) is a 3-node Atlas replica set — MongoDB
  transactions are genuinely available and used in this route. `fileParallelism` is `false`
  project-wide. A full `npx vitest run` has 5 known-unrelated pre-existing failures across 10
  files — prefer the targeted command below.
- Blast radius: `server/routes/office-actions.js` mutates a character's City Status during a live
  LARP session, now gated behind explicit ST approval — a bug here either lets an unapproved
  change through (defeating the entire point of this story) or silently blocks a legitimate one.

## Honesty requirements (outrank completeness)

- If you could not run something, say so and name what.
- If you found nothing at a severity, say that explicitly.
- Report the exact gate numbers you observe:
  `cd server && npx vitest run tests/oaq-2-pending-status-actions.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`.

---

## PASS 1 — BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oaq-2-diff.txt` and **nothing else**. No spec, no
story file, no project context. Read other files only to resolve an import path the diff itself
leaves ambiguous.

### What this diff claims to be

A rewrite of `server/routes/office-actions.js`'s `POST /` handler (previously: validate, then
apply a Status Action's effect immediately and atomically inside a MongoDB transaction) so that it
now only SUBMITS a pending request (into the `contested_roll_requests` collection, tagged
`request_type: 'status_action'`) — no character mutation, no budget claim. Two new routes,
`PUT /:id/accept` and `PUT /:id/decline` (both ST-role-gated), do the actual work: `accept`
re-validates the action against the target's CURRENT status, claims a budget slot, writes the
target via a compare-and-swap, and marks the request resolved; `decline` just marks it declined.
A new partial unique index prevents two concurrent pending requests for the same
(session, actor, target). The player-facing tab (`office-tab.js`) no longer shows an immediate
"Done" result.

**That is the shape it claims. Do not trust it — verify it.**

### What to hunt for

1. **The shared `computeNewStatus()` helper's exact semantics.** It's called from BOTH the submit
   route (a courtesy pre-check) and the accept route (the authoritative check). Read it in full.
   Does it throw the SAME error shape/status code in both call sites in a way that could confuse
   which check actually fired? Does either call site pass it a value it wasn't designed for (check
   argument order, types)?
2. **`_findPending()`'s scope.** It filters by `request_type: 'status_action'` — confirm this
   can't accidentally match (or be tricked into matching) a genuine `contested_roll` document if
   one somehow had a `status_action`-shaped `_id` collision or a missing `request_type` field. Is
   there any path where an old/malformed `contested_roll_requests` document (predating this
   change, no `request_type` field at all) could be picked up by the wrong handler?
3. **Trivially-satisfiable checks** — any assertion whose pass condition is weaker than its
   name/comment implies, including in the new/modified test files.
4. **The compensating/rollback story on accept.** If the budget claim succeeds but the
   subsequent CAS write fails (target changed), or the CAS succeeds but the `office_actions`
   insert fails, or that succeeds but marking the pending record resolved fails — walk each of
   these failure points and confirm the surrounding transaction genuinely rolls back EVERYTHING,
   not just some of it. (Same transaction pattern as issue-1143, but this is a NEW combination of
   operations inside it — don't assume it inherited correctness just because the pattern is
   familiar.)
5. **Error paths and unhandled rejections** in the two new routes — what happens if `new
   ObjectId(pending.actor_id)` or `new ObjectId(pending.target_id)` throws inside the transaction
   (a stored pending record with a malformed id, however that could arise)? Is it caught, or does
   it crash the request?
6. **Self-contradiction within the diff** — does a comment claim something a different part of the
   same diff does otherwise? Does the story's stated intent ("budget spends only on approval")
   hold EVERYWHERE, or is there a code path where submission still touches
   `office_action_budgets`?
7. **Dead code / unused imports / unreachable branches** introduced by this diff.
8. **The two rewritten `otc-2`/`issue-1143` test files and the new `oaq-2` test file** — do their
   assertions actually exercise the claimed behaviour, or could an equally-plausible but subtly
   wrong implementation still pass them? Pay particular attention to the `submitAndAccept` helper
   pattern used in two files — does it correctly propagate a submission failure (i.e. if submit
   itself returns non-201, does the helper avoid calling accept on garbage)?

Flag anything you cannot judge without the spec as "worth checking" rather than asserting it.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oaq-2-blind-hunter-findings.md` now.**

## Output

Write findings to `specs/stories/code-review/oaq-2-blind-hunter-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each tagged `[Pass 1]`. Write `- None found.` under any empty
heading rather than dropping it.

For each finding: **One-line title**, **Severity**, **File:line**, **The triggering input or
sequence**, **The observable consequence**, **Confidence**.

Close with **Validation notes**: files opened, commands run with real results (including the gate
command above), anything you could not run and why, confirmation nothing was left modified.
