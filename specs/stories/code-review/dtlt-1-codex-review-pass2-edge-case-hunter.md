# Adversarial review — dtlt-1 (Bonus-success mechanic — Stronger Than You), TM Game — PASS 2 of 3 (isolated)

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is an **isolated single-pass file** — one of three independent Codex sessions reviewing the same
change from different angles (Blind Hunter / Edge Case Hunter / Acceptance Auditor). You are the
**Edge Case Hunter**. You will not see the other two passes' output, and they will not see yours.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/dtlt-1-diff.txt`
  (relative to repo root), taken against base commit `0299d515`.
- You have full read access to the repository — read whatever surrounding code you need to understand
  what this change is actually plugging into. You do **not** have the story spec or any account of the
  author's intent — work from the code itself, not from anyone's framing of it. **Do not open the
  story spec file** even if you notice it exists on disk.
- Read and run freely to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.** This repo (`TM Game`) sits inside a larger `Terra
  Mortis` umbrella workspace alongside sibling repos `TM Story`, `TM Herald`, `TM Admin`, `TM Design
  System` — do not read or touch anything outside `TM Game` even for context.
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the way
  you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- Environment hazards: a local `mongod` may or may not be running — several vitest suites SKIP
  (not fail) without one; a skip is expected, not a gap to report. Playwright shares port 8080 —
  never run two Playwright invocations concurrently. This is a long-running test suite; a full
  `npm test` run can take over 10 minutes, prefer the targeted gate commands below.
- Blast radius: this diff modifies the shared dice-rolling primitive
  (`public/js/shared/dice.js`) and the live Roll tab (`public/js/suite/roll-v2.js`) used by every
  character on every roll in the app (standard, rote, chance-die, and contested rolls), plus the
  Feeding tab's own roll resolution. A mistake here changes what every roll in the live app reports
  as its success count, not just the new mechanic's own path.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run. A disclosed gap is
  far more useful than a confident static read presented as a verified one.
- If you found nothing at a severity, say that explicitly rather than omitting the section.
- Report the exact current gate numbers you observe: `cd server && npx vitest run bonus-success
  rule_engine_grep rule_engine_effective_contract api-rules-engine api-rules-aggregate`. Report the
  real numbers even if they disagree with anything else you've seen.

---

## PASS 2 — EDGE CASE HUNTER (the diff, plus the repository)

Your remit is boundaries and branches: walk every path, not just the one the author had in mind.

### Orientation (not ground truth — verify against the code)

A new MongoDB-backed rule family (roll-time "+N successes when X" rules, added to an existing
multi-family rules-engine catalogue). A pure evaluator resolves which rules fire for a
character+roll-context and folds them into a `{rolled, bonus, total}` result. Two live dice surfaces
now use the total instead of the old rolled-only count for their headline success count, while a
rolled-only primitive is kept at two call sites that must stay rolled-only. The v1 seed enables one
rule, gated on a fighting-style manoeuvre the character must have explicitly picked (an array
membership check by name), not on having dots in the related style.

### What to hunt for

1. Hand-trace the full call chain for the seed doc's actual shape (find it inside the diff — the seed
   script is part of the diff) against a character who has picked the manoeuvre but is rolling a
   *different* attribute+skill combination than the worked example anywhere else in the diff. Walk the
   evaluator function by function and confirm, by tracing the calls by hand, that the result at each
   step is what the real code produces — do not trust any comment explaining why.
2. Route ordering: the new route is mounted in the main server entrypoint alongside 8 sibling
   `/api/rules/*` routes, and there is an existing aggregate endpoint that coalesces all of them.
   Confirm the new mount doesn't shadow or get shadowed by any existing pattern — check the actual
   Express route registration order in the file, not just the diff hunk in isolation.
3. What happens when the client-side rules cache getter returns `undefined` (never loaded) vs `{}`
   (loaded, but empty) vs a real object that is missing the new rule family's key specifically (the
   shape a client that loaded its cache *before* this feature shipped would have)? Trace the exact
   expression that reads this collection out of the cache for all three cases and confirm none throws.
4. Malformed manoeuvre-pick entries: what does the manoeuvre-presence predicate check do with an array
   containing `undefined`, `null`, a bare object missing the expected key, or a non-string value in
   that key? Confirm the name-comparison helper handles every one without throwing and without a false
   positive match.
5. A rule doc with `count_basis: 'rating'` and an `also_requires` array containing a *second*,
   different `merit_present` predicate from the primary one. Walk the amount-calculation function's
   `'rating'` branch and confirm it reads the *primary* predicate's merit, not an `also_requires` one
   — and check whether the schema/structural-check code in the diff actually prevents an ambiguous
   doc from being stored in the first place, or only checks the primary predicate's kind.
6. Fixture/mock shape check: the new test file's character fixtures include a rating-like field on a
   fighting-style object. Cross-reference this against the real character schema's fighting-style
   definition elsewhere in the repo (not in this diff, but referenced by it) — does the real schema
   even have that field? Does it matter, i.e. does the evaluator under test ever actually read the
   fighting-styles array at all, or only the separate picks array? If the fixture carries a field the
   evaluator never reads, that's a fixture-realism gap worth noting, not a functional bug — say which
   it is.
7. State-mutation leak: the new "best attribute/skill for this pool" helper in the feeding surface is
   called twice per roll in two different functions. Confirm neither call site mutates the character
   object, the method object, or any shared module-level state in a way that could make the second
   call's result depend on the first call having already run.
8. What happens on a roll where the pool context is entirely empty (no attribute, no skill, no
   discipline, no spec — e.g. a raw chance die roll with nothing declared)? Trace whether any predicate
   kind could spuriously match an empty/undefined trait name.
9. Look for any place a rule doc's `flat_amount` could be missing, zero, or negative despite the
   schema's stated constraints, and trace what the amount-calculation function does with it — does a
   malformed doc ever grant a *negative* bonus (reducing successes) rather than being skipped?

**STOP. Write your Pass 2 findings to `specs/stories/code-review/dtlt-1-codex-findings-pass2.md` now.**

---

## Output

Write everything to `specs/stories/code-review/dtlt-1-codex-findings-pass2.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged `[Pass 2]`. Write `- None found.` under any empty heading
rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened (beyond the diff), and confirmation you did not open the story spec.
- Every command you ran, with its real result, including the gate commands above.
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
