# Adversarial review — dtlt-1 (Bonus-success mechanic — Stronger Than You), TM Game — PASS 3 of 3 (isolated)

You are reviewing a completed change in a repo you have full access to. This is the one pass that
DOES get the author's own account — your job is to check that account against reality, not to grade
it kindly.

This is an **isolated single-pass file** — one of three independent Codex sessions reviewing the same
change from different angles (Blind Hunter / Edge Case Hunter / Acceptance Auditor). You are the
**Acceptance Auditor**. You will not see the other two passes' output, and they will not see yours.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at `specs/stories/code-review/dtlt-1-diff.txt`
  (relative to repo root), taken against base commit `0299d515`.
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
  real numbers even if they disagree with anything the story or its Dev Agent Record claims —
  especially then.

---

## PASS 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order. **The order is the highest-value instruction in this whole document.**

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/dtlt.1.bonus-success-mechanic.story.md` — the **Intent**, **Boundaries &
   Constraints**, **I/O & Edge-Case Matrix**, **Code Map**, and **Tasks & Acceptance** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** It runs from a `## Dev Agent Record` heading
   down to (not including) `## File List`. Skip past it entirely for now. Reading the author's own
   record first anchors you on their framing and turns a review into grading homework.
3. Against the acceptance criteria, check the diff and the real code it touches for:
   - Violations of an AC's literal wording. Read the words, not the surrounding narrative — an AC's
     exception is exactly as narrow as it is written.
   - Deviations from stated intent. The "Never" list under Boundaries & Constraints is equally
     load-bearing — check the change did not quietly do an excluded thing (e.g. modifying `cntSuc`
     itself, running the new evaluator inside a character-render pass, touching Vigour/Resilience).
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on.**

Explicitly NOT in scope, and deliberate — do not flag these as gaps, they are settled decisions, not
oversights:

- Players cannot currently reach any rules-engine endpoint at all (an existing ST-only auth gate
  across every rule family in the catalogue, not introduced by this change) — the new mechanic is
  ST/dev-only in practice until that separate, pre-existing auth-boundary question is resolved. This
  is a known, documented, accepted degradation elsewhere in the codebase, not a defect of this diff.
- Two other dice-adjacent modules in the repo are deliberately left untouched because both are
  currently unrouted/unreachable in the live app.
- There is no admin editor UI for the new rule collection — explicitly deferred to a follow-up story;
  a new rule ships via a direct database write or a raw API call for now.
- The seed script has not been run against the live database — a live-database write reserved for the
  human operator, not the author, per this project's own standing convention. Do not flag the
  collection being empty in production as a bug.
- Four dice-related surfaces the original story spec named no longer exist anywhere in this
  repository's working tree. Verify this yourself (it is easy to check) rather than either trusting or
  doubting it blind.
- In a contested roll, the resisting character's own roll stays rolled-only (no bonus-success
  resolution applied to the defender's side) — a deliberate scope boundary because that code path
  lacks the resisting character's own pool context (attribute/skill/discipline/spec), not an
  oversight. Do not flag the asymmetry itself as a bug; DO flag it if you find the asymmetry is
  undocumented in the code (no comment explaining it) or if you find it produces an outcome that
  contradicts the game's own dice-resolution rules in a way that matters (e.g. the attacker's number
  is used somewhere it should not be).

### Pass 3b — now read the author's record and check it against reality

5. Now read the **Dev Agent Record** section of the story spec in full. It makes several specific,
   checkable claims — among them:
   - Exact test counts and pass/fail results for each named suite (`bonus-success`: 40/40,
     `rule_engine_grep`: 2/2, `rule_engine_effective_contract`: 11/11 with a 6-pre-existing/5-new
     split, `api-rules-engine`: +10, `api-rules-aggregate`: +1).
   - A regression sweep claiming specific pass/fail/skip counts, and a claim that the failures are
     "byte-identical at base" via a `git stash` A/B comparison.
   - A claim that a specific existing rolled-only comparison function (`cntSuc`) was never modified.
   - A claim that a specific rote-comparison call site stays rolled-only while a specific
     roll-resolution call site switches to the new total-including-bonus helper.
   - A claim that Vigour/Resilience and their existing seed data were left completely untouched.
   - A claim about where the new schema file lives, justified by "every one of the eight existing rule
     schemas" following the same naming convention.
   - A specific, quoted live-DOM verification string from a (now-deleted) throwaway browser script,
     claimed to demonstrate the real breakdown display working end-to-end.
   - A claim that a literal reading of one of the story's own Execution tasks (a "cyclic-reference
     check") would reject the story's own v1 seed and its own first acceptance criterion, and that the
     author therefore implemented two different structural guards instead.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now. Re-run
   the `git stash` A/B comparison yourself rather than trusting the reported numbers — stash the
   working tree's relevant changes, run the regression suites, note the result, pop the stash, run
   again, and compare. Grep and diff the actual files yourself for every code-shape claim.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. This is the single highest-value
   thing this pass can find. A record's own "confirmed", "verified" or "resolved" label can itself be
   wrong — re-examine each one rather than inheriting it. In particular: independently check whether
   the "cyclic-reference check" reasoning is actually correct — read the referenced architecture
   decision record yourself (it's cited by path in the story's frontmatter) rather than trusting the
   Dev Agent Record's paraphrase of what it says.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem.

**STOP. Write your Pass 3 findings to `specs/stories/code-review/dtlt-1-codex-findings-pass3.md` now.**

---

## Output

Write everything to `specs/stories/code-review/dtlt-1-codex-findings-pass3.md`, grouped `## High` /
`## Medium` / `## Low`, each finding tagged `[Pass 3a]` or `[Pass 3b]`. Write `- None found.` under
any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in each sub-pass, and confirmation you did not read the Dev Agent Record
  before finishing Pass 3a.
- Every command you ran, with its real result, including the gate commands above and your own
  independent `git stash` A/B re-run.
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
