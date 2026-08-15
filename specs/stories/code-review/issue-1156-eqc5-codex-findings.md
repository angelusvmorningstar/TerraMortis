# Adversarial review — issue 1156 / EQC-5

## High

- None found.

## Medium

- None found in Pass 1.

### [Pass 3a] Deleting the `data-acq-skill-spec` handler exceeds AC #4's literal cleanup allowance

- **Severity:** Medium
- **File:line:** `specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md:143` (contract); `public/js/tabs/downtime-form.js:2505` (the current location immediately after the deleted branch)
- **Triggering input or sequence:** Audit the implemented handler deletions against AC #4 literally. The AC explicitly enumerates `[data-skill-acq-spec]` and `[data-acq-skill]` for deletion, then says the shared “Add/Remove/dot/unknown/spec-chip handlers” are left in place and grants adjacent-cleanup discretion only to the Add/Remove `rowKey === 'skill'` ternaries. The change additionally deletes the distinct `[data-acq-skill-spec]`/`acqSkillSpec` handler; the Tasks section acknowledges that it was not enumerated in the original AC.
- **Observable consequence:** There is no current player-facing failure because `_renderSkillRow`, the only emitter, is also deleted. However, the completed implementation does not satisfy the acceptance contract as written, so the story cannot truthfully be accepted without either narrowing/amending AC #4 or restoring dead code that the intended removal clearly no longer needs.
- **Confidence:** High on the literal contradiction and on the handler being dead; the appropriate resolution is a spec correction rather than a runtime code rollback.

## Low

### [Pass 1] Add/Remove handler test does not prove the handlers are hardcoded to Resources

- **Severity:** Low
- **File:line:** `server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js:131`
- **Triggering input or sequence:** A future or accidental edit deletes either delegated Add/Remove branch, changes it to read or write the wrong key, or otherwise breaks the handler while continuing not to contain the exact text `rowKey === 'skill'`.
- **Observable consequence:** The test titled “Add/Remove row handlers hardcode acq_resource_rows” still passes even though it never asserts that either handler exists or that both read and write `acq_resource_rows`; a Resources acquisition regression can therefore pass this advertised guard.
- **Confidence:** High. The sole assertion at line 134 is a whole-file negative match for the removed ternary text.

### [Pass 1] Skill-markup removal test misses the removed `data-acq-skill-spec` attribute family

- **Severity:** Low
- **File:line:** `server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js:90`
- **Triggering input or sequence:** `data-acq-skill-spec` or `data-acq-skill-spec-hidden` markup/handlers survive or are accidentally reintroduced without a direct `data-acq-skill="..."` attribute or the older, differently ordered `data-skill-acq-spec` spelling.
- **Observable consequence:** The “no data-acq-skill … markup/handlers remain” test stays green because `/data-acq-skill[="[]/` deliberately cannot consume the hyphen after `data-acq-skill`, while the second assertion checks `data-skill-acq-spec`, not `data-acq-skill-spec`.
- **Confidence:** High. Both missed spellings are visible in the deleted diff, and neither is matched by the two assertions.

### [Pass 1] Legacy-annotation test checks for only one annotation, not every field named by its title

- **Severity:** Low
- **File:line:** `server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js:179`
- **Triggering input or sequence:** Any individual `skill_acq_*`, `skill_acquisitions`, or `acq_skill_rows` declaration loses its `[legacy]` annotation while at least one other `[legacy]` token remains within the 1,400-character slice.
- **Observable consequence:** The test titled “the skill_acq_* fields are annotated [legacy]” passes despite incomplete schema documentation. The current diff does annotate the declarations; this is a regression-test precision issue, not a current schema defect.
- **Confidence:** High. The test performs a single `toMatch(/\[legacy\]/)` against the entire slice.

### [Pass 2] The acquisition gate definition still advertises the removed Skills channel

