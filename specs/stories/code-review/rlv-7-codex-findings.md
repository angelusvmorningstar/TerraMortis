# Adversarial review — rlv.7

Pass 1 was frozen before any repository source or story-spec file was opened. Later-pass findings are additive and do not revise these cold findings.

## High

- None found in Pass 1.

### [Pass 2] Character changes leave the previous character’s pool key, chips, and MOD live

- **Severity:** High
- **File:line:** `public/js/app.js:1115`, `public/js/app.js:1134`; `public/js/suite/sheet.js:170`; `public/js/suite/data.js:96`; `public/js/suite/roll-v2.js:502`, `public/js/suite/roll-v2.js:524`, `public/js/suite/roll-v2.js:536`
- **Triggering input or sequence:** Character A loads Occult and has an on `+2` chip. The player then selects character B via `pickChar` (or changes the sheet character via `onSheetChar`) without loading a B pool. These paths replace `rollChar`; `pickChar` clears only `POOL_INFO`, while neither path clears `POOL_NAME`, `powerChips`, or `MOD`, nor repaints the add row. The old badge remains clickable and passes the `find` guard because A’s chips are still the singleton’s current array. Add is also still enabled against A’s old pool label.
- **Observable consequence:** B’s Roll tab temporarily retains A’s base pool and modifier. Clicking A’s stale badge changes `MOD` and performs the storage operation under B’s ID; adding can persist a chip for B’s old-name pool even though B never loaded that pool, and the length heuristic can then hide the successful write. This is a routine character-switch path and affects the shared roller, not an exotic external-storage race.
- **Confidence:** High.

### [Pass 2] Combat quick-rolls restore active chips into the dice count but never render them

- **Severity:** High
- **File:line:** `public/js/game/combat-tab.js:143`, `public/js/game/combat-tab.js:147`; `public/js/suite/roll-v2.js:198`, `public/js/suite/roll-v2.js:341`, `public/js/suite/roll-v2.js:436`
- **Triggering input or sequence:** Persist an on chip for a character’s `Brawl`, `Weaponry`, or `Firearms` pool, then use the Combat tab’s quick-roll button. `quickRoll` calls `loadPool(pool, label, { total: pool })`; restoration adds the chip value to `MOD`, but `updPool` sees no `pi.attr` and returns before the chip-rendering block and before add-row state is painted.
- **Observable consequence:** The combat roll silently includes a persisted modifier that the ST cannot see, toggle, or remove in the breakdown. Depending on the prior row state, adding is either incorrectly unavailable or creates another invisible active modifier. Hidden dice modifiers make this path unsafe to ship as-is.
- **Confidence:** High.

### [Pass 3a] AC1 is literally violated after a character change clears the loaded pool

- **Severity:** High
- **File:line:** `specs/stories/rlv-7-persistent-per-power-mod-chips.md:20`; `public/js/app.js:1134`; `public/js/suite/roll-v2.js:436`
- **Triggering input or sequence:** Successfully load any pool so the row is enabled, then choose another character. `pickChar` sets `POOL_INFO = null` but leaves `POOL_NAME` truthy and does not call the only add-row paint block, which is below `updPool`’s no-`pi` early return anyway.
- **Observable consequence:** Contrary to AC1’s literal “hidden/inert when no character or no pool is loaded,” the row remains visible and enabled while no pool is loaded for the new character. The High cross-character consequences are detailed in the independently formed Pass 2 finding above.
- **Confidence:** High.

### [Pass 3b] The record’s “No High/Medium findings” conclusion is false; live Chromium reproduces two ship-blocking paths

- **Severity:** High
- **File:line:** `specs/stories/rlv-7-persistent-per-power-mod-chips.md:468`; `public/js/app.js:1134`; `public/js/game/combat-tab.js:147`; `public/js/suite/roll-v2.js:341`
- **Triggering input or sequence:** In live Chromium, load A’s 6-die Occult pool, add an on `+2` chip, then select B without loading a B pool. The observed UI stayed at effective 8, kept one chip, kept the add button enabled, and hid only the banner; clicking the stale badge changed the effective pool to 6. Separately, persist a `+2` Brawl chip and call the exact combat shape `loadPool(5, 'Brawl', { total: 5 })`.
- **Observable consequence:** The attr-less reload displayed effective 7 while rendering zero chips and leaving the add button enabled: a hidden persisted modifier affected the roll. These are concrete High findings, so the record’s “No High/Medium findings” and implied as-is readiness are not defensible.
- **Confidence:** High; reproduced in Chromium with the repository’s Playwright-managed server.

