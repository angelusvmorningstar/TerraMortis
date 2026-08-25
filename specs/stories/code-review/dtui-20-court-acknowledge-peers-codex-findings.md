# Adversarial review findings — dtui-20 Court Acknowledge Peers

## High

- None found.

## Medium

### [Pass 1] Restored non-attendee selections can consume the cap but cannot be removed

- **Severity:** Medium
- **File:line:** `public/js/tabs/downtime-form.js:7107-7116`, `public/js/tabs/downtime-form.js:3141-3153`
- **Triggering input or sequence:** Load a saved `rp_shoutout` value containing one or more characters who are no longer in `lastGameAttendees`. The renderer gives each such chip both `dt-chip--selected` and native `disabled`; then try to remove that old pick or, with three such saved picks, select a current attendee.
- **Observable consequence:** A player cannot click a disabled selected chip to clear it, while the delegated handler counts its selected class toward the three-pick cap. Three stale selections lock out every current attendee; one or two stale selections reduce the usable current-attendee slots. The new AC6 test explicitly establishes the selected-and-disabled state but does not exercise recovery from it.
- **Confidence:** High that the state and lockout follow from the diff; whether product intent deliberately requires immutable historical picks is unknown in this blind pass.

### [Pass 1] Toggle state is exposed only visually, not to assistive technology

- **Severity:** Medium
- **File:line:** `public/js/tabs/downtime-form.js:3147-3153`, `public/js/tabs/downtime-form.js:7113-7116`
- **Triggering input or sequence:** Navigate the enabled Acknowledge Peers buttons with a screen reader, select an attendee, and inspect the button's accessible state before and after the click.
- **Observable consequence:** Selection changes only the `dt-chip--selected` CSS class. The buttons never receive or update `aria-pressed`, so a non-visual user is not told which peers are selected even though the control is a persistent toggle grid.
- **Confidence:** High.

### [Pass 2] An immediate unrelated re-render can discard a just-clicked shoutout selection

- **Severity:** Medium
- **File:line:** `public/js/tabs/downtime-form.js:281-288`, `public/js/tabs/downtime-form.js:2770-2775`, `public/js/tabs/downtime-form.js:3141-3153`, `public/js/tabs/downtime-form.js:7028-7029`
- **Triggering input or sequence:** Click Alice, then within the two-second `scheduleSave()` debounce change a `[data-merit-toggle]` control. The shoutout handler changes only the chip class and hidden input; the merit handler calls `updateMeritSections()` → `renderForm(container)` without first calling `collectResponses()` or writing the shoutout value into `responseDoc.responses`.
- **Observable consequence:** `renderQuestion()` rebuilds the grid from stale `responseDoc.responses`, so Alice becomes unselected and the hidden value reverts. The pending local/server timers subsequently collect the already-reverted DOM and persist the loss. Other direct re-render paths that do not collect first have the same risk.
- **Confidence:** High from the synchronous call path and the explicit 2,000 ms debounce. A temporary Playwright proof was attempted: the first version passed because Playwright steps left enough time for autosave; a same-task retry did not complete before the runner timeout, so this finding is code-traced rather than runtime-confirmed.

## Low

### [Pass 1] The shared picker callback retains a now-unused `site` contract

- **Severity:** Low
- **File:line:** `public/js/tabs/downtime-form.js:1824`, `public/js/tabs/downtime-form.js:1840`
- **Triggering input or sequence:** Mount any remaining `[data-cp-mount]` placeholder; `mountCharPickers()` still reads `data-cp-site` and passes `site` into `_makeCharPickerOnChange(site, hiddenId, cardinality)`.
- **Observable consequence:** `site` is now silently ignored, leaving misleading shared-infrastructure metadata and an API parameter that suggests site-specific behavior still exists. This is not itself a runtime failure, but it makes future callers easier to misread and is evidence that the deleted behavior depended on a contract the signature still advertises.
- **Confidence:** High that the argument is unused; no conclusion about all remaining callers is made until Pass 2.

### [Pass 1] The saved-selection test can pass while the submitted hidden value is wrong

