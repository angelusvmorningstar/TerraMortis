# Adversarial review — issue-1143-status-actions-auth-safety (Status Actions — actor authorization + write safety), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

**This is Pass 2 of 3 (Edge Case Hunter), run as an ISOLATED session** — you have not seen Pass 1's
material and will not see Pass 3's until all three are complete.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/issue-1143-diff.txt` and is relative to that root, taken against base
  commit `aca9e996`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits
  (`specs/stories/issue-1143-status-actions-auth-safety.md`, `specs/stories/sprint-status.yaml`)
  are excluded on purpose — you still do NOT have the story spec or any account of the author's
  intent for this pass. Work from the code itself. Do not treat the absence as an omission.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Suite`) has sibling repos in the same
  umbrella workspace one level up (`TM Cockpit`, `TM Wiki`, `TM Herald`) — do not read or touch
  them; they are irrelevant to this diff.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm
  the restore with `git diff`, and say so in your output.
- Environment hazards: the local MongoDB (`127.0.0.1:27017`, a Windows service) is a STANDALONE
  instance, not a replica set — do not attempt multi-document transactions against it, they will
  fail unconditionally (this is WHY the diff uses an index + insert-then-recount pattern instead of
  a transaction — verify that reasoning rather than assuming it). Vitest hard-overrides the DB name
  to `tm_suite_test` under test. `fileParallelism` is `false` project-wide. A full `npx vitest run`
  (no filter) has 6 known-unrelated pre-existing failures across 11 files — prefer the targeted
  command below.
- Blast radius: `server/routes/office-actions.js` is a live production route that mutates a
  character's `status.city` directly during an in-person LARP session. `server/tests/helpers/db-
  setup.js` is shared test infrastructure imported by roughly 15+ other test files project-wide —
  a mistake in `isDbAvailable()` or a change to `setupDb()`/`teardownDb()`'s contract could silently
  break every other DB-backed suite in the project, not just the ones this diff touches directly.
  `server/index.js`'s boot sequence runs for every route in production.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`.
  Report the real numbers even if they disagree with anything a code comment claims.

---

## PASS 2 — EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you
need to understand what this change is actually plugging into. You still do **not** have the story
spec or any account of the author's intent.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth — verify against the code)

`server/routes/office-actions.js`'s `POST /` handler processes a "Status Action" (a Head of State
character raising/lowering/granting/stripping another character's City Status). The rewritten
handler order is roughly: parse body → authorization check (`isStRole(req.user)` OR
`req.user.character_ids` includes `actor_id`) → resolve the live `game_sessions` record server-side
→ game-phase gate (an existing check, unchanged) → parse `actor_id`/`target_id` to `ObjectId`,
self-target check on the parsed ids → load actor (must hold `court_category`) → load target →
compute `new_status` from the action type and target's current `status.city` → for paid types
(`raise`/`lower`) only: insert the action doc (guarded by a new partial unique index on
`{game_session_id, actor_id, target_id}` scoped to `raise`/`lower`), recount the actor's paid
actions this session, delete-and-403 if over budget, otherwise update `characters.status.city`.

### What to hunt for

1. **Hand-trace the EXACT concurrent sequence** for two requests racing at the budget boundary.
   Read the handler in full and, by hand, trace: request A and request B both pass authorization,
   both resolve the same session (a separate `findOne` per request — is this itself
   read-consistent enough?), both pass the phase gate, both parse ids, both load their own actor
   and target documents independently. Confirm, by tracing the actual `await` sequence, that the
   insert-then-recount-then-conditional-delete really does bound the total surviving count at
   `budget`, in EVERY interleaving of A and B's operations — not just the interleaving that happens
   to be convenient. Consider: what if A's `insertOne` and B's `insertOne` both complete before
   EITHER's `countDocuments` recount runs?
2. **Multi-actor race on the SAME target.** The new partial unique index key is
   `{game_session_id, actor_id, target_id}` — it includes `actor_id`. If this project's data model
   permits more than one character to simultaneously hold `court_category: 'Head of State'` (check:
   does anything in the schema, the seed data, or `characters` collection usage elsewhere in the
   repo actually PREVENT two characters from both having `court_category === 'Head of State'` at
   once — the way `Socialite` and `Primogen` are documented elsewhere in this project as
   legitimately having two concurrent holders?), then TWO DIFFERENT Head-of-State actors could both
   pass the unique-index dedupe (different `actor_id` values) and both race to `raise` or `lower`
   the SAME `target_id` in the same session. Trace what happens: both load the target's
   `old_status` independently (before either writes), both compute `new_status = old_status + 1`
   from the SAME stale `old_status`, both call `characters.updateOne(...{$set:{'status.city':
   new_status}})`. Is the final `status.city` value correct (net +2), or does the second write
   silently clobber the first (net +1, a lost update)? This is genuinely NOT guarded by anything in
   the diff — confirm whether it is a real, reachable gap or whether something elsewhere in the
   codebase makes multiple simultaneous Head-of-State holders impossible in practice.
3. **`findLatestSession()` read consistency.** It is called ONCE per `POST /` request as a plain
   `findOne`. If a Storyteller creates a NEW `game_sessions` record for "today" in the middle of a
   live session (a realistic operational scenario — a new game date rolling over at midnight, or an
   ST correcting a session record), can two requests submitted moments apart resolve to DIFFERENT
   `game_session_id` values, each believing itself scoped correctly, such that the budget/dedupe
   checks silently split across two different session ids and an actor effectively gets DOUBLE
   budget for that boundary window?
4. **Malformed/absent input at the new entry points.** What does the authorization check do when
   `req.user.character_ids` is `undefined` vs `[]` vs contains non-string values (e.g. real
   `ObjectId` instances instead of strings, which is how some other parts of this codebase store
   them — check `server/middleware/auth.js` for the real shape)? What happens when `actor_id` in
   the body is a syntactically-valid-looking but non-existent 24-hex string?
5. **`isDbAvailable()`'s fixture/mock shape vs the real consumer.** Read
   `server/tests/issue-1143-db-setup-skip.test.js`'s mocks of `../db.js` field-for-field against
   what `server/tests/helpers/db-setup.js`'s `setupDb()` ACTUALLY calls on the real `db.js` module.
   Does the mock's shape genuinely match, or does it only exercise a subset of what real `db.js`
   exposes, such that the test could pass while the real integration is subtly different?
6. **State mutated by one step leaking into a later step in the same run.** The new
   `describe.skipIf(!dbAvailable)` pattern in `issue-1143-office-actions-auth-safety.test.js`
   resolves `dbAvailable` ONCE at module load via a top-level `await`. Confirm this is genuinely
   safe given `fileParallelism: false` (sequential file execution) — is there any scenario within
   THIS SAME test run where the DB could become unavailable mid-file after `dbAvailable` was
   already resolved `true`, leaving later tests to fail messily instead of skip?
7. **Route/matcher order**: does the new authorization check or session-derivation logic change
   which of several possible error responses (401/403/404/400) a given malformed request now
   receives compared to before, in a way that could break an existing client expectation
   (check `public/js/tabs/office-tab.js`'s error handling for the specific status codes/messages it
   branches on)?

**STOP. Write your Pass 2 findings to `specs/stories/code-review/issue-1143-edge-case-hunter-findings.md` now.**

## Output

Write your findings to `specs/stories/code-review/issue-1143-edge-case-hunter-findings.md`, grouped
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

- Which files you opened, and confirmation you stayed within Pass 2's scope (no story spec).
- Every command you ran, with its real result, including the gate command above.
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
