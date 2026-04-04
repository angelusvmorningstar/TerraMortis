# Downtime Submission Schema

Describes the shape of documents in the `downtime_submissions` and `downtime_cycles` collections.
Derived from `downtime-form.js` (`collectResponses`), `feeding-tab.js`, and `downtime-views.js`.

**Last synced**: 2026-04-04

---

## Top-level document

| Field | Type | Required | Notes |
|---|---|---|---|
| `_id` | ObjectId | auto | MongoDB primary key |
| `character_id` | string | yes | FK -> characters._id |
| `character_name` | string | yes | Denormalised for display |
| `cycle_id` | string/null | yes | FK -> downtime_cycles._id |
| `status` | string | yes | `"draft"` or `"submitted"` |
| `submitted_at` | string | no | ISO timestamp of submission |
| `approval_status` | string | no | `"pending"` / `"approved"` / `"modified"` / `"rejected"` |
| `responses` | object | yes | Player form data (see below) |
| `st_review` | object | no | ST-only review data (stripped from player responses) |
| `published_outcome` | string | no | Promoted from `st_review` on publish (player-visible) |
| `feeding_roll` | object | no | ST-resolved feeding roll result |
| `feeding_roll_player` | object | no | Player-side feeding roll (persisted) |
| `projects_resolved` | array | no | ST-resolved project action results |
| `merit_actions_resolved` | array | no | ST-resolved merit action results |
| `_raw` | object | no | CSV import structured data |

---

## `responses` object

All values are strings unless noted. JSON-encoded values are stored as strings and parsed on read. Empty strings indicate unanswered.

### Gate flags (auto-detected)

| Key | Values | Notes |
|---|---|---|
| `_gate_attended` | `"yes"` / `""` | Auto-detected from game sessions attendance |
| `_gate_is_regent` | `"yes"` / `""` | Auto-detected from `character.regent_territory` |
| `_gate_has_sorcery` | `"yes"` / `""` | Auto-detected from Cruac/Theban disciplines |
| `_gate_has_acquisitions` | `"yes"` / `"no"` / `""` | Legacy gate (acquisitions always shown now) |
| `regent_territory` | string | Territory name, if regent |

### Court section (gated: `_gate_attended === "yes"`)

| Key | Required | Notes |
|---|---|---|
| `travel` | yes | Travel method and precautions |
| `game_recount` | yes | 3-5 in-character highlights |
| `rp_shoutout` | yes | JSON array of character IDs: `'["id1","id2"]'` |
| `correspondence` | no | In-character letter to NPC |
| `trust` | no | Most trusted PC and why |
| `harm` | no | PC being actively hampered |
| `aspirations` | no | Short/medium/long term goals |

### Feeding: The Hunt (always present)

| Key | Required | Notes |
|---|---|---|
| `_feed_method` | yes | Enum: `"seduction"` / `"stalking"` / `"force"` / `"familiar"` / `"intimidation"` / `"other"` |
| `_feed_disc` | no | Discipline added to feeding pool |
| `_feed_spec` | no | Skill specialisation for feeding pool |
| `_feed_custom_attr` | no | Custom pool attribute (for "other" method) |
| `_feed_custom_skill` | no | Custom pool skill |
| `_feed_custom_disc` | no | Custom pool discipline |
| `_feed_rote` | no | `"yes"` / `""` - dedicates Project 1 to feeding with rote quality |
| `_feed_blood_types` | no | JSON array, subset of `["Animal","Human","Kindred"]` |
| `feeding_description` | no | Narrative feeding description |

### The City: Territory and Influence (always present)

| Key | Required | Notes |
|---|---|---|
| `feeding_territories` | yes | JSON object: `{ territory_slug: "resident" / "poach" / "none" }` |
| `influence_spend` | no | JSON object: `{ territory_slug: integer }` (-N to +N) |

