---
id: ADR-005
title: 'Pool-grant channels + Collective Compound sharing-scope + dual-anchor attached_to'
status: approved
date: 2026-06-09
author: Imhotep (Architect)
revision: 2
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

# ADR-005 - Pool-grant channels, Collective Compound sharing, dual-anchor `attached_to`

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-06-09 | Initial. Peter authorised generalisation (Option A) ahead of the Necropolis Sepulcher merit family — third/fourth instance of the gate+collective-share shape (after Lorekeeper / Invested / Viral Mythology). Two orthogonal generalisations folded into one ADR because they share the same touchpoint set (`rule_grant` schema, `domain.js` sums, `mci.js` orchestrator): (1) replace 14 flat `m.free_<source>` keys with a single `m.free_grants: { source: amount }` map; (2) extend the explicit `shared_with[]` sharing primitive with an implicit `collective_owners_of_source` mode for source-merit-defined collectives. Survey surfaced a latent bug: client `domMeritShareableSingle` includes only `free_mci`, server `characters.js:195` partner-enrichment includes `free_mci + free_bloodline + free_retainer` — client and server disagree on partner contribution today. The data-driven `partner_shareable` flag resolves the divergence as a side effect. | Imhotep (Architect) |
| 2 | 2026-06-09 | Thoth's PRD-side priors locked with Peter; three substantive updates. (a) **Naming:** the pattern abstraction is **"Collective Compound"**, threaded through title, context, and decision text — generalises to future covenant/clan/bloodline instances without forcing "site" framing. (b) **`sharing_scope` shape:** refines D3 from a flat enum string to a **discriminator-typed object** `{ type, ...neighbouring fields }` — first instance `{ type: 'collective_owners_of_merit', merit, min_dots }` rather than `'collective_owners_of_source'`. Discriminator slot keeps future variants (`'collective_members_of_covenant'`, etc.) cheap; each variant carries its own neighbouring fields rather than overloading. Read-side resolver dispatches on `scope.type` from day one. (c) **New D7 — dual-anchor `attached_to`:** Trap Door needs BOTH `origin` (Necropolis Sepulcher — the source gating the entrance) AND `destination` (Safe Place — the surface anchor). Existing `attached_to` (Haven, Mandragora Garden) is single-target. Solution: coexistence pattern (`m.attached_to` accepts either a string — legacy single-target — or an object with `{ origin?, destination }`), reader normaliser, idempotent backfill rides N-2. Mirrors the D6 hybrid-migration-with-runtime-guards discipline. (d) **D6 scope reduction:** N-1 no longer touches the existing LK/Inv/VM/MCI partner_shareable inconsistency per Thoth's deliberate deferral — the audit ("was the divergence deliberate or accreted? grep + decide") is a separate future story. N-1 seeds the new fields **only on Collective Compound rule_grant docs** (Necropolis); existing rule_grant docs and hardcoded client/server reads stay unchanged. The latent divergence finding stays in this ADR as context for the future audit, but the "fixed as side effect of N-1" framing is retired. Concern #4 (MCI regression gate) moves out of N-1 acceptance and into the future audit story. (e) **True Worm:** mechanically independent of Necropolis Sepulcher; no rule_grant for Collective Compound participation; lives in the merit family for thematic grouping only. Simplifies N-3. | Imhotep (Architect) |

## Context

The TerraMortis rules engine has settled on a clean architectural shape: typed `rule_*` collections (rule_grant, rule_status_floor, rule_auto_bonus, etc.) consumed by per-source pure-function evaluators (mci-evaluator, lk-evaluator, vm-evaluator, ohm-evaluator, etc.) orchestrated by `applyDerivedMerits` ([project_rules_engine_pool_grants](memory/project_rules_engine_pool_grants.md)). The evaluators write granted dot counts into per-source fields on each affected merit: `m.free_mci`, `m.free_lk`, `m.free_inv`, `m.free_vm`, `m.free_pt`, `m.free_ohm`, `m.free_mdb`, `m.free_sw`, `m.free_fwb`, `m.free_bloodline`, `m.free_pet`, `m.free_retainer`, `m.free_attache`, `m.free_carthian` — fourteen distinct channels at the time of writing.

Three pain points have accumulated:

1. **Per-channel touchpoint cost.** Adding a new pool source requires editing at least four sites: `merits.js` defaults, `domain.js:meritFreeSum`, `domain.js:domMeritShareableSingle` (selectively — see below), and any per-merit-total computation. Every new source widens the enumeration in three different sums in `domain.js` alone.

2. **The sharing subset drifts silently.** `domMeritShareableSingle` (client) currently includes `cp + free + free_mci + xp` only. The player-portal enrichment in `server/routes/characters.js:195` independently hardcodes `(cp || 0) + (free_mci || 0) + (free_bloodline || 0) + (free_retainer || 0) + (xp || 0)` — a different subset. Client and server disagree on which free-channel dots contribute to a shared domain merit's partner-side total. This is a latent bug surfaced by this ADR's survey work; the data-driven flag (D2 below) fixes it as a side effect.

3. **Sharing scope is single-mode.** The existing sharing primitive — `m.shared_with: string[]` of partner names — is *explicit*: the player edits the list. The upcoming Necropolis Sepulcher merit family ([project_necropolis_merit_family](memory/project_necropolis_merit_family.md)) introduces a *collective* scope: every character with Sepulcher dots automatically shares the six target merits, with no partner list to maintain. The existing primitive cannot express this without a per-instance evaluator hack each time a collective merit family ships.

