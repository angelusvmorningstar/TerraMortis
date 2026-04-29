---
id: dtui.11
epic: dtui
status: review
priority: high
depends_on: [dtui.4, dtui.8]
---

# Story DTUI-11: Maintenance action target — chip array

As a player filing a Maintenance action,
I want the Target zone to show a chip grid of my own merits that require maintenance,
So that I select what I'm maintaining without typing or remembering merit names.

---

## Context

The current Maintenance action renders no target zone at all (`ACTION_FIELDS['maintenance']` = `['description']` only). The ST relies on the description textarea to understand what is being maintained. This story adds a structured target zone for Maintenance using the `.dt-chip-grid` pattern from dtui-2, populated from the character's own merits that require chapter-frequency maintenance.

`MAINTENANCE_MERITS` in `downtime-data.js` (line 90) defines the merit names that require periodic maintenance:
```javascript
export const MAINTENANCE_MERITS = ['Professional Training', 'Mystery Cult Initiation'];
```

The character's own copies of these merits are available on `_charData.merits` (the loaded character object). Each merit instance in the grid appears as a chip. A merit already targeted by another maintenance action slot in the same submission is shown as a greyed-out disabled chip.

dtui-8 established `renderTargetZone()` with a branch for `'maintenance'` that currently returns `''`. This story implements that branch.

---

## Files in scope

- `public/js/tabs/downtime-form.js` — implement the `maintenance` branch in `renderTargetZone()`; add `renderMaintenanceChips()` helper; update `collectResponses()` to collect `project_N_target_value` for Maintenance (reuses existing key); add chip click handler for maintenance target selection

---

## Out of scope

- Adding new merit types to `MAINTENANCE_MERITS` — data decision, not this story
- Allies Maintenance — dtui-16 (Allies target scoping)
- "Already maintained" tracking across cycles — only within the current submission's slots (same-cycle deduplication)

---

## Acceptance Criteria

### AC1 — Chip grid populated from character's maintenance merits

**Given** a player selects "Maintenance" and the character has two Professional Training merits at different dot ratings,
**When** the Target zone renders,
**Then** a `.dt-chip-grid` appears showing one chip per maintenance merit instance. Each chip shows the merit name and dot rating (e.g. "Professional Training ●●●").

### AC2 — Already-targeted merit shown as disabled

**Given** a player has already selected "Maintenance" in project slot 1 and targeted a specific merit,
**When** they open project slot 2 with action "Maintenance",
**Then** the merit targeted in slot 1 appears as a disabled chip in slot 2's grid with tooltip "Maintained this chapter."

### AC3 — Chip selection saved

**Given** a player clicks a chip in the maintenance grid,
**When** they save the form,
**Then** `project_N_target_value` contains the merit's identifier (merit name, or merit array index if name is not unique enough).

### AC4 — Saved selection pre-selects chip on reload

**Given** a player had selected "Mystery Cult Initiation" for a Maintenance action and saved,
**When** the form reloads,
**Then** the Mystery Cult Initiation chip is shown as selected (`.dt-chip--selected`).

### AC5 — Empty state when no maintenance merits

**Given** a player selects "Maintenance" and the character has no merits in `MAINTENANCE_MERITS`,
**When** the Target zone renders,
**Then** a notice appears: "No merits requiring maintenance found for this character."

### AC6 — Single-select behaviour

**Given** a player clicks a chip,
**When** another chip is already selected,
**Then** the previously selected chip deselects and only the newly clicked chip is selected.

---

## Implementation Notes

### Data source

The loaded character object is available as `_charData` within `renderProjectSlots()` scope. The character's merits array is `_charData.merits` (array of merit objects with `name`, `dots` or `rating` field).

To get the character's maintenance-eligible merits:
```javascript
const maintMerits = (_charData?.merits || [])
  .filter(m => MAINTENANCE_MERITS.includes(m.name));
```

### Already-maintained detection

Scan all project slots' saved data. A merit is already targeted if any other slot (index K ≠ n) has:
- `saved[project_K_action] === 'maintenance'`
- `saved[project_K_target_value]` matches this merit's identifier

```javascript
function getAlreadyMaintainedTargets(n, saved, maxSlots) {
  const maintained = new Set();
  for (let k = 1; k <= maxSlots; k++) {
    if (k === n) continue;
    if (saved[`project_${k}_action`] === 'maintenance' && saved[`project_${k}_target_value`]) {
      maintained.add(saved[`project_${k}_target_value`]);
    }
  }
  return maintained;
}
```

`maxSlots` is the number of project slots rendered; available from the existing slot count logic in `renderProjectSlots()`.

### Merit identifier

Use `merit.name` as the identifier stored in `project_N_target_value`. If a character has two merits with the same name at different ratings, append the rating to disambiguate: `"Professional Training_3"`. The simplest approach is to use `${m.name}_${m.dots || m.rating || 0}`.

### renderMaintenanceChips() helper

