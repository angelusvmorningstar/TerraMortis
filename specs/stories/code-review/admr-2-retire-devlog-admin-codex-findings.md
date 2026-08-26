# Adversarial review findings — ADMR-2 Retire Devlog admin authoring

## High

- [Pass 1] None found.

### Pass 2 — Edge Case Hunter

- None found.

### Pass 3a — Acceptance Auditor before author record

- None found.

### Pass 3b — Author-record verification

- None found.

## Medium

### [Pass 1] The inverted Devlog E2E assertion can pass without proving the admin application rendered

- **Severity:** Medium
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:182`
- **Triggering input or sequence:** Run the changed test while `loginAsAdmin(page)` reaches a page whose admin UI never becomes usable, but does so without emitting a `pageerror` or a failed/404 URL containing `devlog` (for example, an auth/bootstrap response leaves the app hidden or empty).
- **Observable consequence:** All three `toHaveCount(0)` checks and the Devlog-filtered network check can succeed vacuously, so the regression gate can report that Devlog alone was retired even though the entire admin surface failed to render. The changed test body has no positive assertion for a surviving admin control or the visible `#admin-app`; Pass 2 must determine whether `loginAsAdmin` itself supplies that proof.
- **Confidence:** Medium. This follows literally from the changed test body in the diff; the helper implementation was not permitted in Pass 1 and may reduce or eliminate the risk.

### [Pass 2] Full server-route retirement has no surviving regression guard

- **Severity:** Medium
- **File:line:** `server/index.js:218`; `server/tests/helpers/test-app.js:124`; deleted `server/tests/api-devlog.test.js`
- **Triggering input or sequence:** A later change restores `server/routes/devlog.js`, its schema, or an `/api/devlog` mount in the production server, while leaving the admin markup absent. Run the surviving suite, including `tests/issue-1135-deleted-tabs.spec.js`.
- **Observable consequence:** The only new retirement test still passes because the admin page makes no Devlog request; there is no surviving assertion that the production mount table lacks `/api/devlog` or that the route/schema files stay deleted. This leaves the core full-retirement boundary unguarded. The repository already uses a meaningful static production-mount/file-existence pattern for the analogous ticket removal in `server/tests/tickets-removed.test.js:1`; a request against `createTestApp()` alone would be insufficient because it owns a separate mount table. The current code is correct: a direct Supertest probe against `createTestApp()` returned 404 for both `/api/devlog` and `/api/devlog/anything`, authenticated and unauthenticated.
- **Confidence:** High.

### [Pass 2] The new Devlog “bad CSS” assertion cannot observe the CSS cleanup it claims to protect

