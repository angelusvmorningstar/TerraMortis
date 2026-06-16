# Issue #760 (N-7) + #762 (N-9) — Necropolis allocator + edit-view bug triage

Status: Ready for Review

issues: 760, 762
issue_urls:
  - https://github.com/angelusvmorningstar/issues/760
  - https://github.com/angelusvmorningstar/issues/762
branch: piatra/issue-760-762-n7-n9-allocator-readers
epic: MNEC follow-ups (specs/epic-mnec-necropolis-merits.md)
adr: ADR-005 (inline amendment under D6 — no Rev bump)
authoritative-source:
  - specs/investigations/2026-06-15-edit-view-collective-compound-gap.md (Imhotep §1)
  - specs/investigations/2026-06-15-edit-view-bug-triage.md (Ma'at)

## Bundling

Per Khepri's lean: bundled because both stories extend `meritBdRow` (N-7 adds `showNECRO`, N-9 adds `hideBonus`), both touch `xp.js` / `edit.js` / `sheet.js` / `merits.js` / `rules-helpers.js` / `mci.js`, and N-9's MCI write-path migration directly applies the ADR-005 allocator-write-path amendment that N-7 lands. Single PR keeps the cross-reference natural.

## What ships

### N-7 — Necropolis allocator (issue #760)

**Helpers in `public/js/data/rules-helpers.js`:**
- `hasNecropolisSepulcher(c)` → boolean. cp+xp ≥ 1 on a Sepulcher merit (purchased dots only — collective grants don't count toward membership).
- `getNecropolisTargets(ruleCache)` → `string[]`. Reads `pool_targets` from the `source: 'Necropolis Sepulcher'` rule_grant. Caller passes the cache so rules-helpers stays free of the load-rules import chain.
- `poolAvailableFor(c, slug)` → number. Pool capacity (sum of `_grant_pools[*].amount` where category=slug) minus used (`freeOf` union-sum across merits). Generalises the inline cap logic at `edit.js:1019-1022`.

**`meritBdRow` extension (`xp.js`):**
- `opts.showNECRO` renders a per-target stepper with onchange `'free_grants.necro'`.
- (Also lands `opts.hideBonus` per N-9 — same merit-row surface.)

**`shEditMeritPt` (`edit.js`):**
- Detects `field.startsWith('free_grants.')` and routes to `m.free_grants[slug]` with cap enforcement via `poolAvailableFor(c, slug)` + current value. NEW Collective Compound write path (Necropolis first; MCI now also lands here per N-9).

**`sheet.js` wiring:**
- Computes `_hasNecroSep` + `_necroTargets` (from rules cache) in the general-merits block.
- Passes `showNECRO: _hasNecroSep && _necroTargets.includes(m.name)` at both general meritBdRow call sites.
- `_renderPoolCounters` surfaces the necro pool in the general section (mirroring the `lk` / `inv` / `vm` / `ohm` cross-section pattern).

### N-7 — ADR-005 inline amendment

Sub-section under D6, no Rev bump (mirrors ADR-004 auth-amendment convention; explicitly authorised by Peter on the N-7 dispatch). Codifies the post-N-1 allocator write path:

> Source-merit allocators introduced post-N-1 (Necropolis Sepulcher first; future Collective Compound families subsequently) write directly to `m.free_grants[slug]`. They do NOT introduce new legacy `m.free_<slug>` flat fields. Existing LK / Inv / VM allocators retain their legacy-field writes until the deferred MNEC-prerequisite audit migrates them. MCI (N-9 issue #762, Bug 1 "adjacent finding") migrated to the map shape alongside this amendment landing.

Plus a heterogeneous-by-source table making the transitional write-target convention explicit (Necropolis + MCI → map; LK + Inv + VM → legacy flat). Runtime read-guards absorb the heterogeneity.

### N-9 — edit-view bug triage (issue #762)

**Bug 1 — pool counter + MCI write-path:**
- `getMCIPoolUsed`, `getOTSPoolUsed` migrated to `freeOf` (union-read map + legacy). Post-N-2 backfill the persisted MCI dots live in `m.free_grants.mci`; the old `m.free_mci` reads returned 0 / nonsense.
- `getPoolUsed` extended to iterate matched-pool slugs via `freeOf` (covers the map) while preserving the legacy `free_*` enumeration for non-pool free fields.
- `meritBdRow`'s MCI input now emits `'free_grants.mci'` (matches the ADR-005 amendment's allocator-write-path convention).

**Bug 2 — standing-merit Bonus row:**
- `meritBdRow` accepts `opts.hideBonus: bool`; when true, the trailing Bonus up/down row is omitted entirely.
- Standing-merit call sites (`sheet.js:1145` MCI, `sheet.js:1220` PT) pass `hideBonus: true`. The Bonus row was visible-but-no-op on standing merits because standing render paths don't read `m.bonus`.
- General / influence / domain / style call sites unchanged — Bonus row still renders there (it's load-bearing on those).

**Bug 3 — domain-merit dropdown strict prereq filter:**
- New `meritPrereqOK(c, rule)` helper in `merits.js` — single seam for the prereq check across all sub-category dropdown filters.
- Three call sites migrated: `buildMeritOptions`, `buildSubCategoryMeritOptions`, `buildMCIGrantOptions`.
- `buildSubCategoryMeritOptions`'s line-331 escape hatch tightened: current-row passthrough preserved, but a failing-prereq passthrough now emits a `console.warn` so the situation surfaces in QA testing.
- No FT carve-out needed (Ma'at + Imhotep convergence): FT-purchased merits enter via the dedicated `buildFThiefOptions` picker with `granted_by: 'Fucking Thief'`, and the dropdown filter already short-circuits on `granted_by`.

## Tests — 25 cases

**N-7 helpers (pure-function, unit speed):**
- `hasNecropolisSepulcher`: true at cp+xp ≥ 1; false on grant-only / missing / 0 purchased; defensive on null.
- `getNecropolisTargets`: reads pool_targets from rule_grant; empty on missing cache.
- `poolAvailableFor`: capacity − used; union-reads map + legacy (matches channel-asymmetry transition); defensive.

**N-9 readers:**
- `freeOf` returns map when present, legacy when not, map-wins on both.
- `meritFreeSum` unions both across 14 channels.

**Static-analysis on wiring (sites that are expensive to import directly):**
- `meritBdRow` accepts `showNECRO` + emits `free_grants.necro` onchange.
- `shEditMeritPt` routes `free_grants.<slug>` writes to the map with `poolAvailableFor` cap.
- `sheet.js` computes `_hasNecroSep` + `_necroTargets` and passes `showNECRO` at both general call sites.
- `_renderPoolCounters` surfaces the necro pool in the general section.
- `getMCIPoolUsed` / `getOTSPoolUsed` consume `freeOf`.
- `getPoolUsed` enumerates matched-pool slugs via `freeOf`.
- MCI input writes `free_grants.mci` (catches the regression where it reverts to `free_mci`).
- `meritBdRow` honours `opts.hideBonus`.
- Standing call sites pass `hideBonus: true`.
- `meritPrereqOK` exported; all three dropdown builders consume it; current-row passthrough warns.
- ADR-005 amendment text present (catches future doc reverts).

**Full regression: 1449/1449 individual tests pass.** Same four pre-existing test-FILE failures (#675 archive-import family + #706 HoS relative-path) carry forward — none caused here.

## Test plan
- [ ] Add Necropolis Sepulcher 3 + Catacombs to a Nosferatu character → pool counter at top of merits reads `0/3 free Necropolis dots`; per-row NECRO stepper appears on Catacombs and the other 5 target merits (Caldarium / Garbage Pit / Labyrinth Guardians / Dark Temple / White Ants).
- [ ] Allocate 2 Catacombs + 1 Dark Temple → counter reads `3/3` (sc-full); stepper on a third target merit caps at 0.
- [ ] Drop Sepulcher to rating 1 → over-allocated entries persist (don't auto-delete; matches LK precedent); counter shows over (sc-over class).
- [ ] Pool counter at top of merits shows correct numerator on a character that's been through the N-2 backfill (post-backfill MCI dots).
- [ ] Standing merits (MCI, PT) — no Bonus up/down row in the breakdown.
- [ ] General / influence / domain merits — Bonus row STILL renders.
- [ ] In the domain merit dropdown for a non-Sepulcher character, Catacombs is NOT selectable. For a Sepulcher-owner, it IS.
- [ ] In QA console: removing a prereq merit while keeping a row whose merit failed the prereq emits a `[meritPrereqOK]` warn.

## Out of scope (per the dispatch)

- LK / Inv / VM allocator WRITE migration to the map. Deferred to the MNEC-prerequisite audit story; their legacy flat-field writes are the documented heterogeneous-by-source state in the ADR-005 amendment.
- UI grouping of Necropolis targets in the dropdown.
- Compound-dot allocator for future Collective Compound families beyond Necropolis (same code shape will apply trivially).
- Optional `m.bonus = 0` cleanup script for standing merits with persisted bonus.
- Closing #707 outright — its read-side scope is substantially covered here, but the union-sum fallback removal is post-deploy verification.

## References

- Imhotep investigation `specs/investigations/2026-06-15-edit-view-collective-compound-gap.md` §1
- Ma'at investigation `specs/investigations/2026-06-15-edit-view-bug-triage.md`
- ADR-005 Rev 2 + inline D6 amendment (this PR)
- N-1 PR #672 (helpers + atomic seed), N-2 PR #704 (backfill), N-3 PR #693 (Necropolis seed)
- Sister bugs: #749 (style-retainer pet double-count), #750 (5-evaluator write-side audit), #707 (post-N-2 union-sum cleanup tracker)
