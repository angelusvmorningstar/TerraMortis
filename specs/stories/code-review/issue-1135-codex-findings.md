# Adversarial review findings — issue 1135

## High

- [Pass 1] None found.
- [Pass 2] None found.
- [Pass 3a] None found.
- [Pass 3b] None found.

## Medium

### [Pass 1] Settings still advertises and controls three deleted tabs

- **Severity:** Medium
- **File:line:** `public/js/app.js:1780`, `public/js/app.js:1781`, `public/js/app.js:1795`, `public/js/app.js:1856`
- **Triggering input or sequence:** Open Settings after the Primer, Game Guide, and Rules tabs have been removed; change either the reading-font-size controls or the “Show Primer, Guide & Rules tabs” checkbox.
- **Observable consequence:** Users are told that reading font size applies to three tabs that no longer exist, and are offered a navigation toggle whose only former targets were deleted. Toggling it persists `tm-show-guides` and re-renders the nav/sidebar but cannot change any visible tab. This is a missed registration/configuration surface, so the claimed pure deletion leaves user-visible dead UI behind.
- **Confidence:** High — all three strings and the now-effectless handler survive in the final `app.js`, while both `NAV_ITEMS` and `MORE_APPS` contain no `guide` entries.

### [Pass 2] Five surviving Rules-tab tests now fail against the intentionally deleted container

- **Severity:** Medium
- **File:line:** `tests/feat-16-17-fix44-tracker-feeding.spec.js:263`, `tests/feat-16-17-fix44-tracker-feeding.spec.js:408`
- **Triggering input or sequence:** Run the surviving `feat.17 — Rules reference City Status and Territory sections` describe block after `#t-rules` and the Rules-tab initializer have been deleted.
- **Observable consequence:** All five tests call `window.goTab('rules')` and then time out waiting for `#t-rules`. The focused Playwright run produced **5/5 failures** in that block, so a broader test run has new red tests even though the intentionally edited targeted files are green. The obsolete helper and describe block need retirement or conversion to Rules-overlay coverage.
- **Confidence:** High — reproduced locally; every failure stops at `page.waitForSelector('#t-rules')` on line 269. `tests/post-game-1.spec.js` also contains two stale Rules-grid assertions, but its focused navigation case timed out earlier on the pre-existing `#n-more` path, so I am not counting that file as a reproduced deletion-caused failure.

### [Pass 3a] AC15’s “no new failures” requirement is not satisfied

- **Severity:** Medium
- **File:line:** `specs/stories/issue-1135-delete-eight-tabs.story.md:42`, `tests/feat-16-17-fix44-tracker-feeding.spec.js:408`
- **Triggering input or sequence:** Evaluate the implemented tree against AC15, then run the surviving feat.17 Rules-reference block.
- **Observable consequence:** The change follows the four test-file verdicts listed in Dev Notes, but five other live tests fail specifically because the story deletes `#t-rules`. Therefore “targeted suites green” may be true for the chosen subset, but the literal “no new failures” clause is false and the repository is not test-clean as-is.
- **Confidence:** High — the five failures were reproduced in Pass 2 and all terminate on the deleted selector.

### [Pass 3b] “All 16 ACs satisfied” is false because AC15 has reproduced new failures

- **Severity:** Medium
- **File:line:** `specs/stories/issue-1135-delete-eight-tabs.story.md:200`, `tests/feat-16-17-fix44-tracker-feeding.spec.js:408`
- **Triggering input or sequence:** Treat Completion Note 1 as the release verdict, then run the surviving feat.17 Rules-reference tests outside the author’s hand-picked gate list.
- **Observable consequence:** Five tests fail specifically on the deleted `#t-rules` container. The author’s “all 16” claim and the declared-deviation statement that AC15 is met are therefore overstated; this is the same runtime evidence as the independent Pass 2/3a finding, now applied to the record’s explicit claim.
- **Confidence:** High — 5/5 affected tests failed for the deletion-specific reason.

### [Pass 3b] The CSS “verified table exactly” and 79-rule claim undercount four deleted suite rules

