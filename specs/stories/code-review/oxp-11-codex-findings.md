# oxp-11 adversarial review findings

## High

### [Pass 1] Own-office fallback can silently edit another holder's seat

- **Severity**: High
- **File:line**: `public/js/tabs/office-tab.js:236` (fallback selection), `public/js/tabs/office-tab.js:446` and `public/js/tabs/office-tab.js:467` (interactive rank control/write)
- **The triggering input or sequence**: A character's `court_category` makes `isOwnOffice` true for a multi-seat category such as Primogen, but every matching `office_seats.holder_id` is stale or wrong. `_wirePurchaseState` finds no holder match and silently chooses `_fallbackSeat(forCategory)`. It nevertheless passes the unchanged `isOwnOffice === true` into `_wireManoeuvreRank`; an ST/dev then clicks the rendered `+` or `-` control.
- **The observable consequence**: The list is muted as though it represented the viewed character's own progress, the ST/dev stepper remains interactive, and the PUT targets the fallback seat's `office_manoeuvre_ranks` document. In a two-seat office that may be the other player's contested OXP state. The only safeguard is a small inline note (duplicated in the two purchase mounts) naming a label or final six id characters; it does not prevent or require acknowledgement of the destructive misattribution, and an ST can reasonably read the own-office presentation as authoritative and miss it.
- **Confidence**: High. The full chain is explicit in the diff: `isOwnOffice` is computed independently of the resolved seat; failure to match a holder invokes `_fallbackSeat`; the resolved `outcome.seatId` and original `isOwnOffice` then drive rendering and the step PUT. The added tests cover a successful own-holder match and a reference-view fallback, but not an own-office fallback with stale/wrong holder ids.

### [Pass 1] Migration apply can lose a concurrent update made after planning

- **Severity**: High
- **File:line**: `server/scripts/migrate-office-purchases-to-seats.mjs:100` (`planMigration` snapshot), `server/scripts/migrate-office-purchases-to-seats.mjs:168` and `server/scripts/migrate-office-purchases-to-seats.mjs:186` (insert/delete)
- **The triggering input or sequence**: `planMigration` reads a category-keyed document and retains its complete old value in `row.doc`. Before `applyMigration` reaches that row, the live category-keyed document is updated by another writer. `applyMigration` inserts the stale `row.doc` beneath the seat id with `$setOnInsert`, then unconditionally deletes the current category-keyed document by `_id` only.
- **The observable consequence**: The newer live purchase state is discarded: the destination contains the earlier snapshot while the source carrying the concurrent change is deleted. Insert-before-delete protects against process interruption, but it does not protect against source mutation between plan and delete. The window is short in a normal run, but it is real (separate Atlas reads, logging, update and delete, repeated per collection) and the script contains no transaction, source-version predicate, quiescence check, or instruction to stop app writes. Because it is intended to rewrite live production data, low probability does not reduce the consequence.
- **Confidence**: High for the race and data-loss mechanism; Medium-High for real-world reachability because the diff describes a deliberate one-off human run but does not establish that the deployed old write routes will be quiesced.

### [Pass 2] There is no safe documented online cutover between incompatible key schemes

- **Severity**: High
- **File:line**: `public/js/tabs/office-tab.js:323` and `public/js/tabs/office-tab.js:436`; `server/scripts/migrate-office-purchases-to-seats.mjs:169-186`
- **The triggering input or sequence**: The new code is deployed while the live category-keyed purchase documents still exist, or the migration is applied while the old code remains available. In the deploy-first order, the unchanged GET handlers return the legacy documents under category keys, but the new client indexes those maps only by `outcome.seatId`, so existing purchases render as zero. If an ST edits that apparent zero before migration, a new seat-keyed document is created. The later migration sees that destination as already present, keeps it unchanged, and deletes the legacy category document. In the migrate-first order, the old client indexes only by category, ignores the newly seat-keyed documents, and an ST can recreate legacy category-keyed state. The script documents neither a write freeze/maintenance window nor a required atomic deployment sequence.
- **The observable consequence**: During an ordinary staggered human migration/deploy, real purchases can temporarily appear unpurchased and an ST can write replacement values. In the deploy-first case, the migration's advertised recovery behaviour can then preserve the newly created partial/default seat document and permanently delete the complete legacy purchase history. In the migrate-first case, the database can return to a mixed legacy/new state immediately after a supposedly successful migration.
- **Confidence**: High for both incompatibility sequences; Medium-High that operations will encounter one because no quiescence or coordinated cutover requirement appears in the script or surrounding runtime code.

## Medium

### [Pass 2] No test covers stale holder ids in an own-office multi-seat edit

