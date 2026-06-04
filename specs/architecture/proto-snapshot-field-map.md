# Proto Snapshot — Schema Field Map

**Purpose:** Prerequisite gate for proto.7+. Maps all existing `st_review` and related per-action MongoDB fields to the design decisions (D1, D7, D9, D10, D13) that require schema confirmation before any Snapshot write-back story proceeds.

**Audit date:** 2026-05-25  
**Database:** `tm_suite` (MongoDB Atlas)  
**Method:** Live queries on `downtime_submissions` collection; 15+ documents sampled from DT cycles 2 and 3.

---

## Storage Architecture

Review data is NOT in a separate collection. All ST processing fields live as sub-objects on `downtime_submissions` documents, keyed by source type:

| Sub-object | Source type | Shape |
|---|---|---|
| `st_review` | Submission-level | Object (flat fields) |
| `st_narrative` | Submission-level | Object (narrative content) |
| `feeding_review` | `source === 'feeding'` | Object (flat fields) |
| `projects_resolved[i]` | `source === 'project'` | Array indexed by `actionIdx` |
| `merit_actions_resolved[i]` | `source === 'merit'` | Array indexed by `actionIdx` |
| `sorcery_review[actionIdx]` | `source === 'sorcery'` | Object keyed by `actionIdx` |
| `st_actions_resolved[i]` | `source === 'st_created'` | Array indexed by `actionIdx` |
| `acquisitions_resolved[i]` | `source === 'acquisition'` | Array indexed by `actionIdx` |

---

## `st_review` — Submission-Level Fields

| Field | Type | Status | Decision |
|---|---|---|---|
| `deleted_action_keys` | `string[]` | Existing | — |
| `outcome_text` | `string` (markdown) | Existing | D13 — compiled player delivery |
| `outcome_visibility` | `string` enum (`'published'`, ...) | Existing | D8 |
| `published_at` | ISO datetime string | Existing | — |
| `travel_discretion` | `string` enum (`'neutral'`, `'obvious'`) | Existing | — |
| `territory_overrides` | `object` (actionIdx → territory name) | Existing | — |
| `feed_violence_st_override` | `string` (`'kiss'`, ...) | Existing | — |
| `xp_approvals` | `object` (xpIdx → `{ status }`) | Existing | — |

**D1 hook:** No dedicated `updated_at` or `version` field on `st_review`. The save path calls `updateSubmission()` which updates the document's top-level MongoDB `updatedAt` timestamp (if the server sets one). **GAP:** If Snapshot re-derive needs to key off `st_review` saves specifically (not any submission save), a `st_review_updated_at` timestamp field would be needed. Alternatively, live re-derive can hook on any submission save via the `updatedAt` field.

---

## `st_narrative` — Narrative Content Fields

| Field | Type | Status | Decision |
|---|---|---|---|
| `story_moment` | `{ response, format, author, status, revision_note }` | Existing | D8 |
| `project_responses[i]` | `{ project_index, response, author, status, revision_note }` | Existing | D8 |
| `feeding_narrative` | `{ response, author, status, revision_note }` | Existing | D8 |
| `general_notes` | `string` | Existing | D13 — ST notes (not player-facing) |
| `locked` | `boolean` | Existing | — |

---

## `feeding_review` — Per-Character Feeding Fields

| Field | Type | Status | Decision |
|---|---|---|---|
| `pool_player` | `string` | Existing | — |
| `pool_validated` | `string` | Existing | — |
| `pool_status` | `string` enum (see below) | Existing | — |
| `notes_thread` | `NoteEntry[]` | Existing | D13 — ST notes |
| `story_context` | `string` | Existing | D13 |
| `active_feed_specs` | `string[]` | Existing | — |
| `pool_mod_spec` | `number` | Existing | — |
| `pool_mod_equipment` | `number` | Existing | — |
| `nine_again` | `boolean` | Existing | — |
| `eight_again` | `boolean` | Existing | — |
| `rote` | `boolean` | Existing | — |
| `pool_confirmed_by` | `string` | Existing | — |
| `pool_validated_by` | `string` | Existing | — |

---

## `projects_resolved[i]` — Per-Project-Action Fields

