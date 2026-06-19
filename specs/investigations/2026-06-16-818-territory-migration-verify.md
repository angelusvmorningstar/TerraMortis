# Investigation: #818 — Verify #496 territory-key migration ran on live `tm_suite`

- **Date:** 2026-06-16
- **Issue:** #818 (verify the #496 territory-key migration actually ran on live; schema now rejects slugs)
- **Type:** read-only data verification (no code change, no data change)
- **Verdict:** **Migration confirmed applied.** No slug-keyed / slug-valued territory residue remains in live `tm_suite`. The schema's OID-only constraint is consistent with the live data. No action required.

## Concern being tested

The 496.4 story noted its live `--apply` was a pre-merge gate that *may not have been run* ("toMigrate: 60 on live DB"). If un-migrated slug-keyed territory fields still existed, OID-only readers would silently return null/0 for them and the tightened schema (`^[a-f0-9]{24}$`) would 400 on re-save. This investigation checks whether any such residue exists.

## Method

Read-only queries of live `tm_suite` (MongoDB Atlas). Canonical territory OIDs:
`academy 69d9e54b…bea7`, `harbour 69d5dc6a…97c6`, `dockyards 69d9e54c…bea9`, `secondcity 69d9e54c…bea8`, `northshore 69d9e54b…bea6`.

## Findings

### 1. Cycle-level cross-doc FKs — OID-keyed (migrated)
`downtime_cycles.confirmed_ambience`, `discipline_profile`, and `territory_pulse` keys are all 24-hex ObjectIds across **Downtime 2, 3, 4**. (DT1 has none of these fields — predates them.) ADR-002's 2026-05-05 baseline recorded DT2 as *slug-keyed* here; it is now OID-keyed, so the rekey ran.

### 2. Submission key-based fields — no slug residue
Regex scan across **all** `downtime_submissions` for legacy slug-variant keys (`the_academy`, `the_harbour`, `the_dockyards`, `the_second_city`, `the_north_shore`, and legacy `the_city_harbour`/`the_docklands`/`the_northern_shore`) in `responses.feeding_territories`, `feeding_territories_rote`, and `influence_spend`:
- **0 documents.**
Spot-confirmed on the oldest structured cycle (DT2): keys are OIDs plus the legitimate `the_barrens_no_territory_` sentinel (Barrens has no OID by design; `TERRITORY_SLUG_MAP` resolves it to null).

### 3. Submission value-based fields — no slug residue
Regex scan for bare-slug values (`^(academy|harbour|dockyards|secondcity|northshore)$`) in `project_{1-4}_ambience_target`, `project_1_territory`, `project_1_target_terr`, `sphere_1_territory`:
- **0 documents.** Consistent with the schema's OID-only constraint on these fields.

### 4. DT1 (CSV-era) — not residue, by design
DT1 submissions have **empty `responses` ({})**; DT1 is the CSV-imported cycle and its territory data lives in `_raw.feeding.territories` (display-name keys), read via the dedicated legacy `_raw` fallback path in `_getSubFedTerrs` / `_normTerrKeys`. ADR-002 Q4 deliberately left legacy submission `_raw` intact; the legacy reader handles it. This is expected and correct, not un-migrated residue in the OID-keyed fields.

### Other territory-keyed collections
- `territory_residency`: dormant (0 docs, per ADR-002) — nothing to migrate.
- `tracker_state`: no territory reference (per ADR-002) — N/A.

## Conclusion & recommendation

- **The #496 migration is applied on live `tm_suite`.** Every OID-keyed/valued territory field is OID; zero slug residue in `downtime_submissions` (key- or value-based) or `downtime_cycles`. Code assumptions and the tightened schema match the data.
- **No action required.** Recommend closing #818 as verified.
- DT1's `_raw`-based legacy data is correctly served by the legacy reader path and is out of scope for the OID migration (ADR-002 Q4).

## Out of scope (noted, not actioned)

- Test residue in `territories` (~16 `Regent Save Test`) and `downtime_cycles` (2 `Test Cycle`) — tracked separately in **#823**. Unrelated to the FK migration.
