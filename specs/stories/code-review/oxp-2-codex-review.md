# Adversarial review - oxp-2 (Derived office-XP calculation), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This diff has a real correctness stake even though it writes nothing: its numbers are what an ST
will trust as "how much XP does this office have left to spend" once oxp.6/oxp.7 render them. A
wrong accrual formula or a wrongly-defaulted "can we trust this spend figure" flag produces a number
that looks authoritative and isn't, in a game-economy context where XP is a real, contested resource.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing.

1. Work the passes **in the order written**. Do not read ahead. The story spec is deliberately NOT
   in the diff - do not go looking for it during the earlier passes.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/oxp-2-codex-findings.md`, before you open anything the next pass
   allows.
3. At the very end, **attest** to what you actually did.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/oxp-2-diff.txt`,
  taken against base commit `828908a0`.
- The diff is **deliberately scoped to source and tooling only**. The story spec and
  `sprint-status.yaml` are excluded on purpose.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it.
- **Do NOT modify, commit, or push anything.** `TM Suite` sits inside an umbrella workspace
  (`D:\Terra Mortis`) alongside sibling repos `TM Cockpit`, `TM Wiki`, `TM Herald`, and non-repo
  content folders. Stay entirely inside `D:\Terra Mortis\TM Suite`.
- **Do not connect to or write to any MongoDB database, live or test, other than through this
  project's own vitest suite (`npx vitest run ...`).** That is safe: the test harness force-connects
  to `tm_suite_test` only (verify this claim yourself in Pass 2 rather than trusting this sentence).
  Never run any script under `server/scripts/` directly, and never touch the root `.env`, which
  points at a real live Atlas cluster with real player data.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails,
  restore it) is allowed - restore it exactly, confirm with `git diff`, say so.
