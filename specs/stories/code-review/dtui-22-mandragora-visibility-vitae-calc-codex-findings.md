# Adversarial review findings — dtui-22

## High

- None found.

## Medium

### [Pass 1] The zero-dot Vitae Projection test can pass when the entire budget panel is missing

**Severity:** Medium  
**File:line:** `tests/dtui-22-mandragora-vitae-projection.spec.js:218`  
**Triggering input or sequence:** Run the final test with a zero-dot Mandragora entry while a regression prevents `.dt-vitae-budget` (or the Vitae Projection contents within it) from rendering, but leaves the outer Feeding section expandable.  
**Observable consequence:** `budget.locator(...).toHaveCount(0)` still succeeds because the chained locator has zero matches; the test reports the Blood Fruit zero-dot behavior as correct without proving that the consumer surface under test exists. The separate hidden-checkbox assertion does not validate the budget panel.  
**Confidence:** High. This follows directly from the test's only assertion on the Vitae Projection side being an expected zero count beneath a locator that is never positively asserted.

### [Pass 2] An unattached Mandragora Garden still passes the new “effective dots” gate

**Severity:** Medium  
**File:line:** `public/js/editor/domain.js:379` (observed at the new call site in `public/js/tabs/downtime-form.js:4986`)  
**Triggering input or sequence:** A character has `{ category: 'domain', name: 'Mandragora Garden', cp: 2, xp: 0 }` with no `attached_to`. `_havenCap()` returns `0`, but `Math.min(effectiveStored, cap || stored)` substitutes `stored` when the cap is zero, so `meritEffectiveRating()` returns `2` and the new `>= 1` gate succeeds.  
**Observable consequence:** The player sees the checkbox, +3-dice notice, `0 / 2` capacity, and two Blood Fruit even though the editor explicitly warns that an unattached Garden “contributes 0 dots until linked.” The new gate is consistent with its chosen helper, but the helper's zero-cap arithmetic does not implement its own documented anchor rule.  
**Confidence:** High. Static tracing and a direct Node import both returned `2` for this exact shape.

This was produced before the spec was read. Pass 3a later confirmed that the story explicitly discloses this shared-helper inconsistency and places fixing it out of scope; it is therefore confirmation of known behavior, not a new patch requirement for dtui-22.

### [Pass 2] A saved parked rite becomes unrepresentable but remains mechanically active after Garden dots fall to zero

**Severity:** Medium  
**File:line:** `public/js/tabs/downtime-form.js:858`  
**Triggering input or sequence:** Save `sorcery_1_mandragora: 'yes'` while effective Garden dots are positive; later reduce/suspend the character's effective Garden dots to zero and reopen/re-render the advanced form with that response document.  
**Observable consequence:** `hasMandragora` hides the checkbox, so the player cannot untick it. `collectResponses()` sees no checkbox and deliberately preserves the prior `'yes'`; the Vitae Projection loop at line 7282 therefore continues to omit that rite's Vitae cost, and downstream consumers continue to receive it as parked despite zero current capacity. The state is not silently lost, but it is orphaned and cannot be corrected through this form.  
**Confidence:** High. The render gate, preserve-prior save branch, and Vitae-cost skip all operate on this exact sequence with no revalidation against current effective dots.

### [Pass 3a] AC5 is false for the editor-supported `bonus` dot channel

**Severity:** Medium  
**File:line:** `public/js/editor/domain.js:368` (consumed by `public/js/tabs/downtime-form.js:4986` and `:7292`)  
**Triggering input or sequence:** Give a Mandragora Garden a valid attached Safe Place/Sepulcher with sufficient cap, set the Garden to `cp: 0, xp: 0, bonus: 1`, and render the Blood Sorcery and Feeding sections. `meritBdRow()` exposes a Bonus control for domain merits and the sheet display includes `m.bonus`, but the `CAP_DOMAIN` branch computes `stored` as only CP + XP + `meritFreeSum(m)`.  
**Observable consequence:** `effectiveDomainDots()` returns `0`; the checkbox, +3 notice, capacity, and Blood Fruit line are all hidden even though the character sheet displays one usable bonus dot. With `cp: 1, bonus: 1`, both surfaces report one instead of two. This violates AC5's literal “inherent + every bonus channel” requirement (and AC1 for a bonus-only effective rating), while AC4 still holds only because both surfaces share the same incomplete figure.  
**Confidence:** High. The Bonus control is present for domain merits (`public/js/editor/xp.js:270-272`), the sheet adds `m.bonus`, the capped helper omits it, and direct Node evaluation of an attached bonus-only Garden returned `0`.

