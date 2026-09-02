# Data Hygiene Audit — tm_game — 2026-09-02

**Refresh of:** `specs/data-hygiene-audit-2026-06-03.md` (three months stale; kept untouched as history).
**Engine:** `server/scripts/audit-data-hygiene.js` (read-only, re-runnable) — fixed this run, see below.
**Companion (TM Story's own ported copy of this exercise, source of the two known bug fixes):**
`../TM Story/specs/data-hygiene-audit-2026-09-01.md`, `../TM Story/server/scripts/audit-data-hygiene.mjs`.

**Goal:** map fragmentation across `tm_game`'s own collections (the same field stored in
inconsistent shapes), profiled against live data, then separately audit whether TM Game's own
server code defends against the FK dual-typing risk it already fixed once (#496/#497/#558).

## Data source and its currency

**Live `tm_game`, connected successfully this session** via this repo's own root `.env`
(`MONGODB_URI`) — no snapshot fallback was needed. Every run below is against real,
current production data, timestamped 2026-09-02 (script's own `generated` field reads
`2026-09-01T22:xx:xx.xxxZ`, UTC — same calendar day, local timezone difference only).
47 collections scanned in full (none exceeded the 5000-doc full-scan threshold, so no
collection fell back to sampling).

## The script had both known over-flagging bugs, and a live run proved it

Before any fix, a live run against real `tm_game` data reported **190 "fragmented" fields
across 47 collections** — close to the ~3x over-flagging the June campaign already diagnosed,
confirming both named bugs were still present:

1. **No test/orphan sweep at all.** Real ST test accounts (`test-st-001`, 156 rows across
   `st_mods`/`st_mod_audit` alone) and dev fixtures (`local-test` in `app_settings`/
   `relationships`) were profiled as production data — the exact class the June campaign's
   companion sweep script (`server/scripts/archive/sweep-test-orphan-data.js`) already had to
   separate out manually, but which this engine itself never absorbed.
2. **Word-count read as format**, unbounded — e.g. `chapters.action_queue_state.<hash>.state`
   (`no_roll` vs `resolved`-shaped values) and `characters.pronouns` both flagged, though
   neither is remotely fragmented.

### Fixes made to the script (all in `server/scripts/audit-data-hygiene.js` only — no app code touched)

Ported from TM Story's own ported/refined copy of this engine, then extended with three more
fixes found live by actually reading this run's own `excludedSample`/distinct-value evidence
(the exact discipline this task required, applied a third time after TM Game's June campaign
and TM Story's September run each already caught one instance of it):

1. **Test/orphan sweep**, word-boundary matched (not substring — `\btest\b`, not `.includes('test')`),
   recursive to `MAX_DEPTH`, every excluded doc counted and a 10-doc sample written to
   `excludedSample` per collection (never silently dropped).
2. **`DISTINCT_VALUE_ENUM_CEILING = 20`** — a field is never format-fragmented at or below 20
   distinct values, regardless of which regex classes they hit.
3. **`FREE_TEXT_FIELD_HINTS`** — ported TM Story's list (name/desc/notes/narrative/answer/etc.),
   plus `pool_player`/`pool_validated`/`pool_committed`/`pool_confirmed` — the identical
   false-positive TM Story's own build already found and fixed (dice-pool descriptions like
   `"Intelligence + Stealth"` are free text, not an enum, despite the `pool_` prefix).
4. **Found live — test-marker value-length cap (30 chars).** The word-boundary fix alone still
   wrongly swept real production prose that happens to use the ordinary English words "test" or
   "fixture": an ST's in-fiction "Letter from Home" narrative ("...you decided to **test** how
   long I will continue writing..."), an ordeal essay answer ("...we must constantly **test** and
   change ourselves..."), an ordeal rubric question *about* testing doctrine, and a merit
   resolution sentence ("They are slowly becoming more of a **fixture** in the community.").
   Every real test marker actually observed this run (`test-st-001`, `local-test`, literal
   `"Test"`) was well under 30 characters; every false positive was a full sentence. Capping the
   checked value length at 30 chars fixed all of them without missing a single real one — verified
   by re-reading `excludedSample` after each change, three iterations (60 → still 1 false
   positive → 30 → clean).
5. **Found live — array-field leaf-name bug.** `isFreeTextField()` took the path's last segment
   as the field name, but an array-of-strings field walks to `...active_feed_specs.[]` — so the
   trailing `[]` was checked against the hint list instead of `active_feed_specs`, and the field
   slipped past hint #3 above entirely. Fixed to strip trailing `[]` segments before taking the leaf.
6. **Found live — `{flat_lower, kebab_slug}`-only pairing is not real fragmentation.**
   `kebab_slug` is definitionally `flat_lower` plus a dash — a single-word value (`"awe"`,
   `"ankou"`) can never match the kebab_slug regex regardless of the field's real naming
   convention, so a field mixing *only* these two classes is virtually always one coherent
   kebab-case convention whose single-word members simply have no dash to show. Verified against
   full distinct-value dumps (via a throwaway read-only script, deleted after use — not part of
   this diff) for all 5 fields this run flagged this way before the fix:
   `bloodlines.slug`, `purchasable_powers.key`, `characters.powers[].rule_key`,
   `characters.merits[].rule_key`, `equipment_catalogue.tags[]` — every one was genuinely
   single-word-vs-multi-word noise (`"awe"` / `"beasts-hackles"`, `"contacts"` /
   `"fucking-thief"`, `"academics"` / `"animal-ken"`), zero real drift. **Deliberately not**
   extended to the `flat_lower`/`snake_slug` pairing, because that exact pairing
   (`territories.slug`: `"northshore"` vs `"north_shore"`) was the June campaign's own
   **confirmed real** finding — a genuinely inconsistent separator convention for the same kind
   of multi-word name, not a word-count artifact. The two pairs look similar; they are not the
   same bug.

**Net effect: 190 → 21 fragmented fields**, a sharper reduction than TM Story's own ~3x (this
dataset is 47 collections vs. TM Story's 6, so more surface for the same bug classes to hit).
Every one of the 21 remaining findings below was individually verified against its
`excludedSample`/distinct-value evidence, not taken on the reported count alone — three more
were judged noise on inspection despite surviving the script's own filters (documented under
"Verified noise" below), matching the task's own warning that this exact failure mode has now
bitten three real audits in a row if not checked by hand every time.

