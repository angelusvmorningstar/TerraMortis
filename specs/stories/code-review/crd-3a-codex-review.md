# Adversarial review - crd.3a (Server-side resolve endpoint, trust boundary), TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes. The final pass will hand you the path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/crd-3a-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/crd-3a-diff.txt`,
  relative to that root, taken against base commit `8031171a` (crd.2's final patched state, the tip
  of the parent branch). This story's own changes are **NOT YET COMMITTED** - the diff reflects the
  current working tree on branch `ms/crd-3a-server-resolve-endpoint`, not a commit range.
- The diff is **deliberately scoped to source and tooling only** (`server/routes/contested-rolls.js`,
  `server/tests/crd-3a-resolve-endpoint.test.js`). Story-spec and tracking edits (the story file,
  `sprint-status.yaml`) are excluded on purpose, so the earlier passes stay genuinely blind to the
  author's own account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo sits in an umbrella workspace alongside
  sibling repos (`TM Story`, `TM Admin`, `TM Herald`, `TM Design System`) at `D:\Terra Mortis\`. Do
  not read or touch anything outside `D:\Terra Mortis\TM Game` even to cross-reference.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazard**: this project's server tests need a live local MongoDB and skip cleanly
  rather than fail when it's unreachable (`describe.skipIf(!dbAvailable)`). This story's ENTIRE new
  suite is DB-backed - if you see fewer than 24 tests, or a suite that completes in well under a
  second, that is almost certainly a silent skip, not a pass. Disclose this explicitly rather than
  report a skip as green.
- **Blast radius note**: this is the FIRST server-side route in this codebase to read the
  `tracker_state` collection directly (every other reader is either the client, or `tracker.js`'s own
  pass-through GET/PUT). A mistake in how it queries or defaults Willpower here is a pattern other
  future server routes may copy verbatim. Separately, `_findChallenge` (reused unchanged) is the same
  helper `/accept`, `/decline` and `/void` all depend on to keep a differently-shaped `status_action`
  document (written by `office-actions.js`) out of this route family entirely - if this new route's
  usage of it, or anything around it, weakens that exclusion, the blast radius is the whole shared
  `contested_roll_requests` collection, not just this feature.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/crd-3a-resolve-endpoint.test.js` (expect 24), and the full changed-area set `cd server &&
  npx vitest run tests/crd-1-contested-roll-request-shape.test.js tests/crd-2-pending-queue.test.js
  tests/crd-3a-resolve-endpoint.test.js tests/api-tracker-state.test.js
  tests/oaq-2-pending-status-actions.test.js tests/oaq-3-approval-queue.test.js` (expect 172). Report
  the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/crd-3a-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new `PUT /:id/resolve` route where a defending player gets a server-computed dice pool: it re-reads
their character document live, maps a submitted "aspect" to a Resistance Attribute read as
`dots + bonus`, optionally adds +2 for a live-checked Willpower spend, and adds a bonus for up to two
specific, named merits matched by a `rule_key`. It writes the computed pool plus the submitted choices
back onto the request document without changing its `status`, and reuses an existing helper for the
not-found/not-pending/ownership guards. Calling it again is meant to fully recompute and overwrite.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **No upper/lower bound clamp on the final `pool` value.** Nothing in this diff caps the computed
   pool. Trace every additive source (base attribute, the +2 Willpower bonus, each merit bonus) and
   determine the largest value they can plausibly combine to, then check whether this route's write
   path (a direct `updateOne`, not the schema-`validate()` POST path) enforces the same
   `minimum: 0, maximum: 30` the collection's own schema declares for `defender_pool` elsewhere. If it
   doesn't, is that a real, reachable defect or a non-issue given realistic character stats?
2. **`defender_wp_spent === true` (strict equality).** Confirm there is no path - coercion, a
   different comparison later in the function, a second read of the raw body - where a non-boolean
   truthy value (a string, a number, an object) still reaches the code that adds the Willpower bonus
   or performs the live Willpower check. Trace the variable, not just this one line.
3. **Merit bonus double-counting via the CHARACTER document, not just the request.** The bonus-summing
   loop walks the character's own `merits[]` array and checks whether each merit's `rule_key` appears
   in the validated submitted-id list. If a single character document ever has TWO merit entries that
   happen to share the same `rule_key` (a data anomaly, not necessarily impossible), does the loop
   apply the bonus twice? Is that a real risk given how `rule_key` is used elsewhere in the diff, or
   is there a `Set`/dedup somewhere that already prevents it?
4. **The dedup order.** `defender_merit_ids` is filtered against ownership and THEN deduplicated (or
   is it the other way around - check the actual order in the diff). Could the order matter for any
   input shape?
5. **Unhandled rejections / missing try-catch.** Every `await` in the new route (the character fetch,
   the tracker_state fetch, the final `updateOne` + `findOne`) has no local try/catch. Is that
   consistent with the surrounding file's other routes (i.e. an established pattern this app relies on
   Express to catch), or is this route doing something riskier than its siblings that would make the
   omission a real gap? You cannot fully answer this from the diff alone - flag it as "worth checking
   against the rest of the file in Pass 2" rather than asserting an answer now.
6. **Self-contradiction within the diff.** Does any comment claim a behaviour the code beside it
   doesn't actually implement (e.g. a comment describing idempotent overwrite behaviour next to code
   that doesn't fully overwrite every field)?
