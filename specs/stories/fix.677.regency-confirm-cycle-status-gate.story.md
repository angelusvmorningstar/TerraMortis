# Story fix.677: Regency Confirm Fails with 'Cycle is not active' When Cycle Status is 'open'

## Status: ready-for-dev

---
issue: 677
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/677
branch: ms/issue-677-regency-confirm-cycle-status
---

## Story

**As a** Regent trying to confirm feeding rights during an open downtime cycle,
**I want** the confirmation to succeed regardless of whether the cycle status is `'active'` or `'open'`,
**so that** my downtime submission can reach minimum-complete and preserve my XP credit.

## Background

`POST /api/downtime_cycles/:id/confirm-feeding` has a status gate at `server/routes/downtime.js:102`:

```js
if (cycle.status !== 'active') {
  return res.status(409).json({ error: 'CONFLICT', message: 'Cycle is not active' });
}
```

DT4 currently has `status: 'open'` in MongoDB. `'open'` is a recognised live status throughout
the codebase (`downtime-views.js:1233`: `const isOpen = cycle.status === 'open'`; `isLive = isPrep || isActive || isGame || isOpen`) but the confirm-feeding endpoint was written to accept only `'active'`.

`deriveCycleStatus()` in `public/js/downtime/db.js` only produces `'prep'`, `'game'`, `'active'`,
or `'closed'` — never `'open'`. DT4 has `'open'` as a legacy or manually-set value predating the
phase-signoff derive system. The endpoint must accept all live statuses.

A secondary issue: `regency-tab.js:183, 254, 256` also gates the "Confirm Feeding Rights" button
on `status === 'active'`, so Regents arriving at the regency tab directly would not see the
button. The DT form's regency confirm button (`#dt-btn-confirm-regency`) has no such gate and
calls the API directly — which is why Alice could click it but got the 409.

Both gates must be widened to accept any non-`'closed'` cycle.

## Acceptance Criteria

- [ ] Given DT4 has status `'open'`, when a Regent clicks "Confirm regency this cycle" in the DT form, the confirmation succeeds and the Regency section shows as complete
- [ ] The "Confirm Feeding Rights" button in the regency tab is visible when the cycle status is `'open'` (or any live status), not only when it is `'active'`
- [ ] Given a cycle with status `'closed'`, confirm-feeding is still rejected with 409
- [ ] No regression on the existing confirm-feeding flow when status is `'active'`

## Tasks / Subtasks

- [ ] Task 1: Fix the backend status gate (`server/routes/downtime.js`)
  - [ ] Change line 102: `cycle.status !== 'active'` → `cycle.status === 'closed'`
  - [ ] Update the comment on line 99 to reflect the new intent: "must exist and not be closed"
  - [ ] Update the error message to `'Cycle is closed'` for accuracy

- [ ] Task 2: Fix the regency tab frontend gates (`public/js/tabs/regency-tab.js`)
  - [ ] Introduce a local `const cycleLive = !!(_activeCycle && _activeCycle.status !== 'closed');` near the top of `renderRegencyTab` (before the CTA banner block)
  - [ ] Line 183: replace `_activeCycle && _activeCycle.status === 'active'` with `cycleLive`
  - [ ] Line 254: replace `_activeCycle && _activeCycle.status === 'active'` with `cycleLive`
  - [ ] Line 256: replace `_activeCycle && _activeCycle.status === 'active'` with `cycleLive`

---

## Dev Notes

### Exact changes

**`server/routes/downtime.js:99-104`** — before:
```js
  // 1. Load cycle; must exist and be active
  const cycle = await cycles().findOne({ _id: oid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  if (cycle.status !== 'active') {
    return res.status(409).json({ error: 'CONFLICT', message: 'Cycle is not active' });
  }
```

After:
```js
  // 1. Load cycle; must exist and not be closed
  const cycle = await cycles().findOne({ _id: oid });
  if (!cycle) return res.status(404).json({ error: 'NOT_FOUND', message: 'Cycle not found' });
  if (cycle.status === 'closed') {
    return res.status(409).json({ error: 'CONFLICT', message: 'Cycle is closed' });
  }
```

**`public/js/tabs/regency-tab.js`** — add after the `myConfirmation` assignment (around line 178):
```js
const cycleLive = !!(_activeCycle && _activeCycle.status !== 'closed');
```

Then replace all three `_activeCycle && _activeCycle.status === 'active'` occurrences with `cycleLive`:
- Line 183 (CTA banner)
- Line 254 (confirm button render)
- Line 256 (confirmed badge render)

### Why `=== 'closed'` not `!== 'active'`

All live statuses (`prep`, `game`, `active`, `open`) should allow confirmation — the Regent is
managing their territory for the upcoming cycle. Only a closed cycle (ST processing underway)
should block changes. Checking `=== 'closed'` is future-safe: any new live status won't
accidentally get blocked.

### Cycle status lifecycle

```
prep → game → active → closed    (via deriveCycleStatus / phase_signoff)
              ↑
         manual_open=true forces 'active'
         'open' = legacy value; recognised by UI as isLive
```

### No test for this story

This is a one-line server-side fix with immediate live impact (DT4 cycle, current players blocked).
The existing `confirm-feeding` route is not covered by the Playwright suite (it requires a real
MongoDB cycle). Manual verification: confirm Alice's submission reaches minimum-complete on dev
after deploying. The DT form already has extensive Playwright coverage for unrelated flows.

## File List

- `server/routes/downtime.js` — MODIFY (Task 1)
- `public/js/tabs/regency-tab.js` — MODIFY (Task 2)

## Change Log

- 2026-06-10: Story created from issue #677 (live player-blocking bug, DT4)
