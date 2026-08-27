# Adversarial review — PASS 2 EDGE CASE HUNTER — oxp-9-spend-routes-through-oaq (Office XP spend routes through the ST Approval Queue), Terra Mortis TM Game

You are reviewing a completed change in a repo you have full read access to. You have NONE of the
conversation in which it was written.

This is an **isolated single pass** — one of three independent reviews of the same diff, each run
in its own separate session with no memory of the others. Do the best possible job within this
pass's own remit.

You have **full read access to the repository** at `D:\Terra Mortis\TM Game`. Read whatever
surrounding code you need to understand what this change actually plugs into. You still do **not**
have the story spec or any account of the author's intent (do not open, glob for, or grep for
anything under `specs/stories/` — it is deliberately excluded) — work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

## Ground rules

- The diff is at `specs\stories\code-review\oxp-9-spend-routes-through-oaq-diff.txt`, relative to
  the repo root, taken against base commit `5eecf69f`.
- The diff is **deliberately scoped to source and tooling only** (`server/` and `public/`).
  Story-spec and tracking edits are excluded from it on purpose. Do not treat their absence as an
  omission and do not go looking for them.
- Read and run freely to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- **Do not touch or read the sibling repos** at `D:\Terra Mortis\TM Admin`, `D:\Terra Mortis\TM Story`,
  or `D:\Terra Mortis\TM Herald` — out of scope.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- This repo shares a local machine with other active Claude Code sessions on sibling projects. A
  held port (8080 in particular) may be occupied — pick a free alternate port if you need one and
  say which. Some server test suites need a local `mongod` and skip rather than fail without one —
  a skipped suite is not a passing suite; read the actual summary line.
- This diff widens **shared infrastructure**: the `contested_roll_requests` collection's
  `request_type` discriminator (also used by player-vs-player contested rolls, Status Actions, and
  Humanity Checks), `office-actions.js`'s shared `GET /pending` feed, and `contested-rolls.js`'s
  shared void/challenge-lookup guards. A mistake here can silently break one of those OTHER
  consumers too, not just office purchases.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly rather than omitting the section.
- Report the exact current gate numbers you observe if you run anything:
  `cd server && npx vitest run tests/oxp-9-spend-routes-through-oaq.test.js`,
  `tests/oaq-2-pending-status-actions.test.js`, `tests/oaq-3-approval-queue.test.js`,
  `tests/gdx-12-humanity-check-oaq-submit-approve.test.js` — these are the existing suites that
  share the infrastructure this diff widens. Report the real numbers.

### Orientation (not ground truth — verify against the code)

A new Express route file `server/routes/office-purchase.js` adds a holder-submitted,
ST-approved purchase flow for office XP, writing pending records with
`request_type: 'office_purchase'` into the shared `contested_roll_requests` collection (the same
collection `contested_roll` (player-vs-player), `status_action`, and `humanity_check` records
already live in). The accept route is transactional and, on success, writes to either
`office_merit_dots` or `office_manoeuvre_ranks`. Two existing files get a filter widened by one
`request_type` value each. Client-side, a new UI branch renders these requests in the existing
Approval Queue, and the Office tab gains holder-facing controls to submit them.

### What to hunt for

1. **Route/matcher order.** `office-purchase.js` mounts at `/api/office_purchase_requests` (find
   the exact mount line in `server/index.js`). Confirm it cannot collide with, shadow, or be
   shadowed by any existing route — in particular check there is no pre-existing route matching a
   pattern that could also match `/:id/accept` or `/:id/decline` under a different mount prefix.