Territory slugs: `the_academy`, `the_city_harbour`, `the_docklands`, `the_second_city`, `the_northern_shore`, `the_barrens__no_territory_`

### Regency (gated: `_gate_is_regent === "yes"`)

| Key | Notes |
|---|---|
| `regency_action` | Proclamations, policies, enforcement |
| `residency_1` ... `residency_N` | Character IDs assigned to feeding slots (dynamic keys) |

### Projects: Personal Actions (4 tabbed slots)

Per slot `N` (1-4). Field visibility depends on the selected action type:

| Action | Fields shown |
|---|---|
| (none) | - |
| feed | Summary + secondary method/pool/territory/description |
| xp_spend | Note only (spending done in Admin section) |
| ambience +/- | title, territory, pools, cast, description |
| attack/investigate/hide_protect | title, pools, outcome, territory, cast, merits, description |
| patrol_scout | title, pools, outcome, territory, cast, description |
| support | title, pools, outcome, cast, description |
| misc | title, pools, outcome, description |

| Key | Notes |
|---|---|
| `project_N_action` | Enum: `""`, `"ambience_increase"`, `"ambience_decrease"`, `"attack"`, `"feed"`, `"hide_protect"`, `"investigate"`, `"patrol_scout"`, `"support"`, `"xp_spend"`, `"misc"` |
| `project_N_title` | Short project title |
| `project_N_outcome` | Desired outcome (one clear thing) |
| `project_N_description` | Narrative context and details |
| `project_N_territory` | Territory enum: `""`, `"academy"`, `"dockyards"`, `"harbour"`, `"northshore"`, `"secondcity"` |
| `project_N_pool_attr` | Primary pool: attribute name |
| `project_N_pool_skill` | Primary pool: skill name |
| `project_N_pool_disc` | Primary pool: discipline name |
| `project_N_pool2_attr` | Secondary pool: attribute name |
| `project_N_pool2_skill` | Secondary pool: skill name |
| `project_N_pool2_disc` | Secondary pool: discipline name |
| `project_N_cast` | JSON array of character IDs |
| `project_N_merits` | JSON array of `"Name\|qualifier"` merit keys |
| `project_N_xp` | XP expenditure note |
| `project_N_feed_method2` | Secondary hunt method enum (for rote feed action) |

### Spheres of Influence (5 tabbed slots)

Pre-populated from character's Allies/Status merits. Field visibility depends on action type:

| Action | Fields shown |
|---|---|
| ambience +/- | territory, outcome, description |
| attack/block/support | cast, outcome, description |
| investigate/patrol_scout | territory, outcome, description |
| rumour/grow/misc/acquisition | outcome, description |

| Key | Notes |
|---|---|
| `sphere_N_action` | Enum: `""`, `"ambience_increase"`, `"ambience_decrease"`, `"attack"`, `"block"`, `"hide_protect"`, `"investigate"`, `"patrol_scout"`, `"rumour"`, `"support"`, `"grow"`, `"misc"`, `"acquisition"` |
| `sphere_N_outcome` | Desired outcome |
| `sphere_N_description` | Action description |
| `sphere_N_territory` | Territory enum |
| `sphere_N_merit` | Display label: `"Allies ●●● (Police)"` |
| `sphere_N_cast` | JSON array of character IDs |

### Contacts: Requests for Information (expandable table, up to 5)

| Key | Notes |
|---|---|
| `contact_N_info` | Supporting info (one-liner) |
| `contact_N_request` | Information request (textarea) |
| `contact_N_merit` | Display label: `"Contacts ● (Police)"` |
| `contact_N` | Backwards compat: combined info + request |

### Retainers: Task Delegation (expandable table, dynamic count)

| Key | Notes |
|---|---|
| `retainer_N_type` | Task type (one-liner: Guard, Investigate, etc.) |
| `retainer_N_task` | Task description (textarea) |
| `retainer_N_merit` | Display label: `"Retainer ●● (Ghoul Bodyguard)"` |
| `retainer_N` | Backwards compat: combined type + task |

