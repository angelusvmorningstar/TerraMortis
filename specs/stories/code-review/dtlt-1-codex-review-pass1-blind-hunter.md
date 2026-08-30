# Adversarial review — dtlt-1 (Bonus-success mechanic — Stronger Than You), TM Game — PASS 1 of 3 (isolated)

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is an **isolated single-pass file** — one of three independent Codex sessions reviewing the same
change from different angles (Blind Hunter / Edge Case Hunter / Acceptance Auditor). You are the
**Blind Hunter**. You will not see the other two passes' output, and they will not see yours.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/dtlt-1-diff.txt`
  (relative to repo root), taken against base commit `0299d515`.
- The diff is **deliberately scoped to source and tooling only**. The story spec and the
  sprint-tracking file are excluded from it on purpose, so this pass stays genuinely blind to the
  author's own account of what the change was supposed to do. Do not treat their absence as an
  omission or go hunting for them. **Do not open the story spec file** even if you notice it exists
  on disk — this pass must judge the code cold.
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

## PASS 1 — BLIND HUNTER (the diff, and nothing else)

You get the diff at `specs/stories/code-review/dtlt-1-diff.txt` and **nothing else**. No spec, no
story file, no project context beyond what's in the Ground rules above. Do not explore the repository
beyond resolving an import path the diff itself leaves ambiguous.

### What this diff claims to be

A new MongoDB-backed rule family `rule_bonus_success` (roll-time "+N successes when X" rules, a new
addition to an existing multi-family rules-engine catalogue). A pure evaluator
(`bonus-success-evaluator.js`) resolves which rules fire for a character+roll-context and folds them
into a `{rolled, bonus, total}` result via `resolveSuccesses`/`addBonusSuccesses` in `shared/dice.js`.
Two live dice surfaces (`roll-v2.js`, the app's sole player/ST dice roller; `feeding-tab.js`) now use
`total` instead of the old rolled-only count for their headline success count, while keeping the old
rolled-only primitive (`cntSuc`) at two call sites that must stay rolled-only: a rote "which pool's
dice came up better" comparison, and dramatic-failure detection. The v1 seed enables exactly one rule,
gated on a fighting-style manoeuvre the character must have explicitly picked (a flat array-membership
check), not merely on having dots in the related style.

**That is the shape it claims. Do not trust the shape — verify it.**

### What to hunt for

1. `resolveBonusSuccesses`'s failed-roll gate reads `rollContext?.rolledSuccesses` through a private
   `_int()` helper. Confirm `_int` genuinely returns `0` — never `NaN`, never a truthy coercion of a
   malformed string, never a negative sneaking through — for every falsy/missing/malformed input,
   since the entire "never rescue a failure" guarantee rests on this one comparison (`rolled < 1`).
2. The `merit_present` predicate match computes a minimum rating via
   `Number.isInteger(pred.min_rating) && pred.min_rating > 0 ? pred.min_rating : 1`. Trace what
   happens if a stored rule doc somehow has `min_rating: 0` — does it silently become `1` ("rating ≥
   1") rather than "any positive rating", and is that actually reachable given the diff's own schema
   constraints elsewhere in the change?
3. The amount-calculation function's `'rating'` branch checks `rule.predicate.kind === 'merit_present'`
   but then reads `rule.predicate.name` directly to look up the merit. Confirm there's no path where
   `also_requires` could smuggle in a *different* merit and the rating ends up read from the wrong
   one.
4. In `roll-v2.js`, a bonus-context object is captured once, synchronously, at the very top of the
   roll function, explicitly to avoid a stale-read race across an `await` a few lines later. Confirm
   every later read of pool-related state in the same function is actually consistent with that
   captured snapshot — trace whether anything downstream re-reads live state instead of the snapshot
   in a way that could diverge from it.
5. In `roll-v2.js`'s contested-roll branch, the attacker's rolled-plus-bonus total is compared against
   the defender's rolled-only count (via the old primitive). Is this asymmetry actually documented
   anywhere in the diff itself (a comment, a naming choice), or does it read as an unexplained,
   unbalanced comparison?
6. `feeding-tab.js` gains a new helper that computes "best attribute/skill for this pool", and it is
   called from two different places in the same file. Confirm both call sites are guaranteed to return
   identical trait selections for the same inputs — no ordering or hidden-state dependency that could
   make them diverge.
7. The breakdown-formatting function returns an empty string when there's nothing to show. Confirm
   every call site that appends it treats the empty string as "render nothing" rather than leaving a
   stray separator or an empty tag in the output.
8. Self-contradiction check: a comment in the new schema file says a structural check is "enforced in
   the route's postCheck ... rather than with an if/then/else". Confirm that check is actually wired
   into the router's request-handling path in the diff — not just defined and exported unused.
9. Dead code / unused imports: `dice.js` gains two new imports. Confirm both are actually used within
   the file in the diff, and that nothing else in the diff creates an unused re-export chain.
10. Assertions/checks whose PASS condition is trivially satisfiable, error paths and unhandled
    rejections, resource cleanup on a thrown path (not just the happy path), and any other dead code
    or unreachable branch you notice while reading — flag anything you cannot judge without more
    context as "worth checking" rather than asserting it as broken.

**STOP. Write your Pass 1 findings to `specs/stories/code-review/dtlt-1-codex-findings-pass1.md` now.**

---

## Output

Write everything to `specs/stories/code-review/dtlt-1-codex-findings-pass1.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged `[Pass 1]`. Write `- None found.` under any empty heading
rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened, and confirmation you stayed within the diff (did not open the story spec or
  explore beyond resolving an ambiguous import).
- Every command you ran, with its real result, including the gate commands above.
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
