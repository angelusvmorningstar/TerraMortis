# Story issue-168: Regency — allow feeding rights to exceed territory cap

Status: review

issue: 168
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/168
branch: morningstar-issue-168-regency-feeding-rights-cap

---

## Story

As a regent using the Regency tab,
I want to see at least 10 feeding-right slots by default and be able to add more
via a button,
So that I can grant over-cap feeding rights without needing legacy data to unlock
the over-cap display path.

---

## Current State (post-PR #159)

Issue #159 already landed and changed `loopEnd` in `render()` (lines 144-155) so
that:
- The cap is treated as a soft warning, not a hard gate
- A trailing empty slot is always shown beyond filled count
- `MAX_FEEDING_POSITION = 12` is a hard ceiling constant at line 16

**What is still missing for issue #168:**
1. The default visible count does not yet guarantee 10 slots — it shows
   `Math.max(minWithinCap, filledCount + 1)`, which for cap=8 (The Rack) only
   renders 6 or 7 rows at initial load
2. No "+ Add Feeding Right" button exists

---

## Acceptance Criteria

**AC-1 — Default 10 slots (cap ≤ 10)**
Given a territory with ambience cap ≤ 10 (all current territories — max cap is 8),
When the regent opens the Regency tab,
Then exactly 10 editable feeding-right slot rows are shown (positions beyond the cap
are red + "Over cap — penalty applies", existing over-cap display intact).

**AC-2 — High-cap territory (cap > 10)**
Given a territory whose ambience cap exceeds 10 (hypothetical future territory),
When the regent opens the Regency tab,
Then `cap` slots are shown — all within-cap, no red rows.

**AC-3 — "+ Add Feeding Right" button always present**
Given the Regency tab is rendered,
When the cycle is not yet confirmed and the regent has not confirmed,
Then a "+ Add Feeding Right" button appears below the slot grid.

**AC-4 — Button appends a new over-cap slot**
Given the "+ Add Feeding Right" button is visible,
When the regent clicks it,
Then one new slot row is appended at the bottom, styled red + "Over cap — penalty
applies" (it is always beyond the cap since the default already shows cap+excess
up to 10).

**AC-5 — Button disabled/hidden at hard ceiling**
Given the slot count has reached `MAX_FEEDING_POSITION`,
When the regent views the tab,
Then the "+ Add" button is hidden or disabled — no further slots can be added.

**AC-6 — Button hidden when confirmed**
Given the current cycle's feeding rights have been confirmed by this regent,
When the regent views the tab,
Then the "+ Add" button is not rendered (consistent with how the Save/Confirm buttons
gate on confirmation state).

**AC-7 — Save, reload, and locked slots unaffected**
Given a regent has filled and saved feeding rights including over-cap slots,
When the tab reloads,
Then the saved values render correctly — over-cap slots show red, confirmed slots
lock, "Fed this cycle" slots lock. No regression to existing behaviour.

---

## Tasks / Subtasks

- [x] T1 — Increase `MAX_FEEDING_POSITION` constant to 20
- [x] T2 — Update `loopEnd` calc to default to at least 10 additional slots
- [x] T3 — Add `_addFeedingRightSlot(container)` DOM-append helper
- [x] T4 — Render "+ Add Feeding Right" button in `render()` action bar
- [x] T5 — Wire "+ Add" button in `wireEvents(container)`
- [x] T6 — Hide "+ Add" button when slot count is at `MAX_FEEDING_POSITION`

---

## Dev Notes

### File

Single file: `public/js/tabs/regency-tab.js`. No API, schema, or CSS changes needed
— all existing CSS classes (`dt-over-cap`, `dt-over-cap-warn`) and existing
`MAX_FEEDING_POSITION` ceiling already provide the required support.

### T1 — Increase MAX_FEEDING_POSITION

```js
// line 16: was 12; increase to 20 (safety ceiling for save/getResidencyList scan loops)
const MAX_FEEDING_POSITION = 20;
```

This constant is a code-only scan limit used in `saveRegency()`,
`confirmFeeding()`, and `getResidencyList()`. It is not a game rule.

### T2 — Update loopEnd calculation (lines 152-155)

