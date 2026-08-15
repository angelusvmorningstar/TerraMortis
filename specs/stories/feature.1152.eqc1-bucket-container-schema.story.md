# Story feature.1152: EQC-1 — Bucket Re-Partition, Container Schema, Data Migration

## Status: done

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
2. `character.schema.js`'s `equipment[]` items gain an optional `container_id` field: nullable, 24-hex-string pattern when present, INTENDED to reference another item in the SAME character's `equipment[]` array whose catalogue bucket is `container`. Single-level containment is the stated v1 design intent (a container's contents are never themselves valid container targets) — **amended 2026-08-13 (Codex external review)**: this AC covers the field's schema shape only; no reference/topology validation exists yet anywhere in the codebase (confirmed: `characters.js`'s write routes accept a dangling, self-referencing, non-container, or multi-level `container_id` without rejection), and `container_id` has zero readers today so this is currently inert rather than exploitable. Building that validation is explicitly EQC-3's job (or whichever story first reads `container_id`), not this one's — see `character.schema.js`'s own comment for the full disclosure, including a known modelling gap (catalogue_id alone can't distinguish two equipment rows referencing the same container catalogue item).
3. `server/scripts/migrate-eqc1-bucket-taxonomy.mjs` exists, is pure-testable (`planBucketMigration`), dry-run by default, idempotent, and correctly maps every old bucket value to its new equivalent per the table above. An unrecognised bucket value is reported, never guessed or silently dropped.
4. Every direct reader of `entry.bucket === 'weapon'|'armour'|'equipment'|'asset'` is updated to the new taxonomy, preserving its exact prior behaviour for correctly-migrated data:
   - `equipment-derivation.js`: `armourDefencePenalty`, `wornArmourCount` — armour-shaped `combat_gear` only, via the shared `isCombatGearArmourShaped`/`isCombatGearWeaponShaped` predicates (**amended 2026-08-13, Codex external review HIGH finding**: the first version checked only `armour_value != null` / `weapon_type != null`; a legacy item that populated `defence_penalty` without `armour_value`, or `damage_mod`/`damage_type` without `weapon_type` — both valid under the pre-EQC-1 schema's independently-nullable fields — would have silently dropped out of derivation the moment it migrated. Both predicates now OR across every relevant stat field and are exported as the single source of truth every consumer imports, rather than each consumer re-deriving its own copy).
   - `roll.js`, `roll-v2.js`: skill-bonus chip filter (`skill_gear`), weapon-reference filter (weapon-shaped `combat_gear`, via the same shared predicate).
   - `editor/sheet.js`: equipment renderer regrouped into Weapons / Armour / Other Combat Gear / Skill Gear / Tools-Utility / Narrative / Containers (now importing the shared predicates rather than a local duplicate); add-form bucket dropdown updated.
   - `tabs/downtime-form.js`: catalogue dropdown optgroups.
   - `admin/equipment-catalogue-admin.js`: `BUCKETS`, `BUCKET_FIELDS`, default-bucket literals.
   - `admin-layout.css`: `.ec-bucket-*` tag colours re-keyed to the new values.
5. No behavioural regression for correctly-migrated data: an armour item that would have contributed its `defence_penalty` under the old bucket contributes identically under the new one (proven for both the single-field-populated and both-fields-populated legacy shapes — see AC #4's amendment); the same predicate-parity principle for weapon/skill-gear chips, though the roll-calculator side is proven by source-string/static-analysis tests rather than a full old-shape-vs-new-shape behavioural fixture (a real gap flagged by review, not yet closed — armour math has the stronger, literal-output-pinned proof).
6. `npm test` (vitest): **every equipment-related suite passes in full** (9 files, 170+ tests — see Debug Log for the exact post-patch count). The wider, ~2463-test full suite carries 5 pre-existing failures unrelated to this story (verified via git-stash comparison against clean base — see Debug Log) — **amended 2026-08-13, Codex external review Medium finding**: the original wording ("passes in full") was a literal overstatement against that wider number; this AC was always about EQC-1 not causing new failures, which the stash comparison actually proves, not about a zero-red full suite that has never been true at base either.
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

- 2026-08-13: EQC-1 implemented, scope expanded from schema-only to atomic (schema + migration + all direct consumers) per Angelus's ruling this session. New files: `server/scripts/migrate-eqc1-bucket-taxonomy.mjs`, `server/tests/issue-1152-eqc1-bucket-migration.test.js`. Modified: 9 production files + 5 test files (see Project Structure Notes for the full list). Committed `c7e6771b`.
- 2026-08-13: Codex external review (issue #1152, CLI-direct via `codex-review`) found 1 High, 5 Medium, 5 Low. All patched or dispositioned — see Senior Developer Review below. Committed as a follow-up patch to the same branch.

## Senior Developer Review (AI)

**Reviewer**: Codex (external, CLI-direct via `codex exec`, `model_reasoning_effort=high`), invoked through the `codex-review` skill under `bmad-loop`. Independent of the session that wrote this story - shares none of its conversation context. Full prompt at `specs/stories/code-review/issue-1152-eqc1-codex-review.md`, full findings at `specs/stories/code-review/issue-1152-eqc1-codex-findings.md`.

**Method**: 3-pass single-session review (Blind Hunter -> Edge Case Hunter -> Acceptance Auditor) against the committed diff (base `ddf059f8`, head `c7e6771b`), scoped to the 15 source/tooling files only (spec excluded on purpose).

**Ship assessment (Codex's own words)**: *"Needs patches; do not ship or run the production migration as-is... I would not trust it against real character data today until [the discriminator gap is fixed]."* All patches below were applied and verified before this story moved to `done`.

### Findings and disposition

- **[High, Pass 3b] Migration silently breaks legacy rows lacking the new discriminator field.** VERIFIED TRUE by direct execution (Codex's own repro: `armour_value: null, defence_penalty: 2` -> penalty 2 under the old bucket, penalty 0 after migration). Root cause: `armourDefencePenalty`/`wornArmourCount`/the roll-calculator weapon filter checked only ONE stat field (`armour_value != null` / `weapon_type != null`), but the pre-EQC-1 schema left bucket-specific fields independently nullable - a real legacy item could populate `defence_penalty` without `armour_value`, or `damage_mod`/`damage_type` without `weapon_type`. **PATCHED**: extracted `isCombatGearArmourShaped`/`isCombatGearWeaponShaped` as exported, OR-across-every-relevant-field predicates in `equipment-derivation.js` (matching the broader check `editor/sheet.js` already, correctly, used locally - the bug was an inconsistency between consumers, not present everywhere). Every consumer (`equipment-derivation.js`, `roll.js`, `roll-v2.js`, `sheet.js`) now imports the same shared functions, so the discriminator cannot drift out of sync between them again. Two new regression tests added reproducing the reviewer's exact scenario; prove-discriminated (temporarily narrowed the predicate back to the single-field check, confirmed exactly 3 tests failed, restored, confirmed 40/40 green).
- **[Medium, Pass 1 + Pass 2] `container_id`'s reference/topology contract is claimed but not enforced anywhere.** VERIFIED TRUE - `characters.js`'s PUT and POST equipment write routes perform no cross-item validation; a dangling, self-referencing, non-container, or multi-level `container_id` is accepted and stored. **PATCHED via documentation correction, not new validation code**: the schema comment no longer claims "the write route is responsible" (false); it now states plainly that no validation exists yet, that this is currently harmless only because nothing reads `container_id` (no reader exists until EQC-3 builds one), and that whoever builds the first reader MUST add real validation then. AC #2 amended to match. Building the actual validation now, with no consumer to validate against, would be speculative work ahead of the story that actually needs it - consistent with this codebase's own scope-discipline convention (see e.g. 11-B3's "Explicitly NOT this story" precedent in the sibling TM Wiki repo).
- **[Medium, Pass 1] Apply-mode partial-write failure gives no completion report.** VERIFIED TRUE by code inspection - `totals` was only logged after the full loop completed, so a mid-loop `updateOne` failure threw before an operator saw which documents had already written. **PATCHED**: the write loop now runs inside a try/catch; a new `totals.written` counter (separate from `totals.touched`, which only means "planned") tracks confirmed commits, and `logSummary` (now exported and independently tested) prints a "FAILED mid-run: N write(s) confirmed committed... re-run it (dry-run first)" message before re-throwing. Prove-discriminated (disabled the failure-branch, confirmed exactly 1 new test failed, restored).
- **[Medium, Pass 3a] `container_id` can't identify a container INSTANCE when two equipment rows share the same catalogue item** (e.g. two identical safes). VERIFIED as a real modelling gap - `equipment[]` rows have no per-instance identity, so `catalogue_id`-keyed containment is ambiguous under duplicates. **DEFERRED, documented**: this is a design question (index-based vs instance-id-based reference) for whichever story first builds container assignment, not a coding bug in this one. Recorded in `character.schema.js`'s own comment so it can't be missed when that story starts.
- **[Medium, Pass 3b] AC #6 claimed the full suite "passes in full" while the story's own record shows 10 pre-existing-failure files.** VERIFIED TRUE as a literal-wording overstatement (the pre-existing-failure provenance itself was never in question - Codex independently reproduced the identical 10-file/5-test failure signature via its own from-scratch archive of the base commit). **PATCHED**: AC #6 reworded to state what was actually proven - every equipment-related suite green, and EQC-1 causes zero NEW failures relative to the pre-existing baseline - rather than an absolute "full suite passes" claim that was never true even at base.
- **[Low, Pass 1] Dry-run integration test's assertion was satisfied by unrelated rows in the shared test collection**, not proven to cover the seeded fixture specifically. **PATCHED**: the test now runs `planBucketMigration` directly on the fetched seeded document and asserts its exact plan, rather than relying on a loose aggregate `touched >= 1` across the whole collection.
- **[Low, Pass 2] A non-string `bucket` (e.g. a one-element array) was silently coerced into a `BUCKET_MAP` key by JS's implicit property-key stringification**, migrating a malformed document instead of flagging it. VERIFIED TRUE by direct execution. **PATCHED**: `planBucketMigration` now rejects any non-string `bucket` explicitly, before either lookup. Prove-discriminated (disabled the guard, confirmed exactly 1 new test failed, restored).
- **[Low, Pass 2] Several equipment test fixtures still encode the retired taxonomy** (`equipment.test.js`, `issue-868`, `issue-896`). Already disclosed in this story's own Task 4 as a "candidate follow-up cleanup, not a correctness gap" before the review ran - Codex independently reached the same assessment ("primarily a coverage/maintenance defect"). **NO ACTION** - already correctly scoped out, not silently missed.
- **[Low, Pass 3a] AC #5's roll-calculator chip-parity claim is proven by source-string/static-analysis tests, not a behavioural old-shape-vs-new-shape fixture** (unlike the armour side, which has literal expected-output tests). VERIFIED as a real asymmetry. **MITIGATED, not separately fixed**: `roll.js`/`roll-v2.js`'s filters are now thin one-line compositions around `isCombatGearWeaponShaped`, which IS behaviourally tested directly and thoroughly (the High-finding regression tests). The remaining residual risk in the roll-calculator files themselves is a source-string-detectable composition, not undetectable logic - judged proportionate given `equipment-client-fixes.test.js`'s own documented constraint (roll.js is a browser-only, DOM/state-coupled module that the existing test suite deliberately tests via static analysis rather than direct execution, a pre-existing architectural choice this story didn't introduce).
- **[Low, Pass 3b] The claimed 2463/2458 full-suite total could not be reproduced in Codex's own sandbox** (network-blocked remote Mongo, TLS mismatch against its local fallback, timed out after 5 minutes under connection resets). **NO ACTION NEEDED** - this is an environment limitation on the external reviewer's side, not a false claim: this session ran the full suite directly and observed the real 2463/2458/10-failed-files numbers with its own tool output (see Debug Log above), and Codex's own independent, differently-constructed verification (archiving the base commit fresh, no stash) reproduced the equivalent 10-file/5-test failure signature exactly, which is the part that actually matters for AC #6.

### Verification performed this pass

- Re-ran the full 9-file, 177-test equipment suite after every patch, not just at the end - final state: 9/9 files, 177/177 tests green.
- Prove-discrimination (single-change revert -> exact expected test(s) fail -> restore -> green) performed for all three code-level patches: the High-finding predicate fix (3 tests flipped), the partial-write logging fix (1 test flipped), and the non-string-bucket guard (1 test flipped). Each revert broke ONLY the test(s) written to prove that specific fix, never an unrelated test - the single-change discipline this codebase's own convention requires.
- `node --check` on every touched `.js`/`.mjs` file after the full patch set - all clean.
- Confirmed via `git status --short` (path-scoped) that no unintended file was left modified after the review process itself, and that the unrelated pre-existing dirty-worktree state (a separate, uncommitted Epic OXP story - `oxp-3-manoeuvre-purchase-graduated-merit` - found sitting in this shared working tree, predating this branch) was neither touched nor absorbed into this story's own changes at any point.

**Status**: the one High and all addressable Medium findings are patched and verified; the two findings dispositioned as "defer, documented" (container-instance identity, container_id validation) are genuine scope boundaries for a not-yet-built consumer, not defects in this story -> `done`.
