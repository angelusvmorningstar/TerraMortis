# Adversarial review - issue-1137 (Collective Compound pool producer), TM Suite

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
   `specs/stories/code-review/issue-1137-codex-findings.md`, before you open anything the next pass
   allows. Do not revise an earlier pass's findings in light of what a later pass taught you - if a
   later pass contradicts an earlier one, say so as a new finding and leave the original standing.
3. At the very end, **attest** to what you actually did: which files you opened in each pass, which
   commands you ran, and anything you could not run. Do not paper over a gap - see "Honesty" below.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/issue-1137-diff.txt`, relative to that root, taken against base commit
  `d6f641d7`. The branch has **zero commits** on top of that base, so the diff is the working tree
  vs `main` and you can reproduce it yourself.
- The diff is **deliberately scoped to source and tooling**. This story's spec and
  `sprint-status.yaml` are excluded on purpose so the earlier passes stay blind to the author's own
  account. Do not treat their absence as an omission or go hunting for them.
- **One disclosure, so you are not misled.** The diff DOES contain a documentation change to
  `specs/stories/mnec.collective-2.generalise-compound-rendering.story.md` - a *different, older*
  story - and that change is a correction note which states the rationale for this fix. It is a
  changed artefact you should review for accuracy like any other hunk. It is not this story's spec.
  Judge the code on the code.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo sits in an umbrella workspace beside
  `../TM Cockpit`, `../TM Wiki`, `../TM Herald`. Do not touch or read them; nothing here depends on
  them.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) **is allowed and encouraged** - you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **Environment hazards, disclose rather than skip:**
  - `server` vitest needs a local **mongod**. Several suites in the regression set are DB-backed and
    will SKIP without it (known issue #1117). A skipped suite is not a passing suite - say so.
  - `server/scripts/` holds ~1500 untracked scratch files from unrelated map work. A repo-wide `rg`
    over that tree will be slow or time out; scope your searches to `public/`, `server/routes`,
    `server/lib`, `server/tests`.
  - The working tree is uncommitted and also carries one unrelated modified file
    (`server/scripts/_locations-local.json`, someone else's map work). Ignore it.
- **Blast radius.** `applyDerivedMerits` runs on **every character sheet render**, in the player app,
  the admin app and the downtime form. A mistake here is not scoped to one surface.

## Honesty requirements (these outrank completeness)

- If you could not run something, **say so plainly and name what you could not run**.
- If you found nothing in a pass or at a severity, **say that explicitly** rather than omitting the
  section or padding with style opinions.
- Report the **exact current gate numbers** you observe:
  - `cd server && npx vitest run tests/issue-1137-pool-producer.test.js`
  - `cd server && npx vitest run $(grep -rln "applyDerivedMerits\|_legacy-bridge\|_grant_pools" tests/ | grep -v "helpers/" | tr '\n' ' ')`
  Report the real numbers even if they disagree with anything the story claims - especially then.

---

## PASS 1 - BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/issue-1137-diff.txt` and **nothing else**. No spec, no
story file, no project context. Do not explore the repository. Read other files only to resolve an
import path the diff itself leaves ambiguous.

### What this diff claims to be

A bug fix. A "grant pool" producer in `public/js/editor/mci.js` was invoked once per hardcoded merit
name - four calls - which meant two merits whose data was seeded later never had their pool produced
at all, so a UI allocation stepper clamped to zero for their owners. The four calls are replaced by a
single sweep over the whole rules cache. It also adjusts three test files and adds one, and appends a
correction note to an older story document. It claims no behavioural change for the four sources that
already worked.

**That is the shape it claims. Do not trust the shape - verify it.**

### What to hunt for

1. **The single biggest risk: does the sweep activate anything that was previously, deliberately, NOT
   activated?** The old code ran the producer for exactly four named sources. The new code runs it for
   every rule matching `grant_type === 'pool' && condition === 'merit_present'`. Read
   `pool-evaluator.js` and work out precisely which rules that predicate admits. If any rule in the
   data satisfies it but was *intentionally* excluded before, this change silently switches it on.
   Say what would have to be true in the data for that to happen.
2. **Duplicate rules.** `applyPoolRulesFromDb` loops per rule and pushes one `_grant_pools` entry per
   matching rule, with **no de-duplication**. If `rule_grant` contains two docs for the same source,
   the sweep pushes two entries and capacity **doubles**. Under the old per-source call the same
   duplication would also have doubled - check whether that is true, and check whether duplicate
   seeds actually exist for pool rules. Report the risk even if today's data happens to be clean.
