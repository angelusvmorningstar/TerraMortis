# Adversarial review findings — dbo-3-xp-spend-standing-filter-bug

## High

- [Pass 1] None found.
- [Pass 2] None found.
- [Pass 3a] None found.
- [Pass 3b] None found.

## Medium

### [Pass 3a] AC3's “ANY character” exclusion is bypassed by the existing-current-value escape hatch

- **Severity**: Medium
- **File:line**: `specs/stories/dbo-3-xp-spend-standing-filter-bug.md:112`; `public/js/editor/merits.js:369`
- **Triggering input or sequence**: Render the primary Add Merit picker with a character row whose `currentName` is `Mystery Cult Initiation` or `Professional Training`. `isMeritEventGranted` excludes the matching rule during iteration, then `buildMeritOptions` appends the filtered current name back as a selected option.
- **Observable consequence**: Contrary to AC3's literal “must not appear in this picker's output for ANY character,” the event-granted merit appears and remains selected for a legacy/miscategorised row. This is the acceptance-level consequence of the behavior independently found in Pass 2; that earlier finding remains unchanged.
- **Confidence**: High; reproduced against the real module and directly contrary to AC3's literal wording.

### [Pass 3a] AC4 promises Pledged at all three replacement sites, but the FThief implementation and test require the opposite

- **Severity**: Medium
- **File:line**: `specs/stories/dbo-3-xp-spend-standing-filter-bug.md:122`; `public/js/editor/merits.js:498`; `server/tests/dbo-3-standing-merit-filter.test.js:206`
- **Triggering input or sequence**: Evaluate Pledged's real rule (`special: null`, `sub_category: 'standing'`, fixed rating `[2,2]`) at AC2's `buildFThiefOptions` site. It passes the corrected event-granted predicate, then `minR > 1` excludes it. This picker accepts no character and has neither the `meetsPrereq` nor `isMeritExcluded` gate that AC4 says both merits flow through “at each of those three call sites.”
- **Observable consequence**: The implementation cannot satisfy AC4 as written: Pledged never becomes selectable in the FThief picker, and the added test explicitly asserts that absence. The picker behavior itself is consistent with its one-dot-only purpose, so the blocking mismatch is between the acceptance contract and the delivered/verified behavior rather than evidence that a two-dot theft should actually be allowed.
- **Confidence**: High; the AC, filter, function signature, and opposite test assertion are explicit.

### [Pass 3b] The Dev Agent Record falsely reports AC4 as proved at all three replacement sites

- **Severity**: Medium
- **File:line**: `specs/stories/dbo-3-xp-spend-standing-filter-bug.md:329`; `public/js/editor/merits.js:491`; `server/tests/dbo-3-standing-merit-filter.test.js:206`
- **Triggering input or sequence**: Read the record's claim that both Confessor and Pledged flow through `meetsPrereq`/`isMeritExcluded` and were proved present with Lance Status at all three AC2 sites, then execute/inspect `buildFThiefOptions`. That function accepts no character, calls neither gate, and always rejects Pledged because its fixed minimum rating is two.
- **Observable consequence**: The author record labels an impossible acceptance claim “proved” even though its own test asserts the opposite. A ship decision based on the completion notes would incorrectly treat AC4 as fully demonstrated.
- **Confidence**: High; this independently confirms the Pass 3a contract mismatch after reading the author's account rather than revising that earlier finding.

### [Pass 2] Current-selection passthrough re-adds the event-granted merits after filtering

- **Severity**: Medium
- **File:line**: `public/js/editor/merits.js:369`, `public/js/editor/merits.js:462`, `public/js/editor/merits.js:512`; missing edge coverage at `server/tests/dbo-3-standing-merit-filter.test.js:139`, `server/tests/dbo-3-standing-merit-filter.test.js:174`, and `server/tests/dbo-3-standing-merit-filter.test.js:193`
- **Triggering input or sequence**: Call `buildMeritOptions(c, 'Mystery Cult Initiation')`, `buildMCIGrantOptions(c, 0, 'Mystery Cult Initiation')`, or `buildFThiefOptions('Mystery Cult Initiation')` with the rules cache containing the real MCI shape (`special: 'standing'`). The new predicate removes MCI from `qualified`, but each function's generic `currentName && !qualified.some(...)` block then appends it again as a selected `<option>`. The same applies to Professional Training. The added tests call all three builders only with `currentName === ''`.
- **Observable consequence**: A legacy row that already contains an invalid event-granted merit continues to present that merit as the selected option and can be left in place, despite the tests' and comments' “never offers” claim. Fresh selections are correctly blocked. A direct run of the real module produced selected MCI options from all three builders for this sequence.
- **Confidence**: High for the behavior (reproduced against the real module); medium for user impact because it requires an already-invalid legacy selection.

