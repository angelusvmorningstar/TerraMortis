# Adversarial review findings — issue-1128-oversized-merit-dots

## High

- None found.

## Medium

### [Pass 1] The Contacts header changes its suspension source as well as its presentation helper

- **Severity:** Medium
- **File:line:** `public/js/editor/sheet.js:1040`
- **Triggering input or sequence:** Render the influence section in edit mode for a character with a Contacts merit; the changed expression now calls `shSuspendedOf(contactsEntry)` where the old expression called `shSuspendedOf(m)`.
- **Observable consequence:** From the diff alone, `m` and `contactsEntry` cannot be shown to identify the same merit. If both are live and differ, the cosmetic wrapper fix also changes which merit supplies the suspension count, potentially showing the wrong number of solid Contacts dots. This requires Pass 2 scope tracing before it can be classified as a defect or an incidental correction.
- **Confidence:** High that the behavior-affecting substitution exists; unresolved from the Pass 1 artifact whether the new or old source is correct.

### [Pass 2] Resolution of Pass 1: `contactsEntry` fixes an existing Contacts edit-mode crash

- **Severity:** Medium
- **File:line:** `public/js/editor/sheet.js:1040`
- **Triggering input or sequence:** On base commit `158a713f`, render `shRenderInfluenceMerits(c, true)` for a character containing a Contacts merit. The only `m` binding in the preceding code is the `let`-scoped parameter of `nonContacts.forEach(m => { ... })`, whose callback has already returned; the live merit at the header is `contactsEntry`.
- **Observable consequence:** The old code throws `ReferenceError: m is not defined` and aborts the influence edit-section render. A direct import of the base commit’s archived `public` tree reproduced that exact exception. The changed argument does not introduce a regression; it repairs the stale reference and lets the Contacts block render using its own `_suspended_dots` value.
- **Confidence:** High; confirmed both by lexical scope tracing and execution against the base-commit module tree.

## Low

### [Pass 1] The AC4 test does not actually measure whether five dots fit in 60px

- **Severity:** Low
- **File:line:** `server/tests/issue-1128-dot-wrapper.test.js:227`
- **Triggering input or sequence:** Run the test with any renderer that returns five bare dot characters but whose effective `.infl-dots-derived` font, tracking, padding, or grid sizing makes those characters wider than 60px.
- **Observable consequence:** The test named “no wider than main” passes because it checks only the string `●●●●●` and JavaScript length 5; it never performs layout or inspects computed width. A future CSS/layout regression could violate the stated fit property while this check stays green.
- **Confidence:** High; this is a test-strength limitation, not evidence that the current CSS is wrong.

### [Pass 1] The call-site census can count uncommented block-comment continuation lines as code

- **Severity:** Low
- **File:line:** `server/tests/issue-1128-dot-wrapper.test.js:437`
- **Triggering input or sequence:** Put a commented-out `shDotsSuspended(` example on a block-comment continuation line whose trimmed text begins with neither `/*` nor `*` (or after live code in a trailing comment).
- **Observable consequence:** `codeLines()` retains the text, inflating the regex census or satisfying a bucket substring check without a real call site. The visible hunks do not establish whether such a line exists elsewhere in the source, so Pass 2 must check the real file.
- **Confidence:** High that the parser is incomplete; low, pending Pass 2, that current source is miscounted.

### [Pass 2] Compound-target “My dots” ignores a real suspension that its adjacent total applies

- **Severity:** Low
- **File:line:** `public/js/editor/sheet.js:1303`
- **Triggering input or sequence:** Give a character a collective-compound target merit with own grant dots, break an oath pledging dots from that merit so `applySuspensions` writes `_suspended_dots`, then render the domain section in edit mode.
- **Observable consequence:** `_cmpDotsHtml` routes the adjacent cumulative “Total” through `shDotsSuspended(..., shSuspendedOf(m))`, but “My dots” renders `●.repeat(_cmpOwn)` directly and continues to show every own dot as usable. The same row can therefore display contradictory effective counts. `git blame` against `158a713f` attributes the direct-repeat branch to commit `92f2a4884`, and this patch leaves it byte-identical, so this is a separate pre-existing gap rather than an issue-1128 regression.
- **Confidence:** High from the two adjacent expressions and the verified `_suspended_dots` data shape; not behaviorally exercised in a dedicated new test during Pass 2.

