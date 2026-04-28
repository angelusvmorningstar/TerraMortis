---
title: 'Discipline → Attribute / derived stat migration — Vigour, Resilience, Celerity'
type: 'refactor'
created: '2026-04-28'
status: 'ready-for-dev'
context:
  - specs/architecture/adr-001-rules-engine-schema.md
  - specs/stories/rde.3.pt-migration-pilot.story.md
---

## Intent

**Problem:** `DISC_ATTR_MAP = { Strength: 'Vigour', Stamina: 'Resilience' }` is hardcoded at `public/js/data/accessors.js:28`. `discAttrBonus()` reads it. Plus `calcSpeed` / `calcDefence` (`accessors.js:148-165`) hardcode `c.disciplines?.Celerity?.dots` directly. Three rules total: Vigour → Strength, Resilience → Stamina, Celerity → Speed and Defence (TM house rule: NOT Dexterity). Per ADR-001 these must be ST-editable so an ST can adjust the house rule or add a new bloodline-defined discipline mapping.

**Approach:** Three `rule_disc_attr` docs. Evaluator reads them and updates `discAttrBonus()` to consult the rules collection. `calcSpeed` and `calcDefence` similarly consult disc_attr rules where `target_kind: 'derived_stat'`. The legacy `DISC_ATTR_MAP` constant and the inline Celerity reads are deleted post-flip.

## Boundaries & Constraints

**Always:**
- TM house rule preserved: Celerity does NOT add to Dexterity. The `rule_disc_attr` collection contains ZERO row for `discipline: 'Celerity', target: 'Dexterity'`. If an ST adds one in the editor, that's a deliberate house-rule change and the system must respect it.
- `getAttrEffective()` continues to be the canonical accessor for traits that include disc bonus.
- `calcSpeed` and `calcDefence` continue to add the discipline contribution; the source moves from inline reads to the rules collection.

**Ask First:**
- Whether to keep `discAttrBonus()` as the public API or rename it to clarify "this reads from the rules collection". Default: keep the name, refactor body. Renaming is risky given the call sites in `accessors.js` and any consumers.

**Never:**
- Do not introduce a Celerity → Dexterity rule. The house rule's absence is intentional.
- Do not change the cap behaviour of `getAttrEffective`.

## I/O & Edge-Case Matrix

| Character disciplines | Strength | Stamina | Speed | Defence | Dexterity |
|---|---|---|---|---|---|
| Vigour 2, Resilience 1, Celerity 3 | base + 2 from Vigour | base + 1 from Resilience | base + 3 from Celerity (preserved) | base + 3 from Celerity (preserved) | base only (no Celerity) |
| No physical disciplines | base | base | base + 0 | base + 0 | base |
| ST adds Celerity → Dexterity rule mid-game | — | — | — | — | base + Celerity rating |

## Code Map

- `public/js/data/accessors.js:28` — `DISC_ATTR_MAP` constant.
- `public/js/data/accessors.js:34-38` — `discAttrBonus`. Body refactored.
- `public/js/data/accessors.js:148-165` — `calcSpeed` / `calcDefence`. Inline Celerity reads replaced by rules-collection reads.
- `public/js/editor/rule_engine/load-rules.js` — RDE-3.

## Tasks & Acceptance

**Execution:**
- [ ] `server/scripts/seed-rules-disc-attr.js` — three docs (Vigour→Strength, Resilience→Stamina, Celerity→Speed; Celerity→Defence is the same discipline different target so it's a fourth doc).
- [ ] Refactor `discAttrBonus()` and the `calcSpeed`/`calcDefence` Celerity reads to consult the rules collection. Cache rules per render to avoid repeated lookups.
- [ ] `server/tests/disc-attr-parallel-write.test.js` — I/O Matrix.
- [ ] Flip: delete `DISC_ATTR_MAP` constant and inline Celerity reads.

**Acceptance Criteria:**
- Given a character with Vigour 2, when `getAttrEffective(c, 'Strength')` is called, then the result includes the +2 bonus.
- Given the same character, when `getAttrEffective(c, 'Dexterity')` is called, then no Celerity bonus is included.
- Given an ST adds a `Celerity → Dexterity` rule, when the next render runs, then `getAttrEffective(c, 'Dexterity')` reflects the new rule.

## Verification

**Commands:**
- `cd server && npx vitest run disc-attr-parallel-write` — green.

**Manual checks:**
- Spot-check a Vigour-bearing character; Strength effective rating identical pre/post flip.
- Add a temporary `Celerity → Dexterity` rule via the editor, verify a Celerity-bearing character's Dexterity effective rating increases. Remove the test rule afterwards.
