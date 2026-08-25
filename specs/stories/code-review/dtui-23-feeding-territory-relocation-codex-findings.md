# Adversarial review: dtui-23-feeding-territory-relocation

## High

### [Pass 1] Choosing Method of Feeding can erase a just-selected Blood Type

- **Severity**: High
- **File:line**: `public/js/tabs/downtime-form.js:2772` and `public/js/tabs/downtime-form.js:7210`
- **Triggering input or sequence**: In the rendered Feeding section, select any `dt-feed_blood_type` radio and, before the 800 ms draft debounce collects the form, select either `dt-feed_violence` radio.
- **Observable consequence**: The Blood Type branch only calls `scheduleSave()` and does not copy the selection into `responseDoc`. The Method of Feeding branch immediately calls `renderForm(container)` before its own `scheduleSave()`. That render reconstructs Blood Type from the still-stale `responseDoc.responses._feed_blood_types`, so the player's new Blood Type visibly resets and the later debounced collection persists the old/empty value. This is silent loss of a valid player selection during ordinary interaction between two newly grouped controls.
- **Confidence**: High. The sequencing and state sources are explicit in the diff; Pass 2 will trace the surrounding save/render machinery without revising this frozen finding.

## Medium

### [Pass 1] AC2 test does not establish that the relocated group is after the pool

- **Severity**: Medium
- **File:line**: `tests/dtui-23-feeding-territory-relocation.spec.js:151`
- **Triggering input or sequence**: Move the Territory/Blood Type/Method group anywhere after the opening `dt-feed-methods` token but before the pool, then run the new AC2 test.
- **Observable consequence**: The test still passes because it records `methodsIdx` and compares Territory only with that index; it never locates or compares the pool. Its title and comment claim to guard “after the FEED_METHODS cards and pool,” but the pool half of that ordering is untested, allowing the central relocation requirement to regress undetected.
- **Confidence**: High.

### [Pass 2] Lowercase historical Blood Type values render unselected and are erased on the next collection

- **Severity**: Medium
- **File:line**: `public/js/tabs/downtime-form.js:519` and `public/js/tabs/downtime-form.js:7237`
- **Triggering input or sequence**: Load a submission containing a repository-observed legacy value such as `_feed_blood_types: '["human"]'` (the same lowercase shape appears in `tests/feat-735-feed-card-terr-pill-and-override-chips.spec.js:67` and several other fixtures), then cause any save/collection without first selecting a capitalised Blood Type radio.
- **Observable consequence**: Rendering compares the lowercase saved item exactly with capitalised `Animal`/`Human`/`Kindred`, so no radio is checked. `collectResponses()` then writes `[]`, silently deleting the historical choice. Base commit `361716b6` used the same exact comparison, so this is a compatibility defect that the migration preserves rather than newly introduces; the rewritten boundary was nevertheless an opportunity to normalise legacy values and the new test covers only capitalised output.
- **Confidence**: High. Multiple repository fixtures demonstrate lowercase stored data, and both render and collect paths are exact-case reads.

### [Pass 3a] Native Blood Type radios remove the previous ability to clear a selection

- **Severity**: Medium
- **File:line**: `public/js/tabs/downtime-form.js:2789` and `public/js/tabs/downtime-form.js:7242`
- **Triggering input or sequence**: Select a Blood Type, then click that same selected Blood Type again because the player wants to return the optional field to no selection.
- **Observable consequence**: The prior `[data-blood-type]` handler removed the active class from every button and only restored it when the clicked button had not already been active, so clicking the active value deliberately produced zero selections and saved `[]`. Native radios cannot toggle themselves off; after this migration there is no UI path to clear a selected Blood Type. That is a concrete deviation from the prior zero-or-one behavior despite the story's “matching current behaviour exactly” framing and AC4's continued `[] if none selected` output contract.
- **Confidence**: High about the behavior change; Medium that product intent requires preserving user-driven clearing rather than only supporting the never-selected state.

### [Pass 3b] The record's claim that no server suite references the persisted field shapes is false

