# Issue #697: N-5 — Trap Door dual-anchor picker UI + render-time White Ants Territory validation

Status: Done

issue: 697
issue_url: https://github.com/angelusvmorningstar/issues/697
branch: piatra/issue-697-n5-trap-door-anchor
epic: MNEC (specs/epic-mnec-necropolis-merits.md)
adr: ADR-005 Rev 2 §D7 (specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md)
dispatch: PROCEED-WITH-NOTICE; HALT-DAR raised + resolved 2026-06-11 (Option B locked — Territory lives on the Trap Door binding, not on Safe Place).

## Story

As a Nosferatu player who has bought Trap Door,
I want to bind the merit to one of my Safe Places AND name the Territory the binding lives in, with the merit rendering non-functional (warning, still persisted) when no Sepulcher owner has White Ants coverage on that Territory,
so that the rule text's "purchased Safe Place above group in a Territory covered by White Ants" lands as actual character state without forcing a coordination dance every time the union shifts.

## HALT-DAR raised + resolved (2026-06-11)

The AC said the destination Safe Place "must live in a Territory the character has White Ants coverage in," but Safe Place merit instances don't carry Territory data. Three options laid out for Khepri:

- **A:** Extend Safe Place schema with `territory: string` + picker. Architecturally cleanest, but pollutes Safe Place's data model with a field whose semantics ("which Trap Door points here") aren't actually Safe Place's.
- **B (CHOSEN):** Add `territory: string` to Trap Door's `attached_to`. Constraint data lives on the relationship, not on the entity.
- C: Lenient stub — rejected (defeats the AC).

Peter's reasoning: "Safe Places can be anywhere — in or out of a campaign Territory. The Territory requirement is a property of THIS Trap Door's attachment to THAT Safe Place." The lesson worth pinning: constraint data goes on the relationship, not on the entity, when the constraint is specific to one consumer.

## What ships

