---
id: nav.11
epic: unified-nav-polish
group: E
status: complete
priority: medium
---

# Story nav.11: Conditions

**As a** player or ST at game,
**I want** active Conditions visible on a character's tracker and sheet,
**so that** I know which mechanical states apply to my character and what it takes to resolve them.

## Background

Vampire: The Requiem 2e uses a Conditions system — persistent mechanical/narrative states applied to characters as a result of actions, scenes, or powers. Conditions affect dice pools, impose behavioural constraints, or grant temporary benefits until resolved.

The tracker (`public/js/game/tracker.js`) already has `conditions: []` in its default state, but the comment reads: *"Conditions stay localStorage-only (per-device session state)."* This story promotes conditions to API-persisted state and builds the management UI.

### VtR 2e Conditions Overview

| Category | Examples |
|---|---|
| General | Afraid, Confused, Depressed, Drunk, Informed, Inspired, Knocked Down, Shaken |
| Social | Leveraged, Swooning, Embarrassed |
| Combat/Physical | Beaten Down, Blinded, Insensate |
| Vampire-specific | Blushing, Languished, Wanton |
| Persistent (Scars) | Broken, Fugue, Tremors |

Conditions have:
- **Name** — the condition label
- **Resolution** — what action/circumstance ends the condition
- **Effect** — the mechanical penalty or narrative constraint while active
- **Source** — what applied it (optional, for ST reference)

### Relationship to Tracker

Conditions already appear in `tracker_state` defaults (`conditions: []`) but are not persisted to MongoDB and have no UI. This story wires them up.

## Acceptance Criteria

### API Persistence

**Given** a condition is applied to a character
**When** the change is saved
**Then** the `conditions` array on that character's `tracker_state` document is updated via `PUT /api/tracker_state/:id`

**Given** the tracker is initialised from the API
**When** `GET /api/tracker_state/:id` is called
**Then** the returned document includes the `conditions` array with all currently active conditions

**Given** the tracker's `persistedFields()` function
**When** it runs
**Then** `conditions` is included in the fields written to the API (it is currently absent from `persistedFields()` in tracker.js)

### Tracker Display

**Given** a character has active conditions
**When** their tracker card renders (expanded view)
**Then** each condition is listed with its name and a brief effect summary

**Given** a character has no active conditions
**When** their tracker card renders
**Then** no conditions section is shown (not an empty box)

**Given** the collapsed tracker card
**When** a character has one or more conditions
**Then** a small "conditions" badge count appears on the collapsed card (e.g., "2 conditions") — consistent with the influence display added in nav.5

### ST — Apply and Remove Conditions

**Given** an ST expands a character's tracker card
**When** they tap "Add Condition"
**Then** a picker opens showing common conditions from a `CONDITIONS_DB` reference list, plus a free-text entry option for unlisted conditions

**Given** the ST selects a condition from the picker
**When** it is added
**Then** the condition is appended to the character's `conditions` array with: `{ name, effect, resolution, source, applied_at }`; the tracker card re-renders; the change is written to the API

**Given** a condition is listed on the tracker card
**When** the ST taps "Resolve"
**Then** the condition is removed from the array; the change is written to the API

### Player Sheet Display

**Given** a player views their character sheet
**When** active conditions are present
**Then** a Conditions section is visible on the sheet showing each condition name, effect, and resolution requirement

**Given** a player views a condition with a dice pool modifier
**When** the effect is displayed
**Then** the modifier is shown clearly: e.g. "Beaten Down: −2 to attack pools until Knocked Down is resolved"

### CONDITIONS_DB Reference

**Given** the ST opens the condition picker
**When** the list renders
**Then** it is populated from a `CONDITIONS_DB` constant containing the standard VtR 2e conditions with pre-filled effect and resolution text — so the ST doesn't have to type these from memory

## Data Model

### tracker_state document — conditions field

Each condition object:
```json
{
  "name": "String (required)",
  "effect": "String — mechanical summary",
  "resolution": "String — how to end it",
  "source": "String — what applied it (optional)",
  "applied_at": "ISO date string"
}
```

`tracker_state` schema must be updated to include `conditions: [Object]`.

### CONDITIONS_DB constant (new file: `public/js/data/conditions.js`)

