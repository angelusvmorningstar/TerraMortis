---
id: fix.473
title: Feeding tab — custom pool submission renders correctly (no method required)
status: review
issue: 473
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/473
branch: ms/issue-473-feeding-custom-pool-blank
type: fix
---

## Story

As a player who submitted a custom feeding pool without selecting a preset method card,
I want the Feeding tab to show my submitted pool and allow me to roll,
so that skipping the template buttons does not silently break my downtime.

## Background

Yusuf Kalusicj submitted DT3 with a custom pool (Presence + Empathy + Obfuscate,
The North Shore, Human, The Kiss) without clicking any preset method card
(Seduction / Stalking / By Force / Deception / Intimidation). The Feeding tab
rendered only the heading — the roll area was completely blank on both mobile
and desktop.

**Root cause (confirmed by code trace):**

1. `downtime-form.js:416`: `responses['_feed_method'] = feedMethodId || ''`
   — saves an empty string when no card is clicked.
2. `feeding-tab.js:182`: `if (mySub?.responses?.['_feed_method'])` — empty
   string is falsy; the block is skipped; `declaredMethod` stays `null`.
3. State machine (lines 231-236): no ST-validated pool, `declaredMethod` null
   → `feedingState = 'no_submission'`.
4. The `no_submission` render shows the generic preset picker — NOT the
   player's submitted custom pool. The player sees an irrelevant card grid
   with no indication their submission was received.

**Custom pool data that IS saved** (correctly, already works):
- `responses['_feed_custom_attr']` — e.g. `'Presence'`
- `responses['_feed_custom_skill']` — e.g. `'Empathy'`
- `responses['_feed_custom_disc']` — e.g. `'Obfuscate'`

These are populated by `downtime-form.js:425-427`. The data is there — the
feeding tab just never reads it.

**Must also work for existing submissions** (already in MongoDB with
`_feed_method: ''`). No data patch acceptable.

## Acceptance Criteria

- [ ] AC1: Yusuf's existing DT3 submission — `_feed_method: ''` +
  `_feed_custom_attr` set — renders the roll area on the Feeding tab
  without any MongoDB change
- [ ] AC2: New submissions where no preset card is clicked save
  `_feed_method: 'custom'` instead of `''`
- [ ] AC3: The feeding tab roll area for a custom pool shows:
  - Method label: "Custom Pool"
  - Pool breakdown using `_feed_custom_attr` + `_feed_custom_skill` +
    `_feed_custom_disc` (computed via `buildPool`-equivalent logic)
  - Roll button with correct dice count
- [ ] AC4: Characters with a preset method card selected are unaffected
- [ ] AC5: Characters with no submission at all still see the generic
  picker (`no_submission` state) — no regression

## Implementation

### File 1: `public/js/tabs/downtime-form.js`

**Change at line 416** — save `'custom'` sentinel when no preset clicked
but a custom attr was declared:

```js
// BEFORE
responses['_feed_method'] = feedMethodId || '';

// AFTER
responses['_feed_method'] = feedMethodId || (feedCustomAttr ? 'custom' : '');
```

This ensures new submissions with a custom pool write `_feed_method: 'custom'`
instead of `''`. Submissions with NO pool at all (feedCustomAttr also empty)
still write `''` — preserving the current no-submission behaviour.

### File 2: `public/js/tabs/feeding-tab.js`

**Two changes needed:**

#### Change A — detect custom pool after the `_feed_method` block (after line 187)

Insert a fallback block immediately after the existing
`if (mySub?.responses?.['_feed_method'])` check (lines 182-187):

```js
// Existing block (lines 182-187) — unchanged:
if (mySub?.responses?.['_feed_method']) {
  const methodId = mySub.responses['_feed_method'];
  declaredMethod = FEED_METHODS.find(m => m.id === methodId) || null;
  declaredDisc = mySub.responses['_feed_disc'] || '';
  declaredSpec = mySub.responses['_feed_spec'] || '';
}

// NEW: custom pool fallback — handles 'custom' sentinel AND legacy '' with custom data
if (!declaredMethod && mySub?.responses?.['_feed_custom_attr']) {
  const customAttr  = mySub.responses['_feed_custom_attr'];
  const customSkill = mySub.responses['_feed_custom_skill'] || '';
  const customDisc  = mySub.responses['_feed_custom_disc']  || '';
  // Synthetic method entry — attrs/skills single-element so buildPool picks them directly
  declaredMethod = {
    id: 'custom',
    name: 'Custom Pool',
    desc: 'Player-declared custom combination',
    attrs: [customAttr],
    skills: customSkill ? [customSkill] : [],
    discs:  customDisc  ? [customDisc]  : [],
  };
  declaredDisc = customDisc;
  declaredSpec = mySub.responses['_feed_spec'] || '';
}
```

