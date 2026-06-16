# Story fix.645: Regent confirm-feeding fails and Regency tab inaccessible when cycle is not 'active'

## Status: review

## Metadata

```yaml
issue: 645
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/645
branch: ms/issue-645-regent-confirm-regency-tab
```

## Story

**As a** player who is Regent of a territory,
**I want** the Regency tab to be usable and the "Confirm regency this cycle" button to only appear when confirmation is actually possible,
**so that** I am never shown an action that fails, and I can manage feeding rights regardless of cycle phase.

## Background

Reported by Rene's player (Regent of The Second City) during DT4. Two symptoms observed:

1. "Confirm regency this cycle" in the DT form returns **"Confirm failed: Cycle is not active"**
2. The Regency tab is inaccessible / renders without useful cycle context

**Root cause — three mismatched cycle-status checks:**

| Location | What it does | Behaviour when cycle is 'game' |
|---|---|---|
| `downtime-form.js:1380` | Loads `currentCycle` using `LIVE_STATUSES = ['active', 'game', 'prep']` | Finds the cycle → shows Regency section including confirm button |
| `server/routes/downtime.js:102` | Rejects confirm-feeding if `cycle.status !== 'active'` | Returns 409 "Cycle is not active" |
| `regency-tab.js:74` | Picks cycle with `c.status === 'active'` only | `_activeCycle` is null → no CTA banner, no confirm button, no cycle context |

When a cycle is `'game'` status (game phase open, city sign-off not yet done), the DT form finds and shows the Regency section including the confirm button, but both the server and the regency tab require `status === 'active'`. Result: the button fails and the tab appears broken.

**The server check is correct** — confirm-feeding is only valid when downtimes are open (`'active'`). The client-side code needs to align with it.

**Saving feeding rights is NOT affected** — `PATCH /api/territories/:id/feeding-rights` has no cycle-status gate. Regents can always save feeding-rights selections; only the confirmation is gated.

## Acceptance Criteria

1. **Given** the DT cycle is in `'game'` or `'prep'` status: the DT form Regency section shows the territory name and feeding-rights prompt, but **does not** show "Confirm regency this cycle". Instead, a note reads: *"Downtimes are not yet open — use the Regency tab to prepare your feeding-rights selections."*
2. **Given** the DT cycle is in `'active'` status: the confirm button appears and works end-to-end (server accepts, section updates to confirmed state).
3. **Given** the DT cycle is in `'game'` or `'prep'` status: the Regency tab (`regency-tab.js`) loads with the current live cycle in context (feeding-rights rows populated, but confirm button hidden/absent).
4. **Given** the DT cycle is `'active'`: the Regency tab's "Confirm Feeding Rights" button is present and functions.
5. **Given** no live cycle exists: the Regency tab renders the feeding-rights grid as today (no CTA banner, no confirm button) — no regression.
6. **Given** the cycle is `'active'` and the regent has already confirmed: the confirmed-badge and locked slots render correctly — no regression.
7. **"Open Regency tab"** button in the DT form navigates to the Regency tab in a usable state in all cycle-status scenarios.
8. No regression to `_computeLocked` (locked-character guard), the lieutenant save flow, or the append-only confirmation check on the server.

## Tasks / Subtasks

- [x] **Task 1:** `regency-tab.js` — fix cycle picker (AC: 3, 4, 5)
  - [x] Line ~74: change `sorted.find(c => c.status === 'active')` to:
    ```js
    sorted.find(c => ['active', 'game', 'prep'].includes(c.status)) || null
    ```
  - [x] This aligns `_activeCycle` discovery with the same `LIVE_STATUSES` logic used in `downtime-form.js:1380`. The variable name `_activeCycle` remains unchanged — it now means "the current live cycle" not "strictly-active cycle".

- [x] **Task 2:** `regency-tab.js` — gate CTA banner and confirm button on `status === 'active'` (AC: 3, 4, 5, 6)
  - [x] Line ~183 (CTA banner) — add `_activeCycle.status === 'active'` guard:
    ```js
    if (_activeCycle && _activeCycle.status === 'active' && !cycleConfirmed && !myConfirmation) {
    ```
  - [x] Line ~254 (confirm button) — add same guard:
    ```js
    if (_activeCycle && _activeCycle.status === 'active' && !cycleConfirmed) {
    ```
  - [x] Line ~256 (confirmed badge) — add same guard:
    ```js
    } else if (_activeCycle && _activeCycle.status === 'active' && cycleConfirmed && myConfirmation) {
    ```
  - [x] When `_activeCycle` exists but `status !== 'active'` and regent hasn't confirmed: the tab shows no confirm button and no CTA banner. The feeding-rights grid renders normally so the regent can set up their selections in advance.