```js
// CURRENT (lines 152-155):
const filledCount = additionalRights.length;
const minWithinCap = Math.max(0, cap - (loopStart - 1));
const desiredAdditionals = Math.max(minWithinCap, filledCount + 1);
const loopEnd = Math.min(loopStart + desiredAdditionals - 1, MAX_FEEDING_POSITION);

// AFTER (add DEFAULT_MIN_SLOTS constant near MAX_FEEDING_POSITION at top of file,
// then update the desiredAdditionals line):
const DEFAULT_MIN_SLOTS = 10; // add near MAX_FEEDING_POSITION at top of file

// In render():
const filledCount = additionalRights.length;
const minWithinCap = Math.max(0, cap - (loopStart - 1));
const desiredAdditionals = Math.max(DEFAULT_MIN_SLOTS, minWithinCap, filledCount + 1);
const loopEnd = Math.min(loopStart + desiredAdditionals - 1, MAX_FEEDING_POSITION);
```

With cap=8, loopStart=3 (lieutenant present), 0 filled:
- `minWithinCap = 6`, `desiredAdditionals = max(10, 6, 1) = 10`
- `loopEnd = min(3+10-1, 20) = min(12, 20) = 12` → 10 slot rows ✓

With loopStart=2 (no lieutenant):
- `minWithinCap = 7`, `desiredAdditionals = max(10, 7, 1) = 10`
- `loopEnd = min(2+10-1, 20) = min(11, 20) = 11` → 10 slot rows ✓

### T3 — _addFeedingRightSlot helper

Add a new function **after** `wireEvents`. Use DOM append rather than a full
`render()` call to avoid losing unsaved picker values (pickers that have been
changed by the user but not yet saved live in `_slotValues` but not yet in
`_terrDoc().feeding_rights`, so a full re-render would lose them).

```js
function _addFeedingRightSlot(container) {
  const grid = container.querySelector('.dt-residency-grid');
  if (!grid) return;
  const cap = getRegentCap();

  // Find the current highest slot index rendered in the grid
  const rows = grid.querySelectorAll('[data-reg-slot-row]');
  if (!rows.length) return;
  const lastSlot = parseInt(rows[rows.length - 1].dataset.regSlotRow, 10);
  const nextSlot = lastSlot + 1;
  if (nextSlot > MAX_FEEDING_POSITION) return;

  const overCap = nextSlot > cap;
  const row = document.createElement('div');
  row.className = overCap ? 'dt-residency-row dt-over-cap' : 'dt-residency-row';
  row.dataset.regSlotRow = String(nextSlot);

  const label = document.createElement('span');
  label.className = 'dt-residency-label';
  label.textContent = `Feeding Right ${nextSlot}`;
  row.appendChild(label);

  const ph = document.createElement('div');
  ph.dataset.cpMount = '';
  ph.dataset.cpSite = 'reg-slot';
  ph.dataset.cpScope = 'all';
  ph.dataset.cpCardinality = 'single';
  ph.dataset.regSlot = String(nextSlot);
  ph.dataset.cpInitial = JSON.stringify('');
  ph.dataset.cpPlaceholder = 'Pick a feeding right';
  row.appendChild(ph);

  if (overCap) {
    const warn = document.createElement('span');
    warn.className = 'dt-over-cap-warn';
    warn.title = 'This slot exceeds the territory feeding-rights cap. The resident feeds under a mechanical penalty (ST adjudicates).';
    warn.textContent = 'Over cap — penalty applies';
    row.appendChild(warn);
  }

  grid.appendChild(row);
  _mountOneRegSlotPicker(ph, container);

  // Hide the button when we've reached the hard ceiling
  if (nextSlot >= MAX_FEEDING_POSITION) {
    container.querySelector('#reg-add-right')?.remove();
  }
}
```

### T4 — Render "+ Add" button in render()

In the action buttons section (currently lines 242-251), add the "+Add" button
**before** the Save button, hidden when confirmed:

```js
// After `h += '<div class="regency-actions">';`:

// Show "+ Add" only when not yet confirmed (mirrors save/confirm gating)
const canAdd = !cycleConfirmed && !myConfirmation;
if (canAdd && loopEnd < MAX_FEEDING_POSITION) {
  h += '<button id="reg-add-right" class="qf-btn qf-btn-secondary">+ Add Feeding Right</button>';
}
h += '<button id="reg-save" class="qf-btn qf-btn-submit">Save Feeding Rights</button>';
```