## Medium

### [Pass 1] Stale in-memory chip state can make toggle/remove apply the opposite MOD arithmetic

- **Severity:** Medium
- **File:line:** `public/js/suite/roll-v2.js:526`, `public/js/suite/roll-v2.js:538`; `public/js/game/power-mod-chips.js:52`, `public/js/game/power-mod-chips.js:59`
- **Triggering input or sequence:** Load a chip while it is `on`, then let the same `(charId, powerName)` localStorage record be changed to `off` without updating `state.powerChips` (for example by another same-origin tab). Click the still-rendered chip. `togPowerChip` reads `on: true` locally and subtracts its value, while `toggleChip` independently reloads `on: false` from storage and changes it to `true`. The analogous remove sequence subtracts a locally-on chip even when the stored chip being removed is off.
- **Observable consequence:** `state.MOD` and the persisted/rendered chip state disagree; the next roll can be wrong until the pool is reloaded. Removal can likewise change the pool by a value the actually persisted chip was not contributing.
- **Confidence:** High from the two separate reads visible in the diff; whether ordinary app code supplies an additional same-tab mutation path remains for Pass 2.

### [Pass 1] Caught storage-write failures are returned to callers as successful mutations

- **Severity:** Medium
- **File:line:** `public/js/game/power-mod-chips.js:33`, `public/js/game/power-mod-chips.js:41`, `public/js/game/power-mod-chips.js:52`, `public/js/game/power-mod-chips.js:59`; `public/js/suite/roll-v2.js:503`
- **Triggering input or sequence:** Make `localStorage.setItem` throw (quota exhausted, storage disabled, or a test double that throws), then add, toggle, or remove a chip. `saveChips` swallows the exception and each mutation function still returns its proposed `next` list. The roller assigns that list and adjusts `state.MOD` as though persistence succeeded.
- **Observable consequence:** The UI and current roll show a mutation that disappears on reload. In the add case the inputs are also cleared, so the player receives no indication that their supposedly persistent chip was never saved.
- **Confidence:** High.

### [Pass 1] The unescaped composite key is not injective

- **Severity:** Medium
- **File:line:** `public/js/game/power-mod-chips.js:12`
- **Triggering input or sequence:** Store chips for `(charId="a-b", powerName="c")` and `(charId="a", powerName="b-c")`. Both generate `tm-rlv7-chips-a-b-c`.
- **Observable consequence:** Two distinct character/pool pairs share and overwrite one chip list, violating per-pair isolation.
- **Confidence:** High as a property of the key construction; Pass 2 will determine whether production identifiers/names make the collision reachable.

### [Pass 1] Persisted chip IDs can break the inline handler’s JavaScript-string boundary

- **Severity:** Medium
- **File:line:** `public/js/suite/roll-v2.js:416`
- **Triggering input or sequence:** Load a syntactically valid version-1 localStorage payload whose chip ID contains a single quote, such as `x');alert(document.domain);//`. `loadChips` performs no item-schema validation. Rendering escapes only double quotes in the ID, then interpolates it into the single-quoted argument of `onclick="togPowerChip('...')"` and the equivalent remove handler.
- **Observable consequence:** Clicking the rendered badge can execute attacker-controlled JavaScript in the app origin. Even absent a deliberate payload, an apostrophe in a malformed/imported ID makes toggle/remove unusable.
- **Confidence:** High for the rendering break-out. Exploitability requires a same-origin path to seed localStorage; the diff itself exposes no chip-ID text entry because normally generated UUIDs are safe.

### [Pass 1] Loaded payload entries are trusted without shape or type validation

- **Severity:** Medium
- **File:line:** `public/js/game/power-mod-chips.js:17`; `public/js/suite/roll-v2.js:197`, `public/js/suite/roll-v2.js:414`
- **Triggering input or sequence:** Put a version-1 payload in storage with a truthy `on` and a non-number `value` (for example `"10"` or markup text), or missing/malformed fields. `loadChips` accepts the array unchanged. `loadPool` adds raw values to `state.MOD`, and `updPool` injects the raw value into `innerHTML`.
- **Observable consequence:** A numeric string can coerce the accumulator into string concatenation and produce a wrong effective pool; markup in `value` can alter/inject rendered DOM. Corrupt-but-parseable storage is therefore not handled by the advertised safe fallback.
- **Confidence:** High.