### [Pass 3b] The Dev Agent Record overstates two otherwise well-tested boundaries

- **Severity:** Low
- **File:line:** `specs/stories/issue-1128-oversized-merit-dots.story.md:360`, `specs/stories/issue-1128-oversized-merit-dots.story.md:406`
- **Triggering input or sequence:** Read Completion Notes 3 and 8 literally, then compare them with the diff and the new suite.
- **Observable consequence:** “Nothing else on those lines changed” is false for the Contacts line, which also changes `m` to `contactsEntry`; “never a glyph tally” is false for the suite as a whole, which counts hollow and solid glyphs at test lines 329-332 and asserts string length at line 236. The record openly discloses the Contacts scope addition later, and the glyph counts supplement rather than replace the byte-exact AC1 checks, so neither wording error undermines implementation correctness. They do make the completion summary less exact than the evidence beneath it.
- **Confidence:** High; both statements and their counterexamples are explicit in the reviewed files.

### [Pass 3b] The claimed browser screenshots are not available for independent review

- **Severity:** Low
- **File:line:** `specs/stories/issue-1128-oversized-merit-dots.story.md:397`
- **Triggering input or sequence:** Search the workspace for issue-1128 or dot-wrapper image artifacts after the record says screenshots were taken in both themes.
- **Observable consequence:** No matching screenshot is present in the repository, so the existence/content of those screenshots is unverifiable from this workspace and may depend on an external PR attachment. This is an evidence-retention gap only: an independent Playwright/Chrome run reproduced the claimed fixed layout in both themes and the old-wrapper overflow measurements.
- **Confidence:** High that no identifiable artifact is in the workspace; unknown whether screenshots exist outside it.

## Pass 1 resolved checks

- `shDotsMixed(0, 0)` still returns `''`: `_shDotGlyphs` returns `''`, and the conditional wrapper stays absent. For the inputs accepted by the old implementation, the extraction preserves the original glyph order and wrapping behavior.
- `/shDotsSuspended\(/g` does not match `shDotsSuspendedPlain(`: after the shared `shDotsSuspended` prefix, the latter has `P`, not `(`. The plain calls therefore do not inflate the wrapped count.
- The compound-target `\u25CF.repeat(_cmpOwn)` line is context only, with no `-`/`+` marker. Its lack of suspension awareness is a pre-existing, related observation rather than a regression introduced by this diff; Pass 2 will determine whether it merits a separate repository-level note.
- No dead import or newly contradictory runtime comment was visible in the diff.

## Pass 2 resolved checks

- The real source contains exactly six live `shDotsSuspendedPlain(` calls and six live `shDotsSuspended(` calls, plus one declaration of each. Every live call occupies an ordinary code line; the only comment occurrences are the two `*`-prefixed documentation lines that `codeLines()` removes. The incomplete comment parser therefore causes no current false positive or false exclusion.
- A direct character check returned `wrapped: false` and `plain: true` for `shDotsSuspendedPlain(`. The census regexes are independent in the real source.
- `shDotsThreeTier` does not call `shDotsMixed`. Every other `shDotsMixed` caller was inspected: domain totals/cap displays, virtual and view domain rows, and fighting-style/fighting-merit view rows pass the same purchased/bonus bands as before. A scripted old-versus-new comparison over `undefined`, `null`, zero, positive integers, `NaN`, `-1`, and numeric strings produced no differing return value or exception class.
- Negative purchased/bonus values retain the old behavior: the suspension path still floors `purchased - n` at zero only when a positive suspension exists, while invalid negative repeat counts otherwise still throw `RangeError`. Normal call sites derive counts from non-negative merit fields and/or `Math.max(0, ...)`; the refactor neither adds nor removes defensive handling.
- `_shDotGlyphs`, `_shSuspendBands`, `shDotsSuspended`, `shDotsSuspendedPlain`, and `shSuspendedOf` are read-only. The six changed render expressions only read merit fields. No new mutation of `c` or `m` was introduced.
- The new fixtures use the production shape correctly: `applySuspensions` writes transient `m._suspended_dots`, and `shSuspendedOf` reads precisely that property. The new suite passed `33/33` tests in `1` file during Pass 2.

