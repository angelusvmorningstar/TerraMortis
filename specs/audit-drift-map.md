# Audit Drift Map — Phase 1

**Status:** Phase 1 deliverable per `architectural-reset-charter.md` Part 1
**Owner:** Angelus
**Date:** 2026-05-01
**Triage bar:** `v0.1.0-acceptance-criteria.md` (any finding satisfying a criterion that is currently failing = `v0.1.0-blocker`; otherwise `post-v0.1.0`. No third category.)

## How to read this document

A single table per the charter's deliverable shape: *concern | location(s) | canonical? | drift type | severity | refactor target | tag*. One row per drift instance. Catalogue-only. Two findings escalate to stop-and-decide:

- **SCHEMA-SHAPE** — rows that change persistence shape, not just call sites.
- **EFFECTIVE-RATING** — the layer-level finding feeding the Section 3 decision in `v0.1.0-acceptance-criteria.md`.

`severity` is operational risk in the imminent cycle, not a refactor priority:
- **HIGH** — wrong dice / wrong gating in shipped paths a player will hit.
- **MED** — read-side undercount that shows correctly in mainline sheet but diverges in adjacent surfaces.
- **LOW** — cosmetic drift, dead code, or carryover that cannot misroute data.

`tag` answers: does this fail an acceptance criterion that is in scope for v0.1.0?

## Honest unknowns held over

The audit ran without a live MongoDB sample. The schema-diff rows below diff `schema_v2_proposal.md` against `server/schemas/character.schema.js` and against shape-implying code. They do **not** diff against actual `tm_suite.characters` documents. A live sample is needed before the post-audit report finalises the schema reconciliation plan; this is held over as the first methodology question in the charter "Open methodology questions" list.

---

## Drift map

