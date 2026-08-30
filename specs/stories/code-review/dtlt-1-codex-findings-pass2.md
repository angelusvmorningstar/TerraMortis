# dtlt-1 — Pass 2 Edge Case Hunter findings

## High

### [Pass 2] Normal players cannot load the rule collection, so all of their bonus-success rolls silently remain rolled-only

- **Severity:** High
- **File:line:** `server/index.js:192`; `public/js/app.js:760`; `public/js/shared/dice.js:57`
- **The triggering input or sequence:** A user with the normal `player` role opens the main app. `loadAllData()` calls `preloadRules()`, which requests `/api/rules/aggregate?...bonus_success`; production mounts that aggregate endpoint behind `RE_ST`. I reproduced the request with `playerUser(...)` and received `403 FORBIDDEN`. Because the rejected request never assigns `_cache`, a later successful Strength roll by a character with `{ manoeuvre: 'Stronger Than You' }` reaches `_bonusRules()` with `getRulesCache() === null`, which becomes `[]`. A direct cold-cache reproduction returned `{ rolled: 4, bonus: [], total: 4 }`.
- **The observable consequence:** The new mechanic does not operate for ordinary players in either of the player-facing roll surfaces. Their Roll-tab and Feeding-tab results, history, persisted success counts, exceptional-success threshold, vessels, and safe Vitae all use the rolled-only number. ST/dev users can see the bonus, so ST testing can misleadingly look correct while the players for whom the surfaces exist never receive it.
- **Confidence:** High — the 403 and cold-cache result were both reproduced without Mongo, and `app.js` explicitly documents that player requests to this endpoint receive 403.

## Medium

### [Pass 2] ST-confirmed Feeding pools test the player's old declared method instead of the confirmed attribute and skill

- **Severity:** Medium
- **File:line:** `public/js/tabs/feeding-tab.js:254`; `public/js/tabs/feeding-tab.js:261`; `public/js/tabs/feeding-tab.js:1081`
- **The triggering input or sequence:** A player declares `force` (whose preset is Strength + best of Brawl/Weaponry), then an ST confirms a different pool such as `Dexterity 3 + Athletics 3 = 6`. The confirmed branches copy only the size/again/rote data into local state. At roll time, `doFeedingRoll()` ignores `feeding_review.pool_validated` and calls `bestTraitsFor(currentChar, declaredMethod)`, producing `attr: 'Strength'` from the stale declaration. The inverse also fails: a declared Seduction pool later confirmed by the ST as Strength + Brawl is still evaluated as Presence/Manipulation.
- **The observable consequence:** With a warm rule cache, a successful non-Strength confirmed roll can wrongly receive Stronger Than You, or a confirmed Strength roll can miss it. The resulting success count also changes Feeding's vessels and `safeVitae`. This is reachable because the ST Feeding pool builder permits independently selecting any attribute and skill and persists those names in `pool_validated`.
- **Confidence:** High — the two confirmed-pool branches and the independent ST pool builder were traced directly. The current player-cache bug masks this for normal players, but ST/dev/dual-role use and any correction of the High finding expose it immediately.

### [Pass 2] Rating-based rules undercount repeatable merits by reading the first same-name entry, not the entry that satisfied the predicate

- **Severity:** Medium
- **File:line:** `public/js/editor/rule_engine/bonus-success-evaluator.js:104`; `public/js/editor/rule_engine/bonus-success-evaluator.js:135`
- **The triggering input or sequence:** Store the valid rule `{ predicate: { kind: 'merit_present', name: 'Allies', min_rating: 3 }, count_basis: 'rating' }`. Roll with a character whose merits are ordered as `Allies (Street), rating 1` followed by `Allies (Politics), rating 3`. `_matches()` succeeds because `.some()` finds the rating-3 entry, but `_count()` starts a separate `.find()` and returns the first rating-1 entry.
- **The observable consequence:** The reproduced result was `{ rolled: 1, bonus: [{ count: 1 }], total: 2 }` instead of a rating-3 bonus and total 4. The character schema permits an array of merit objects without a same-name uniqueness constraint, and qualified merits such as Allies are naturally repeatable, so this is a valid character/rule combination rather than malformed input.
- **Confidence:** High — reproduced by importing the real evaluator. The v1 seed is flat/manoeuvre-based, so this affects valid future `count_basis: 'rating'` rules rather than Stronger Than You itself.

