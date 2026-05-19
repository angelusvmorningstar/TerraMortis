---
id: ADR-004
title: 'ST Mods overlay - composition site, settings store, target enumeration, stacking display, tracker_state-resident targets'
status: approved
date: 2026-05-18
author: Imhotep (Architect)
revision: 2
supersedes: null
related:
  - specs/epic-stm-st-mods.md (PRD this ADR backs)
  - specs/architecture/adr-001-rules-engine-schema.md
  - public/js/editor/sheet.js (render entry, line 1+; renderSheet called from admin.js:524 and player.js:359)
  - public/js/data/derived.js (existing render-time derivation re-exports)
  - public/js/data/accessors.js (calcDefence, calcHealth, calcWillpowerMax, calcSize, calcSpeed)
  - public/js/game/tracker.js (player-side tracker_state reader; ensureLoaded() at lines 84-120 — proves player tracker_state read already exists)
  - server/routes/tracker.js (canAccess() at lines 9-15 — player own-character access is already granted)
  - server/routes/st_mods.js (STM-1 merged whitelist, lines 24-50)
  - server/db.js (collection access via getCollection)
  - CLAUDE.md ("Derived stats are never stored" rule — STM is the first sanctioned exception)
  - specs/reference-data-ssot.md (tracker_state line is stale; amendment scoped into STM-2)
---

# ADR-004 - ST Mods overlay: composition, settings, enumeration, stacking, tracker_state targets

## Revision history

| Rev | Date | Change | Author |
|---|---|---|---|
| 1 | 2026-05-17 | Initial. Resolved four open questions raised by Thoth (PM) in PRD §Open Questions: D1 client-side post-derivation overlay, D2 minimal new `app_settings` collection, D3 hybrid stat-path enumeration (static + character-derived), D4 list-each-mod popover (no v1 collapse). Watch-items: CLAUDE.md amendment, write-time path whitelist, delegated listener routing, `_st_mod_overlay` save-path strip. | Imhotep (Architect) |
| 2 | 2026-05-18 | STM-1 (PR #359) landed and exposed that `current.damage / current.willpower / current.vitae` — used as the canonical example in Rev 1 §D3 — do not resolve on the character document; those values live in the separate `tracker_state` collection. Ptah pruned them from the whitelist for the v1 ship; Peter has now reasserted "every controllable number is moddable in v1," locking damage/willpower/vitae back into scope. Rev 2 adds D5 (synthetic `current.*` namespace spliced into the character object pre-overlay), D6 (overlay never writes back to tracker_state), D7 (per-track damage paths). Critical finding: the SSOT note that says players cannot read tracker_state is stale — `server/routes/tracker.js:9-15` already grants player own-character access and `public/js/game/tracker.js:68` already exercises it. No auth-boundary change is required. Also corrects Rev 1 §D3's lowercase attribute/skill examples to match Ptah's normative capitalised keying. | Imhotep (Architect) |

## Context

Epic STM (`specs/epic-stm-st-mods.md`) introduces a render-time overlay that lets STs attach signed-integer deltas to any controllable stat on any character — including derived stats (Defence, Health max, Speed, etc.), which is the first sanctioned exception to the never-store-derived rule in CLAUDE.md. The PRD is structurally sound but flags four open questions whose answers cross story boundaries. Filing per-story tasks before resolving these would force STM-1 through STM-6 authors to invent local answers, repeating the divergence pattern ADR-003 named.

**Rev 2 amends the original answer set after STM-1's merge revealed a storage-shape assumption that did not hold.** The PRD's `current.damage / current.willpower / current.vitae` paths are not character-doc fields; they live in `tracker_state`. STM-1 shipped without them. Peter's "every controllable number is moddable in v1" framing puts them back in scope. D5/D6/D7 (below) describe how the overlay reaches these fields while preserving D1's single-composition-site invariant.

This ADR locks five+three answers and is the gate for SM dispatching the remaining stories.

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

## Non-decisions (explicitly out of scope)

- **Roll calculator integration.** STM-1..6 do not mod the dice engine. `_st_mod_overlay` is sheet-display only. Future ADR if requested.
- **Auto-expiry.** Already non-goal per PRD; reaffirmed.
- **Per-mod locking.** Already rejected per PRD; reaffirmed.
- **Mid-session WebSocket push of kill-switch flips.** Reload-driven for v1; revisit if STs report needing it.
- **Bulk operations on mods.** No "revoke all on this character" button in v1 — per-character override (`st_mods_suppressed`) achieves the same effect without data loss, which is the better default.

## Concerns and watch-items for implementers

1. **CLAUDE.md amendment is load-bearing.** STM-1 or STM-2 must add a paragraph under "Derived stats are never stored" in CLAUDE.md naming the overlay as the sanctioned exception, *with a link to this ADR*. Without that, a future agent will treat the overlay as a violation and "fix" it.

2. **Path-string parsing is the silent failure surface.** `stat_path` is a free string in the DB. `applyStMods` will need a small `getByPath`/`setByPath` helper. Validate every path against a known set at write time in `POST /api/st_mods` — reject unknown paths with 400. The static module from D3 is the whitelist source; merit/discipline paths use a regex `^(merits|disciplines)\.[0-9]+\.dots$`. A typo'd stat_path in the DB is a mod that silently never renders; rejection at create time is much cheaper than diagnosis later.

3. **Listener-routing reminder.** Per memory ([feedback_listener_routing_static_blind_spot](feedback_listener_routing_static_blind_spot.md)), STM-4's marker click handler must be wired through delegated routing, not registered ad-hoc per render. Click handlers attached inside a `change`-listener silently no-op and static review does not catch it. STM-5's create-form handlers face the same risk.

4. **`current.*` field names.** The PRD uses `current.damage`, `current.willpower`, `current.vitae`. Verify against `public/js/data/accessors.js` before STM-5 ships its dropdown — if the actual fields are at the top level (e.g. `c.damage_bashing`, `c.damage_lethal`, `c.damage_aggravated`), the static map needs to match. STM-2's resolve-sanity-check catches this.

5. **`_st_mod_overlay` shadowing.** The `_` prefix is the existing in-repo convention for derived/transient fields on character objects (`_gameXP`). Keeping the prefix avoids confusion with persisted fields and signals "do not save this back to the API". The save path in `admin.js:586` and similar must strip `_` -prefixed fields before PUT, which is the existing pattern — verify no regression.

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

**Rev 2 approved.** SM is unblocked to dispatch:

- **STM-2** — now includes (a) the synthetic `current.*` splice and tracker_state read, (b) WS re-render wiring, (c) `specs/reference-data-ssot.md` amendment, (d) `server/routes/st_mods.js` whitelist re-add for the five `current.*` paths, (e) CLAUDE.md amendment per Rev 1 §Concerns Item 1. Path-resolve sanity check now covers `current.*` resolutions on a character + tracker fixture, and is the merge gate for the whitelist edit landing alongside.
- **STM-3** — unchanged from Rev 1. Parallelisable with STM-2.
- **STM-6** — unchanged. Parallelisable with STM-2 / STM-3 (depends on STM-1 only).
- **STM-4 / STM-5** — still gated on STM-2 (overlay shape) and STM-3 (settings). STM-5's dropdown gains the per-track damage entries (D7).

If Angelus has dissent on D5 (splice site / cache reuse / WS re-render) — the most consequential of the Rev 2 additions — comment here or open a Rev 3 before STM-2 dispatches. D6 and D7 are local enough that disagreement can be raised inside STM-4 / STM-5 without re-opening this ADR.
