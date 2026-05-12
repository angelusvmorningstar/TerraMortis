---
id: fix.48
task: 48
issue: 113
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/113
branch: morningstar-issue-113-feed-card-highlight-sync
epic: epic-dt-form-mvp-redesign
status: review
priority: high
---

# Story fix.48 — DT form: feeding method card highlights without registering as selected

As a player whose prior submission included a feeding method,
When I open the downtime form in ADVANCED mode,
The method card should be highlighted AND validation should pass — not show "Feeding: choose Kiss or Violent" as missing.

## Context

**The visual/validation split.** Two separate systems drive feeding state:

1. **Visual highlight** — driven by the in-memory variable `feedMethodId`. On load,
   `feedMethodId` is restored from `responseDoc.responses['_feed_method']` (line 1293),
   so the correct card appears highlighted.

2. **Violence toggle pre-select** — driven by
   `FEED_VIOLENCE_DEFAULTS[feedMethodId]` in the HTML render (line 5748). This is
   visual-only: it does not write to `responseDoc.responses.feed_violence`.

3. **Completeness banner** — `renderForm()` calls `isMinimalComplete(saved, ctx)` at
   line 1719, where `saved = responseDoc.responses` (raw stored object). It reads
   `saved.feed_violence` directly. If that field is empty (common for submissions that
   predated DTFP-5 or where the player never explicitly clicked the violence toggle),
   `_hasFeedingViolence()` fails → banner shows "Feeding: choose Kiss or Violent".

**Net result:** method card visually highlighted (good), violence button visually
pre-selected (good), but `responseDoc.responses.feed_violence` is empty (bad) → banner
lies to the player.

This is different from the SAVE path (line 952), where `collectResponses()` IS called
and does backfill `feed_violence` from `FEED_VIOLENCE_DEFAULTS`. So the state heals
after the first auto-save cycle — but the player sees a false error before that.

## Root Cause

Initialization block at lines 1291–1301 in `downtime-form.js`:

```javascript
if (responseDoc?.responses) {
  feedMethodId = responseDoc.responses['_feed_method'] || '';
  feedDiscName = responseDoc.responses['_feed_disc'] || '';
  // ...
  // ← feed_violence is never backfilled here
}
```

`feed_violence` in `responseDoc.responses` remains whatever was last saved (possibly
empty). The visual default (`FEED_VIOLENCE_DEFAULTS`) is only applied at render time
for display — it is never written back to `responseDoc.responses` on load.

## Files in Scope

- `public/js/tabs/downtime-form.js` — 2–3 line addition in the feeding restore block
  (~line 1298, immediately after `feedDiscName` etc. assignments)
- `tests/fix-48-feed-card-violence-sync.spec.js` — new: 3 Playwright tests

## Files NOT in Scope

- `public/js/data/dt-completeness.js` — no logic change; root cause is upstream
- `public/js/tabs/downtime-data.js` — `FEED_VIOLENCE_DEFAULTS` is correct as-is
- `public/js/data/feeding-pool.js` — not involved
- Any server file

## Acceptance Criteria

**AC-1 — Prior method saved, violence not saved → banner correct on load**
Given a character has a saved submission with `_feed_method = 'seduction'` (or any
method that has a non-null default violence in `FEED_VIOLENCE_DEFAULTS`)
And `feed_violence` is absent or empty in the saved responses
When the ADVANCED feeding section renders
Then the method card IS visually highlighted
And the completeness banner does NOT show "Feeding: choose Kiss or Violent"

**AC-2 — No prior method → no card highlighted, banner requires selection**
Given a character has no saved feeding method
When the feeding section renders in ADVANCED mode
Then no method card is highlighted
And the completeness banner includes the feeding violence requirement

**AC-3 — Clicking any method card immediately satisfies violence (for default methods)**
Given the feeding section is open in ADVANCED mode
When the player clicks a method card whose method has a default violence
Then the card highlights AND the violence toggle highlights AND the banner no longer
reports "choose Kiss or Violent"

**AC-4 — Null-default methods (stalking, other) still require explicit violence pick**
Given the player selects 'stalking' or 'other' (both have `null` in
`FEED_VIOLENCE_DEFAULTS`)
When the method card is clicked
Then the card highlights AND the violence toggle shows no pre-selection
And the banner still reports "choose Kiss or Violent" until the player explicitly
clicks a violence button

**AC-5 — MINIMAL mode feeding is unaffected**
Given the form is in MINIMAL mode
The feeding section change produces no regressions (no new banner errors)

## Implementation Notes

### The fix — one location, 3 lines

In the feeding state restore block (~line 1298), after the `feedDiscName` etc.
assignments, add:

```javascript
if (responseDoc?.responses) {
  feedMethodId = responseDoc.responses['_feed_method'] || '';
  feedDiscName = responseDoc.responses['_feed_disc'] || '';
  feedSpecName = responseDoc.responses['_feed_spec'] || '';
  feedCustomAttr = responseDoc.responses['_feed_custom_attr'] || '';
  feedCustomSkill = responseDoc.responses['_feed_custom_skill'] || '';
  feedCustomDisc = responseDoc.responses['_feed_custom_disc'] || '';
  // fix.48: sync violence default into stored responses so the render-path
  // completeness check (isMinimalComplete(saved, ctx) at line 1719) agrees with
  // the visual pre-select. Only backfill if not already explicitly saved.
  if (!responseDoc.responses.feed_violence && feedMethodId && FEED_VIOLENCE_DEFAULTS[feedMethodId]) {
    responseDoc.responses.feed_violence = FEED_VIOLENCE_DEFAULTS[feedMethodId];
  }
}
```

**Why this is safe:**
- Only applies when `feed_violence` is empty/absent — never overrides an explicit player
  choice.
