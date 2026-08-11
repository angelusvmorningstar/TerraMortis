# Issue 1137 adversarial code review

## High

- None found in Pass 1.
- None found in Pass 2.
- None found in Pass 3a.
- None found in Pass 3b.

## Medium

### [Pass 1] Duplicate admitted pool rules still multiply capacity

- **Severity:** Medium
- **File:line:** `public/js/editor/rule_engine/pool-evaluator.js:24-43`; `public/js/editor/mci.js:113` (post-change line inferred from the supplied hunk)
- **Triggering input or sequence:** `getRulesCache().rule_grant` contains two documents with `grant_type: 'pool'`, `condition: 'merit_present'`, and the same source/category, while the character holds that source merit.
- **Observable consequence:** the sweep passes both documents to `applyPoolRulesFromDb`, which pushes one `_grant_pools` entry per rule without de-duplication. Consumers that total entries by category can expose twice the intended allocation capacity. This was also possible under an old per-source call because `getRulesBySource(source)` would have returned both duplicates; the sweep does not create the mechanism, but it extends its reach to every newly admitted source. The supplied diff's correction note says duplicate seed groups exist for MCI and OHM but that no compound rule is duplicated today; the MCI `choice`/`tier` rules described in the brief are filtered out by this evaluator, so the concrete admitted fixtures shown in the diff are clean.
- **Confidence:** High in the behavior; medium in production likelihood because Pass 1 was deliberately restricted from independently inspecting seed data.

### [Pass 1] The new suite does not actually protect the two established non-compound pools it claims must not change

- **Severity:** Medium
- **File:line:** `server/tests/issue-1137-pool-producer.test.js:93-106,169-249` (new-file line numbers from the supplied diff)
- **Triggering input or sequence:** a regression changes or removes production of the Invested or Lorekeeper pool while the eight-test issue suite is run.
- **Observable consequence:** the suite can remain green. `INVESTED_GRANT` and `LOREKEEPER_GRANT` are included in `ALL_GRANTS`, but no test creates a holder of either source and asserts its pool. Moreover, both fixtures use `partner_merits`, while `_computeAmount` reads `partner_merit_names` or `partner_merit_name`; if exercised as written, both fixture rules compute zero. This leaves the claimed no-behavior-change coverage for two of the four old dispatches absent.
- **Confidence:** High.

### [Pass 2] The supported Rules Data authoring path cannot create the rules the new generic producer requires

- **Severity:** Medium
- **File:line:** `server/schemas/rules/rule-grant.schema.js:12`; `public/js/admin/rules-data-view.js:298`; `public/js/editor/rule_engine/pool-evaluator.js:19`
- **Triggering input or sequence:** an ST uses the Rules Data UI/API to add or edit a pool intended to use the generic producer. The producer only admits `condition === 'merit_present'`, but that value is absent from both the UI selector and the API schema enum. Selecting the UI's default `always` saves a rule the sweep ignores; sending `merit_present` directly is rejected by schema validation. The UI also has no fields for the `source_slug`, `category`, `partner_shareable`, or `sharing_scope` metadata a new Collective Compound needs.
- **Observable consequence:** the advertised future data-driven extension does not work through the repository's supported rule-authoring surface. A newly authored owner still receives no `_grant_pools` entry and its allocator capacity remains zero unless a developer bypasses the API with a direct database seed/script (and supplies the omitted compound metadata).
- **Confidence:** High.

### [Pass 3a] AC6's synthetic proof misses the supported split between a compound's funding source and membership gate

- **Severity:** Medium
- **File:line:** `server/tests/issue-1137-pool-producer.test.js:80-88,226-236`; `public/js/editor/rule_engine/pool-evaluator.js:23-27`; `public/js/data/rules-helpers.js:320-333`; `server/tests/collective-2-compound-generalisation.test.js:107-131,220-235`
- **Triggering input or sequence:** add a valid compound rule whose `source` differs from `sharing_scope.merit`, as the existing discriminating `Silent Vigil` / `Keeper of the Ossuary` fixture explicitly supports. A character holds the membership gate merit but not the funding-source merit, so `ownsCompound` treats them as an owner and renders the compound UI.
- **Observable consequence:** `applyPoolRulesFromDb` gates on `m.name === rule.source` and `rating_of_source` also reads that source, so this owner receives no pool and the rendered allocator clamps to zero. The new AC6 test uses `source === sharing_scope.merit` and therefore proves only the current live shape, not every compound shape the existing generic renderer accepts. AC6 is not true for the full supported `rule_grant` contract without either constraining the data model or defining how a split-source compound is funded.
- **Confidence:** High in the code-path mismatch; medium in whether product intent requires split-source compounds to have capacity without also holding the source, because the older fixture explicitly distinguishes the roles but the live three compounds do not.

### [Pass 3a] AC5's byte-identical requirement is literally violated by `_grant_pools` reordering

- **Severity:** Medium
- **File:line:** `public/js/editor/mci.js:75-132`
- **Triggering input or sequence:** render a character who produces more than one of the old pool entries (for example MCI/OHM plus Invested, Lorekeeper, or Viral Mythology), or serialize/snapshot the full `_grant_pools` array.
- **Observable consequence:** the old call sequence emitted VM before OHM, then Invested, Lorekeeper, and Necropolis; the live cache order used by the new sweep emits Invested, Lorekeeper, VM, and Necropolis together before OHM. Individual pool objects and all current category-based consumers remain behaviorally equivalent, but the array bytes/order are different. Therefore the literal “byte-identical” AC is not satisfied even though no current UI defect results.
- **Confidence:** High.

