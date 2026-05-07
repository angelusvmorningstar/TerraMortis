# Story issue-151: Mandragora Garden missing from domain merit type dropdown

Status: review

issue: 151
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/151
branch: morningstar-issue-151-mandragora-dropdown

---

## Story

As a Storyteller editing a character's domain merits,
I want Mandragora Garden to appear in the domain merit type dropdown,
so that I can add it to a Circle of the Crone character without working around the editor.

---

## Background and Root Cause

**Two-layer problem — read both before touching anything.**

### Layer 1: `sub_category` likely missing from MongoDB

`buildSubCategoryMeritOptions(c, 'domain', currentName)` (`merits.js:315`) filters the live rules cache by `rule.sub_category === 'domain'`. The reference snapshot `data/reference/TM_rules_merit_2026-04-17.json` shows Mandragora Garden's entry has **no `sub_category` field** — it was never set.

`server/scripts/migrate-merit-sub-category.js` exists specifically to set this field on all five domain merit types (line 32: `DOMAIN_NAMES = ['Safe Place','Haven','Feeding Grounds','Herd','Mandragora Garden']`), but the script requires `--apply` to write to MongoDB. It is the user's responsibility to run this script against the live DB.

### Layer 2: Cruac prereq silently blocks non-Cruac characters

Even if `sub_category` is set, `buildSubCategoryMeritOptions:324` filters by `_meetsPrereq(c, rule.prereq)`. Mandragora Garden's prereq is:
```json
{
  "all": [
    { "type": "merit",      "name": "Safe Place", "qualifier": "same level" },
    { "type": "discipline", "name": "Crúac",      "dots": 1 }
  ]
}
```
Any character without Cruac 1+ will have Mandragora Garden filtered out, even with the correct `sub_category`. This contradicts the comment at `sheet.js:943`: *"Mandragora Garden's prereq is enforced by the helper"* — implying the dropdown should NOT enforce it.

### Correct fix strategy

The code fix at `sheet.js:944` should pass all five domain merit type names as `extraNames` to `buildSubCategoryMeritOptions`. The `extraNames` pathway (lines 330–332) appends any name not already in the seen-set — bypassing both the `sub_category` and prereq filters. This makes the domain type dropdown unconditionally show all valid domain types, consistent with the ST-only context where any domain merit should be assignable.

The data fix (running the migration script) is also needed for DB hygiene but the code fix makes the dropdown work independently of DB state.

---

## Mandragora Garden MongoDB entry (from reference snapshot)

```json
{
  "key": "mandragora-garden",
  "name": "Mandragora Garden",
  "category": "merit",
  "parent": "Kindred",
  "rating_range": [1, 5],
  "prereq": {
    "all": [
      { "type": "merit",      "name": "Safe Place", "qualifier": "same level" },
      { "type": "discipline", "name": "Crúac",      "dots": 1 }
    ]
  }
}
```
Note: `sub_category` field is absent.

---

## Acceptance Criteria

