---
title: "Player DT form: XP values not rendering in XP-Spend action summary line"
issue: 291
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/291
branch: morningstar-issue-291-player-dt-xp-blank
status: review
type: bug
---

## Story

As a player filling in my downtime form, I want to see how much XP I have available and how much my declared spends total, so I can make informed choices without guessing or over-spending.

## Background

Players opening the XP-Spend action in the downtime form see blank values where the numeric figures should be:

> Slot total: **[blank]** XP   Cycle budget: **[blank]** XP available   1 XP-Spend action — -2 dots remaining

The ST/admin view of the same submission shows the correct values:

> Slot total: **9** XP   Cycle budget: **10** XP available   1 XP-Spend action — -2 dots remaining

Confirmed against Ludica (10 XP available). The XP-Spend row grid itself renders correctly in both views; only the two numeric summary figures are missing in the player view.

## Acceptance criteria

- [ ] Given a player opens the downtime form and selects an XP-Spend action, the Cycle budget figure renders as a non-blank number (e.g. "10")
- [ ] Given the player has declared XP spends, the Slot total figure reflects the correct sum
- [ ] The ST/admin view continues to display both figures correctly (no regression)
- [ ] Ludica's form specifically shows "Cycle budget: 10 XP available"
- [ ] The fix works for both a fresh form (no saved submission) and a pre-filled submitted form

## Code location

All XP-Spend rendering lives in one function:

**`public/js/tabs/downtime-form.js:4132` — `_renderProjectXpRows(n, saved)`**

The two affected lines are:

```js
// line 4182
const slotCost = xpRows.reduce((sum, r) => sum + getRowCost(r), 0);
// line 4183
const budget = xpLeft(currentChar);

// lines 4188–4189
h += `<span>Slot total: <strong>${slotCost}</strong> XP</span>`;
h += `<span style="margin-left:14px">Cycle budget: <strong>${budget}</strong> XP available</span>`;
```

- `slotCost` — computed locally from the saved XP row data; depends only on `xpRows` and `getRowCost`
- `budget` — computed from `xpLeft(currentChar)`, where `currentChar` is the module-level variable set at the top of `renderDowntimeTab`

## XP call chain

```
xpLeft(c)          → public/js/editor/xp.js:177
  xpEarned(c)      → xp.js:72
    xpStarting()          → always 10
    xpHumanityDrop(c)     → from c.humanity / c.humanity_base
    xpOrdeals(c)          → from c.ordeals[]
    xpGame(c)             → c._gameXP ?? 0  ← populated by loadGameXP()
    xpPT5(c)              → from c.merits + c.skills
  xpSpent(c)       → xp.js:168
    xpSpentAttrs(c)       → sumInlineXP(c.attributes)
    xpSpentSkills(c)      → sumInlineXP(c.skills) + spec/PT calc
    xpSpentMerits(c)      → c.merits[].xp + fighting_styles[].xp + pact powers
    xpSpentPowers(c)      → sumInlineXP(c.disciplines) + devotions + rites
    xpSpentSpecial(c)     → c.bp_creation, c.humanity_xp, c.xp_log
```

`_gameXP` is the only field on `c` that is not from MongoDB — it is set by `loadGameXP()` as an ephemeral property.

## How `currentChar` and `_gameXP` reach `_renderProjectXpRows`

**Admin path (works):**
1. `admin.js:1129` — `await loadGameXP(chars)` — ST mode, hits `/api/game_sessions`
2. Admin navigates to character → `downtime-tab.js:87` — `renderDowntimeTab(..., char, ..., { skipFreshFetch: true })`
3. `renderDowntimeTab` sets `currentChar = char` (the admin-loaded char with `_gameXP`)
4. Form renders → `_renderProjectXpRows` → `xpLeft(currentChar)` returns correct value