- **Severity:** Medium
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:188`
- **Triggering input or sequence:** Leave or reintroduce any `.dl-*` rules in `public/css/admin-layout.css`, or make that shared stylesheet fail to load, then run the changed Devlog test.
- **Observable consequence:** The check filters failed/404 request URLs for `/devlog/i`, but Devlog never had a separately requested Devlog-named stylesheet: its rules were embedded in the still-present `admin-layout.css`. Therefore `badCss` remains empty and the test passes. This is not semantically parallel to the adjacent Tickets test, which checks an actually deleted `admin-tickets.css` asset. The Devlog UI absence assertions remain useful, but the CSS claim in the test name/message is untested.
- **Confidence:** High.

### [Pass 3a] The fifth Devlog-referencing test file was not reclassified and now contains a false survivor comment

- **Severity:** Medium
- **File:line:** `tests/player.spec.js:152`
- **Triggering input or sequence:** Perform AC #5's required fresh whole-repository classification of test-file Devlog references after retiring the player tab and this admin/API surface.
- **Observable consequence:** `tests/player.spec.js` remains a fifth matching test file and says `Archive/Relationships/DevLog carry narrative now`, although the player Devlog tab was already retired and this story removes the remaining TM Game Devlog surface. The story's Context/Task 4 names and reclassifies only four test files, while repeatedly claiming five were individually reclassified. This violates AC #5 literally and leaves misleading project guidance in a live test file.
- **Confidence:** High.

### [Pass 3a] AC #5 and AC #7 define contradictory full-suite acceptance states

- **Severity:** Medium
- **File:line:** `specs/stories/admr-2-retire-devlog-admin.md:136`
- **Triggering input or sequence:** Audit the change against AC #5's literal requirement that `the full suite (unit + the two affected e2e specs) is green afterward`, then apply AC #7 to the known baseline failures.
- **Observable consequence:** AC #5 requires an all-green outcome, including a plural `two affected e2e specs` even though one of those specs is deleted wholesale, while AC #7 explicitly accepts genuinely green gates **or disclosed pre-existing failures**. A run with disclosed baseline failures simultaneously fails AC #5 and passes AC #7, so the story cannot receive a coherent literal acceptance result without treating AC #7 as an unstated exception to AC #5.
- **Confidence:** High that the wording is contradictory; Pass 3b will establish the actual observed gate state.

### Pass 2 — Edge Case Hunter

- None found.

### [Pass 3a] AC #5's literal green-suite requirement contradicts AC #7 and the checked task result

- **Severity:** Medium
- **File:line:** `specs/stories/admr-2-retire-devlog-admin.md:112`
- **Triggering input or sequence:** Evaluate acceptance after the documented full Vitest run hangs unless one file is excluded and the excluded run still contains disclosed pre-existing failures.
- **Observable consequence:** AC #5 unconditionally requires “the full suite ... is green afterward,” while AC #7 permits plausible gates to be green **or** pre-existing failures to be named, and Task 4 says the full run is not green. Disclosure may establish that this change caused no regression, but it cannot literally satisfy AC #5 as written. The story can therefore be safe while still failing its own checked acceptance criterion.
- **Confidence:** High; this is a direct textual contradiction, independent of whether the failures are pre-existing.

### [Pass 3b] The recorded full-suite totals are not reproducible in the current review environment

- **Severity:** Medium
- **File:line:** `specs/stories/admr-2-retire-devlog-admin.md:262`
- **Triggering input or sequence:** Run the required `cd server && npx vitest run --exclude "**/issue-836-legacy-tracker-cache-removed.test.js"` gate twice in this review sandbox.
- **Observable consequence:** The record says 22 failed files / 16 failed tests / 4,165 passed / 124 skipped in 561.69 seconds. The repeat with an untruncated terminal summary reported **96 failed / 135 passed / 9 skipped files; 18 failed / 2,354 passed / 1,933 skipped tests (4,305 total), 805.50 seconds**. The first run also completed after 767.7 seconds and showed the same broad Atlas connection failures before its output was truncated. The divergence is environmental—MongoDB Atlas connections fail here with `EACCES`, so it does not establish a regression in this diff—but it makes the record's exact gate result unverifiable-as-stated from the current machine context and means the current full-suite gate is not green.
- **Confidence:** High in the observed current totals and the `EACCES` cause; Medium on whether the historical totals were accurate on the author's less-restricted network.

## Low

### [Pass 2] Pass 1's admin-boot vacuity concern is disproven by the helper

- **Severity:** Low (correction to an earlier provisional finding, not a product defect)
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:151`
- **Triggering input or sequence:** Inspect and run `loginAsAdmin(page)` before the Devlog absence assertions.
- **Observable consequence:** The helper navigates to `/admin.html` and waits for `#admin-app:not([style*="display: none"])`, so an empty/hidden admin bootstrap does not reach the three absence assertions. This directly contradicts and resolves the Pass 1 Medium concern; the Pass 1 text remains unchanged as required by the review protocol.
- **Confidence:** High.

### [Pass 2] The test-section heading still says Devlog is untouched

- **Severity:** Low
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:149`
- **Triggering input or sequence:** A maintainer reads the section heading immediately above the Tickets and newly inverted Devlog tests.
- **Observable consequence:** The heading says `Tickets gone, City and Devlog untouched`, while the test directly below proves Devlog was removed. This stale statement gives the opposite maintenance guidance from the code and the new ADMR-2 comment.
- **Confidence:** High.

### [Pass 2] Repository context disproves the Pass 1 vacuity concern

- **Severity:** Low
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:151`
- **Triggering input or sequence:** Run the changed Devlog test through `loginAsAdmin(page)`.
- **Observable consequence:** The helper navigates to `/admin.html` and waits for `#admin-app` to become visible at line 163. Because the app starts hidden and successful boot/authentication reveals it, an empty or unbooted page does not reach the absence assertions. The Pass 1 concern remains frozen above as required, but it is not actionable after repository inspection.
- **Confidence:** High.