3. **`_grant_pools` array ORDER changed.** Pushes now follow `rule_grant` order rather than the old
   four-call order. Search every consumer of `_grant_pools` and determine whether any reads it
   positionally (`[0]`, `.find()` relying on first-match, index arithmetic, `.shift()`) rather than
   filtering by `category`. One positional reader makes this a real defect.
4. **The `?.` in `getRulesCache()?.rule_grant || []`.** Determine from the diff whether the optional
   chain is reachable at all, or dead defensive code. If it is dead, say so; if it is reachable, work
   out what state reaches it and whether `|| []` is the right behaviour there.
5. **Test-mock changes that could weaken a suite.** Two committed suites had their `getRulesCache`
   mock changed from returning `rule_grant: []` to deriving it from the same store that feeds
   `getRulesBySource`. Those suites compare an "evaluator path" against a "legacy path". Work out
   whether making both paths produce pools could make the comparison **vacuous** - i.e. whether the
   assertion still distinguishes the two paths, or now passes trivially because both sides changed
   together.
6. **The rewritten source-text guard.** A test previously asserted a literal string existed in
   `mci.js`; it now asserts a different literal exists AND that a pattern does *not*. Check both
   regexes actually match/reject what they claim against the post-change file, and that the negative
   assertion cannot pass vacuously (e.g. because the regex has a typo and matches nothing regardless).
7. **The new test file.** For each of its 8 tests ask: *would this pass if the producer did nothing at
   all?* Identify any test whose pass condition is trivially satisfiable, and any that lacks a
   positive control. Check the fixtures are internally consistent (a `cp`/`xp` split that does not sum
   to the stated rating would make an amount assertion meaningless).
8. **Comment accuracy.** The new comment block in `mci.js` makes several factual claims (about what
   the evaluator filters, about ordering, about a null-cache guard). Check each against the actual
   code in the diff. A confidently wrong comment is worse than none.
9. **Anything removed that was doing more than it appeared.** The four deleted call sites had comments
   attached; confirm nothing else was deleted with them and no other statement was disturbed.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/issue-1137-codex-findings.md` now,
before reading further.**

---

## PASS 2 - EDGE CASE HUNTER (the diff, plus the repository)

You now have full read access to `D:\Terra Mortis\TM Suite`. You still do **not** have the story spec
or any account of the author's intent - work from the code itself.

### Orientation (not ground truth - verify against the code)

A pool producer that was called once per hardcoded merit name is now called once over the whole rules
cache. Three test files adjusted, one added, one older story document annotated.

### What to hunt for

1. **The contract change is the heart of this pass.** The producer previously read
   `getRulesBySource(name)`; it now reads `getRulesCache().rule_grant`. Establish, from
   `public/js/editor/rule_engine/load-rules.js`, whether those two can ever disagree in production -
   i.e. whether `getRulesBySource` is genuinely derived from `_cache.rule_grant`, or whether there is
   any path (a partial preload, a failed category fetch, the `/api/rules/aggregate` route returning a
   subset, an admin cache invalidation race) where one has data and the other does not. **Then find
   every caller of `applyDerivedMerits` in the whole repo** and check each one primes the cache in a
   way the new code can consume. A caller that primes per-source only would now silently produce no
   pools.
2. **Trace the full chain for a real compound owner.** `applyPoolRulesFromDb` → `_grant_pools` →
   `poolAvailableFor` (`public/js/data/rules-helpers.js`) → the stepper cap in
   `public/js/editor/edit.js`. Confirm by reading the code that a capacity of N yields a stepper max
   of N for an unallocated row, and that an already-allocated row gets its own current value added
   back rather than being double-counted.
3. **The MCI pool rules.** `rule_grant` contains pool docs with `condition: 'choice'` and `'tier'`
   that belong to a *different* evaluator (`applyMCIRulesFromDb`). Confirm the sweep cannot process
   them, and confirm the MCI evaluator is unaffected by the change in call ordering.
4. **Ordering.** The four calls used to be interleaved with other evaluators (OHM, Safe Word, MDB,
   OTS, Bloodline). They are now a single call at one point. Work out independently whether any pool
   amount can depend on state written by an evaluator that used to run between them - read
   `_computeAmount` and every `amount_basis` it supports, and check whether any basis reads a `free_*`
   channel, a status floor, or anything an interleaved evaluator mutates. State your own conclusion
   rather than accepting the comment's.
5. **The `#249` null-cache guard.** `applyDerivedMerits` bails when the cache is null, and the code
   comment describes a real historical data-loss incident. Confirm the guard still precedes every
   mutation after this change, and that the new call cannot run before it.