## Pass 3a acceptance audit

- No new High, Medium, or Low findings were identified before reading the Dev Agent Record.
- **AC1:** all six named small-container expressions call the bare-output sibling, and the no-oath golden test asserts exact container contents with no element wrapper.
- **AC2:** both wrapped and plain paths share `_shSuspendBands`; the source census confirms the purchased-minus-suspended expression exists once, and the suite behaviorally exercises every repointed container.
- **AC3:** the unchanged compound branch and changed normal branch both emit bare content inside `.dom-contrib-lbl`.
- **AC4:** the automated check does not measure layout (the Pass 1 Low finding remains), but the implementation restores the exact five-glyph markup used by `main` and changes no CSS, so no literal implementation contradiction is visible. The task’s claimed two-theme browser check remains for Pass 3b.
- **AC5:** the committed test asserts counts of six plain and six wrapped call sites and contains an exact string entry for each site.
- **AC6:** the implementation diff contains no CSS file, selector, token, colour, or newly added inline `style=`.
- **AC7:** all six Bucket B call expressions remain outside the changed source lines. Their shared `shDotsMixed` implementation was refactored, but scripted equivalence and the zero-dot check establish byte-identical output.
- **AC8:** the test commits literal `MAIN_GOLDEN` container strings and explains their claimed capture origin. Whether the Dev Agent Record actually records the required before/after result, and whether the constants match live `origin/main`, is deferred to Pass 3b as instructed.
- **AC9:** the exact required combined gate is deferred to Pass 3b as instructed.
- The diff does not touch the compound-target branch, any of the six Bucket B call expressions, CSS, oath handlers, pledged-dot write gates, persistence, schema, API, or any broader suspension rule. The `m` to `contactsEntry` correction is broader than a mechanical helper rename on that one line, but is required for AC2’s Contacts case and repairs a demonstrated `ReferenceError`; it does not alter a valid pre-existing dot calculation.

## Pass 3b claim audit and ship decision

- **Decision:** Ready to ship as-is. No blocking implementation defect or required patch was found.
- The new suite reported **33/33 tests in 1/1 file**. The exact required gate reported **137/137 tests in 5/5 files** on its first run; it agreed with the record, so no second run was necessary. The two additional collective suites reported **59/59 tests in 2/2 files**.
- `node --check public/js/editor/sheet.js` exited 0 with no output. `git diff --check 158a713f -- public/js/editor/sheet.js` also exited 0.
- Local `origin/main` resolved to `4726a1bf27066891eb64f610a147be0df373903e`. I archived its full `public` tree and executed its renderer with the committed fixture, rather than reasoning from a lone `sheet.js`. It produced exactly the committed goldens: `●●●○○`, `Contacts ●●○○`, `My dots: ●●●○`, `●●○`, `○○`, and `●●●●●`. The fixed tree independently produced the same JSON capture.
- A full-tree archive of base `158a713f` executed with a Contacts fixture threw `ReferenceError: m is not defined`; the current renderer returned a Contacts header successfully. The record’s crash scope and `contactsEntry` correction are accurate.
- `git diff --unified=2 158a713f -- public/js/editor/sheet.js` has exactly **8** hunks. Comparing all six Bucket B expressions at base/current line pairs `1024/1064`, `1050/1090`, `1212/1252`, `1552/1592`, `1733/1773`, and `2079/2119` found no changed bytes; a zero-context diff search returned no Bucket B changed line.
- An independent headless Chrome render under the real stylesheet measured the fixed five-dot `.infl-dots-derived` element in both Parchment and dark as `clientWidth=60`, `scrollWidth=60`, `clientHeight=12`, `scrollHeight=12`, `font-size=11px`, bare `innerHTML=●●●●●`. Injecting the pre-fix wrapper measured `scrollWidth=62`, child width `57.8125px`, `font-size=15px`, and `letter-spacing=2.5px`, matching the rounded figures in the record.