### [Pass 3b] The completion claim “All 8 ACs satisfied” is false as written

- **Severity:** Medium
- **File:line:** `specs/stories/issue-1137-collective-pool-producer.story.md:45-64,235-249`
- **Triggering input or sequence:** audit the completion statement against the literal ACs and the author's own Declared deviations.
- **Observable consequence:** the record admits AC5 is not byte-identical and AC2's `0/3` UI result was inferred rather than observed; Pass 3a also found the supported split-source compound case for which AC6 fails. Calling all eight satisfied hides acceptance work that remains. The accurate state is that the current three live compound producer cases work, while the broader/literal acceptance contract needs qualification or patches.
- **Confidence:** High.

### [Pass 3b] The “live fixtures copied verbatim” assertion is false and conceals missing old-source coverage

- **Severity:** Medium
- **File:line:** `server/tests/issue-1137-pool-producer.test.js:16-18,93-106`
- **Triggering input or sequence:** compare `INVESTED_GRANT` and `LOREKEEPER_GRANT` with the configured live `rule_grant` documents or execute those fixtures through `_computeAmount`.
- **Observable consequence:** live data uses `partner_merit_names`; both fixtures use unsupported `partner_merits`. They would compute zero, and no test asserts either pool. Thus the file-level claim that the fixtures are verbatim (minus `_id`) is false, and the focused suite does not provide the old-source non-regression evidence its comments imply.
- **Confidence:** High; verified with the Pass 2 live rules query.

## Low

### [Pass 1] The ordering rationale comment overstates the evaluator's amount contract and contradicts the supplied fixtures

- **Severity:** Low
- **File:line:** `public/js/editor/mci.js:102-111` (post-change lines inferred from the supplied hunk); `public/js/editor/rule_engine/pool-evaluator.js:50-105`
- **Triggering input or sequence:** a maintainer relies on the new comment when moving evaluators or adding a pool rule whose amount basis is `vm_pool`, `flat`, or `rating_of_partner_merit` for Invictus Status.
- **Observable consequence:** the comment says pool amounts read purchased dots only and that no pool uses Invictus Status. The evaluator also supports `flat`; its VM basis intentionally includes `free_mci`; and it has a special Invictus Status path. The diff's own Invested fixture identifies Invictus Status as its partner merit. The current move may still be order-safe, but this stated proof is not generally valid and can mislead a future ordering change.
- **Confidence:** High that the comment is factually overbroad; Pass 2 must determine whether it masks a current behavioral defect.

### [Pass 1] Two of the eight new tests pass when pool production is a total no-op

- **Severity:** Low
- **File:line:** `server/tests/issue-1137-pool-producer.test.js:196-204,250-261` (new-file line numbers from the supplied diff)
- **Triggering input or sequence:** replace the pool producer with a function that produces no `_grant_pools` entries and run the new suite.
- **Observable consequence:** the “no compound” test and null-cache no-op test still pass. The former has no positive control in its own test, although five neighboring positive-production tests keep the suite as a whole from passing vacuously; the null-cache test is intentionally a negative/no-mutation case. The AC4 test does have a positive pool assertion, but its separate `allocated === 5` assertion is fixture arithmetic independent of the producer.
- **Confidence:** High.

### [Pass 2] The pool evaluator's public contract documentation still describes the removed per-source calling convention

- **Severity:** Low
- **File:line:** `public/js/editor/rule_engine/pool-evaluator.js:3,13-14`
- **Triggering input or sequence:** a maintainer reads the evaluator header/JSDoc to add or refactor a caller after this change.
- **Observable consequence:** it says the evaluator is “called once per source” and documents `getRulesBySource(sourceName)` input even though the sole production call now passes the whole `rule_grant` collection once. This conflicts with the new orchestrator contract and encourages reintroducing the hardcoded dispatch shape the story is fixing.
- **Confidence:** High.

### [Pass 3a] AC2 has no end-to-end regression assertion for the DARKTEMPLE counter or write cap

- **Severity:** Low
- **File:line:** `server/tests/issue-1137-pool-producer.test.js:166-249`; `server/tests/collective-2-compound-generalisation.test.js:319-348`; `public/js/editor/edit.js:1143-1145`; `public/js/editor/sheet.js:148-170`
- **Triggering input or sequence:** a later regression breaks the DARKTEMPLE-specific full chain after production (counter rendering or `shEditMeritPt` clamping) while `_grant_pools` is still produced correctly.
- **Observable consequence:** the issue suite remains green because it asserts only `_grant_pools`. The older Collective-2 suite verifies that DARKTEMPLE markup and handlers render from manually primed rule data, but it neither runs `applyDerivedMerits`, asserts the `0/3` counter, nor invokes the write handler to prove an input of 3 is accepted. The code trace supports the intended behavior, but AC2 lacks its own discriminating automated proof.
- **Confidence:** High.

### [Pass 3a] The Dev Notes' ordering proof falsely says no pool rule references Invictus Status

