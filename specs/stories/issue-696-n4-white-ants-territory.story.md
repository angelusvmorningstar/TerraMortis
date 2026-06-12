# Issue #696: N-4 — White Ants Territory linkage (picker UI + render union helper)

Status: Done

issue: 696
issue_url: https://github.com/angelusvmorningstar/issues/696
branch: piatra/issue-696-n4-white-ants-territory
epic: MNEC (specs/epic-mnec-necropolis-merits.md)
adr: ADR-005 Rev 2 (specs/architecture/adr-005-pool-grant-and-sharing-scope-generalisation.md)
dispatch: PROCEED-WITH-NOTICE.

## Story

As a player whose Nosferatu character has White Ants dots,
I want to pick which Territories the Necropolis has infected — one Territory per dot, from the live campaign Territory list — and have that selection persist and surface as the Necropolis-infected union for any render-time consumer (N-5 Trap Door anchor validation; ST-side maps),
so that the rule text's "for each dot in this merit select a Territory" lands as actual character state, with N-5 unblocked to consume the union helper.

## What ships

- **Data shape** — White Ants merit entries gain a `territories: string[]` field holding the picked Territory slugs.
- **Sheet editor UI** — one `<select>` per dot of effective White Ants rating, populated from the live `getStoredTerritories()` store (same source the admin app loads at boot via `setStatusTerritories`). Empty pickers show "Pick a Territory"; duplicate selections within the same merit show "Duplicate" warnings with a coloured row border.
- **Server-side cross-field validation** — new `validateWhiteAntsTerritoriesMiddleware` runs after `normalizeMeritsMiddleware` on POST + PUT + POST `/wizard`. Rejects saves where `territories.length !== effective_rating` (effective rating = `cp + xp + sum(free_grants.*) + sum(legacy free_<slug>)`) and saves with duplicate slugs within a single merit. Partial bodies that omit `merits` skip the validator (touchstone-style PATCH stays unaffected).
- **Render-side helper** — `getNecropolisInfectedTerritories(chars)` in `public/js/data/rules-helpers.js`. Walks `chars`, filters to Sepulcher owners (cp+xp >= 1), aggregates `territories[]` from each owner's White Ants merits, dedupes preserving insertion order. Pure ES module — importable client/server/vitest. N-5 consumes this.
- **`getStoredTerritories()` exported** from `accessors.js` — module-level store (populated at app boot via the existing `setStatusTerritories` path) now has a public reader so the sheet picker doesn't have to re-fetch `/api/territories`.

## Acceptance gates

1. ✅ `territories: string[]` accepted on every merit shape per the schema; cross-field length check at the route level via middleware.
2. ✅ Save fails (400) when `territories.length !== rating` — short, long, and mixed-source-rating (free_grants.necro contributes) cases asserted.
3. ✅ Save fails (400) on duplicate slugs within a merit.
4. ✅ Sheet renders one `<select>` per effective dot, options from the live territories store; empty rows + duplicate rows surface warning indicators; rating-zero shows no picker.
5. ✅ `getNecropolisInfectedTerritories` union math: Alice ∪ Bob → deduplicated; insertion order preserved; non-Sepulcher owners contribute zero even if their White Ants merit has `territories[]` populated; missing/empty input handled defensively.
6. ✅ Partial-body tolerance — a PUT body that omits `merits` (e.g. a touchstone-only save) is not blocked by White Ants validation.
7. ✅ No regression — 1282/1282 individual tests pass; same 3 pre-existing archive-import test-file failures carry forward from N-1.

## Out of scope

- **-3 penalty enforcement** — the rule text's "-3 to all rolls to detects their personal actions" is roll-engine adjudication. ST Mods overlay (Epic STM) applies it manually per ST adjudication, consistent with True Worm's sun damage handling. A future story can integrate it natively when the roll engine grows the relevant hook.
- Cross-character coalition / Coterie-level Territory awareness (out of MNEC scope).
- N-5 Trap Door anchor picker — separate story; consumes the union helper this story ships.