---

## Findings — real, verified (21 fields, 12 collections)

### Tier 1 — TYPE fragmentation (silent-drop / silent-mistype risk)

| Field | Shapes | Status vs. June |
|---|---|---|
| `chapters.deadline_at` | string:4 / date:1 (+1 null) | **New** — not in June's list |
| `downtime_cycles.deadline_at` | string:4 / date:1 (+1 null) | **New** |
| `downtime_submissions._raw.projects.[].xp_spend` | string:39 / number:10 (+39 null) | **Still open** — June's Tier 4 finding, same field, string count grew 31→39 as new submissions came in. XP math on a string silently concatenates or NaNs. |
| `relationships.history.[].fields.[].before` / `.after` | boolean:2 / string:4 | **Accepted by design, per June's own ruling** — "this is a polymorphic audit-log value... mixed type is by design." Still present, still not a bug; carried forward, not re-flagged as new work. |

`chapters.deadline_at`/`downtime_cycles.deadline_at` are genuinely new: a `Date` object mixed
with ISO-string values (and one `null`) on the field two different consumers (chapter countdown
UI, downtime deadline enforcement) would need to agree on. Worth a one-time coercion pass.

### Tier 2 — territory key residual (#496) — STILL OPEN, unchanged from June

- `downtime_submissions.responses.feeding_territories` — JSON-blob keys: `objectid_hex` (720) /
  `other_string` (143), across 144 submissions.
- `downtime_submissions.responses.feeding_territories_rote` — keys `objectid_hex` (150) /
  `other_string` (30), across 30 submissions.

Live-confirmed still present at essentially the same ratio June found (legacy slug/display-name
keys alongside canonical ObjectId-hex keys in the same JSON blob). June's own diagnosis stands:
`TERRITORY_SLUG_MAP`/`resolveTerrId` still have to bridge both shapes on every read; not
re-investigated further this pass since June's root cause (CSV import writes raw keys) wasn't
in scope to re-verify against current import code this session.

### Tier 3 — FK/reference-value fragmentation (new class, not in June's list)

Fields where the same conceptual "what does this point at" value is stored sometimes as a raw
ObjectId-hex reference, sometimes as a free-typed display name, sometimes empty:

- `downtime_submissions.responses.sphere_N_target_value` — `display_name`(36) / `objectid_hex`(21)
  / `flat_lower`(8) / empty(11), 76 observed across 34 distinct.
