# Adversarial review findings — rcv.3a

## High

- None found.

## Medium

### [Pass 1] Rules-bearing `pi` shapes can be rejected by the summary gate

- **Severity:** Medium
- **File:line:** `public/js/suite/roll-v2.js:261`
- **Triggering input or sequence:** A caller loads a pool with `pi` containing only structured cost fields (`vitae_cost` / `willpower_cost`) and/or `rules_text`, but with no truthy `effect`, `action`, `duration`, or legacy `cost`—for example, `loadPool(total, name, { vitae_cost: 1, rules_text: '...', rules_source: '...' })`.
- **Observable consequence:** `hasRules` is false, so the entire Rules explanation box is hidden even though `fmtCostLine(pi)` and/or `renderRulesExpander(...)` could render meaningful content. The comment explains why structured cost alone is excluded for Vampire Mechanics, but the gate is shape-based rather than category-based, so it also excludes any genuine power with the same sparse shape.
- **Confidence:** Medium from the diff alone; repository call-site and `getPool()` tracing was deliberately deferred to Pass 2.

### [Pass 2] Qualified structured costs lose their mechanically significant note

- **Severity:** Medium
- **File:line:** `public/js/shared/pools.js:57-76` (missing `cost_note` threading), observed at `public/js/suite/roll-v2.js:271`
- **Triggering input or sequence:** Load a rollable rule whose migrated cost has both a numeric structured value and a qualifier, such as `{ cost: '1 V per effect', vitae_cost: 1, willpower_cost: 0, cost_note: 'per effect' }`. `getPool()` passes `cost`, `vitae_cost`, and `willpower_cost` into `pi` but omits `cost_note`; `updRulesSummary()` then calls `fmtCostLine(pi)`.
- **Observable consequence:** The Roll-tab explanation says only `1 Vitae`, dropping `per effect` (and likewise could drop `per turn` or `0 in bond`). That changes the apparent activation cost. The legacy string cannot rescue it because structured numeric fields make `fmtCostLine()` prefer the incomplete structured branch. The real modules reproduced a `pi` with no `cost_note` and output `Cost: 1 Vitae`.
- **Confidence:** High; reproduced with repository modules, and the migration/schema explicitly call these qualifiers mechanically meaningful.

### [Pass 3a] The cost precedence contradicts AC5's literal legacy-first requirement

- **Severity:** Medium
- **File:line:** `public/js/suite/roll-v2.js:271`
- **Triggering input or sequence:** Load a migrated power where `pi.cost` and structured fields are both present, especially `pi.cost = '1 V per effect'`, `pi.vitae_cost = 1`, and `pi.willpower_cost = 0`.
- **Observable consequence:** AC5 says the summary is built from `pi.cost`, with structured fields used “if absent.” The implementation always delegates to the structured-first `fmtCostLine()`. Its visible text can therefore differ from the primary text AC5 requires; combined with the missing `cost_note`, the reproduced result is `1 Vitae` with the present qualifier lost.
- **Confidence:** High; the AC wording, formatter precedence, and real-module reproduction agree.

### [Pass 3b] The review rewrote AC5 and crossed an explicit `getPool()` exclusion to declare the issue resolved

- **Severity:** Medium
- **File:line:** `specs/stories/rcv-3a-rules-explanation-disciplines-rites.md:115,428`; `public/js/shared/pools.js:46,76`
- **Triggering input or sequence:** After Pass 3a froze the original AC5 (“built from `pi.cost`, or, if absent, structured fields”) and the “What this story is NOT” prohibition on changing `getPool()` or any `pi` shape, the concurrent review changed AC5 to structured-first and added `cost_note` to both `getPool()` return shapes.
- **Observable consequence:** The concurrent patch does preserve the qualifier semantically (`1 Vitae (per effect)` now renders), but it moves the acceptance target after implementation and expands a five-file story into shared pool infrastructure that the story explicitly excluded. The Senior Review's conclusion of “No unresolved High/Medium findings” is therefore not valid against the acceptance criteria Pass 3a was required to audit literally.
- **Confidence:** High; the original AC text was captured before the author record existed, the current story explicitly says it was changed to match the code, and the new out-of-diff `pools.js` hunk labels itself an rcv.3a review fix.

## Low

### [Pass 1] The initial-hidden assertion passes when the feature element is absent

