# Story Feature.589: Flow player Connected Characters to the ST side (project actions)

## Status: review

> **Implemented 2026-06-05.** Two-part: (1) player multi-char selector on project action cards → `responses.project_N_connected_chars` (JSON `_id` array); (2) override-aware ST seed via `entry.connectedCharKeys` (shared `_composeCharKeysFromIds` mapper). 10 tests: `tests/fix-589-connected-chars-flow.spec.js` (6, ST seed) + `tests/dt-form-589-connected-chars-capture.spec.js` (4, player capture). ESM parse-check green. Regression in parallel.

## Metadata
- issue: 589
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/589
- branch: morningstar-issue-589-connected-chars-flow
- type: feature
- relates: #586 (target throughline — the seed pattern this mirrors)
- scope-decision: **per project action only** (Angelus, 2026-06-05). Sphere/contact/retainer actions stay ST-manual for now (future follow-up).

---

## Story

**As** an ST resolving a downtime,
**I want** the player's Connected Characters choices on their Project actions to pre-fill the ST Connected Characters box,
**so that** I see who the player linked to the action without re-entering it, and can still override.

---

## Background & audit

The ST "Connected Characters" typeahead renders on almost every action (`downtime-views.js:7114` — all entries except ambience-merits and feeding) and is seeded **only** from `rev.connected_chars` (`:7115`) — ST-entered chips. **Audit finding:** the player DT form (`downtime-form.js`) has **no** connected-characters capture at all (grep for `connected` returns nothing there). So unlike #586 (where the player target already existed), this story must ALSO add player-side capture.

**Scope (decided):** add capture to **Project actions only**. The ST box still appears on other action types but stays manual there for now.

### The two parts

