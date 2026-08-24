# Adversarial review findings — rlv.4

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

- None found.

### Pass 2

#### `[Pass 2]` Pool buttons resolve against another container's rebuilt module-global array

- **Severity:** Medium
- **File:line:** `public/js/game/char-pools.js:52`, `public/js/game/char-pools.js:60`, `public/js/game/char-pools.js:166`; reachable through `public/js/app.js:906`, `public/js/app.js:1142`
- **Triggering input or sequence:** Start with character A rendered in both `#gcp-panel` (Sheets) and `#roll-char-pools` (Roll). On the Roll tab, use **Select Character** to choose character B; that path calls `pickChar(B)` and re-renders only `#roll-char-pools`, replacing module-global `_pools`, while character A's `#gcp-panel` buttons remain attached. Navigate to Sheets and click any visually-A pool button, especially A's **+ Custom Pool** tile when A and B have different counts of skill/power pools.
- **Observable consequence:** The retained A button reads its saved numeric index from B's freshly rebuilt `_pools` at click time. It can silently load a different B pool, open B's Custom Pool builder from a tile shown on A's sheet, or pass `undefined` and throw at `p.opensPanel` when A's custom-tile index is beyond B's shorter array. Existing skill/discipline tiles share the same defect; the new always-present, variable-index Custom Pool tile makes it directly reachable through this change's primary entry point.
- **Confidence:** High. Both containers coexist in `public/index.html`, the Roll character panel calls `pickChar()` without rebuilding the Sheets container, and the event closure dereferences the shared array only when clicked.

### Pass 3a

#### `[Pass 3a]` AC5's promised Rote eligibility cue cannot apply to a Custom Pool

- **Severity:** Medium
- **File:line:** `public/js/app.js:1086`; downstream gate at `public/js/suite/roll-v2.js:345`
- **Triggering input or sequence:** Load a character with Professional Training 5 whose `asset_skills` contains the Skill selected in Custom Pool, choose an Attribute plus that Skill, and press **Load Pool**.
- **Observable consequence:** AC5 literally promises that the existing Rote badge applies to Custom Pools exactly as it does to named pools, but the mandated/new `pi` has no `roteEligible` field and no downstream code derives it from `pi.skill`. The only `roll-v2.js` Rote-cue gate is `if (pi.roteEligible ...)`, so the eligible Custom Pool never displays the clickable **Rote ✓** cue. The always-available manual Rote chip still works if the user already knows to use it; the promised eligibility affordance does not. The story is internally inconsistent here because its enumerated canonical shape and exact Task 3 implementation omit the very field the literal AC says will work.
- **Confidence:** High on the code path and literal AC mismatch.

### Pass 3b

- None found.

## Low

### Pass 1

#### `[Pass 1]` The custom `pi` payload's downstream field contract is not verifiable from the scoped diff

- **Severity:** Low
- **File:line:** `public/js/app.js:1079` (new-file line shown by the diff)
- **Triggering input or sequence:** Select an Attribute and optionally a Skill and Discipline in the Custom Pool panel, then press **Load Pool**; the new `{ total, attr, attrV, skill, skillV, unskilled, discName, discV, resistance }` object is passed to the unchanged `loadPool(total, label, pi)` implementation.
- **Observable consequence:** The diff's Playwright expectations imply that the unchanged breakdown renderer consumes `discName`/`discV` and the other fields, but the diff does not include that implementation. A field-name or semantic mismatch could make the loaded numeric pool correct while its downstream explanation omits or misstates components. This is an integration contract to verify in Pass 2, not an assertion that the payload is wrong.
- **Confidence:** High that the contract cannot be confirmed from the diff alone; low that it is actually mismatched.

#### `[Pass 1]` Existing pool taps now run `goTab('roll')` before `loadPool()` at two shared call sites