### [Pass 2] Rule sources flow unescaped into Roll-tab `innerHTML`, creating stored markup/script injection

- **Severity:** Medium
- **File:line:** `public/js/editor/rule_engine/bonus-success-evaluator.js:86`; `public/js/suite/roll-v2.js:1041`; `public/js/suite/roll-v2.js:1166`; `public/js/suite/roll-v2.js:1284`
- **The triggering input or sequence:** Insert an otherwise valid matching rule whose `source` is `<img src=x onerror=alert(1)>`, then make a successful matching roll. The schema accepts arbitrary non-empty source strings. `formatSuccessBreakdown()` interpolates the source verbatim; I reproduced the resulting string `1 rolled + 1 (<img src=x onerror=alert(1)>) = 2 successes`. `doRoll()` appends that string to `chanceVerd`/`verd` and assigns it to `hdr.innerHTML`; `renderHist()` later repeats the same unescaped value through `l.innerHTML`.
- **The observable consequence:** Opening the matching result executes attacker-controlled HTML/JavaScript in the Suite origin, and the local history rerender supplies a second sink. Today rule writes require ST access, limiting the author population, but one ST-authored/imported/compromised rule can execute for other ST/dev users and would execute for every player once the High cache-auth defect is corrected. Feeding's corresponding rendering correctly uses `esc()`, so it is not affected.
- **Confidence:** High — the exact payload propagation and unescaped sinks were verified in the current source; browser execution was not needed to establish standard `innerHTML` behavior.

## Low

### [Pass 2] Whitespace-only predicate names match the live empty-string context of contextless rolls

- **Severity:** Low
- **File:line:** `server/schemas/rules/rule-bonus-success.schema.js:40`; `public/js/editor/rule_engine/bonus-success-evaluator.js:158`; `public/js/suite/roll-v2.js:993`
- **The triggering input or sequence:** Create `{ predicate: { kind: 'roll_attr', name: '   ' }, count_basis: 'flat', flat_amount: 1 }`, which AJV and `checkBonusSuccessDoc()` both accept because `minLength: 1` does not reject whitespace. Make a successful contextless chance roll; Roll v2 normalises the absent attribute to `''`. `_sameName('', '   ')` trims both to `''` and returns true. The real evaluator reproduced total 2 from one rolled success. An actually absent/`undefined` context does not match; the false positive is specifically caused by the live call site's empty-string normalisation.
- **The observable consequence:** A misconfigured but API-valid rule can add successes to raw/contextless rolls and any other roll surface supplying `attr: ''` or `skill: ''`, even though no trait was declared.
- **Confidence:** High — both schema acceptance and evaluator firing were reproduced.

### [Pass 2] A route-bypassing flat rule with no amount silently grants +1 instead of failing closed

- **Severity:** Low
- **File:line:** `public/js/editor/rule_engine/bonus-success-evaluator.js:128`; `server/routes/rules-engine.js:156`
- **The triggering input or sequence:** A malformed Mongo document reaches the aggregate read path with `count_basis: 'flat'` but no `flat_amount` (for example, a direct DB insert/import or legacy/corrupt document bypassing POST/PUT). Aggregate reads do not validate stored documents. `_count()` evaluates `rule.flat_amount ?? 1`, so the missing value becomes 1; the real evaluator reproduced a +1 bonus. By contrast, API POST/PUT correctly rejects missing amounts in `checkBonusSuccessDoc()`, and schema validation rejects zero and negative values.
- **The observable consequence:** Corrupt stored data grants a positive success rather than being skipped, contradicting the evaluator's defensive “malformed docs are skipped” posture. Zero and negative values that somehow bypass the schema become 0 through `_int()` and are skipped; no malformed negative amount reduces rolled successes.
- **Confidence:** High about runtime behavior; Low operational likelihood because the normal write route prevents this shape.

