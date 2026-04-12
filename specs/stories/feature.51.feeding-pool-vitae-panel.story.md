# Story feature.51: Feeding Validation — Pool & Vitae Modifier Panel

## Status: done

## Story

**As an** ST processing feeding submissions,
**I want** a right-side summary panel that auto-calculates dice pool modifiers and vitae gains/losses from the character's sheet,
**so that** I can see the full feeding picture at a glance without cross-referencing the character sheet manually.

---

## Background

The feeding panel currently shows the ST Pool Builder (Attr/Skill/Disc dropdowns, modifier ticker, rote, total expression). This gives the ST the base pool. But several modifiers affect the pool and vitae outcome — Feeding Grounds, unskilled penalty, Herd, Oath of Fealty, ambience, ghoul retainer costs — and these currently require manual calculation.

The panel is full-width. A right-side column (~25%) can hold a two-section summary without crowding the existing builder.

The pool modifier section is **informational reference** — the ST reads it and adjusts the pool builder's modifier accordingly. It is not wired into the pool expression automatically.

The vitae tally is also **reference data** for game administration. Final vitae result is saved to `feeding_review` for ST record-keeping.

---

## Acceptance Criteria

### Layout (AC 1)
1. The feeding action panel renders as a two-column layout when expanded: left column (~75%) holds the existing content (description, player pool, ST pool builder, validation status, feedback, notes); right column (~25%) holds the new modifier panel.

### Dice Pool Modifier Panel (AC 2–5)
2. The right panel top section is labelled **Dice Pool Modifiers** and shows:
   - **Feeding Grounds**: `+N` where N = `rating` of the character's `Feeding Grounds` domain merit (0 if not present). If character not loaded, shows `—`.
   - **Unskilled penalty**: shown only when the selected skill has 0 dots:
     - `-3` if the skill is in `SKILLS_MENTAL`
     - `-1` for all other skills
     - Absent (blank row) when skill has dots or no skill is selected
   - **Equipment / circumstance**: a manual ticker, integer clamped to [−5, +5], default 0. Saved to `feeding_review.pool_mod_equipment`.
   - **Total**: sum of Feeding Grounds + unskilled + equipment, shown prominently.

3. The unskilled penalty updates live when the Skill dropdown changes.

4. The equipment ticker updates live (no save on each click — saves on validation status change or panel close, same as other `feeding_review` fields).

5. The pool modifier total is display-only. The ST manually applies it to the pool builder's modifier ticker. No automatic linkage between panels.

### Vitae Tally Panel (AC 6–11)
6. The right panel bottom section is labelled **Vitae Tally** and shows the following line items (in order):

   | Line | Source | Value |
   |------|--------|-------|
   | Herd | `Herd` domain merit `rating` | +N |
   | Feeding Grounds | feeding grounds does not contribute vitae | — |
   | Oath of Fealty | character has `{ category: 'pact', name: 'Oath of Fealty' }` in `powers` | +N where N = Invictus covenant status (see AC 7) |
   | Ambience | best ambience of feeding territory | +N or −N |
   | Ghoul retainers | count of `{ name: 'Retainer', area: 'ghoul' }` entries in `merits` | −N (one per entry, regardless of rating) |
   | Rite costs | placeholder — not yet automated | shows `0` with a muted note "(enter manually)" |

7. **Oath of Fealty vitae** = `Math.max(char.status?.covenant || 0, char._ots_covenant_bonus || 0)`. This requires `applyDerivedMerits` to have been run. Since `char` comes from `passedChars` (admin.js `chars` array, which has `_ots_covenant_bonus` set at render time), this is available directly.

8. **Ambience** source: look up `entry.primaryTerr` in `cachedTerritories` first (territories collection, `ambienceMod` field), fall back to `TERRITORY_DATA`. If no territory or ambience = 0, row is omitted.

9. **Manual vitae adjustment**: a ticker below the line items, integer, no clamp. Default 0. Saved to `feeding_review.vitae_mod_manual`. Labelled "Manual adjustment".

10. **Rite cost manual input**: a small number input (min 0) below the rite costs row. Default 0. Saved to `feeding_review.vitae_rite_cost`. Replaces the `0 (enter manually)` when changed.

