---
id: ADR-005
title: 'Pool-grant channels + sharing-scope generalisation - data-driven flags replace hardcoded per-source surfaces'
status: approved
date: 2026-06-09
author: Imhotep (Architect)
revision: 1
supersedes: null
related:
  - specs/architecture/adr-001-rules-engine-schema.md (typed rule_* collections + per-source evaluator pattern this ADR extends)
  - public/js/editor/domain.js (meritFreeSum, domMeritShareableSingle, domMeritTotal — current hardcoded channel and sharing-subset surfaces)
  - public/js/editor/merits.js (per-merit defaults — current channel enumeration)
  - public/js/editor/mci.js (applyDerivedMerits orchestrator)
  - public/js/editor/rule_engine/pool-evaluator.js (existing generic pool-grant evaluator)
  - public/js/editor/rule_engine/{mci,pt,ohm,mdb,bloodline,style-retainer,safe-word,ots,auto-bonus}-evaluator.js (per-source evaluators currently writing into per-source channels)
  - server/schemas/rules/rule-grant.schema.js (target for partner_shareable + sharing_scope additions)
  - server/schemas/character.schema.js (merit shape — free_grants map addition)
  - server/routes/characters.js:155-200 (player-portal partner_dots enrichment — currently hardcodes a DIFFERENT free_* subset than domMeritShareableSingle; this ADR resolves the divergence)
  - specs/architecture/adr-004-st-mods-overlay.md (cache-entry invariant precedent — render-time synthesis pattern D3 of this ADR mirrors)
  - memory: project_rules_engine_pool_grants, project_necropolis_merit_family
---

# ADR-005 - Pool-grant channels and sharing-scope generalisation

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-06-09 | Initial. Peter authorised generalisation (Option A) ahead of the Necropolis Sepulcher merit family — third/fourth instance of the gate+collective-share shape (after Lorekeeper / Invested / Viral Mythology). Two orthogonal generalisations folded into one ADR because they share the same touchpoint set (`rule_grant` schema, `domain.js` sums, `mci.js` orchestrator): (1) replace 14 flat `m.free_<source>` keys with a single `m.free_grants: { source: amount }` map; (2) extend the explicit `shared_with[]` sharing primitive with an implicit `collective_owners_of_source` mode for source-merit-defined collectives. Survey surfaced a latent bug: client `domMeritShareableSingle` includes only `free_mci`, server `characters.js:195` partner-enrichment includes `free_mci + free_bloodline + free_retainer` — client and server disagree on partner contribution today. The data-driven `partner_shareable` flag resolves the divergence as a side effect. | Imhotep (Architect) |

## Context

The TerraMortis rules engine has settled on a clean architectural shape: typed `rule_*` collections (rule_grant, rule_status_floor, rule_auto_bonus, etc.) consumed by per-source pure-function evaluators (mci-evaluator, lk-evaluator, vm-evaluator, ohm-evaluator, etc.) orchestrated by `applyDerivedMerits` ([project_rules_engine_pool_grants](memory/project_rules_engine_pool_grants.md)). The evaluators write granted dot counts into per-source fields on each affected merit: `m.free_mci`, `m.free_lk`, `m.free_inv`, `m.free_vm`, `m.free_pt`, `m.free_ohm`, `m.free_mdb`, `m.free_sw`, `m.free_fwb`, `m.free_bloodline`, `m.free_pet`, `m.free_retainer`, `m.free_attache`, `m.free_carthian` — fourteen distinct channels at the time of writing.

Three pain points have accumulated:

1. **Per-channel touchpoint cost.** Adding a new pool source requires editing at least four sites: `merits.js` defaults, `domain.js:meritFreeSum`, `domain.js:domMeritShareableSingle` (selectively — see below), and any per-merit-total computation. Every new source widens the enumeration in three different sums in `domain.js` alone.

2. **The sharing subset drifts silently.** `domMeritShareableSingle` (client) currently includes `cp + free + free_mci + xp` only. The player-portal enrichment in `server/routes/characters.js:195` independently hardcodes `(cp || 0) + (free_mci || 0) + (free_bloodline || 0) + (free_retainer || 0) + (xp || 0)` — a different subset. Client and server disagree on which free-channel dots contribute to a shared domain merit's partner-side total. This is a latent bug surfaced by this ADR's survey work; the data-driven flag (D2 below) fixes it as a side effect.