- **Severity**: Medium
- **File:line**: `server/tests/issue-1141-office-tab-render.test.js:627-674`
- **The triggering input or sequence**: The render-level suite tests (a) an own-office view where `holder_id` correctly identifies Yusuf's second-sorting Primogen seat and (b) a no-holder-match fallback only while an Enforcer holder browses Primogen as a reference. It never combines `isOwnOffice === true`, two stale/wrong Primogen holder ids, and a real ST stepper click through the wiring functions.
- **The observable consequence**: The highest-impact client branch can regress or remain unsafe while all 33 render tests pass. A temporary end-to-end assertion added during review reproduced the gap: the own-office list was muted using the fallback seat's rank, the stepper rendered, and the click issued `/api/office_manoeuvre_rank/seat-primogen-a/step`; an assertion that this fallback seat must not be written failed 1/1. The temporary test was then removed and the original suite returned to 33/33.
- **Confidence**: High; this was read in the full suite and reproduced through its real fake-DOM/fetch harness.

### [Pass 3b] Claimed green DB and mutation totals could not be reproduced because the DB tests skipped

- **Severity**: Medium
- **File:line**: `specs/stories/oxp-11-office-purchase-seat-keying.md:472-500`
- **The triggering input or sequence**: Run the exact requested six-file gate from `server/`, then run the oxp-11 suite verbosely and repeat it after changing the ambiguity branch to pick the first seat. Every attempt to establish `dbAvailable` failed with `connect EACCES 159.143.141.178:27017`.
- **The observable consequence**: The exact current gate is **5 files passed, 1 file skipped; 98 tests passed, 82 skipped, 0 failed (180 total)**, not an independently observed all-green DB run. The oxp-11 suite was **20/20 skipped** both before and during the author-described ambiguity mutation, so the claimed “exactly 1 test failed” discrimination could not be confirmed. The adjacent three-file run likewise produced **2 files passed, 1 skipped; 57 passed, 15 skipped (72 total)** rather than 72 passing. This does not prove the historical numbers false, but it makes them unverifiable-as-stated in this review and leaves AC8, AC9, migration apply behaviour, and the author’s two DB-backed mutation counts without fresh execution evidence.
- **Confidence**: High; these are the direct Vitest summaries and verbose connection error from this session.

## Low

### [Pass 3a] Migration calls any 24-hex key a real migrated seat without checking the seat exists

- **Severity**: Low
- **File:line**: `server/scripts/migrate-office-purchases-to-seats.mjs:78`, `server/scripts/migrate-office-purchases-to-seats.mjs:110-112`
- **The triggering input or sequence**: A purchase document has a syntactically valid 24-hex string `_id`, but there is no matching `_id` in `office_seats` (for example, an orphan left after a seat deletion or a manually malformed record). `planMigration` tests only `SEAT_KEY` and immediately labels it `already-seat-keyed`; it never checks the loaded seats.
- **The observable consequence**: The migration reports the orphan as already migrated and skips it, even though AC4 says a document already keyed by a **real seat id** is what should be recognised and skipped. The inaccessible orphan remains in the collection without being refused or surfaced for human action. Confirmed live data does not currently contain such a row, which limits present risk.
- **Confidence**: High for the classification behaviour; High that it is a literal AC deviation, but Low current-production likelihood given the story's recorded live rows.

### [Pass 3a] New comments and test descriptions violate the story's no-em-dash constraint

- **Severity**: Low
- **File:line**: Examples include `public/js/data/office-xp.js:156`, `public/js/tabs/office-tab.js:259`, and `server/tests/oxp-11-office-purchase-seat-keying.test.js:2`
- **The triggering input or sequence**: Review or linting against the story's Project Structure Notes, which require “British English, no em-dashes, in any new comment or test description.” The diff adds dozens of em dashes in precisely those locations.
- **The observable consequence**: The implementation violates an explicit repository/story prose constraint and normalises the forbidden punctuation across new documentation and test names. Runtime behaviour is unaffected.
- **Confidence**: High; `rg '^\\+.*—' specs/stories/code-review/oxp-11-diff.txt` returns many added lines.

### [Pass 3b] “Migration was never run against live” is a historical negative that the repo cannot prove

- **Severity**: Low
- **File:line**: `specs/stories/oxp-11-office-purchase-seat-keying.md:540-541`
- **The triggering input or sequence**: Audit the source for boot/test hooks and inspect this session's commands. The script is not wired into runtime or test setup and this review never invoked it, but there is no repository audit artifact that proves what a prior human or agent did outside the recorded session.
- **The observable consequence**: The author’s statement may be true and is consistent with the code, but it is unverifiable-as-stated rather than an independently established fact. This review can attest only that it did not run either MongoDB script and did not make a live-database connection.
- **Confidence**: High about the verification limit; this is not an allegation that the script was run.

