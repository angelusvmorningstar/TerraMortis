# Adversarial review — rlv.6

## Pass 1 — Blind Hunter (frozen before repository access)

### High

- [Pass 1] None found.

### Medium

- [Pass 1] None found.

### Low

- [Pass 1] None found.

The import hunk leaves a valid import block and preserves the pre-existing `#836` explanation without duplication; `switchDomain()` loses exactly its one no-op Engine line; the CSS deletion begins and ends between complete rules; and both Playwright deletions are complete calls with balanced closures. Each new negative assertion targets a path, import, branch, selector, describe title, or test title visibly present on the pre-change side of this diff, so none is trivially passing against the shown base state.

## Pass 2 — Edge Case Hunter (frozen before story access)

### High

- [Pass 2] None found.

### Medium

- **[Pass 2] A surviving Playwright test deterministically fails because it still asserts the deleted `.de-roll-btn` CSS.**
  - **Severity:** Medium
  - **File:line:** `tests/post-game-1.spec.js:368`
  - **Triggering input or sequence:** Run `npx playwright test tests/post-game-1.spec.js --grep 'admin dice engine roll button min-height' --reporter=line`; the test opens the admin page at 390×844, appends a synthetic button with class `de-roll-btn`, and reads its computed `min-height`.
  - **Observable consequence:** The removed admin-layout rule leaves the synthetic element with `min-height: 0`, so the assertion expecting at least 48px fails. Any gate that includes this otherwise-surviving Playwright file acquires a new failure from this deletion.
  - **Confidence:** High — reproduced directly; Playwright reported expected `>= 48`, received `0` at line 383.

### Low

- **[Pass 2] The dispatcher still contains a second statically unreachable domain branch (`npcs`).**
  - **Severity:** Low
  - **File:line:** `public/js/admin.js:330`
  - **Triggering input or sequence:** Exercise every real `.sidebar-btn[data-domain]` in `public/admin.html`; none supplies `npcs`, `switchDomain()` is private, and its only call site passes `btn.dataset.domain`. `tests/issue-23-npc-register.spec.js:52` explicitly asserts that the NPC Register button is absent.
  - **Observable consequence:** `initNpcRegister` remains imported and its branch remains dead, leaving another instance of the same no-static-caller dispatcher debt immediately after the Engine cleanup. There is no current end-user runtime failure because the path cannot be reached through the UI.
  - **Confidence:** High — static button/branch extraction found `npcs` as the sole branch without a button, and the repository test documents that absence as intentional.

## Pass 3a — Acceptance Auditor before Dev Agent Record (frozen)

### High

- [Pass 3a] None found.

### Medium

- [Pass 3a] None found beyond the surviving `.de-roll-btn` gate failure already frozen in Pass 2.

### Low

- **[Pass 3a] The story explicitly places the Pass 2 NPC dispatcher observation outside this change's scope.**
  - **Severity:** Low
  - **File:line:** `specs/stories/rlv-6-delete-legacy-roller-and-flag.md:86` (context: `public/js/admin.js:330`)
  - **Triggering input or sequence:** Compare the Pass 2 domain-map result with the story's “What this story is NOT” section, which says this is not a broader admin navigation audit and should not seek other dead code in `admin.js`.
  - **Observable consequence:** The frozen Pass 2 observation remains factually valid repository debt, but it is not an AC violation and should not be patched as part of rlv.6. It does not affect readiness for this scoped deletion.
  - **Confidence:** High — the exclusion is explicit at story lines 86–88.

All seven acceptance criteria are otherwise met literally. The diff did not alter the out-of-scope `Admin — Next Session Panel` block or its Engine clicks, and the separate `#session-tracker` CSS begins intact immediately after the preserved Player View rule. AC6's four named protections are all present and meaningful; the suite also adds narrower checks for `#feeding-engine` and the two removed Playwright titles.

## Pass 3b — Dev Agent Record audit

### High

- [Pass 3b] None found.

