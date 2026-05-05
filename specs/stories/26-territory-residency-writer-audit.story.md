---
id: issue-26
issue: 26
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/26
branch: issue-26-territory-residency-writer-audit
status: ready-for-review
priority: low
depends_on: ['issue-3-territory-fk-adr', 'issue-3c']
parent: null
---

# Story #26: Audit — identify writer of `territory_residency` documents

As an architect tracking which write paths exist for each Mongo collection,
I should know how four pre-existing `territory_residency` documents got there,
So that the territory FK refactor's audit trail closes cleanly and any residual writer that uses the legacy shape is caught before it can land bad data on the new contract.

This is **investigation only**. No code change unless a writer is found and the user explicitly authorises a follow-on fix issue. Permitted under the architectural-reset freeze as audit-finding work.

---

## Context

Issue #3's α design phase (ADR-002) reported `territory_residency.count = 0`. The #3c migration discovered **4 documents** dated `2026-04-04T05:24:24Z` (Academy 3 residents, Harbour 7, Second City 4, North Shore 6). Ma'at's #3c QA confirmed the docs are pre-existing data, not post-ADR writes. The ADR's "no API consumers" claim was incomplete: `public/js/tabs/downtime-form.js:1311-1317` does call `apiGet('/api/territory-residency')`, but the result `residencyByTerritory` is set and never read — dead code on the read side.

That leaves the **write side** unidentified. Q5 user decision MIGRATE preserved the collection through #3b/#3c; the docs are now in the new `territory_id` shape post-PR #25 apply. But if there's still an active writer somewhere (server route called by someone, one-shot script that didn't get cleaned up, manual mongo session, hidden client path), it might keep writing to the *old* shape until found and corrected.

**Best-case outcome of this audit:** the writes were a one-shot import in early April, no active writer exists, the dead-code consumer in `downtime-form.js` is the only remaining trace. Close #26 informationally.

**Worst-case outcome:** an active writer exists, writes legacy `territory: <name>` shape after every regent action or somesuch, and we need a follow-on fix to either redirect it to the new shape or remove it entirely.

### Files in scope (read-only)