- **Severity**: Medium
- **File:line**: `specs/stories/dtui-23-feeding-territory-relocation.story.md:353`
- **Triggering input or sequence**: Search `server/tests` for `_feed_blood_types`, `feed_violence`, or `feeding_territories`, or run `server/tests/issue-939-personal-story-optional.test.js`.
- **Observable consequence**: Contrary to “No server-side (vitest) suite references ... field shapes,” multiple server tests use `feeding_territories`, and `issue-939-personal-story-optional.test.js:16-19` contains all three exact fields, including array-shaped `_feed_blood_types` and string `feed_violence`. That targeted server file runs 7/7, so this is not a current product failure, but it makes the record's test-impact inventory and rationale for client-only validation factually wrong.
- **Confidence**: High.

## Low

### [Pass 1] AC1 test's “influence grid” claim is satisfied by any visible section body

- **Severity**: Low
- **File:line**: `tests/dtui-23-feeding-territory-relocation.spec.js:140`
- **Triggering input or sequence**: Remove or break the influence-grid markup while leaving the Territory section body visible and free of the three excluded feeding-territory selectors.
- **Observable consequence**: The test named “carries only the influence grid” still passes: it asserts only absence of feeding-territory selectors and visibility of the generic `.qf-section-body`, not presence or correctness of an influence grid. The regression guard proves “no feeding picker here,” but overstates the positive behavior it protects.
- **Confidence**: High.

### [Pass 1] AC5 test documentation promises hint coverage that the suite explicitly does not perform

- **Severity**: Low
- **File:line**: `tests/dtui-23-feeding-territory-relocation.spec.js:9`
- **Triggering input or sequence**: Read the suite contract or rely on its advertised AC5 coverage; alternatively, regress the loaded-default “Pre-selected based on your method” hint.
- **Observable consequence**: The file header says AC5 “shows the matching hint text,” while AC5b asserts that the hint is absent and calls it unreachable. The only hint actually asserted is the different “does not pre-select” message. This can mislead future reviewers about what behavior is covered.
- **Confidence**: High.

### [Pass 2] The new fixture does not exercise real territory or attendance response shapes

- **Severity**: Low
- **File:line**: `tests/dtui-23-feeding-territory-relocation.spec.js:79` and `tests/dtui-23-feeding-territory-relocation.spec.js:116`
- **Triggering input or sequence**: Regress territory rendering in a way that only appears with live territory documents (feeding-rights membership, Regent/Lieutenant ownership, or live ambience), then run AC3.
- **Observable consequence**: The catch-all mock returns `[]` for `/api/territories` and `/api/attendance`, while the real attendance API returns `{ attended, attendees, session_id }` and territory rendering consumes document fields such as `regent_id`, `lieutenant_id`, `feeding_rights`, and ambience. The test also explicitly passes `[]` into `renderDowntimeTab`. Static fallback data is enough for `.dt-terr-pill` to exist, so AC3 can pass without proving that the retained renderer still carries the live semantics cited as the reason for retaining it. The character, chapter, names-array, and downtime-submission shapes used by the assertions are otherwise compatible with the reads in `renderDowntimeTab()`.
- **Confidence**: High about the fixture mismatch; Medium that a future defect would be isolated to live-data semantics rather than structure.

### [Pass 3a] AC6's literal zero-reference grep condition is not met

- **Severity**: Low
- **File:line**: `public/css/components.css:3902` and `public/js/tabs/downtime-form.js:2777`
- **Triggering input or sequence**: Run `rg -n "dt-feed-vi-btn|dt-feed-violence-toggle|data-blood-type|data-feed-violence" public` as AC6 directs.
- **Observable consequence**: Grep reports four references: two `.dt-feed-vi-btn` comment mentions and one historical comment mention for each removed data attribute. There are no surviving selectors or handlers, so runtime dead code is removed, but the acceptance criterion literally says “confirmed via grep that zero references remain anywhere in public/” and that check fails.
- **Confidence**: High.

### [Pass 3b] The Dev Agent Record reports zero grep matches while acknowledging four matches

- **Severity**: Low
- **File:line**: `specs/stories/dtui-23-feeding-territory-relocation.story.md:310` and `specs/stories/dtui-23-feeding-territory-relocation.story.md:358`
- **Triggering input or sequence**: Re-run the record's grep against `public/js/tabs/downtime-form.js` and `public/css/components.css`.
- **Observable consequence**: The command returns four comment hits, not zero. Lines 358–361 are internally contradictory: they say “zero matches” and immediately say comments are the remaining hits. The defensible claim is “zero active selectors/handlers; four historical comment matches.”
- **Confidence**: High.

### [Pass 3b] The broader-regression module description is overstated