### [Pass 2] Skill-tile fallback drops Rote and merit-breakdown fields that its source object already carries

- **Severity:** Medium
- **File:line:** `public/js/game/char-pools.js:137`; `public/js/app.js:336`, `public/js/app.js:1149`, `public/js/app.js:1286`; `public/js/suite/roll-v2.js:354`
- **Triggering input or sequence:** Load a prebuilt skill tile for a character with Professional Training 5 on that skill, or load Intimidation with Air of Menace. `char-pools.js` places `roteEligible`, `meritBonus`, and `meritLabel` on the pool object while deliberately setting `pi: null`; each `app.js` fallback reconstructs `pi` without those three fields.
- **Observable consequence:** The pool total remains numerically boosted, but its breakdown omits the Air of Menace term and the clickable Rote cue is lost even though the tile itself was marked eligible. This is surrounding-code debt rather than a line changed by rlv.7, but it is a concrete mismatch in the call-site audit requested for this pass.
- **Confidence:** High.

### [Pass 3a] A comment terminator embedded in the CSS prose invalidates the base remove-affordance rule

- **Severity:** Medium
- **File:line:** `public/css/suite.css:151`, `public/css/suite.css:155`, `public/css/suite.css:156`
- **Triggering input or sequence:** Parse the stylesheet normally. The phrase `.effpool-*/.mchip` contains `*/`, so the comment ends after `.effpool-*`; the leftover `.mchip rule in this file already uses. */` becomes part of the selector prelude for the following `{...}` block.
- **Observable consequence:** The malformed selector causes the browser to discard the intended `.effpool-spec-del{margin-left:4px;color:var(--txt3)}` rule. The remove “×” loses its base spacing and token colour, contradicting Task 5/AC11’s claim that this rule supplies the new affordance styling; hover/on descendant rules after it can still parse.
- **Confidence:** High from CSS tokenization; Pass 3b browser validation will check the computed style.

### [Pass 3a] The specified storage fallback is not a silent no-op

- **Severity:** Medium
- **File:line:** `specs/stories/rlv-7-persistent-per-power-mod-chips.md:96`, `specs/stories/rlv-7-persistent-per-power-mod-chips.md:149`; `public/js/game/power-mod-chips.js:33`, `public/js/game/power-mod-chips.js:41`
- **Triggering input or sequence:** Disable storage or exhaust quota, then add a valid chip. Task 1 explicitly says guarded storage should “degrade to a silent no-op”; instead `saveChips` suppresses the exception and `addChip` returns the unsaved `next` list, which `addPowerChip` treats as success.
- **Observable consequence:** AC6’s persistence promise is presented as successful in the UI but fails on reload. This acceptance-level contradiction confirms rather than revises the independently formed Pass 1 error-path finding.
- **Confidence:** High.

### [Pass 3b] The claimed 214/214 combined Vitest regression is false as stated

- **Severity:** Medium
- **File:line:** `specs/stories/rlv-7-persistent-per-power-mod-chips.md:303`, `specs/stories/rlv-7-persistent-per-power-mod-chips.md:308`
- **Triggering input or sequence:** Run the exact eight files named by Task 8 together: the seven sibling suites plus `rlv-7-persistent-mod-chips.test.js`.
- **Observable consequence:** Both independent runs reported `8 passed` files and `210 passed | 9 skipped (219)` tests, not 214/214. The command exits successfully because skips are allowed, but the record overstates both the passed count and absence of skips; readers using its number as regression evidence receive a false result.
- **Confidence:** High; reproduced twice with identical summaries.

### [Pass 3b] The record says the new CSS rules satisfy AC11 although the first rule is discarded

- **Severity:** Medium
- **File:line:** `specs/stories/rlv-7-persistent-per-power-mod-chips.md:453`; `public/css/suite.css:155`
- **Triggering input or sequence:** Render a real chip and query its delete span’s computed style in Chromium.
- **Observable consequence:** `margin-left` is `0px`, confirming that the premature comment terminator makes the intended 4px/token-colour base rule ineffective. The separate claim that `theme.css` has no `--space-*` scale is true, but the claimed successful Task-5 implementation is overstated.
- **Confidence:** High.

## Low

### [Pass 1] Several new assertions are weaker than their test titles