- **Severity:** Low
- **File:line:** `specs/stories/issue-1137-collective-pool-producer.story.md:133-147`; `public/js/editor/rule_engine/pool-evaluator.js:98-105`
- **Triggering input or sequence:** a reviewer or maintainer relies on the stated live-data audit to reason about moving the sweep relative to status evaluators.
- **Observable consequence:** the live Invested rule has `partner_merit_names: ['Invictus Status']`, and the evaluator has an explicit special case for it. Current behavior is still safe because Invested was already evaluated before OTS and the current OTS evaluator no longer changes status, but the spec's claimed proof is factually false and can justify an unsafe future reorder.
- **Confidence:** High; verified against the live `tm_suite.rule_grant` query in Pass 2.

### [Pass 3a] The AC7 Dev Note describes an unreachable empty-array call rather than the actual null-cache path

- **Severity:** Low
- **File:line:** `specs/stories/issue-1137-collective-pool-producer.story.md:149-157`; `public/js/editor/mci.js:56-59,114`
- **Triggering input or sequence:** `getRulesCache()` returns null during `applyDerivedMerits`.
- **Observable consequence:** the story says the optional chain feeds an empty array into `applyPoolRulesFromDb`, but the top-level #249 guard returns first, before any mutation or evaluator call. The acceptance behavior is correct; the prescribed reasoning is not, which obscures that `?.` is dead defensive code in production.
- **Confidence:** High.

### [Pass 3b] The AC2 deviation overstates how completely the two halves are covered

- **Severity:** Low
- **File:line:** `specs/stories/issue-1137-collective-pool-producer.story.md:246-248`; `server/tests/issue-1137-pool-producer.test.js:166-249`; `server/tests/collective-2-compound-generalisation.test.js:319-348`
- **Triggering input or sequence:** a DARKTEMPLE-specific integration regression occurs between `_grant_pools` production and counter/handler behavior.
- **Observable consequence:** the declaration says “between them the chain is covered,” but one suite tests production without rendering and the older suite renders DARKTEMPLE controls without first producing `_grant_pools`; only the Necropolis suite joins orchestrator to rendered counter. The Dark Temple path is strongly supported by shared generic code, but it is not end-to-end covered as the record suggests.
- **Confidence:** High.

### [Pass 3b] The named live-character capacity check is unverifiable in this review environment

- **Severity:** Low
- **File:line:** `specs/stories/issue-1137-collective-pool-producer.story.md:227-233,246-248`
- **Triggering input or sequence:** attempt to query the three named production character documents and reproduce capacity/availability in memory.
- **Observable consequence:** the environment rejected access to named character records on privacy grounds. I independently verified that the configured production collection currently contains 28 `rule_grant` documents and verified all pool rule shapes, but I could not accept or reject Anichka 3/3 or Yusuf/Xavier 5/0 from direct character evidence. Those figures remain **UNVERIFIABLE-AS-STATED**, not false.
- **Confidence:** High about the verification gap.

### [Pass 3b] The “Pool/compound family: 91 passed” number is not reproducible as stated

- **Severity:** Low
- **File:line:** `specs/stories/issue-1137-collective-pool-producer.story.md:227-232`
- **Triggering input or sequence:** attempt to repeat the claimed family gate from the record.
- **Observable consequence:** no command or seven-suite file list is supplied, and a scoped search found no separate log. The stronger named 22-suite gate was reproduced at 239/1, but the exact 91-test subset cannot be independently reconstructed without guessing which seven suites the author selected. The claim is **UNVERIFIABLE-AS-STATED**.
- **Confidence:** High.

## Validation notes

### Pass 1 access and commands

- Opened only `specs/stories/code-review/issue-1137-diff.txt` and `public/js/editor/rule_engine/pool-evaluator.js`. The evaluator was the one non-diff import target the Pass 1 hunt explicitly required to establish the predicate, per-rule push behavior, and amount bases. I did not read the issue story, Dev Agent Record, Change Log, or wider repository before freezing these findings.
- Ran `Get-Content -LiteralPath 'specs\\stories\\code-review\\issue-1137-diff.txt' -Raw` successfully.
- Ran `Get-Content -LiteralPath 'public\\js\\editor\\rule_engine\\pool-evaluator.js' -Raw` successfully.
- The positive source guard regex matches the new call spelling shown in the diff, and the negative regex correctly matches the removed `applyPoolRulesFromDb(c, getRulesBySource(...))` spelling. The positive assertion prevents the pair from succeeding solely because both regexes are misspelled.
- The `?.` fallback is dead defensive code in ordinary production execution on the evidence available in this pass: both the new comment and the null-cache test show that `applyDerivedMerits` returns before mutation when the cache is null. A stateful mock could make two successive `getRulesCache()` calls disagree; Pass 2 will inspect the actual guard and cache lifecycle.
- The `gate(name, dots)` fixture is internally consistent: `rating === dots`, `cp === 0`, and `xp === dots`. The purchased-dots fixture also has `cp 1 + xp 2 === rating 3`.
- The old per-source call would also double capacity for duplicate rules returned for that source. No positional `_grant_pools` consumer or comparison-suite integrity conclusion was claimed in Pass 1 because the fixed blind-pass boundary prohibited repository exploration; those checks are deferred to Pass 2.

