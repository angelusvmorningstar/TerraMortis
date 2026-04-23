# Story: Status Unification — covenant standings as a unified object

## Status: draft

## Story

**As an** ST maintaining character data,
**I want** covenant standing data held in a single unified object keyed by full covenant name,
**so that** every consumer reads one field with consistent keys and there is no branching between "own covenant" and "diplomatic standings."

## Background

Covenant status is currently split across two fields:

- `status.covenant` (integer 0-5) — the character's standing in their OWN covenant
- `covenant_standings` (object, short-label keys: "Crone", "Carthian", "Lance", "Invictus") — diplomatic standings with OTHER covenants

This forces every consumer to branch: "is this the character's own covenant? read `status.covenant`; else look up `covenant_standings[shortKey]`." Short keys in `covenant_standings` do not match the full covenant names used in `c.covenant`, requiring a separate mapping table. A server-side migration script run previously attempted to remove own-covenant duplicates from `covenant_standings`, but the underlying split schema was not resolved.

Live data audit (see `specs/stories/status-unification-analysis.md`): 14 of 31 characters have their own covenant duplicated inside `covenant_standings` with values that differ from `status.covenant`. The integer `status.covenant` is authoritative; those duplicates are stale orphans that are never displayed.

### Proposed new shape

```json
{
  "covenant": "Circle of the Crone",
  "status": {
    "city": 2,
    "clan": 2,
    "covenant": {
      "Carthian Movement": 0,
      "Circle of the Crone": 3,
      "Invictus": 1,
      "Lancea et Sanctum": 0,
      "Ordo Dracul": 0
    }
  }
}
```

- `status.covenant` changes from `integer` to `object` keyed by full covenant name
- All five covenants (`COVENANTS` constant) always present, defaulting to `0`
- Own covenant status: `status.covenant[c.covenant]`
- `covenant_standings` field removed entirely
- `_ots_covenant_bonus` remains a runtime computed field, unchanged

### Key constants

```js
const COVENANTS = [
  'Carthian Movement', 'Circle of the Crone',
  'Invictus', 'Lancea et Sanctum', 'Ordo Dracul'
];

const COV_SHORT_TO_FULL = {
  'Carthian': 'Carthian Movement',
  'Crone':    'Circle of the Crone',
  'Invictus': 'Invictus',
  'Lance':    'Lancea et Sanctum',
  'Ordo':     'Ordo Dracul'
};
```

`COV_SHORT_TO_FULL` is needed only in the migration script. After migration, all code uses full names directly.

## Acceptance Criteria

### AC1 — Migration script

`server/scripts/migrate-status-unification.js` exists and is idempotent (safe to run twice).

For each character document:
- Read `status.covenant` (integer) as the own-covenant value.
- Read `covenant_standings` entries and map short keys to full names via `COV_SHORT_TO_FULL`. Skip any entry whose full name matches `c.covenant` (discard stale own-covenant duplicate).
- Write `status.covenant` as a new object with all five COVENANTS as keys, defaulting unmapped entries to `0`. The character's own covenant gets the original `status.covenant` integer value.
- `$unset` `covenant_standings` from the document.
- Logs: count of documents updated, count of `covenant_standings` entries discarded as own-covenant duplicates, count of short-key mappings applied.
- Skips characters whose `status.covenant` is already an object (idempotency guard).

### AC2 — Server schema

`server/schemas/character.schema.js`: `status.covenant` property changed from `{ type: 'integer', minimum: 0, maximum: 5 }` to an object with a fixed set of properties (one per covenant, each integer 0-5). `covenant_standings` top-level property removed.

### AC3 — Server route projection

`server/routes/characters.js` `/status` endpoint projection: `'status.covenant': 1` continues to return the now-object field. No projection change required beyond verifying the field name is unchanged.

### AC4 — `prereq.js` — status resolution

`public/js/data/prereq.js` `_getStatus(char, qualifier)`:
- `if (q === 'covenant')` branch removed; `'covenant'` is no longer a valid qualifier (own-covenant is addressed by full name)
- For any other qualifier: resolve `fullName = COV_FULL[q] || qualifier`; return `char.status?.covenant?.[fullName] || 0`
- The `covenant_standings` fallback is removed entirely
- `COV_FULL` map expanded to include `'ordo': 'Ordo Dracul'` for completeness

### AC5 — `merits.js` — `_getCovStatus`

`public/js/editor/merits.js` `_getCovStatus(c, covShort)`:
- Resolve `fullName` from `COV_SHORT_TO_FULL[covShort] || covShort`
- Return `c.status?.covenant?.[fullName] || 0`
- Remove the `covenant_standings` fallback and the own-covenant branch

### AC6 — `edit.js` — standing editors

