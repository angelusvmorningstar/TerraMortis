# Testing Strategy

## Overview

There is no formal test framework. The project uses manual browser testing against a set of known-state test characters. This is consistent with the no-build-step constraint and the learning-developer context.

Automated testing (if introduced) must not require a build step or Node runtime for execution. Browser-native test runners (e.g. web-test-runner) would be acceptable in Phase 2+, but are out of scope for Epic 1.

## Test Character Fixtures

The primary test mechanism is a set of 6 fake characters in `data/chars_test.json`. These characters are:

1. Designed to cover edge cases across the full v2 schema
2. The **only** data deployed to GitHub Pages (real characters never reach `public/`)
3. Used to verify all render functions, pool calculations, and merit derivations

### Required Coverage per Test Character

At minimum, the 6 characters should collectively cover:

| Scenario | Why |
|---|---|
| Standard attributes/skills (no bonus) | Baseline render check |
| Attribute with `bonus > 0` | Verify total (dots + bonus) used in pools |
| Skill with specialisations and `nine_again: true` | Verify spec display and flag handling |
| Character with MCI merit at 3+ dots | Verify benefit_grant derivation |
| Professional Training merit with `role` field | Verify PT asset skills and grants |
| Domain merit shared between two characters | Verify sharing maths (CP+XP cap 5) |
| Character with `features` field populated | Verify field preserved (Epic 1), rendered (Epic 2) |
| Power of each category (discipline/rite/devotion/pact) | Verify oneOf rendering |
| Known-bad data analogue (fractional XP / non-divisible) | Verify graceful handling (display 1 dot, no crash) |

One test character (`Viktor Ashwood` per PRD) should mirror the complexity of a real PT character.

## Manual Testing Protocol

### Before committing any change

1. Open `public/index.html` in the browser (no server needed -- file:// is fine for local testing)
2. Load `chars_test.json`
3. Verify: character list renders, filterable by clan and covenant
4. Verify: each test character sheet renders without console errors
5. Verify: dice pool construction and roll for at least one character
6. Verify: no visual regressions against the expected output

### After extracting a module (Epic 1a)

For each module extracted:
1. Confirm the view it powers renders identically to the pre-extraction state
2. Check browser console for import errors (missing `.js` extension is the most common mistake)
3. Check that no global variables were accidentally removed

### After Suite accessor migration (Epic 1c)

For each accessor migration:
1. Confirm the roll pool calculation for the migrated call site produces the same result as before migration
2. Run the full roll tab against all 6 test characters
3. Verify resistance check and contested roll workflows

### After SPA merge (Epic 1d)

1. Verify all Editor views (list, sheet, edit) render correctly
2. Verify all Suite tabs (Roll, Sheet, Territory, Tracker) render correctly
3. Verify navigation between Editor and Suite modes works without page reload
4. Verify localStorage save/load round-trips correctly
5. Verify on mobile viewport (375px): Suite tabs usable, Editor list usable

## Syntax Validation

For JS files without a browser runtime available, use Node's script parser:

```sh
node -e "require('fs').readFileSync('public/js/editor/merits.js', 'utf8'); console.log('OK')"
```

Or use the VM module for stricter validation:

```sh
node -e "const vm = require('vm'); const code = require('fs').readFileSync('public/js/editor/merits.js', 'utf8'); vm.createScript(code); console.log('OK')"
```

This catches syntax errors without executing the module.

## Known Edge Cases (must not regress)

These known data issues must be handled gracefully -- not fixed, not errored on:

| Character | Issue | Expected behaviour |
|---|---|---|
| Gel | Skills XP = 1 total | Display 0 dots for all skills; no crash |
| Magda | Skills XP = 1 total | Display 0 dots for all skills; no crash |
| Kirk Grimm | Intelligence XP = 5 (non-divisible by 4) | Display 1 dot (floor); no crash |
| Conrad | Discipline dot splits may have errors | Display stored dots; no validation error |

These are test cases in `chars_test.json`: include analogues that reproduce these conditions.

## Regression Test Checklist

Before any PR merge to `main`, manually verify:

- [ ] Character list renders with all 6 test characters
- [ ] Clan/covenant filter works
- [ ] Character name search works
- [ ] Each character sheet renders without console errors
- [ ] Derived stats display correctly (speed, defence, health, WP, vitae)
- [ ] Dots display using ● / ○ (not ASCII)
- [ ] Roll tab: pool construction from attribute + skill
- [ ] Roll tab: dice roll executes and displays results
- [ ] Roll tab: resistance check calculation
- [ ] Territory tab renders (no React dependency after Epic 1d)
- [ ] Tracker tab loads and persists data
- [ ] Edit mode: modify a field and save; verify localStorage updated
- [ ] GitHub Pages deploy succeeds (check Actions tab after push)

## Phase 2+ Testing Considerations

Once Epic 2 introduces automated downtime resolution and GitHub API integration:

- Downtime calculations should be unit-tested with known inputs and outputs (at that point, a minimal test harness is warranted)
- GitHub API integration should be tested against a test repository to avoid writes to production data
- MCI benefit_grant derivation is complex enough to warrant a table-driven test (input: MCI config + character state; expected output: derived merit list)