## Tasks / Subtasks

- [x] `getNecropolisInfectedTerritories(chars)` in `rules-helpers.js` — pure helper.
- [x] `getStoredTerritories()` reader in `accessors.js` — exposes the existing module-level store.
- [x] `m.territories: { type: 'array', items: { type: 'string' } }` in `character.schema.js` merit shape.
- [x] `validateWhiteAntsTerritoriesMiddleware` in `normalize-character.js` — wired into POST + PUT + POST /wizard.
- [x] `_whiteAntsTerritoriesBlock(m, realIdx)` renderer in `sheet.js` — called after `meritBdRow` in the general-merits branch.
- [x] `shSetWhiteAntsTerritory(realIdx, dotIdx, value)` handler in `edit-domain.js` — re-exported through `edit.js`, threaded through `admin.js` + `app.js` window assignment.
- [x] CSS for `.wa-picker-block` + row variants in `components.css`.
- [x] 11 vitest cases in `n4-white-ants-territory.test.js` (helper + route validation + partial-body tolerance + rating-zero edge).
- [x] Story file (this one).

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **JSON-Schema cannot express the cross-field length check.** `territories.length === rating` requires reading a sibling-field-derived value (effective rating), which isn't representable inside Ajv's per-property schema. The middleware handles it, and the schema's `array of string` shape is the upstream guard.
- **Effective rating math mirrors `meritFreeSum`** (sum of new `free_grants.*` map + the 14 legacy flat `free_<slug>` fields, per N-1's transition shape) plus `cp + xp`. Inlined in the middleware to avoid importing the client helper on the server hot path — the calc is small enough that the duplication is preferable to the cross-module dependency.
- **Picker injected in the general-merits branch only.** White Ants is most naturally a `category: 'general'` merit (no influence/domain/standing semantics); the seed has `sub_category: null`. If the merit ends up assigned to a different category by some user flow, the picker won't render — easy follow-up to add the call site if it ever surfaces.
- **The `getStoredTerritories` getter completes the existing `setStatusTerritories` pair** that was previously read-internal (the `getRegentTerritoryFor` accessor used it). Single source of truth for the live Territory list; the sheet picker doesn't re-fetch `/api/territories`.
- **Inline-onchange handler is the established sheet.js pattern** (`shEditDomMerit`, `shEditGenMerit`, etc.). `shSetWhiteAntsTerritory` follows it exactly. This is NOT the listener-routing blind spot from the memory — there's no `change` listener routing click events; the `onchange` attribute binds directly to the global handler exposed by `admin.js`/`app.js`.
- **Three pre-existing test-file failures** (archive-import) carry forward from N-1. Not caused by N-4.
- **Worktree pattern continued** (`/tmp/tm-ptah/n4-whiteants`, node_modules + server/.env symlinked from main).

### File List

**New**
- `server/tests/n4-white-ants-territory.test.js` — 11 vitest cases
- `specs/stories/issue-696-n4-white-ants-territory.story.md` — this file

**Modified**
- `public/js/data/rules-helpers.js` — added `getNecropolisInfectedTerritories`
- `public/js/data/accessors.js` — added `getStoredTerritories` reader
- `public/js/editor/sheet.js` — picker renderer + import wiring
- `public/js/editor/edit-domain.js` — `shSetWhiteAntsTerritory` handler
- `public/js/editor/edit.js` — re-exports `shSetWhiteAntsTerritory`
- `public/js/admin.js` — imports + window-assigns `shSetWhiteAntsTerritory`
- `public/js/app.js` — imports + window-assigns `shSetWhiteAntsTerritory`
- `public/css/components.css` — `.wa-picker-block` and row variants
- `server/schemas/character.schema.js` — `territories: string[]` on merit shape
- `server/lib/normalize-character.js` — `validateWhiteAntsTerritoriesMiddleware`
- `server/routes/characters.js` — wires the middleware into POST / PUT / POST /wizard

### Change Log

- 2026-06-11 (Ptah): N-4 White Ants Territory linkage shipped.
