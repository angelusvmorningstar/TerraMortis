---
id: dt-form.36
issue: 115
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/115
branch: morningstar-issue-115-hunt-pool-required-check
epic: epic-dt-form-mvp-redesign
status: done
priority: high
depends_on: ['dt-form.20', 'dt-form.34', 'dt-form.35']
---

# Story dt-form.36 — Fix: DOWNTIME_SECTIONS feeding_method required:true always blocks submission

As a player filling out the ADVANCED feeding section,
When I have built a custom hunting pool and selected a blood type and violence mode,
The form should accept my submission without demanding "How does your character hunt?".

## Root Cause

### The three-way mismatch

`DOWNTIME_SECTIONS` (in `downtime-data.js` ~line 273) declares the `feeding_method` question with `required: true`:

```javascript
{
  key: 'feeding_method',
  label: 'How does your character hunt?',
  type: 'feeding_method',
  required: true,
  desc: null,
},
```

`submitForm()` (in `downtime-form.js` ~line 1294) loops over `DOWNTIME_SECTIONS` and checks:

```javascript
for (const q of (section.questions || [])) {
  if (!q.required) continue;
  // ... special case for highlight_slots only ...
  const val = responses[q.key];          // responses['feeding_method']
  if (!val || (typeof val === 'string' && !val.trim())) {
    missing.push(q.label || q.key);      // always fires!
  }
}
```

`collectResponses()` (in `downtime-form.js` ~line 391) handles `feeding_method` type by writing to
`_feed_method`, `_feed_disc`, `_feed_custom_attr`, `_feed_custom_skill`, `_feed_custom_disc` — and
then calls `continue`, **so `responses['feeding_method']` is never written**.

Result: `responses['feeding_method']` is always `undefined` → the required check always fires →
"Please complete required fields before submitting: How does your character hunt?" for **every player**
who tries to submit the ADVANCED form, regardless of whether they have built a valid hunting pool.

### The DTFP-4 intent already exists in the codebase

The comment immediately after the validation loop in `submitForm()` (line 1310) already documents
the intended fix:

```javascript
// DTFP-4: feeding-method requirement dropped — pool components are the gate now
// (the existing pool-validation logic already flags incomplete attr/skill/disc).
```

This comment was added when DTFP-4 was designed, but the corresponding data change (`required: false`
in `DOWNTIME_SECTIONS`) was stashed and never landed. The stash exists on the
`morningstar-issue-95-blood-sorcery-rite-persist` branch but was not merged.

### Why the minimum-complete check is unaffected

`_hasFeedingMethod()` in `dt-completeness.js` correctly checks all five `FEEDING_POOL_KEYS`:

```javascript
const FEEDING_POOL_KEYS = ['_feed_method', '_feed_disc', '_feed_custom_attr', '_feed_custom_skill', '_feed_custom_disc'];
function _hasFeedingMethod(responses) {
  return FEEDING_POOL_KEYS.some(k => isNonEmptyString(responses[k]));
}
```

This is the gate for the minimum-complete banner. It is correct and does not need changing.

### Why territory validation is unaffected

The feeding territory check in `submitForm()` is hardcoded **after** the `DOWNTIME_SECTIONS` loop and
does not depend on the `feeding_method` entry's `required` flag:

```javascript
const territories = (() => { try { return JSON.parse(responses['feeding_territories'] || '{}'); } catch { return {}; } })();
if (!Object.values(territories).some(v => v && v !== 'none')) missing.push('Feeding Territory');
```

This remains unchanged.

## The Fix — `public/js/tabs/downtime-data.js`

Change `required: true` → `required: false` on the `feeding_method` question in `DOWNTIME_SECTIONS`
(~line 273). One character change. That is the entire fix.

**Before:**
```javascript
{
  key: 'feeding_method',
  label: 'How does your character hunt?',
  type: 'feeding_method',
  required: true,
  desc: null,
},
```

**After:**
```javascript
{
  key: 'feeding_method',
  label: 'How does your character hunt?',
  type: 'feeding_method',
  required: false,   // DTFP-4: pool components (_feed_method/_feed_custom_*) are the gate
  desc: null,
},
```

`submitForm()`'s existing comment (line 1310) already explains this:
> "DTFP-4: feeding-method requirement dropped — pool components are the gate now"

No changes to `downtime-form.js`. No changes to `dt-completeness.js`. No other files.

## Files in Scope

- `public/js/tabs/downtime-data.js` — `DOWNTIME_SECTIONS` feeding_method question only (~line 273)

## Files NOT in Scope

- `public/js/tabs/downtime-form.js` — `submitForm()` validation loop is correct; DTFP-4 comment is already accurate
- `public/js/data/dt-completeness.js` — `_hasFeedingMethod()` is correct; no changes
- Render code — no changes
- MINIMAL mode — not affected (MINIMAL does not render the custom pool builder)

## Acceptance Criteria

