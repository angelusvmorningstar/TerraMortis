# Character Questionnaire Schema

Describes documents in the `questionnaire_responses` collection.
These are submitted via the player portal questionnaire form.

Separate from `character_questionnaires` (read-only Google Forms import, 25 historical responses).

---

## Top-level document

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | MongoDB primary key |
| `character_id` | ObjectId | FK to `characters._id` |
| `character_name` | string | Display name at time of submission |
| `status` | string | `"new"` / `"draft"` / `"submitted"` / `"approved"` |
| `submitted_at` | string | ISO timestamp, set on submit |
| `responses` | object | All question responses (see below) |

---

## `responses` object

### Sheet-derived fields (auto-populated, never player-edited)

These are copied from the character document at render time and stored alongside player responses for snapshot purposes.

| Key | Type | Source field |
|---|---|---|
| `player_name` | string | `characters.player` |
| `character_name` | string | honorific + moniker/name |
| `high_concept` | string | `characters.concept` |
| `clan` | string | `characters.clan` |
| `covenant` | string | `characters.covenant` |
| `bloodline` | string | `characters.bloodline` |
| `mask` | string | `characters.mask` |
| `dirge` | string | `characters.dirge` |
| `blood_potency` | string | `characters.blood_potency` (cast to string) |
| `apparent_age` | string | `characters.apparent_age` |
| `date_of_embrace` | string | `characters.date_of_embrace` (YYYY-MM-DD) |

---

### Player identity (opener block, always visible)

| Key | Type | Notes |
|---|---|---|
| `discord_nickname` | string | From authenticated player profile |
| `facebook_name` | string | Player-entered if different to real name |

---

### Player preferences section

| Key | Type | Notes |
|---|---|---|
| `gaming_style_tags` | string[] | Checkbox. Values: `personal_horror`, `social_intrigue`, `action_confrontation`, `major_player`, `dangerous_wildcard` |
| `gaming_style_pvp` | string | Radio. Values: `direct`, `subtle`, `either` |
| `gaming_style_note` | string | Free text elaboration |
| `support_tags` | string[] | Checkbox. Values: `scheme_help`, `rules_guidance`, `personal_storylines`, `covenant_politics`, `character_connections`, `social_navigation` |
| `support_note` | string | Free text elaboration |

---

### Character profile section

Clan, covenant, bloodline, mask, dirge, blood potency, apparent age — derived from sheet, shown in char header only (not re-asked).

| Key | Type | Notes |
|---|---|---|
| `covenant_factions` | string | Named faction within covenant |
| `conflict_approach` | string | Radio. Values: `Monstrous`, `Seductive`, `Competitive` |
| `bloodline_rationale` | string | Only shown when bloodline is set on the sheet |

---

### Political ambitions section

| Key | Type | Notes |
|---|---|---|
| `court_motivation` | string | Why the character attends Court |
| `ambitions_sydney` | string | What they hope to achieve in Sydney |
| `why_sydney` | string | Why they came to Sydney |
| `why_covenant` | string | Why they joined their Covenant |
| `covenant_goals` | string | Goals within their Covenant |
| `clan_goals` | string | Goals within their Clan |
| `aspired_role_tag` | string | Radio. Values: `ruler`, `primogen`, `administrator`, `regent`, `socialite`, `enforcer`, `none_yet` |
| `aspired_position` | string | Elaboration on ambitions |
| `view_traditions_tag` | string | Radio. Values: `sacred`, `necessary_evil`, `outdated` |
| `view_traditions` | string | Elaboration |
| `view_elysium_tag` | string | Radio. Values: `genuinely`, `when_watched`, `no` |
| `view_elysium` | string | Elaboration |
| `view_mortals_tag` | string | Radio. Values: `tools`, `food`, `reminders`, `complex` |
| `view_mortals` | string | Elaboration |

---

### Character history section

`date_of_embrace` is shown here as a read-only display pulled from the character sheet. It is not stored separately in responses.

| Key | Type | Notes |
|---|---|---|
| `embrace_story` | string | Narrative of the Embrace |
| `sire_name` | string | Sire's name |
| `sire_story` | string | Relationship, status, reason for Embrace |
| `early_city` | string | City of Embrace |
| `early_nights` | string | First nights as Kindred |
| `last_city_politics` | string | Political landscape of previous city |
| `mortal_family` | object[] | Dynamic list. Each entry: `{ name, relationship, description }` |
| `touchstones` | string | Current touchstones |
| `hunting_method_tags` | string[] | Checkbox. Values: `seduction`, `stalking`, `force`, `familiar`, `intimidation`, `other` |
| `hunting_style_note` | string | Preferred prey, territories, ethical limits |
| `first_kill` | string | Narrative of first mortal death |
| `common_indulgences` | string | Non-feeding activities |

#### `mortal_family` entry shape

| Key | Type | Notes |
|---|---|---|
| `name` | string | Relative's name |
| `relationship` | string | e.g. "Brother", "Daughter" |
| `description` | string | Whether the character watches, contacts, or avoids them |

---

### Character connections section

| Key | Type | Notes |
|---|---|---|
| `allies_characters` | string[] | Character select. Names of allied PCs |
| `allies` | string | Notes on these alliances |
| `coterie_characters` | string[] | Character select. Names of coterie members |
| `coterie` | string | About the coterie |
| `enemies_characters` | string[] | Character select. Names of rival/hostile PCs |
| `enemies` | string | Notes on these conflicts |
| `opposed_covenant_tag` | string | Select. Values: `carthian`, `circle`, `invictus`, `lancea`, `all_others` |
| `opposed_covenant` | string | Why they want that covenant to fail |
| `intolerable_behaviours` | string | Kindred behaviours the character cannot tolerate |
| `boons_debts` | object[] | Dynamic list. Each entry: `{ character, description }` |
| `secrets` | object[] | Dynamic list. Each entry: `{ character, description }` |

#### `boons_debts` and `secrets` entry shape

| Key | Type | Notes |
|---|---|---|
| `character` | string | Name of the PC involved |
| `description` | string | The favour or secret |

---

## Status lifecycle

```
new → draft → submitted → approved
```

- `new`: no document exists yet; form is editable
- `draft`: auto-saved in progress; form is editable
- `submitted`: sent for ST review; player can still edit
- `approved`: locked; ST only can edit; awards +3 XP

---

## Notes

- `additionalProperties: true` on the responses object allows legacy string fields from earlier versions to coexist with the new array fields without breaking reads.
- Structured `_tags` / `_tag` fields store machine-readable enums; companion textarea fields store free-text elaboration. Claude checks structured fields first when generating downtime responses.
- `character_select` fields store character display names (moniker or name), not ObjectIds, for human readability in prompts.
- The `character_questionnaires` collection (Google Forms import) remains separate and read-only. Its schema is superseded by this document for all new questionnaire work.