### [Pass 3a] The story's no-inaccessible-benefit intent is violated by preserved zero-capacity parking state

**Severity:** Medium  
**File:line:** `public/js/tabs/downtime-form.js:858`  
**Triggering input or sequence:** Persist a parked rite while the Garden is positive, then reduce its effective dots to zero and reopen the form.  
**Observable consequence:** AC3's literal visibility assertions pass, but the saved invisible `'yes'` continues to waive rite Vitae cost. That contradicts the Story-level promise that the form will not offer a garden benefit the character “doesn't actually have access to,” and the state cannot be changed through the now-hidden control.  
**Confidence:** High for the behavior and the stated-intent conflict; the five literal ACs do not explicitly prescribe migration/clearing of prior saved state.

### [Pass 3b] The Dev Agent Record falsely reports both adjacent suites green

**Severity:** Medium  
**File:line:** `specs/stories/dtui-22-mandragora-visibility-vitae-calc.story.md:164`  
**Triggering input or sequence:** Run the record's exact single-worker commands on the current branch, then temporarily restore `public/js/tabs/downtime-form.js` to base `12543b35` and rerun the legacy Vitae suite.  
**Observable consequence:** The record says both adjacent suites were green. In reality, `dt-vitae-projection.spec.js` ran 8 tests: 5 passed and 3 failed on removed `.dt-feed-rote-section` / `button[data-feed-rote]` UI. The base A/B produced the identical 5/3 result, so those failures are pre-existing and do not implicate dtui-22, but “both green” is still false. The review prompt's separate expectation of “the other 10 tests” is also stale: the current file contains 8 tests total, not 13. `dt-form-37-sorcery-targets-stringify.spec.js` really was green at 5/5.  
**Confidence:** High. Both current and base A/B commands completed with identical named failures and counts.

## Low

### [Pass 1] The “identical calculation” comment overstates what the diff alone establishes

**Severity:** Low  
**File:line:** `public/js/tabs/downtime-form.js:4981`  
**Triggering input or sequence:** The Blood Sorcery call evaluates `effectiveDomainDots(currentChar, 'Mandragora Garden')`, while the Vitae Projection call evaluates `effectiveDomainDots(c, 'Mandragora Garden')`; if those references ever differ during rendering, the surfaces can disagree despite the comment.  
**Observable consequence:** A maintainer is told the argument lists are identical and the displays “never disagree,” although the diff alone proves only that the helper and merit-name string match, not that `currentChar === c` at both call sites.  
**Confidence:** Medium. The mismatch in variable references is certain from the diff; whether they resolve to the same object required repository context deliberately unavailable in this pass.

Pass 2 later resolved the uncertainty: inside the `feeding_method` case, `const c = currentChar`, so both calls do receive the same object and exact merit-name string. The blind-pass finding remains recorded as required.

### [Pass 2] Reachable duplicate Garden rows make the gate depend on array order

**Severity:** Low  
**File:line:** `public/js/tabs/downtime-form.js:417`  
**Triggering input or sequence:** A character has two domain-category Mandragora Garden rows, with a zero-dot row first and a positive-dot row second. This malformed-but-reachable shape can be created because `shAddDomMerit()`/`addMerit()` append without singleton deduplication and the domain picker only special-cases duplicate Herd rows; imports can also carry duplicates.  
**Observable consequence:** `effectiveDomainDots()` uses `.find()` and ignores the positive second row, so the checkbox and benefits are hidden. The old name-possession `.some()` gate would have been true for the same array. Reversing the two rows reverses the new result.  
**Confidence:** High for the code path and editor reachability; Medium for production frequency because Mandragora Garden is documented as a singleton merit.