- **Helper** `validateTrapDoorAnchor(c, m, chars)` in `public/js/data/rules-helpers.js` — returns `{ valid, reason }`. Checks: `attached_to.territory` present; territory slug is in `getNecropolisInfectedTerritories(chars)` (the N-4 union helper).
- **Schema** — `attached_to` object form gains an optional `territory: string` field (Haven/Mandragora don't use it; Trap Door requires it via the route middleware).
- **Server middleware** `validateTrapDoorAnchorMiddleware` — wired into POST + PUT + POST `/wizard`. **Presence-only** check (per Khepri's resolution): rejects Trap Door saves where `attached_to` is missing or any of origin / destination / territory is absent. The "is the Territory currently infected" check stays render-time per ADR-005 D7 + persisted-not-removed semantics.
- **Sheet picker UI** — three controls when a Trap Door merit is on the character:
  - **Origin** — read-only "Necropolis Sepulcher" label (locked).
  - **Destination** — single-select from the character's existing Safe Place merits (uses `domKey` as the value, mirroring Haven's existing attached_to UX).
  - **Territory** — single-select **filtered** to currently-infected Territories (per Khepri's UX detail call). If a previously-picked slug drops out of the union (post-shrink edge), it's kept as a "(no longer covered)" option so the user can see what was set.
- **Non-functional render** — when `validateTrapDoorAnchor` reports invalid, the picker block displays an inline warning at the top ("⚠ Non-functional: <reason>"). The merit stays persisted in the list; only the picker block surfaces the warning. Player can fix by changing the destination/territory OR by another Sepulcher owner picking up the relevant Territory in their White Ants.
- **Handler** `shSetTrapDoorAnchor(realIdx, field, value)` in `edit-domain.js`, threaded through `edit.js` re-export + `admin.js` / `app.js` window assignment. Auto-upgrades legacy string-form `attached_to` to the object form on first edit.

## Acceptance gates

1. ✅ Triple-anchor picker (origin / destination / territory) renders for Trap Door merits.
2. ✅ Origin auto-resolves to "Necropolis Sepulcher" and is locked / non-editable.
3. ✅ Destination enumerates the character's Safe Place merits via `domKey`.
4. ✅ Territory picker filters to `getNecropolisInfectedTerritories(allChars)` only.
5. ✅ Server middleware rejects (400) Trap Door saves missing any anchor field (origin / destination / territory); legacy string-form `attached_to` rejected for Trap Door.
6. ✅ Other merits (Haven legacy string-form, etc.) unaffected by the Trap Door middleware.
7. ✅ Partial-body tolerance — PATCH bodies that omit `merits` skip the validator.
8. ✅ `validateTrapDoorAnchor` returns valid when picked Territory is in the union; invalid (with reason) otherwise; cross-character union read confirmed (Alice's Trap Door can point at Bob's White Ants pick — collective sharing, not owner-only).
9. ✅ Non-functional render: picker block shows the warning when invalid; merit stays in the merit list (persisted-not-removed).
10. ✅ 12 vitest cases cover the four required ACs + edge cases (null/missing attached_to, empty union, partial bodies, non-Trap-Door isolation, legacy string-form rejection).
11. ✅ No regression — 1294/1294 individual tests pass; same three pre-existing archive-import file failures carry forward from N-1.

## Design notes

- **Picker UX: filter, not show-all.** Khepri's resolution offered both shapes; chose filter because at pick-time it prevents invalid selection upfront (the player can't pick a non-infected Territory). The "Territory drops out of the union after picking" edge is handled by keeping the previously-picked slug as a "(no longer covered)" option so the user can see what was set and intentionally change it.
- **Auto-resolve origin in the handler, not the renderer.** Mutating state on render is a footgun (causes unexpected dirty-flag flips on read-only renders). The handler upgrades `attached_to` to the object form on first edit; the renderer treats missing/legacy `attached_to` as a blank picker with origin "Necropolis Sepulcher" displayed by default. First user interaction with any field creates the object.
- **`attached_to.territory` is the triple-anchor extension of ADR-005 §D7's named-anchor map.** The map design naturally accommodates additional keys per merit type. Haven/Mandragora keep using `{ destination }`; Trap Door uses `{ origin, destination, territory }`. The normaliser (`normaliseAttachedTo`) is unchanged — it passes through arbitrary keys on the object form.
- **Server middleware is presence-only (NOT "is this Territory currently infected").** Two reasons (Khepri's resolution):
  - The infected union changes over time. A server-side hard-fail on save would force a coordination dance every time another Sepulcher owner mutates White Ants.
  - Persisted-not-removed semantics: an existing Trap Door whose Territory drops out of the union stays saveable. The render flags it; the player fixes it without re-buying the merit.

## Out of scope

- **Trap Door's mechanical effect** (the bypass-Safe-Place mechanic) — ST adjudication, not engine-implementation. UI surfaces constraint satisfaction; ST applies the mechanic.
- Other dual-anchor merits — none exist; Trap Door is the first instance per ADR-005 D7.

## Tasks / Subtasks

- [x] `validateTrapDoorAnchor(c, m, chars)` helper in `rules-helpers.js`.
- [x] `attached_to.territory` field in `character.schema.js`.
- [x] `validateTrapDoorAnchorMiddleware` in `normalize-character.js` — wired into POST + PUT + POST /wizard.
- [x] `_trapDoorAnchorBlock(c, m, realIdx)` renderer in `sheet.js` — called after `_whiteAntsTerritoriesBlock` in the general-merits branch.
- [x] `shSetTrapDoorAnchor(realIdx, field, value)` handler in `edit-domain.js` — re-exported through `edit.js`, threaded through `admin.js` + `app.js` window assignment.
- [x] CSS for `.td-anchor-block` + row variants in `components.css`.
- [x] 12 vitest cases.
- [x] Story file (this one).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **HALT-DAR resolution memory worth pinning.** "Constraint data goes on the relationship, not on the entity, when the constraint is specific to one consumer." Saving a memory entry for it — the Option A → Option B pivot is generalisable (Trap Door isn't the last merit that'll need a relationship-scoped constraint).
- **The three test-file failures carry forward** from N-1 (archive-import paths). Not caused by N-5.
- **Worktree pattern continued** (`/tmp/tm-ptah/n5-trapdoor`, node_modules + server/.env symlinked from main).

### File List

**New**
- `server/tests/n5-trap-door-anchor.test.js` — 12 vitest cases
- `specs/stories/issue-697-n5-trap-door-anchor.story.md` — this file

**Modified**
- `public/js/data/rules-helpers.js` — added `validateTrapDoorAnchor`
- `public/js/editor/sheet.js` — `_trapDoorAnchorBlock` renderer + import wiring
- `public/js/editor/edit-domain.js` — `shSetTrapDoorAnchor` handler
- `public/js/editor/edit.js` — re-exports `shSetTrapDoorAnchor`
- `public/js/admin.js` — imports + window-assigns `shSetTrapDoorAnchor`
- `public/js/app.js` — imports + window-assigns `shSetTrapDoorAnchor`
- `public/css/components.css` — `.td-anchor-block` and row variants
- `server/schemas/character.schema.js` — `attached_to.territory: string` optional field
- `server/lib/normalize-character.js` — `validateTrapDoorAnchorMiddleware`
- `server/routes/characters.js` — wires middleware into POST / PUT / POST /wizard

### Change Log

- 2026-06-11 (Ptah): HALT-DAR on Safe Place / relationship-scoped Territory ownership; resolved Option B (Territory on the Trap Door binding).
- 2026-06-11 (Ptah): N-5 Trap Door triple-anchor picker shipped.