## Validation notes

### Pass boundaries and files opened

- Before Pass 1, I opened the review-instruction file supplied by the user: `specs/stories/code-review/issue-1128-oversized-merit-dots-codex-review.md`. Because it was read with a whole-file command, this exposed all pass instructions at once. I cannot honestly attest that the instruction text itself remained unread ahead of each pass. I did preserve the substantive evidence boundary: Pass 1 opened only that instruction file and `specs/stories/code-review/issue-1128-oversized-merit-dots-diff.txt`, and its findings were written before any repository source or story content was opened.
- Pass 2 directly opened current `public/js/editor/sheet.js`, `public/js/data/rules-helpers.js`, `server/tests/issue-1128-dot-wrapper.test.js`, and relevant excerpts of `server/tests/oath-b-suspension.test.js`; it also opened `public/js/editor/sheet.js` from base `158a713f` through `git show`/`git archive`. No `AGENTS.md` exists in the workspace. I did not open the issue-1128 story during Pass 2.
- Pass 3a opened `specs/stories/issue-1128-oversized-merit-dots.story.md` only from its first line through the line before `## Dev Agent Record`. Its findings were written before the developer record was read.
- Pass 3b opened the Dev Agent Record remainder of that story, `public/css/components.css`, `package.json`, `package-lock.json`, `server/package.json`, `server/package-lock.json`, relevant `public/js/admin.js` and `public/js/editor/sheet.js` excerpts, and the current/base/main renderer dependency trees transitively through Node/Vitest. The local `origin/main` `public` tree was extracted to a unique system-temp directory, executed, and removed.
- I did not open sibling repositories.

### Commands run and real results

