# Story Fix.576: Repair stale grid-card test (clan + blood potency moved to detail panel)

## Status: review

## Metadata
- issue: 576
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/576
- branch: morningstar-issue-576-fix-grid-card-test
- type: bug (test)

---

## Story

**As a** developer running the editor regression suite,
**I want** the `char-editor-save.spec.js` "shows clan and blood potency" test to assert against the surface where clan and blood potency actually render,
**so that** the spec is green and trustworthy instead of failing on content the grid card was intentionally redesigned away from.

---

## Background

### Root cause (diagnosed) — stale test, NOT a render bug

The test `tests/char-editor-save.spec.js:128-137` ("character card shows clan and blood potency") reads the **grid card** text and asserts it contains `'Mekhet'` (clan) and `'2'` (blood potency). The grid card no longer renders either.

Reproduced failure:
```
Expected substring: "Mekhet"
Received string:    "·······
        Quinn Testwood
        ⚠ 14·······"
```

The current grid card (`public/js/admin.js:565-570`, `charCard`) renders only:
- `.cc-name` → `cardName(c)` (the name, "Quinn Testwood")
- `.cc-card-right` → audit badges (`_auditBadges`, the "⚠ 14") + ordeal chip

Clan and blood potency are **not** on the card by design — the card was slimmed to name + status badges. They render in the **detail-panel sheet** (view mode):
- **Clan** → `public/js/editor/sheet.js:1895`, `<div class="sh-faction-label">` = `esc(c.clan)` → text "Mekhet".
- **Blood potency** → `public/js/editor/sheet.js:384-393`, `shRenderStatsStrip`: a `.sh-stat-cell` whose `.sh-stat-lbl` is `BP` and whose `.sh-stat-n` holds the value (`${bp || 1}`).

