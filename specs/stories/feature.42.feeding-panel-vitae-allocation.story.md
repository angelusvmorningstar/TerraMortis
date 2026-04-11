# Story feature.42: Feeding Panel — Per-Vessel Vitae Allocation

## Status: Approved

## Story

**As a** player who has secured vessels from a feeding roll,
**I want** to choose how much Vitae to take from each vessel,
**so that** I can decide the risk level for each mortal and see the consequences before committing.

## Background

The feeding tab (`public/js/player/feeding-tab.js`) already handles the one-shot roll, stores the result in the submission as `feeding_roll_player`, and transitions to state `'rolled'`. After rolling, it currently displays:

- Total successes and die columns
- Vessel count (`vessels = successes`) and safe vitae ceiling (`safeVitae = successes × 2`)
- A static note: "Draining beyond safe vitae risks a Humanity check"

What is missing: the player cannot allocate vitae per vessel. There is no UI for choosing how much to take from each mortal, and no record of those choices in the submission.

### Vitae consequence levels (design decision)

Each vessel is an average mortal (Stamina 2 + Size 5 = 7 health).

| Vitae taken | Consequence |
|---|---|
| 1 | Safe |
| 2 | Safe |
| 3 | Drained Condition — needs medical care / blood transfusion |
| 4 | Serious injury — hospitalisation |
| 5 | Serious injury — hospitalisation |
| 6 | Critical — near death |
| 7 | Fatal — vessel dies |

These are ST reference values. The system records the player's choice; the ST sees them in aggregate.

### Dramatic failure rule (design decision)

If the roll used a discipline in the pool (either from the submitted `_feed_disc` or from the generic picker `selectedDisc`) **and** `successes === 0`, the outcome is a dramatic failure: "See ST at game before feeding." This applies to any discipline, not just specific ones. No vessel cards are shown in this case.

---

## Acceptance Criteria

1. After rolling, if `vessels > 0` and no dramatic failure: the rolled state renders one vessel card per vessel (up to the vessel count).
2. Each vessel card shows:
   - A label ("Vessel 1", "Vessel 2", etc.)
   - A vitae selector (dropdown or number input, values 1–7)
   - A consequence label that updates reactively as the selector changes (see table above)
3. A "Total Vitae" running tally is shown below the vessel cards.
4. A "Confirm Allocation" button is present. It is disabled until every vessel has a value selected.
5. On confirm, the allocation is saved to the submission: `feeding_vitae_allocation` as a JSON array of integers, e.g. `[2, 3, 1]`.
6. After confirming, the vessel cards become read-only (selections locked). The result is labelled "Allocation recorded."
7. Dramatic failure: if a discipline was in the pool AND successes === 0, show a message "Dramatic failure — see your Storyteller at game before feeding." No vessel cards are shown. No allocation step.
8. Vessels === 0 (with no dramatic failure): existing "No vessels secured this hunt" message is preserved unchanged.
9. The allocation is loaded and displayed (read-only) when the player revisits the tab after confirming.
10. ST re-roll clears the allocation alongside clearing the roll (`feeding_vitae_allocation: null`).

---

## Tasks / Subtasks

- [ ] Task 1: Dramatic failure detection (AC: 7)
  - [ ] In `doFeedingRoll()`, after computing `successes`, check: `const usedDisc = !!(declaredDisc || selectedDisc);`
  - [ ] If `usedDisc && successes === 0`: set `rollResult.dramaticFailure = true` before storing
  - [ ] In `render()` rolled-state block, if `rollResult.dramaticFailure`: show the failure message and skip vessel cards

- [ ] Task 2: Per-vessel allocation UI (AC: 1, 2, 3, 4)
  - [ ] In the rolled-state render block (when `vessels > 0` and no dramatic failure), replace the static "N vessels — X Vitae safe" line with per-vessel cards:
    - Container: `<div class="feeding-vessels-grid" id="feeding-vessels-grid">`
    - For each vessel `i` from 1 to `vessels`:
      ```html
      <div class="feeding-vessel-card" data-vessel-idx="i">
        <span class="fvc-label">Vessel i</span>
        <select class="fvc-select" id="fvc-sel-i" data-vessel-idx="i">
          <option value="">—</option>
          <option value="1">1 vitae — Safe</option>
          <option value="2">2 vitae — Safe</option>
          <option value="3">3 vitae — Drained (medical care needed)</option>
          <option value="4">4 vitae — Serious injury</option>
          <option value="5">5 vitae — Serious injury</option>
          <option value="6">6 vitae — Critical (near death)</option>
          <option value="7">7 vitae — Fatal</option>
        </select>
        <span class="fvc-consequence" id="fvc-con-i"></span>
      </div>
      ```
    - Total tally: `<div class="fvc-total">Total Vitae: <span id="fvc-total-val">0</span></div>`
    - Confirm button: `<button id="fvc-confirm" class="qf-btn qf-btn-submit" disabled>Confirm Allocation</button>`
  - [ ] Add a `feeding-vessels-grid` CSS class to `public/css/player-layout.css`:
    - Display: flex-column or grid, gap between cards
    - `.feeding-vessel-card`: flex row, align-items center, gap between elements
    - `.fvc-consequence`: coloured text (gold for safe, amber for 3, red for 4+, dark-red for 6+)
  - [ ] Wire change events on `.fvc-select`: update consequence label, recalculate total, enable/disable confirm button