- **Severity:** Low
- **File:line:** `public/js/app.js:334`, `public/js/app.js:1279` (new-file lines shown by the diff)
- **Triggering input or sequence:** Tap any pre-existing, non-custom pool tile rendered through `openChar()` or `_switchChar()`.
- **Observable consequence:** `goTab('roll')` now executes before `loadPool()` instead of afterward on those paths. The diff cannot establish whether tab switching resets, closes, or repaints state that `loadPool()` relies on, so this could alter every existing pool-tap path at those sites. This requires call-sequence verification in Pass 2.
- **Confidence:** High that execution order changed; low-to-medium that it causes a regression.

### Pass 2

- None found.

### Pass 3a

- None found.

### Pass 3b

#### `[Pass 3b]` The Dev Agent Record overstates the Vitest gate as 316/316 passed

- **Severity:** Low
- **File:line:** `specs/stories/rlv-4-port-builder-ux-into-unified-roller.md:391` (Dev Agent Record regression claim)
- **Triggering input or sequence:** Run the exact nine-file Vitest command named in the record. Because its first result disagreed with the prose, run the identical command a second time.
- **Observable consequence:** Both runs exit successfully with 9/9 files green, but each reports **298 passed, 18 skipped (316 total)**. The record's **316/316 passed** wording is false and overstates executed assertion coverage by 18 tests. This does not turn the green gate red, but it makes the audit trail materially less precise.
- **Confidence:** High; the exact result reproduced twice.

## Ship assessment

**Needs patches before shipping as-is.** The required gates are green, but the reachable cross-container `_pools` corruption can silently load the wrong character's pool or throw from the new Custom Pool tile, and AC5's promised Rote eligibility cue is not implemented. The inaccurate Vitest count should also be corrected in the Dev Agent Record.

## Validation notes

### Pass isolation and files opened

- **Pass 1:** Opened only `specs/stories/code-review/rlv-4-diff.txt`. I did not open repository source, the story, the Dev Agent Record, sibling repositories, or the pre-existing `rlv-4-codex-review.md` / `rlv-4-codex-run.log`. I created and froze the Pass 1 section before advancing.
- **Pass 2:** Opened `public/js/game/char-pools.js` and `public/js/shared/pools.js` in full; `public/js/data/accessors.js` in full; relevant ranges/search results from `public/js/app.js`, `public/js/suite/roll-v2.js`, `public/js/data/constants.js`, `public/js/editor/mci.js`, and `public/index.html`. One broad recursive `rg` searched `public/js`; its displayed output included snippets from `public/js/admin.js`, `public/js/admin/downtime-views.js`, `public/js/admin/rules-data-view.js`, `public/js/admin/city-views.js`, and several `public/js/editor/rule_engine/*-evaluator.js` files before the tool truncated the result. I used none of those unrelated snippets as story intent. I did not open the story. I froze Pass 2 before advancing.
- **Pass 3a:** Stream-read `specs/stories/rlv-4-port-builder-ux-into-unified-roller.md` only from the start through Story, CRITICAL/scope boundary, Acceptance Criteria, Tasks/Subtasks, Dev Notes, Project Structure Notes, and References, stopping when the `## Dev Agent Record` heading was reached. I then checked relevant Rote/downstream gates in `public/js/suite/roll-v2.js`. I froze Pass 3a before reading the record.
- **Pass 3b:** Stream-read the story from `## Dev Agent Record` through EOF for the first time. Re-opened `tests/rlv-4-custom-pool-builder.spec.js` and `public/js/app.js` for executable claim checks; inspected relevant `window` registrations in `app.js`; compared `public/js/suite/roll-v2.js` to base commit `40be9e18`; and executed all claimed suites. The new test really calls `window.pickChar(c)` and also sets `serviceWorkers: 'block'`, matching the claimed workaround technique. I did not re-diagnose the disclosed Service Worker leak itself, as instructed.

### Commands run and real results

#### Pass 1

- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/rlv-4-diff.txt'` — exit 0; read the supplied scoped diff only.
- `Test-Path -LiteralPath 'specs/stories/code-review/rlv-4-codex-findings.md'` — exit 0; returned `False` before the findings file was created.
- One `apply_patch` created this findings file and froze Pass 1.