Confirmed pre-existing (reproduces on `main`/unmodified `sheet.js`; surfaced during QA of #573, not caused by it).

### Secondary defect — the assertion was too loose anyway

`expect(text).toContain('2')` matches **any** `'2'` in the card text (e.g. the "14" audit badge contains no 2, but other fixtures would). Even on the old card this was a weak check. The replacement must assert the blood-potency value at a precise, labelled location.

### The fix (recommended approach)

Retarget the test to the **detail panel**, where clan + blood potency genuinely render, and tighten the assertions:
- Clan: assert `.sh-faction-label` text is `Mekhet`.
- Blood potency: assert the `BP` stat cell's `.sh-stat-n` equals the fixture's `blood_potency` (`2`).
- Rename the test to reflect the surface (e.g. "detail panel shows clan and blood potency").

This preserves the original intent (an ST can see a character's clan and blood potency) at the correct surface, rather than deleting coverage or re-bloating the card.

### Out of scope

- Changing the grid-card design (the minimal name + badges card is intentional — do NOT re-add clan/BP to it).
- The editor edit-mode rendering changed by #573 (covered by `tests/char-editor-effective-total.spec.js`).
- The existing test "character card renders in grid with correct name" (`spec.js:116`) — already covers the card's name; leave it.

---

## Acceptance Criteria

- [x] The test formerly at `tests/char-editor-save.spec.js:128` no longer asserts clan/BP against the grid card. _(stale test removed from the Grid block)_
- [x] Given the detail panel is open for the fixture character (Mekhet, blood_potency 2), When the sheet renders, Then the test asserts clan shows `Mekhet` and the `BP` stat cell's value is `2`. _(ADAPTED — see note: clan asserted via the edit-mode clan `<select>` value, not `.sh-faction-label`, because the view-mode sheet body does not render in this harness)_
- [x] The blood-potency assertion is scoped to the BP cell (not a loose `toContain('2')` over the whole card/panel text). _(`bpCell.locator('.sh-stat-n')` toHaveText '2')_
- [x] `npx playwright test tests/char-editor-save.spec.js` reports all tests passing (7/7).
- [x] No production code changed — fix is confined to the test file (the card/sheet render is correct as-is).

---

## Tasks

### Task 1 — Retarget the stale test to the detail panel ✓

**File:** `tests/char-editor-save.spec.js` (~line 128-137)

The current test lives in the `describe('Char Editor — Grid', …)` block and reads the grid card. Move/rewrite it so it opens the detail panel and asserts the sheet content. The file already has an `openCharDetail(page)` helper (used by the Detail Panel describe block) that clicks the card and waits for `#cd-edit-toggle` — reuse it.

Replace the body with assertions like:
```js
await openCharDetail(page);
// Clan renders as the faction label in the detail sheet
await expect(page.locator('#char-detail .sh-faction-label')).toHaveText('Mekhet');
// Blood potency renders in the BP stat cell
const bpCell = page.locator('#char-detail .sh-stat-cell', { hasText: 'BP' });
await expect(bpCell.locator('.sh-stat-n')).toHaveText('2');
```
Rename the test title to reflect the surface (e.g. `detail panel shows clan and blood potency`) and, if it now belongs with the Detail Panel group, move it into that `describe` block (which already runs `loginAsST` + `openCharDetail` in `beforeEach` — in which case the explicit `openCharDetail(page)` call is redundant and should be dropped).

### Task 2 — Verify the full spec is green ✓

Run `npx playwright test tests/char-editor-save.spec.js` and confirm all tests pass. The suite auto-starts http-server via `playwright.config.js` (`webServer`, `reuseExistingServer: true`).

---

## Dev Notes

### Files to touch

- `tests/char-editor-save.spec.js` — the only file. Test-only change; **no production code**.

### Reference — current render (read for context, do not modify)

- `public/js/admin.js:565-570` — `charCard`: minimal card = `.cc-name` + `.cc-card-right` (audit badges + ordeal chip). Clan/BP intentionally absent.
- `public/js/editor/sheet.js:1895` — view-mode clan label: `<div class="sh-faction-label">${esc(c.clan)}</div>`.
- `public/js/editor/sheet.js:384-393` — `shRenderStatsStrip`: BP cell `s(BP_SVG, '${bp||1}', 'BP')` → `.sh-stat-cell` > `.sh-stat-icon` > `.sh-stat-n` (value) + `.sh-stat-lbl` (`BP`).
- `tests/char-editor-save.spec.js` — fixture `TEST_CHAR` is Mekhet, `blood_potency: 2`; `openCharDetail` helper already exists and works (proven by the Detail Panel + Save flow tests).

### Watch-outs

- The detail-panel sheet renders in the existing harness (the Save-flow tests enter edit mode and the editor sheet renders), so view-mode clan/BP will render without extra API mocks. If the sheet needs a tick to paint, prefer Playwright web-first assertions (`toHaveText`) which auto-retry over `textContent()` snapshots.
- `.sh-stat-cell` `hasText: 'BP'` could in principle also match a cell whose value contains "BP"; BP is a unique label here, but if flaky, scope by filtering on `.sh-stat-lbl` text `BP` then reading the sibling `.sh-stat-n`.
- Do NOT "fix" this by re-adding clan/BP to the grid card — that reverses an intentional design simplification.

### Project Structure Notes

- British English; no UI copy change (test-only).
- Targeted test run only (`char-editor-save.spec.js`), per project convention — not the full suite.

### References

- [Source: tests/char-editor-save.spec.js:128-137] — the stale test
- [Source: public/js/admin.js:565-570] — current minimal grid card
- [Source: public/js/editor/sheet.js:1895, 384-393] — clan label + BP cell in detail sheet
- [Source: GitHub issue #576] — https://github.com/angelusvmorningstar/TerraMortis/issues/576
- Surfaced during QA of #573 (`specs/stories/fix.573.editor-card-effective-total.story.md`)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD dev-story)

### Debug Log References

- Reproduced original failure: card text is `·······\n  Quinn Testwood\n  ⚠ 14·······` — no clan/BP (grid card is name + audit/ordeal badges only).
- Throwaway debug spec (`tests/_debug-panel.spec.js`, since deleted) probed the detail panel in the harness:
  - **View mode**: `#sh-content` innerHTML length = **0** — the sheet body does not render. Cause: `renderSheetWithOverlay` (admin.js:118-126) awaits `loadTrackerState` + `loadStMods` and applies the rules-derived overlay before `renderSheet`; the harness can't load the rules cache (`preloadRules failed … issue #249`) and the tracker/st_mods endpoints aren't fully mocked, so the view-mode body never paints. `.sh-faction-label` count = 0.
  - **Edit mode**: `#sh-content` length = **80311** — renders synchronously (admin.js:112-115 calls `renderSheet` directly, no async awaits). Clan is a `<select>` with value `Mekhet`; BP is a stat cell with text `2BP` (`.sh-stat-n` = `2`, label `BP`). Stat cells: `["2BP","6Humanity","7Health","4Willpower","5Size","9Speed","2Defence"]`.

### Implementation Plan

Test-only change to `tests/char-editor-save.spec.js`. Remove the stale grid-card assertion; add a detail-sheet assertion. Because the harness cannot render the **view-mode** sheet (rules-cache dependency), assert against the **edit-mode** sheet, which renders reliably.

### Completion Notes List

- **Removed** the stale test "character card shows clan and blood potency" from the `Char Editor — Grid` block (clan/BP are not on the minimal card; the card's name is already covered by "character card renders in grid with correct name").
- **Added** "editor sheet shows clan and blood potency" to the `Char Editor — Detail Panel` block: enters edit mode, asserts `#sh-content` is non-empty, the clan `<select>` (the one carrying clan options, located by `filter({ hasText: 'Mekhet' })`) `toHaveValue('Mekhet')`, and the `BP` stat cell `.sh-stat-n` `toHaveText('2')`.
- **Adaptation from the story's recommended approach:** the story proposed asserting `.sh-faction-label` in the **view-mode** detail sheet. That is not achievable in this E2E harness — the view-mode sheet body does not render without the rules cache (a large dependency the mocked environment can't supply). The edit-mode sheet is the reliable surface and still verifies clan + BP render with the correct values. Functionally meaningful coverage preserved; only the surface (edit vs view) and clan locator (select value vs faction label) changed.
- **BP assertion tightened**: scoped to the BP stat cell's `.sh-stat-n` rather than the old loose `toContain('2')`.
- **No production code changed.** The grid-card and sheet renders are correct as designed; this was purely a stale/over-loose test.
- **Verification**: `npx playwright test tests/char-editor-save.spec.js` → **7 passed**. The temporary debug spec was deleted before completion.

### File List

- `tests/char-editor-save.spec.js` (modified) — removed stale grid-card clan/BP test; added edit-mode detail-sheet clan/BP test
- `specs/stories/fix.576.grid-card-test-stale-assertion.story.md` (this story)

### Change Log

- 2026-06-04 — Repaired stale editor test: replaced the grid-card "shows clan and blood potency" assertion (clan/BP no longer on the redesigned card) with an edit-mode detail-sheet assertion (clan select = Mekhet, BP cell = 2). Test-only; `char-editor-save.spec.js` now 7/7 green. (Issue #576)
- 2026-06-04 — QA (Quinn): Approve. Mutation-tested both assertions (proven to fail on wrong data). See QA Review.

## QA Review (Quinn)

**Outcome: Approve.** The stale assertion is gone, the replacement is meaningful, and the harness-driven deviation is sound.

**Mutation testing (the key check — does the new test actually catch wrong data?):**
- Clan: mutated fixture `Mekhet → Ventrue`, ran the test → **failed** as required (`toHaveValue` Expected "Mekhet", Received "Ventrue"). The `filter({ hasText: 'Mekhet' })` locator still resolved to exactly one select (the clan dropdown retains all clan options regardless of selection), so no strict-mode multiple-match flake.
- Blood potency: mutated fixture `2 → 7`, ran the test → **failed** as required (`toHaveText` Expected "2", Received "7"). The BP locator (`.sh-stat-cell` hasText `BP` → `.sh-stat-n`) is correctly scoped — the old loose `toContain('2')` would have passed on plenty of wrong data; this one does not.
- Fixture restored; full spec re-run → **7 passed**.

**Robustness:**
- `not.toBeEmpty()` on `#sh-content` guards the empty-sheet failure mode that this whole story uncovered.
- BP cell label `BP` is unique among stat cells (`2BP, 6Humanity, 7Health, 4Willpower, 5Size, 9Speed, 2Defence`), so `hasText: 'BP'` selects unambiguously.
- Clan `<select>` is the only select containing a `Mekhet` option (covenant/bloodline/priority selects do not), so the filter is unambiguous.

**Deviation from the story's recommended approach — sound.** The story proposed asserting `.sh-faction-label` in the view-mode sheet; I independently confirm that surface is unrenderable in this harness (`#sh-content` length 0 in view mode — `renderSheetWithOverlay` blocks on the rules cache, which `preloadRules` can't load under mocked endpoints). Edit mode renders synchronously and is the correct surface. Coverage intent (clan + BP visible with correct values) is preserved.

**No production code changed** — confirmed the diff is confined to `tests/char-editor-save.spec.js`. The grid card and sheet renders were correct; this was purely a stale + over-loose test.

**Follow-up (non-blocking):** view-mode detail-sheet content is untestable in E2E without standing up the rules cache (the reason no existing test asserted sheet body). If view-mode sheet coverage is ever wanted, that needs a `/api/rules` mock — a larger piece, out of scope here.
