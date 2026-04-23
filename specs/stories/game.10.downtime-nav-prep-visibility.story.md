# Story: game.10 — Downtime Nav Button Always Visible for STs

## Status: review

## Summary

The Downtime nav button is marked `seasonal: true`, which hides it by default and shows it only when an active cycle exists. STs need access to the downtime tab regardless of cycle state (for prep, processing, reviewing past cycles, etc.) — it shouldn't be gated by cycle status for them.

For players, keep the existing seasonal behaviour (only shown when there's a live cycle they might interact with).

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/app.js` | In `renderBottomNav()`, render the Downtime button without `nbtn-seasonal` + `display:none` for STs. In `_updateSeasonalNav()`, skip toggling visibility when user is ST (keep it always shown). |

---

## Acceptance Criteria

1. When logged in as ST (real role `st` or `dev`, not player-view mode), the Downtime nav button is always visible in the phablet bottom nav and the More grid
2. When logged in as player (or ST in player-view mode), the existing seasonal behaviour applies — hidden unless an active/open cycle exists
3. The Downtime button in ST mode functions normally — clicking navigates to the downtime tab
4. No regression to the other seasonal items (none currently, but the `seasonal: true` pattern stays intact for future use)

---

## Tasks / Subtasks

- [x] Skip seasonal hide for STs in `_updateSeasonalNav()` (AC: #1, #2)
  - [x] Added `effectiveRole()` check at top of `_updateSeasonalNav()` — ST early returns with `display: ''`, players fall through to seasonal logic
- [x] Apply same to More grid (AC: #1)
  - [x] `MORE_APPS` Downtime entry has no `condition` or `stOnly` — already always visible in More grid; no change needed

---

## Dev Notes

### Current seasonal rendering (app.js line 287)

```js
if (item.seasonal) {
  // Seasonal items hidden by default, shown by _updateSeasonalNav after lifecycle loads
  h += `<button class="nbtn nbtn-seasonal" id="n-${item.id}" onclick="goTab('${item.goTab}')" style="display:none">${item.icon}<span>${item.label}</span></button>`;
  continue;
}
```

### Current `_updateSeasonalNav()` (app.js line 2018)

```js
function _updateSeasonalNav(activeCycle) {
  const btn = document.getElementById('n-downtime');
  if (btn) {
    btn.style.display = activeCycle ? '' : 'none';
  }
}
```

### Target — override for STs

```js
function _updateSeasonalNav(activeCycle) {
  const btn = document.getElementById('n-downtime');
  if (!btn) return;
  // STs always see the downtime button — for prep, processing, reviewing past cycles.
  // In player-view mode, STs follow the seasonal logic (what a real player would see).
  const isST = effectiveRole() === 'st' || effectiveRole() === 'dev';
  if (isST) {
    btn.style.display = '';
    return;
  }
  btn.style.display = activeCycle ? '' : 'none';
}
```

### Role detection

Use `effectiveRole()` — when an ST is in player-view mode, the button should follow the seasonal logic as a real player would see it. Only the "real" ST view gets the always-visible override.

### More grid (`MORE_APPS`)

Check `MORE_APPS[]` around line 1321 for the downtime entry — if it has a `condition` or similar gate, apply the same ST override in `appVisible()`. The seasonal pattern may only live in `NAV_ITEMS`, in which case no change is needed for the More grid.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- `_updateSeasonalNav()` early returns with visible button when `effectiveRole()` is `st` or `dev`
- Player and ST-in-player-view follow the standard seasonal gating (cycle status check)
- More grid unchanged — Downtime entry already always visible in MORE_APPS

### File List

- `public/js/app.js`

### Change Log

- 2026-04-23: Implemented game.10 — Downtime nav always visible for STs
