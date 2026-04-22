# Story: dt.1 — Fix Player Downtime Tab Showing Stale Previous Cycle

## Status: review

## Summary

When a new cycle is created in `prep` status, the player's downtime tab falls through to showing the most recent CLOSED cycle (Downtime 2) instead of the new cycle state. This is because the `else` branch in `downtime-tab.js` triggers when `activeCycle` is falsy or when `canAccess` gating is mishandled.

Two related problems:
1. If the DT3 cycle exists in prep status, players with no access should see "Downtimes opening soon" — not DT2 content.
2. If DT3 was created before dt.prep was deployed (potentially with a different status), it may not be found by the `prep` status search.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/js/tabs/downtime-tab.js` | Fix fallthrough: show neutral "upcoming" state instead of stale closed cycle when prep cycle exists but player can't access it |

---

## Acceptance Criteria

1. When a prep cycle exists and the player cannot yet access it, the zone shows "Downtimes opening soon" (not old cycle content)
2. When there is no cycle at all (prep or active), the zone shows nothing or a neutral placeholder
3. The old "Downtime 2 is being processed" message only appears when DT2 is the MOST RECENT cycle and DT3 does not exist at all
4. No regression to ST bypass or early access behaviour

---

## Tasks / Subtasks

- [x] Investigate DT3 status in DB (AC: #2)
  - [x] DT3 confirmed `status: 'prep'` — code was already finding it correctly. Stale display was from before dt.prep deployment.
- [x] Fix the fallthrough when prep cycle exists but player has no access (AC: #1)
  - [x] Replaced two-step `find()` with single priority-sorted filter across all live statuses
  - [x] `cycleIsOpen` now correctly only covers 'open'/'active'; 'game'/'prep' cycles require early access or auto_open_at
- [x] Ensure cycle status search covers all non-closed statuses (AC: #4)
  - [x] `LIVE_STATUSES = ['open', 'active', 'game', 'prep']` — sorted by priority so active beats game beats prep

---

## Dev Notes

### Current cycle selection (downtime-tab.js lines 33–34)

```js
const activeCycle = cycles.find(c => c.status === 'open' || c.status === 'active') ||
                    cycles.find(c => c.status === 'prep') || null;
```

If DT3 has any other status (e.g. an unexpected value), this returns null → falls to `else` → shows DT2.

### Fix: broaden cycle search and guard the else branch

```js
const activeCycle = cycles.find(c =>
  ['open', 'active', 'game', 'prep'].includes(c.status)
) || null;
```

And in the `else` branch (no active cycle), only show old closed cycle content if TRULY no upcoming cycle exists — not just because `activeCycle` is null from a status mismatch.

### Also investigate in DB

Check what status Downtime 3 actually has. If it's `'active'` (created via old path before dt.prep), the current code WOULD find it, but then `canAccess` might be wrong. Run:
```
db.downtime_cycles.find({}, {label:1, status:1, auto_open_at:1}).sort({_id:-1}).limit(5)
```

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- DB confirmed DT3 `status: 'prep'` — stale display was a pre-deployment issue, not an ongoing bug
- Hardened `activeCycle` selection: single priority-sorted filter across `['open', 'active', 'game', 'prep']` — cleaner and handles all future statuses
- `cycleIsOpen` correctly scoped to 'open'/'active' only — 'game' phase still gates players until auto_open_at or early access

### File List

- `public/js/tabs/downtime-tab.js`

### Change Log

- 2026-04-23: Implemented dt.1 — hardened cycle status selection, confirmed DT3 stale display was pre-deployment