Peter has confirmed this is a recurring class and authorised generalisation now rather than shipping Necropolis as another bespoke channel. **The pattern abstraction is "Collective Compound"** (per Thoth, Rev 2): a source merit defines membership in a collective, and a set of target merits is auto-shared across the collective's members. Necropolis Sepulcher is the first Collective Compound instance; future instances may be gated by covenant membership, clan, bloodline, or other group-affinity criteria. The discriminator-typed `sharing_scope` shape in D3 carries the gate definition inline with the rule, so each future variant adds one `type` value with its own neighbouring fields rather than overloading existing ones.

Two orthogonal generalisations are folded into one ADR because they share the same touchpoint set (`rule_grant` schema, `domain.js` sums, `mci.js` orchestrator, `characters.js` enrichment). A third generalisation — dual-anchor `attached_to` for compound-bridging merits (Trap Door) — was identified during Thoth's Rev 2 pass and is folded in as D7.

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

### D3 — `sharing_scope`: discriminator-typed object generalising partner-explicit and Collective Compound sharing; synthesise at render time. (Khepri Q3 + Rev 2 refinement, render-time confirmed)

`sharing_scope` is a **structured object** with a `type` discriminator, not a flat enum string. The discriminator slot lets each variant carry its own neighbouring fields rather than overloading a single shape.

```js
// Partner-explicit (existing primitive, default on read):
sharing_scope: { type: 'partner_explicit' }

// Collective Compound (first instance — Necropolis Sepulcher):
sharing_scope: {
  type: 'collective_owners_of_merit',
  merit: 'Necropolis Sepulcher',
  min_dots: 1,                          // minimum source-merit dots to count as a member
}
```

Two variants ship in ADR-005 Rev 2:

- **`{ type: 'partner_explicit' }`** (default on read for omitted/absent scope) — the existing `m.shared_with: string[]` pattern: player edits the partner list, sharing math reads it directly. No neighbouring fields needed.
- **`{ type: 'collective_owners_of_merit', merit, min_dots }`** — every character whose `merit` rating is ≥ `min_dots` automatically shares the grant's target merits with every other qualifying owner. `min_dots` defaults to 1 if omitted.

**Synthesis is render-time only; no persisted `shared_with` is written for collective scope.** Three render-time entry points cover the two access contexts:

| Context | Where synthesis runs | Source of full chars array |
|---|---|---|
| Admin / ST client | `applyDerivedMerits` in `mci.js` (extend signature to accept chars context, mirrors how cross-char enrichment works elsewhere) | `editorState.chars` |
| Player portal | `server/routes/characters.js` enrichment (mirrors existing `_partner_dots` attachment) | Server collection scan, projection `{ name: 1, merits: 1 }` |
| Suite app | Inherits the synthesis via the same applyDerivedMerits boot path (cache-entry invariant from ADR-004 Rev 3 §D8) | `suiteState.chars` |

The synthesised data flows through the existing `m.shared_with` shape on the in-memory character — the sharing math in `domain.js` reads `shared_with` regardless of whether it was persisted (explicit) or synthesised (collective). **The downstream sharing code does not branch on scope**; only the synthesis step does.

**Synthesis algorithm** (Collective Compound, dispatched on `scope.type`):

```js
// Read-side resolver dispatches on the discriminator from day one:
function resolveSharingScope(scope, c, chars, rule) {
  switch (scope?.type) {
    case 'partner_explicit':
    case undefined:                       // default — legacy / unmigrated rule_grant docs
      return null;                        // sharing math uses persisted m.shared_with directly
    case 'collective_owners_of_merit':
      return _synthesiseCollective(scope, c, chars, rule);
    default:
      console.warn('Unknown sharing_scope.type:', scope?.type);
      return null;                        // safe degradation — falls back to persisted m.shared_with
  }
}

function _synthesiseCollective(scope, c, chars, rule) {
  const minDots = scope.min_dots ?? 1;
  const owners = chars.filter(other =>
    (other.merits || []).some(m =>
      m.name === scope.merit && ((m.cp || 0) + (m.xp || 0)) >= minDots
    )
  );
  // Only synthesise for members; non-members get no collective sharing on these targets.
  const isMember = owners.includes(c);
  if (!isMember) return [];
  return owners.filter(o => o !== c).map(o => o.name);
}
```

