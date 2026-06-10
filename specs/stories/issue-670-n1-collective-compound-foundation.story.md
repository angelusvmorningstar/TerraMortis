# Issue #670: N-1 — Collective Compound foundation (schema + helpers + atomic seed + evaluator retrofit)

Status: Done

issue: 670
issue_url: https://github.com/angelusvmorningstar/issues/670
branch: piatra/issue-670-n1-collective-compound-foundation
epic: MNEC / Necropolis merit family
adr: ADR-005 Rev 2 (specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md)
dispatch: PROCEED-WITH-NOTICE; HALT-DAR raised + resolved 2026-06-10 (Option 1 / UNION baseline / map-fallback shape locked by Khepri).

## Story

As an implementer of the Necropolis merit family (and any future Collective Compound — covenant / clan / bloodline group-affinity sharing),
I want the channel-map (`m.free_grants`), the partner-shareable flag (`rule_grant.partner_shareable`), the discriminator-typed sharing scope (`rule_grant.sharing_scope.type === 'collective_owners_of_merit'`), and the dual-anchor `attached_to` shape all in production with backfill-independent runtime guards,
so that N-3 can ship Necropolis seed data without inventing per-merit-family glue and the existing LK/Inv/VM/MCI behaviour is preserved verbatim while the future MNEC-prerequisite audit decides whether the latent client/server divergence is deliberate or accreted.

## Decisions implemented (ADR-005 Rev 2)

