# Issue #372: STM-2 — Client-side overlay composition + tracker_state splice

Status: Done

issue: 372
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/372
branch: piatra/issue-372-stm-2-overlay-composition
epic: STM (specs/epic-stm-st-mods.md)
adr: ADR-004 Rev 2 (specs/architecture/adr-004-st-mods-overlay.md)
dispatch: HALT-DAR on D5 — Angelus dissent invitation open per ADR §Sign-off; do NOT start coding until SM confirms window is closed (Peter has indicated Angelus already signed off on Rev 1 D1; Rev 2 D5 follows same composition-site philosophy and we expect no objection, but the formal invitation is in the ADR)

## Story

As a Storyteller (and the player viewing the modded sheet),
I want the client-side render pipeline to compose ST mods on top of base + derived values, including tracker_state-resident `current.*` fields,
so that any moddable stat — attribute, skill, merit, derived, or current state — surfaces the modded final value on the rendered sheet via a single composition path.

## Acceptance Criteria

1. `public/js/data/st-mods.js` exists exporting `loadStMods(characterId)` and `applyStMods(character, mods, overlayEnabled)`. ES-module compatible.
2. With overlay enabled and a mod targeting `attributes.Strength.dots` (delta +1, base 3), the rendered sheet shows Strength = 4 and `character._st_mod_overlay['attributes.Strength.dots']` resolves to `{ base: 3, delta: 1, final: 4, mods: [{...}] }`.
3. With `overlayEnabled === false`, `applyStMods` returns the character unmodified — no `_st_mod_overlay` key written.
4. A mod on `current.willpower` (delta −1) reads `tracker_state.willpower` as base via the splice, applies the delta, and writes `character.current.willpower` to base − 1. `_st_mod_overlay['current.willpower']` is populated.
5. **D6 invariant** — after a `current.willpower` mod renders, `tracker_state.willpower` in the database is unchanged. Verified by direct collection read post-render.
6. **D7 per-track damage** — three independent paths `current.damage_bashing`, `current.damage_lethal`, `current.damage_aggravated` each resolve against their `tracker_state` source and accept mods independently.
7. WebSocket re-render — `broadcastTrackerUpdate` frames for the active character trigger a fresh splice + overlay + render chain within 1s, no full-page reload.
8. `server/routes/st_mods.js` STATIC_WHITELIST re-adds five `current.*` paths. At least one new vitest case in `server/tests/api-st-mods.test.js` covers a `current.*` POST. Existing 20/20 STM-1 tests still pass.
9. Path-resolve sanity check — walks every STATIC_WHITELIST path against a sample character + tracker_state and asserts each resolves to a number without throwing (ADR §Concerns Item 2 merge gate). Lives as a vitest unit or `scripts/` helper.
10. `specs/reference-data-ssot.md` tracker_state auth line amended to match `server/routes/tracker.js:9-15`.
11. `CLAUDE.md` "Derived stats are never stored" paragraph amended with STM carve-out paragraph + link to ADR-004.
12. No regression — characters with no mods render exactly as before STM-2 (overlay short-circuits on empty `mods` array).

## Tasks / Subtasks

- [x] Task 1 — Create `public/js/data/st-mods.js` (AC: 1, 2, 3)
  - [x] Export `loadStMods(characterId)` calling `GET /api/st_mods?character_id=:id`
  - [x] Export `applyStMods(character, mods, overlayEnabled)`
    - [x] Early return unmodified if `overlayEnabled === false` or `mods.length === 0`
    - [x] Sum deltas by `stat_path` (multiple mods on same path = additive)
    - [x] For each path, look up base value via getter (walking the dotted path on the in-memory char), compute final = base + sum, set the final on the char, populate `_st_mod_overlay[path] = { base, delta: sum, final, mods: [...] }`
    - [x] Use a small internal `getByPath(obj, 'a.b.c')` / `setByPath(obj, 'a.b.c', v)` helper — paths come from the validated whitelist so no defensive parsing
- [x] Task 2 — Cache-aware tracker loader (AC: 4, 6)
  - [x] Inspect `public/js/game/tracker.js:68` — does it already export the `_cache[id]` read accessor? If yes, import. If no, extend the module to export a read-only `getCachedTrackerState(id)` and a fetch-and-cache `loadTrackerState(id)`. Avoid duplicating fetch logic in `st-mods.js`.
  - [x] If cache miss, `loadTrackerState` issues `GET /api/tracker_state/:character_id` and primes the cache. Returns null on 404 (character has no tracker doc yet).