- Only applies when `FEED_VIOLENCE_DEFAULTS[feedMethodId]` is truthy — `stalking` and
  `other` both have `null`, so those methods are untouched (player must still pick
  explicitly).
- `FEED_VIOLENCE_DEFAULTS` is already imported at line 16 — no new import needed.
- The save path (`collectResponses()` → `scheduleSave()`) already does equivalent logic
  at lines 393–396. This brings the load path into parity.

### Why "clicking again may or may not fix it" per the issue

For methods with a default (`seduction` → kiss, `force` → violent, etc.):
- Clicking the card triggers `collectResponses()` which backfills `feed_violence` from
  the default, then `renderForm()` picks it up → banner heals on click.

For methods with `null` default (`stalking`, `other`):
- Clicking the card calls `collectResponses()` but `_defaultViolence` is null → nothing
  is backfilled → banner still reports violence missing → player must click a violence
  button explicitly. This is intentional UX.

### Why Cyrus triggers it, Cazz doesn't

Cyrus: prior submission saved `_feed_method` but `feed_violence` was never written (e.g.,
submission predates DTFP-5, or player closed the form before the auto-save cycle ran).

Cazz: either has no prior submission (fresh form, no highlights at all) or has a
submission where `feed_violence` was explicitly clicked and saved.

### Do NOT touch

- The `collectResponses()` logic at lines 393–396 — it is correct and handles the save
  path already.
- `_hasFeedingViolence()` in `dt-completeness.js` — reads the right field (`feed_violence`).
- `renderForm()` completeness evaluation at line 1719 — `isMinimalComplete(saved, ctx)`
  is correct; this story aligns the data, not the check.
- FEED_VIOLENCE_DEFAULTS definition in `downtime-data.js` — already correct.

### Test approach

Use the Playwright harness from `tests/fix-47-minimal-feeding-advanced-hint.spec.js`
(`setupSuite`, `openDowntimeForm`, `switchToAdvanced`, `expandFeedingSection`).

For AC-1: inject a responseDoc with `_feed_method: 'seduction'` and no `feed_violence`
into the sandbox before render. After render, check that `.dt-feed-min-pool__advanced-hint`
is absent from the banner's missing list (or more precisely, confirm the completeness
banner does NOT contain "Kiss or Violent"). The simplest way:

```javascript
await page.evaluate(async (c) => {
  // ... set up sandbox ...
  const mod = await import('/js/tabs/downtime-form.js');
  // Provide a saved submission that has _feed_method but no feed_violence
  await mod.renderDowntimeTab(sandbox, c, [], {
    responses: { _feed_method: 'seduction' }
  });
}, char);
```

Then check the completeness banner text. If `renderDowntimeTab` does not accept a
responses override parameter, inject via `localStorage` or mock the submissions API
to return a document with those responses.

The mock approach (more reliable): in `setupSuite`, return a saved submission from
`GET /api/downtime_submissions?...` with `{ _feed_method: 'seduction' }` in responses
(and no `feed_violence`). After `openDowntimeForm`, expand the feeding section and
assert the banner's missing-items list does not include violence text.

**Banner selector:** The completeness banner is rendered inside `#dt-sandbox`. Find the
missing-items text — look for a `<ul>` or list of missing pieces near the banner. The
exact selector can be derived by searching for `dt-banner` or `qf-minimum-bar` in
`downtime-form.js`.

For AC-4 (null default): inject `{ _feed_method: 'stalking' }` with no `feed_violence`.
After render, confirm the banner still shows the violence requirement.

For AC-5 (MINIMAL regression): stay in MINIMAL mode (don't call `switchToAdvanced`),
confirm no new banner errors appear.

## Test Plan

1. `npx playwright test tests/fix-48-feed-card-violence-sync.spec.js` — all tests green.
2. `npx playwright test tests/fix-47-minimal-feeding-advanced-hint.spec.js` — no regressions.
3. `npx playwright test tests/fix-45-feeding-validation-false-block.spec.js` — no regressions.
4. Manual smoke: Open DT form for Cyrus in ADVANCED mode → confirm "choose Kiss or Violent"
   no longer appears in banner when method card is pre-highlighted.

## Definition of Done

- [x] `public/js/tabs/downtime-form.js` — 3-line backfill in feeding restore block
- [x] AC-1: default-violence methods load without banner violence error
- [x] AC-2: no prior method → no highlight, banner requires selection
- [x] AC-3: clicking default-violence method card clears violence error immediately
- [x] AC-4: stalking/other still require explicit violence click
- [x] AC-5: MINIMAL mode unaffected (fix.47 + fix.45 regression suites green)
- [x] `tests/fix-48-feed-card-violence-sync.spec.js` created with 4 passing tests
- [x] No regressions in fix-47, fix-45 test suites

## Dev Agent Record

**Agent:** Claude (Morningstar)
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/tabs/downtime-form.js`

**Added**
- `tests/fix-48-feed-card-violence-sync.spec.js`

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | Claude (Morningstar) | 3-line backfill in feeding restore block (~line 1298): if `feed_violence` absent and method has a non-null default, write default into `responseDoc.responses.feed_violence`. 4 Playwright tests passing. No regressions. |

### Completion Notes

The render-path completeness check (`isMinimalComplete(saved, ctx)` line 1719) reads `responseDoc.responses` directly. On load, `feed_violence` was absent for prior submissions that predated DTFP-5 or where the player never explicitly clicked the toggle. The visual pre-select via `FEED_VIOLENCE_DEFAULTS` was display-only and never wrote to `responseDoc.responses`. Fix brings the stored state into parity with the visual state at restore time. Methods with `null` defaults (stalking, other) are intentionally excluded — player must still pick explicitly.