### Medium

- **[Pass 3b] The record's “pure, verified-safe deletion” and “No High/Medium findings” conclusion overlooks a deletion-caused Playwright gate failure.**
  - **Severity:** Medium
  - **File:line:** `specs/stories/rlv-6-delete-legacy-roller-and-flag.md:238` (triggering test: `tests/post-game-1.spec.js:368`)
  - **Triggering input or sequence:** Follow Task 6's regression claim beyond `tests/admin.spec.js` and run the surviving EPB.3 admin dice-engine test after the `.de-roll-btn` rule has been removed.
  - **Observable consequence:** The test fails with computed `min-height` 0 instead of at least 48px. The record's regression conclusion is therefore overstated: it verified the edited admin spec but missed another Playwright file coupled directly to the deleted CSS.
  - **Confidence:** High — independently reproduced in Pass 2; the failure is a direct before/after consequence of the rule shown as deleted in the supplied diff.

### Low

- **[Pass 3b] The claimed “14-suite / 342 passed” vitest batch is unverifiable as stated from the current repository.**
  - **Severity:** Low
  - **File:line:** `specs/stories/rlv-6-delete-legacy-roller-and-flag.md:238`
  - **Triggering input or sequence:** Grep current `server/tests/*.test.js` for `admin.js`, then run the resulting files. The current literal grep returns 19 files, while the record supplies no exact 14-file command/list.
  - **Observable consequence:** The claimed historical 342/342 number cannot be reproduced exactly. The current grep-derived run produced 13 passed / 6 failed files, with 309 tests passed and 168 skipped: five suites could not load because this sandbox blocks their MongoDB connection (`EACCES`), and the sixth was the claimed #836 `ENOENT`. The #836 failure itself is correctly described as unrelated: its line 69 reads `public/js/suite/tracker.js`, which is absent in both base commit `7d80228c` and the worktree and is untouched by this diff.
  - **Confidence:** High for the current grep/result and the #836 causal path; historical 342/342 remains unverified rather than disproved because the record omits its file list and this environment cannot load the five DB-backed suites.

- **[Pass 3b] The record says seven Next Session tests failed, but the block contains and reports six.**
  - **Severity:** Low
  - **File:line:** `specs/stories/rlv-6-delete-legacy-roller-and-flag.md:251`
  - **Triggering input or sequence:** Run `npx playwright test tests/admin.spec.js --reporter=line` and enumerate the failures under `Admin — Next Session Panel`.
  - **Observable consequence:** Six Next Session failures are reported, not seven. The overall 11 passed / 14 failed headline is still correct, and all other named failure groups match, so this is a record-accuracy error rather than a code defect.
  - **Confidence:** High — the completed run executed all 25 current tests and reported exactly six names from that describe block.

## Readiness

**Needs a small patch before shipping.** The product-code deletion and its scoped acceptance criteria are sound, but `tests/post-game-1.spec.js:368-384` must be removed or otherwise retired with the dead admin dice CSS so the change does not introduce a deterministic test-gate failure. There is no blocking product-runtime problem and no High-severity finding.

## Validation notes

### Pass isolation and files opened

- **Pass 1:** Opened only `specs/stories/code-review/rlv-6-diff.txt`, in one initial read and then numbered chunks because the first output was truncated. I did not inspect any repository source, story, spec, tracking file, or sibling repository before freezing Pass 1.
- **Pass 2:** After Pass 1 was written, inspected matches/context from `public/admin.html`, `public/js/admin.js`, `public/css/admin-layout.css`, `tests/admin.spec.js`, `tests/post-game-1.spec.js`, `tests/issue-23-npc-register.spec.js`, `public/mockups/font-test.html`, and `server/tests/rlv-6-dice-engine-removed.test.js`. Repo-wide greps scanned only `public`, `tests`, and `server`. I did not open the story or its Dev Agent Record before freezing Pass 2.
- **Pass 3a:** After Pass 2 was written, opened only lines 1–203 of `specs/stories/rlv-6-delete-legacy-roller-and-flag.md` (Story through Dev Notes/References). I first listed headings to establish the Dev Agent Record boundary, did not expose lines 204 onward, and froze Pass 3a before continuing.
- **Pass 3b:** After Pass 3a was written, opened lines 204–266 (the Dev Agent Record), plus lines 61–78 of `server/tests/issue-836-legacy-tracker-cache-removed.test.js` to trace its failing read. Test runners loaded the suites/resources named below. No sibling repository outside `D:\Terra Mortis\TM Game` was read or touched.