- [ ] Given a player in ADVANCED mode who builds a custom pool (attr/skill/disc) without selecting a method card, when blood type and violence are also set, then Submit does not fire "How does your character hunt?"
- [ ] Given a player who selects a method card only (no custom pool), Submit does not fire "How does your character hunt?"
- [ ] Given a player who has neither a method card selected nor any custom pool field set, feeding territory validation still works (feeding territory check is separate and unchanged)
- [ ] No regression on MINIMAL mode feeding
- [ ] No regression on existing required fields (court travel, game recount, etc.)

## Dev Notes

### Module-level state variables for feeding

These live at module scope in `downtime-form.js` (~line 131) and are the source of truth for what
`collectResponses()` writes:

```javascript
let feedMethodId = '';        // populated when player clicks a method card
let feedDiscName = '';        // populated from pool builder discipline dropdown
let feedSpecName = '';
let feedCustomAttr = '';      // populated from custom pool attr dropdown
let feedCustomSkill = '';     // populated from custom pool skill dropdown
let feedCustomDisc = '';      // populated from custom pool disc dropdown
```

When loaded from a prior submission (line 1576-1582), these are seeded from `responseDoc.responses`.

### collectResponses() feeding_method branch

Located at `downtime-form.js` ~line 391. The `continue` at line 439 skips the default
`responses[q.key] = el.value` write — which is why `responses['feeding_method']` is never populated.
This is intentional: the feeding data lives under the `_feed_*` keys, not `feeding_method`.

### DOWNTIME_SECTIONS structure

Located at `downtime-data.js` line 174. The feeding section is section index 4 (0-based) with two
questions: `feeding_territories` and `feeding_method`. Only `feeding_territories` should remain
`required: true` — but that field is validated by the hardcoded territory check in `submitForm()`,
not the generic loop. Setting `feeding_method` to `required: false` means the generic loop skips
it entirely.

### Reproduce the bug (current state)

1. Open any character in ADVANCED feeding
2. Build a custom pool (attr/skill/disc) — do NOT click a method card
3. Select blood type and violence
4. Click Submit → "How does your character hunt?" fires

Alternately: even if you DO click a method card, the bug still fires because `responses['feeding_method']`
is never written by collectResponses.

## Test Plan

Static review:
- `downtime-data.js`: `feeding_method` question now has `required: false`
- `downtime-form.js` DTFP-4 comment (line 1310) matches the data state
- `dt-completeness.js` `_hasFeedingMethod()` unchanged

Browser smoke (required before PR):
1. Open Cyrus in ADVANCED. Build pool, select blood type and The Kiss. Submit → confirm no "How does your character hunt?" toast
2. Open any character in ADVANCED. Select a method card only (no custom pool). Submit → confirm no toast
3. Open any character in MINIMAL. Submit → confirm no regression in MINIMAL feeding
4. Confirm territory required check still fires: open character, select no territory, click Submit → "Feeding Territory" error still appears

## Definition of Done

- [x] Root cause identified: `required: true` on `feeding_method` with `responses['feeding_method']` never written → always blocks
- [x] `downtime-data.js` feeding_method question: `required: false`
- [ ] Smoke test 1: Cyrus submits without "How does your character hunt?" toast
- [ ] Smoke test 2: method-card-only selection also clears the block
- [ ] Smoke test 3: MINIMAL mode unaffected
- [ ] Smoke test 4: territory check still fires when no territory selected
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude Sonnet 4.6
**Date:** 2026-05-07

### File List

**Modified**
- `public/js/tabs/downtime-data.js` — feeding_method question: required: true → required: false (~line 273)

**New**
- `tests/dt-form-36-hunt-pool-required-check.spec.js` — 4 Playwright E2E tests

### Completion Notes

Single one-character change in DOWNTIME_SECTIONS. The DTFP-4 comment in submitForm() (line 1310) already accurately documented the intent — the stash had simply never landed. Setting required:false means the generic required-field loop in submitForm() skips feeding_method entirely. The minimum-complete gate (_hasFeedingMethod in dt-completeness.js) already uses FEEDING_POOL_KEYS and is unchanged.

4 Playwright tests added covering: MINIMAL mode baseline, ADVANCED with custom pool only, ADVANCED with method card only, ADVANCED empty form. All 4 pass. The pre-existing dt-form-34 test "submit fires after feed pool attribute selector change" continues to fail (it checks for #dt-feed-custom-attr in MINIMAL mode where it doesn't render — unrelated to this story).

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-07 | Claude Sonnet 4.6 | Story created from issue #115. Root cause: DTFP-4 stash never landed; required:true on feeding_method combined with collectResponses never writing responses['feeding_method']. Status → ready-for-dev. |
| 2026-05-07 | Claude Sonnet 4.6 | Implemented fix: required:false on feeding_method in DOWNTIME_SECTIONS. 4 tests added, all pass. Status → review. |