- **Severity:** Medium
- **File:line:** `specs/stories/issue-1135-delete-eight-tabs.story.md:41`, `specs/stories/issue-1135-delete-eight-tabs.story.md:206`
- **Triggering input or sequence:** Parse the base and current stylesheets through Chromium’s CSSOM and compare rule-type counts, then reconcile them with the story table.
- **Observable consequence:** `suite.css` lost **83 CSSStyleRule objects plus one `@media` grouping rule**, not 79 rules. The table accounts for 78 prefix/settings rules; the diff additionally deletes five id-scoped style rules (`#t-finance.active`, `#t-primer.active`, and three Primer `.reading-pane` rules), yielding 83. `components.css` correctly lost 85 style rules. Both files are brace-balanced, but the “79 + 85 = 164” accounting and AC14’s “table exactly” wording are false; the real style-rule total is **168**.
- **Confidence:** High — Chromium reports `suite.css` style rules 1421 → 1338 and media rules 12 → 11; `components.css` style rules 1763 → 1678. Raw brace blocks independently changed 1442 → 1358 and 1777 → 1692.

### [Pass 3b] The desktop baseline evidence is false: the retired Primer test was passing

- **Severity:** Medium
- **File:line:** `specs/stories/issue-1135-delete-eight-tabs.story.md:195`, `tests/desktop-and-css.spec.js:166` at base `40cee7fb`
- **Triggering input or sequence:** Reconstruct base `40cee7fb` in a scratch tree, serve its own `public/`, run its own 20-test desktop/CSS spec, and isolate the base-only Primer test.
- **Observable consequence:** The current tree is **12 failed / 7 passed**, but the base-only Primer test passes (1/1 in 4.0s), so the reconstructed base is **12 failed / 8 passed**, not the claimed 13 failed / 7 passed. The failure set appears unchanged, so “zero new failures” for this file is supported; the false part is the baseline count and the claim that retiring Primer removed a failure rather than a pass.
- **Confidence:** High — the full base run executed all 20 cases and Playwright retained 12 failed ids; the isolated Primer case passed.

### [Pass 3b] Current architecture/reference docs still advertise the deleted ticket API

- **Severity:** Medium
- **File:line:** `specs/architecture/system-map.md:49`, `specs/reference-data-ssot.md:111`, `specs/epic-city-refresh.md:77`
- **Triggering input or sequence:** A maintainer or integrator uses the current system map, auth-boundary reference, or active city-refresh backlog after issue 1135 ships.
- **Observable consequence:** The system map still lists a live authenticated `/api/tickets` route, the SSOT auth table still includes it, and the backlog still directs work toward a player Tickets tab/file that no longer exists. The four ADM-1 documents were correctly repointed at Spheres, but the repo-wide documentation sweep was incomplete.
- **Confidence:** High for the named stale references; historical citations inside superseded ADM records were deliberately retained and are not included in this finding.

## Low

### [Pass 1] Three deletion tests attach their page-error listener after boot

- **Severity:** Low
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:116`, `tests/issue-1135-deleted-tabs.spec.js:118`, `tests/issue-1135-deleted-tabs.spec.js:134`, `tests/issue-1135-deleted-tabs.spec.js:136`, `tests/issue-1135-deleted-tabs.spec.js:206`, `tests/issue-1135-deleted-tabs.spec.js:208`
- **Triggering input or sequence:** A page error occurs during `setupSuite(page)` while booting the app, before the listener is attached in the deleted-id `goTab`, Settings, or Rules-overlay test.
- **Observable consequence:** The later `expect(errors).toHaveLength(0)` remains green and its diagnostic says the tested surface did not throw even though a boot-time exception occurred. Action-time exceptions after listener registration are still caught, and setup’s `#app` visibility wait is a positive control, so this is a reliability/diagnostic gap rather than a vacuous test.
- **Confidence:** High — the registration order is explicit. The admin-removal test and City-domain test correctly register before navigation; only these three register after `setupSuite`.

### [Pass 1] The icon map retains six unreferenced entries, three newly orphaned by this deletion