3. **Sharing scope is single-mode.** The existing sharing primitive — `m.shared_with: string[]` of partner names — is *explicit*: the player edits the list. The upcoming Necropolis Sepulcher merit family ([project_necropolis_merit_family](memory/project_necropolis_merit_family.md)) introduces a *collective* scope: every character with Sepulcher dots automatically shares the six target merits, with no partner list to maintain. The existing primitive cannot express this without a per-instance evaluator hack each time a collective merit family ships.

Peter has confirmed this is a recurring class (Necropolis is the third or fourth instance) and authorised generalisation now rather than shipping Necropolis as another bespoke channel. Two orthogonal generalisations are required; they share the same touchpoint set and are folded into one ADR.

## Decisions

### D1 — Channel shape: replace 14 flat `free_*` keys with a single `m.free_grants` map. (Khepri Q1, confirm Option A)

Each merit gains a single `free_grants` field:

```js
m.free_grants = {
  "lk":         2,   // Lorekeeper granted
  "inv":        1,   // Invested granted
  "mci":        3,   // Mystery Cult Initiation granted
  "bloodline":  1,   // bloodline-default granted
  // ... one entry per contributing source
}
```

**Key convention: the existing channel slug.** The map keys are the per-source slugs already in use across the evaluator file-naming convention (`mci-evaluator.js` → key `mci`; `lk-evaluator.js` → key `lk`; etc.). Reasons:

- Preserves all 14 existing channel identifiers; the migration is a mechanical rename (`m.free_lk` → `m.free_grants.lk`), not a re-naming pass.
- Status-sourced grants (PT, OHM, MCI are *standings*, not merits) need a stable identifier; using the slug avoids a "what's the source-merit name for this standing?" question.
- Matches the evaluator-file naming convention, which already serves as the canonical slug registry.
- Mongo dotted-path updates against `free_grants.<slug>` are clean because slugs are ASCII without spaces.

**Read APIs collapse to one-liners:**

```js
function meritFreeSum(m) {
  return Object.values(m.free_grants || {}).reduce((s, n) => s + n, 0);
}
```

vs the current 14-term sum across multiple files. Adding a new source is now zero touchpoints in `domain.js`.

**`m.free` (the unprefixed channel) is preserved as a separate field.** It predates the rule engine and represents *player-allocated free dots* (e.g. character creation bonus), not engine-granted. It is not a rule-grant target; it remains at `m.free` and is summed separately. Channels migrated into `free_grants` are only those written by an evaluator.

### D2 — `rule_grant.partner_shareable: boolean` decides whether a source's grants contribute to partner contributions. (Khepri Q2, confirm — flag on source)

The new field lives on the `rule_grant` doc, **on the source**, not on the target merit. Reasons:

- The flag describes a property of the grant itself: "dots from this source count toward partner contribution when the target is a shared domain merit." That property is intrinsic to the source (Lorekeeper Library dots are shareable; Invested dots are not), not to which merit happens to receive them.
- A single target merit can receive grants from multiple sources (D4); putting the flag on the source allows per-source decisions without a join.
- Matches the existing rule_grant schema's source-keyed structure.

**Schema addition** to `server/schemas/rules/rule-grant.schema.js`:

```js
partner_shareable: { type: 'boolean' },           // default false on read
sharing_scope:    { type: 'string', enum: ['partner_explicit', 'collective_owners_of_source'] },
```

**Shareable sum becomes data-driven**:

```js
function domMeritShareableSingle(c, m) {
  let total = (m.cp || 0) + (m.xp || 0) + (m.free || 0);  // purchased + manual free always shareable
  for (const [source, amount] of Object.entries(m.free_grants || {})) {
    const rule = getRuleBySource(source);              // existing rules cache lookup
    if (rule?.partner_shareable) total += amount;
  }
  return total;
}
```

The server-side enrichment in `characters.js:195` consults the same flag via the same helper (extract it into a shared module or duplicate the logic — both are acceptable per the existing evaluator-purity pattern). **The client/server divergence in Concerns/Context paragraph 2 is resolved as a side effect.**