## Low

- [Pass 2] None found.

### [Pass 3a] The completed task promises a direct downtime-site test that was not delivered

- **Severity**: Low
- **File:line**: `specs/stories/dbo-3-xp-spend-standing-filter-bug.md:154`; `server/tests/dbo-3-standing-merit-filter.test.js:211`
- **Triggering input or sequence**: Compare checked-off Task 2 (“Direct-unit tests per site” for all three AC2 replacements) with the new test file. `buildMCIGrantOptions` and `buildFThiefOptions` are invoked, but the downtime `getItemsForCategory` site is checked only by slicing source text and matching the predicate call/import.
- **Observable consequence**: The task is marked complete without executing the downtime call site's real filter chain, so a runtime wiring/context regression there could escape this story's tests even while the source-contract assertions pass.
- **Confidence**: High that the completed-task claim is false literally; medium on practical risk because `currentChar` is module-private and the production line itself is straightforward.

### [Pass 3b] The Dev Agent Record overcounts the new suite by four tests

- **Severity**: Low
- **File:line**: `specs/stories/dbo-3-xp-spend-standing-filter-bug.md:338`; `server/tests/dbo-3-standing-merit-filter.test.js:99`
- **Triggering input or sequence**: Run the new test file alone and count its `it(...)` declarations. It has 16 tests: 4 predicate tests, 10 direct builder tests (4 + 3 + 3), and 2 source-contract tests. The record claims 20 total and 12 direct builder tests.
- **Observable consequence**: The completion record overstates delivered coverage. The aggregate targeted-gate claim is separately correct: the observed gate is exactly 68 passed / 1 failed / 69 total.
- **Confidence**: High; Vitest reported 16/16 and `rg` counted the same 16 declarations.

### [Pass 3b] The discrimination result has the right count but attributes one failure to the wrong layer

- **Severity**: Low
- **File:line**: `specs/stories/dbo-3-xp-spend-standing-filter-bug.md:181`; `server/tests/dbo-3-standing-merit-filter.test.js:99`
- **Triggering input or sequence**: Temporarily change `isMeritEventGranted` to `return false;` and run the new suite. Exactly four tests fail, but they are one direct predicate test plus one test at each of the three builder sites. They are not four picker-site tests “across the three directly-testable sites” as the checked-off task states.
- **Observable consequence**: The record slightly overstates site-level discrimination coverage; three builder-site tests, not four, distinguish the broken predicate through picker output.
- **Confidence**: High; reproduced with the exact four failing test names, then restored to 16/16 green.

### [Pass 1] The predicate comment misstates the change as four replacements

- **Severity**: Low
- **File:line**: `public/js/editor/merits.js:23`
- **Triggering input or sequence**: Read the new `isMeritEventGranted` documentation together with the four hunks in the supplied diff. The comment says every one of the predicate's four call sites "used to check" `rule.sub_category === 'standing'`, but the diff shows three replacements (`buildMCIGrantOptions`, `buildFThiefOptions`, and `getItemsForCategory`) plus one newly introduced exclusion in `buildMeritOptions`.
- **Observable consequence**: Future maintainers are given a false history of `buildMeritOptions` and may incorrectly assume its new event-granted exclusion merely preserves prior behavior rather than expanding that picker's filter. Runtime behavior is unaffected.
- **Confidence**: High; this is directly contradicted by the supplied diff.

## Validation notes

### Pass order and files opened

- **Pass 1**: Opened only `specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-diff.txt`. I did not open repository source, tests, the story, or tracking files before freezing Pass 1.
- **Pass 2**: Directly opened the relevant portions of `public/js/editor/merits.js` and `public/js/tabs/downtime-form.js`, all of `public/js/data/loader.js`, all of `public/js/data/prereq.js`, all of `server/tests/issue-896-availability-filter.test.js`, and lines 230–252 of `server/tests/n7-n9-allocator-readers.test.js`. I also inspected matching lines in `public/js/editor/sheet.js`, `public/js/admin/rules-view.js`, `public/js/admin/data-portability.js`, `public/js/editor/edit-domain.js`, `public/js/editor/xp.js`, `public/js/tabs/ordeals-view.js`, and matching server scripts/tests returned by the required whole-tree searches. I read `public/js/editor/merits.js` from base/main through `git show` for the regex comparison.
- **Pass 2 blindness caveat**: I did not directly open the story file, but one over-broad whole-repository `rg` command accidentally returned matching lines from `specs/stories/sprint-status.yaml` and existing code-review run/review files, including an author-summary line. That means Pass 2 was not perfectly uncontaminated despite the intended exclusion. The command timed out with truncated output. I did not revise Pass 1, and the Pass 2 current-selection finding was derived and reproduced from runtime code, but I cannot honestly attest to perfect Pass 2 blindness.
- **Pass 3a**: First used a heading-only search to establish boundaries, then opened only story lines 7–16, 61–140, 141–188, and 189–285 (Story; What this story is NOT; Acceptance Criteria; Tasks/Subtasks; Dev Notes). I froze Pass 3a before opening line 286 onward.
- **Pass 3b**: Opened the Dev Agent Record (story line 286 to EOF) and the #1115 line in `CLAUDE.md`; re-read the relevant source/test output through test failures and `git show main`.
- I stayed inside `D:\Terra Mortis\TM Suite` and did not access sibling repositories.