- **Severity:** Low
- **File:line:** `public/js/tabs/downtime-data.js:441`
- **Triggering input or sequence:** Any consumer renders the exported `DOWNTIME_GATES` definition (or the dormant manual-gate UI is restored) after this change.
- **Observable consequence:** The prompt still asks, “Do you want to use Resources or Skills to attempt to acquire anything?” even though the Skills acquisition channel and all of its write-side controls are gone. In the current form this label is dormant: `downtime-form.js` imports the array only to restore and collect gate values and contains no loop that renders `gate.label`, so there is no present player-facing break. It is nevertheless a contradictory source-of-truth value left by the removal and is not covered by the new tests.
- **Confidence:** High that the stale value exists and is not currently rendered; medium that it will affect a live consumer without a future rendering change.

### [Pass 3b] The Dev Agent Record reports false per-file Playwright denominators

- **Severity:** Low
- **File:line:** `specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md:113` and `:298`
- **Triggering input or sequence:** Run `tests/fix-493-skill-acq-outcome-summary.spec.js` and `tests/fix-player-skill-acq-outcome.spec.js` together and count each file's declared/executed tests.
- **Observable consequence:** The record repeatedly labels the failures as `fix-493` “4/4” and `fix-player` “1/8”. The observed files contain five and three tests respectively: `fix-493` has four failures plus one passing Allies regression guard, and `fix-player` has one failure plus two passes. The aggregate result is 5 failed / 3 passed out of 8, and the claimed root cause remains correct, but the per-file denominators are false and overstate how much of `fix-493` is red.
- **Confidence:** High. Playwright reported all eight tests individually, and source contains five `test(...)` calls in `fix-493` and three in `fix-player`.

### [Pass 3b] The full-gate record omits two skipped test files

- **Severity:** Low
- **File:line:** `specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md:286`
- **Triggering input or sequence:** Run the full server Vitest gate with the repository's installed Vitest 4.1.2 and read the final file summary, not only the failed/passed counts.
- **Observable consequence:** The record says 100 failed suites / 80 passed but omits the two skipped test files. The exact current accounting is **100 failed / 80 passed / 2 skipped test files (182 total)** and **2 failed / 1191 passed / 1153 skipped tests (2346 total)**. Its passed/failed/test counts are otherwise exact; this is incomplete gate reporting, not a new EQC-5 regression.
- **Confidence:** High. Two consecutive full-gate runs produced the same failures; the second preserved the final summary line.

### [Pass 3b] The live “5 affected submissions” claim is unverifiable in this review environment

- **Severity:** Low
- **File:line:** `specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md:309`
- **Triggering input or sequence:** Execute a read-only `connectDb()` query for the active cycle and count submissions whose `responses.skill_acq_description` or `responses.skill_acquisitions` is non-empty, matching both ObjectId and string `cycle_id` forms.
- **Observable consequence:** The query cannot reach the configured MongoDB deployment: all server connections are rejected with `EACCES` before handshake. Therefore the operationally important count of five affected active-cycle submissions, and the claim that it was flagged to Angelus, cannot be independently confirmed here. This is a disclosed verification gap, not evidence that the count is false.
- **Confidence:** High that the claim is currently unverifiable from this sandbox; no conclusion about the real count.

### [Pass 3b] The claimed identical pre-change Playwright execution could not be rerun

- **Severity:** Low
- **File:line:** `specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md:298`
- **Triggering input or sequence:** Attempt to detach the review worktree at base commit `061f6ce6` and rerun the two red Playwright specs there.
- **Observable consequence:** Git cannot create the umbrella repository's worktree `index.lock` outside the writable workspace, so an actual base execution was not possible. Static evidence is strong: both test blobs and all three read-side JS blobs have identical Git object IDs at `061f6ce6` and `e619f4f4`, the current run reproduces exactly four stale-`[0]` failures in `fix-493` plus one in `fix-player`, and the fixtures directly show the wrong slot. Still, the record's “confirmed via baseline execution” claim was not independently re-executed in this review.
- **Confidence:** High on the verification gap; high (but not execution-proven here) that the author's baseline attribution is correct.

## Ship assessment

**Needs a small patch before shipping; no blocking runtime defect was found.** The source removal and Resources preservation behave as intended, but AC #4 must be corrected to authorize the extra dead-handler deletion (or the implementation must be changed to match the literal AC). The dormant “Resources or Skills” gate definition and the two weak regression assertions should also be tightened while the change is open. The existing Vitest failures and stale-fixture Playwright failures are not caused by EQC-5.