```js
export const CONDITIONS_DB = [
  { name: 'Afraid',       effect: '−2 to all actions while fleeing. Lose Defence against the source of fear.',    resolution: 'Escape the source, spend Willpower' },
  { name: 'Beaten Down',  effect: 'May not take violent actions without spending Willpower first.',                resolution: 'Spend Willpower, or scene ends' },
  { name: 'Blinded',      effect: '−2 on all actions; lose Defence against unseen attackers.',                    resolution: 'Recover sight (end of scene or medical)' },
  { name: 'Confused',     effect: '−2 to Mental actions. May not use Specialties.',                               resolution: 'Get explanation or spend Willpower' },
  { name: 'Depressed',    effect: '−2 to Social actions. Resisting Vinculum and Domination +1 difficulty.',       resolution: 'Scene of solace, therapy, or Touchstone contact' },
  { name: 'Embarrassed',  effect: '−2 to Social actions in the current social context.',                          resolution: 'Remove self from situation or scene ends' },
  { name: 'Informed',     effect: '+2 to the next roll involving this specific knowledge.',                        resolution: 'Use the bonus (condition ends on use)' },
  { name: 'Inspired',     effect: '+2 to the next roll on a specific task.',                                      resolution: 'Use the bonus (condition ends on use)' },
  { name: 'Knocked Down', effect: 'Prone. −2 to actions, +2 to be hit. Must spend action to stand.',              resolution: 'Spend action to stand up' },
  { name: 'Leveraged',    effect: 'Target must comply with demands or suffer a stated consequence.',               resolution: 'Comply with demand or suffer consequence' },
  { name: 'Shaken',       effect: '−2 to the next roll. Stacks with other penalties.',                            resolution: 'Scene ends or Willpower spent' },
  { name: 'Wanton',       effect: 'Must pursue immediate gratification; resist with Resolve+Composure (3+)',      resolution: 'Resist or indulge (condition ends either way)' },
  { name: 'Broken',       effect: '(Persistent) −2 to all actions until treated. See Scars.',                     resolution: 'Downtime treatment + XP expenditure' },
];
```

## Tasks / Subtasks

- [ ] Add `conditions` to `persistedFields()` in `public/js/game/tracker.js` (currently missing — this is the root fix)
- [ ] Update `tracker_state` Mongoose schema on server to include `conditions: [{ type: Object }]`
- [ ] Create `public/js/data/conditions.js` with `CONDITIONS_DB` array
- [ ] Update tracker card render (expanded) to show active conditions list with Resolve button per condition (ST only)
- [ ] Update tracker collapsed card to show conditions badge count when conditions > 0
- [ ] Build condition picker modal/panel:
  - [ ] Searchable list from `CONDITIONS_DB`
  - [ ] Free-text entry fallback
  - [ ] On select: populate name/effect/resolution; allow source field; confirm to add
- [ ] Wire "Add Condition" button to picker — ST-only (hide for players)
- [ ] Wire "Resolve" button to remove condition from array + API write
- [ ] Add Conditions section to player sheet render — visible when `conditions.length > 0`
- [ ] Test: apply condition, navigate away, return — condition persists (API round-trip)

## Dev Notes

- **Root fix is one line**: add `conditions: cs.conditions` to `persistedFields()` in `tracker.js`. The API infrastructure already exists; conditions just weren't being sent.
- **Tracker state API**: `PUT /api/tracker_state/:id` — same endpoint used for vitae/WP/health. Pass the full updated state object.
- **ST-only controls**: Add/Resolve buttons check `suiteState.user?.role === 'st'` before rendering — same pattern used elsewhere.
- **Collapsed badge**: Add to the collapsed card template alongside the influence display from nav.5. Format: `${conditions.length} condition${conditions.length !== 1 ? 's' : ''}`.
- **Dice pool integration** (stretch goal, not required for v1): Conditions with a dice modifier (e.g., Afraid: −2) could eventually auto-apply to pool calculations. Defer — this story only covers display and management.

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
Root fix: conditions added to persistedFields() — one line. ensureLoaded() now reads remote.conditions. trackerAddCondition/Remove now call saveToApi. CONDITIONS_DB with 18 standard VtR 2e conditions in public/js/data/conditions.js. Tracker expanded card: conditions as cards with name/effect/resolution; ST gets picker from CONDITIONS_DB + free-text + Resolve button; non-ST read-only. Suite sheet: Active Conditions section with red left-border cards. No server route changes needed (tracker_state route is schemaless ).
### File List
- public/js/data/conditions.js (new)
- public/js/game/tracker.js
- public/js/suite/sheet.js
- public/css/suite.css