2. **Malformed/absent input at every new entry point**, traced by hand against the actual code (not
   assumed): `POST /` with `seat_id` missing, malformed (not 24-hex), or pointing at a
   non-existent/vacant seat; `purchase_kind` outside `['merit','manoeuvre']`; `merit` supplied as an
   array, object, or empty string, for both a `merit` and a `manoeuvre` request; `GET /` with
   `seat_id` absent, or arriving as an array (a repeated query key under Express 5's default
   `'simple'` query parser — construct this and check the actual behaviour, don't just trust the
   comment claiming it's handled); `PUT .../accept` and `.../decline` with a non-ObjectId `:id`, or
   an `:id` that resolves to a document with a different `request_type` (e.g. a real
   `status_action`'s id).
3. **What happens when a precondition holds at submission and is stale by accept-time**: an office
   seat is deleted or its `office_category` changed between POST and accept; the merit/manoeuvre
   this request targets is removed from `OFFICE_DATA` between POST and accept; the requester loses
   the seat (a handover) between POST and accept; the seat's balance drops below the requested
   amount (e.g. an ST directly steppers a purchase through the untouched PUT routes) between POST
   and accept. For each: does the accept route actually re-check this against LIVE state inside its
   transaction, or does it silently trust the value captured at submission? Trace the real code, not
   the comments describing intent.
4. **State mutated by one step leaking into a later step within the SAME accept transaction**: does
   any write inside the transaction depend on a value read earlier in that SAME transaction that
   could itself be stale relative to a concurrent write completing between the read and the write —
   i.e. does MongoDB's transaction isolation genuinely prevent this, or is it merely assumed?
5. **Two concurrent accepts on the same pending request** — actually construct this (two near-
   simultaneous `PUT .../accept` calls against the same `:id`, e.g. with `Promise.all` against a
   locally running server and a local `mongod`) if you can get a local server running; report
   exactly what you observed (both status codes, and whether exactly one dot/rank increment landed)
   rather than reasoning about it abstractly. If you cannot get a local server + mongod running,
   disclose that explicitly and reason from the code instead, saying clearly that this is a static
   read, not a runtime-confirmed one.
6. **Fixture/mock shape vs. real consumer, field for field**: read the new client-side row renderer
   in `public/js/suite/office-approvals.js` (the `office_purchase` branch) and confirm every field
   it reads off a request document is actually present, with the actual type, in what
   `server/routes/office-purchase.js`'s `POST /` handler inserts and what its `accept`/`decline`
   handlers return. Look specifically for a field name typo or type mismatch between server and
   client that unit tests alone might not have caught (e.g. the client reading `seat.label` where
   the server wrote `seat_label`, or expecting a string where the server sends `null`).
7. **`office-tab.js`'s new holder controls**: trace what happens when the new pending-request fetch
   (folded into `_refreshPurchaseState`'s `Promise.allSettled`) rejects while the merit-dots and
   manoeuvre-rank fetches in the same `allSettled` succeed. Does the rendered UI actually degrade
   gracefully (disabled-with-unknown state) as intended, or could a rejected promise in that
   `allSettled` array cause something else in the same render pass to throw or render incorrectly?
8. **Render-generation guard**: `office-tab.js` uses a generation counter (`el._officeManoeuvreGen`
   or similar) to discard stale async responses. Confirm the new request-submission code path
   actually checks this guard before painting its own result, the same way the existing
   `_adjustMeritDots`/`_adjustManoeuvreRank` handlers do — don't assume it from the pattern, read
   the actual new code.
9. **`officeSeatXp`'s `spendKnown` output** is computed inside the accept route (it needs `allSeats`
   as an argument) but this story is documented elsewhere as never reading it. Confirm nothing in
   the new code path actually branches on `spendKnown`, and confirm passing the full `allSeats`
   array doesn't change the `earned`/`spent`/`left` result for a single-seat category versus a
   multi-seat one (it shouldn't — `spendKnown` is meant to be orthogonal).

**STOP. Write your Pass 2 findings to
`specs\stories\code-review\oxp-9-spend-routes-through-oaq-codex-findings-pass2.md` now.**

---

## Output

Write your findings to
`specs\stories\code-review\oxp-9-spend-routes-through-oaq-codex-findings-pass2.md`, grouped
`## High` / `## Medium` / `## Low`, each tagged `[Pass 2]`. Write `- None found.` under any empty
heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened, confirming you did not read the excluded spec/tracking files.
- Every command you ran, with its real result, including the four suites named above if you ran
  them.
- Anything you could not run, and why (in particular, whether you managed a real concurrent-accept
  runtime test or only a static read).
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
