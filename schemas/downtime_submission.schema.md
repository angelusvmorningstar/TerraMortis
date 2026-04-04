# Downtime Submission Schema

Describes the shape of documents in the `downtime_submissions` collection.
Derived from `downtime-data.js`, `downtime-form.js` (`collectResponses`),
and `downtime-views.js` (ST review fields).

---

## Top-level document

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | MongoDB primary key |
| `character_id` | ObjectId | yes | FK → `characters._id` |
| `character_name` | string | yes | Denormalised for display |
| `cycle_id` | ObjectId | yes | FK → `downtime_cycles._id` |
| `status` | string | yes | `"draft"` or `"submitted"` |
| `responses` | object | yes | Player form data (see below) |
| `approval_status` | string | no | `"pending"` / `"approved"` / `"modified"` / `"rejected"` |
| `st_review` | object | no | ST-only review data (stripped from player responses) |
| `published_outcome` | string | no | Promoted from `st_review` on publish (player-visible) |

---

## `responses` object

All values are strings unless noted. JSON-encoded values are stored as strings
and parsed on read. Empty strings indicate unanswered.

### Gate flags (auto-detected)

| Key | Type | Values | Notes |
|---|---|---|---|
| `_gate_attended` | string | `"yes"` / `""` | Auto-detected from game sessions |
| `_gate_is_regent` | string | `"yes"` / `""` | Auto-detected from character data |
| `_gate_has_sorcery` | string | `"yes"` / `""` | Auto-detected from disciplines |
| `_gate_has_acquisitions` | string | `"yes"` / `"no"` / `""` | Manual gate (player toggle) |
| `regent_territory` | string | | Territory name, if regent |

### Court section (gated: `_gate_attended === "yes"`)

| Key | Type | Required | Notes |
|---|---|---|---|
| `travel` | string | yes | Travel method and precautions |
| `game_recount` | string | yes | 3–5 in-character highlights |
| `rp_shoutout` | JSON string | yes | Array of character IDs: `'["id1","id2"]'` |
| `correspondence` | string | no | In-character letter to NPC |
| `trust` | string | no | Most trusted PC and why |
| `harm` | string | no | PC being actively hampered |
| `aspirations` | string | no | Short/medium/long term goals |

### Feeding section (always present)

| Key | Type | Required | Notes |
|---|---|---|---|
| `_feed_method` | string | yes | Feed method ID: `"seduction"` / `"stalking"` / `"force"` / `"familiar"` / `"intimidation"` / `"other"` |
| `_feed_disc` | string | no | Selected discipline for feeding pool |
| `_feed_spec` | string | no | Selected skill speciality |
| `_feed_custom_attr` | string | no | Custom pool attribute (for "other" method) |
| `_feed_custom_skill` | string | no | Custom pool skill |
| `_feed_custom_disc` | string | no | Custom pool discipline |
| `feeding_description` | string | no | Narrative feeding description |
| `feeding_territories` | JSON string | yes | Object keyed by territory slug → `"resident"` / `"poach"` / `"none"`. Example: `'{"the_academy":"resident","the_docklands":"none",...}'` |
| `influence_spend` | JSON string | no | Object keyed by territory slug → integer (-N to +N). Example: `'{"the_academy":2,"the_docklands":-1,...}'` |

### Regency section (gated: `_gate_is_regent === "yes"`)

| Key | Type | Required | Notes |
|---|---|---|---|
| `regency_action` | string | no | Proclamations, policies, enforcement |
| `residency_1` … `residency_N` | string | no | Character names assigned to feeding slots |

### Projects section (always present, 4 slots)

Per slot `N` (1–4):

#### Current keys (flat string fields)

| Key | Type | Required | Notes |
|---|---|---|---|
| `project_N_action` | string | slot 1 yes | Action type enum (see below) |
| `project_N_outcome` | string | no | Desired outcome |
| `project_N_description` | string | no | Catch-all text block (being decomposed — see proposed fields) |
| `project_N_pool_attr` | string | no | Primary pool: attribute name |
| `project_N_pool_skill` | string | no | Primary pool: skill name |
| `project_N_pool_disc` | string | no | Primary pool: discipline name |
| `project_N_pool2_attr` | string | no | Secondary pool: attribute name |
| `project_N_pool2_skill` | string | no | Secondary pool: skill name |
| `project_N_pool2_disc` | string | no | Secondary pool: discipline name |

#### Proposed new fields (decomposing `description`)

The current `project_N_description` is a free-text block where players pack in
title, cast, XP notes, relevant merits, target territory, and narrative flavour.
These should be split into discrete fields for better ST processing and future
automation (e.g. XP integration, territory impact tracking).

