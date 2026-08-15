# Adversarial review — oaq-2-pending-status-actions-accept-decline (Pending Status Actions — submit, ST accept/decline), TM Suite

You are reviewing a completed change in a repo you have full access to.

**This is Pass 2 of 3 (Edge Case Hunter).** You have not seen Pass 1's material and will not see
Pass 3's until all three are complete.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/oaq-2-diff.txt`, taken against base commit `ed181d8f`.
- The diff is scoped to source/tooling only — you still do NOT have the story spec or the
  author's account of intent for this pass. Work from the code itself.
- **Read and run freely.** Running the code beats reasoning about it.
- **Do NOT modify, commit, or push anything.** Do not touch sibling repos (`TM Cockpit`, `TM
  Wiki`, `TM Herald`) even to read.
- Temporarily editing a file to prove something is allowed — restore it exactly, verify via
  `git diff`.
- Environment: real `MONGODB_URI` is a 3-node Atlas replica set — transactions genuinely work.
  `fileParallelism: false`. Full suite has 5 known-unrelated pre-existing failures across 10 files.

## Honesty requirements (outrank completeness)

- Say plainly what you could not run.
- Say explicitly when a pass/severity found nothing.
- Report exact gate numbers:
  `cd server && npx vitest run tests/oaq-2-pending-status-actions.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`.

---

## PASS 2 — EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you
need. Still no story spec.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth — verify against the code)

`server/routes/office-actions.js`'s `POST /` now creates a pending `contested_roll_requests`
document (`request_type: 'status_action'`) instead of applying the action. `PUT /:id/accept`
(ST-only) re-validates against the live target, claims budget, CAS-writes the target, logs to
`office_actions`, and resolves the pending record — all inside one transaction. `PUT /:id/decline`
(ST-only) just marks it declined. A new partial unique index (scoped to
`request_type:'status_action', status:'pending'`) blocks a second concurrent pending request for
the same (session, actor, target).

### What to hunt for

1. **Hand-trace the exact concurrent sequence for AC5's scenario**: actor A and actor B BOTH
   submit `grant_first` on the SAME target (different actors — the pending index doesn't block
   this, since it's keyed per-actor). Now trace what happens if their ACCEPTS race truly
   concurrently (not sequentially) rather than one-then-the-other. Does the transaction's own
   conflict-detection-and-retry correctly serialize them, or is there a window where BOTH accepts
   could read `old_status === 0` before either commits, both compute `new_status = 1`, and the
   CAS's `old_status === 0` clause (`$or: [{$exists:false}, {status.city:0}]` — read this filter
   carefully) lets both through because a WRITE CONFLICT never actually gets detected for THIS
   specific filter shape?
2. **Different action types racing on the same target, different actors, no shared pending-index
   collision.** E.g. actor A submits `raise` (needs old_status 1-9), actor B submits `grant_first`
   (needs old_status exactly 0), both on a target currently at 0. Both submissions succeed (A's
   submission-time precondition check would actually REJECT immediately — verify this: does the
   courtesy check at submission correctly catch this, or does it only get caught later at
   accept?). If both somehow got past submission, trace what accept does for each.
3. **A pending record surviving longer than the game session it was submitted under.** Since
   `game_session_id` is stamped at SUBMISSION time (from whatever session was live then), and
   `accept` reads `pending.game_session_id` rather than re-deriving a NEW live session — what
   happens if an ST accepts a pending request from a PREVIOUS session (the game moved to a new
   session in between, or the phase gate would now reject a fresh submission but this stale
   pending one was never re-checked against phase)? Does `accept` re-check the game-phase gate at
   all? Read the accept handler in full — does it call `currentCycleInGamePhase` anywhere, or does
   it just implicitly trust that "if it got submitted, phase must still be live"?
4. **Budget key construction**: `budgetKey = \`${pending.game_session_id}:${pending.actor_id}\``
   — since this is built from the STORED pending record's `game_session_id` (frozen at submission
   time), not a freshly-derived one, could an ST accepting several old pending requests from
   DIFFERENT sessions (if that's even reachable) end up claiming budget against session buckets
   that don't match what a live submission would compute today? Is this a real reachable gap or
   only a theoretical one — check whether `findLatestSession()` can genuinely return a different
   session between two points in time in this project's realistic operation (i.e. do STs create
   new session records mid-game night)?
5. **Malformed/absent input at the new entry points**: what does `/:id/accept` or `/:id/decline`
   do with a `req.params.id` that IS a valid ObjectId format but matches an existing
   `contested_roll_requests` document that has `request_type: 'contested_roll'` (a REAL contested
   roll, not a status action)? Confirm `_findPending`'s filter genuinely excludes it (404, not a
   500 or worse, a wrongly-processed contested-roll document).
6. **State mutated by one step leaking into another within the same accept transaction** — the
   budget claim happens BEFORE the CAS write. If the CAS write fails (target changed), is the
   budget claim itself rolled back correctly by the transaction, or could a failed accept still
   silently consume a budget slot? (This should be transaction-protected, but verify by reading
   the actual code path, not assuming.)
7. **Client-side (`office-tab.js`) fallout**: with `doAction` no longer setting
   `selectedChar.status.city`, does `renderButtons()`'s `alreadyPaid` check (which reads
   `priorActions`, only ever populated from APPLIED actions) now let a player submit a SECOND
   raise/lower on a target they already have a PENDING (not yet resolved) request against? Confirm
   this is reachable, and if so, confirm the SERVER correctly 409s it (AC2) even though the client
   UI doesn't disable the button for this case.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oaq-2-edge-case-hunter-findings.md` now.**

## Output

Write findings to `specs/stories/code-review/oaq-2-edge-case-hunter-findings.md`, grouped
`## High` / `## Medium` / `## Low`, each tagged `[Pass 2]`. `- None found.` for empty headings.

Same finding shape and Validation notes requirements as Pass 1.