```javascript
function renderMaintenanceChips(n, saved, charData, alreadyMaintained) {
  const maintMerits = (charData?.merits || [])
    .filter(m => MAINTENANCE_MERITS.includes(m.name));

  if (maintMerits.length === 0) {
    return '<p class="qf-desc">No merits requiring maintenance found for this character.</p>';
  }

  const savedTarget = saved[`project_${n}_target_value`] || '';
  let h = '<div class="dt-chip-grid" data-maintenance-grid="' + n + '">';
  for (const m of maintMerits) {
    const id = `${m.name}_${m.dots || m.rating || 0}`;
    const dots = '●'.repeat(m.dots || m.rating || 0);
    const isSelected = savedTarget === id;
    const isDisabled = alreadyMaintained.has(id);
    const disabledAttr = isDisabled ? ' disabled aria-disabled="true"' : '';
    const selectedClass = isSelected ? ' dt-chip--selected' : '';
    const title = isDisabled ? ' title="Maintained this chapter."' : '';
    h += `<button type="button" class="dt-chip${selectedClass}"${disabledAttr}${title} ` +
         `data-maintenance-target="${n}" data-target-id="${esc(id)}">` +
         `${esc(m.name)} <span class="dt-chip__suffix">${dots}</span>` +
         `</button>`;
  }
  h += '</div>';
  return h;
}
```

### renderTargetZone() — maintenance branch

In `renderTargetZone()` (from dtui-8), implement the empty `maintenance` branch:

```javascript
if (actionVal === 'maintenance') {
  const alreadyMaintained = getAlreadyMaintainedTargets(n, saved, /* maxSlots */ 5);
  return renderMaintenanceChips(n, saved, chars._charData || chars, alreadyMaintained);
}
```

Note: `chars` is the `_allChars` / `_charData` parameter passed to `renderTargetZone`. Adjust the call site in `renderProjectSlots()` to pass the current character object as `chars` if it currently passes the full character list.

### Chip click handler

Add to the existing delegated click delegation (alongside the character/territory chip handlers from dtui-8):

```javascript
if (target.dataset.maintenanceTarget !== undefined) {
  const n = parseInt(target.dataset.maintenanceTarget);
  const id = target.dataset.targetId;
  // Single-select: deselect all chips in this grid
  document.querySelectorAll(`[data-maintenance-target="${n}"]`).forEach(c => {
    c.classList.remove('dt-chip--selected');
  });
  // Toggle: select this chip (unless already selected — click again deselects)
  const wasSelected = target.classList.contains('dt-chip--selected');
  if (!wasSelected) {
    target.classList.add('dt-chip--selected');
    saved[`project_${n}_target_value`] = id;
  } else {
    saved[`project_${n}_target_value`] = '';
  }
  scheduleSave();
}
```

### collectResponses()

The existing `collectResponses()` reads `project_N_target_value` via `getElementById`. The chip selection writes directly to `saved` and the `scheduleSave()` → `collectResponses()` path will pick it up from `saved`. No additional change needed if the existing path reads from `saved` before the form elements.

If `collectResponses()` reads from DOM elements only, add a maintenance target fallback analogous to the character chip handler in dtui-8.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — add `getAlreadyMaintainedTargets()`; add `renderMaintenanceChips()`; implement `maintenance` branch in `renderTargetZone()`; add `data-maintenance-target` click handler

---

## Definition of Done

- AC1–AC6 verified
- Chip grid populates from character's own maintenance merits
- Already-targeted merits in other slots appear disabled with tooltip
- Selected chip persists across save/reload
- Empty state notice when no maintenance merits
- Single-select enforced
- `specs/stories/sprint-status.yaml` updated: dtui-11 → review

---

## Compliance

- CC1 — Effective rating discipline: chip label shows effective dots (inherent + bonus)
- CC2 — Filter-to-context: only MAINTENANCE_MERITS appear; no irrelevant merits
- CC3 — Greyed-with-reason: disabled chips show "Maintained this chapter." tooltip
- CC4 — Token discipline: `.dt-chip-grid`/`.dt-chip` classes from dtui-2; no bare hex
- CC9 — Uses `.dt-chip-grid`/`.dt-chip` canonical components (dtui-2)

---

## Dependencies and Ordering

- **Depends on:** dtui-4 (action block), dtui-8 (`renderTargetZone()` scaffold with maintenance branch returning `''`)
- **Unblocks:** dtui-16 (Allies maintenance target scoping reuses this pattern)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- Added `'target'` to `ACTION_FIELDS['maintenance']` so the target zone renders.
- Added `getAlreadyMaintainedTargets(n, saved, maxSlots)` helper: scans all other slots for matching maintenance actions.
- Added `renderMaintenanceChips(n, saved, charData, alreadyMaintained)` helper: filters `charData.merits` by `MAINTENANCE_MERITS`, renders a `.dt-chip-grid` with hidden input `id="dt-project_${n}_target_value"` for `collectResponses()` compatibility. Empty-state notice when no eligible merits (AC5). Disabled chips with tooltip for already-targeted merits (AC2). Identifier format: `"${name}_${dots}"` for disambiguation.
- Added `maintenance` branch in `renderTargetZone()`: uses `currentChar` (module-level) for character data, passes `saved` and `getAlreadyMaintainedTargets` result.
- Added `data-maintenance-target` click handler in delegated click listener: single-select toggle (AC6), writes to hidden input, calls `scheduleSave()`. Disabled chips are guarded against click (AC2).
- `collectResponses()` unchanged: reads `project_N_target_value` via `getElementById` which finds the hidden input.

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-11 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-11 implemented: maintenance target chip grid from MAINTENANCE_MERITS; getAlreadyMaintainedTargets; hidden input for collectResponses compat. |