### Commands run and real results

#### Pass 1

1. `Get-Content -LiteralPath 'specs/stories/code-review/rlv-6-diff.txt'` — exit 0; output was truncated by the tool (851 lines total, 783 displayed metadata), so I did not rely on it alone.
2. `$diffLines = Get-Content ...;` numbered lines 1–300 — exit 0.
3. `$diffLines = Get-Content ...;` numbered lines 301–600 — exit 0.
4. `$diffLines = Get-Content ...;` numbered lines 601–851 — exit 0.

#### Pass 2

5. Attempted one parallel four-command read batch (reference grep, `admin.html` Engine/domain grep, `switchDomain()` context, and CSS-boundary/brace read). The orchestration returned exit 1 with no subcommand output, so every check was rerun explicitly and no result was inferred from this failed batch.
6. `rg -n -i --glob 'public/**' --glob 'tests/**' --glob 'server/**' 'dice-engine|initDiceEngine|#dice-engine|#feeding-engine|de-char|de-roll'` with an exit-1-to-`NO MATCHES` wrapper — exit 0, `NO MATCHES`; the glob form did not select the intended files on this Windows invocation, so I reran with explicit directories.
7. `rg -n -i 'dice-engine|initDiceEngine|#dice-engine|#feeding-engine|de-char|de-roll' public tests server` — exit 0; found the new guard suite and admin comment, mockup specimens, and the surviving `tests/post-game-1.spec.js` `.de-roll-btn` test.
8. `rg -n -i 'engine|data-domain|id="d-|id="[^"]*-content' public/admin.html` — exit 0; no Engine domain/button/mount point, only “Rules Engine”; listed all static domain buttons and sections.
9. `rg -n -C 45 'function switchDomain' public/js/admin.js` — exit 0; read the full dispatcher body and adjacent call setup.
10. `rg -n -i -C 5 'data-domain=["'']npcs|domain\s*[:=].*["'']npcs|switchDomain\(' public tests server` — exit 0; confirmed no NPC button, one private branch, the sidebar-only caller, and the test that explicitly expects no NPC button.
11. Numbered `tests/post-game-1.spec.js` lines 341–395 — exit 0; exposed the surviving EPB.3 test.
12. `npx playwright test tests/post-game-1.spec.js --grep 'admin dice engine roll button min-height' --reporter=line` — exit 1; **1 failed**, expected `>=48`, received `0` at line 383.
13. Numbered `tests/admin.spec.js` ranges 115–180 and 285–355 — exit 0; surrounding Sidebar/City/Theme structure intact.
14. Numbered `tests/admin.spec.js` lines 175–260 — exit 0; Next Session and Player blocks intact, with no shared ordering dependency on deleted tests.
15. Numbered `public/css/admin-layout.css` lines 2536–2605 plus regex brace count — exit 0; clean boundaries, session-tracker block intact, **2308 `{` / 2308 `}`**, 10,198 lines.
16. Parallel read-only checks: `node --check public/js/admin.js` — exit 0; `node --check tests/admin.spec.js` — exit 0; broad dynamic-dispatch/import grep — exit 0 (output was large/truncated, with no dynamic `initDiceEngine` caller exposed).
17. `rg -n -i 'id=["'']de-(char|roll)["'']|#dice-engine|#feeding-engine|initDiceEngine|dice-engine\.js' public tests server` — exit 0; only explanatory/guard-suite occurrences remained, no live ID/caller.
18. PowerShell regex extraction comparing `admin.html` `data-domain` values with `admin.js` equality branches — exit 0; `npcs` was the sole branch without a static button; `player` was the sole static button without an init branch.