| Key | Type | Required | Notes |
|---|---|---|---|
| `project_N_title` | string | no | Short project title for display and ST reference. Example: `"Investigating the Harbour disappearances"` |
| `project_N_cast` | JSON string | no | Array of character IDs involved. Example: `'["69cf7da8...","69ce0ae3..."]'`. References other PCs collaborating, supporting, or targeted by this project. |
| `project_N_xp` | string | no | XP expenditure note for this project. Free text describing what is being purchased. Future: structured `{ category, item, dots }` object integrated with the XP tab spend grid. |
| `project_N_merits` | JSON string | no | Array of merit references from the character's own sheet that are applicable to this action. Example: `'["Allies (Police)","Status (City)"]'`. Could be rendered as a checkbox picker from the character's merit list. |
| `project_N_territory` | string | no | Territory ID from the `territories` collection. Enum: `"academy"` / `"dockyards"` / `"harbour"` / `"northshore"` / `"secondcity"` / `""` (none). Links the project to a specific territory for ambience and residency tracking. |
| `project_N_description` | string | no | Optional flavour text — narrative context, additional details, or anything not captured by the structured fields above. |

**Migration note**: Existing submissions store everything in `project_N_description`.
New fields should be additive — the form can render the new fields while still
reading `description` from older submissions for backwards compatibility.

**Project action enum**: `""` (none), `"ambience_increase"`, `"ambience_decrease"`, `"attack"`, `"feed"`, `"hide_protect"`, `"investigate"`, `"patrol_scout"`, `"support"`, `"xp_spend"`, `"misc"`

### Sphere actions (dynamic, up to 5)

Per activated sphere `N` (1–5):

| Key | Type | Notes |
|---|---|---|
| `_merit_<merit_key>` | string | `"yes"` / `"no"` — toggle state per merit |
| `sphere_N_action` | string | Sphere action type enum (see below) |
| `sphere_N_outcome` | string | Desired outcome |
| `sphere_N_description` | string | Action description |
| `sphere_N_merit` | string | Display label: `"Allies ●●● (Police)"` |

**Sphere action enum**: `""` (none), `"ambience_increase"`, `"ambience_decrease"`, `"attack"`, `"block"`, `"hide_protect"`, `"investigate"`, `"patrol_scout"`, `"rumour"`, `"support"`, `"grow"`, `"misc"`, `"acquisition"`

### Contacts (dynamic, up to 5)

Per activated contact `N` (1–5):

| Key | Type | Notes |
|---|---|---|
| `_merit_<merit_key>` | string | `"yes"` / `"no"` — toggle state |
| `contact_N` | string | Information request text |
| `contact_N_merit` | string | Display label: `"Contacts ● (Antiques)"` |

### Retainers (dynamic)

Per activated retainer `N`:

| Key | Type | Notes |
|---|---|---|
| `_merit_<merit_key>` | string | `"yes"` / `"no"` — toggle state |
| `retainer_N` | string | Task description |
| `retainer_N_merit` | string | Display label: `"Retainer ●● (Ghoul)"` |

### Blood Sorcery (gated: `_gate_has_sorcery === "yes"`, 3 slots)

Per slot `N` (1–3):

| Key | Type | Notes |
|---|---|---|
| `sorcery_N_rite` | string | Rite name from character powers |
| `sorcery_N_targets` | string | Target description |
| `sorcery_N_notes` | string | Additional notes |

### Acquisitions (gated: `_gate_has_acquisitions === "yes"`)

| Key | Type | Notes |
|---|---|---|
| `resources_acquisitions` | string | Resources merit acquisitions |
| `skill_acquisitions` | string | Skill-based acquisition (max 1 per cycle) |

### Vamping (always present)

| Key | Type | Notes |
|---|---|---|
| `vamping` | string | Flavour RP, non-mechanical activities |

### Admin (always present)

| Key | Type | Notes |
|---|---|---|
| `xp_spend` | JSON string | Array of `{ category, item, dotsBuying }`. Example: `'[{"category":"Attributes","item":"Wits","dotsBuying":3}]'` |
| `lore_request` | string | Rules/lore questions |
| `form_rating` | string | `"1"` – `"10"` (half-star widget, stored as string) |
| `form_feedback` | string | Form UX feedback |

---

## `st_review` object (ST-only, stripped from player responses)

| Field | Type | Notes |
|---|---|---|
| `narrative` | object | Keyed by block name → `{ text, status }` |
| `narrative.<block>.text` | string | Narrative prose for this block |
| `narrative.<block>.status` | string | `"draft"` / `"ready"` |
| `mechanical_summary` | string | Mechanical outcomes summary |
| `outcome_text` | string | Final published outcome text |
| `outcome_visibility` | string | `"draft"` / `"ready"` / `"published"` |
| `published_at` | string | ISO timestamp of publication |
| `ready_at` | string | ISO timestamp when marked ready |

### ST expenditure fields

Per-submission resource tracking fields (stored as `st_review.<field>`):

Vitae, willpower, influence expenditure fields are stored with numeric values.

---

## `downtime_cycles` collection

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | MongoDB primary key |
| `label` / `title` | string | yes | Display name: `"Cycle 7 — April 2026"` |
| `deadline_at` | string | no | ISO timestamp — submissions close after this |
| `game_number` | integer | no | Linked game session number |
| `status` | string | no | Cycle lifecycle state |

---

## Merit key format

Dynamic merit keys (`<merit_key>`) are generated as:
```
`${merit.name}_${merit.rating}_${area}`.toLowerCase().replace(/[^a-z0-9]+/g, '_')
```
Example: `Allies ●●● (Police)` → `allies_3_police`
