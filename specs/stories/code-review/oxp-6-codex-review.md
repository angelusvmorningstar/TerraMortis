# Adversarial review - oxp-6-office-tab-purchase-markers (Office-tab purchase and affordability markers), TM Suite

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
   `specs/stories/code-review/oxp-6-codex-findings.md`, before you open anything the next pass allows.
   Do not revise an earlier pass's findings in light of what a later pass taught you - if a later pass
   contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/oxp-6-diff.txt` and
  is relative to that root, taken against base commit `1063787b` (the oxp-5 merge into `main` this
  branch was cut from).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This is a standalone repo (`TerraMortis`), not part of
  an umbrella workspace review - no sibling repos to worry about here.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- This repo has **no jsdom and no browser test harness**. Client-side tests for `office-tab.js` use a
  hand-rolled fake DOM plus `globalThis.location`/`localStorage`/`fetch` stubs, dynamic-`import()`ing
  the real module (`server/tests/issue-1141-office-tab-render.test.js`). This is an established,
  pre-existing pattern in this repo, not something this diff invented - do not flag the technique
  itself as a problem, only genuine gaps in what it covers.
- DB-backed tests require a real MongoDB connection (`tm_suite_test`, never live `tm_suite`) and will
  **SKIP rather than fail** if unreachable - a skipped suite is not a passing suite. Read the summary
  line (`Test Files X passed | Tests Y passed | Z skipped`), not just the exit code, for every gate you
  run. If your sandbox denies outbound MongoDB connections (a known, previously-recorded issue in this
  environment), say so explicitly rather than reporting a partial run as complete.
- **Blast radius**: `public/js/tabs/office-tab.js` and `public/js/data/office-xp.js` are both shared,
  load-bearing modules with existing consumers this diff did not touch directly (`public/js/app.js`
  imports `renderOfficeTab`). A mistake in the refactored control flow silently breaks the live Office
  tab for every player and ST who opens it, not just the specific paths this diff's own tests exercise.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/issue-1141-office-tab-render.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-2-derived-office-xp-calculation.test.js tests/office-merit-dots.test.js tests/oxp-11-office-purchase-seat-keying.test.js tests/oxp-4-merit-persistence-handover.test.js`.
  Report the real numbers even if they disagree with anything the author's own record claims -
  especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-6-diff.txt` and **nothing else**. No spec, no story
file, no project context. Do not explore the repository. Do not go looking for the spec. Read other
files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A GET route (`server/routes/office-manoeuvre-rank.js`) changes its response value shape from a bare
integer per key to `{rank, manoeuvre_xp_destroyed}`. A pure function (`officeXpSpentForCategory` in
`public/js/data/office-xp.js`) is extended to add a new field into a running total, on one of its two
accepted input shapes only. A large client file (`public/js/tabs/office-tab.js`) is substantially
refactored: two previously-independent, self-fetching async render functions become synchronous
renderers of data a new shared async function fetches once; two "adjust" functions that used to
re-render only their own section now trigger a full shared refresh; hand-built Unicode dot strings are
replaced with HTML span markup; new exported functions compute per-dot "why is this not bought yet"
reasons; a new "balance" line of text is rendered conditionally. Five existing test files are modified
to match.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The GET route's default value fallback.** `doc.rank || 0` and `doc.manoeuvre_xp_destroyed || 0` -
   does `|| 0` silently coerce a legitimate falsy-but-valid stored value (e.g. `NaN`, or a stored `0`
   that should stay `0`) incorrectly? Trace what `0 || 0` and `undefined || 0` actually produce here and
   whether that matches the field's real semantics.
2. **`officeXpSpentForCategory`'s new destroyed-XP branch** - it is nested inside the existing
   `manoeuvreRankDoc.rank` branch. Read the full function. Is there any real input shape where
   `manoeuvre_xp_destroyed` is present but `rank` is absent or non-numeric, for which the new field
   would then be silently dropped from the total? Is the guard (`typeof ... === 'number' &&
   Number.isFinite(...)`) actually sufficient, or does it admit `Infinity`/`-Infinity` incorrectly
   (`Number.isFinite(Infinity)` is `false`, so check this claim rather than assuming it)?
3. **`manoeuvreRankHtml`'s new 4th `reasons` parameter is optional** (`function manoeuvreRankHtml(rank,
   count, isST, reasons)`). Every call site that OMITS it falls back to `shDotsWithBonus`. Every call
   site that PASSES it uses the new local `_dotsWithReasons`. Find every call site in the diff. Do any
   of them pass a `reasons` array of the WRONG LENGTH for `count`, or a `rank` that disagrees with the
   `reasons` array's own encoding of which dots are "purchased" (index < some other rank value)? A
   mismatch here would silently paint the wrong dots as filled vs hollow-with-title.
4. **`_refreshPurchaseState`'s balance computation runs unconditionally** whenever
   `outcome.status === 'ok' && !fetchFailed`, regardless of viewer type - the diff's own comment says
   gating is deferred to the two render functions. Read both render functions' actual gating in full.
   Does EITHER of them leak the computed balance number, or a reason string derived from it, into
   markup visible to a viewer who should not see it? A `title` attribute is part of the DOM and
   readable by anyone inspecting the page, not just visually - if a reference viewer's dots ever carry
   affordability `title` text, that is a real information leak even if the visible balance LINE itself
   is correctly hidden.
5. **`_adjustMeritDots` and `_adjustManoeuvreRank`'s post-write refresh** now calls a full shared
   `_refreshPurchaseState(el, outcome, data, isOwnOffice, gen)` instead of just re-rendering their own
   section. Trace exactly what `data` is at each of the two call sites and confirm it is the SAME shape
   `_wireMeritDots`/`_wireManoeuvreRank` expect (`{merits, manoeuvres}` - `OFFICE_DATA[category]`), not
   a stale or differently-shaped value left over from an earlier signature.
6. **Assertions whose pass condition is trivially satisfiable.** Several new/modified test assertions
   use `.toContain(...)` on a substring built from filled/hollow dot counts inside markup that can
   contain MULTIPLE independent dot runs (e.g. a merit-mount with several merit rows). Check whether
   any such assertion could pass on an ACCIDENTAL substring match spanning across two adjacent dot runs
   rather than genuinely proving the intended single row's state - especially any assertion checking a
   dot count of 0 (an empty-string match against `.repeat(0)`-shaped output trivially "succeeds").
7. **Self-contradiction within the diff.** The route's own new comment says this is "the ONLY route
   `manoeuvre_xp_destroyed` can reach the client through" - is that actually true given the rest of the
   diff, or does some other code path (a different route, a different field) already expose or need to
   expose the same value?
8. **Dead code / now-unreachable branches.** With `_wireMeritDots`/`_wireManoeuvreRank` de-asynced and
   no longer independently fetching, is there any leftover error-handling branch, unused parameter, or
   now-redundant guard that the diff should have removed but didn't?
9. **Resource cleanup / abandonment on the guarded-stale path.** The render-generation guard
   (`el._officeManoeuvreGen`) is checked once inside `_refreshPurchaseState` after its `Promise.all`.
   If the generation has advanced by the time that check runs, the function returns early - but does
   anything downstream (an event listener already attached from a PRIOR render, a timer, an
   in-flight write) still reference stale closure state in a way that could fire later against the
   wrong render?
10. **Flag anything you cannot judge without the spec as "worth checking" rather than asserting it.**

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oxp-6-codex-findings.md` now, before
reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. This story adds a per-seat "office XP balance" (earned minus spent, including
XP destroyed by a prior handover reset) to the Office tab, replaces Unicode dot rendering with the
app's standard CSS dot markup, and shows a `title` attribute on unpurchased dots explaining why they
are not bought yet (not enough XP, or - for manoeuvres only - the graduated purchase order has not
reached that rank yet).

