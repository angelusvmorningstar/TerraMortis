# Adversarial review — gdx-4-mobile-css-cleanup

## High

### Pass 1

- None found.

### Pass 2

- None found.

### Pass 3a

- None found.

### Pass 3b

- None found.

## Medium

### Pass 1

#### [Pass 1] AC1's DOM-API ratchet misses ordinary inline-style mutation forms

- **Severity:** Medium
- **File:line:** `server/tests/gdx-4-css-standards-grep.test.js:110-139`
- **Triggering input or sequence:** Add any equivalent literal assignment using bracket notation (`el.style['color'] = '#fff'`), `el.style.setProperty('color', '#fff')`, `el.setAttribute('style', 'color:#fff')`, an append assignment (`el.style.cssText += 'color:#fff'`), or a split literal (`el.style.color = '#' + 'fff'`). A second bare colour can also be appended to the one allowlisted assignment, e.g. `el.style.cssText = 'color:var(--green2, #7EC8A0);background:#fff'`, because the whole regex match is excused when it merely contains the allowed snippet.
- **Observable consequence:** These are real DOM-API/inline-style colour literals prohibited by the newly documented rule, but the new vitest remains green. The checked-in guard therefore does not close the syntax gap it claims to close and can silently admit future regressions.
- **Confidence:** High. I executed the exact `DOM_API` regex against all examples above: only the plain `el.style.color = '#fff'` shape and the compound allowlisted assignment matched; the other five prohibited forms did not. The compound match contains the allowlisted snippet and would be suppressed by the test's `includes()` check.

#### [Pass 1] AC2's attribute regex can lose a colour after an opposite quote or whitespace around `=`

- **Severity:** Medium
- **File:line:** `server/tests/gdx-4-css-standards-grep.test.js:172-182`
- **Triggering input or sequence:** Add valid generated markup such as `style="background:url('x');color:#fff"` or `style = "color:#fff"` in a JavaScript string/template. The `[^"']*` portion stops at the inner single quote even though the attribute is double-quoted, and the pattern requires `style=` with no intervening whitespace.
- **Observable consequence:** A literal colour can return in an inline `style` attribute while the zero-offender test stays green. This is especially plausible for a background URL followed by a colour declaration.
- **Confidence:** High. Running the exact `ATTR` regex matched `style="color:#fff"` and `style='color:#fff'`, but did not match either triggering example.

#### [Pass 1] AC3's hand-rolled declaration parser drops the remainder of quoted values containing semicolons

- **Severity:** Medium
- **File:line:** `server/tests/gdx-4-css-standards-grep.test.js:233-248`
- **Triggering input or sequence:** Put a bare colour later in a legitimate declaration value containing a quoted semicolon, for example `.a { background:url("data:image/svg+xml;charset=utf8,<svg fill='#fff'>") }` in `suite.css`.
- **Observable consequence:** `declarationValues()` truncates the value at the semicolon in the quoted data URI and never exposes `#fff` to `BARE_HEX`, so a real bare hex declaration silently passes AC3. By contrast, I walked and executed the parser against `.a{color:red}.b:hover{background:#fff}` and `.a{}:not(.b){color:#abc}`; those pseudo-class cases are handled correctly and do not themselves produce the feared selector/declaration confusion.
- **Confidence:** High. The exact function returned only `url("data:image/svg+xml` as the declaration value for the triggering input.

### Pass 2

- None found.

### Pass 3a

#### [Pass 3a] Two non-exempt inline-to-class migrations violate AC6's computed-colour guarantee