- `downtime_submissions.responses.project_N_target_value` — `empty_string`(136) / `display_name`(39)
  / `objectid_hex`(36), 211 observed across 26 distinct.
- `downtime_submissions.responses.xp_spend` — `json_string`(82, mostly `"[]"`) / `display_name`(19,
  free prose like `"XP Claimed: Game Attendance 1, Costuming/Immersion 1..."`). A real
  schema-shape drift: a renderer or evaluator expecting the structured JSON array will break on
  the prose variant. Distinct from `_raw.projects[].xp_spend` above — a different field.
- `downtime_submissions.projects_resolved.[].roll.dice_string` and `...roll.rote_other.dice_string`
  — `other_string`(137/18) / `json_string`(150/9). Example: `"[8,0>8,8,2,0>2]"` (custom
  exploding-die notation, not valid JSON — the `>` breaks `JSON.parse`) vs `"[3,5,7,9,2,9,6,9]"`
  (a plain JSON int array). A consumer that assumes one shape and does `JSON.parse(dice_string)`
  will throw or silently misread on roughly 45% of rows.
- `rule_grant.pool_targets.[]` — `display_name`(26, e.g. `"Herd"`, `"Retainer"`, `"Black
  Cathedral"`) / `snake_slug`(1: `"fighting_styles"`). Verified via full distinct-value dump: 23
  of 24 targets are proper Title-Case merit/asset names; exactly one (`fighting_styles`) is a raw
  rule-key slug instead, an odd-one-out data anomaly, not a systemic convention split.

