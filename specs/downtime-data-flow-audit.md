# Downtime Data Flow Audit

**Date:** 2026-05-09
**Audit purpose:** The DT player form is considered viable. This audit maps every field the form writes against every consumer that reads it on the processing side, to surface what is broken, drifted, or undocumented.
**Scope:** Form writes (`public/js/tabs/downtime-form.js → collectResponses()`) → all consumers reachable from a saved `downtime_submissions` document.

---

## TL;DR — Issues to Address

### Blockers (processing is actually broken)

| # | Severity | Issue | Where |
|---|---|---|---|
| B1 | Critical | **Status/MCI actions are invisible to admin processing.** Form writes `status_${n}_*` for Status influence merits and MCI; `buildMeritActions(sub)` only normalises spheres/contacts/retainers/acquisitions. The Status section in the DT Story tab will always render "No actions for this section." | Form: `downtime-form.js:789-815`; Consumer gap: `admin/downtime-story.js:1641-1701` |
| B2 | High | **`_feed_rote` is read but no longer written.** Form dropped `_feed_rote` writes in dt-form.22 (rote is now a per-slot project action). `feeding-tab.js:344` still gates rote display on `r['_feed_rote'] === 'yes'` — that branch is now dead code. | Read: `tabs/feeding-tab.js:344`; Form drop: `downtime-form.js:426-429` |
| B3 | High | **Schema enum rejects `'maintenance'` project action.** `projectActionEnum` does not include `'maintenance'` even though form writes it (dt-form.28). Currently survives only because `additionalProperties: true` is at the responses level — but the per-slot `enum` constraint on `project_${n}_action` (schema line 64) IS strict. | Schema: `downtime_submission.schema.js:27-39`; Form writes: `downtime-data.js:20` |

### Major drift (schema is 6+ stories out of date)

| # | Severity | Issue | Where |
|---|---|---|---|
| D1 | High | Schema declares **legacy keys the form no longer writes**: single-string `aspirations`, `correspondence`, `trust`, `harm`, `_feed_rote`, `project_${n}_xp_category`, `project_${n}_xp_item`, `project_${n}_is_joint`, `project_${n}_joint_*` (5 fields), `project_${n}_personal_notes`. Sphere/project enums still include `'support'`, `'rumour'`, `'acquisition'`, `'patrol_scout'` (sphere). | Schema: `downtime_submission.schema.js` (multiple lines, see D-series below) |
| D2 | High | Schema is **missing entire form-written domains**. Tracked under `additionalProperties: true` so it doesn't fail; but means schema is no longer a documentation source. Affected: `status_${n}_*` (Status/MCI actions), `mentor_${n}_*`, `staff_${n}_*` (dt-form.28), `aspiration_${n}_type/_text` (dt-form.26), `game_recount_${n}` (DTR.1), `mechanical_flag_${n}` (DTFP-7), `personal_story_kind/_npc_name/_text` (dt-form.18), `story_moment_*` (NPCR.12), `equipment_${n}_*`, `feed_violence` (dt-form.35), `sorcery_${n}_mandragora`, `sorcery_slot_count`. | Schema: `downtime_submission.schema.js:175` (`additionalProperties: true`) hides these |

### Drift in admin processing (working via fallback, but cognitive load)

| # | Severity | Issue | Where |
|---|---|---|---|
| D3 | Medium | Admin reads many fields with `canonical \|\| legacy` fallback chains. Working, but means processing doesn't know which shape it'll get. Examples: `_feed_method \|\| feed_method`, `_ambience_direction \|\| _ambience_dir`, `_ambience_target \|\| _territory`, `_xp_rows \|\| _xp_category/_item`, `game_recount_${n} \|\| game_recount`, personal_story_text → correspondence → letter_to_home → letter → narrative_letter → personal_message. | `admin/downtime-views.js` (multiple lines, see D3 detail) |

### Quick wins (no logic change, schema-only)

| # | Issue |
|---|---|
| Q1 | Add `'maintenance'` to `projectActionEnum`. |
| Q2 | Remove `_feed_rote` from schema (form no longer writes it; admin no longer needs it once B2 is fixed). |
| Q3 | Replace single-string `aspirations` with structured `aspiration_${n}_type/_text` declarations. |
| Q4 | Remove `project_${n}_is_joint`, `_joint_*` (5 fields), `_personal_notes` from schema (dt-form.32 stripped JDT). |