## Pass conclusions

### Pass 1 — frozen blind conclusions

- No second behavioral edit was visible in the production hunks: the Vitae Projection hunk changed comments only, and the `mandragoraCap` edit reused the newly computed local.

- For a present merit under the old gate, old and new `mandragoraCap` both preserve any returned decimal, negative number, or `NaN`. For an absent merit, the old expression forced `0` while the new expression exposed whatever `effectiveDomainDots()` returned; the helper contract was not visible in the diff.

- The absent checkbox assertions have positive form/section prerequisites. The final zero-dot Blood Fruit assertion lacks an equivalent positive assertion for its immediate `.dt-vitae-budget` container.

- Missing `cp`/`xp` fields were an unverified edge in the blind pass, not a finding.

### Pass 2 — traced outcomes

- Exact helper outcomes: no matching entry → `0`/hidden; unattached `cp:2,xp:0` → `2`/shown; present `cp:0,xp:0` → `0`/hidden; missing `cp`/`xp` → `0`/hidden; `cp:2,_suspended_dots:5` → `0`/hidden. `applySuspensionTo()` floors at zero, so suspension cannot create negative capacity.

- `mandragoraDots`, `hasMandragora`, and `mandragoraCap` are function-local and recomputed on every `renderSorcerySection(saved)` call. There is no Garden-specific cache.

- Blood Fruit is deliberately independent of `sorcery_N_mandragora`; that flag only skips the selected rite's Vitae cost.

- Real/editor-created merit rows normally add `cp`, `xp`, free-dot fields, `bonus`, `rating`, and `rule_key`. Missing numeric/free fields default to zero. The lean positive fixture's omitted `attached_to` exercises the known zero-cap inconsistency.

- The production diff is call-site-only. `public/js/editor/domain.js` is untouched.

### Pass 3a — acceptance disposition

- AC1-AC4 are implemented literally for the story's named no-merit, zero-CP/XP/free-dot, and positive-CP fixtures. AC4's character arguments are aliases.

- AC5 is not fully satisfied because the capped-domain helper omits `m.bonus`.

- The diff respects the out-of-scope boundary: it does not modify `domain.js`, the ST-side admin calculation, dtui-21, or dtui-23.

- The unattached-anchor inconsistency was independently confirmed, but the spec explicitly makes its fix out of scope.

- Blood Fruit remains deliberately decoupled from any particular checkbox response; this is not flagged.

### Pass 3b — claim audit and ship decision

- **Verified true:** `mandDots = effectiveDomainDots(c, 'Mandragora Garden')` existed in base `12543b35`; the Vitae hunk is comment-only; the `hasMandragora`/`mandragoraCap` edit is the only production behavior change; no `Mandragora` reference exists in `public/js/suite/roll-v2.js`, and the actual `mainPool` feeding calculation contains no Mandragora term; the new suite is 5/5; the sorcery-target suite is 5/5.

- **False as written:** the Dev Agent Record says both adjacent suites were green. The legacy Vitae suite is 5 passed / 3 failed, with the same result against base. The prompt's claimed 10 remaining green tests is also inconsistent with the current 8-test suite.

- **Ship decision:** needs patches before shipping as-is. The `m.bonus` AC5 miss and the orphaned saved-`yes` transition are real correctness gaps. The known unattached-anchor behavior remains explicitly out of this story's scope.

## Validation notes

### Files opened and blinding attestation

- **Pass 1:** Opened only `specs/stories/code-review/dtui-22-mandragora-visibility-vitae-calc-diff.txt` (plus the findings output path to create it). I did not inspect repository source, tests, story, review, or run-log files before freezing Pass 1.