#### Pass 3a

19. `rg -n '^#{1,4} ' specs/stories/rlv-6-delete-legacy-roller-and-flag.md` — exit 0; established allowed sections at lines 1–203 and Dev Agent Record start at 204.
20. Numbered story lines 1–203 only — exit 0; Dev Agent Record was not exposed.

#### Pass 3b

21. Numbered story lines 204–266 — exit 0; read the Dev Agent Record only after Pass 3a was frozen.
22. From `server`: `npx vitest run tests/rlv-6-dice-engine-removed.test.js` — exit 0; **1 file passed, 7/7 tests passed**.
23. `rg -l 'admin\.js' server/tests --glob '*.test.js' | Sort-Object` — exit 0; **19 files**, not a reproducible 14-file list.
24. `rg -n 'admin\.js' server/tests --glob '*.test.js'` — exit 0; inspected why each of the 19 matched.
25. From `server`: build the same current 19-file list with `rg`, print it, then `npx vitest run @adminTestFiles` — exit 1; **13 files passed / 6 failed; 309 tests passed / 168 skipped (477 total)**. Five suites failed to load because MongoDB connection attempts were blocked with `EACCES`; `issue-836-legacy-tracker-cache-removed.test.js` failed to load on the claimed `ENOENT`.
26. Numbered #836 test lines 61–78; `Test-Path public/js/suite/tracker.js`; `git cat-file -e 7d80228c:public/js/suite/tracker.js`; and `git diff --name-only 7d80228c -- public/js/suite/tracker.js` — exit 0 overall; line 69 is the failing read, tracker exists in neither worktree nor base, and this diff does not touch that path.
27. First exact `npx playwright test tests/admin.spec.js --reporter=line` — outer command timed out after 181.8s (exit 124) at test 10/25; not treated as a gate result. It had reproduced the first four expected failures.
28. Second exact `npx playwright test tests/admin.spec.js --reporter=line` with a sufficient outer timeout — exit 1 after 7.3 minutes; **11 passed / 14 failed (25 total)**. Failure groups: Auth 1, Sidebar 1, Next Session **6**, Player 1, City 4, Theme 1.
29. `git status --short; git diff --name-only; git diff --name-only --cached` — exit 0 with Git global-ignore permission warnings; showed the intended tracked story/source changes, pre-existing review artifacts, and this requested findings file; no staged changes.
30. Independent raw CSS regex count — exit 0; `admin-layout.css open=2308 close=2308 balanced=True`.
31. Final `git status --short` — exit 0 with Git global-ignore permission warnings. It showed exactly the same intended source/story set and pre-existing untracked review inputs as the earlier status, plus this requested untracked findings file; no additional tracked or staged change appeared.

### Could not run or reproduce

- I could not reproduce the author's exact “14 suites / 342 passed” batch because the record does not name its file list, the current literal grep returns 19 files, and five of those suites require a MongoDB connection that this sandbox rejects with `connect EACCES 159.143.141.178:27017`. I report the actual current 19-file result above.
- I did not perform the optional expensive pre-diff stash-isolation Playwright run, as the review protocol explicitly said it was not required. Therefore I did not independently verify the “byte-identical failures” claim; I verified the current 11/14 split and names only.
- The first full current Playwright attempt did not complete because its outer 180-second limit expired; I reran the exact command to completion with a longer limit.

### Workspace integrity

I made no temporary source edits, commits, stashes, or pushes. The only file I created/modified was the explicitly requested `specs/stories/code-review/rlv-6-codex-findings.md`. Playwright produced ignored test-result artifacts as part of execution. Final `git status --short` confirmed no additional tracked or staged changes from this review; no source file was changed by this review.
