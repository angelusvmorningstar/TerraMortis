# Adversarial review — oaq-2-pending-status-actions-accept-decline (Pending Status Actions — submit, ST accept/decline), TM Suite

You are reviewing a completed change in a repo you have full access to.

**This is Pass 3 of 3 (Acceptance Auditor).** Unlike Pass 1/2, you DO get the spec — that is this
pass's whole point.

## Ground rules

- Repo root: `D:\Terra Mortis\TM Suite`. The diff is at
  `specs/stories/code-review/oaq-2-diff.txt`, taken against base commit `ed181d8f`.
- **Read and run freely.** Running the code beats reasoning about it.
- **Do NOT modify, commit, or push anything.** Do not touch sibling repos even to read.
- Temporarily editing a file to prove something is allowed — restore it exactly, verify via
  `git diff`.
- Environment: real `MONGODB_URI` is a 3-node Atlas replica set — transactions genuinely work.
  `fileParallelism: false`. Full suite has 5 known-unrelated pre-existing failures across 10 files
  (documented in the story's own Dev Agent Record, which you will read below).

## Honesty requirements (outrank completeness)

- Say plainly what you could not run.
- Say explicitly when a pass/severity found nothing.
- Report exact gate numbers:
  `cd server && npx vitest run tests/oaq-2-pending-status-actions.test.js tests/issue-1143-office-actions-auth-safety.test.js tests/issue-1143-db-setup-skip.test.js tests/otc-2-office-actions-api.test.js tests/feature.691.hos-city-status-power.test.js`.

---

## PASS 3 — ACCEPTANCE AUDITOR (the diff, plus the spec)

Two sub-passes, in this order — **the order is the highest-value instruction here.**

### Pass 3a — form findings BEFORE reading the author's own account

1. Read `specs/stories/oaq-2-pending-status-actions-accept-decline.md` — the **Story**, **Decisions
   already made**, **What this story is NOT**, **Acceptance Criteria**, **Tasks/Subtasks**, and
   **Dev Notes** sections ONLY.
2. **Do NOT read the "Dev Agent Record" or "Senior Developer Review" sections yet.**
3. Against the acceptance criteria (AC1–AC9), check the diff at
   `specs/stories/code-review/oaq-2-diff.txt` and the real code it touches for:
   - Violations of an AC's **literal wording**.
   - Deviations from stated intent — **"What this story is NOT" and "Decisions already made" are
     equally load-bearing.** In particular: does the implementation genuinely spend budget ONLY on
     approval, never on submission, EVERYWHERE (not just in the obvious code path)? Does it
     genuinely avoid building any part of the ST approval QUEUE UI (oaq.3's job, explicitly out of
     scope)?
   - Specified behaviour that is missing, or present only in appearance.
   - Contradictions between a stated constraint and the actual code — e.g. AC5 says accept
     "re-reads the target live, re-validates the action's precondition against the CURRENT status
     (not the value stored at submission time)" — verify the pending record genuinely does NOT
     store `old_status`/`new_status` at submission (per the story's own Task 1 note that storing
     them "invites exactly the bug it's meant to prevent") — check the actual insert in `POST /`.
4. **Write your Pass 3a findings down now, before moving on.**

**Settled decisions — do not re-litigate:**

- Budget spends ONLY on approval, no refund logic — Angelus's explicit call, restated in the
  story. Do not flag "there's no refund path" as a gap; there's nothing to refund by design.
- `contested_roll_requests` is reused rather than a new collection — per oaq.1's data-lock
  findings (a separate, already-committed story). Do not re-litigate this architectural choice.
- `old_status`/`new_status` recomputed fresh at accept, never trusted from submission — deliberate,
  matches AC5.
- The ST approval queue UI (oaq.3), Epic OXP's XP-spend routing, and Epic ROLLS are explicitly
  out of scope. Do not flag their absence.
- The Dev Agent Record documents a deliberate DEVIATION: `contested_roll_request.schema.js` was
  NOT touched (verified the AJV `validate()` middleware only applies to `contested-rolls.js`'s own
  route, never to the server-constructed status-action documents). You MAY independently verify
  this claim is actually true (it's exactly the kind of checkable claim Pass 3b should test), but
  don't treat "the schema wasn't updated" as an unexamined gap on its own — the record says why.

### Pass 3b — now read the author's record and check it against reality

5. Read the **Dev Agent Record** in full. Checkable claims include:
   - "Changed-area suite (10 files): 176/176 pass" — run it yourself.
   - "Full suite... 2400/2405 passed, 5 failed/10 files failed... byte-identical to the established
     pre-existing baseline... No new failures" — spot-check at least the three named
     assertion-level failures (`oath-a-pledge-helpers.test.js`, `n7-n9-allocator-readers.test.js`,
     `epic.708.3-cycle-phase-controls.test.js`) and confirm they're unrelated to this diff (grep
     each for `office-actions`, `contested-roll`, `office-tab`, `db.js`, `index.js`).
   - The claim that `validate()` only applies a schema to its own attached route (the
     schema-deviation justification) — verify by reading `server/middleware/validate.js` and how
     it's wired in both `contested-rolls.js` and `office-actions.js`.
   - AC5's live-reproduction claim (actor A and B both submit `grant_first` on one target,
     accepting A then B — B's accept correctly fails 400 and stays `pending`, not resolved) —
     reproduce it yourself.
   - AC8's live-reproduction claim (two concurrent accepts on the same pending record, exactly one
     succeeds) — reproduce it yourself, run it a few times to check for flakiness.
   - The claim that `oaq-2-pending-status-actions.test.js`'s 11 tests were prove-discriminated as a
     set (8/11 failed against the pre-oaq.2 route) — you don't need to literally revert the route
     to re-verify this specific historical claim, but DO independently assess: do these 11 tests,
     read on their own merits right now, actually test what their names claim?
6. **Verify each claim by running it, not reading it.**
7. Flag anything **FALSE, OVERSTATED, or UNVERIFIABLE-AS-STATED**.
8. State plainly whether this change is ready to ship, needs patches, or has a blocking problem.

---

## Output

Write everything to `specs/stories/code-review/oaq-2-acceptance-auditor-findings.md`, grouped
`## High` / `## Medium` / `## Low`, tagged `[Pass 3a]`/`[Pass 3b]`. `- None found.` for empty
headings.

Same finding shape as Pass 1/2. Close with **Validation notes**: files opened in each sub-pass,
confirmation you didn't read the Dev Agent Record before finishing Pass 3a, every command run with
real results, anything you could not run and why, confirmation nothing was left modified.