**Player path (broken):**
1. `player.js:210` — `await loadGameXP(chars, isSTRole())` — player mode, hits `/api/characters/game-xp`
2. Player clicks Downtime tab → `_lazyRenderers.downtime()` → `renderDowntimeTab(..., activeChar, ..., { skipFreshFetch: true })`
3. `renderDowntimeTab` sets `currentChar = activeChar`
4. Form renders → `_renderProjectXpRows` → `budget = xpLeft(currentChar)` → **blank result**

The `/api/characters/game-xp` endpoint exists (`server/routes/characters.js:223`) and is accessible to authenticated players.

## Investigation checklist — run BEFORE writing the fix

**Step 1 — Verify what `xpLeft` returns for the player**

Open the player portal as a player (or use the dev bypass `localTestLogin()` with a player-role account). Navigate to Ludica's downtime tab. In the browser console run:

```js
// These are module-scoped — access via a temporary console.log patch:
// Temporarily add to _renderProjectXpRows at line 4183:
console.log('slotCost:', slotCost, 'budget:', budget, 'currentChar:', currentChar?._id, '_gameXP:', currentChar?._gameXP);
```

Expected if working: `slotCost: 9, budget: 10, currentChar: <id>, _gameXP: 0` (or `_gameXP: <n>` if attendance recorded).

If `budget` is `NaN` or `undefined`, the issue is in `xpLeft(currentChar)`.
If `budget` is a number (e.g. `10`) but the display is blank, the issue is CSS or a subsequent DOM overwrite.

**Step 2 — Confirm `_gameXP` loads in the player context**

Temporarily add to `player.js` after the `await Promise.allSettled([loadGameXP(...)])` call:
```js
console.log('[player] _gameXP check:', chars.map(c => `${c.name}: ${c._gameXP}`));
```

Ludica should appear with a `_gameXP` value (0 is valid; `undefined` means `loadGameXP` failed for her).

**Step 3 — Check the `/api/characters/game-xp` response**

In Network tab (player login), look for the `/api/characters/game-xp` request. Confirm:
- Response status is 200
- The response includes sessions with Ludica's `character_id` or `character_name`
- The character matching in `loadGameXP` (`chars.find(ch => ...)`) successfully finds Ludica

**Step 4 — Check `xpSpent(currentChar)` in the player context**

If `xpLeft` returns `NaN`, the issue is in `xpSpent`. Run:
```js
// Paste into console after navigating to downtime tab
// (xp functions are not exported to window, so use the patched log from Step 1)
```

If `xpSpentPowers` throws (e.g. `p.name` is undefined on a devotion), that would cause `NaN`. Check `currentChar.powers` for any entry with a missing `name` field.

## Most likely root causes (in order of probability)

1. **`xpLeft(currentChar)` returns `NaN`** because `xpSpent(currentChar)` encounters malformed power data (e.g. a devotion with no `name` property). `p.name.toLowerCase()` at `xp.js:131` would throw; `xp.js:168` reduce would produce `NaN`; `xpEarned - NaN = NaN`; `${NaN}` in a template literal is `"NaN"` — but if an exception propagates up, the `_renderProjectXpRows` function might abort, explaining why BOTH figures are blank while the subsequent row rendering is skipped.

   **However**: the XP rows ARE rendering in the player screenshot, meaning `_renderProjectXpRows` completes. This rules out a thrown exception before the row render at line 4195+.

2. **`slotCost` or `budget` is `NaN` but something downstream filters or hides it.** Unlikely — standard `${NaN}` renders as `"NaN"`. Check if there is any CSS rule that hides the `<strong>` elements or if the numbers are present in the DOM but invisible.

3. **The budget div is rendered correctly but then immediately overwritten by a subsequent DOM update** that zeros/blanks the values. Check event handlers that target `#dt-proj_${n}_xp_budget` or the parent `.dt-xp-picker`.

4. **`xpLeft(currentChar)` returns `undefined`** — `${undefined}` renders as `"undefined"` which would be visible. But if `currentChar` is somehow null, `xpLeft(null)` throws and `slotCost` would not even be calculated.

## What is NOT the root cause (already ruled out)