- **Severity:** Medium
- **File:line:** `public/css/components.css:3686,4295`; `public/css/theme.css:31,131-133,214`; `specs/stories/gdx-4-mobile-css-cleanup.md:297-303`
- **Triggering input or sequence:** In either theme, make the feeding confirmation API fail so `#feed-confirm-btn` receives `.is-error`, or render a checked equipment tweak whose cost exceeds `rawMax` so `.dt-equipment-tweak-warn` appears.
- **Observable consequence:** AC6 says every element moved from inline styling keeps its computed colour in both themes, with `.dev-preview-btn` as the only exception. The feeding button changes from `#fff` (`rgb(255,255,255)`) to theme-invariant `--txt-on-dark: #F4EFE4` (`rgb(244,239,228)`). The equipment warning changes from `#b23` (`rgb(187,34,51)`) to `--crim2`, which is `#8B1010` (`rgb(139,16,16)`) in Parchment and `#A81010` (`rgb(168,16,16)`) in dark. Users therefore see two additional colour changes that the AC neither names nor exempts.
- **Confidence:** High. These are direct literal/token resolutions from `theme.css`, and the triggering branches were traced in Pass 2.

#### [Pass 3a] AC7 requires a ratchet over all of `public/css`, but the new suite scans only `suite.css`

- **Severity:** Medium
- **File:line:** `server/tests/gdx-4-css-standards-grep.test.js:221-275`; `specs/stories/gdx-4-mobile-css-cleanup.md:304-306`
- **Triggering input or sequence:** Add a bare colour declaration to any other application stylesheet, including the two touched by this story (`components.css` or `admin-layout.css`), and run the new vitest suite.
- **Observable consequence:** The test reads only `public/css/suite.css` for AC3. A new literal in `theme.css`, `layout.css`, `components.css`, `admin-layout.css`, `admin-shared.css`, or `admin-spheres.css` is outside that scan, even though AC7 literally requires the ratchet to cover the whole of `public/css`. The regression test can therefore stay green while drift returns in the very stylesheets that received the new token-backed classes.
- **Confidence:** High. The only CSS path passed to `declarationValues()` is the hard-coded `public/css/suite.css`; `JS_FILES` is recursive, but there is no corresponding CSS walk.

### Pass 3b

#### [Pass 3b] The “all now closed” AC1 hardening still misses the frozen finding's split-literal trigger

- **Severity:** Medium
- **File:line:** `server/tests/gdx-4-css-standards-grep.test.js:30-59,153-217,227-244`; `specs/stories/gdx-4-mobile-css-cleanup.md:993`
- **Triggering input or sequence:** Add the exact Pass 1 example `el.style.color = '#' + 'fff';` under `public/js`, then run the hardened source suite.
- **Observable consequence:** `STYLE_FORMS` matches only the first quoted operand, whose captured content is `"#"`; `COLOUR_TOKEN` therefore sees zero colour offenders and the prohibited computed `#fff` still passes. The file header admits concatenation is not caught, while the same header says all five review gaps are closed and the change log says all findings were addressed. Bracket notation, `+=`, `setProperty`, `setAttribute`, and the compound-allowlist hole are fixed; the original finding as written is not fully fixed.
- **Confidence:** High. The exact current patterns captured `"#"` and produced zero offenders for the frozen triggering input; the 29-test suite has no concatenation fixture.

#### [Pass 3b] AC6 still excludes the equipment warning using a false “no prior dark rendering” premise

- **Severity:** Medium
- **File:line:** `specs/stories/gdx-4-mobile-css-cleanup.md:313-326`; `public/js/tabs/downtime-form.js:5497-5502`; `public/css/components.css:3686`
- **Triggering input or sequence:** Before the change, use dark theme and render a checked equipment tweak whose cost exceeds `rawMax`; after the change, render the same state.
- **Observable consequence:** The pre-change inline `style="color:#b23"` applied in every theme, including dark. The revised AC now names the `#b23` -> `--crim2` correction but says it is not an exception because there was “no prior dark-theme rendering to compare against.” That is false: the comparison is `#b23` before versus dark-theme `--crim2:#A81010` after. Feeding is now correctly named as an exception, but the equipment half of the frozen AC6 finding remains semantically unresolved.
- **Confidence:** High. The warning condition is theme-independent, and an inline colour declaration participates in the cascade in both themes.

