# dtlt-1 adversarial review — Pass 1 (Blind Hunter)

## High

### [Pass 1] Player rolls cannot load the bonus-success rules

- **Severity**: High
- **File:line**: `public/js/editor/rule_engine/load-rules.js:36`, `public/js/shared/dice.js:56`, `server/index.js:192`
- **The triggering input or sequence**: A normal player session opens the live Roll tab and rolls a character that has picked Stronger Than You. The only function that can populate the module-private cache is `preloadRules()`, and it fetches `rule_bonus_success` through `/api/rules/aggregate`; that endpoint is mounted behind `RE_ST`. The diff's own aggregate API test also explicitly expects a player to receive 403.
- **The observable consequence**: The player cannot populate `rule_bonus_success`. `getRulesCache()` therefore remains null (or the preload rejects), `_bonusRules()` falls back to `[]`, and every player roll reports rolled-only successes. The new mechanic works only in an ST-authorized client despite being wired into the shared player/ST roller.
- **Confidence**: High. The cache is module-private, has no alternative setter in the changed module, and the producer/consumer/auth path is explicit in the diff.

## Medium

### [Pass 1] Rule sources are inserted into `innerHTML` without escaping

- **Severity**: Medium
- **File:line**: `public/js/editor/rule_engine/bonus-success-evaluator.js:86`, `public/js/suite/roll-v2.js:1041`
- **The triggering input or sequence**: An ST creates a schema-valid matching rule whose `source` is `<img src=x onerror="globalThis.pwned=1">`, then an ST-authorized client rolls a success that fires it. `formatSuccessBreakdown()` copies the source verbatim into `chanceVerd`, `verd`, or `contestVerd`; all three are assigned through `hdr.innerHTML` (`roll-v2.js:1041`, `1116`, and `1166`).
- **The observable consequence**: Stored rule markup is parsed as DOM and event-handler JavaScript can execute in the roller user's session. Feeding does not have this defect because its new call site applies `esc(successBreakdown)` before interpolation.
- **Confidence**: High. A direct probe produced `1 rolled + 1 (<img src=x onerror="globalThis.pwned=1">) = 2 successes`, and the three sinks are direct `innerHTML` assignments. Current aggregate authorization limits immediate exposure to ST/dev users, but that does not make the sink safe.

### [Pass 1] The claimed roll snapshot still mixes pre-await and live roll state

- **Severity**: Medium
- **File:line**: `public/js/suite/roll-v2.js:960`, `public/js/suite/roll-v2.js:993`
- **The triggering input or sequence**: Start a roll while `ensureTrackerLoaded()` is pending, then switch the pool, toggle Rote/Again, or change the contested target before the await resolves. `eff`, `_rollChar`, and `_bonusCtx` are captured before the await, but later code re-reads live `state.ROTE` at `1059`, `state.POOL_INFO` at `1084`, `state.AGAIN` at `1093`, and resistance state at `1097`.
- **The observable consequence**: One result can roll the old effective pool and test the old trait context while using the new Rote/Again configuration, new pool description, or new defender. The headline, breakdown, and persisted roll log can therefore describe a hybrid roll; a Strength bonus may be shown beside the newly selected non-Strength pool.
- **Confidence**: Medium. The mixed reads across the await are explicit; I did not run a browser timing reproduction, so this is worth checking against any UI-level input lock not visible in the scoped diff.

## Low

### [Pass 1] `_int()` accepts malformed non-numbers as successes and can throw

- **Severity**: Low
- **File:line**: `public/js/editor/rule_engine/bonus-success-evaluator.js:163`
- **The triggering input or sequence**: Call the public evaluator with malformed `rolledSuccesses`, such as `true`, `[1]`, or `'1'`; `Number(...)` converts each to `1`, so the failed-roll gate passes and a matching bonus fires. Passing a `Symbol` or a null-prototype object makes `Number(...)` throw a `TypeError` before the gate.
- **The observable consequence**: A malformed caller can rescue what should be treated as an invalid/failed roll, returning `{ rolled: 1, bonus: [...], total: 2 }`, or can crash the evaluation instead of safely returning no bonuses. Current live `cntSuc` call sites supply numbers, so the immediate production reach is limited, but the exported evaluator's advertised defensive boundary is not true.
- **Confidence**: High for the behavior, medium for current reachability. All listed cases were directly executed.

## Validation notes

### Scope and files opened

I manually inspected `specs/stories/code-review/dtlt-1-diff.txt`. To resolve behavior left ambiguous by its hunks, I made narrow searches/probes only in files that are themselves present in that diff: `public/js/editor/rule_engine/load-rules.js`, `public/js/shared/dice.js`, `public/js/suite/roll-v2.js`, `public/js/editor/rule_engine/bonus-success-evaluator.js`, `server/index.js`, `server/routes/rules-engine.js`, `server/schemas/rules/rule-bonus-success.schema.js`, and `server/tests/api-rules-aggregate.test.js`. The required Vitest command loaded the listed test files and their normal dependencies. I did not open the story spec, sprint-tracking file, sibling repositories, or any source outside the diff for project context.