- CSS colour: `.dt-xp-budget` uses `var(--rp-txt2)` which in dark mode resolves to `var(--txt2)` = `#C4B49A` (warm beige, clearly visible). The `1 XP-Spend action` span uses the same inherited colour and IS visible.
- Race condition between `loadGameXP` and lazy tab render: `player.js:209` awaits `Promise.allSettled([loadGameXP(...)])` before `selectCharacter` sets up `_lazyRenderers`. The downtime tab cannot render before `_gameXP` is loaded.
- `skipFreshFetch` breaking `currentChar`: the player path uses `skipFreshFetch: true` correctly; `currentChar` is set to `activeChar` (with `_gameXP`) at line 1238 and is not overwritten before render.
- Missing `/api/characters/game-xp` endpoint: endpoint exists and is player-accessible (server/routes/characters.js:223).

## Fix approach

Once the root cause is confirmed:

- **If `xpLeft` returns `NaN`:** Add a guard in `_renderProjectXpRows`: `const budget = typeof xpLeft(currentChar) === 'number' && !isNaN(xpLeft(currentChar)) ? xpLeft(currentChar) : '?';` as a fallback, then separately fix the root cause in whichever `xpSpent*` sub-function produces `NaN`.
- **If a subsequent DOM overwrite is clearing the div:** Identify the event handler and ensure it re-calls `_renderProjectXpRows` (or just the budget line) using the same pattern as `renderForm`.
- **If numbers ARE in the DOM but CSS-hidden:** Add a targeted CSS fix in the correct theme override block.

## Dev agent record

### Files changed

| File | Change |
|------|--------|
| `public/css/theme.css` | Added `--rp-strong:var(--txt)` to `[data-theme="dark"]` reading pane variable block (line 277) |
| `tests/downtime-player-smoke.spec.js` | Added "XP budget rendering (issue #291)" describe block with 2 new tests |

### Completion notes

Root cause: `--rp-strong:#3A1A0F` (dark parchment brown) is defined in `:root` for the light/parchment theme but was absent from the `[data-theme="dark"]` override block. The `.reading-pane strong { color: var(--rp-strong); }` rule in `components.css:1273` applies to all `<strong>` elements inside `.reading-pane`, including the XP budget numbers rendered by `_renderProjectXpRows`. In dark mode (player portal default), `#3A1A0F` on `#0D0B09` background is near-zero contrast — visually invisible. Admin portal defaults to parchment/light mode, so `--rp-strong` resolved correctly there.

Fix: one CSS variable addition — `--rp-strong:var(--txt)` — in the dark-mode reading pane section of `theme.css`. No JS changes required. XP computation (`xpLeft`, `loadGameXP`, `currentChar._gameXP`) was working correctly throughout.

All 16 smoke tests pass (14 pre-existing + 2 new).

---

## Dev notes

### Key files

| File | Role |
|------|------|
| `public/js/tabs/downtime-form.js:4132` | `_renderProjectXpRows` — the broken render function |
| `public/js/tabs/downtime-form.js:4182–4189` | The two affected template lines |
| `public/js/editor/xp.js` | `xpLeft`, `xpEarned`, `xpSpent` and all sub-functions |
| `public/js/data/game-xp.js` | `loadGameXP` — sets `c._gameXP` |
| `public/js/player.js:207–212` | Where `loadGameXP` is called in player context |
| `server/routes/characters.js:223` | `/api/characters/game-xp` endpoint |

### Verification checklist

After implementing:

1. Open player portal as Ludica (or impersonate). Navigate to Downtime tab.
2. Select XP-Spend as the action type for any project slot.
3. Confirm "Cycle budget: 10 XP available" (or whatever Ludica's actual available XP is) renders with a visible number.
4. Add/remove XP rows — confirm Slot total updates correctly with each change.
5. Open the admin panel → navigate to Ludica's downtime → confirm the same values display there too (regression check).
6. Check the browser console for any errors during the render.
