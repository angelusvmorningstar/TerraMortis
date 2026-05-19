---
id: ADR-004
title: 'ST Mods overlay - composition, settings, enumeration, stacking, tracker_state, multi-read-site propagation'
status: approved
date: 2026-05-20
author: Imhotep (Architect)
revision: 3
supersedes: null
related:
  - specs/epic-stm-st-mods.md (PRD this ADR backs)
  - specs/architecture/adr-001-rules-engine-schema.md
  - public/js/editor/sheet.js (render entry, line 1+; renderSheet called from admin.js:524 and player.js:359)
  - public/js/data/derived.js (existing render-time derivation re-exports)
  - public/js/data/accessors.js (getAttrEffective, getAttrTotal, skTotal, discAttrBonus, calcDefence, calcHealth, calcWillpowerMax — the load-bearing chokepoint that the overlay propagates through)
  - public/js/data/loader.js (loadCharsFromApi — boot loader)
  - public/js/app.js (suite/admin boot site; lines 511, 533, 553 — applyDerivedMerits today, applyOverlayToAll target for Rev 3)
  - public/js/game/tracker.js (player-side tracker_state reader; ensureLoaded() at lines 84-120 — proves player tracker_state read already exists)
  - public/js/data/st-mods.js (Rev 2 module — applyStMods, spliceCurrent, stripOverlay)
  - public/js/admin/downtime-views.js (DT admin resolution surface — projects_resolved[].pool, feeding_roll)
  - server/routes/tracker.js (canAccess() at lines 9-15 — player own-character access is already granted)
  - server/routes/st_mods.js (STM-1 + #410 — own-character read post-relax)
  - server/schemas/downtime_submission.schema.js (projects_resolved[i].pool and feeding_roll.pool — snapshot target for D10)
  - server/db.js (collection access via getCollection)
  - CLAUDE.md ("Derived stats are never stored" rule — STM is the first sanctioned exception; Rev 3 expands the carve-out)
  - specs/reference-data-ssot.md (tracker_state line is stale; amended in STM-2)
---

# ADR-004 - ST Mods overlay: composition, settings, enumeration, stacking, tracker_state, multi-read-site propagation

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-05-17 | Initial. Resolved four open questions raised by Thoth (PM) in PRD §Open Questions: D1 client-side post-derivation overlay, D2 minimal new `app_settings` collection, D3 hybrid stat-path enumeration (static + character-derived), D4 list-each-mod popover (no v1 collapse). Watch-items: CLAUDE.md amendment, write-time path whitelist, delegated listener routing, `_st_mod_overlay` save-path strip. | Imhotep (Architect) |
| 2 | 2026-05-18 | STM-1 (PR #359) landed and exposed that `current.damage / current.willpower / current.vitae` — used as the canonical example in Rev 1 §D3 — do not resolve on the character document; those values live in the separate `tracker_state` collection. Ptah pruned them from the whitelist for the v1 ship; Peter has now reasserted "every controllable number is moddable in v1," locking damage/willpower/vitae back into scope. Rev 2 adds D5 (synthetic `current.*` namespace spliced into the character object pre-overlay), D6 (overlay never writes back to tracker_state), D7 (per-track damage paths). Critical finding: the SSOT note that says players cannot read tracker_state is stale — `server/routes/tracker.js:9-15` already grants player own-character access and `public/js/game/tracker.js:68` already exercises it. No auth-boundary change is required. Also corrects Rev 1 §D3's lowercase attribute/skill examples to match Ptah's normative capitalised keying. | Imhotep (Architect) |
| 3 | 2026-05-20 | Epic STM v1 shipped (STM-1..6 + polish #408 + auth-relax #410). Smoke test surfaced the punt Rev 1 §D1 made: roll calculator, DT player form pool display, and DT admin resolution all read attribute/skill/discipline values via the same `accessors.js` chokepoint as `renderSheet`, but `applyStMods` was only being called at the sheet-render entry point. Suite app's `editorState.chars` and `suiteState.chars` populate at `public/js/app.js:533/556` without overlay application, so the dice modal and roll calc see base values. Peter has removed the punt. Rev 3 adds D8 (multi-read-site contract — applyStMods is still the only composition function, but any in-memory character cache that feeds the accessor chokepoint must have applyStMods applied to its entries), D9 (boot-time bulk overlay via new `applyOverlayToAll` helper + new `GET /api/st_mods?character_ids=...` bulk endpoint), D10 (DT resolution-time pool snapshot `{ base, mods, final, expression }` — per Thoth's pre-loaded prior), D11 (WS-driven mod-change invalidation mirroring `broadcastTrackerUpdate`), D12 (single kill-switch; no rolls-vs-sheet split — per Thoth), D13 (localStorage cache stores base only; overlay applied in-memory at boot), D14 (CLAUDE.md carve-out expanded to name the new read sites). Architectural surprise of Rev 3: there are **no new accessor surface changes required** — `applyStMods` already mutates the in-memory character's attribute/skill/discipline fields, and every calc-site read (per survey of 213 accessor callsites across the codebase) goes through `getAttrEffective` / `skTotal` / `discAttrBonus` / `calcDefence` etc., all of which read those exact mutated fields. The work in Rev 3 is concentrated at the boot path and at one new submission-schema field. | Imhotep (Architect) |

## Context

Epic STM (`specs/epic-stm-st-mods.md`) introduces a render-time overlay that lets STs attach signed-integer deltas to any controllable stat on any character — including derived stats (Defence, Health max, Speed, etc.), which is the first sanctioned exception to the never-store-derived rule in CLAUDE.md. The PRD is structurally sound but flags four open questions whose answers cross story boundaries. Filing per-story tasks before resolving these would force STM-1 through STM-6 authors to invent local answers, repeating the divergence pattern ADR-003 named.

**Rev 2 amends the original answer set after STM-1's merge revealed a storage-shape assumption that did not hold.** The PRD's `current.damage / current.willpower / current.vitae` paths are not character-doc fields; they live in `tracker_state`. STM-1 shipped without them. Peter's "every controllable number is moddable in v1" framing puts them back in scope. D5/D6/D7 (below) describe how the overlay reaches these fields while preserving D1's single-composition-site invariant.

**Rev 3 removes the roll-calculator punt that Rev 1 §D1 left in place.** Epic STM v1 shipped and smoke-tested correctly on the sheet, but mods do not propagate to the roll calculator, the DT player form's pool display, or the DT admin resolution view — because `applyStMods` is only called immediately before `renderSheet`. Peter is locking multi-read-site propagation into the next iteration. The surprise finding from the read-site survey is that **the existing accessor chokepoint (`public/js/data/accessors.js`) already gives us propagation for free**: 213 callsites across the codebase route through `getAttrEffective` / `skTotal` / `discAttrBonus` / `calcDefence` etc., and `applyStMods` already mutates the exact `c.attributes[X].dots` / `c.skills[X].dots` / `c.disciplines[X].dots` paths those accessors read from. The work is at boot (apply overlay to every cached character, not just the actively-rendered one), at one new submission field (snapshot the modded pool at resolution time so revocation doesn't poison history), and at WS-driven invalidation. D8–D14 (below) describe the contract evolution, the boot helper, and the snapshot/invalidation shape.

This ADR locks five+three+seven answers and governs the entire ST mods feature.

## Decisions

### D1 — Overlay composes on the client, after existing derivation. (Open Q1)

`applyStMods(character, mods, overlayEnabled)` runs in the **client**, called once per character immediately before each `renderSheet(c)` invocation (both `public/js/admin.js:524` admin path and `public/js/player.js:359` player path). It runs **after** the existing derivation functions in `public/js/data/derived.js` (`calcDefence`, `calcHealth`, `calcWillpowerMax`, `calcSize`, `calcSpeed`) have produced their outputs onto the character object.

**Why client-side, not server-side:**

- Existing render pipeline is already client-side. `derived.js` and `sheet.js` together own the "raw character document → renderable shape" transform; the API ships the canonical document and nothing else. Moving derivation server-side would be a much larger architectural shift than STM warrants.
- Server-side overlay would require the `/api/characters/:id` read path to: (a) load the global kill-switch on every request, (b) load `st_mods` for the character on every request, (c) load the requesting user's identity to decide whether to apply (no — the spec says all viewers see modded values, but still — the read path would gain a non-trivial join), and (d) decide whether to ship `_st_mod_overlay` to non-ST viewers (yes — players need it for the breakdown). That's three new load-bearing concerns on the hottest read endpoint in the app.
- Kill-switch enforcement is still centralised: the overlay function takes `overlayEnabled` as its third argument and is the **only** caller of mod-application logic. The two `renderSheet` call sites resolve `overlayEnabled` from `globalSettings.st_mods_enabled && !character.st_mods_suppressed` and pass it in. There is no second composition path to keep in sync.
- The roll calculator (`public/index.html` / suite app) is a separate read path that does not call `renderSheet`. It will not see the overlay in v1. This is acceptable — STM is a sheet-display feature, not a dice-engine feature. If a future story wants modded values in rolls, the same client-side `applyStMods` helper can be invoked there too. Out of scope for STM-1..6.

**Concrete wiring** (informational, not normative — STM-2 may adjust):

```js
// New module: public/js/data/st-mods.js
export async function loadStMods(characterId) { /* GET /api/st_mods?character_id=... */ }
export function applyStMods(character, mods, overlayEnabled) { /* mutate + return character with _st_mod_overlay */ }

// In admin.js / player.js, just before renderSheet(c):
const mods = await loadStMods(c._id);
const overlayEnabled = globalSettings.st_mods_enabled && !c.st_mods_suppressed;
applyStMods(c, mods, overlayEnabled);
renderSheet(c);
```

Mod loading is per-character and lazy (on sheet open / on active character switch). No bulk preload — admin grid renders without mods, sheet renders with them. STM-5 invalidates the cache after create/revoke from the panel itself, so refetch on panel mutation only.

### D2 — Settings store is new, minimal, single-document `app_settings` collection. (Open Q2)

No app-settings store exists today. Confirmed by surveying `server/routes/` (24 route files, none named settings; admin-migrations.js handles one-shot ops, not config) and `server/schemas/` (no settings schema).

**Introduce in STM-3:**

- Collection: `tm_suite.app_settings`. Single document, `_id: 'global'`. Schema for v1:
  ```js
  { _id: 'global', st_mods_enabled: true, updated_at: ISODate, updated_by: { discord_id, discord_name } }
  ```
- Routes (ST-auth gated):
  - `GET /api/settings` — returns the global doc, creating with defaults if absent.
  - `PATCH /api/settings` — partial update, allowed keys whitelisted (just `st_mods_enabled` in v1).
- Client cache: a single `globalSettings` object, fetched once at app boot (admin AND player), refetched on the admin settings panel's save. Player app does NOT poll — if the ST flips the kill-switch mid-session, players see the change on next reload. Acceptable; this is a debug/emergency lever, not a live broadcast.

Future flags piggyback on the same collection. Whitelist gates additions per route change; no untyped settings.

### D3 — Stat-path enumeration: hybrid static + character-derived. (Open Q3)

`public/js/data/st-mod-targets.js` exists as proposed, but it covers only the **static** dimensions. Merits and disciplines are character-specific (each character owns a different set), so they cannot live in a static map.

**Two-tier enumeration:**

- **Static module** `public/js/data/st-mod-targets.js` — exports nested categories matching the existing sheet structure. **Attribute and skill keys are capitalised** (`attributes.Strength.dots`, not `attributes.strength.dots`) — STM-1's `server/routes/st_mods.js:11-13` is normative; Rev 1's lowercase illustrations were incorrect.
  ```js
  export const STM_STATIC_TARGETS = {
    Attributes: [
      { path: 'attributes.Strength.dots', label: 'Strength (dots)' },
      { path: 'attributes.Strength.bonus', label: 'Strength (bonus)' },
      // ... all 9 attrs × {dots, bonus}
    ],
    Skills: [ /* all 24 skills × {dots, bonus}, capitalised keys */ ],
    'Current State': [
      // Tracker-state-resident — see D5. Synthetic 'current.*' namespace spliced
      // onto the character object pre-overlay by STM-2.
      { path: 'current.damage_bashing', label: 'Damage — Bashing' },
      { path: 'current.damage_lethal', label: 'Damage — Lethal' },
      { path: 'current.damage_aggravated', label: 'Damage — Aggravated' },
      { path: 'current.willpower', label: 'Willpower (current)' },
      { path: 'current.vitae', label: 'Vitae (current)' },
      // Character-doc-resident:
      { path: 'blood_potency', label: 'Blood Potency' },
      { path: 'humanity', label: 'Humanity' },
    ],
    Derived: [
      { path: 'derived.defence', label: 'Defence' },
      { path: 'derived.health_max', label: 'Health (max)' },
      { path: 'derived.willpower_max', label: 'Willpower (max)' },
      { path: 'derived.size', label: 'Size' },
      { path: 'derived.speed', label: 'Speed' },
      { path: 'derived.initiative', label: 'Initiative' },
    ],
  };
  ```
- **Character-derived** — at panel-open time, STM-5 builds two additional groups from the live character:
  - `Merits` — one entry per `c.merits[i]` with path `merits[i].dots` (label = merit name).
  - `Disciplines` — one entry per `c.disciplines[i]` with path `disciplines[i].dots`.

  These are computed in the panel, not stored. If the merit/discipline list changes, reopening the panel picks up the change.

The actual paths must match the canonical character shape — see `public/js/data/accessors.js` and `public/js/data/derived.js` for the source of truth. STM-2's implementer must verify each path resolves before STM-5 builds the dropdown from this map; a small unit-style "resolve every path on a sample character without throwing" check in STM-2 is the safe gate.

Note that for Skills/Attributes the **PRD example** (`attributes.stamina.dots`) targets the *purchased* dots. Auto-bonus from merits is layered in `accessors.js` and is NOT a mod target — STs who want to grant a bonus dot apply +1 to `.dots`, not to the auto-bonus path. This matches the existing sheet's "dot-vs-bonus-vs-auto" decomposition (visible in sheet.js:431 `attr-derived-row`).

### D4 — Stacking display: list each mod, no collapse in v1. (Open Q4)

Decide now, not at story time. Single-line "+3 (3 mods)" with tooltip-only is rejected for v1:

- Defeats the audit-transparency goal — players are supposed to **see** each adjustment.
- Reason-per-mod is the load-bearing detail; collapsing it into a count strips meaning.
- The popover is a click-to-expand surface that nobody sees unless they ask for it. Showing more inside it is cheap; the visual cost is paid only by users who actively opened it.

**v1 spec:** popover lists each mod on its own row, in creation order, exactly matching the PRD example at lines 105-111. Each row: signed delta, optional reason (only if `show_reason_to_player === true` on that mod), creator name and timestamp. Final summed value rendered as the last row.

**Collapse trigger** (defer): if a stat accumulates more than 5 mods, render the first 3 + "(N more)" with a "show all" toggle. Not in scope for STM-4; add if/when actually painful.

### D5 — Tracker-state-resident stats: synthetic `current.*` namespace, spliced pre-overlay. (Rev 2)

`damage_bashing / damage_lethal / damage_aggravated / willpower / vitae` live in the `tracker_state` collection (one document per character, keyed by `character_id`), not on the character document. To make them moddable while preserving D1's single-composition-site invariant, STM-2 introduces a small pre-overlay step that materialises a synthetic `current` object on the in-memory character before `applyStMods` runs:

```js
// Pre-overlay splice (new helper in public/js/data/st-mods.js, called from
// the same site that calls applyStMods, before the call):
const tracker = await loadTrackerState(c._id);   // GET /api/tracker_state/:id
c.current = {
  damage_bashing: tracker?.bashing ?? 0,
  damage_lethal: tracker?.lethal ?? 0,
  damage_aggravated: tracker?.aggravated ?? 0,
  willpower: tracker?.willpower ?? calcWillpowerMax(c),
  vitae: tracker?.vitae ?? calcVitaeMax(c),
};

applyStMods(c, mods, overlayEnabled);   // D1 unchanged — same single call site
renderSheet(c);
```

After this splice, `applyStMods` resolves `current.willpower` exactly the way it resolves `attributes.Strength.dots` — a path lookup on the in-memory character object. The overlay function does not know or care that the source was `tracker_state`. **D1 is preserved: one composition function, one call site per render path.**

**Auth boundary — no change required.** The SSOT note in `specs/reference-data-ssot.md` that says `tracker_state` is ST-auth-only is **stale**. `server/routes/tracker.js:9-15` already grants player own-character access via `req.user.character_ids`, and `public/js/game/tracker.js:68` is the existence proof — the game tracker already pulls tracker_state from the player side. The "explicit auth change" Khepri's brief warned about was already merged at some prior date and the SSOT just never got updated. STM-2 amends the SSOT line to match reality; no route changes.

**Cache-reuse hint** (not normative). `public/js/game/tracker.js` maintains an in-memory `_cache[id]` for tracker_state. STM-2's `loadTrackerState()` helper should prefer that cache when populated and fall through to the network only on cache miss, to avoid double-fetch when the game tracker is also active. Export a small read accessor from the tracker module rather than duplicating fetch logic in `st-mods.js`.

**WebSocket reactivity.** `server/routes/tracker.js:44` broadcasts `tracker_state` mutations via `broadcastTrackerUpdate`. The sheet renderer must re-run the splice → overlay → render chain on tracker WS frames for the actively viewed character. The game tracker already subscribes; the sheet renderer (admin.js / player.js) currently does not. STM-2 must wire a tracker-update subscription that triggers `renderSheet(activeChar)`. Without this, players adjusting their own willpower on the tracker tab would not see the modded sheet update until next page load.

### D6 — Mods on `current.*` paths never mutate `tracker_state`. (Rev 2)

The overlay is a **read-direction display layer**. When the sheet renders modded willpower as "Base 5 + ST adjustment −1 = Final 4," the `tracker_state.willpower` value remains 5. The popover correctly shows `Base: 5 (from tracker)`. When the player then spends a willpower on the tracker tab, the tracker mutates `tracker_state.willpower` to 4 — and the overlay re-composes: `Base: 4 + ST adjustment −1 = Final: 3`.

This is symmetric with how attribute mods work — a `+1` to `attributes.Strength.dots` does not mutate `characters.attributes.Strength.dots` in MongoDB. The mod is metadata about how to *display* the value, not a write to the underlying record.

**Implementation contract:** `applyStMods` writes only to `character._st_mod_overlay` (the existing Rev-1 shape) and to the in-memory `character.<path>` value used for that render frame. Any `tracker_state` PUT path (`public/js/game/tracker.js`'s `saveToApi`) must NOT inspect or strip mod overlays — it writes the base value the user interacted with, which is already the base because the tracker UI's input bindings target the un-modded path. STM-4 verifies this in acceptance (mod on willpower, player spends a wp on tracker, tracker_state.willpower drops by 1 not by 1 + delta).

### D7 — Damage paths are per-track, not aggregate. (Rev 2)

Three separate paths: `current.damage_bashing`, `current.damage_lethal`, `current.damage_aggravated`. **No aggregate `current.damage`.**

Reasoning: VtR 2e's three damage tracks have distinct mechanical effects (escalation chains, healing rates, what becomes a coffin-stuffer). A mod that says "+1 damage" without specifying the track is mechanically ambiguous; the ST always intends a specific track. The dropdown groups them under `Current State → Damage` with three options; this is one extra click per damage mod and zero ambiguity in storage. The audit log is correspondingly more useful — "Khepri added +1 aggravated on 2026-05-18" tells the next ST exactly what happened.

If a future story finds that STs repeatedly want to add multiple tracks at once, a UI affordance (multi-select damage tracks → write three mod docs in one click) is the answer, not a synthetic aggregate path.

### D8 — D1 contract evolution: applyStMods called from multiple sites; cache-entry invariant. (Rev 3)

The Rev 1 D1 framing — "single composition site per render" — was the load-bearing simplification that prevented a parallel implementation in `applyStMods`. It is preserved in Rev 3, but its scope expands.

**Restated invariant** (call this the cache-entry invariant): **any in-memory character object that will be read by an `accessors.js` chokepoint function (or by anything those functions transitively read from) must have `applyStMods` applied to it before that read.** Equivalent rephrasing: a character object is in one of three states — *base* (no overlay), *overlay-applied* (post-applyStMods), or *editing* (overlay stripped via `stripOverlay` for in-flight mutation, restored on save). All read-path consumers must be served an overlay-applied character. The editor is the only consumer that gets base, and it explicitly toggles state via `stripOverlay` / re-apply.

**`applyStMods` remains the single composition function.** It may be called from N sites; that is not a violation of the contract, it is the contract scaling. Rev 2 already established N=2 (admin + player sheet); Rev 3 raises N by adding a boot-time site (D9) and a WS-handler site (D11). The function itself does not change.

**Why this is the right framing**: the survey of read sites (213 accessor callsites across the codebase) shows that **every calc-site read goes through `accessors.js`**, and `accessors.js` reads from `c.attributes[X].dots` etc. — the exact paths `applyStMods` already mutates. Per-callsite changes are not required. The only failure mode is a character object that lands in a read-path cache without going through `applyStMods`. D8 makes that failure mode the explicit contract violation. D9 closes the largest hole (boot-time population).

**The alternative considered and rejected**: "inline `applyStMods` at each calc site" (Khepri's option α). Rejected because: (1) it requires finding every accessor callsite and wrapping it, which is fragile against new code; (2) the same character object would be re-overlayed many times per render, which is inefficient and surfaces the not-yet-tested edge case of stripOverlay-restored mid-render; (3) it conflicts with D6 (overlay is per-frame, not per-read).

### D9 — Boot-time bulk overlay via `applyOverlayToAll` + bulk endpoint. (Rev 3)

A new helper `applyOverlayToAll(chars, overlayEnabled, opts)` lives in `public/js/data/st-mods.js`. Behaviour:

1. If `overlayEnabled === false`, call `stripOverlay(c)` on each character. Return.
2. Otherwise: bulk-fetch mods for all `chars` via a new endpoint `GET /api/st_mods?character_ids=<csv>` (server: range-query on `character_id IN [...]`). Returns mods grouped by `character_id`.
3. For each `c`, call `applyStMods(c, modsByChar[c._id] || [], !c.st_mods_suppressed)`. **No `current.*` splice** — pool reads do not use those paths, and the splice requires a separate per-character tracker_state fetch that would multiply the boot cost. The sheet path (D5) keeps its own per-character splice; that is a separate site.

**Call site:** `public/js/app.js:553`, immediately after `editorState.chars.forEach(c => applyDerivedMerits(c))` and immediately before `suiteState.chars = sortedChars`. Both editor and suite caches reference the same character objects (suite is a sorted reslice of the same array), so a single overlay pass on `editorState.chars` services both.

**Bulk endpoint shape** (server-side, ST-relax-aware per #410): `GET /api/st_mods?character_ids=id1,id2,id3` — comma-separated `ObjectId` list. Validates each ID. Player tokens: returns mods only for character_ids the player owns (`req.user.character_ids` intersection); ID-list members the player does not own silently produce empty arrays in the response (do not 403 the whole request — boot would fail). ST/dev tokens: full coverage. Response shape:

```js
{
  "5f...a1": [/* mods on char a1 */],
  "5f...a2": [/* mods on char a2 */],
  // ...
}
```

Note that the single-character `GET /api/st_mods?character_id=X` route is preserved (sheet-render and admin panel both use it). The bulk endpoint is additive.

**Boot cost:** one network round trip per app boot for mods, regardless of character count. For ~30 characters and typical 0-3 mods each, the response is small (<5 KB). Acceptable.

**Editor edit-mode interplay:** when the editor enters edit mode on a character, it calls `stripOverlay(c)` (existing pattern, already implemented per Rev 2). When the editor saves, it re-fetches the character (existing pattern at `admin.js:629`) and the `applyDerivedMerits` + overlay re-application chain re-runs for that one character. The cache invariant is preserved.

### D10 — DT submission snapshot at resolution time. (Rev 3, per Thoth's prior)

When the ST resolves a DT project or feeding action and computes the rolled pool, the resolved-pool field stores not just `{ total, expression }` but a snapshot of the mod composition that produced `total`. Schema additive (backwards-compatible):

```js
// server/schemas/downtime_submission.schema.js
projects_resolved[i].pool = {
  total: 7,                  // existing — final dice pool
  expression: 'Str+Brawl',   // existing — pool descriptor
  base: 6,                   // NEW — pre-mod sum
  mods: [                    // NEW — per-mod breakdown, empty if no mods
    { stat_path: 'attributes.Strength.dots', delta: 1, reason: 'Vigour of the Lion ritual', mod_id: ObjectId },
  ],
}

// Same shape extension for feeding_roll.pool
```

**Invariant:** `total === base + sum(mods.map(m => m.delta))`. Server-side validation in the schema asserts this on write; mismatch is 400.

**Where the snapshot is built:** at the ST resolution site (currently `public/js/admin/downtime-views.js` around `projects_resolved` write paths near line 1367 and the resolution submit handler). The ST's view of the character is overlay-applied (per D8/D9), so the per-mod breakdown is available from `c._st_mod_overlay`. The resolver reads `_st_mod_overlay[stat_path]` for each path that contributed to the pool, captures the per-mod entries, and writes them into the snapshot.

**Why at resolution time, not player-pick time:** the player-side submission stores **component strings** (`project_N_pool_attr = "Strength"`), not numeric pools, per the existing schema. The numeric pool is computed only when the ST resolves. Capturing the snapshot at resolution is the natural fit and matches Thoth's prior: "frozen at submission honours player intent regardless of later mod revocation" — submission in Thoth's framing meant the rolled pool, which happens at resolution. A separate player-pick-time snapshot (the modded pool the player *saw* when picking) is deferrable; raise to Thoth if a concrete need surfaces.

**Audit-trail consequence:** revoking a mod weeks after a resolution does not poison the historical pool record. The `mods` array on the resolved-pool field captures the snapshot independently of the `st_mods` collection state.

### D11 — WS-driven invalidation on mod create/revoke. (Rev 3)

Server emits a WS frame on `POST /api/st_mods` and `DELETE /api/st_mods/:id`, mirroring `broadcastTrackerUpdate`:

```js
// server/ws.js (new export)
export function broadcastStModUpdate(character_id, op) {
  // op: 'create' | 'revoke'
  // payload: { character_id, op }
}
```

Client subscribers (one per app: admin, suite, player) handle the frame by:
1. If the affected character is in the local cache (`editorState.chars` / `suiteState.chars`), refetch mods for just that character via the single-character endpoint and re-apply via `applyStMods(c, freshMods, overlayEnabled)`.
2. If the affected character is the currently-viewed sheet character, additionally re-run the sheet render path (`renderSheet(c)` post re-application — admin and player already do this on internal mod-panel writes per STM-5, so the WS path piggybacks on that existing re-render).

**Why WS, not poll/reload-driven:** mods change mid-session under the ST's hand. Player rolls a pool while an ST is creating a +1 Stamina mod — they should see the modded pool when the dice come up, not when they next reload. Reload-driven was acceptable for the kill-switch (D2, a debug lever; rare mid-session flips) but not for routine mod operations.

**Cache scope:** the WS handler updates the in-memory cache only. localStorage is base-only by D13; the in-memory overlay-applied state is per-session.

### D12 — Single kill-switch and single per-character override. (Rev 3, per Thoth's prior)

Do **not** split into `mods_affect_rolls` + `mods_affect_sheet`. Thoth's framing applies: the kill-switch is a debug/emergency lever; splitting creates a four-combination state explosion for a scenario nobody has named. The per-character override (`st_mods_suppressed`) stays single for the same reason.

If a concrete scenario surfaces that needs the split, raise to Thoth with the scenario named. Don't pre-emptively widen the API.

**Concrete contract:** `overlayEnabled = globalSettings.st_mods_enabled && !character.st_mods_suppressed`, exactly as Rev 1 §D2 specified. No new toggles.

### D13 — localStorage cache stores base only; overlay is per-session in-memory. (Rev 3)

`tm_chars_db` (the localStorage character cache in `public/js/data/loader.js`) stores base character documents only. The overlay is applied to in-memory copies on app boot via D9, never to the serialised cache.

**Why:**
- Mods change frequently and independently of the character document. A localStorage cache of overlay-applied characters would go stale the moment a mod is created or revoked.
- The localStorage cache is meant to survive page reloads for offline-degraded UX. Mods are not part of the character; they belong to a separate collection with separate cache semantics.
- Boot already re-applies via `applyOverlayToAll`, so the in-memory state is correct regardless of the cache shape.

**Save-path strip already exists** (Rev 1 watch-item, implemented per Rev 2): `buildSaveBody` in `admin.js:899` strips `_st_mod_overlay` and `_st_mod_base` before PUT. D13 reaffirms that path; no change required.

### D14 — CLAUDE.md carve-out expanded to name new read sites. (Rev 3)

The Rev 1 carve-out paragraph under "Derived stats are never stored" in `CLAUDE.md` (added in STM-2) names the sheet as the sanctioned overlay read site. Rev 3 expands it to name the roll calculator, DT player form pool display, and DT admin resolution as additional sanctioned read sites, all served by the same `applyStMods` chokepoint via the cache-entry invariant in D8.

**Pinned as acceptance criterion** on whichever Rev 3 story covers the shared boot helper (likely the first one: "boot-time overlay propagation"). Without the carve-out, a future agent will see modded values flowing into pool computation and treat it as a violation of the never-store-derived rule.

## Story impact map

| Open Q | Decision | Affected stories | Required change vs PRD |
|---|---|---|---|
| Q1 server vs client | D1: client, post-derivation | STM-2 | None — PRD already named client as default. STM-2 acceptance explicitly tests "after existing derivation pass on the client". |
| Q2 settings store | D2: new `app_settings`, single doc | STM-3 | None — PRD said "introduces one if not". STM-3 scope grows by the `GET/PATCH /api/settings` routes + one-doc seed. |
| Q3 stat-path enumeration | D3: static module + character-derived | STM-5, STM-2 (sanity check) | STM-5 builds Merits and Disciplines groups from `c.merits` and `c.disciplines` at panel-open. STM-2 adds a path-resolve sanity check. Static module uses **capitalised** attribute/skill keys (per STM-1). |
| Q4 stacking display | D4: list each in v1, collapse at >5 deferred | STM-4 | None — PRD example matched. STM-4 acceptance pins "list each delta" verbatim. |
| Rev 2: tracker-state targets | D5: synthetic `current.*` splice pre-overlay; no auth change | STM-2 (pre-overlay splice + WS re-render + SSOT amend), STM-1 (whitelist re-add) | STM-2 grows: load tracker_state for active char, splice into `c.current`, subscribe to `broadcastTrackerUpdate` WS frames for the active character to re-render. STM-1 whitelist gets `current.damage_bashing/lethal/aggravated/willpower/vitae` added back — small follow-up PR or rides into STM-2 (recommend: rides into STM-2, since STM-2's path-resolve sanity check is the natural gate). `specs/reference-data-ssot.md` tracker_state line amended to reflect that player own-character read is already permitted. |
| Rev 2: write semantics | D6: overlay read-only, never mutates tracker_state | STM-4 (acceptance test) | STM-4 acceptance: with a `-1` mod on `current.willpower`, player spending one willpower on the tracker reduces `tracker_state.willpower` by exactly 1 (not 1+delta). |
| Rev 2: damage granularity | D7: per-track paths, no aggregate | STM-5 (dropdown) | Dropdown surfaces three options under Current State → Damage. No `current.damage` entry. |
| Rev 3: D1 contract scope | D8: applyStMods called from multiple sites; cache-entry invariant | All Rev 3 stories | New invariant added to the Concerns section. SM story briefs must cite the invariant verbatim so downstream agents do not re-litigate it. No accessor changes — survey confirmed 213 callsites all route through `accessors.js`, which reads exactly the paths `applyStMods` mutates. |
| Rev 3: boot-time overlay | D9: `applyOverlayToAll` helper + bulk endpoint | STM-7 (new, "boot overlay") | Two artefacts: (a) new `GET /api/st_mods?character_ids=<csv>` bulk endpoint with #410-style own-character filtering; (b) new `applyOverlayToAll` export in `public/js/data/st-mods.js`, called from `app.js:553` after `applyDerivedMerits`. CLAUDE.md carve-out expansion (D14) pinned as acceptance criterion. |
| Rev 3: snapshot at resolution | D10: pool `{ base, mods, final, expression }` | STM-8 (new, "DT pool snapshot") | Schema additive: `projects_resolved[i].pool` and `feeding_roll.pool` gain `base` + `mods[]` fields. Schema validator asserts `total === base + sum(mods.delta)` on write. Resolver site in `admin/downtime-views.js` reads from `c._st_mod_overlay` to build the snapshot. |
| Rev 3: WS invalidation | D11: `broadcastStModUpdate` | STM-9 (new, "WS mod sync") | New `broadcastStModUpdate(character_id, op)` in `server/ws.js`, fired from `POST /api/st_mods` and `DELETE /api/st_mods/:id`. Client subscribers in admin/suite/player refetch + re-apply overlay for the affected character on receipt. Active-sheet re-render piggybacks on existing STM-5 mod-panel re-render path. |
| Rev 3: kill-switch shape | D12: single global + single per-character | None | Reaffirms Rev 1 §D2 / per-character override pattern. No code change. |
| Rev 3: cache shape | D13: localStorage base-only | None | Reaffirms existing `_`-prefix strip pattern. Verify no regression during STM-7 review. |
| Rev 3: docs | D14: CLAUDE.md carve-out expanded | STM-7 (acceptance) | Single-paragraph edit to CLAUDE.md naming roll calc + DT pools alongside the existing sheet exception. Pinned as STM-7 acceptance criterion. |

## Non-decisions (explicitly out of scope)

- **Roll calculator integration.** ~~STM-1..6 do not mod the dice engine. `_st_mod_overlay` is sheet-display only. Future ADR if requested.~~ **Lifted in Rev 3.** Roll calc, DT player form pool display, and DT admin resolution are now in scope via D8/D9. Snapshot at resolution time per D10.
- **Auto-expiry.** Already non-goal per PRD; reaffirmed.
- **Per-mod locking.** Already rejected per PRD; reaffirmed.
- **Split kill-switch (rolls vs sheet).** Per D12, do not split. Single global flag + single per-character override. Raise to Thoth with a named scenario if you think the split is justified.
- **Mid-session WebSocket push of kill-switch flips.** Reload-driven for v1; revisit if STs report needing it. **D11 covers mod create/revoke**, which is the higher-frequency case; kill-switch is rare-flip and stays reload-driven.
- **Bulk operations on mods.** No "revoke all on this character" button in v1 — per-character override (`st_mods_suppressed`) achieves the same effect without data loss, which is the better default.
- **Player-pick-time pool snapshot.** Rev 3 D10 captures the modded pool at ST resolution time. A separate snapshot at player-pick-time (what the player saw when picking the action) is not in scope. Raise to Thoth if a concrete audit scenario surfaces.
- **Server-side pool computation / mod-aware validation.** Survey confirmed no server-side attribute or pool reads in `server/routes/downtime.js` or contested-rolls. Submissions store component strings; ST resolves client-side. Server-side mod-awareness is unnecessary; do not introduce it.

## Concerns and watch-items for implementers

1. **CLAUDE.md amendment is load-bearing.** STM-1 or STM-2 must add a paragraph under "Derived stats are never stored" in CLAUDE.md naming the overlay as the sanctioned exception, *with a link to this ADR*. Without that, a future agent will treat the overlay as a violation and "fix" it.

2. **Path-string parsing is the silent failure surface.** `stat_path` is a free string in the DB. `applyStMods` will need a small `getByPath`/`setByPath` helper. Validate every path against a known set at write time in `POST /api/st_mods` — reject unknown paths with 400. The static module from D3 is the whitelist source; merit/discipline paths use a regex `^(merits|disciplines)\.[0-9]+\.dots$`. A typo'd stat_path in the DB is a mod that silently never renders; rejection at create time is much cheaper than diagnosis later.

3. **Listener-routing reminder.** Per memory ([feedback_listener_routing_static_blind_spot](feedback_listener_routing_static_blind_spot.md)), STM-4's marker click handler must be wired through delegated routing, not registered ad-hoc per render. Click handlers attached inside a `change`-listener silently no-op and static review does not catch it. STM-5's create-form handlers face the same risk.

4. **`current.*` field names.** The PRD uses `current.damage`, `current.willpower`, `current.vitae`. Verify against `public/js/data/accessors.js` before STM-5 ships its dropdown — if the actual fields are at the top level (e.g. `c.damage_bashing`, `c.damage_lethal`, `c.damage_aggravated`), the static map needs to match. STM-2's resolve-sanity-check catches this.

5. **`_st_mod_overlay` shadowing.** The `_` prefix is the existing in-repo convention for derived/transient fields on character objects (`_gameXP`). Keeping the prefix avoids confusion with persisted fields and signals "do not save this back to the API". The save path in `admin.js:586` and similar must strip `_` -prefixed fields before PUT, which is the existing pattern — verify no regression.

6. **Rev 3: cache-entry invariant is the new tripwire.** Any future code path that puts a character object into a read-accessible cache must have `applyStMods` applied to it. Code review on STM-7+ must flag new character caches (or new character-fetch sites that land in existing caches) that bypass `applyOverlayToAll` or the per-character apply chain. Add a brief in-code comment near `editorState.chars = apiChars` and `suiteState.chars = sortedChars` after STM-7 lands, pointing at D8 — future agents reading the boot code should see the contract in situ, not just in the ADR.

7. **Rev 3: bulk endpoint own-character filter must not 403 the whole request.** A boot-time `GET /api/st_mods?character_ids=a,b,c` from a player whose owned set is only `[a]` should return `{a: [...], b: [], c: []}` not a 403. A 403 would brick app boot. Per-character empty arrays are the safe degradation.

8. **Rev 3: WS handler dedupe.** STM-5's mod-panel write path already re-renders the active sheet on local create/revoke (per Rev 1). The WS subscriber added in STM-9 must not double-render when the local actor was the WS-frame originator. Standard pattern: client annotates its own writes (mirroring `markLocalWrite` in `public/js/data/ws.js:` for tracker_state) and the WS handler suppresses frames it caused.

9. **Rev 3: DT snapshot read of `_st_mod_overlay`.** The resolver in `admin/downtime-views.js` reads from `c._st_mod_overlay[stat_path]` to build the snapshot. If the resolver opens with a character that has not had overlay applied (e.g. opened from a cold cache state), the overlay rows are absent and the snapshot mods array would be empty even when mods actually exist. STM-8 acceptance must verify: open resolver on a character with active mods + cold cache → snapshot still captures the mod entries. D8 (cache-entry invariant) is the precondition; STM-8's acceptance is the test.

## Resolutions table

| Decision | Status | Resolution |
|---|---|---|
| D1 | resolved (Rev 1) | client-side overlay, post-derivation, single composition site per render |
| D2 | resolved (Rev 1) | introduce minimal `app_settings` collection in STM-3, one document keyed `'global'` |
| D3 | resolved (Rev 1, corrected Rev 2) | static `st-mod-targets.js` for attributes/skills/current/derived; character-derived for merits/disciplines at panel-open; **capitalised** attribute/skill keys per STM-1 |
| D4 | resolved (Rev 1) | list each mod in popover, collapse-at-N-mods deferred |
| D5 | resolved (Rev 2) | synthetic `current.*` namespace spliced onto in-memory character from tracker_state pre-overlay; no auth boundary change; SSOT amended |
| D6 | resolved (Rev 2) | overlay is read-direction display layer; never mutates tracker_state |
| D7 | resolved (Rev 2) | three separate damage paths (bashing/lethal/aggravated); no aggregate `current.damage` |
| D8 | resolved (Rev 3) | cache-entry invariant: any in-memory character cache feeding accessor reads must have applyStMods applied; applyStMods remains single composition function, called from multiple sites |
| D9 | resolved (Rev 3) | boot-time `applyOverlayToAll` helper + new bulk `GET /api/st_mods?character_ids=<csv>` endpoint; called from `app.js:553` |
| D10 | resolved (Rev 3) | DT resolved-pool snapshot `{ base, mods, final, expression }` at ST resolution time; schema-additive, server-validated invariant `total === base + Σ delta` |
| D11 | resolved (Rev 3) | `broadcastStModUpdate(character_id, op)` WS frame on create/revoke; clients refetch + re-apply for affected character |
| D12 | resolved (Rev 3) | single global kill-switch + single per-character override; no rolls-vs-sheet split |
| D13 | resolved (Rev 3) | localStorage cache stores base only; overlay is per-session in-memory |
| D14 | resolved (Rev 3) | CLAUDE.md carve-out expanded to name roll calc + DT pools; pinned as STM-7 acceptance |

## Auth amendments after STM-1..6

Post-epic adjustments to the route auth boundaries, recorded here as
small inline amendments. Not a Rev — too local to warrant one. A full
Rev (3 or ADR-005) is reserved for the multi-read-site overlay
propagation work (roll calc / DT pools).

- **Issue #410 (2026-05-19): `GET /api/st_mods` relaxed to own-character read.**
  Originally gated `requireRole('st')` in STM-1; that broke the
  player-side sheet because `loadStMods` got 401 and `applyStMods`
  short-circuited to an empty overlay. Player-visible mods is a
  load-bearing PRD goal (§Player UX), so the route now allows any
  authenticated user and enforces ownership inline via
  `canAccessMods(req, characterId)` — mirrors the `canAccess` pattern
  in `server/routes/tracker.js:9-15`. ST/dev can read any character;
  players can read only character_ids they own. `POST`, `DELETE`, and
  `GET /api/st_mod_audit` remain ST-only (audit is explicit PRD
  non-goal for player visibility; create/revoke is ST-only by design).

## Sign-off

**Rev 3 approved.** Epic STM v1 (STM-1..6) is shipped on dev. Rev 3 adds three new stories that complete the overlay's multi-read-site propagation:

- **STM-7 — Boot-time overlay propagation** (D8/D9/D13/D14).
  - New helper `applyOverlayToAll(chars, overlayEnabled)` in `public/js/data/st-mods.js`. No `current.*` splice (that stays per-sheet).
  - New endpoint `GET /api/st_mods?character_ids=<csv>` on `server/routes/st_mods.js`. ST/dev: full coverage. Players: own-character filtering, per-character empty arrays for non-owned IDs (do not 403 the request; see Concerns #7).
  - Call site: `public/js/app.js:553`, immediately after `editorState.chars.forEach(c => applyDerivedMerits(c))` and before `suiteState.chars = sortedChars`.
  - CLAUDE.md carve-out expanded to name roll calc + DT pools (D14). Pinned as acceptance criterion.
  - In-code comments at `editorState.chars = apiChars` and `suiteState.chars = sortedChars` pointing at D8 (Concerns #6).
  - Acceptance: with mods on a character, open the suite app's dice modal → modded pool size appears. Open DT player form → modded pool size in the project slot. Open DT admin resolution view → modded pool size in the resolver. With kill-switch off, all three show base.

- **STM-8 — DT pool snapshot at resolution** (D10).
  - Schema additive in `server/schemas/downtime_submission.schema.js`: `projects_resolved[i].pool` and `feeding_roll.pool` gain `base: Int`, `mods: [{ stat_path, delta, reason, mod_id }]`. Validator asserts `total === base + Σ mods.delta` on write.
  - Resolver-side build in `admin/downtime-views.js` near the `projects_resolved` write and the feeding-roll commit. Reads from `c._st_mod_overlay` per path that contributed.
  - Acceptance: resolve a project with an active mod → snapshot captures `base`, `mods`, `final`. Revoke the mod → the resolved record still shows the snapshot. Resolve a project with no active mods → `mods: []`, `base === total`.
  - **Depends on STM-7** for the cache-entry invariant. Resolver acceptance includes the cold-cache scenario (Concerns #9).

- **STM-9 — WS-driven mod-change invalidation** (D11).
  - New `broadcastStModUpdate(character_id, op)` export in `server/ws.js`. Fired from `POST /api/st_mods` and `DELETE /api/st_mods/:id` after successful write.
  - Client subscriber in admin/suite/player boot: on receipt, refetch single-character mods and re-apply via `applyStMods`. Active-sheet re-render piggybacks on the existing STM-5 mod-panel re-render path.
  - **Local-write dedupe** required (Concerns #8). Pattern mirrors `markLocalWrite` in `public/js/data/ws.js` for tracker_state.
  - Acceptance: two browser sessions open on the same character. ST creates mod in session A. Session B's sheet, dice modal, and DT pool display all reflect the new mod within ~1s, without reload.

**Dispatch order:**
- **STM-7 first.** It establishes the cache-entry invariant that STM-8 and STM-9 both depend on.
- **STM-8 and STM-9** can run in parallel after STM-7 merges.

**HALT-DAR vs PROCEED:**
- **STM-7**: PROCEED. D8 is a contract evolution but the survey work shows no accessor changes are required; risk is low. Cite the D8 invariant verbatim in the SM brief.
- **STM-8**: PROCEED. D10 schema is purely additive; no migration of existing submissions; existing readers ignore extra fields.
- **STM-9**: HALT-DAR on the local-write dedupe pattern. Angelus owns the WS infrastructure (`broadcastTrackerUpdate`, `markLocalWrite`) and this story extends it. Brief should be explicit about the dedupe convention being mirrored, not invented.

**Open dissent window:**

If Angelus has architectural dissent on **D8** (cache-entry invariant) or **D9** (boot-time bulk endpoint vs alternative shape), comment here or open a Rev 4 before STM-7 dispatches. D10/D11/D12/D13/D14 are local enough that disagreement can be raised inside the affected story without re-opening this ADR.
