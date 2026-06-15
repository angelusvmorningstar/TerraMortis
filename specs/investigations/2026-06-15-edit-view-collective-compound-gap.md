---
date: 2026-06-15
author: Imhotep (Architect)
purpose: Investigation report — three items dispatched by Khepri 2026-06-15
related:
  - specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md (Rev 2)
  - specs/epic-mnec-necropolis-merits.md
  - server/scripts/seed-rules-necropolis.js (N-3 seed; merged)
  - public/js/data/rules-helpers.js (N-1 helpers; normaliseAttachedTo, freeOf, meritFreeSum)
  - public/js/editor/xp.js:204-225 (meritBdRow — existing LK/Inv/VM allocator surface)
  - public/js/editor/edit.js:992-1040 (shEditMeritPt — pool-cap enforcement on writes)
  - public/js/editor/sheet.js:99-134 (_renderPoolCounters — read-only pool summary)
  - public/js/editor/sheet.js:1020-1031 (existing attached_to picker for Haven / Mandragora)
  - public/js/editor/merits.js:399-441 (Fucking Thief mechanism: _everyPrereqPathRequiresCarthian + buildFThiefOptions)
  - public/js/editor/edit-domain.js:120-133 (FT qualifier-change cascade)
  - public/js/data/prereq.js (prereq DSL evaluator; { all, any } combinators)
  - server/schemas/purchasable_power.schema.js (prereqNode recursion schema)
  - server/routes/rules.js:70-76 (UPDATABLE_FIELDS — prereq is updatable)
  - Concurrent: Ma'at's prereq-filter cluster (Item 4 — strict prereq filter / FT carve-out)
---

# Investigation — Editor compound-dot allocator gap, Mandragora amendment, Necropolis attached-feat rules-engine audit

## Overview and verdicts

| Item | Verdict | ADR impact |
|---|---|---|
| 1 — Editor compound-dot allocator UX gap | **Gap confirmed.** Sepulcher's pool is computed and displayed via `_renderPoolCounters`, but no allocator UI writes ST intent into target merits' `free_grants.necro`. LK/Inv/VM have allocator inputs at `xp.js:204-225` writing to legacy flat fields (`free_lk` / `free_inv` / `free_vm`); the precedent exists, the new shape doesn't. | **ADR-005 amendment recommended** (small): codify which write path the new allocator uses — see §1.4. Otherwise pure story. |
| 2 — Mandragora prereq amendment + attached_to expansion | **No primitives extension required.** Prereq DSL already supports nested OR-of-AND via `{ all, any }` combinators. Fucking Thief mechanism is qualifier-based (no slot counter — one stolen merit per character, qualifier-change cascades a delete/add). `attached_to` shape needs no migration: a picker-options expansion at `sheet.js:1021` is the cheapest fix. Single open question for Peter: single-picker-with-multiple-options (recommended) vs dual-anchor (not recommended). | **No ADR amendment.** Pure data + UI story. |
| 3 — Rules engine representation for "attached" Necropolis feats | **No change needed.** The N-3 Necropolis rule_grant seed at `server/scripts/seed-rules-necropolis.js:228-253` is sufficient: `source_slug: 'necro'`, `sharing_scope.type: 'collective_owners_of_merit'`, `partner_shareable: true`. Mandragora-Necropolis association is an `attached_to` picker concern (§2.4), orthogonal to sharing scope. | **No ADR amendment.** |

**ADR boundary crossing:** Item 1 §1.4 is the only crossing. Items 2 and 3 stay inside ADR-005 Rev 2's existing decisions.

---

## Item 1 — Editor compound-dot allocator UX gap

### 1.1 Confirmation of the gap

The render-time half of the Collective Compound feature works end-to-end as ADR-005 D3 specified. The N-1 merge wired `applyPoolRulesFromDb` in `pool-evaluator.js` to read the seeded Necropolis rule_grant and push a `_grant_pools` entry with `category: 'necro'`. `_renderPoolCounters` in `sheet.js:99-134` displays the pool-utilisation summary ("Necropolis: X/Y dots allocated").

The **write half** — how an ST tells the system "spend 2 of Sepulcher's free dots into Catacombs" — does not exist. The pool counters read from `m.free_grants.necro` on target merits (after migration via N-2) or `m.free_necro` (pre-migration legacy slot), but **no editor input writes those fields for the Necropolis target merits**. The pool exists in memory, the display works, but the ST cannot allocate the dots.