- **Pass 2:** Directly opened relevant ranges of `public/js/tabs/downtime-form.js`, `public/js/editor/domain.js`, `public/js/data/rules-helpers.js`, `public/js/editor/edit-domain.js`, `public/js/editor/merits.js`, `public/js/editor/sheet.js`, `schemas/schema_v2_proposal.md`, `tests/feat-746-dt-form-mg-parked-prefill.spec.js`, and `tests/dt-vitae-projection.spec.js`; searched matching `*.js`, `*.json`, and `*.md` files under `public/js`, `tests`, and `schemas` while explicitly excluding the dtui-22 story. I also inspected the base-commit version/diff of `downtime-form.js`. I did not read the story, Dev Agent Record, Senior Developer Review, `...codex-review.md`, or `...codex-run.log` before freezing Pass 2.

- **Pass 3a:** Used headings only to locate boundaries, then opened story lines 9-116 (Story, Context, scope/out-of-scope, AC1-AC5, and Implementation Notes). I stopped before line 150 and did not read the Dev Agent Record or Senior Developer Review. For AC5 I additionally opened relevant ranges of `public/js/editor/domain.js`, `public/js/data/rules-helpers.js`, `public/js/editor/sheet.js`, `public/js/editor/xp.js`, and `public/js/editor/edit-domain.js`. Pass 3a was frozen before advancing.

- **Pass 3b:** Opened story lines 150-end (Dev Agent Record, Senior Developer Review placeholder, File List), `playwright.config.js`, `package.json`, current test files through execution, and base/current diffs. Searched `public/js` for Mandragora/feeding-roll interactions. I never opened the pre-existing `...codex-review.md` or `...codex-run.log`.

### Commands and real results

1. `Get-Content -Raw specs/...-diff.txt` — succeeded; this was the only review input in Pass 1. `Test-Path specs/...-findings.md` returned `False`; the findings file was then created with `apply_patch`.

2. `rg --files -g AGENTS.md ...` plus targeted `rg` searches in `downtime-form.js`, `domain.js`, and `public/js` — no `AGENTS.md` was found; helper/render/save references were located. Output was partly truncated because the initial combined search was large.

3. One attempted parallel shell-orchestration script failed with exit 1 before producing usable output. A later PowerShell `rg` command containing `${}` also failed at parse time; neither changed files. Both were rerun with safe quoting.

4. Targeted `Get-Content` range commands for `domain.js` and `downtime-form.js` — succeeded and exposed `_havenCap`, `meritEffectiveRating`, `collectResponses`, `renderSorcerySection`, and the full Vitae Projection block.

5. `rg -n 'Mandragora Garden|mandragora|mg_locked' public/js tests schemas ...` — succeeded; located all relevant save/render/admin/test references. A broad match in minified/one-line `dev-fixtures.js` caused truncated display, disclosed here.

6. `rg`/`Get-Content` commands for `applySuspensionTo`, `shAddDomMerit`, `addMerit`, option generation, schema merit shape, and existing Mandragora fixtures — succeeded. They confirmed zero-floor suspension, missing singleton deduplication, and normal editor fields.

7. `git diff --stat 12543b35 -- public/js tests`, `git diff 12543b35 -- public/js/editor/domain.js`, and `git diff --name-only ...` — production result was only `public/js/tabs/downtime-form.js`; `domain.js` had no diff. The new test is untracked, so ordinary `git diff` did not list it.

8. `git show 12543b35:public/js/tabs/downtime-form.js | Select-String ...` — confirmed both the pre-story possession gate/cap expression and the already-existing `mandDots = effectiveDomainDots(c, 'Mandragora Garden')` call.

9. Direct Node import trace of `meritEffectiveRating()` — succeeded: missing merit `0`; unattached CP2 `2`; zero CP/XP `0`; missing CP/XP fields `0`; CP2 with five suspended dots `0`.

10. `Select-String '^#{1,4} '` on the story — returned section boundaries only. `Get-Content` then read lines 9-116 for Pass 3a and, only after freezing it, lines 150-end for Pass 3b.

11. `rg`/`Get-Content` for `meritFreeSum`, `m.bonus`, `meritBdRow`, and `shEditDomMerit` — succeeded. Direct Node traces for an attached and unattached `{ bonus: 1, cp: 0, xp: 0 }` Garden both returned `0`.

