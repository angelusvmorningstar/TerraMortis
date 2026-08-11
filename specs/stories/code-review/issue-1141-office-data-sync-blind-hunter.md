# Blind Hunter — issue-1141-office-data-sync

You are reviewing a diff with **no other context**. You do not have the spec, the story, the commit
history, or any conversation that produced this change. Judge the diff purely on its own merits: does
this code, as written, do what it appears to intend, correctly, without introducing defects?

**Do not read anything outside the diff below.** Do not explore the repository. Do not look up the spec
or story file even if you can find one. That is deliberate — this layer exists to catch what a
context-free read of the code itself reveals, uncontaminated by the author's own framing of what the
change is "supposed" to do.

## The diff

The complete diff is at:

`D:\Terra Mortis\TM Suite\specs\stories\code-review\issue-1141-office-data-sync-diff.txt`

It covers three files: one modified (`public/js/tabs/office-data.js`), two new
(`server/tests/issue-1141-office-data-sync.test.js`, a Vitest test file, and
`specs/stories/issue-1141-office-data-sync.story.md`, a specification document — read it as context for
what the change claims to do, but audit it with the same scepticism as the code, not as ground truth).

## What to hunt for

- Correctness bugs in the modified data or the new test file: wrong values, mismatched pairs, typos that
  change meaning, off-by-one or ordering errors, a test that doesn't actually test what its name claims.
- Internal inconsistency: does the story's own stated rationale contradict what the diff actually does?
- Test quality: does every assertion in the new test file actually exercise something real, or are any
  vacuous (e.g. asserting a tautology, or asserting on a value the code being tested cannot actually
  produce wrong)?
- Anything a careless reviewer would wave through but a hostile one would flag: silent behaviour changes,
  a claim of "unchanged" that the diff itself contradicts, a rename that misses a reference.

## Ground rules

- You may read and run things freely within `D:\Terra Mortis\TM Suite` to verify a suspicion (e.g. run
  the new test file, or grep for a symbol) — but the diff above is your primary and required evidence
  source, not the spec.
- **Do not modify, commit, or push anything in this repository.**
- **Never touch any sibling repository.** This is an umbrella workspace at `D:\Terra Mortis\`; TM Wiki,
  TM Cockpit and TM Herald are adjacent, independent repos with their own git history. Stay inside
  `D:\Terra Mortis\TM Suite` only.
- If you temporarily edit a file to prove a test does or does not discriminate (e.g. reverting one line
  to confirm a test fails without the fix), you must restore the file to its exact original state
  afterward, confirm the restore (e.g. `git diff` showing no changes), and say explicitly in your output
  that you did this and that the restore is confirmed.

## Output format

A Markdown list. For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **Location**: `file:line`
- **Triggering input or sequence**: the concrete input, state, or sequence of calls that exposes the
  problem
- **Observable consequence**: what actually goes wrong — a wrong value shown to a player, a test that
  passes when it shouldn't, etc. Not "this could theoretically be a problem" — state the concrete failure.
- **Confidence**: how sure you are, and why

If you find nothing, say so plainly rather than manufacturing a finding.
