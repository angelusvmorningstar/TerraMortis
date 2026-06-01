---
issue: 510
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/510
branch: morningstar-issue-510-carthian-pull-sphere-enum
---

# Story feature.510: Carthian Pull sphere — fixed enum + match/augment the existing merit

**Story ID:** feature.510
**Epic:** Player downtime form polish (standalone GitHub issue; corrects feature.508)
**Status:** review
**Date:** 2026-06-01
**Issue:** [#510](https://github.com/angelusvmorningstar/TerraMortis/issues/510)
**Branch:** morningstar-issue-510-carthian-pull-sphere-enum

---

## User Story

As a player allocating my Carthian Pull dot to Allies or Contacts, I want to pick the sphere from the real, fixed list of spheres and have the dot land on the *existing* merit of that sphere (or create it correctly), so that the rest of the system recognises it and I never end up with an unrecognised or duplicate merit.

---

## What this corrects (from feature.508)

feature.508 (PR #509, on `dev`) shipped the Carthian Pull section but got the **sphere** handling wrong. Three defects:

1. **Free-text sphere.** `renderCarthianPullSection` renders `<input type="text" id="dt-carthian_sphere">` (`downtime-form.js:~4519`). A sphere is a **qualifier from a fixed enum** (`INFLUENCE_SPHERES`, 16 values, `constants.js:123`). Free text the system doesn't recognise breaks action detection and influence calc.
2. **Always-push.** The endpoint (`characters.js:547-557`) **always** creates a new Allies/Contacts instance — it never matches the existing merit by sphere. Re-allocating spawns duplicates.
3. **Wrong field.** It stores the sphere in `spheres:[…]` for **both** Allies and Contacts. Allies stores a single sphere in **`area`**; only Contacts uses `spheres[]`.

The section/live-write architecture, the `free_carthian` channel (already registered everywhere), per-cycle behaviour, and Haven/Herd handling are all **unchanged** — this is a targeted correction to the Allies/Contacts sphere path.

---

## Decided behaviour (PO — do not re-ask)

Allies and Contacts model spheres differently, and the allocation differs accordingly:

### Allies — one merit instance per sphere (`area`), rating = dots in that sphere (1–5)
- Sphere **not held** → create `{ category:'influence', name:'Allies', area:X, granted_by:'Carthian Pull', free_carthian:1, rating:1 }`.
- Sphere **held below 5** → find the Allies merit with `area === X` and increment it by 1 via `free_carthian` (no `granted_by`, so strip just clears the channel); capped at 5.
- At 5 dots → that sphere is **disabled** in the dropdown; the server also refuses to exceed 5.

### Contacts — single merit, `spheres[]` (one sphere per dot), rating = `spheres.length`; a sphere is present-or-absent
- Sphere **not held**, no Contacts merit → create `{ name:'Contacts', spheres:[X], granted_by:'Carthian Pull', free_carthian:1, rating:1 }`.
- Sphere **not held**, Contacts merit exists → **augment in place**: push `X` into its `spheres[]`, add `free_carthian:1`, and tag the added sphere with `carthian_sphere:X` so it can be cleanly removed on retarget.
- Sphere **already held** → **not allowed**: already-held spheres are excluded from the Contacts dropdown (you cannot hold a sphere twice). Mirrors the sheet editor's existing exclusion (`sheet.js:885`, `spOpts` filters `INFLUENCE_SPHERES` against `used`).

---

## The hard parts (read before coding)

### 1. Contacts `rating` ↔ `spheres.length` coupling
A Contacts merit's rating is meant to equal `spheres.length` (each dot = one sphere; `pruneContactsSpheres` enforces this, `domain.js:217`). `free_carthian` raises rating (rating = cp+xp+free_*, synced by the normalizer). So a Contacts bonus **must push a sphere into `spheres[]`** as well as adding the channel — otherwise rating desyncs from the array and the extra dot has no sphere. Conversely, **stripping** a Contacts bonus must **pop that exact sphere** from `spheres[]`, not just clear `free_carthian`.

### 2. Unambiguous strip of the Contacts bonus → the `carthian_sphere` marker
Array order is not a safe way to identify which sphere was Carthian-added (the sheet editor can edit/prune `spheres[]` by index). So when augmenting an **existing** Contacts merit, record `carthian_sphere: X` on that merit. The strip step then: clear `free_carthian`, remove `carthian_sphere` from `spheres[]`, delete the `carthian_sphere` field, and let the normalizer re-sync rating. (A *created* bonus-only Contacts merit carries `granted_by:'Carthian Pull'` and is simply deleted on strip — no marker needed there.)

### 3. Re-deriving the action slot live (rework of feature.508's `_syncCarthianDetected`)
feature.508's `_syncCarthianDetected` was built for the "separate bonus instance" model — it strips `granted_by:'Carthian Pull'` from `detectedMerits.spheres/.contacts` and re-pushes. That breaks now, because an **augmented** Allies/Contacts merit has **no** `granted_by`. After the live write refreshes `currentChar.merits`, **re-derive** `detectedMerits.spheres` and `.contacts` from `currentChar.merits` using the *same* logic `detectMerits` uses (Allies filter `:313`; Contacts expansion `:327-350`, incl. the `expandedInfluence` standing-grant walk). Extract that derivation into a shared helper called by both `detectMerits` (init) and the Carthian re-render (live), so they cannot diverge. **Do not** re-run the whole `detectMerits` (it has side effects — auto-gates).

### 4. Two distinct caps
- **5 dots per merit** (this story): an Allies sphere can't exceed 5 dots; a Contacts sphere is binary. `Math.min(…,5)` lives in `domMeritTotalSingle` (`domain.js:75`) for domain merits and the editor input clamp (`edit-domain.js:46`); influence merits cap at the UI/validation layer — enforce it in the dropdown (disable) and the endpoint (refuse to exceed 5).
- **5 action slots** (feature.508, unchanged): the existing base-count disable of the whole Allies/Contacts target stays.

---

## Acceptance Criteria

1. The sphere control is a `<select>` populated from `INFLUENCE_SPHERES`; no free-typed value can be submitted.
2. The dropdown is **filtered by target**: Allies shows all spheres (a held one at 5 dots is disabled); Contacts excludes spheres already in the character's Contacts `spheres[]`.
3. **Allies, sphere not held** → a bonus-only Allies merit `{ area:X, granted_by:'Carthian Pull', free_carthian:1, rating:1 }` is created.
4. **Allies, sphere held below 5** → the Allies merit with `area:X` gains 1 dot via `free_carthian`, effective rating capped at 5.
5. **Contacts, sphere not held** → `X` is pushed into the Contacts merit's `spheres[]` with the `free_carthian` dot (new bonus-only Contacts merit if none exists); rating stays equal to `spheres.length` and ≤ 5.
6. **Contacts, sphere already held** → excluded from the dropdown (cannot be chosen).
7. Allies bonus is stored in `area`; Contacts bonus in `spheres[]` — never `spheres[]` for Allies.
8. Retarget/clear removes the bonus and restores the prior state exactly: bonus-only instances deleted; augmented Allies loses the `free_carthian` dot; augmented Contacts loses both the `free_carthian` dot **and** the pushed sphere (no orphan sphere, no rating/`spheres.length` mismatch).
9. The created/incremented dot is recognised downstream (the action slot and influence calc reflect it) because it carries the canonical qualifier.

---

## Tasks / Subtasks

- [x] **T1 — Schema: `carthian_sphere` marker** (AC: #5, #8)
  - [x] Added `carthian_sphere: { type: ['string','null'] }` to the merit definition in `server/schemas/character.schema.js` (next to `free_carthian`).
- [x] **T2 — Endpoint: sphere-aware match/augment/create + clean strip** (AC: #3,#4,#5,#6,#8)
  - [x] Added a server-side `INFLUENCE_SPHERES` const (mirrors the client enum); validate the sphere is in it for allies/contacts (400 otherwise).
  - [x] **Strip**: deletes `granted_by:'Carthian Pull'` instances, clears `free_carthian`, and pops the `carthian_sphere` from `spheres[]` (then deletes the marker). A normalize pass runs after the strip so the cap-check sees accurate base ratings.
  - [x] **Allies**: match `name==='Allies' && (area||'')===X`; augment (`free_carthian+1`, 400 if effective rating already ≥5) or create `{ area:X, granted_by:'Carthian Pull', free_carthian:1, rating:1 }`.
  - [x] **Contacts**: match the Contacts merit; if `X ∉ spheres` push `X` + `free_carthian` + `carthian_sphere:X` (400 if held or already at 5 spheres); create bonus-only `{ spheres:[X], … }` if none.
  - [x] `normalizeCharacterMerits` re-sync retained.
- [x] **T3 — Client: sphere dropdown from the enum, filtered** (AC: #1,#2,#7)
  - [x] Imported `INFLUENCE_SPHERES` into `downtime-form.js`.
  - [x] `renderCarthianPullSection` now renders a `<select>` via `_carthianSphereOptions(target, curSphere)` — Allies shows all spheres (sphere at 5 dots, or a new sphere that would exceed 5 Allies slots, disabled); Contacts excludes already-held spheres (current selection preserved). The bonus-derivation now reads the `free_carthian` bearer (Allies `area`; Contacts `carthian_sphere`/spheres[0]).
  - [x] Section re-renders on target change (unchanged); defer-until-sphere preserved for the `<select>`. `collectResponses` reads the select into `carthian_pull_sphere`.
- [x] **T4 — Live re-derivation (replace `_syncCarthianDetected`)** (AC: #9)
  - [x] Extracted `deriveInfluenceActionMerits(merits) → { spheres, contacts }` (the `expandedInfluence` walk + Allies filter + Contacts expansion); `detectMerits` now uses it for those two arrays.
  - [x] `_syncCarthianDetected` re-derives both arrays from `currentChar.merits` via that helper — handles augmented (no `granted_by`) and created merits; one merit → one slot.
- [x] **T5 — dev-fixtures handler parity** (local dev)
  - [x] Updated the `carthian_pull` interceptor to mirror match/augment/create + clean strip (Allies `area`, Contacts `spheres[]` + `carthian_sphere`).
- [x] **T6 — Tests** (AC: all)
  - [x] `server/tests/api-characters-carthian-pull.test.js` rewritten (15 tests): Allies create-by-area (stored in `area`, not `spheres`); Allies augment (cap 5 → 400); Contacts create; Contacts augment pushes sphere + sets `carthian_sphere`; Contacts already-held → 400; clear pops the Contacts sphere + restores rating; non-enum sphere → 400; retarget moves; Herd augment; ST/403/404/401.
  - [x] `tests/issue-508-carthian-pull-allocation.spec.js` updated (mock → new logic; Allies sphere now `<select>`; coarse-cap test removed) and new `tests/issue-510-carthian-pull-sphere-enum.spec.js` (3): sphere is a `<select>` from the enum (no text input); Contacts dropdown excludes held spheres; choosing a sphere PATCHes the enum value. 8/8 pass.
  - [x] Regression: server characters + merit-logic (151) green; DT player smoke (16) green.

---

## Dev Notes

- **Reuse the sheet editor's sphere patterns.** Allies area dropdown: `sheet.js:940` (`spOpts(m.area)` over `INFLUENCE_SPHERES`). Contacts per-dot dropdown with already-held exclusion: `sheet.js:884-900` (`spOpts` filters `used`). The DT-form dropdown should produce the same option sets.
- **Allies field is `area`** (single string), set via `shEditInflMerit(idx,'area',val)` (`edit-domain.js:44`). **Contacts** uses `spheres[]` per dot, set via `shEditContactSphere` (`edit-domain.js:56-65`). Match these exactly — wrong field = unrecognised merit.
- **`free_carthian` is already a fully-registered channel** (schema, normalize `MERIT_CHANNELS`/`GRANTED_BY_CHANNEL`, `meritFreeSum`, `meritEffectiveRating`, `domMeritContribSingle`, sheet domain split) from feature.508. No channel work; only the new `carthian_sphere` marker field is added.
- **Strip must stay idempotent and total** — after strip there is exactly zero Carthian residue: no `granted_by:'Carthian Pull'` merit, no `free_carthian`, no `carthian_sphere`, no orphan sphere in any `spheres[]`. Verify by retargeting A→B→clear and asserting the doc equals the pre-allocation doc.
- **Effective-rating reads, not raw `rating`** for the 5-dot Allies cap — use `meritEffectiveRating(c, m)` (`domain.js:246`) so bonus dots already on the merit count toward the cap.
- **British English**, `esc()` on interpolated values, reuse `qf-*` classes.

### Out of scope
- Haven/Herd behaviour (unchanged from #508).
- The 5-action-slot cap (separate from the 5-dot cap; unchanged).
- ST/admin display of the allocation.

### References

- `INFLUENCE_SPHERES`: `public/js/data/constants.js:123`
- Free-text input to replace: `public/js/tabs/downtime-form.js` `renderCarthianPullSection` (`dt-carthian_sphere`)
- Endpoint to rewrite: `server/routes/characters.js:515-585` (apply block `:547-568`, strip `:537-544`)
- `_syncCarthianDetected` / `_writeCarthianAllocation` / collect block: `public/js/tabs/downtime-form.js`
- `detectMerits` Allies/Contacts derivation: `:285`, `:313`, `:327-350`
- Allies `area` / Contacts `spheres[]` setters: `public/js/editor/edit-domain.js:44`, `:56-65`, `:92-101`
- Sheet sphere dropdowns + Contacts exclusion: `public/js/editor/sheet.js:940` (Allies), `:884-900` (Contacts, `spOpts`)
- `pruneContactsSpheres` (rating↔array coupling): `public/js/editor/domain.js:217`
- 5-dot cap: `public/js/editor/domain.js:75`; `public/js/editor/edit-domain.js:46`; `meritEffectiveRating` `:246`
- Existing tests: `server/tests/api-characters-carthian-pull.test.js`, `tests/issue-508-carthian-pull-allocation.spec.js`
- Predecessor: `specs/stories/feature.508.carthian-pull-allocation.story.md`
- Issue: [#510](https://github.com/angelusvmorningstar/TerraMortis/issues/510)

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia, dev-story)

### Debug Log References

- Parse-check clean: `character.schema.js`, `characters.js`; `downtime-form.js`, `dev-fixtures.js` (module input-type).
- `server/tests/api-characters-carthian-pull.test.js` — 15/15.
- `tests/issue-510-carthian-pull-sphere-enum.spec.js` (3) + updated `issue-508` (5) — 8/8.
- Regression: 151 server (characters + merit-logic incl. detect/build-merit-actions that exercise the refactored derivation) + 16 DT smoke — green.

### Completion Notes List

- **Allies vs Contacts modelled correctly.** Allies → one merit per sphere keyed by `area`; create or +1 dot via `free_carthian` (cap 5). Contacts → single merit `spheres[]`; push a new sphere + dot, with a `carthian_sphere` marker so the strip pops exactly that sphere and keeps `rating === spheres.length`. Already-held Contacts spheres are excluded from the dropdown.
- **Sphere is now a fixed-enum `<select>`** from `INFLUENCE_SPHERES`, validated server-side too (400 on free text / non-enum).
- **`_syncCarthianDetected` reworked into a shared re-derivation.** The #508 strip-and-push broke once augmented merits (no `granted_by`) existed; `deriveInfluenceActionMerits` re-derives Allies/Contacts from `currentChar.merits` and is shared with `detectMerits` so init and live can't diverge.
- **Clean strip is total** — a normalize pass after the strip gives accurate base ratings for the cap check; clear/retarget removes the dot, the pushed Contacts sphere, and the marker, restoring the pre-allocation doc.
- No new bonus-dot channel work — `free_carthian` was fully registered in #508. Only the additive `carthian_sphere` marker field is new.

### File List

- `server/schemas/character.schema.js` — `carthian_sphere` merit field
- `server/routes/characters.js` — server `INFLUENCE_SPHERES` const; enum validation; rewritten strip + Allies(area)/Contacts(spheres[]) match/augment/create in `PATCH /:id/carthian_pull`
- `public/js/tabs/downtime-form.js` — import `INFLUENCE_SPHERES`; `<select>` sphere control + `_carthianSphereOptions`; fixed bonus derivation (area/carthian_sphere); `deriveInfluenceActionMerits` helper + `detectMerits` refactor; `_syncCarthianDetected` re-derivation
- `public/js/dev-fixtures.js` — `carthian_pull` interceptor parity
- `server/tests/api-characters-carthian-pull.test.js` — rewritten, 15 tests
- `tests/issue-508-carthian-pull-allocation.spec.js` — mock + sphere tests updated to the new model
- `tests/issue-510-carthian-pull-sphere-enum.spec.js` — new, 3 Playwright tests

### Change Log

- 2026-06-01 — QA (Quinn): PASS. Verified the three scrutiny points — (1) detectMerits refactor is behaviour-preserving (expandedInfluence retained for retainers/mentors/staff; helper logic identical; 151 detection/merit-action tests green); (2) Contacts strip/restore leaves zero residue (added 2 round-trip tests: augment→retarget and augment→clear both restore base spheres/rating, no marker, no free_carthian); (3) server INFLUENCE_SPHERES set proven identical to client (16/16). All 9 ACs verified. 17 server + 8 Playwright re-run green. Two non-blocking low findings.
- 2026-06-01 — Implemented #510 (T1-T6). Sphere → fixed-enum `<select>`; match/augment the existing merit by qualifier (Allies `area`, Contacts `spheres[]` + `carthian_sphere` marker); clean strip; `_syncCarthianDetected` reworked into a shared re-derivation. 15 server + 8 Playwright; 151 + 16 regression green. Status → review.
- 2026-06-01 — Story created at ready-for-dev. Corrects feature.508's sphere handling: enum dropdown (not free text), match/augment the existing merit by sphere qualifier (Allies by `area`, Contacts by `spheres[]`), with a new `carthian_sphere` marker for clean Contacts strip and a rework of `_syncCarthianDetected` into a shared re-derivation. Allies/Contacts behaviour decided by PO (Contacts: already-held spheres excluded, choice A).

---

## QA Results (Quinn, claude-opus-4-8)

**Verdict: PASS** — all 9 ACs verified against the shipped diff, plus the three requested deep-dives.

### Scrutiny point 1 — detectMerits refactor (regression risk)
SAFE. The refactor only replaced the inline Allies/Contacts assignment with `deriveInfluenceActionMerits(merits)`. Verified:
- `expandedInfluence` is still built (`:300-311`) and still feeds retainers (`:330`), mentors (`:336`), staff (`:339`) — untouched.
- The helper's `expandedInfluence` walk + Allies filter + Contacts expansion are logically identical to the old inline code (directInfluenceNames, standing-grant skip, spheres-array expansion all match).
- The 151-test server run includes `detect-merits-retainer` and `build-merit-actions-contacts-retainers` — both green, confirming detection output is unchanged.
- Minor (non-blocking): `expandedInfluence` is now built twice per `detectMerits` (inline + inside the helper). Pure redundancy, no correctness impact.

### Scrutiny point 2 — Contacts strip/restore residue
SAFE. Added two adversarial round-trip tests (now in the suite):
- Contacts-augment (`Underworld`) → retarget to Herd → Contacts merit is exactly `['Legal','Street']`, rating 2, no `free_carthian`, no `carthian_sphere`; the single bonus is now on Herd.
- Allies-augment (`Police`, 3→4) → clear → Allies back to rating 3, no `free_carthian`.
The invariant `rating === spheres.length` holds across the cycle because the post-strip normalize re-syncs rating to the channel sum (which equals the restored `spheres.length` for well-formed Contacts data).

### Scrutiny point 3 — server INFLUENCE_SPHERES duplicate
MATCHES. Programmatic set comparison: both lists are 16 values, identical members (order differs but irrelevant for `.includes`). Low-risk **finding**: the server list is a hand-maintained duplicate (the server can't import the client ESM enum) — future edits to the sphere list must touch both. Documented in a code comment; acceptable.

### Acceptance criteria
- **AC#1/#2** (enum `<select>`, filtered): PASS — Playwright confirms a `<select>` (no text input) with enum options; Contacts excludes held spheres; Allies disables at-5 / over-slot spheres (`_carthianSphereOptions`).
- **AC#3/#4** (Allies create / augment by `area`, cap 5): PASS — server tests + the `area`-not-`spheres` assertion.
- **AC#5/#6** (Contacts push+marker / already-held excluded): PASS — server augment test sets `carthian_sphere`; Playwright confirms exclusion; server 400 on held.
- **AC#7** (Allies `area`, Contacts `spheres[]`): PASS.
- **AC#8** (clean retarget/clear): PASS — the two round-trip residue tests.
- **AC#9** (downstream recognition): PASS — the merit carries the canonical qualifier; `_syncCarthianDetected` re-derives the slot; influence calc reads `meritEffectiveRating`.

### Findings (non-blocking)
1. **[Low/maintenance]** `INFLUENCE_SPHERES` is duplicated server-side. Verified identical today; flag for a shared source if the list ever changes.
2. **[Low/perf]** `expandedInfluence` built twice per `detectMerits` call. Could pass it into the helper. No correctness impact.

### Test coverage
- `server/tests/api-characters-carthian-pull.test.js` — **17/17** (incl. 2 QA-added round-trip residue tests).
- `tests/issue-510-carthian-pull-sphere-enum.spec.js` (3) + `tests/issue-508-carthian-pull-allocation.spec.js` (5) — **8/8**.