- **Severity**: Low
- **File:line**: `specs/stories/dtui-23-feeding-territory-relocation.story.md:345`
- **Triggering input or sequence**: Inspect imports in both named specs after reproducing the batch.
- **Observable consequence**: The record says both specs mount “a completely different module, `feeding-tab.js`.” Both do import that module, but each also contains `downtime-form.js` coverage (`fix-473` at line 243 and `fix-475` at line 141). The current run did reproduce exactly 10 failures and all ten failing cases are on the feeding-tab path, so the unrelated-failure conclusion is well supported; only the blanket description of the entire specs is inaccurate.
- **Confidence**: High.

### [Pass 3b] Historical stash/A-B verification is not independently reproducible as stated

- **Severity**: Low
- **File:line**: `specs/stories/dtui-23-feeding-territory-relocation.story.md:316` and `specs/stories/dtui-23-feeding-territory-relocation.story.md:349`
- **Triggering input or sequence**: Attempt to reproduce the claimed discarded DOM-`:checked` implementation and the author's `git stash` comparison using only the delivered tree and base commit.
- **Observable consequence**: The discarded intermediate implementation and stash are not artifacts in the reviewed tree, so the exact historical A/B cannot be rerun without manufacturing a variant or mutating a worktree, which this review did not do. Current evidence supports the substance—fix-48 is 4/4 with the shipped merge, source ordering explains why the DOM variant would be stale, the broader current batch has exactly the claimed 10 fix-473/fix-475 failures, and `feeding-tab.js` has no diff from base—but “verified via git stash A/B” remains unverifiable as a provenance claim by this reviewer.
- **Confidence**: High about the verification limit; High that the shipped fix itself is correct for fix-48 AC-3.

### Pass 2 required trace record (non-finding evidence)

- **Fresh character (`responseDoc === null`, no method)**: initial render computes `selectedBlood = ''`, `persistedViolence = ''`, and `preselect = ''`, so neither radiogroup has an unintended checked option and no exception is thrown. `collectResponses()` emits `_feed_method: ''`, omits `feed_violence`, and emits `_feed_blood_types: '[]'`.
- **Saved `_feed_method`, absent `feed_violence`**: for a default-bearing method such as `seduction`, hydration at lines 1618–1619 first writes `kiss`; render treats it as persisted, and collection emits `_feed_method: 'seduction'`, `feed_violence: 'kiss'`, plus the checked Blood Type as a zero/one-item JSON array. For a null-default method such as `stalking`, hydration and collection both leave `feed_violence` absent. Thus the answer necessarily depends on which saved method is meant; there is no single method-independent value.
- **Saved method plus contradictory explicit violence**: e.g. `_feed_method: 'seduction'` with `feed_violence: 'violent'` remains exactly `seduction`/`violent`; hydration does not run because the explicit value is truthy, render checks Assault, and collection preserves the explicit value. No explicit prior save is replaced by a method default.
- **Hydration interaction**: load-time hydration and collection use the same `FEED_VIOLENCE_DEFAULTS` map and the same explicit-first precedence. They do not disagree or apply different values. Their double presence does make the default look persisted before the first actual save and makes the “Pre-selected based on your method” branch unreachable for hydrated default-bearing methods.
- **Method-card click ordering**: the handler sets the new `feedMethodId`, then collects from the old DOM. Violence is deliberately derived from JS state, so an absent explicit value receives the new method's default for all five built-in methods; an existing explicit value remains authoritative. Blood Type is safely captured from the old DOM before the subsequent render.
- **Rapid Blood → Method of Feeding → Blood sequence under 800 ms**: the middle action discards the first Blood selection, but the final Blood action establishes a checked radio and resets both debounce timers; the eventual snapshot therefore contains the final Blood value and current violence value. The stale-state defect occurs when the sequence ends at Method of Feeding (the Pass 1 finding), not when a final Blood click repairs it.
- **Mode toggle**: the mode click calls `collectResponses()` before changing `responseDoc` and rendering, so Blood Type, Method of Feeding, and Territory are retained. Module-level feeding state is not reset. Territory collection also precedes the render and its relocated markup is derived from response data, so its later string-emission position does not affect MINIMAL pool calculation.
- **Earlier delegated branches**: none of the branches before the two new radio selectors match their names, IDs, classes, or wrappers, so the new events are not intercepted.

## Ship assessment