- **Severity:** Low
- **File:line:** `public/js/app.js:1616`
- **Triggering input or sequence:** Load `app.js`; `_svg` is initialized after the More-grid entries for Primer, Game Guide, and Rules have been deleted.
- **Observable consequence:** `_svg.primer`, `_svg.guide`, and `_svg.rules` now allocate strings that can never be rendered. A complete reference census also finds `_svg.status`, `_svg.whosWho`, and `_svg.dtReport` at zero references, for six zero-reference entries total; the latter three were already unreferenced before this diff.
- **Confidence:** High — exact `_svg.<key>` reference counts in the final file are zero for those six and one for every other key.

### [Pass 2] Surviving comments still describe the deleted Lore and Finance surfaces

- **Severity:** Low
- **File:line:** `public/js/app.js:1633`, `public/js/app.js:1634`, `public/js/game/payment-helpers.js:8`, `public/js/game/payment-helpers.js:40`, `server/index.js:163`
- **Triggering input or sequence:** A maintainer follows the More-grid section contract, payment compatibility contract, or coordinator-route rationale after the tab deletion.
- **Observable consequence:** The code still documents a `lore` section and render position that no longer exist, says both Check-In and Finance tabs consume `payment-helpers.js`, says the Finance tab continues reading payment rows, and says the coordinator route exists for Finance. Runtime behavior is unaffected, but the deletion leaves misleading maintenance guidance in three surviving files.
- **Confidence:** High — the comments remain verbatim; `MORE_SECTIONS` has no `lore`, `finance-tab.js` is deleted, and only `signin-tab.js` imports `payment-helpers.js`.

### [Pass 3a] AC8 is true at runtime but has no regression test

- **Severity:** Low
- **File:line:** `specs/stories/issue-1135-delete-eight-tabs.story.md:35`, `tests/issue-1135-deleted-tabs.spec.js:165`
- **Triggering input or sequence:** Reintroduce an `/api/tickets` mount while leaving the client/admin deletions intact, then run the new issue-1135 spec.
- **Observable consequence:** The suite remains green because its only 404 observation filters requests for `admin-tickets.css`; no test ever requests `/api/tickets` or asserts a 404. The current server does return 404 (confirmed with a real server request), but AC8 can regress undetected.
- **Confidence:** High — an exact search finds no `/api/tickets` occurrence in `tests/` or `server/tests/`.

### [Pass 3a] AC4 and AC5 tests bypass the user interactions the criteria require

- **Severity:** Low
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:193`, `tests/issue-1135-deleted-tabs.spec.js:205`
- **Triggering input or sequence:** Break the sheet button’s `onclick="openRulesOverlay()"` wiring or break the City domain’s map-button/overlay wiring while leaving `window.openRulesOverlay()` and the City domain container intact.
- **Observable consequence:** The issue-1135 tests still pass: the Rules test calls `window.openRulesOverlay()` directly instead of pressing the sheet button, and the City test stops after opening `#d-city` without opening `#city-map-overlay`. Both retained implementations are present in the current code, but the prescribed acceptance paths are not protected.
- **Confidence:** High — the test bodies contain no sheet-button click, `#city-map-btn` click, or `#city-map-overlay` assertion.

### [Pass 3a] The coordinator-specific acceptance path is absent from targeted browser coverage

- **Severity:** Low
- **File:line:** `tests/issue-1135-deleted-tabs.spec.js:23`, `tests/fin-checkin-finance.spec.js:13`
- **Triggering input or sequence:** Introduce a role-filter regression that affects `role: 'coordinator'` but not `role: 'st'`, then run the issue-1135 and retained check-in specs.
- **Observable consequence:** AC9 and the coordinator half of AC10 can regress without detection because both specs authenticate only an ST. Static inspection indicates coordinator filtering and Check-In still work, so this is a coverage gap rather than a demonstrated runtime failure.
- **Confidence:** High for the coverage gap; medium-high for current behavior because the coordinator path was inspected but not exercised in a browser test.

### [Pass 3b] The cited `npcr-` verification command returns 1, not 0