- [x] **Task 3:** `downtime-form.js` — gate confirm button in `renderRegencySection()` on `status === 'active'` (AC: 1, 2)
  - [x] In `renderRegencySection()` (~line 4832–4840), replace the unconditional confirm button block with a status-aware split:
    ```js
    if (currentCycle?.status === 'active') {
      h += '<button type="button" class="qf-btn qf-btn-submit" id="dt-btn-confirm-regency">Confirm regency this cycle</button>';
    } else {
      h += '<p class="qf-desc">Downtimes are not yet open - use the Regency tab to prepare your feeding-rights selections.</p>';
    }
    ```
  - [x] The "Open Regency tab" button remains in both branches (so the regent can navigate to the tab regardless of cycle status).
  - [x] The `<span id="dt-regency-confirm-status">` status element only needs to be present when the confirm button is rendered — include it only in the `status === 'active'` branch.

- [x] **Task 4:** No server changes. `server/routes/downtime.js:102` check (`cycle.status !== 'active'`) is correct and stays.

## Dev Notes

### Cycle status model

From `public/js/downtime/db.js:67-79` (`deriveCycleStatus`):

| Status | Meaning | Downtimes open? |
|---|---|---|
| `'prep'` | Prep phase not yet signed off | No |
| `'game'` | Prep signed, city not yet signed | No |
| `'active'` | Both prep + city signed (or `manual_open: true`) | **Yes** |
| `'closed'` | Projects signed off | No |

The cycle status is derived from `phase_signoff` fields and written to MongoDB by `signoffPhase()` and `setManualOpen()`. The `status` field on the cycle document is the authoritative value — the server reads it directly.

### Saving feeding rights vs confirming

- **Save** (`PATCH /api/territories/:id/feeding-rights`) — no cycle-status gate. Always succeeds for the regent. The locked-character guard only applies if an active cycle exists — it prevents removing characters who have already fed, but does not prevent saves in general.
- **Confirm** (`POST /api/downtime_cycles/:id/confirm-feeding`) — gated to `status === 'active'` only.

This distinction is intentional: regents should be able to prepare their feeding-rights list before downtimes formally open.

### `_activeCycle` semantics after Task 1

After the fix, `_activeCycle` in `regency-tab.js` means "the current live cycle (any non-closed, non-prep status)" — not "strictly active". This is consistent with how the DT form uses `currentCycle`. Code that checks `_activeCycle?.status === 'active'` explicitly is intentional gating for confirm-only behaviour.

### Confirm button in DT form — only in unconfirmed branch

In `renderRegencySection()`, the confirm button is already inside the `else` branch (regent hasn't confirmed yet). The status check goes inside that branch. The post-confirmation branch (showing the confirmed-date and "Open Regency tab" only) does not change.

### `#dt-regency-confirm-status` span

This span is referenced by the click handler at `downtime-form.js:2335`. It only matters when the confirm button exists. Keep the span adjacent to the confirm button; omit it in the non-active branch.

### No CSS changes expected

The note text in the non-active branch (`qf-desc qf-desc--muted`) uses existing classes from `downtime-form.js`. If `qf-desc--muted` doesn't exist, use `qf-desc` with inline style or add a one-line rule to the appropriate CSS file (check `public/css/downtime-form.css` first).

### Testing

- Set DT cycle to `'game'` status in MongoDB (e.g., via `openGamePhase()` call or direct update) and verify:
  - DT form Regency section shows "not yet open" note, no confirm button
  - Regency tab loads feeding-rights rows, no CTA banner, no confirm button
  - Regent can still save feeding-rights changes via "Save Feeding Rights"
  - "Open Regency tab" navigates correctly
- Set DT cycle to `'active'` and verify:
  - DT form shows confirm button; clicking it succeeds
  - Regency tab shows CTA banner and "Confirm Feeding Rights" button; clicking confirms
- Set DT cycle to `'closed'` and verify no regression (form and tab should show no confirm UI today and continue to do so)
- Verify the locked-character guard still prevents removing fed residents when cycle is active

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-09 | 1.0 | Initial draft from issue #645 | Bob (SM) |
| 2026-06-09 | 1.1 | Implementation complete | Dev Agent |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None — all changes were surgical edits to two files, no runtime debugging needed.

### Completion Notes List
- Task 1: `regency-tab.js:74` — widened cycle picker from `status === 'active'` to `['active', 'game', 'prep'].includes(c.status)`. `_activeCycle` now means "current live cycle" not "strictly-active cycle".
- Task 2: Added `_activeCycle.status === 'active'` guard to CTA banner (line 183), confirm button (line 254), and confirmed-badge (line 256) in `regency-tab.js`. When cycle is `'game'`/`'prep'`, feeding-rights grid renders normally but no confirm UI appears.
- Task 3: `downtime-form.js` `renderRegencySection()` — confirm button and status span now only render when `currentCycle?.status === 'active'`. Non-active branch renders a `qf-desc` note: "Downtimes are not yet open - use the Regency tab to prepare your feeding-rights selections." "Open Regency tab" button present in both branches.
- Task 4: Server unchanged — `downtime.js:102` gate is correct.
- No CSS changes needed — `qf-desc` already provides italic + muted styling.
- Both changed files parse-checked clean (node ESM, exit 0).

### File List
- `public/js/tabs/regency-tab.js`
- `public/js/tabs/downtime-form.js`