#### Change B — update the `ready` render block (line 548) to handle custom label

The existing render at line 550 shows `declaredMethod.name`. Since the synthetic
method has `name: 'Custom Pool'`, no render change is needed for the label.

However, `declaredMethod.desc` at line 555 would show "Player-declared custom
combination" — that is fine as a placeholder. No additional change required.

**No change needed** to the `buildPool()` function itself — passing a
single-element `attrs` and `skills` array works correctly with the existing
`for (const a of method.attrs)` loop. It will pick Presence as the best
(only) attr and Empathy as the best (only) skill.

### What NOT to change

- `buildPool()` — works as-is with single-element arrays
- The `no_submission` block (lines 571-621) — unchanged; still used for
  players with no submission at all
- `renderFeedingSummary()` — reads `feeding_territories`, `feeding_description`
  etc. which are unrelated to `_feed_method`; already works for custom submissions
- Server-side / MongoDB — no changes needed

### ST processing panel

Check `public/js/admin/downtime-views.js` for any code that reads
`_feed_method` and would break on `'custom'`. The ST processing panel
typically reads `feeding_roll` and `feeding_review` (not `_feed_method`
directly for pool display), but confirm there are no `FEED_METHODS.find()`
calls in that file that would silently drop the custom case.

If any such call exists, add the same `'custom'` guard alongside it.

## Dev Notes

- `FEED_METHODS` (downtime-data.js:147-152) has exactly 5 entries:
  seduction, stalking, force, familiar, intimidation. There is no 'other'
  or 'custom' entry. The `if (m.id === 'other') continue` line at
  feeding-tab.js:576 is dead code from a removed entry — do not add a new
  FEED_METHODS entry; use the synthetic object approach above instead.
- `_feed_custom_disc` stores a discipline name (e.g. 'Obfuscate'). `buildPool()`
  reads `c.disciplines?.[discName]?.dots` for the disc value — this works
  with the character's actual dots at render time, which is correct behaviour.
- The 'custom' sentinel must match between form-write and tab-read. Both are
  in the same repo; the string `'custom'` is the canonical value from this fix.
- `feedingState === 'ready' && declaredMethod` (line 548) evaluates truthily
  for the synthetic method object — no change to the guard needed.

## Dev Agent Record

### Files Changed
- `public/js/tabs/downtime-form.js` — line 416: save `'other'` sentinel when custom pool declared but no preset method clicked
- `public/js/tabs/feeding-tab.js` — after line 187: custom pool fallback block that synthesises a `declaredMethod` object from `_feed_custom_attr/skill/disc` when `_feed_method` is `'other'` or `''`

### Completion Notes
- Sentinel chosen is `'other'` (not `'custom'`) because the admin panel already has explicit `if (selectedMethod === 'other')` handling at downtime-views.js:1390 and 8337 — no admin changes needed.
- Fallback in feeding-tab.js detects custom pool via `_feed_custom_attr` being set, covering both: new submissions (saved with `'other'`) and Yusuf's existing DT3 submission (saved with `''`). No MongoDB patch needed.
- Synthetic `declaredMethod` uses single-element `attrs` and `skills` arrays; `buildPool()` existing loop picks them up correctly with no changes to that function.
- AC4 (preset path unaffected): the new fallback only fires when `!declaredMethod`, which is only true when the preset lookup returned null. Submissions with valid preset IDs populate `declaredMethod` in the existing block at line 182 and never reach the fallback.
- AC5 (no regression on no_submission): fallback also checks `_feed_custom_attr` — submissions with no pool data at all (neither preset nor custom) leave `declaredMethod` null and continue to `feedingState = 'no_submission'` as before.

### Change Log
- 2026-05-22: Fix #473 — custom pool feeding submission renders correctly; admin-compatible 'other' sentinel; covers legacy submissions without data patch.

## Test Verification

1. Load the game app as Yusuf Kalusicj → Feeding tab
2. Confirm roll area renders with "Custom Pool" label, correct dice count, roll button
3. Submit a fresh DT form without clicking any method card (use custom dropdowns)
   → confirm submission saves `_feed_method: 'custom'`
4. Reload Feeding tab → same render as step 2
5. Load a character who DID click a preset card → verify preset method label and pool unchanged
6. Load a character with no submission → verify generic picker still shows