- **Severity:** Low
- **File:line:** `tests/rlv-7-persistent-mod-chips.spec.js:32`, `tests/rlv-7-persistent-mod-chips.spec.js:143`, `server/tests/rlv-7-persistent-mod-chips.test.js:96`, `server/tests/rlv-7-persistent-mod-chips.test.js:173`, `server/tests/rlv-7-persistent-mod-chips.test.js:213`
- **Triggering input or sequence:** Run the tests against subtly incomplete implementations: place the three add-row IDs anywhere in `/` rather than inside the breakdown; make `addPowerChip` update memory/MOD but fail persistence; mutate the non-target toggle chip’s label/value while leaving its `on` flag true; or round-trip only the stored label while losing ID/value/on.
- **Observable consequence:** The titled behaviours (“inside the breakdown”, “MOD/persistence must never disagree”, “leaves other chips untouched”, and a real round trip) can still pass. The source-fetch smoke tests likewise prove exported spelling rather than executable wiring.
- **Confidence:** High.

### [Pass 1] The add success test is a list-length heuristic, not proof that this invocation added a chip

- **Severity:** Low
- **File:line:** `public/js/suite/roll-v2.js:503`
- **Triggering input or sequence:** Let localStorage contain a different number of chips than stale `state.powerChips`, then submit. A rejected whitespace label can return a stored list whose length differs from `before` and be treated as success; conversely, a valid add can produce a list whose new length happens to equal stale `before` and be treated as failure.
- **Observable consequence:** The rejected value may be added invisibly to `MOD`, or a successfully persisted chip may not enter current UI/MOD until reload. This is the stale-state generalization of the specifically requested empty-label trace: with synchronized lists, the empty-label case is correctly detected and does not inflate MOD.
- **Confidence:** High under stale state; reachability via ordinary surrounding-code paths remains for Pass 2.

### [Pass 1] Storage-failure comments contradict the persistence-facing behaviour

- **Severity:** Low
- **File:line:** `public/js/game/power-mod-chips.js:37`; `public/js/suite/roll-v2.js:511`
- **Triggering input or sequence:** Cause `setItem` to throw during an add.
- **Observable consequence:** The code calls the swallowed write failure an “acceptable fallback” and clears inputs “on success,” although the promised persistent operation did not succeed. This makes the failure mode easy for maintainers and users to misread.
- **Confidence:** High.

### [Pass 2] The unit integration harness avoids the real post-add rendering branch

- **Severity:** Low
- **File:line:** `server/tests/rlv-7-persistent-mod-chips.test.js:46`, `server/tests/rlv-7-persistent-mod-chips.test.js:72`; `public/js/suite/roll-v2.js:341`, `public/js/suite/roll-v2.js:441`
- **Triggering input or sequence:** Run the `addPowerChip` integration tests. Their `beforeEach` sets the character, pool name, MOD, and chip list but never supplies `state.POOL_INFO`; consequently `updPool()` returns at the no-`pi` branch. The fake `document` does not implement the global `document.querySelector` that the successful real branch calls (its fake elements have a method, the document does not).
- **Observable consequence:** The tests verify MOD/list mutations while systematically skipping input clearing, badge markup, add-row painting, and the global selector dependency exercised by a real loaded pool. A DOM regression in the successful add flow can pass all of these unit integration tests.
- **Confidence:** High.

### [Pass 2] Pass 1’s delimiter collision is not reachable through the production character API today

- **Severity:** Low
- **File:line:** `server/routes/characters.js:81`, `server/routes/characters.js:425`; `public/js/game/power-mod-chips.js:12`
- **Triggering input or sequence:** The Pass 1 example requires variable-length/hyphenated character IDs. Production character lookup and creation use MongoDB `ObjectId`s, whose string form is fixed-width 24-hex, so two current API-issued IDs cannot shift the char/power boundary as in `(a-b,c)` versus `(a,b-c)`.
- **Observable consequence:** The key function remains structurally ambiguous for fixtures or any future non-ObjectId character source, but the earlier Medium collision finding overstates present production reachability. It should not by itself block this release.
- **Confidence:** High for current API-created characters; existing externally seeded character documents were not queried because this review is repository-local.

### [Pass 3b] The Task-6 completion note is stale and internally contradicts the later self-fix note