## Validation notes

### Pass isolation and files opened

- **Pass 1:** Opened only `specs/stories/code-review/issue-1156-eqc5-diff.txt`. I did not open repository source, the story, or any author record. I wrote and froze the Pass 1 findings before advancing.
- **Pass 2:** Directly opened relevant ranges of `public/js/tabs/downtime-form.js`, `public/js/tabs/downtime-data.js`, `server/schemas/downtime_submission.schema.js`, and `schemas/downtime_submission.schema.md`. The supplied diff continued to provide the new test's full text. Repository-wide `rg` scans (explicitly excluding `specs/stories/feature.1156.eqc5-remove-skill-acquisition.story.md`) examined references in the three read-side modules, tests, scripts, fixtures, archives, and other specs. I did not open the issue-1156 story in this pass. Pass 2 was frozen before advancing.
- **Pass 3a:** First used a heading-only scan of the story to obtain boundaries. Then opened only lines 13–21 (Story), 77–126 (Explicitly NOT this story), and 127–277 (Acceptance Criteria, Tasks/Subtasks, Dev Notes, Project Structure Notes, References). I skipped Background and did not read any content at or after line 278. Pass 3a was frozen before advancing.
- **Pass 3b:** Opened the Dev Agent Record and withheld Senior Developer Review at lines 278–366, the two failing Playwright fixtures, `playwright.config.js`, root/server `package.json`, `server/db.js`, the relevant start of `server/routes/downtime.js`, and `server/scripts/migrate-eqc1-bucket-taxonomy.mjs`. Playwright-generated error context was opened only to diagnose the invalid fallback server attempt.

### Commands and observed results

