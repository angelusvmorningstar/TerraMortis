# Adversarial review — PASS 1 BLIND HUNTER — oxp-9-spend-routes-through-oaq (Office XP spend routes through the ST Approval Queue), Terra Mortis TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is an **isolated single pass** — one of three independent reviews of the same diff, each run
in its own separate session with no memory of the others. You will never see the other two passes'
output. Do the best possible job within this pass's own remit; do not try to compensate for what you
imagine the other passes might miss.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs\stories\code-review\oxp-9-spend-routes-through-oaq-diff.txt`, relative to that root, taken
  against base commit `5eecf69f`.
- The diff is **deliberately scoped to source and tooling only** (`server/` and `public/`).
  Story-spec and tracking edits (`specs/stories/oxp-9-spend-routes-through-oaq.md`,
  `specs/stories/sprint-status.yaml`) are excluded from it on purpose, so this pass stays genuinely
  blind to the author's own account of what the story was supposed to do. **Do not treat their
  absence as an omission and do not go looking for them** — do not open, glob for, or grep for any
  file under `specs/stories/` during this pass.
- Read and run freely to verify a claim about the DIFF ITSELF. Running the code beats reasoning
  about it every time.
- **Do NOT modify, commit, or push anything** in this repo.
- **Do not touch or read the sibling repos** at `D:\Terra Mortis\TM Admin`, `D:\Terra Mortis\TM Story`,
  or `D:\Terra Mortis\TM Herald` — this change does not touch them and they are out of scope.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- This repo shares a local machine with other active Claude Code sessions on sibling projects. A
  held port (8080 in particular) may be occupied by an unrelated process — if you need to run the
  live server/frontend, pick a free alternate port and say which one you used. Some server test
  suites need a local `mongod` and this repo's own convention is that they **skip rather than
  fail** without one — a skipped suite is not a passing suite; read the actual summary line, not
  just the exit code.
- This diff widens **shared infrastructure**: the `contested_roll_requests` collection's
  `request_type` discriminator (also used by player-vs-player contested rolls, Status Actions, and
  Humanity Checks), `office-actions.js`'s shared `GET /pending` feed, and `contested-rolls.js`'s
  shared void/challenge-lookup guards. A mistake here can silently break one of those OTHER
  consumers too, not just office purchases.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, say that explicitly rather than omitting the
  section or padding with style opinions.
- Report the exact current gate numbers you observe if you run anything:
  `cd server && npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js` (the new suite this
  diff adds). Report the real numbers even if you have no spec to compare them against.

---

## The diff

You get the diff at `specs\stories\code-review\oxp-9-spend-routes-through-oaq-diff.txt` and
**nothing else**. No spec, no story file, no project context beyond what's in this document. Do not
explore the wider repository beyond resolving an import path the diff itself leaves ambiguous, or
running the new test suite named above.

### What this diff claims to be (mechanical description only, not the author's intent)

A new Express route file `server/routes/office-purchase.js` adds
`POST /api/office_purchase_requests`, `GET /api/office_purchase_requests?seat_id=`,
`PUT /api/office_purchase_requests/:id/accept`, `PUT /api/office_purchase_requests/:id/decline`,
writing pending records with `request_type: 'office_purchase'` into the existing
`contested_roll_requests` collection. A new schema file validates the POST body. The accept route
runs inside a MongoDB transaction, reads current state, and on success writes to either
`office_merit_dots` or `office_manoeuvre_ranks`. Two existing route files
(`server/routes/office-actions.js`, `server/routes/contested-rolls.js`) each get a one-line filter
widened to include the new `request_type` value. Two client files
(`public/js/suite/office-approvals.js`, `public/js/tabs/office-tab.js`) get new UI to submit and
display these requests. `public/js/data/office-xp.js` gets a comment-only edit.

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. In `server/routes/office-purchase.js`'s `checkPurchaseValidity` function: verify the ORDER of
   its checks. Specifically confirm that a `merit` value can never reach
   `MERIT_DOT_CAPS[merit]` (an object-keyed lookup) before it has first been confirmed to be a
   member of `officeEntry.merits` — walk the exact statement order, don't infer it from variable
   names.
2. The `holderCharacterId` helper does `(user?.character_ids || []).map(String)` then an
   `.includes()` check. Consider what happens if `character_ids` is present but contains something
   unexpected (not an array of ids) — does this fail safe (deny) or could it fail open (grant)?
3. The `PUT /:id/accept` route calls `_findPendingPurchase(req, res)` **before** starting its
   MongoDB transaction, then reuses that pre-transaction copy's `seat_id`, `purchase_kind`, `merit`,
   and `requested_by_character_id` fields for the rest of the route, rather than re-reading them
   inside the transaction. Is there any way those specific fields on a `contested_roll_requests`
   document could be mutated by anything else in this diff (or anything you can find that already
   existed) between that read and the transaction's own writes? If you can't find an update path,
   say so explicitly rather than flagging it as a gap.
4. Inside the accept route's transaction: the **claim** (marking the pending record `resolved`) is
   the first write, followed by the actual purchase-collection write (merit `$set` or the manoeuvre
   aggregation-pipeline update), both inside the same `withTransaction` callback. If the process
   crashed between those two writes, would MongoDB's transaction semantics genuinely leave BOTH
   uncommitted (atomic all-or-nothing), or is this an assumption the diff makes without it actually
   being guaranteed by how the code is structured? Verify by reading the actual transaction API
   usage, not by trusting the code comment that asserts it.
5. The accept route's `catch` block has a `_needsEnrichment` flag that triggers a **second,
   non-transactional** read of the pending document after the transaction has already ended
   (`dbSession.endSession()` in the `finally`). Trace exactly when this branch fires and whether the
   response body it constructs could ever be stale or wrong relative to what a concurrent
   accept/decline actually did.
6. The manoeuvre-rank update is an aggregation-pipeline `updateOne` using
   `$min`/`$max`/`$ifNull`/`$add`/`$literal`. Hand-trace what value `rank` ends up as when the
   stored document is: (a) missing entirely, (b) `{ rank: 0 }`, (c) `{ rank: <max> }` already at
   cap, (d) has some non-numeric or negative `rank`. Does the clamp genuinely prevent going above
   `max` or below `0` in every one of those cases?
7. Self-contradiction check: `office-purchase.js`'s own header comment asserts the existing ST-only
   PUT routes (`office-merit-dots.js`, `office-manoeuvre-rank.js`) are untouched "by design." Does
   the diff in fact leave those two files completely unmodified? Check the diff itself, don't just
   trust the claim.
8. Standard sweep, applied to this diff specifically: assertions/checks whose pass condition is
   trivially satisfiable; a check whose label claims more than it tests; unhandled promise
   rejections or missing `await`s anywhere in the new async routes; resource cleanup on the thrown
   path (is `dbSession.endSession()` reached on every exit, including an exception thrown before
   `withTransaction` is even entered?); dead code, unused imports, unreachable branches in the new
   files; any place a `400` should be a `403` or vice versa, or a status code that doesn't match its
   own `error` field's usual meaning elsewhere in this diff.

**STOP. Write your Pass 1 findings to
`specs\stories\code-review\oxp-9-spend-routes-through-oaq-codex-findings-pass1.md` now.**

---

## Output

Write your findings to
`specs\stories\code-review\oxp-9-spend-routes-through-oaq-codex-findings-pass1.md`, grouped
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

- Which files you opened, and confirmation you stayed within the diff plus resolving ambiguous
  imports only.
- Every command you ran, with its real result, including the new suite's pass/fail numbers if you
  ran it.
- Anything you could not run, and why.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