**Needs patches before shipping as-is.** There is no architectural blocker, and all three named gates pass, but the grouped controls still permit silent Blood Type loss in a normal Blood → Method-of-Feeding sequence. The new test suite does not cover that sequence, the prior ability to clear Blood Type is gone, and legacy lowercase choices can be erased. At minimum, Blood Type should be copied into canonical state before any sibling-triggered re-render (or the violence branch should collect before rendering), with interaction tests for cross-control retention and clearing/legacy policy. AC2/AC1 assertions and the inaccurate record claims should also be corrected.

## Validation notes

### Pass boundaries and files opened

- **Pass 1**: Opened only `specs/stories/code-review/dtui-23-feeding-territory-relocation-diff.txt`; the only search was within that diff. I did not inspect repository source, tests, the story, tracking files, or sibling repositories before freezing Pass 1.
- **Pass 2**: After Pass 1 was written, directly opened/searched `public/js/tabs/downtime-form.js`, `public/js/tabs/downtime-data.js`, `public/js/tabs/draft-persist.js`, `public/js/tabs/feeding-tab.js`, `public/js/admin/downtime-views.js`, `public/css/components.css`, `tests/dtui-23-feeding-territory-relocation.spec.js`, `server/routes/attendance.js`, `server/routes/characters.js`, `playwright.config.js`, `package.json`, and the base-commit version of `public/js/tabs/downtime-form.js`. Repository-wide `rg` scans also read matching material under `tests/`, `server/`, and `public/`. No story-spec content was opened before Pass 2 was frozen.
- **Pass 3a**: Opened only story lines 1–174 (front matter, Story, Context, Files in scope, Out of scope, Acceptance Criteria) plus already-permitted source/tests. I did not open story lines 175–362 before freezing 3a.
- **Pass 3b**: Opened story lines 292–362 (Dev Agent Record) after 3a was frozen. I did **not** open the Senior Developer Review beginning at line 363, nor the Implementation Notes/Definition of Done/Compliance/Dependencies block at lines 175–291. Additional direct reads/searches covered the three gate specs, `tests/fix-473-feeding-custom-pool-blank.spec.js`, `tests/fix-475-feeding-vitae-pipeline.spec.js`, matching `server/tests` files, `server/package.json`, and `server/vitest.config.js`.
- I never read from or wrote to `TM Story`, `TM Herald`, `TM Admin`, or `TM Design System`.

### Commands and real results