### Pass 2 access and commands

- Opened repository code (but not the issue story): `public/js/editor/mci.js`, `public/js/editor/rule_engine/load-rules.js`, `pool-evaluator.js`, `mci-evaluator.js`, `ohm-evaluator.js`, `mdb-evaluator.js`, `ots-evaluator.js`, `public/js/data/rules-helpers.js`, `public/js/editor/edit.js`, relevant excerpts of `public/js/editor/sheet.js`, `domain.js`, `app.js`, `admin.js`, `public/js/tabs/downtime-form.js`, `public/js/admin/{city-views,downtime-views,spheres-view,rules-data-view}.js`, `server/routes/rules-engine.js`, `server/schemas/rules/rule-grant.schema.js`, `server/db.js`, `server/tests/helpers/db-setup.js`, `server/tests/pool-parallel-write.test.js`, `server/tests/vm-parallel-write.test.js`, `server/tests/n7-n9-allocator-readers.test.js`, and the targeted tracked seed scripts `server/scripts/seed-rules-{pool-grants,necropolis}.js` plus archived Invested/Lorekeeper, VM, MCI, OHM, OTS, PT, MDB and style-retainer seeds surfaced by `git grep`. I also searched all production callers/consumers under `public`, `server/lib`, and `server/routes`. I did not open `specs/stories/issue-1137-collective-pool-producer.story.md` or any account of the author's intent.
- `getRulesBySource(source)` filters the exact `_cache.rule_grant` array returned by `getRulesCache()`. `preloadRules()` builds the whole cache from one aggregate response and guards malformed/missing families as arrays; `invalidateRulesCache()` nulls the entire cache. No production code mutates the exposed `rule_grant` array, and no per-source preload exists. All player/admin/downtime callers run after the app/admin preload path or safely hit the pre-mutation null guard. The Rules Data save/delete race invalidates and awaits a complete re-preload before re-render.
- The null-cache guard at `mci.js:56` precedes `_grant_pools = []` and every other mutation. The second optional-chain read is therefore defensive only in production.
- Searched all production `_grant_pools` consumers. Every reader filters/reduces by `category` or matches target names, or loops only to derive an order-independent alert state; there is no `[0]`, first-match dependency, `shift`, or index arithmetic. Live `_id` order changes the four existing entries from old dispatch order `vm, inv, lk, necro` to `inv, lk, vm, necro`, but no current consumer changes behavior because of it.
- Traced the compound allocator: `applyPoolRulesFromDb` emits one `{category, amount}` entry; `poolAvailableFor` sums matching category capacity and subtracts `freeOf` across all merits; `shEditMeritPt` sets the cap to `available + current`. Thus an unallocated row gets max N, while an allocated row can retain/reallocate its own current value without double-counting it.
- Read all supported amount bases. Current live admitted rules are VM (`vm_pool`), Invested/Lorekeeper (`rating_of_partner_merit`), and three compounds (`rating_of_source`). VM stayed at its old relative location; Invested was already before OTS, and the current OTS evaluator does not mutate status at all; Lorekeeper and compound amounts read purchased dots only. MCI `choice`/`tier` pool rules are rejected by the generic predicate and remain handled before the sweep by `applyMCIRulesFromDb`. The present reorder is behavior-safe despite the overbroad comment proof recorded in Pass 1.
- Edge cases: a gate merit present with zero purchased `cp + xp` produces no entry; two instances of a `rating_of_source` gate are summed into one pool entry; a target merit without the gate produces no pool and its allocator is not ownership-enabled. A stale `rating` field does not control capacity: positive `cp + xp` produces capacity even if `rating` is 0, and free dots do not create compound membership/capacity.
- The two changed parallel-write mocks now represent production's single-cache invariant. They are not fully vacuous: removing the orchestrator dispatch still makes the direct evaluator snapshot differ, and the pool test verifies one whole-cache sweep is equivalent to two direct per-source calls. They do not independently exercise old executable code, but leaving `rule_grant: []` would encode a state the real loader cannot produce.
- Ran `rg --files -g 'AGENTS.md' -g '!specs/stories/issue-1137-collective-pool-producer.story.md'`; it returned exit 1/no files, so no repository-local agent instructions were present.
- Ran `git status --short` (output was extremely large because of the disclosed scratch tree) and `git status --short --untracked-files=no`. Before review-output creation, tracked changes matched the brief, including unrelated `server/scripts/_locations-local.json` and excluded `sprint-status.yaml`; I did not alter them.
- Ran scoped `rg`/`git grep` searches for `applyDerivedMerits`, `_grant_pools`, `poolAvailableFor`, cache APIs, aggregate routing, rule data mutations, pool seed fields, and all `applyPoolRulesFromDb` dispatches. The production result is exactly one call at `public/js/editor/mci.js:114` and zero per-source production dispatches.
- Required focused gate: from `server`, `npx vitest run tests/issue-1137-pool-producer.test.js` -> **1 file passed; 8 passed / 0 failed / 0 skipped**.
- Required regression gate, PowerShell equivalent of the brief's grep pipeline: `$files = @(rg -l 'applyDerivedMerits|_legacy-bridge|_grant_pools' tests | Where-Object { $_ -notmatch 'helpers[\\/]' }); npx vitest run @files`. First sandboxed run selected 22 suites but network access to MongoDB failed with `connect EACCES`; result was **126 passed / 1 failed / 113 skipped**, and the 12 DB-backed suite failures were not treated as passing. Re-ran with approved network access: **22 suites, 239 passed / 1 failed / 0 skipped**. The sole failure was `n7-n9-allocator-readers.test.js`'s known source-window assertion.
- Reconstructed base `d6f641d7` with `git archive` under `.tmp/issue-1137-base-d6f641d7`, linked only the existing `server/node_modules`, and ran `npx vitest run tests/n7-n9-allocator-readers.test.js` there: **24 passed / 1 failed**, the exact same source-window assertion. The regression-gate failure is therefore pre-existing at base.
- Ran two read-only queries against the configured `tm_suite.rule_grant`. Current live data has **11** `grant_type: 'pool'` documents: five MCI tiers (`choice`/`tier`, excluded from the sweep) and exactly six admitted `merit_present` rules (`Invested`, `Lorekeeper`, `Viral Mythology`, `Necropolis Sepulcher`, `Blood and Sacrifice`, `Prayer and Penance`). Grouping by source+tier+condition+slug found **zero exact dispatch-key duplicates**. No live admitted rule appears deliberately excluded; one would be wrongly activated only if its data falsely reused both `grant_type: pool` and `condition: merit_present` for a specialized/non-generic evaluator.

