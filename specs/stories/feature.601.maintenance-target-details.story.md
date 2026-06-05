# Story Feature.601: Show the maintained asset (Target) on the Maintenance Details card

## Status: review

> **Implemented 2026-06-05.** Option B: resolve the merit name from `project_N_target_value` (strip trailing `_<dots>`) into `entry.maintenanceTarget` (gated to maintenance), render a Target row on the Details card after the #583 Lead row. New spec `tests/fix-601-maintenance-target-details.spec.js` — 2/2 pass. ESM parse-check green. Regression run in parallel.

## Metadata
- issue: 601
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/601
- branch: morningstar-issue-601-maintenance-target-details
- type: feature / enhancement (render)
- relates: #583 (investigate lead — same "surface a player field on the Details card" pattern)

---

## Story

**As** an ST resolving a Maintenance action,
**I want** the Details card to name the asset the player is maintaining,
**so that** I can resolve the action correctly instead of seeing only a free-text Approach with no idea what is being upkept.

---

## Background

The player picks what they are maintaining (e.g. Professional Training, or an MCI) via a chip in the DT form's Maintenance action. That choice is submitted but never shows in DT Processing — the Details card shows only the Description. Raised from Carver maintaining "Professional Training".

### How the maintenance target is stored (the key fact)

`renderMaintenanceChips` (`downtime-form.js:5568`) builds a chip per maintainable merit with **`id = `` `${m.name}_${dots}` ``** (`:5583`, e.g. `"Professional Training_5"`). The chip handler (`:3068-3083`) writes that id to **`responses.project_${n}_target_value`** — and writes **no `target_type`**.

So:
- `_composeTargetString` (`downtime-views.js:2739`) returns `''` for maintenance (it requires a known `target_type`), so `entry.projTarget` is empty.
- The stored value is `` `Name_dots` ``, NOT the `` `Name|qualifier` `` shape the `own_merit` branch expects (`:2759-2762`).

### Decision (resolved): Option B — resolve the name in processing

Do NOT set `target_type='own_merit'` in the form (Option A): the stored value is `` `Name_dots` ``, so `_composeTargetString`'s `own_merit` branch would render the raw `"Professional Training_5"` (it splits on `|`, not `_`). Changing the chip's id format to `Name|qual` would also break the form's own dedup/audit keys that read `` `${m.name}_${dots}` ``.

Instead, resolve `project_${n}_target_value` → the merit's display name in processing and render it on the Details card. Merit names do not end in `_<digits>`, so stripping a trailing `_<dots>` recovers the name; prefer matching against the character's maintainable merits for robustness, with the strip as fallback.

### Where it renders

The Maintenance action is a project action (`source: 'project'`) → `renderNormalisedCard` (`downtime-views.js:8804`, dispatched at `:9065`). Add a read-only **Target** row in the Details card view mode, between Title and Description, exactly like the #583 Lead row (`:8849`), gated to maintenance.

---

## Acceptance Criteria

- [x] **AC1** — Maintenance Details card shows a **Target** row (between Title/Lead and Description) naming the asset. _(Test: "maintenance shows Target: Professional Training".)_
- [x] **AC2** — Resolved to the readable merit name (strip trailing `_<dots>`): shows "Professional Training", not "Professional Training_5". _(Test asserts both.)_
- [x] **AC3** — Gated to `effectiveActionType === 'maintenance'` in `buildProcessingQueue` AND `entry.actionType === 'maintenance'` in the render; a non-maintenance action whose `target_value` is a character target shows no maintenance Target row. _(Test: "non-maintenance action ... shows no maintenance Target row".)_
- [x] **AC4** — Description unchanged; empty-state guard extended with `!maintVal`, so a target-only maintenance action does not show "— No details recorded" and an asset-less one shows no stray row.
- [x] **AC5** — `tests/fix-601-maintenance-target-details.spec.js`, 2 tests pass.

---

## Tasks

### Task 1 — Resolve the maintained asset onto the entry (AC2) — [x] DONE
`entry.maintenanceTarget = String(resp[project_${slot}_target_value]||'').replace(/_\d+$/,'').trim()`, gated `effectiveActionType === 'maintenance'`. The strip is safe — `MAINTENANCE_MERITS` (`downtime-data.js:143`) are 'Professional Training' / 'Mystery Cult Initiation', neither contains an underscore.
In `buildProcessingQueue` (`downtime-views.js`, alongside `projTarget`/`projInvestigateLead`, ~`:3045-3110`), for maintenance project actions compute `entry.maintenanceTarget` = the readable merit name from `resp[`project_${slot}_target_value`]`. Resolve robustly: match the value against the character's maintainable merits (`MAINTENANCE_MERITS`; reconstruct `` `${m.name}_${dots}` ``) and use `m.name`; fall back to stripping a trailing `_<digits>`. Only compute when `effectiveActionType === 'maintenance'` so it never collides with character-target `target_value`.

### Task 2 — Render the Target row (AC1, AC3, AC4) — [x] DONE
`maintVal` gated to `entry.actionType === 'maintenance'`; Target row after the Lead row; empty-state guard gains `!maintVal`. Reused `proc-proj-field`/`proc-feed-lbl` (no new CSS).
In `renderNormalisedCard` view mode (`downtime-views.js:8847-8858`), after the Title row, add (gated):
```js
if (entry.actionType === 'maintenance' && entry.maintenanceTarget) {
  h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Target</span> ${esc(entry.maintenanceTarget)}</div>`;
}
```
Reuse `proc-proj-field` / `proc-feed-lbl` (no new CSS). Extend the empty-state guard so a target-only maintenance action does not show "— No details recorded" (mirror the #583 `!leadVal` change).

### Task 3 — Test (AC5) — [x] DONE
`tests/fix-601-maintenance-target-details.spec.js`, 2 pass: maintenance → "Target: Professional Training" (not "_5") + Description; investigate (char target_value) → no maintenance Target row.
New Playwright spec: maintenance submission (`project_1_action='maintenance'`, `project_1_target_value='Professional Training_5'`, a Description), open the action → Details card shows a "Target" row containing "Professional Training" and the Description; a non-maintenance action shows no maintenance Target row.

---

## Dev Notes

### Files / artifacts
- `public/js/tabs/downtime-form.js:5568-5600` — `renderMaintenanceChips` (id = `` `${m.name}_${dots}` ``); `:3068-3083` chip handler (writes `target_value`, no `target_type`); `MAINTENANCE_MERITS` list (find the const).
- `public/js/admin/downtime-views.js:8847-8858` — Details card view mode (render site; cf. #583 Lead row at `:8849`).
- `public/js/admin/downtime-views.js:~3045-3110` — `buildProcessingQueue` entry build (where to attach `entry.maintenanceTarget`).
- `public/js/admin/downtime-views.js:2739-2767` — `_composeTargetString` (why Option A is rejected).
- `tests/fix-586-target-prepopulate.spec.js` — flat-wall harness to model.

### Must preserve / watch-outs
- `project_${n}_target_value` is ALSO the character-target value for attack/block/investigate — only treat it as a maintenance asset when `actionType === 'maintenance'` (AC3). Do not double-surface.
- Display the name only (the user asked for "Target: Professional Training"); appending dots is optional, keep it simple.
- Escape with `esc()` (defensive, though it's a known merit name).
- Render-only on the ST side; do NOT change how the form stores the maintenance target (Option A rejected).
- British English; reuse existing classes (no new CSS — CSS normalisation is #587).

### References
- [Source: downtime-form.js:5583] — maintenance id `` `${m.name}_${dots}` ``
- [Source: downtime-form.js:3068-3083] — chip writes `project_${n}_target_value`, no `target_type`
- [Source: downtime-views.js:8847-8858] — Details card view (Target row site)
- [Source: downtime-views.js:2759-2762] — `_composeTargetString` own_merit (Option A reject reason)
- #583 (Lead row pattern + empty-state guard), #586 (target throughline)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- ESM parse-check `downtime-views.js` — PASS.
- `npx playwright test fix-601-maintenance-target-details.spec.js` — 2 passed.
- Regression `downtime-processing` + `fix-583` + `fix-586` — 19 passed / 0 failed.

### Completion Notes List

- Option B (resolve in processing). `buildProcessingQueue`: `entry.maintenanceTarget` = `target_value` with the trailing `_<dots>` stripped, gated to `effectiveActionType === 'maintenance'` so it never collides with the character `target_value` used by attack/block/investigate.
- `renderNormalisedCard` view mode: a read-only **Target** row (after the #583 Lead row), gated to `entry.actionType === 'maintenance'`, with `!maintVal` added to the empty-state guard. Reused `proc-proj-field`/`proc-feed-lbl` — no new CSS.
- The strip is robust: `MAINTENANCE_MERITS` names contain no underscore.
- Render-only on the ST side; the form's maintenance storage is unchanged (Option A rejected — `Name_dots` isn't the `Name|qual` shape `_composeTargetString` expects).

### File List

- `public/js/admin/downtime-views.js` (modified — `entry.maintenanceTarget` in buildProcessingQueue; Target row + empty-state guard in renderNormalisedCard)
- `tests/fix-601-maintenance-target-details.spec.js` (new — 2 Playwright tests)
- `specs/stories/feature.601.maintenance-target-details.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — Surface the maintained asset (Target) on the DT Processing Maintenance Details card: resolve the merit name from `project_N_target_value` (strip `_<dots>`) into `entry.maintenanceTarget`, render a gated Target row. New spec, 2 tests passing. Regression 19 passed. Status → review.