### Commands run and observed results

Pass 1:

- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-diff.txt'` — succeeded and returned the supplied three-file diff.

Pass 2 repository inspection:

- `rg -n "^(export )?function (buildMeritOptions|buildMCIGrantOptions|buildFThiefOptions)|^function getItemsForCategory|^export (async )?function renderDowntimeTab|^export \{.*renderDowntimeTab" public/js/editor/merits.js public/js/tabs/downtime-form.js` — succeeded; located lines 336, 437, 491, 1373, and 4141.
- `rg -n "^(export )?(async )?function (getRulesDB|getRulesByCategory)|^function (_meetsPrereq|_getStatus)|^export function (_meetsPrereq|_getStatus)" public/js/data/loader.js public/js/data/prereq.js` — succeeded; located loader lines 107/128 and prereq line 21.
- `rg -n "\.special\b|sub_category" public/js server` — the initial parallel invocation timed out after about 23 seconds; it returned partial matches. Narrower searches below completed.
- The two function-location searches above were also rerun individually and succeeded with the same results.
- `Get-Content ... merits.js | Select-Object -Skip 300 -First 240`; `Get-Content -Raw ... loader.js`; `Get-Content -Raw ... prereq.js`; `Get-Content ... downtime-form.js | Select-Object -Skip 1350 -First 95`; and `Get-Content ... downtime-form.js | Select-Object -Skip 4120 -First 175` — all succeeded.
- `Get-Content -Raw ... issue-896-availability-filter.test.js`; `Get-Content ... n7-n9-allocator-readers.test.js | Select-Object -Skip 229 -First 23`; and `rg -n "currentChar\s*=|\bcurrentChar\b|export" public/js/tabs/downtime-form.js` — all succeeded. A following complex quoted equality search exited 1 without usable output; it was replaced by the simpler searches below.
- `rg -n --glob '*.js' --glob '!node_modules/**' 'sub_category.*standing|special.*standing' public/js server` — succeeded but included a very large `dev-fixtures.js` line and was output-truncated; the relevant executable matches were the new predicate and an archived seed helper.
- `rg -n --glob '*.js' --glob '!node_modules/**' --glob '!dev-fixtures.js' '\.special\b' public/js server` — succeeded; no missed live picker reader was found.
- `rg -n --glob '*.js' --glob '!dev-fixtures.js' 'sub_category' public/js` — succeeded; no fifth `standing` picker filter was found.
- The first PowerShell gap-measurement command failed with `ParserError: An empty pipe element is not allowed`; the corrected command succeeded and reported the source contract false on current and base `1063787b`, with all candidate distances above 600.
- `git rev-parse main` plus `git show 'main:public/js/editor/merits.js'` and the regex/distance calculation — succeeded; main is `1063787b4b4f79838265eb8f1217a72df51d4e99`, contract match `False`, declaration-to-call distance 887.
- `rg -n "getItemsForCategory\(|buildMeritOptions\(|buildMCIGrantOptions\(|buildFThiefOptions\(" public/js --glob '*.js' --glob '!dev-fixtures.js'` — succeeded and located the live sheet/downtime uses.
- `Get-Content ... downtime-form.js | Select-Object -Skip 4325 -First 85` — succeeded and showed no downtime current-item reinsertion.
- The broad whole-repository `rg -n "buildMCIGrantOptions|buildFThiefOptions|buildMeritOptions" ...` timed out after about 33 seconds with truncated output; it caused the Pass 2 blindness caveat above.
- The inline Node browser-shim driver that seeded `tm_rules_db` and called all three builders succeeded. Empty `currentName` excluded MCI; passing MCI as `currentName` returned it as a selected option from all three builders.
- One over-quoted `rg` for the passthrough lines exited 1; `rg -n 'currentName && !qualified' public/js/editor/merits.js` then succeeded at lines 369, 462, and 512.