### [Pass 2] Retired Devlog leaves an orphaned Render environment variable

- **Severity:** Low
- **File:line:** `render.yaml:20`
- **Triggering input or sequence:** Apply the Render blueprint or configure the `tm-game-bot` worker after this full retirement.
- **Observable consequence:** Render still asks operators to supply `ANNOUNCE_DEVLOG_CHANNEL_ID`, although a whole-repository search finds no code that reads it and TM Game no longer exposes the Devlog endpoint it historically accompanied. This is dead deployment configuration and can mislead operators about a capability that no longer exists.
- **Confidence:** High that it is unreferenced in this repository; Medium that no separately deployed runtime injects meaning into the key outside the checked-in worker code.

### [Pass 2] The E2E section heading still says Devlog is untouched

- **Severity:** Low
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:149`
- **Triggering input or sequence:** A maintainer reads the admin-side test section to understand which retired surfaces are controls versus deletion assertions.
- **Observable consequence:** The heading says “Tickets gone, City and Devlog untouched,” directly contradicting the new Devlog-removal test immediately below it. This creates a false maintenance signal about the expected admin surface.
- **Confidence:** High.

### [Pass 3a] The claimed five-file test reclassification silently omits `tests/player.spec.js`

- **Severity:** Low
- **File:line:** `specs/stories/admr-2-retire-devlog-admin.md:92`
- **Triggering input or sequence:** Compare AC #5 and Task 4’s “5 devlog test files” claim with `git grep -l -i devlog 65987a68 -- server/tests tests`.
- **Observable consequence:** The baseline command returns five files, but the Context and Task 4 enumerate only `api-devlog.test.js`, `test-app.js`, `issue-1135-deleted-tabs.spec.js`, and `issue-502-devlog-tab.spec.js`. The fifth, `tests/player.spec.js:152`, is neither individually reclassified nor corrected; its comment still says “Archive/Relationships/DevLog carry narrative now,” even though those player surfaces have been retired. Runtime coverage is not lost, but AC #5’s explicit no-silent-file requirement is unmet and stale guidance remains.
- **Confidence:** High.

### [Pass 3b] The Dev Agent Record's diff-stat accounting is false

- **Severity:** Low
- **File:line:** `specs/stories/admr-2-retire-devlog-admin.md:311`
- **Triggering input or sequence:** Run `git diff --name-status 65987a68 HEAD`, `git diff --shortstat 65987a68 HEAD`, and `git diff --numstat 65987a68 HEAD`.
- **Observable consequence:** The record claims “6 files deleted, 5 files edited” plus one new story file. The actual diff has **5 deleted, 7 modified, and 1 added** files across 13 files (the seven modifications include `sprint-status.yaml`; source/tooling alone is 5 deleted and 6 modified). The file list immediately below names only five deletions and also names the tracking-file modification, so the summary contradicts both Git and its own inventory. The substantive no-incidental-source-churn conclusion still holds, but the quantitative attestation does not.
- **Confidence:** High.

### [Pass 3b] The claimed Playwright command relies on an undeclared web-server package

- **Severity:** Low
- **File:line:** `playwright.config.js:11`; `package.json:22`
- **Triggering input or sequence:** Run `npx playwright test tests/issue-1135-deleted-tabs.spec.js` with only the repository's declared dependencies available and no server already listening on port 8080.
- **Observable consequence:** The configured command is `npx http-server public -p 8080 -s`, but `http-server` is absent from `devDependencies` while `serve` is declared. In this restricted environment, `npx` attempted a registry download, received `EACCES`, and Playwright timed out after 60 seconds before running tests. Starting a plain local static server first allowed the exact Playwright selection to complete **12/12**, so the feature gate is green but the record overstates its out-of-the-box reproducibility.
- **Confidence:** High.
