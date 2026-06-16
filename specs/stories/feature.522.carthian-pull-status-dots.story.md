---
issue: 522
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/522
branch: morningstar-issue-522-carthian-pull-status-dots
story: 522
builds_on: feature.508 (single-dot allocation), feature.510 (sphere enum + match/augment), #512 (write-failure robustness)
---

# Story 522: Carthian Pull — allocate dots equal to Carthian Status (not just one)

Status: review

## Story

As a Carthian player filling out my downtime,
I want to allocate a number of Carthian Pull bonus dots equal to my Carthian (Covenant) Status across Allies, Contacts, Haven, and Herd,
so that the merit matches the rules ("Each month, you can access a number of dots of the Allies, Contacts, Haven, and Herd Merits equal to your Carthian Status") instead of granting only one dot.

This generalises the existing **single-dot** Carthian Pull feature (#508/#510) to an **N-dot pool**, where N is the character's Carthian Movement covenant Status (0–5).

## Current behaviour (read carefully — this is what changes)

The current implementation is hard-wired to exactly **one** dot:

- **Form** (`public/js/tabs/downtime-form.js`): `renderCarthianPullSection` (~4442) renders a single target `<select>` (`dt-carthian_target`) and, for Allies/Contacts, a single sphere `<select>` (`dt-carthian_sphere`, options via `_carthianSphereOptions` ~4508). The current allocation is *derived from the character* — `_writeCarthianAllocation` (~4581) reads the two selects and PATCHes once; the section re-derives `curTarget`/`curSphere` from the single merit that carries `free_carthian > 0` (~4459).
- **Endpoint** (`server/routes/characters.js`): `PATCH /api/characters/:id/carthian_pull` (~520) accepts a single `{ target, sphere }`. It is **strip-then-apply, one bonus at a time**:
  - Strip: remove `granted_by:'Carthian Pull'` instances; clear `free_carthian` from any augmented merit; for an augmented Contacts, pop the single sphere recorded in the `carthian_sphere` marker (~546-563).
  - Apply: match the existing merit by qualifier (Allies → `area`, Contacts → `spheres[]`, Haven/Herd → single instance), increment `free_carthian` by 1 or create a `granted_by:'Carthian Pull'` bonus-only instance (~574-604).
  - Re-sync `rating = sum of channels` via `normalizeCharacterMerits` (~607-610).
  - Player-scoped ownership gate (`character_ids`, ~524-527), mirroring GET `/:id`.
- **Channel**: `free_carthian` is a registered bonus-dot channel (added in #508 — schema + `MERIT_CHANNELS`/`GRANTED_BY_CHANNEL` + `meritFreeSum`/`meritEffectiveRating`/`domMeritContribSingle`). It already sums to the merit's effective rating; values > 1 are mechanically supported.
- **Pool source**: the character's Carthian Status lives at `c.status.covenant['Carthian Movement']` (0–5), keyed by full covenant name (`public/js/editor/edit.js:492`, `identity.js:185`).

**What must be preserved:** the strip-then-apply zero-residue invariant (no compounding across saves), the cap on Allies (per-sphere ≤ 5) and Contacts (≤ 5 spheres, no duplicate sphere), the `rating = sum of channels` consistency, the player ownership gate, and the #512 robustness (a failed write surfaces a toast and does not leave a stale selection).

## Acceptance criteria

1. **Pool size = Carthian Status.** The Carthian Pull section shows an available pool equal to `c.status.covenant['Carthian Movement']` (call it N). The section is shown only when the character has the Carthian Pull merit AND N ≥ 1; N = 0 shows nothing to allocate (mirrors today's "merit absent → hidden").
2. **Allocate up to N dots.** The player can record up to N allocations, each targeting Allies, Contacts, Haven, or Herd (with a valid `INFLUENCE_SPHERES` sphere for Allies/Contacts). The UI shows progress ("X of N dots allocated") and prevents exceeding N.
3. **Each dot writes a `free_carthian` bonus.** The total `free_carthian` across the character equals the number of dots allocated, never exceeding N. Allocations surface on the sheet through the existing bonus-dot model.
4. **Server enforces the pool.** `PATCH /api/characters/:id/carthian_pull` accepts the full allocation set, rejects (400) an allocation count greater than the character's Carthian Status, and validates each entry (valid target; valid sphere for Allies/Contacts). The server reads Carthian Status from the character; it does not trust a client-supplied N.
5. **Strip-then-apply, generalised, zero residue.** Saving replaces the entire prior Carthian-Pull allocation (all `granted_by:'Carthian Pull'` instances and all `free_carthian` increments this merit produced) and reapplies from the submitted set. Saving twice with the same input is idempotent; clearing all allocations returns the character to its base merits exactly.
6. **Caps still hold.** Allies stays ≤ 5 effective per sphere; Contacts stays ≤ 5 spheres with no duplicate sphere. An allocation that would breach a cap is rejected with a clear message (see Open Questions for the over-cap policy).
7. **Reallocatable each cycle, robust on failure.** The player can change the allocation at any time; a failed write surfaces the toast and leaves the section reflecting the character's actual saved state, never a stale pending choice (preserves #512 behaviour).
8. **No regression to single-dot data.** A character previously allocated one dot (pre-#522 shape) loads and re-saves correctly.
9. **Tests** (against `tm_suite_test`): endpoint accepts a multi-dot set and writes the right `free_carthian` totals; rejects over-pool (count > status) and over-cap; strip-then-apply is idempotent and fully reversible; the dev-fixtures interceptor mirrors the new shape so the local DT form works under the dev token. Run only the touched spec files.

## Tasks / Subtasks

- [x] **Open questions resolved** (PO, 2026-06-01): stacking ALLOWED (sum free_carthian on one instance, up to effective cap); over-cap REJECTED with a clear message; cadence PER-CYCLE. See Dev Notes → Open Questions.
- [x] **Server: generalise the endpoint to a set** (AC 4, 5, 6)
  - [x] `PATCH /api/characters/:id/carthian_pull` now accepts `{ allocations: [{ target, sphere }, ...] }`; legacy single `{ target, sphere }` is normalised to a one-element set (and `target:''` → empty set) for back-compat.
  - [x] Reads N from `char.status.covenant['Carthian Movement']`; rejects `allocations.length > N` (400). N read from the doc, never the client.
  - [x] Strip generalised: removes all `granted_by:'Carthian Pull'`, clears all `free_carthian`, pops `carthian_spheres[]` (plural) + legacy `carthian_sphere`.
  - [x] New `carthian_spheres` array marker added to `character.schema.js` (legacy `carthian_sphere` retained for strip back-compat).
  - [x] Caps validated against the stripped base over the full set: Allies base(area)+count ≤ 5; Contacts distinct + not-held + ≤ 5 spheres. Herd/Haven uncapped (PO decision). Stacking sums `free_carthian`.
- [x] **Client: multi-row allocation UI** (AC 1, 2, 3, 7)
  - [x] `renderCarthianPullSection` reworked: pool counter ("X of N"), applied-dot chips (each removable), and one editable "new dot" row (target + sphere). Reuses `_carthianSphereOptions`.
  - [x] New `_applyCarthianSet` PATCHes the full set; `_onCarthianNewRowChange` / `_onCarthianRemove` build the set; #512 failure toast + "reflect saved state" preserved (pending markers cleared after each attempt).
  - [x] `_carthianCurrentAllocations` derives the applied set from the character's `free_carthian`-bearing merits (Allies stacks; Contacts via `carthian_spheres[]`/legacy/bonus-only spheres).
- [x] **Dev-fixtures parity** (AC 9)
  - [x] `public/js/dev-fixtures.js` `carthian_pull` handler rewritten to mirror the array shape + multi-dot strip/apply, so the DT form works under the local dev token.
- [x] **Tests** (AC 9)
  - [x] Server tests in `server/tests/api-characters-carthian-pull.test.js`: multi-dot apply, over-pool reject (400), stacking +2, over-cap reject, multiple Contacts spheres + full-clear strip, duplicate-Contacts reject, idempotent re-save. Existing single-dot tests updated (seeds get Carthian Status; one assertion moved to the plural `carthian_spheres` marker). 24 carthian tests + 89 across the character suites all green.
  - [x] Playwright/UI spec — DONE in QA. QA caught a regression: the #522 pool-gate (section renders only when Carthian Status ≥ 1) broke the existing `issue-508`/`issue-510` specs, whose mock chars used a non-canonical status shape (`covenant.Carthian`) instead of the real `covenant['Carthian Movement']`, and whose mocks/assertions used the single `{target,sphere}` shape. Fixed both specs (canonical status key, set-based `applyCarthian` mock + assertions, AC#8 reworked to chip-remove) and added `tests/issue-522-carthian-pull-multi-dot.spec.js` (pool counter "X of N" + two-dot accumulation). All 10 Playwright tests pass.
  - [x] Ran only the touched spec files; `tm_suite_test` isolation via setupFile.

## Dev Notes

### Key files
- `public/js/tabs/downtime-form.js` — `renderCarthianPullSection` (~4442), `_carthianSphereOptions` (~4508), `_writeCarthianAllocation` (~4581), change handler (~2650), current-allocation derivation (~4459)
- `server/routes/characters.js` — `PATCH /:id/carthian_pull` (~520-619)
- `server/schemas/character.schema.js` — merit shape; `carthian_sphere` marker → needs a plural form for multi-dot Contacts
- `public/js/dev-fixtures.js` — the `carthian_pull` mock handler (mirror the new shape)
- `public/js/editor/edit.js:492`, `identity.js:185` — `c.status.covenant['Carthian Movement']` (pool source)
- Channel infra (DO NOT re-add — already present from #508): `free_carthian` in schema + `MERIT_CHANNELS`/`GRANTED_BY_CHANNEL`, `meritFreeSum`, `meritEffectiveRating`, `domMeritContribSingle`

### Open Questions — RESOLVED (PO, 2026-06-01)
1. **Stacking on the same merit/sphere? → ALLOWED.** Multiple dots may pile onto the same merit + sphere (e.g. 2 dots into Allies (Police) = +2), up to that merit's effective cap. The UI permits duplicate target+sphere rows; the endpoint sums `free_carthian` past 1 on one instance. (Matches the rules wording "a number of dots of the ... Merits".)
2. **Over-cap policy → REJECT.** An allocation that would push Allies (per sphere) or Contacts (spheres) past 5 effective is rejected with a clear message. Herd/Haven have no hard cap here.
3. **Cadence → PER-CYCLE.** Reallocatable each downtime cycle, matching the current feature (the rules' "each month" maps to the app's cycle).

### Calibration and safety (per project memory)
- Hobby-project scale: this is the natural extension of an existing, working feature — reuse the #508/#510 strip-then-apply and channel infra; do not invent new bonus channels.
- The `carthian_pull` endpoint is a **server** change, so it is not exercisable on the dev site (which proxies `/api/*` to the prod API) until it reaches `main`. Verify locally under the dev token (dev-fixtures) and via `tm_suite_test`.
- Effective rating includes bonus dots (per memory: bonus dots are real dots) — caps and pool maths must read effective ratings.
- Targeted tests only; never the full suite. `tm_suite_test` isolation for DB tests.
- Player-scoped endpoint must keep the `character_ids` ownership gate.

### Why this is more than a number bump
The single-dot design encodes "one bonus" in several places: the form has exactly one target/sphere pair; the derivation finds the single `free_carthian` merit; and the Contacts `carthian_sphere` marker is singular. N dots means a set-shaped request, a multi-row UI, multi-increment `free_carthian`, and a plural Contacts-sphere marker for clean stripping. The channel/normalisation layer already supports values > 1, so the rating maths is free — the work is the request shape, the UI, and the strip/apply over a set.

### References
- Issue #522 (this story); builds on #508, #510; preserves #512 robustness
- Rules: "Each month, you can access a number of dots of the Allies, Contacts, Haven, and Herd Merits equal to your Carthian Status."

## Dev Agent Record

### Agent Model Used

claude-opus-4-8

### Debug Log References

- One pre-existing single-dot test asserted the singular `carthian_sphere` marker on an augmented Contacts. #522 intentionally supersedes it with the plural `carthian_spheres[]` (strip still reads the legacy singular for old data, so back-compat holds). Updated that one assertion to the plural marker; behaviour (augment + clean strip) unchanged.
- The existing single-dot tests seeded characters with no `status.covenant`, so the new pool gate (count ≤ Carthian Status) would have failed them at N=0. Fixed by giving `seedChar` a default Carthian Status of 5; the pool gate itself is tested with explicit low-status seeds.

### Completion Notes List

**What changed**
1. `server/routes/characters.js` — `PATCH /:id/carthian_pull` rewritten from single `{target,sphere}` to a SET `{allocations:[...]}` (legacy single shape still accepted). Reads pool N = `char.status.covenant['Carthian Movement']`, rejects count > N. Strip generalised (plural `carthian_spheres`). Tally → validate caps over the full set (Allies base+count ≤ 5; Contacts distinct/not-held/≤5; Herd/Haven uncapped per PO) → apply (stacking sums `free_carthian`) → normalise.
2. `server/schemas/character.schema.js` — added `carthian_spheres: array` (legacy `carthian_sphere` retained for strip back-compat).
3. `public/js/tabs/downtime-form.js` — multi-row UI: `renderCarthianPullSection` (pool counter + applied chips + one new-dot row), new `_carthianCurrentAllocations` / `_carthianLabel` / `_applyCarthianSet` / `_onCarthianNewRowChange` / `_onCarthianRemove`; replaced `_writeCarthianAllocation`. Change handler routes new-row selects; click handler routes the remove ✕ (both inside the `_dtWired`-once block, event-delegated).
4. `public/js/dev-fixtures.js` — `carthian_pull` mock mirrors the new array shape + multi-dot strip/apply.
5. `public/css/suite.css` — `.qf-carthian-pool` / `.qf-carthian-applied` / `.qf-carthian-chip` / `.qf-carthian-remove` under `#t-downtime`, theme tokens.

**Decisions honoured** (PO 2026-06-01): stacking allowed (sum `free_carthian`, cap 5 for Allies); over-cap rejected for Allies/Contacts; Herd/Haven uncapped in this endpoint; per-cycle, reallocatable.

**Tests** — `api-characters-carthian-pull.test.js`: 24 (existing single-dot updated + 7 new multi-dot). Full character-suite regression: 89 across 5 files, all green. JS module-syntax + CSS brace checks pass.

**Deferred** — a Playwright UI spec (`tests/issue-522-*`) for the multi-row section: the server contract + dev-fixtures parity are tested; the UI renders that contract. Left for QA to add against a running app if wanted.

**Not testable on dev** — this touches the server endpoint + schema; the dev site proxies `/api/*` to the prod API, so it only works end-to-end once on `main`. Verify locally under the dev token (dev-fixtures) / via `tm_suite_test`.

### File List

**New:**
- `tests/issue-522-carthian-pull-multi-dot.spec.js` (added in QA)

**Modified:**
- `server/routes/characters.js`
- `server/schemas/character.schema.js`
- `server/tests/api-characters-carthian-pull.test.js`
- `public/js/tabs/downtime-form.js`
- `public/js/dev-fixtures.js`
- `public/css/suite.css`
- `tests/issue-508-carthian-pull-allocation.spec.js` (QA: canonical status, set-based mock/assertions, AC#8 → chip-remove)
- `tests/issue-510-carthian-pull-sphere-enum.spec.js` (QA: same fixes)
- `specs/stories/feature.522.carthian-pull-status-dots.story.md` (this file)
- `specs/stories/sprint-status.yaml`

### QA (Quinn) — verdict PASS, 2026-06-01
- Server: added two boundary tests (Carthian Status 0 rejects any allocation; empty set always allowed). 26 carthian tests + 89 across the character suites green.
- UI: caught + fixed the `issue-508`/`issue-510` regression (status-shape + request-shape) and added `issue-522`. **10 Playwright tests pass.** The multi-row UI is now covered end-to-end.

### Change Log

- 2026-06-01: Implemented #522 — Carthian Pull generalised from 1 dot to N = Carthian Status. Set-based endpoint (pool-gated, stacking, plural Contacts strip) + schema marker, multi-row DT form UI, dev-fixtures parity, server tests. Status → review.