Pass 3 story reads:

- `rg -n '^#{1,3} ' specs/stories/dbo-3-xp-spend-standing-filter-bug.md` — succeeded and established section boundaries.
- Four bounded `Get-Content | Select-Object` commands for lines 7–16, 61–140, 141–188, and 189–285 — all succeeded without entering the Dev Agent Record.
- `Get-Content ... | Select-Object -Skip 285` — run only after Pass 3a was frozen; succeeded and returned the complete Dev Agent Record.

Pass 3b tests and claim checks:

- Required gate, run before and after mutations: `cd server && npx vitest run tests/dbo-3-standing-merit-filter.test.js tests/n7-n9-allocator-readers.test.js tests/issue-896-availability-filter.test.js` — both runs reported exactly **3 files: 2 passed / 1 failed; 69 tests: 68 passed / 1 failed**. The sole failure was `n7-n9-allocator-readers.test.js:246`.
- `cd server && npx vitest run tests/dbo-3-standing-merit-filter.test.js` — baseline and restored runs each reported **16/16 passed**.
- `rg -n '^\s*it\(' server/tests/dbo-3-standing-merit-filter.test.js` — succeeded with `COUNT=16`.
- `git hash-object public/js/editor/merits.js` — before mutations and after both restorations returned the same hash, `d5faf99fd938f4d6267a84d50b7d4cda88349910`.
- Initial `git diff -- public/js/editor/merits.js; git status --short` — showed the expected story diff and a heavily pre-existing dirty/untracked workspace. Output was truncated because status is very large; this review did not clean or alter those user files.
- With a temporary doc-comment line containing `buildMeritOptions meritPrereqOK(c, rule)`, `cd server && npx vitest run tests/n7-n9-allocator-readers.test.js` falsely reported **25/25 passed**. After removing it, the same command reported **24 passed / 1 failed**, confirming the current comment no longer creates the false pass.
- `git diff --check -- public/js/editor/merits.js` — exit 0 after restoration, with only Git's existing LF/CRLF conversion warning.
- With the predicate temporarily changed to `return false;`, the new suite reported **12 passed / 4 failed**: the predicate true-case plus one MCI/PT-output test in each of the three builders. After restoration it returned to **16/16 passed**.
- `rg -n '#1115|1115|n7-n9-allocator-readers' CLAUDE.md` — succeeded and found the documented issue at line 41.
- `git diff --name-only 1063787b -- server/schemas/purchasable_power.schema.js public/js/admin/rules-view.js public/js/data/loader.js public/js/editor/edit-domain.js` — returned no changed paths (plus a global-ignore permission warning), confirming the explicitly excluded code files were untouched.
- The final `git show main` regex check again reported contract match `False` and declaration-to-call distance 887, substantiating that #1115 exists on main independently of this change. I did not reproduce the author's historical `git stash` action itself.
- `Get-Content -Raw specs/stories/code-review/dbo-3-xp-spend-standing-filter-bug-codex-findings.md` — succeeded as a final report-integrity read.
- Final targeted `git hash-object` / `git status --short -- <four review paths>` — source hash remained `d5faf99fd938f4d6267a84d50b7d4cda88349910`; status showed the three expected pre-review story paths (`M` merits, `M` downtime, untracked new test) plus this untracked findings report, and the same global-ignore permission warnings.

### Could not run / restoration and ship assessment

- I did not directly invoke downtime-form's module-private `getItemsForCategory`; there is no exported setter for `currentChar`, and exercising it through `renderDowntimeTab` would require the full fake-DOM/API harness. Its story coverage remains source-contract only.
- I could not verify the historical fact that the author personally used `git stash`; I verified the substantive baseline claim against `main` via `git show` and the exact regex instead.
- I did not connect to `tm_suite`, so the story's historical live-data query was not independently rerun. No database was needed for any requested suite.
- Temporary edits were limited to the two requested experiments in `public/js/editor/merits.js`; both were removed. The final source hash exactly matches the pre-experiment hash. The workspace was already heavily dirty, so an overall clean `git status --short` was impossible; the only persistent file created/edited by this review is this requested findings report.
- **Ship assessment**: Needs patches before shipping as written. The fresh-selection fix works and the targeted gate matches 68/69, but the current-value passthrough violates AC3's “ANY character” wording, AC4 is internally impossible at the FThief site, the downtime task overclaims direct coverage, and the Dev Agent Record must be corrected from 20 tests to 16. None is an architectural blocker, but the code/spec/test contract is not ready to approve as-is.