This was scope-deferred from N-3/N-4/N-5: those stories shipped the seed, the territory linkage, and Trap Door's dual-anchor display, but the per-target stepper UI was not in any of their acceptance criteria.

### 1.2 The existing LK/Inv/VM allocator pattern

`public/js/editor/xp.js:204-225` — function `meritBdRow` — renders per-merit "breakdown rows" that include conditional allocator inputs:

```
LK input  (line 217)  — onchange="shEditMeritPt(..., 'free_lk', ...)"     when opts.showLK
INV input (line 219)  — onchange="shEditMeritPt(..., 'free_inv', ...)"    when opts.showINV
VM input  (line 216)  — onchange="shEditMeritPt(..., 'free_vm', ...)"     when opts.showVM
```

The handler `shEditMeritPt` at `edit.js:1013-1029` caps each edit against the remaining pool (computed inline from `c._grant_pools` minus `m.free_<slug>` summed across other merits). The capping logic is per-source, hardcoded — adding a new source today requires extending the `meritBdRow` arg list, extending the handler's cap-branch, and threading `showNECRO: bool` through the call sites at `sheet.js:1033`.

**Trigger for the allocator's visibility:** the `showLK` / `showINV` / `showVM` flag is set per call site, based on whether the target merit is in the source's `pool_targets` list AND the character has the source merit. For Necropolis, the analogous check would be `hasNecropolisSepulcher(c) && NECRO_TARGETS.includes(m.name)`. (This is already encoded in the rule_grant doc as `pool_targets`; no need to hardcode it again — `rules-helpers.js` can expose a lookup.)

### 1.3 Allocator UX shape recommendation

A per-target stepper input, identical in shape to the existing LK/Inv/VM inputs, mutating the slug-keyed map entry. Concretely on each of the six Necropolis target merits (Catacombs / Caldarium / Garbage Pit / Labyrinth Guardians / Dark Temple / White Ants):

- A new breakdown-row input rendered when `hasNecropolisSepulcher(c) === true`.
- The input represents that target merit's "consumed share" of `free_grants.necro` — i.e. how many of the Sepulcher pool dots have been allocated to this target.
- Cap: same shape as LK's, computed from `c._grant_pools` minus the sum of `free_grants.necro` across the six targets. (Generalise the cap helper if possible — see §1.4 ADR question.)
- Side-effect on save: the value lands in `m.free_grants.necro` (post-N-1 map shape). The pool counter at `sheet.js:99-134` re-renders to show the new totals.

**Per-target stepper, not aggregate.** Peter's framing implies the ST wants to direct dots into specific targets, not auto-distribute. The aggregate "spend N dots into Necropolis" pattern would force a second UI step ("now pick where"), doubling the click count. The LK precedent (per-target inputs) is the right pattern.

### 1.4 ADR-005 amendment recommendation: codify the allocator write path

This is the single architectural decision worth a small ADR-005 amendment. The question:

> Does the new Necropolis allocator write to `m.free_grants.necro` (the post-D1 map shape) directly, or to a legacy `m.free_necro` flat field that N-2's character-data backfill later migrates?

**Recommendation: write directly to `m.free_grants.necro`** (the map shape), even pre-N-2. Reasons:

- N-1 already implemented the map and the runtime guards (`m.free_grants ?? {}` reads, legacy-field fallback in `meritFreeSum`). Writing the map directly is fully supported as of N-1.
- The legacy `m.free_<slug>` flat-field path is being phased out; adding a new flat field (`m.free_necro`) for a NEW pool would be adding tech debt knowing it'll be migrated.
- The LK/Inv/VM allocator inputs at `xp.js:217-225` are unchanged by N-1 — they still write to legacy flat fields, because their N-2 backfill hasn't run yet. **That's the pattern that pays the bigger debt: code shipped post-N-1 doesn't need to inherit it.**
- The cap-computation helper (currently inline at `edit.js:1020`) should be extracted into `rules-helpers.js` as `poolAvailableFor(c, slug)` — generalises trivially, and the new allocator + the eventual LK/Inv/VM refactor both consume it.

**Suggested amendment text** (one-paragraph addition under ADR-005 D6 or as a new D8):

