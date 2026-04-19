---
id: nav.9
epic: unified-nav-polish
group: E
status: ready
priority: medium
---

# Story nav.9: Combat — ST Tool

**As an** ST running a combat scene at game,
**I want** a dedicated combat management panel that tracks initiative order, health, and provides quick dice pools for each combatant,
**so that** I can run fast-paced combat without losing track of initiative order, damage, or relevant pools mid-scene.

## Background

The existing Tracker tab handles per-character vitae, WP, and health between scenes. The existing Contested Roll overlay handles individual head-to-head rolls. What's missing is a scene-level combat orchestration tool — something the ST activates for a specific fight, populates with the relevant combatants, and uses to run the sequence from top to bottom.

This is an ST-only feature. Players see nothing of this panel.

The combat tool is not a replacement for the Tracker or Contested Roll — it sits alongside them:
- **Tracker** — persistent inter-scene resource tracking
- **Contested Roll** — head-to-head dice mechanics
- **Combat** *(this story)* — scene-level initiative and damage flow

### VtR 2e Combat Summary (relevant mechanics)

- **Initiative** = Dexterity + Composure + roll of 1d10 (Wits replaces Dexterity for some situations)
- **Defence** = lower of Dexterity or Wits + Athletics; cannot be used if character already acted this turn
- **Attack pools**: Brawl — Strength + Brawl; Weaponry — Strength + Weaponry; Firearms — Dexterity + Firearms
- **Damage types**: Bashing (B), Lethal (L), Aggravated (A) — same track as in tracker_state
- **Size**: default 5 for adult vampires; Health = Size + Stamina

## Acceptance Criteria

### Scene Setup

**Given** an ST taps Combat in the More grid (ST-only)
**When** the Combat panel opens
**Then** it starts with an empty combatant list and a "Add combatants" prompt

**Given** the ST is adding combatants to the scene
**When** they select characters from the character picker
**Then** each selected character is added to the combatant list with their initiative not yet rolled

**Given** the combatant list is populated
**When** the ST taps "Roll Initiative"
**Then** each character's initiative is calculated as Dexterity + Composure + 1d10 and displayed

**Given** initiatives have been rolled
**When** the combatant list renders
**Then** characters are sorted from highest to lowest initiative, with ties showing the character with higher Dexterity + Composure first

### Combat Round View

**Given** a combat round is active
**When** the ST views the combatant list
**Then** each row shows: character name, current initiative, current health track (B/L/A boxes), Defence value, and a quick-roll button for their primary attack pool

**Given** the ST taps a quick-roll button on a combatant row
**When** the panel opens
**Then** it shows that character's relevant attack pools (Strength+Brawl, Strength+Weaponry, Dexterity+Firearms) with one-tap roll buttons — reusing the existing dice roll engine

**Given** damage is dealt to a combatant
**When** the ST taps the damage controls on their row
**Then** bashing, lethal, or aggravated damage is applied and the health track updates visually; the change is written to `tracker_state` via `PUT /api/tracker_state/:id`

### Round Management

**Given** the ST finishes a combat round
**When** they tap "Next Round"
**Then** the active-combatant indicator advances through the initiative order; Defence becomes available again for all combatants who used it

**Given** a combatant is taken out (health track full)
**When** their track fills
**Then** their row is visually flagged as incapacitated (greyed, marked)

**Given** the ST ends the scene
**When** they tap "End Combat"
**Then** the combatant list is cleared; damage applied during the scene remains in tracker_state (it was written per-hit)

### Scope Constraints

**Given** this is a scene-level tool
**When** the ST navigates away from Combat mid-scene
**Then** the scene state (combatant list, initiative order, round number) is preserved in `sessionStorage` for the duration of the session — not persisted to MongoDB

## Data Model

No new MongoDB collections required. Combat scene state is transient (sessionStorage). Damage writes use the existing `PUT /api/tracker_state/:id` endpoint — same fields as the Tracker tab (bashing, lethal, aggravated).

## Tasks / Subtasks

- [ ] Add "Combat" app to `MORE_APPS` in `app.js` — ST-only visibility
- [ ] Create `public/js/game/combat-tab.js` with:
  - [ ] `initCombatTab()` — restore session state if present
  - [ ] `renderCombatTab()` — scene setup or active round view depending on state
  - [ ] `addCombatants(charIds)` — populate combatant list from suiteState.chars
  - [ ] `rollInitiative()` — Dex + Composure + d10 per combatant; sort descending
  - [ ] `advanceRound()` — move active marker; reset defence availability
  - [ ] `applyDamage(charId, type, amount)` — update cache + write to tracker_state API
  - [ ] `endCombat()` — clear sessionStorage scene state
- [ ] Combat tab HTML in `index.html` or rendered entirely via JS (follow existing tab pattern)
- [ ] CSS in `suite.css`:
  - [ ] Combatant row: initiative number, name, health boxes, defence value, quick-roll button
  - [ ] Active combatant: accent left-border highlight
  - [ ] Incapacitated: greyed row with "Incapacitated" label
  - [ ] Health track boxes: match existing tracker display pattern (B = grey, L = red, A = black)
- [ ] Wire quick-roll button to existing dice roll engine — pass pool size, invoke same roll logic as Dice tab
- [ ] sessionStorage key: `tm_combat_scene` — store `{ combatants, round, activeIdx }`

## Dev Notes

- **Reuse contested-roll.js patterns** for character selection and pool calculation — `findChar()`, `aval()`, `sk()` helpers are already established there.
- **Defence formula**: `Math.min(getAttrEffective(c,'Dexterity'), getAttrEffective(c,'Wits')) + sk(c,'Athletics')`. Can be zero if character has no Athletics dots.
- **Attack pools**: Pre-calculate on add — Brawl: `aval(c,'Strength') + sk(c,'Brawl')`, Weaponry: `aval(c,'Strength') + sk(c,'Weaponry')`, Firearms: `aval(c,'Dexterity') + sk(c,'Firearms')`. Show whichever are non-zero.
- **Health track**: Use `calcHealth(c)` from `data/accessors.js` for max boxes. Read current damage from `tracker_state` cache (already loaded by `initTracker()`).
- **Initiative ties**: Sort by Dex+Composure as tiebreaker. If still tied, leave in load order.
- **NPC combatants**: Not in scope for v1. The tool only handles characters present in `suiteState.chars`. If the ST needs to track an NPC, they add them manually via a free-text "NPC" row with manual pool entry — defer this to a follow-up story.

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
Built public/js/game/combat-tab.js — setup screen (character picker), initiative roll (Dex+Composure+d10), round view with health boxes, defence toggle, attack pool quick-roll buttons, damage controls (+B/+L/+A/−). Damage writes via trackerAdj() to PUT /api/tracker_state/:id. Quick-roll loads pool into Roll tab. Scene state in sessionStorage. Incapacitated rows greyed + labelled. Added Combat to ST section of MORE_APPS. Added .cbt-* CSS to suite.css. NPC combatants deferred per story spec.
### File List
- public/js/game/combat-tab.js (new)
- public/js/app.js
- public/index.html
- public/css/suite.css