### Pass 3a access and commands

- Used a heading-only `rg` to locate story sections, then displayed only lines 8-17 (Story), 45-79 (Acceptance Criteria and What this story is NOT), and 101-220 (Dev Notes and its references) from `specs/stories/issue-1137-collective-pool-producer.story.md`. I did not display or read the Dev Agent Record or Change Log before freezing Pass 3a.
- Re-opened targeted excerpts of `server/tests/collective-2-compound-generalisation.test.js`, `server/tests/n7c-necro-orchestrator-pipeline.test.js`, `public/js/editor/sheet.js`, and `public/js/editor/xp.js`, and ran scoped `rg` searches for DARKTEMPLE, counter, cap, and handler assertions.
- AC1, AC3, AC4, AC7, and AC8 are behaviorally satisfied by the implementation and focused suite. AC6 works for the synthetic same-source/same-gate fixture and requires no further `mci.js` edit, subject to the split-source and authoring-path findings above. AC5 is behaviorally safe for current consumers but fails its literal byte-order wording. AC2's code chain is correct by inspection, but automated verification stops short of the stated counter/interaction behavior.
- The diff does not touch CSS, `pool-evaluator.js`, character data, `xp_log`, or MCI evaluator/data. The generic predicate excludes all five live MCI `choice`/`tier` rules. These “What this story is NOT” constraints are satisfied.

### Pass 3b access, claim audit, and result

- Opened the Dev Agent Record and Change Log at lines 221-end only after Pass 3a was frozen.
- Copied the current new issue test into the isolated base archive and ran `npx vitest run tests/issue-1137-pool-producer.test.js`: **5 failed / 3 passed**. Re-ran with `--reporter=verbose`: the passing tests were AC4 Necropolis, the no-compound negative case, and AC7 null-cache; the other five failed. This exactly validates the load-bearing RED discrimination claim, including AC4 passing before the fix.
- Current GREEN was independently reproduced in Pass 2 at **8 passed / 0 failed**. The full 22-suite gate was independently reproduced at **239 passed / 1 failed**, and the one failure was reproduced on base at **24 passed / 1 failed** for that file.
- The two committed mock changes are justified: production cannot have per-source grants without those grants in the same raw cache. The changed tests still detect removal of the orchestrator dispatch and compare one whole-cache call against separate evaluator calls; they do not mask a reachable production regression.
- `rg` confirms exactly one production `applyPoolRulesFromDb` invocation and zero per-source invocations. The positive/negative source guard passes in the 22-suite gate. All `_grant_pools` consumers were independently audited and none depends on array position.
- A read-only `countDocuments({})` query returned exactly **28** current production `rule_grant` documents. A proposed read-only query of Anichka, Yusuf, and Xavier was rejected by the environment because it would access named private production character records; it was not retried or worked around.
- The File List matches the story-related tracked/untracked change set disclosed by `git status`; it appropriately omits the unrelated map scratch change. No CSS, character data, evaluator file, or MCI data was changed.
- Claim classifications: RED 5/3 **TRUE**; AC4 passed in RED **TRUE**; GREEN 8 **TRUE**; 239/1 across 22 suites **TRUE**; sole failure pre-existing at base **TRUE**; inconsistent mocks impossible in production **TRUE**; no order-dependent consumer **TRUE**; one call/zero per-source dispatches **TRUE**; 28 rule grants **TRUE**; named live capacities **UNVERIFIABLE-AS-STATED**; 91-test seven-suite family result **UNVERIFIABLE-AS-STATED**; “all 8 ACs satisfied” **FALSE/OVERSTATED**; AC2 “between them the chain is covered” **OVERSTATED**; fixture data “copied verbatim” **FALSE**.
- **Acceptance result:** this change **needs patches or explicit AC/spec corrections**, not a blocking rollback. It fixes production for all three current live compound rule shapes and has no discovered order-dependent consumer, but the literal byte-order AC, split-source AC6 contract, Rules Data authoring path, and missing old-source/UI assertions remain unresolved.