---

## Methodology

Three-pass audit:

1. **Pass 1 — Form writes.** Read `collectResponses()` end-to-end and enumerate every key the form sets on `responses.*`.
2. **Pass 2 — Consumer reads.** For each downstream file, enumerate every read of `responses.*` (including via fallback chains).
3. **Pass 3 — Cross-reference.** Build the gap matrix: orphans (form writes, nothing reads), gaps (consumer reads, form doesn't write), drift (legacy keys still being read alongside canonical).

Files audited:

| Layer | File | Role |
|---|---|---|
| Form | `public/js/tabs/downtime-form.js` | Writes responses via `collectResponses()` |
| Admin processing | `public/js/admin/downtime-views.js` | ST queue / action cards / phase routing |
| Story render | `public/js/admin/downtime-story.js` | DT Story tab: per-character report |
| Helpers | `public/js/data/dt-action-summary.js` | Submit-Final modal action counts |
| Helpers | `public/js/data/dt-completeness.js` | MINIMAL completeness gate |
| Helpers | `public/js/data/dt-hold-flag.js` | DT-hold flag |
| Player tabs | `public/js/tabs/feeding-tab.js` | Player feeding readout |
| Player tabs | `public/js/tabs/regency-tab.js` | Regency confirm |
| Player tabs | `public/js/tabs/story-tab.js` | Player-facing report |
| Parser | `public/js/downtime/parser.js` | CSV → responses (legacy import path) |
| Server | `server/routes/downtime.js` | API routes for submissions |
| Server | `server/routes/attendance.js` | Attendance mirror |
| Server | `server/schemas/downtime_submission.schema.js` | Validation |

---

## Pass 1 — Form-Write Inventory

Source: `downtime-form.js` → `collectResponses()` (lines 353-1034).

### Top-level / gates / mode

```
_gate_attended, _gate_is_regent, _gate_has_sorcery, _gate_<key> (manual gates)
_mode               ('minimal' | 'advanced')
_has_minimum        (boolean — derived; soft-submit)
_final_submitted_at (Submit Final modal, ADVANCED only)
regent_territory
```

### Personal Story

```
personal_story_kind         ('touchstone' | 'correspondence')
personal_story_npc_name     (free-text)
personal_story_text         (narrative)
story_moment_relationship_id
story_moment_note
```

### Aspirations (ADVANCED, structured 3 slots)

```
aspiration_1_type, aspiration_1_text
aspiration_2_type, aspiration_2_text
aspiration_3_type, aspiration_3_text
```

### Court / Game Recount

```
game_recount_1..5      (per-slot text)
game_recount           (joined string for back-compat)
mechanical_flag_1..5   (boolean per slot, DTFP-7)
```

### Feeding

```
_feed_method               ('seduction' | 'stalking' | 'force' | 'familiar' | 'intimidation' | 'other' | '')
_feed_disc, _feed_spec
_feed_custom_attr, _feed_custom_skill, _feed_custom_disc
_feed_blood_types          (JSON array)
feeding_description
feed_violence              ('kiss' | 'violent', dt-form.35)
feeding_territories        (JSON: { territory_slug: 'resident'|'poach'|'none' })
feeding_territories_rote   (JSON, only when a slot is action='rote')
```

### City Influence

```
influence_spend            (JSON: { territory_slug: integer })
```

### Project slots (1..4)

Per slot N:

```
project_N_action            (enum: '' | feed | ambience_change | attack | hide_protect |
                                  investigate | patrol_scout | rote | xp_spend | misc | maintenance)
project_N_title, _outcome, _description, _territory, _xp
project_N_pool_attr, _pool_skill, _pool_disc, _pool_spec, _pool_expr (canonical post-#198)
project_N_target_type, _target_value, _target_terr, _target_other (Issue #170 — gated on element presence)
project_N_ambience_target       (territory slug, dt-form.25)
project_N_ambience_direction    ('up' | 'down' | '', dt-form.25)
project_N_investigate_lead
project_N_xp_trait, _xp_rows (JSON), _xp_dots ('0' placeholder)
project_N_feed_method2          (when action='rote')
project_N_cast                  (JSON array)
project_N_merits                (JSON array)
```

Top-level mirror:
```
xp_spend                   (JSON array, rebuilt every save from per-slot _xp_rows)
```

### Sorcery (ADVANCED, dynamic count)

```
sorcery_slot_count
sorcery_N_rite, _targets (JSON array of {type,value}), _notes, _mandragora ('yes'|'no')
```

### Sphere actions (Allies, max 5 slots)

```
sphere_N_action (legacy 'ambience_increase'/'_decrease' resolved at save time)
sphere_N_outcome, _description, _territory
sphere_N_block_merit, _project_support, _investigate_lead, _grow_target
sphere_N_ambience_dir   (kept — radio still in use here)
sphere_N_target_type, _target_value
sphere_N_merit          (display label)
sphere_N_cast           (JSON)
```

### Status actions (Status influence merits + MCI standing merits, max 5 slots)

```
status_N_action, _outcome, _description, _territory
status_N_investigate_lead
status_N_target_type, _target_value
status_N_ambience_dir
status_N_merit          (display label)
```

### Contacts (max 5 slots)

```
contact_N_info, _request, _merit
contact_N               (combined info+request, back-compat)
```

### Retainers

```
retainer_N_type, _task, _merit
retainer_N              (combined, back-compat)
```

### Mentor (dt-form.28)

```
mentor_N_target, _task, _merit
```

### Staff (dt-form.28, sized to total Staff dots)

```
staff_N_target, _task, _merit
```

### Acquisitions (dt-form.29 redesign, multi-row)

Canonical:
```
acq_resource_rows  (JSON: [{description, availability, merits[]}])
acq_skill_rows     (JSON: [{skill, spec, description, availability, merits[]}])
```

Mirrors maintained for back-compat:
```
acq_slot_count
acq_N_description, acq_N_availability, acq_N_merits
acq_description, acq_availability, acq_merits        (legacy single-row)
resources_acquisitions                               (composite blob)
skill_acq_description, skill_acq_pool_skill, skill_acq_pool_spec,
skill_acq_availability, skill_acq_merits
skill_acquisitions                                   (composite blob)
```

### Equipment (dt-form.30 hidden — section flagged `hidden`, currently no writes)

```
equipment_slot_count, equipment_N_name, _qty, _notes
```

### Merit gate flags

```
_merit_<key>           ('yes'|'no') per detected sphere/contact/retainer merit
```

### Final modal questions (dt-form.31, ADVANCED-only)

`_final_submitted_at` plus rating/feedback questions defined in `SUBMIT_FINAL_MODAL_QUESTIONS`. Form writes via the standard question loop.

---

## Pass 2 — Consumer Reads

### `admin/downtime-views.js` — admin processing UI

Reads ~88 distinct keys. Most-noted findings:

| Domain | Notable reads | Note |
|---|---|---|
| Feeding | `_feed_method` (1248, 1257, 1362, 2297, 2709, 7382), `_feed_disc` (1257, 1364, 2710), `_feed_spec`, `_feed_custom_*`, `feeding_description` (1363, 2714), `feeding_territories` (1381, 2728, 9630, 9813, 9854, 10740), `feeding_territories_rote` (1312, 1388), `feed_violence` (7382) | All canonical. Fallback chain `_feed_method \|\| feed_method` at 2297 (legacy CSV shape). |
| Personal Story | `personal_story_kind` (1446), `_npc_name` (1447), `_text` (1448), `story_moment_note` (1449) | All canonical. |
| Game Recount | `game_recount_1..5` (1406, 1946, 1957, 2062, 2228), `game_recount` joined fallback (1416, 1429), `mechanical_flag_${n}` (2232) | Per-slot canonical; joined as legacy fallback. |
| Aspirations | `aspiration_${n}_type/_text` (1413, 1801, 3835); `aspirations` legacy fallback (1417, 1433, 3802, 3859) | Per-slot canonical. |
| Project slots | Full set: `project_${n}_action/title/outcome/description/cast/merits/territory/pool_expr/pool2_expr/target_*/ambience_*/investigate_lead/xp_rows/feed_method2`. | Both `_ambience_direction` and `_ambience_dir` read with fallback (159-160, 2866). Both `_xp_rows` and legacy `_xp_category/_item` read (2908-2928). |
| Sorcery | `sorcery_slot_count` (2673, 1505), `sorcery_${n}_rite/targets/notes/mandragora/pool_expr`, plus `sorcery_1_tradition` and legacy `sorcery_tradition` fallback | All present. |
| Sphere | `sphere_${n}_merit/action/outcome/description/pool_expr/territory/target_type/target_value/target_terr/target_other/investigate_lead/cast` (2967-2994, 3054, 3062, 3068) | Full set wired up post-Issue #217. |
| **Status** | **No `status_${n}_*` reads** anywhere in the file | **GAP — see B1** |
| Contact | `contact_${n}` legacy (3002), `contact_${n}_request` (3002) | Sufficient for admin queue. |
| Mentor | `mentor_${n}_merit/target/task` for n=1..10 (3162-3174) | dt-form.28 wired. |
| Staff | `staff_${n}_merit/target/task` for n=1..20 (3183-3195) | dt-form.28 wired. |
| Acquisitions | `acq_resource_rows` (3262), `acq_skill_rows` (3283), `acq_slot_count` (1574), `resources_acquisitions` blob (1546, 3214), `skill_acquisitions` blob (1547, 3215), `skill_acq_pool_skill/spec` (3272-3273) | Multi-row canonical reads + blob fallbacks. |
| Equipment | `equipment_slot_count` (1526), `equipment_${n}_name/qty/notes` (1529-1532) | Pipeline wired but section currently hidden in the form. |
| Top-level | `regent_territory` (1558), `regency_action` (1548), `xp_spend` (1545, 4093-4144), `form_feedback` (1549), `vamping` (1543), `lore_request` (1544), `correspondence` (1411, 3802), `travel` (1411, 2653, 3802), `rp_shoutout` (1411, 1422), `influence_territories` (3578) | Mix of canonical and pre-redesign survivors. |

### `admin/downtime-story.js` — DT Story tab

Reads project narrative fields plus the merit-actions normaliser.

| Function | Reads from `responses.*` | Notes |
|---|---|---|
| Project section render | `project_${n}_title` (390, 599, 648, 1288, 1290, 3153, 3983), `_outcome` (461, 649, 1289, 2395, 2643, 2803, 2898), `_description` (462, 650), `_territory` (463, 651, 538, 726, 1955, 2388, 2485, 2636, 2799, 2897), `_cast` (464), `_merits` (465, 601, 652), `_action` (468, 1291, 3509), `_personal_notes` (3139) | `_personal_notes` is JDT residue — form no longer writes after dt-form.32. |
| Personal Story | `personal_story_text` (1397, 1531) → fallback chain `correspondence` → `letter_to_home` → `letter` → `narrative_letter` → `personal_message` (1398-1402, 1532-1536) | Fallback chain accommodates all historical shapes. Most are now defensive. |
| Aspirations | `aspirations` legacy single-string blob (1405, 1461, 1538) | Reads only the legacy single string; **doesn't read structured `aspiration_${n}_*`** the form now writes. |
| Story moment | `story_moment_relationship_id` (3402) | NPCR.12. |
| `buildMeritActions(sub)` (line 1641) | spheres: `sphere_${n}_merit/action/outcome/description`; contacts: `contact_${n}_request/_merit`; retainers: `retainer_${n}_task`; resource acq: `acq_resource_rows`, `resources_acquisitions` | **No status_${n}_* handling** — see B1. |

### `data/dt-action-summary.js` — Submit Final modal

| Reads | Purpose |
|---|---|
| `project_${n}_action`, `sphere_${n}_action`, `status_${n}_action`, `contact_${n}_request`/`_info`, `retainer_${n}_task`/`_type`, `mentor_${n}_task`/`_target`, `staff_${n}_task`/`_target`, `acq_${n}_description` (with `acq_description` fallback), `sorcery_${n}_rite`, `equipment_${n}_name` | Counts non-empty slots per domain. |

This is the only consumer that reads `status_${n}_action` — but only for slot-counting, not for processing.

### `data/dt-completeness.js` — MINIMAL gate

Reads canonical: `personal_story_kind/_text`, `_feed_method`, `_feed_disc`, `_feed_custom_*`, `_feed_blood_types`, `feed_violence`, `feeding_territories`, `game_recount_${n}`, `project_1_action`. Legacy fallbacks: `personal_story_npc_name/_npc_id/_note`, `story_moment_note`, `osl_moment`, `correspondence`, `game_recount` joined.

### `data/dt-hold-flag.js`

Reads only `_has_minimum`. Single-purpose.

### `tabs/feeding-tab.js` — player feeding tab

| Reads | Status |
|---|---|
| `_feed_method`, `_feed_disc`, `_feed_spec` | canonical |
| **`_feed_rote`** (line 344) | **broken — see B2** |
| `_feed_blood_types`, `feeding_territories`, `feeding_description`, `influence_spend` | canonical |
| `project_${n}_action`, `_feed_method2`, `_territory`, `_description` | canonical (and would replace the broken `_feed_rote` path) |

### `tabs/regency-tab.js`

Reads only `feeding_territories`. Used to identify characters who fed resident on the regent territory.

### `tabs/story-tab.js` — player report

Reads `project_${n}_title/action`, `sphere_${n}_merit/action`, `contact_${n}_merit/_request`, `retainer_${n}_task`, `resources_acquisitions` (legacy fallback). Player-facing story tab. **Does NOT read `status_${n}_*`** — same gap as admin.

### `downtime/parser.js`

Inverse of consumers — produces nested groups (`submission`, `narrative`, `regency`, `feeding`, `influence`, `projects[]`, `sphere_actions[]`, `contact_actions`, `retainer_actions`, `acquisitions`, `ritual_casting`) for CSV imports. Not relevant to live-form data flow.

### `server/routes/downtime.js`

Two narrow reads:

| Line | Read | Purpose |
|---|---|---|
| 685-692 | `sorcery_slot_count`, `sorcery_${n}_rite`, `sorcery_${n}_mandragora` | `_syncMandragoraParkedFlags(submission)` — fire-and-forget on PUT |
| 1221 | `_feed_method` | Email template context |

GET endpoints strip `st_review` for player role (595-596, 663-664) but **no per-player scoping on `responses.*`**. Players can read other players' submissions in full.

### `server/routes/attendance.js`

Does not read `responses.*` at all. Receives `downtime` boolean from PATCH body (line 111) — that's the soft-submit mirror from `_has_minimum`.

### `server/schemas/downtime_submission.schema.js`

Permissive schema. `responses` object has `additionalProperties: true` (line 175), so unknown keys are silently accepted. Strict per-field enums:

```
projectActionEnum (line 27): ['', 'ambience_increase', 'ambience_decrease', 'attack',
  'feed', 'hide_protect', 'investigate', 'patrol_scout', 'support', 'xp_spend',
  'misc', 'rote', 'ambience_change']
sphereActionEnum (line 41): ['', 'ambience_increase', 'ambience_decrease', 'attack',
  'block', 'hide_protect', 'investigate', 'patrol_scout', 'rumour', 'support',
  'grow', 'misc', 'acquisition']
```

---

## Pass 3 — Findings (Detailed)

### B1 — Status / MCI actions invisible to admin processing

**Symptom:** Form collects `status_${n}_action`, `status_${n}_outcome`, etc. for any character with a Status influence merit or an MCI standing merit. None of these are surfaced in the DT Story tab or the admin queue.

**Root cause:** `buildMeritActions(sub)` in `admin/downtime-story.js:1641` populates `sub.merit_actions` from `sphere_${n}_*`, `contact_${n}_*`, `retainer_${n}_*`, and `acq_*_rows`. Status slots are not handled.

```javascript
// Current — admin/downtime-story.js:1659-1668
for (let n = 1; n <= 5; n++) {
  const mt = resp[`sphere_${n}_merit`];   // sphere only
  if (!mt) continue;
  actions.push({
    merit_type:      mt,
    action_type:     resp[`sphere_${n}_action`]      || 'misc',
    desired_outcome: resp[`sphere_${n}_outcome`]     || '',
    description:     resp[`sphere_${n}_description`] || '',
  });
}
// No equivalent loop for `status_${n}_*`
```

**Downstream effect:** `renderStatusSection(char, sub)` (line 2334) calls `renderMeritSection(... ['status'])` which filters `sub.merit_actions` by `deriveMeritCategory(merit_type) === 'status'`. With nothing in `merit_actions` for status, the rendered section is always empty.

**Fix scope:** Add a status loop to `buildMeritActions` that mirrors the sphere loop, reading `status_${n}_action/_outcome/_description/_merit`. ~10 lines.

**Verification before fix:** confirm whether old data was ever in `responses.status_${n}_*` or whether DT1/DT2 historical submissions only used spheres. Story `dtq.2.dt-story-merit-actions-population` (status: review) is where this work belongs.

---

### B2 — `_feed_rote` read but no longer written

**Symptom:** `feeding-tab.js:344` gates rote-feed display on `r['_feed_rote'] === 'yes'`. After dt-form.22, the form drops `_feed_rote` writes — rote is detected from `project_${n}_action === 'rote'`.

```javascript
// tabs/feeding-tab.js:344-368  (reads _feed_rote === 'yes')
if (r['_feed_rote'] === 'yes') {
  // never executes for fresh submissions post-dt-form.22
}
```

**Root cause:** `downtime-form.js:426-429`:

> "dt-form.22: legacy `_feed_rote*` and `_rote_*` writes removed. ROTE is now a per-slot project action; method persists per-slot as `project_N_feed_method2`."

**Admin side already handled** (see `admin/downtime-views.js:2721-2726`):

```javascript
const feedRote = sub.st_review?.feeding_rote || [1,2,3,4].some(n => {
  const a = resp[`project_${n}_action`];
  return a === 'rote' || a === 'feed';
});
```

**Fix scope:** Replace `feeding-tab.js:344` rote detection with the same project-slot scan used in admin. ~5 lines.

---

### B3 — `projectActionEnum` does not include `'maintenance'`

**Symptom:** Schema's `projectActionEnum` (line 27-39) lists 13 values; `'maintenance'` is not among them. Form writes `'maintenance'` as a project action per dt-form.28 / Issue #146.

```javascript
// schema line 64 — strict enum on the per-slot field:
[`project_${n}_action`]: { type: 'string', enum: projectActionEnum }
```

**Risk:** A submission with a `maintenance`-action slot will fail JSON-schema validation on PUT/POST when ajv enforces the enum. Why this hasn't broken yet is worth verifying — possibly because the submission's other validators short-circuit, or maintenance writes have never made it to a save with strict mode on. Either way, this is a latent landmine.

**Fix scope:** Add `'maintenance'` to line 33 (the array). One-line change.

**Adjacent:** `sphereActionEnum` includes `'rumour'`, `'support'`, `'acquisition'` which the form's SPHERE_ACTIONS dropdown no longer offers. These are kept for back-compat with old saved submissions — not an issue, just noise.

---

### D1 — Schema declares legacy keys the form no longer writes

**Severity:** Documentation drift. Doesn't break anything, but the schema is no longer a source of truth.

| Schema field | Line | Form-write status | Recommendation |
|---|---|---|---|
| `aspirations` (single string) | 231 | Replaced by structured `aspiration_${n}_type/_text` (dt-form.26) | Drop. Replace with structured per-slot props. |
| `correspondence` | 228 | Personal Story collapsed in dt-form.18 (`personal_story_text` is canonical). May still be written as a section question — verify. | Audit `DOWNTIME_SECTIONS` to confirm. |
| `trust`, `harm` | 229, 230 | Same — single-string Personal Story narrative fields. | Drop if no DOWNTIME_SECTIONS question. |
| `_feed_rote` | 242 | Dropped by dt-form.22 | Drop. |
| `project_${n}_xp_category` | 99 | Dropped by dt-form.26 (replaced by `_xp_rows`) | Drop. |
| `project_${n}_xp_item` | 100 | Same | Drop. |
| `project_${n}_is_joint` | 109 | Dropped by dt-form.32 (JDT MVP removal) | Drop. |
| `project_${n}_joint_description` | 110 | Same | Drop. |
| `project_${n}_joint_target_type/_value/_invited_ids` | 111-113 | Same | Drop. |
| `project_${n}_joint_id` | 118 | Same | Drop. |
| `project_${n}_joint_role` | 119 | Same | Drop. |
| `project_${n}_personal_notes` | 123 | Same (JDT support's notes) | Drop. |
| `skill_acq_pool_attr` | 344 | Dropped post-hotfix #42 (per the schema's own comment) | Drop. |

---

### D2 — Schema missing form-written domains

`additionalProperties: true` masks these — they save fine. But schema is no longer documentation.

| Form domain | Form-write keys | Schema status |
|---|---|---|
| Status / MCI actions | `status_${n}_action/_outcome/_description/_territory/_investigate_lead/_target_type/_target_value/_ambience_dir/_merit` | Entirely absent |
| Mentor (dt-form.28) | `mentor_${n}_target/_task/_merit` | Absent |
| Staff (dt-form.28) | `staff_${n}_target/_task/_merit` | Absent |
| Aspirations (dt-form.26) | `aspiration_${n}_type/_text` | Absent (legacy single string still declared) |
| Game Recount (DTR.1) | `game_recount_${n}` per-slot | Absent (only joined declared) |
| Mechanical flags (DTFP-7) | `mechanical_flag_${n}` | Absent |
| Personal Story (dt-form.18) | `personal_story_kind/_npc_name/_text` | Absent (legacy single fields declared) |
| Story moment (NPCR.12) | `story_moment_relationship_id/_note` | Absent |
| Equipment (dormant) | `equipment_slot_count`, `equipment_${n}_name/_qty/_notes` | Absent |
| Feed violence (dt-form.35) | `feed_violence` | Absent |
| Sorcery (dt-form.25+) | `sorcery_slot_count`, `sorcery_${n}_mandragora` | Absent (`sorcery_${n}_rite/targets/notes` are present) |
| Project ambience (dt-form.25) | `project_${n}_ambience_target/_ambience_direction` | Present ✓ |
| Project pool spec | `project_${n}_pool_spec`, `project_${n}_pool_expr` | Absent |
| Project XP rows (dt-form.26) | `project_${n}_xp_rows` | Present ✓ |
| Sphere extra fields | `sphere_${n}_block_merit/_project_support/_investigate_lead/_grow_target/_target_type/_target_value` | Absent (basic fields present) |
| Project target picker | `project_${n}_target_type/_value/_terr/_other` | Absent |
| Acq canonical rows | `acq_resource_rows`, `acq_skill_rows` | Present ✓ |

---

### D3 — Admin reads via fallback chains (working but cognitive load)

These are acceptable working states (back-compat) but worth being aware of:

| Fallback chain | Purpose |
|---|---|
| `_feed_method \|\| feed_method` (downtime-views.js:2297) | New form vs legacy CSV shape |
| `project_${n}_ambience_direction \|\| project_${n}_ambience_dir` (159-160, 2866) | dt-form.25 canonical vs legacy |
| `project_${n}_ambience_target \|\| project_${n}_territory` (2888) | dt-form.25 vs legacy `_territory` for ambience actions |
| `project_${n}_xp_rows` → fall through to `project_${n}_xp_category/_item` (2908-2928) | dt-form.26 multi-row vs legacy single-row |
| `game_recount_${n}` per-slot → fallback to joined `game_recount` (1416, 1429) | DTR.1 vs joined string |
| `personal_story_text` → `correspondence` → `letter_to_home` → `letter` → `narrative_letter` → `personal_message` (downtime-story.js:1397-1402, 1531-1536) | dt-form.18 vs five different historical shapes; mostly defensive |
| `acq_resource_rows` → `resources_acquisitions` blob (1546, 3214; 3262) | dt-form.29 multi-row vs legacy single blob |
| `skill_acq_*` fields with similar fallback to `skill_acquisitions` blob | Same |
| `feedRote = sub.st_review?.feeding_rote \|\| <project-slot scan>` (2721-2726) | ST override or live form derivation |

---

## Recommended Pickup Order

If the goal is to make processing match the form's current shape, do them in this order:

1. **B1 — wire up status/MCI in `buildMeritActions`** (`admin/downtime-story.js:1641`). Story `dtq.2.dt-story-merit-actions-population` already exists at status: review — extend its scope or add a follow-up. The Status section in the DT Story tab is empty for affected characters until this lands.
2. **B2 — replace `_feed_rote` read in `feeding-tab.js:344`** with project-slot scan. Tiny.
3. **B3 — add `'maintenance'` to `projectActionEnum`** (`schema:33`). One line. Verify nothing else regresses.
4. **D2 — schema declarations for Status/Mentor/Staff/Aspirations/GameRecount/Personal Story/Story Moment/Equipment/feed_violence/sorcery_mandragora/project_pool_spec/project_target_*/sphere extras**. Documentation, not behaviour. Bundle as one PR.
5. **D1 — drop legacy schema declarations** (aspirations single-string, _feed_rote, joint fields, xp_category/item, skill_acq_pool_attr). After D2 lands. Same PR or follow-up.
6. **D3 — leave the fallback chains alone** for now. They make legacy submissions readable. Worth a future sweep when DT1 imports are no longer relevant.

The processing-side cleanup is largely scoped to two files (`admin/downtime-story.js` + the schema). Once those land, the admin-views read surface (the larger 10k file) becomes consistent with what the form writes.