### [Pass 2] Fighting-style test fixtures contain a field the real character schema rejects and the evaluator never reads

- **Severity:** Low
- **File:line:** `server/tests/bonus-success.test.js:41`; `server/schemas/character.schema.js:770`
- **The triggering input or sequence:** The new fixtures use `fighting_styles: [{ ..., cp: 4, rating: 4 }]`. The real `fightingStyle` schema has `additionalProperties: false` and defines `cp`, `xp`, and free-dot channels, but not `rating`, so persisting that fixture shape would fail character validation. The evaluator's manoeuvre predicate reads only `fighting_picks`; it never reads `fighting_styles` or this `rating` value.
- **The observable consequence:** This is a fixture-realism gap, not a current functional bug: the tests pass partly because an impossible field is irrelevant. It can nevertheless mislead future maintainers into thinking fighting-style rating is persisted/canonical or that the test proves style-dot handling through a realistic document.
- **Confidence:** High — schema and evaluator access paths were cross-checked directly.

## Validation notes

### Requested branch traces

- **Seed doc with a novel pool:** I verified `Strength + Medicine` does not occur anywhere in the supplied diff, then ran the actual seed doc with 3 rolled successes and an explicit Stronger Than You pick. `combineSuccesses()` clamps 3 to 3 and injects it as `rolledSuccesses`; `resolveBonusSuccesses()` passes its character/rules/failed-roll guards; the primary `manoeuvre_present` predicate finds the pick by case-insensitive trimmed name; the sole `also_requires` `roll_attr` predicate matches Strength while ignoring Medicine; `_count()` takes the flat branch and returns 1; the fold returns `{ rolled: 3, bonus: [{ source: 'Stronger Than You', count: 1 }], total: 4 }`.
- **Route ordering:** Production registers all individual `/api/rules/<family>` mounts, including `/bonus_success`, then `/api/rules/aggregate`, then the existing `/api/rules` wildcard router. No new mount shadows or is shadowed by an existing pattern.
- **Cache shapes:** `_bonusRules()` is `getRulesCache()?.rule_bonus_success || []`. A getter result of `undefined`/`null`, `{}`, or a populated pre-feature object missing `rule_bonus_success` therefore produces `[]` without throwing. A real new cache produced by `preloadRules()` always normalises the field to an array.
- **Malformed picks:** Arrays containing `undefined`, `null`, `{}`, or `{ manoeuvre: 123 }` all reproduced no match and no exception. Optional access plus `_sameName()`'s string-type guard prevents false positives.
- **Primary rating vs extra requirements:** A rating rule with primary merit rating 2 and a second `also_requires` merit rating 5 reproduced a count of 2. The schema/post-check allows the second merit predicate but explicitly requires the *primary* predicate to be `merit_present`, so the document is not ambiguous about which rating is counted. The repeatable-same-name defect is reported separately above.
- **Feeding helper mutation:** `bestTraitsFor()` allocates a new result object and only reads `method.attrs`/`method.skills` and character accessors. `getAttrEffective()`, `discAttrBonus()`, and `skTotal()` are read-only. `buildPool()` mutates only Feeding module outputs (`poolTotal`, `poolBreakdown`) after the helper returns; neither helper call mutates the character, method, or shared cache, so the second call does not depend on the first.
- **Empty context:** Valid non-blank predicate names do not match absent/empty trait names. The only reproduced false positive is the API-valid whitespace-only name reported above.
- **Amounts:** Normal API writes reject missing, zero, and negative flat amounts. Directly evaluated zero/negative values produce no bonus and never subtract successes. Only a missing amount that bypasses the route defaults to +1, as reported above.

### Files inspected beyond the supplied diff

