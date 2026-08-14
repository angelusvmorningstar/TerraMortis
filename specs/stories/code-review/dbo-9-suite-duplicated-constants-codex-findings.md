# Adversarial review — DBO-9 suite duplicated constants

## High

- None found.

## Medium

- None found.

## Low

### [Pass 1] Import source-contract regex accepts non-import text

- Severity: Low
- File: `server/tests/dbo-9-non-combat-styles-consolidation.test.js:31` and `:48`
- Triggering input/sequence: Replace the real import with a comment such as `// import { NON_COMBAT_STYLES } from '../data/constants.js'`, or place that text inside a string literal, while otherwise arranging for the imported binding not to be referenced by the source file.
- Observable consequence: The positive `toMatch(...)` assertion still passes even though the consumer has no genuine import statement. The accompanying negative local-declaration assertions and call-site count assertions constrain likely accidental false passes, but they do not make this regex itself syntax-aware.
- Confidence: High. The exact regex returned `true` for both a commented-out import and a string-literal decoy in an isolated Node check.

### [Pass 3a] New comments violate the story's no-em-dash Dev Note

- Severity: Low
- File: `public/js/data/constants.js:128`; `server/tests/dbo-9-non-combat-styles-consolidation.test.js:2`, `:8`, `:63`
- Triggering input/sequence: Read the story's Architecture compliance rule, “no em-dashes in any comment this story writes,” then inspect the newly added comment lines.
- Observable consequence: Four new comment lines contain `—`, so the implementation does not fully comply with its own stated style constraint. Runtime behavior is unaffected.
- Confidence: High. Exact-character grep found the four newly added comment occurrences; `constants.js:131` also matched but predates this story and is therefore not part of the finding. The em dash in the test description at `:67` is a string, not a comment, and is likewise excluded.

### [Pass 3b] Dev Agent Record overstates the pre-existing test-file count

- Severity: Low
- File: `specs/stories/dbo-9-suite-duplicated-constants.md:149`
- Triggering input/sequence: Enumerate `*.test.js` files containing `sheet.js` or `downtime-form.js`, first excluding and then including `dbo-9-non-combat-styles-consolidation.test.js`, and run the inclusive set.
- Observable consequence: There are 28 pre-existing matching files and 29 total after adding the new suite, not “29 [existing] files alongside the new suite” (which states or implies 30 total). The substantive reported test result is still exact: the 29-file total run produced 513/514 passing tests, one assertion failure, and the two described load failures.
- Confidence: High. The exclusion count was 28, the inclusive run printed `RUNNING_FILES=29`, and Vitest reported 29 files total.

## Validation notes

### Pass 1 — Blind Hunter (frozen before repository access)

- `.has(...)` to `.includes(...)`: no behavioral divergence found for these four primitive ASCII strings. Both `Set.prototype.has` and `Array.prototype.includes` use SameValueZero equality without coercion; ordering and duplicate handling do not affect these boolean membership checks.
- Shared mutability: no mutation or reassignment is present in either touched consumer or the nearby code shown by the diff. All four reads call `.includes(...)`; downtime's `.sort()` targets a newly constructed array, not `NON_COMBAT_STYLES`.
- Self-contradiction/dead code/unused imports: none found in the diff. Both added imports are consumed, all four former `.has(...)` sites are converted, and the export is consumed by both modules and the test.
- Files opened in this pass: `specs/stories/code-review/dbo-9-suite-duplicated-constants-diff.txt` only.
- Commands run so far:
  - `Get-Content -LiteralPath 'specs/stories/code-review/dbo-9-suite-duplicated-constants-diff.txt'` — exit 0; output was the supplied four-file patch for `constants.js`, `sheet.js`, `downtime-form.js`, and the new 79-line test file.
  - First attempted inline `node -e` regex probe — exit 1 with no stdout/stderr text returned (PowerShell/JavaScript quoting failure).
  - Here-string piped to `node` using the exact test regex against a comment and a string-literal decoy — exit 0; output:

    ```text
    true // import { NON_COMBAT_STYLES } from '../data/constants.js'
    true const decoy = "import { NON_COMBAT_STYLES } from '../data/constants.js'";
    ```

### Pass 2 — Edge Case Hunter (frozen before reading the story)