### What to hunt for

1. **Read `manoeuvreDotReasons` and `meritDotReasons` in full** (`public/js/tabs/office-tab.js`). Walk
   the EXACT sequence for a manoeuvre ladder at `rank=2, count=5, left=0`: hand-trace what each of the
   5 array entries becomes, index by index, and confirm it matches what the function's own doc comment
   claims (only the SINGLE next-purchasable dot can carry an affordability reason; every dot beyond it
   is order-blocked regardless of balance). Then trace `rank=0, count=5, left=999` (huge balance,
   nothing purchased) and confirm dot index 0 is NOT order-blocked (it IS the next purchasable one) and
   every dot beyond it still reads "Reach rank N first" even though the balance could easily afford
   them - this is the load-bearing safety property the whole design rests on. Does the code actually
   enforce it, or could a boundary value (rank exactly 0, or `count`, or a negative `left`) slip through
   the order check?
2. **Read `_dotsWithReasons` in full** and compare it against `shDotsWithBonus` in
   `public/js/data/helpers.js`. Do the two produce byte-identical markup for the FILLED-dot case (no
   reason)? If a future caller relied on that equivalence and it silently isn't true, what breaks?
3. **`officeSeatXp`'s `left` can be negative** (documented in `office-xp.js` itself - no budget check
   exists yet). Trace `manoeuvreDotReasons`/`meritDotReasons` with a deeply negative `left` (e.g. -50).
   Does the "short by N" arithmetic in the reason string ever produce a nonsensical or negative "short"
   figure, or crash?