- **Severity:** Low
- **File:line:** `specs/stories/issue-1135-delete-eight-tabs.story.md:204`, `public/css/components.css:5215`
- **Triggering input or sequence:** Run the record’s own `git diff -U0 public/css/components.css | grep -c npcr-` (or the base-explicit form requested by this review).
- **Observable consequence:** The real output is **1** because the diff adds a comment containing `npcr-`. No `npcr-*` selector or rule was changed, so AC14’s rule-level protection is satisfied; only the claimed command result/evidence is false.
- **Confidence:** High — both command forms returned 1, and the sole matching diff line is the added explanatory comment.

### [Pass 3b] The server “53 passed, real runs” claim is unverifiable in this environment

- **Severity:** Low
- **File:line:** `specs/stories/issue-1135-delete-eight-tabs.story.md:194`
- **Triggering input or sequence:** Run `npx vitest run tests/api-devlog.test.js tests/api-relationships.test.js` under the current checkout’s configured environment.
- **Observable consequence:** Both files fail setup and all **53 tests skip** because MongoDB connection fails with `EACCES`; there are 0 executed/passed tests here. An escalation request was rejected because the configured destination is an external MongoDB and the test write scope is not established. This does not prove the author’s earlier run was false, but it cannot be re-verified as stated.
- **Confidence:** High about this run and the verification gap; no conclusion about the author’s historical environment.

### [Pass 3b] “Six stale comments corrected rather than left to mislead” is incomplete

- **Severity:** Low
- **File:line:** `specs/stories/issue-1135-delete-eight-tabs.story.md:208`, `public/js/app.js:1633`, `public/js/game/payment-helpers.js:8`, `server/index.js:163`
- **Triggering input or sequence:** Follow the surviving comments after the deletion.
- **Observable consequence:** The record correctly names six comments it updated, but leaves the Lore section/render-order comments and three Finance-consumer comments described in the Pass 2 finding. The numeric “six corrected” statement is true; its presentation as cleanup that was not “left to mislead” is overstated.
- **Confidence:** High — the five stale lines remain in the final files.

## Ship assessment

**Needs patches before shipping as-is.** There is no High/blocking runtime defect in the intended deletion itself, and the primary targeted gates are green. However, AC15 is currently false because five live Rules-tab tests were not retired, Settings still exposes dead guide controls, and the acceptance/record/documentation inaccuracies above should be corrected. The server’s 53-test gate also needs a safe local MongoDB run before release confidence can match the record.

## Validation notes

### Pass boundaries and files opened

- **Pass 1 (no story read):** Opened the review brief, `specs/stories/code-review/issue-1135-diff.txt`, and only diff-named/touched runtime files needed by the blind checks: `public/js/app.js`, `public/index.html`, `public/css/suite.css`, `public/css/components.css`, `public/js/dev-fixtures.js`, `public/js/dt-proto-boot.js`, `public/js/game/signin-tab.js`, `server/index.js`, the new issue-1135 spec, and the four edited/retired specs through their diff sections. I did not open `specs/stories/issue-1135-delete-eight-tabs.story.md` or either external repository. Pass 1 findings were written before Pass 2 began.
- **Pass 2 (repository, still no story):** Opened relevant surrounding files including `public/js/game/payment-helpers.js`, `public/js/game/signin-tab.js`, `public/js/admin.js`, `public/admin.html`, `public/js/admin/npc-register.js`, `public/js/admin/relationship-editor.js`, `public/js/editor/edit.js`, `public/js/tabs/downtime-form.js`, `public/js/tabs/archive-tab.js`, the surviving Rules-referencing specs, `server/package.json`, `server/routes/relationships.js`, and the two explicitly permitted external files: `../TM Herald/services/announcements.js` and `../TM Wiki/server/routes/wiki-relationship-board.js`. No `AGENTS.md` exists. Pass 2 findings were written before the story was opened.
- **Pass 3a:** Opened only story lines 8–183 (Story through Dev Notes), stopping before line 184’s Dev Agent Record. Then checked the touched code, `public/js/tabs/city-tab.js`, `public/js/admin/city-views.js`, and the four ADM-1 reference documents against the 16 ACs. Pass 3a findings were written before the record was read.
- **Pass 3b:** Opened story lines 184–248 (Dev Agent Record and declarations), then the current architecture/reference docs named in findings and the test/config files needed to reproduce its claims. The author’s account was not read before Pass 3a was frozen.