#### Pass 2

- Parallel `Get-Content -Raw` calls for `public/js/game/char-pools.js`, `public/js/shared/pools.js`, and `public/js/data/accessors.js` — all exit 0.
- `rg -n -C 8 "function (openPanel|loadPool|goTab)|export function loadPool|applyDerivedMerits|_pt_dot4_bonus_skills|renderCharPools\(" public/js` — exit 0; 1,169 output lines, truncated by the tool; used only for orientation before narrower reads.
- A parallel invocation of (1) `rg -n -C 12 "function openPanel|function goTab|renderCharPools\(|applyDerivedMerits\(|preloadRules\(|window\.pickChar|window\.openPanel" public/js/app.js`, (2) `rg -n -C 20 "export function loadPool|function loadPool|effline|discName|discV|getAttrEffective" public/js/suite/roll-v2.js`, and (3) `rg -n -C 10 "applyDerivedMerits\(" public/js/app.js public/js/suite/*.js public/js/game/*.js` — wrapper exit 1 because Windows `rg` rejected the literal `*.js` path globs in command 3; the failure was not hidden.
- Re-ran the first two targeted `rg` commands from the preceding item — both exit 0.
- PowerShell `Get-Content` range read of `public/js/app.js` for lines 270-345, 445-525, 620-790, 889-1110, 1111-1160, 1190-1305, and 1540-1595 — exit 0; output was truncated, so narrower follow-up reads/searches were used where needed.
- PowerShell `Get-Content` range read of `public/js/suite/roll-v2.js` for lines 180-220 and 260-370 — exit 0.
- `rg -n -C 4 "export const (ALL_ATTRS|ALL_SKILLS|SKILLS_MENTAL)" public/js/data/constants.js` — exit 0; confirmed canonical lists.
- First attempt `rg -n -C 5 "id=\"(gcp-panel|roll-char-pools|sc-char)\"" public/index.html` — exit 1 because PowerShell parsed the pipe characters after incorrect quoting; disclosed and rerun.
- Corrected `rg -n -C 5 'id="(gcp-panel|roll-char-pools|sc-char)"' public/index.html` — exit 0; confirmed both pool containers coexist.
- PowerShell `Get-Content` range read of `public/js/editor/mci.js` lines 31-100 — exit 0; confirmed derivation Set initialization and null-cache fallback.
- `rg -n "let _pools|_pools = \[\]|onTap\(_pools|const customIdx|function pickChar|renderCharPools\(rollPoolsEl|renderCharPools\(poolsEl" public/js/game/char-pools.js public/js/app.js` — exit 0; confirmed reset/read sites and all render sites.
- One `apply_patch` appended and froze Pass 2.

#### Pass 3a

- A streaming `[System.IO.File]::OpenText(...)` PowerShell loop over `specs/stories/rlv-4-port-builder-ux-into-unified-roller.md`, breaking at `^## Dev Agent Record` — exit 0; no record content was emitted/read.
- `rg -n -C 12 "roteEligible|equipment|state\.POOL_INFO|POOL_INFO|nineAgain|spendableCost|wp-chip|rote" public/js/suite/roll-v2.js` — exit 0.
- `rg -n "roteEligible" public/js tests server/tests` — exit 0; found only the char-pools producer/tile badge and the `roll-v2.js` `pi.roteEligible` consumer.
- One `apply_patch` appended and froze Pass 3a.

#### Pass 3b and gates

