# Terra Mortis Editor — Handover v2

## Current State

`tm_editor.html` (390KB) is a single-file web app for character management. It runs on the **v2 schema** (`chars_v2.json`). All 30 characters are baked in as `CHARS_DATA`.

### What works
- **List view**: character cards with clan/covenant icons (gold-tinted), search/filter by clan/covenant
- **Sheet view**: full character sheet matching the ST Suite layout — header with identity/faction/status, covenant strip, stats strip (BP/Humanity/Size/Speed/Defence with inline SVG badges), attributes (3x3 grid), skills (3-column), disciplines with expandable power drawers, devotions, rites (separated from blood sorcery), pacts, influence merits, domain merits, standing merits, general merits (with MERITS_DB lookups), manoeuvres (with MAN_DB lookups)
- **Edit view**: form-based editing for Identity and Attributes/Skills tabs (still exists but will be replaced by inline sheet editing)
- **Icons**: 14 SVGs embedded as base64 data URIs. Gold filter: `invert(1) sepia(1) brightness(.78) saturate(2.8)` matches `--gold2: #E0C47A`

### v2 Schema (see `schema_v2_proposal.md` and `chars_v2.json`)
- Attributes: always `{dots, bonus}`
- Skills: always `{dots, bonus, specs:[], nine_again}`, absent = not stored
- Merits: unified array with `category` field: "general", "influence", "domain", "standing", "manoeuvre"
- Powers: categorised: "discipline", "devotion", "rite", "pact"
- Willpower keys: `mask_1wp`, `mask_all`, `dirge_1wp`, `dirge_all`
- `xp_spent` (not `xp_left`); derive left via `xpLeft(c) = xp_total - xp_spent`
- `covenant_standings`: object keyed by short label, primary excluded
- Derived stats (size, speed, defence, health) not stored

### What to build next: Inline sheet editing

When Edit is clicked on the sheet toolbar, these fields become interactive without leaving the sheet:

**Dropdowns:**
- Mask → `MASKS_DIRGES` array
- Dirge → `MASKS_DIRGES` array
- Clan → `CLANS` array (changing clan auto-updates curse bane)
- Covenant → `COVENANTS` array
- Bloodline → `APPROVED_BLOODLINES` array (filtered by clan once we have that mapping)

**Text inputs:**
- Character Name
- Player Name
- Concept (Archetype)

**Clan bane auto-population:**
```js
const CLAN_BANES = {
  Daeva: { name:'Wanton Curse', effect:'Hungry at 5 or fewer Vitae, Starving at 3 or fewer. Dramatic Failures on feeding cause Persistent Dependent Condition toward a mortal NPC.' },
  Gangrel: { name:'Feral Curse', effect:'Frenzy resistance dice pools capped by Humanity (doesn\'t affect Riding the Wave).' },
  Mekhet: { name:'Tenebrous Curse', effect:'Gain an extra bane at Humanity 6 (doesn\'t count towards cap); Humanity counts -1 for all Humanity-based banes.' },
  Nosferatu: { name:'Lonely Curse', effect:'With mortals, Humanity counts -2; Presence/Manipulation failures become dramatic failures. Intimidation and Subterfuge unaffected.' },
  Ventrue: { name:'Aloof Curse', effect:'First Touchstone attaches to Humanity 7; losing it detaches on first Humanity loss. Breaking points always treated as one step lower.' }
};
```

**Bane editing:** Non-curse banes need add/remove/edit capability. The full bane list is in the Lists sheet (col 9).

**Implementation approach:** Add `let editMode = false;` flag. The Edit button toggles it and re-renders the sheet. `renderSheet()` checks `editMode` and renders `<select>` or `<input>` elements instead of static text for editable fields. `onchange` handlers call mutation functions that update `chars[editIdx]` and call `markDirty()`.

### Files
- `/home/claude/tm_editor.html` — the editor (production)
- `/home/claude/index.html` — the ST Suite (reference, do not modify)
- `/home/claude/chars_v2.json` — migrated v2 data (30 characters)
- `/home/claude/migrate_v2.js` — migration script (old → v2)
- `/home/claude/schema_v2_proposal.md` — schema documentation
- `/home/claude/integration_plan.md` — Suite integration plan

### Conventions
- British English (Defence, Armour, Vigour, Honour, Socialise, capitalise)
- No em-dashes
- Validate JS with `node -e "new vm.Script(...)"` after edits
- Work on `/home/claude/`, copy to `/mnt/user-data/outputs/` for delivery
- `/mnt/project/` is read-only reference
