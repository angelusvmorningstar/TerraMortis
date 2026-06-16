---
title: 'DT form: manual-open override ignored; gate checks deadline date only'
type: 'fix'
issue: 715
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/715
branch: ms/issue-715-dt-manual-open-gate
created: '2026-06-12'
status: review
recommended_model: 'sonnet — two-file targeted fix, three guard sites'
context:
  - public/js/tabs/downtime-form.js
  - server/routes/downtime.js
---

## Intent

**Problem:** ST sets the downtime cycle to "manually open" via the Cycle tab. Players
still cannot submit — the form shows "Submissions closed" and clicking "Submit Downtime"
returns `Submit failed: Submissions for this cycle are closed.`

**Workaround confirmed:** Changing `deadline_at` to a future date unblocks both gates,
proving the guards read only `deadline_at` and ignore `cycle.manual_open` entirely.

**Root cause confirmed (2026-06-12):** Two independent deadline guards, neither of which
checks `cycle.manual_open`:

---

### Bug A — Server: PUT handler deadline check ignores `manual_open`

`server/routes/downtime.js:755` — inside the player-path of `PUT /api/downtime_submissions/:id`:

```js
if (cycle?.deadline_at && new Date(cycle.deadline_at) < new Date()) {
  return res.status(403).json({ error: 'DEADLINE_PASSED', message: 'Submissions for this cycle are closed.' });
}
```

This fires when `deadline_at` is in the past regardless of `manual_open`. The user sees
exactly this message: *"Submit failed: Submissions for this cycle are closed."*

Note: the earlier `requireOpenCycle` middleware (line 54) checks `cycle.status === 'closed'`.
With `manual_open === true`, `setManualOpen()` persists `status: 'active'` via `updateCycle()`,
so that gate passes correctly. The deadline check at line 755 is a second independent guard
that `requireOpenCycle` never reaches.

---

### Bug B — Client: `_gateBlocks` deadline condition ignores `manual_open`

`public/js/tabs/downtime-form.js:1568–1570`:

```js
const _gateBlocks = !currentCycle
  || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess && !_autoOpenPassed)
  || (_deadlinePast && !_hasWindowAccess);
```

Third condition `(_deadlinePast && !_hasWindowAccess)` renders the gate page (blocking the
form entirely) when the deadline has passed, with no carve-out for `manual_open`. Players
see the gate page with "Submissions closed" before they can even attempt a submit.

---

### Bug C — Client: inline deadline pill shows "Submissions closed" even with override

`public/js/tabs/downtime-form.js:2058–2062` — inside the form's own header:

```js
if (currentCycle.deadline_at) {
  const dl = new Date(currentCycle.deadline_at);
  ...
  h += `<p class="qf-deadline${past ? ' qf-deadline-closed' : ''}">${past ? 'Submissions closed' : 'Open until ' + dlStr}</p>`;
}
```

Even if the gate is fixed, this pill still says "Submissions closed" when deadline has
passed and `manual_open` is active. Should instead say "Open (ST override)".

---

## Root cause files

| File | Lines | Role |
|------|-------|------|
| `server/routes/downtime.js` | 751–758 | PUT handler player deadline check — Bug A |
| `public/js/tabs/downtime-form.js` | 1568–1570 | `_gateBlocks` deadline condition — Bug B |
| `public/js/tabs/downtime-form.js` | 2058–2062 | inline deadline pill text — Bug C |

---

## Background: `manual_open` architecture (how it was supposed to work)

`cycle.manual_open` (boolean) is set by `setManualOpen()` in `public/js/downtime/db.js`.
When set to `true`, `deriveCycleStatus()` returns `'active'` (unless `phase_signoff.projects`
is already set, in which case `'closed'` always wins per AC-4 of the original design).
`setManualOpen()` calls `updateCycle()` so MongoDB stores `status: 'active'`.

The intent was that all gates would read `cycle.status` from the DB and get `'active'`.
What was missed: two guards read `deadline_at` directly and never consult `status` or
`manual_open`.

Related fields on the cycle document:
```
cycle.manual_open:    boolean
cycle.manual_open_at: string | null  (ISO timestamp)
cycle.manual_open_by: string | null  (user ID)
```

---

## Tasks

### T1 — Server: skip deadline check when `manual_open` is active [x]

**File:** `server/routes/downtime.js`, lines 754–757

**Before:**
```js
const cycle = await cycles().findOne({ _id: cycleOid });
if (cycle?.deadline_at && new Date(cycle.deadline_at) < new Date()) {
  return res.status(403).json({ error: 'DEADLINE_PASSED', message: 'Submissions for this cycle are closed.' });
}
```

**After:**
```js
const cycle = await cycles().findOne({ _id: cycleOid });
if (!cycle?.manual_open && cycle?.deadline_at && new Date(cycle.deadline_at) < new Date()) {
  return res.status(403).json({ error: 'DEADLINE_PASSED', message: 'Submissions for this cycle are closed.' });
}
```

One-word change: prefix the condition with `!cycle?.manual_open &&`.

---

### T2 — Client: exclude `manual_open` cycles from deadline gate [x]

**File:** `public/js/tabs/downtime-form.js`, lines 1563–1570

