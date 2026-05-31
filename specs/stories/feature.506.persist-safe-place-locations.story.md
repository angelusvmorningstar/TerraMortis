---
issue: 506
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/506
branch: morningstar-issue-506-persist-safe-place-locations
---

# Story feature.506: Persist Safe Place / Haven locations on the character so they carry between downtime cycles

**Story ID:** feature.506
**Epic:** Player downtime form polish (standalone GitHub issue; follows feature.504)
**Status:** review
**Date:** 2026-06-01
**Issue:** [#506](https://github.com/angelusvmorningstar/TerraMortis/issues/506)
**Branch:** morningstar-issue-506-persist-safe-place-locations

---

## User Story

As a player filing a downtime, I want the street/suburb I record for each of my safe places (and haven) to be remembered between downtime cycles, so that I only change a location when it actually moves rather than re-typing the same address every cycle.

---

## Background

feature.504 added the ungated "Safe Places and Havens" section to the player downtime form. It renders one street+suburb text input per `Safe Place` domain-merit instance and persists the answers **only into the downtime submission** (`responses.safe_place_location_${i}`), pre-filling from that same submission. Because every cycle opens a fresh submission, the inputs start blank each downtime.

The location of a safe place is a stable property of the **character**, not of a single cycle. This story moves the canonical store of each location onto the character document in MongoDB so it survives across cycles, while leaving feature.504's per-cycle submission snapshot intact.

**Headline architectural constraint (verified):** the player-facing form **cannot** use the existing character write path. `PUT /api/characters/:id` is `requireRole('st')` (`server/routes/characters.js:384`). Players only have `POST /api/characters/wizard` (creation). So a **new, narrowly-scoped player endpoint** is required — one that touches *only* the safe-place `location` fields on the requester's own character. This mirrors the established ownership-scoping pattern (NPCR-14 lineage) used in `archive-documents.js`, `history.js`, `questionnaire.js`.

---

## Acceptance Criteria

1. Given a `Safe Place` merit with a saved location on the character, when the player opens a **new** downtime cycle, then that safe place's location input is pre-filled with the stored value.
2. Given a player edits a safe-place location and **submits** the downtime, when the character is re-fetched, then the updated location is persisted to MongoDB on the character.
3. Given a player changes nothing, when they submit, then the stored location on the character is unchanged.
4. Locations are keyed to a **stable merit identity** so adding/removing/reordering Safe Place merits does not mismatch a location to the wrong instance.
5. Locations remain **optional** and stay **out of** the completeness/submit gate (unchanged from feature.504).
6. A Haven still shows on its hosting Safe Place's input marked "(Haven)" — no regression to feature.504 behaviour.

---

## Decisions on the issue's open questions

The issue left two questions open. Resolved here so the dev does not guess. Flag to ST if any are wrong.

### Q1 — Store location on the merit object, NOT in a separate `domKey → location` map

**Decision: add a `location` string field directly to each Safe Place merit object (`merits[].location`).**

Rationale:
- **It travels with the instance by construction.** No lookup key is needed, so AC#4 (stable identity) is satisfied automatically — the location is part of the same object as `name`/`qualifier`/`rating`.
- **It sidesteps the feature.504 domKey-collision edge case.** QA finding #2 on feature.504: two Safe Places with the same `domKey` (both `qualifier: null`) are indistinguishable by key. A `domKey → location` map would inherit that ambiguity (two instances, one key). Storing on the object avoids it entirely — each merit holds its own `location`.
- **Minimal schema surface.** One line added to the merit schema. A separate map would need a brand-new root-level character field (the root is `additionalProperties: false`, `character.schema.js:41`) *and* still carry the collision bug.
- **Round-trips through the existing editor for free.** Once `location` is a known merit property, the admin full-sheet editor's `PUT` passes it through untouched (no UI field needed; `additionalProperties: false` no longer rejects it).

### Q2 — Write on final submit only, NOT on every autosave

**Decision: the character write fires once, at downtime submit, not on the per-keystroke/2s autosave.**

Rationale:
- Locations are **low-churn** — they change rarely (only when a safe place physically moves). Piggybacking a character write onto every autosave (`saveDraft`, fires repeatedly) is wasteful and invites races against the submission write.
- Submit-time write fully satisfies AC#2 ("…and submits, then the updated location is persisted").
- The in-cycle autosave continues to write the typed value into the **submission** (`responses.safe_place_location_${i}`) exactly as feature.504 does, so an in-progress edit still survives a mid-cycle reload (see pre-population precedence below).

---

## Design

### Storage shape (character document)

Add to the `merit` definition in `server/schemas/character.schema.js` (the object at `:370-436`, currently `additionalProperties: false`):

```js
location: { type: ['string', 'null'] },
```

Only `Safe Place` merits will carry it in practice, but the field is defined on the shared merit object (other merits simply omit it). No migration: absent = no stored location, handled as empty.

### New player-scoped write endpoint

`PATCH /api/characters/:id/safe_place_locations` in `server/routes/characters.js`.

- **Auth:** any authenticated user (`requireRole('player', 'st')` or equivalent), then an ownership gate that mirrors `characters.js:331-333`:
  ```js
  const owns = (req.user.character_ids || []).some(id => id.toString() === oid.toString());
  if (!isStRole(req.user) && !owns) return res.status(403).json({ error: 'FORBIDDEN', message: 'Not your character' });
  ```
- **Why a dedicated narrow endpoint, not the ST `PUT`:** `PUT /:id` is ST-only and would let a player rewrite their entire sheet. This endpoint mutates **only** `location` on `Safe Place` merits — minimal attack surface, scoped at the handler level (the NPCR-14 principle: scope ownership in the handler, not post-hoc).
- **Body shape:** a positional array aligned to the **same filter the form renders** —
  `merits.filter(m => m.category === 'domain' && m.name === 'Safe Place')`, in document order — e.g.
  ```json
  { "locations": ["12 Dock St, Harbourside", "Flat 4, Northshore"] }
  ```
  Index `i` in `locations` maps to the i-th Safe Place merit in that filtered order. (Index alignment is stable within a single load→submit; same assumption feature.504 already makes for the submission keys.)
- **Handler logic:** load the doc, walk its merits, for each Safe Place merit (in filter order) set `location` from `locations[i]` when that entry is a string; leave every other field and every other merit untouched. Validate each entry is a string with a sane length cap (e.g. ≤ 200 chars); coerce empty string to `''` (or `null`). Re-run partial validation (`validateCharacterPartial`) before write so the doc stays schema-valid. Persist via the same Mongo update the route already uses.
- **Response:** the updated character (or at least the updated merits) so the client can refresh `currentChar` in place.

### Client: pre-population precedence (renderer)

In `renderSafePlaceLocationsSection(saved)` (`downtime-form.js:4434-4461`), change the value source for each input from:

```js
const val = saved['safe_place_location_' + i] || '';
```

to a precedence that prefers an in-progress submission edit, then the persisted character value, then blank:

```js
const val = (saved['safe_place_location_' + i] ?? sp.location) || '';
```

- `saved[...]` (current submission) wins so a mid-cycle reload keeps what the player just typed (preserves feature.504 AC#6).
- `sp.location` (the merit's stored value) provides the **cross-cycle** pre-fill for a fresh cycle whose submission has no value yet (AC#1).
- `sp` is already in scope — it is the merit being iterated at `:4451`.

> Use `??` so a deliberately-cleared (`''`) in-cycle edit isn't overridden by the stored value. If lint/build forbids `??` here, an explicit `Object.prototype.hasOwnProperty` check on `saved` is equivalent.

### Client: write-through on submit

In the **submit** path only (not `saveDraft` autosave — see Q2), after the submission write succeeds, collect the current safe-place inputs the same way the collector at `downtime-form.js:567-572` does and `apiPatch` them to the new endpoint:

```js
const _safePlaces = (currentChar?.merits || [])
  .filter(m => m.category === 'domain' && m.name === 'Safe Place');
if (_safePlaces.length) {
  const locations = _safePlaces.map((sp, i) => {
    const el = document.getElementById('dt-safe_place_location_' + i);
    return el ? el.value : (sp.location || '');
  });
  await apiPatch(`/api/characters/${encodeURIComponent(String(currentChar._id))}/safe_place_locations`, { locations });
  // refresh in-memory currentChar merits so a same-session re-render shows the new value
}
```

- `apiPatch` already exists (`public/js/data/api.js:36`).
- Locate the exact submit handler (the finalise/submit branch around `downtime-form.js:1249-1258`, distinct from the `saveDraft` autosave at `:1128`). Add the write-through there, after the submission POST/PUT resolves.
- **Failure handling:** a failed location write must not block or roll back the downtime submission (the submission is the primary action). Log/surface a soft warning; the submission still stands. Locations are optional (AC#5).

### dev-fixtures interceptor (local dev)

Per the dev-fixtures rule (new `/api/*` endpoints need a handler under `local-test-token` or they appear empty/500 on localhost): add a handler in `public/js/dev-fixtures.js` for `PATCH /api/characters/:id/safe_place_locations` that mutates the in-memory CHARS entry's Safe Place merit `location` fields and echoes the character back, so the write-through + pre-fill round-trips locally. The existing Yusuf Kalusicj fixture (2 Safe Places + Haven, added in feature.504) is the test subject.

---

## Relevant data shapes (verified against code)

- **Safe Place is multi-instance**: separate `{category:'domain', name:'Safe Place'}` entries, one per safe place. Count/iterate via `filter(...).length`, never `effectiveDomainDots` (which sums dots) — `downtime-form.js:379-387`.
- **`domKey(m)`** = `m.name + (m.qualifier ? ' ('+m.qualifier+')' : '')` — `public/js/editor/domain.js:24`. Used for the `(Haven)` marker (`Haven.attached_to === domKey(sp)`), unchanged. Note: this story does **not** use domKey as the storage key — storage is positional on the merit object, which is why the domKey-collision edge case is moot here.
- **`currentChar`** is the full character doc, freshly fetched in `renderDowntimeTab` (`downtime-form.js:~1336` via `apiGet('/api/characters/<id>')`), `merits` reliably present. Its merits will now carry `location`.
- **Merit schema**: `server/schemas/character.schema.js:370-436`, `additionalProperties: false` — must add `location`.
- **Ownership**: `req.user.character_ids` on the player record; ownership check pattern at `characters.js:331-333`, `archive-documents.js:24-25`, `history.js:43-44`, `questionnaire.js:50-51`.

---

## Tasks / Subtasks

- [x] **Task 1 — Schema: add `location` to merit** (AC: #2, #4)
  - [x] In `server/schemas/character.schema.js`, added `location: { type: ['string', 'null'] }` to the `merit` definition (after `active`). No other schema change.
- [x] **Task 2 — New player-scoped endpoint** (AC: #2, #3, #4)
  - [x] Added `PATCH /api/characters/:id/safe_place_locations` to `server/routes/characters.js` (after the `st_mods_suppressed` PATCH).
  - [x] Auth: authenticated (router-level); ownership gate mirroring `:331-333` with ST bypass via `isStRole`.
  - [x] Body `{ locations: string[] }`; applied positionally to `merits.filter(domain && Safe Place)` in doc order; validates array + each entry is a string, caps length at 200; leaves all other fields/merits untouched (spread `{ ...m, location }` only on Safe Place merits). 400 on non-array / non-string entry; 404 unknown; returns the updated character.
- [x] **Task 3 — Renderer pre-population precedence** (AC: #1, #6)
  - [x] In `renderSafePlaceLocationsSection` (`downtime-form.js:4455`), the input value is now `(saved['safe_place_location_'+i] !== undefined/null) ? saved : (sp.location || '')`. `(Haven)` marker and zero-safe-places omission unchanged.
- [x] **Task 4 — Write-through on submit** (AC: #2, #3)
  - [x] In `submitForm` (`downtime-form.js`, after the submission POST/PUT resolves, before the success toast), `apiPatch` the collected `locations` to the new endpoint. Values read from `responses` (already collected), falling back to `sp.location`.
  - [x] Refreshes in-memory `currentChar.merits` from the response so a same-session re-render reflects the change.
  - [x] Soft-fail in its own try/catch — a location-write error logs a warning and never undoes/blocks the submission. NOT wired into the `saveDraft` autosave (submit-only, per the design decision).
- [x] **Task 5 — dev-fixtures handler** (local dev)
  - [x] Added a `PATCH /api/characters/:id/safe_place_locations` handler to `public/js/dev-fixtures.js` (after the PUT characters handler) that mutates in-memory CHARS Safe Place `location` positionally and echoes the char. Works with the existing Yusuf fixture (2 Safe Places + Haven).
- [x] **Task 6 — Tests** (AC: all)
  - [x] Server test `server/tests/api-characters-safe-place-locations.test.js` (11 tests): persists to the right Safe Place merit; non-Safe-Place merits + other fields untouched; shorter array leaves trailing SP unchanged; idempotent write (AC#3); ST can write any; 403 non-owner; 400 non-array; 400 non-string entry; 404 unknown; 400 malformed id; 401 unauth. All pass.
  - [x] Playwright `tests/issue-506-persist-safe-place-locations.spec.js` (4 tests): fresh-cycle pre-fill from `sp.location` (AC#1); in-progress submission edit overrides stored (AC#1 precedence); `(Haven)` marker unaffected (AC#6); edit + submit PATCHes the endpoint with the typed value (AC#2). All pass.
  - [x] Regression: `issue-504` (6) + DT player smoke (16) green; `api-characters-crud` + `api-characters` (49) green.

---

## Dev Notes

- **Reuse the ownership-gate pattern verbatim** — `characters.js:331-333` / `archive-documents.js:24-25`. Do not invent a new auth shape.
- **Do NOT widen the ST `PUT`** to players, and do NOT route the location write through it. The narrow endpoint is the security boundary; it must only ever touch `Safe Place` merit `location` fields.
- **Submission shape is out of scope** — keep the existing `responses.safe_place_location_${i}` collector (`downtime-form.js:567-572`) exactly as is. The ST DT-processing view still reads the per-cycle snapshot from `responses`; the character write is purely additive.
- **Positional index alignment** is the same assumption feature.504 already makes (renderer and collector both filter identically). Storing on the merit object means the *stored* value is robust to reordering; only the in-flight `locations[]` payload relies on order, and that is captured within one load→submit.
- **British English** in any UI copy; **`esc()`** every interpolated string (unchanged from feature.504).
- **Optional, never gated** — do not wire locations into `isMinimalComplete` / `updateSectionTicks` (feature.504 Dev Note still holds; QA confirmed the section ✔ is cosmetic).
- **Out of scope:** backfilling historical locations from past submissions; ST/admin UI for editing locations; address validation/geocoding. Mentioned in the issue as explicitly deferred.

### Project Structure Notes

- Files touched: `server/schemas/character.schema.js` (one field), `server/routes/characters.js` (new endpoint), `public/js/tabs/downtime-form.js` (pre-fill precedence + submit write-through), `public/js/dev-fixtures.js` (interceptor handler), plus a server test and a Playwright spec.
- No new CSS, no new collections, no migration. The schema field is additive and optional.
- `apiPatch` already exists (`public/js/data/api.js:36`) — no api-helper change.

### References

- ST-only character write (the constraint): `server/routes/characters.js:384` (`PUT /:id`, `requireRole('st')`)
- Ownership gate to mirror: `server/routes/characters.js:331-333`; siblings `archive-documents.js:24-25`, `history.js:43-44`, `questionnaire.js:50-51`
- Merit schema (add `location`): `server/schemas/character.schema.js:370-436` (root `additionalProperties:false` at `:41`)
- Renderer + current per-submission pre-fill: `public/js/tabs/downtime-form.js:4434-4461` (value at `:4455`)
- Per-cycle collector (keep as-is): `public/js/tabs/downtime-form.js:567-572`
- saveDraft autosave (do NOT write-through here): `public/js/tabs/downtime-form.js:1128`
- Submit branch (write-through here): `public/js/tabs/downtime-form.js:1249-1258`
- `currentChar` fresh fetch: `public/js/tabs/downtime-form.js:~1336`
- `domKey`: `public/js/editor/domain.js:24`
- api helpers: `public/js/data/api.js:34-36`
- dev-fixtures interceptor rule: `public/js/dev-fixtures.js` (under `local-test-token`)
- Predecessor story: `specs/stories/feature.504.dt-form-safe-place-locations.story.md` (esp. QA finding #2, the domKey-collision edge this design resolves)
- Issue: [#506](https://github.com/angelusvmorningstar/TerraMortis/issues/506)

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia, dev-story)

### Debug Log References

- `node --check` clean on `character.schema.js`, `characters.js`; `node --check --input-type=module` clean on `downtime-form.js`, `dev-fixtures.js`.
- `server/tests/api-characters-safe-place-locations.test.js` — 11/11 pass (vitest, `tm_suite_test`).
- `tests/issue-506-persist-safe-place-locations.spec.js` — 4/4 pass (chromium, ~15s).
- Regression: `issue-504` (6) + `downtime-player-smoke` (16) = 22/22; `api-characters-crud` + `api-characters` = 49/49.

### Completion Notes List

- Storage shape: `merits[].location` (Q1 decision). One-line additive, optional schema field (`character.schema.js`). Storing on the merit object means the location travels with the instance and the feature.504 domKey-collision edge (QA finding #2) does not apply — each merit holds its own value.
- New player-scoped endpoint `PATCH /api/characters/:id/safe_place_locations` is the sole player write path (the ST-only `PUT /:id` was not widened). Ownership gate mirrors `GET /:id` (`characters.js:331-333`); ST bypasses via `isStRole`. The handler only ever spreads `location` onto `Safe Place` domain merits, positionally aligned to the same filter the form renders/collects by; every other field and merit is left byte-for-byte. Body validated (array of strings, ≤200 chars).
- Pre-fill precedence (renderer): in-progress submission edit (`saved[...]`) wins via an explicit null/undefined check (not `||`, so a deliberately-cleared `''` is honoured), else the persisted `sp.location`, else blank — this is the cross-cycle carry.
- Write-through (Q2 decision): submit-only, NOT autosave. Fires after the submission write resolves, in its own try/catch so a failure never undoes/blocks the (already-saved) submission. Refreshes in-memory `currentChar.merits` from the response.
- dev-fixtures gained a handler for the new endpoint so the local round-trip works under `local-test-token`.
- No migration; absent `location` = no stored value, handled as empty everywhere.

### File List

- `server/schemas/character.schema.js` — added `location: { type: ['string','null'] }` to the merit definition
- `server/routes/characters.js` — new `PATCH /:id/safe_place_locations` player-scoped endpoint
- `public/js/tabs/downtime-form.js` — renderer pre-fill precedence (`sp.location` fallback) + submit-time write-through `apiPatch`
- `public/js/dev-fixtures.js` — interceptor handler for the new endpoint
- `server/tests/api-characters-safe-place-locations.test.js` — new, 11 vitest tests
- `tests/issue-506-persist-safe-place-locations.spec.js` — new, 4 Playwright tests

### Change Log

- 2026-06-01 — QA (Quinn): verified all six ACs against shipped code (not just dev tests). Confirmed the editor round-trip claim — `location` survives the server normalizer and the client `charsForSave`/in-place editor path, so unrelated ST edits do not wipe it. Re-ran 11 server + 4 Playwright independently (green). Verdict: PASS. Two non-blocking low findings logged.
- 2026-06-01 — Implemented #506 (Tasks 1-6). Schema field + player-scoped endpoint + renderer pre-fill precedence + submit write-through + dev-fixtures handler. 11 server + 4 Playwright tests pass; 22 + 49 regression tests green. Status → review.
- 2026-06-01 — Story file created at ready-for-dev. Resolved both issue open questions: store `location` on the merit object (not a domKey-map — sidesteps the feature.504 domKey-collision edge); write on submit only (not autosave). Headline finding: needs a new player-scoped `PATCH /:id/safe_place_locations` endpoint because the existing `PUT` is ST-only. Six tasks (schema, endpoint, pre-fill precedence, submit write-through, dev-fixtures handler, tests).

---

## QA Results (Quinn, claude-opus-4-8)

**Verdict: PASS** — all six acceptance criteria verified against the shipped code (diff read directly), not just the dev's tests.

### Acceptance criteria
- **AC#1 (fresh cycle pre-fills from stored location):** PASS. `renderSafePlaceLocationsSection` (`downtime-form.js:4475-4483`) sources the value as `(_saved !== undefined && _saved !== null) ? _saved : (sp.location || '')`. With no submission, `_saved` is undefined → `sp.location`. Test: fresh-cycle pre-fill asserts both inputs show stored values.
- **AC#2 (edit + submit persists to MongoDB):** PASS. Submit-time `apiPatch` write-through (`downtime-form.js:1264-1286`) → endpoint `$set: { merits }`. Server test asserts the right Safe Place merit carries the typed value; Playwright asserts the PATCH fires with `locations[0]` = the typed string.
- **AC#3 (no change → unchanged):** PASS. The write-through always sends current values; idempotent on the server (re-spreads the same `location`). Server test "idempotent write" confirms.
- **AC#4 (stable merit identity):** PASS. Location is stored ON the merit object, so identity is structural — reorder/add does not re-key. The write payload is positional within a single submit (documented assumption); the stored value is reorder-safe.
- **AC#5 (excluded from completeness gate):** PASS (transitive). The section has no required questions and `gate: null` (from #504); the write-through runs only after `submitForm` validation passes and is in its own try/catch. The AC#2 Playwright test submits successfully, proving the section does not block submit. No dedicated blank-location submit test (minor — see findings).
- **AC#6 (Haven marker intact):** PASS. The `(Haven)` marker logic is unchanged; Playwright regression asserts it on the hosting safe place.

### Code quality / cross-cutting
- **Round-trip safety (the key risk):** VERIFIED SAFE. `location` survives (a) the server normalizer — `normalizeMerit` mutates only `rating`/channel fields in place, no field whitelist; and (b) the client ST editor — `charsForSave` deep-clones (no rebuild) and `edit.js`/`edit-domain.js` mutate `c.merits[idx]` in place. So an unrelated ST edit does not wipe a player's stored locations. The story's "round-trips for free" claim holds.
- **Auth boundary:** correct. New endpoint is router-auth (any authenticated) + ownership gate mirroring `GET /:id` (`characters.js:331-333`), ST bypass via `isStRole`. The ST-only `PUT /:id` was not widened. Server tests cover 403 non-owner, 401 unauth.
- **Input validation:** array-required + per-entry string + 200-char cap; 400 on non-array/non-string, 404 unknown, 400 malformed id. All covered.
- **Normalizer bypass:** the PATCH does not run `normalizeMeritsMiddleware` — correct by design (it reads already-normalized merits and only adds `location`, never touching rating/channels).
- **No regressions:** issue-504 (6) + DT player smoke (16) green; api-characters-crud + api-characters (49) green; schema loads (49 char tests pass with the new field).

### Findings (non-blocking)
1. **[Low/concurrency]** The write payload aligns client `currentChar.merits` order to a fresh server-side `char.merits` read by position. If the merit array were reordered server-side between the player's form-load and submit (e.g. a concurrent ST edit of that same character), a location could land on the wrong safe place. Effectively impossible in normal play (a player submitting their own downtime while an ST simultaneously reorders their merits). Documented as a within-submit assumption; no fix required.
2. **[Low/coverage]** AC#5 is proven transitively (the AC#2 submit succeeds) rather than by a dedicated "submit with all locations blank" test. Optional to add for explicitness.

### Test coverage
- `server/tests/api-characters-safe-place-locations.test.js` — **11/11 pass** (~3.6s).
- `tests/issue-506-persist-safe-place-locations.spec.js` — **4/4 pass** (~15s chromium).
