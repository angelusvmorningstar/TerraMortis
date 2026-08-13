# Adversarial review - oxp-3 (Manoeuvre purchase — graduated merit, rank order), TM Suite

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
   `specs/stories/code-review/oxp-3-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at `specs/stories/code-review/oxp-3-diff.txt`
  and is relative to that root, taken against base commit `c7e6771b`.
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits are
  excluded from it on purpose, so the earlier passes stay genuinely blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** `TM Suite` sits inside an umbrella workspace
  (`D:\Terra Mortis`) alongside sibling repos `TM Cockpit`, `TM Wiki`, `TM Herald`, and non-repo
  content folders. Stay entirely inside `D:\Terra Mortis\TM Suite` — do not read, let alone touch,
  anything in a sibling folder, even out of curiosity about how they relate.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Known, unrelated hazard already in the working tree**: `server/db.js` has an uncommitted,
  out-of-scope edit (`tls: true` → `tls: false`) that is NOT part of this diff and NOT yours to fix
  or comment on as a finding. It breaks the local MongoDB connection in a way that makes every
  DB-backed test suite **silently skip rather than fail** (`describe.skipIf(!dbAvailable)`), which
  reads exactly like a pass unless you read the actual summary line. Before trusting ANY test result
  in this review, confirm from the runner's own output whether tests genuinely ran or were skipped
  for lack of a DB connection. If you find local Mongo unreachable because of this, say so explicitly
  in your Validation notes rather than reporting suite results as green.
- This diff touches genuinely **shared infrastructure**, not just new isolated files:
  `server/index.js` (the global route table), `server/tests/helpers/test-app.js` (the shared test
  harness many other suites depend on), and `public/js/tabs/office-tab.js` (the single render
  function for the ENTIRE Office tab — Status Power, Status Actions, the category picker, and the
  Merit Suite section all share this file and are rendered by the same `renderOfficeTab` this diff
  modifies, even though none of those sections' own code changed). A mistake in the shared parts of
  this diff can regress features the diff itself never touches.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  `cd server && npx vitest run tests/oxp-3-office-manoeuvre-rank.test.js tests/issue-1141-office-tab-render.test.js tests/office-merit-dots.test.js tests/otc-3-office-nav-unconditional.test.js tests/feature.691.hos-city-status-power.test.js tests/issue-1141-office-data-sync.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/oaq-2-pending-status-actions-accept-decline.test.js tests/otc-2-office-actions-api.test.js tests/otc-2-city-status-calc.test.js`.
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/oxp-3-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Do not go looking for the spec. Read
other files only to resolve an import path the diff itself leaves ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new "graduated purchase rank" feature for an Office tab in a character sheet app. An office has
five fixed "manoeuvres" (text abilities), bought in order 1-5. The diff adds: a new Express route
(`server/routes/office-manoeuvre-rank.js`, open GET, ST-role-gated PUT) backed by a new MongoDB
collection; two new pure markup-builder functions in `public/js/tabs/office-tab.js`
(`manoeuvreListHtml`, `manoeuvreRankHtml`) plus async wiring (`_wireManoeuvreRank`,
`_adjustManoeuvreRank`) that fetches the rank, mutes manoeuvres beyond it, and renders a dot readout
with an increment/decrement stepper; new CSS for the muted state and the readout/stepper; and new
route mounts in `server/index.js` and the test harness.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`_wireManoeuvreRank`'s early-return guard**, `if (!isOwnOffice && !isST) return;` — trace all
   four combinations of `(isOwnOffice, isST)` by hand against what actually happens after this line
   (does the list get muted? does the mount get populated? does the stepper appear?) and check each
   outcome is self-consistent with what the surrounding code comments claim, without assuming the
   comments are correct.
2. **`manoeuvreRankHtml`'s dot builder**: `'●'.repeat(rank) + '○'.repeat(Math.max(0, count - rank))`.
   `rank` itself is NOT clamped inside this function - only `Math.max(0, ...)` protects the SECOND
   `.repeat()` call. If `rank` were ever negative or `NaN` when this function is called, does
   `'●'.repeat(rank)` throw, silently produce nothing, or silently produce garbage? Is there any code
   path in this diff that could reach this function with an unclamped value, or is clamping enforced
   only by callers (and if only by callers, is that enforced by more than convention)?
3. **A stale-async-response race**: `_wireManoeuvreRank` is an unawaited async function called from
   inside `renderOfficeTab`. If it is invoked twice in quick succession against the SAME `el` (the
   diff's own category picker lets a user switch office repeatedly), can a slower first `apiGet`
   resolve AFTER a second, faster call has already re-rendered `el.innerHTML` for a DIFFERENT
   category - and if so, does the first call's `.querySelector` calls (which run against `el`, not a
   snapshot) end up writing category-A's rank data into category-B's now-current DOM? Check whether
   any generation/staleness guard exists anywhere in this diff for this specific hazard.
4. **The PUT validation's string-coercion branch**:
   `typeof rank === 'string' && rank.trim() !== '' ? Number(rank) : rank`. Enumerate exactly what
   `rank` can be from an arbitrary HTTP client (not just the diff's own well-behaved caller): a
   string containing whitespace-padded digits, a string containing a number with trailing garbage
   (`"3abc"`), an array, an object, `NaN` itself sent as JSON (not directly possible via JSON, but
   consider `Infinity`-adjacent inputs), and confirm each is actually rejected by
   `Number.isInteger(n)` and not silently accepted.
5. **Self-contradiction within the diff**: the CSS comment above `.office-manoeuvre-unpurchased`
   says muting is "Own-office view only — never rendered in the reference view." Does every code path
   that could apply this class actually honour that, or is there a path (however narrow) where a
   reference viewer's render could pick it up?
6. Standard sweep: assertions whose pass condition is weaker than the label claims, error-path
   cleanup (both the route's error branches and the client's `catch { return; }`/`catch { ... return;
   }` blocks - what state, if any, is left behind on a failed fetch mid-mute?), dead code or unused
   imports, and whether the new test file's assertions actually test what their own `it(...)` titles
   claim (titles reference AC numbers - do the assertions match the AC's actual text, or just the
   author's paraphrase of it?).

**STOP. Write your Pass 1 findings to `specs/stories/code-review/oxp-3-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. Read whatever surrounding code you need
to understand what this change is actually plugging into. You still do **not** have the story spec or
any account of the author's intent - work from the code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Verify it against the real files this time rather than trusting the diff's
own framing.