The schema comment's claim was verified: `checkBonusSuccessDoc` is passed as `postCheck`, and `makeRulesRouter` invokes it on both POST and PUT. A stored `min_rating: 0` is rejected by the schema's `minimum: 1` for both the primary predicate and `also_requires`; if a malformed document bypasses the route, the evaluator treats zero as the default threshold of one, which is equivalent to requiring a positive rating. A `rating` rule with primary merit A and an additional required merit B correctly used A's rating in a direct probe. Both new `dice.js` imports and its `formatSuccessBreakdown` re-export have live consumers. All empty-breakdown call sites conditionally omit their separator/tag. The contested attacker-total versus defender-rolled-only asymmetry is explicitly documented in the diff.

### Commands and results

- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/dtlt-1-diff.txt'` — succeeded; console output was truncated, so the file was subsequently read in ranges.
- `rg -n "^diff --git" "specs/stories/code-review/dtlt-1-diff.txt"` — succeeded; identified 13 diff sections.
- `$p='specs/stories/code-review/dtlt-1-diff.txt'; $lines=Get-Content -LiteralPath $p; $lines[0..229]` — succeeded.
- `$p='specs/stories/code-review/dtlt-1-diff.txt'; $lines=Get-Content -LiteralPath $p; $lines[230..650]` — succeeded.
- `$p='specs/stories/code-review/dtlt-1-diff.txt'; $lines=Get-Content -LiteralPath $p; $lines[651..1030]` — succeeded.
- `rg -n -C 5 "preloadRules|getRulesCache|postCheck" "public/js/editor/rule_engine/load-rules.js" "server/routes/rules-engine.js"` — succeeded; confirmed the sole cache fill and POST/PUT post-check wiring.
- Inline Node evaluator coercion probe (`combineSuccesses` / `resolveBonusSuccesses`) — succeeded. Missing, falsy, junk-string, negative, NaN, and Infinity inputs returned zero; `'1'`, `true`, and `[1]` returned one and fired the bonus; `Symbol` and a null-prototype object threw `TypeError`.
- From `server`, `npx vitest run bonus-success rule_engine_grep rule_engine_effective_contract api-rules-engine api-rules-aggregate` — exited 1 after 13.95 s. Exact gate totals: **5 test files: 3 passed, 2 failed; 124 tests: 53 passed, 71 skipped**. `api-rules-engine.test.js` skipped 61 tests and `api-rules-aggregate.test.js` skipped 10 because Mongo setup failed with `connect EACCES 159.143.141.178:27017`; their suites were marked failed, and the engine suite also emitted a secondary teardown `TypeError` after setup failed. The three non-Mongo suites passed.
- Inline Node AJV/post-check probe for primary and `also_requires` `min_rating: 0`, plus a rating rule with a second merit — succeeded; both zero-rating documents failed schema validation with `must be >= 1`, while the valid two-merit rating document passed.
- Inline Node evaluator probe with primary merit A at rating 2 and required merit B at rating 9 — succeeded; returned bonus count 2, confirming the primary merit is used.
- `rg -n -C 15 "RULE_CATEGORIES|ALLOWED_RULE_CATEGORIES" "public/js/editor/rule_engine/load-rules.js" "server/routes/rules-engine.js"` — succeeded; confirmed cache categories and the ST/dev-only aggregate contract comment.
- `rg -n "rules/aggregate|bonus_success|function _bonusRules|function _int|rulesAggregateRouter" ...` over the diff-listed cache, dice, index, aggregate-test, and evaluator files — succeeded; collected exact line references.
- Inline Node `formatSuccessBreakdown` markup probe — succeeded; returned the `<img ... onerror=...>` string verbatim.
- `rg -n "const _bonusCtx|await ensureTrackerLoaded|state\\.ROTE|state\\.AGAIN|state\\.RESIST_MODE|chanceVerd|const verd =|contestVerd|innerHTML =" "public/js/suite/roll-v2.js"` — succeeded; confirmed live state reads and unescaped sinks after the await.
- `rg -n -C 4 "const eff|let eff|poolInp|state\\.POOL" "public/js/suite/roll-v2.js"` — succeeded; confirmed `eff` is captured before the await while later `POOL_INFO` is live.
- Initial `git status --short` — succeeded and recorded the pre-existing dirty worktree; the requested findings file did not yet exist.
- `rg -n "const parts = result\\.bonus|hdr\\.innerHTML = .*chanceVerd|hdr\\.innerHTML = .*contestVerd|hdr\\.innerHTML = .*\\$\\{verd\\}" ...` — succeeded; confirmed exact formatter and sink lines.
- `Get-Content -Raw -LiteralPath 'specs/stories/code-review/dtlt-1-codex-findings-pass1.md'` — succeeded; verified the complete written report.
- Final `git status --short` and `git diff --numstat` checks — succeeded; confirmed no source/tooling file changed during review and the requested report is the only newly introduced path.

### Unrun or blocked validation

The 71 Mongo-backed API assertions could not execute because MongoDB access was denied by the environment (`EACCES` to `159.143.141.178:27017`). This is an environment limitation, not reported above as a product defect. I did not run Playwright or the full `npm test`; the task explicitly directed the targeted gate and warned that the full suite is long-running. I did not perform a browser-level reproduction of the mixed-state race or stored-markup execution.

### Workspace integrity

I did not modify source, tooling, story, or sprint files. The only file I created is this requested report. The worktree was already dirty with the scoped implementation and unrelated review artifacts before the report was written; final status/diff verification was used to confirm that this report is the only change introduced by this review session.