I inspected relevant ranges or complete contents of: `public/js/app.js`, `public/js/data/accessors.js`, `public/js/editor/rule_engine/load-rules.js`, `public/js/editor/rule_engine/bonus-success-evaluator.js`, `public/js/shared/dice.js`, `public/js/suite/roll-v2.js`, `public/js/tabs/downtime-data.js`, `public/js/tabs/feeding-tab.js`, `public/js/admin/downtime-views.js`, `public/js/admin/rules-data-view.js`, `public/js/downtime/roller.js`, `server/db.js`, `server/index.js`, `server/middleware/auth.js`, `server/routes/rules-engine.js`, `server/schemas/character.schema.js`, `server/schemas/rules/rule-bonus-success.schema.js`, `server/scripts/seed-rules-bonus-successes.js`, `server/tests/api-rules-aggregate.test.js`, `server/tests/helpers/db-setup.js`, `server/tests/helpers/test-app.js`, and `server/tests/bonus-success.test.js`. Broad `rg` searches also returned matching snippets from `public/js/dev-fixtures.js` and other fighting-style consumers; no sibling repository was searched.

I did **not** open or read `specs/stories/dtlt.1.bonus-success-mechanic.story.md`. Its name appeared only in `git status`. I also did not open either other pass's review/findings files.

### Commands run and observed results

