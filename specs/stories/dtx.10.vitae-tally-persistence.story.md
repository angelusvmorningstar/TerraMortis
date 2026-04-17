# DTX.10 — Vitae Tally Persistence & Player Portal Display

## Status: Ready for Dev

## Context

The admin downtime processing panel computes a comprehensive Vitae Tally for each feeding action (`downtime-views.js:5764–5880`). This tally includes Herd dots, territory ambience, Oath of Fealty, ghoul costs, rite costs, and manual ST adjustments. The calculation is correct and visible to the ST during processing — but it is **computed on-the-fly and never persisted**. The player portal (`feeding-tab.js`) has no access to any of it.

Currently the player sees only raw roll results:
```
vessels = successes (from dice roll)
safeVitae = successes * 2
```

Herd and ambience contribute **bonus vitae**, not bonus vessels. A player with Herd 3 and +2 ambience who rolls 4 successes should see:
- 4 vessels (from the roll)
- Bonus vitae: +3 Herd, +2 Ambience = +5
- Total vitae available: 4 vessels worth of blood + 5 bonus vitae

The player must then choose how much vitae to take per vessel (the allocation UI) with the bonus vitae added to their total pool. The current allocation UI treats vitae as purely vessel-derived and doesn't account for bonus sources.

## What Needs to Happen

### 1. Persist the Vitae Tally at Roll Time

When the ST rolls (or confirms) a feeding action in the admin processing panel, save the vitae breakdown alongside the roll result.

**Schema addition** (`server/schemas/downtime_submission.schema.js`):

Add a `feeding_vitae_tally` field to the submission:

```js
feeding_vitae_tally: {
  type: 'object',
  properties: {
    herd:           { type: 'integer' },  // Herd merit dots (incl. SSJ/Flock bonus)
    ambience:       { type: 'integer' },  // Territory ambienceMod (can be negative; Barrens = -4)
    ambience_territory: { type: 'string' }, // Territory name for display
    oath_of_fealty: { type: 'integer' },  // Covenant status dots (0 if no OoF)
    ghouls:         { type: 'integer' },  // Ghoul retainer count (subtracted)
    rite_cost:      { type: 'integer' },  // Vitae spent on rites (subtracted)
    manual:         { type: 'integer' },  // ST manual adjustment
    total_bonus:    { type: 'integer' },  // Computed: herd + ambience + oof - ghouls + manual - rites
  },
  additionalProperties: true,
}
```

**Save location** — `downtime-views.js`, in the `showRollModal` callback (~line 3940–3945). After `await updateSubmission(subId, { feeding_roll: result })`, also save:

```js
await updateSubmission(subId, {
  feeding_roll: result,
  feeding_vitae_tally: {
    herd: herdVitae,
    ambience: ambienceVitae,
    ambience_territory: bestTerrLabel,
    oath_of_fealty: oofVitae,
    ghouls: ghoulCount,
    rite_cost: vitaeRite,
    manual: vitaeMod,
    total_bonus: finalVitae,  // the already-computed value from the Vitae Tally panel
  }
});
```

The values are already computed in the rendering function that builds the Vitae Tally panel. They need to be accessible at roll time — either passed through to the roll handler via data attributes (some already are: `data-herd`, `data-ambience`, `data-ghouls`, `data-oof`) or recomputed from the DOM state.

**Important:** `feeding_vitae_tally` should NOT be stripped by `stripStReview` — players need to see it.

### 2. Player Portal: Display Vitae Breakdown

**File:** `public/js/player/feeding-tab.js`

When `feedingState === 'rolled'`, after the dice result display, show the vitae breakdown if `mySub.feeding_vitae_tally` exists:

```
┌──────────────────────────────────────┐
│ Vitae Sources                        │
│                                      │
│ Vessels (from roll)        4         │
│ Herd                      +3         │
│ Ambience (Eastern Suburbs) +2        │
│ Ghoul retainers           −1         │
│ Rite costs                −1         │
│                          ─────       │
│ Total vitae available      7         │
└──────────────────────────────────────┘
```

Only show rows where the value is non-zero. Label negative items with a minus sign. Use the existing `.proc-mod-row` / `.proc-mod-val` styling pattern (or create equivalent `.fvc-*` classes in the player layout).

### 3. Revised Allocation UI

The current vessel allocation UI (`feeding-tab.js:504–537`) creates one dropdown per vessel (1–7 vitae each) and treats `safeVitae = successes * 2` as the safe threshold.

With bonus vitae, the model changes:

- **Vessels** = roll successes (unchanged — this is how many mortals you found)
- **Bonus vitae** = herd + ambience + oof − ghouls − rites + manual (from the tally)
- **Total vitae available** = bonus vitae is "free" — it comes from Herd (reliable blood sources), territory quality, and covenant privileges. It doesn't require draining additional vessels.
- The player allocates vitae per vessel for the vessel-sourced blood only. Bonus vitae is added on top automatically.

**Suggested UX flow:**

1. Show the vitae breakdown card (Section 2 above)
2. Show the vessel allocation grid:
   - N vessel cards (one per success), each with a dropdown: 1–7 vitae
   - "Safe" threshold per vessel = 2 vitae (unchanged)
   - Draining beyond 2 per vessel risks a Humanity check (unchanged)
3. Below the grid, show the total:
   ```
   Vessel vitae:  6  (from 4 vessels × player choices)
   Bonus vitae:  +5  (Herd 3, Ambience +2)
   ─────────────────
   Total gained:  11 vitae
   ```
4. Confirm button persists both `feeding_vitae_allocation` (per-vessel array) and `feeding_vitae_total` (the final number including bonuses)

### 4. Game Sign-In Integration

At game sign-in, the ST (or the sign-in system) needs to know each player's feeding result. The persisted `feeding_vitae_tally` + `feeding_roll_player` (or `feeding_roll`) + `feeding_vitae_allocation` together give the complete picture:

- **Roll outcome:** successes, again threshold, rote, exceptional
- **Vitae breakdown:** herd, ambience, territory, oof, ghouls, rites
- **Allocation:** how much the player chose to drain per vessel
- **Total vitae gained:** sum of allocation + bonus vitae

This data is already on the submission document (after this story is implemented). The game sign-in UI can read it directly from `/api/downtime_submissions?cycle_id=X` and display a summary per character. No additional API endpoint needed.

## Files to Modify

| File | Change |
|------|--------|
| `server/schemas/downtime_submission.schema.js` | Add `feeding_vitae_tally` definition |
| `public/js/admin/downtime-views.js` | Save tally alongside roll result in the `showRollModal` callback |
| `public/js/player/feeding-tab.js` | Read `feeding_vitae_tally`, display breakdown, revise allocation UI to incorporate bonus vitae |
| `public/css/player-layout.css` | Styles for the vitae breakdown card on the player side |

## Acceptance Criteria

- [ ] When the ST rolls a feeding action, `feeding_vitae_tally` is saved to the submission document with all component values
- [ ] The player portal displays the vitae breakdown when a feeding roll result is shown
- [ ] Bonus vitae (herd, ambience, OoF) is clearly distinguished from vessel-derived vitae
- [ ] The allocation UI shows total vitae = vessel allocation + bonus vitae
- [ ] Negative modifiers (ghouls, rite costs) are shown and subtracted from the total
- [ ] Zero-value rows are hidden (e.g. no Oath of Fealty row if the character doesn't have it)
- [ ] The persisted data is readable by game sign-in flows without additional API work
- [ ] `feeding_vitae_tally` is NOT stripped by `stripStReview` — players must see it
- [ ] If the ST re-rolls, the tally is recomputed and re-saved