For each rule with `sharing_scope.type === 'collective_owners_of_merit'`, the synthesised member list is written to the dedicated transient field on each target merit of each member character (D-7 / Concerns #3 — never to persisted `m.shared_with`).

The synthesised `shared_with` must be **marked transient** (e.g. via a non-enumerable property or by stripping it in the buildSaveBody path — same `_`-prefix convention from ADR-004 §D13 would apply if a name change is preferred, e.g. `_shared_with_synthesised`). The simplest contract: persisted `shared_with` is the explicit list; synthesised entries overwrite it in memory for collective targets and are stripped on save. STM-12 used the `_st_mod_overlay` strip path as the precedent.

**Per ADR-004 §D8 cache-entry invariant:** any in-memory character cache feeding accessor reads must have `applyDerivedMerits` applied to its entries. Collective sharing synthesis rides the existing precondition; no new cache discipline is introduced.

### D4 — Multi-source contributions to one merit sum natively via the map. (Khepri Q4)

A single target merit MAY receive grants from multiple sources. The map keyed by source guarantees one entry per source; `Object.values(...).reduce(...)` sums them. No collision, no merge logic. Example: a merit that is both a Necropolis target AND a Lorekeeper target would carry `{ "lk": 2, "necropolis_sepulcher": 1 }` and contribute 3 free dots total.

**Per-source flag lookup remains per-entry:** if Lorekeeper is `partner_shareable: true` and Necropolis Sepulcher is `partner_shareable: false`, only the Lorekeeper-granted dots flow to a partner's total. The shareable-sum logic in D2 already handles this by iterating entries and checking the per-source rule.

**No edge case** — confirmed by code review of `meritFreeSum` and `domMeritShareableSingle` shapes. The map structurally prevents the bug class where two sources race to write the same field.

### D5 — Future extensibility: `sharing_scope.type` discriminator is the extension point. (Khepri Q5 + Rev 2 refinement)

ADR-005 Rev 2 locks two `type` values: `'partner_explicit'` and `'collective_owners_of_merit'`. Future Collective Compound variants Peter may want — `{ type: 'collective_members_of_covenant', covenant: 'Carthian Movement' }`, `{ type: 'collective_members_of_clan', clan: 'Mekhet' }`, `{ type: 'collective_members_of_bloodline', bloodline: 'Hollow Mekhet' }`, `{ type: 'all_pcs' }` (city-wide standing), `{ type: 'collective_territory_co_owners', role: 'regent' }` — add one new `type` value with their own neighbouring fields.

**Each new `type` must:**
- Preserve the render-time-synthesis invariant (D3) — never persist a synthesised `shared_with`.
- Add a `case` branch to `resolveSharingScope` that returns the synthesised member list (or `null` to fall back to `partner_explicit`).
- Carry its own gate definition in neighbouring fields, NOT overload existing ones (`merit` is for `collective_owners_of_merit`; a future `covenant` is for `collective_members_of_covenant`; do not generalise to `entity_name` or similar — the discriminator's whole point is to keep each variant's shape inspectable).
- Default safely: unknown `type` values log a warning and fall back to `null` (which lets persisted `m.shared_with` carry the sharing — safe degradation).

A scope that requires per-character permission gates (e.g. "Carthians who have signed the Pact") is out of scope until the gate primitive is itself generalised. The discriminator is the extension point; new scopes need their own synthesis function and one `type` value.

**Open question deferred (not blocking):** if a future scope needs cross-character data the server enrichment doesn't ship to players (e.g. private status values), a separate ADR will need to address whether to project additional fields or scope-restrict at the synthesis layer. Not in ADR-005's scope; flagged for awareness.

### D6 — Migration: hybrid with runtime guards; existing channels NOT touched in N-1. (Khepri Q6 + Rev 2 scope reduction per Thoth)

Three migration concerns, each handled differently:

**(a) `rule_grant` schema additions ship ATOMICALLY with the code change in N-1, but ONLY new Collective Compound rule_grant docs (Necropolis) are seeded with the new fields.** Rule docs are seeded reference data, maintained alongside code, not user data. The N-1 PR contains:

- The schema additions to `rule-grant.schema.js`: `partner_shareable: boolean` and `sharing_scope: object` (discriminator-typed).
- The seed of **NEW** Necropolis rule_grant docs (Sepulcher → 6 targets) with `sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 }` and `partner_shareable: false` (Collective Compound is the sharing mechanism; `partner_explicit` doesn't apply).
- **No edits to existing rule_grant docs** (LK / Inv / VM / MCI / PT / OHM / etc.). They retain their pre-Rev-2 shape with no `partner_shareable` or `sharing_scope` fields.

**Per Thoth's deliberate deferral (Rev 2):** the audit of existing LK/Inv/VM/MCI partner_shareable inconsistency — and the latent client/server divergence in `domain.js:48` vs `characters.js:195` that survey caught — is a separate future story (likely MNEC-prerequisite). The investigation is "was the divergence deliberate or accreted? grep + decide" before either path is normalised. N-1 does not pre-judge that decision.

**(b) Existing client/server hardcoded reads stay unchanged in N-1.** `domMeritShareableSingle` keeps its hardcoded `free_mci` inclusion; `characters.js:195` keeps its `free_mci + free_bloodline + free_retainer` enumeration. The new flag-driven path runs in parallel and is consulted **only for rule_grant docs that have `partner_shareable` explicitly set** (i.e. new Collective Compound docs). Reader shape:

```js
function shareableContribution(c, m, rule) {
  // If the rule has the new flag, trust it. Otherwise fall through to legacy hardcoded logic.
  if (rule?.partner_shareable !== undefined) {
    return rule.partner_shareable ? grantAmount(m, rule.source) : 0;
  }
  return legacyHardcodedShareableLookup(m);   // pre-Rev-2 behaviour preserved verbatim
}
```

This is the explicit cost of Thoth's deferral: **the latent divergence persists** until the future audit story. The trade-off is intentional — N-1's blast radius shrinks meaningfully, and the audit gets to investigate intent rather than mechanically normalise.

**(c) Character-data backfill (`m.free_<slug>` → `m.free_grants.<slug>`) is N-2, separately revertible.** Runtime guards make correctness backfill-independent:

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
  The backfill MOVES legacy fields into the map (sets entry, unsets legacy), so post-migration only the map populates and the fallback contributes 0. Pre-migration, only legacy fields populate. Mid-migration partial state is impossible by construction (per-merit update is atomic).

- Write path: evaluators write to `m.free_grants[slug]`, NOT to legacy fields. Any character touched by an evaluator post-N-1 deployment will gain `free_grants` entries; the legacy fields are write-frozen.

**Do NOT gate logic on "has the character backfill run."** Brittle dependency; runtime guards are the contract.

**(d) Idempotent backfill script (N-2)** moves each legacy `m.free_<slug>` to `m.free_grants.<slug>` and unsets the legacy field. Skip on already-migrated docs. Light enough for in-place Render run. Separate PR from N-1 for independent revertibility per the STM-13 discipline ([feedback_bookkeeping_default](memory/feedback_bookkeeping_default.md) precedent). N-2 also includes the `attached_to` normalisation per D7 below.

#### D6 amendment — Allocator write path. (Inline amendment 2026-06-15, authorised by Peter on N-7 dispatch; no Rev bump, mirrors ADR-004's auth-amendment convention.)

Source-merit **allocators** introduced post-N-1 (Necropolis Sepulcher first; future Collective Compound families subsequently) write directly to `m.free_grants[slug]`. They do **NOT** introduce new legacy `m.free_<slug>` flat fields. Existing **LK / Inv / VM** allocators retain their legacy-field writes until the deferred MNEC-prerequisite audit migrates them. **MCI** (N-9 issue #762, Bug 1 "adjacent finding") migrated to the map shape alongside this amendment landing — its `meritBdRow` input now emits `'free_grants.mci'` rather than `'free_mci'`.

Until the LK/Inv/VM migration ships, allocator writes are **heterogeneous by source**:

| Source | Write target | Read | Status |
|---|---|---|---|
| Necropolis Sepulcher (N-7) | `m.free_grants.necro` (map) | union via `meritFreeSum` / `freeOf` | post-N-1 convention |
| MCI (N-9) | `m.free_grants.mci` (map) | union via `meritFreeSum` / `freeOf` | post-N-1 convention |
| Lorekeeper (LK) | `m.free_lk` (legacy flat) | union via `meritFreeSum` / `freeOf` | pre-audit; legacy |
| Invested (INV) | `m.free_inv` (legacy flat) | union via `meritFreeSum` / `freeOf` | pre-audit; legacy |
| Viral Mythology (VM) | `m.free_vm` (legacy flat) | union via `meritFreeSum` / `freeOf` | pre-audit; legacy |

The runtime read-guards (`meritFreeSum` / `freeOf` legacy fallback) absorb the heterogeneity correctly — every read site sees the canonical total regardless of which channel a given value lives in. The handler `shEditMeritPt` accepts the new `field === 'free_grants.<slug>'` shape and routes to the map; the existing `field === 'free_<slug>'` shape continues to route to the flat field for the legacy allocators.

This amendment exists to make the heterogeneity explicit and to set the convention for the next Collective Compound family — there is no Rev bump because Rev 2's D6 already authorised the migration's hybrid shape; the amendment just names the allocator write-path branch of that hybrid.

### D7 — Dual-anchor `attached_to`: coexistence pattern with runtime-guard normaliser. (Rev 2, architecturally novel per Thoth)

Trap Door is structurally a **bridge** between two compounds, not just bookkeeping on a single anchor. It needs to name BOTH:

- **`origin`** — Necropolis Sepulcher (the source merit gating the entrance below).
- **`destination`** — Safe Place (the surface anchor where the entrance physically is).

The existing `attached_to` mechanism (Haven, Mandragora Garden) is single-target — it points at one Safe Place, recorded as a string. The new bridge shape needs two named anchors.

**Decision: coexistence pattern, runtime-guard normaliser, idempotent backfill in N-2.** This mirrors the D6 hybrid-migration discipline: correctness is migration-independent.

```js
// Schema on character.schema.js m.attached_to becomes:
//   string                            (legacy single-target, pre-Rev-2)
//   { destination: string }           (normalised single-target, post-N-2)
//   { origin: string, destination: string }   (bridge, e.g. Trap Door)

// Reader normaliser (single source of truth for downstream reads):
function normaliseAttachedTo(at) {
  if (!at) return null;
  if (typeof at === 'string') return { destination: at };  // legacy form
  return at;                                               // already in object form
}
```

**Read pattern across consumers:** every site that reads `m.attached_to` calls `normaliseAttachedTo(m.attached_to)` and reads from the normalised result. After normalisation:
- `.destination` is always present (this is the load-bearing invariant).
- `.origin` is present only for bridges; consumers that don't care about bridges ignore it.

**Bridge semantics** (Trap Door): the merit's effective rating is gated by the `origin` merit's dots (per the gate-and-share pattern), but the spatial/territorial association is the `destination`. Sharing math (D3) for bridges follows the rule_grant's `sharing_scope` — likely `{ type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher' }` on Trap Door's rule_grant, which gives Trap Door the same Collective Compound sharing as the other six targets. The dual-anchor field is orthogonal to sharing scope; it answers "where is this merit anchored?" not "who shares it?"

**Backfill (N-2):** idempotent script promotes string-form `attached_to` to `{ destination: <string> }`. Skip already-normalised docs. Runs alongside the `free_grants` migration. Correctness is not gated on the backfill — the reader normaliser handles both shapes natively.

**Why coexistence rather than mandate one shape:**
- Pre-N-2 character docs ship to clients with legacy string-form `attached_to`. The reader normaliser absorbs them with zero risk.
- The shape change cannot be atomic across all character docs (Render deploy timing, third-party caches). Coexistence is the only safe contract.
- The normalised object form is the future direction; the string form is a tombstone the backfill removes at its leisure.

**Why a single `destination` field rather than promoting `attached_to` itself to be the `destination`:**
- Symmetry. `{ destination, origin }` reads as "this is the named-anchor shape, with these two named anchors." Promoting `attached_to` to be the destination string would make bridges express their origin via `attached_to_origin` or similar — splitting one concept across two fields.
- The bridge concept might grow more anchors in future (e.g. waypoints, conditional anchors). A single object with named fields scales; ad-hoc sibling fields do not.

**Why NOT a separate field for bridges** (e.g. `bridge_to: { origin, destination }` while `attached_to` keeps its string semantics):
- Two fields for one concept invites the "which field should I read?" question at every consumer. Coexistence under a single field with a normaliser is the cleaner contract.
- The migration is symmetric: every consumer already touches `attached_to` once; adding a second field doubles the surface.

## Story impact map

| Concern | Decision | Stories | Required work |
|---|---|---|---|
| Channel shape | D1, D4 | N-1 | Add `m.free_grants` to character schema. Refactor `meritFreeSum`, `domMeritTotal`, costFromTotalSingle in `domain.js` and `merits.js` to read from the map (with legacy fallback for unmigrated chars). Update each pool/auto-bonus evaluator to write to `free_grants[slug]` rather than `free_<slug>`. Both new-map writes AND legacy-field reads coexist (D6 runtime guard) until N-2 lands. **`domMeritShareableSingle` is NOT touched in N-1** — it stays on its hardcoded `free_mci` inclusion per D6(b). |
| Partner-shareable flag | D2 | N-1 (schema only) | Add `partner_shareable: boolean` to `rule-grant.schema.js`. Seed **only new Collective Compound rule_grant docs** (Necropolis) with explicit `partner_shareable: false`. Existing rule_grant docs (LK/Inv/VM/MCI/PT/OHM/etc.) are NOT edited — Thoth's deliberate deferral (D6 Rev 2). Hardcoded client/server reads unchanged. The latent `domain.js:48` vs `characters.js:195` divergence persists until the future audit story. |
| Sharing-scope generalisation | D3, D5 | N-1 | Add `sharing_scope: object` (discriminator-typed) to `rule-grant.schema.js`. Implement `resolveSharingScope(scope, c, chars, rule)` with day-one `switch` on `scope.type` covering `'partner_explicit'` (legacy passthrough) and `'collective_owners_of_merit'` (synthesise). Extend `applyDerivedMerits` to take chars context. Add collective-owners synthesis function (pure; usable from both client and server). Server enrichment in `characters.js` extended to synthesise `_collective_shared_with` alongside existing `_partner_dots`. The synthesised field is render-time-only; `buildSaveBody` strips `_`-prefixed fields per ADR-004 §D13 convention. |
| Dual-anchor `attached_to` | D7 | N-1 (schema + reader) + N-2 (backfill) | Schema accepts string OR object; reader normaliser `normaliseAttachedTo(at)` is the single source of truth — every consumer reads `.destination` (always present post-normalisation) and optionally `.origin`. Backfill in N-2 promotes legacy strings to `{ destination: <string> }`. Correctness migration-independent. |
| `rule_grant` doc updates | D6(a) | N-1 (atomic, scoped) | Seed migration ships with the code, **scoped to NEW Collective Compound docs only**. Test verifies Necropolis collective sharing works end-to-end (member count, target merit synthesis, non-member exclusion). No tests on existing LK/Inv/VM/MCI behaviour — out of N-1 scope per Thoth defer. |
| Character data backfill | D6(c),(d) + D7 backfill | N-2 | Idempotent script moves `m.free_<slug>` → `m.free_grants.<slug>` and unsets legacy field. Also normalises string-form `m.attached_to` to `{ destination: <string> }`. Skip already-migrated docs. Separate PR for revertibility. Runtime guards in N-1 make timing irrelevant. |
| Necropolis seed data | (uses D1–D7) | N-3 | Add 9 Necropolis merits to MERITS_DB. Create rule_grant docs for Sepulcher → 6 targets with `sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 }` and `partner_shareable: false`. **True Worm is excluded from the rule_grant set** — mechanically independent of Sepulcher per Thoth; lives in the merit family for thematic grouping only. No code changes — purely seed + reference data. |
| White Ants territory link | (uses D3) | N-4 | UI/data linkage between the White Ants merit and territories. Specifics per Necropolis spec; collective synthesis from N-1 already covers the sharing. |
| Trap Door + collective-aware UI | D3 + D7 | N-5 | Trap Door uses `attached_to: { origin: 'Necropolis Sepulcher', destination: <Safe Place> }` (D7 dual-anchor) and rides Collective Compound sharing via the Sepulcher rule_grant. STM-12-style panel updates for collective-shared merits — read-only `shared_with` display when scope is collective; player cannot edit the synthesised list. Panel surfaces both `.origin` and `.destination` distinctly. |
| Retrofit Lorekeeper / Invested / VM / MCI evaluators | D1 | N-6 (optional) | If N-1 bundles all evaluator writes into the map (recommended), N-6 is not needed. If N-1 ships only the schema + read-path changes and defers the evaluator-write refactor for risk staging, N-6 covers each evaluator individually. **Recommendation: bundle into N-1.** Smaller surface; runtime guards already cover the transitional state. Note: this is the channel-map retrofit only; the `partner_shareable` audit for these same evaluators is a SEPARATE deferred story per D6 Rev 2. |
| Future audit: existing partner_shareable inconsistency | (preserves Concerns #1 finding) | MNEC-prerequisite (separate, not in this dispatch) | Per Thoth defer (Rev 2 D6): grep + audit whether the LK/Inv/VM/MCI partner_shareable inconsistency is deliberate or accreted, then either seed the existing rule_grant docs with `partner_shareable` flags and migrate the hardcoded `domMeritShareableSingle` / `characters.js:195` reads to consult the flag, OR document the intentional asymmetry. Not in N-1..N-6. |

## Non-decisions (explicitly out of scope)

- **Generalising the `m.free` (unprefixed) channel.** It is player-allocated, not rule-engine-granted. Stays at `m.free`. Sum it separately in `meritFreeSum`.
- **Status sources joining the slug registry.** PT/OHM/MCI are standings, not merits, but their slug-based channel keys treat them uniformly with merit-sourced grants (LK, Inv, etc.). No new registry; the slug is opaque.
- **Persisted collective shared_with.** D3 explicitly forbids persisting the synthesised list. A future ADR may revisit if a performance issue surfaces.
- **Covenant/clan/all_PCs sharing scopes.** D5 frames these as future `sharing_scope.type` discriminator values, out of scope for ADR-005. Each future scope is a separate PR with its synthesis function and one new `type` entry.
- **Per-character permission gates** on collective sharing (e.g. "only Carthians who have signed the Pact share"). Requires a gate primitive that does not exist; out of scope.
- **`rule_grant` doc consolidation across grant_type.** This ADR only touches `partner_shareable`, `sharing_scope`, and dual-anchor `attached_to` additions. Other grant_type variations stay as-is.
- **Migration of the rules cache itself.** The rules cache is reloaded on rule_grant updates via `preloadRules()`; no separate migration story is needed for cache invalidation.
- **Audit of existing LK/Inv/VM/MCI/PT/OHM/etc. partner_shareable inconsistency** (Rev 2, per Thoth's deliberate defer). The latent client/server divergence at `domain.js:48` vs `characters.js:195` is documented in this ADR as a finding but is NOT resolved in N-1. A separate future story (MNEC-prerequisite) will grep the codebase, audit whether the inconsistency is deliberate or accreted, and decide whether to seed existing rule_grant docs with explicit `partner_shareable` flags or document the intentional asymmetry. N-1 only touches NEW Collective Compound rule_grant docs.
- **True Worm Collective Compound participation** (Rev 2). True Worm is mechanically independent of Necropolis Sepulcher per Thoth; it has no `sharing_scope` rule_grant binding it to Sepulcher's collective. It lives in the Necropolis merit family for thematic grouping only. N-3 seeds it as a standalone MERITS_DB entry with no rule_grant docs.

## Concerns and watch-items for implementers

1. **Latent client/server divergence DOCUMENTED, NOT resolved in N-1 (Rev 2).** `domMeritShareableSingle` (client, `domain.js:48`) and the partner-dots enrichment (server, `characters.js:195`) currently disagree on which free_* channels are partner-shareable — survey caught it; D2 *could* fix it as a side effect. Per Thoth's deliberate defer (Rev 2 D6), N-1 does NOT touch this. The divergence persists; the future audit story (MNEC-prerequisite) decides whether to normalise the asymmetry or document it as intentional. **Implementers must NOT silently "fix" the hardcoded subsets in N-1** — doing so changes live behaviour without the investigation Thoth wants. If the divergence is normalised, it happens in the audit story, not here.

2. **Slug stability.** The map keys are the existing channel slugs (`lk`, `inv`, `vm`, `mci`, etc.). Renaming a slug after N-1 ships requires a data migration. Treat slugs as a stable API; new sources allocate new slugs, never rename existing ones.

3. **Synthesised `shared_with` must be strippable on save.** Per ADR-004 §D13 / Concerns #5 pattern: any field written by the rule engine and read by render must NOT leak into PUT bodies. `buildSaveBody` already strips `_`-prefixed fields. **N-1 contract:** write Collective Compound synthesis into a dedicated `_collective_shared_with` field; persisted `shared_with` is always the explicit list. Sharing math reads `m.shared_with ?? m._collective_shared_with`. Two fields, clear semantics, save path strips the underscore one. Do NOT mutate `m.shared_with` for collective scope — that would risk a stale synthesised list persisting if the strip is missed.

4. **MCI regression risk is OUT of N-1 scope per Thoth defer (Rev 2).** ~~Currently `domMeritShareableSingle` hardcodes `free_mci` into the shareable sum. Post-D2, if the MCI rule_grant doc is not seeded with `partner_shareable: true`, MCI-granted domain merits silently stop contributing to partner totals.~~ **Updated for Rev 2:** the hardcoded `free_mci` inclusion stays in N-1. The MCI rule_grant doc is not edited in N-1. The future audit story (MNEC-prerequisite) decides whether to seed MCI with `partner_shareable: true` and migrate the hardcoded read to flag-driven; that's where the regression test lives. **N-1 acceptance instead verifies:** existing LK/Inv/VM/MCI behaviour is unchanged after N-1 ships (regression test: spot-check that an MCI-granted domain merit still contributes to partner total exactly as it did pre-N-1).

5. **Cross-character context in `applyDerivedMerits`.** Today the function takes a single character. D3 collective synthesis requires the full chars array. Two API shapes:
   - Pass chars array as second arg: `applyDerivedMerits(c, chars)`. Caller bears the load; most caller sites already have it.
   - Two-pass: orchestrator iterates chars once to find collective owners, then per-character apply. Cleaner, but requires reshaping the caller (`app.js:553`, etc.).
   N-1 picks; my lean is the explicit second-arg form for clarity. The function name `applyDerivedMerits` becomes slightly misleading (it now considers more than one character's context) but the alternative — renaming — ripples through more sites than the second-arg addition. Leave the name; add the parameter.

6. **Player-portal Collective Compound synthesis on the server.** The existing `_partner_dots` enrichment (`characters.js:155-200`) demonstrates the pattern. For Collective Compound scope, the server must additionally compute `_collective_shared_with` for each affected merit. The server already projects `{ name: 1, merits: 1 }` from partners; the same projection covers Collective Compound synthesis (the source merit and target merits are all in the projection). No new database round-trip if the implementation reuses the existing fetch.

7. **Necropolis seed depends on N-1.** N-3 (Necropolis merit family) cannot ship before N-1 because the `sharing_scope` discriminator-typed schema does not exist pre-N-1. STM-12-style pinning: if Thoth wants to ship Necropolis seed data eagerly, the rule_grant docs can be staged on a feature branch but cannot be seeded into the live rules cache before N-1 merges. Recommend Khepri pins this as a dispatch gate.

8. **The `free` (unprefixed) channel is intentionally NOT migrated.** Implementers may be tempted to fold `m.free` into the map for symmetry. Don't — see Non-decisions §1. It represents player-allocated dots, not engine-granted, and has different semantics on edit (player UI binds to `m.free` directly).

9. **Watch for hardcoded slug enumerations beyond `domain.js` / `merits.js`.** The survey found enumerations also in: `costFromTotalSingle` (lines 261-264 of domain.js), and the partner-enrichment in `characters.js`. Grep for `free_lk`, `free_inv`, `free_vm`, `free_mci` across the codebase before N-1 lands. The migration is "wherever you find the channel enumerated, replace with the map iteration." **Note:** N-1 channel-map retrofit changes the *enumeration* sites but does NOT change the `partner_shareable` subset logic at `domain.js:48` or `characters.js:195` — those stay on the hardcoded subset per Rev 2 D6(b).

10. **Multi-source Collective Compound + Lorekeeper interaction (D4 verification, post-Rev-2 scope).** A single Herd merit might receive grants from both Lorekeeper and Viral Mythology. After D1 the map will have `{ "lk": 2, "vm": 1 }` and the FREE-SUM is 3. **The partner-contribution test for this case lives in the future audit story**, not N-1, because LK/VM partner_shareable flags are not seeded in N-1. N-1's D4 verification is narrower: confirm that two grants from different sources sum correctly in `meritFreeSum` (3, not 2 or 0); partner-contribution behaviour is unchanged from pre-N-1 (still uses the hardcoded subset, which excludes both LK and VM).

11. **D7 reader normaliser is the single source of truth.** Every consumer of `m.attached_to` must go through `normaliseAttachedTo(at)` and never read the raw field. Bypassing the normaliser means consumer A sees a string and consumer B sees an object — exactly the divergence pattern that bit `domMeritShareableSingle` vs `characters.js:195`. **Code review on N-1:** grep for `\.attached_to` and verify every read goes through the normaliser. The normaliser itself is a 3-line function; extract it once, import everywhere.

12. **D7 bridge sharing semantics.** Trap Door's `attached_to.origin` is Necropolis Sepulcher (the source gating the entrance below). The merit's COLLECTIVE SHARING (D3) is determined by its rule_grant's `sharing_scope`, not by `attached_to`. These are two orthogonal axes — bridge anchoring is structural ("where is this merit") and sharing scope is membership ("who shares it"). Implementers must not infer sharing from `attached_to.origin`. N-3's rule_grant docs explicitly bind Trap Door's sharing to Sepulcher via `sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher' }`.

## Resolutions table

| Decision | Status | Resolution |
|---|---|---|
| D1 | resolved (Rev 1) | replace 14 flat `m.free_*` channels with single `m.free_grants: { slug: amount }` map; keys are existing channel slugs (mci, lk, inv, vm, pt, ohm, mdb, sw, fwb, bloodline, pet, retainer, attache, carthian); `m.free` unprefixed channel preserved separately |
| D2 | resolved (Rev 1, scope-reduced Rev 2) | `rule_grant.partner_shareable: boolean` (default false on read); shareable-sum schema exists in N-1 but the flag is consulted ONLY for new Collective Compound rule_grant docs; existing hardcoded reads at `domain.js:48` and `characters.js:195` are unchanged in N-1 per Thoth defer; latent client/server divergence persists until future audit story |
| D3 | resolved (Rev 1, refined Rev 2) | `rule_grant.sharing_scope` is a **discriminator-typed object** `{ type, ...neighbouring fields }` not a flat enum string; Rev 2 locks two `type` values: `'partner_explicit'` (default on read) and `'collective_owners_of_merit' { merit, min_dots }` (first Collective Compound instance); collective synthesis is render-time-only at three entry points (admin/ST client via `applyDerivedMerits`, suite via boot path inheritance per ADR-004 §D8, player portal via `characters.js` enrichment); synthesised list written to dedicated `_collective_shared_with` field, never to persisted `shared_with` |
| D4 | resolved (Rev 1) | multi-source contributions sum natively via map; per-source flag lookup remains per-entry; no merge logic needed |
| D5 | resolved (Rev 1, refined Rev 2) | future scopes added by extending the `sharing_scope.type` discriminator with new values carrying their own neighbouring fields (NOT overloading existing ones); render-time-synthesis invariant must be preserved; `resolveSharingScope` dispatches on `type` from day one |
| D6 | resolved (Rev 1, scope-reduced Rev 2 per Thoth) | hybrid: (a) rule_grant schema additions atomic with N-1 code, BUT only NEW Collective Compound docs are seeded; (b) existing client/server hardcoded reads unchanged in N-1, the flag-driven path runs in parallel only for docs that set it; (c)(d) character-data backfill (`free_grants` map + `attached_to` normalisation) separately revertible in N-2; runtime guards make all character migration timing-independent; existing LK/Inv/VM/MCI inconsistency audit deferred to future MNEC-prerequisite story |
| D7 | resolved (Rev 2) | dual-anchor `attached_to`: coexistence pattern accepts string (legacy single-target) OR object `{ origin?, destination }`; `normaliseAttachedTo(at)` is the single source of truth — every consumer reads via the normaliser, `.destination` always present post-normalisation, `.origin` present only for bridges; idempotent backfill in N-2 promotes strings to `{ destination: <string> }`; bridge sharing semantics orthogonal to anchoring (governed by `sharing_scope`, not `attached_to`) |

## Sign-off

**Rev 2 approved.** Seven decisions (D1–D7). Six new stories (N-1 through N-6) span the generalisation and the first Collective Compound instance. The existing LK/Inv/VM/MCI `partner_shareable` audit is explicitly OUT of this dispatch per Thoth's defer; it queues as a future MNEC-prerequisite story.

Recommended dispatch sequence (unchanged from Rev 1 except for scope reductions inside each story):

- **N-1 — Schema + evaluator + render math + Collective Compound seed + D7 reader normaliser.** Foundation. Atomic with NEW Collective Compound rule_grant seed only (D6 Rev 2 — existing rule_grant docs NOT edited). Includes the channel-map evaluator retrofit (LK/Inv/VM/MCI evaluators write to `free_grants[slug]`; the partner_shareable hardcoded subsets stay). Includes the `normaliseAttachedTo` reader. **PROCEED.**
  - Acceptance gates for Rev 2 (must all pass):
    - **Concern #4 (Rev 2 reframe):** existing LK/Inv/VM/MCI behaviour is unchanged after N-1 ships — spot-check that an MCI-granted domain merit still contributes to partner total exactly as it did pre-N-1.
    - **Concern #10 (Rev 2 reframe):** two grants from different sources sum correctly in `meritFreeSum` (`{lk: 2, vm: 1}` → 3). Partner-contribution behaviour for the same case is unchanged from pre-N-1 (the LK/VM partner_shareable question is deferred).
    - **Concern #6:** server enrichment covers Collective Compound `_collective_shared_with` synthesis without an extra DB round-trip.
    - **Concern #11:** every read of `m.attached_to` goes through `normaliseAttachedTo` — grep verified.
    - **Concern #7:** Necropolis seed gated on N-1 merge before it can land in the live rules cache.
    - End-to-end Collective Compound test: with a Necropolis Sepulcher rule_grant seeded, two characters with ≥1 dot of Sepulcher and a Catacombs merit each see synthesised `_collective_shared_with` listing the other; a third character with no Sepulcher dots sees no collective sharing.

- **N-2 — Character-data backfill script.** Idempotent move from `m.free_<slug>` to `m.free_grants.<slug>` AND `attached_to` string-to-object normalisation. Separate PR for revertibility. **PROCEED.** Parallelisable with N-3, N-4, N-5 since runtime guards in N-1 mean character data correctness is backfill-independent.

- **N-3 — Necropolis merit family seed.** Depends on N-1 (sharing_scope discriminator schema must exist in production rules cache). MERITS_DB entries (9 merits including True Worm as standalone) + rule_grant docs (Sepulcher → 6 targets with `sharing_scope: { type: 'collective_owners_of_merit', merit: 'Necropolis Sepulcher', min_dots: 1 }`). True Worm has no rule_grant — mechanically independent. **PROCEED.**

- **N-4 — White Ants territory linkage.** Depends on N-3 (Necropolis merits must exist). UI/data linkage between the White Ants merit and territories. **PROCEED.**

- **N-5 — Trap Door dual-anchor + collective-aware sharing UI.** Depends on N-3 (Necropolis merits) and N-1 (sharing_scope synthesis + D7 normaliser). Trap Door uses `attached_to: { origin: 'Necropolis Sepulcher', destination: <Safe Place> }`. STM-12-style panel updates for collective-shared merits — read-only `shared_with` display when scope is collective; player cannot edit the synthesised list. Panel surfaces both `.origin` and `.destination` distinctly. **PROCEED.**

- **N-6 — Optional channel-map evaluator retrofit story.** SKIP if N-1 bundles the evaluator writes (recommended). Reserved as a contingency if N-1's scope grows too large and the evaluator-write changes are deferred for risk staging. **Note:** this is the channel-map retrofit only; the `partner_shareable` audit for those same evaluators is a SEPARATE deferred story (MNEC-prerequisite) per Rev 2 D6.

**Dispatch order:** N-1 first (foundation). N-2 parallelisable after N-1 (no inter-dependency). N-3 after N-1. N-4 and N-5 parallelisable after N-3.

**HALT-DAR vs PROCEED:** all PROCEED. The Concerns section pins the gates; SM brief must cite Concern #1 (DO NOT silently fix the hardcoded subsets in N-1 — defer to audit), Concern #4 (regression test that existing behaviour is unchanged), and Concern #11 (D7 normaliser is the single source of truth) verbatim.

**Open dissent window:**

The Rev 2 consequential decisions are:
- **D3 refined shape** (discriminator-typed object vs flat enum string) — already locked by Thoth with Peter.
- **D6 scope reduction** (existing channels NOT touched in N-1) — already locked by Thoth with Peter.
- **D7 coexistence pattern** (string OR object, normaliser bridges) vs alternatives (e.g. mandate object-form immediately + atomic migration).

If Ptah or Angelus prefer an alternative D7 shape — e.g. separate `bridge_to` field rather than coexistence under `attached_to`, or mandate-and-migrate rather than coexistence — raise here before N-1 dispatches. D1/D2/D4/D5 carry forward from Rev 1's dissent window unchanged.