- **Severity:** Low
- **File:line:** `specs/stories/rlv-7-persistent-per-power-mod-chips.md:459`, `specs/stories/rlv-7-persistent-per-power-mod-chips.md:479`, `specs/stories/rlv-7-persistent-per-power-mod-chips.md:500`; `server/tests/rlv-7-persistent-mod-chips.test.js:46`
- **Triggering input or sequence:** Compare the current test file and current gate with the completion/file-list claims.
- **Observable consequence:** The record twice says the file has 23 tests and says no `location`/`document` stub is needed, while the current file contains an `addPowerChip` integration harness with both stubs and runs 28 tests. The later self-fix paragraph correctly says 28/28 and acknowledges the harness, leaving the author’s own record self-contradictory.
- **Confidence:** High.

## Ship readiness

This change is **not ready to ship as-is and needs patches**. The character-switch state must be cleared/reloaded atomically, and chip rendering/add-row painting must not sit behind the `pi.attr` early return; otherwise routine player/ST flows can roll hidden or cross-character modifiers. The malformed CSS comment and storage-write success contract should also be fixed. The failing legacy equipment spec remains the documented pre-existing baseline and is not a new rlv.7 blocker.

## Validation notes

### Pass isolation and files opened

- **Pass 1:** Opened only `specs/stories/code-review/rlv-7-diff.txt`. All source/test observations came from that diff. I did not open repository source, the story, tracking files, or sibling repositories. Pass 1 was written to this file before advancing.
- **Pass 2:** Opened `public/js/suite/roll-v2.js` in full (three non-truncated chunks), `public/js/suite/data.js` in full, `public/js/game/char-pools.js` in full, the relevant `openPanel`/`pickChar`/`_switchChar`/all-`loadPool` contexts of `public/js/app.js`, `public/js/game/combat-tab.js` in full, the character-selection context of `public/js/suite/sheet.js`, and `public/js/shared/pools.js` in full. Repository-wide `rg` searches also returned matching excerpts/file names from `server/routes/characters.js` and other ObjectId-related server files, plus a noisy/truncated one-line match from `public/js/dev-fixtures.js` and names/lines from `public/mockups/data/downtime_submissions.json`; no sibling repository was searched. I did not open the story. Pass 2 was written before advancing.
- **Pass 3a:** First listed only the story’s level-2 heading locations, then opened exactly lines 1-418 of `specs/stories/rlv-7-persistent-per-power-mod-chips.md` (through References, stopping before line 419’s Dev Agent Record). Also opened `public/css/suite.css:146-167` to verify the acceptance/CSS issue. I did not read the Dev Agent Record until Pass 3a was frozen.
- **Pass 3b:** Opened the story from line 419 to EOF (Dev Agent Record and File List), relevant lines of `public/css/theme.css`, and `CLAUDE.md:54-62`. Test files named below were executed; their two new rlv.7 files had already been seen as diff content in Pass 1. A temporary Playwright probe file and a temporary `D:\tmp` Node probe were created solely for live validation and then deleted.

### Commands and real results