4. **Route/matcher order**: does the changed `GET /api/office_manoeuvre_rank` response shape interact
   with ANY other route on the same router (`server/routes/office-manoeuvre-rank.js` in full) in a way
   that could shadow or be shadowed? Read the whole file, not just the diffed hunk.
5. **`_refreshPurchaseState`'s `Promise.all([apiGet(office_merit_dots), apiGet(office_manoeuvre_rank)])`**
   - if ONE of the two rejects, `Promise.all` rejects immediately without waiting for the other. Confirm
   this is genuinely harmless here (no orphaned side effect from the still-pending other fetch) by
   reading `apiGet` in `public/js/data/api.js` in full.
6. **What happens when an awaited condition never becomes true**: if `apiGet('/api/office_seats')`
   inside `_wirePurchaseState` hangs forever (never resolves, never rejects - e.g. a network stall), what
   is the on-screen state indefinitely? Is that the SAME behaviour as before this diff, or did the
   refactor change it?
7. **State mutated by one step leaking into a later step in the same run**: `_wireMeritDots` and
   `_wireManoeuvreRank` are called back-to-back synchronously inside `_refreshPurchaseState` with the
   SAME `dotsBySeat`/`ranksBySeat`/`balance` objects. Does either function mutate any of those shared
   objects (directly, or via a nested object it doesn't own) in a way that could affect the other's
   read of the same data?
8. **Fixture/mock shape vs. real consumer, field for field**: read the `RANKS` fixture in
   `server/tests/issue-1141-office-tab-render.test.js` and every place it or an inline override is
   passed to `stubFetch`. Confirm every fixture object matches the REAL shape `officeSeatXp` and
   `_wireManoeuvreRank` now expect (`{rank, manoeuvre_xp_destroyed}`), not the pre-diff bare-number
   shape, in every single usage - not just the ones the diff's own new tests exercise.
9. **The three modified pre-existing test files** (`oxp-11-office-purchase-seat-keying.test.js`,
   `oxp-3-office-manoeuvre-rank.test.js`, `oxp-4-merit-persistence-handover.test.js`) each had assertions
   changed to match the new GET shape or the new function signatures. For EACH modified assertion, open
   the full original test (not just the diffed lines) and confirm the modification preserves what the
   test was actually trying to prove, rather than quietly weakening it to make it pass.
10. **`oxp-4-merit-persistence-handover.test.js`'s new `refreshPurchaseStateBlock()` helper** slices
    `office-tab.js`'s source text between two literal string anchors. Confirm both anchors
    (`'async function _refreshPurchaseState'` and `'function _wireMeritDots'`) each occur EXACTLY ONCE
    in the real file, at the positions the helper assumes - a duplicate or near-duplicate occurrence
    elsewhere (e.g. inside a comment, or a call site rather than a definition) would silently corrupt
    the slice.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oxp-6-codex-findings.md` now, before
reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-6-office-tab-purchase-markers.md` - the **Story**, **Acceptance Criteria**,
   **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record section yet.** Skip past it entirely. Reading the author's own
   record first anchors you on their framing and turns a review into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written. AC1 gives an EXACT code snippet for the route
     change - does the shipped code match it, or deviate?
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (seat CRUD, a seat picker, an OAQ
     spend-approval gate, a change to WHO can purchase or see purchase state).
   - Specified behaviour that is missing, or present only in appearance. AC6 specifies TWO distinct
     reason texts with a specific priority order (rank-order checked first) - is that priority order
     actually what the shipped code implements?
   - Contradictions between a stated constraint and the actual code. AC7 says the balance line placement
     is "near the Manoeuvres section header" and appears "once" (not duplicated per-section) - verify
     both.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly settled, by direct ruling recorded in the story's own Dev Notes / prior stories - do not
flag these as gaps or re-litigate them:
- The Administrator office gets no new markers (no `OFFICE_DATA` entry exists for it yet; unrelated
  story, oxp.8).
- No seat picker, no seat CRUD, no OAQ spend-approval gate - explicitly out of scope for this story.
- `officeSeatXp`'s `spendKnown` flag being ignored by this story's rendering (not retired, not
  consumed) is a KNOWN, explicitly-flagged open question for the human maintainer, not an oversight -
  the story's own closing section names it directly. Do not treat it as an unflagged gap; you MAY flag
  whether the IMPLEMENTATION actually matches what the story says it does (ignore `spendKnown`,
  render unconditionally) as a legitimate Pass 3a check.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims, including:
   - "11 files, 339 tests, all green, zero unexplained skips" for the full targeted gate.
   - Three SPECIFIC prove-discrimination claims: reverting the GET route's shape change fails "8 tests
     exactly as expected across two files"; reverting the destroyed-XP fold-in fails "exactly 1 test";
     reverting the manoeuvre rank-order-first check fails "exactly 2 tests" (both naming the SAME two
     test names: "dots beyond the next one are ALWAYS order-blocked, regardless of balance" and
     "attaches a title to the blocked dots and none to the purchased ones").
   - A claim that `shDotsWithBonus`'s `opts.hollowMod` was deliberately NOT reused because it emits an
     `stm-modded-dot` class with "gold-tinted styling" - verify this claim directly against
     `public/css/components.css` and `public/js/data/helpers.js`, do not take it on trust.
   - A claim that a redundant third `_isST()` call caused an intermittent Vitest "unhandled rejection"
     warning that was fixed by removing it, "confirmed clean across three consecutive runs" - this is
     inherently hard to verify (it was intermittent even for the author), so run the specific file
     multiple times yourself and report what you actually observe, including if you see it recur.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run the
   drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/oxp-6-codex-findings.md`, grouped `## High` / `## Medium`
/ `## Low`, each finding tagged with the pass that produced it (`[Pass 1]`, `[Pass 2]`, `[Pass 3a]`,
`[Pass 3b]`). Write `- None found.` under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** - be concrete about what reaches it
- **The observable consequence** - what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each pass, and confirmation you did not read ahead.
- Every command you ran, with its real result, including the gate command given above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