11. **Final Vitae**: sum of all auto items + manual adjustment − rite cost, shown prominently. Cannot go below 0 for display purposes (show 0 if negative).

### Unskilled in pool builder total (AC 12)
12. `_updatePoolTotal` and `_poolTotalDisplay` apply unskilled penalty to the total display when the selected skill has 0 dots:
    - `-3` if skill is in `SKILLS_MENTAL`
    - `-1` otherwise
    - The pool expression string (`pool_validated`) does NOT change — the total displayed below the builder reflects the corrected count. Example: `Intelligence 3 + Stealth 0 = 2 (−1 unskilled)`.

### Data model (AC 13)
13. `feeding_review` gains three new optional fields (no schema changes required — cycle and submission schemas allow additional properties):
    ```js
    pool_mod_equipment: integer,   // [-5, +5], default 0
    vitae_mod_manual:   integer,   // any integer, default 0
    vitae_rite_cost:    integer,   // >= 0, default 0
    ```
    These are saved via the existing `saveEntryReview(entry, patch)` mechanism on change.

### Character not loaded (AC 14)
14. When `char` is null (character data not available), all auto-computed rows in both panels show `—`. Ticker inputs for equipment, manual vitae, and rite cost are still rendered and functional.

---

## Data lookups

### Feeding Grounds
```js
const fg = (char?.merits || []).find(m => m.name === 'Feeding Grounds');
const fgDice = fg ? (fg.rating || 0) : null; // null = not loaded
```

### Herd
```js
const herd = (char?.merits || []).find(m => m.name === 'Herd');
const herdVitae = herd ? (herd.rating || 0) : null;
```

### Oath of Fealty
```js
const hasOoF = (char?.powers || []).some(p => p.category === 'pact' && p.name === 'Oath of Fealty');
const oofVitae = hasOoF ? Math.max(char.status?.covenant || 0, char._ots_covenant_bonus || 0) : 0;
```

### Ghoul retainers
```js
const ghoulCount = (char?.merits || []).filter(m =>
  m.name === 'Retainer' && (m.area || m.qualifier || '').toLowerCase().includes('ghoul')
).length;
```

### Ambience
```js
const terrRec = (cachedTerritories || TERRITORY_DATA).find(t =>
  t.id === entry.primaryTerr || t.name === entry.primaryTerr ||
  t.name?.toLowerCase() === (entry.primaryTerr || '').replace(/_/g, ' ').toLowerCase()
);
const ambienceVitae = terrRec?.ambienceMod ?? null;
```

### Unskilled penalty
```js
function _unskilledPenalty(skillName, skillDots) {
  if (!skillName || skillDots > 0) return 0;
  return SKILLS_MENTAL.includes(skillName) ? -3 : -1;
}
```

---

## Tasks / Subtasks

- [x] Task 1: Two-column layout for feeding panel (AC 1)
  - [x] Wrap the existing feeding panel content in a left column div (`proc-feed-left`, flex ~75%)
  - [x] Add right column div (`proc-feed-right`, flex ~25%) beside it
  - [x] Wrap both in `proc-feed-layout` flex container
  - [x] CSS: `proc-feed-layout { display:flex; gap:16px; }` `proc-feed-left { flex:3; min-width:0; }` `proc-feed-right { flex:1; min-width:180px; }`

- [x] Task 2: Dice Pool Modifier panel (AC 2–5)
  - [x] Render `proc-feed-mod-panel` in right column
  - [x] Feeding Grounds row: name + value (or `—` if char null)
  - [x] Unskilled row: computed from currently-selected skill name + skill dots from builder; hidden when 0
  - [x] Equipment ticker: `−` / `+` buttons, display span, hidden input, clamped [−5, +5]; pre-populated from `rev.pool_mod_equipment || 0`
  - [x] Total row: sum, prominently styled
  - [x] Wire ticker buttons in `renderProcessingMode` event delegation (same pattern as modifier ticker in pool builder)
  - [x] Save `pool_mod_equipment` via `saveEntryReview` on ticker change