### Final restoration and status

- Removed the temporary `node_modules` junction, then removed `.tmp/issue-1137-base-d6f641d7` after resolving and confirming that its absolute path was under `D:\Terra Mortis\TM Suite\.tmp`. `Test-Path` afterwards returned `False`.
- `git diff --check` over every story-related changed source/test/document plus this findings file returned clean.
- Final scoped `git status --short --untracked-files=all` shows the same story changes supplied for review plus this requested findings file. I did not modify any source, test, story, character data, CSS, database document, commit, or sibling workspace. The only persistent change made by this review is `specs/stories/code-review/issue-1137-codex-findings.md`; all temporary base files were removed.

### Complete shell command ledger

Commands below are listed in execution order within each pass. Commands grouped on one line were issued together as one PowerShell command; parallel batches did not alter their command text. Four `apply_patch` operations created/extended this findings file only and are not shell commands.

**Brief and Pass 1**

```powershell
Get-Content -LiteralPath 'D:\Terra Mortis\TM Suite\specs\stories\code-review\issue-1137-codex-review.md' -Raw
Get-Content -LiteralPath 'specs\stories\code-review\issue-1137-diff.txt' -Raw
Get-Content -LiteralPath 'public\js\editor\rule_engine\pool-evaluator.js' -Raw
```

**Pass 2 discovery and code reads**

```powershell
rg --files -g 'AGENTS.md' -g '!specs/stories/issue-1137-collective-pool-producer.story.md'
git status --short
rg -n --glob '!specs/stories/issue-1137-collective-pool-producer.story.md' --glob '!server/scripts/**' "applyDerivedMerits" public server specs
rg -n --glob '!specs/stories/issue-1137-collective-pool-producer.story.md' --glob '!server/scripts/**' "_grant_pools|poolAvailableFor" public server specs
rg -n --glob '!specs/stories/issue-1137-collective-pool-producer.story.md' --glob '!server/scripts/**' "getRulesCache|getRulesBySource|preloadRules|invalidateRulesCache|/api/rules/aggregate" public server
Get-Content -LiteralPath 'public\js\editor\rule_engine\load-rules.js' -Raw
Get-Content -LiteralPath 'public\js\editor\mci.js' -Raw
rg -n "applyDerivedMerits" public server/lib server/routes
rg -n "_grant_pools|poolAvailableFor" public server/lib server/routes
git status --short --untracked-files=no
$lines=Get-Content -LiteralPath 'public\js\app.js'; $lines[620..715]
$lines=Get-Content -LiteralPath 'public\js\admin.js'; $lines[500..620]; $lines[1260..1310]
$lines=Get-Content -LiteralPath 'public\js\admin\rules-data-view.js'; $lines[35..75]; $lines[410..530]; $lines[740..790]
$lines=Get-Content -LiteralPath 'public\js\data\rules-helpers.js'; $lines[205..260]; $e=Get-Content -LiteralPath 'public\js\editor\edit.js'; $e[1110..1170]
Get-Content -LiteralPath 'server\tests\pool-parallel-write.test.js' -Raw; Get-Content -LiteralPath 'server\tests\vm-parallel-write.test.js' -Raw
rg -l "router.*aggregate|rule_grant|categories" server/routes | rg "rules|aggregate"
$lines=Get-Content -LiteralPath 'public\js\data\rules-helpers.js'; $lines[220..252]
$lines=Get-Content -LiteralPath 'public\js\editor\edit.js'; $lines[1120..1160]
Get-Content -LiteralPath 'server\routes\rules-engine.js' -Raw
$d=Get-Content -LiteralPath 'public\js\tabs\downtime-form.js'; $d[1375..1425]; $v=Get-Content -LiteralPath 'public\js\admin\downtime-views.js'; $v[620..650]; $c=Get-Content -LiteralPath 'public\js\admin\city-views.js'; $c[30..60]; $s=Get-Content -LiteralPath 'public\js\admin\spheres-view.js'; $s[20..45]
$s=Get-Content -LiteralPath 'public\js\editor\sheet.js'; $s[110..165]; $s[970..1000]; $s[1105..1150]; $s[1530..1565]; $s[2050..2090]
$a=Get-Content -LiteralPath 'public\js\admin.js'; $a[550..575]; $m=Get-Content -LiteralPath 'public\js\editor\mci.js'; $m[245..318]; $d=Get-Content -LiteralPath 'public\js\editor\domain.js'; $d[600..625]
```

**Pass 2 gates and base verification**

```powershell
npx vitest run tests/issue-1137-pool-producer.test.js
$files = @(rg -l 'applyDerivedMerits|_legacy-bridge|_grant_pools' tests | Where-Object { $_ -notmatch 'helpers[\\/]' }); "Selected suites: $($files.Count)"; $files; npx vitest run @files
Get-Content -LiteralPath 'server\tests\n7-n9-allocator-readers.test.js' -TotalCount 290
$p='D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7'; [pscustomobject]@{ Exists = Test-Path -LiteralPath $p; ResolvedParent = [IO.Path]::GetFullPath((Split-Path -Parent $p)) }
New-Item -ItemType Directory -Path 'D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7' -Force
git archive --format=zip --output='D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7\base.zip' d6f641d7
Expand-Archive -LiteralPath 'D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7\base.zip' -DestinationPath 'D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7\repo'
New-Item -ItemType Junction -Path 'D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7\repo\server\node_modules' -Target 'D:\Terra Mortis\TM Suite\server\node_modules'
npx vitest run tests/n7-n9-allocator-readers.test.js
```