#### [Pass 3b] The `admin-layout.css` count baseline allows grandfathered debt to move to a new site

- **Severity:** Medium
- **File:line:** `server/tests/gdx-4-css-standards-grep.test.js:450-502`; `specs/stories/gdx-4-mobile-css-cleanup.md:329-337`
- **Triggering input or sequence:** Tokenise any one of the four documented `admin-layout.css` literals and, in the same change, add a different bare hex at a new selector. The offender count remains four.
- **Observable consequence:** The test asserts only `offenders.length <= 4`, so the change stays green even though AC7 says it must fail if a new bare hex is introduced anywhere in `public/css`. Full stylesheet coverage is materially improved and the measured baseline is real, but it is a count ratchet rather than a site/content grandfather list.
- **Confidence:** High. Using the exact parser in memory produced four offenders before and four after removing `#c06060` and adding `.synthetic-new { color:#123 }`; the current predicate would pass both.

## Low

### Pass 1

#### [Pass 1] The documented greps are not the regexes enforced by vitest

- **Severity:** Low
- **File:line:** `specs/architecture/coding-standards.md:229-230`; `server/tests/gdx-4-css-standards-grep.test.js:102-110,162-172,350-358`
- **Triggering input or sequence:** A developer copy-pastes either published grep, or relies on the test comments saying the commands are published "verbatim."
- **Observable consequence:** Both documented commands use `{3,6}`, while both vitest patterns use `{3,8}`. The published attribute grep also checks only double-quoted attributes, whereas vitest attempts both quote styles. Thus the manual and automated checks are not identical despite the documentation and test comments claiming they are. Because neither hex alternative has a trailing boundary, the `{3,6}` shell form will still report a 7/8-digit hex as a truncated six-digit prefix, so the quantifier mismatch usually changes matched text rather than line-level detection; the quote-style mismatch does change which lines are reported.
- **Confidence:** High; compared character-for-character in the supplied diff.

### Pass 2

- None found.

### Pass 3a

#### [Pass 3a] The checked-in browser assertions do not exercise AC4/AC6's required verification matrix

- **Severity:** Low
- **File:line:** `tests/desktop-and-css.spec.js:1720-1872`; `specs/stories/gdx-4-mobile-css-cleanup.md:286-303`
- **Triggering input or sequence:** Introduce a regression that appears only at AC4's exact 768px or 1280px widths, or drop an omitted moved property such as `.ns-field-grid`'s `gap`/`margin-bottom`, a print class property, or a dev-button box property while retaining the few strings the tests look for.
- **Observable consequence:** AC4 requires before/after-equivalent computed layout at 360, 768, 900 and 1280px, but the gdx-4 layout probes use 390 and 900px and compare only post-change values. AC6 requires all listed computed properties for every moved element in both themes at 360 and 1280px; the suite instead checks selected properties for the feeding/warning classes, CSSOM declaration substrings for the two admin classes, and no generated-print document at all. The checked-in Playwright file can therefore be green without establishing the literal verification matrix.
- **Confidence:** High about the coverage gap; lower about whether an uninspected external driver supplies the missing evidence. No author record had been read when this finding was frozen.

### Pass 3b

#### [Pass 3b] The 2026-08-21 browser-test fix still does not implement the literal AC4/AC6 matrix

- **Severity:** Low
- **File:line:** `tests/desktop-and-css.spec.js:1720-1872`; `specs/stories/gdx-4-mobile-css-cleanup.md:311-326,993`
- **Triggering input or sequence:** Introduce a regression specific to 360px (not 390px), or remove an unasserted AC6 property from `.ns-field-grid`, `.dev-preview-btn`, or one of the generated print classes.
- **Observable consequence:** The rewritten AC4 tests now add 768px and 1280px, but still use 390px instead of the AC's exact 360px. Nothing added the required all-properties, both-themes, 360/1280 coverage for every inline-to-class migration; the admin test still checks CSSOM substrings and the print document is still absent from the checked-in browser suite. The change log's statement that all Low findings were addressed is therefore overstated.
- **Confidence:** High about checked-in coverage. No separate AC6 driver is present in the diff; the historical print measurement is described only in the Dev Agent Record.