### Blood Sorcery (gated: `_gate_has_sorcery === "yes"`, 3 slots)

| Key | Notes |
|---|---|
| `sorcery_N_rite` | Rite name from character powers |
| `sorcery_N_targets` | Target description |
| `sorcery_N_notes` | Additional notes |

### Acquisitions (always shown)

**Resources Acquisition:**

| Key | Notes |
|---|---|
| `acq_description` | What to acquire and why |
| `acq_availability` | `"1"`-`"5"` dot rating (Common to Unique) |
| `acq_merits` | JSON array of `"Name\|qualifier"` merit keys |
| `resources_acquisitions` | Backwards compat: combined text |

**Skill-Based Acquisition:**

| Key | Notes |
|---|---|
| `skill_acq_description` | What to acquire and how |
| `skill_acq_pool_attr` | Pool attribute name |
| `skill_acq_pool_skill` | Pool skill name |
| `skill_acq_pool_spec` | Pool skill specialisation |
| `skill_acq_availability` | `"1"`-`"5"` dot rating |
| `skill_acq_merits` | JSON array of `"Name\|qualifier"` merit keys |
| `skill_acquisitions` | Backwards compat: combined text |

### Vamping (always present)

| Key | Notes |
|---|---|
| `vamping` | Flavour RP, non-mechanical activities |

### Admin (always present)

| Key | Notes |
|---|---|
| `xp_spend` | JSON array of `{ category, item, dotsBuying }`. Categories: `"attribute"`, `"skill"`, `"discipline"`, `"merit"`, `"devotion"`, `"rite"`. Merit items: `"Name\|flat\|rating\|0"` or `"Name\|grad\|currentDots\|maxTarget"` |
| `lore_request` | Rules/lore questions for STs |
| `form_rating` | `"1"`-`"10"` (half-star widget) |
| `form_feedback` | Form UX feedback |

---

## XP Spending Rules

- **Merits 1-3 dots**: always available, no project action required
- **All other categories** (Attribute, Skill, Discipline, Devotion, Rite, Merit 4-5): require 1 XP Spend project action per dot purchased
- XP budget and action count are displayed in the Admin section

---

## `st_review` object (ST-only)

| Field | Notes |
|---|---|
| `narrative` | Object keyed by block name -> `{ text, status }` |
| `narrative.<block>.text` | Narrative prose |
| `narrative.<block>.status` | `"draft"` / `"ready"` |
| `mechanical_summary` | Mechanical outcomes summary |
| `outcome_text` | Final published outcome text |
| `outcome_visibility` | `"draft"` / `"ready"` / `"published"` |
| `published_at` | ISO timestamp |
| `ready_at` | ISO timestamp |

---

## Roll result shape

Used by `feeding_roll`, `feeding_roll_player`, and resolved action rolls:

| Field | Notes |
|---|---|
| `successes` | integer >= 0 |
| `exceptional` | boolean |
| `cols` | Array of roll columns with chain data |
| `vessels` | integer (feeding only) |
| `safeVitae` | integer (feeding only) |
| `methodName` | string (feeding only) |
| `pool` | integer - pool size |
| `breakdown` | string - pool expression |
| `rolledAt` | ISO timestamp |

---

## `downtime_cycles` collection

| Field | Type | Notes |
|---|---|---|
| `_id` | ObjectId | MongoDB primary key |
| `label` / `title` | string | Display name |
| `deadline_at` | string | ISO timestamp - submissions close after this |
| `game_number` | integer | Linked game session number |
| `status` | string | `"open"` / `"closed"` |
| `submission_count` | integer | Number of submissions |

---

## Merit key format

Dynamic merit keys are generated as:
```
`${merit.name}_${merit.rating}_${area}`.toLowerCase().replace(/[^a-z0-9]+/g, '_')
```
Example: `Allies ●●● (Police)` -> `allies_3_police`
