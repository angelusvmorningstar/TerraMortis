# Story feature.50: Processing Mode — Feeding Pool Builder

## Status: done

## Story

**As an** ST processing feeding submissions,
**I want** a structured pool builder in the feeding panel that pulls from the character's actual stats,
**so that** I can construct, validate, and lock the correct feeding dice pool without manual arithmetic or free-text entry.

## Background

The current feeding panel (feature.45) shows the player's submitted pool as a free-text string and provides an editable "ST Validated Pool" text field. This was sufficient for initial implementation but has two problems:

1. **CSV submissions** (Google Forms) have freeform player-typed text for their pool — whatever combination of attributes, skills, and disciplines the player chose to name, with no structure. The ST currently has to cross-reference this against the character sheet manually.

2. **App form submissions** (player portal) will enforce a structured Attribute + Skill + optional Discipline selection. This structured data should display differently and feed directly into the pool builder.

The goal of this story is to replace the free-text "ST Validated Pool" input with a structured pool builder that the ST uses to construct the authoritative feeding pool from the character's actual stat values, add a modifier, flag rote, and lock it on validation.

### Source of truth for territory residency

The player form (CSV or portal) captures what the player *claims* their territory status is. The **actual source of truth** for residency/poaching rights is the **City → Territories tab** in the admin — the territories collection. When displaying feeding territory status or calculating feeding permissions, the territories collection takes precedence over `responses.feeding_territories`.

### Two-source data pipeline

Both submission paths (Google Forms CSV and player portal) write into the same submission schema. The feeding panel detects which source the data came from:

- **App form**: `responses.feed_attr` and `responses.feed_skill` are present (structured fields written by the portal form)
- **CSV**: these fields are absent; the raw pool text (if any) comes from the player's freeform description

Both paths converge at the ST pool builder — the ST constructs the authoritative pool regardless of source.

---

## Acceptance Criteria

1. The feeding panel header section shows:
   - Feeding method (display name from `FEED_METHOD_LABELS_MAP`)
   - Territory status summary — drawn from **territories collection** (cachedTerritories), not player form data; `responses.feeding_territories` used only as fallback if territories collection has no data for this character

2. The "Player's Submitted Pool" section adapts by source:
   - **App form** (has `responses.feed_attr`): renders as `{Attribute} + {Skill}[ + {Discipline}]` — structured, read-only
   - **CSV** (no `responses.feed_attr`): renders raw pool text from the queue entry's `poolPlayer` or `pool_player` as-is — read-only, styled as freeform text

3. Below the player-submitted section, the **ST Pool Builder** replaces the existing free-text "ST Validated Pool" input:
   - **Attribute** dropdown — all attributes, sorted; shows character's effective dot value next to each name; selecting one contributes its dot value to the total
   - **Skill** dropdown — all skills, sorted; shows character's effective dot value; selecting one contributes its dot value
   - **Discipline** dropdown — character's known disciplines only (from character sheet); optional (has a "None" option); shows dot value; contributing its dot value if selected
   - **Modifier ticker** — `−` and `+` buttons, integer range −5 to +5, default 0; shown as `+N` or `−N` or `0`
   - **Rote** checkbox — reuses existing `st_review.feeding_rote` field
   - **Total display** — `attr_dots + skill_dots + disc_dots + modifier = N` rendered live as the ST adjusts; bold

4. The attribute, skill, and discipline dot values shown in the dropdowns are the character's **effective** values (applying bonuses), using the same helpers as the rest of the app (`getAttrEffective`, `getSkillObj`, skDots`).

5. Pre-population: when the feeding panel is first opened for a submission that already has `pool_validated` set from a previous session, the builder attempts to parse and restore the previous selection. If parsing fails, it leaves the dropdowns at their defaults and shows the raw string above the builder for reference.

6. The builder writes its output to `feeding_review.pool_validated` in the format:
   `{Attribute} {attr_dots} + {Skill} {skill_dots}[ + {Discipline} {disc_dots}][ +/−{modifier}] = {total}`
   e.g. `Wits 3 + Stealth 2 + Obfuscate 1 = 6` or `Intelligence 3 + Stealth 2 − 1 = 4`

7. Validation buttons (`Pending / Validated / No Roll Needed`) remain as-is (feature.45). When status is set to `Validated`, the pool locked into `pool_validated` is the builder's current output.

8. The Roll button (appears when `pool_status === 'validated'`) uses the total from the locked pool expression, as before.

9. The discipline × territory recording (feature.45 AC 8) continues to fire whenever `pool_validated` or `pool_status` changes — no change to that logic.