- [x] Task 3: Vitae Tally panel (AC 6–11)
  - [x] Render `proc-feed-vitae-panel` below pool mod panel in right column
  - [x] Herd row, Oath of Fealty row (only if character has OoF), Ambience row (only if non-zero), Ghoul retainers row (only if >0), Rite costs row (always, with manual input)
  - [x] Manual vitae adjustment ticker: no clamp, pre-populated from `rev.vitae_mod_manual || 0`
  - [x] Rite cost input: number input min 0, pre-populated from `rev.vitae_rite_cost || 0`
  - [x] Final vitae total: `Math.max(0, sum)`
  - [x] Wire ticker and rite cost input; save via `saveEntryReview` on change

- [x] Task 4: Unskilled penalty in pool builder total (AC 12)
  - [x] Update `_poolTotalDisplay`: accept optional `skillName` param; compute penalty; append `(−N unskilled)` to display string when penalty applies
  - [x] Update `_updatePoolTotal`: pass skill name from selected dropdown to `_poolTotalDisplay`
  - [x] Update `_buildPoolExpr`: NOT changed — expression string unchanged; penalty is display-only in total line

- [x] Task 5: Update unskilled row on skill change (AC 3)
  - [x] In the `proc-pool-skill` change event handler, also re-render the unskilled row in the right panel
  - [x] Since re-rendering only the unskilled row requires DOM access to the right column, trigger a lightweight update to `proc-feed-unskilled-row` element by recalculating from the skill dropdown's current value and `data-dots`

- [x] Task 6: Pre-populate saved values on panel open (AC 13)
  - [x] On render, read `rev.pool_mod_equipment`, `rev.vitae_mod_manual`, `rev.vitae_rite_cost` and set as initial values for their inputs

---

## Dev Notes

### `cachedTerritories`
Available as module-level `let cachedTerritories = null` in `downtime-views.js`. Loaded in `initDowntimeView` or on city-data fetch. If null, fall back to `TERRITORY_DATA`.

### `_ots_covenant_bonus` on `passedChars`
This is a runtime ephemeral field set by `applyDerivedMerits` in `mci.js`. The `chars` array in `admin.js` has had `applyDerivedMerits` run on each character (happens in `renderSheet` and `charAlerts`). Characters in `passedChars` may or may not have `_ots_covenant_bonus` set depending on whether their sheet has been opened this session. Safe fallback: `char._ots_covenant_bonus || 0`.

### Pool modifier panel is reference only
The right panel pool mod total is NOT fed back into `pool_validated`. The ST reads it and adjusts the pool builder's modifier manually. This avoids coupling between panels and keeps the pool expression self-contained.

### No schema changes
`feeding_review` is stored in the submission document. The submission schema allows additional properties. No server-side changes required.

### Key file
`public/js/admin/downtime-views.js` — all changes in this one file plus CSS in `public/css/admin-layout.css`.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Claude (Amelia) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
All 6 tasks implemented in a single pass.

- `_unskilledPenalty(skillName, skillDots)` helper added; `_poolTotalDisplay` updated to accept optional `skillName` and append `(−N unskilled)` annotation to the display string when penalty applies. `_buildPoolExpr` unchanged as required.
- `_updatePoolTotal` passes the selected skill name to `_poolTotalDisplay`.
- `_renderFeedRightPanel(entry, char, rev)` added — renders both the Dice Pool Modifiers panel and Vitae Tally panel as the right column. Uses `cachedTerritories || TERRITORY_DATA` for ambience lookup. Data attributes (`data-fg`, `data-herd`, `data-oof`, `data-ambience`, `data-ghouls`) stored on panel elements for live recalculation without re-render.
- `_updatePoolModTotal`, `_updateVitaeTotal`, `_updateUnskilledRow` live-update helpers added.
- `renderActionPanel` hoists `feedSub`/`feedChar` to function scope; opens `proc-feed-layout > proc-feed-left` wrapper before feeding section, closes left column and calls `_renderFeedRightPanel` after the notes section.
- Event delegation in `renderProcessingMode` wired for: equipment ticker (±5 clamp, saves `pool_mod_equipment`), manual vitae ticker (no clamp, saves `vitae_mod_manual`), rite cost input (saves `vitae_rite_cost` on blur). Skill dropdown change event calls `_updateUnskilledRow`.
- AC 14 (char null): right panel renders with `—` for Feeding Grounds and Herd; tickers still functional.

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