- **Severity:** Low
- **File:line:** `tests/rcv-3a-rules-explanation-box.spec.js:176`
- **Triggering input or sequence:** Delete or fail to mount `#rules-summary-box`, then run only the test named “the box is hidden before any pool is loaded.”
- **Observable consequence:** Playwright's `toBeHidden()` accepts a nonexistent locator as hidden, so this assertion does not independently prove the disclosure was mounted. Other tests in the file cover existence, limiting this to a diagnostic-quality gap rather than a product defect.
- **Confidence:** High.

### [Pass 2] Malformed rule fields are converted into plausible-looking garbage

- **Severity:** Low
- **File:line:** `public/js/suite/roll-v2.js:271-277`
- **Triggering input or sequence:** A hand-malformed rule supplies an array or nested object for `action`, `duration`, `description`/`effect`, or structured cost—for example, `pi.action = { type: 'Instant' }` or `pi.vitae_cost = { amount: 1 }`.
- **Observable consequence:** `esc()` safely coerces metadata rather than throwing, but the user sees `[object Object]`; `fmtCostLine()` can emit `[object Object] Vitae`. This is XSS-safe and schema-valid API writes reject these types, but a directly edited or malformed cached rule is rendered as misleading copy rather than omitted or diagnosed.
- **Confidence:** High about behavior; Low severity because the normal validated write path prevents it.

### [Pass 3b] The claimed 339/342 Vitest gate is not reproducible as stated

- **Severity:** Low
- **File:line:** `specs/stories/rcv-3a-rules-explanation-disciplines-rites.md:346,460`
- **Triggering input or sequence:** Grep the literal module names to obtain the record's 14 server files, then run those exact 14 files with `npx vitest run` in `server`.
- **Observable consequence:** The current environment reports **3 failed, 255 passed, 84 skipped (342 total)**, not 339 passed / 3 failed. The same three #1117 assertions fail as claimed, but `gdx-6-structured-power-costs` and `issue-992-uplift-rules-text` cannot connect to MongoDB (`EACCES`) and their tests are skipped/file-level failed. The record's number may have come from an environment with DB access, but it is unverifiable-as-stated here and overstates the gate available from this checkout under the mandated run conditions.
- **Confidence:** High about the observed result; Low severity because the discrepancy is environmental and the 50/50 browser gate is green.

## Pass 3b outcome and ship assessment

The Dev Agent Record and Senior Developer Review were appended concurrently after Pass 3a and after the first Pass 3b check had confirmed that neither existed. Their 50/50 Playwright claim is verified on the current tree. Their flex-collapse explanation is also independently verified (104.28px with `flex:none`, 2px with default shrinking). The 339/342 Vitest claim is not reproducible in this environment, as reported above.

**Not ready to ship as the originally reviewed story.** The concurrent fixes close the two semantic bugs found in Passes 1/2 and the current 50-test browser gate is green, but they do so by changing an explicitly excluded shared `getPool()`/`pi` contract and rewriting AC5 after Pass 3a froze it. Reconcile that scope/acceptance decision explicitly, then rerun the DB-dependent server gate in an environment with MongoDB access.

## Validation notes

### Information barrier and files opened

- **Pass 1:** Opened only `specs/stories/code-review/rcv-3a-diff.txt`. A unified-diff line counter also read only that file. I did not open repository source or the story before freezing Pass 1.
- **Pass 2:** Opened/read `public/js/suite/roll-v2.js` (reset, summary, and load region), `public/js/shared/pools.js`, `public/js/shared/rules-text.js`, `public/js/suite/sheet-helpers.js`, relevant ranges of `public/js/app.js`, `public/js/game/char-pools.js`, `public/js/shared/resist.js`, the inserted region of `public/css/suite.css`, `public/js/data/helpers.js` around `esc`, `public/js/data/loader.js`, `server/schemas/purchasable_power.schema.js`, cost-parsing regions of `server/scripts/gdx-6-structured-power-costs.mjs`, and matching portions of `server/tests/gdx-6-structured-power-costs.test.js` and `server/tests/gdx-7-apply-costs-on-roll.test.js`. Source-scoped greps inspected `loadPool`/`resetRollPool` sites in `public/js/app.js`, `public/js/game/combat-tab.js`, `public/js/game/humanity-check.js`, `public/js/game/char-pools.js`, and `public/js/suite/sheet.js`. I did not open the rcv.3a story before freezing Pass 2.
- **Pass 3a:** Read `specs/stories/rcv-3a-rules-explanation-disciplines-rites.md` sequentially from the start through Story, Design source, Acceptance Criteria, What this story is NOT, Tasks/Subtasks, Dev Notes, and References. The reader was programmed to stop before a Dev Agent Record or Senior Developer Review heading. Pass 3a was frozen before attempting the later read.
- **Pass 3b:** Initially attempted to read from a Dev Agent Record heading to EOF and received no content; a targeted search confirmed no record existed at that time. During later validation a concurrent process appended a Dev Agent Record and Senior Developer Review and modified source/tests. I then read the new record from its heading to EOF, inspected the changed `pools.js`, `roll-v2.js`, and new rcv.3a regression-test regions, and verified its checkable claims. Test-import greps inspected `server/tests`; the runners opened the four named Playwright specs and attempted the server Vitest suites described below.

