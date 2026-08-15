# Adversarial review - dbo-3-xp-spend-standing-filter-bug (XP-spend merit pickers exclude the wrong merits), TM Suite

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

## How to run this - read this section before anything else

This is **three passes in one session, in a fixed order**, and the order is load-bearing. Each pass
is allowed to see strictly more than the one before it. You cannot un-read a spec, so the pass that
must judge the code cold goes first.

1. Work the passes **in the order written**. Do not read ahead. Do not open a file a later pass
   grants you until you reach that pass. In particular: **the story spec is deliberately NOT in the
   diff.** Do not go looking for it during the earlier passes, even though two of the diff's own new
   comments mention the story file's path by name (`specs/stories/dbo-3-xp-spend-standing-filter-bug.md`)
   - those are ordinary code-comment cross-references, not an invitation. The final pass will hand
   you the real path.
2. **Freeze each pass before advancing.** Write that pass's findings out in full, to
   `specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-codex-findings.md`, before you open
   anything the next pass allows. Do not revise an earlier pass's findings in light of what a later
   pass taught you - if a later pass contradicts an earlier one, say so as a new finding and leave
   the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-diff.txt` and is relative to that
  root, taken against base commit `1063787b` (the commit this branch, `ms/dbo-3-xp-spend-standing-filter-bug`,
  was cut from off `main` - `git diff 1063787b -- <paths>` reproduces the tracked half yourself if
  you want to check).
- The diff is **deliberately scoped to source and tooling only**. Story-spec and tracking edits (the
  story markdown file, `specs/stories/sprint-status.yaml`) are excluded from it on purpose, so the
  earlier passes stay genuinely blind to the author's own account. Do not treat their absence as an
  omission or go hunting for them.
- **This is an umbrella workspace.** `D:\Terra Mortis` also contains sibling repos - `TM Cockpit`,
  `TM Wiki`, `TM Herald` - each an independent git repo with its own remote and deploy pipeline. Stay
  entirely inside `D:\Terra Mortis\TM Suite` for this review; do not read, run, or modify anything in
  a sibling repo even to cross-check.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- This project has **no jsdom** - all client-side tests use a hand-rolled browser-shim + fake-DOM
  technique (stub `globalThis.location`/`window`/`localStorage`, dynamic `import()` the real module).
  This is normal for this codebase, not a smell. The new test file in this diff also seeds a rules
  cache by writing a JSON array directly to `globalThis.localStorage['tm_rules_db']` - this is the
  SAME mechanism `public/js/data/loader.js`'s real `getRulesDB()` reads from as its own synchronous
  fallback path, not a mock replacing real code.
- Tests run via `cd server && npx vitest run tests/<name>.test.js`. Some suites need a local `mongod`
  and SKIP rather than fail without one - this diff's own new test file needs no database at all, so
  that caveat should not apply to it, but confirm rather than assume.
- **Known pre-existing failure, not caused by this diff**: `server/tests/n7-n9-allocator-readers.test.js`
  has one flaky-by-design source-contract assertion (`n7-n9-allocator-readers.test.js:246`, a
  600-character-window regex measuring the gap between `buildMeritOptions`'s own name and its own
  `meritPrereqOK(c, rule)` call) that already fails on `main` before this diff touches anything - the
  real gap in the function body is >600 chars regardless of this story. This is documented in the
  project's own `CLAUDE.md` as issue #1115. **Verify this claim yourself** (see Pass 3b) rather than
  taking it on trust - the Dev Agent Record's own account says this was confirmed via `git stash`
  comparison against `main`, and separately says an EARLIER draft of one new code comment in this
  diff accidentally caused this SAME test to falsely PASS (by naming `buildMeritOptions` and quoting
  `meritPrereqOK(c, rule)` close together in the comment's own prose, satisfying the regex against
  comment text rather than real code) before being reworded - both claims are checkable facts, not
  assertions to accept blind.
- **Blast radius note**: `isMeritEventGranted` is a new shared predicate called from FOUR sites across
  two files (three replaced, one newly added). A mistake in it affects the sheet's own primary "Add
  Merit" picker (`buildMeritOptions`), an MCI-dot grant dropdown, a "Fucking Thief" steal-list picker,
  and the Downtime-form XP-spend picker - not just one of them.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**. A disclosed gap
  is far more useful than a confident static read presented as a verified one.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe: `cd server && npx vitest run
  tests/dbo-3-standing-merit-filter.test.js tests/n7-n9-allocator-readers.test.js
  tests/issue-896-availability-filter.test.js`. Report the real numbers even if they disagree with
  anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-diff.txt` and
**nothing else**. No spec, no story file, no project context. Do not explore the repository. Do not
go looking for the spec. Read other files only to resolve an import path the diff itself leaves
ambiguous.

The blinding is the point. You are here to catch what a competent reviewer with zero project memory
would catch, uncontaminated by the author's framing of what the change was supposed to do.

### What this diff claims to be