| # | Concern | Location(s) | Canonical? | Drift type | Severity | Refactor target | Tag |
|---|---------|-------------|------------|------------|----------|-----------------|-----|
| **EFFECTIVE-RATING — attribute / skill / discipline reads** |
| 1 | ST Engine roll pool builder has its own `getAttrVal` / `getSkillVal` / `getDiscVal` and a hardcoded `_DISC_ATTR = { Dexterity: 'Celerity', Strength: 'Vigour', Stamina: 'Resilience' }` adding Celerity to Dexterity in violation of the house rule | `public/js/admin/dice-engine.js:67-83`, line 67 hardcoded map | accessors.js `getAttrEffective` / `skTotal` / `discDots`; rule_disc_attr collection | inline duplicate; under-counts skill PT/MCI grants; over-counts Dex by mis-applying Celerity | **HIGH** | Replace local helpers with accessors imports; delete `_DISC_ATTR` | **v0.1.0-blocker** (§3 dice pools must read effective rating) |
| 2 | Combat tab attack pools use a local `skDots(c, skill)` returning base only | `public/js/game/combat-tab.js:36-38`, attack pool calls at `:48-50` | accessors.js `skTotal` | inline duplicate; under-counts when PT dot-4 / MCI dot-3 grants apply on Brawl/Weaponry/Firearms | **HIGH** | Import `skTotal`; delete local `skDots` shim | **v0.1.0-blocker** (§3) |
| 3 | Equipment helper for weapon attack reads base skill dots | `public/js/data/equipment.js:26` (`c.skills?.[weapon.attack_skill]?.dots`) | accessors.js `skTotal` | inline read of base instead of effective | **HIGH** | Replace with `skTotal(c, weapon.attack_skill)` | **v0.1.0-blocker** (§3) |
| 4 | Resistance check resolves skill tokens via `skDots` (base only) | `public/js/shared/resist.js:53` | accessors.js `skTotal` | base-only read | **HIGH** | Use `skTotal` | **v0.1.0-blocker** (§3 — contested rolls read effective rating) |
| 5 | Contested-roll helper double-counts attr bonus and ignores PT/MCI on skills: `aval(c, attr) = getAttrEffective(c, attr) + getAttrBonus(c, attr)`; `sk(c, skill) = skDots(c, skill) + skBonus(c, skill)` | `public/js/game/contested-roll.js:36-37` | `getAttrEffective`, `skTotal` | call-pattern bug — `getAttrEffective` already includes `getAttrBonus`; `skTotal` already includes `skBonus`+PT/MCI | **HIGH** | `aval = c => getAttrEffective(c, …)`; `sk = c => skTotal(c, …)` | **v0.1.0-blocker** (§3) |
| 6 | Structured prereq engine reads attribute / skill / merit at base ratings | `public/js/data/prereq.js:50` (`getAttrVal`), `:53` (`skDots`), `:70` (`m.rating || 0`) | `getAttrEffective`, `skTotal`, `meritEffectiveRating` | engine-level under-count; merit prereqs that should pass with PT/MCI/OHM/free-channel grants do not | **HIGH** for any merit gated on enhanced rating | Switch leaf-evaluators to effective-reading equivalents | **v0.1.0-blocker** (§3 — bonus dots must count) |
| 7 | Legacy regex prereq engine `_getAttrDots`, `_getSkillDots`, `_getMeritRating` (`m.rating || 1`) | `public/js/editor/merits.js:146-165` | replacement is data/prereq.js (also drifted, item 6) | duplicate (legacy); same under-count | **MED** (only fires when no structured tree) | Remove fallback; rely on data/prereq.js once item 6 is fixed | **v0.1.0-blocker** (§3) |
| 8 | Ordeals view inlines PT-bonus addition: `(char.skills?.[sk]?.dots || 0) + (ptBonus.has(sk) ? 1 : 0)` | `public/js/tabs/ordeals-view.js:160` | accessors.js `skTotal` | inline duplicate of skTotal logic | **MED** (display-only check for "maxed asset skills") | Use `skTotal` | post-v0.1.0 |
| 9 | XP `xpPT5` re-derives PT-asset effective dots inline | `public/js/editor/xp.js:60` (`(s?.dots || 0) + (ptBonus.has(sk) ? 1 : 0)`) | accessors.js `skTotal` | inline duplicate (matches but duplicates) | **LOW** (matches skTotal output today) | Use `skTotal` to lock the drift | post-v0.1.0 |
| 10 | Three hardcoded copies of the discipline→attribute map | `admin/dice-engine.js:67`, `editor/sheet.js:418` (BONUS_SOURCE), `data/accessors.js:41` (LEGACY fallback) | rule_disc_attr collection (RDE epic) | duplicate ref data — and the dice-engine copy contradicts the house rule | **HIGH** (item 1) for dice-engine; **MED** for sheet/accessors fallbacks | Single accessor-routed lookup; delete the others | item 1 = blocker; rest post-v0.1.0 |
| **EFFECTIVE-RATING — merit reads** |
| 11 | Three different definitions of "effective merit rating" across the codebase | `editor/domain.js:meritEffectiveRating` (lines 88-101) — **excludes** `free_attache`, `free_retainer`; `editor/xp.js:meritRating` (lines 188-192) — **excludes** `m.free`, `free_attache`, `free_retainer`; `server/lib/normalize-character.js:MERIT_CHANNELS` (lines 25-30) — **includes** `free_attache`, **excludes** `free_retainer` | none — three competing | three-way divergence on which channels count | **HIGH** for any merit using `free_attache` or `free_retainer`; **MED** otherwise | One source-of-truth helper, server and client share the channel list (e.g. exported constant) | **v0.1.0-blocker** (§3 + §4 — schema vs. helper mismatch) |
| 12 | `free_retainer` is in `server/schemas/character.schema.js:431` but excluded from `MERIT_CHANNELS` and from both client effective helpers | server/schemas/character.schema.js:431, server/lib/normalize-character.js, editor/domain.js, editor/xp.js | none | **SCHEMA-SHAPE** — a dot channel exists in the persistence contract but is unaccounted for in the sum. A merit with free_retainer dots will normalize to a `rating` that excludes them | **HIGH** if any live data uses it; unknown until live sample taken | Decide: drop `free_retainer` from schema, OR add to channel list; same call across all four files | **v0.1.0-blocker** if live data uses; otherwise post-v0.1.0 |
| 13 | `free_attache` likewise — included in server normalize but excluded from `meritEffectiveRating` | editor/domain.js:88-101 vs. server/lib/normalize-character.js:25-30 | none | post-write `m.rating` includes free_attache; client `meritEffectiveRating(c, m)` returns less than `m.rating` | **MED** | Decision joint with item 11 | **v0.1.0-blocker** (§3) |
| 14 | Direct `m.rating` reads where dynamic merits (Herd with Flock/SSJ; Attaché-attached) need `meritEffectiveRating` | `editor/sheet.js:884` Contacts total; `editor/sheet.js:1294` merit prereq; `data/prereq.js:70`; `suite/sheet.js:552, 600, 655, 723`; `admin/downtime-views.js:4884, 7017, 7057, 7088, 8004` (read `m.rating ‖ m.dots ‖ 0 + m.bonus`); `editor/csv-format.js:243, 256`; `editor/export-character.js:195, 234`; `admin/spheres-view.js:74`; `admin/downtime-story.js:1756, 2805`; `game/char-pools.js:91` | `editor/domain.js:meritEffectiveRating` | **read-side drift** — server normalize syncs `m.rating` to channel sum on every write, so static merits read OK; dynamic bonuses (Herd Flock/SSJ, Attaché bonuses, Honey-with-Vinegar thresholds applied at calc time) are missed | **MED** mainline; **HIGH** for any sheet showing Herd dots without VM/SSJ/Flock | Replace with `meritEffectiveRating(c, m)` | mostly post-v0.1.0; Herd/Contacts on sheet possibly v0.1.0-blocker (§1 dot displays) |
| 15 | `data/accessors.js:influenceTotal` reads raw `m.rating` and only sums influence-category merits — competes with `editor/domain.js:calcTotalInfluence` (full canonical: + status + Contacts threshold + MCI 5 + HWV) | accessors.js:138; consumed by `admin/session-tracker.js:20`, `suite/tracker.js:21,118` (legacy) | `editor/domain.js:calcTotalInfluence` | duplicate, divergent results | **MED** | Delete `accessors.js:influenceTotal`; route legacy callers through `calcTotalInfluence` | post-v0.1.0 (legacy tracker is being retired anyway) |
| **DUPLICATE IMPLEMENTATIONS — cross-cutting** |
| 16 | Two tracker clients shipping simultaneously (already documented) | `public/js/game/tracker.js` (`_id`-keyed, canonical) vs. `public/js/suite/tracker.js` (name-keyed, legacy) | game/tracker.js | known duplicate | **MED** (only the canonical one writes to `tracker_state`) | Remove suite/tracker.js once feed roller migrates | post-v0.1.0 |
| 17 | Two editor-handler importers must stay in sync | `public/js/admin.js` and `public/js/app.js` both register `sh*` handlers | none | known structural duplicate | **MED** | Single import surface (charter Phase 3 work) | post-v0.1.0 |
| 18 | Two `meritBase` / `meritDotCount` / `meritKey` parsers — one v2-aware (`suite/sheet-helpers.js:48-72`), one regex-based (`editor/merits.js:34-56`) | both | suite/sheet-helpers.js (v2-aware) | duplicate string-parsing helper; legacy is dot-glyph-based | **LOW** | Consolidate; delete legacy once last caller migrated | post-v0.1.0 |
| 19 | Skill renderer in `editor/sheet.js:507, 520` re-derives the PT/MCI dot-4 bonus inline (`_pt_dot4_bonus_skills.has(s) ? 1 : 0`) and the dot-bonus split for hollow rendering | editor/sheet.js | skTotal already has this logic | render-path arithmetic; matches today but duplicated | **LOW** | Render uses base / bonus split for hollow display; total can route through `skTotal` | post-v0.1.0 |
| 20 | Attribute renderer inlines `(c.disciplines?.[BONUS_SOURCE[a]]?.dots || 0)` for auto-bonus | editor/sheet.js:442, 455 | accessors.js `discAttrBonus` (rule_disc_attr-aware) | duplicate, AND ignores rule_disc_attr's broader rule set | **LOW** today; **MED** if RDE adds new disc→attr rules | Use `discAttrBonus` | post-v0.1.0 |
| **SCHEMA-SHAPE — documented schema vs. server schema vs. inline shape** |
| 21 | `schemas/schema_v2_proposal.md` says attributes are `{ dots, bonus }`; server JSON Schema permits `{ dots, bonus, cp, xp, free, rule_key }` | schema_v2_proposal.md vs. `server/schemas/character.schema.js:326-338` (attrObj) | server schema is operative | **SCHEMA-SHAPE** — design-of-record doc is stale | **MED** documentation; **HIGH** for trust ("the documented schema is the source of truth" per CLAUDE.md is no longer accurate) | Update schema_v2_proposal.md or supersede with the server JSON Schema as the source | **v0.1.0-blocker** (§4 — no `additional properties` save failures requires the doc match what the server allows) |
| 22 | schema_v2_proposal.md says skills are `{ dots, bonus, specs, nine_again }`; server permits + `cp, xp, free, rule_key` | same files, skillObj at server:340-354 | server schema | **SCHEMA-SHAPE** | **MED** | Same as item 21 | **v0.1.0-blocker** (§4) |
| 23 | schema_v2_proposal.md says disciplines are integers (`Celerity: 1`); server schema requires objects (`{ dots, cp, xp, free, rule_key }`) — discObj at server:356-367 | same | server schema | **SCHEMA-SHAPE** — most-divergent area; doc is wrong about the type | **HIGH** trust | Update doc | **v0.1.0-blocker** (§4) |
| 24 | schema_v2_proposal.md doesn't document `cp/xp/free_*` channel fields on merits; server schema has all of them (line 417-432) | same | server schema | **SCHEMA-SHAPE** | **MED** | Same as 21 | **v0.1.0-blocker** (§4) |
| 25 | `fighting_styles[].up` is "tolerated legacy from Excel import" per server schema comment — never specified in design doc | server/schemas/character.schema.js:481 | none | tolerated drift | **LOW** | Migrate to `free` and remove tolerance | post-v0.1.0 |
| 26 | `merits[].benefit_grants` "old MCI format, pre-migration" — tolerated | server/schemas/character.schema.js:415 | superseded by `tier_grants` | tolerated drift | **LOW** | Migration; then drop | post-v0.1.0 |
| 27 | `/api/characters/public` projection still returns `regent_territory` despite the field being removed from the character schema | server/routes/characters.js:212 | regent_id on territories | dead projection | **LOW** | Remove from projection list | post-v0.1.0 |
| 28 | `c._regentTerritory`, `c._gameXP`, `c._partner_dots`, `c._pt_dot4_bonus_skills`, `c._mci_dot3_skills`, `c._ohm_nine_again_skills`, `c._pt_nine_again_skills`, `c._mci_free_specs`, `c._bloodline_free_specs`, `c._ots_covenant_bonus`, `c._npc_name`, `c._player_info` — ephemeral underscore-prefixed cached values stamped on character objects at render time | various | `stripEphemeral` middleware in `server/routes/characters.js:11-19` removes them on write | working as intended, but **the inventory is undocumented and the contract is implicit** | **LOW** | Document in `specs/reference-data-ssot.md` or the schema doc | post-v0.1.0 |
| **SCHEMA-SHAPE — live data delta (held over)** |
| 29 | Live `tm_suite.characters` delta vs. server JSON Schema is unknown | MongoDB live | server schema is the gate, but writes that pre-date schema validation may still exist | **SCHEMA-SHAPE** — must be sampled before resumption-criterion 2 (schema validation gate) can be designed | unknown | Run a live sample script (read-only); diff field-set per collection; produce `audit-schema-diff.md` | **v0.1.0-blocker** if any live save returns 'additional properties' (§4); else post-v0.1.0 |
| **API SCOPING (NPCR-14 sweep)** |
| 30 | NPCR-14 precedent reviewed across `npcs.js`, `characters.js`, `tickets.js`, `history.js`, `questionnaire.js`, `relationships.js`, `ordeal-responses.js`, `ordeal-submissions.js`, `players.js`, `investigations.js`, `territories.js`. All reviewed list endpoints scope at the Mongo query level or are ST-only. | server/routes/* | NPCR-14 pattern | no outstanding violations found in this pass | n/a | n/a | n/a |
| **VIEW-DATA COUPLING / RENDER PATHS** |
| 31 | `editor/sheet.js` renders attributes by inlining base/bonus/auto-bonus split with hardcoded `BONUS_SOURCE = { Strength: 'Vigour', Stamina: 'Resilience' }` (item 10), bypassing `discAttrBonus` | editor/sheet.js:418 | accessors.js `discAttrBonus` | duplicate | **MED** if RDE adds new disc→attr rules | Use `discAttrBonus` | post-v0.1.0 |
| 32 | DT form (`tabs/downtime-form.js`) is the cleanest path: routes through `getAttrEffective`, `skTotal`, `skNineAgain`, `meritEffectiveRating`, `calcTotalInfluence` consistently | tabs/downtime-form.js | (consumer) | reference exemplar | n/a | Use this as the model for migrating other surfaces | n/a |
| 33 | `editor/csv-format.js:162` exports `skDots` (base) for the CSV "dots" column. Likely intentional (export of the inherent value, not effective). | editor/csv-format.js:162 | n/a (export semantics) | needs explicit documentation that CSV dots = inherent, not effective | **LOW** | Add comment OR rename column to clarify | post-v0.1.0 |

---

## Summary by tag

### v0.1.0-blockers (must clear or formally accept before 2026-05-07 cycle)

- **Items 1, 2, 3, 4, 5, 6, 7** — effective-rating reads in shipped roll/prereq paths. Direct hits on §3 of the acceptance criteria. Pool calculations and prereq gating must read effective rating.
- **Item 11, 13** — three-way meritEffectiveRating divergence. §3 + §4.
- **Item 12** — free_retainer schema/normalize mismatch. §4.
- **Item 14 (subset)** — Herd dot rendering on the live sheet if the affected characters have VM/SSJ/Flock bonuses. §1.
- **Items 21, 22, 23, 24** — design-of-record schema doc has parted ways with the operative server schema. §4 ("no additional properties save failures") rests on this matching.
- **Item 29** — live data delta is the unknown unknown. Must be sampled before §4 can be claimed in good faith.

These together are the input to the Section 3 "effective-rating tension" decision in `v0.1.0-acceptance-criteria.md`. The audit's recommendation, deferred to the Angelus-with-Peter end-of-Phase-1 decision, is: **option 1 (narrow exception) is the only option that leaves §3 intact**, because items 1–7 cluster on a single missing routing layer and any in-place fix (option 2) reproduces the exact drift this audit found.

### post-v0.1.0 (defer to refactor, document, ship as-is)

- Items 8, 9, 10 (sheet/accessors copies), 14 (most read-sites), 15, 16, 17, 18, 19, 20, 25, 26, 27, 28, 31, 33.

### No outstanding work

- Item 30 — API scoping clean per NPCR-14 precedent, in the surfaces audited.

---

## Stop-and-decide escalations (per task brief)

The following are **not** to be fixed by the auditor. They are surfaced for the joint Angelus + Peter decision at end of Phase 1, per `architectural-reset-charter.md` Phase 2 and `v0.1.0-acceptance-criteria.md` §3:

1. **Effective-rating tension (items 1–14).** The codebase has *partial* canonical helpers (`getAttrEffective`, `skTotal`, `meritEffectiveRating`, `discAttrBonus`) but no enforced routing — and where helpers exist, three competing definitions of "merit effective rating" disagree. The Section 3 options (narrow `effective.js` exception / in-place fixes / defer) need a recorded decision before any blocker work proceeds.

2. **Schema-shape drift (items 21–29).** The design-of-record schema doc disagrees with the operative server JSON Schema across attributes, skills, disciplines, and merits. `free_retainer` is in the schema but excluded from the merit-channel sum. The methodology question from charter Part 3 — "does the audit treat the documented schema as reference and diff data against it, or treat live data as reference and reconstruct an accurate schema from it?" — needs an answer before the post-audit report can specify a reconciliation approach. **A live MongoDB sample is needed before §4 of the acceptance criteria can be claimed.**

These two escalations are joined: any "effective-rating helper" decision interacts with whether `free_retainer` / `free_attache` are channels the helper sums.

---

## Updates

- 2026-05-01 — v1 drafted from Phase 1 walk-through. Live MongoDB sample held over.