1. `git status --short; rg --files -g 'AGENTS.md' -g '!specs/stories/**'; Get-ChildItem specs/stories/code-review` — captured the dirty baseline, found no in-scope `AGENTS.md`, and listed review artifacts.
2. `Get-Content specs/stories/code-review/dtlt-1-diff.txt` — opened the supplied diff; terminal output was truncated, so commands 25–28 below reread it completely in bounded chunks.
3. Numbered `Get-Content` over the evaluator, bonus schema, seed, rules route, server entrypoint, rules cache, and shared dice files — inspected implementations and current line numbers.
4. `rg` searches for `fighting_styles`, `fighting_picks`, manoeuvres, route exports/mounts, aggregate categories, and `bestTraitsFor` call sites — located the real character schema, all production/test route mounts, and both Feeding helper paths.
5. `rg --files server public | rg "schema|character"` plus exact fighting-definition searches — identified `server/schemas/character.schema.js` as the real schema.
6. Numbered `Get-Content` ranges for `character.schema.js`, `rules-engine.js`, `server/index.js`, `feeding-tab.js`, and `roll-v2.js` — verified schema shape, route order, and live call chains.
7. `rg -n 'fightingStyle' server/schemas/character.schema.js` plus accessor/method searches — found the definition at line 770; this composite inspection command exited 1 only because its final optional search had no match.
8. Numbered ranges for the fighting-style definition, Feeding imports, and `FEED_METHODS` — confirmed `rating` is not a fighting-style field and that `force` is the Strength preset.
9. `rg` plus numbered reads of `public/js/data/accessors.js` and Feeding call contexts — confirmed the helper's accessors and both invocations are read-only with respect to inputs.
10. Numbered read of `accessors.js:171-220` — verified `skTotal()` only reads skill fields and Sets.
11. `rg` for `preloadRules`, `getRulesCache`, invalidation, and rules-admin family support — located the main app preload and confirmed the cache is the dice path's sole rule source.
12. Numbered reads of `app.js`, `server/middleware/auth.js`, `api-rules-aggregate.test.js`, and `test-app.js` — verified player 403 semantics and the app's rejected-preload behavior.
13. `rg` for Feeding `params`, `pool_validated`, writers, and player tab references — traced confirmed-pool storage and discovered the large matching fixture snippet; command completed successfully.
14. Numbered reads of the admin pool parser/builder and `public/js/downtime/roller.js` — confirmed ST-selected attribute/skill names live in `pool_validated`, while roll `params` retains only numeric/mode data.
15. `rg` and numbered reads around `addHist`, Roll-tab HTML sinks, and rules-data escaping — located the unescaped result/history paths.
16. Numbered read of `roll-v2.js:1260-1300` — confirmed `renderHist()` writes `verd` through `innerHTML`.
17. `node --input-type=module -` with the real evaluator/seed (stdin matrix: seed path, four malformed picks, primary-vs-extra rating, duplicate merits, whitespace context, and missing/zero/negative flat amounts) — reproduced all results quoted in this report.
18. From `server`, `node --input-type=module -` with AJV and `checkBonusSuccessDoc()` (stdin matrix) — whitespace and two-merit rating docs were accepted; missing flat amount passed JSON Schema but failed post-check; zero/negative failed Schema.
19. From `server`, `npx vitest run bonus-success rule_engine_grep rule_engine_effective_contract api-rules-engine api-rules-aggregate` — **required gate result: 5 files total; 3 passed, 2 failed; 124 tests total; 53 passed, 71 skipped; exit 1**. Both DB-backed files failed in setup with `MongoServerSelectionError: connect EACCES 159.143.141.178:27017`; `api-rules-engine` also emitted a cleanup `TypeError` after failed setup. These are the exact current gate numbers.
20. From `server`, `npx vitest run bonus-success rule_engine_grep rule_engine_effective_contract` — 3 files passed, **53/53 tests passed**, exit 0.
21. `Get-NetTCPConnection -State Listen -LocalPort 27017` plus numbered reads of `tests/helpers/db-setup.js` and `db.js` — found no local Mongo listener and confirmed the connector attempted the configured remote endpoint.
22. From `server`, `node --input-type=module -` using Supertest against `createTestApp()` (stdin player aggregate request) — reproduced status 403 with `{ error: 'FORBIDDEN', message: 'Insufficient role' }` without Mongo.
23. From repo root, `node --input-type=module -` importing `addBonusSuccesses()` and `getRulesCache()` (stdin cold-cache reproduction) — returned cache `null` and `{ rolled: 4, bonus: [], total: 4 }` for an otherwise qualifying character/roll.
24. From repo root, `node --input-type=module -` with a matching `<img ... onerror=...>` source (stdin reproduction) — formatter returned the payload verbatim in the breakdown.
25. `rg -n '^diff --git' dtlt-1-diff.txt; Get-Content ... | Select-Object -First 400` — enumerated all 14 changed files and read diff lines 1–400.
26. `Get-Content ... | Select-Object -Skip 400 -First 400` — read diff lines 401–800.
27. `Get-Content ... | Select-Object -Skip 800 -First 400` — read diff lines 801–1200.
28. `Get-Content ... | Select-Object -Skip 1200 -First 400` — read the remainder through line 1438.
29. `rg -n 'Medicine|Strength.*Medicine' dtlt-1-diff.txt` plus an inline Node run of the real seed at Strength + Medicine — confirmed the combination is absent from the diff and reproduced `{ rolled: 3, bonus: [{ source: 'Stronger Than You', count: 1 }], total: 4 }`.
30. `Test-Path specs/stories/code-review/dtlt-1-codex-findings-pass2.md; git status --short` — confirmed the requested output did not already exist and recaptured status before writing. It also showed concurrent changes not present in the initial baseline (including `server/db.js` and other pass outputs); I did not create, read, revert, or otherwise touch those files.
31. `Get-Content specs/stories/code-review/dtlt-1-codex-findings-pass2.md; git status --short -- specs/stories/code-review/dtlt-1-codex-findings-pass2.md; git diff --check` — post-write verification; the report was readable, status showed only this requested report as my new file, and whitespace checking reported no errors.

### Unrun or unavailable validation

- The assertions in `api-rules-engine.test.js` and `api-rules-aggregate.test.js` could not run because there was no local `mongod` listener and sandbox network policy denied the configured Mongo endpoint. This is disclosed as a failed gate, not presented as passing or as a product finding.
- I did not run a full `npm test` or Playwright suite; the prompt directs use of the targeted gate, and no browser-only claim depended on Playwright.

### Worktree integrity

I made no source, test, seed, schema, configuration, or temporary-file edits. The only file I created is this requested report. No temporary edit/restore cycle was used. The worktree was dirty before review; other isolated sessions changed additional files concurrently during this pass, so I preserved all of them. Final targeted status shows this report as untracked, with no unintended file attributable to this pass.