- `server/routes/territory-residency.js` — current routes (post-#3b update). Already correct shape.
- `server/middleware/auth.js` — confirm no write path here (currently reads only).
- `server/scripts/` — search for any one-shot import or maintenance script that touched `territory_residency`.
- `public/js/` — grep for `apiPut('/api/territory-residency'`, `apiPost(...)`, `fetch(...)`, anywhere outside the known dead consumer in `downtime-form.js:1311-1317`.
- `git log --all --diff-filter=A --name-only` for any commit that introduced a `territory_residency` write path historically — particularly around 2026-04-04.

### Files in scope (write — only if findings warrant)

- A new audit document: `specs/audits/territory-residency-writer-audit.md` (or similar location consistent with existing audit conventions in `specs/`). This is the deliverable.

### Files NOT in scope

- **Any code change.** This is audit-only. If a writer is found, the fix is filed as a separate issue.
- **The dead client block at `downtime-form.js:73, 1311-1317`.** Already carved out per Q5 as a separate cleanup story; out of scope here too.
- **Active live MongoDB writes.** Read-only probes are fine; no `--apply` operations.

---

## Acceptance Criteria

**Given** the audit completes
**When** a developer reads the deliverable audit document
**Then** they see one of two clear conclusions:
- **Conclusion A — no active writer found.** The 4 documents are explained (one-shot import in April; or via a code path that has since been removed). The audit closes the question. Issue #26 closes as informational.
- **Conclusion B — active writer found.** The writer is identified by file:line, what it writes, and how often. A follow-up issue is filed describing the fix shape (redirect to new contract / remove if dead / etc.). Issue #26 stays open until the fix follow-up is filed and linked.

**Given** the audit document
**When** a reader searches for the search methodology
**Then** they find an explicit list of greps run and git-log queries inspected, so the audit can be re-run later if the conclusion needs verification.

**Given** the audit document
**When** a reader looks for "what would I check first if a new residency doc with the legacy shape appears tomorrow"
**Then** they find a short detection-and-response section: how to identify the writer if a regression slips, and which contact / process owns the fix.

**Given** the live MongoDB probe
**When** Ptah re-counts `territory_residency` documents and inspects their `updated_at` timestamps
**Then** the count is still 4 (or whatever has shifted since #3c apply at 2026-05-05T05:36Z) and `updated_at` values cluster at 2026-04-04 (or the probe surfaces newer docs that change the audit's working hypothesis).

**Given** the audit confirms no active writer
**When** the PR opens
**Then** issue #26 closes via the PR's "Closes #26" keyword on merge to `main` (or manually if merging to `dev` first).

**Given** the audit identifies an active writer
**When** the PR opens
**Then** the audit document remains as the artefact, the follow-up fix issue is referenced in the PR body, and #26 stays OPEN until the fix issue itself resolves.

---

## Implementation Notes

### Audit methodology (Ptah's checklist)

1. **Server write paths.** From `server/`:
   ```bash
   grep -rn "getCollection('territory_residency')" server/
   grep -rn "territory_residency" server/routes/
   grep -rn "territory_residency" server/middleware/
   grep -rn "territory_residency" server/scripts/
   grep -rn "insertOne\|updateOne\|findOneAndUpdate\|insertMany\|deleteOne\|deleteMany" server/routes/territory-residency.js
   ```
   Confirm the only writes are at `routes/territory-residency.js` PUT (which is the correct path).

2. **Client write paths.** From `public/js/`:
   ```bash
   grep -rn "/api/territory-residency" public/js/
   grep -rn "territory_residency" public/js/
   grep -rn "apiPut.*territory-residency\|apiPost.*territory-residency\|apiPatch.*territory-residency" public/js/
   ```
   Confirm the only API call is `apiGet` at `downtime-form.js:1312` (read, not write).

3. **Git log archaeology.** When did the 4 docs get there?
   ```bash
   git log --all --before=2026-04-15 --after=2026-03-25 --oneline --diff-filter=ACDMR --name-only
   git log --all --grep="residency" --oneline
   git log --all -S "territory_residency" --oneline
   ```
   Look for any commit around 2026-04-04 that touched `territory_residency` or could have created the docs.

4. **Server scripts archaeology.** Any historical migration / import / seed?
   ```bash
   grep -rn "territory_residency" server/scripts/
   ```

5. **Live data probe (read-only).** Confirm:
   - Current `territory_residency.count`.
   - Each doc's `updated_at` timestamp.
   - Any doc with `updated_at` newer than the #3c apply timestamp (2026-05-05T05:36:59.155Z) — that would be a smoking-gun signal of an active writer using the new shape (since #3c ran).
   - Any doc still carrying the legacy `territory` field (post-#3c, all should have `territory_id`).

   Use the same dotenv + MongoClient pattern as the cleanup scripts; throwaway probe under `server/scripts/_probe-residency-writer.mjs`, executed once, deleted before commit.

### Hypothesis to evaluate

Per Ma'at's #3c QA finding, the 4 docs are dated 2026-04-04T05:24:24Z — a single second, suggesting one batch operation on one day. The most plausible hypothesis is a **one-shot import script** that ran in early April, possibly during a setup or testing phase, and was never cleaned up. The script is likely under `server/scripts/` (deleted post-run, OR still present but never re-invoked).

If the audit confirms this:
- Document the one-shot script's name (if findable in git log) or note its absence (if deleted).
- Confirm no current code path writes to the collection.
- Close #26 as informational with a note that any *new* residency doc dated post-2026-05-05 would warrant re-investigation.

If the audit *disproves* this:
- Identify the actual writer.
- File a follow-up fix issue.

### Audit deliverable shape

A markdown document, ~1-2 pages, with sections:
1. Background (link to Q7 / ADR-002 / PR #25 / #3c findings)
2. Methodology (the greps + git log queries listed above)
3. Findings (what was found, what wasn't found)
4. Conclusion (A or B; rationale)
5. Detection-and-response (what to do if a new legacy-shape doc appears)
6. References (commits, files, issue links)

### Branch flow

- Branch: `issue-26-territory-residency-writer-audit` off `dev`
- PR target: `dev`. After merge, ensure issue closes (manual close if needed).

---

## Test Plan

This is a documentation deliverable; the "test" is review.

1. **Self-review (Ptah)** — re-read the audit doc. Is the methodology section actionable for re-running the audit in three months? Are the conclusions clearly Conclusion A or Conclusion B (no fence-sitting)?

2. **Editorial review (Ma'at)** — read the audit doc; spot-check the greps; independently corroborate the hypothesis if Conclusion A is reached, or independently confirm the writer if Conclusion B.

3. **No code path verification** — there is no code being committed; only the doc. Skip server-test runs; nothing to break.

---

## Definition of Done

- [ ] Audit doc lives at a sensible path (`specs/audits/territory-residency-writer-audit.md` or similar — Ptah's call) and is committed
- [ ] Methodology section explicit enough to re-run the audit cold
- [ ] Conclusion is A or B unambiguously
- [ ] If Conclusion B: follow-up fix issue filed and referenced in this PR's body
- [ ] If Conclusion A: closing comment ready for issue #26 (informational close)
- [ ] PR opened by `tm-gh-pr-for-branch` into `dev`, body closes #26 (or links to the follow-up if Conclusion B)

---

## Note for Ptah

This is investigation, not implementation. Take the time the audit needs:

1. Run the greps in §Implementation §1-4. If any of them surfaces something other than the known consumer (`downtime-form.js:1311-1317`) and the known route (`server/routes/territory-residency.js`), surface it before continuing.
2. Run the live MongoDB probe (read-only). Capture the count and timestamps.
3. Run the git log archaeology. The 2026-04-04 timestamp is the lead.
4. Write up findings. Don't bury Conclusion A vs. B in prose — make it a banner header in the doc.
5. Single semantic commit with the audit doc + Dev Agent Record on the story.

If you find an active writer, **stop before writing the fix.** SM and user need to scope the fix issue separately.

## Note for Ma'at

Editorial QA on a small audit document. Your value:
1. Independently corroborate one or two of Ptah's grep findings (check that they really return what he said they returned).
2. Read the conclusion section. Is the reasoning solid? Any edge case the audit didn't probe?
3. Is the detection-and-response section actionable for someone investigating a future regression?

Append QA Results commit before PR. Same pattern as previous stories.

---

## Notes

After this PR:
- **Conclusion A path**: issue #26 closes informationally; no further work.
- **Conclusion B path**: a follow-up fix issue exists; it gets a normal SM/DEV/QA cycle when picked up.

Either way, the territory FK refactor's audit trail is now fully closed.

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV / Ptah)

**Files Changed (1):**
- `specs/audits/territory-residency-writer-audit.md` (new, +98) — audit doc with banner Conclusion A header at top; methodology, findings, conclusion, detection-and-response, references sections.

**Conclusion: A — no active writer found.**

**Key finding (smoking gun for the explanation, not the bug):** the historical writer was `public/js/player/regency-tab.js`, introduced 2026-04-02 in commit `b168535` (player Regency tab with 10-slot residency grid saving to `PUT /api/territory-residency`), and removed 2026-04-11 in commit `5128e43` (Fix.39: feeding-rights moved to `territories.feeding_rights` as the canonical store). The 4 documents dated `2026-04-04T05:24:24Z` are residue from interactive regent use during the 9-day window between those two commits.

**Hypothesis evaluated and disproved:** the story's leading hypothesis was "one-shot import script in early April". The grep `grep -rn "territory_residency" server/scripts/` returns only post-#3c artefacts (migrate-territory-fk.js, retire-territory-residency.js, cleanup-territory-id-dupes.js commentary). No historical one-shot script. The writes were interactive, not batch. The single-second timestamp coincidence is consistent with one game-session evening where 4 regents (Academy / Harbour / Second City / North Shore — exactly the four with regent_id) used the new tab.

**Surprises (3):**

1. **The collection has already been retired.** Between #3c (the surprise that prompted #26) and the audit start, commit `fd5dee1` (2026-05-05 17:21, by Peter Kalt) ran `retire-territory-residency.js --apply`, dropped the collection from `tm_suite`, deleted `server/routes/territory-residency.js`, deleted the schema, and removed the dead `apiGet` consumer at `downtime-form.js:1311-1317`. The retirement diverges from the ADR-002 Q5 user decision (MIGRATE) — see commit message rationale: "ZERO character-ID overlap with territories.feeding_rights for the same territory; residents arrays mix character _ids with plain name strings ('Ryan Ambrose', 'Margaret Kane', 'Keeper') — orphaned data, not live duplication. Revival cost from this state is identical to revival from empty."
   
   The audit ran in parallel with the retirement and confirms the retirement was the correct call.

2. **Live probe confirms collection is dropped.** `db.listCollections({ name: 'territory_residency' }).toArray()` returns empty. Production state matches the retirement commit's stated intent.

3. **The dead client consumer at downtime-form.js:1311-1317 was removed by the retirement commit `fd5dee1`** — that's why my grep returned zero matches today. It existed at the time of #3d and the Q5 carve-out, but is gone now.

**Methodology summary:**
- 5 grep passes (server routes/middleware/scripts, client routes, all directory variants)
- 3 git-log archaeology queries (`-S` semantic search on both naming variants, plus date-bracketed log)
- 1 live MongoDB read-only probe (collection existence + cross-collection sanity)
- All five passes recorded inline in the audit doc with their exact commands so re-running is mechanical

**Resisted scope creep:**
- No code change.
- No new fix issue filed (Conclusion A means no fix needed; the historical writer was already removed in Fix.39 / 2026-04-11 and the collection itself is already gone).
- Throwaway probe script `server/scripts/_probe-residency-writer.mjs` was created, run once, deleted before commit. Not in the repo.
- Did not touch the (already-deleted) dead client block per Q5 carve-out.

**Change Log:**
- 2026-05-05 — Investigation complete on `issue-26-territory-residency-writer-audit`. Single semantic commit (audit doc + this Dev Agent Record). **Conclusion A**: no active writer. Issue #26 closes informationally. Territory FK refactor audit trail now fully closed.