### What to hunt for

1. **Read `public/js/tabs/office-tab.js` in full**, not just the diff hunks. Walk the EXACT sequence
   `renderOfficeTab` performs for each of the four `(category exists in OFFICE_DATA, isOwnOffice)`
   combinations, including the `Administrator`-style "no OFFICE_DATA entry" fallback branch that
   predates this diff. Confirm by hand-tracing that `_wireManoeuvreRank` is never called on that
   fallback path (the new test asserts this; verify the assertion is actually exercising the real
   fallback condition and not a mock that happens to short-circuit first).
2. **Read `server/routes/office-merit-dots.js` side by side with the new
   `server/routes/office-manoeuvre-rank.js`.** They are meant to be structural siblings with the same
   security posture. Find every place they diverge and judge, for each divergence, whether it is a
   deliberate and correct difference (rank is graduated/single-valued vs merits being
   independent/per-item) or an accidental omission (a check merit-dots has that manoeuvre-rank
   quietly dropped, or vice versa).
3. **`requireRole('st')`** - read `server/middleware/auth.js` in full (not just the `requireRole`
   function) and confirm independently, from the code, that a `dev`-role request really is granted
   the same access as `st` for this specific route, for both the new route AND to check whether any
   OTHER role (e.g. `coordinator`) is unexpectedly let in or unexpectedly excluded.
4. **Route registration order and shape** in both `server/index.js` and
   `server/tests/helpers/test-app.js`: could `/api/office_manoeuvre_rank` ever be shadowed by, or
   shadow, an existing mount (`/api/office_merit_dots`, `/api/office_actions`, `/api/chapters`)? Is
   the new mount's middleware chain (`requireAuth, noCache()`) actually identical in ORDER and
   CONTENT to its sibling, in both files - a mismatch between the two files (production route table
   vs test harness) would mean the tests are not actually exercising production's real behaviour.
5. **State mutated in one step leaking into a later one**: `_adjustManoeuvreRank` re-fetches before
   computing `next`, then calls `_wireManoeuvreRank` again at the end to re-render. Between the
   successful `apiPut` and that re-render call, is there any window where the DOM shows a stale rank
   that a rapid second click could act on before the re-render lands? Two STs clicking the same
   office's stepper concurrently - trace what actually happens server-side (does the PUT's
   `findOneAndUpdate` genuinely serialize two concurrent increments correctly, or can both requests
   read the same starting value and one overwrite the other's result? Note this is a DIFFERENT
   question from the diff's own re-fetch-before-write comment, which only protects against ONE
   client's own stale DOM, not concurrent server-side writes from two different clients).
