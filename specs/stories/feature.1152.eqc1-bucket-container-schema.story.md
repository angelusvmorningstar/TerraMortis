# Story feature.1152: EQC-1 — Bucket Re-Partition, Container Schema, Data Migration

## Status: review

---
issue: 1152
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1152
branch: ms/issue-1152-eqc1-bucket-container-schema
---

## Story

**As a** Storyteller,
**I want** the equipment catalogue re-partitioned onto the four-category taxonomy decided at the 2026-07-25 meeting (combat gear / skill gear / tools-utility / narrative), with assets becoming containers rather than a stat-bearing bucket,
**so that** EQC's later shards (display distinctions, ST CRUD, programmatic purchase, skill-acquisition removal) have a correct, live-migrated data foundation to build on — and so nothing built on the OLD taxonomy silently breaks the moment this lands.

## Background

Sharded from Epic EQC (issue #1038, itself created 2026-07-25 the same day as the design meeting that decided this taxonomy). Epic ECM (issues #868-#876, merged 17-18 June 2026) had already moved the equipment catalogue from static JS into MongoDB, but kept the OLD four-value taxonomy (`weapon|armour|equipment|asset`) — a technical migration only, never a re-design. EQC is that re-design, finally being picked up now that Angelus owns TM Suite dev directly (Peter stepped back 2026-08-09).

**This story's scope was expanded mid-session from what issue #1152 originally said (schema-only).** A survey of every direct reader of `equipment_catalogue.bucket` found FOURTEEN consumer files across server and client, several of which are load-bearing for actual combat math (armour defence-penalty derivation, both roll calculators' weapon/skill-bonus chip filters). Shipping the schema's new enum without updating those consumers, or without migrating existing live data onto it, would make every existing character's equipment silently invisible to armour/roll derivation the instant the schema landed — a live-game-breaking regression, not a cosmetic gap. Angelus ruled (via `AskUserQuestion`, this session): **atomic, not dual-support** — schema, data migration, and every direct consumer land together as one coherent unit, so the branch is never in a broken intermediate state at any commit. This absorbed what would have been a separate `EQC-6` (data migration) issue — closed as duplicate/absorbed (#1157).

**Timing**: Game 7 is Saturday 2026-08-15. Angelus explicitly ruled this session that build work should proceed now regardless — nothing merges to `main` without his explicit say-so (TM Suite's own hard rule), so there is no live-game risk from working on a branch.

## The new taxonomy

| Old bucket | New bucket | Meaning change |
|---|---|---|
| `weapon` | `combat_gear` | Merged with armour. Weapon-shaped identified by `weapon_type`/`damage_mod`/`damage_type` populated. |
| `armour` | `combat_gear` | Merged with weapon. Armour-shaped identified by `armour_value`/`defence_penalty` populated. |
| `equipment` | `skill_gear` | Unchanged meaning (skill_domain + bonus_dice) — renamed only. |
| — | `tool_utility` | NEW. "Does a thing, no bonus" (epic #1038). No numeric bonus field; `mechanical_effect` free text only. |
| — | `narrative` | NEW. Purely descriptive; no bucket-specific stat fields at all. |
| `asset` | `container` | "Assets are containers... no stat-stacking on the asset itself" (epic #1038). Holds other equipment via the new `container_id` field, rather than granting a bonus of its own. |

`combat_gear` deliberately has NO new sub-type discriminator field — weapon-shaped vs armour-shaped is inferred from which stat fields are populated, matching the epic's own wording ("combat gear (weapons/armour, distinct stat fields)") and requiring no schema addition.

## Acceptance Criteria

1. `equipment_catalogue.schema.js`'s `bucket` enum reads `['combat_gear', 'skill_gear', 'tool_utility', 'narrative', 'container']`.
2. `character.schema.js`'s `equipment[]` items gain an optional `container_id` field: nullable, 24-hex-string pattern when present, referencing another item in the SAME character's `equipment[]` array whose catalogue bucket is `container`. Single-level containment only (a container's contents are never themselves valid container targets) — explicitly scoped out, not a bug.
3. `server/scripts/migrate-eqc1-bucket-taxonomy.mjs` exists, is pure-testable (`planBucketMigration`), dry-run by default, idempotent, and correctly maps every old bucket value to its new equivalent per the table above. An unrecognised bucket value is reported, never guessed or silently dropped.
4. Every direct reader of `entry.bucket === 'weapon'|'armour'|'equipment'|'asset'` is updated to the new taxonomy, preserving its exact prior behaviour for correctly-migrated data:
   - `equipment-derivation.js`: `armourDefencePenalty`, `wornArmourCount` — armour-shaped `combat_gear` only.
   - `roll.js`, `roll-v2.js`: skill-bonus chip filter (`skill_gear`), weapon-reference filter (weapon-shaped `combat_gear`).
   - `editor/sheet.js`: equipment renderer regrouped into Weapons / Armour / Other Combat Gear / Skill Gear / Tools-Utility / Narrative / Containers; add-form bucket dropdown updated.
   - `tabs/downtime-form.js`: catalogue dropdown optgroups.
   - `admin/equipment-catalogue-admin.js`: `BUCKETS`, `BUCKET_FIELDS`, default-bucket literals.
   - `admin-layout.css`: `.ec-bucket-*` tag colours re-keyed to the new values.
5. No behavioural regression for correctly-migrated data: an armour item that would have contributed its `defence_penalty` under the old bucket contributes identically under the new one; the same for weapon/skill-gear chips.
6. `npm test` (vitest) passes in full, including new tests for the migration script's pure planning function and an integration pass against `tm_suite_test`.
7. TM Wiki, TM Cockpit, and TM Herald are completely untouched by this story — it is TM Suite-only.

## Tasks / Subtasks

- [x] **Task 1 — Schema** (AC #1, #2)
  - [x] `equipment_catalogue.schema.js`: new bucket enum + doc-comment explaining the taxonomy and the migration dependency.
  - [x] `character.schema.js`: `equipment[]` items gain `container_id` (nullable, 24-hex pattern), with a doc-comment on single-level containment and referential looseness (unresolvable `container_id` is display-inert, not a write-time hard failure).

- [x] **Task 2 — Migration script** (AC #3)
  - [x] `server/scripts/migrate-eqc1-bucket-taxonomy.mjs`, following `backfill-free-grants.js`'s own pattern (pure compute function + dry-run-default CLI driver).
  - [x] `BUCKET_MAP` + `planBucketMigration` pure function; `migrate()` integration driver.
  - [x] Tests: `issue-1152-eqc1-bucket-migration.test.js` — pure-function coverage + a `tm_suite_test` integration pass proving apply + idempotency + unrecognised-value reporting.

- [x] **Task 3 — Consumer updates** (AC #4, #5)
  - [x] `equipment-derivation.js`: `armourDefencePenalty`/`wornArmourCount` predicates.
  - [x] `roll.js` + `roll-v2.js`: skill-bonus chip filter, weapon-reference filter.
  - [x] `editor/sheet.js`: full renderer regroup (Weapons/Armour/Other Combat Gear split within combat_gear; Skill Gear, Tools/Utility, Narrative, Containers sections); add-form `BUCKETS`/`BUCKET_LABELS`.
  - [x] `tabs/downtime-form.js`: dropdown `EQUIPMENT_BUCKET_LABELS` + optgroup loop.
  - [x] `admin/equipment-catalogue-admin.js`: `BUCKETS`, `BUCKET_FIELDS`, three default-bucket literal sites.
  - [x] `admin-layout.css`: `.ec-bucket-*` colour classes.

- [x] **Task 4 — Update existing tests for the new taxonomy** (AC #6)
  - [x] `issue-879-defence-penalty-wirein.test.js`: source-string check + every fixture; added an explicit "weapon-shaped combat_gear is excluded from armour derivation" test (this is the genuinely NEW risk the merge introduces, previously impossible to get wrong since weapon/armour were different buckets).
  - [x] `equipment-client-fixes.test.js`: `#752` source-string checks for the new predicate shapes.
  - [x] `issue-871-876-ecm-4-9-bundle.test.js`: optgroup-loop source-string check.
  - [x] `issue-868-ecm-1-equipment-catalogue-api.test.js`: one POST fixture using a retired bucket value corrected (`weapon` → `combat_gear` + `weapon_type`).
  - [x] `equipment.test.js`, `issue-896-availability-filter.test.js`, `issue-872-ecm-5-editor-cache.test.js`: left with incidental old-bucket literal fixtures — these exercise bucket-AGNOSTIC behaviour (CRUD mechanics, availability maths, cache lookup-by-key) and are not semantically wrong, just cosmetically stale. Noted here as a candidate follow-up cleanup, not a correctness gap this story needs to close.

- [x] **Task 5 — Full regression** (AC #6, #7)
  - [x] `npx vitest run` on every equipment-touching test file individually — green.
  - [x] Full `npm test` (vitest, all 171+ suites) — run as a final check given the live-game stakes.
  - [x] Confirm zero diff under TM Wiki, TM Cockpit, TM Herald — this story only ever used `Read`/`Grep`/`Bash(git ...)` there, no `Edit`/`Write`.

## Dev Notes

- **This is genuinely bigger than its own issue originally said.** The re-scoping happened mid-session after a direct grep confirmed the consumer blast radius; see the Background section above and the GitHub issue's own edit history (`gh issue edit 1152`, 2026-08-13) for the paper trail.
- **`combat_gear`'s weapon/armour sub-classification is entirely field-presence-driven.** This is the one genuinely NEW correctness risk the merge introduces: before this story, a weapon item and an armour item could never be confused because they lived in different buckets. After this story, they share a bucket, and an item with NEITHER `weapon_type` nor `armour_value` populated (an ST creating an item and not filling in stats yet) needs to render SOMEWHERE, not silently vanish — hence `editor/sheet.js`'s "Other Combat Gear" fallback section.
- **`container_id` is intentionally NOT recursive.** A container's own contents can never themselves be valid container targets in this schema. The epic's own examples (a safe inside a haven, a security system inside a property) are all single-level; recursive containment is real complexity with no stated requirement. A future story can lift this if actually needed — do not build it speculatively.
- **The migration script cannot run standalone ahead of the schema/consumer changes**, unlike `backfill-free-grants.js`'s own union-sum-guarded independence. See the script's own header comment for why.

### Project Structure Notes

- New files: `server/scripts/migrate-eqc1-bucket-taxonomy.mjs`, `server/tests/issue-1152-eqc1-bucket-migration.test.js`.
- Modified: `server/schemas/equipment_catalogue.schema.js`, `server/schemas/character.schema.js`, `public/js/data/equipment-derivation.js`, `public/js/suite/roll.js`, `public/js/suite/roll-v2.js`, `public/js/editor/sheet.js`, `public/js/tabs/downtime-form.js`, `public/js/admin/equipment-catalogue-admin.js`, `public/css/admin-layout.css`, plus the five test files named in Task 4.
- **The live migration itself has NOT been run against real `tm_suite` data** — this story ships the schema, the script, and the consumer code. Running `migrate-eqc1-bucket-taxonomy.mjs --apply` against production is a deploy-time action, deliberately not taken from a dev session. Whoever merges/deploys this must run it (dry-run first, per the script's own usage notes) before/immediately after the deploy, or existing characters' combat gear goes dark until it's run.

### References

- Epic EQC, issue #1038.
- `2026-07-25_meeting-lessons.md` §Equipment, assets, containers (umbrella root).
- `specs/epic-ecm-equipment-catalogue-migration.md` — the prior, superseded-in-taxonomy-only migration this one follows.
- `server/scripts/backfill-free-grants.js` — the migration-script pattern this story's own script follows.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5.

### Debug Log References

- Consumer blast-radius confirmed by `grep -rln "'weapon'\|'armour'\|..."` across `server/` and `public/js/` before any edit — 14 files, not the 2 originally scoped in issue #1152.
- Verified `equipment_catalogue.schema.js`'s `validate()` middleware only runs on POST (create); PATCH uses an allowlist that already excludes `bucket` (immutable); GET performs no schema validation at all. This means the schema change cannot retroactively invalidate existing documents on read — only new-item creation is gated by the new enum, and the data migration is what actually moves existing documents onto it.

### Completion Notes List

- All five consumer-file categories updated; every equipment-related vitest suite re-run and green after each change, not just at the end.
- Full `npm test`: 2463 total, 2458 pass, **5 pre-existing failures across 10 test files** (`epic.708.3-cycle-phase-controls`, `issue-1013-indomitable-rules-text`, `issue-1021-failed-breakpoint-merit`, `issue-811-sumchannels-rootcause`, `issue-826-cleanup-script-integration`, `issue-836-legacy-tracker-cache-removed`, `issue-837-xp-totals-deprecation`, `n7-n9-allocator-readers` — the one CLAUDE.md already documents by name — `n8-mandragora-prereq`, `oath-a-pledge-helpers`). **Verified pre-existing, not caused by this story**: `git stash push` on all 13 tracked EQC-1 files, re-ran the same 10 files against the clean base — identical failure signature (10 failed files, 5 failed tests, same test names). `git stash pop` restored EQC-1's changes; the 9 equipment-related suites (170 tests) re-confirmed green after the round-trip. None of the 5 pre-existing failures reference equipment/bucket/armour/weapon/container in any way.
- The live migration was NOT run against production `tm_suite` — see Project Structure Notes. This is a deliberate, disclosed gap for the deploy step, not an oversight.

### Change Log

- 2026-08-13: EQC-1 implemented, scope expanded from schema-only to atomic (schema + migration + all direct consumers) per Angelus's ruling this session. New files: `server/scripts/migrate-eqc1-bucket-taxonomy.mjs`, `server/tests/issue-1152-eqc1-bucket-migration.test.js`. Modified: 9 production files + 5 test files (see Project Structure Notes for the full list).