## Assessment

**Blocking patches are needed before shipping.** The server-side seat keying and ambiguity refusal are directionally sound, but the client can demonstrably write another holder's contested OXP state when an own-office holder match is stale, and the migration/deployment pair has no safe documented cutover boundary. The live migration should also protect the planned source snapshot from concurrent modification. At minimum: make an unmatched own-office multi-seat outcome non-editable and unmistakably blocking; add its end-to-end regression test; document/enforce a write-quiesced migrate/deploy procedure (or supply mixed-key compatibility for the transition); and make source deletion conditional on the source still matching what was planned.

## Validation notes

### Pass boundaries and files opened

- **Pass 1** opened only `specs/stories/code-review/oxp-11-diff.txt` (all 2,856 lines, in chunks). The findings file did not yet exist; Pass 1 findings were written before any repository source or story content was opened.
- **Pass 2** opened `public/js/tabs/office-tab.js`; `server/lib/office-seat-resolve.js`; `server/routes/office-merit-dots.js`; `server/routes/office-manoeuvre-rank.js`; the relevant `server/index.js` mounting block; `server/routes/office-seats.js`; `server/schemas/office_seat.schema.js`; `server/scripts/seed-office-seats.mjs`; `server/vitest.config.js`; `server/tests/helpers/setup-env.js`; `server/tests/helpers/db-setup.js`; `server/db.js`; `server/config.js`; all five named/reworked suites (`office-merit-dots`, `oxp-3`, `oxp-4`, `issue-1141-office-tab-render`, `oxp-11`); small snippets of `server/package.json`; and base-commit snippets of the two old routes and old `office-tab.js`. No oxp-11 story section was opened. One overly broad `rg -n office_seats .` search unintentionally traversed `specs/stories/sprint-status.yaml` and old review artifacts; the displayed/truncated output exposed neighbouring oxp-1/oxp-2 status prose, not the oxp-11 story or its Dev Agent Record. This was a procedural search-scope mistake and is disclosed rather than represented as perfect isolation.
- **Pass 3a** opened only lines 1-464 of `specs/stories/oxp-11-office-purchase-seat-keying.md`, ending before `## Dev Agent Record`. Pass 3a findings were written before advancing.
- **Pass 3b** then opened lines 465-618, the full Dev Agent Record and File List. The Senior Developer Review section at line 619 onward was not opened.

### Commands and real results

Pass 1:

- `(Get-Content -LiteralPath 'specs/stories/code-review/oxp-11-diff.txt').Count` -> `2856`.
- `rg -n "^(diff --git|@@)" 'specs/stories/code-review/oxp-11-diff.txt'` -> enumerated 10 changed files and their hunks.
- Six `Get-Content` chunk reads (`[0..414]`, `[415..1034]`, `[1035..1519]`, `[1520..2019]`, `[2020..2479]`, `[2480..2855]`) -> read the complete diff successfully.
- `Test-Path -LiteralPath 'specs/stories/code-review/oxp-11-codex-findings.md'` -> `False`; the requested report was then created.

Pass 2 inspection and execution:

- `rg --files -g 'AGENTS.md' -g '!specs/stories/oxp-11-office-purchase-seat-keying.md'` -> exit 1, no `AGENTS.md` found.
- Full `Get-Content` reads of the Pass 2 files named above -> all succeeded.
- `rg -n -C 8 "office_(merit_dots|manoeuvre_rank)|officeMeritDotsRouter|officeManoeuvreRankRouter" server/index.js` and the explicit `server/index.js` lines 131-196 read -> distinct mounts; no sibling shadowing.
- The first complex PowerShell/`rg` writer search failed with a PowerShell parser error. The replacement broad `rg -n 'office_seats' ... .` succeeded but was truncated and caused the accidental sprint-status exposure disclosed above. The narrowed `rg -n 'office_seats' server public --glob '!server/tests/**'` succeeded and showed no live app write route; only the manual seed script writes seats outside tests.
- `rg --files server | rg 'vitest\.config|setup-env|db-setup\.js|package\.json$'` -> found the expected harness files. Their full reads verified the hard `tm_suite_test` override, the pre-connect `_test` guard, and the post-connect database-name recheck.
- `rg -n '"express"|"vitest"' server/package.json` -> Express `^5.2.1`, Vitest `^4.1.2`.
- `git show 79787d0c:<path> | rg ...` for old `office-tab.js` and both old routes -> confirmed the old client indexed by category and old writes used `{ _id: category }`.
- `npx vitest run tests/issue-1141-office-tab-render.test.js` -> 1 file passed, 33/33 tests passed.
- Temporary stale-holder own-office assertion plus `npx vitest run tests/issue-1141-office-tab-render.test.js -t "TEMP REVIEW"` -> exactly 1 failed, 33 skipped; failure at the assertion that the fallback-seat step URL must not be written.
- After removing that temporary assertion, `rg -n 'TEMP REVIEW' ...; npx vitest run tests/issue-1141-office-tab-render.test.js` -> no marker output and 33/33 passed.
- Line-number `rg` commands over the client, migration, and render suite -> located the cited resolution/write/snapshot/test lines.