### D3 — `sharing_scope`: generalise the partner-explicit primitive to also handle collective sharing; synthesise at render time. (Khepri Q3, render-time confirmed)

New enum field on `rule_grant`:

- `'partner_explicit'` (default on read) — the existing `m.shared_with: string[]` pattern: player edits the partner list, sharing math reads it directly.
- `'collective_owners_of_source'` — implicit: every character with at least one dot of the source merit automatically shares the grant's target merits with every other source-merit owner.

**Synthesis is render-time only; no persisted `shared_with` is written for collective scope.** Three render-time entry points cover the two access contexts:

| Context | Where synthesis runs | Source of full chars array |
|---|---|---|
| Admin / ST client | `applyDerivedMerits` in `mci.js` (extend signature to accept chars context, mirrors how cross-char enrichment works elsewhere) | `editorState.chars` |
| Player portal | `server/routes/characters.js` enrichment (mirrors existing `_partner_dots` attachment) | Server collection scan, projection `{ name: 1, merits: 1 }` |
| Suite app | Inherits the synthesis via the same applyDerivedMerits boot path (cache-entry invariant from ADR-004 Rev 3 §D8) | `suiteState.chars` |

The synthesised data flows through the existing `m.shared_with` shape on the in-memory character — the sharing math in `domain.js` reads `shared_with` regardless of whether it was persisted (explicit) or synthesised (collective). **The downstream sharing code does not branch on scope**; only the synthesis step does.

**Synthesis algorithm** (collective):

```js
// For each rule_grant where sharing_scope === 'collective_owners_of_source':
const owners = chars.filter(c =>
  (c.merits || []).some(m => m.name === rule.source && (m.cp + m.xp) > 0)
);
for (const c of owners) {
  for (const targetName of rule.pool_targets) {
    const target = c.merits.find(m => m.name === targetName);
    if (!target) continue;
    target.shared_with = owners
      .filter(o => o !== c)
      .map(o => o.name);  // synthesised; never persisted
  }
}
```

The synthesised `shared_with` must be **marked transient** (e.g. via a non-enumerable property or by stripping it in the buildSaveBody path — same `_`-prefix convention from ADR-004 §D13 would apply if a name change is preferred, e.g. `_shared_with_synthesised`). The simplest contract: persisted `shared_with` is the explicit list; synthesised entries overwrite it in memory for collective targets and are stripped on save. STM-12 used the `_st_mod_overlay` strip path as the precedent.

**Per ADR-004 §D8 cache-entry invariant:** any in-memory character cache feeding accessor reads must have `applyDerivedMerits` applied to its entries. Collective sharing synthesis rides the existing precondition; no new cache discipline is introduced.

### D4 — Multi-source contributions to one merit sum natively via the map. (Khepri Q4)

A single target merit MAY receive grants from multiple sources. The map keyed by source guarantees one entry per source; `Object.values(...).reduce(...)` sums them. No collision, no merge logic. Example: a merit that is both a Necropolis target AND a Lorekeeper target would carry `{ "lk": 2, "necropolis_sepulcher": 1 }` and contribute 3 free dots total.

**Per-source flag lookup remains per-entry:** if Lorekeeper is `partner_shareable: true` and Necropolis Sepulcher is `partner_shareable: false`, only the Lorekeeper-granted dots flow to a partner's total. The shareable-sum logic in D2 already handles this by iterating entries and checking the per-source rule.

**No edge case** — confirmed by code review of `meritFreeSum` and `domMeritShareableSingle` shapes. The map structurally prevents the bug class where two sources race to write the same field.

### D5 — Future extensibility: `sharing_scope` enum is open; D20-style scope guards apply. (Khepri Q5)

The `sharing_scope` enum locks `'partner_explicit'` and `'collective_owners_of_source'` in ADR-005. Future patterns Peter may want — `'covenant_owners'` (all Carthians share X), `'clan_owners'` (all Mekhet share Y), `'all_pcs'` (city-wide standing), `'territory_co_owners'` (all regents of the same domain) — can be added by extending the enum **provided they preserve the render-time-synthesis invariant** (D3) and **do not introduce persisted denormalisation** of shared_with.

A scope that requires per-character permission gates (e.g. "Carthians who have signed the Pact") is out of scope until the gate primitive is itself generalised. The enum is the extension point; new scopes need their own synthesis function and one enum entry.

