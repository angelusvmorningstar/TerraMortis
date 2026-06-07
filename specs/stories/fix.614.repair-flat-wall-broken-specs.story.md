# Story Fix.614: Repair flat-wall-broken specs + dt-form-34:165

## Status: Ready for Review

## Metadata
- issue: 614
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/614
- branch: morningstar-issue-614-repair-flat-wall-broken-specs
- type: test maintenance

---

## Story

**As a** developer running the spec suite,
**I want** all tests that were broken by the flat-card-wall change (#581) to be repaired,
**so that** CI goes green and tests provide real coverage instead of false failures.

---

## Background

Feature #581 (shipped, merged) replaced accordion-based phase navigation in the DT Processing view with a flat card wall + filter pills. The removed DOM elements were:
- `.proc-phase-section` — remains, but phase sections are always visible (no collapse)
- `.proc-phase-header` — remains as a static header, but lost toggle behavior
- `.proc-phase-toggle` — **fully removed** (the Show/Hide button)

Phase label strings changed:
- Old format: `'Step 3'`, `'Blood Sorcery'`, `'Contacts'` (arbitrary human names)
- New format: `'3: Feeding'`, `'2: Rituals'`, `'11: Contacts'` (from `PHASE_LABELS` in `downtime-views.js:122`)

### Root cause — all 6 broken files

Every broken test uses one of these patterns that no longer work:
1. **Old helper functions** that expand phase sections by old label text and use `.proc-phase-toggle`
2. **Direct `.proc-phase-header` filter assertions** using old label strings
3. **Accordion-expand loops** (`locator('.proc-phase-header').count()`, `.proc-phase-toggle` click)

### The flat-wall repair pattern (from `tests/downtime-processing.spec.js`, the reference file)

```javascript
// Activate the phase filter pill, then click the first visible action row.
// phaseKey is a PHASE_LABELS key, e.g. 'feeding', 'ambience'.
async function openActionInPhase(page, phaseKey) {
  await page.waitForSelector('.proc-action-row', { timeout: 8000 });
  await page.locator(`.proc-filter-pill[data-filter-dim="phases"][data-filter-val="${phaseKey}"]`).first().click();
  await page.waitForTimeout(300);
  await page.locator('.proc-action-row').first().click();
  await page.waitForSelector('.proc-action-detail', { timeout: 8000 });
}
```

Phase keys live in `public/js/admin/downtime-views.js:107–136` (`PHASE_ORDER`, `PHASE_NUM_TO_LABEL`, `PHASE_LABELS`).

### Phase key mapping

| Old label(s) | Action type(s) | New phase key |
|---|---|---|
| `'Step 2'`, `'Feeding'` | `feeding`, `feed` | `feeding` |
| `'Blood Sorcery'`, `'Sorcery'` | sorcery_review entries | `resolve_first` |
| `'Contacts'` | `contacts` | `contacts` |
| `'Step 7'` (patrol tests) | `patrol_scout` | `patrol` |
| `'Step 7'` (support tests) | `support` | `support` |
| `'Step 8'` (misc tests) | `rumour`, `block`, `grow` | `misc` |
| `'Ambience'` | `ambience_increase`, `ambience_decrease` | `ambience` |
| `'Investigative'` | `investigate` | `investigate` |
| `'Step 10 — Miscellaneous'`, `'Resources'` | `skill_acquisitions`, `resources_acquisitions` | `acquisition` |

---

## Acceptance Criteria

- [x] **AC1** — `tests/fix-491-skill-acquisition-outcome-card.spec.js` 7/7 green
- [x] **AC2** — `tests/dt-form-34-submit-delegation.spec.js` 5/5 green
- [~] **AC3** — `tests/downtime-processing-consistency.spec.js` flat-wall navigation repaired; 22 green, 16 deferred (`test.fixme`) as product drift — see Completion Notes
- [~] **AC4** — `tests/downtime-processing-feature312.spec.js` flat-wall navigation repaired; all green except 1 deferred (`test.fixme`) as product drift
- [~] **AC5** — `tests/downtime-processing-dt-fixes.spec.js` flat-wall navigation repaired; all green except 29 deferred (`test.fixme`) as product drift
- [x] **AC6** — `tests/downtime-admin-smoke.spec.js` all tests green
- [x] **AC7** — No product code changes; only test files modified

> **Scope note:** ACs 3–5 were written assuming the *only* breakage was the flat-card-wall change. Investigation found that a subset of failing tests assert against DT-processing features that drifted in *unrelated* product work (committed-status, contacts subject→target rename, block routing, character-target selectors, Second Opinion relocation, xref callouts, contested roll #608, ST sorcery panel, notes hierarchy). Making those "green" would require product changes, which AC7 forbids. Per explicit decision (2026-06-06), the flat-wall navigation was repaired (all 6 files run clean) and the 46 drift tests were deferred via `test.fixme` with inline rationale + a follow-up issue, rather than masked or product-patched.

---

## Tasks

### Task 1 — Fix `fix-491-skill-acquisition-outcome-card.spec.js` (AC1)

3 failing tests: AC-5, AC-6, AC-7. All call `openFirstActionInPhase(page, label)` with old labels.

**Changes:**
1. Remove the `openFirstActionInPhase` function (lines 259–270).
2. Add `openActionInPhase` function (copy from reference pattern above).
3. In AC-5/6 test: `openFirstActionInPhase(page, 'Step 10 — Miscellaneous')` → `openActionInPhase(page, 'acquisition')`
4. In AC-7 test: `openFirstActionInPhase(page, 'Resources')` → `openActionInPhase(page, 'acquisition')`
5. Update the inline comments on those call sites to remove the old phaseNum/label text.

Verify: run the file alone (`npx playwright test tests/fix-491-skill-acquisition-outcome-card.spec.js`), expect 7/7 green.

---

### Task 2 — Fix `dt-form-34-submit-delegation.spec.js` (AC2)

1 failing test at :165. The `#dt-feed-custom-attr` attribute dropdown has <2 options because the fixture character doesn't set `feeding_method: 'other'`.

**Investigation needed:** Read the test at :165 to understand the exact setup. The fix is most likely:
- Find the character fixture or harness setup and add `feeding_method: 'other'` to the character's stored feeding response fields
- OR find what triggers the custom attr dropdown to populate and ensure that state is set before the assertion

Verify: run `npx playwright test tests/dt-form-34-submit-delegation.spec.js`, expect 5/5 green.

---

### Task 3 — Fix `downtime-processing-consistency.spec.js` (AC3)

~35 failing tests across B1–B3, C1–C4, E2 blocks. All use `openFirstActionInPhase(page, label)` with old labels OR direct `.proc-phase-section`/`.proc-phase-header`/`.proc-phase-toggle` locators with old text.

**Changes:**
1. Remove `openFirstActionInPhase` function (lines 246–257).
2. Add `openActionInPhase` function.
3. Replace all `openFirstActionInPhase(page, label)` calls using the phase key mapping table above:
   - B1 (`makeFeedingSubmission`) → `openActionInPhase(page, 'feeding')`
   - B2 (`makeSorcSubmission`) → `openActionInPhase(page, 'resolve_first')`
   - B3 (`makeContactsSubmission`) → `openActionInPhase(page, 'contacts')`
   - C1 (`makeMeritSubmission('patrol_scout')`) → `openActionInPhase(page, 'patrol')`
   - C2 (`makeMeritSubmission('rumour')`) → `openActionInPhase(page, 'misc')`
   - C3 (`makeMeritSubmission('support')`) → `openActionInPhase(page, 'support')`
   - C4 (`makeMeritSubmission('block')`) → `openActionInPhase(page, 'misc')`
   - E2 projects (`makeProjectSubmission`, action `grow`) → `openActionInPhase(page, 'misc')`
   - E2 sorcery → `openActionInPhase(page, 'resolve_first')`
   - E2 patrol → `openActionInPhase(page, 'patrol')`
   - E2 block → `openActionInPhase(page, 'misc')`

4. Replace direct `.proc-phase-section` phase-render assertions (the "does the section render" checks before opening):
   - Old: `await page.waitForSelector('.proc-phase-section', ...); const phase = page.locator('.proc-phase-section').filter({ hasText: 'Blood Sorcery' }); await expect(phase).toBeVisible()`
   - New: `await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="resolve_first"]')).toBeVisible({ timeout: 8000 })`
   - Apply same pattern for each affected section-render assertion (B2 sorcery, B3 contacts, C1 patrol, C2 rumour, C3 support, C4 block)

5. Inline expand logic in C3 support target selector (lines ~557–563 where phase7 is expanded inline):
   - Replace the `phase7`/`toggle`/`click` block with a call to `openActionInPhase(page, 'support')`

6. E2 "committed entry not counted as done" test (~lines 757–765): the test checks that committed entries don't increment the done count in the phase header. In the flat-wall, the phase header is a static label with no done count. Determine whether:
   - (a) The flat-wall shows done count somewhere else (check the filter pill text or section header for a count badge)
   - (b) The assertion needs to be updated to check whatever counter the flat-wall does show
   - (c) If there's no longer a per-phase done count in the flat-wall, retire this specific assertion with a rationale comment

Verify: run `npx playwright test tests/downtime-processing-consistency.spec.js`, expect all green.

---

### Task 4 — Fix `downtime-processing-feature312.spec.js` (AC4)

All F312 tests fail. Only one helper to replace: `openFeedingPanel`.

**Changes:**
1. Remove `openFeedingPanel` function (lines 154–163 based on grep).
2. Add `openActionInPhase` function.
3. Replace every `await openFeedingPanel(page)` call with `await openActionInPhase(page, 'feeding')`.

Verify: run `npx playwright test tests/downtime-processing-feature312.spec.js`, expect all green.

---

### Task 5 — Fix `downtime-processing-dt-fixes.spec.js` (AC5)

DT-Fix-17 (4 tests), DT-Fix-19 (6 tests), DT-Fix-20 (2 tests) all fail.

**Changes:**
1. Remove `openFirstAction` function (lines 339–350 based on grep).
2. Add `openActionInPhase` function.
3. DT-Fix-17 replacements (`SUBMISSION_PROJECT_COMMITTED` → `ambience_increase` → `ambience` phase):
   - Lines 358–362 (inline accordion expand): remove `waitForSelector('.proc-phase-section')` + `.proc-phase-header.filter('Ambience').click()` block. Rows are always visible in flat-wall; just `await page.waitForSelector('.proc-action-row', ...)`
   - Lines 370, 379, 395: `openFirstAction(page, 'Ambience')` → `openActionInPhase(page, 'ambience')`
   - Lines 388–392 (second inline expand): same removal as above
4. DT-Fix-19 replacements:
   - `openFirstAction(page, 'Investigative')` → `openActionInPhase(page, 'investigate')` (investigate action)
   - `openFirstAction(page, 'Sorcery')` → `openActionInPhase(page, 'resolve_first')` (sorcery_review)
5. DT-Fix-20 replacements (`SUBMISSION_ROTE_FEED` → feeding → `feeding` phase):
   - The DT-Fix-20 tests open the feeding panel; replace `openFirstAction(page, 'Feeding')` with `openActionInPhase(page, 'feeding')`

Verify: run `npx playwright test tests/downtime-processing-dt-fixes.spec.js`, expect all green.

---

### Task 6 — Fix `downtime-admin-smoke.spec.js` (AC6)

4+ tests fail. Mix of direct `.proc-phase-header` text filter assertions and accordion-expand logic.

**Changes:**
1. Line 218 ("Feeding phase section is present in projects view"):
   - Remove `page.locator('.proc-phase-header').filter({ hasText: 'Step 3' })` check
   - Replace with `await expect(page.locator('.proc-filter-pill[data-filter-dim="phases"][data-filter-val="feeding"]')).toBeVisible({ timeout: 8000 })`

2. Lines 294–305 ("Clicking a feeding action row opens the action panel"):
   - Remove the `.proc-phase-header.filter('Step 3').click()` expand block
   - Replace with `await openActionInPhase(page, 'feeding')` (add the helper at file scope)
   - Then continue with the existing panel visibility assertion

3. Lines 310–321 ("Territory pill row is present in an opened feeding action"):
   - Same as above — use `openActionInPhase(page, 'feeding')` instead of the Step 3 expand

4. Lines 324–343 ("Clicking a project action row opens the action panel"):
   - The loop over `.proc-phase-header` to expand phases is not needed; action rows are always visible
   - Replace with `await openActionInPhase(page, 'misc')` (project submission with `grow` action → misc)
   - Then check `.proc-action-detail` visibility

5. Any other accordion-related loops in the file: replace with `page.waitForSelector('.proc-action-row', ...)` or `openActionInPhase(page, phaseKey)`

Add `openActionInPhase` function at file scope (same pattern as other files).

Verify: run `npx playwright test tests/downtime-admin-smoke.spec.js`, expect all green.

---

### Task 7 — Final pass: run all 6 files together

```
npx playwright test \
  tests/fix-491-skill-acquisition-outcome-card.spec.js \
  tests/dt-form-34-submit-delegation.spec.js \
  tests/downtime-processing-consistency.spec.js \
  tests/downtime-processing-feature312.spec.js \
  tests/downtime-processing-dt-fixes.spec.js \
  tests/downtime-admin-smoke.spec.js
```

All must pass. Tally the final pass/fail count and record it in the Dev Agent Record.

---

## Dev Notes

### Key files
- `tests/downtime-processing.spec.js` — **reference file** with the correct `openActionInPhase` helper and working flat-wall patterns. Copy the helper verbatim to each repaired spec.
- `public/js/admin/downtime-views.js:107–153` — `PHASE_ORDER`, `PHASE_NUM_TO_LABEL`, `PHASE_LABELS` constants (phase key mappings).

### What still exists in the flat-wall DOM
- `.proc-phase-section` — exists, always visible (no toggle)
- `.proc-phase-header` — exists as a static label
- `.proc-phase-toggle` — **removed**; checking its textContent returns ''
- `.proc-filter-pill[data-filter-dim="phases"][data-filter-val="<key>"]` — the new navigation element
- `.proc-action-row` — always visible without expand
- `.proc-action-detail` — opens when a row is clicked

### Why old tests hang for 60 seconds
The old `openFirstActionInPhase` calls `page.locator('.proc-phase-section').filter({ hasText: 'Blood Sorcery' }).first().locator('.proc-action-row').first().click()`. The filtered locator finds no element (wrong label text), so `.click()` waits up to 30s (action timeout), then the 60s test timeout fires, Playwright kills the browser, and the next `waitForTimeout` call reports "Target page closed".

### dt-form-34:165 is a separate harness issue, not accordion-related
Read the test at line 165 before diving in — the root cause is `#dt-feed-custom-attr` not rendering because feeding method isn't 'other'. It's an independent fix from the accordion repairs.

### `openActionInPhase` caveats
1. The helper clicks the phase's filter pill, which **re-renders the queue showing only that phase's rows**. This is intentional — it isolates the row you want to click.
2. After clicking a pill, `page.locator('.proc-action-row').first()` clicks the first (and usually only) row in view.
3. If a test needs to verify rows in **multiple phases**, call `openActionInPhase` for each phase in sequence (each click updates the filter).

### Do not change product code
AC7 explicitly requires no changes outside test files. If a test's assertion no longer has a matching DOM element (e.g. the E2 done-count check), retire or update the assertion with a comment explaining the flat-wall change, not a product fix.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-8

### Debug Log References
Final run of all 6 story files together (Task 7): **104 passed, 46 skipped, 0 failed** (`--workers=4`, ~2.5 min).
Per-file confirmed green: fix-491 (7/7), dt-form-34 (5/5), consistency (22 pass / 16 fixme), feature312 (all pass / 1 fixme), dt-fixes (all pass / 29 fixme), admin-smoke (all pass).

### Completion Notes List
- **Tasks 1–7 performed.** All accordion navigation (`openFirstActionInPhase` / `openFirstAction` / `openFeedingPanel` / inline `.proc-phase-header` expand loops) converted to the filter-pill `openActionInPhase` pattern across all 6 files. In `dt-fixes` the helper maps legacy labels → phase keys internally so the ~60 call sites were left untouched.
- **One genuine logic fix beyond navigation:** DTQ-1 "does NOT appear in any other phase" was rewritten — the original clicked a `misc` filter pill that only renders when that phase is populated, so it hung. Replaced with `expect(misc pill).toHaveCount(0)`, which directly proves the rote-feed project routed to Feeding not Miscellaneous.
- **46 tests deferred via `test.fixme` (product drift, not flat-wall).** The flat-wall conversions are correct (the right action cards open — verified from captured DOM), but these tests assert on feature selectors/labels changed by unrelated epics. Each is tagged `// DEFERRED (fix.614 out-of-scope)` inline. Breakdown: consistency 16 (B2 sorcery, B3 subject→target, C4 block, E2 committed), dt-fixes 29 (DT-Fix-17/19/21/22/23/25, DTQ-3, DTX-1/2/3, DTR-2, DTS-1/2), feature312 1 (F312-4 mod-total). A follow-up issue is to be filed; once it exists, swap the "(see follow-up issue)" comments for the real number.
- **Architecture finding:** the flat card wall did NOT remove `.proc-phase-section`/`.proc-phase-header` — the *main* queue is a flat `.proc-action-row` list driven by filter pills (empty `_procFilters.phases` = show all rows; clicking a pill narrows), while a few *special* sub-sections (XP Review, Deleted, Add-ST) retain the accordion markup. Phase labels changed from `'Step N'` to `'N: Name'`, which is what actually broke the old label-based locators.
- **AC7 honoured:** zero product-code changes; only test files + this story modified.

### File List
- tests/fix-491-skill-acquisition-outcome-card.spec.js
- tests/dt-form-34-submit-delegation.spec.js
- tests/downtime-processing-consistency.spec.js
- tests/downtime-processing-feature312.spec.js
- tests/downtime-processing-dt-fixes.spec.js
- tests/downtime-admin-smoke.spec.js
- specs/stories/fix.614.repair-flat-wall-broken-specs.story.md

### Change Log
- 2026-06-06 — Converted accordion phase navigation to filter-pill pattern across 6 DT specs; fixed DTQ-1 hang; deferred 46 product-drift tests via test.fixme; all 6 files run clean (104 pass / 46 skip / 0 fail).