`public/js/editor/edit.js` `shCovStandingUp(label)` and `shCovStandingDown(label)`:
- `label` is the short form (e.g. `'Crone'`); resolve to full name via `COV_SHORT_TO_FULL`
- Mutate `c.status.covenant[fullName]` instead of `c.covenant_standings[label]`
- Initialise `c.status.covenant` as the full zero-keyed object if absent

### AC7 — `sheet.js` — covenant strip display and prereq checks

`public/js/editor/sheet.js` covenant strip (line ~1590):
- `covS` built from `COVENANTS.filter(full => full !== c.covenant)` mapped to `{ label: full, status: c.status?.covenant?.[full] || 0 }`
- Display labels remain the short form (derive from `COV_SHORT[full]` for display only)
- Edit mode buttons pass full covenant name to `shCovStandingUp`/`shCovStandingDown` (or pass short label if AC6 handles the mapping — keep consistent)
- Inline prereq check for covenant status (line ~1101-1103): replace `(c.covenant_standings || {})[cov]` lookup with `c.status?.covenant?.[cov] || 0`; own-covenant detection via `cov === c.covenant` (exact full-name match, no fuzzy includes check)

### AC8 — `domain.js` — `effectiveInvictusStatus`

`public/js/editor/domain.js` `effectiveInvictusStatus(c)`:
- Replace any `c.status?.covenant` integer read and any `covenant_standings` lookup with `c.status?.covenant?.['Invictus'] || 0`

### AC9 — `mci.js` — OTS bonus display

`public/js/editor/mci.js`: the OTS oath handler reads `_otsDots` from the pact and writes `c._ots_covenant_bonus`. This does not touch `status.covenant` or `covenant_standings` directly — verify no references exist and no change is required.

### AC10 — `csv-format.js` — CSV export

`public/js/editor/csv-format.js` `charToRow`:
- Covenant standings section (lines ~193-205): for each `cov` in `COV_ORDER`, read `c.status?.covenant?.[cov] || 0` for the standing value
- Own-covenant detection: `c.covenant === cov` (full-name exact match)
- Remove the `c.covenant_standings?.[short] || c.covenant_standings?.[cov]` double-fallback lookup
- `Covenant Status` column (line ~191): `Math.max(c.status?.covenant?.[c.covenant] || 0, c._ots_covenant_bonus || 0)`

### AC11 — `suite/status.js` — status tab rendering

`public/js/suite/status.js` personal status summary (lines ~276-299):
- Own covenant pip: `covV = (c.status?.covenant?.[c.covenant] || 0) - (c._ots_covenant_bonus || 0)`
- "Other covenant standings" secondary line: iterate `COVENANTS.filter(cov => cov !== activeChar.covenant)`, read `c.status?.covenant?.[cov] || 0`, filter to non-zero entries for display
- Replace `activeChar.covenant_standings || {}` lookup and `ownCovLabel`/`COV_SHORT` mapping entirely

ST mode covenant bracket section (lines ~308-315):
- Per-character covenant value: `c.status?.covenant?.[cov] || 0` — `cov` is the full name used as loop variable

### AC12 — `suite/tracker.js` — prestige leaderboard

