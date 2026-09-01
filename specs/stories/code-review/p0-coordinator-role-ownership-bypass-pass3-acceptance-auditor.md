# Adversarial review — Pass 3 of 3 (ACCEPTANCE AUDITOR) — p0-coordinator-role-ownership-bypass, TM Game

You are reviewing a completed change in a repo you have full access to. You have NONE of the
conversation in which it was written, which is the point: you are here to catch what the author
could not catch about their own work.

This is pass **3 of 3**, pasted to you in isolation. You will not see the other two passes.

## A note on this pass's shape

This change did NOT go through this project's normal story pipeline (no `bmad-create-story`, no
pre-written Acceptance Criteria document). It originated from a security audit and was implemented
and self-documented directly. There is therefore no clean "spec written before the code, read blind
before the author's own account" split to enforce here — the closest thing to acceptance criteria
IS the author's own contemporaneous account, written into the project's tracking files at commit
time. Treat that account as a set of specific, falsifiable claims to audit against the real diff and
the real repo, not as ground truth to accept. This is intentionally a more skeptical read than a
normal Pass 3, since there is no independent pre-commitment to check the implementation against.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Game`. The diff is at
  `specs/stories/code-review/p0-coordinator-role-ownership-bypass-diff.txt`, relative to that root,
  taken against base commit `e99b6c13` (full commit: `1b241614`, `git diff e99b6c13..1b241614 --
  server/`).
- This checkout is one of four sibling repos in an umbrella workspace at `D:\Terra Mortis\`. Do not
  read or touch `TM Story`, `TM Herald`, `TM Admin`, or `TM Design System`.
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time —
  this pass in particular is about running things, not reading them.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) **is allowed and encouraged** — you MUST restore it exactly, confirm
  the restore with `git diff`, and say so in your output.
- Environment hazards: `server/.env` in this checkout points at the **live production** MongoDB
  Atlas database — do NOT start the server (`node index.js` / `npm run dev`) against it. Vitest is
  safe — its setup file forces every suite onto `tm_game_test`, never live data. Some suites need a
  local `mongod` and **skip rather than fail** without one — a skipped suite is not a passing suite;
  if you see skips, report the real pass/skip/fail breakdown, not just "green".
- Blast radius: the two new test suites this diff adds are the ONLY regression coverage that would
  catch a future re-introduction of this bug class. If either has a gap, that gap is durable, not
  one-off.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly.
- Report exact gate numbers from real runs, even where they disagree with the claims below —
  especially then.

---

## Step 1 — Read the author's own claimed scope

Read these two things in full, and nothing else yet:

1. The new entry in `specs/stories/deferred-work.md`, under the heading starting
   `## Deferred from: 2026-09-01/02 general-audit day` — specifically the first bullet, which begins
   `**(RESOLVED 2026-09-02, branch \`ms/p0-coordinator-role-ownership-bypass\`...`.
2. The `last_updated:` header at the top of `specs/stories/sprint-status.yaml` (the entry dated
   2026-09-02, beginning "P0 security fix day...").

These two documents make a specific, checkable set of claims. Extract them before going further:

- Exactly which files/routes were fixed, and what the claimed bug was in each.
- Two claimed *additional* bugs found beyond the original audit's own finding
  (`middleware/ordeal-retirement.js`'s shared gate, and `routes/characters.js`'s `GET /:id`) —
  specific reasoning is given for each; note it.
- One deliberate exclusion: `attendance.js`'s look-alike check, left untouched on the stated
  reasoning that broad coordinator access there is the coordinator role's own job (check-in), not a
  bug.
- A specific test claim: "209 tests across 15 files (zero regressions)", split into a new static
  source-scan suite plus a new HTTP-level suite, plus regression guards for ST and
  "coordinator-on-their-own-data".
- The explicit statement that this was **not committed** as of the sprint-status entry (it since has
  been — see Step 3).

## Step 2 — Audit the diff against those claims

Now read the real diff and the real files it touches. For every claim extracted in Step 1:

- Does the diff actually do what it claims, file by file, route by route? Read the words of the
  claim literally — if it says "GET+PUT" for `downtime.js`, check both, not just one.
- Is the `attendance.js` exclusion actually deliberate and reasoned, or does `attendance.js` contain
  the exact same `role === 'player'` (or `!== 'player'`) anti-pattern gating something that is NOT
  obviously coordinator-appropriate (i.e. is the given reasoning actually sound, or just asserted)?
  Read `server/routes/attendance.js`'s real check yourself and form an independent judgement.
- Is there anything the diff does that the claims do NOT mention (an undisclosed change, a side
  effect, a file touched with no corresponding claim)?
- Is there anything the claims assert was fixed that, reading the actual diff hunk, was NOT actually
  changed (a claim about a file that turns out to have no corresponding hunk, or a hunk that doesn't
  match the described defect)?

## Step 3 — Verify the test and commit claims by running them, not reading them

1. `cd server` then run the two new suites exactly:
   `npx vitest run tests/p0-coordinator-role-ownership-bypass.test.js tests/p0-coordinator-role-ownership-bypass-http.test.js`
   — report the real pass count. Does it match "23 passed" (the two files' combined total as counted
   by a prior run in this project)?
2. Run the wider regression set the change touches — every test file under `server/tests/` whose
   name contains any of: `characters`, `downtime`, `history`, `ordeal`, `questionnaire`,
   `game-session`. List the files you ran and the real pass/fail/skip count for each. Does the total
   match "zero regressions"? If any file skips (missing `mongod`), say so explicitly rather than
   counting it as passing.
3. `git log --oneline -1` and `git show --stat HEAD` (or the equivalent for commit `1b241614`) —
   confirm the commit message's own claims (which files, which counts) match what you just measured,
   not what the commit message asserts.
4. `git status --short` at repo root — confirm the working tree is clean of anything this diff should
   have committed but didn't (the sprint-status/deferred-work entries you read in Step 1 ARE expected
   to be part of the real commit even though they're excluded from the diff file you were given —
   confirm with `git show --stat 1b241614` that they're actually in it, not left uncommitted).

## Step 4 — Judgement

State plainly whether you believe this change is ready to ship as-is (i.e., safe to push and open a
PR for review), needs patches first, or has a blocking problem. Be specific about which claim, if
any, didn't hold up.

**STOP. Write your Pass 3 findings now.**

## Output

Write everything to
`specs/stories/code-review/p0-coordinator-role-ownership-bypass-pass3-findings.md`,
grouped `## High` / `## Medium` / `## Low`, each finding tagged `[Pass 3]`. Write `- None found.`
under any empty heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened.
- Every command you ran, with its real result (this pass should have the most commands of the
  three).
- Anything you could not run, and why. Name it specifically.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
