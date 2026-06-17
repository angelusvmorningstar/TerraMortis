---
id: ADR-006
title: 'defence_penalty read path + multi-armour stacking rules — calcDefence consumes equipment via a separate helper'
status: approved
date: 2026-06-17
author: Imhotep (Architect)
revision: 2
supersedes: null
related:
  - issue #878 (this ADR)
  - issue #879 (implementation; blocked by this ADR AND ECM-5 #872)
  - specs/epic-ecm-equipment-catalogue-migration.md (ECM epic — catalogue lookup cache pattern ECM-5)
  - specs/architecture/adr-004-st-mods-overlay.md (Rev 4 — STM `derived.defence` overlay path D5)
  - specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md (Rev 2 — render-time composition discipline)
  - public/js/data/accessors.js:225-235 (current calcDefence — equipment-blind)
  - public/js/data/equipment-data.js:19 (current "defence_penalty is display-only — never fed to calcDefence" comment)
  - public/js/editor/sheet.js:441 (sheet defence cell — STM marker installed, value still from calcDefence)
  - public/js/editor/sheet.js:2240-2245 (current armour render — display-only annotation `Defence X(X-penalty)` per item)
  - server/schemas/character.schema.js:317 (equipment item `state` enum: carried | worn | stashed | lost | active)
  - EQ-1 acceptance criterion: "calcDefence does not read the equipment array without an ADR" — this ADR lifts that ban
  - memory: feedback_constraint_on_relationship (put the constraint on the relationship not the entity — informs D5 helper-vs-inline)
---