### Pass 1 command/results log

- `Get-Content ...issue-1135-codex-review.md -Raw` read the instructions; `Get-Item`, line count, and `Select-String '^diff --git '` reported a 190,442-byte, 3,789-line diff touching 28 paths.
- PowerShell diff-section extraction read the `app.js`, new-spec, fixture, server, and edited-test hunks. A first combined extraction exceeded the display budget and was retried per file; no content was inferred from the truncation.
- `rg`/`Get-Content` probes over `app.js` enumerated deleted ids, `goTab`, storage/hash paths, `_svg`, `NAV_ALIAS`, Settings, More-grid and sidebar renderers. Exact `_svg.<key>` counts were: zero for `status`, `whosWho`, `dtReport`, `primer`, `guide`, `rules`; one for every other key.
- CSS probes over `suite.css`/`components.css` verified the two selector-list surgeries have valid commas and surviving selectors; no deleted tab-id selector remains. The exact deleted-class-token census found 105 distinct `rel-/fin-/primer-/devlog-` tokens and no surviving public source emitting any of them. `signin-tab.js` emits none.
- `rg '(rel|fin|primer|devlog)-' public` found only disjoint surviving admin ids/classes (`primer-admin-*`, `devlog-admin-content`), not deleted class tokens. A first complex dynamic-class regex failed PowerShell parsing; the exact-token census was the successful safer retry.
- `rg` and surrounding reads of both fetch shims showed `dev-fixtures.js` falls through to real fetch and `dt-proto-boot.js` returns its existing generic responses; other handlers are unchanged. Server diff inspection found the ticket import/mount cleanly removed.
- New-test line probes confirmed every one of the 12 tests has a same-test positive control that fails against an empty body. Controls were respectively: visible `#app`; six surviving containers; rendered More grid plus Spheres; non-empty section labels; rendered `#bnav` plus Check-In; rendered sidebar plus Storyteller; successful `window.goTab` execution; active Settings; visible admin app; visible/active Devlog; visible/active City; and observable overlay display changes. None relies only on another test’s control.
- Error-listener ordering found three late registrations (deleted-id `goTab`, Settings, Rules overlay) and two pre-navigation registrations (admin removal, City). CSS/comment/test-edit checks otherwise produced no Pass 1 issue.

### Pass 2 command/results log

- `git status --short` recorded the pre-existing dirty tree; `rg --files -g AGENTS.md` found no `AGENTS.md`.
- `git diff 40cee7fb -U0 -- public/css/components.css | ... npcr-` returned **1**, the added comment. The field-by-field deleted-module extraction found 9 classes: `npcr-btn`, `npcr-field`, `npcr-field-label`, `npcr-modal`, `npcr-modal-actions`, `npcr-modal-body`, `npcr-modal-overlay`, `npcr-modal-title`, `npcr-textarea`; every one is emitted by surviving admin/editor code. No `npcr-*` selector/rule is deleted.
- Reverse CSS searches found no surviving deleted-prefix style rule, no surviving deleted tab-id selector, and no surviving source emitting a deleted class. `.reading-pane` base rules remain in `components.css`; surviving consumers were found in Archive/editor and seven tab/form modules. Only the Primer-scoped overrides/selectors were removed.
- Role/section/storage tracing found both renderers skip empty sections, `MORE_SECTIONS` matches the remaining apps, ST/coordinator/player filters have non-empty valid sections, and no tab id is restored from storage/hash. The only DOM-derived redispatch reads an actually active surviving container.
- Payment/helper inspection found `readPayment` still used by Check-In, `normalisePaymentMethod` still used internally, and no removed `.fin-*` class in `signin-tab.js`. The `finances` fixture remains schema-valid and is unread by the retained UI.
- Admin searches found no `d-tickets`, `tickets-admin-content`, ticket domain, stylesheet, view, route or schema reference in runtime/test code. Default admin markup remains Characters; unknown domains can blank the view only via programmatic `switchDomain`, with no persisted/hash path.
- External reads confirmed Herald polls `/api/devlog` and Wiki reads canon relationships; `server/index.js` still mounts `/api/devlog`, `/api/downtime_cycles`, and `/api/relationships`. Herald’s own file discloses its pre-existing unauthenticated-401 limitation.
- A first isolated-server command timed out after a PowerShell `String($port)` typo; the corrected hidden server on port 18935 returned **404**, `Cannot GET /api/tickets`, then was stopped and its temp logs removed.
- Port 8080 returned Terra Mortis with `#app`. The focused stale-test run executed 6 cases: all five feat.17 Rules tests failed waiting for deleted `#t-rules`; the `post-game-1` navigation case failed earlier waiting for pre-existing `#n-more`, so it was not attributed to this deletion.
- One broad `/api/tickets` `rg` timed out in the very large scripts tree; the scoped retry over runtime routes/schemas/tests found no surviving reference.