6. **Malformed input at the new route's boundary**: a category name containing MongoDB operator
   characters or path-traversal-style segments (`../office_merit_dots`, `$where`, etc.) passed as the
   `:category` URL parameter - since `OFFICE_DATA[category]` is a plain object lookup, is there any
   prototype-pollution-adjacent risk from a category value like `__proto__` or `constructor`, and if
   so is it actually reachable (does the `!officeEntry` check catch it, or does JS object lookup
   return something non-undefined for those keys on a plain object literal)?
7. **Fixture/mock shape vs real consumer**: `server/tests/helpers/test-app.js`'s new mount - confirm
   its middleware and router are byte-identical in intent to the production mount in `server/index.js`
   for THIS route, field for field, not just "a route exists at this path".

**STOP. Write your Pass 2 findings to `specs/stories/code-review/oxp-3-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/oxp-3-manoeuvre-purchase-graduated-merit.md` - the **Story**, **Acceptance
   Criteria**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or any Senior Developer Review section yet.** Skip past them
   entirely. Reading the author's own record first anchors you on their framing and turns a review
   into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an AC's
     exception is exactly as narrow as it is written. In particular, **AC6 says the rank readout is
     "shown regardless of `isOwnOffice`"** - read the real code in `_wireManoeuvreRank` and judge
     whether that literal wording actually holds, for every viewer type (ST browsing own office, ST
     browsing another's, non-ST browsing own office, non-ST browsing another's), not just the cases
     that happen to matter for AC2.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (in particular: no XP bookkeeping, no OAQ
     routing, no handover-reset logic - confirm none of these snuck in anywhere).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate - do not flag these as gaps: Epic OXP's full XP-accrual
economy (oxp.1 data-lock, oxp.2 derived-XP calculation), any cost to advance a rank, handover-reset
logic (oxp.5), and Epic OAQ spend-approval routing (oxp.9). All four are named exclusions in the
story's own "What this story is NOT" section, on the explicit reasoning that there is no XP spend
event in this story's scope to gate, cost, reset, or route for approval. The decision to build a
SEPARATE `office_manoeuvre_ranks` collection/route rather than extend `office_merit_dots` is also
settled (documented reasoning: `office_merit_dots`'s GET response shape is already client-consumed
and reshaping it was rejected during story-writing) - do not re-litigate that architectural choice
itself, though you should still check whether the SEPARATE route, once built, actually achieves the
same security/behavioural posture as its sibling (that is Pass 2's job, not a re-litigation of
whether separation was the right call).

**Do NOT treat the readout's `isOwnOffice || isST` gating (rather than fully unconditional) as
pre-settled.** This is a live, disclosed deviation from the story's own Task 2 wording, not a
resolved decision - form your own judgement on whether it satisfies AC6 and AC2 together, or
violates one of them, before you reach Pass 3b and see how the author justified it.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** in full. It makes specific, checkable claims:
   - "All 8 ACs satisfied" - re-verify each one specifically, including the two you already formed an
     independent view on in Pass 3a (AC2's structural boundary, AC6's "regardless of isOwnOffice"
     wording against the actual `isOwnOffice || isST` gate).
   - "171/171, 10 files, zero skipped" - run the exact gate command yourself, right now, and report
     what you actually get. If your own environment shows different numbers (skipped suites,
     different totals), say so explicitly rather than reconciling silently - and check first whether
     the known `server/db.js` hazard (see Ground rules) is the cause before concluding the story's
     own claim was wrong.
   - "Both security-relevant gates were prove-discriminated by mutation - deleting `isOwnOffice &&`
     failed exactly the AC2 test and nothing else; `if (isST)` → `if (true)` failed exactly the AC6
     test and nothing else." - reproduce this yourself: make each described mutation, run the exact
     same gate command, confirm which test(s) actually fail, restore the file, confirm `git diff`
     shows no residual change.
   - The two disclosed deviations (readout gating, synchronous list rendering) - are the stated
     REASONS for each deviation actually true when you check the code and the "5 existing tests"
     claim, or just asserted?
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run
   the drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and
   say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to `specs/stories/code-review/oxp-3-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the full gate command above.
- **Anything you could not run, and why.** Name it specifically - including, explicitly, whether the
  `server/db.js` hazard forced any DB-backed suite to skip rather than genuinely run.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