The 22-suite command was run twice with identical text: first sandboxed (MongoDB `EACCES` and skips), then with approved network access (239/1, no skips).

**Pass 2 targeted data/code audit**

```powershell
git grep -n -E "grant_type.{0,20}pool|condition.{0,20}(merit_present|choice|tier)|amount_basis" -- server/scripts public server/tests | Select-Object -First 300
rg -n "rule_grant\s*=|rule_grant\.(push|splice|sort)|getRulesCache\(\).*rule_grant" public server/lib server/routes
Get-Content -LiteralPath 'public\js\editor\rule_engine\mci-evaluator.js' -Raw; Get-Content -LiteralPath 'public\js\editor\rule_engine\ots-evaluator.js' -Raw; Get-Content -LiteralPath 'public\js\editor\rule_engine\ohm-evaluator.js' -Raw; Get-Content -LiteralPath 'public\js\editor\rule_engine\mdb-evaluator.js' -Raw
rg -n "applyPoolRulesFromDb" public/js server/tests --glob '!server/tests/issue-1137-pool-producer.test.js'
Get-Content -LiteralPath 'server\scripts\seed-rules-pool-grants.js' -Raw; Get-Content -LiteralPath 'server\scripts\archive\seed-rules-invested-lorekeeper.js' -Raw; Get-Content -LiteralPath 'server\scripts\archive\seed-rules-vm.js' -Raw
git grep -n -E "Blood and Sacrifice|Prayer and Penance|darktemple|blackcathedral" -- server/scripts public server/tests specs/architecture
Get-Content -LiteralPath 'server\schemas\rules\rule-grant.schema.js' -Raw; $h=Get-Content -LiteralPath 'public\js\data\rules-helpers.js'; $h[270..335]
$r=Get-Content -LiteralPath 'public\js\admin\rules-data-view.js'; $r[285..340]; $r[540..675]; rg -n "condition" server/tests/api-rules-engine.test.js
rg -n "const conditions|condition:.*enum|source_slug|sharing_scope|partner_shareable" public/js/admin/rules-data-view.js server/schemas/rules/rule-grant.schema.js; rg -n "applyPoolRulesFromDb|if \(!getRulesCache|c\._grant_pools = \[\]" public/js/editor/mci.js; rg -n "filter\(p => p && p\.category|const current =|const avail =" public/js/data/rules-helpers.js public/js/editor/edit.js
```

The two approved read-only rules queries were the following; neither wrote data:

```powershell
node --input-type=module -e "import { connectDb, closeDb, getCollection } from './db.js'; await connectDb(); const docs = await getCollection('rule_grant').find({ grant_type: 'pool' }).sort({ _id: 1 }).project({ _id: 0, source: 1, source_slug: 1, category: 1, condition: 1, amount_basis: 1, partner_merit_names: 1, pool_targets: 1 }).toArray(); const groups = Object.values(docs.reduce((a,d) => { const k=[d.source,d.source_slug||d.category,d.condition].join('|'); a[k] ||= { key:k, count:0 }; a[k].count++; return a; }, {})).filter(g => g.count > 1); console.log(JSON.stringify({ poolRuleCount: docs.length, docs, duplicateSourceSlugConditionGroups: groups }, null, 2)); await closeDb();"
node --input-type=module -e "import { connectDb, closeDb, getCollection } from './db.js'; await connectDb(); const docs = await getCollection('rule_grant').find({ grant_type: 'pool' }).project({ _id: 0, source: 1, tier: 1, condition: 1, source_slug: 1, category: 1 }).toArray(); const keys=docs.map(d=>[d.source,d.tier??'',d.condition,d.source_slug||d.category||''].join('|')); const dup=[...new Set(keys)].map(key=>({key,count:keys.filter(k=>k===key).length})).filter(x=>x.count>1); console.log(JSON.stringify({keys, exactDispatchKeyDuplicates:dup},null,2)); await closeDb();"
```

**Pass 3a**

```powershell
rg -n "^#{1,4} " 'specs\stories\issue-1137-collective-pool-producer.story.md'
Get-Content -LiteralPath 'specs\stories\issue-1137-collective-pool-producer.story.md' -TotalCount 17 | Select-Object -Skip 7; Get-Content -LiteralPath 'specs\stories\issue-1137-collective-pool-producer.story.md' -TotalCount 79 | Select-Object -Skip 44; Get-Content -LiteralPath 'specs\stories\issue-1137-collective-pool-producer.story.md' -TotalCount 220 | Select-Object -Skip 100
$c=Get-Content -LiteralPath 'server\tests\collective-2-compound-generalisation.test.js'; $c[60..175]; $c[285..420]; $c[500..575]; rg -n "darktemple|0/3|pool counter|shEditMeritPt|poolAvailableFor" server/tests/issue-1137-pool-producer.test.js server/tests/collective-2-compound-generalisation.test.js server/tests/n7-n9-allocator-readers.test.js server/tests/n7c-necro-orchestrator-pipeline.test.js
$c=Get-Content -LiteralPath 'server\tests\collective-2-compound-generalisation.test.js'; $c[165..235]; $n=Get-Content -LiteralPath 'server\tests\n7c-necro-orchestrator-pipeline.test.js'; $n[140..240]
$s=Get-Content -LiteralPath 'public\js\editor\sheet.js'; $s[145..185]; $x=Get-Content -LiteralPath 'public\js\editor\xp.js'; rg -n "compoundPools|poolAvailableFor|max=|type=.?number" public/js/editor/xp.js
```