Note: even if `loopEnd === MAX_FEEDING_POSITION` at initial render (with DEFAULT_MIN_SLOTS + lt
present: loopEnd = 12 < 20), the button renders. It only disappears when
`loopEnd >= MAX_FEEDING_POSITION` OR when confirmed.

### T5 — Wire the button in wireEvents()

```js
function wireEvents(container) {
  _mountRegSlotPickers(container);
  container.querySelector('#reg-save')?.addEventListener('click', saveRegency);
  container.querySelector('#reg-confirm')?.addEventListener('click', () => confirmFeeding(container));
  container.querySelector('#reg-add-right')?.addEventListener('click', () => _addFeedingRightSlot(container));
}
```

### T6 — Already handled in T3 / T4

The `_addFeedingRightSlot` function calls `container.querySelector('#reg-add-right')?.remove()`
when `nextSlot >= MAX_FEEDING_POSITION`. The initial render already omits the button
when `loopEnd >= MAX_FEEDING_POSITION`.

### What to preserve (must not regress)

- `dt-over-cap` / `dt-over-cap-warn` styling on slots beyond cap — untouched
- `_lockedCharIds` / "Fed this cycle" locking — slot appending only adds new empty slots,
  locked slots are not affected
- `saveRegency()` and `getResidencyList()` scan up to `MAX_FEEDING_POSITION` — increasing
  the constant automatically covers newly added slots
- `confirmFeeding()` also scans to `MAX_FEEDING_POSITION` — same
- Re-render after `confirmFeeding()` calls `render(container)` again — the `loopEnd`
  recalculation will reflect the now-confirmed state and omit the "+Add" button
- `_remountOtherRegSlotPickers` is triggered by charPicker `onChange` — new appended
  slots share the same picker site `reg-slot` and will be included in the re-mount sweep

### data-cp-mount attribute

When creating the placeholder in `_addFeedingRightSlot`, note that `data-cp-mount`
must be set as an attribute with no value (`ph.dataset.cpMount = ''`) — this is the
same pattern used in the HTML string builder (line 230: `data-cp-mount`). The
`_mountRegSlotPickers` helper queries via `[data-cp-mount][data-cp-site="reg-slot"]`
but is only run once at initial `wireEvents`. The new slot must use
`_mountOneRegSlotPicker(ph, container)` directly (as shown in T3).

---

## Verification

### Commands

```
node --input-type=module --check < public/js/tabs/regency-tab.js
```

### Manual (terramortis-dev.netlify.app after merge to dev)

1. Open Regency tab for any territory.
2. Confirm at least 10 slot rows are shown (count the "Feeding Right N" labels).
3. Rows above the ambience cap should be red with "Over cap — penalty applies".
4. Click "+ Add Feeding Right" — one more red row appends at the bottom.
5. Fill a picker in the new slot. Save. Reload — value persists.
6. Fill a picker in an existing slot, then immediately click "+ Add" without saving —
   the pre-add picker value must still be present after the row is appended
   (regression guard for DOM-append approach vs full re-render).
7. Confirm feeding rights — "+ Add" button disappears.
8. Reload tab post-confirm — confirmed slots show "Confirmed" chip, locked slots
   show "Fed this cycle" chip, over-cap rows still red.

---

## Dev Agent Record

### Completion Notes

T1: `MAX_FEEDING_POSITION` raised from 12 to 20. `DEFAULT_MIN_SLOTS = 10` added alongside it.
T2: `desiredAdditionals` now uses `Math.max(DEFAULT_MIN_SLOTS, minWithinCap, filledCount + 1)` — guarantees 10 visible rows at initial load for all current territories (max cap = 8).
T3: `_addFeedingRightSlot(container)` added — DOM-append pattern avoids full re-render to preserve unsaved picker values. Calls `_mountOneRegSlotPicker` directly. Removes the button when `nextSlot >= MAX_FEEDING_POSITION`.
T4: "+Add Feeding Right" button rendered before Save, gated on `canAdd && loopEnd < MAX_FEEDING_POSITION`.
T5: Button wired in `wireEvents`.
T6: Handled in T3 (button self-removes at ceiling) and T4 (initial render omits when at ceiling).
Syntax check clean.

### File List

- public/js/tabs/regency-tab.js

### Change Log

- 2026-05-12 — Implemented issue #168: default 10 slots, "+ Add Feeding Right" button, MAX_FEEDING_POSITION 12→20, DOM-append helper.