### Commands and real results

Pass 1:

- `Get-Content -LiteralPath 'specs/stories/code-review/rcv-3a-diff.txt'` — succeeded.
- PowerShell unified-diff target-line parser over that same file — succeeded; located the gate at target line 261 and the initial-hidden test at target line 176.

Pass 2:

- Broad `rg` searches for `loadPool(` and `resetRollPool(` (excluding the story/findings), exact new CSS classes, and `sheet-helpers.js` module-scope statements — succeeded. The first repository-wide call-site result was noisy with archived/spec/log material, so it was followed by source-scoped searches.
- Source-scoped `rg -n -C` searches for `loadPool(` and `resetRollPool(` under `public/js` — succeeded and enumerated the live application sites.
- `Get-Content` reads of `public/js/shared/pools.js`, `public/js/shared/rules-text.js`, and `public/js/suite/sheet-helpers.js`; range reads of `roll-v2.js` and `app.js`; and the `esc` definition grep — succeeded. One combined output was truncated, so relevant material was obtained through narrower follow-ups.
- `Get-Content` reads of `public/js/game/char-pools.js` and `public/js/shared/resist.js`; CSS context/collision searches; and field-name searches across `public` — succeeded. One broad field search was noisy with mock data and was replaced by narrower searches.
- CSS context and exact-class collision grep, `lashOutPool`/`bloodBondPool` grep, rules/power file inventory, and rules-loader usage grep — succeeded; no exact CSS collision or Special-tile false positive was found.
- `Get-Content 'server/schemas/purchasable_power.schema.js'` plus `cost_note` searches, `Get-Content 'public/js/data/loader.js'`, `getPool` test searches, and formatter-use searches — succeeded.
- Qualifier/parser searches over `server/scripts/gdx-6-structured-power-costs.mjs` and its test, `cost_note` threading searches, `git diff --no-ext-diff --` for the five reviewed files, and `git status --short` — succeeded. Status showed the pre-existing dirty tree described in the request plus the requested findings output.
- Inline Node ESM driver importing the real `getPool()` and `fmtCostLine()` — succeeded and printed `{"cost":"1 V per effect","vitae_cost":1,"willpower_cost":0}` followed by `Cost: 1 Vitae`, reproducing the qualifier loss.

Pass 3:

