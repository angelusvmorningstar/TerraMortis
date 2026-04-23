# Story: dt.2 — Align Downtime Form Cycle Selection with Tab Logic + ST Bypass

## Status: review

## Summary

`downtime-form.js` has its own cycle selection logic (line 709-712) that's out of sync with `downtime-tab.js`. When DT3 is in `prep` status and DT2 is `closed`, the form picks DT2 as "current" because `prep` isn't in the priority list — then renders a "processing downtime results" gate page.

Additionally, the form only renders for `status === 'active'` cycles — STs can never preview the form for `prep`/`game` cycles, even though the tab successfully routes them to the form render.

Both `downtime-tab.js` and `downtime-form.js` should agree on which cycle is "current" and what the form does for each status. STs should always see the form regardless of cycle status so they can preview, test, and demo.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/tabs/downtime-form.js` | Replace cycle selection with dt.1-style priority sort; accept `prep` + `game`; add ST bypass for gate |

---

## Acceptance Criteria

1. `downtime-form.js` selects the current cycle using the same priority as `downtime-tab.js`: active → game → prep → (fallback to most recent)
2. When the selected cycle is `prep`, STs see the full form for preview and testing
3. When the selected cycle is `prep`, players see the existing gate page (unless they have early access — handled upstream in `downtime-tab.js`)
4. When the selected cycle is `game`, STs see the form; players see "submissions are locked" gate (unchanged)
5. When the selected cycle is `closed`, both STs and players see the "processing results" gate (unchanged)
6. The form no longer falls back to DT2 when DT3 is in prep — DT3 is selected as current

---

## Tasks / Subtasks

- [x] Unify cycle selection (AC: #1, #6)
  - [x] Replaced `||` chain with `LIVE_STATUSES = ['active', 'game', 'prep']` priority filter
  - [x] `sorted` remains created_at desc; picks most recent live cycle, falls back to closed, then any
- [x] Add ST bypass for gate page (AC: #2)
  - [x] `isSTRole` was already imported
  - [x] Added `_formStatuses = isST ? ['active', 'prep'] : ['active']` gate rule
  - [x] `_gateBlocks` applied to both singleColumn (game app) and split-pane render paths
- [x] Verify form renders for prep cycle (AC: #2)
  - [x] Gate check replaced — STs see form on active or prep; players still see form only on active

---

## Dev Notes

### Current cycle selection (`downtime-form.js:707-712`)

```js
const cycles = await apiGet('/api/downtime_cycles');
const sorted = cycles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
currentCycle = sorted.find(c => c.status === 'active')
  || sorted.find(c => c.status === 'game' || c.status === 'closed')
  || sorted[0]
  || null;
```

**The bug:** `prep` is never considered. When DT3 (prep) exists alongside DT2 (closed), DT2 wins because it matches the second find.

### Target

```js
const LIVE_STATUSES = ['active', 'game', 'prep'];
currentCycle = sorted.find(c => LIVE_STATUSES.includes(c.status))
  || sorted.find(c => c.status === 'closed')
  || sorted[0]
  || null;
```

Since `sorted` is already most-recent-first, `find(c => LIVE_STATUSES.includes(c.status))` picks the newest active-ish cycle.

### ST bypass for gate

Currently `renderCycleGatePage()` renders gate based on status. For STs on a `prep` cycle, we want the form instead. The cleanest fix is in the rendering dispatch: check status + role before deciding gate-vs-form.

Find where `renderCycleGatePage()` is called vs the form. Around line 733:
```js
if (currentCycle?.status === 'active' && !responseDoc?.published_outcome) {
  // render form
} else {
  // render gate
}
```

Target:
```js
const isST = isSTRole();
const formStatuses = isST ? ['active', 'prep'] : ['active'];
if (currentCycle && formStatuses.includes(currentCycle.status) && !responseDoc?.published_outcome) {
  // render form
} else {
  // render gate
}
```

### Downstream impact

`downtime-tab.js` already routes STs to `renderDowntimeTab()` (the form renderer). With this fix, the form actually renders for STs on prep cycles instead of bouncing to the gate page.

---

## Dev Agent Record

### Agent Model Used
claude-opus-4-7

### Debug Log

### Completion Notes

- Cycle selection in downtime-form.js now uses the same priority pattern as downtime-tab.js — `prep` cycles are picked when no `active` exists
- Gate logic is now role-aware: STs see the form for `active` or `prep` cycles; players only for `active`
- `game` and `closed` still show gate for everyone (post-game states)
- Applied to both singleColumn (unified game app) and split-pane (player portal) render paths

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

- 2026-04-23: Implemented dt.2 — aligned form cycle selection with tab logic + ST bypass