#### [Pass 3b] The recorded full-gate baselines are not reproducible in the current environment

- **Severity:** Low
- **File:line:** `specs/stories/gdx-4-mobile-css-cleanup.md:881-928,992-993`; `CLAUDE.md:37-59`
- **Triggering input or sequence:** Run `cd server && npm test` and `npx playwright test tests/desktop-and-css.spec.js` now, from this checkout and environment.
- **Observable consequence:** Playwright was 43 passed / 13 failed on two consecutive runs, not 44/12. The documented 12 names all failed, plus the stable extra `css-audit — the T1/T2 fixes did not grow the visible box on desktop`, where `.edit-tab` measured 29px instead of 30px. Vitest could not reproduce 4127/12/3 because no usable MongoDB connection was available: the exact current totals were 2,245 passed / 11 failed / 1,895 skipped-pending out of 4,151. The 11 assertion failures retained the expected non-gdx-4 shapes, but `cm-4-renumber-chapter-merge` passed targeted (22 tests in the three-file command), and `api-downtime-personal-story-freetext` failed at suite setup with all 3 tests skipped rather than passing targeted. Humans cannot use the old totals as the current gate without these environment qualifications.
- **Confidence:** High. Playwright reproduced identically twice; vitest was run three times (one exact default run and two JSON-reporter attempts), with the final in-memory JSON parse providing the exact totals.

## Validation notes

### Pass ordering and files opened

- **Pass 1 (blind):** Opened only `specs/stories/code-review/gdx-4-mobile-css-cleanup-diff.txt`. The diff itself exposed hunks for the source, CSS, tests and documentation, but I did not open any repository file separately and did not search for the story.
- **Pass 2 (repository context, still story-blind):** Opened/searched `public/css/theme.css`, `suite.css`, `layout.css`, `components.css`, `admin-layout.css`, `admin-shared.css`, `admin-spheres.css`; `public/index.html`, `public/admin.html`; `public/js/admin.js`, `admin/next-session.js`, `editor/print.js`, `tabs/downtime-form.js`, `tabs/feeding-tab.js`; `tests/desktop-and-css.spec.js`; `playwright.config.js`; and `package.json`. I did not open `specs/stories/gdx-4-mobile-css-cleanup.md` or the author record.
- **Pass 3a:** First read only the Story, What This Story Is NOT, Acceptance Criteria, Tasks/Subtasks and Dev Notes ranges of `specs/stories/gdx-4-mobile-css-cleanup.md`; did not read the Dev Agent Record. Also opened targeted lines in `public/css/theme.css` and `tests/desktop-and-css.spec.js` to check the literal AC wording. Findings were frozen before advancing.
- **Pass 3b:** Read the full revised story including the Dev Agent Record and 2026-08-21 Change Log, the regenerated diff, the full 626-line `server/tests/gdx-4-css-standards-grep.test.js`, `CLAUDE.md`, `specs/architecture/coding-standards.md`, `specs/deferred-work.md`, `tests/desktop-and-css.spec.js`, `public/js/editor/sheet.js`, `public/js/editor/print.js`, `public/js/editor/export-character.js`, all non-theme CSS files through the exact scanner, the four cited `admin-layout.css` sites, relevant `theme.css` token declarations, and the base-commit `public/css/suite.css`. A targeted configuration grep also read `server/db.js`, `server/tests/helpers/db-setup.js`, `.env`, and `server/.env`; no credential values are reproduced here.
- **No read-ahead:** Confirmed. Pass 1 was frozen before repository exploration; Pass 2 was frozen before opening the story; Pass 3a was frozen before reading the Dev Agent Record.

### Commands and real results