- Sequential PowerShell reader for the story, stopping before Dev Agent Record/Senior Developer Review — succeeded and emitted only the permitted Pass 3a material.
- Sequential reader from Dev Agent Record to EOF, then `Select-String` for author-record/test-result headings — initially succeeded with no output. A later repeat found the concurrently appended record at line 311 and Senior Review at line 367; the reader was rerun and the new record was read in full.
- Server-test import/reference greps for `roll-v2.js`, `sheet-helpers.js`, and `rules-text.js`, followed by the broader module-reference and renderer-name searches — succeeded. No server test directly imports `public/js/shared/rules-text.js`. The ten files referencing/importing/mocking/reading the other two modules were `crd-2-pending-queue`, `crd-3b-resolution-screen`, `equipment-client-fixes`, `gdx-11-vampire-mechanics-quick-actions`, `gdx-6-structured-power-costs`, `gdx-7-apply-costs-on-roll`, `gdx-8-roll-history`, `rlv-1-combat-tab-quick-roll`, `rlv-7-persistent-mod-chips`, and `suite-chevron-binding-433`.
- Exact Playwright gate: `npx playwright test tests/rcv-3a-rules-explanation-box.spec.js tests/rlv-4-custom-pool-builder.spec.js tests/rlv-2-single-roller-retirement.spec.js tests/rcv-2-three-independent-accordions.spec.js` — **47 passed, 0 failed**; 20.7s reported test time, 24.8s command wall time. No stale-server anomaly was observed.
- Required full server gate: `npx vitest run` with working directory `server` (equivalent to `cd server && npx vitest run`) — first attempt timed out after **121.8s** with no final aggregate. Partial output showed unrelated assertion failures and repeated MongoDB `connect EACCES 159.143.141.178:27017` failures.
- Targeted changed-area/reference gate over the ten files named above — completed in **27.54s** with **10 files total: 9 passed, 1 failed; 209 tests passed, 60 skipped (269 total)**. The sole failed file was `gdx-6-structured-power-costs.test.js`; DB setup could not connect, all 36 tests in that file were skipped, and cleanup reported “Database not connected.”
- Required full server gate, second attempt with a ten-minute ceiling — timed out after **602.1s** and still emitted no final aggregate. It repeatedly hit the same forbidden MongoDB connection and also showed unrelated existing failures including `gdx-4-css-standards-grep`, `issue-1013-indomitable-rules-text`, `issue-830-inherited-card-css`, `bloodline-name-index`, and `epic.708.2-cycle-tab-shell` before timeout.
- `Get-Content` of this findings file revealed that a concurrent process had overwritten it with commands/results not produced in this session. A failed context patch made no change; this file was then rebuilt from this session's already-frozen findings and actual command ledger.
- `git diff -- public/js/shared/pools.js` plus `Select-String cost_note` — succeeded and proved a concurrent rcv.3a review fix had added `cost_note` to both pool-return branches after Passes 1-3a were frozen.
- The real-module Node cost driver was rerun against that current tree — succeeded and now printed a `pi` containing `cost_note:"per effect"` followed by `Cost: 1 Vitae (per effect)`, confirming the concurrent patch mitigates the earlier semantic loss. The original finding remains unchanged per the fixed-pass rule.
- The exact Playwright gate was rerun after the concurrent source/test changes — **50 passed, 0 failed in 21.6s** (26.8s wall time), including three new rcv.3a review-fix regressions. No stale-server anomaly was observed.
- Literal `rg -l "roll-v2|sheet-helpers|rules-text" server/tests` — succeeded and returned exactly the 14 files claimed in the new record.
- Exact targeted run of those 14 files — completed in 41.70s with **3 failed, 255 passed, 84 skipped (342 total); 3 files failed, 11 passed**. The three assertion failures were the documented missing-markdown `issue-1013` failures; `gdx-6-structured-power-costs` and `issue-992-uplift-rules-text` also failed file setup/cleanup because MongoDB access was denied.
- First inline Playwright flex-measurement driver failed because Node v24 rejected mixed `require` and top-level `await`; the CommonJS-wrapped retry reached the page but timed out waiting for hidden `#app` to become visible. A third, corrected attached-DOM driver succeeded and measured `.rules-summary` at **104.28125px** with computed `flex: 0 0 auto`, then **2px** after applying default shrinkable `flex: 0 1 auto`, independently confirming the record's claimed flex-collapse root cause without editing a file.

`apply_patch` was used only on this requested findings path: to create/freeze Pass 1, append Pass 2, append Pass 3a, attempt the final assembly (one context mismatch, no change), and rebuild after the concurrent overwrite. No reviewed source, test, story, tracking, or configuration file was edited, and no temporary source edit was made.

### Could not run / complete

- A complete repository-wide `cd server && npx vitest run` aggregate could not be obtained. Two attempts (121.8s and 602.1s) timed out because network policy denied MongoDB access and the suite continued through many DB-backed files. No final full-suite aggregate was emitted.
- The DB-backed portions of `gdx-6-structured-power-costs.test.js` and `issue-992-uplift-rules-text.test.js` could not execute under the network policy. The exact 14-file changed-area aggregate is reported with those skips/failures rather than presented as green.

### Working-tree attestation

I did not modify any reviewed implementation/test/story/tracking file. The only deliberate filesystem write by this session was `specs/stories/code-review/rcv-3a-codex-findings.md`, explicitly required by the task. A concurrent process did modify `public/js/shared/pools.js`, `roll-v2.js`, CSS/markup/tests, and the story/record during validation; those changes are not mine and mean the final worktree differs materially from the supplied five-file diff.

The final `git status --short` still showed the pre-existing dirty files plus the concurrent `public/js/shared/pools.js` change and newly appearing story artifacts; this findings file remained untracked as expected. Final scoped `git diff --check` over the current rcv.3a implementation files (including the concurrent `pools.js` addition) exited 0. No file needed restoration because this session made no temporary implementation edit.