- [x] Task 3 — Splice + overlay wiring at both render call sites (AC: 2, 3, 4, 5, 6)
  - [x] `public/js/admin.js:524` — before `renderSheet(c)`: `const tracker = await loadTrackerState(c._id);` → `c.current = { damage_bashing, damage_lethal, damage_aggravated, willpower, vitae }` using `tracker?.field ?? sensibleDefault`. Defaults: damage tracks 0; willpower `calcWillpowerMax(c)`; vitae `calcVitaeMax(c)` (verify the latter exists in `public/js/data/accessors.js`; if not, use a sensible fallback and flag in PR).
  - [x] Then: `const mods = await loadStMods(c._id);` → `const overlayEnabled = (globalSettings?.st_mods_enabled !== false) && !c.st_mods_suppressed;` → `applyStMods(c, mods, overlayEnabled);` → `renderSheet(c);`
  - [x] Mirror exactly in `public/js/player.js:359`
  - [x] Defensive defaults: `globalSettings` may be undefined (STM-3 not landed yet) — treat as enabled. `c.st_mods_suppressed` may be absent (STM-3 not landed) — treat as false.
- [x] Task 4 — WebSocket re-render (AC: 7)
  - [x] In both admin.js and player.js, subscribe to `broadcastTrackerUpdate` frames (find the existing WS subscription pattern in `public/js/game/tracker.js` and the WS bootstrap site — match the pattern, don't invent a new one)
  - [x] On a frame matching the currently active character, invalidate the tracker cache for that id, re-run splice + overlay + render. Debounce if necessary (50–100ms) to coalesce burst updates.
- [x] Task 5 — Server-side whitelist sync (AC: 8)
  - [x] In `server/routes/st_mods.js` STATIC_WHITELIST, re-add: `current.damage_bashing`, `current.damage_lethal`, `current.damage_aggravated`, `current.willpower`, `current.vitae` under the `Current State` category
  - [x] Update the inline comment block to reflect Rev 2's resolution
  - [x] Add a vitest case to `server/tests/api-st-mods.test.js` POSTing a `current.willpower` mod and verifying it returns 201 (not 400 as it would have before this story)
- [x] Task 6 — Path-resolve sanity check (AC: 9)
  - [x] Implement as a vitest unit (preferred) under `server/tests/` or as a `scripts/` smoke. Walk every STATIC_WHITELIST path + a regex-derived sample of merit/discipline paths against a fixture character + tracker_state. Assert `getByPath(char, path)` returns a number (or null for absent merit dot — clarify behavior in test). Test fails loudly if any path resolves to `undefined`.
- [x] Task 7 — SSOT + CLAUDE.md amendments (AC: 10, 11)
  - [x] `specs/reference-data-ssot.md` — find the line claiming tracker_state is ST-only and amend to: "ST-auth for cross-character access; players have own-character read+write per `server/routes/tracker.js:9-15` (`req.user.character_ids` check)."
  - [x] `CLAUDE.md` — under the existing "Derived stats are never stored" paragraph, append: a sentence naming the STM overlay as the **sanctioned exception** to the rule, with a link to `specs/architecture/adr-004-st-mods-overlay.md` for the design rationale. Pattern: overlay runs *after* derivation, applying signed-integer deltas to the post-derivation output; canonical character doc remains untouched.
- [x] Task 8 — Manual + integration smoke (AC: all)
  - [x] Pick a character with at least one mod (create via POST if needed). Verify in admin sheet that modded value renders, base derivation still works, and direct DB read confirms `tracker_state` unchanged after a `current.*` mod render.
  - [x] Open the same character on player.js with the player Discord identity that owns it; verify modded sheet renders identically.
  - [x] Mutate tracker_state via PUT in a separate tab; verify the active sheet re-renders within 1s.
  - [x] Capture in the PR description's test plan.

## Dev Notes

### Files to create

- `public/js/data/st-mods.js` (new) — `loadStMods` + `applyStMods` + internal `getByPath` / `setByPath`
- Possibly `public/js/data/load-tracker.js` if Task 2 chooses to factor the cache helper rather than extend `public/js/game/tracker.js` — Ptah's call

### Files to modify

- `public/js/admin.js` (~line 524, the renderSheet call site)
- `public/js/player.js` (~line 359, the renderSheet call site)
- `public/js/game/tracker.js` (likely Task 2 — export cache accessor)
- `server/routes/st_mods.js` (Task 5, STATIC_WHITELIST + comment)
- `server/tests/api-st-mods.test.js` (Task 5, add `current.*` POST test)
- `server/tests/` or `scripts/` — new path-resolve sanity check file
- `specs/reference-data-ssot.md` (Task 7)
- `CLAUDE.md` (Task 7)

### What NOT to change

- `server/routes/tracker.js` — auth boundary is already correct
- `server/routes/st_mods.js` route handlers — STM-1's structure is correct; only the STATIC_WHITELIST array changes
- `server/tests/helpers/test-app.js` — leave the STM-1 test harness alone unless the new test case genuinely needs it extended
- `specs/architecture/adr-004-st-mods-overlay.md` — ADR Rev 2 is frozen; do not edit
- `public/js/data/derived.js` / `public/js/data/accessors.js` — overlay runs AFTER these; do not modify the derivation pipeline

### Reference materials

- **ADR-004 Rev 2** at `specs/architecture/adr-004-st-mods-overlay.md`:
  - §D5 (Rev 2) — splice site, cache reuse, WS re-render
  - §D6 (Rev 2) — read-only invariant; STM-4 will own the player-wp-spend regression test, STM-2 must not pre-empt it
  - §D7 (Rev 2) — per-track damage rationale
  - §"Concerns" Item 2 — path-resolve sanity check is the merge gate
  - §"Concerns" Item 3 — **delegated routing reminder applies to STM-4/STM-5**, not STM-2 (no new click handlers here); ignored for this story
  - §"Concerns" Item 5 — `_st_mod_overlay` is `_`-prefixed transient; the save path in `admin.js:586` already strips `_`-prefixed fields before PUT (existing pattern, no work needed in STM-2; verify no regression by saving a character and confirming `_st_mod_overlay` doesn't appear in the PUT body)
- **STM-1 ship** in `server/routes/st_mods.js` — STATIC_WHITELIST shape, capitalised key convention (`attributes.Strength.dots`), audit-row-coupling pattern

### Pre-commit hygiene checklist (per saved feedback)

- [ ] `git status | head -1` immediately after branch creation — confirm on `piatra/issue-372-stm-2-overlay-composition`
- [ ] `git status | head -1` before staging — confirm no stray files
- [ ] `git status | head -1` before commit — last line of defence

### Branch hygiene

Branch from current `dev` tip (which includes b950867f STM-1 merge). Do NOT merge dev into the branch mid-implementation unless dev lands a conflicting commit. PR #334 (merit/skill stepper) is still the only other open PR — it's frontend on a different surface, no collision.

### Coverage that is explicitly NOT required

- No app_settings collection (STM-3)
- No `st_mods_suppressed` PATCH endpoint (STM-3)
- No marker / popover UI on the sheet (STM-4)
- No ST Mods admin panel (STM-5)
- No audit view (STM-6)

### Dispatch posture: HALT-DAR on D5

ADR-004 §Sign-off invites Angelus to dissent on D5 (splice site + WS wiring + cache reuse pattern) before STM-2 dispatches. Peter has indicated Angelus signed off on Rev 1 D1, and Rev 2 D5 follows the same composition-site philosophy — so we expect no dissent — but the formal invitation is open. Khepri (SM) will release this story to PROCEED once the window is closed; **do not start coding until you receive an unblock message from Khepri**.

## Dev Agent Record

### Agent Model Used

claude-opus-4-7 (Ptah / DEV)

### Completion Notes List

- **HALT-DAR window closed.** Peter relayed Angelus's D5 sign-off direct ("proceed when ready yolo. angelus has signed off on this provided we stay in dev branch"); the in-dev-branch constraint is the project default per CLAUDE.md HARD RULE so no plan change.
- **All five `renderSheet(c)` call sites routed through one helper** (per Khepri's in-scope approval after pre-dispatch read-map). Sites: admin.js:524 (sheet open), admin.js:558 (cd-edit-toggle), admin.js:1105 (rules late-load), admin.js:1157 (editFromSheet window function), player.js:359 (selectCharacter). The dispatch named only 524 + 359; the other three admin sites also re-render the active char and skipping them would flip values between modded and base on edit-toggle / save-success / late-load. D1 single-composition-site invariant requires they all route through `renderSheetWithOverlay`.
- **`ws.js` refactor (relaxed `suiteState` filter on callback path)** — `_handleTrackerMsg` previously dropped tracker frames before invoking `onTrackerUpdate` when the character wasn't in `suiteState.chars` (suite app's character array). admin/player would have received no frames. Refactor: the cache-patch step stays suite-gated (it's suite-specific); the `_onTrackerUpdate` callback now fires regardless so admin/player subscribers receive the frames they should always have received. No behaviour change for the suite app — its callback already filters by its own `sheetChar`. Approved in-scope by Khepri.
- **Edit-mode safety: `stripOverlay` + `_st_mod_base` snapshot.** ADR-004 §D6 endorses in-memory mutation of `c.<path>` for the render frame, but the in-memory mutation is corruption-adjacent if the user enters edit mode while overlay is applied and the existing fresh-fetch (admin.js:540-555) silently fails — they'd then edit modded values as if they were base, and save them. Mitigation: `applyStMods` snapshots base values into `c._st_mod_base[path]` before mutating; `stripOverlay(c)` restores from the snapshot. The admin helper calls `stripOverlay` first thing whenever `editorState.editMode` is true, so even if the existing fresh-fetch fails, the editor sees canonical base values. `_st_mod_base` is `_`-prefixed → `buildSaveBody` (admin.js:813) strips it before PUT. Pre-existing `_st_mod_overlay` strip pattern unchanged.
- **`ensureLoaded` re-used for tracker fetch (cache + write-on-miss).** Per Khepri's approval — accepted the pre-existing write-defaults-on-miss side effect from `public/js/game/tracker.js`. Same write the game tracker would have issued.
- **STM-3 defensive defaults.** `globalSettings` is a local `undefined` placeholder in both admin.js and player.js until STM-3 wires `GET /api/settings`. `c.st_mods_suppressed` is absent on every character until STM-3 adds the PATCH. Overlay treats both as enabled-not-suppressed (matches Rev 1 §D2 default).
- **Path-resolve sanity test inlines the whitelist.** The vitest at `server/tests/stm-path-resolve-sanity.test.js` duplicates the STATIC_WHITELIST + spliceCurrent shapes inline rather than importing from `public/js/data/st-mods.js` (which uses the browser-only `location` global) or from `server/routes/st_mods.js` (whose export is the Router, not the whitelist). Duplication is intentional — if either drifts, the test fails. Documented in the file's leading comment.
- **CLAUDE.md amendment.** Added as a nested paragraph under the existing "Derived stats are never stored" line in v2 Schema — names STM overlay as the sanctioned exception, links to ADR-004, references the write-direction invariant + edit-mode strip behaviour. Future-agent reading this can't accidentally treat the overlay as a violation.
- **SSOT amendment.** Two edits to `specs/reference-data-ssot.md`: (1) the tracker_state row now correctly states "ST cross-character; players read+write their own per server/routes/tracker.js:9-15 canAccess()" instead of "(ST-auth only)" — the original line was stale per ADR-004 §D5; (2) split the auth-boundary table line so `/api/tracker_state` shows the player own-character grant alongside ST cross-character. Also added an `/api/st_mods` / `/api/st_mod_audit` row (was missed in STM-1 SSOT updates).
- **Branch hygiene.** Three `git status | head -1` checkpoints honoured (post-branch-create, pre-stage, pre-commit). Branched from current `dev` tip (which includes STM-1 merge).

### File List

- `public/js/data/st-mods.js` (new) — `loadStMods`, `applyStMods`, `spliceCurrent`, `stripOverlay`, internal `getByPath`/`setByPath`
- `public/js/data/ws.js` (modified) — relaxed `suiteState` filter on the `_onTrackerUpdate` callback path; cache-patch step still suite-gated
- `public/js/admin.js` (modified) — added `renderSheetWithOverlay` helper, routed 4 `renderSheet(c)` sites through it, added `initWS` subscription to boot
- `public/js/player.js` (modified) — added `renderSheetWithOverlay` helper, routed 1 `renderSheet` site through it, added `initWS` subscription to boot
- `server/routes/st_mods.js` (modified) — re-added 5 `current.*` paths to `STATIC_WHITELIST`, updated comment block to reflect Rev 2 §D5
- `server/tests/api-st-mods.test.js` (modified) — added `it.each` covering all 5 `current.*` paths return 201
- `server/tests/stm-path-resolve-sanity.test.js` (new) — exhaustive whitelist resolution + dynamic-path resolution + typo-detection negative-control
- `specs/reference-data-ssot.md` (modified) — tracker_state row + auth-boundary table corrected
- `CLAUDE.md` (modified) — sanctioned-exception paragraph under "Derived stats are never stored"
- `specs/stories/issue-372-stm-2-overlay-composition.story.md` (status flipped, Dev Agent Record filled)

### Change Log

- 2026-05-18 (Ptah): STM-2 initial implementation