- **Pass 1:** Used `Get-Content`/`Select-String` only on the supplied diff (whole-file read, hunk index, and targeted line ranges). Ran two in-memory `node -` probes: the original DOM/attribute regex probe showed the bracket, `setAttribute`, `+=`, `setProperty`, concatenation, opposite-quote and spaced-`=` bypasses; the original declaration parser handled pseudo-classes but truncated the quoted-semicolon data URI. Wrote the frozen Pass 1 section with `apply_patch`.
- **Pass 2:** Used `rg --files public/css` and targeted `rg -n`/`Get-Content` searches for selector uniqueness, HTML stylesheet order, all `.story-split`/grid occurrences, the downtime warning branch, feeding-button lifecycle, admin button creation, print inline styles, and Playwright helper cleanup. `git status --short` showed only the supplied/review untracked artefacts; `git diff` over source/test paths was empty. No Pass 2 findings were added beyond explicit “None found.”
- **Pass 3a:** Used heading-only `Select-String` to locate permitted story ranges, then `Get-Content` on those ranges only. `rg` of `theme.css` resolved `--txt-on-dark` and both `--crim2` values; targeted `rg` of the Playwright file confirmed the original viewport coverage. Wrote the frozen Pass 3a section with `apply_patch`.
- **Targeted hardened gate:** `cd server; npx vitest run tests/gdx-4-css-standards-grep.test.js` -> exit 0, **1 file passed, 29/29 tests passed**, 4.94s reported duration. Its fixtures use the exact bracket/setProperty/setAttribute/`+=`, compound-allowlist, opposite-quote, spaced-`=`, and quoted-semicolon inputs described above.
- **Full vitest gate (required exact command):** `cd server; npm test` -> exit 1 after 726.9s. Default output was too large for the tool and its final totals were truncated. A second run, `npx vitest run --reporter=json --outputFile=D:\tmp\gdx4-vitest-results.json`, completed the tests but the reporter failed with `EPERM` writing that path; no file was created. A final `npx vitest run --reporter=json` captured JSON in PowerShell memory and printed exact totals: **4,151 total; 2,245 passed; 11 failed; 1,895 skipped/pending** (Vitest exit 1, 710.8s). The nine extra gdx-4 assertions explain the total increasing from the historical 4,142 to 4,151.
- **Vitest failure shapes:** Actual failed assertions were `bl3a-one-inclan-implementation` 1, `oath-a-pledge-helpers` 1, `n7-n9-allocator-readers` 1, `epic.708.3-cycle-phase-controls` 3, `issue-1013-indomitable-rules-text` 3, and `issue-830-inherited-card-css` 2. `issue-836-legacy-tracker-cache-removed` remained a suite-level zero-test failure. Many database suites ended in failed setup with zero failed assertions and all tests pending because no local 27017 listener was usable and the configured remote connection was blocked. The targeted three-file command for `cm-4-renumber-chapter-merge`, `issue-836`, and `api-downtime-personal-story-freetext` reported **1 file passed / 2 failed; 22 passed / 117 skipped**: `cm-4` supplied the passes, the personal-story suite failed setup with 3/3 skipped, and `issue-836` failed before collecting tests.
- **Playwright server:** Port 8080 was initially free. Starting `node node_modules/serve/build/main.js` with an absolute script argument failed because `Start-Process` split the spaced path; a five-second foreground diagnostic proved the command itself served on 8080. Starting the same installed server with a relative script path succeeded as PID 26424. After both Playwright runs, `Stop-Process -Id 26424` succeeded and `netstat` confirmed `PORT_8080_FREE`.
- **Full Playwright gate (required exact command):** `npx playwright test tests/desktop-and-css.spec.js` -> run 1 **43 passed / 13 failed** in 9.9m; because that contradicted the record, the same command was run once more serially -> **43 passed / 13 failed** in 9.8m. The 13 names were the eleven documented desktop-mode tests, `css-audit — DT Submission tab has dark-theme input styles`, and the additional `css-audit — the T1/T2 fixes did not grow the visible box on desktop`. All eight gdx-4 test blocks passed both times, including the strengthened 768/1280 loops.
- **Published greps:** The exact AC1 pattern run with GNU `grep -rnoE` returned one line, `public/js/app.js:2180:.style.color = 'var(--green2, #7EC8A0` (exit 0). The exact AC2 twin returned no lines (grep exit 1 for no match). Completion Notes #1 is current.
- **`!important` count:** `git diff --unified=0 53e55ea5 -- public/css/suite.css` plus a token count found exactly **6 removed `!important` tokens**: the two phone grid declarations, the duplicate base block's `display`/`flex-direction`, and the duplicate media block's `display`/`grid-template-columns`. `git show 53e55ea5:public/css/suite.css` confirmed all six in the pre-image.
- **Exact hardened-parser checks:** An in-memory Node reproduction of `declarationValues()`/`BARE_HEX` reported `admin-shared.css=0`, `admin-spheres.css=0`, `components.css=0`, `layout.css=0`, `suite.css=0`, and `admin-layout.css=4`, at exactly lines 5712 (`#c06060`), 9155 (`#5a7d3a`), 9983 (`#fff`) and 9985 (`#a00`). A synthetic remove-one/add-one case stayed at four and passed the count predicate. The split literal captured only `"#"` and produced zero colour offenders.
- **Deferred Touchstones violation:** Read `sheet.js:449-459`; `att` is `hum >= t.humanity`, and true inserts `rgba(140,200,140,.9)` into `style="color:..."`, so the violation is real. `theme.css`'s dark block declares byte-identical `--green2-a9:rgba(140,200,140,.9)`; its light value differs. The deferred allowlist is file+snippet scoped: a second separate `style="color:#fff"` in the same file was not excused in an in-memory probe. A second colour inside the already-deferred attribute would be excused with the current whole-match `includes()` check; that is the boundary of the exception.
- **A/B checks:** Per the resumed brief, I did not repeat the historical per-file/base A/B swap and accepted the prior record's method. Current failure shapes for `bl3a` and `issue-830` match the record; the personal-story suite still has 3 skipped tests but does not pass targeted in this network-restricted environment.

