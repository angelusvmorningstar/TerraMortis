# Data Hygiene Audit — tm_suite — 2026-06-03

**Goal:** map every *fragmentation* in the live database — the same logical value
stored in inconsistent shapes — because that is the shared root cause behind the
recent player/ST-facing bugs (#496 territory keys, #497 cycle_id, #551/#552
attendance, #547/#550 payment). Each fragmentation charges a tax on every read:
a normaliser, a compat layer, or a relink. The fix pattern is always the same —
pick one canonical shape, migrate the data, delete the normaliser.

**Method:** `server/scripts/audit-data-hygiene.js` (read-only) profiled every
field path across all 20 fragmented collections for **type fragmentation** (one
field, multiple BSON types) and **format fragmentation** (string values spanning
multiple format classes), descending into JSON-string blobs to profile their
keys. Full data: `st-working/audit/data-hygiene-2026-06-03.json`. Re-runnable as
hygiene progresses.

**Noise excluded:** format-class mixing on free-text fields (names, reasons,
mobiles, narrative authors) is expected variance, not fragmentation. Those are
filtered out below; the findings here are identifier, FK, key, enum, and
schema-shape fragmentation only.

---

## Update 2026-06-03 (post-investigation) — some findings were TEST POLLUTION

Acting on this audit surfaced a key caveat: the audit script counted **test and
orphaned docs as production data**, inflating some counts. A read-only sweep
(`server/scripts/sweep-test-orphan-data.js`) was added to separate fixtures and
orphans from real fragmentation. Outcome so far:

- **Tier 1.2 (`territories.regent_id` / `lieutenant_id`) and Tier 2.3
  (`territories.slug`) were entirely test pollution, NOT production drift.** The
  `territories` collection held 5 clean production rows plus **8 orphaned
  "Regent Save Test" fixtures** carrying all the non-canonical values. Deleting
  them (#560) left all 5 real territories canonical. **#559 closed** as resolved
  by the same cleanup. Disregard the Tier 1.2 / 2.3 fragmentation counts below.
- **Separate finding (#567):** 19 orphaned `downtime_submissions` — 4 DT1 records
  relinked to current ObjectIds (real history), 12 empty test subs + 3
  dead-cycle drafts deleted. Not in the original audit's "fragmentation" framing
  but the same hygiene class.
- **Tier 1.1 (`character_id`) — DONE (#558).** 29 string values coerced to
  ObjectId; write paths already coerced, so it cannot regrow.
- **Tier 3 (enums) was a FALSE POSITIVE — closed #561/#562/#563.** Enumerating the
  actual values showed these are coherent enums, not drift: `pool_status` =
  validated/resolved/no_roll/pending/skipped; `project_N_action` = 12 distinct
  actions; `marking.status` = unmarked/in_progress. The format classifier counts
  a two-word value (`no_roll`, `in_progress`) as `snake_slug` and a one-word value
  (`resolved`) as `flat_lower`, so a clean enum with mixed word-counts reads as
  "fragmented." It is not. (Optional future hardening: schema enums to lock the
  valid sets.)
- **Still valid (real production work):** Tier 4 (schema-shape — `letter_from_home`,
  `touchstone`, `xp_spend`, `pool_targets`) and parts of Tier 5 (attribution).

**Two lessons for the remaining issues:** (1) run the test/orphan sweep on a
collection before treating its audit counts as production work; (2) for any
string field, enumerate the **distinct values** before trusting the format-class
"fragmentation" flag — multi-word enum values trip it. Net: of 8 filed issues,
only Tier 4 + parts of Tier 5 are real fragmentation; the rest were test
pollution (#559/#560), a separate orphan finding (#567), one real coercion
(#558), or enum false positives (#561/#562/#563).

---

## Tier 1 — FK / identity TYPE fragmentation (silent-drop bug class)

These are the highest-impact: a field stored as two different BSON types means
type-strict Mongo queries (`find({fk: oid})`) silently drop the mismatched docs.
This is the exact class that already bit feeding-rights (#497).

### 1.1 `downtime_submissions.character_id` — string (29) vs ObjectId (76) — **NOT YET FIXED**
- The direct sibling of #497, which canonicalised `cycle_id` only. `character_id`
  was noted as "already coerced on POST + dual-read on GET" in the #497 notes,
  but the stored data is still mixed: 29 string, 76 ObjectId.
- **Impact:** any type-strict `find({character_id: ObjectId})` drops the 29
  string-typed submissions (DT1-era). Player "my submissions" and ST per-character
  views can silently miss history.
- **Fix:** one-time migration to coerce all `character_id` to ObjectId (model on
  `migrate-submission-cycle-id-to-oid.js` from #497); then the dual-read tolerance
  can eventually be removed. Audit + migrate.

### 1.2 `territories.regent_id` (objectid_hex 5 / kebab_slug 6) and `territories.lieutenant_id` (objectid_hex 4 / kebab_slug 2)
- Territory office FKs stored as ObjectId-hex strings in some docs, kebab-slug
  character refs in others. Both formats are *strings* (so no BSON-type flag) but
  semantically two different identifier systems.
- **Impact:** player/ST-facing — regent and lieutenant resolution on the territory
  panel and city overview. A kebab-slug ref won't join to a character `_id`.
- **Fix:** canonicalise to ObjectId-hex (or true ObjectId). Migrate the ~8
  kebab-slug values; confirm the resolver only needs one path afterward.

---

## Tier 2 — Territory key residual (#496, quantified)

The #496 submission migration shipped (PR #498) but is **partial**, and CSV
import keeps reintroducing legacy keys (confirmed: the import path writes raw
slug/display-name keys; normalisation is read-time only).

### 2.1 `downtime_submissions.responses.feeding_territories` — keys objectid_hex (325) / other_string (65)
### 2.2 `downtime_submissions.responses.feeding_territories_rote` — keys objectid_hex (70) / other_string (14)
- **79 legacy-format territory keys remain live** across feeding blobs. These are
  exactly what `TERRITORY_SLUG_MAP` / `resolveTerrId` exist to bridge.
- **Impact:** feeding matrix, feeding-rights lock, ambience tallies. Every read
  goes through the normaliser; an unmapped variant silently mis-resolves.
- **Fix:** this is the gated cleanup already written into the rescoped **#496**.
  Gate = re-key the 79 residual keys; Block 1 = fix CSV import to emit ObjectId
  (else they regrow); then delete the normaliser.

### 2.3 `territories.slug` — flat_lower (5) / snake_slug (8)
- The *canonical* slug field is itself inconsistent: `northshore` vs `north_shore`.
  This is the seed of the whole territory-normaliser problem — the map has to
  bridge formats partly because the source-of-truth slug isn't uniform.
- **Fix:** pick one slug convention, migrate the 13 territory docs, and align
  `TERRITORY_DATA`. Small (13 docs) but foundational — do before 2.1/2.2.

---

## Tier 3 — Enum value drift (DT-processing correctness)

Status/action enums stored in mixed casing/slug form. This is the class behind
the DT-processing-status bugs (#454/#456/#460): a consumer comparing against one
spelling silently misses the other.

| Field | Shapes (counts) |
|-------|-----------------|
| `downtime_submissions.responses.project_N_action` | snake_slug 104 / flat_lower 100 |
| `downtime_submissions.responses.sphere_N_action` | snake_slug 27 / flat_lower 32 |
| `downtime_submissions.responses.status_N_action` | snake_slug 3 / flat_lower 8 |
| `downtime_submissions.projects_resolved[].pool_status` | flat_lower 177 / snake_slug 21 |
| `downtime_submissions.merit_actions_resolved[].pool_status` | flat_lower 158 / snake_slug 8 |
| `downtime_submissions.sorcery_review[].pool_status` | flat_lower 16 / snake_slug 1 |
| `ordeal_submissions.marking.status` | flat_lower 28 / snake_slug 21 |
| `purchasable_powers.prereq.type` (+ `.all[].type`) | flat_lower 765+ / snake_slug 2-6 (near-clean) |

- **Impact:** action/status matching in DT processing and ordeal marking. The
  near-even splits (project_N_action 104/100) are the dangerous ones — neither
  spelling is rare, so any single-spelling comparison is half-wrong.
- **Fix:** decide the canonical enum spelling per field (recommend snake_slug to
  match rule collections), migrate, and add a schema enum so writes can't drift.
  Needs a values-enumeration pass first (what are the actual distinct strings?).

---

## Tier 4 — Schema-shape drift (few docs, schema-guard gaps)

Low document counts, but each is a latent render/crash risk where a consumer
assumes one shape.

- `downtime_submissions.st_narrative.letter_from_home` — object (29) / string (2)
- `downtime_submissions.st_narrative.touchstone` — object (29) / string (2)
  - Mostly structured objects; 2 docs each hold a bare string. A renderer doing
    `.field` on the object form will read `undefined` on the string form.
- `downtime_submissions._raw.projects[].xp_spend` — string (42) / number (12)
  - XP math on a string silently concatenates or NaNs. Coerce to number.
- `rule_grant.pool_targets` — array (3) / string (1) — one rule_grant doc has a
  scalar where an array is expected; an evaluator iterating it will mis-handle.
- `relationships.history[].fields[].before` / `.after` — string / boolean —
  **likely accept:** this is a polymorphic audit-log value (records arbitrary
  field changes), so mixed type is by design. Flagged for completeness only.

---

## Tier 5 — Identity name drift (matching / attribution, lower urgency)

Name/attribution strings stored as display-name in some docs, lowercased in
others. Cosmetic-to-moderate: affects name-based matching and "who did this"
attribution, but no silent data loss.

- `downtime_submissions.feeding_review.pool_validated_by` / `pool_committed_by` /
  `pool_confirmed_by`, `projects_resolved[].pool_*_by`, `merit_actions_resolved[].pool_committed_by`,
  `st_narrative.territory_reports[].author` — display_name vs flat_lower.
- `st_mods.created_by.discord_id` / `st_mod_audit.created_by.discord_id` —
  field named `discord_id` but holds an actual snowflake in ~9 cases and a
  kebab-slug in ~88. Misnamed + fragmented; ST attribution only.
- `tickets.submitted_by` — display_name (41) / flat_lower (10).
- **Fix:** lower priority. Where these are meant to be identity FKs, migrate to a
  stable id (player_id / ObjectId) rather than a name string; otherwise leave.

---

## Recommended sequence

Ordered by impact-per-effort and dependency:

1. **2.3 `territories.slug`** (13 docs) — foundational; uniform slug first.
2. **1.1 `character_id` coercion** — finishes the #497 sibling; small migration,
   removes a silent-drop path. High value.
3. **1.2 `territories.regent_id` / `lieutenant_id`** (~8 values) — player-facing FK.
4. **2.1 / 2.2 territory key residual** — the rescoped **#496**; gated on fixing
   CSV import write-side first (Block 1) or the 79 keys regrow.
5. **Tier 3 enum drift** — one values-enumeration pass, then per-field
   canonicalise + schema enum. Biggest correctness win for DT processing.
6. **Tier 4 schema-shape** — cheap one-off coercions + schema guards.
7. **Tier 5** — opportunistic, when touching those collections anyway.

Every fix is: pick canonical shape → migrate (read-only audit script → dry-run
migration → `--apply` with backup) → tighten schema so it can't regrow →
delete the read-time normaliser. The schema-guard step is what makes hygiene
*stick* instead of regrowing (the CSV-import lesson from #496).

---

## Artifacts

- Audit engine (re-runnable): `server/scripts/audit-data-hygiene.js`
- Full JSON: `st-working/audit/data-hygiene-2026-06-03.json`
- Related issues: #496 (territory keys, rescoped), #497 (cycle_id, done)