- **Severity:** Low
- **File:line:** `tests/dtui-20-court-acknowledge-peers.spec.js:226-237`
- **Triggering input or sequence:** Break only the initial hidden-input serialization for a prior response while leaving the chip classes derived from `selectedIds` intact, then run the test named `AC6: a saved selection restores...`.
- **Observable consequence:** The test still passes because it checks Bob and Charlie's CSS/disabled states but never asserts `#dt-rp_shoutout` retains the restored JSON. A subsequent save could therefore discard the restored selections without this acceptance test detecting it.
- **Confidence:** High.

### [Pass 2] The unused `site` parameter does not conceal a broken remaining picker caller

- **Severity:** Low
- **File:line:** `public/js/tabs/downtime-form.js:1810-1855`, `public/js/tabs/downtime-form.js:5699-5713`, `public/js/tabs/downtime-form.js:6073-6078`, `public/js/tabs/downtime-form.js:6731-6738`, `public/js/tabs/downtime-form.js:6797-6804`
- **Triggering input or sequence:** Mount `target-flex-multi`, `target-flex-single`, `project-target-char`, `mentor-target`, or `staff-target` through the generic `[data-cp-mount]` plumbing and change its selection.
- **Observable consequence:** Contrary to the concern preserved from Pass 1, there is no functional regression at these five sites: `target-flex-multi` still takes the `cardinality === 'multi'` JSON-array branch, and all four single-select uses still take the scalar branch. The remaining `site` argument is dead API surface only.
- **Confidence:** High from all five render sites and the sole `_makeCharPickerOnChange()` call path.

### [Pass 3a] AC6 deliberately requires the selected-and-disabled state flagged in Pass 1

- **Severity:** Low
- **File:line:** `specs/stories/dtui-20-court-acknowledge-peers.story.md:108-112`, `public/js/tabs/downtime-form.js:7107-7116`
- **Triggering input or sequence:** Reload a saved response containing a character who is no longer a current attendee.
- **Observable consequence:** The immutable stale selection and cap-consumption risk reported in Pass 1 is real behavior, but it is not an implementation deviation: AC6 literally requires that chip to be both selected and disabled and directs the author to flag awkwardness rather than invent a different UX. No additional AC1-AC7 or out-of-scope violation was found in Pass 3a.
- **Confidence:** High.

### [Pass 3b] The broad Vitest “clean” claim is unverifiable, and the requested focused gate is not clean

- **Severity:** Low
- **File:line:** `specs/stories/dtui-20-court-acknowledge-peers.story.md:247-250`, `server/tests/bl3a-one-inclan-implementation.test.js:376`
- **Triggering input or sequence:** From `server`, run `npx vitest run tests/dt-form-territory-fresh-fetch.test.js tests/bl3a-one-inclan-implementation.test.js tests/cm-3-derived-maintenance.test.js` in the current checkout.
- **Observable consequence:** The observed gate is 3 files total, 2 passed / 1 failed; 71 tests total, 70 passed / 1 failed. The failure is the unrelated existing BL-3a desktop CSS-selector assertion, not this story's JavaScript, but the focused current gate is still not clean. The record's much broader “4226 passed / 13 failed, all pre-existing” assertion was not reproduced and must remain unverified-as-stated rather than being treated as confirmation.
- **Confidence:** High for the focused result and the lack of full-suite verification; no claim is made here that the unrelated BL-3a failure was introduced by dtui-20.

### [Pass 3b] The Dev Agent Record omits the concrete AC6 open question

- **Severity:** Low
- **File:line:** `specs/stories/dtui-20-court-acknowledge-peers.story.md:108-112`, `specs/stories/dtui-20-court-acknowledge-peers.story.md:209-254`
- **Triggering input or sequence:** Restore three saved picks that are no longer attendees, then try to remove any of them or choose a current attendee.
- **Observable consequence:** The accepted selected-and-disabled combination creates the lockout described in Pass 1, yet the completion notes call the work exact and never surface this as the open product question explicitly requested by AC6/Implementation Notes if it proved awkward. Future reviewers therefore receive no warning that the accepted behavior can make the field uneditable.
- **Confidence:** High that the record omits it and that the lockout is reachable; whether the product owner wants a follow-up behavior change remains a product decision.