- Pass 1: `Get-Content -Raw -LiteralPath 'specs/stories/code-review/rlv-7-diff.txt'` — succeeded; no other read command was run in that pass.
- Pass 2 source/context reads: `Get-Content -Raw` for `roll-v2.js`, `data.js`, and `char-pools.js`; `rg -n -C 14 "function openPanel|loadPool\(" public/js/app.js`; line counts for the four orientation files; three chunked `Get-Content` reads covering `roll-v2.js` lines 1-872; full repeat reads for `data.js`/`char-pools.js`; targeted `Get-Content` ranges for `app.js`; full `combat-tab.js`; the `sheet.js` selection range; and full `shared/pools.js` — all succeeded. The first combined output was truncated, which is why the complete files were re-read separately/chunked.
- Pass 2 searches: `rg -n "\bloadPool\(" public/js` plus state-assignment search; targeted line-number searches across `roll-v2.js`/`app.js`/`combat-tab.js`/`sheet.js` and the rlv.7 unit test; `rg` for `getPool` shape; `rg` for pool/attr data under `public`; and `rg` for schema/ObjectId evidence under `server` — all completed. The public-data search produced a very large one-line fixture match and was truncated, but the needed call-site evidence came from the focused reads.
- Initial and later `git status --short` checks succeeded, with repeated warnings that the global Git ignore file was unreadable. Before my temporary proof, status contained only four pre-existing/untracked review artifacts: this requested findings file plus `rlv-7-codex-review.md`, `rlv-7-codex-run.log`, and `rlv-7-diff.txt`; no source file was modified.
- Pass 3a: heading `Select-String`, story `Get-Content` lines 1-418, and `suite.css` line-range read all succeeded.
- Pass 3b story/tooling discovery: story `Get-Content` lines 419-EOF, `rg --files` for all named suites, `rg`/line read of `theme.css`, `rg` of `CLAUDE.md`, and story line-number `rg` all succeeded. `theme.css:77-80` does explicitly say no `--space-*` scale exists, so that author claim is true.
- Gate command `cd server && npx vitest run tests/rlv-7-persistent-mod-chips.test.js` passed **28/28** on the first run and again after the temporary proof/restore (final confirmation: 1 file, 28 passed).
- Gate command `npx playwright test tests/rlv-7-persistent-mod-chips.spec.js` passed **11/11** in Chromium.
- Combined regression command `cd server && npx vitest run tests/crd-2-pending-queue.test.js tests/crd-3b-resolution-screen.test.js tests/equipment-client-fixes.test.js tests/gdx-7-apply-costs-on-roll.test.js tests/gdx-8-influence-reconcile-current-cycle.test.js tests/issue-879-defence-penalty-wirein.test.js tests/rlv-1-combat-tab-quick-roll.test.js tests/rlv-7-persistent-mod-chips.test.js` completed successfully twice; both real summaries were **8 files passed; 210 tests passed, 9 skipped, 219 total**, not 214/214.
- `npx playwright test tests/rlv-4-custom-pool-builder.spec.js` passed **12/12**. `npx playwright test tests/rlv-2-single-roller-retirement.spec.js` passed **6/6**.
- `npx playwright test tests/feature-662-eq3-roll-calc-equipment-chips.spec.js` finished **5 passed / 7 failed**. The exact failures were AC-1, AC-2, AC-3, AC-4, AC-7, AC-8, and AC-10, exactly matching `CLAUDE.md`’s documented baseline. AC-4 and AC-8 timed out at 60 seconds; the others failed missing/hidden element assertions.
- Self-fix discrimination: recorded `roll-v2.js` SHA-256 `4A7F5CD506A1CD9088F8E5729349031FB5DA35F9D2025B4CAA25ACD1EFEADD8C`; temporarily removed only `const before = ...` and `if (updated.length === before) return`; ran `npx vitest run tests/rlv-7-persistent-mod-chips.test.js -t "regression: an empty-label|regression: a whitespace-only"`; both selected tests failed exactly with expected 0 / received 3 and 26 skipped. After restoring the two lines, the full file passed 28/28.
- The first post-restore hash command was accidentally run from `server/` with a root-relative path and failed to find the file. `apply_patch` had also normalized line endings, leaving a source `M` despite no textual diff. `git checkout -- public/js/suite/roll-v2.js` was attempted as a restore but could not create `.git/index.lock` because this environment grants read-only `.git` access. `Get-Command unix2dos`, `git ls-files --eol`, and `unix2dos public/js/suite/roll-v2.js` then restored the original CRLF bytes. The SHA-256 returned exactly to the recorded value and the source `M` disappeared. No content change remains.
- A standalone local-server probe command using hidden `Start-Process` was rejected by environment policy before execution; no server started. Replacement probe: a temporary Playwright spec was run once and timed out because the collapsed disclosure made the stale chip physically unclickable in that setup. After making the test mirror a player-opened disclosure, the rerun passed and printed: before switch `effective=8`, one chip, button enabled, delete margin `0px`; after switch the same stale state remained with banner hidden; stale click changed effective to 6 and removed the rendered chip; attr-less Brawl reload showed `effective=7`, zero chips, button enabled. Both temporary files were deleted, and `Test-Path` returned `False` for each.
- Final cleanup commands: `git diff --check` succeeded; the restored source hash matched exactly; `git status --short` showed no tracked source modification and only the four untracked review artifacts named above. I modified only this requested findings document permanently. All temporary source/test edits were restored or deleted.

### Could not run

- No required suite was unrun. Chromium was present and port 8080 worked through Playwright’s managed web server.
- The standalone Node/browser probe could not run because the environment blocked its background-server command; the equivalent Playwright-managed probe ran successfully instead.
- `git checkout --` could not run because `.git/index.lock` is not writable in this sandbox; byte-exact restoration was completed with line-ending normalization and verified by the original SHA-256 plus clean tracked-source status.
