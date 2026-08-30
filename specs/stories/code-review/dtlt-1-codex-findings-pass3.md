# dtlt-1 — Acceptance Auditor (Pass 3 of 3)

## High

- None found.

## Medium

### [Pass 3a] Rule `source` is inserted unescaped into the live Roll-tab verdict

- **Severity**: Medium
- **File:line**: `public/js/suite/roll-v2.js:1041` (also `:1116`, `:1166`); value originates at `public/js/editor/rule_engine/bonus-success-evaluator.js:86`
- **The triggering input or sequence**: An ST creates a valid bonus-success document whose `source` contains HTML, such as `<img src=x onerror=alert(1)>`; a matching character then makes a chance, contested, or standard roll in the live Roll tab. `formatSuccessBreakdown()` preserves the raw source and the Roll tab interpolates the resulting string into `innerHTML`.
- **The observable consequence**: The stored rule name is parsed as active HTML in the rolling user's browser instead of being displayed as text. The same breakdown is escaped in the Feeding tab, but all three Roll-tab result branches are vulnerable.
- **Confidence**: High. A direct evaluator invocation produced `1 rolled + 1 (<img src=x onerror=alert(1)>) = 2 successes`, and the three reachable sinks assign that value through `innerHTML` without `esc()`.

## Low

### [Pass 3a] The checked-off cyclic-reference execution task is not implemented

- **Severity**: Low
- **File:line**: `server/schemas/rules/rule-bonus-success.schema.js:71`
- **The triggering input or sequence**: POST a schema-valid document whose merit or manoeuvre source is also `predicate.name`, for example the story's own `source: 'Stronger Than You'` / `predicate.name: 'Stronger Than You'` seed.
- **The observable consequence**: The API accepts the document, although the literal Execution task says this shape “is rejected.” The task is internally inconsistent with its own required v1 seed and AC1, and ADR-001's worked example distinguishes permitted source self-reference from forbidden self-grants, so this is a specification-compliance/documentation defect rather than a harmful runtime cycle.
- **Confidence**: High. `checkBonusSuccessDoc()` contains no such rejection and explicitly documents why; the ADR's cyclic-reference paragraph confirms that source self-reference may be valid while `source === target` grants are forbidden.

### [Pass 3a] `getRulesBySource()` was not extended as the Code Map specifies

- **Severity**: Low
- **File:line**: `public/js/editor/rule_engine/load-rules.js:57`
- **The triggering input or sequence**: After `preloadRules()` has populated `rule_bonus_success`, a consumer calls `getRulesBySource('Stronger Than You')` as it does for other rule families.
- **The observable consequence**: The return value has no bonus-success rules/key even though the Code Map explicitly requires extending `preloadRules`, `getRulesCache`, and `getRulesBySource`. The shipped evaluator avoids this API by reading the raw cache, so the current Stronger Than You path still works.
- **Confidence**: High. The cache includes `rule_bonus_success` at line 48, while the object returned at lines 59–65 omits it.

### [Pass 3a] The required Vigour-2 regression row does not test Vigour's pool contribution

- **Severity**: Low
- **File:line**: `server/tests/bonus-success.test.js:129`
- **The triggering input or sequence**: Run the stated I/O-matrix row with a character carrying Vigour 2.
- **The observable consequence**: The test calls only `combineSuccesses(4, ...)` and proves that Stronger Than You does not fire; it never builds a Strength + Brawl pool or asserts the +2 Strength contribution from `rule_disc_attr`. The structural guard at lines 388–394 proves that seed text remains, not that the effective pool still includes those dots. The production Vigour code is unchanged, but the test-harness task's claimed regression protection is present only in appearance.
- **Confidence**: High. The row has no pool builder/effective-attribute call and asserts only `bonus === []` and `total === 4`.

## Validation notes

Pass 3b verification and the final ship assessment will be added after the author's Dev Agent Record has been read and independently checked. Pass 3a was recorded before opening that section.
