---
epic: MNEC (Necropolis / Collective Compound)
adr: ADR-005 Rev 2 (D1 free_grants slug map, D3 sharing_scope discriminator)
issue: 1110
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/1110
branch: piatra/issue-1110-collective-compound-generalise
worktree: /private/tmp/tm-ptah/collective-1110
base: origin/dev (b44afc1a)
---

# Story COLLECTIVE-2 (#1110): generalise Collective Compound rendering beyond the Necropolis

## Status

Ready for Dev

## Story

**As a** Storyteller adding a covenant or clan compound as content,
**I want** the Collective Compound virtual-row synthesis to derive its gate merit, owner threshold and allocation slug from the compound's `rule_grant` doc instead of hardcoding the Necropolis,
**so that** Mother's Fane (Circle of the Crone) and the Black Cathedral (Lancea et Sanctum) render their shared rows today, and the fourth compound is a seed script plus catalogue rows with **no code change** — which is the generality Epic MNEC set out to deliver.

## Acceptance Criteria

1. **Crone compound renders.** Given a character with `Blood and Sacrifice` dots at or above the compound's `min_dots`, when their sheet renders (both edit mode and view mode), the Mother's Fane target merits synthesise as collective rows with the same own-solid / partner-hollow dot split the Necropolis gets today.
2. **Sanctified compound renders.** Given a character with `Prayer and Penance` dots, the Black Cathedral targets do likewise.
3. **Necropolis regression.** Given a `Necropolis Sepulcher` owner, rendered output is byte-identical to the pre-change output for the same fixture. `server/tests/collective-1-virtual-rows.test.js` behavioural assertions pass unchanged in substance (regex-on-source assertions may be rewritten to the new symbol names — see AC 7 — but the *rendered HTML* assertions must not be weakened).
4. **No hardcoding in the synthesis path.** No merit name literal (`'Necropolis Sepulcher'`, `'Blood and Sacrifice'`, `'Prayer and Penance'`) and no `free_grants` slug literal (`.necro`, `.darktemple`, `.blackcathedral`) appears in the COLLECTIVE synthesis primitives or in their `sheet.js` call sites. Both come from the compound's `rule_grant`.
5. **Fourth compound is data-only.** Adding a compound requires only a `rule_grant` doc (with `grant_type: 'pool'`, `sharing_scope`, `source_slug`, `pool_targets`) plus catalogue rows. Demonstrate with a test that seeds a synthetic fourth compound into the rules-cache fixture and asserts its rows synthesise, with **zero** production-code change in that test's diff.
6. **Multi-compound characters.** A character owning two compounds at once sees the union of both compounds' rows. Per-target dots are summed per owning compound's slug; if the same target merit name belongs to two compounds the character owns, both slugs contribute.
7. **Suite green.** `npx vitest run` in `server/` is green, including the four suites that currently name the old symbols: `collective-1-virtual-rows.test.js`, `n7-n9-allocator-readers.test.js`, `n7b-necro-input-suppression.test.js`, `issue-793-alphabetical-inherited.test.js`. The last two assert on **source text via regex** and will fail on rename — update the regexes to the new symbols, do not delete the assertions.

## Tasks / Subtasks

- [ ] **Task 0 — verify the seeded `rule_grant` shape BEFORE designing the discovery predicate (blocking).**
  - [ ] Query live `tm_suite` for all three compounds' `rule_grant` docs (Necropolis Sepulcher, Blood and Sacrifice, Prayer and Penance). Record for each: `source`, `source_slug`, `grant_type`, `sharing_scope` (present? `type`? `merit`? `min_dots`?), `pool_targets`.
  - [ ] **HALT and report to Khepri if the Necropolis doc lacks `sharing_scope`.** `sharing_scope` is optional in `server/schemas/rules/rule-grant.schema.js:67`. If discovery keys on `sharing_scope.type === 'collective_owners_of_merit'` and the Necropolis doc predates that field, discovery finds the two *new* compounds and silently drops the Necropolis — AC 3 fails as a total regression, not a visible error. Do not paper over it with a name-based fallback; report the shape and get a seed-fix or a predicate decision.
- [ ] **Task 1 — compound discovery helper** (AC: 4, 5)
  - [ ] Add `getCollectiveCompounds(ruleCache)` to `public/js/data/rules-helpers.js`. Returns a descriptor array `[{ source, slug, gateMerit, minDots, targets }]` built from every `rule_grant` doc matching the predicate settled in Task 0. Pure — `ruleCache` is passed in, never imported (the N-1 no-browser-imports convention this file lives under).
  - [ ] `minDots` defaults to 1 when `sharing_scope.min_dots` is absent, matching today's `minSepulcherDots = 1`.