- **Pass 1**: `Get-Content -Raw ...dtui-23-...-diff.txt` succeeded; `rg -n "dt-feed-vi-btn|...|pool" ...diff.txt` succeeded. Pass 1 was then written with `apply_patch`.
- **Pass 2 discovery/trace**: `rg --files -g 'AGENTS.md' ...` returned exit 1/no matches. The targeted `rg -n -C` and numbered `Get-Content` commands over `downtime-form.js`, `downtime-data.js`, the new spec, `components.css`, `draft-persist.js`, consumers, routes, and section definitions succeeded (two large outputs were tool-truncated but followed by smaller targeted reads). One broad `rg` command over `server public/js tests` exited 1 because `-g` was placed after `--`; its output was also truncated, so it was not relied upon. Subsequent targeted searches succeeded. `git show 361716b6:public/js/tabs/downtime-form.js | Select-String ...` confirmed the Blood re-render race and exact-case comparison existed in base. `curl.exe -s http://localhost:8080/ | Select-String '<title>'` returned `<title>TM Admin</title>`.
- **Pass 3a**: `rg -n '^#{1,3} '` located story boundaries; numbered `Get-Content` read lines 1–174 only. `rg -n "dt-feed-vi-btn|dt-feed-violence-toggle|data-blood-type|data-feed-violence" public` returned four comment matches.
- **Initial alternate-server attempts**: `npx playwright test tests/dtui-23-feeding-territory-relocation.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` first failed before tests because `npx http-server` attempted blocked npm network access (`EACCES`, web-server timeout). With installed `serve`, the next two attempts each executed 7/7 passing tests but the overall commands timed out (exit 124) while Playwright tried to clean up the Windows server process. These are recorded as failed command attempts, not clean gates.
- **Clean server setup**: a hidden, PID-tracked local `serve` process was started on 8099; `curl` returned `<title>Terra Mortis</title>`. A combined curl/listener check exited 1 only because `Get-NetTCPConnection` was denied after the successful title check. The server was later identified by `netstat` as PID 26324, stopped with `Stop-Process -Id 26324 -Force`, and verified stopped with port 8099 free.
- **Required gate 1**: `npx playwright test tests/dtui-23-feeding-territory-relocation.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` — **7 passed, 0 failed**, exit 0, 14.9 s reported test duration.
- **Required gate 2**: `npx playwright test tests/dt-form-35-feed-violence-default.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` — **6 passed, 0 failed**, exit 0, 6.7 s.
- **Required gate 3**: `npx playwright test tests/fix-48-feed-card-violence-sync.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` — **4 passed, 0 failed**, exit 0, 26.7 s.
- **Broader record batch**: `npx playwright test tests/cm-3-dt-form-finale-gate.spec.js tests/dt-form-599-flock-herd.spec.js tests/dt-form-609-ssj-herd.spec.js tests/fix-45-feeding-validation-false-block.spec.js tests/fix-46-game-recount-non-attendee.spec.js tests/fix-473-feeding-custom-pool-blank.spec.js tests/fix-475-feeding-vitae-pipeline.spec.js tests/fix-479-dt-influence-budget-cap.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` — **30 passed, 10 failed**, exit 1; all 10 failures were the four fix-473 feeding-tab cases and six fix-475 feeding-tab cases claimed in the record. Fix-48 had already passed separately 4/4.
- `rg` over the fix-473/fix-475 imports plus `git diff --name-only 361716b6 -- public/js/tabs/feeding-tab.js` showed both specs also contain downtime-form coverage and no base-to-current diff for `feeding-tab.js` (git emitted only a user-config permission warning).
- `rg -n "_feed_blood_types|feed_violence|feeding_territories|..." server/tests` returned many field-shape references. `npx vitest run tests/issue-939-personal-story-optional.test.js` from `server/` then passed **1 file / 7 tests**.
- Cleanup/status commands: local binary checks found `serve` installed and `http-server` absent; the throwaway config was deleted with `apply_patch`; generated Playwright `test-results` files were enumerated and deleted, then their verified-empty directories were removed non-recursively. The first attempted recursive cleanup command was blocked by sandbox policy and changed nothing.

### Exact shell-command ledger (chronological)

`apply_patch` writes are not shell commands; they created/appended this findings file, created and revised the throwaway config, then deleted that config and the generated text artifacts. The shell commands were:

1. `Get-Content -Raw -LiteralPath 'specs/stories/code-review/dtui-23-feeding-territory-relocation-diff.txt'` — exit 0; diff read.
2. `rg -n "dt-feed-vi-btn|dt-feed-violence-toggle|data-blood-type|data-feed-violence|dt-feed_blood_type|dt-feed_violence|collectResponses|Territory|pool" -- 'specs/stories/code-review/dtui-23-feeding-territory-relocation-diff.txt'` — exit 0; only removed lines and historical comment hits for retired names.
3. `rg --files -g 'AGENTS.md' -g '!specs/stories/dtui-23-feeding-territory-relocation.story.md'` — exit 1; no `AGENTS.md` found.
4. `rg -n -C 25 "function collectResponses|responseDoc\.responses\.feed_violence|feedMethodId = feedCard\.dataset\.feedMethod|addEventListener\('change'|function scheduleSave|const scheduleSave|function renderDowntimeTab|FEED_VIOLENCE_DEFAULTS|data-dt-mode|renderFeedingTerritoryPills\(roteTerrGridVals" -- 'public/js/tabs/downtime-form.js'` — exit 0; output succeeded but was tool-truncated.
5. `$p='public/js/tabs/downtime-form.js'; $lines=Get-Content -LiteralPath $p; foreach($range in @(@(281,305),@(422,555),@(1396,1640),@(2035,2135),@(2338,2390),@(2723,2798),@(2936,2970),@(7080,7270))){ $a=$range[0]; $b=$range[1]; for($i=$a;$i -le $b;$i++){ '{0,5}: {1}' -f $i,$lines[$i-1] } }` — exit 0; output succeeded but was tool-truncated.
6. `rg -n -C 8 "export const FEED_VIOLENCE_DEFAULTS|FEED_VIOLENCE_DEFAULTS" -- 'public/js/tabs/downtime-data.js'; rg -n -C 8 "MINIMAL_SECTIONS|function _formMode|async function saveDraft" -- 'public/js/tabs/downtime-form.js'` — exit 0.
7. `$p='public/js/tabs/downtime-form.js'; $l=Get-Content -LiteralPath $p; foreach($range in @(@(1177,1245),@(1569,1625),@(2328,2385),@(2786,2968))){ for($i=$range[0];$i -le $range[1];$i++){ '{0,5}: {1}' -f $i,$l[$i-1] } }` — exit 0.
8. `Get-Content -Raw -LiteralPath 'tests/dtui-23-feeding-territory-relocation.spec.js'; rg -n -C 12 "\.dt-ticker|dt-ticker__pill" -- 'public/css/components.css'` — exit 0.
9. `rg -n "characters/names|api/attendance|router\.get\(.*/attendance|app\.get\(.*/attendance|downtime_submissions\?chapter_id|/api/chapters" -- 'server' 'public/js' 'tests' -g '!tests/dtui-23-feeding-territory-relocation.spec.js'` — exit 1 because `-g` followed `--`; output was truncated and not relied upon.
10. `rg -n -C 5 "_feed_blood_types|feed_violence|feeding_territories" -- 'public/js/tabs/feeding-tab.js' 'public/js/admin/downtime-views.js'; rg -n "_feed_blood_types" -- 'tests' 'server/tests'` — exit 0.
11. `rg -n -C 45 "function renderFeedingTerritoryPills" -- 'public/js/tabs/downtime-form.js'; $p='server/routes/attendance.js'; $l=Get-Content -LiteralPath $p; for($i=1;$i -le 98;$i++){ '{0,4}: {1}' -f $i,$l[$i-1] }; $p='server/routes/characters.js'; $l=Get-Content -LiteralPath $p; for($i=410;$i -le 450;$i++){ '{0,4}: {1}' -f $i,$l[$i-1] }` — exit 0.
12. `rg -n -C 15 "type: 'feeding_method'|type: 'territory_grid'|key: 'feeding'|key: 'territory'" -- 'public/js/tabs/downtime-data.js'; $p='public/js/tabs/downtime-form.js'; $l=Get-Content -LiteralPath $p; for($i=6150;$i -le 6225;$i++){ '{0,5}: {1}' -f $i,$l[$i-1] }` — exit 0.
13. `Get-Content -Raw -LiteralPath 'public/js/tabs/draft-persist.js'; rg -n "tm-dt-draft|saveDraft|loadDraft|pickFreshestDraft" -- 'public/js/tabs/draft-persist.js' 'tests/dtui-23-feeding-territory-relocation.spec.js'` — exit 0.
14. `git show 361716b6:public/js/tabs/downtime-form.js | Select-String -Pattern "Blood type toggle|data-blood-type|data-feed-violence|function collectResponses" -Context 4,10` — exit 0.
15. `curl.exe -s http://localhost:8080/ | Select-Object -First 5; Get-Content -Raw -LiteralPath 'playwright.config.js'; Get-Content -Raw -LiteralPath 'package.json'` — exit 0.
16. `curl.exe -s http://localhost:8080/ | Select-String -Pattern '<title>.*</title>' | Select-Object -First 1` — exit 0; title was `TM Admin`.
17. `rg -n "page\.route\('\*\*/api/\*\*'|renderDowntimeTab\(sandbox, c, \[\]\)|const selectedBlood|selectedBlood === bt|checkedBlood" -- 'tests/dtui-23-feeding-territory-relocation.spec.js' 'public/js/tabs/downtime-form.js'` — exit 0.
18. `rg -n "^#{1,3} " -- 'specs/stories/dtui-23-feeding-territory-relocation.story.md'` — exit 0; used only to locate permitted Pass 3a boundaries.
19. `$p='specs/stories/dtui-23-feeding-territory-relocation.story.md'; $l=Get-Content -LiteralPath $p; for($i=1;$i -le 174;$i++){ '{0,4}: {1}' -f $i,$l[$i-1] }` — exit 0.
20. `rg -n "dt-feed-vi-btn|dt-feed-violence-toggle|data-blood-type|data-feed-violence" -- 'public'` — exit 0; four comment hits.
21. `$p='specs/stories/dtui-23-feeding-territory-relocation.story.md'; $l=Get-Content -LiteralPath $p; for($i=292;$i -le 362;$i++){ '{0,4}: {1}' -f $i,$l[$i-1] }` — exit 0; Dev Agent Record only.
22. `npx playwright test tests/dtui-23-feeding-territory-relocation.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` with `http-server` config — exit 1 before discovery; 60 s web-server timeout and npm-network `EACCES`.
23. `Get-ChildItem -LiteralPath 'node_modules/.bin' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name; Test-Path -LiteralPath 'node_modules/http-server'; Test-Path -LiteralPath 'node_modules/serve'` — exit 0; `http-server=False`, `serve=True`.
24. The same Playwright command with `npx --no-install serve` webServer — exit 124 at 181.9 s; 7 tests had passed before cleanup hung.
25. `Get-ChildItem -LiteralPath 'node_modules/serve/build' | Select-Object Name,Length` — exit 0; found `main.js`.
26. The same Playwright command with direct `node node_modules/serve/build/main.js` webServer — exit 124 at 122.1 s; again 7 tests had passed before cleanup hung.
27. `$conn=Get-NetTCPConnection -LocalPort 8099 -State Listen -ErrorAction SilentlyContinue; if($conn){ 'PORT_IN_USE'; $conn | Select-Object OwningProcess } else { $p=Start-Process -FilePath 'node' -ArgumentList @('node_modules/serve/build/main.js','-s','public','-l','8099','--no-clipboard') -WorkingDirectory 'D:\Terra Mortis\TM Game' -WindowStyle Hidden -PassThru; "STARTED_PID=$($p.Id)" }` — exit 0; started PID 26324.
28. `curl.exe -s http://localhost:8099/ | Select-String -Pattern '<title>.*</title>' | Select-Object -First 1; Get-NetTCPConnection -LocalPort 8099 -State Listen | Select-Object LocalAddress,LocalPort,OwningProcess` — exit 1 because listener inspection was access-denied; curl succeeded with title `Terra Mortis`.
29. `npx playwright test tests/dtui-23-feeding-territory-relocation.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` — exit 0; 7 passed.
30. `npx playwright test tests/dt-form-35-feed-violence-default.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` — exit 0; 6 passed.
31. `npx playwright test tests/fix-48-feed-card-violence-sync.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` — exit 0; 4 passed.
32. `npx playwright test tests/cm-3-dt-form-finale-gate.spec.js tests/dt-form-599-flock-herd.spec.js tests/dt-form-609-ssj-herd.spec.js tests/fix-45-feeding-validation-false-block.spec.js tests/fix-46-game-recount-non-attendee.spec.js tests/fix-473-feeding-custom-pool-blank.spec.js tests/fix-475-feeding-vitae-pipeline.spec.js tests/fix-479-dt-influence-budget-cap.spec.js --workers=1 --config=.dtui23-review-playwright.config.js` — exit 1; 30 passed, 10 failed.
33. `rg -n "import\('/js/tabs/|from '/js/tabs/|feeding-tab\.js|downtime-form\.js" -- 'tests/fix-473-feeding-custom-pool-blank.spec.js' 'tests/fix-475-feeding-vitae-pipeline.spec.js'; git diff --name-only 361716b6 -- 'public/js/tabs/feeding-tab.js'` — exit 0; both module imports found, no feeding-tab diff; git printed a global-ignore permission warning.
34. `rg -n "_feed_blood_types|feed_violence|feeding_territories|dt-feed_blood_type|dt-feed_violence|dt-feed-vi-btn|data-blood-type|data-feed-violence" -- 'server/tests'` — exit 0; many persisted-field matches.
35. `Get-Content -Raw -LiteralPath 'server/package.json'; rg -n "vitest|test" -- 'server/package.json' 'server/vitest.config.js' 'server/vitest.config.mjs' 2>$null` — exit 1 because one listed config path was absent; package content and existing config matches were returned.
36. `rg -n "feedMethodId\s*=" -- 'public/js/tabs/downtime-form.js'` — exit 0; four assignments/matches, confirming exhaustive hint-flow trace.
37. `$p=Get-CimInstance Win32_Process -Filter 'ProcessId = 26324' -ErrorAction SilentlyContinue; if($p){ $p | Select-Object ProcessId,Name,CommandLine; Stop-Process -Id 26324; 'STOPPED_PID=26324' } else { 'PID_26324_NOT_RUNNING' }; Start-Sleep -Milliseconds 500; if(Get-Process -Id 26324 -ErrorAction SilentlyContinue){ 'PID_STILL_RUNNING' } else { 'PID_CONFIRMED_STOPPED' }` — exit 0; CIM lookup missed it but `Get-Process` showed it still running.
38. `netstat -ano | Select-String ':8099'; Get-Process -Id 26324 -ErrorAction SilentlyContinue | Select-Object Id,ProcessName,StartTime` — exit 0; PID 26324 confirmed listening.
39. `Stop-Process -Id 26324 -Force; Start-Sleep -Milliseconds 500; if(Get-Process -Id 26324 -ErrorAction SilentlyContinue){ 'PID_STILL_RUNNING' } else { 'PID_CONFIRMED_STOPPED' }; if(netstat -ano | Select-String ':8099\s+.*LISTENING'){ 'PORT_STILL_LISTENING' } else { 'PORT_8099_FREE' }` — exit 0; PID stopped and port free.
40. `git status --short; if(Test-Path -LiteralPath 'test-results'){ Get-ChildItem -LiteralPath 'test-results' -Force | Select-Object Name,LastWriteTime }` — exit 0; showed the pre-existing change set, this findings file, temporary config, and current test artifacts.
41. `$target=(Resolve-Path -LiteralPath 'test-results').Path; $root=(Resolve-Path -LiteralPath '.').Path; if($target -ne (Join-Path $root 'test-results')){ throw "Unexpected target: $target" }; Remove-Item -LiteralPath $target -Recurse -Force; if(Test-Path -LiteralPath $target){ 'TEST_RESULTS_STILL_EXISTS' } else { "REMOVED=$target" }` — blocked by sandbox policy before execution; no change.
42. `rg --files -- 'test-results'` — exit 0; enumerated ten generated `error-context.md` files (the hidden `.last-run.json` had already been listed by command 40).
43. `$expected='D:\Terra Mortis\TM Game\test-results'; if((Resolve-Path -LiteralPath 'test-results').Path -ne $expected){ throw 'Unexpected test-results path' }; $dirs=Get-ChildItem -LiteralPath $expected -Directory; foreach($d in $dirs){ if($d.Parent.FullName -ne $expected){ throw "Unexpected child path: $($d.FullName)" }; if(Get-ChildItem -LiteralPath $d.FullName -Force){ throw "Directory not empty: $($d.FullName)" }; Remove-Item -LiteralPath $d.FullName }; if(Get-ChildItem -LiteralPath $expected -Force){ throw 'test-results still has content' }; Remove-Item -LiteralPath $expected; if(Test-Path -LiteralPath $expected){ 'TEST_RESULTS_STILL_EXISTS' } else { 'TEST_RESULTS_REMOVED' }` — exit 0; verified-empty generated directories removed.
44. `npx vitest run tests/issue-939-personal-story-optional.test.js` from `server/` — exit 0; 1 file and 7 tests passed.
45. `rg -n "^## |^### \[Pass|^\*\*Needs patches|Required gate" -- 'specs/stories/code-review/dtui-23-feeding-territory-relocation-codex-findings.md'; Test-Path -LiteralPath '.dtui23-review-playwright.config.js'; Test-Path -LiteralPath 'test-results'; if(netstat -ano | Select-String ':8099\s+.*LISTENING'){ 'PORT_8099_LISTENING' } else { 'PORT_8099_FREE' }; git status --short` — exit 0; findings headings present, both temporary paths false, port free, only the recorded pre-existing changes plus this findings file present.

### Validation gaps and workspace integrity

- I could not independently rerun the author's discarded DOM-`:checked` implementation or historical `git stash` A/B because neither artifact exists in the delivered tree, and I did not mutate source to recreate it. Current runtime and static evidence support the fix's substance, as described above.
- I did not run the entire server Vitest suite; I ran the directly relevant server file (7/7) after repository grep disproved the no-reference claim.
- The only lasting file created/modified by this review is this requested findings file. The throwaway Playwright config and generated `test-results` artifacts were removed (`Test-Path` returned `False` for both), the PID-tracked server was stopped, and port 8099 was verified free.
- Final `git status --short` showed the pre-existing story change set (`public/css/components.css`, `public/js/tabs/downtime-form.js`, `specs/stories/sprint-status.yaml`, `tests/dt-form-35-feed-violence-default.spec.js`, the untracked story/diff/new test) plus this findings file and the pre-existing untracked `dtui-23-...-codex-review.md` / `dtui-23-...-codex-run.log`. No temporary config or test artifact remained. I did not alter or restore the author's pre-existing changes.