10. Characters whose character data cannot be found (no matching character in the `characters` array) fall back to free-text input for the validated pool, with a warning badge: "Character not found — manual entry."

---

## Data Model

No new fields. Existing fields:

- `responses.feed_attr` — attribute name (app form only)
- `responses.feed_skill` — skill name (app form only)
- `responses.feed_discipline` — discipline name (app form only, optional)
- `responses._feed_method` — method enum (both sources)
- `feeding_review.pool_validated` — ST-constructed pool expression (written by this story's builder)
- `feeding_review.pool_status` — validation state (unchanged)
- `st_review.feeding_rote` — rote flag (unchanged)

The **portal downtime form** (pp.6) is responsible for writing `feed_attr`, `feed_skill`, `feed_discipline` to responses when a player submits via the app. The CSV path does NOT write these fields — absence of `feed_attr` is the detection signal for CSV source.

---

## Tasks / Subtasks

- [x] Task 1: Source detection and player pool display (AC: 1, 2)
  - [x] Detect source: `sub.responses.feed_attr` present → app; absent → CSV
  - [x] App display: structured `Attr + Skill[ + Disc]` read-only row
  - [x] CSV display: raw `poolPlayer` text, styled as freeform, read-only
  - [ ] Territory status: pull from `cachedTerritories` first; fall back to `responses.feeding_territories` (feeding header — deferred, header display was pre-existing)

- [x] Task 2: ST Pool Builder UI (AC: 3, 4, 10)
  - [x] Attribute dropdown — populated from all attribute names; shows `name (N)` with character's effective dots
  - [x] Skill dropdown — populated from all skill names; shows `name (N)` with effective dots
  - [x] Discipline dropdown — populated from character's disciplines only + "None"; shows `name (N)`
  - [x] Modifier ticker — `−` / `+` buttons; integer clamped to [−5, +5]; display updates live
  - [x] Rote checkbox — reads/writes `st_review.feeding_rote`
  - [x] Total display — live: `attr + skill + disc + modifier = N`
  - [x] Fallback to text input with warning badge when character not found

- [x] Task 3: Pre-population from existing pool_validated (AC: 5)
  - [x] On panel open, attempt to parse existing `pool_validated` string
  - [x] Match attribute, skill, discipline names; restore modifier; set dropdowns if successful
  - [x] On parse failure: show raw string above builder as reference, leave dropdowns at defaults

- [x] Task 4: Write pool_validated on save (AC: 6, 7)
  - [x] Format string as: `{Attr} {n} + {Skill} {n}[ + {Disc} {n}][± modifier] = {total}`
  - [x] Wire existing Validated / No Roll Needed buttons to trigger save with builder output
  - [x] Existing roll button and discipline recording unchanged

---

## Dev Notes

### Key files

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Replace free-text ST validated pool with structured builder in `renderActionPanel` feeding section |
| `public/css/admin-layout.css` | Styles for pool builder controls |

### Character data access

Characters are loaded into the module-level `characters` array via `loadCharacters()`. Match by:
```js
const char = characters.find(ch =>
  String(ch._id) === sub.character_id ||
  ch.name === sub.character_name ||
  ch.moniker === sub.character_name
);
```

Attribute effective value: `getAttrVal(char, attrName)` — already imported.
Skill dots: `skDots(getSkillObj(char, skillName))` — already imported.
Discipline dots: `(char.disciplines || []).find(d => d.name === discName)?.dots || 0`.

### Attribute and skill lists

Use the same lists already available in the codebase — do not hardcode. Attributes from `Object.keys(char.attributes || {})`. Skills from `Object.keys(char.skills || {})`.

### Modifier display

```js
const modStr = modifier === 0 ? '±0' : modifier > 0 ? `+${modifier}` : String(modifier);
```

### Pool format output

```js
let expr = `${attr} ${attrDots} + ${skill} ${skillDots}`;
if (disc && disc !== 'none') expr += ` + ${disc} ${discDots}`;
if (modifier !== 0) expr += ` ${modifier > 0 ? '+' : '−'} ${Math.abs(modifier)}`;
expr += ` = ${total}`;
```

### Territory source of truth

```js
// Prefer territories collection for residency
const terrData = (cachedTerritories || TERRITORY_DATA).find(t => t.id === terrId);
// Fall back to responses.feeding_territories for display only
const feedTerrs = JSON.parse(sub.responses?.feeding_territories || '{}');
```

### Pool builder state

The builder state (selected attr/skill/disc/modifier) lives in the action panel's DOM — it does not need to be persisted to module state between renders. The `procExpandedKey` mechanism already keeps the panel open during re-renders; the builder re-populates from `pool_validated` on each open via the pre-population logic (Task 3).

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Claude (SM) |