**Before:**
```js
const _deadlinePast = !!(currentCycle?.deadline_at && new Date(currentCycle.deadline_at) < new Date());
// ...
const _gateBlocks = !currentCycle
  || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess && !_autoOpenPassed)
  || (_deadlinePast && !_hasWindowAccess);
```

**After:**
```js
const _deadlinePast = !!(currentCycle?.deadline_at && new Date(currentCycle.deadline_at) < new Date());
const _manualOpen   = currentCycle?.manual_open === true;
// ...
const _gateBlocks = !currentCycle
  || (!_formStatuses.includes(currentCycle.status) && !_hasWindowAccess && !_autoOpenPassed)
  || (_deadlinePast && !_hasWindowAccess && !_manualOpen);
```

Add one new const `_manualOpen` immediately after `_deadlinePast`, then append `&& !_manualOpen`
to the third gateBlocks condition. Nothing else changes.

---

### T3 — Client: fix inline deadline pill text for override state [x]

**File:** `public/js/tabs/downtime-form.js`, lines 2058–2062

Locate the deadline pill render inside the form header (search for `qf-deadline`):

**Before:**
```js
if (currentCycle.deadline_at) {
  const dl = new Date(currentCycle.deadline_at);
  const past = dl < new Date();
  const dlStr = dl.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  h += `<p class="qf-deadline${past ? ' qf-deadline-closed' : ''}">${past ? 'Submissions closed' : 'Open until ' + dlStr}</p>`;
}
```

**After:**
```js
if (currentCycle.deadline_at) {
  const dl = new Date(currentCycle.deadline_at);
  const past = dl < new Date();
  const dlStr = dl.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const _overrideOpen = currentCycle.manual_open === true;
  const _showClosed = past && !_overrideOpen;
  h += `<p class="qf-deadline${_showClosed ? ' qf-deadline-closed' : ''}">${_showClosed ? 'Submissions closed' : _overrideOpen && past ? 'Open — ST override active' : 'Open until ' + dlStr}</p>`;
}
```

When `manual_open` is true and deadline has passed, the pill reads
"Open — ST override active" with no red styling.

---

## What not to change

- `requireOpenCycle` middleware (line 37–66) — checks `cycle.status === 'closed'`; already
  works correctly because `setManualOpen` stores `status: 'active'`
- `deriveCycleStatus()` in `public/js/downtime/db.js` — correct; closed-wins (AC-4) is
  intentional
- `setManualOpen()` and `updateCycle()` — correct
- The gate page text in `renderCycleGatePage()` (lines 1707–1714) — only reached when
  `_gateBlocks` is true; fixing `_gateBlocks` (T2) means it never shows for `manual_open`
  cycles with a passed deadline
- The `out_of_window_player_ids` path — orthogonal, do not touch
- Server schema — `manual_open` field already declared in `downtimeCycleSchema`

---

## Verification (T3 — manual, requires DT5 prep)

After deploy to dev:

1. Confirm DT4 is current active cycle with deadline in the past
2. Set `manual_open = true` via Cycle tab
3. Open player app as a player character
4. DT form should render (not the gate page)
5. Deadline pill should show "Open — ST override active" (not "Submissions closed")
6. Click "Submit Downtime" — should succeed, no 403 error
7. Turn off `manual_open` (Resume automation) → deadline pill returns to "Submissions closed",
   submit blocked again (regression check)

---

## Tests

No automated test suite for this pattern. Verify manually via steps above.

The key invariants:

> For a cycle where `deadline_at` is in the past AND `manual_open === true`:
> - Client `_gateBlocks` must be `false` for a non-ST player without window access
> - `PUT /api/downtime_submissions/:id` from a player must return 200, not 403

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

**T1 — `server/routes/downtime.js:755`:** Added `!cycle?.manual_open &&` prefix to the deadline
check condition. One token change; when `manual_open === true` the entire condition short-circuits
and the 403 is never returned, regardless of `deadline_at`.

**T2 — `downtime-form.js:1563-1570`:** Added `const _manualOpen = currentCycle?.manual_open === true`
immediately after `_deadlinePast`. Appended `&& !_manualOpen` to the third `_gateBlocks` condition
so a manually-opened cycle never triggers the gate regardless of deadline date.

**T3 — `downtime-form.js:2058-2062`:** Added `_overrideOpen` and `_showClosed` locals inside the
deadline pill block. Pill now reads "Open — ST override active" (no red class) when `manual_open`
is true and deadline has passed. Reads "Submissions closed" (red) when closed without override.
Reads "Open until <date>" normally. Both files parse clean (`node --check`).

### File List

- `server/routes/downtime.js` — PUT handler player deadline check: `!cycle?.manual_open &&` prefix
- `public/js/tabs/downtime-form.js` — `_manualOpen` const + `_gateBlocks` third condition; deadline pill text
- `server/tests/fix.715.dt-manual-open-gate.test.js` — 5 vitest tests (AC-2, AC-3, AC-4 + edge cases)
- `tests/fix-715-dt-manual-open-gate.spec.js` — 4 Playwright tests (AC-1, AC-1b, AC-3, AC-4)

### Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-12 | 1.0 | Initial story created from issue #715 | Claude (SM) |
| 2026-06-12 | 1.1 | fix(#715) — manual_open now respected by server deadline gate and client form gate | claude-sonnet-4-6 |
