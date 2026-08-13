# Adversarial review - oxp-11 (Re-key office purchases to seats), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This diff has two distinct, serious stakes. First, a real data-safety stake: it includes a
migration script that, when eventually run for real by a human, will rewrite documents in a LIVE
production MongoDB database. Second, a real gameplay-correctness stake even before any migration
runs: the client-side seat-resolution logic decides which office seat an ST's edit buttons actually
write to, for a game where "which seat's XP got spent" is a real, contested resource STs argue
about at the table. Scrutinise both as carefully as ordinary correctness.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing.

1. Work the passes **in the order written**. Do not read ahead. The story spec is deliberately NOT
   in the diff - do not go looking for it during the earlier passes.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/oxp-11-codex-findings.md`, before you open anything the next pass
   allows.
3. At the very end, **attest** to what you actually did.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/oxp-11-diff.txt`,
  taken against base commit `79787d0c`.
- The diff is **deliberately scoped to source and tooling only**. The story spec and
  `sprint-status.yaml` are excluded on purpose.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it.
- **Do NOT modify, commit, or push anything.** `TM Suite` sits inside an umbrella workspace
  (`D:\Terra Mortis`) alongside sibling repos `TM Cockpit`, `TM Wiki`, `TM Herald`, and non-repo
  content folders. Stay entirely inside `D:\Terra Mortis\TM Suite`.
- **CRITICAL - do not connect to or write to any MongoDB database, live or test, other than through
  this project's own vitest suite (`npx vitest run ...`), and do not run
  `server/scripts/migrate-office-purchases-to-seats.mjs` or `server/scripts/seed-office-seats.mjs`
  as shell commands under any circumstances, with or without `--apply`.** If you want to verify the
  migration script's behaviour, read its exported functions (`planMigration`, `applyMigration`) and
  reason about them statically, or trace how the project's own vitest suite already exercises them
  rather than invoking the script yourself. The root `.env` points at a real live Atlas cluster with
  real player data; this repo's own standing rule is that a human runs all Mongo writes
  deliberately, never an agent as a side effect of review.
- You MAY run the project's existing vitest suite (`npx vitest run ...`) - that is safe, since this
  project's test harness force-connects to `tm_suite_test` only (verify this claim yourself in Pass
  2 rather than trusting this sentence).
- Temporarily editing a file to prove something (revert one line, confirm the check now fails,
  restore it) is allowed - restore it exactly, confirm with `git diff`, say so.
- **A known, pre-existing, unrelated issue exists in this repo right now**: `server/tests/oxp-1-
  office-seats.test.js` fails to even load under vitest (`SyntaxError`), caused by a `#!/usr/bin/env
  node` shebang in `server/scripts/seed-office-seats.mjs` that predates this diff and is untouched by
  it. If you encounter it, note it as pre-existing rather than attributing it to this diff. The new
  migration script this diff adds deliberately has NO shebang for exactly this reason - confirm that
  for yourself rather than trusting this sentence, since it is the single most-repeated trap named in
  this story's own Dev Notes.
- This machine's `mongod`/Atlas reachability has been flaky across recent review sessions in this
  same project (a transient `EACCES` connecting to a remote address). If DB-backed tests skip rather
  than run, say so explicitly rather than reporting them as passed.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly.