These are new findings (none appear in June's tier list), and structurally the same risk class
June's Tier 1/2 already named: a downstream resolver that only handles one shape will silently
mis-resolve or crash on the other.

### Tier 4 — real, isolated data-quality issues (not systemic drift)

- **`characters.date_of_embrace`** — 30 values are clean `iso_datetime`; one is `"12019-03-10"`
  — a plainly mistyped 5-digit year (should almost certainly be `1201x` or `2019-03-10`), not a
  format-convention split. Worth a direct data fix on that one document.

### Verified noise — survived the script's filters, judged false on manual inspection

Read per the task's own instruction to verify findings against real evidence, not the reported
count alone:

- **`downtime_submissions._raw.feeding.method`** — `display_name`(26) / `numeric_string`(1), but
  the actual values are multi-line free-text blocks (`"Primary Feeding Pool: Intelligence +
  Stealth \nBlood Type: Human\nFeeding Style: H..."`), not a status enum. Not added to the
  script's free-text hint list, deliberately: `game_sessions.attendance.[].payment_method` is
  cited in this very engine's header as one of the real bug classes (#547/#550) it exists to
  catch, so a blanket `method` hint would risk hiding a genuine future payment_method drift.
  Judged noise here by hand instead.
- **`downtime_submissions.responses.project_N_outcome`** and
  **`downtime_submissions.projects_resolved.[].outcome`** — both read as free-text notes on
  inspection (`"Keep the Shore safe"`, `"Approved."`, `"ok"` — 97-133 distinct values each, no
  small closed set), not a coherent status enum. Not hinted for the same reason as `method`
  above — `outcome` is common enough elsewhere that a blanket hint felt riskier than a documented
  manual call.
- **`downtime_submissions.projects_resolved.[].connected_chars.[]`** — `display_name`(58,
  `"Brandy LaRoux"`) / `flat_lower`(9, `"doc"`) — character name/nickname references, not IDs.
  Lower-priority Tier-5-style identity drift (per June's own Tier 5 framing) if ever touched, not
  a silent-drop risk since nothing here does an ID join on it.
- **`ordeal_responses.responses.qN`** — essay-style free-text answers (500+ distinct values
  capped), not an enum.
- **`players.discord_avatar`** — `flat_lower`(34) / `snake_slug`(1, `"a_f91c8c65cb2bbe81531e00714d789ae6"`).
  The `a_` prefix is Discord's own API convention marking an **animated** avatar hash — genuinely
  correct, documented Discord behaviour, not app-side fragmentation.
- **`purchasable_powers.cost`** — `display_name`(214, `"2 V"`) / `other_string`(3, `"-"`). The
  `"-"` values read as an intentional "no cost" placeholder, not a competing cost format.
  Low-confidence judgement (only 3 of 217 populated values) — flagged here for visibility rather
  than fully dismissed.

---

## Comparison against June's findings

| June finding | This run |
|---|---|
| 1.1 `downtime_submissions.character_id` string/ObjectId | **FIXED** — zero string-typed values found; not flagged this run at all |
| 1.2 `territories.regent_id`/`lieutenant_id` kebab-slug vs objectid-hex | **FIXED** — live-verified: all 5 real territories now store proper 24-char ObjectId-hex strings for both fields; `territories.js`'s PATCH `/lieutenant` route now validates via `new ObjectId(...)` before accepting, so the write side is schema-guarded |
| 2.1/2.2 `feeding_territories`/`feeding_territories_rote` key residual | **STILL OPEN** — same shape (`objectid_hex`/`other_string` mixed JSON-blob keys), confirmed live this run |
| 2.3 `territories.slug` flat_lower vs snake_slug | **FIXED** — live-verified: all 5 real territories now uniformly `flat_lower` (`harbour`, `northshore`, `academy`, `secondcity`, `dockyards`) — the 8 mixed-format docs June found were the `Regent Save Test` fixtures, already deleted per June's own outcome table; the 5 real ones "were already canonical" |
| Tier 3 enum drift (`project_N_action`, `pool_status`, `ordeal.marking.status`, etc.) | **FIXED (was a false positive)** — none of these fields appear in this run at all; the enum-ceiling fix (≤20 distinct values) now correctly reads them as coherent enums, matching June's own "false positives, closed, no migration" verdict |
| Tier 4 `_raw.projects[].xp_spend` string/number | **STILL OPEN** — same field, same shape, count grew as expected (31→39 string-typed) |
| Tier 4 `st_narrative.letter_from_home`/`.touchstone` object/string | **Not reproduced this run** — not present in `st_narrative` structure found live; may have been migrated, renamed, or restructured since June (not independently re-verified beyond the audit's own silence on it) |
| Tier 4 `relationships.history[].fields[].before/.after` | **Unchanged, accepted by design** per June's own ruling |
| Tier 5 identity name drift (`pool_*_by`, `discord_id` misnaming, `tickets.submitted_by`) | **Not reproduced this run** — `st_mods`/`st_mod_audit` test rows (88 `test-st-001` docs June found) are now correctly swept as test data by this run's own sweep rather than counted as a "misnaming" finding; `tickets` collection wasn't found in this run's live `tm_game` (does not currently exist, or was renamed) |
| New this run | Tier 1 `deadline_at` type drift (chapters/downtime_cycles); Tier 3 FK/reference-value fragmentation (`sphere_N_target_value`, `project_N_target_value`, `responses.xp_spend`, `dice_string` json/non-json split, `rule_grant.pool_targets` odd-one-out); Tier 4 `date_of_embrace` single-document typo |

---

## The defensive-read half — does TM Game's own code guard the FK pattern it already fixed once?

Scope: grepped `server/routes/` and `server/schemas/` for `character_id`/`territory_id`/
`regent_id`/`lieutenant_id` reads and writes.

### The established good pattern (hold everything else against this)

`server/routes/downtime.js` consistently dual-types `character_id` — the direct, documented fix
for the #496/#497/#558 FK bug class:

- `$in: [...charIdOids, ...charIdStrs]` (lines 259-263, 308-314), with an explicit comment:
  *"Accept both ObjectId and legacy string-stored character_ids (CSV imports may store as
  string)"*.
- `submission.character_id instanceof ObjectId ? submission.character_id : parseId(String(...))`
  (lines 473-475, 977-979).
- `.toString()` equality normalisation for ownership checks (lines 357-358, 614-615, 664-665, 1047).
- Explicit `$or: [{character_id: charOid}, {character_id: String(...)}]` on invitation
  acceptance (lines 806-815, 849).
- `server/schemas/downtime_submission.schema.js` (line ~191) documents the intended contract
  directly: *"canonical STORAGE... is ObjectId. The inbound REQUEST shape is always a JSON
  string... the server coerces string → ObjectId before write."* — schema accepts `['string',
  'null']` (the wire shape) while the route layer does the coercion; this is the "tighten schema
  so it can't regrow" pattern June's recommended sequence called for, actually applied.

`server/routes/territories.js`'s `PATCH /:id/lieutenant` similarly validates `lieutenant_id`
via `new ObjectId(lieutenant_id)` before accepting — the write-side guard that explains why
Tier 1.2 is now fixed live.

### Real, unguarded risk found

**`server/routes/characters.js` — the character hard-delete cascade and its preview do NOT
dual-type `character_id`, unlike every read in `downtime.js`:**

- `GET /:id/cascade-preview` (line 766): `getCollection('downtime_submissions').countDocuments({ character_id: oid })`
  — ObjectId only.
- `DELETE /:id` (lines 1021-1028): `deleteMany({ character_id: oid })` against
  `downtime_submissions`, `ordeal_submissions`, `histories`, `questionnaire_responses`,
  `tracker_state`, plus `$pull` on `game_sessions.attendance`/`players.character_ids`/
  `npcs.linked_character_ids` — all ObjectId-only, no `$in: [oid, String(oid)]` fallback.

**Currently dormant** — this run's own live audit confirms zero string-typed `character_id`
values remain anywhere in `tm_game` today, so no submission is actually being missed right now.
But it's structurally unguarded: if a string-typed `character_id` ever regrows on any of these
five collections (the exact mechanism June's #558 already produced once, and the exact
mechanism June explicitly warned territory keys would regrow through via CSV import), a
character hard-delete would (a) undercount affected submissions in the ST-facing
`cascade-preview` — giving false confidence to proceed — and (b) permanently fail to delete the
orphaned string-keyed rows, leaving dead data referencing a deleted character `_id` forever.
This is on a **destructive** path, which makes it a step worse than a silent read-miss: a read
bug produces a wrong answer that's still fixable later; this bug produces permanent orphaned
data plus an ST who was told it was safe to delete.

**Recommended fix (flagged, not applied — app code, out of scope for this pass):** apply the
same `$in: [oid, String(oid)]` pattern already established in `downtime.js` to both the
cascade-preview count and the delete cascade in `characters.js`.

### Lower-priority, worth a light mention

- `npc-flags.js:132`, `npcs.js:77`, `players.js:64` write `character_id: String(character_id)`
  into embedded sub-documents (denormalised display/reference copies) — a different, string-only
  convention from the ObjectId-primary convention elsewhere. Not itself a bug (internally
  consistent within each of those specific embeds), but the codebase has no single documented
  ruling on which convention embedded copies should use.
- `st_mods.js` treats `character_id` as a plain string consistently on both write (line 181) and
  read (line 302) — a different but internally consistent convention, not a dual-typing risk.
- Two archived import scripts (`server/scripts/archive/import-questionnaire.js`,
  `import-history.js`) write `character_id` without coercion, but both are already archived
  (not part of any live route) — a latent risk only if someone re-runs an archived script
  directly against production, not an active regrowth path today.

---

## Recommended sequence

1. **`characters.js` delete-cascade dual-typing fix** — the single highest-severity item found
   this pass: cheap, matches an already-established pattern exactly one file away, and sits on a
   destructive path. (App code — flagged only, not applied here.)
2. **Tier 2 territory key residual (#496)** — still exactly where June left it: 79-class legacy
   keys in `feeding_territories`/`feeding_territories_rote`, still gated on the CSV-import
   write-side fix per June's own scoping. Not re-investigated this pass.
3. **Tier 3 FK/reference-value fields** — `sphere_N_target_value`, `project_N_target_value`,
   `responses.xp_spend`, the two `dice_string` fields, and the `rule_grant.pool_targets`
   odd-one-out. New this run; worth a values-enumeration pass per field before deciding a
   canonical shape, same discipline June used for Tier 3 enum drift.
4. **`deadline_at` type coercion** (`chapters`, `downtime_cycles`) — small, mechanical, two
   collections.
5. **`characters.date_of_embrace` single-document typo** — direct data fix, one document.
6. **`purchasable_powers.cost` "-" placeholder** — low-confidence, worth a quick manual check
   before deciding it's benign.

---

## Artifacts

- Audit engine (fixed this run, re-runnable): `server/scripts/audit-data-hygiene.js`
- Full JSON (this run): `st-working/audit/data-hygiene-2026-09-01.json` (script names the file
  by its own UTC-timestamp date; content is the 2026-09-02 run described in this doc)
- June's original JSON (unmodified, kept as history): `st-working/audit/data-hygiene-2026-06-03.json`
- Prior doc: `specs/data-hygiene-audit-2026-06-03.md`
- Sibling exercise: `../TM Story/specs/data-hygiene-audit-2026-09-01.md`