> *Allocator write path.* Source-merit allocators introduced post-N-1 (Necropolis Sepulcher first; future Collective Compound families subsequently) write directly to `m.free_grants[slug]`. They do NOT introduce new legacy `m.free_<slug>` flat fields. Existing LK/Inv/VM allocators retain their legacy-field writes until the MNEC-prerequisite audit story (the future LK/Inv/VM/MCI partner_shareable cleanup) migrates them as part of its same touch. Until that migration, allocator writes are heterogeneous by source — legacy flat for the four legacy compounds, map for everything from Necropolis onward. The runtime read-guards (`meritFreeSum` legacy fallback) absorb the heterogeneity correctly.

This is a one-paragraph addition, not a Rev 3 — it's a clarification of an N-1 implementation question that the original Rev 2 left implicit. **Khepri's call** whether to land it as an ADR-005 inline amendment (per the "small local amendments" convention) or as a separate ADR-006. My lean: inline amendment, no Rev bump, mirroring the auth-amendment convention in ADR-004.

### 1.5 Story shape and dependencies

- **New story (call it N-7 — Editor compound-dot allocator):**
  - Add `hasNecropolisSepulcher(c)` to `rules-helpers.js`.
  - Add `poolAvailableFor(c, slug)` to `rules-helpers.js` (extracts the inline cap logic at `edit.js:1020`, generalises across source slugs).
  - Add `NECRO_TARGETS` lookup that consults the rule_grant doc rather than hardcoding (read once at boot from rules cache; cache the array).
  - Extend `meritBdRow` (xp.js:204-225) with a `showNECRO` option that renders a per-target stepper when set.
  - Extend `shEditMeritPt` (edit.js:992-1040) to accept the slug-keyed map path (`free_grants.necro`) as a write target, with cap enforcement via `poolAvailableFor`.
  - Extend `sheet.js:1033` (the meritBdRow call sites) to compute and pass `showNECRO` on the six Necropolis target merits.
  - Existing `_renderPoolCounters` already covers the read-only summary; no change there.
  - **Acceptance:** with Sepulcher at 3 dots, ST opens Catacombs; can spend 0–3 dots; cap prevents exceeding the pool; allocation persists; the pool counter updates; deactivating Sepulcher (rating → 0) does NOT delete already-allocated map entries (the over-allocation is visible as negative pool — same as the LK precedent's behaviour when a Lorekeeper rating drops).
  - **Dependency:** N-1 (merged). No dependency on N-2 (the map writes are supported by the read-guards even pre-backfill).

- **Optional follow-up (call it N-7b — extract pool helpers):** the `poolAvailableFor` extraction + N-1's `freeOf` helper give the future MNEC-prerequisite audit story a clean migration target for LK/Inv/VM/MCI. Not in N-7's critical path; recommend bundling.

---

## Item 2 — Mandragora Garden prereq amendment + attached_to expansion

### 2.1 Prereq DSL — sufficient as-is

The proposed amendment is:

> `{Safe Place OR Necropolis Sepulcher} AND {Crúac 1 OR Fucking Thief}`

The prereq DSL in `public/js/data/prereq.js:38-147` already supports nested OR-of-AND via `{ all, any }` combinators. The schema in `server/schemas/purchasable_power.schema.js:22-63` validates recursion up to 3 levels — well within the 2 levels this shape requires.

**Draft prereq_json block for Mandragora Garden:**

```json
{
  "all": [
    {
      "any": [
        { "type": "merit", "name": "Safe Place", "dots": 1, "qualifier": "same level" },
        { "type": "merit", "name": "Necropolis Sepulcher", "dots": 1 }
      ]
    },
    {
      "any": [
        { "type": "discipline", "name": "Crúac", "dots": 1 },
        { "type": "merit", "name": "Fucking Thief" }
      ]
    }
  ]
}
```

Notes on the block:

- The `"same level"` qualifier on Safe Place is the existing sentinel pattern (per `server/tests/prereq-same-level-sentinel.test.js`). The Necropolis Sepulcher branch does NOT inherit this sentinel — Sepulcher's dot count gates membership in the Collective Compound but does not constrain Mandragora's level. If Peter wants Sepulcher to also gate Mandragora's level, add `"qualifier": "same level"` to the Sepulcher leaf. **Open question for Peter.**
- The `Fucking Thief` leaf intentionally has no `dots` field — see §2.3 on the FT mechanism. The check is "merit present," not "merit at N dots."
- `prereq` is in the `UPDATABLE_FIELDS` allowlist at `server/routes/rules.js:70-76`. The amendment is a single PUT to `/api/rules/mandragora-garden`.

### 2.2 Carthian-gating note (orthogonal)

The Fucking Thief mechanism is Carthian-only (per Peter's framing), but the gate on FT's own purchase lives on the FT merit's prereq, NOT on Mandragora's. Mandragora's prereq amendment does NOT need to redundantly check Carthian status — if a non-Carthian somehow had FT, they would still qualify for Mandragora via the FT branch (and that would be FT's prereq bug to surface, not Mandragora's).

### 2.3 Fucking Thief mechanism — no "unspent slot" tracker

Critical finding for Peter's framing: **there is no "slot used / slot available" state on Fucking Thief.** The FT merit instance carries a `qualifier` field holding the name of the merit that was stolen. The mechanism at `edit-domain.js:120-133` cascades any qualifier change as a delete-of-prior + add-of-new on the stolen-merit row.

Consequences for the Mandragora amendment:

- **The prereq check `{ type: 'merit', name: 'Fucking Thief' }` passes for any character carrying the FT merit, regardless of whether their qualifier is currently set to Mandragora, to something else, or unset.** This is the "permissive" interpretation.
- A "strict" interpretation — "FT slot must be set to Mandragora" — would require a custom prereq node type (e.g. `{ type: 'merit_qualifier', name: 'Fucking Thief', qualifier_equals: 'Mandragora Garden' }`) or a sentinel like the `"same level"` precedent. **The DSL does NOT have this primitive today.** Adding it would be a small extension to `prereq.js` — 5-10 lines — but is a real new type.
- **My recommendation:** ship the permissive interpretation. Reasons:
  - The FT mechanism enforces single-qualifier exclusivity by deleting prior stolen-merit rows on qualifier change. A player with FT.qualifier = "Striking Looks" who tries to buy Mandragora via the FT branch is making a mechanical choice the ST can review; the editor doesn't need to enforce it inline.
  - Adding a `merit_qualifier` prereq primitive is a new ADR-relevant axis (it adds inspection of merit *fields* beyond presence/dots). If a strict gate becomes needed, that's a separate ADR.
  - Ma'at's parallel prereq-filter cluster (Item 4 of her brief) will surface whether the permissive interpretation creates user confusion in practice. **Recommend coordinating with her — she may discover the strict interpretation is needed for filter consistency; if so, raise the primitive as ADR-006.**

### 2.4 attached_to expansion — single-picker option-set, not dual-anchor

The current `attached_to` shape — string-or-`{destination}`-or-`{origin, destination}` — has three consumers:

- **Haven** (legacy string): picker at `sheet.js:1020-1025` filters `c.merits.filter(sp => sp.name === 'Safe Place')`. Single destination.
- **Mandragora Garden** (legacy string, post-N-1 normalised on read): same picker as Haven. Single destination.
- **Trap Door** (dual-anchor): picker at `edit-domain.js:396-410`. `{origin, destination, territory}`.

Peter's ask — Mandragora `attached_to` should accept Necropolis Sepulcher as a destination option alongside Safe Place — has two architectural shapes:

**Option 1 (recommended): Single-picker option-set expansion.** Mandragora keeps its single-anchor `{destination}` shape. The picker filter at `sheet.js:1021` widens from `sp.name === 'Safe Place'` to `sp.name === 'Safe Place' || sp.name === 'Necropolis Sepulcher'`. The chosen value stores as `m.attached_to.destination` (string). No schema change. No migration. No new normaliser branch.

**Option 2 (not recommended): Dual-anchor migration.** Mandragora migrates to `{origin: <Necropolis Sepulcher>, destination: <Safe Place>}` shape. Implies Mandragora is mechanically attached to BOTH simultaneously. This contradicts Peter's stated framing ("alongside Safe Place" = alternative destination), and it doubles the editor UI surface for a merit that has historically been single-anchor. Not what Peter asked for; flag if my read is wrong.

**Recommendation: Option 1.** It's a 5-line picker filter expansion. If Peter clarifies that he wants Mandragora to be **both** Safe-Place-anchored AND Necropolis-Sepulcher-anchored simultaneously (dual-anchor), then Option 2 — and we'd lean on Trap Door's dual-anchor primitive (D7) without amendment. **Confirm with Peter before story dispatch.**

### 2.5 Story shape and dependencies

- **New story (call it N-8 — Mandragora amendment):**
  - Update the `mandragora-garden` rule doc's `prereq` field via PUT `/api/rules/mandragora-garden` with the JSON block from §2.1.
  - Extend the picker filter at `sheet.js:1021` to include Necropolis Sepulcher (Option 1).
  - Verify the prereq evaluator passes the OR-of-AND tree correctly with `meetsPrereq` test cases (regression test added to `server/tests/`).
  - **Acceptance:**
    - A Carthian character with no Crúac, no Safe Place, no Necropolis Sepulcher, but holding Fucking Thief (with or without qualifier set) — Mandragora is purchasable at 1 dot.
    - A non-Carthian character with Crúac 1 and Safe Place — Mandragora is purchasable. (No regression on the existing path.)
    - A character with Necropolis Sepulcher and Crúac 1 — Mandragora is purchasable. (New path works.)
    - A character with nothing — Mandragora is NOT purchasable. (Prereq correctly gates.)
  - **Dependency:** None on N-7. Independent. Can dispatch in parallel.

### 2.6 Coordination with Ma'at's prereq-filter cluster

Ma'at's Item 4 (strict prereq filter / FT carve-out) intersects this work at the FT permissive-vs-strict question (§2.3). If she discovers the strict interpretation is needed for filter consistency:

- Raise the `merit_qualifier` prereq primitive as a new ADR-006 (small — one new node `type`).
- The Mandragora amendment's FT leaf may need to change from `{ type: 'merit', name: 'Fucking Thief' }` to `{ type: 'merit_qualifier', name: 'Fucking Thief', qualifier_equals: 'Mandragora Garden' }`.

This is conditional on her findings; N-8 can ship permissive and amend later, or wait on her if Khepri prefers a single coherent prereq pass.

---

## Item 3 — Rules engine representation for "attached" Necropolis feats

### 3.1 Terminology audit

"Attached Necropolis feats" is ambiguous; my reading covers three possible referents and the verdict for each:

1. **Trap Door's triple-anchor `{origin, destination, territory}`** — the architecturally novel case from N-5. The N-5 implementation stores Sepulcher as `attached_to.origin`. The Sepulcher rule_grant's `pool_targets` array includes "White Ants" but not Trap Door per se — Trap Door's "association" with Sepulcher is via `attached_to.origin`, not via the Collective Compound sharing pool. **Existing representation is sufficient.**
2. **The Collective Compound pool itself** (the six pool_targets) — Catacombs / Caldarium / Garbage Pit / Labyrinth Guardians / Dark Temple / White Ants. These are bound to Sepulcher via the rule_grant doc's `pool_targets` array (see `server/scripts/seed-rules-necropolis.js:229-253`). Sharing is via the `sharing_scope.type: 'collective_owners_of_merit'`. **Existing representation is sufficient.**
3. **The Mandragora amendment from Item 2** — Mandragora's NEW prereq/attached_to relationship with Sepulcher. **Item 2 §2.4 confirms no schema change.** Mandragora attaches via `attached_to.destination` to either a Safe Place or a Necropolis Sepulcher instance; no rule_grant pool binding, no Collective Compound sharing.

### 3.2 The current Necropolis rule_grant — full audit

Per `server/scripts/seed-rules-necropolis.js:228-253` (merged in N-3):

```js
const NECRO_RULE_GRANT = {
  source: 'Necropolis Sepulcher',
  source_slug: 'necro',
  grant_type: 'pool',
  condition: 'merit_present',
  amount_basis: 'rating_of_source',
  pool_targets: [
    'Catacombs', 'Caldarium', 'Garbage Pit',
    'Labyrinth Guardians', 'Dark Temple', 'White Ants',
  ],
  partner_shareable: true,
  sharing_scope: {
    type: 'collective_owners_of_merit',
    merit: 'Necropolis Sepulcher',
    min_dots: 1,
  },
  notes: 'MNEC Collective Compound source ...',
};
```

This is a textbook D1 + D2 + D3 instance:

- **D1 channel:** `source_slug: 'necro'` is the map key. Allocators (when N-7 lands) write to `m.free_grants.necro`.
- **D2 partner_shareable: true** — per Rev 2 D6, this is explicit on the Necropolis source (not deferred per the LK/Inv/VM defer). The Necropolis Collective Compound IS partner-shareable: a partner of a Sepulcher-owner who is themselves NOT a Sepulcher-owner... actually, the question is more nuanced. Re-reading Rev 2 D2: `partner_shareable: true` means "this source's granted dots count toward partner contributions on shared domain merits." For Collective Compound, the sharing IS via the collective synthesis (D3), not via the explicit `shared_with` partner list. **The `partner_shareable: true` flag here is technically redundant** for the collective case — sharing is always via D3's render-time synthesis, not via partner contribution.
  - **Minor finding worth surfacing:** the `partner_shareable: true` on the Necropolis seed doc may have no observable effect (the collective sharing path uses D3, not the partner_shareable filter). If a Sepulcher-target merit ever ALSO acquires an explicit `m.shared_with` entry, then the partner_shareable flag would gate whether the granted dots count for that partner. That's a niche case — possibly intentional, possibly accreted. Not blocking; flag for the future MNEC-prerequisite audit story.
- **D3 sharing_scope:** discriminator-typed object with `type: 'collective_owners_of_merit'`. Resolves via `resolveSharingScope` at render time. Correct shape per Rev 2.

### 3.3 Does the current shape suffice for Item 2's Mandragora amendment?

**Yes — no rule_grant or sharing_scope change is needed for Mandragora.** Mandragora's relationship with Necropolis Sepulcher is purely an `attached_to` picker concern (single-anchor destination, see §2.4). Mandragora is NOT becoming a Collective Compound target — it keeps its existing partner_explicit sharing primitive (player edits `m.shared_with`). The Necropolis-source attachment is structural ("where is Mandragora physically located?"), not a sharing primitive.

The rules-engine representation that DOES change for Mandragora is the **prereq** block (§2.1) — and that's a `prereq_json` PUT, not a rule_grant change.

### 3.4 ADR impact verdict

**No ADR-005 amendment required for Item 3.** The Necropolis rule_grant seed at `seed-rules-necropolis.js:228-253` is the canonical representation; it's already in production. Mandragora's amendment touches the prereq DSL (which is fully sufficient) and the picker UI (which is a 5-line filter expansion).

The only ADR-relevant decision in this investigation is Item 1 §1.4 (allocator write path) — an inline amendment to ADR-005, not a new ADR.

---

## Recommended dispatch

Two new stories, both independent of each other:

- **N-7 — Editor compound-dot allocator (Necropolis).** Item 1. Add `hasNecropolisSepulcher`, `poolAvailableFor`, `NECRO_TARGETS` to `rules-helpers.js`; extend `meritBdRow` and `shEditMeritPt`; per-target stepper writes to `m.free_grants.necro` directly (post-N-1 map shape, no new flat field). **Recommend ADR-005 inline amendment** codifying the write-path decision per §1.4. Acceptance per §1.5.

- **N-8 — Mandragora Garden amendment.** Item 2. PUT `/api/rules/mandragora-garden` with the prereq block from §2.1. Picker filter expansion at `sheet.js:1021` per Option 1 in §2.4. Acceptance per §2.5. **One open question for Peter** (§2.4): single-picker option-set (Option 1, recommended) vs dual-anchor (Option 2) — confirm before dispatch.

**No story for Item 3.** The rules-engine representation is sufficient as-is.

**Coordination with Ma'at:** the FT permissive-vs-strict question (§2.3, §2.6) intersects her Item 4. Recommend Khepri syncs the two reports before dispatching N-8, in case her findings argue for the `merit_qualifier` prereq primitive (which would itself be a small new ADR-006).

**Dependency on N-1:** both N-7 and N-8 are independent of N-2 (the character-data backfill) — N-1's runtime guards absorb the heterogeneity. N-2 can run anytime.

**Sequencing relative to existing N-2/N-3/N-4/N-5:** N-7 and N-8 can dispatch immediately after Khepri triage; no ordering constraint with the remaining MNEC stories.
