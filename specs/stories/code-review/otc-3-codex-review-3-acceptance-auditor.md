# Adversarial review — otc-3-office-tab-browsable-reference (Office tab browsable reference mode), TM Suite

## PASS 3 of 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

You have full read access to `D:\Terra Mortis\TM Suite`, including the story spec. Two sub-passes,
in this order. **The order is the highest-value instruction in this file.** This is pass 3 of 3,
run independently of the two earlier passes — do not read their files.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/otc-3-diff.txt`, relative to that root, taken against base commit
  `284882ca`.
- The diff is scoped to source and tooling only — the spec and `sprint-status.yaml` are
  deliberately excluded from the diff file itself; you will read the real spec directly below.
- This repo sits inside an umbrella workspace (`D:\Terra Mortis`) with sibling repos `TM Wiki`,
  `TM Cockpit`, `TM Herald`. **Do not read or touch anything outside `D:\Terra Mortis\TM Suite`.**
- **Read and run freely** to verify a claim. Running the code beats reasoning about it every time.
- **Do NOT modify, commit, or push anything.**
- Temporarily editing a file to prove something (revert one line, confirm the check now fails the
  way you expect, restore it) is allowed and encouraged — you MUST restore it exactly, confirm the
  restore with `git diff`, and say so in your output.

## Honesty requirements (these outrank completeness)

- If you could not run something, say so plainly and name what you could not run.
- If you found nothing at a severity, say that explicitly rather than omitting the section.
- Report the exact current gate numbers, including the full 7-file regression list the story's own
  Task 4 references, if you have time to run it:
  `cd server && npx vitest run tests/issue-1141-office-tab-render.test.js tests/feature.691.hos-city-status-power.test.js tests/issue-1141-office-data-sync.test.js tests/otc-3-office-nav-unconditional.test.js tests/otc-2-city-status-calc.test.js tests/otc-2-office-actions-api.test.js tests/cm1-cycle-phase.test.js`.
  Report real numbers even if they disagree with the story's claims — especially then.

---

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/otc-3-office-tab-browsable-reference.md` — the **Story**, **Acceptance
   Criteria**, **What this story is NOT**, and **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" section yet.** Skip past it entirely — that is Pass 3b.
3. Against the 6 acceptance criteria, check the diff (`specs/stories/code-review/otc-3-diff.txt`)
   and the real code it touches for:
   - Violations of an AC's **literal wording**. AC3 says browsing an office you don't hold shows
     "no Status Actions panel, even for Head of State" — verify this literally covers BOTH the
     HTML-shell branch and the `_wireHosActions` wiring call, per the Dev Notes' own explicit
     warning about this being a two-site gate.
   - Deviations from stated intent. **"What this story is NOT" is equally load-bearing** — it
     explicitly excludes any new server route, any purchase-marker UI, and any change to Status
     Actions' own budget/phase logic (that's otc.2's territory). Check the diff did not quietly do
     any of these.
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code.
4. **Write your Pass 3a findings down now, before moving on to Pass 3b.**

**Settled decisions — do not re-litigate these, they are deliberate:**
- `OFFICE_DATA` is confirmed (by this story's own research) to be a zero-import static module
  already shipped to every client regardless of tab visibility — there is deliberately no new
  server-side scoping/route in this diff, and that is not a gap to flag.
- Purchase markers and the "Office Merits" sheet section are explicitly out of scope (Epic OXP).
- otc.2's Status Actions budget/phase-gate logic is explicitly unchanged and out of scope here —
  only WHO gets to see the panel changed, not how the panel itself works once shown.

### Pass 3b — now read the author's record and check it against reality

5. Now read the **Dev Agent Record** section in full (same file). It makes specific, checkable
   claims — attack these particularly hard:
   - A regression was allegedly caught and fixed DURING this story: "`_wireCategoryPicker` calling
     `el.querySelector` unconditionally broke every existing test using this file's plain-object
     `el` mock." Verify this claim by temporarily reverting the guard clause it says was added
     (`typeof el.querySelector !== 'function'`) and re-running the test suite — confirm it fails
     exactly as described, then restore and confirm green again. This is the single highest-value
     verification this pass can do.
   - "147/147 across 7 files" — re-run the exact list and confirm.
   - The claim that a real Node render check was performed proving picker/banner/manoeuvre content
     for a cross-category browse — this is a one-off, unrepeatable manual check; note whether it's
     backed by an equivalent COMMITTED test (it should be, per the story's own Task 4).
6. **Verify each claim by running it, not by reading it.**
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**.
8. State plainly whether you believe this change is ready to ship as-is, needs patches, or has a
   blocking problem — explicitly address whether the AC3 two-site boundary is genuinely,
   verifiably closed or only appears closed.

**STOP. Write your Pass 3 findings to `specs/stories/code-review/otc-3-codex-findings.md` now.**

## Output (append this pass's findings, do not overwrite Pass 1 or Pass 2's)

Append to `specs/stories/code-review/otc-3-codex-findings.md`, under a `## Pass 3 — Acceptance
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
- Every command you ran, with its real result.
- Anything you could not run, and why.
- Confirmation that you modified nothing, or that anything you touched was restored and verified
  (`git status --short` clean of unintended change).
- Your overall ship/patch/blocked verdict from step 8 above.