- Findings: none.
- Whole-repository reference accounting: in executable source, the only references are the one export (`constants.js:129`), two imports (`sheet.js:6`, `downtime-form.js:19`), and four converted call sites (`sheet.js:2312`, `:2344`, `:2434`; `downtime-form.js:4280`). The new test contains its expected references. A same-name prose comment exists at `downtime-form.js:4275`; other matches are documentation/review artifacts, not consumers or dead code. No `NON_COMBAT_STYLES_DT` executable reference remains.
- Array/Set downstream behavior: no other executable consumer exists. The mutation scan found no mutator call and no binding reassignment; its only matches were the export assignment and a test comment containing `const NON_COMBAT_STYLES =`.
- Raw-source tests: 19 pre-existing test files actually read `public/js/editor/sheet.js` or `public/js/tabs/downtime-form.js` as text. None asserts an absolute byte offset or line number. Running all 19 yielded 17 passing files; `n7-n9-allocator-readers.test.js` had one unrelated fixed-character-window assertion failure against `editor/merits.js`, and `n8-mandragora-prereq.test.js` failed to load with `SyntaxError: Invalid or unexpected token`. Totals: 2 failed files / 17 passed files; 1 failed test / 401 passed tests (402 total). Neither failure concerns either DBO-9 changed region.
- Repository files opened/searched in this pass: repository paths returned by the reference and test-reader searches; `package.json`; `server/package.json`; the 19 listed test files through Vitest execution; and the touched runtime/test paths as read by those tests. The DBO-9 story file remained explicitly excluded and unopened.
- Commands run in this pass and real results:
  - Attempted one orchestration call containing three parallel commands (reference grep, source-reader grep, `AGENTS.md` grep) — orchestration exit 1 with no command output surfaced; each relevant command was rerun separately.
  - `rg -n --hidden --glob '!specs/stories/dbo-9-suite-duplicated-constants.md' --glob '!specs/stories/code-review/dbo-9-suite-duplicated-constants-codex-findings.md' "NON_COMBAT_STYLES(_DT)?" .` — timed out (exit 124) after 22.853s; partial output contained `.git` log entries plus the export and downtime references, so it was replaced by the bounded successful grep below.
  - `rg -n --glob '!node_modules/**' --glob '!.git/**' --glob '!specs/stories/dbo-9-suite-duplicated-constants.md' --glob '!specs/stories/code-review/dbo-9-suite-duplicated-constants-codex-findings.md' "NON_COMBAT_STYLES(_DT)?" .` — exit 0; listed the executable references summarized above plus the new test and documentation/review-log matches. It did not find another executable consumer.
  - `rg -n --glob '*.test.js' --glob '*.test.mjs' --glob '*.test.cjs' "sheet\.js|downtime-form\.js|readFileSync|readFile" server` — exit 0; broad candidate list of source-reading/importing tests.
  - First attempted complex `rg -l` regex for direct source readers — exit 1 with no text returned (PowerShell quoting error).
  - `rg -l --glob '*.test.js' "public/js/editor/sheet\.js|public/js/tabs/downtime-form\.js" server/tests` — exit 0; returned 23 path-mention candidates.
  - `rg -n -C 4 "read\('public/js/(editor/sheet|tabs/downtime-form)\.js'\)|readFileSync\(|formSrc|sheetSrc" server/tests --glob '*.test.js'` — exit 0; 1,220 output lines, tool display truncated after 443 lines/10,024 tokens.
  - PowerShell aggregation of three fixed-string `rg -l` searches for `read('public/js/editor/sheet.js')`, `read('public/js/tabs/downtime-form.js')`, and direct downtime path literals — exit 0; returned 20 readers including the new DBO-9 file, hence 19 pre-existing readers.
  - Attempted orchestration call for `AGENTS.md`, root package, and server package — orchestration exit 1 with no output surfaced; rerun individually.
  - `rg --files -g 'AGENTS.md' .` — exit 1 with no output: no repository `AGENTS.md` found.
  - `Get-Content -LiteralPath 'package.json'` — exit 0; root package has no usable test script (`test` exits 1).
  - `if (Test-Path -LiteralPath 'server/package.json') { Get-Content -LiteralPath 'server/package.json' } else { Write-Output 'NO server/package.json' }` — exit 0; showed `test: vitest run` and Vitest 4.1.2 dependency.
  - `npx vitest run` with the 19 explicit pre-existing raw-source-reader test paths — exit 1; real summary: `Test Files 2 failed | 17 passed (19)`, `Tests 1 failed | 401 passed (402)`; failures were the `n7-n9` `buildMeritOptions...{0,600}` assertion against `editor/merits.js` and the `n8` `SyntaxError: Invalid or unexpected token` load failure.
  - `rg -n "NON_COMBAT_STYLES\.(push|pop|shift|unshift|splice|sort|reverse|fill|copyWithin|add|delete|clear)|NON_COMBAT_STYLES\s*=" public server` — exit 0; only the export assignment and a test comment matched; no mutator matched.
  - `rg -n --glob '*.test.js' "(?:slice|substring|substr|charAt)\(\s*\d|\.at\(\s*\d|lines?\s*\[\s*\d" server/tests` — exit 0; no relevant absolute-offset/line-index assertion against either touched file. The only touched-file candidate was `issue-1128-dot-wrapper.test.js`, where `site.slice(0, 58)` merely formats generated test names.