`public/js/suite/tracker.js` `renderPrestige` (line ~115):
- `const cov = c.status?.covenant?.[c.covenant] || 0` (character's own covenant status by full name)
- Remove `st.covenant || 0` read

### AC13 — `admin/city-views.js`

`public/js/admin/city-views.js`: run a targeted grep for `status.covenant` and `covenant_standings` references. Based on current code there are no direct reads — confirm and add a verification note. No code change expected.

### AC14 — `editor/export-character.js` — print serialisation

`public/js/editor/export-character.js` `serialiseForPrint`:
- `stats.status.covenant`: change from `Math.max(st.covenant || 0, c._ots_covenant_bonus || 0)` to `Math.max(st.covenant?.[c.covenant] || 0, c._ots_covenant_bonus || 0)`

### AC15 — `editor/print.js` — print preview

`public/js/editor/print.js`: `d.stats.status.covenant` (line ~106) is consumed from the serialised print data; this already reads the pre-resolved integer from `serialiseForPrint`. No change required after AC14 is correct.

### AC16 — `print/page1.js` — PDF generation

`public/js/print/page1.js` (lines ~261-272):
- `covStatus = (data.stats.status && data.stats.status.covenant) || 0` — this reads the pre-resolved integer from `serialiseForPrint`. No change required if AC14 produces the correct integer.

### AC17 — `server/scripts/ingest-excel.js` — Excel import

`scripts/ingest-excel.js`:
- Remove the `c.covenant_standings = {}` initialisation (line ~122) and the `covenant_standings` population loop (lines ~168-174)
- When writing covenant status from the Excel import, write into `c.status.covenant[c.covenant]` after initialising the full zero-keyed object: `c.status.covenant = Object.fromEntries(COVENANTS.map(cv => [cv, 0])); c.status.covenant[c.covenant] = covS;`
- Diplomatic standings from Excel (if any) should be written into the corresponding full-name keys of the same object

### AC18 — `admin.js` — new character template

`public/js/admin.js` new character template (line ~726):
- Replace `status: { city: 0, clan: 0, covenant: 0 }, covenant_standings: {}` with `status: { city: 0, clan: 0, covenant: Object.fromEntries(COVENANTS.map(cv => [cv, 0])) }`

### AC19 — Test fixtures

`tests/feat-13-14-15-ots.spec.js`:
- `OTS_CHAR` fixture and any other character fixtures that declare `status.covenant` as an integer: change to object form. Example: `'status': { city: 0, clan: 1, covenant: { 'Invictus': 3, 'Carthian Movement': 0, ... } }`
- Any assertion on `st.covenant || 0` in the prestige test: update to `c.status?.covenant?.[c.covenant] || 0` shape
- `tests/feat-16-17-fix44-tracker-feeding.spec.js`: grep for `status.covenant` or `covenant_standings` and update any fixtures found

### AC20 — Zero legacy references

After all tasks complete: `grep -r 'covenant_standings' public/js/ server/` returns zero results. `grep -r '"covenant":\s*[0-9]' data/` and the live database have no documents with `status.covenant` as an integer.

## Out of Scope

- Ordo Dracul is excluded from the covenant standings strip in the current sheet UI (only 4 covenants shown). This story keeps that behaviour; whether to add Ordo Dracul to the strip is a separate decision.
- `suite/import.js` CSV import — the `covenant_standings` array assembled there (lines ~233-237) feeds into a legacy import path. Updating that import path to write the new shape is a follow-up once the migration is complete and the sheet upload feature is reviewed.
- `scripts/convert-lady-julia.js` and `scripts/validate-chars.js` — these are utility scripts, not production code. Update them as a housekeeping step but do not block release on them.

## Tasks / Subtasks

- [ ] Task 1: Migration script (AC1)
  - [ ] Create `server/scripts/migrate-status-unification.js`
  - [ ] Connect to `MONGODB_URI` database
  - [ ] For each character: check if `status.covenant` is already an object (skip if so)
  - [ ] Build new `status.covenant` object: all five COVENANTS keyed, own covenant from existing integer, others from `covenant_standings` short-to-full mapping (excluding own-covenant entry)
  - [ ] `$set` `status.covenant` to new object, `$unset` `covenant_standings`
  - [ ] Log summary: docs updated, orphan own-covenant entries discarded, short-key mappings applied
  - [ ] Test idempotency: run twice, second run should log 0 updates

- [ ] Task 2: Schema update (AC2)
  - [ ] `server/schemas/character.schema.js`: change `status.covenant` from integer to object with five fixed properties (one per COVENANTS entry, each integer 0-5, minimum 0, maximum 5, additionalProperties false)
  - [ ] Remove `covenant_standings` from top-level properties

- [ ] Task 3: `prereq.js` (AC4)
  - [ ] Rewrite `_getStatus` to read `char.status?.covenant?.[fullName] || 0` for all covenant qualifiers
  - [ ] Remove `covenant_standings` fallback
  - [ ] Add `'ordo': 'Ordo Dracul'` to `COV_FULL`
  - [ ] Remove the own-covenant branch (no longer needed — unified object handles both cases)

- [ ] Task 4: `merits.js` (AC5)
  - [ ] Rewrite `_getCovStatus` to resolve full name and read from `c.status?.covenant?.[fullName] || 0`
  - [ ] Remove `covenant_standings` fallback

- [ ] Task 5: `edit.js` — standing mutation handlers (AC6)
  - [ ] In `shCovStandingUp` and `shCovStandingDown`: resolve `label` to full name via `COV_SHORT_TO_FULL`
  - [ ] Mutate `c.status.covenant[fullName]`; initialise the full zero-keyed object if absent

- [ ] Task 6: `sheet.js` — covenant strip and inline prereq (AC7)
  - [ ] Rebuild `covS` array from `COVENANTS.filter(full => full !== c.covenant)` with full-name keys
  - [ ] Derive display short label from a local `COV_SHORT` map for rendering only
  - [ ] Update edit-mode button calls to pass the correct name form (consistent with AC6)
  - [ ] Update own-covenant detection in inline prereq check: `cov === c.covenant` exact match

- [ ] Task 7: `domain.js` — `effectiveInvictusStatus` (AC8)
  - [ ] Replace integer read with `c.status?.covenant?.['Invictus'] || 0`

- [ ] Task 8: `csv-format.js` (AC10)
  - [ ] Covenant standings loop: read from `c.status?.covenant?.[cov] || 0`
  - [ ] Own-covenant guard: `c.covenant === cov`
  - [ ] Covenant Status column: `Math.max(c.status?.covenant?.[c.covenant] || 0, c._ots_covenant_bonus || 0)`

- [ ] Task 9: `suite/status.js` (AC11)
  - [ ] Personal status row: own covenant pip reads from `c.status?.covenant?.[c.covenant]`
  - [ ] Other standings row: iterate `COVENANTS`, exclude own, filter non-zero, display short label
  - [ ] ST bracket section: per-character value from `c.status?.covenant?.[cov]`

- [ ] Task 10: `suite/tracker.js` (AC12)
  - [ ] `renderPrestige`: `const cov = c.status?.covenant?.[c.covenant] || 0`

- [ ] Task 11: `export-character.js` (AC14)
  - [ ] `stats.status.covenant`: `Math.max(st.covenant?.[c.covenant] || 0, c._ots_covenant_bonus || 0)`

- [ ] Task 12: `ingest-excel.js` (AC17)
  - [ ] Remove `covenant_standings` initialisation and population
  - [ ] Write covenant status into new object shape on `c.status.covenant`

- [ ] Task 13: `admin.js` new character template (AC18)
  - [ ] Replace `status.covenant: 0` and `covenant_standings: {}` with full object initialisation

- [ ] Task 14: Test fixtures (AC19)
  - [ ] Update `OTS_CHAR` and any other fixtures in test files to use object-form `status.covenant`

- [ ] Task 15: Zero-reference verification (AC20)
  - [ ] `grep -r 'covenant_standings' public/js/ server/` — confirm zero matches
  - [ ] `grep -r 'covenant_standings' tests/` — confirm zero matches
  - [ ] Confirm `server/schemas/character.schema.js` no longer lists `covenant_standings`
  - [ ] (Optional cleanup) Update `scripts/convert-lady-julia.js` and `scripts/validate-chars.js`

## Dev Notes

### Migration read strategy

`status.covenant` on existing documents is a BSON int32. The idempotency guard `typeof doc.status.covenant === 'object'` in Node/MongoDB driver is reliable: an integer arrives as a JS number, an embedded document arrives as a JS object.

### Own-covenant detection after migration

Before: required a fuzzy `includes` check because short keys in `covenant_standings` didn't match `c.covenant`.
After: `c.covenant === cov` exact string equality — both sides are full covenant names.

### OTS bonus is unaffected

`c._ots_covenant_bonus` is computed at runtime in `server/routes/characters.js` and in `mci.js` by summing pact dots — it never reads `status.covenant` or `covenant_standings`. The effective display value is `Math.max(status.covenant[c.covenant], _ots_covenant_bonus)` unchanged.

### `suite/status.js` ST bracket display

In ST mode, the covenant bracket sections loop over each covenant and filter characters by `c.covenant === cov` (full name). The per-character value becomes `c.status?.covenant?.[cov] || 0`. The OTS deduction `(c._ots_covenant_bonus || 0)` applies only in the own-covenant bracket, same as before.

### `sheet.js` covenant strip

The strip currently shows four covenants (Carthian, Crone, Invictus, Lance), excluding Ordo Dracul and the character's own covenant. After this story, the strip iterates `COVENANTS` (all five) and excludes `c.covenant`. Whether to show Ordo Dracul entries in the strip for non-Ordo characters is out of scope — keep the existing filter for now by using `COVENANTS` and the exclusion handles it.

Edit-mode buttons pass labels to `shCovStandingUp`/`shCovStandingDown` in `edit.js`. Either pass the full name and resolve in `edit.js`, or keep passing the short label and resolve in `edit.js` (AC6 already handles this). Do not resolve in both places.

### `export-character.js` and `print.js` / `page1.js`

`serialiseForPrint` resolves the integer for `stats.status.covenant`. `print.js` and `page1.js` consume this pre-resolved integer — they do not read the character object directly. So only `export-character.js` (Task 11) needs updating; the two print consumers require no change.

### `suite/import.js`

The `covenant_standings` array built there feeds an existing CSV import path for the player suite. This path is not part of the regular edit workflow and is marked out of scope. Leave a `// TODO: update to new status.covenant shape` comment on those lines.

### Server-side `/status` projection

`'status.covenant': 1` in the MongoDB projection already returns the full sub-document when `status.covenant` is an object — no projection syntax change needed.

### Running the migration

```bash
cd server
MONGODB_URI="<connection string>" node scripts/migrate-status-unification.js
```

Run against `tm_suite` first, verify output, then run against `tm_suite` (production). The idempotency guard makes a double-run safe.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-21 | 1.0 | Initial draft | Bob (SM / claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