### Could not run or independently reproduce

- I could not reproduce the historical **4127 passed / 12 failed / 3 skipped** full-vitest environment because no usable MongoDB connection was available. I report the real current totals above; skips are not counted as passes.
- I did not independently reproduce the Dev Agent Record's one-off **print.js five-elements × 18 computed-properties before/after driver**. No such driver or fixture is checked in, and the current Playwright file does not render the generated print document. Static inspection still confirms the five declaration moves are property-for-property equivalent, but the historical browser measurement remains unverifiable from a saved artefact.
- The JSON reporter could not write its temporary result to `D:\tmp` (`EPERM`); the in-memory JSON rerun recovered the exact totals without creating a file.

### Repository state and verdict

- I made no source, test, story, tracking, commit, or push changes. The only repository write attributable to this review was this requested findings file. No temporary source edit or stash was used. Final `git status --short` is **not globally clean**: it shows the human's expected six tracked fix/story files (`server/tests/gdx-4-css-standards-grep.test.js`, `specs/architecture/coding-standards.md`, `specs/deferred-work.md`, `specs/stories/gdx-4-mobile-css-cleanup.md`, `specs/stories/sprint-status.yaml`, `tests/desktop-and-css.spec.js`) plus the supplied/review untracked artefacts, including this findings file. `git diff --check` reported no whitespace errors. The Playwright server process was stopped, port 8080 is free, and no JSON result file was created.
- **Verdict: needs further patches before shipping, but no blocking product defect was found.** The original UI/CSS changes and all 29 targeted source tests plus all eight gdx-4 browser blocks are green. The remaining work is to make the standards ratchet and AC text honest at the exact boundaries described above (split literals, site-stable CSS grandfathering, the equipment colour exception, and the literal AC4/AC6 matrix), then update the gate record to the reproducible current results or clearly label the historical environment.
