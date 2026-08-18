# Adversarial review — otc-2-status-actions-server-hardening (Status Actions server hardening), TM Suite

## PASS 3 of 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

You have full read access to `D:\Terra Mortis\TM Suite`, including the story spec. Two sub-passes,
in this order. **The order is the highest-value instruction in this file.** This is pass 3 of 3,
run independently of the two earlier passes — do not read their files.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/otc-2-diff.txt`, relative to that root, taken against base commit
  `9bdd8ad0`.
- The diff is scoped to source and tooling only — the spec and `sprint-status.yaml` are
  deliberately excluded from the diff file itself; you will read the real spec directly below.
- This repo sits inside an umbrella workspace (`D:\Terra Mortis`) with sibling repos `TM Wiki`,
  `TM Cockpit`, `TM Herald`. **Do not read or touch anything outside `D:\Terra Mortis\TM Suite`.**
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.
- **MongoDB connectivity is a known hazard in this environment**, and it is directly relevant to
  this pass specifically: the author's Dev Agent Record claims the new integration test file could
  not be executed because MongoDB was unreachable (Atlas hung indefinitely; local `mongod` gave a
  fast `ECONNRESET` because `server/db.js` hardcodes `tls: true`). **You should attempt to run it
  yourself and report your own real result** — if you succeed where the author could not, that is
  the single most valuable thing this review can produce, since it would let the story actually
  close. If you also cannot reach MongoDB, disclose that plainly rather than silently skipping.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly rather than omitting the section.
- Report the exact current gate numbers you observe, including both new test files and the full
  13-file changed-area regression list the story's own Task 5 names. Report real numbers even if
  they disagree with the story's claims — especially then.

---

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/otc-2-status-actions-server-hardening.md` — the **Story**, **Acceptance
   Criteria**, **What this story is NOT**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely — that is Pass 3b.
   Reading it first anchors you on the author's framing and turns this into grading homework instead
   of an audit.
3. Against the 7 acceptance criteria, check the diff (`specs/stories/code-review/otc-2-diff.txt`)
   and the real code it touches for:
   - Violations of an AC's **literal wording**. Read the words, not the surrounding narrative.
     AC3 says the gate applies to "any raise/lower/grant_first/strip_last submission" — verify this
     literally, for all four, not just the two paid types.
   - Deviations from stated intent. **The "What this story is NOT" section is equally load-bearing**
     — in particular it explicitly excludes changing the budget FORMULA (only its enforcement) and
     excludes touching `GET /latest_session`'s `game_sessions`-based grouping. Check the change did
     not quietly do either excluded thing.
   - Specified behaviour that is missing, or present only in appearance (e.g. AC4's requirement
     that the panel "does not let a player submit an action the server will reject" — is this
     actually enforced in `office-tab.js`, or only the messaging changed while the button still
     fires?).
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on to Pass 3b.**

**Settled decisions — do not re-litigate these, they are deliberate:**
- The budget-check formula itself (which merits/bonuses count toward effective City Status) is
  unchanged by design; only where it's computed and enforced changed.
- `GET /latest_session` and its `game_sessions`-based grouping are explicitly out of scope and
  intentionally untouched.
- The ST approval queue (a separate future epic, "OAQ") is explicitly out of scope — Status Actions
  still apply immediately on submission after this story.
- Extending the phase gate to office powers other than Status Actions is explicitly out of scope.

### Pass 3b — now read the author's record and check it against reality

5. Now read the **Dev Agent Record** section in full (same file). It makes specific, checkable
   claims — attack these particularly hard:
   - "10/10" new unit tests passing (`server/tests/otc-2-city-status-calc.test.js`).
   - "200/200 across 13 files" for the full changed-area regression — the record names all 13 file
     paths in Task 5; re-run that exact list yourself.
   - Two named pre-existing failures (`issue-836-legacy-tracker-cache-removed.test.js`,
     `n8-mandragora-prereq.test.js`) "confirmed via `git stash`... identical on the unmodified
     base" — this is a specific, reproducible claim; reproduce it yourself if you have time, or at
     minimum confirm both files still fail identically against the CURRENT tree (not necessarily
     the stashed base) as a sanity check.
   - The claim that `helpers.js` is server-import-safe because `auth/discord.js` "guards `location`
     with a `typeof location === 'undefined'` check at line 9" — open that exact file and line and
     verify the claim precisely, don't take it on trust.
   - The claim that `getGamePhaseCycle()` in `db.js` "previously had zero callers anywhere in the
     app" — grep for this yourself; if it's wrong, that's worth flagging even though it doesn't
     affect correctness, since it shapes how believable the rest of the record's research claims are.
   - The integration test suite (`server/tests/otc-2-office-actions-api.test.js`, 6 tests) is
     recorded as "written but UNEXECUTED... CANNOT BE EXECUTED IN THIS SESSION" — per the Ground
     Rules above, actually attempt this yourself and report your real result. This is the single
     highest-value thing this pass can produce.
6. **Verify each claim by running it, not by reading it.** Run the suites yourself, right now.
   Grep the files yourself. If a first run is inconsistent, run it twice and say so.
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**. A record's own "confirmed" or
   "verified" label can itself be wrong — re-examine each one rather than inheriting it.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem — and explicitly address whether the still-open integration-test question
   (executed by you or not) should block a `done` status.

**STOP. Write your Pass 3 findings to `specs/stories/code-review/otc-2-codex-findings.md` now.**

## Output (append this pass's findings, do not overwrite Pass 1 or Pass 2's)

Append to `specs/stories/code-review/otc-2-codex-findings.md`, under a `## Pass 3 — Acceptance
Auditor` heading, with `### 3a` and `### 3b` subsections, each grouped `#### High` / `#### Medium` /
`#### Low`, each finding tagged `[Pass 3a]` or `[Pass 3b]`. Write `- None found.` under any empty
heading rather than dropping it.

For each finding:

- **One-line title**
- **Severity**: High / Medium / Low
- **File:line**
- **The triggering input or sequence** — be concrete about what reaches it
- **The observable consequence** — what actually goes wrong, for whom
- **Confidence**: how sure you are this is real and not a misread

Close with a **Validation notes** section stating:

- Which files you opened in 3a vs 3b, and confirmation you did not read the Dev Agent Record
  before finishing 3a.
- Every command you ran, with its real result, including the full 13-file regression list and
  BOTH new test files — state explicitly whether you could reach MongoDB and run
  `otc-2-office-actions-api.test.js`, and its real pass/fail result if you could.
- Anything you could not run, and why.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
- Your overall ship/patch/blocked verdict from step 8 above.
