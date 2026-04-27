---
id: dtfp.1
epic: dtfp
status: ready-for-dev
priority: low
depends_on: []
---

# Story DTFP-1: Influence stepper "decreasing / increasing ambience" labels

As a player allocating my monthly influence to shift territory ambience,
I should see contextual labels around the stepper that say "decreasing ambience" when I have a negative value and "increasing ambience" when I have a positive value (and nothing when the value is zero),
So that the in-world meaning of my influence allocation is visible at a glance — I read "Academy: decreasing ambience −2" rather than just a bare number that I have to remember the polarity convention for.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 2 (Player Form Polish), opening story. Today's influence section in the DT form (`public/js/tabs/downtime-form.js:4316-4333`) renders each territory row as `name | − | val | +`. The numeric value carries the polarity (`-2`, `0`, `+1`), but the in-world meaning (am I pushing ambience up or down? am I doing nothing at all?) is left for the player to infer from the sign.

Players have to internalise the convention: positive = increasing ambience, negative = decreasing ambience. New players miss this; experienced players occasionally tap the wrong button when fatigued. DTFP-1 makes the meaning visible:

- **When value < 0**: a "decreasing ambience" label appears to the **left** of the stepper.
- **When value > 0**: an "increasing ambience" label appears to the **right** of the stepper.
- **When value = 0**: no label appears either side. The stepper sits cleanly with no clutter.

This is a **pure render** change — the stored value is unchanged, the increment/decrement handlers are unchanged, only the displayed text around the stepper changes based on the current value.

### Files in scope

- `public/js/tabs/downtime-form.js` — `case 'influence_grid'` block at lines 4316-4333: add the conditional left/right label spans inside `.dt-influence-control`.
- `public/css/` (verify file): minor styling for the new label classes (`.dt-influence-label-left`, `.dt-influence-label-right`) — typography muted, italic if appropriate, sufficient spacing from the stepper buttons.
- The same logic needs to fire on every increment/decrement (the labels recompute when the value changes). Verify the existing increment handler updates the row's HTML or the value display, and add a label-update line.

### Out of scope

- The territory ambience grid (separate `territory_grid` case at line 4338); ambience there is read-only display, no stepper.
- Influence budget rendering (the `dt-influence-budget` line); unchanged.
- Renaming the section title "Influence" or any structural change to the influence section.
- Server-side change — none required.
- Showing the territory's current actual ambience next to the player's adjustment (could be useful but adds complexity; defer if requested as a follow-up).

---

## Acceptance Criteria

### Label rendering

**Given** I am a player on the DT form's Influence section
**When** a territory row renders with value < 0 (e.g. `−2`)
**Then** the row reads:
> Academy [decreasing ambience]  −  −2  +
- The label "**decreasing ambience**" sits to the **left** of the `−` button (between the territory name and the stepper, or just immediately left of the `−`).
- It is visually subtle (muted colour, smaller or italic text) so it doesn't dominate the row.

**Given** a row with value > 0 (e.g. `+1`)
**Then** the row reads:
> Academy   −  +1  +  [increasing ambience]
- The label "**increasing ambience**" sits to the **right** of the `+` button.

**Given** a row with value = 0
**Then** **no label** appears on either side.
**And** the row reads exactly as today: `Academy   −  0  +`.

### Live update

**Given** I click `+` or `−` to change a row's value
**When** the value transitions across zero (e.g. from −1 to 0, or from 0 to +1)
**Then** the label appears or disappears immediately on the new value.

**Given** I click `+` to take a row from 0 to +1
**Then** the "increasing ambience" label appears to the right.

**Given** I click `−` to take a row from +2 to +1
**Then** the "increasing ambience" label remains visible (sign unchanged).

### Visual

**Given** any influence row
**Then** the labels do not push the stepper buttons off-grid; the row layout remains consistent across rows that have labels and rows that don't.
**And** column widths accommodate the longest possible label text without breaking alignment.

### British English

**Given** the label text
**Then** it uses British English spelling and lowercase ("decreasing ambience" / "increasing ambience"), not Title Case or US spelling. No punctuation.

### Accessibility

**Given** a screen-reader user reads a row
**Then** the label text is part of the same row context (not visually-hidden text), so the meaning is conveyed normally.

---

## Implementation Notes

### Render change

In `case 'influence_grid'` at line 4322, modify the row render:

```js
for (const terr of INFLUENCE_TERRITORIES) {
  const tk = terr.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const val = infVals[tk] || 0;
  const labelLeft  = val < 0 ? '<span class="dt-influence-label dt-influence-label-left">decreasing ambience</span>' : '';
  const labelRight = val > 0 ? '<span class="dt-influence-label dt-influence-label-right">increasing ambience</span>' : '';

  h += '<div class="dt-influence-row">';
  h += `<span class="dt-influence-terr">${esc(terr)}</span>`;
  h += '<span class="dt-influence-control">';
  h += labelLeft;
  h += `<button type="button" class="dt-inf-btn" data-inf-terr="${tk}" data-inf-dir="-1">−</button>`;
  h += `<span class="dt-inf-val" id="inf-val-${tk}">${val}</span>`;
  h += `<button type="button" class="dt-inf-btn" data-inf-terr="${tk}" data-inf-dir="1">+</button>`;
  h += labelRight;
  h += '</span>';
  h += '</div>';
}
```

### Live update on click

Find the existing increment handler for `.dt-inf-btn`. After it updates the displayed value, also update the labels. Two options:

**Option A — re-render the row.** Simpler, fewer moving parts. The handler grabs the row element, recomputes its HTML via the helper above, and replaces the row's inner HTML.

**Option B — toggle label visibility/text directly.** Find the `.dt-influence-label-left` / `.dt-influence-label-right` spans and add/remove them or toggle a hidden class. More surgical but requires careful state management.

Option A is recommended for v1: simpler, matches the rest of the DT form's render pattern, and the row is small enough that re-render is cheap.

### CSS additions

```css
.dt-influence-label {
  color: var(--txt3);          /* muted */
  font-size: .8em;
  font-style: italic;
  margin: 0 .5rem;             /* breathing room around the stepper */
  white-space: nowrap;
}
.dt-influence-label-left  { margin-right: .75rem; }
.dt-influence-label-right { margin-left:  .75rem; }
```

Reuse existing tokens (`var(--txt3)` for muted text). Verify the tokens exist; if not, use the next-darkest text token in the project's palette.

### No tests required

Pure UI render change. Manual smoke test:
- Open Influence section as player, click `+` on a territory: increasing label appears.
- Click `−` to bring it back to 0: label disappears.
- Click `−` to take it negative: decreasing label appears on the left.
- Verify all five INFLUENCE_TERRITORIES behave the same.

### Strawman wording

- Negative label: **"decreasing ambience"** (lowercase, no punctuation, italic muted)
- Positive label: **"increasing ambience"** (same treatment)
- Zero: no label

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — `case 'influence_grid'` row render extended with conditional left/right labels; increment/decrement handler updates the labels (re-render row recommended).
- `public/css/<dt-form-css-file>.css` — minor styles for `.dt-influence-label`, `.dt-influence-label-left`, `.dt-influence-label-right`. Reuse existing tokens.

No schema, no API, no server changes.

---

## Definition of Done

- All AC verified.
- Manual smoke test exercises positive, negative, and zero values across all five INFLUENCE_TERRITORIES.
- Live updates correctly when crossing zero in both directions.
- Visual: rows align, labels don't push the stepper off-grid.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtfp-1-influence-stepper-labels: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Independent of every other story.
- Tiny, ships standalone within Epic DTFP.
