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

Ready for Review

## Story

**As a** Storyteller adding a covenant or clan compound as content,
**I want** the Collective Compound virtual-row synthesis to derive its gate merit, owner threshold and allocation slug from the compound's `rule_grant` doc instead of hardcoding the Necropolis,
**so that** Mother's Fane (Circle of the Crone) and the Black Cathedral (Lancea et Sanctum) render their shared rows today, and the fourth compound is a seed script plus catalogue rows with **no code change** — which is the generality Epic MNEC set out to deliver.

## Acceptance Criteria

1. **Crone compound renders.** Given a character with `Blood and Sacrifice` dots at or above the compound's `min_dots`, when their sheet renders (both edit mode and view mode), the Mother's Fane target merits synthesise as collective rows with the same own-solid / partner-hollow dot split the Necropolis gets today.
2. **Sanctified compound renders.** Given a character with `Prayer and Penance` dots, the Black Cathedral targets do likewise.
3. **Necropolis regression.** Given a `Necropolis Sepulcher` owner, rendered output is byte-identical to the pre-change output for the same fixture, **with one sanctioned exception recorded below**.

   > **Sanctioned deviations (SM, 2026-08-06 — revised after QA render diff).** Ma'at rendered the Yusuf/Xavier/Zanzibar fixture through dev's renderer and this branch's and diffed the HTML. **View mode is byte-identical.** Edit mode differs in 12 hunks reducible to three kinds, **all three sanctioned**:
   >
   > 1. `aria-label` `"Necropolis pool allocation"` → `"Necropolis Sepulcher pool allocation"` (x6)
   > 2. `dom-total-lbl` title `"Cumulative across all Sepulcher-owners"` → `"Cumulative across all Necropolis Sepulcher owners"` (x6)
   > 3. virtual-row `onchange` `shAllocateNecroVirtual('X', v)` → `shAllocateCompoundVirtual('X', 'necro', v)` (x2) — covered by the approved scope extension
   >
   > (2) was **not disclosed** in the Dev Agent Record and was found by the render diff, not by reading the diff for strings. It is sanctioned on the same grounds as (1) — descriptor-derived user-visible label text becoming more specific, with the assertion updated rather than deleted. Everything else is identical: element ids (`bd-necro-3`, `bd-necro-v-dark-temple`), names, classes, `type`, `min`, `value`, and the `free_grants.necro` write path.
   >
   > **The rule these exceptions sit under is disclosure, not count.** An undisclosed deviation is a gate failure whatever its content.

   > **AC3's in-repo test does NOT verify this AC (QA structural finding).** The regression test compares Necropolis-only-seeded against all-four-seeded **on the new code**. That is a *seed-independence* check, not a before/after check, and it cannot detect any of the three deviations above — all of which appear identically under both seedings. The genuine before/after evidence for AC3 is the QA render diff recorded here, performed at gate. Do not read the passing in-repo test as satisfying AC3. `server/tests/collective-1-virtual-rows.test.js` behavioural assertions pass unchanged in substance (regex-on-source assertions may be rewritten to the new symbol names — see AC 7 — but the *rendered HTML* assertions must not be weakened).
4. **No hardcoding in the synthesis path.** No merit name literal (`'Necropolis Sepulcher'`, `'Blood and Sacrifice'`, `'Prayer and Penance'`) and no `free_grants` slug literal (`.necro`, `.darktemple`, `.blackcathedral`) appears in the COLLECTIVE synthesis primitives or in their `sheet.js` call sites. Both come from the compound's `rule_grant`.
5. **Fourth compound is data-only.** Adding a compound requires only a `rule_grant` doc (with `grant_type: 'pool'`, `sharing_scope`, `source_slug`, `pool_targets`) plus catalogue rows. Demonstrate with a test that seeds a synthetic fourth compound into the rules-cache fixture and asserts its rows synthesise, with **zero** production-code change in that test's diff.

   **5b. `sharing_scope.merit` must be exercised (QA finding, REOPENED).** Every fixture currently sets `sharing_scope.merit === source`, so `const gateMerit = scope.merit || r.source` is indistinguishable from `r.source`. Ma'at mutated it to `r.source` and ran all seven collective/n7 suites: **zero new failures.** The field AC4's central claim depends on is entirely untested.

   The fix is one fixture line: give the synthetic fourth compound a **gate merit whose name differs from its `source`**, and assert membership follows the gate merit rather than the source. Verify by re-running that mutation — it must now fail.

   *`min_dots` is already covered properly* (Silent Vigil at `min_dots: 2`, with a below-threshold member asserted to receive no rows). This is the other half of the same sharpened requirement.
