# Epic DTS: ST Action Improvements

## Motivation

ST-created actions exist so STs can add processing entries that weren't in the player's submission. In practice the feature has two major gaps discovered during Cycle 2 processing:

**1. Sorcery ST actions are useless.**
When an ST adds a sorcery-type action, it renders a generic pool panel: a bare "Player's submitted pool / ST validated pool" grid, generic validation buttons, and a delete button. There is no tradition dropdown, no rite selector, no target checkboxes, no Mandragora Garden toggle, no computed dice pool, and no roll button. STs cannot actually process the action — it's just a placeholder.

The root cause: `isSorcery = entry.source === 'sorcery'`. ST-created sorcery entries have `source === 'st_created'`, so they never enter the sorcery rendering path.

**2. No way to split a multi-rite submission.**
A player can submit all their rites in a single sorcery slot (a notes blob listing 4 rites). The current tool has no way to duplicate the action into separate per-rite entries. STs either process all 4 rites through one panel (hiding which rite applies to which roll) or manually add 4 ST actions one by one and re-enter all the details.

DTS-1 fixes the rendering. DTS-2 adds the duplication workflow.

## Design Decisions

### Minimal rendering change — extend isSorcery

Rather than a parallel rendering path for ST sorcery actions, extend the existing `isSorcery` flag:

```js
const isSorcery = entry.source === 'sorcery'
               || (entry.source === 'st_created' && entry.actionType === 'sorcery');
```

All downstream checks (`sorcSub`, `sorcChar`, left-panel details, right-panel pool builder) then apply automatically because they read from `isSorcery`.

### Tradition stored on st_action object

The sorcery right panel checks `entry.tradition === 'Cruac'` to show the Mandragora Garden toggle. ST-created actions currently store only `label` and `description`. Add `tradition` and `rite_name` fields to `st_actions[idx]`:

```js
{ action_type: 'sorcery', label: 'Mantle of Amorous Fire', tradition: 'Cruac', rite_name: 'Mantle of Amorous Fire', description: '' }
```

Populate these into the queue entry: `entry.tradition = stAction.tradition || ''`.

### "Add ST Action" form — sorcery branch

When the user selects "Sorcery" in the Add ST Action form, swap the free-text label input for a tradition dropdown + rite dropdown. The label is auto-derived from the rite name. This replaces the current confusion of entering `"Cruac: Mantle of Amorous Fire"` as a free-text string.

### Duplicate creates a pre-populated ST sorcery action

The duplicate action inherits tradition + rite (if set), targets, and notes from the source entry. Rite can be changed via the edit mode in the new panel. The duplicate appears at the bottom of the phase, expanded immediately.

### No schema migration needed

`st_actions` is a free-form array on each submission document. Adding `tradition` and `rite_name` fields is backwards-compatible — existing entries without them simply fall back to empty string.

## Stories

### DTS-1: ST-Created Sorcery — Full Panel Rendering — DONE

Extend `isSorcery` to include ST-created sorcery actions. Update the Add ST Action form sorcery branch to capture tradition + rite. Store `tradition` + `rite_name` on the `st_actions[idx]` object and populate into queue entries.

### DTS-2: Duplicate Action — DONE

Add a "Duplicate" button to sorcery action row headers. Creates a new ST sorcery action pre-populated from the source entry's tradition, rite, targets, and notes. The duplicate renders with the full panel (DTS-1 prerequisite).

## Dependencies

- `public/js/admin/downtime-views.js`
- `tests/downtime-processing-dt-fixes.spec.js`
- DTS-2 depends on DTS-1