- **Pass 1 commands:** `Get-Content specs/stories/code-review/issue-1156-eqc5-diff.txt` (initial output truncated); three chunked `Get-Content | Select-Object` reads (`-First 260`, `-Skip 260 -First 260`, `-Skip 520`) completed; `Select-String` searched the diff for all requested dangling-reference/handler tokens; a PowerShell hunk-line counter mapped selected added assertions to their new-file line numbers. All exited 0.
- **Pass 2 source/trace commands:** `rg` located `collectResponses`, `_prior`, response assignments, acquisition rendering/call sites, gate uses, imported symbols, legacy keys, deleted helper names, event attributes, and whole-repository cross-module references (with the issue-1156 story excluded). Numbered `Get-Content` range reads traced `collectResponses` lines 410–1082, the delegated click listener, acquisition helpers/renderer, mode rendering, and both schemas. The scans found no live write-side Skill reference in `downtime-form.js`; the only current matches there are explanatory comments. They also found the stale dormant gate label at `downtime-data.js:441`.
- **Pass 2 validation commands:** `node --check public/js/tabs/downtime-form.js`, `node --check server/schemas/downtime_submission.schema.js`, and `node --check server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js` all passed. `git diff --check 061f6ce6 e619f4f4 -- <five source/test paths>` passed. `git status --short`, `git branch --show-current`, `git rev-parse --short HEAD`, and `git diff --name-status 061f6ce6 e619f4f4` confirmed branch `ms/issue-1156-eqc5-remove-skill-acquisition`, head `e619f4f4`, and the expected commit path list.
- **Pass 3a commands:** `Select-String -Pattern '^#{1,3} '` returned headings only; a bounded `Get-Content` loop printed only the permitted ranges described above.
- **Isolated EQC-5 Vitest:** Exact `npx vitest run server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js` could not start because root has no local Vitest and restricted `npx` attempted to fetch from npm (`EACCES`). The installed binary fallback, `server/node_modules/.bin/vitest.cmd run server/tests/issue-1156-eqc5-remove-skill-acquisition.test.js`, passed **1 file / 22 tests**, with 0 failed and 0 skipped.
- **Full server gate:** Exact root `npx` has the same installation/network limitation. `server/node_modules/.bin/vitest.cmd run server/tests` ran twice. The first output was truncated after showing the two assertion failures; the second captured the tail and reported exactly **100 failed / 80 passed / 2 skipped test files (182)** and **2 failed / 1191 passed / 1153 skipped tests (2346)**. Exit code was 1. The two failed tests were in `n7-n9-allocator-readers.test.js` and `oath-a-pledge-helpers.test.js`. Mongo-dependent coverage did not run: 1153 tests skipped/guard-tripped because MongoDB was unavailable, so the exit code alone must not be read as full execution.
- **Playwright setup diagnostics:** A port-8080 check found no existing listener. The first configured `npx playwright` attempt timed out because `playwright.config.js` launches unavailable `npx http-server` and npm fetch was denied. `node_modules/.bin/playwright.cmd` and local `serve` 14.2.6 were present. An initial fallback using `serve -s` was invalid and produced 14 `#admin-app` timeouts because SPA fallback served the player app; the generated page snapshot confirmed this. A local `Invoke-WebRequest` diagnostic command was rejected by policy before execution. All fallback server processes were launched hidden and stopped in `finally` blocks.
- **Valid Playwright results:** With local `serve public -l 8080` and Playwright reusing port 8080, `npx playwright test tests/fix-491-skill-acquisition-outcome-card.spec.js tests/fix-914-acquisition-outcome-field-slot.spec.js` passed **14/14**. A separate serial invocation for `tests/fix-493-skill-acq-outcome-summary.spec.js tests/fix-player-skill-acq-outcome.spec.js` ran **8 tests: 5 failed / 3 passed**. Breakdown: `fix-493` 4 failed / 1 passed; `fix-player` 1 failed / 2 passed. No Playwright invocations were run concurrently.
- **History/fixture commands:** The first combined Git history/name command timed out without output; reruns succeeded. `git --no-pager log --oneline -- <two red specs>` showed only `e8ad51d9` and `b0c8cee6`, not `e619f4f4`. `git --no-pager show --format=... --name-only e619f4f4` listed only the seven TM Suite paths recorded by the story. `rg -n -C 10` directly confirmed every failing Skill fixture places its outcome in the sole array element at index `[0]`. `git rev-parse 061f6ce6:<path>` versus `e619f4f4:<path>` produced identical blob IDs for both red specs and all three read-side JS files.
- **Handler and syntax checks:** `rg` found no current `data-acq-skill-spec`, `acqSkillSpec`, or `data-skill-acq-spec` emitter/handler in `downtime-form.js`. Earlier source searches confirmed the accessors import regex matches the actual one-line import at line 25 and all surviving `ALL_SKILLS`/`skTotal` imports remain used.
- **Base-run attempt:** A guarded `git switch --detach 061f6ce6` attempt failed before changing HEAD because Git could not create `D:/Terra Mortis/TM Suite/.git/worktrees/TM-Suite-eqc/index.lock` (`Permission denied`). The command printed `e619f4f4`; subsequent branch/HEAD checks confirmed the review branch was never left. Therefore I could not execute the Playwright pair at the base commit.
- **Live-data attempt:** A read-only inline Node query first hit a PowerShell quoting parser error; the corrected query loaded `connectDb()` but MongoDB server selection failed with network `EACCES` before handshake. No query ran and no database state changed. The claimed five active-cycle submissions could not be independently verified.
- **Final hygiene commands:** A final `Get-Content`/heading scan inspected this report; `git diff --exit-code`, `git branch --show-current`, `git rev-parse --short HEAD`, `git status --short`, and a port-8080 listener check confirmed no tracked diff, branch `ms/issue-1156-eqc5-remove-skill-acquisition`, HEAD `e619f4f4`, and no test server remains. `npm test` was not run because root `package.json` confirms it is the documented no-op failure stub.

### Modification/restoration attestation

I modified no source, schema, test, story, tracking, configuration, or sibling-repository file. The only file I intentionally created/updated is this required review report. The temporary base checkout never occurred, and every local HTTP server process was stopped. Final `git status --short` showed only untracked review artifacts (`issue-1156-eqc5-codex-findings.md` plus the supplied/generated diff, prompt, and raw-output files), with no tracked change; TM Wiki, TM Cockpit, and TM Herald were neither opened nor touched.