6. **Multi-compound characters.** A character owning two compounds at once sees the union of both compounds' rows. Per-target dots are summed per owning compound's slug; if the same target merit name belongs to two compounds the character owns, both slugs contribute.
7. **Suite unchanged, not green.** `origin/dev` is **already red**: 4 failures across 2 files, none of them MNEC-related (measured by Ma'at, verified by SM). "Green" is therefore unsatisfiable and is **not** the criterion.

   The criterion is a **named-set comparison**: `npx vitest run` in `server/` goes **4 failed → 4 failed, with the same four test names**, and **no COLLECTIVE-2 surface among them**. This is strictly stronger than "green" for our purposes — it catches a new failure that a green-chasing repair might otherwise mask.

   The pre-existing four (baseline artefact held by Ma'at):
   - `n7-n9-allocator-readers.test.js` — *"all three dropdown builders consume meritPrereqOK (not \_meetsPrereq directly)"* — **RING-FENCED, see below**
   - `epic.708.3-cycle-phase-controls.test.js` — 3 failures: *"exports setGamePhase function"*, *"uses data-phase attribute on phase buttons"*, *"highlights active phase with gold2 colour"*

   **Run the suite with MongoDB up.** The baseline is only valid against a comparable run — see below.

   Three suites name the old symbols and **must** fail on your rename; repairing those regexes to the new symbol names **is** the sanctioned fix: `collective-1-virtual-rows.test.js`, `n7b-necro-input-suppression.test.js:238`, `issue-793-alphabetical-inherited.test.js:377-378`. Do not delete assertions to make a rename fit.

   **Rule for telling them apart:** if an assertion fails *because you renamed something*, repair it. If it fails on the base *before you touched anything*, leave it and report.

## Tasks / Subtasks

- [x] **Task 0 — verify the seeded `rule_grant` shape BEFORE designing the discovery predicate (blocking).**
  - [x] Query live `tm_suite` for all three compounds' `rule_grant` docs (Necropolis Sepulcher, Blood and Sacrifice, Prayer and Penance). Record for each: `source`, `source_slug`, `grant_type`, `sharing_scope` (present? `type`? `merit`? `min_dots`?), `pool_targets`.
  - [x] **HALT and report to Khepri if the Necropolis doc lacks `sharing_scope`.** `sharing_scope` is optional in `server/schemas/rules/rule-grant.schema.js:67`. If discovery keys on `sharing_scope.type === 'collective_owners_of_merit'` and the Necropolis doc predates that field, discovery finds the two *new* compounds and silently drops the Necropolis — AC 3 fails as a total regression, not a visible error. Do not paper over it with a name-based fallback; report the shape and get a seed-fix or a predicate decision.
- [x] **Task 1 — compound discovery helper** (AC: 4, 5)
  - [x] Add `getCollectiveCompounds(ruleCache)` to `public/js/data/rules-helpers.js`. Returns a descriptor array `[{ source, slug, gateMerit, minDots, targets }]` built from every `rule_grant` doc matching the predicate settled in Task 0. Pure — `ruleCache` is passed in, never imported (the N-1 no-browser-imports convention this file lives under).
  - [x] `minDots` defaults to 1 when `sharing_scope.min_dots` is absent, matching today's `minSepulcherDots = 1`.
- [x] **Task 2 — generalise the three primitives** (AC: 1, 2, 3, 4)
  - [x] `rules-helpers.js:263` `getNecropolisTargets(ruleCache)` → `getCompoundTargets(ruleCache, source)`; drop the `'Necropolis Sepulcher'` literal at `:266`.
  - [x] `rules-helpers.js:427` `collectiveNecroDots(allChars, meritName, minSepulcherDots)` → `collectiveCompoundDots(allChars, meritName, compound)`. Owner gate reads `compound.gateMerit` / `compound.minDots` (`:433`); allocation reads `compound.slug` via the existing `freeOf(m, slug)` helper rather than a fresh `free_grants.necro` literal (`:438`).
  - [x] `rules-helpers.js:467` `synthesiseCollectiveNecroNames(c, allChars, necroTargets, minSepulcherDots)` → `synthesiseCollectiveCompoundNames(c, allChars, compound)`; the three owner-gate literals at `:471`, `:479` and the slug at `:484` all come from the descriptor. `targets` now comes off the descriptor, so the separate `necroTargets` parameter goes away.
  - [x] **Rename, do not wrap.** The issue leaves this open; the decision is rename with no Necropolis-named aliases. Aliases would leave a second name for one call graph and the next compound author would not know which is canonical. Every call site is in this repo and is listed below, so the rename is complete and mechanical.
- [x] **Task 3 — `sheet.js`: both renderers** (AC: 1, 2, 3, 6)
  - [x] Edit-mode renderer: `:1039`, `:1047`, `:1127`, `:1128`, `:1277`.
  - [x] View-mode renderer: `:1392`, `:1393`, `:1411`, `:1432`, `:1433`, `:1506`.
  - [x] Stepper gate: `:1772`.
  - [x] Each becomes a loop over `getCollectiveCompounds(getRulesCache())` filtered to the compounds `c` actually owns, instead of a single implicit Necropolis.
  - [x] Update the import at `:26`.
- [x] **Task 4 — tests** (AC: 5, 7)
  - [x] Extend `collective-1-virtual-rows.test.js` (or add a sibling) with Crone and Sanctified fixtures mirroring the existing Yusuf/Xavier/Zanzibar shape, plus the synthetic fourth compound for AC 5 and a dual-compound owner for AC 6.
  - [x] Repair the source-text regexes in `n7b-necro-input-suppression.test.js:238` and `issue-793-alphabetical-inherited.test.js:377-378`.

## Dev Notes

### The baseline has TWO preconditions. Check both before comparing anything.

```
1.  ls markdown | wc -l      → 10, not 0
2.  mongod up                → summary reads ~2112 tests, ~131s, ZERO skips
```

If either fails, your run is not comparable to the baseline and AC7's four-name comparison does not apply.

**Precondition 1 — the untracked `markdown/` corpus.** `server/scripts/uplift-power-rules-text.js:67` resolves `MARKDOWN_DIR` to the **repo-root `markdown/` directory, which is untracked** — `git ls-files markdown` returns 0, and no ignore rule covers it. It was simply never committed. It exists in the main working tree (10 files) and is **absent from every `git worktree` by construction**, since worktrees do not carry untracked files. *(SM has symlinked it into this worktree; verify rather than assume.)*

`issue-1013-indomitable-rules-text.test.js` reads the real corpus via `loadAllBlocks()`. That function guards each book with `existsSync` and **continues** on a miss — it never throws. So with the corpus absent, `allBlocks` is `[]` and three assertions fail with content-shaped messages like `expected [] to equal [CofD Rulebook, VtR 2e Rulebook]`. It reads as *"Indomitable has gone missing from the VtR 2e Rulebook"* in the middle of a compound-rendering story.

**This is the more dangerous of the two**, because Mongo-down announces itself and corpus-absent does not. `issue-992-uplift-rules-text.test.js` is **not** affected — it writes its own fixture book to a temp dir and passes `markdownDir` explicitly.

**Precondition 2 — MongoDB.** Two runs of the same commit disagreed:

| | Ma'at (Mongo up, corpus present) | SM (Mongo down, corpus absent) |
|---|---|---|
| Test Files | 2 failed / 158 passed | **83 failed** / 77 passed |
| Tests | 4 failed / 2108 passed | 7 failed / 1018 passed / **1074 skipped** |
| Duration | 130.9s | 422.4s |

With no Mongo, 38 files hit `connectDb() failed: ECONNREFUSED …:27017`, skip their tests and count as failed *files*. **1074 tests — over half the suite — become inert.** A skipped test cannot fail, so comparing two Mongo-down runs passes a regression in any DB-backed path in silence.

**Ma'at's run is the canonical baseline.** Her four failure names reproduce identically in both environments, so the ring-fenced set itself is confirmed regardless.

### RING-FENCED — do not "fix" `n7-n9-allocator-readers.test.js:234`

This test is red on the base **and** it is on AC7's list of suites expected to fail on the rename. That coincidence makes it a trap: it fails with a source-regex mismatch, and the obvious repair looks exactly like the repair AC7 sanctions.

It is **not** a rename failure and **not** a behavioural regression. `meritPrereqOK(c, rule)` is present and correct in all three builders. The assertion uses character-distance proximity windows, and one builder's body outgrew its window:

| builder | decl | call | distance | window | |
|---|---|---|---|---|---|
| `buildMeritOptions` | 11985 | 12849 | 864 | 600 | **exceeds by 264** |
| `buildSubCategoryMeritOptions` | 14413 | 15105 | 692 | 800 | ok |
| `buildMCIGrantOptions` | 16597 | 17024 | 427 | 600 | ok |

Cause: `buildMeritOptions` grew in the Carthian Law hotfix (`b6098ccd`) and fighting styles (`726b6eda`); nobody re-ran the assertion.

**Leave it failing exactly as it fails now.** Widening 600 → 900 is a one-character change that buries the only signal that a load-bearing dropdown builder grew ~45% through a hotfix path. Filed separately. Ring-fenced **by test name**, not by suite — the rest of `n7-n9-allocator-readers.test.js` is in scope as normal.

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

### Agent Model Used

Ptah (DEV) — claude-opus-5

### Task 0 — live `rule_grant` shapes (BLOCKING GATE: CLEARED)

Queried live `tm_suite.rule_grant` (28 docs) on 2026-08-06. **All three compounds carry `sharing_scope`, so the Necropolis is not dropped and no HALT was required.**

| source | source_slug | grant_type | sharing_scope | pool_targets |
|---|---|---|---|---|
| Necropolis Sepulcher | `necro` | pool | `{type: collective_owners_of_merit, merit: 'Necropolis Sepulcher', min_dots: 1}` | 6 |
| Blood and Sacrifice | `darktemple` | pool | `{type: collective_owners_of_merit, merit: 'Blood and Sacrifice', min_dots: 1}` | 6 |
| Prayer and Penance | `blackcathedral` | pool | `{type: collective_owners_of_merit, merit: 'Prayer and Penance', min_dots: 1}` | 6 |

Stronger than the gate required: **no other `rule_grant` doc has `sharing_scope` at all** (checked all 28). The predicate `grant_type === 'pool' && sharing_scope.type === 'collective_owners_of_merit'` therefore selects exactly the three compounds — no Necropolis drop, no false positives from the 25 non-compound grants (MCI x5, OHM x4, Bloodline x3, LK, Invested, VM, Attaché x3, ...).

Two incidental findings, neither acted on:
- `rule_grant` contains duplicate seeds (MCI x5, OHM x4). None of the compounds are duplicated today, but `getCollectiveCompounds` de-duplicates on `source|slug` so a re-run seed cannot double a compound's rows.
- The pool evaluator (`pool-evaluator.js:40`) was already fully generic — it creates a `_grant_pools` entry per pool grant keyed by `source_slug ?? category`. Crone and Sanctified owners have had correct pool *capacity* all along; only the *rendering* was Necropolis-bound.

### Completion Notes

**Design.** One descriptor type, `{source, slug, gateMerit, minDots, targets}`, produced by `getCollectiveCompounds(ruleCache)` and threaded through every consumer. Renamed, not wrapped, per the story decision — no Necropolis-named aliases survive (asserted negatively in `collective-1-virtual-rows.test.js`).

**Both renderers.** Edit mode and view mode were wired from the same descriptors and are asserted independently for the Crone compound, the Sanctified compound, the synthetic fourth compound and the dual-compound owner. Mutation-tested: filtering `_compoundsView` back down to `necro` (i.e. leaving view mode un-generalised, the exact silent failure the Dev Notes warn about) fails **4 VIEW MODE tests while every edit-mode test still passes**. The gate demonstrably catches the hazard rather than merely being present.

**Necropolis regression (AC 3).** `collective-2-...test.js` renders a Necropolis-only fixture twice — once with only the Necropolis seeded, once with all four compounds seeded — and asserts the two outputs are **string-identical in both modes**. Mutation-tested: dropping the Necropolis from discovery (the Task 0 hazard) fails 23 tests across 3 suites, so the regression would be loud, not silent.

**Rendered-output deviations from byte-identity — THREE kinds, all sanctioned.**

> **Corrected 2026-08-06 after QA.** The first version of this section disclosed only kind 1 and closed with "this is the only rendered-output difference on a Necropolis fixture". **That sentence was false** — kind 2 was equally real and undisclosed. Every itemised claim around it was true, which is exactly what makes the summarising sentence the dangerous part: it is the line a future reader trusts instead of re-deriving. Ma'at found kind 2 by rendering the Yusuf/Xavier/Zanzibar fixture through dev's renderer and through this branch's and diffing the HTML — the method that finds what a diff-grep of your own change cannot, because it does not depend on the author already knowing what to look for. The rule these exceptions sit under is **disclosure, not count**: a disclosed deviation is a decision the SM can make, an undisclosed one is a gate failure whatever its content.

View mode is **byte-identical**. Edit mode differs in 12 hunks of three kinds (Necropolis fixture):

| # | deviation | count | status |
|---|---|---|---|
| 1 | stepper `aria-label`: `"Necropolis pool allocation"` → `"Necropolis Sepulcher pool allocation"` | x6 | sanctioned (941fec49) |
| 2 | `dom-total-lbl` title: `"Cumulative across all Sepulcher-owners"` → `"Cumulative across all Necropolis Sepulcher owners"` | x6 | sanctioned (1c502d06) |
| 3 | virtual-row `onchange`: `shAllocateNecroVirtual(name, v)` → `shAllocateCompoundVirtual(name, slug, v)` | x2 | covered by the approved scope extension |

Kinds 1 and 2 are the same change in two places: label text that was a hardcoded Necropolis string is now derived from the compound descriptor and becomes more specific (Crone: `"Blood and Sacrifice pool allocation"` / `"Cumulative across all Blood and Sacrifice owners"`). Element ids, `name` attributes, the `NECRO` label text and the `free_grants.necro` write path are all unchanged for the Necropolis, because they derive from the slug. The affected assertions were **updated, never deleted or weakened** — four a11y sentinels in `n7c`/`n7d` for kind 1, two in `collective-1-virtual-rows` for kind 2.

**Limitation of the in-repo AC 3 test, recorded so it is not over-read.** `collective-2-…test.js` compares a Necropolis-only-seeded render against an all-four-seeded render **on the new code**. That is *seed-independence* — it proves sibling compounds cannot perturb a Necropolis sheet — and it is worth having, but it is **not** a before/after comparison and by construction cannot detect any of the three deviations above. The real AC 3 evidence is Ma'at's dev-vs-branch render diff.

**Scope extended beyond the listed call sites — three sites, with reasons.** Each was required for AC 1/2 to be true rather than cosmetically true:
1. `shAllocateNecroVirtual(name, value)` → `shAllocateCompoundVirtual(name, slug, value)` (`edit-domain.js`, re-exported in `edit.js` + `admin.js`). Without the slug parameter, a Crone virtual row's stepper would have written the allocation into `free_grants.necro` — a silent cross-compound data corruption.
2. `meritBdRow` `opts.showNECRO` → `opts.compoundPools` (array of descriptors, one stepper each) + `opts.compoundSlugs` (channels counted into the row total). `compoundSlugs` defaults to `['necro']`, so every call site that does not pass it keeps its pre-#1110 total exactly.
3. `_renderPoolCounters` filtered `p.category === 'necro'`; it now tests membership of the discovered slug set. Without it a Crone owner would get rows and steppers but no pool counter.

**Deliberately left hardcoded** (story Dev Notes scope boundary): `getNecropolisInfectedTerritories` / the White Ants territory union, the Trap Door dual anchor, and the N-8 Mandragora Garden `attached_to` anchor at `sheet.js:1228` — the last is the single surviving `'Necropolis Sepulcher'` literal in `shRenderDomainMerits`, and its **count is pinned at 1** by an AC4 test so a second literal fails rather than sliding in.

**`hasNecropolisSepulcher` is now dead in production code** — `sheet.js` was its only consumer. Left exported because `n7-n9-allocator-readers.test.js` still unit-tests it; per `feedback_reachability_before_retire` this is a delete-dead-code follow-up, not this story's business.

**AC 5b — `sharing_scope.merit` coverage (added 2026-08-06 after QA).** The field the AC 4 claim rests on was **entirely unexercised**. All three live compounds set `sharing_scope.merit === source`, and every fixture in the first version of this suite copied that shape, so `scope.merit` was indistinguishable from `r.source` and mutating the read to plain `r.source` passed everything.

The fix is in the fixture, not the code: the synthetic fourth compound now has `source: 'Silent Vigil'` but `sharing_scope.merit: 'Keeper of the Ossuary'`, and its members hold the **gate** merit and not the source. That splits the two roles so the output makes them visible — the inherited card reads `"Inherited from Silent Vigil"` (source names the card and funds the pool) while the cumulative-dots title reads `"Cumulative across all Keeper of the Ossuary owners"` (gate merit defines who the dots are cumulative across). Both directions are asserted: a gate-merit owner **is** a member, and a character owning the source merit at 5 dots but not the gate is **not**.

This was the one place I applied a weaker standard to my own work than I applied to the dual-renderer wiring — I mutation-tested the hazard I had been warned about and assumed the rest of the fixture data was exercising what it named. A fixture whose values are all equal cannot distinguish the fields that read them.

### Debug Log References

- Task 0 query: ad-hoc read-only script against live `tm_suite` (scratchpad, not committed).
- Mutation test 1 — view mode un-generalised: 4 failed / 31 passed, all four failures `VIEW MODE`.
- Mutation test 2 — Necropolis dropped from discovery: 23 failed / 45 passed across 3 suites *(QA re-ran wider and measured **25 across 5 suites** — their figure supersedes mine; I ran it over 3 suites, not the full collective/n7 set)*.
- **Mutation test 3 (AC 5b, post-QA)** — `const gateMerit = scope.merit || r.source` → `const gateMerit = r.source`, over all seven collective/n7 suites:
  - **before the fixture fix: 0 failures** — the hazard was invisible.
  - **after: 5 failures / 108 passed** — `gateMerit comes from sharing_scope.merit…`, `respects a compound min_dots above 1`, `AC 5b: membership follows sharing_scope.merit…`, `renders in EDIT MODE…`, `renders in VIEW MODE…`. Unit and both renderers.
  - Restored source re-run: 38/38 clean.

### AC 7 — suite result, and the precondition I could NOT satisfy

Precondition 1 (`ls markdown | wc -l` → **10**) satisfied; with the symlink present the `issue-1013` failures disappeared and the base collapsed to exactly the canonical four.

**Precondition 2 (Mongo up, zero skips) NOT satisfied.** Both runs below have **1074 skipped tests**. Three blockers, reported rather than worked around:
1. No `mongod` binary on this machine (`mongodb-database-tools` and `mongosh` only).
2. `server/db.js:31` sets `tls: true` unconditionally, so a plain local / in-memory `mongod` is refused with a TLS handshake error. I started one on 27017 and every DB suite still failed to connect.
3. The Atlas URI lives in `server/.env`, which a security hook blocks me from copying into the worktree.

Base and after were measured **like-for-like in the same (Mongo-down) environment**, both with the `markdown/` symlink present:

| | total | passed | failed | skipped |
|---|---|---|---|---|
| base (`origin/dev` + story commits, changes stashed) | 2064 | 986 | **4** | 1074 |
| after | 2099 | 1021 | **4** | 1074 |

**4 failed → 4 failed, same four names, none on a COLLECTIVE-2 surface:**
- `n7-n9-allocator-readers.test.js :: all three dropdown builders consume meritPrereqOK (not _meetsPrereq directly)` — **ring-fenced, untouched**; `git diff origin/dev` on that file shows no change to the proximity window or the `meritPrereqOK` assertion.
- `epic.708.3-cycle-phase-controls.test.js` x3.

**The gap, stated plainly:** the 1074 skipped tests are the DB-integration suites, and I have not executed them. My diff touches only `public/js/**` client modules and test files — no route, schema, or DB code — but that is an argument, not a check. **Ma'at should re-run the named-set comparison with Mongo up before the gate passes.** The +35 net passing tests are `collective-2-compound-generalisation.test.js`.

One rename-caused failure outside the three suites the story named, repaired under the stated rule: `n7-n9-allocator-readers.test.js :: _renderPoolCounters surfaces the necro pool in the domain section` asserted on the source symbol `necroPools`, which I renamed to `compoundPools`. The section gate (`'domain'`, not `'general'`) that the assertion exists to protect is unchanged. A fifth suite, `n7a-necro-domain-render.test.js`, also asserts on source text and needed the same repair; the story named four.

### File List

**Modified — production:**
- `public/js/data/rules-helpers.js` — `getNecropolisTargets`→`getCompoundTargets(ruleCache, source)`; new `getCollectiveCompounds`, `ownsCompound`; `collectiveNecroDots`→`collectiveCompoundDots`; `synthesiseCollectiveNecroNames`→`synthesiseCollectiveCompoundNames`
- `public/js/editor/sheet.js` — import; both renderers; general-merit stepper gate; `_renderPoolCounters`
- `public/js/editor/xp.js` — `meritBdRow` `compoundPools` / `compoundSlugs`; `esc` import
- `public/js/editor/edit-domain.js` — `shAllocateNecroVirtual`→`shAllocateCompoundVirtual(name, slug, value)`
- `public/js/editor/edit.js` — re-export rename
- `public/js/admin.js` — import + window binding rename

**Added — tests:**
- `server/tests/collective-2-compound-generalisation.test.js` (35 tests)

**Modified — tests:**
- `server/tests/collective-1-virtual-rows.test.js` — renamed primitives, descriptor-passing, fixture `sharing_scope`, negative alias assertions
- `server/tests/n7-n9-allocator-readers.test.js` — `getCompoundTargets`, `compoundPools`, `_poolCompoundSlugs` (**not** the ring-fenced `meritPrereqOK` test)
- `server/tests/n7a-necro-domain-render.test.js`, `n7b-necro-input-suppression.test.js`, `n7c-necro-orchestrator-pipeline.test.js`, `n7d-meritfreesum-necro-gate.test.js` — source-regex + a11y sentinel repairs, fixture `sharing_scope`
- `server/tests/issue-793-alphabetical-inherited.test.js`, `issue-827-subtitle-order.test.js`, `issue-832-domain-merit-expand.test.js`, `n4a-picker-renderer-placement.test.js` — fixture `sharing_scope`, warn-text + symbol repairs

### Change Log

| Date | Change |
|---|---|
| 2026-08-06 | Task 0 gate cleared against live `tm_suite`; all three compounds carry `sharing_scope` |
| 2026-08-06 | Primitives generalised, both renderers wired, allocator write path made slug-aware |
| 2026-08-06 | New suite (35 tests); 9 existing suites repaired; both critical gates mutation-tested |
| 2026-08-06 | QA CONCERNS addressed: AC 5b fixture splits `sharing_scope.merit` from `source` (suite now 38 tests; the gateMerit mutation goes 0 → 5 failures); Dev Agent Record corrected to disclose all three rendered-output deviations and to record the AC 3 seed-independence limitation |

## QA Results

**Gate: CONCERNS** (Ma'at, 2026-08-06, commit 941fec49). No defect in shipped behaviour. Two findings, both disclosure/coverage; neither blocks on correctness.

### Correction to the baseline I supplied

The baseline I gave the SM (2 failed files / 4 failed / 2112 tests) was **contaminated by my own working branch**, which carries a fix to `issue-836-legacy-tracker-cache-removed.test.js` that is not on dev. On `origin/dev` that file reads the deleted `public/js/suite/tracker.js` and throws `ENOENT` at collection. Measured in a clean detached worktree at `b44afc1a`, Mongo up, corpus symlinked:

| | origin/dev (true) | Ptah 941fec49 |
|---|---|---|
| Test Files | 3 failed / 156 passed (159) | 3 failed / 157 passed (160) |
| Tests | 4 failed / 2074 passed (2078) | 4 failed / 2109 passed (2113) |
| Duration | 128.3s | 131.8s |

Failing set identical on both sides: `n7-n9` meritPrereqOK ×1, `epic.708.3` ×3, `issue-836` collection error. **AC7 as restated is MET.** +35 net passing = the new suite, exactly as reported. Ptah's third failed file is dev's, not his.

### Verified by measurement, not by reading the report

- **Ring-fence HELD.** `n7-n9-allocator-readers.test.js` — the `600` window and `meritPrereqOK(c, rule)` assertions are byte-identical to dev; `git diff origin/dev...HEAD` contains zero occurrences of either string.
- **Mutation 1** (`_compoundsView` filtered back to `necro`): 4 failures, every one view-mode-named, all 56 edit-mode tests green. Reproduces exactly.
- **Mutation 2** (Necropolis dropped from discovery): **25 failures across 5 suites**, louder than the 23/3 reported.
- **De-dupe is real.** Removing the `seen` guard fails exactly `collapses duplicate seeds of the same compound` and nothing else.
- **AC3 view mode: byte-identical.** Rendered the Yusuf/Xavier/Zanzibar fixture through `shRenderDomainMerits` under dev's renderer and this branch's, and diffed the HTML.
- **No weakened assertions.** `collective-1-virtual-rows.test.js` is a faithful rename carrying its values unchanged, plus *added* negative cases (null/malformed descriptor) and *added* `not.toMatch` guards against the old symbol names.
- Element ids, `name`s, values and the `free_grants.necro` write path confirmed unchanged **in the rendered HTML**, not in source.
- `markdown` symlink absent from the diff.

### Concern 1 — a second rendered-output deviation, undisclosed

Edit mode differs in **12 hunks reducible to three kinds**, not one:

1. `aria-label` "Necropolis pool allocation" → "Necropolis Sepulcher pool allocation" (×6) — **sanctioned**.
2. `dom-total-lbl` `title` "Cumulative across all Sepulcher-owners" → "Cumulative across all Necropolis Sepulcher owners" (×6) — **not disclosed in the Dev Agent Record**, though visibly updated in the `collective-1` test diff rather than deleted.
3. Virtual-row `onchange` `shAllocateNecroVirtual('X',…)` → `shAllocateCompoundVirtual('X','necro',…)` (×2) — covered by the approved scope extension.

The itemised sub-claims in the Dev Agent Record are all true; the summarising claim "this is the only rendered-output difference on a Necropolis fixture" is not. (2) is the same kind of change as (1) — descriptor-derived label text — and my recommendation is to sanction it alongside the aria-label rather than treat it as scope creep, and to correct the Dev Agent Record to list all three.

Note also that the story's own AC3 regression test compares *Necropolis-only-seeded vs all-four-seeded on the new code*. That is a seed-independence check, not a before/after check, and cannot detect any of these three.

### Concern 2 — `sharing_scope.merit` is entirely unexercised

Mutation: `const gateMerit = scope.merit || r.source` → `const gateMerit = r.source`. **Zero new failures** across all seven collective/n7 suites — the only failure was the pre-existing ring-fenced one. Every fixture, including the AC5 synthetic fourth compound, sets `sharing_scope.merit === source`, so the field AC4 relies on is indistinguishable from `source`.

The `min_dots` half of this was covered well (`Silent Vigil` uses `min_dots: 2` with a below-threshold member asserted to get no rows). Fix is one fixture line: give the synthetic compound a gate merit whose name differs from its `source`.

### Not raised as findings

`hasNecropolisSepulcher` left exported while dead in production is correctly deferred per `feedback_reachability_before_retire`. The uncapped cumulative is preserved. AC6's colliding-target case is genuinely exercised (`Shared Crypt` at `{aslug: 2, bslug: 3}` asserting 5 own dots, one row, both steppers).