**Pass 3b and cleanup**

```powershell
Get-Content -LiteralPath 'specs\stories\issue-1137-collective-pool-producer.story.md' | Select-Object -Skip 220
Copy-Item -LiteralPath 'D:\Terra Mortis\TM Suite\server\tests\issue-1137-pool-producer.test.js' -Destination 'D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7\repo\server\tests\issue-1137-pool-producer.test.js'
npx vitest run tests/issue-1137-pool-producer.test.js
npx vitest run tests/issue-1137-pool-producer.test.js --reporter=verbose
node --input-type=module -e "import { connectDb, closeDb, getCollection } from './db.js'; await connectDb(); console.log(JSON.stringify({ruleGrantCount:await getCollection('rule_grant').countDocuments({})})); await closeDb();"
rg -n "91 passed|Pool/compound family|issue-1137-pool-producer\.test\.js" specs server/tests --glob '!specs/stories/issue-1137-collective-pool-producer.story.md' --glob '!specs/stories/code-review/issue-1137-codex-findings.md'
$root='D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7'; $item=Get-Item -LiteralPath $root; $link=Get-Item -LiteralPath (Join-Path $root 'repo\server\node_modules'); [pscustomobject]@{Root=$item.FullName; RootUnderWorkspace=$item.FullName.StartsWith('D:\Terra Mortis\TM Suite\.tmp\'); Link=$link.FullName; LinkTarget=$link.Target}
Remove-Item -LiteralPath 'D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7\repo\server\node_modules' -Force
Remove-Item -LiteralPath 'D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7' -Recurse -Force
Test-Path -LiteralPath 'D:\Terra Mortis\TM Suite\.tmp\issue-1137-base-d6f641d7'
git diff --check -- public/js/editor/mci.js server/tests/n7c-necro-orchestrator-pipeline.test.js server/tests/pool-parallel-write.test.js server/tests/vm-parallel-write.test.js specs/stories/mnec.collective-2.generalise-compound-rendering.story.md specs/stories/code-review/issue-1137-codex-findings.md
git status --short --untracked-files=all -- public/js/editor/mci.js server/tests/n7c-necro-orchestrator-pipeline.test.js server/tests/pool-parallel-write.test.js server/tests/vm-parallel-write.test.js server/tests/issue-1137-pool-producer.test.js specs/stories/mnec.collective-2.generalise-compound-rendering.story.md specs/stories/issue-1137-collective-pool-producer.story.md specs/stories/code-review/issue-1137-codex-findings.md .tmp
rg -n "^## |^### \[Pass|Acceptance result|Required focused gate|Required regression gate" specs/stories/code-review/issue-1137-codex-findings.md; (Get-Content -LiteralPath 'specs\stories\code-review\issue-1137-codex-findings.md').Count
```

One additional Node command attempted a read-only calculation over the three named production character records; the environment rejected it before execution on privacy/risk grounds. It made no query and no output. Per the rejection instruction, it was not retried or worked around:

```powershell
node --input-type=module -e "import { connectDb, closeDb, getCollection } from './db.js'; import { applyPoolRulesFromDb } from '../public/js/editor/rule_engine/pool-evaluator.js'; import { poolAvailableFor, freeOf } from '../public/js/data/rules-helpers.js'; await connectDb(); const wanted=['Anichka','Yusuf Kalusicj','Xavier Boussade']; const chars=await getCollection('characters').find({ $or:[{name:{ $in:wanted }},{moniker:{ $in:wanted }}] }).toArray(); const grants=await getCollection('rule_grant').find({}).toArray(); const rows=chars.map(raw=>{ const c=structuredClone(raw); c._grant_pools=[]; applyPoolRulesFromDb(c,{grants}); const isAn=(c.name==='Anichka'||c.moniker==='Anichka'); const slug=isAn?'darktemple':'necro'; const gate=isAn?'Blood and Sacrifice':'Necropolis Sepulcher'; const capacity=(c._grant_pools||[]).filter(p=>p.category===slug).reduce((s,p)=>s+(p.amount||0),0); const allocated=(c.merits||[]).reduce((s,m)=>s+freeOf(m,slug),0); return {name:c.name,moniker:c.moniker,gatePurchased:(c.merits||[]).filter(m=>m.name===gate).reduce((s,m)=>s+(m.cp||0)+(m.xp||0),0),slug,capacity,allocated,available:poolAvailableFor(c,slug)}; }); console.log(JSON.stringify(rows,null,2)); await closeDb();"
```

The final post-ledger validation command was:

```powershell
git diff --check -- specs/stories/code-review/issue-1137-codex-findings.md; git status --short --untracked-files=all -- specs/stories/code-review/issue-1137-codex-findings.md .tmp
```