- [ ] **Task 2 — generalise the three primitives** (AC: 1, 2, 3, 4)
  - [ ] `rules-helpers.js:263` `getNecropolisTargets(ruleCache)` → `getCompoundTargets(ruleCache, source)`; drop the `'Necropolis Sepulcher'` literal at `:266`.
  - [ ] `rules-helpers.js:427` `collectiveNecroDots(allChars, meritName, minSepulcherDots)` → `collectiveCompoundDots(allChars, meritName, compound)`. Owner gate reads `compound.gateMerit` / `compound.minDots` (`:433`); allocation reads `compound.slug` via the existing `freeOf(m, slug)` helper rather than a fresh `free_grants.necro` literal (`:438`).
  - [ ] `rules-helpers.js:467` `synthesiseCollectiveNecroNames(c, allChars, necroTargets, minSepulcherDots)` → `synthesiseCollectiveCompoundNames(c, allChars, compound)`; the three owner-gate literals at `:471`, `:479` and the slug at `:484` all come from the descriptor. `targets` now comes off the descriptor, so the separate `necroTargets` parameter goes away.
  - [ ] **Rename, do not wrap.** The issue leaves this open; the decision is rename with no Necropolis-named aliases. Aliases would leave a second name for one call graph and the next compound author would not know which is canonical. Every call site is in this repo and is listed below, so the rename is complete and mechanical.
- [ ] **Task 3 — `sheet.js`: both renderers** (AC: 1, 2, 3, 6)
  - [ ] Edit-mode renderer: `:1039`, `:1047`, `:1127`, `:1128`, `:1277`.
  - [ ] View-mode renderer: `:1392`, `:1393`, `:1411`, `:1432`, `:1433`, `:1506`.
  - [ ] Stepper gate: `:1772`.
  - [ ] Each becomes a loop over `getCollectiveCompounds(getRulesCache())` filtered to the compounds `c` actually owns, instead of a single implicit Necropolis.
  - [ ] Update the import at `:26`.
- [ ] **Task 4 — tests** (AC: 5, 7)
  - [ ] Extend `collective-1-virtual-rows.test.js` (or add a sibling) with Crone and Sanctified fixtures mirroring the existing Yusuf/Xavier/Zanzibar shape, plus the synthetic fourth compound for AC 5 and a dual-compound owner for AC 6.
  - [ ] Repair the source-text regexes in `n7b-necro-input-suppression.test.js:238` and `issue-793-alphabetical-inherited.test.js:377-378`.

## Dev Notes

### Scope boundary — what is NOT a compound
`getNecropolisInfectedTerritories` (`rules-helpers.js:297`), the Trap Door dual-anchor validation, White Ants and Mandragora Garden are **Necropolis game content**, not compound-generic machinery. The Crone and Sanctified compounds have no equivalent. Leave all of it hardcoded to the Necropolis and leave `hasNecropolisSepulcher` (`:217`) alone unless a listed call site forces a change. Generalising them would invent behaviour no compound has asked for.

### Two renderers, and the failure mode is silent
`sheet.js` carries an edit-mode renderer (~`:1039-1290`) and a view-mode renderer (~`:1392-1510`) that compute the same rows twice. Wiring one and not the other produces a sheet that is correct in one mode and silently wrong in the other, and a source-regex test will not catch it (this is the `feedback_render_wiring_placement` / LK-Inv-VM precedent). **Assert rendered HTML from both renderers** for at least one non-Necropolis compound.

### Two views of the same arithmetic
`:1127-1128` (edit, own + cumulative) and `:1432-1433` (view, own + cumulative) are the same quantity computed in two places. Route both through the generalised primitive; do not let one keep an inline `free_grants` read.

### Cumulative is deliberately uncapped
`collectiveNecroDots` does not clamp to the merit's `rating_range` — per Peter 2026-06-16, cumulative across owners may exceed the per-instance 5-dot cap. Preserve that in the generalised version; do not "fix" it.

### `free_grants` is already generic
`server/schemas/character.schema.js:474` is an `additionalProperties: integer` slug map and accepts `free_grants.darktemple` / `free_grants.blackcathedral` today. No schema change is needed for this story — if you find yourself editing a schema, stop and re-read the scope.

### Out of scope
The merit data (seeded and verified). The Swear By cost model (#1111). The Sway/Organisation rework (#1043). The `domain.js:48` / `characters.js:195` `partner_shareable` divergence — that is the documented future MNEC-prerequisite audit, deliberately untouched per ADR-005 Rev 2 D6.

### References
- `public/js/data/rules-helpers.js:405-500` — the COLLECTIVE-1 primitives (#800)
- `server/schemas/rules/rule-grant.schema.js:47-76` — `source_slug`, `partner_shareable`, `sharing_scope`
- `server/schemas/character.schema.js:474` — `free_grants` slug map
- `specs/epic-mnec-necropolis-merits.md`
- `specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md`

## Dev Agent Record

_(Ptah fills this in)_

## QA Results

_(Ma'at fills this in)_