### Pass 3 command/results log

- Story heading discovery reported Story line 8, AC line 27, Not-in-scope line 46, Tasks line 58, Dev Notes line 84, Dev Agent Record line 184. The two ranges were read in the required order.
- Exact `/api/tickets` test search returned `NO_TICKET_404_ASSERTION`; coordinator search returned `NO_COORDINATOR_FIXTURE_IN_TARGETED_BROWSER_SPECS`.
- `npx playwright test tests/issue-1135-deleted-tabs.spec.js --reporter=line` → **12 passed (12.2s)**.
- `npx playwright test tests/fin-checkin-finance.spec.js tests/issue-502-devlog-tab.spec.js --reporter=line` → **7 passed (6.5s)**.
- `cd server && npx vitest run tests/api-devlog.test.js tests/api-relationships.test.js` → **2 failed suites, 53 skipped, 0 passed**, Mongo connection `EACCES`. The required escalation was requested and rejected because the configured external MongoDB could be mutated; it was not bypassed.
- `npx playwright test tests/desktop-and-css.spec.js --reporter=line` → current **12 failed / 7 passed (9.7m)**.
- Base `40cee7fb` was reconstructed with `git archive` into an OS temp directory and served on port 18081. The first `npx http-server` attempt failed because sandboxed npm tried to fetch the package; Python’s built-in server was the successful retry. The full base run executed 20 tests and retained 12 failed ids; isolated `--grep 'Primer tab renders styled TOC'` → **1 passed (4.0s)**, establishing base **12 failed / 8 passed**. The temp tree was path-validated, recursively removed, and confirmed absent.
- A separate base-public run of the current issue-1135 spec on port 18082 → **8 failed / 4 passed (57.4s)**, exactly the discrimination claim. Its temp tree was validated and removed.
- `npx playwright test tests/admin.spec.js -g "City Domain" --reporter=line` → current **4 failed / 4 passed (23.4s)**. The same current spec against base public on port 18083 → identical **4 failed / 4 passed (20.7s)**. Its temp tree was removed.
- Both exact `git diff ... | grep -c "npcr-"` forms returned **1**. The sole line is an added comment; selector/rule diff remains zero.
- Brace/rule checks: base/current braces were `suite.css` 1442/1442 → 1358/1358 and `components.css` 1777/1777 → 1692/1692. Chromium CSSOM type counts were Suite style 1421 → 1338, media 12 → 11; Components style 1763 → 1678. `git diff 40cee7fb --check` exited 0 (only line-ending warnings).
- Repo documentation grep found the repointed ADM files plus stale current references in `system-map.md`, `reference-data-ssot.md`, and `epic-city-refresh.md`; intentionally historical/superseded ADM citations were left out of the finding.
- Final port checks found no listeners on 18081/18082/18083/18935. No source file was edited by this review. The only persistent file created is this requested findings report; all scratch configs/trees and temporary server logs were removed. `git status --short` shows the same reviewed source/test changes plus this report, with no unintended review edit.

### Could not run / verify

- The two server suites could not execute their 53 tests because no safe local MongoDB was available and external-DB escalation was rejected. The record’s historical “53 passed” is therefore unverified here.
- The full `tests/admin.spec.js` was not run; only the claimed City Domain subset was run on both trees, as above.
- No destructive collection check/drop or ticket export validation was attempted; both are explicitly out of scope.