## Ship assessment

**Needs patches before shipping; no blocking/high-severity problem found.** The core AC1-AC7 behavior works and the six dedicated browser tests pass, but the handler should write canonical `responseDoc.responses` state before any possible re-render and expose its toggle state with `aria-pressed` (or the component contract's checkbox/`aria-checked` pattern). Add a regression for immediate re-render and assert the restored hidden JSON in AC6. The immutable stale-selection behavior is literally specified, so changing it needs a product decision; at minimum, record the open question as requested.

## Validation notes

### Pass boundaries and files opened

- **Pass 1:** Opened only `specs/stories/code-review/dtui-20-court-acknowledge-peers-diff.txt`; `public/js/data/helpers.js:220-222` solely to resolve `esc()`; and narrowly searched/read `public/js/tabs/downtime-form.js:1791-1833` plus symbol-match lines in that same diff-touched file. I did not open the story, surrounding repository files, or sibling repositories. Pass 1 was written in full before Pass 2 began.
- **Pass 2:** Opened/searched `public/js/tabs/downtime-form.js`, `server/routes/attendance.js`, `server/index.js` (search result only), `playwright.config.js`, `package.json`, and the repository's `tests`/`server/tests` trees for relevant references. I temporarily opened/edited `tests/dtui-20-court-acknowledge-peers.spec.js` only for the focused re-render probe. `rg --files -g AGENTS.md` found no repository `AGENTS.md`. I did not open the story. Pass 2 was written in full before Pass 3 began.
- **Pass 3a:** Opened only lines 9-169 of `specs/stories/dtui-20-court-acknowledge-peers.story.md` (story statement, Context, Files/Out of scope, AC1-AC7, and Implementation Notes). I first listed headings to locate the boundary; I did not read the Dev Agent Record. Pass 3a was written before Pass 3b.
- **Pass 3b:** Opened the Dev Agent Record at `specs/stories/dtui-20-court-acknowledge-peers.story.md:203-end`, `public/css/components.css:4787-5085` around the chip contract, and the files exercised or named by the requested gates/diff checks. The Vitest failure output also exposed the asserted `components.css` content and `server/tests/bl3a-one-inclan-implementation.test.js:376` failure site.
- The only non-repository files created were temporary `D:\tmp\dtui20-playwright.config.js` and `D:\tmp\dtui20-static-server.js`; both were deleted after use. No sibling Terra Mortis repository was read or touched.

### Command ledger, in execution order

1. `Get-Content -Raw specs/stories/code-review/dtui-20-court-acknowledge-peers-diff.txt` — succeeded; supplied the complete two-file diff.
2. `Select-String public/js/data/helpers.js -Pattern 'function esc|export.*esc|const esc' -Context 0,12` — succeeded; `esc()` replaces `&`, `<`, `>`, and `"` with HTML entities.
3. `Select-String public/js/tabs/downtime-form.js -Pattern '_makeCharPickerOnChange|_remountShoutoutPicker|site === ''shoutout''|data-shoutout-chip|data-sphere-char-target'` — succeeded; one helper call, no removed-symbol match, and distinct delegated-selector sites.
4. `Get-Content public/js/tabs/downtime-form.js` slice `[1790..1832]` — succeeded; inspected the sole generic mount call.
5. Initial combined `rg --files ...; rg -n "...data-cp-site=\"(...)\"..." ...` — failed before the search because PowerShell parsed the double-quoted alternation as commands (`target-flex-multi` not recognized). No conclusion was drawn from it.
6. Corrected single-quoted `rg --files -g 'AGENTS.md' ...` plus `rg -n 'renderForm...|lastGameAttendees|allCharacters|/api/attendance|data-cp-site=...' public/js/tabs/downtime-form.js server tests` — succeeded; no `AGENTS.md`, and returned the state/fetch/re-render/all-five-site locations.
7. `Get-Content` slices `[1525..1600]` and `[1980..2070]`, `Get-Content server/routes/attendance.js [0..120]`, and `rg -n 'function (collect|gather|renderQuestion)|currentResponses|responses\[|...' downtime-form.js` — all succeeded; verified population, render state source, real API response, and collectors.
8. `Get-Content downtime-form.js [410..585]`, `rg -n -B6 -A3 'renderForm\(container\)'`, slices covering the five picker render sites, and `[3095..3180]` — succeeded; the aggregated output was truncated, so subsequent focused reads were used for conclusions.
9. `Get-Content downtime-form.js [1160..1340]`, `[2280..2430]`, `rg -n -B4 -A4 'updateMeritSections\(|handleSubmitFinalConfirm\(|renderForm\(document.getElementById'`, and `rg -n 'data-shoutout-chip|data-sphere-char-target' ...` — succeeded; established the 2,000 ms debounce and direct re-render paths.
10. A four-command parallel inspection (`[1810..1865]`, picker-site test grep, `[2670..2790]`/`[2960..3140]`, and `git status`/`git diff`) returned overall exit 1 because the picker-site test grep had no matches; the useful reads were repeated explicitly rather than relying on this failed orchestration.
11. Repeated `Get-Content downtime-form.js [1810..1865]`, `[2670..2790]`/`[2960..3140]`, and `git status --short; git diff -- ...` — succeeded. Status then showed only untracked review inputs/outputs, with no tracked source change.
12. `curl.exe -s http://localhost:8080/ | Select-String '<title>.*</title>'` — succeeded and returned `<title>TM Admin</title>`; the documented hazard was live.
13. `Get-Content -Raw playwright.config.js; Get-Content -Raw package.json` — succeeded; confirmed base URL/server configuration and installed tooling.
14. Temporary focused Playwright run, `npx playwright test tests/dtui-20-court-acknowledge-peers.spec.js --grep 'TEMP REVIEW' --config D:\tmp\dtui20-playwright.config.js` — failed before tests: web server timed out after 60 seconds because `npx http-server` attempted blocked registry access (`EACCES`).
15. `Get-ChildItem node_modules/.bin/http-server*; Get-ChildItem node_modules/http-server/bin/http-server` — failed on the absent package path; this established local `http-server` was unavailable.
16. `Get-ChildItem node_modules/.bin -Filter 'http-server*'; Test-Path node_modules/http-server; Get-ChildItem ... -Filter 'serve*'` — succeeded; `http-server` false, local `serve` binaries present.
17. Focused run with local `serve`, same Playwright command/config — the temporary test reported **1 passed (3.0s)**, but the shell command timed out after 121.8 seconds because the server process did not terminate. This first probe was non-diagnostic because separate Playwright steps allowed autosave to win.
18. `curl.exe -s http://127.0.0.1:8099/ | Select-String '<title>.*</title>'` — returned `NO_TITLE_OR_NO_SERVER` after that run.
19. Same-task tightened focused run with `--reporter=line` — shell timeout after 46.9 seconds; it reached `Running 1 test` but produced no completed test result, so the race was not runtime-confirmed.
20. `git diff --exit-code -- tests/dtui-20...; Test-Path temp config; Get-NetTCPConnection -LocalPort 8099` — found one accidental blank line after temporary-test removal, confirmed temp config removed and port clear.
21. After removing that blank line, `git diff --exit-code -- tests/dtui-20...` — succeeded with `TEST_FILE_RESTORED_EXACTLY`.
22. `Select-String` story headings — succeeded and located the Dev Agent Record at line 203 without reading its contents.
23. `Get-Content story` slice `[8..168]` — succeeded; Pass 3a's permitted sections only.
24. `Get-Content story` slice `[202..end]` — succeeded after Pass 3a was frozen; read the Dev Agent Record in full.
25. Required Vitest gate: `cd server && npx vitest run tests/dt-form-territory-fresh-fetch.test.js tests/bl3a-one-inclan-implementation.test.js tests/cm-3-derived-maintenance.test.js` — **3 files: 2 passed / 1 failed; 71 tests: 70 passed / 1 failed**. Failure: `bl3a-one-inclan-implementation.test.js:376`, missing expected `.sh-desktop .sh-edit-select-sub{...font-size:10px` CSS shape. Duration 3.19s; command exit 1.
26. Rechecked `curl.exe -s http://localhost:8080/ ... <title>` immediately before the Playwright gate — again `<title>TM Admin</title>`.
27. Required Playwright command, `npx playwright test tests/dtui-20-court-acknowledge-peers.spec.js`, run after temporarily pointing the existing config at an isolated standard-library TM Game server on `127.0.0.1:8099` — **6 passed / 0 failed** (individual times 973ms, 629ms, 723ms, 715ms, 536ms, 485ms). The shell wrapper timed out at 181.9 seconds after all six results printed because the web-server process did not terminate, so a clean process exit was not observed.
28. `git diff --exit-code -- playwright.config.js; Test-Path D:\tmp\dtui20-static-server.js; Get-NetTCPConnection -LocalPort 8099` — content restore succeeded, temp server removed, port clear.
29. AC7/API/file checks: `rg -n "_remountShoutoutPicker|site === 'shoutout'" downtime-form.js`, added-line API grep over `git diff b95f368a`, `git diff --name-status b95f368a --` scoped files, and base diff for `character-picker.js` — **zero AC7 matches; no added API calls; only `downtime-form.js` modified and the new spec added; `character-picker.js` unchanged from base**.
30. `rg -n -A45 -B8 '\.dt-chip-grid|\.dt-chip--selected|\.dt-chip\[disabled\]' public/css/components.css public/css/*.css` — returned the relevant component rules/ARIA contract, then exit 1 because PowerShell/Windows rejected the literal wildcard path argument. The explicit `components.css` results were valid and used.
31. `Select-String story -Pattern '6/6|4226|AC7 verified|no new API call|character-picker.js.*untouched|open question'` — succeeded; located each record claim.
32. Final restore checks included `git diff --exit-code` for source/test/config, `git hash-object` versus `git rev-parse :playwright.config.js`, `git ls-files --eol`, `git status --porcelain=v2`, and `git ls-files --debug` — normalized content hashes matched and no source/test content diff existed, but the temporarily edited config initially retained mixed/LF working-tree line endings.
33. A mechanical CRLF normalization of `playwright.config.js` followed by `git ls-files --eol`, length, `git diff --exit-code`, and `git status --short` — restored the original `w/crlf`, 417-byte form; no tracked modification remains.
34. Final `git diff --exit-code --` for `downtime-form.js`, the new Playwright spec, and `playwright.config.js`, followed by `git status --short` and a tail read of this report — returned `FINAL_TRACKED_REVIEW_TARGETS_CLEAN`; status contained only the four attested untracked review files.

`apply_patch` was used to create/freeze this findings file after each pass, temporarily add/remove the focused test and configs, and restore them. The only shell write was the final mechanical line-ending normalization needed to return `playwright.config.js` to its original CRLF representation; its normalized blob hash already matched the index before that normalization, and `git status` cleared afterward.

### Could not run or fully verify

- The full `server/tests` regression cited as **4226 passed / 13 failed** was not run, per the review instruction's stated session limit. That claim is **UNVERIFIABLE-AS-STATED**.
- A default-config Playwright run against port 8080 was deliberately not treated as a code gate because both checks proved it was serving TM Admin. The isolated run exercised all six tests successfully, but its wrapper did not exit cleanly after printing the results.
- The immediate-re-render race was not conclusively reproduced at runtime: the first probe allowed autosave to fire, and the tighter probe timed out without a result. The finding is based on the synchronous source path and timer ordering, and is labeled accordingly.

### Final workspace state

- Temporary edits to `tests/dtui-20-court-acknowledge-peers.spec.js` and `playwright.config.js` were restored exactly; `git diff --exit-code` is clean for both, and both `D:\tmp` files were removed. No source, test, config, story, tracking, commit, or sibling-repository content was changed by this review.
- Final `git status --short` has no tracked modifications. It lists this intentional untracked findings file plus three untracked files that were already present when status was first checked: `dtui-20-court-acknowledge-peers-codex-review.md`, `dtui-20-court-acknowledge-peers-codex-run.log`, and the supplied `dtui-20-court-acknowledge-peers-diff.txt`. I did not modify the latter three.