- **A known, pre-existing, unrelated issue exists in this repo right now**: `server/tests/oxp-1-
  office-seats.test.js` fails to even load under vitest (`SyntaxError`), independently of anything in
  this diff - it has nothing to do with `oxp-2` and was not touched by this change. If you encounter
  it, note it as pre-existing rather than attributing it to this diff; do not spend the review
  budget diagnosing it further, that is out of scope here. The same applies to one pre-existing
  failing test in `oxp-4-merit-persistence-handover.test.js` (unrelated to this diff, caused by an
  oxp-3 merge shifting a source-slice window). Confirm these are genuinely pre-existing if you have
  time (e.g. `git stash` this diff's changes and re-run), but do not treat either as a finding
  against this diff unless your own investigation shows this diff actually caused or worsened them.
- This machine's `mongod`/Atlas reachability has been flaky across recent review sessions in this
  same project (a transient `EACCES` connecting to a remote address). If DB-backed tests skip rather
  than run, say so explicitly rather than reporting them as passed.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly.
- If you found nothing in a pass or at a severity, say that explicitly.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/oxp-2-derived-office-xp-calculation.test.js tests/office-merit-dots.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-4-merit-persistence-handover.test.js`.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-2-diff.txt` and **nothing else**.

### What this diff claims to be

A new pure-function module (`public/js/data/office-xp.js`) that derives an office seat's XP position
- `{ earned, spent, left, spendKnown }` - from a seat's `created_at` plus two existing purchase
collections, with no fetching, caching, DOM or clock access inside the functions themselves. A new
read-only route (`server/routes/office-seats.js`, `GET /api/office_seats`) that returns the
`office_seats` collection verbatim with ObjectId fields stringified, registered in `server/index.js`
and the test harness (`server/tests/helpers/test-app.js`) alongside two structurally identical
sibling routes. A large new test file covering both.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`yearMonthOf`'s regex is unanchored at the end**: `/^(\d{4})-(0[1-9]|1[0-2])/`. It anchors the
   start but not the end of the string. Enumerate strings that would match this regex but that a
   reader would NOT consider a valid ISO date (e.g. extra garbage after the month, or a string that
   happens to start with 4 digits, a dash, and a valid month number by coincidence). Does the function
   silently accept any of them and derive a plausible-looking year/month from garbage, rather than
   throwing? Separately: does a bare `'2026-02'` (year-month only, no day) correctly match and
   extract, or does something downstream assume a day component exists?

2. **`officeXpSpentForCategory`'s dual-shape detection for `meritDotsDoc`**:
   ```
   const dots = (meritDotsDoc && typeof meritDotsDoc.dots === 'object' && meritDotsDoc.dots !== null)
     ? meritDotsDoc.dots
     : meritDotsDoc;
   ```
   Walk this line by hand for EVERY shape that could plausibly reach it: `undefined`; `null`; the
   API-response shape `{ 'Safe Place': 2, 'Haven': 1 }`; the raw-document shape `{ _id: 'Enforcer',
   dots: { 'Safe Place': 2 }, updated_at: '...' }`; and a raw document where `dots` is explicitly
   `null` or missing entirely (e.g. `{ _id: 'Enforcer', updated_at: '...' }` with no `dots` key at
   all - is that reachable given how `office-merit-dots.js`'s `PUT` route writes documents? Check the
   real route, don't assume). For the last case, does `dots` end up bound to the ENTIRE raw document
   object (including `_id`, `updated_at` as string values), and if so, does the subsequent
   `Object.values(dots)` loop's `typeof value === 'number'` guard actually neutralise that, or is
   there a shape where a stray numeric-looking field on a raw document could silently poison the
   sum? Is this reachable in practice, or provably dead given the real route's write shape - state
   which, with the evidence.

3. **Self-contradiction / scope check**: the module's own header comment says the fetch-and-cache
   half "is not written yet on purpose". Confirm nothing in `office-seats.js` or anywhere else in the
   diff quietly adds a cache, a module-level variable that persists between calls, or any state that
   would make these "pure" functions non-idempotent across repeated calls with the same arguments.

4. **`officeSeatXp` recomputes `officeSpendKnownByCategory(allSeats)` from scratch on every call**,
   rebuilding the full category-count map each time it's invoked for a single seat. If a caller loops
   over all 7 seats calling `officeSeatXp` once per seat (the obvious way to use this API), that is
   O(n) map-rebuilds for O(n) seats. Not disputing correctness - flag whether this is worth a comment
   or a note for whoever writes the oxp.6/oxp.7 consumer, given the module's own docs say "each will
   shape its own read pattern from its own real requirements".

5. **`server/routes/office-seats.js`'s `GET /` has no role gate beyond `requireAuth`** (mirrors the
   two sibling routes deliberately, per its own comment). It returns the `notes` field verbatim -
   the ONE field on this collection that's explicitly documented elsewhere as "free text" an ST might
   write. Unlike its two siblings (`office_merit_dots`/`office_manoeuvre_rank`, which only expose
   dot counts and ranks - no free-text field), this route exposes free text a Storyteller wrote to
   ANY authenticated user including players. Is this a real exposure risk worth flagging, or is
   `notes` established elsewhere in this project as never containing anything sensitive? You don't
   have the spec yet in this pass - flag it as "worth checking" rather than asserting either way.

6. Standard sweep: unhandled promise rejections in the new route handler; whether `col().find({}).
   toArray()` could throw and whether that would surface as an unhandled 500 or something worse;
   dead code or unused imports; whether `officeMonthsAccrued`'s `Math.max(0, months)` clamp could mask
   a genuine caller bug (e.g. swapped argument order - `officeMonthsAccrued(now, createdAt)` called
   backwards would silently return 0 instead of throwing, since a swapped call just looks like "now
   is before creation"). Is anything currently defending against argument-order transposition, or is
   silent-0-on-swap a real risk for a future caller?

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oxp-2-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Additionally: this module will eventually be consumed by future stories
(oxp.6, oxp.7) that don't exist yet, so its exported API's exact contract matters more than usual -
whoever writes those stories will read this module's own JSDoc and tests as the spec.

### What to hunt for

1. **Read `server/routes/office-merit-dots.js`'s `GET /` and `server/routes/office-manoeuvre-
   rank.js`'s `GET /` in full**, and confirm by hand-tracing that `officeXpSpentForCategory` correctly
   consumes BOTH of their actual response shapes: `office_merit_dots`'s `GET /` returns
   `{ [category]: { [meritName]: dots } }` - so a caller feeding this module `apiResponse[category]`
   passes the INNER `{ [meritName]: dots }` map directly, not a `{ dots: {...} }` wrapper. Does
   `officeXpSpentForCategory`'s dual-shape detection (see Pass 1, item 2) correctly handle THIS exact
   real shape, or does its `typeof meritDotsDoc.dots === 'object'` check only work for the raw-
   document shape and silently mis-handle the real API-response shape (where `.dots` would be
   `undefined` on an object like `{ 'Safe Place': 2 }`, since that object has no `.dots` property of
   its own)? Trace it by hand with the REAL shape from the REAL route, not a hypothetical.

2. **Read `server/schemas/office_seat.schema.js` in full.** Confirm `officeMonthsAccrued`/
   `officeXpEarned` handle every value the schema actually permits for `created_at` (both a bare
   `YYYY-MM-DD` and a full ISO timestamp with a time component - the schema's own pattern comment
   should say which are valid). Confirm `yearMonthOf`'s string branch correctly extracts year/month
   from BOTH forms without going through `Date` parsing, as its own comment claims - verify this
   claim by hand-tracing a full-timestamp input, not by trusting the comment.

3. **Route registration order in `server/index.js`**: read the full block of `app.use('/api/...')`
   calls this diff's context appears in. Is there any Express routing hazard from where
   `/api/office_seats` was inserted relative to its siblings - could a differently-shaped existing
   route pattern (a wildcard, a shorter prefix) shadow or be shadowed by this new one? (Likely not,
   given Express's exact-prefix matching here, but verify rather than assume - this is exactly the
   kind of thing worth a two-minute check.)

4. **`officeSpendKnownByCategory`'s seat-counting**: hand-trace it against the REAL current
   `office_seats` shape - query or read what's actually seeded (check `server/scripts/seed-office-
   seats.mjs`'s `OFFICE_SEATS` constant for the 7 real seats, or the DB-backed test fixtures in the
   diff itself) and confirm by hand that Primogen and Socialite (2 seats each) resolve `false`, and
   Head of State/Enforcer/Administrator (1 seat each) resolve `true`. This is the single most
   consequential claim in the whole diff - trace it fully by hand, do not just skim the function and
   assume it's right.

5. **What happens when `allSeats` passed to `officeSeatXp` does NOT include the `seat` argument
   itself?** (E.g. a caller passes a stale or filtered array that's missing the very seat being
   evaluated.) Does `officeSpendKnownByCategory`'s count for that seat's category silently undercount
   by one, and if so does that flip a genuinely-multi-seat category to incorrectly reporting
   `spendKnown: true`? Is there any guard against this, or is it purely a "caller's responsibility"
   contract - and if so, is that contract documented anywhere a future caller would actually see it?

6. **malformed/absent input at the new route's entry point**: what does `GET /api/office_seats`
   return if the collection genuinely doesn't exist yet (fresh test DB, no `office_seats` collection
   created)? Does MongoDB's driver throw, return an empty cursor, or something else - and does the
   route handle that path the same way it handles a real empty collection?

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oxp-2-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-2-derived-office-xp-calculation.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.**
3. Against the 8 acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's literal wording.
   - Deviations from stated intent - **"What this story is NOT" is equally load-bearing.**
   - Specified behaviour that is missing or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:**
- Migrating `office_merit_dots`/`office_manoeuvre_ranks` to seat-keying. Known, real, deliberately
  deferred - see the story's "Why this story exists" and "What this story is NOT".
- Any UI rendering these numbers anywhere. Nothing consumes this module yet; that's oxp.6/oxp.7.
- Spend-approval routing (oxp.9) or handover/reset logic (oxp.5).
- A "loader" or fetch-and-cache function for offices analogous to `loadGameXP`. Deliberately not
  written - see the module's own header comment.
- The pre-existing `oxp-1-office-seats.test.js` load failure and the pre-existing
  `oxp-4-merit-persistence-handover.test.js` single failure - both confirmed unrelated to this diff
  (see Ground rules above). Do not re-litigate these as this diff's problem.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes these specific, checkable claims:
   - "43/43 new tests passing (34 pure + 9 DB-backed against `tm_suite_test`)".
   - "Office-domain regression, 9 files: 181/182 (the 1 failure pre-existing)".
   - "Shared-helper regression (5 suites building the test app): 96/96".
   - Four specific prove-discrimination results from single-change mutation: dropping the inclusive
     `+1` in `officeMonthsAccrued` breaks exactly 16 tests; swapping the calendar-month formula for a
     30-day-bucket day-difference breaks exactly 16; defaulting `spendKnown` to `true` breaks exactly
     4; making `holder_id`'s stringification unconditional (dropping the `== null` guard) breaks
     exactly 1 (the vacant-seat test).
   - "The two Socialite seats correctly derive 7 vs 2" (different earned totals from different
     creation months).
   - Live `tm_suite` was never connected to or written to during this work.
6. **Verify each claim by running it, not by reading it.** Run the gate command yourself right now.
   For the four mutation claims: pick at least two of the four, actually make the described single-
   line change, run the suite, confirm the exact failure count, then revert and confirm `git diff`
   is clean again before moving on. Do not just read the code and reason that the claim is plausible.
7. Flag anything FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/oxp-2-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the gate command above.
- Anything you could not run, and why.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