A new exported predicate, `isMeritEventGranted(rule)`, checking `rule.special === 'standing'`, added
to `public/js/editor/merits.js` and used to replace three existing broken checks that instead read
`rule.sub_category === 'standing'` (in `downtime-form.js`'s `getItemsForCategory`, and in
`merits.js`'s own `buildMCIGrantOptions` and `buildFThiefOptions`), plus one NEW check added to a
fourth function, `buildMeritOptions`, which previously had no such exclusion at all. A new test file,
`server/tests/dbo-3-standing-merit-filter.test.js`, exercises the new predicate directly and three of
the four call sites (the fourth, `getItemsForCategory`, only via a source-text assertion, not direct
invocation).

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **`isMeritEventGranted`'s own null-safety** - `return !!rule && rule.special === 'standing';`. Is
   there any input shape (not just `null`/`undefined`, but e.g. `rule.special` being a non-string
   truthy value, or `rule` being an array/function) that could produce a surprising result?
2. **The four call sites replace/add the SAME condition but sit in different surrounding logic.**
   Read each site's full surrounding block in the diff. Does `isMeritEventGranted(rule)` sit BEFORE
   or AFTER other filtering conditions at each site, and does that ordering matter (e.g. could a
   later check short-circuit in a way that makes the new check's position irrelevant, or could an
   earlier check's `continue`/`return` skip past it entirely for some input)?
3. **`buildMeritOptions` gained a check but its OWN existing `sub_category` check was deliberately
   left untouched** (per the diff's own comment: "alongside, not replacing"). Trace by hand: for a
   rule with `special: 'standing'` AND `sub_category: 'general'` (a shape not ruled out by anything
   you can see in the diff alone), does the new check correctly exclude it regardless of the second
   check's outcome? What about the reverse - `special: null`, `sub_category: 'standing'` - is it
   still excluded by the SECOND (pre-existing, untouched) check, independent of the new one? Flag
   this as "worth checking against real data" for Pass 2/3 if the diff alone can't settle it.
4. **The new test file's own risky assertions** - a `not.toContain('Mystery Cult Initiation')`-style
   assertion is trivially satisfiable if the picker function threw an exception and returned an
   empty/error string instead of a real "excluded" result. Does the test file distinguish "correctly
   excluded" from "crashed before reaching the exclusion check" anywhere it matters?
5. **Self-contradiction within the diff** - does any comment's claim about WHY a check is placed
   where it is (e.g. the placement note about a 600-character source-contract regex) match what the
   surrounding code actually does, or does the code's real structure undercut the comment's own
   reasoning?
6. **Dead code / unreachable branches** - with the new check added to `buildMeritOptions`, is the
   pre-existing `sub_category` check now ever unreachable for any real input (i.e. does every rule
   the new check would exclude ALSO get excluded by the old check, making one of them redundant)?
7. **Import correctness** - `downtime-form.js` gains an import of `isMeritEventGranted` from
   `../editor/merits.js`. Does the diff show this import landing in a form that would actually
   resolve (correct relative path, correct export name, no typo)?

**STOP. Write your Pass 1 findings to
`specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-codex-findings.md` now, before reading
further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite` (but stay out of the sibling repos named
above). Read whatever surrounding code you need to understand what this change is actually plugging
into. You still do **not** have the story spec or any account of the author's intent - work from the
code itself.

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth - verify against the code)

Same summary as Pass 1. Now verify it against the real surrounding code rather than trusting the
diff's own comments.

### What to hunt for

1. **Read `public/js/editor/merits.js`'s `buildMeritOptions`, `buildMCIGrantOptions`,
   `buildFThiefOptions` in full.** For each, hand-trace what happens to a rule shaped exactly like
   the real live `Confessor`/`Pledged` documents (`special: null`, `sub_category: 'standing'`,
   `xp_fixed: 1` or `2`, `rating_range: [1,1]` or `[2,2]`, `prereq: {type:'status', qualifier:'Lance',
   dots: 3}` or `1`) through EACH function's full filter chain, not just the one line this diff
   touches. Does `buildMeritOptions` genuinely still exclude both of them via its own untouched
   `sub_category` check (Pass 1 item 3), or does something else in the function's full body change
   that conclusion?
2. **Read `public/js/data/loader.js`'s `getRulesDB`/`getRulesByCategory` in full.** The new test file
   seeds `localStorage['tm_rules_db']` directly. Confirm this genuinely drives the same code path a
   real browser session would use (i.e. `_rulesCache` starts `null` per module load, falls through to
   the `localStorage` read) - or is there a scenario (a prior test in the same process already
   populating `_rulesCache`) where the seeded `localStorage` value would be ignored, silently making
   a test pass against stale/wrong fixture data?
3. **Read `public/js/data/prereq.js`'s `_meetsPrereq`/`_getStatus` in full.** Walk the EXACT sequence
   for `{type:'status', qualifier:'Lance', dots:3}` against a character shaped
   `{status:{covenant:{'Lancea et Sanctum':3}}}`. Confirm the `COV_FULL` mapping genuinely resolves
   `'lance'` to `'Lancea et Sanctum'` and that the comparison is `>=`, not `>` or `===` - a one-symbol
   error here would silently change who qualifies for Confessor/Pledged.
4. **Read `public/js/tabs/downtime-form.js`'s `getItemsForCategory` in full**, and the exported
   `renderDowntimeTab` that is its only path to a populated `currentChar`. Confirm or refute the
   diff's own implicit claim (via the test file choosing a source-contract test instead of direct
   invocation) that there is genuinely no lighter-weight way to exercise this function's real runtime
   behaviour - is `currentChar` truly unexported and unreachable any other way in this file?
5. **Read `server/tests/issue-896-availability-filter.test.js` in full** (the precedent the new source-
   contract test cites). Confirm it genuinely establishes the SAME kind of source-contract testing for
   the SAME file (`downtime-form.js`) for the SAME structural reason (an unreachable module-private
   variable), rather than the new test file's citation being a loose or inaccurate analogy.
6. **Read `server/tests/n7-n9-allocator-readers.test.js:230-251` in full.** Independently confirm
   (do not just trust the "already documented, pre-existing" claim) that the 600-character regex
   genuinely fails against the CURRENT (diff-applied) state of `merits.js` for a reason unrelated to
   this diff - i.e. that the real character gap between `buildMeritOptions`'s own declaration and its
   own `meritPrereqOK(c, rule)` call already exceeds 600 characters on `main`, before this diff's
   changes are applied at all.
7. **Search the whole repo for other readers of `rule.special` or `rule.sub_category` on
   `purchasable_powers`/rules documents** (`rg -n "\.special\b|sub_category"` across `public/js` and
   `server/`) that this diff's four call sites don't touch. Is there a FIFTH place that should have
   been updated but wasn't - another picker, an admin view, a server-side route - that independently
   filters on the same broken `sub_category === 'standing'` pattern?

**STOP. Write your Pass 2 findings to
`specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-codex-findings.md` now, before reading
further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/dbo-3-xp-spend-standing-filter-bug.md` - the **Story**, **Acceptance
   Criteria**, **What this story is NOT**, **Tasks/Subtasks**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely. Reading the author's own
   record first anchors you on their framing and turns a review into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative - an
     AC's exception is exactly as narrow as it is written. In particular, read AC4's wording closely
     ("at each of those three call sites") against what the diff actually delivers at
     `buildMeritOptions` - does the diff's own scoping match, or overreach, or underreach?
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing** -
     check the change did not quietly do an excluded thing (in particular: does anything in this diff
     write to `tm_suite` data, touch `server/schemas/purchasable_power.schema.js`, or touch
     `admin/rules-view.js` - all three explicitly excluded?).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

**Already ruled on, by name - do not flag these as gaps, they are deliberate:**
- No write to `tm_suite` of any kind - Confessor's/Pledged's live `sub_category: 'standing'` value is
  deliberately left as-is; the fix reads `special` instead, making the stored value irrelevant to
  this exclusion rather than something needing correction (AC2, "What this story is NOT").
- No change to `server/schemas/purchasable_power.schema.js` (DBO-1's own separate scope) or to
  `admin/rules-view.js`'s dropdown/tooltip (a separate, smaller, out-of-scope fix).
- No change to `getRulesByCategory`, the rule-engine cache, or any `getItemsForCategory` branch other
  than `'merit'`.
- `buildMeritOptions` NOT making Confessor/Pledged selectable is a **confirmed, deliberate, in-scope
  finding of this story itself** (see its own Dev Notes/Dev Agent Record) - not a gap to flag as new.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** section in full. It makes specific, checkable claims, in
   particular:
   - "20 new tests... full targeted gate... 68/69" - verify this exact number yourself, right now.
   - The claim that `n7-n9-allocator-readers.test.js`'s failure is pre-existing and confirmed via
     `git stash` comparison against `main`, unrelated to this diff.
   - The claim that an earlier draft of a code comment caused a FALSE PASS against the same
     600-character regex (by accidentally containing both literal strings the regex hunts for close
     together) - reproduce this if you can (temporarily reintroduce the two literal strings
     `buildMeritOptions` and `meritPrereqOK(c, rule)` close together in the `isMeritEventGranted`
     doc comment, confirm the test then passes for the wrong reason, then revert and confirm the
     comment's current wording does not).
   - Two specific prove-discrimination claims: neutralising `isMeritEventGranted` entirely fails
     "exactly the 4 MCI/PT-still-appearing tests across the three directly-testable sites"; reverting
     ONLY the new `buildMeritOptions` check fails "exactly that one site's MCI/PT test and no other."
     Reproduce at least one yourself: make the same single-line change, confirm the exact tests named
     fail the way claimed, then restore and confirm green again.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Run the
   drivers yourself. Grep the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong - re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

---

## Output

Write everything to
`specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including
  `cd server && npx vitest run tests/dbo-3-standing-merit-filter.test.js
  tests/n7-n9-allocator-readers.test.js tests/issue-896-availability-filter.test.js`.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