- If you found nothing in a pass or at a severity, say that explicitly.
- Report the exact current gate numbers you observe:
  `cd server && npx vitest run tests/office-merit-dots.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-4-merit-persistence-handover.test.js tests/issue-1141-office-tab-render.test.js tests/oxp-11-office-purchase-seat-keying.test.js tests/oxp-2-derived-office-xp-calculation.test.js`.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-11-diff.txt` and **nothing else**.

### What this diff claims to be

A migration of two MongoDB collections (`office_merit_dots`, `office_manoeuvre_ranks`) from being
keyed by a bare office-category string (one shared document per office) to being keyed by an
individual office seat's own `_id` (from a third collection, `office_seats`, unchanged by this
diff). A new shared resolver module (`server/lib/office-seat-resolve.js`) turns a `:seatId` URL
parameter into a seat, its office category, and its rules entry, or a typed error. Both purchase
routes are rewired to use it. A new client-side function in `office-tab.js`
(`_wirePurchaseState`) fetches all office seats once per render and resolves which seat the current
view means, before either the merit-dot or manoeuvre-rank UI fetches or writes anything. A new
manual migration script (dry-run by default) moves the two currently-live category-keyed documents
to their real seat ids. Four existing test files are reworked to match.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The client's "own office" seat resolution can silently pick the WRONG seat for a multi-seat
   office, and nothing downstream knows it happened.** Trace `_wirePurchaseState` by hand: for
   `isOwnOffice === true`, it tries to find a seat in the resolved category whose `holder_id`
   matches the viewer's own character id; if NONE matches (the diff's own comments say
   `office_seats.holder_id` is not currently maintained by anything and can go stale), it falls back
   to `_fallbackSeat`, a deterministic sort with no relationship to who the viewer actually is. For a
   SINGLE-seat office this is harmless (only one candidate exists either way). For Primogen or
   Socialite (two real live seats), is there anything that stops this fallback from resolving to the
   OTHER seat - the one the viewer does NOT hold - while `isOwnOffice` (computed elsewhere, from
   `char.court_category`, not from which seat was actually resolved) is still `true`? If so: does the
   UI still render the manoeuvre list as MUTED/interactive (the `isOwnOffice`-gated behaviour), and
   does the ST-only stepper still render, for what is actually a DIFFERENT seat's data? Concretely:
   if that happens, does clicking the "+"/"-" stepper write to the wrong seat's
   `office_manoeuvre_ranks` document, believing it is the viewer's own? Is `_seatNote`'s disclosure
   (only shown when `forCategory.length > 1`) sufficient warning, or could an ST reasonably miss a
   small inline note and click a stepper believing it edits their own seat?
2. **`resolveOfficeSeat` and the purchase-collection write it feeds are two separate database
   round-trips, not one atomic operation.** In both `PUT /:seatId` routes, `office_seats` is read
   first (to resolve the seat and its category), then the purchase collection is written afterward
   using the category value captured from that earlier read. Between those two reads/writes, could
   `office_seats` change in a way that makes the denormalised `office_category` written into the
   purchase document stale at the moment it's written (not just eventually, per its own "self-healing
   on next write" framing - AT THE MOMENT of THIS write)? Is that a real risk given what (if
   anything) can currently modify `office_seats` after it is seeded, or is this provably inert today -
   state which, with evidence.
3. **The migration script's `planMigration` and `applyMigration` are two separate calls, not one
   atomic operation** (`main()` calls `planMigration` to build `rows`, including capturing each
   document's full content into `row.doc`, then separately calls `applyMigration` with those rows).
   Between the plan step and the apply step, could the SAME category-keyed document be modified by a
   concurrent write (e.g., an ST using the live app's existing PUT route against the OLD
   category-keyed document, before this migration has run, if the migration takes any measurable
   wall-clock time between the two collection's plan/apply cycles) such that `row.doc`'s captured
   content is stale by the time `applyMigration` inserts it under the new seat-keyed `_id`? Is this
   realistically reachable, or does the script's own single-process, single-pass structure make the
   window too narrow to matter? Note for context (do not treat as ground truth, verify independently
   in Pass 2 if needed): this script is stated to be human-run, once, deliberately, not run under
   concurrent load.
4. **Self-contradiction / scope check**: `office-seat-resolve.js`'s own header comment claims
   re-keying by seat "preserves oxp.4's 'merits survive a handover' guarantee exactly as
   category-keying did". Does anything ELSE in this diff quietly depend on `office_seats.holder_id`
   in a way that WOULD leak a character/holder reference into a purchase document, contradicting that
   claim, or is `holder_id` used only ephemerally client-side (never written into
   `office_merit_dots`/`office_manoeuvre_ranks`)? Check every write to either purchase collection in
   this diff for exactly what fields it sets.
5. **The migration script's ambiguous-multi-seat refusal**: confirm by reading `planMigration`/
   `applyMigration` that a category with 2+ seats is refused and genuinely left completely untouched
   (not partially written, not defaulted to the first seat found) - this is the single
   highest-consequence code path in the whole diff, since choosing wrongly here would silently hand
   one Primogen's purchase history to the other.
6. Standard sweep: unhandled promise rejections in either route handler or in `_wirePurchaseState`;
   whether a malformed `office_seats` document (missing `office_category`, missing `_id`) could crash
   `resolveOfficeSeat` or the client's seat-filtering rather than being handled gracefully; dead code
   or unused imports; whether the `SEAT_ID_PATTERN`/`SEAT_KEY` regexes in the resolver and the
   migration script are genuinely identical in what they accept (they are separately defined in two
   files - do they actually agree?).

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oxp-11-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Additionally: `office_seats` (unchanged by this diff) is documented
elsewhere in this codebase as having NO write path except a one-off seed script - nothing in this
diff or the rest of the live app currently updates `holder_id` when an officeholder actually
changes (that's a future story's job). This diff's client-side fallback behaviour exists
specifically to survive that gap without crashing or lying outright; your job in this pass is to
determine whether it survives it SAFELY, not just gracefully.

### What to hunt for

1. **Read `public/js/tabs/office-tab.js` in full**, focusing on `renderOfficeTab`,
   `_wirePurchaseState`, `_fallbackSeat`, `_wireMeritDots`, `_wireManoeuvreRank`, and
   `_adjustMeritDots`/`_adjustManoeuvreRank` (the ST stepper click handlers). Hand-trace the EXACT
   sequence for a concrete scenario: character Yusuf holds one Primogen seat, character René holds
   the other, `office_seats.holder_id` for BOTH is stale/wrong (nothing has ever updated it since
   seeding, and the story confirms this). An ST/dev viewer opens the Office tab on Primogen, browsing
   as REFERENCE (not holding it themselves). Which seat does `_fallbackSeat` resolve, and is that
   choice STABLE across repeated renders and across two different STs opening the same view (i.e.,
   does it depend on anything non-deterministic, like array order from MongoDB, which is not
   guaranteed stable across queries without an explicit sort)? Read `_fallbackSeat`'s sort key
   exactly - does it use a field that MongoDB guarantees is present and comparable for every real
   seat document, or could a `created_at` type-mismatch or a missing field between two seats produce
   an unstable or wrong ordering?
2. **Read `server/routes/office-merit-dots.js` and `server/routes/office-manoeuvre-rank.js` in
   full**, both routes' full bodies, and confirm by hand-tracing that the SAME seat id, requested
   twice in a row (a GET immediately after a PUT), returns internally-consistent data - i.e., the
   `office_category` denormalised into the document on write is genuinely what `resolveOfficeSeat`
   would independently derive for that same seat id right now, not a stale value from an earlier
   write that never got refreshed.
3. **Read `server/lib/office-seat-resolve.js` in full** and confirm its 404-vs-400 distinction is
   actually exercised correctly by both routes - does a request for a syntactically-valid-but-
   nonexistent seat id (24 hex characters, no matching document) really reach the 404 branch and not
   get misrouted through the 400 "seat's office has no rules" branch or vice versa? Trace the
   conditional order exactly.
4. **Read the four reworked test files** (`office-merit-dots.test.js`,
   `oxp-3-office-manoeuvre-rank.test.js`, `oxp-4-merit-persistence-handover.test.js`,
   `issue-1141-office-tab-render.test.js`) and the new `oxp-11-office-purchase-seat-keying.test.js`.
   Specifically verify: does ANY test actually simulate the "stale/wrong `holder_id`, multi-seat
   office, own-office view" scenario from item 1 above, end to end through `office-tab.js`'s real
   wiring functions (not just the pure `_fallbackSeat` sort function in isolation)? If not, that is a
   real coverage gap in the single most consequential new behaviour this diff introduces - name it
   plainly.
5. **Read `oxp-4-merit-persistence-handover.test.js`'s restated source-contract test** (the one that
   used to assert "no character/`_id`/`holder` token appears anywhere in the merit-dot wiring
   functions") and confirm its NEW form actually still proves what it claims to: that no character
   identifier reaches the `office_merit_dots`/`office_manoeuvre_rank` HTTP calls themselves, while
   correctly PERMITTING `office_seats.holder_id` to be read earlier in the chain. Is the boundary
   between "permitted" and "forbidden" drawn at the right place in the actual test assertions, or
   could the restated version be satisfied by code that leaks a character reference somewhere the
   original, stricter test would have caught?
6. **route/matcher order**: read the full `server/index.js` mounting block these two routes sit in
   (unchanged by this diff, but worth a two-minute check) - does changing `:category` to `:seatId` in
   the route PATH PATTERNS (both are still just `/:param`, so likely no change in matching behaviour,
   but verify rather than assume) introduce any shadowing risk against a sibling route.
7. **malformed/absent input at both routes' new entry points**: what happens when `:seatId` in the
   URL is a 24-hex string that LOOKS valid but corresponds to a seat whose `office_category` field is
   itself missing, null, or an empty string (a malformed `office_seats` document, hypothetically) -
   does `resolveOfficeSeat` handle that as cleanly as a genuinely-missing seat, or could it produce a
   confusing partial-success or an uncaught exception?

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oxp-11-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-11-office-purchase-seat-keying.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.**
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's literal wording.
   - Deviations from stated intent - **"What this story is NOT" is equally load-bearing.**
   - Specified behaviour that is missing or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Explicitly NOT in scope, and deliberate - do not flag these as gaps:**
- A new seat-picker UI letting a viewer choose which of two seats to look at when browsing a
  multi-seat category as reference. Explicitly deferred to oxp.6 (purchase markers), which has not
  been built yet even for the OLD category-only model.
- Any handover/reset logic itself (oxp.5) - this story is oxp.5's prerequisite, not oxp.5.
- Any change to `office_seats` itself (oxp.1's schema) - unchanged by this diff.
- Spend-approval routing (oxp.9).
- `office-xp.js`'s actual calculation logic changing - only its documentation comments were updated
  to reflect the new keying; the functions themselves are deliberately unchanged (verify this
  specific claim in Pass 3b against the real diff, since it is a concrete, checkable one).
- The pre-existing `oxp-1-office-seats.test.js` load failure (see Ground rules above) - confirmed
  unrelated to this diff, and the new migration script deliberately avoids the same trap.
- `office_seats.holder_id` not being kept up to date by this diff - the story's own Dev Notes name
  this explicitly as a gap this diff cannot close (nothing writes `holder_id` anywhere yet) and
  record it as a requirement for the NEXT story (oxp.5) rather than this one's job to fix.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes these specific, checkable claims:
   - All (roughly 34) subtasks are marked complete.
   - Four existing suites were reworked, one new suite added, totalling roughly 187 tests passing
     across the changed area with 0 failures, plus a separate adjacent-regression figure.
   - A pre-existing `oxp-4` test failure was legitimately resolved as a side effect of this rework
     (not merely silenced).
   - The migration script was NOT run against live `tm_suite`.
   - `office-xp.js`'s actual logic is unchanged; only its documentation comments were updated.
   - Both load-bearing behaviours (seat-based independence, and the migration's ambiguity-refusal)
     were prove-discriminated by single-change mutation and revert.
6. **Verify each claim by running it, not by reading it.** Run the gate command yourself right now.
   For the two mutation claims: pick at least one, actually make the described change, run the
   suite, confirm the exact failure count, then revert and confirm `git diff` is clean again before
   moving on.
7. Flag anything FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem. Given the two stakes named at the top of this document (live-data migration
   safety, and gameplay-correctness of which seat gets edited), weight your final assessment toward
   whichever of Pass 1 item 1, Pass 2 item 1, or Pass 2 item 4 turned out to be real.

---

## Output

Write everything to `specs/stories/code-review/oxp-11-codex-findings.md`, grouped `## High` /
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