Pass 3a:

- `rg -n '^#{1,3} ' specs/stories/oxp-11-office-purchase-seat-keying.md` -> located the Dev Agent Record boundary at line 465 and Senior Review at 619.
- `Get-Content` lines `[0..463]` -> read only the permitted story/AC/task/dev-note material.
- `rg -n '^\+.*—' specs/stories/code-review/oxp-11-diff.txt` -> many newly added em dashes in comments and test descriptions.
- `rg` over `SEAT_KEY`/`already-seat-keyed` -> confirmed syntax-only classification at migration lines 78 and 110-112.

Pass 3b:

- `Get-Content` lines `[464..617]` -> read the Dev Agent Record in full, stopping before Senior Review.
- **Exact required gate:** `npx vitest run tests/office-merit-dots.test.js tests/oxp-3-office-manoeuvre-rank.test.js tests/oxp-4-merit-persistence-handover.test.js tests/issue-1141-office-tab-render.test.js tests/oxp-11-office-purchase-seat-keying.test.js tests/oxp-2-derived-office-xp-calculation.test.js` -> **5 files passed, 1 skipped; 98 passed, 82 skipped, 0 failed (180 tests total)**.
- `rg --files tests | rg 'feature\.691.*hos-city-status-power|issue-1141-office-data-sync|oaq-2-pending-status-actions'` -> resolved the three adjacent filenames. Running them -> **2 files passed, 1 skipped; 57 passed, 15 skipped (72 total)**.
- Task-range checkbox count -> exactly **34** checked and no unchecked task/subtask boxes.
- `npx vitest run tests/oxp-11-office-purchase-seat-keying.test.js --reporter=verbose` -> 1 file skipped, **20/20 skipped**; stderr: `connect EACCES 159.143.141.178:27017`.
- Temporarily changed the ambiguous branch to pick the first seat and ran the same verbose suite -> again **20/20 skipped** on the same EACCES, so the author's exact one-failure mutation count could not be observed. The change was reverted.
- Attempted `npx vitest run tests/oxp-1-office-seats.test.js` -> suite failed to load with `SyntaxError: Invalid or unexpected token`, 0 tests, confirming the named pre-existing shebang issue.
- `npx vitest run tests/issue-823-test-db-guard.test.js` -> suite failed setup on the same EACCES; 7 tests skipped.
- `npx vitest run tests/oxp-4-merit-persistence-handover.test.js --reporter=verbose` -> 1 file passed; **7 pure source-contract tests passed, 5 DB tests skipped** on EACCES.
- `git diff --unified=0 79787d0c -- public/js/data/office-xp.js` -> comment hunks only, no executable logic changes. First-line reads -> migration script begins `/**`; seed script begins `#!/usr/bin/env node`.
- Initial broad `git status --short` exposed a very large pre-existing untracked workspace and showed the two temporary-edit targets as line-ending-only modifications. `git diff --ignore-space-at-eol --exit-code` reported no semantic difference. `git restore --worktree` was attempted but failed because `.git/index.lock` could not be created under the sandbox. A CRLF-only mechanical rewrite of those exact two files then succeeded; `git diff --exit-code` reported no differences and printed `temporary-targets-restored=yes`.

### Verification limits and attestation

- I did **not** run `server/scripts/migrate-office-purchases-to-seats.mjs` or `server/scripts/seed-office-seats.mjs` as shell commands, with or without `--apply`.
- I made no direct MongoDB query or write. All attempted database access came only through the project's Vitest harness, which forced `tm_suite_test`; the remote connection failed before connecting with the documented `EACCES`.
- Because of that EACCES, DB-backed tests skipped and the historical 187-pass, 72-pass, and mutation-count claims could not be independently reproduced. They are not reported as passes.
- The only persistent file created by this review is this requested findings report. The temporary test and migration mutations were removed; their two files match the current index exactly. The pre-existing untracked workspace was neither modified nor cleaned.
- Final status command (`git status --short --untracked-files=no`, targeted status/diff, and marker search) -> `tracked-worktree-clean=yes`; only `?? specs/stories/code-review/oxp-11-codex-findings.md` for this review; `temporary-targets-restored=yes`; `temporary-markers-absent=yes`.