**Open question deferred (not blocking):** if a future scope needs cross-character data the server enrichment doesn't ship to players (e.g. private status values), a separate ADR will need to address whether to project additional fields or scope-restrict at the synthesis layer. Not in ADR-005's scope; flagged for awareness.

### D6 — Migration: hybrid with runtime guards; character-data backfill separately revertible from code change. (Khepri Q6, mirrors STM-13 pattern)

Three migration concerns, each handled differently:

**(a) `rule_grant` doc updates (`partner_shareable`, `sharing_scope`) ship ATOMICALLY with the code change in N-1.** Rule docs are seeded reference data, maintained alongside code, not user data. The N-1 PR contains:

- The schema additions to `rule-grant.schema.js`.
- The synchronous seed/migration of existing rule_grant docs:
  - MCI rule_grant: `partner_shareable: true` (matches current `domMeritShareableSingle` behaviour for `free_mci`).
  - Bloodline, Retainer, Attaché rule_grants: `partner_shareable: true` (matches current server-side `characters.js:195` behaviour — resolving the divergence).
  - All other rule_grants: `partner_shareable: false` (matches default).
  - `sharing_scope: 'partner_explicit'` on every existing rule_grant (matches today's only mode).

These updates are **not** subject to a runtime default fallback strategy because shipping the code without them would silently change behaviour for live merits. They MUST land together.

**Concern flagged for N-1 review (Concern #4 below):** verify in test that an MCI-granted domain merit, after migration, still contributes to a partner's domain total. Regression risk if the seed step is dropped.

**(b) Character-data migration (`m.free_lk` → `m.free_grants.lk`, etc.) is N-2, separately revertible. Runtime guards make correctness backfill-independent:**

- Read path: `m.free_grants ?? {}` — missing map reads as empty.
- Read path: per-source slug fallback for unmigrated documents:
  ```js
  function meritFreeSum(m) {
    const fromMap = Object.values(m.free_grants || {}).reduce((s, n) => s + n, 0);
    const fromLegacy = (m.free_lk || 0) + (m.free_inv || 0) + (m.free_vm || 0)
                     + (m.free_mci || 0) + (m.free_pt || 0) + (m.free_ohm || 0)
                     + (m.free_mdb || 0) + (m.free_sw || 0) + (m.free_fwb || 0)
                     + (m.free_bloodline || 0) + (m.free_pet || 0)
                     + (m.free_retainer || 0) + (m.free_attache || 0)
                     + (m.free_carthian || 0);
    return fromMap + fromLegacy;
  }
  ```
  This guard makes a partially-migrated character correct: a merit with both `free_grants.lk` AND `free_lk` would double-count, which is impossible in practice because the backfill **moves** rather than copies (idempotent: `m.free_lk` is unset after `m.free_grants.lk` is written).

  Actually — the cleaner shape: backfill MOVES (sets the map entry AND unsets the legacy field in one update), so the legacy fields are gone post-migration. Pre-migration, the fallback above carries the legacy sum. The guard is correct for any combination because backfill never leaves both populated.

- Write path: evaluators write to `m.free_grants[slug]`, NOT to legacy fields. Any character touched by an evaluator post-N-1 deployment will gain `free_grants` entries; the legacy fields are write-frozen.

**Do NOT gate logic on "has the character backfill run."** Brittle dependency; runtime guards are the contract.

**(c) Idempotent backfill script (N-2)** moves each legacy `m.free_<slug>` to `m.free_grants.<slug>` and unsets the legacy field. Skip on already-migrated docs. Light enough for in-place Render run. Separate PR from N-1 for independent revertibility per the STM-13 discipline ([feedback_bookkeeping_default](memory/feedback_bookkeeping_default.md) precedent).

## Story impact map

| Concern | Decision | Stories | Required work |
|---|---|---|---|
| Channel shape | D1, D4 | N-1 | Add `m.free_grants` to character schema. Refactor `meritFreeSum`, `domMeritShareableSingle`, `domMeritTotal`, costFromTotalSingle in `domain.js` and `merits.js`. Update each pool/auto-bonus evaluator to write to `free_grants[slug]` rather than `free_<slug>`. Both new-map writes AND legacy-field reads coexist (D6 runtime guard) until N-2 lands. |
| Partner-shareable flag | D2 | N-1 | Add `partner_shareable: boolean` to `rule-grant.schema.js`. Seed rule_grant docs (MCI, bloodline, retainer, attaché → true; others → false). Update `domMeritShareableSingle` and `server/routes/characters.js:195` enrichment to read flag from rules cache. Resolves client/server divergence. |
| Sharing-scope generalisation | D3, D5 | N-1 | Add `sharing_scope: enum` to `rule-grant.schema.js`. Extend `applyDerivedMerits` to take chars context. Add collective-owners synthesis function (pure; usable from both client and server). Server enrichment in `characters.js` extended to synthesise collective shared_with alongside existing partner_dots. Synthesised `shared_with` is render-time-only; verify `buildSaveBody` strips it before PUT (the Concerns #6 ADR-004 pattern). |
| `rule_grant` doc updates | D6(a) | N-1 (atomic) | Seed migration ships with the code. Test verifies MCI-granted domain merit still contributes to partner total post-migration. |
| Character data backfill | D6(b),(c) | N-2 | Idempotent script moves `m.free_<slug>` → `m.free_grants.<slug>` and unsets legacy field. Skip already-migrated docs. Separate PR for revertibility. Runtime guards in N-1 make timing irrelevant. |
| Necropolis seed data | (uses D1–D6) | N-3 | Add 9 Necropolis merits to MERITS_DB. Create rule_grant docs for Sepulcher → 6 targets, `sharing_scope: 'collective_owners_of_source'`, `partner_shareable: false` (collective is the sharing mechanism, partner_explicit doesn't apply). No code changes — purely seed + reference data. |
| White Ants territory link | (uses D3) | N-4 | UI/data linkage between the White Ants merit and territories. Specifics per Necropolis spec; collective synthesis from N-1 already covers the sharing. |
| Trap Door + collective-aware UI | (uses D3) | N-5 | Trap Door `attached_to` field + STM-12-style panel updates for collective-shared merits (read-only `shared_with` display when scope is collective; player can't edit the synthesised list). |
| Retrofit Lorekeeper / Invested / VM / MCI evaluators | D1 | N-6 (optional) | If N-1 bundles all evaluator writes into the map (recommended), N-6 is not needed. If N-1 ships only the schema + read-path changes and defers the evaluator-write refactor for risk staging, N-6 covers each evaluator individually. **Recommendation: bundle into N-1.** Smaller surface; runtime guards already cover the transitional state. |

## Non-decisions (explicitly out of scope)

- **Generalising the `m.free` (unprefixed) channel.** It is player-allocated, not rule-engine-granted. Stays at `m.free`. Sum it separately in `meritFreeSum`.
- **Status sources joining the slug registry.** PT/OHM/MCI are standings, not merits, but their slug-based channel keys treat them uniformly with merit-sourced grants (LK, Inv, etc.). No new registry; the slug is opaque.
- **Persisted collective shared_with.** D3 explicitly forbids persisting the synthesised list. A future ADR may revisit if a performance issue surfaces.
- **Covenant/clan/all_PCs sharing scopes.** D5 frames these as future enum entries, out of scope for ADR-005. Each future scope is a separate PR with its synthesis function.
- **Per-character permission gates** on collective sharing (e.g. "only Carthians who have signed the Pact share"). Requires a gate primitive that does not exist; out of scope.
- **`rule_grant` doc consolidation across grant_type.** This ADR only touches `partner_shareable` and `sharing_scope` additions. Other grant_type variations stay as-is.
- **Migration of the rules cache itself.** The rules cache is reloaded on rule_grant updates via `preloadRules()`; no separate migration story is needed for cache invalidation.

## Concerns and watch-items for implementers

1. **N-1 must keep both read paths in lockstep.** `domMeritShareableSingle` (client, `domain.js:48`) and the partner-dots enrichment (server, `characters.js:195`) currently disagree on which free_* channels are partner-shareable — the survey caught this. After D2, both must consult the rule_grant `partner_shareable` flag via the rules cache. If one is updated and the other isn't, the bug compounds rather than resolves. Suggest extracting a single `shareableSumForMerit(c, m, rulesCache)` helper used by both contexts.

2. **Slug stability.** The map keys are the existing channel slugs (`lk`, `inv`, `vm`, `mci`, etc.). Renaming a slug after N-1 ships requires a data migration. Treat slugs as a stable API; new sources allocate new slugs, never rename existing ones.

3. **Synthesised `shared_with` must be strippable on save.** Per ADR-004 §D13 / Concerns #5 pattern: any field written by the rule engine and read by render must NOT leak into PUT bodies. `buildSaveBody` already strips `_`-prefixed fields; the cleanest contract is to write collective synthesis into `m._shared_with_synthesised` (or strip the synthesised entries from `m.shared_with` before save by comparing against the source rule). N-1 should pick one and stay consistent. **My recommendation:** use a dedicated `_collective_shared_with` field for synthesis; persisted `shared_with` is always the explicit list. The sharing math reads `m.shared_with ?? m._collective_shared_with`. Two fields, clear semantics, save path strips the underscore one.

4. **MCI partner-shareable regression risk.** Currently `domMeritShareableSingle` hardcodes `free_mci` into the shareable sum. Post-D2, if the MCI rule_grant doc is not seeded with `partner_shareable: true`, MCI-granted domain merits silently stop contributing to partner totals. **N-1 acceptance must include:** create an MCI grant on a shared domain merit, verify the partner's total includes the granted dots after migration. This is the regression gate; do not merge N-1 without it.

5. **Cross-character context in `applyDerivedMerits`.** Today the function takes a single character. D3 collective synthesis requires the full chars array. Two API shapes:
   - Pass chars array as second arg: `applyDerivedMerits(c, chars)`. Caller bears the load; most caller sites already have it.
   - Two-pass: orchestrator iterates chars once to find collective owners, then per-character apply. Cleaner, but requires reshaping the caller (`app.js:553`, etc.).
   N-1 picks; my lean is the explicit second-arg form for clarity. The function name `applyDerivedMerits` becomes slightly misleading (it now considers more than one character's context) but the alternative — renaming — ripples through more sites than the second-arg addition. Leave the name; add the parameter.

6. **Player-portal collective synthesis on the server.** The existing `_partner_dots` enrichment (`characters.js:155-200`) demonstrates the pattern. For collective scope, the server must additionally compute `_collective_shared_with` for each affected merit. The server already projects `{ name: 1, merits: 1 }` from partners; the same projection covers collective synthesis. No new database round-trip if the implementation reuses the existing fetch.

7. **Necropolis seed depends on N-1.** N-3 (Necropolis merit family) cannot ship before N-1 because the `sharing_scope: 'collective_owners_of_source'` field does not exist pre-N-1. STM-12-style pinning: if Thoth wants to ship Necropolis seed data eagerly, the rule_grant docs can be staged on a feature branch but cannot be seeded into the live rules cache before N-1 merges. Recommend Khepri pins this as a dispatch gate.

8. **The `free` (unprefixed) channel is intentionally NOT migrated.** Implementers may be tempted to fold `m.free` into the map for symmetry. Don't — see Non-decisions §1. It represents player-allocated dots, not engine-granted, and has different semantics on edit (player UI binds to `m.free` directly).

9. **Watch for hardcoded slug enumerations beyond `domain.js` / `merits.js`.** The survey found enumerations also in: `costFromTotalSingle` (lines 261-264 of domain.js), and the partner-enrichment in `characters.js`. Grep for `free_lk`, `free_inv`, `free_vm`, `free_mci` across the codebase before N-1 lands. The migration is "wherever you find the channel enumerated, replace with the map iteration."

10. **Pre-Necropolis Sepulcher + Lorekeeper interaction (D4 verification).** A single Herd merit might receive grants from BOTH Lorekeeper (partner_shareable: true) AND Viral Mythology (partner_shareable: false depending on seed). After D4, the map will have `{ "lk": 2, "vm": 1 }` and the partner contribution is 2, not 3. Test acceptance for N-1: create a Herd merit with both grants, verify partner total shows 2, not 3 or 0.

## Resolutions table

| Decision | Status | Resolution |
|---|---|---|
| D1 | resolved | replace 14 flat `m.free_*` channels with single `m.free_grants: { slug: amount }` map; keys are existing channel slugs (mci, lk, inv, vm, pt, ohm, mdb, sw, fwb, bloodline, pet, retainer, attache, carthian); `m.free` unprefixed channel preserved separately |
| D2 | resolved | `rule_grant.partner_shareable: boolean` (default false); shareable-sum becomes data-driven and consults the rule cache; resolves the client/server divergence at `domain.js:48` vs `characters.js:195` as a side effect |
| D3 | resolved | `rule_grant.sharing_scope: enum ['partner_explicit', 'collective_owners_of_source']` (default 'partner_explicit'); collective synthesis is render-time-only at three entry points (admin/ST client via `applyDerivedMerits`, suite via boot path inheritance per ADR-004 §D8, player portal via `characters.js` enrichment); synthesised `shared_with` (or dedicated `_collective_shared_with`) is never persisted |
| D4 | resolved | multi-source contributions sum natively via map; per-source flag lookup remains per-entry; no merge logic needed |
| D5 | resolved | future scopes added by extending the enum + adding a synthesis function; render-time-synthesis invariant must be preserved; covenant/clan/all-PCs scopes flagged as future epic |
| D6 | resolved | hybrid: (a) rule_grant doc seed atomic with N-1 code; (b) character-data backfill separately revertible in N-2; runtime guards (`free_grants ?? {}`, legacy-field fallback during transition) make character migration timing-independent |

## Sign-off

**Rev 1 approved.** Six new stories (N-1 through N-6) span this generalisation and the first Necropolis instance. Recommended dispatch sequence:

- **N-1 — Schema + evaluator + render math + rule_grant seed.** Foundation. Atomic with rule_grant seed migration (D6(a)). Includes the four-channel evaluator retrofit (LK, Inv, VM, MCI) — bundled, not deferred to N-6. **PROCEED.**
  - Acceptance gates (must all pass): Concern #4 (MCI partner-shareable regression), Concern #10 (multi-source Herd test), Concern #1 (client/server lockstep helper extracted), Concern #6 (server enrichment covers collective synthesis).

- **N-2 — Character-data backfill script.** Idempotent move from `m.free_<slug>` to `m.free_grants.<slug>`. Separate PR for revertibility. **PROCEED.** Parallelisable with N-3, N-4, N-5 since runtime guards in N-1 mean character data correctness is backfill-independent.

- **N-3 — Necropolis merit family seed.** Depends on N-1 (sharing_scope enum must exist in production rules cache). MERITS_DB entries + rule_grant docs (Sepulcher → 6 targets, `sharing_scope: 'collective_owners_of_source'`). **PROCEED.**

- **N-4 — White Ants territory linkage.** Depends on N-3 (Necropolis merits must exist). UI/data linkage between the White Ants merit and territories. **PROCEED.**

- **N-5 — Trap Door attached_to + collective-aware sharing UI.** Depends on N-3 (Necropolis merits) and N-1 (sharing_scope synthesis). STM-12-style panel updates for collective-shared merits — read-only `shared_with` display when scope is collective; player cannot edit the synthesised list. **PROCEED.**

- **N-6 — Optional retrofit story.** SKIP if N-1 bundles the evaluator writes (recommended). Reserved as a contingency if N-1's scope grows too large and the evaluator-write changes are deferred for risk staging.

**Dispatch order:** N-1 first (foundation). N-2 parallelisable after N-1 (no inter-dependency). N-3 after N-1. N-4 and N-5 parallelisable after N-3.

**HALT-DAR vs PROCEED:** all PROCEED. The Concerns section pins the regression gates; SM brief must cite Concern #4 (MCI regression) and Concern #1 (client/server lockstep) verbatim. If N-1 implementation surfaces a reason the data-driven `partner_shareable` flag cannot subsume the hardcoded subset cleanly, that single point is HALT-DAR; the rest proceed.

**Open dissent window:**

D1 (slug-keyed map) and D2 (partner_shareable on source, not target) are the consequential decisions. If Ptah or Angelus prefer the source-merit-name-keyed map over slug-keyed, or prefer the partner_shareable flag on target merits instead of source rules, raise here before N-1 dispatches. D3/D4/D5/D6 are local enough that disagreement can be raised inside the affected story without re-opening the ADR.