- **D1** — `m.free_grants` slug-keyed channel map; `meritFreeSum` sums BOTH the map AND the 14 legacy `m.free_<slug>` fields (runtime guard; N-2 cleanup removes the legacy fallback).
- **D2** — `rule_grant.partner_shareable: boolean` + `rule_grant.source_slug` added to schema. Seeded on six existing pool-grant sources (LK / Inv / VM / MCI / Bloodline / Retainer) with UNION-baseline values (TRUE for MCI/Bloodline/Retainer; FALSE for LK/Inv/VM). Flag is NOT consulted by the legacy hardcoded reads in N-1 — only by NEW Collective Compound code paths.
- **D3** — `rule_grant.sharing_scope` discriminator-typed object; two `type` values shipped (`partner_explicit` default, `collective_owners_of_merit`). `resolveSharingScope` dispatches on `scope.type` from day one. Collective synthesis is render-time-only, written to dedicated `_collective_shared_with` and NEVER persisted (stripped by `buildSaveBody` + `charsForSave`).
- **D4** — multi-source contributions sum natively via the map (verified by unit test).
- **D5** — discriminator extension point in place; unknown types degrade safely to `null`.
- **D6 Rev 2** — hybrid migration, scope-reduced per Thoth defer. N-1 ships schema + runtime guards; existing LK/Inv/VM/MCI hardcoded reads at `domain.js#domMeritShareableSingle` and `server/routes/characters.js` partner-enrichment STAY VERBATIM (divergence preserved). N-2 backfill is separate.
- **D7** — dual-anchor `attached_to`: coexistence pattern (string OR `{ origin?, destination }`); `normaliseAttachedTo` is the single source of truth for every consumer (Concern #11 grep-verified).

## Load-bearing acceptance gates (VERBATIM per dispatch)

### Concern #1 Rev 2 — divergence preserved
"DO NOT silently fix the hardcoded subset divergence between `domain.js:48` and `characters.js:195`. Seed `partner_shareable` per source MATCHING CURRENT HARDCODED BEHAVIOUR — not 'fixed.' This is a guard against well-meaning over-reach. Deferred to a future MNEC-prerequisite audit story."

**Status:** ✅
- Client `domMeritShareableSingle` reads `cp + free + free_mci + xp` (mci-only). Migrated `free_mci` to `freeOf(m, 'mci')` for N-2-backfill safety; subset UNCHANGED.
- Server `characters.js` partner-enrichment reads `cp + free_mci + free_bloodline + free_retainer + xp`. Migrated each per-slug to `freeOf(m, slug)` for N-2-backfill safety; subset UNCHANGED.
- Seed file `server/scripts/seed-rules-pool-grants.js` populates `partner_shareable` to the UNION baseline (Khepri resolution 2026-06-10) on the existing six pool-grant rule_grant docs but the legacy reads DO NOT consult the flag — divergence preserved.

### Concern #4 Rev 2 — regression gate is "don't break"
"Spot-check existing MCI / LK / Inv / VM behaviour is preserved exactly. Regression gate flipped from 'fix' to 'don't break.' Pin known-good values for a small set of existing characters with these sources active. If any value changes, diagnose before merge — even if the change 'looks correct.'"

**Status:** ✅
- `n1-collective-compound.test.js > regression spot-check` asserts both subsets (client mci-only; server mci+bloodline+retainer) return EXACT pre-N-1 totals across map / legacy storage AND that out-of-subset dots (bloodline/retainer on client, lk/inv/vm on server) DO NOT leak in.
- Full regression: 1223/1223 tests pass.

### Concern #11 — every read of `m.attached_to` via `normaliseAttachedTo`
"Every read of `m.attached_to` in the codebase goes through `normaliseAttachedTo`. Grep-verified before merge — capture grep output in PR description."

**Status:** ✅ — see PR description for the grep audit output. Every non-write occurrence either is a comment, the normaliser definition itself, or goes through `normaliseAttachedTo(...)`. Writes (`m.attached_to = val` / `delete m.attached_to`) preserved verbatim per D7 coexistence pattern (legacy string-form remains valid; N-2 backfill canonicalises).

### End-to-end Collective Compound test (load-bearing)
"Two characters each with `Necropolis Sepulcher >= 1` see synthesised `_collective_shared_with` listing the other; a third character WITHOUT Sepulcher dots does NOT appear in either list. Inverse: removing one character's dots removes them from the other's on next render. `_collective_shared_with` is NEVER persisted."

**Status:** ✅ — `n1-collective-compound.test.js > end-to-end Collective Compound` covers all four bullets via the live `/api/characters` route against the test DB.

## Tasks / Subtasks

- [x] Helper module `public/js/data/rules-helpers.js` — `normaliseAttachedTo`, `meritFreeSum`, `freeOf`, `shareableSumForMerit`, `resolveSharingScope`, `synthesiseCollectiveOwners`. Pure ES module, importable client + server + vitest.
- [x] Schema additions — `rule-grant.schema.js` (`source_slug`, `partner_shareable`, `sharing_scope` discriminator); `character.schema.js` merit shape (`free_grants` map, `_collective_shared_with` strippable, `attached_to` oneOf).
- [x] Channel-map runtime guard — `meritFreeSum` delegates to the helper which sums map + legacy; per-slug reads across 9 files (domain.js, xp.js, edit.js, edit-domain.js, sheet.js, export-character.js, mdb-evaluator, safe-word-evaluator, pool-evaluator, audit.js, rules-data-view.js, downtime-form.js, characters.js) routed through `freeOf` for N-2-backfill safety.
- [x] Orchestrator — `applyDerivedMerits` (mci.js) gets a Collective Compound synthesis pass; clears stale `_collective_shared_with`; no-op when `allChars` is empty (player-side single-arg guard mirroring SafeWord).
- [x] Server enrichment — `server/routes/characters.js` `_enrichCollectiveSharing` covers both the ST path (uses full chars) and the player path (one scoped fetch by source merit; reuses the `{name, merits}` projection shape from the existing partner enrichment).
- [x] Strip-on-save — `buildSaveBody` (admin.js) extended to drop merit-level `_`-prefixed fields; `charsForSave` (export.js) same for localStorage.
- [x] `normaliseAttachedTo` migration — every read site routed through the normaliser; writes preserved verbatim per D7. Grep audit captured.
- [x] Atomic seed `server/scripts/seed-rules-pool-grants.js` — idempotent, `--dry-run` default, `--apply` to write; UNION baseline values; inline rationale comment for the future MNEC-prerequisite audit.
- [x] Tests — 19 vitest cases across the 5 acceptance gates. 1223/1223 pass.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **HALT-DAR raised + resolved (2026-06-10).** The dispatch's "client/server lockstep" helper AC conflicted with Concern #1 Rev 2's "don't silently fix the divergence" verbatim pin. Three options laid out for Khepri; Option 1 selected (helper exists but only consulted by NEW Collective Compound paths; legacy hardcoded reads stay verbatim with a minimal `(m.free_grants?.<slug> ?? m.free_<slug> ?? 0)` map-fallback). UNION seed baseline locked for the audit story. The contradiction was a Rev 1 holdover in the SM brief, not in Rev 2.
- **Pool-evaluator framing reconciled.** The issue's "pool-evaluator.js writes m.free_grants.<slug>" AC was imprecise — pool-evaluator pushes to `c._grant_pools` (not `m.free_<slug>`); the actual flat-field writes for LK/Inv/VM/MCI happen in the user-allocation UI (`edit.js`). Interpreted pragmatically: NEW Collective Compound rule_grant docs write to `m.free_grants[slug]`; legacy user-allocation paths stay on `m.free_<slug>` (unchanged); `meritFreeSum` runtime-guards via union sum so the transition is correctness-independent. This is the minimum-blast-radius reading that satisfies all load-bearing ACs.
- **non-member vs lone-member distinction.** `synthesiseCollectiveOwners` returns `null` for non-members and `[]` for lone members (member but only one). Orchestrator's `if (synthesised == null) continue;` then skips writing `_collective_shared_with` on non-member chars (semantically: "this merit isn't a collective compound for me"). Lone members get `_collective_shared_with: []` (semantically: "I'm a member but solo"). Caught + fixed during test-implementation; documented inline.
- **Strip extended at TWO save paths.** `buildSaveBody` (admin API PUT) AND `charsForSave` (localStorage) both now strip merit-level `_`-prefixed fields. The original strip pattern only ran at the character top-level. Concern #3 holds across both paths.
- **Worktree pattern continued** (`/tmp/tm-ptah/n1-collective`, node_modules + server/.env symlinked from main).

### Three pre-existing test failures (NOT caused by N-1)

Three test files fail at import time on `dev` because they reference scripts that were archived in commit `f07887fc` (`chore: archive one-off server/scripts into server/scripts/archive/`) — predates N-1:

- `server/tests/migrate-submission-cycle-id-to-oid.test.js` → `../scripts/migrate-submission-cycle-id-to-oid.js` (now in `archive/`)
- `server/tests/migrate-submission-territory-keys.test.js` → `../scripts/migrate-submission-territory-keys.js` (now in `archive/`)
- `server/tests/stm-13-backfill.test.js` → `../scripts/stm-13-backfill-active.js` (now in `archive/`)

All 1223 individual tests pass; only file-level import errors. Out of N-1 scope — flagged separately so a follow-up can either update the imports to point at `archive/` or delete the stale test files (the migrations have already shipped).

### File List

**New**
- `public/js/data/rules-helpers.js` — pure helpers (normaliseAttachedTo, meritFreeSum, freeOf, shareableSumForMerit, resolveSharingScope, synthesiseCollectiveOwners)
- `server/scripts/seed-rules-pool-grants.js` — atomic seed for source_slug + partner_shareable UNION baseline
- `server/tests/n1-collective-compound.test.js` — 19 vitest cases across the 5 acceptance gates
- `specs/stories/issue-670-n1-collective-compound-foundation.story.md` — this file

**Schema**
- `server/schemas/rules/rule-grant.schema.js` — added `source_slug`, `partner_shareable`, `sharing_scope` discriminator
- `server/schemas/character.schema.js` — added `free_grants`, `_collective_shared_with`, `attached_to` oneOf string/null/object

**Channel-map + map-fallback retrofit (per-slug reads → freeOf or inline `?? legacy ?? 0`)**
- `public/js/editor/domain.js` — meritFreeSum delegates; per-slug reads → freeOf; attached_to reads → normaliseAttachedTo
- `public/js/editor/xp.js` — per-slug reads → freeOf
- `public/js/editor/edit.js` — per-slug reads → freeOf
- `public/js/editor/edit-domain.js` — per-slug reads → freeOf; attached_to reads → normaliseAttachedTo
- `public/js/editor/sheet.js` — per-slug reads inline; attached_to reads → normaliseAttachedTo
- `public/js/editor/export-character.js` — per-slug read → freeOf
- `public/js/editor/rule_engine/mdb-evaluator.js` — per-slug reads inline (evaluator no-imports convention)
- `public/js/editor/rule_engine/safe-word-evaluator.js` — per-slug reads inline; zero-check helper uses union
- `public/js/editor/rule_engine/pool-evaluator.js` — vmPool inline copy uses union
- `public/js/data/audit.js` — per-slug reads → freeOf
- `public/js/admin/rules-data-view.js` — per-slug reads → freeOf
- `public/js/tabs/downtime-form.js` — per-slug read → freeOf; attached_to read → normaliseAttachedTo

**Orchestrator + server enrichment**
- `public/js/editor/mci.js` — Collective Compound synthesis pass in applyDerivedMerits; stale-clear at start
- `server/routes/characters.js` — `_enrichCollectiveSharing` for both ST + player paths; `freeOf` for partner-enrichment subset

**Save-path strip**
- `public/js/admin.js` — buildSaveBody drops merit-level `_`-prefixed fields
- `public/js/editor/export.js` — charsForSave drops merit-level `_`-prefixed fields

### Change Log

- 2026-06-10 (Ptah): HALT-DAR raised on helper-consumer scope; resolved Option 1 / UNION baseline / map-fallback shape.
- 2026-06-10 (Ptah): N-1 foundation shipped.