12. Port check via `Get-NetTCPConnection -LocalPort 8080 -State Listen` returned `PORT_8080_FREE`. Later `netstat -ano` confirmed the temporary Python server listener and, after shutdown, `PORT_8080_FREE_AFTER_STOP`.

13. First exact gate attempt, `npx playwright test tests/dtui-22-mandragora-vitae-projection.spec.js --workers=1`, did **not reach tests**: after 60 seconds the configured `npx http-server` tried to fetch from the blocked npm registry and failed `EACCES`. This was an environment/tooling failure, not a code failure.

14. `Get-Content playwright.config.js`, `Get-Content package.json`, and local-path checks — succeeded; config uses `npx http-server`, local `http-server`/Playwright shims were absent, `serve` was also absent, and Python was available at `C:\Python314\python.exe`. One `Get-ChildItem node_modules/.bin` diagnostic exited 1 because the directory was absent.

15. `Start-Process C:\Python314\python.exe -m http.server 8080 --directory public -WindowStyle Hidden` started PID 33636. The first two-second listener probe reported false-negative `PYTHON_SERVER_FAILED_PID=33636`; `netstat` subsequently confirmed PID 33636 listening. A foreground diagnostic invocation timed out after five seconds because the server remained running. `Get-CimInstance` was access-denied, while `netstat` succeeded.

16. `npx playwright test tests/dtui-22-mandragora-vitae-projection.spec.js --workers=1` with the local server — **5 passed / 0 failed**.

17. `npx playwright test tests/dt-vitae-projection.spec.js --workers=1` — **5 passed / 3 failed (8 total)**. Failures were exactly the removed `.dt-feed-rote-section` and `button[data-feed-rote]` expectations at tests 146, 157, and 173; the pre-existing Mandragora Blood Fruit test passed.

18. `npx playwright test tests/dt-form-37-sorcery-targets-stringify.spec.js --workers=1` — **5 passed / 0 failed**.

19. Using `apply_patch`, I temporarily restored only the three dtui-22 hunks in `downtime-form.js` to base. `git diff --exit-code 12543b35 -- public/js/tabs/downtime-form.js` returned clean. The base A/B command `npx playwright test tests/dt-vitae-projection.spec.js --workers=1` again produced **5 passed / 3 failed**, with the identical three failures.

20. Using `apply_patch`, I restored the dtui-22 hunks exactly. `git diff --check 12543b35 -- public/js/tabs/downtime-form.js` produced no errors; `git diff --numstat` returned `19 3`; the displayed diff matched the supplied production hunk. PowerShell/Git emitted only the existing LF→CRLF warning.

21. `rg -i` across `public/js`, `rg -i mandragora public/js/suite/roll-v2.js`, and `rg 'computeBestFeedingPool|mainPool|feedPool' ...` — no Mandragora reference exists in `roll-v2.js`; the player feeding `mainPool` is attribute + skill + discipline + Feeding Grounds + speciality, with no Mandragora term. The broad same-line search matched unrelated one-line fixtures and an admin rite-pool comment, so it was not treated as standalone proof.

22. `Stop-Process -Id 33636 -Force` stopped only the temporary server; port 8080 was confirmed free afterward. Final `git status --short` showed the original dtui-22 source/test/story/diff and pre-existing review/run-log files plus this required findings file; no test artifacts or unintended source changes appeared.

### Could not run

- Server-side `vitest` was not attempted, exactly as instructed: `server/node_modules` is absent in this worktree and the disclosed failure is `ERR_MODULE_NOT_FOUND` for Vitest itself.

- The first Playwright invocation could not use the configured `npx http-server` because network/cache access was unavailable. All three required gates were nevertheless run successfully through an equivalent local Python static server, with the exact gate commands unchanged.

### Modification/restoration attestation

I made no product or test changes. I created only this required findings file. The temporary base A/B edit to `public/js/tabs/downtime-form.js` was restored exactly and verified by `git diff --check`, the expected `19/3` numstat, and visual diff comparison. The temporary Python server was stopped and port 8080 was free. `git status --short` is not globally clean because the reviewed dtui-22 files and several supplied code-review artifacts are intentionally modified/untracked; there is no unintended change from this review.