- [ ] Task 3: Read-only state after allocation confirmed (AC: 6, 9)
  - [ ] Add a module-level `vitaeAllocation = null` variable (array of ints or null)
  - [ ] On tab load, after loading `rollResult`, also check `mySub.feeding_vitae_allocation`:
    - If present, set `vitaeAllocation = mySub.feeding_vitae_allocation`
  - [ ] When rendering vessel cards with a pre-existing allocation: render `<span>` instead of `<select>`, show the saved value and consequence label, show "Allocation recorded" badge
  - [ ] When `vitaeAllocation` is null and `feedingState === 'rolled'` and `vessels > 0`: render selectors (interactive)

- [ ] Task 4: Save allocation to DB (AC: 5)
  - [ ] In the Confirm Allocation click handler:
    - Collect values: `const alloc = Array.from(document.querySelectorAll('.fvc-select')).map(s => parseInt(s.value, 10))`
    - Call `apiPut('/api/downtime_submissions/' + responseSubId, { feeding_vitae_allocation: alloc })`
    - On success: set `vitaeAllocation = alloc`, re-render
    - On error: show error message, leave selectors interactive

- [ ] Task 5: Clear allocation on ST re-roll (AC: 10)
  - [ ] In the ST re-roll handler (`feeding-reroll-btn` click), extend the existing `apiPut` call to also clear `feeding_vitae_allocation`:
    ```js
    await apiPut(`/api/downtime_submissions/${responseSubId}`, {
      feeding_roll_player: null,
      feeding_vitae_allocation: null,
    });
    ```
  - [ ] Reset `vitaeAllocation = null` in module state

---

## Dev Notes

### Key files

| File | Change |
|------|--------|
| `public/js/player/feeding-tab.js` | Dramatic failure check, vessel card render, allocation state, DB save, re-roll clear |
| `public/css/player-layout.css` | `.feeding-vessels-grid`, `.feeding-vessel-card`, `.fvc-consequence` colour states |

### feeding_vitae_allocation field

New field on downtime submission documents. The downtime submission schema (`downtime_submission.schema.js`) does not need to change — the schema uses `additionalProperties: false`, but only on ST-controlled fields. The `feeding_vitae_allocation` field sits at the top level alongside `feeding_roll_player` which is already accepted without schema changes.

Double check: look at how `feeding_roll_player` is accepted by the server PUT route to confirm the same path works for `feeding_vitae_allocation`.

### Dramatic failure detection

The discipline used in the pool is known from:
- `declaredDisc` (from `mySub.responses['_feed_disc']`) — set during the loading phase
- `selectedDisc` — set from the generic picker

Both are module-level variables already populated before `doFeedingRoll()` runs. Check either:

```js
const usedDisc = !!(declaredDisc || selectedDisc);
if (usedDisc && successes === 0) rollResult.dramaticFailure = true;
```

Store `dramaticFailure` in `rollResult` so it survives the localStorage/DB round-trip.

### Consequence colours

Use existing CSS vars:
- Safe (1–2): `color: var(--gold2)` (`#E0C47A`)
- Drained (3): `color: #C89040` (amber — or use `var(--gold1)` if defined)
- Serious (4–5): `color: var(--crim)` (`#8B0000`)
- Critical/Fatal (6–7): `color: #CC0000` (bright red, or use inline)

### playerportal is desktop-first

No max-width caps, no single-column mobile layout. The vessel cards grid can be a flex-wrap or 2-column grid. Vessels up to 10 should be displayable without scrolling.

### The roll result does NOT change

`vessels`, `safeVitae`, `successes` — all remain as calculated. The allocation is a separate layer on top. The "safe vitae" ceiling (2 per vessel) is informational context; the player may allocate more per vessel if they choose, with visible consequences.

### What this story does NOT change

- Roll mechanics (dice, 10-again, rote)
- Roll locking mechanism (`feeding_roll_player` in DB + localStorage fallback)
- `renderFeedingHistoryPane` — history pane is unchanged
- `renderFeedingSummary()` — submission summary is unchanged
- `feedingState` transitions — still: loading → ready/no_submission → rolled
- ST re-roll button remains

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Claude (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
