---
issue: 508
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/508
branch: morningstar-issue-508-carthian-pull-allocation
---

# Story feature.508: Carthian Pull dot-allocation — sheet bonus dot + downtime form section

**Story ID:** feature.508
**Epic:** Player downtime form polish (standalone GitHub issue; follows feature.504/506)
**Status:** review
**Date:** 2026-06-01
**Issue:** [#508](https://github.com/angelusvmorningstar/TerraMortis/issues/508)
**Branch:** morningstar-issue-508-carthian-pull-allocation

---

## User Story

As a player with Carthian Pull filing a downtime, I want to allocate its single dot to my Allies, Contacts, Haven, or Herd and have that show up as a **bonus dot on my character sheet** (tracked the same way as every other bonus dot), so that the allocation is a real, visible part of my character for the cycle and moves whenever I change my mind.

---

## Scope change from the first draft (read this)

The original story kept the allocation **per-cycle only** (in `submission.responses`, never touching the character). The product owner has since asked that the allocated dot **also appear as a bonus dot on the character sheet**, tracked via the existing bonus-dot model, and **kept in sync live** — moving to the new merit each time the allocation changes.

This makes the feature **cross-cutting**: it now adds a new `free_carthian` bonus-dot channel across the schema, the client accessors, the server normalizer, and the sheet, plus a **player-scoped write endpoint** (the player cannot use the ST-only `PUT /:id`). The DT-form action-slot and Herd-feeding behaviours then fall out of the existing systems reading that channel, rather than from a separate per-cycle mechanism.

> **Product-owner decisions (do not re-ask):**
> - Carthian Pull is a **single dot** (rules-reference `[1,1]` is correct — no errata).
> - For Allies/Contacts (which need a sphere) and any target the character does not already hold, **create a bonus-only merit instance** to carry the dot.
> - **Sync live** — write the character the moment the allocation changes.
> - Keep **both** the sheet bonus dot **and** the in-form extra Allies/Contacts action slot — **but do not double up**: because the bonus dot is a real merit on the character, the existing detection produces the action slot, so no separate synthetic slot is injected.

---

## The unified model (this is the whole design)

One fact drives everything: **the allocation is stored as a real bonus dot on a character merit, in the `free_carthian` channel.** Every downstream behaviour then reads it through machinery that already exists:

| Behaviour | How it happens (no bespoke logic) |
|---|---|
| Sheet shows a bonus (hollow) dot | `meritFreeSum` includes `free_carthian` → sheet's `iBon` at `sheet.js:912` reflects it |
| Effective rating rises | `meritEffectiveRating` inline sum includes `free_carthian` (`domain.js:260-263`) |
| Herd raises feeding/vitae | `effectiveDomainDots(c,'Herd')` (`downtime-form.js:6653`) already sums via `meritEffectiveRating` → **+1 automatic**; the first draft's special-case `+1` is removed |
| Allies/Contacts gets an extra action slot | the bonus-only Allies/Contacts merit is a real merit → the existing `detectedMerits.spheres`/`.contacts` derivation produces one slot |
| Rating stays consistent on save | server `normalizeMerit` counts `free_carthian` in `MERIT_CHANNELS`; `granted_by:'Carthian Pull'` maps to it |

**"Carthian Pull is one dot" simplifies the write hugely:** at most ONE `free_carthian` bonus exists on the character at any time, tagged `granted_by: 'Carthian Pull'`. So the live write is always: *remove the existing Carthian-Pull bonus, then apply the new one.*

### Where the bonus dot lands per target

- **Allies / Contacts** (always sphere-bearing): create a **bonus-only instance** —
  `{ category:'influence', name:'Allies'|'Contacts', spheres:[sphere], granted_by:'Carthian Pull', free_carthian:1, rating:1 }`.
  (Allies/Contacts are naturally multi-instance, so a separate instance is clean and trivially removable.)
- **Herd / Haven**: if the character already has that merit, add `free_carthian:1` (and `granted_by` marker handling) to the **existing** instance; otherwise create a bonus-only instance
  `{ category:'domain', name:'Herd'|'Haven', granted_by:'Carthian Pull', free_carthian:1, rating:1 }`.
  (Herd/Haven are single-instance domain merits — do not create a second one alongside an existing one, or `effectiveDomainDots` semantics get muddy. Haven is cap-bound by its Safe Place; note the edge in the section copy.)

### Retarget / clear (the "moves each time" requirement)

On every allocation change: strip the prior Carthian-Pull bonus first —
- delete any merit with `granted_by:'Carthian Pull'` that is **bonus-only** (created by this feature: `free_carthian` is its only dot source);
- for an existing Herd/Haven that we augmented, subtract the `free_carthian` and clear the marker.
Then apply the new allocation. Net effect: exactly one bonus dot, on exactly the current target.

### Avoiding the double-up (PO decision #4)

The bonus-only Allies/Contacts instance is a **real merit**. On the next form open, `detectMerits()` (`downtime-form.js:285`, init-only) picks it up and renders its action slot. For **live** changes within a session (detectMerits does not re-run), re-derive *only* the Allies/Contacts arrays from `currentChar.merits` at the top of `renderForm` (the same side-effect-free filters as `:313` and `:327-350`) so the slot appears/moves immediately. **Do not also inject a synthetic `_carthian` detectedMerits entry** — that was the first draft's approach and would now produce a second slot. One merit → one slot.

---

## Acceptance Criteria

1. A character **without** Carthian Pull sees no Carthian Pull section and gets no `free_carthian` bonus.
2. A character **with** Carthian Pull sees a single allocation choice (Allies/Contacts/Haven/Herd) in an ungated `carthian_pull` section rendered immediately before Feeding.
3. Allocating the dot writes a `free_carthian:1` bonus to the chosen merit on the character (creating a bonus-only instance for Allies/Contacts or any absent target), and the **character sheet shows it as a bonus (hollow) dot** on that merit, tracked like every other `free_*` channel.
4. Changing the allocation **moves** the bonus dot: the previous target loses it (bonus-only instances are removed) and the new target gains it, with at most one `free_carthian` bonus on the character at any time. This happens **live**, the moment the allocation changes.
5. Allocating to Allies/Contacts with a sphere yields exactly **one** extra Allies/Contacts action slot for that sphere (no double-up), subject to the 5-action cap; at 5, the choice is disabled.
6. Allocating to Herd raises this cycle's feeding/vitae projection by +1 (via the existing `effectiveDomainDots` path — no special-case code).
7. Allocating to Haven shows the bonus dot on the Haven merit (record/visual) with no other in-form mechanical effect.
8. Clearing the allocation removes the `free_carthian` bonus entirely; the sheet returns to its prior state.
9. `free_carthian` is registered everywhere a `free_*` channel must be (schema, `meritFreeSum`, `meritEffectiveRating`, `domMeritContribSingle`, server `MERIT_CHANNELS` + `GRANTED_BY_CHANNEL`) so saving the character never mis-syncs `rating`.

---

## Tasks / Subtasks

### Phase A — `free_carthian` bonus-dot channel (infrastructure)

- [x] **A1 — Schema** (AC: #9): added `free_carthian: { type:'integer', minimum:0 }` to the merit definition in `server/schemas/character.schema.js` (after `free_retainer`).
- [x] **A2 — Server normalizer** (AC: #9): added `'free_carthian'` to `MERIT_CHANNELS` and `'Carthian Pull': 'free_carthian'` to `GRANTED_BY_CHANNEL` (`server/lib/normalize-character.js`).
- [x] **A3 — Client accessors** (AC: #3, #6, #9): added `free_carthian` to `meritFreeSum`, the `meritEffectiveRating` inline sum, and `domMeritContribSingle` (`public/js/editor/domain.js`). Grep of `free_attache` confirmed the remaining sites; the sheet domain path (A4) also needed it.
- [x] **A4 — Sheet** (AC: #3, #7): the influence/general bonus dot is automatic via `meritFreeSum` (`sheet.js:912`). The **domain** render (`sheet.js:1048-1056`, Herd/Haven) only split hollow dots when a known bonus channel was present, so wired `carthB = m.free_carthian` into the `_dRaw`/condition so a Carthian-only dot renders hollow.

### Phase B — Player-scoped write endpoint (live sync)

- [x] **B1 — Endpoint** (AC: #3, #4, #8): added `PATCH /api/characters/:id/carthian_pull` to `server/routes/characters.js`. Authenticated + ownership gate (ST bypass via `isStRole`). Body `{ target, sphere? }`; strip-then-apply (delete `granted_by:'Carthian Pull'` instances, clear `free_carthian` from augmented merits), then create a bonus-only instance for Allies/Contacts/absent targets or augment an existing Herd/Haven; re-sync via `normalizeCharacterMerits`. Validates target enum + non-blank sphere for allies/contacts.
- [x] **B2 — dev-fixtures** (local dev): added a `carthian_pull` interceptor handler mirroring the strip-then-apply; seeded a `Carthian Pull` merit onto a dev character (Yusuf, who already has Allies + Safe Place/Haven) via a guarded Node replace with CHARS re-parse validation.

### Phase C — Downtime-form section + wiring

- [x] **C1 — Section metadata** (AC: #2): added a `carthian_pull` section to `DOWNTIME_SECTIONS` (`downtime-data.js`, `gate:null`, before `feeding`) and to the generic-loop skip list.
- [x] **C2 — Renderer `renderCarthianPullSection(saved)`** (AC: #1,#2,#5): `''` when no Carthian Pull merit; a target `<select>` + sphere input (shown for Allies/Contacts); disables Allies/Contacts at base count >= 5; derives the current allocation from the live `granted_by:'Carthian Pull'` bonus merit (falls back to `saved`). Called before the `['territory','feeding']` loop. British English; `esc()`.
- [x] **C3 — Live write on change** (AC: #3,#4,#8): `_writeCarthianAllocation` `apiPatch`es the endpoint on change (Allies/Contacts defer the write until a sphere is entered — the pending target is persisted into the submission so the re-render keeps the selection), refreshes `currentChar.merits`, then `renderForm`. Soft-fail. Wired into the delegated `change` listener (`:2660`).
- [x] **C4 — Keep `detectedMerits` in sync, no double-up** (AC: #5): `detectMerits()` is init-only and already picks up a persisted bonus. For in-session retargeting, `_syncCarthianDetected()` strips the prior Carthian entry from `detectedMerits.spheres`/`.contacts` and re-adds the current bonus (Allies/Contacts, under the 5-cap). One merit → one slot; no synthetic duplicate. (Chosen over re-running/refactoring `detectMerits` — lower risk, same result.)
- [x] **C5 — No Herd special-case**: Herd's +1 falls out of `effectiveDomainDots` reading `free_carthian` (Phase A3) — no `+1` literal anywhere. The collector also records `carthian_pull_target`/`_sphere` in the submission (per-cycle audit copy).

### Phase D — Tests

- [x] **D1 — Server** `server/tests/api-characters-carthian-pull.test.js` (11): allocate→bonus on right merit; retarget moves it (only one bonus); clear removes + restores rating; bonus-only instance for absent target; existing Herd augmented not duplicated; rating re-synced; 403 non-owner; 400 bad target / missing sphere; 404; 401. All pass.
- [x] **D2 — Accessor coverage**: `free_carthian` summation is exercised through the server normalize path (rating re-sync assertions in D1) and the merit-logic suite (87 tests green). The sheet hollow-dot split is covered by the A4 code change + parse-check.
- [x] **D3 — Playwright** `tests/issue-508-carthian-pull-allocation.spec.js` (6): section absent without the merit / present before Feeding with all four targets; Herd selection PATCHes `target:'herd'`; Allies reveals the sphere input then PATCHes `{allies, sphere}`; 5-cap disables Allies; None clears (`target:''`). All pass.
- [x] **D4 — Regression**: server `api-characters-crud` + `api-characters` + `api-characters-safe-place-locations` + `api-characters-carthian-pull` (71); merit-logic suite — apply-derived-merits, detect-merits-retainer, build-merit-actions, fix.400, public-fields (87); Playwright `issue-504` + `issue-506` + DT player smoke (26). All green.

---

## Dev Notes

- **The bonus-dot model is `free_*` channels** summed by `meritFreeSum` (`domain.js:187`, the single source of truth the sheet uses) — but **two consumers hand-roll the list** (`meritEffectiveRating:260-263`, `domMeritContribSingle:39-43`) and must be updated too. Grep `free_attache` to find every list before you finish (the comment at `domain.js:178-186` documents the gotcha that dropped `free_pt`/`free_sw`/etc. historically).
- **Server normalize is mandatory** — if `free_carthian` is not in `MERIT_CHANNELS`, a merit carrying only `free_carthian:1` sums to 0 and `normalizeMerit` backfills `rating` into `free`, corrupting the dot source. `GRANTED_BY_CHANNEL['Carthian Pull']='free_carthian'` makes the backfill land in the right channel.
- **At most one Carthian-Pull bonus** (single-dot merit), tagged `granted_by:'Carthian Pull'`. The write is always strip-then-apply — this is what makes "moves each time" trivial and idempotent.
- **No double-up** (PO decision): the bonus instance is a real merit, so detection yields the slot. Re-derive Allies/Contacts arrays from `currentChar.merits` each render for live updates; never also inject a synthetic entry.
- **Herd/Haven are single-instance domain merits** — augment the existing instance, do not add a second; Allies/Contacts are multi-instance — a separate bonus-only instance is correct and removable.
- **Live write** mirrors feature.506's player-scoped endpoint + ownership gate (`characters.js:331-333`), but unlike 506 it fires on change (not submit) per the PO decision; keep it soft-fail.
- **British English**, `esc()` everywhere, reuse `qf-*` classes, follow `renderSafePlaceLocationsSection` (`:4434`).
- **Scope honesty:** this is a multi-file, ~day-plus story (schema + normalize + accessors + sheet + endpoint + DT form). Phases A–B are reusable bonus-dot infrastructure; if needed it can be split into a 508a (channel + endpoint + sheet) and 508b (DT-form section) — flagged for the owner.

### Out of scope

- Permanent persistence beyond the live allocation (it lives on the character but is cleared/retargeted by the same control; there is no separate cycle-archival of it here).
- ST/admin display of the allocation beyond it being a normal bonus dot on the sheet.
- Any rules-reference change (`[1,1]` is correct).

### References

- Carthian Pull merit: `public/data/merits_db.json:99-103` (single dot)
- Bonus-dot sum (canonical): `public/js/editor/domain.js:187-192` (`meritFreeSum`); hand-rolled lists `:39-43`, `:260-263`
- Sheet bonus-dot render: `public/js/editor/sheet.js:912` (`iBon = meritFreeSum(m) + …`)
- Server normalize channels: `server/lib/normalize-character.js:25-29` (`MERIT_CHANNELS`), `:43-54` (`GRANTED_BY_CHANNEL`)
- Merit schema `free_*`: `server/schemas/character.schema.js:419-431`
- Player-scoped write precedent: `server/routes/characters.js` feature.506 `safe_place_locations` endpoint; ownership gate `:331-333`
- `detectMerits` (init-only) + Allies/Contacts derivation: `downtime-form.js:285`, `:313`, `:327-350`; called `:1552`
- Action-slot render/collect + 5-cap: `downtime-form.js:826-915`, `:827`, `:904`
- Herd → vitae projection: `downtime-form.js:6653`; projection block `:6624-6761`
- `meritEffectiveRating` / `effectiveDomainDots`: `domain.js:245-268`; `downtime-form.js:379-387`
- Territory→Feeding render block (insert section before): `downtime-form.js:2133-2148`
- Custom-section exemplar: `renderSafePlaceLocationsSection` `:4434`; collector `:563-572`
- Issue: [#508](https://github.com/angelusvmorningstar/TerraMortis/issues/508)

---

## Open Questions (non-blocking — defaults chosen)

- **Existing-merit sphere duplication:** allocating Allies/Contacts to a sphere the character already holds — allowed (a distinct bonus-only instance). Flag to ST if a distinct-sphere rule is wanted.
- **Haven cap:** a `free_carthian` dot on Haven can exceed the Safe-Place cap. Default: show the bonus dot as-is (the cap is a render/derived concern handled by `CAP_DOMAIN` logic). Confirm if the dot should be suppressed when over cap.

---

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia, dev-story)

### Debug Log References

- Parse-check clean: `character.schema.js`, `normalize-character.js`, `characters.js`; `domain.js`, `sheet.js`, `downtime-form.js`, `downtime-data.js`, `dev-fixtures.js` (module input-type).
- `server/tests/api-characters-carthian-pull.test.js` — 11/11.
- `tests/issue-508-carthian-pull-allocation.spec.js` — 6/6 (after fixing two test/impl issues: capped fixture needed distinct `area` per Allies so `meritKey` doesn't dedupe them; the Allies sphere-reveal needed the pending target persisted into the submission before the re-render).
- Regression: 71 character server tests + 87 merit-logic tests + 26 DT Playwright — all green.

### Completion Notes List

- **Unified bonus-dot model:** the allocation is a real `free_carthian` dot written live to a character merit. Every downstream behaviour reads it through existing machinery — no bespoke per-behaviour code: sheet hollow dot (`meritFreeSum`), effective rating (`meritEffectiveRating` inline sum), Herd feeding (`effectiveDomainDots` → no special-case `+1`), Allies/Contacts action slot (the bonus merit is detected).
- **Channel registered in 6 places** (one more than the story predicted): schema, normalize `MERIT_CHANNELS` + `GRANTED_BY_CHANNEL`, `meritFreeSum`, `meritEffectiveRating` inline, `domMeritContribSingle`, **and** the sheet's domain-merit dot-split branch (`sheet.js:1048-1056`) which the influence-path `meritFreeSum` didn't cover for Herd/Haven.
- **Strip-then-apply** keeps exactly one Carthian-Pull bonus (single dot): delete `granted_by:'Carthian Pull'` instances + clear `free_carthian` from augmented merits, then apply. `normalizeCharacterMerits` re-syncs `rating` after every write.
- **No double-up:** `detectMerits` (init-only) picks up a persisted bonus; `_syncCarthianDetected` handles in-session retargeting. One merit → one slot, never a synthetic duplicate. Chose this over refactoring the side-effectful init path.
- **Live write** mirrors feature.506's player-scoped endpoint + ownership gate, but fires on change (not submit) per the PO decision; soft-fail so a write error never breaks the form.
- Per-cycle audit copy of the choice still lands in `responses.carthian_pull_target/_sphere`; the canonical state is the character merit.

### File List

- `server/schemas/character.schema.js` — `free_carthian` merit field
- `server/lib/normalize-character.js` — `free_carthian` in `MERIT_CHANNELS`; `Carthian Pull`→`free_carthian` in `GRANTED_BY_CHANNEL`
- `server/routes/characters.js` — new `PATCH /:id/carthian_pull` endpoint; import `normalizeCharacterMerits`
- `public/js/editor/domain.js` — `free_carthian` in `meritFreeSum`, `meritEffectiveRating`, `domMeritContribSingle`
- `public/js/editor/sheet.js` — `free_carthian` in the domain-merit hollow-dot split (`carthB`)
- `public/js/tabs/downtime-data.js` — `carthian_pull` section (before Feeding)
- `public/js/tabs/downtime-form.js` — section renderer + `_syncCarthianDetected` + `_writeCarthianAllocation`; generic-loop skip; explicit render call; delegated change handler; `collectResponses` audit copy
- `public/js/dev-fixtures.js` — `carthian_pull` interceptor handler; Carthian Pull merit seeded on Yusuf
- `server/tests/api-characters-carthian-pull.test.js` — new, 11 vitest tests
- `tests/issue-508-carthian-pull-allocation.spec.js` — new, 6 Playwright tests

### Change Log

- 2026-06-01 — QA (Quinn): PASS. Exhaustive `free_*` sum-site audit (the headline risk) — `free_carthian` present in all 4 read helpers + 2 server gates, correctly absent from non-shareable/non-target sites. All 8 ACs verified against shipped code. 11 server + 6 Playwright re-run independently green. Two non-blocking low findings.
- 2026-06-01 — Implemented #508 (Phases A-D). `free_carthian` bonus-dot channel across schema/normalize/accessors/sheet; player-scoped live write endpoint (strip-then-apply); DT-form section before Feeding with live write + cap-aware disable + no-double-up slot sync; Herd/Haven/Allies/Contacts all flow through existing systems. 11 server + 6 Playwright tests; 71 + 87 + 26 regression green. Status → review.
- 2026-06-01 — Story rewritten after PO expansion: the allocated Carthian Pull dot now also appears as a **bonus dot on the character sheet** via a new `free_carthian` channel, written **live** to the character (player-scoped endpoint) and moved on each allocation change. Unified model: write the dot once, let existing systems (sheet `meritFreeSum`, `meritEffectiveRating`, Herd `effectiveDomainDots`, Allies/Contacts detection) read it — no synthetic slot, no special-case Herd +1 (the first draft's per-cycle-only approach is replaced). Four phases (channel infra, write endpoint, DT-form section, tests). Single-dot scope confirmed; `[1,1]` reference correct.
- 2026-06-01 — Story file created at ready-for-dev (first draft: per-cycle-only synthetic injection; superseded above).

---

## QA Results (Quinn, claude-opus-4-8)

**Verdict: PASS** — all eight ACs verified against the shipped diff (not just dev tests), with the requested exhaustive `free_*` registration audit.

### The `free_*` sum-site audit (headline risk)
Goal: a missed sum list = saving a character silently mis-syncs `rating` and the bonus dot vanishes/corrupts. I enumerated **every** `free_*` sum site (client + server) and classified each:

**Rating-sync gates (corruption risk) — both include `free_carthian`:**
- Client `syncMeritRating` → `meritFreeSum` (`domain.js:188`), used by the editor on every merit edit (`edit.js:1028`). ✓
- Server `normalizeMerit` → `MERIT_CHANNELS` (`normalize-character.js:25`), used on every POST/PUT and by the new endpoint. ✓ `GRANTED_BY_CHANNEL['Carthian Pull']='free_carthian'` ensures backfill lands in the right channel.

**Effective-rating reads (display/pool correctness) — covered:**
- `meritEffectiveRating` inline sum ✓ → drives Herd feeding (`effectiveDomainDots`, no special-case `+1`) and **influence totals** (`calcMeritInfluence`/`calcContactsInfluence` route through it, so an Allies/Contacts Carthian dot correctly counts toward influence).
- `domMeritContribSingle` ✓ → `domMeritTotalSingle` → Haven/domain totals.
- Sheet display: `sheet.js:912` (influence: Allies/Contacts) via `meritFreeSum` ✓; `sheet.js:1048-1056` (domain: Haven/Herd) — dev added `carthB` so a Carthian-only dot renders hollow. ✓

**Correctly EXCLUDED (not bugs):**
- `domMeritShareableSingle` (partner-shareable dots) and `characters.js:183` (partner projection) — Carthian bonus is personal/non-shareable, like `free_pt`/`free_sw` which are also excluded.
- `sheet.js:1091` (standing merits), `:1277` (Mentor/MDB), `:1327/1485/1573/1692` and `export-character.js:281` (fighting styles) — merit types Carthian Pull can never target.
- `wizard.js:698` (new-char init) — absent `free_carthian` = 0; correct.

**Conclusion:** no corruption risk, no display gap. The channel is registered everywhere it's needed and nowhere it shouldn't be.

### Acceptance criteria
- **AC#1/#2/#3** (gating, placement, options): PASS — `renderCarthianPullSection` returns `''` without the merit; rendered before the territory/feeding loop; select offers all four targets. Playwright confirms absence/presence/order.
- **AC#3 (sheet bonus dot):** PASS — written as `free_carthian` and rendered via the audited display paths.
- **AC#4 (moves live, one bonus max):** PASS — endpoint strip-then-apply (delete `granted_by:'Carthian Pull'` instances + clear `free_carthian` from augmented merits, then apply); `normalizeCharacterMerits` re-syncs. Server tests confirm retarget leaves exactly one bonus.
- **AC#5 (extra slot, cap-disable, no double-up):** PASS — bonus Allies/Contacts merit drives the slot via detection; `_syncCarthianDetected` keeps one entry; section disables the choice at base count ≥ 5. Playwright confirms the disable.
- **AC#6 (Herd +1 feeding):** PASS — pure `effectiveDomainDots` reading `free_carthian`; no special-case code.
- **AC#7 (Haven dot, no extra effect):** PASS — augments/creates a Haven merit; no action slot.
- **AC#8 (clear removes, restores rating):** PASS — server test asserts `free_carthian` gone and the augmented Herd's rating back to its original.

### Code quality
- Auth boundary correct (ownership gate + ST bypass; ST-only `PUT` not widened). Validation: target enum + non-blank sphere; 400/403/404/401 all covered.
- Live write is soft-fail (never breaks the form). Bonus-only instances are schema-valid (`free_carthian` + `granted_by` + `spheres`).
- No regressions: 71 character server + 87 merit-logic + 26 DT Playwright green.

### Findings (non-blocking)
1. **[Low/concurrency]** The write fires on every allocation change; rapid retargeting could send overlapping PATCHes. Single-user form; the endpoint is strip-then-apply so last-write-wins is coherent. No fix needed.
2. **[Low/coverage]** No automated assertion that the *sheet* renders the hollow dot (the Playwright spec exercises the DT form, not the sheet view). Covered by the `free_*` audit + the `carthB` code change. Optional to add a sheet-render test.

### Test coverage
- `server/tests/api-characters-carthian-pull.test.js` — **11/11**.
- `tests/issue-508-carthian-pull-allocation.spec.js` — **6/6**.