### Pass 3a — Acceptance Auditor before author record (frozen)

- AC1: satisfied. There is one executable declaration, exported from `constants.js:129` as the exact required plain array, immediately before `STYLE_TAGS`.
- AC2: satisfied. The sheet-local Set is deleted, the existing import is extended, and `_availablePicks`, `shFightingMeritOptions`, and `shRenderManoeuvres` use `.includes(...)` at all three sites.
- AC3: satisfied. `NON_COMBAT_STYLES_DT` is deleted, the existing downtime import is extended, and `getItemsForCategory` uses the shared array at its one site.
- AC4: satisfied. The new suite asserts the exact exported value, pins three sheet and one downtime `.includes(...)` sites, and executes representative filtering for both consumer shapes. Current run: 7/7 passed.
- AC5: satisfied. The supplied patch changes only the required import/declaration/call-site lines and the directly stale explanatory downtime comment; it contains no adjacent cleanup or other logic/export change.
- Non-AC Dev Note compliance: one Low finding recorded above for newly written comments containing em dashes.
- Story content opened in this subpass: `specs/stories/dbo-9-suite-duplicated-constants.md` from the first line through the end of Dev Notes/References, stopping before and without outputting `## Dev Agent Record`.
- Commands run in this subpass and real results:
  - Lazy `[System.IO.File]::ReadLines(...)` loop over the story with `break` on `^## Dev Agent Record` — exit 0; output contained Story, Acceptance Criteria, Tasks/Subtasks, and Dev Notes through References, and did not include the Dev Agent Record heading or content.
  - `npx vitest run tests/dbo-9-non-combat-styles-consolidation.test.js` from `server` — exit 0; `Test Files 1 passed (1)`, `Tests 7 passed (7)`, duration 440ms; also emitted the Vitest 4 `test.poolOptions` deprecation warning.
  - `rg -n "—" public/js/data/constants.js server/tests/dbo-9-non-combat-styles-consolidation.test.js` — exit 0; matches at `constants.js:128`, `:131` and test `:2`, `:8`, `:63`, `:67`; only the newly added comment lines `constants.js:128` and test `:2/:8/:63` trigger the finding.

### Pass 3b — Dev Agent Record verification

