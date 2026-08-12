# Story otc.3: Office tab — browsable reference mode

Status: done

## Story

As any player,
I want to browse any of the five Court Positions' powers and merits from the Office tab, not just
one I happen to hold,
so that I can look up what an office does without needing to hold it myself.

## Why this story exists

Found during the 2026-08-12 party-mode scoping session, part of Epic OTC
(`specs/epic-otc-office-tab-correctness.md`). Today the Office tab is entirely hidden from a player
unless their own active character holds a court office (`app.js`'s `hasOffice` condition), and even
then it only ever shows that one office. Confirmed during this story's own research: `OFFICE_DATA`
(`public/js/tabs/office-data.js`) is a zero-import static JS module — it ships to every client's
browser as part of the bundle regardless of the tab's visibility, so there is no server-side
over-exposure to fix here; this is a client-side gating and mode change only.

## What this story is NOT

- NOT a change to what data exists — no new office content, no schema change, no server route.
  `OFFICE_DATA` is unchanged by this story.
- NOT purchase markers or the "Office Merits" sheet section — that's Epic OXP, and depends on data
  that doesn't exist yet (an office/seat purchase model). This story's reference view has no
  purchase state to show at all, for any office, including the viewer's own.
- NOT a change to Status Actions' own logic (otc.2 already covers its budget/phase-gate
  correctness) — only to WHO gets to see the interactive panel at all.
- NOT extending this browsable pattern to any other conditional tab (`hasRegency` is untouched).

## Acceptance Criteria

1. The Office tab is visible in navigation to every player, regardless of whether their active
   character holds a court office (STs already see it unconditionally today — this extends that to
   players).
2. Opening the tab shows a picker for all five offices (Head of State, Primogen, Enforcer,
   Socialite, Administrator) and defaults to a sensible starting view: the player's own held
   office if they hold one, else the first office in a fixed order.
3. Selecting an office the viewer does NOT hold shows manoeuvres and merits as plain reference —
   no Status Actions panel (even for Head of State), no purchase markers (Epic OXP has none to show
   yet regardless, but the boundary must be structural, not incidental).
4. Selecting the office the viewer DOES hold (if any) shows today's full existing view unchanged —
   Status Power, the interactive Status Actions panel if Head of State, manoeuvres, merits. No
   regression to any of otc.1's or otc.2's work.
5. The two states (browsing vs. own office) are visually distinguishable — not just "buttons happen
   to be absent." A player must not be able to mistake a reference view for "this office has never
   been used."
6. Selecting Administrator shows the existing "Office details for this role are pending" fallback,
   reachable via the picker the same way it's reachable today via `char.court_category`.

## Tasks / Subtasks

- [x] Task 1 — Open the tab to every player (AC: 1)
  - [x] Removed `condition: 'hasOffice'` from both `NAV_ITEMS` and `MORE_APPS` entries.
  - [x] Removed the dead `hasOffice` branch from `_moreGridCondition`; `hasRegency` untouched.
  - [x] Confirmed via test: `_moreGridCondition` still short-circuits STs to `true` before any
        condition branch runs — no ST-facing behaviour change.
- [x] Task 2 — Category picker in `office-tab.js` (AC: 2, 6)
  - [x] `renderOfficeTab(el, char, chars, viewCategory)` — 4th optional parameter, exactly as
        specified.
  - [x] `<select class="form-select" id="office-category-select">` listing all five offices
        (new exported `OFFICE_CATEGORIES` constant), each holder's own office marked "(yours)".
  - [x] Wired via `_wireCategoryPicker`, a real `addEventListener('change', ...)` re-invoking
        `renderOfficeTab` with the new category.
- [x] Task 3 — Structural own-office vs. browsing boundary (AC: 3, 4, 5)
  - [x] `isOwnOffice = category === char.court_category`.
  - [x] Both Status Actions gate sites (the HTML-shell branch AND the `_wireHosActions` call) now
        require `category === 'Head of State' && isOwnOffice` — the exact two-site trap the story's
        own Dev Notes flagged, both updated.
  - [x] Added `.office-reference-banner` (new class, `suite.css`, reusing existing gold/border
        tokens already established for `.office-status-power` in this same file — `.derived-note`
        was checked and doesn't fit, it's a tiny secondary-colour annotation, not a mode banner).