| Field | Type | Status | Decision |
|---|---|---|---|
| `action_type` | `string` | Existing | — |
| `pool` | `{ expression, total }` or `null` | Existing | — |
| `roll` | `RollResult` or `null` | Existing | D13 — dice result |
| `st_note` | `string` | Existing | D13 — ST notes |
| `pool_player` | `string` | Existing | — |
| `pool_validated` | `string` | Existing | — |
| `pool_status` | `string` enum (see below) | Existing | — |
| `notes_thread` | `NoteEntry[]` | Existing | D13 — ST notes |
| `story_context` | `string` | Existing | D13 |
| `resolved_at` | ISO datetime or `null` | Existing | D1 — could trigger re-derive |
| `nine_again` | `boolean` | Existing | — |
| `rote` | `boolean` | Existing | — |
| `eight_again` | `boolean` | Existing | — |
| `pool_confirmed_by` | `string` | Existing | — |
| `pool_validated_by` | `string` | Existing | — |
| `pool_committed_by` | `string` | Existing | — |
| `active_feed_specs` | `string[]` | Existing | — |
| `pool_mod_spec` | `number` | Existing | — |
| `pool_mod_equipment` | `number` | Existing | — |
| `succ_mod_manual` | `number` | Existing | — |
| `second_opinion` | `boolean` | Existing | — |
| `connected_chars` | `string[]` | Existing | — |
| `roll_mode` | `string` enum (`'player_default'`, `'st_override'`, `'no_roll'`) | **Proto-only (not in live DB)** | — |

---

## `merit_actions_resolved[i]` — Per-Merit-Action Fields

| Field | Type | Status | Decision |
|---|---|---|---|
| `pool_player` | `string` | Existing | — |
| `pool_validated` | `string` | Existing | — |
| `pool_status` | `string` enum (see below) | Existing | — |
| `notes_thread` | `NoteEntry[]` | Existing | D13 — ST notes |
| `player_feedback` | `string` | Existing | D8 — player-facing |
| `story_context` | `string` | Existing | D13 |
| `outcome_summary` | `string` | Existing | D13 — outcome |
| `action_type_override` | `string` | Existing | D9, D10 — distinguishes block, hide_protect, investigate, etc. |
| `desired_outcome` | `string` | Existing | — |
| `description` | `string` | Existing | — |
| `pool_resolved_by` | `string` | Existing | — |
| `pool_committed_by` | `string` | Existing | — |
| `merit_outcome` | `string` enum (`'approved'`, `'partial'`, `'failed'`) | Existing | D13 — outcome |
| `contacts_target` | `string` or `null` | Existing | — |
| `contacts_info_type` | `string` or `null` | Existing | — |
| `st_response` | `string` | Existing | D8 — player-facing |
| `response_status` | `string` (`'draft'`, `'complete'`) | Existing | D8 |
| `response_author` | `string` | Existing | — |
| `protected_merit_name` | `string` | Existing | D9/D10 — which merit is being hidden |
| `protected_merit_qualifier` | `string` | Existing | D9/D10 |
| `linked_merit_qualifier` | `string` | Existing | — |
| `support_target_key` | `string` | Existing | — |
| `connected_chars` | `string[]` | Existing | — |
| `roll` | `RollResult` | Existing | D13 — dice result |
| `inv_has_lead` | `boolean` | Existing | — |

---

## `sorcery_review[actionIdx]` — Per-Sorcery-Action Fields

| Field | Type | Status | Decision |
|---|---|---|---|
| `pool_status` | `string` enum (see below) | Existing | — |
| `notes_thread` | `NoteEntry[]` | Existing | D13 — ST notes |
| `player_feedback` | `string` | Existing | D8 |
| `rite_override` | `string` or `null` | Existing | — |
| `ritual_result_note` | `string` | Existing | D13 — outcome |
| `ritual_mg_used` | `boolean` | Existing | — |
| `ritual_roll` | `RollResult` | Existing | D13 — dice result |
| `ritual_target` | `number` | Existing | — |
| `connected_chars` | `string[]` | Existing | — |
| `sorc_tradition` | `string` | Existing | — |
| `sorc_rite_name` | `string` | Existing | — |
| `sorc_targets` | value or `null` | Existing | — |
| `sorc_notes` | `string` or `null` | Existing | D13 — notes |
| `pool_committed_by` | `string` | Existing | — |
| `pool_resolved_by` | `string` | Existing | — |

---

## Shared Types

**`pool_status` enum values (observed):** `'pending'`, `'validated'`, `'resolved'`, `'rolled'`, `'no_roll'`, `'skipped'`

**`NoteEntry`:** `{ author_id: string, author_name: string, text: string, created_at: ISOString }`

**`RollResult`:** `{ dice_string: string, successes: number, exceptional: boolean, rolled_at: ISOString, params: { size, again, success, exc, rote }, rote_other?: RollResult }`

---

## Design Decision Map