- Record content opened: `specs/stories/dbo-9-suite-duplicated-constants.md` from `## Dev Agent Record` through EOF, only after Pass 3a was frozen.
- `7/7 new tests pass`: verified twice on restored code.
- Prove-discrimination: verified by temporarily changing only `_availablePicks` from `.includes(man.style)` to `.has(man.style)`. The new suite then produced exactly 6 passed / 1 failed, with only “sheet.js's three call sites read the shared array via .includes(...)” failing because it found 2 sites rather than 3. The line was restored immediately; the suite returned to 7/7.
- Aggregate suite claim: the exact 29-file current set reproduced 513 passed / 1 failed (514 tests), with 26 passing files and 3 failed files. One file had the documented unrelated `n7-n9` assertion failure; the other two failed at load with the documented errors. The result count is true; the prose count of pre-existing files is overstated as recorded above.
- Direct failure checks: `issue-836-legacy-tracker-cache-removed.test.js` still fails with `ENOENT` for `public/js/suite/tracker.js`; `n8-mandragora-prereq.test.js` still fails with `SyntaxError: Invalid or unexpected token`.
- Base comparison: `git diff --stat 9cab47ea --` for the three source files exactly reports 3 files, 13 insertions, 13 deletions.
- Stash-based base confirmation: not reproduced, per the review instruction. Current error signatures match the record exactly, but only the author's recorded stash run establishes that they also occur at the base.
- The record's 10/183 browser-global figures are counts of matching lines: reproduced as 10 lines in `sheet.js` and 183 in `downtime-form.js` (raw occurrence counts are 16 and 184 respectively).
- Commands/actions in this subpass and real results:
  - Lazy `[System.IO.File]::ReadLines(...)` loop beginning output at `^## Dev Agent Record` — exit 0; output included the complete Agent Model, Debug Log References, Completion Notes, and File List through EOF.
  - PowerShell collection of `rg -l "sheet\.js|downtime-form\.js" tests --glob '*.test.js'` excluding the DBO-9 test — exit 0; `COUNT=28` followed by the 28 paths.
  - The same `rg -l` collection without exclusion, passed to `npx vitest run` — exit 1; `RUNNING_FILES=29`, `Test Files 3 failed | 26 passed (29)`, `Tests 1 failed | 513 passed (514)`. Error details matched the record.
  - `npx vitest run tests/issue-836-legacy-tracker-cache-removed.test.js` — exit 1; one failed suite, zero tests, `ENOENT` opening `D:\Terra Mortis\TM Suite\public\js\suite\tracker.js` at test line 30/read call from line 69.
  - `npx vitest run tests/n8-mandragora-prereq.test.js` — exit 1; one failed suite, zero tests, `SyntaxError: Invalid or unexpected token`.
  - `git diff --stat 9cab47ea -- public/js/data/constants.js public/js/editor/sheet.js public/js/tabs/downtime-form.js` — exit 0; exactly `3 files changed, 13 insertions(+), 13 deletions(-)` with per-file `3 +++`, `11 ++++-------`, and `12 ++++++------`; also warned that the user-level Git ignore file was inaccessible.
  - Baseline `git diff --exit-code -- public/js/editor/sheet.js` — exit 0, no output.
  - Temporary `apply_patch`: changed the first `.includes(man.style)` to `.has(man.style)`; no other intended content change.
  - `npx vitest run tests/dbo-9-non-combat-styles-consolidation.test.js` with the temporary edit — exit 1; `Tests 1 failed | 6 passed (7)`, and only the three-call-site test failed (`expected length 3`, received 2).
  - Restoration `apply_patch`: changed that line back to `.includes(man.style)`.
  - First post-restore `git diff --exit-code -- public/js/editor/sheet.js` — exit 0/no diff, with a Git LF-to-CRLF warning.
  - First byte-hash comparison (`git hash-object --no-filters` versus `git rev-parse HEAD:...`) — exit 0; detected EOL drift from the patch mechanism: worktree `7225a942...`, HEAD `183f58ff...`, `BYTE_IDENTICAL=False`.
  - Node byte/EOL count for the worktree plus `git cat-file blob HEAD:...` piped to Node — exit 0; worktree 230,803 bytes with 3,133 CRLF + 1 LF; HEAD 227,670 bytes with 0 CRLF + 3,134 LF.
  - Mechanical Node EOL normalization (`replace(/\r\n/g, '\n')`) — exit 0; output `NORMALISED_CRLF_TO_LF`.
  - Final hash comparison plus `git diff --exit-code -- public/js/editor/sheet.js` — exit 0; worktree and HEAD hashes both `183f58fff85462ad50bcc8cbc82f1caae5b2233d`, `BYTE_IDENTICAL=True`, no source diff (Git repeated its LF-to-CRLF warning).
  - Final `npx vitest run tests/dbo-9-non-combat-styles-consolidation.test.js` — exit 0; `Test Files 1 passed (1)`, `Tests 7 passed (7)`, duration 453ms.
  - Browser-global occurrence command using `rg -o` — exit 0; 16 occurrences in `sheet.js`, 184 in `downtime-form.js`.
  - Browser-global matching-line and per-token count command — exit 0; matching lines `sheet=10 form=183`; occurrences `sheet document=15 window=1`, `form document=181 window=3`.
  - `rg -n` for the Dev Record's test/stat/global-count claims — exit 0; located the relevant story claims at lines 94, 146, 149, 157, 179, and 181.

### Ship readiness

- Ready to ship as-is: **Yes.** All acceptance criteria are met and no behavioral defect was found. The three Low findings are a test-hardening opportunity, comment-style noncompliance, and an audit-record count correction; none changes runtime behavior or the validity of the consolidation.

### Final workspace attestation

- `git status --short --untracked-files=all` followed by a path-scoped `git diff --exit-code` — combined exit 0. The status output was extremely noisy (1,552 lines; tool display truncated after 1,109) with many unrelated untracked workspace files, including pre-existing review artifacts, and the requested findings report as untracked. It displayed ` M public/js/editor/sheet.js`, while the immediately following diff returned no source diff; Git emitted inaccessible-global-ignore and LF/CRLF warnings.
- Follow-up path-scoped check: `git ls-files --stage -- public/js/editor/sheet.js`; `git status --porcelain=v2 --untracked-files=no -- public/js/editor/sheet.js`; `git diff --raw -- public/js/editor/sheet.js`; `git diff --numstat -- public/js/editor/sheet.js` — combined exit 0. The index hash is `183f58fff85462ad50bcc8cbc82f1caae5b2233d`; porcelain reports `.M` stat state but shows the same index and HEAD hashes; both raw and numstat diffs are empty. Together with the raw worktree hash equality above, this confirms byte-identical restoration despite the stale/stat-and-EOL status indication.
- Modification attestation: I created/updated only this requested findings report. I temporarily edited one line in `public/js/editor/sheet.js` for discrimination, restored it, corrected patch-induced EOL drift, and verified its raw bytes equal the committed blob and that Git reports no content diff. I did not modify the implementation, test file, story, tracking files, commits, branches, remotes, or any sibling repository.
- Information-barrier attestation: Pass 1 used only the supplied diff; Pass 2 used the TM Suite repository while the DBO-9 story remained excluded; Pass 3a read only the story sections before `## Dev Agent Record`; Pass 3b then read and verified the record. Each pass was written here before advancing.