# ADR-006 — defence_penalty read path + multi-armour stacking rules

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-06-17 | Initial. ADR lifts EQ-1's ban on calcDefence reading the equipment array. D1 (read path) + D3 (edge cases ex-stacking) + D4 (STM overlay interaction) + D5 (composition site) lock now. D2 (multi-worn stacking policy) flagged PENDING — product call routed to Thoth/Peter; ADR will be updated inline once the pick lands. Survey caught a pre-existing bug in ADR-004 D5's `derived.defence` modding (the STM marker installs at `sheet.js:441` but the displayed value reads from `calcDefence(c)` not from the overlay) — D4 resolves it by materialising `c.derived.defence` at the render-path orchestrator, with calcDefence's modified output as input. | Imhotep (Architect) |
| 2 | 2026-06-17 | Thoth locked the two product calls with Peter (same session). **D2 → A-with-hint:** worst-case math (highest defence_penalty among worn items wins; the rest are silently ignored by the formula); editor surfaces a soft non-blocking hint when >1 armour is in state:'worn' so STs don't misinterpret the multi-worn shape — the hint belongs in implementation story #879, not in this ADR. **Floor location → explicit at the derivation layer.** Floor-at-0 lives in the helper composition (`max(0, calcDefence(c) - armourDefencePenalty(c))`), NOT in the STM overlay and NOT in the sheet renderer. The rules-engine output is non-negative; STM overlay can still legitimately push the rendered value negative per ADR-004's no-bounds contract. This is a clean split: derivation owns the floor; overlay owns the no-bounds adjustment. Rejected by Thoth: A-plain (silent ignore — STs would debug invisible behaviour), B (sum), C (UI reject), D (concealable tag), allow-negative-everywhere (double-penalty), floor-at-0-everywhere (contradicts ADR-004's no-bounds STM contract). D2 and D3-floor locked. | Imhotep (Architect) |

## Context

EQ-1 (the static-catalogue introduction story, merged earlier in the Equipment & Assets epic) carried an explicit acceptance gate: **`calcDefence` does not read the equipment array without an ADR.** The armour catalogue entries store `defence_penalty: integer`, but no live code consumes it — the field flows only through the sheet's per-item display annotation at `sheet.js:2240-2245` (`Defence X(X-penalty)` text per row), which is descriptive and disconnected from the actual defence number used elsewhere in the renderer or rule engine.

Peter has now authorised wiring it in. The ECM epic (PR #880 merged 2026-06-17) migrates the catalogue from a JS module to an ObjectId-keyed Mongo collection with a cache reader; the implementation story (#879) is gated on both this ADR and ECM-5 to avoid a static/Mongo coexistence window for `calcDefence`'s reads.

Two pre-existing constraints shape the design:

1. **EQ-1's "no equipment reads in calcDefence" gate** was correct at the time — armour interactions would have entangled the derived-stat function with a data shape (the static module) that wasn't the long-term home of the catalogue. ECM-5 closes that mismatch; this ADR records the path forward.
2. **ADR-004 Rev 4 §D5** lists `derived.defence` as a moddable STM target. Survey discovered the current implementation is incomplete: the STM overlay marker shows at `sheet.js:441`, but the displayed value comes from `calcDefence(c)` (which doesn't read `c.derived.defence`). This ADR's D4 resolves the gap by materialising `c.derived.defence` at the render-path orchestrator — composing armour penalty into base defence, then letting STM overlay compose on top of *that*.

The architecture is converging: STM Rev 4 added `applyStMods` after derivation; ADR-005 Rev 2 added Collective Compound sharing synthesis at render time; this ADR adds armour-penalty composition between base derivation and STM overlay. All three live in the render-path orchestrator; none mutate persisted character state.

## Decisions

### D1 — Read path: equipment array filtered by state, catalogue lookup via the ECM-5 cache. (locks)

`calcDefence` does not change. The composition site that calls `calcDefence` (D5) also calls a new helper `armourDefencePenalty(c)`, which:

1. Iterates `c.equipment || []`.
2. Filters to items whose `state === 'worn'` (the only state that contributes to body-worn protection per the canonical reading of the state enum).
3. For each remaining item, looks up the catalogue entry via `getCatalogueEntry(item.catalogue_id)`. **Post-ECM-5 this is the ObjectId-keyed cache reader**; pre-ECM-5 it is the static-module reader. The helper does not care which — the API surface is `getCatalogueEntry(id) → entry | undefined`.
4. Filters to entries with `bucket === 'armour'` (catalogue refs may point at non-armour buckets in malformed data; ignoring them is the safe fail-soft).
5. Extracts `entry.defence_penalty` (integer or null/undefined). Treats null/undefined/non-integer as 0.
6. Combines per the D2 stacking rule.
7. Returns a non-negative integer (the penalty magnitude; the composition site subtracts it).

**The helper is a pure function over `(c, catalogueLookup)`.** No render side effects; no character mutation; safe to call from Node test contexts (mirrors the pool-evaluator.js discipline). The catalogue lookup is injected — in admin/player client paths, it's the ECM-5 cache reader; in tests, it's a synthetic map. Default parameter wires up the cache reader.

**Why filter by `state === 'worn'`:**
- `carried` = held in hand or in a bag; does not provide body protection. (Cannot defend from a sheathed sword.)
- `worn` = body-worn armour; the contributing case.
- `stashed`/`lost` = explicitly inactive; never contribute.
- `active` = currently used for non-armour buckets (e.g. a powered equipment item being run); armour with `state: 'active'` is malformed data — fail-soft, exclude.

Single source of truth for "is this armour providing protection right now" = `state === 'worn'`. The state enum is closed (`character.schema.js:317`); future state additions require this ADR's update.

### D2 — Multi-worn stacking rule: A-with-hint (worst-case math + editor soft hint). (LOCKED Rev 2 — Thoth/Peter 2026-06-17)

**Math:** `armourDefencePenalty(c)` returns the **maximum** `defence_penalty` among items satisfying the D1 filter (state==='worn' + bucket==='armour'). Other worn armour items are silently ignored by the formula. Returns 0 when no qualifying armour is present.

```js
function _combineByD2Rule(penalties) {
  // A-with-hint: worst-case wins. Math always returns a non-negative integer.
  return penalties.length === 0 ? 0 : Math.max(...penalties, 0);
}
```

**Editor hint (lives in implementation story #879, NOT in this ADR's helper):** when the editor renders the equipment panel and detects >1 armour item in `state: 'worn'` for the character, surface a soft non-blocking hint near the worn-armour list. Wording (per Thoth): *"Only one armour applies; highest defence_penalty wins."* Nothing rejected; nothing blocked. The hint exists so an ST hitting a debug case (e.g. testing layered armour for a homebrew session) doesn't silently misinterpret the multi-worn shape as "all of these stack." Implementation: #879 acceptance criterion; Concern #8 below pins the wording.

**Why A-with-hint, not the alternatives:**
- **(A-plain, silent ignore)** rejected by Thoth: STs would debug invisible behaviour. The hint is the small price for transparent semantics.
- **(B) Sum** rejected: narratively absurd at the current catalogue size (light reinforced + full kevlar would yield -3 defence for a layered-armour scene no one has asked for).
- **(C) UI reject** rejected: friction without payoff; ST CRUD surface should not block a legitimate edit just because the runtime math is single-armour.
- **(D) Concealable tag hybrid** rejected: no merit/discipline/clan interaction justifies the schema cost.

**Closest to canonical VtR 2e** ("one suit at a time") with permissive data shape, hint-driven UX clarity, and zero schema change.

### D2-FLOOR (formerly part of D3, lifted into a named decision per Thoth) — Floor-at-0 lives at the derivation layer, NOT in the STM overlay or sheet renderer. (LOCKED Rev 2)

The clamp to non-negative happens inside the helper-composition step:

```js
const adjusted = Math.max(0, calcDefence(c) - armourDefencePenalty(c));
```

**The rules-engine output is in [0, +∞).** STM overlay (per ADR-004's no-bounds-on-mods contract) composes on top of `adjusted` and can push the final rendered value negative for scene effects (e.g. an ST `Stunned` mod that subtracts more than the character's adjusted defence). The sheet renderer reads the final value verbatim — no extra floor at display time.

This is a clean split:
- **Derivation** owns the floor. Output is mechanical, non-negative.
- **STM overlay** owns the no-bounds adjustment. Per ADR-004 Rev 4: STs can push any moddable stat to any value without bounds checking.
- **Sheet renderer** is dumb. Displays whatever the composition produced.

Rejected: floor-at-0-everywhere (would contradict ADR-004's no-bounds STM contract); allow-negative-everywhere at derivation (would double-penalty into STM math and cause confusion when an ST adds a positive mod expecting it to compose against a 0 base, only to find the base was negative).

Implementers must NOT add a redundant clamp in the sheet renderer or in `applyStMods` — the floor lives in one place, at the helper composition site, and only there.

### D3 — Composition order: armour penalty applied to the full base defence (post-bonus). (LOCKED)

The penalty is subtracted from the full output of `calcDefence(c)` — i.e. *after* the `min(Dex, Wits) + skill + discBonus` formula has computed the base. **Not pre-bonus.** Reasons:

- VtR 2e treats armour penalty as a modifier to the Defence trait as a whole, not to a particular component. Cinematically: heavy armour slows the wearer's overall ability to dodge / parry, regardless of whether they're trained in Athletics or Weaponry.
- Pre-bonus subtraction would create order-of-application coupling between `discAttrBonus` (e.g. Celerity granting Defence bonuses) and armour, which has no rulebook support.
- Post-bonus subtraction keeps `calcDefence` itself pure (it doesn't consider equipment); the helper applies to its output.

The floor-at-0 step is covered as a separate named decision (D2-FLOOR above) per Thoth's Rev 2 framing. The composition order is: `calcDefence(c)` → subtract `armourDefencePenalty(c)` → floor at 0 → applyStMods composes on top.

**Why STM overlay sees the floored output rather than the pre-armour defence:** an STM mod represents a one-off ST adjustment for a specific scene (Stunned, ritual blessing, etc.). It composes on top of the *mechanical* defence (base + armour-adjusted, floored), not on a hypothetical pre-armour defence. If an ST wants to model "armour somehow doesn't apply this scene" via an STM mod, they apply a positive delta to undo the penalty — that's the explicit, audited path; the implicit "armour bypass" path would be opaque and untestable.

### D4 — STM overlay interaction: STM `derived.defence` mod composes additively on top of armour-adjusted defence; resolves a pre-existing display bug in ADR-004 D5. (locks)

ADR-004 Rev 4 §D5 lists `derived.defence` as a moddable target. The current implementation is **incomplete**: `applyStMods` mutates `c.derived.defence` (defaulting base to 0 because the field doesn't exist pre-overlay), but the sheet displays `calcDefence(c)` — which does not read `c.derived.defence`. The STM marker appears at `sheet.js:441` but the displayed value is unmodded. This is a real bug in the existing code, separate from defence_penalty but resolved by the same composition site.

**This ADR's resolution:** the render-path orchestrator materialises `c.derived.defence` between base derivation and STM overlay application. Concretely:

```js
// Render-path orchestrator (admin.js / player.js, around the existing applyStMods call):

const baseDefence = calcDefence(c);                        // pure base, no equipment
const penalty     = armourDefencePenalty(c);               // new helper, D1 + D2
const adjusted    = Math.max(0, baseDefence - penalty);    // D3 floor

c.derived = c.derived || {};
c.derived.defence = adjusted;                              // materialised

applyStMods(c, mods, overlayEnabled);                      // ADR-004 — overlay applies on top of c.derived.defence

// Sheet now reads c.derived.defence (overlay-modded if applicable) instead of calcDefence(c).
```

Three knock-on changes the implementation story (#879) must make:

1. **`sheet.js:441` and any other site displaying defence** must read `c.derived.defence` instead of calling `calcDefence(c)` directly. The marker logic at `markerFor(c, 'derived.defence')` already works correctly — the displayed value just needs to come from the materialised field.
2. **`sheet.js:2240` (the per-item armour-penalty annotation)** must still call `calcDefence(c)` as the pre-armour, pre-overlay baseline — its display intent is "if you wore *only* this item, defence would be X". That's a hypothetical, not a live computation. Keep `calcDefence(c)` there; it's the correct source.
3. **The sheet edit-mode "stripOverlay" path** (ADR-004 D13 / D15 / D16 — already implemented) must also re-materialise `c.derived.defence` from base+armour after stripping the STM overlay, otherwise edit mode would show a stale modded number. Implementation: include `c.derived.defence = max(0, calcDefence(c) - armourDefencePenalty(c))` in the stripOverlay path *or* re-call the orchestrator section above on edit-mode entry.

**STM mods on `derived.defence` are now meaningful and correctly displayed.** They compose ADDITIVELY with the armour penalty (not replacing it). A character with calcDefence=4, armour penalty=1, STM mod=-2 displays defence=1 (`max(0, 4-1) + (-2) = 1`). A character with calcDefence=2, armour penalty=3, STM mod=+2 displays defence=2 (`max(0, 2-3) + 2 = 0 + 2 = 2`).

**Note:** STM mods on `derived.defence` cannot push defence below 0 if the armour-adjusted base is positive — the `applyStMods` overlay path already enforces this via its own arithmetic (it operates on the materialised base). If an ST wants to model "your defence is 0 no matter what," they apply an STM mod with delta = -base; the result is 0, not negative. This matches the floor-at-0 semantics of D3.

### D5 — Composition site: new helper `armourDefencePenalty(c, catalogueLookup?)`, NOT inline in calcDefence. (locks)

The penalty computation lives in a new helper `armourDefencePenalty(c)` in a module appropriate for accessors — likely a new `public/js/data/equipment-derivation.js` or as an addition to `public/js/data/accessors.js` adjacent to `calcDefence`. Reasons:

- **Preserves EQ-1's "calcDefence doesn't read equipment" invariant in spirit.** calcDefence remains a pure base computation over attributes/skills/disciplines. The new helper is the explicit, named entry point for equipment-driven defence modification. Future equipment-vs-defence interactions (a magic shield, an STM-overlay-aware armour tag) extend the helper, not calcDefence.
- **Symmetric with `discAttrBonus(c, attr)`.** Both are pure, per-axis helpers that take a character and return a numeric adjustment; both are composed into a derived value by their caller. The architectural pattern is consistent.
- **Testable in isolation.** The helper takes a character + a catalogue lookup (injectable for tests); pure function; safe in Node test contexts. Mirrors `applyPoolRulesFromDb` in `pool-evaluator.js`.
- **Decoupled from the calcDefence caller's needs.** Some callers (the per-item display at `sheet.js:2240`) want the pre-armour baseline; some (the displayed defence value) want the armour-adjusted value. Putting the penalty inline in calcDefence would force both callers to share one implementation, requiring an opt-out flag — the wrong direction.

**Helper signature:**

```js
/**
 * Sum of defence penalties from currently-worn armour items on the character.
 * Returns a non-negative integer.
 *
 * @param {object} c - character document
 * @param {function} [catalogueLookup] - (id) => catalogue entry | undefined.
 *   Defaults to the ECM-5 cache reader. Injected for tests.
 * @returns {number} penalty magnitude; subtract from base defence
 */
export function armourDefencePenalty(c, catalogueLookup = getCatalogueEntry) {
  const worn = (c.equipment || []).filter(item => item.state === 'worn');
  const penalties = worn
    .map(item => catalogueLookup(item.catalogue_id))
    .filter(entry => entry?.bucket === 'armour')
    .map(entry => Number.isInteger(entry.defence_penalty) ? entry.defence_penalty : 0)
    .filter(p => p > 0);  // negative penalties are non-sensical; ignore
  return _combineByD2Rule(penalties);  // worst-case max OR sum, per D2 pick
}
```

**The `_combineByD2Rule` step is the only thing PENDING.** Everything else in this signature is locked.

## Story impact map

| Concern | Decision | Stories | Required work |
|---|---|---|---|
| Read path | D1 | #879 (impl, blocked) | New helper in `public/js/data/equipment-derivation.js` (or accessors.js adjacent to calcDefence). State filter `=== 'worn'`. Catalogue lookup via injected reader (post-ECM-5: cache; pre-ECM-5 fallback OK). bucket === 'armour' guard. |
| Stacking | D2 (LOCKED Rev 2 — A-with-hint) | #879 | `_combineByD2Rule = (penalties) => penalties.length === 0 ? 0 : Math.max(...penalties, 0)`. Editor hint at the equipment panel when >1 armour in state:'worn' — wording per Concern #8. |
| Floor | D2-FLOOR (LOCKED Rev 2) | #879 | Floor lives ONLY at the helper composition (`max(0, calcDefence(c) - armourDefencePenalty(c))`). No clamp in `applyStMods`; no clamp in the sheet renderer. STM overlay can legitimately push the rendered value negative per ADR-004's no-bounds contract. |
| Composition order + floor | D3 | #879 | `max(0, calcDefence(c) - armourDefencePenalty(c))` at the orchestrator. |
| STM overlay interaction | D4 | #879 + small fixup to admin.js/player.js render path | Materialise `c.derived.defence` between calcDefence and applyStMods. Migrate `sheet.js:441` to read `c.derived.defence`. Keep `sheet.js:2240`'s calcDefence call (display-only hypothetical). Update stripOverlay path to re-materialise on edit-mode entry. |
| Helper shape | D5 | #879 | New pure-function helper; injectable catalogue lookup; symmetric with `discAttrBonus`. |
| EQ-1 ban lifted | (this ADR is the ADR EQ-1 referenced) | n/a | Update CLAUDE.md or the EQ-1 epic note pointing at ADR-006 as the ADR that lifts the ban. Pin as #879's acceptance. |

## Non-decisions (explicitly out of scope)

- **`armour_value` (the AR field) read path.** This ADR covers `defence_penalty` only. AR is the soak/absorption mechanic at attack-resolution time, not the defence-roll mechanic. A future ADR (or extension to this one) addresses AR; out of scope here.
- **Equipment bucket: weapon / equipment defence interactions.** Some weapons grant Defence bonuses (parrying weapons); some equipment items (a shield) might too. This ADR is armour-specific. Future helpers (`weaponDefenceBonus`, etc.) extend the composition site additively.
- **Concealability / layering semantics.** D2 option (D) flags this; explicitly not pursued unless Peter picks it.
- **Auto-state-transition rules.** Whether an armour item auto-transitions from `worn` to `carried` under specific conditions (sleeping, swimming, etc.) is not modelled. The state is ST-controlled via EQ-1's CRUD surface.
- **Encumbrance, fatigue, or other body-load mechanics.** VtR 2e doesn't model encumbrance numerically for armour; this ADR doesn't either.
- **Server-side defence computation.** Defence is a client-render concern (mirrors ADR-004 D1: client-side overlay). No server-side calcDefence; no server-side armour penalty. If a future submission needs a defence snapshot (mirroring ADR-004 D10), the snapshot captures the client-computed value, not a server recomputation.

## Concerns and watch-items for implementers

1. **D4 resolves a pre-existing bug.** ADR-004 D5's `derived.defence` modding has been incomplete since STM Rev 2 shipped — the marker installs, the value doesn't change. #879 implementation should include a test that an STM mod on `derived.defence` is visibly reflected in the displayed value, not just the marker. This is a regression-gate test that incidentally fixes the long-standing display bug.

2. **`sheet.js:2240`'s display annotation must remain on raw `calcDefence(c)`, not on `c.derived.defence`.** Its intent is "if you wore only this item, defence would be X" — a hypothetical, pre-overlay. Reading the materialised field would show STM-modded baselines, which is misleading. #879 must NOT migrate that read site.

3. **The state filter `=== 'worn'` is the load-bearing semantic.** A future addition to the state enum (per `character.schema.js:317`) MUST update this filter explicitly. Defensive coding tip: prefer `state === 'worn'` over `state !== 'stashed' && state !== 'lost'` etc. — the positive predicate is grep-able.

4. **Catalogue lookup default arg vs explicit pass-through.** Tests inject; production calls let the default arg wire up the ECM-5 cache reader. Implementation must NOT make the helper async (catalogue is cached, synchronous lookup is fine). If for some reason the cache hasn't loaded yet at first calcDefence call, the lookup returns `undefined` and the helper returns 0 — fail-soft is the right default.

5. **Equipment item with malformed `catalogue_id`.** Post-ECM-3 the field is ObjectId; pre-ECM-3 it was a slug string. The helper should handle both during the migration window: the cache reader is the right place to abstract this (it'll resolve either form post-ECM-5). If the lookup returns `undefined`, contribution is 0; the helper does not throw.

6. **Order of operations dependence.** D4's render-path orchestrator MUST run in the documented order (calcDefence → armourDefencePenalty → floor → materialise → applyStMods). Reversing armourDefencePenalty and applyStMods would compose the STM mod into the pre-armour base, then subtract armour from the modded result — semantically different and incorrect. Acceptance test: STM mod=-2 + armour penalty=3 + calcDefence=4 displays defence=`max(0, 4-3) + (-2) = -1` clamped to 0 (because STM overlay's own arithmetic should also floor at 0 — verify via the existing STM overlay logic).

7. ~~**D2 pending**~~ **D2 LOCKED Rev 2** — see D2 + D2-FLOOR for the math + floor location. The implementation story (#879) can proceed once ECM-5 is the only remaining gate.

8. **Editor hint wording (D2 implementation note for #879).** Per Thoth/Peter Rev 2: when the equipment panel renders and detects >1 armour in `state: 'worn'` for the character, surface a soft non-blocking hint near the worn-armour list — *"Only one armour applies; highest defence_penalty wins."* Nothing rejected; the user can leave multiple armour worn and the math just uses the highest. This is a UX-clarity decision, not a math one. #879's acceptance criterion includes this hint with the canonical wording. Architecturally trivial; cite verbatim in the SM brief so wording doesn't drift.

9. **Floor location discipline (D2-FLOOR).** The clamp to non-negative lives in exactly one place: the helper composition site (`max(0, calcDefence(c) - armourDefencePenalty(c))`). Implementers must NOT add a defensive clamp in `applyStMods` or the sheet renderer. The reason is ADR-004's no-bounds STM contract: an ST mod CAN legitimately push the final rendered defence below 0. A redundant clamp in the renderer would silently break legitimate scene effects (e.g. an ST "you can't dodge this attack" mod modelled as `derived.defence: -base-1`). One floor, one place, no double-locking.

## Resolutions table

| Decision | Status | Resolution |
|---|---|---|
| D1 | resolved | new helper `armourDefencePenalty(c, catalogueLookup?)`; reads `c.equipment[]` filtered by `state === 'worn'` AND `entry.bucket === 'armour'`; catalogue lookup via injected reader (default: ECM-5 cache); returns non-negative integer |
| D2 | resolved (Rev 2) | **A-with-hint**: math is worst-case (`Math.max(...penalties, 0)`); editor surfaces a soft non-blocking hint when >1 armour is in state:'worn' — wording per Concern #8 |
| D2-FLOOR | resolved (Rev 2) | floor-at-0 lives at the helper composition (`max(0, calcDefence(c) - armourDefencePenalty(c))`); NOT in `applyStMods`; NOT in the sheet renderer; STM overlay can push final rendered value negative per ADR-004 no-bounds |
| D3 | resolved | armour penalty subtracted from full `calcDefence(c)` output (post-bonus); composition order: calcDefence → subtract helper → floor (D2-FLOOR) → applyStMods composes on top |
| D4 | resolved | STM `derived.defence` mods compose additively ON TOP of armour-adjusted defence; render-path orchestrator materialises `c.derived.defence = max(0, calcDefence(c) - armourDefencePenalty(c))` between base derivation and applyStMods; resolves pre-existing ADR-004 D5 display bug; sheet `defDisplay` reads `c.derived.defence` post-fix |
| D5 | resolved | composition site is a new helper, not inline in calcDefence; symmetric with `discAttrBonus`; pure function; injectable catalogue lookup; preserves EQ-1's "calcDefence doesn't read equipment" invariant in spirit while letting the orchestrator compose explicitly |

## Sign-off

**Rev 2 approved — all decisions locked.** Implementation story #879 is now gated only on ECM-5 (#872 catalogue cache) before dispatch. D2 (A-with-hint stacking) and D2-FLOOR (floor at the derivation layer) locked Rev 2 per Thoth/Peter same-session product call.

**Action items:**
- **Khepri (SM):** #879 dispatch unblocks once ECM-5 merges. SM brief must cite Concern #4 (regression-test STM defence display bug fix), Concern #8 (editor hint wording verbatim), and Concern #9 (no redundant floor clamps).
- **Implementation story #879:** picks up the locked design — new helper `armourDefencePenalty`, worst-case stacking, floor at helper composition, render-path orchestrator materialises `c.derived.defence`, sheet defDisplay migrates to read the materialised field, editor hint added per Concern #8.

**Open dissent window:** D4 (STM composition order — additive on top, not replacing) and D5 (helper-vs-inline) are the consequential locks. D1, D3, D2, D2-FLOOR are mechanical and likely uncontroversial. If Angelus prefers an alternative D4 shape — e.g. armour penalty composes inside calcDefence and STM mods are applied to the raw calcDefence output rather than the armour-adjusted output — raise here before #879 dispatches.
