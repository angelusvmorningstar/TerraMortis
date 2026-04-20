---
id: nav.10
epic: unified-nav-polish
group: E
status: complete
priority: low
---

# Story nav.10: Equipment

**As a** player or ST,
**I want** to see a character's equipped weapons and armour on their character sheet,
**so that** relevant combat pools and armour ratings are visible without having to calculate them from scratch mid-scene.

## Background

VtR 2e characters can carry weapons and wear armour that modify their combat effectiveness. Currently there is no place in the app to record or display this. Equipment is not purchased with XP or Merits — it is narrative/scene context maintained by the ST and visible to the player.

### VtR 2e Equipment (relevant mechanics)

**Weapons:**
- Melee weapons add a damage bonus to the Strength + Weaponry pool (e.g., a knife is +0L, a sword is +2L)
- Firearms have their own pool (Dexterity + Firearms) and a damage rating (e.g., 9mm pistol: 2L)
- Damage type: Bashing (B), Lethal (L), Aggravated (A — rare, typically silver or fire)
- Some weapons have special tags: two-handed, concealable, etc.

**Armour:**
- Armour Rating (AR) — subtracts from incoming damage before applying to health track
- General/Ballistic distinction (some armour is better against bullets)
- Armour imposes a penalty to Defence and Speed (Mobility penalty)

**Scope for v1:** Display only — show what weapons and armour a character has, their ratings, and the resulting modified combat pools. The ST assigns equipment to characters via the admin app. Players view it on their sheet.

## Acceptance Criteria

### Schema

**Given** a character document in MongoDB
**When** equipment is added
**Then** it is stored on `character.equipment` as an array of objects with shape:
```json
{
  "type": "weapon | armour",
  "name": "String",
  "damage_rating": 0,
  "damage_type": "B | L | A",
  "attack_skill": "Brawl | Weaponry | Firearms",
  "armour_rating": 0,
  "general_ar": 0,
  "ballistic_ar": 0,
  "mobility_penalty": 0,
  "tags": [],
  "notes": ""
}
```

**Given** the equipment field is absent from a character document
**When** anything reads `character.equipment`
**Then** it defaults to an empty array — no null errors

### Player Sheet Display

**Given** a character has equipment assigned
**When** a player views their sheet in the unified app
**Then** an Equipment section is visible below Merits showing each item name, damage rating/type (for weapons) or armour rating (for armour)

**Given** a character has a weapon equipped
**When** the Equipment section renders
**Then** the relevant attack pool is shown alongside the weapon: e.g. "Katana — Str+Wpn+2 = 7L"

**Given** a character has armour equipped
**When** the Equipment section renders
**Then** armour rating is shown and Defence is shown with the mobility penalty applied: e.g. "Leather Jacket — AR 1, Defence 3 (−0)"

**Given** a character has no equipment
**When** the Equipment section renders
**Then** the section is hidden entirely (not an empty box)

### Admin Assignment

**Given** an ST opens a character in the admin editor
**When** they navigate to the Equipment section
**Then** they can add, edit, and remove equipment items using a simple list editor — name, type (weapon/armour), ratings, notes

**Given** the ST saves equipment changes
**When** the character is saved
**Then** the `equipment` array is included in the PUT to `/api/characters/:id`

### Schema Validation

**Given** the `character.schema.js` validation on the server
**When** a character is saved with an `equipment` array
**Then** it validates correctly — no "additional properties" rejection

## Data Model

New field on character document: `equipment: []` (array, default empty).

Each item:
```
type:             'weapon' | 'armour'
name:             String (required)
damage_rating:    Number (weapons only, default 0)
damage_type:      'B' | 'L' | 'A' (weapons only, default 'L')
attack_skill:     'Brawl' | 'Weaponry' | 'Firearms' (weapons only)
general_ar:       Number (armour only, default 0)
ballistic_ar:     Number (armour only, default 0)
mobility_penalty: Number (armour only, default 0)
tags:             [String] (optional)
notes:            String (optional)
```

## Tasks / Subtasks

- [ ] Add `equipment: { type: Array, default: [] }` to `server/models/character.schema.js`
- [ ] Create `public/js/data/equipment.js` — helper functions:
  - [ ] `getEquipment(c)` — returns `c.equipment || []`
  - [ ] `weaponPool(c, weapon)` — calculates attack pool: Str/Dex + skill + damage_rating
  - [ ] `effectiveDefence(c)` — Defence minus sum of mobility_penalty across armour items
- [ ] Add Equipment section to the player sheet render (`public/js/suite/sheet.js` or player sheet renderer):
  - [ ] Hidden when `getEquipment(c).length === 0`
  - [ ] Weapon rows: name, attack pool string, damage
  - [ ] Armour rows: name, AR (general/ballistic), Defence with penalty
- [ ] Add Equipment editor to admin character editor (`public/js/editor/`):
  - [ ] List of current equipment items with Edit/Remove buttons
  - [ ] Add item form: type selector reveals relevant fields (weapon fields vs armour fields)
  - [ ] Save writes to character document via existing save flow
- [ ] Wire `weaponPool()` into Combat tab (nav.9) quick-roll button — if character has a weapon, show its pool rather than the generic Weaponry pool

## Dev Notes

- **Pool calculation**: Weapon pool = `aval(c, attrForSkill) + sk(c, weapon.attack_skill) + weapon.damage_rating`. Attribute mapping: Brawl/Weaponry → Strength, Firearms → Dexterity.
- **Display format**: `{weapon.name} — {attrLabel}+{skillLabel}+{bonus} = {total}{weapon.damage_type}`. E.g. "Knife — Str+Brawl+0 = 4L".
- **Armour display**: `{armour.name} — AR {general_ar}/{ballistic_ar}`. Show "Defence {effectiveDefence(c)}" if there's a mobility penalty.
- **Schema validation**: The existing `character.schema.js` uses Mongoose-style validation. Add `equipment` as an array of mixed objects with a defined sub-schema. Check existing array fields (e.g., `merits`) for the pattern to follow.
- **Admin editor**: Follow the existing merit list editor pattern — array of items, each with an inline edit form. The equipment editor is simpler (no prerequisites, no dot ratings).

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
Server: equipment array added to character.schema.js with weapon/armour sub-schema. Client data: public/js/data/equipment.js with getEquipment(), weaponPool(), effectiveDefence(), weaponPoolLabel(). Suite sheet: Equipment section after Manoeuvres, hidden when empty. Admin editor: shRenderEquipment() in editor/sheet.js with edit-mode row per item and Add/Remove controls. Edit handlers (shAddEquip, shEditEquip, shRemoveEquip) in editor/edit.js, wired into app.js window. Schema covers both weapon and armour types.
### File List
- server/schemas/character.schema.js
- public/js/data/equipment.js (new)
- public/js/suite/sheet.js
- public/js/editor/sheet.js
- public/js/editor/edit.js
- public/js/app.js