### D1 — Snapshot re-derives on every `st_review` save

**Finding:** No dedicated `st_review_updated_at` field exists. The submission document's top-level MongoDB `_id`-based recency is available but not a versioned timestamp. The `resolved_at` field on `projects_resolved[i]` marks project completion, not all saves.

**Assessment:** GAP — minor. Two viable approaches for proto.16 (live refresh on save):
1. Hook on the overall submission `updatedAt` (if the API sets it — confirm server-side).
2. Add a `st_review_touched_at` ISO field on `st_review` written by every `saveEntryReview` call.

Approach 1 is preferable if `updatedAt` is already set server-side (zero schema change needed).

### D7 — MongoDB always; no localStorage

**Finding:** All review writes go through `saveEntryReview` → `updateSubmission()` → `PATCH /api/downtime_submissions/:id`. No localStorage write paths found for review data. ✅ Confirmed.

### D9 — Blocking is a structured, queryable action type

**Finding:** `block` IS a first-class action type in `PHASE_MAP` (phase 7 / misc). It appears as `entry.actionType === 'block'` in queue entries, and as `action_type_override: 'block'` in `merit_actions_resolved[i]` for merit-source entries. No free-text label — the value is always the enum string `'block'`. ✅ Confirmed queryable directly.

**Note:** Distinct from `hide_protect` (phase 3, defensive). `block` is a merit action that prevents a specific lower-rated action; `hide_protect` conceals a merit.

### D10 — Obfuscate queryable by territory + discipline

**Finding:** Discipline selection (including Obfuscate) feeds into `pool_validated` as a text expression (e.g., `"Wits 3 + Stealth 4 + Obfuscate 3 = 10"`). There is no separate structured field storing `{ discipline: 'Obfuscate', territory: 'Harbour' }` on the review object.

**Assessment:** GAP — significant. For proto.10 (Investigate/hide-protect entries) to query "who in this territory is using Obfuscate on a hide/protect action," a new structured field will be needed. Proposed for proto.7 / proto.10:
```
projects_resolved[i].hide_protect_disc: string   // discipline name used ('Obfuscate', 'Dominate', ...)
```
Territory is already derivable from `entry.projTerritory` (on queue entries, sourced from the submission's project fields), so only the discipline field is new.

### D13 — Notes, Dice Result, and Outcome are separate fields

**Finding per source type:**

| Source | Notes field | Dice result field | Outcome field |
|---|---|---|---|
| `project` | `notes_thread[]` + `st_note` | `roll` (RollResult) | *(no dedicated outcome — narrative goes to `st_narrative.project_responses`)* |
| `merit` | `notes_thread[]` | `roll` (RollResult, rare) | `merit_outcome` (enum) + `outcome_summary` (string) |
| `sorcery` | `notes_thread[]` + `sorc_notes` | `ritual_roll` (RollResult) | `ritual_result_note` (string) |
| `feeding` | `notes_thread[]` | `roll` on `projects_resolved[i]` | *(feeding outcome goes to `st_narrative.feeding_narrative`)* |

**Assessment:** All three fields exist across source types. No single unified shape — each source type has its own naming. ✅ Confirmed no new fields needed for D13 as stated. Paragraph-mode `outcome` for merit actions uses `outcome_summary` (string) — no separate flag needed; just use a `<textarea>` instead of `<input>` in the UI.

---

## Fields Required by proto.7+

Proto.7 will build a per-card context object from existing queue data. Based on this audit:

| New field needed | Target sub-object | Purpose | Story |
|---|---|---|---|
| `hide_protect_disc` | `merit_actions_resolved[i]` or `projects_resolved[i]` | Store discipline name used for Obfuscate/Dominate hide actions — enables D10 query by territory + discipline | proto.10 |
| `st_review_touched_at` | `st_review` | Version stamp for Snapshot re-derive trigger (only if server `updatedAt` is unavailable) | proto.16 |

All other proto.7–proto.13 stories (territory presence, conflict flags, investigate cross-ref, sorcery cross-ref, feeding cross-ref) derive their data from existing `queue[]` entries computed by `buildProcessingQueue` — no new MongoDB writes required for those stories.

---

## Go / No-Go for proto.7

**Go.** The existing schema supports proto.7 through proto.13 without any new MongoDB fields. Cross-reference data derives from queue entries already in memory. The two identified gaps (`hide_protect_disc` and optional `st_review_touched_at`) are scoped to proto.10 and proto.16 respectively — both are later in the sequence and have time to be designed as proper story tasks when needed.

TASK-SA sign-off: **proceed to proto.7**.
