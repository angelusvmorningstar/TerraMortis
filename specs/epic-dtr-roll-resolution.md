# Epic DTR: DT Roll Resolution

## Motivation

The project action pool builder and roll card are technically correct but incomplete at the result layer. Two gaps emerged during Cycle 2 processing:

1. **Success modifier not applied to roll results.** The right-panel sidebar has a "Success Modifier" ticker (manual ±adjustment) that the ST uses to account for external factors — contested results rolled separately, environmental penalties, etc. The modifier is saved to `succ_mod_manual` and displayed in the sidebar, but `_renderRollCard` never reads it. The displayed roll result always shows the raw dice count. An ST who sets `succ_mod_manual: -1` to record a contested result sees "3 successes" on the roll card — not "3 − 1 = 2 net."

2. **No contested roll mechanism.** A contested roll (attacker's pool vs. defender's resistance pool) is a core WoD mechanic. Several actions per cycle involve a dominant/resisted roll — Rote Feed with Mesmerise, contested Investigate vs. Hide/Protect, Attack vs. defence. The current panel has no way to record the opposing character, build their resistance pool, or roll it. STs work around this by rolling outside the app and recording the net manually via `succ_mod_manual` — which doesn't even display correctly (DTR-1).

These two stories are ordered: DTR-1 fixes the display gap first, then DTR-2 adds the full contested mechanism that replaces the workaround.

## Design Decisions

### Net successes, not replacement

DTR-1 shows **both** the raw roll result and the net modifier — not just the net. The raw result documents what the dice said; the modifier documents what was applied. This is important for retrospective audit and for the Claude context export.

### Contested roll is a second roll in the same panel

DTR-2 adds a "Contested Roll" sub-panel to the right sidebar, rendered below the Success Modifier section. It contains:
- A character selector (opposing character)
- A resistance pool label/builder (manual entry, same pattern as pool_validated)
- A Roll button that executes the opposing roll via `rollPool`
- A net-result display: attacker successes − defender successes = net

The net result from DTR-2 feeds automatically into the success modifier display from DTR-1 (`succ_mod_manual` is NOT used when a contested roll exists — the net is derived from the two rolls).

### Save schema

Contested data lives in the same review object as other project fields:

```js
{
  contested: true,
  contested_char: 'rene belacroix',         // sortName (lowercase)
  contested_pool_label: 'Resolve + BP = 4', // display string, manually set
  contested_roll: {                          // same shape as proj.roll
    dice_string: '[4,2,1,7]',
    successes: 1,
    exceptional: false,
  }
}
```

When `contested: true` and `contested_roll` is present, `_renderRollCard` computes net = `roll.successes − contested_roll.successes` and displays both.

### Success Modifier coexists with contested roll

`succ_mod_manual` is still available as an additional adjustment on top of the contested net (e.g. secrecy penalties on an investigate that was also contested). When both are present: net = attacker − defender + manual_modifier.

## Stories

### DTR-1: Net Success Display

The roll card in `_renderRollCard` must display net successes when a success modifier is set, in addition to the raw roll count. Passed via opts as `successModifier` (number, default 0).

**Acceptance Criteria:**
1. When `succ_mod_manual` is non-zero, the roll result line shows raw count and net in the form `3 successes − 1 = 2 net`.
2. When modifier is 0, the result line is unchanged (no "net" label shown).
3. Net successes ≤ 0 render with a failure/muted style class.
4. E2E: 2 tests — modifier non-zero shows net; modifier zero unchanged.

### DTR-2: Contested Roll

Adds a Contested Roll sub-panel to the project right sidebar, below the Success Modifier section. Integrates with DTR-1 for net result display.

**Acceptance Criteria:**
1. A "Contested" toggle appears below the Success Modifier section in the project right panel.
2. When toggled on, a character selector and a pool-label input appear.
3. A Roll button executes the opposing roll and saves `contested_roll` to the review.
4. The roll card shows: `attacker X − defender Y = Z net` when both rolls are present.
5. Net result feeds the roll card's net display (DTR-1 display logic reused).
6. Toggling contested off clears `contested`, `contested_char`, `contested_pool_label`, and `contested_roll` from the review.
7. E2E: 4 tests — toggle on/off, defender roll, net display.

## Dependencies

- `public/js/admin/downtime-views.js` — `_renderRollCard`, `_renderProjRightPanel`, event wiring
- `public/css/admin-layout.css` — contested panel styles
- `tests/downtime-processing-dt-fixes.spec.js` — no regressions permitted
- DTR-2 depends on DTR-1 (reuses net display logic)