1. `Get-Content ...issue-1128-oversized-merit-dots-codex-review.md -Raw` succeeded and exposed the full review instructions; this is the procedural-blinding caveat above.
2. `Get-Content ...issue-1128-oversized-merit-dots-diff.txt -Raw` succeeded. Two `Select-String` passes over that diff located the Contacts change, AC4 test, `codeLines`, compound branch, and diff-file boundaries.
3. The first parallel Pass 2 batch (`rg --files -g AGENTS.md`, `git status --short`, two contextual `rg` searches, and `git diff 158a713f`) returned overall exit 1 because the no-match `AGENTS.md` search exited 1. Re-running the members individually confirmed no `AGENTS.md`; `git status --short` showed the expected modified source plus extensive pre-existing debris; the source/test searches and base diff succeeded.
4. Context reads used `rg -n -C ...` and numbered `Get-Content` slices over the influence renderer, dot helpers, every `shDotsMixed`/`shDotsSuspended*` caller, domain compound branches, production suspension helpers, and test fixtures. All succeeded. One attempted `Select-String -InputObject $lines` census was malformed and treated the array as one concatenated input; it produced unusable output and was replaced by `rg`/direct inspection.
5. `node -e` regex probe on `shDotsSuspendedPlain(` returned `wrapped:false`, `plain:true`, plus character positions. A scripted old/new `shDotsMixed` comparison over `undefined`, `null`, zero, positives, `NaN`, `-1`, and numeric strings printed no mismatches.
6. `git blame -L 1260,1265 158a713f -- public/js/editor/sheet.js` succeeded and attributed the direct compound “My dots” repeat to `92f2a4884`; the changed normal branch was later work. `git show 158a713f:public/js/editor/sheet.js | rg ...contacts...` confirmed the stale `m` expression at base line 1000.
7. `npx vitest run tests/issue-1128-dot-wrapper.test.js` reported **1 file passed, 33 tests passed**. Vitest also printed the non-failing `test.poolOptions` deprecation warning.
8. A standalone current-renderer Contacts script reported `CURRENT_OK true`. The first base-tree archive/reproduction command failed because this PowerShell version does not accept `New-Item -LiteralPath`; the directory was never created. The corrected command used `New-Item -Path`, archived base `158a713f`, and reported `BASE_THROW ReferenceError m is not defined`; its validated temp directory was removed.
9. The Pass 3a bounded `Get-Content` command found `## Dev Agent Record` and printed only preceding story lines. The Pass 3b bounded command then printed from that heading to EOF. Both succeeded.
10. The exact required gate, `npx vitest run tests/issue-1128-dot-wrapper.test.js tests/oath-b-suspension.test.js tests/oath-a-render-and-gate.test.js tests/n7a-necro-domain-render.test.js tests/stm-polish-408-dots.test.js`, reported **5 files passed, 137 tests passed**, exit 0, duration 2.76s. It matched the record on the first run.
11. `node --check public/js/editor/sheet.js` exited 0 with no output. `git diff --unified=2 ... | rg -c '^@@'` returned **8**. `git rev-parse origin/main` returned `4726a1bf27066891eb64f610a147be0df373903e`. The zero-context diff search printed only helper/Bucket A changes; a Bucket-B-specific changed-line search returned no matches (exit 1, as expected).
12. The first inline current-golden Node command failed due PowerShell quoting and because top-level `await` was not enabled. The corrected `node --input-type=module` command rendered the fixed fixture and printed the exact five-key golden JSON (six container values). A full `origin/main` archive/render printed identical JSON. Both renders also logged the fixture’s pre-existing `[merit-rating-mismatch] Contacts { stored: 4, expected: 2 }` warning; neither failed.
13. Base/current `rg` extracts printed all six Bucket B expressions at their old/new line numbers with identical text. `git diff --name-only 158a713f -- public/css` printed nothing. `git diff --stat 158a713f -- public/js/editor/sheet.js` reported `64` changed lines (`52 insertions`, `12 deletions`).
14. Screenshot/tool searches found no issue-1128 image artifact; dependency searches found local `@playwright/test`/`playwright 1.58.2`; Chrome and Edge executables exist; the CSS read confirmed `.infl-dots-derived` at 60px/11px and `.trait-dots` at 15px/2.5px. The `http-server` package was not installed.
15. Two scoped static-site browser commands started `python -m http.server 8098 --directory public` with a hidden window, ran local Playwright against installed Chrome, and stopped the exact server PID in `finally`. The first returned the identical fixed measurements in both themes; the second returned the old-wrapper `60/62` client/scroll widths and `57.8125px` child width. These were static frontend servers only, not the API server.
16. `npx vitest run tests/collective-1-virtual-rows.test.js tests/collective-2-compound-generalisation.test.js` reported **2 files passed, 59 tests passed**, exit 0. `git diff --check 158a713f -- public/js/editor/sheet.js` exited 0. Scoped status showed only the pre-existing modified `sheet.js`, pre-existing untracked new test, and this required findings file.
17. Additional `rg -n` checks located the Dev Agent Record’s screenshot, scope, and “never a glyph tally” claims and the test counterexamples at lines 236 and 329-332.
18. Final scoped `git status --short` showed modified `sheet.js` and `sprint-status.yaml`, plus untracked new test, story, and this findings file; `components.css` remained absent. A heading census over this file succeeded. `Get-NetTCPConnection -LocalPort 8098 -State Listen` returned `NO_LISTENER_8098`, confirming the static review server was stopped.

### Gaps, modifications, and prohibited actions

- I could not verify the claimed screenshot files themselves because no identifiable screenshot artifact exists in this workspace; they may be attached to an external PR. I independently reproduced the measurements instead.
- I did not run the full test suite, as instructed. I did not connect to MongoDB, start `server && npm run dev`, start any API process, commit, push, merge, deploy, or contact any external service.
- I created only this required findings file. I did not modify the implementation, test, story, tracking, CSS, or any sibling repository file. Temporary base/main archives were created under unique system-temp paths and removed after use. Two short-lived static Python servers were stopped by their captured process IDs.
- The working tree was already dirty with `public/js/editor/sheet.js`, `specs/stories/sprint-status.yaml`, the new test/story artifacts, and extensive unrelated untracked debris. Scoped status at the end shows no unintended change to the implementation files from this review; the only review-created path is `specs/stories/code-review/issue-1128-oversized-merit-dots-codex-findings.md`.