- A streaming `[System.IO.File]::OpenText(...)` PowerShell loop that began emitting at `^## Dev Agent Record` and continued through EOF — exit 0.
- `npx playwright test tests/rlv-4-custom-pool-builder.spec.js --reporter=line` — exit 0; **10 passed / 10 total**, Playwright-reported duration 27.3s.
- `npx vitest run tests/bl2-boot-priming.test.js tests/bl4-bloodlines-admin-view.test.js tests/bl5-lineage-lock-client.test.js tests/crd-2-pending-queue.test.js tests/gdx-7-apply-costs-on-roll.test.js tests/issue-871-876-ecm-4-9-bundle.test.js tests/issue-879-defence-penalty-wirein.test.js tests/oaq-3-approval-queue.test.js tests/otc-3-office-nav-unconditional.test.js` from `server/` — first run exit 0: **9/9 files, 298 passed, 18 skipped (316 total)**, 33.25s. Because this contradicted the record, the identical command was run again — exit 0: **9/9 files, 298 passed, 18 skipped (316 total)**, 22.79s.
- `npx playwright test tests/rlv-2-single-roller-retirement.spec.js tests/issue-1024-roll-v2-anchor-and-again-seg.spec.js --reporter=line` — exit 0; **13 passed / 13 total**, 7.1s.
- PowerShell executable source/base check (read the new test and `app.js`, regex-counted the exact guard, checked `window.pickChar(c)`, `serviceWorkers: 'block'`, and ran `git diff --name-only 40be9e18`) — exit 0; `guard_count=3`, `injects_window_pickChar=True`, `sets_serviceWorkers_block=True`, `roll_v2_changed_vs_base=False`. Tracked files changed versus base were the four production source/CSS files plus the intentionally excluded `specs/stories/sprint-status.yaml`; untracked story/test/review files do not appear in `git diff --name-only`.
- `git status --short` — exit 0; showed the completed story's four modified source/CSS files and tracking/story/test/review artifacts, including this findings file; also printed a non-fatal permission warning for `C:\Users\angel\.config\git\ignore`.
- `rg -n "window\.(openChar|pickChar|_switchChar|renderCharPools|goTab)" public/js/app.js` — exit 0; found the direct `window.goTab` assignment (the broader registration was then located separately).
- PowerShell `Get-Content` range reads of `public/js/app.js` lines 2525-2585, 1318-1345, 1345-1395, and 1395-1445, plus `rg -n "pickChar\s*=|Object\.assign\(window|window\[.*pickChar" public/js/app.js public/js` — all exit 0; confirmed `openChar`, `openPanel`, and `pickChar` are exposed in the merged `Object.assign(window, ...)` registration.
- Temporarily added `tests/.tmp-rlv4-review.spec.js` with `apply_patch`, ran `npx playwright test tests/.tmp-rlv4-review.spec.js --reporter=line` — exit 0; **1 passed / 1 total**, 3.3s. The live browser repro confirmed a retained Custom tile at index `1` delivered `undefined` after another container rebuilt `_pools` with Custom at index `0`.
- Deleted `tests/.tmp-rlv4-review.spec.js` with `apply_patch`, then ran `git status --short` — exit 0; the temporary file was absent. The same non-fatal global-ignore permission warning appeared.
- Final parallel verification ran `Get-Content -Raw -LiteralPath 'specs/stories/code-review/rlv-4-codex-findings.md'`, `rg -n "316/316 passed|New Playwright spec|No High/Medium" specs/stories/rlv-4-port-builder-ux-into-unified-roller.md`, and `git status --short` — all exit 0. It confirmed the record claim is at line 391, the findings file is readable, and the temporary spec remains absent; `git status` again emitted only the disclosed non-fatal global-ignore warning.

### Could not run / intentionally not run

- **Could not run:** None of the three required gate commands; all ran successfully. No requested verification was blocked.
- I did not run the full repository test suite because the story and review instructions call for the targeted gates. I did not independently reproduce the disclosed Service Worker leak because the review explicitly says that is unnecessary; I verified the test's workaround technique instead.

### Modification/restoration attestation

- I did not modify production source, tests, story/tracking content, commits, remotes, or sibling repositories. The only persistent edit I made is this requested findings file.
- I temporarily created `tests/.tmp-rlv4-review.spec.js` solely for the browser repro, then deleted it with `apply_patch`. The final `git status --short` confirmed it was fully removed. The worktree is not globally clean because it already contains the completed story changes and other untracked review artifacts; no unintended file from my review remains.