- [ ] Mandragora Garden appears in the domain merit type dropdown for all characters (Cruac or not)
- [ ] A character who already has a Mandragora Garden row shows it selected in the dropdown (escape-hatch at `merits.js:336` already handles this; verify it still works)
- [ ] The cap behaviour (capped at attached Safe Place's effective rating) is unchanged
- [ ] Other four domain merit types (Safe Place, Haven, Feeding Grounds, Herd) still appear correctly

---

## Tasks / Subtasks

- [x] Task 1: Code fix — pass domain merit names as `extraNames` fallback
  - [x] 1a: Add `DOMAIN_MERIT_TYPES` to the import from `../data/constants.js` in `sheet.js` (line 6)
  - [x] 1b: Change `sheet.js:944` to pass `DOMAIN_MERIT_TYPES` as the fourth argument to `buildSubCategoryMeritOptions`

- [x] Task 2: Data fix — set `sub_category: 'domain'` in MongoDB
  - [x] 2a: Dry-run the migration script to confirm Mandragora Garden would be updated
  - [x] 2b: Report the output to the user; they will run with `--apply` themselves

- [x] Task 3: Smoke-test — verify Mandragora Garden appears in dropdown

---

## Dev Notes

### Exact code change

**Task 1a — `sheet.js:6` import line:**

Current import from `constants.js`:
```js
import { CLAN_DISCS, BLOODLINE_DISCS, CORE_DISCS, RITUAL_DISCS, CLAN_ATTR_OPTIONS, ATTR_CATS, PRI_LABELS, PRI_BUDGETS, SKILL_PRI_BUDGETS, SKILLS_MENTAL, SKILLS_PHYSICAL, SKILLS_SOCIAL, SKILL_CATS, CLANS, COVENANTS, MASKS_DIRGES, COURT_TITLES, BLOODLINE_CLANS, BANE_LIST, INFLUENCE_SPHERES, ALL_SKILLS, CITY_SVG, OTHER_SVG, BP_SVG, HUM_SVG, HEALTH_SVG, WP_SVG, STAT_SVG, STYLE_TAGS } from '../data/constants.js';
```
Add `DOMAIN_MERIT_TYPES` to that list.

**Task 1b — `sheet.js:944`:**

Before:
```js
let tOpts = buildSubCategoryMeritOptions(c, 'domain', m.name);
```

After:
```js
let tOpts = buildSubCategoryMeritOptions(c, 'domain', m.name, DOMAIN_MERIT_TYPES);
```

That's the entire code change. `buildSubCategoryMeritOptions` already handles deduplication: `extraNames` entries not already in the seen-set are appended (lines 330–332 of `merits.js`), then the full list is sorted alphabetically (line 333).

**Why this is safe:**
- `extraNames` only adds names not already present — no duplicates
- The existing `sub_category`-based filtering still runs first, so well-configured DB entries appear via the normal path; `extraNames` is a fallback
- The escape-hatch at `merits.js:336` (`if (currentName && !seen.has(currentName)) qualified.push(currentName)`) is unaffected
- No cap logic, helper functions, or prereq enforcement elsewhere is touched

### Data fix: migration script

Run from the project root (dry run first):
```sh
node server/scripts/migrate-merit-sub-category.js
```
Expected output should include:
```
SET   Mandragora Garden              — sub_category: (none) → domain
```
(or `SKIP` if already set). After confirming, user runs with `--apply`.

This is a user-run operation — do NOT run it yourself.

### What must not break

- The five domain merit type names in the dropdown (alphabetically sorted after the fix): Feeding Grounds, Haven, Herd, Mandragora Garden, Safe Place
- Herd-once-per-character rule: the existing `tOpts = tOpts.replace(...)` at `sheet.js:946–948` still strips Herd from rows where another Herd row exists — this runs after `buildSubCategoryMeritOptions` returns, so no interaction
- Cap logic for Haven/Mandragora Garden (`meritEffectiveRating`, `CAP_DOMAIN`) — untouched
- `shRenderDomainMerits` view mode (non-edit) — untouched

---

## Dev Agent Record

### File List

- `public/js/editor/sheet.js` — added `DOMAIN_MERIT_TYPES` to constants import; passed as `extraNames` to `buildSubCategoryMeritOptions` at domain merit type dropdown build

### Completion Notes

Dry-run of `migrate-merit-sub-category.js` confirmed Mandragora Garden already has `sub_category='domain'` in the live DB — Layer 1 was not the issue. Root cause was solely Layer 2: the Cruac prereq filtered it for non-Cruac characters. Code fix: `DOMAIN_MERIT_TYPES` passed as `extraNames` to `buildSubCategoryMeritOptions` ensures all five domain merit types always appear in the dropdown regardless of prereqs, consistent with comment at `sheet.js:943`. Parse-check clean. Side note: `Contacts` influence merit is missing `sub_category='influence'` in DB (separate bug, out of scope).

### Change Log

- 2026-05-07: Fix Mandragora Garden hidden from domain merit dropdown — pass DOMAIN_MERIT_TYPES as extraNames fallback (sheet.js:944)