6. **Consumers of `_grant_pools` across the whole app**, not just the ones the diff names - the
   sheet renderer, the editor, the downtime form, any admin surface. Confirm none breaks on a
   different array order, a larger array, or an entry for a category it does not recognise.
7. **What happens for a character holding a compound merit at rating 0**, or holding the merit twice,
   or holding a target merit but not the gate merit. Walk each and say what the produced pool is.
8. **Test-suite integrity.** Run the regression set. If anything fails, determine whether it fails on
   the base commit too before attributing it to this change - `git stash` is forbidden, so reconstruct
   the base with `git archive` or `git show d6f641d7:<path>` into a temp directory.

**STOP. Write your Pass 2 findings to `specs/stories/code-review/issue-1137-codex-findings.md` now,
before reading further.**

---

## PASS 3 - ACCEPTANCE AUDITOR (the diff, plus the spec)

### Pass 3a - form findings BEFORE reading the author's own account

1. Read `specs/stories/issue-1137-collective-pool-producer.story.md` - the **Story**, **Acceptance
   Criteria**, **What this story is NOT**, and **Dev Notes** sections ONLY.
2. **Do NOT read the Dev Agent Record or the Change Log yet.** Skip past them entirely.
3. Against the 8 acceptance criteria, check the diff and the real code for:
   - Violations of an AC's **literal wording**. AC5 says the four existing sources' pools are
     "byte-identical to before this change" - hold it to that word, and say plainly whether the
     array-order change satisfies it. AC6 says a new compound works with "no change to `mci.js`" -
     verify that is actually true rather than asserted.
   - Deviations from stated intent. **"What this story is NOT" is equally load-bearing** - it forbids
     touching `pool-evaluator.js`, touching CSS, writing character data, and touching the MCI pools.
     Check none happened.
   - Specified behaviour that is missing, or present only in appearance. AC2 concerns a UI stepper -
     check whether anything actually verifies the UI, or only the value behind it.
4. **Write your Pass 3a findings down now, before moving on.**

**Settled decisions - explicitly NOT in scope, and deliberate. Do not flag these as gaps:**

- Anichka's character sheet is **deliberately not edited**. The allocation ruling is applied by a
  human once the UI works.
- **No CSS change.** The stepper and counter already render through existing markup.
- `pool-evaluator.js` is **deliberately unchanged** - it was already generic; the caller was the bug.
- The stale `xp_log` field is a **separate issue (#1138)**, deliberately untouched.
- `tests/n7-n9-allocator-readers.test.js` has a **pre-existing failure** ("all three dropdown builders
  consume meritPrereqOK") on a source-window assertion over `public/js/editor/merits.js`, a file this
  change does not touch. It is tracked as **#1115**. Judge only whether this change made it worse.
- Deploy timing is a human decision. Do not recommend shipping or not shipping.

### Pass 3b - now read the author's record and check it against reality

5. Now read the **Dev Agent Record** and **Change Log** in full. Attack these specific claims:
   - **"RED: 5 failed / 3 passed, and AC4 (Necropolis) PASSED in the RED run."** This is the
     load-bearing discrimination evidence. Reproduce it: reconstruct the pre-change `mci.js` from
     `d6f641d7` into a temp location, or revert only that file's hunk, run the new test, restore.
     Report the real numbers.
   - **"GREEN: 8 passed"** for the new suite, and **"239 passed / 1 failed across 22 suites"**. Run
     both yourself.
   - **"The 1 failure is pre-existing #1115."** Verify it fails at base too.
   - **"Live check: Anichka darktemple capacity 3 / available 3; Yusuf and Xavier necro 5 /
     available 0."** This was run against the production database, which you may not be able to
     reach. If you cannot, say so rather than accepting or rejecting it.
   - **"Two committed suites had unfaithful mocks encoding a state production cannot reach."** This is
     the author's justification for editing existing tests, which is always worth scrutiny. Decide
     independently whether the original mocks were wrong, or whether the change to them **masked a
     real behavioural regression** that the original mocks would have caught.
   - **"No consumer depends on `_grant_pools` order."** The author asserts this. Verify it.
   - **"Exactly one call site, zero per-source dispatches."** Grep and confirm.
   - The **Declared deviations** section - check each is complete rather than partial, and in
     particular whether the AC2 deviation understates what was not verified.
6. **Verify each claim by running it, not by reading it.**
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**.
8. State plainly whether this change is ready to ship as-is, needs patches, or has a blocking problem.

---

## Output

Write everything to `specs/stories/code-review/issue-1137-codex-findings.md`, grouped `## High` /
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
- Every command you ran, with its real result, including the two gate commands above.
- **Anything you could not run, and why.** Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
