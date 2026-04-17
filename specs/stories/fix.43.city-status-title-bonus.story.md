# Story fix.43: City Status Title Bonus in Status Tab

## Status: review

## Story

**As a** player viewing the Status tab,
**I want** city status rankings to include court title bonuses,
**so that** Eve as Head of State (inherent 3 + title +3) correctly shows at 6, not 3.

## Acceptance Criteria

1. `cityVal(c)` in `status-tab.js` returns `status.city + court title bonus` (e.g. Head of State +3, Primogen +2, Socialite +1, Enforcer +1, Administrator +1).
2. The `/api/characters/status` endpoint returns `court_category` so the bonus lookup works.
3. The city status floor brackets, high seats, and apex slot all sort and threshold using the effective (bonus-included) value.
4. A character with no court title is unaffected (bonus = 0).

## Tasks / Subtasks

- [x] Task 1: Add `court_category` to `/api/characters/status` projection (AC: 2)
  - [x] In `server/routes/characters.js`, add `court_category: 1` to the `/status` route projection alongside the existing `court_title: 1`

- [x] Task 2: Use `calcCityStatus` in `status-tab.js` (AC: 1, 3, 4)
  - [x] Import `calcCityStatus` from `'../data/accessors.js'`
  - [x] Replace `function cityVal(c) { return c.status?.city || 0; }` with `function cityVal(c) { return calcCityStatus(c); }`
  - [x] Updated `cityStatusDots` comment to reflect effective city status

## Dev Notes

### `calcCityStatus` already exists

`public/js/data/accessors.js` lines 207–209:
```js
export function calcCityStatus(c) {
  return (c.status?.city || 0) + titleStatusBonus(c);
}
```
`titleStatusBonus(c)` reads `TITLE_STATUS_BONUS[c.court_category]` from `constants.js`.

### API projection — existing pattern

The `/status` route already returns `court_title: 1`. Add `court_category: 1` alongside it. Same fix was applied to `/public` route in a prior story.

### Scale remains 0–10

City status is 0–10 (base 0–5 + title bonus up to +3 = max 8 in practice, schema allows 10). All thresholds in `renderCitySection` (apex=10, high seats=8–9) remain correct — they just weren't being reached because the raw value was used.

### Key files

| File | Change |
|------|--------|
| `server/routes/characters.js` | Add `court_category: 1` to `/status` projection |
| `public/js/player/status-tab.js` | Import `calcCityStatus`; replace `cityVal` body |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- Added `court_category: 1` to `/status` projection in `server/routes/characters.js`
- Imported `calcCityStatus` from `accessors.js` into `status-tab.js`
- Replaced raw `c.status?.city` with `calcCityStatus(c)` in both `cityVal()` and `cityStatusDots()`
- Eve (Head of State, city 3) now ranks at 6; apex/high-seat thresholds unchanged (correct for 0–10 scale)

### File List
- server/routes/characters.js
- public/js/player/status-tab.js
- specs/stories/fix.43.city-status-title-bonus.story.md