7. **The new test file's own assertions.** Are there any assertions whose PASS condition is trivially
   satisfiable (a bare truthy check, a `.toBeDefined()` where a specific value should be asserted, a
   status-code check with no body verification on an error path)? Flag anything that claims to prove
   more than it actually tests.
8. Standard sweep: dead code, unused imports/variables, unreachable branches, resource cleanup on the
   THROWN path (not just the happy path).

**STOP. Write your Pass 1 findings to `specs/stories/code-review/crd-3a-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Game`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Additionally: this route sits in `server/routes/contested-rolls.js` alongside
`POST /`, `GET /mine`, `PUT /:id/accept`, `PUT /:id/decline`, and `PUT /:id/void` - all sharing the
`contested_roll_requests` collection with a DIFFERENT document family (`request_type: 'status_action'`,
written by `server/routes/office-actions.js`) that must never be reachable through any of these
verbs. `_findChallenge` is the shared guard that is supposed to enforce that exclusion.

### What to hunt for

1. **Does `/:id/resolve` actually exclude a `status_action` document, end to end?** Read
   `_findChallenge` in full and hand-trace what it does with a document whose `request_type` is
   `'status_action'`. The new test suite does NOT appear to include this specific case for the new
   route (confirm this by reading the test file) even though `/accept`/`/decline`/`/void` are each
   proven against it elsewhere in this codebase. Is the omission safe because the helper is reused
   unchanged and already proven elsewhere, or is that an assumption worth a test of its own?
2. **A character document with no `attributes` field at all, or a partial one.** The character schema
   does not require `attributes` at the document root. Trace what the new route computes for
   `defender_pool` when `character.attributes` is `undefined`, or when the specific mapped attribute
   (e.g. `Resolve`) is present in the object but missing `dots` or `bonus`. Is a silent `0` the right
   outcome, or does it mask a data problem that should have surfaced differently?
3. **`tracker_state` query correctness.** The route queries
   `{ character_id: { $in: [defenderOid, targetCharacterIdString] } }`. Read `server/routes/tracker.js`
   and `server/tests/api-tracker-state.test.js` to confirm how `character_id` is actually stored on
   real documents (string vs ObjectId), and hand-trace whether this query can ever match the WRONG
   character's tracker document, or fail to match the RIGHT one, under any stored shape you can find
   evidence for in this codebase.
4. **Route matching order.** Express matches routes in registration order. Confirm the new
   `PUT /:id/resolve` registration cannot be shadowed by, or shadow, any of the file's other `:id`-
   parameterised routes, and that Express's parameter matching genuinely can't confuse `/resolve` with
   any other literal path segment used elsewhere in this router.
5. **Interaction with `/decline` and `/void` after a successful resolve.** A request that has been
   resolved (still `status: 'pending'`, now carrying a computed `defender_pool`) - can it still be
   declined or voided normally? Trace both routes against the post-resolve document shape and confirm
   neither one has an undocumented dependency on `defender_pool` being absent.
6. **Malformed `defender_merit_ids` entries.** What happens if the array contains a non-string element
   (a number, `null`, an object)? Trace the exact code path - does it throw, silently drop, or produce
   an unexpected result?
7. **Concurrent-resolve claim.** The diff computes the entire `$set` document in memory before a single
   `updateOne` call. Confirm there is genuinely no multi-step read-modify-write on this document within
   the route (i.e. the "last write wins, no partial merge" property actually holds structurally, not
   just by absence of a bug you happened not to find).

**STOP. Write your Pass 2 findings to `specs/stories/code-review/crd-3a-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/crd-3a-server-resolve-endpoint.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (touch `/accept`, touch client code, touch
     `roll-v2.js`, implement crd.4's formula, generalise the merit-bonus lookup beyond the named two).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: a generic merit-bonus-value rule
type (the story ships a narrow, explicitly-named 2-merit lookup on purpose, and says so); any change
to `/accept`'s own code (its existing `defender_pool == null` guard is meant to keep working unmodified
once this route starts populating the field); any client-side file, including
`public/js/suite/roll-v2.js`'s hardcoded WP-bonus literal (out of scope for this story by design);
crd.4's City Status/Blood Potency formula (still blocked elsewhere in the epic, not referenced here).

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes these specific, checkable claims:
   - The new suite is 24/24 passing against real MongoDB (not skipped).
   - Changed-area regression across six files totals 172/172 on a clean re-run, with one transient
     timeout in `crd-2-pending-queue.test.js`'s own filesystem-walk test on a first combined run,
     which the record claims reproduces as a pass in isolation and a pass on immediate re-run of the
     same combined set - i.e. a pre-existing timing flake, not a regression from this diff.
   - Two patches were prove-discriminated with single-change reverts: changing the Willpower bonus
     from `+2` to `+3` is claimed to fail exactly 3 tests; disabling the `currentWp <= 0` guard is
     claimed to fail exactly 1 test. Both are claimed reverted and the suite green again afterward.
   - A duplicated id in `defender_merit_ids` is claimed to be unable to double-count a bonus, "without
     needing a separate anti-duplication check" (i.e. this is claimed to fall out of the implementation
     shape, not a dedicated guard).
   - An off-enum `defender_aspect` is claimed to return 400, ordered AFTER the ownership check (so a
     wrong owner gets 403 first even with an invalid aspect).
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Do the
   two reverts yourself if you want independent confirmation of the exact failure counts, restoring
   each afterward and confirming with `git diff` that the file is back to its original state.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/crd-3a-codex-findings.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`,
`[Pass 3a]`, `[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the two gate commands named above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