1. **Player capture (new):** a multi-character selector on each Project action card → `responses.project_${n}_connected_chars` (a JSON array of character `_id`s, mirroring the `target_value` array convention so the existing mapper handles it).
2. **ST seed (mirror #586):** project entries seed `rev.connected_chars` from the player field, override-aware (`('connected_chars' in rev)` presence check — NOT `??`/`||`).

---

## Acceptance Criteria

- [x] **AC1 (player capture)** — Project action card has a Connected Characters multi-select (`renderConnectedCharsZone`); add-via-dropdown + remove-via-chip write `responses.project_N_connected_chars` (JSON `_id` array); pre-seeded value round-trips. _(4 capture tests.)_
- [x] **AC2 (ST seed)** — Project entry's `connectedCharKeys` seeds the ST Connected Characters typeahead on first open, no ST input. _(Test: "player connected character seeds the ST box".)_
- [x] **AC3 (override-aware)** — `('connected_chars' in rev) ? (rev.connected_chars||[]) : (entry.connectedCharKeys||[])`. _(Tests: "ST clear wins", "ST set wins".)_
- [x] **AC4 (key mapping + graceful)** — `_composeCharKeysFromIds` maps `_id`s → `sortName(c)`, dropping unresolved/retired. _(Tests: "unresolved id", "retired character".)_
- [x] **AC5 (scope guard)** — `connectedCharKeys` set for project entries only → seed is `[]` elsewhere; the player widget renders on all project actions (rote-locked feed slots skip via the existing `continue`); the actor is excluded both in the player dropdown (`allCharacters` already drops self — QA test asserts it) and the ST filter (`:7119`).
- [x] **AC6 (test)** — 10 Playwright tests total (6 ST-seed + 4 player-capture).

---

## Tasks

### Task 1 — Player capture on Project actions (AC1) — [x] DONE
`renderConnectedCharsZone(n, saved, allCharacters)` added after the target zone for all project actions except ambience; add/remove handlers (change on `.dt-conn-add`, click on `.dt-conn-remove`) write the JSON `_id` array canonical-first then `renderForm`+`scheduleSave`. NOTE: `allCharacters` shape is `{ id, name }` (already self-excluded), not `{ _id, moniker }` — widget uses `c.id`/`c.name`.
Add a multi-character selector to the Project action card in `downtime-form.js`. Place it with the target zone (`renderTargetZone`, `:5655` / the project action card that calls it). Store selected character `_id`s as a JSON array string in `responses.project_${n}_connected_chars` (match the `target_value` array convention so `_composeTargetCharKeys`-style parsing works). Reuse the form's existing character data and `.dt-chip` selection styling; follow the maintenance-chip handler pattern (`:3068-3083`) for write-to-responses + re-render. Exclude the submitting character from the options.

### Task 2 — Map the player field onto the queue entry (AC4) — [x] DONE
Extracted `_composeCharKeysFromIds(rawVal, chars)` (shared by `_composeTargetCharKeys` and the new `_composeConnectedCharKeys`); `entry.connectedCharKeys` computed near `_projTargetCharKeys`, project entries only.
In `buildProcessingQueue` (`downtime-views.js`, near `_projTargetCharKeys` at `:3074`), compute `entry.connectedCharKeys` from `resp[`project_${slot}_connected_chars`]` using the same id→`sortName` mapping as `_composeTargetCharKeys` (`:2776`) — JSON-array parse, `chars.find(_id)`, skip retired/unresolved. Generalise that helper or add a sibling; do not duplicate the parse logic loosely.

### Task 3 — Override-aware ST seed (AC2, AC3, AC5) — [x] DONE
`downtime-views.js:7115` now `('connected_chars' in rev) ? (rev.connected_chars||[]) : (entry.connectedCharKeys||[])`.
At `downtime-views.js:7115`, change `const _connChars = rev.connected_chars || []` to:
```js
const _connChars = ('connected_chars' in rev) ? (rev.connected_chars || []) : (entry.connectedCharKeys || []);
```
`entry.connectedCharKeys` is `[]` for non-project entries (Task 2 only sets it for projects), so other action types are untouched (AC5). The existing `key !== entry.charName` filter at `:7119` already excludes the actor.

### Task 4 — Test (AC6) — [x] DONE
`tests/fix-589-connected-chars-flow.spec.js` (6) + `tests/dt-form-589-connected-chars-capture.spec.js` (4).
Playwright spec modelled on `fix-586-target-prepopulate.spec.js`: a Project submission with `project_1_connected_chars` = `["<id>"]`, ST untouched → ST Connected Characters typeahead (`[data-ta-save="connected_chars"]`) shows the chip; with `projects_resolved[0].connected_chars = []` (ST cleared) → no chip; unresolved/retired id → no chip, no crash.

---

## Dev Notes

### Files / artifacts
- `public/js/admin/downtime-views.js:7114-7124` — ST Connected Characters render + seed (the seed edit site).
- `public/js/admin/downtime-views.js:2776` — `_composeTargetCharKeys` (the id→sortName mapper to mirror/generalise).
- `public/js/admin/downtime-views.js:3074` — `_projTargetCharKeys` in `buildProcessingQueue` (where to add `entry.connectedCharKeys`).
- `public/js/admin/downtime-views.js:7133` — `_renderCharTypeahead` (`saveField: 'connected_chars'`, multi, sortName keys, chips; `data-ta-save` attribute used by the save handler at `:5746`).
- `public/js/tabs/downtime-form.js:5655` `renderTargetZone` / `:5695` `renderTargetCharOrOther` (single-char target precedent); `:3068-3083` maintenance-chip write-to-responses pattern; `:1050` array-in-responses precedent (`skill_acquisitions`).

### Must preserve / watch-outs
- **Override-aware = presence check.** `('connected_chars' in rev)`, never `??`/`||` — the multi typeahead writes `[]`/null on clear and the ST clear must win (AC3). Same trap as #586/#594.
- **Key format is `sortName(c)`** (lowercase), the same keys the ST typeahead emits — so seeding mixes cleanly with ST edits. Store `_id`s in the form; convert to keys in the queue (Task 2), not in the form.
- **Scope guard:** only set `entry.connectedCharKeys` for project entries, so the seed is `[]` elsewhere and other action types are visually unchanged (AC5).
- **Exclude the actor:** the player selector and the ST filter must both drop the submitting character (`:7119`).
- British English; reuse `.dt-chip` styling (no new CSS — that's #587's domain).
- Player cannot test locally; ST-seed is testable via Playwright mock, player-capture via the form harness.

### References
- [Source: downtime-views.js:7114-7124] — ST seed site
- [Source: downtime-views.js:2776] — `_composeTargetCharKeys` mapper
- #586 (`fix.586` story + `tests/fix-586-target-prepopulate.spec.js`) — the override-aware seed pattern and harness
- Surfaced in #585 (retired the old auto-list test)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- ESM parse-check `downtime-views.js` + `downtime-form.js` — PASS.
- `fix-589-connected-chars-flow.spec.js` — 6 passed; `dt-form-589-connected-chars-capture.spec.js` — 4 passed.
- Regression (target mapper + processing + dt-form suite) — _result in Change Log._

### Completion Notes List

- **Shared mapper:** extracted `_composeCharKeysFromIds(rawVal, chars)` from `_composeTargetCharKeys` (DRY — #586 target keys now route through it too); added `_composeConnectedCharKeys`. `entry.connectedCharKeys` set in `buildProcessingQueue` for project entries only.
- **ST seed:** `downtime-views.js:7115` override-aware presence check; non-project entries get `[]` so other action types are untouched (AC5).
- **Player widget:** `renderConnectedCharsZone` (add-dropdown + removable chips) on all project cards (rote-locked feed slots skip via `continue`). Two delegated handlers (change `.dt-conn-add`, click `.dt-conn-remove`) write the JSON `_id` array canonical-first, re-render, save — mirroring the maintenance-chip pattern. `collectResponses` preserves the value via its `_prior` spread (no hidden input needed).
- **Gotcha caught pre-test:** the form's `allCharacters` is `{ id, name }` (already self-excluded, `name` = `moniker||name`), NOT `{ _id, moniker }` — widget reads `c.id`/`c.name`.
- Scope: project actions only (Angelus). Sphere/contact/retainer actions keep the ST box but stay manual — a noted future follow-up.

### File List

- `public/js/admin/downtime-views.js` (modified — `_composeCharKeysFromIds`/`_composeConnectedCharKeys`, `entry.connectedCharKeys`, override-aware ST seed)
- `public/js/tabs/downtime-form.js` (modified — `renderConnectedCharsZone`, project-card wiring, add/remove handlers)
- `tests/fix-589-connected-chars-flow.spec.js` (new — 6 ST-seed tests)
- `tests/dt-form-589-connected-chars-capture.spec.js` (new — 4 player-capture tests)
- `specs/stories/feature.589.connected-chars-flow.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Connected Characters now flow player→ST (project actions): new player multi-char selector → `project_N_connected_chars`, override-aware ST seed via `entry.connectedCharKeys`/shared `_composeCharKeysFromIds`. 10 new tests. Regression: 49 passed; 1 failure (`dt-form-34-submit-delegation.spec.js:165`) confirmed PRE-EXISTING (fails identically with my changes stashed — `#dt-feed-custom-attr` has <2 options in that harness; unrelated to #589; test-debt sibling of #602). Status → review.