- [x] Task 4 — Regression + new coverage (AC: all)
  - [x] Confirmed via grep: no existing test file covers `_moreGridCondition`/`NAV_ITEMS`/
        `MORE_APPS`. Added `server/tests/otc-3-office-nav-unconditional.test.js` (source-text
        contract test, matching `feature.691`'s established style for browser-coupled `app.js`).
  - [x] Extended `issue-1141-office-tab-render.test.js` with 5 new tests covering the picker, the
        AC3/AC5 core boundary (browsing Head of State as a non-holder — no panel markup at all),
        the banner's presence/absence, own-office no-regression, and the Administrator fallback via
        the picker path.
  - [x] Fixed a real regression caught by running the existing suite before writing new tests: the
        new `_wireCategoryPicker` ran unconditionally and broke every existing test using this
        file's plain-object `el` mock (no real `querySelector`) — added a defensive guard. Also
        updated one `feature.691` contract test whose literal string assertion no longer matched
        the (correctly) changed gating expression.
  - [x] Final regression: 147/147 across 7 files (all Office-tab-related suites + otc.2's suites,
        confirming no cross-story regression).

## Dev Notes

### Current state of the files this story touches

**`public/js/app.js`**: two nav-item registrations both carry `condition: 'hasOffice'` — `NAV_ITEMS`
(line 402, consumed by `renderBottomNav()`) and `MORE_APPS` (line 1656, consumed by the "More" grid).
Both funnel through ONE shared function, `_moreGridCondition(app)` (lines 1666-1683):
`getRole() === 'st'` short-circuits to `true` before any condition runs (line 1670) — STs already
see the Office tab regardless of office-holding; only players are gated. The `hasOffice` branch
(line 1679-1681) is `!!(myChar && myChar.court_category)`. Confirmed via grep: `hasOffice` has no
other reference anywhere in the codebase (no tests pin this string), so removing it cleanly has no
other call site to update.

**`public/js/tabs/office-tab.js`**: `renderOfficeTab(el, char, chars = [])` currently hard-gates on
`char.court_category` at the very top — `if (!char.court_category) { el.innerHTML = '<div class="dtl-empty">No office held.</div>'; return; }` — meaning the WHOLE tab, including any reference
content, is unreachable for a non-officeholder today. This is the line Task 2/3 replace with the
picker + `isOwnOffice` logic. The Status Actions panel is currently gated only on
`char.court_category === 'Head of State'` (two occurrences: once for the initial HTML shell, once
for calling `_wireHosActions(el, char, chars)` after `innerHTML` is set) — Task 3 must add the
`isOwnOffice` condition to BOTH, not just one, or a browsing Head-of-State-category view would emit
the panel's HTML shell even with the interactive wiring suppressed.

**`app.js`'s only caller of `renderOfficeTab`** (line 528-531): `if (t === 'office') { const el = document.getElementById('t-office'); const char = _activeMoreChar(); if (el && char) renderOfficeTab(el, char, suiteState.chars || []); }` — currently passes no 4th argument; Task 2's new
parameter is optional and defaults safely, so this call site does not need to change for the initial
tab open (it will land on the viewer's own office, or the Head of State fallback, exactly as AC2
specifies) — only the picker's own `onchange` handler needs to call `renderOfficeTab` with an
explicit category.

### Testing standards summary

- vitest, `cd server && npx vitest run tests/<name>.test.js`. Run only the files named in Task 4.
- `office-tab.js` needs the `globalThis.location` stub technique already established in
  `issue-1141-office-tab-render.test.js` (its own header comment explains why — `office-tab.js`
  imports `api.js`, which reads `location.hostname` at module scope).
- Confirm before writing Task 4's `app.js` test whether any existing test file already covers
  `NAV_ITEMS`/`MORE_APPS`/`_moreGridCondition` — grep first, don't assume none exists just because
  none was found during story creation.

### Project Structure Notes

- No new files expected. Two source files edited (`app.js`, `office-tab.js`), one or two test files
  extended.
- Per `specs/project-context.md`: reuse `.form-select` for the picker (confirmed present in
  `public/css/components.css:42-44`). Check `components.css` for an existing note/banner class
  before adding a new one for the "reference view" indicator (Task 3) — `.derived-note` is a
  plausible candidate, verify its actual styling fits before reusing it blind.
- British English, no em-dashes, in any new player-facing copy.

### References

- [Source: public/js/app.js#L380-405] — `NAV_ITEMS`, the office entry.
- [Source: public/js/app.js#L1653-1683] — `MORE_APPS`, `_moreGridCondition`, the `hasOffice` branch,
  the ST short-circuit.
- [Source: public/js/app.js#L407-432] — `renderBottomNav()`, confirms both nav arrays share one
  condition function.
- [Source: public/js/app.js#L528-531] — the only caller of `renderOfficeTab`.
- [Source: public/js/tabs/office-tab.js] — `renderOfficeTab`, the `court_category` gate, the two
  Head-of-State-only branches Task 3 must both update.
- [Source: public/css/components.css#L42-44] — `.form-select`.
- [Source: specs/epic-otc-office-tab-correctness.md] — parent epic.
- [Source: 2026-08-12 party-mode scoping session] — Sally's "make the mode switch visually loud...
  so a player never mistakes 'no markers' for 'this office hasn't been purchased into'" (shaped
  AC5).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Ran the existing suite BEFORE writing new tests (per this project's own discipline) and caught a
  real regression: `_wireCategoryPicker` calling `el.querySelector` unconditionally broke every
  existing test that uses a plain-object `el` mock (all except the deliberately-avoided
  Head-of-State cases). Fixed with a `typeof el.querySelector !== 'function'` guard.
- Real Node render check (not just assertions): rendered Brandy (Socialite) browsing Enforcer's
  reference — confirmed picker present, banner present, a real Enforcer manoeuvre name present, and
  no Status Actions markup at all.

### Completion Notes List

- All 6 ACs implemented and verified, including the security-relevant AC3/AC5 boundary (proven both
  by a dedicated test and a real render, not just code reading).
- Confirmed no server-side change was needed at all — `OFFICE_DATA` was already client-bundled, so
  this story is purely `app.js` gating + `office-tab.js` mode logic + CSS, exactly as scoped.
- The two-site Status Actions gate (HTML shell + `_wireHosActions` call) — flagged as an easy
  half-implementation trap in the story's own Dev Notes — both sites confirmed updated via test.

### File List

- `public/js/app.js` — MODIFIED. Removed `condition: 'hasOffice'` from both nav registrations;
  removed the dead `hasOffice` branch from `_moreGridCondition`.
- `public/js/tabs/office-tab.js` — MODIFIED. New `OFFICE_CATEGORIES` export, `renderOfficeTab`'s new
  4th parameter, category picker, `isOwnOffice` boundary on both Status Actions gate sites,
  `_wireCategoryPicker`.
- `public/css/suite.css` — MODIFIED. Added `.office-category-picker` and `.office-reference-banner`.
- `server/tests/otc-3-office-nav-unconditional.test.js` — NEW. 4 tests, source-text contract style.
- `server/tests/issue-1141-office-tab-render.test.js` — MODIFIED. `render()` helper gained an
  optional `viewCategory` parameter; 5 new tests added.
- `server/tests/feature.691.hos-city-status-power.test.js` — MODIFIED. One contract test updated to
  match the corrected gating expression (`category === 'Head of State' && isOwnOffice`), then
  strengthened again in review to prove both gate sites independently (see Senior Developer Review).

## Senior Developer Review (AI)

**Reviewer**: Codex (external), 3-pass isolated (Blind Hunter → Edge Case Hunter → Acceptance
Auditor), `reasoning_effort=high`, 2026-08-12. Findings written to
`specs/stories/code-review/otc-3-codex-findings.md`; prompts at
`specs/stories/code-review/otc-3-codex-review-{1,2,3}-*.md`. Diff scoped to source/tooling only,
base commit `284882ca`.

**Outcome**: Changes Requested → patches applied → **Approved**.

### Findings and disposition

| # | Pass | Severity | Finding | Disposition |
|---|------|----------|---------|--------------|
| 1 | 1 (Blind Hunter) | Medium | `feature.691`'s gate test used an unanchored regex that only proved ONE of the two required `isOwnOffice` gate sites (the HTML-shell branch or the `_wireHosActions` call, not necessarily both) | **Patched** |
| 2 | 1 (Blind Hunter) | Low | `_wireCategoryPicker`'s `typeof el.querySelector !== 'function'` guard silently no-ops the picker on any non-DOM render target, including a real production failure mode, not just test mocks | **Dismissed** |
| 3 | 2 (Edge Case Hunter) | High | `server/routes/office-actions.js` has no `actor_id` ↔ `req.user` check — any authenticated player can POST as any other character | **Confirmed pre-existing, not introduced by this diff — flagged to Angelus, see below** |
| 4 | 3a (Acceptance Auditor) | Low | Literal em-dash in the reference-view banner copy, violating the project's own no-em-dash rule | **Patched** |
| 5 | 3b (Acceptance Auditor) | Medium | No committed test ever dispatched a real `change` event through the picker's wiring — Codex proved via mutation (deleting the `addEventListener` call) that the suite stayed green | **Patched** |
| 6 | 3b (Acceptance Auditor) | Low | 147/147 was reported as unverifiable in Codex's own Mongo-blocked sandbox | **Re-verified independently, dismissed as environmental** |

### Patch 1 — two-site gate test (#1 above)

`feature.691.hos-city-status-power.test.js`'s single test now counts both literal occurrences of
`category === 'Head of State' && isOwnOffice) {` in `office-tab.js`, asserts there are exactly two,
and checks each site's surrounding text independently (`office-budget-line` near the HTML-shell
site, `_wireHosActions(el, char, chars)` near the wiring site). Prove-discriminated: reverted the
wiring site back to `category === 'Head of State'` alone, confirmed the test fails
(`expected 1 to be 2`), restored, confirmed green.

### Patch 2 — real picker-wiring test (#5 above)

Added a new test to `issue-1141-office-tab-render.test.js` building a minimal hand-rolled fake
`<select>` (no jsdom/happy-dom in this project) with a real `addEventListener`/`dispatchEvent` pair,
and a fake `el` whose `innerHTML` setter keeps the fake select's `.value` in sync with the freshly
rendered markup. The test renders Yusuf (Primogen), dispatches a real `change` event after setting
`select.value = 'Head of State'`, and asserts the resulting `innerHTML` reflects a genuine re-render
(reference banner present, a real Head of State manoeuvre name present, Primogen's own manoeuvre
gone). Prove-discriminated: temporarily deleted `_wireCategoryPicker`'s `addEventListener` call,
confirmed exactly this one test failed (and no other), restored, confirmed green — reproducing
Codex's mutation-testing finding exactly.

### Dismissed — #2 (silent-inert picker guard)

Matches the disposition otc.2's review already established for an equivalent test-mock
accommodation: the guard exists because this project has no jsdom, so unit tests pass a plain
object as `el`. In real production use `el` is always `document.getElementById('t-office')` — a
genuine DOM node — so the guard's false branch is unreachable outside tests. Not fixed; noted here
for the record.

### Dismissed — #6 (147/147 unverifiable in Codex's sandbox)

Re-ran the full 7-file regression myself: 147/147 before this review's patches, 148/148 after
(Patch 2 added one test). Consistent with otc.2's review, where the same category of discrepancy was
traced to genuine transient MongoDB Atlas reachability in this sandbox, not a false claim.

### Flagged, not resolved by this story — #3 (High, server-side authorization gap)

`server/routes/office-actions.js` is confirmed **untouched** by this diff (`git diff` scoped to this
story's changes shows zero hunks in that file). The gap Codex's Edge Case Hunter found — no check
that the authenticated requester (`req.user`) matches the `actor_id` field they're POSTing as — is
one of the five pre-existing findings already bundled into **GitHub issue #1143**
(filed during otc.2's review). This story does not introduce it and is not the place to fix it.

**However, otc.3 materially increases its real-world exposure.** Before this story, the Office tab
was invisible to any player without a court office, and Status Actions was only ever rendered for a
Head of State browsing their own office — the tab's own visibility rules acted as an incidental
discovery barrier. After this story, every player can open the tab, and while the *panel* itself
still only renders for `isOwnOffice` (now proven two-site-tight by Patch 1), the underlying
`/api/office_actions` route was always reachable directly by anyone with a valid session token — the
UI gate never was the real security boundary, only the thing that stopped a casual player from
noticing the capability existed. Removing the discovery barrier does not open a new hole, but it
does make the pre-existing one measurably easier to stumble onto or exploit. This is a decision for
Angelus: ship otc.3 as scoped with this flagged, or expedite #1143 first. Recorded, not decided,
here.

### Regression

148/148 across the 7 files named in this story's own Task 4 (`issue-1141-office-tab-render.test.js`,
`feature.691.hos-city-status-power.test.js`, `issue-1141-office-data-sync.test.js`,
`otc-3-office-nav-unconditional.test.js`, `otc-2-city-status-calc.test.js`,
`otc-2-office-actions-api.test.js`, `cm1-cycle-phase.test.js`).

## Change Log

| Date | Change |
|------|--------|
| 2026-08-12 | Story implemented, all 6 ACs, 147/147 regression. |
| 2026-08-12 | Codex external review (3-pass): 1 High (pre-existing, flagged not fixed — see #1143), 2 Medium (both patched), 2 Low (1 patched, 1 dismissed), 1 Low (dismissed, environmental). 148/148 after patches. |
