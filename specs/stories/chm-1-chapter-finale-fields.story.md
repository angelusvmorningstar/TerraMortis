---
id: chm.1
epic: chm
status: ready-for-dev
priority: medium
depends_on: [chm.0]
---

# Story CHM-1: Chapter and finale fields on game session and downtime cycle

As a Storyteller running a multi-game chapter,
I should be able to label a game session with its chapter (e.g. "Ch 1, Game 3") and mark a downtime cycle as the chapter's final cycle,
So that downstream features (the maintenance audit panel in CHM-2, the player at-risk warning in CHM-3, and any future Chapter system) have a stable, ST-authored signal of where each session and cycle sit in the campaign's chapter structure.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 3 (Chapter & Maintenance Layer), foundations story. The Maintenance Layer rests on three pieces of data the system does not yet capture:

1. Which **chapter number** a given game session belongs to.
2. A **human-readable label** for that chapter (e.g. `"Ch 1, Game 3"`), authored by the ST so it reads naturally in admin views and player-facing copy.
3. Whether a given downtime cycle is the **final cycle of its chapter** — the chapter finale flag.

CHM-1 ships only the field plumbing and the minimal ST input UI to author the values. No consumer surfaces are wired up in this story; CHM-2 and CHM-3 read the fields, and a future first-class Chapter feature may eventually replace the manual entry. The shape chosen here supports both paths without rework.

The memory deliberately defers auto-detection of chapter boundaries, a `chapters` collection, and any XP-rule enforcement. CHM-1 is a small data + UI story; it should not grow into a chapter-management subsystem.

### Files in scope

- `server/schemas/game_session.schema.js` — add `chapter_number` (integer) and `chapter_label` (string) as optional top-level properties.
- `public/js/admin/next-session.js` — add Chapter Number and Chapter Label inputs to the Next Session panel; wire them into `loadNext()` and `saveNext()`.
- `public/js/admin/downtime-views.js` — `renderPrepPanel` (~line 1399); add an `is_chapter_finale` checkbox to the DT Prep grid; wire it through `updateCycle`.

### Out of scope

- Server-side schema validation for `downtime_cycle.is_chapter_finale`. There is **no `downtime_cycle.schema.js`** today (only `downtime_submission.schema.js`); cycles are written to Mongo without JSON-Schema validation. This story does not introduce a cycle schema; the field is set via the existing `PUT /api/downtime_cycles/:id` route which already accepts arbitrary patch bodies.
- The maintenance audit panel that consumes the finale flag (**CHM-2**).
- The player at-risk warning strip that consumes the finale flag (**CHM-3**).
- Auto-derivation of `chapter_number` from session sequence, auto-marking the last cycle of a chapter as the finale, or any cross-session inference. All values are ST-authored in this story.
- Bulk-edit UI for past sessions/cycles. STs can edit historical sessions one at a time via the existing Engine domain editor if they want to backfill chapter labels; no batch tool.
- A first-class `chapters` collection. Field shape is forward-compatible if such a collection ever ships, but CHM-1 stores chapter info inline on the session/cycle documents only.

---

## Acceptance Criteria

### Game session — chapter number + label

**Given** I am an ST on the Engine domain's Next Session panel
**When** the panel renders
**Then** I see two new optional inputs alongside the existing Game Date / Doors Open / Game Number fields:
- A numeric "Chapter Number" input (integer ≥ 1)
- A free-text "Chapter Label" input (e.g. `"Ch 1, Game 3"`)

**Given** I fill in chapter number and/or chapter label and click Save
**When** the save succeeds
**Then** the new values persist on the `game_sessions` document as `chapter_number` (integer) and `chapter_label` (string).

**Given** I reload the Next Session panel after saving
**Then** my previously-saved chapter values are pre-filled.

**Given** I leave both chapter inputs blank and save
**Then** the session document persists without `chapter_number` or `chapter_label` keys (or with them set to `null`/`undefined`); no validation error fires.

**Given** an existing game session predates this story (no chapter fields written)
**When** the Next Session panel loads it
**Then** both chapter inputs render as empty.
**And** the rest of the panel renders unchanged.

**Given** the JSON Schema in `server/schemas/game_session.schema.js`
**Then** it declares `chapter_number` as `{ type: 'integer', minimum: 1 }` and `chapter_label` as `{ type: 'string' }`, both optional, neither in `required`.

### Downtime cycle — chapter finale flag

**Given** I am an ST viewing the DT Prep panel for a cycle in `prep` status
**When** the panel renders
**Then** I see a new "Chapter Finale" checkbox alongside the Auto-Open and Deadline inputs.
**And** the checkbox reflects the cycle's current `is_chapter_finale` value (unchecked by default for cycles where the field is missing).

**Given** I tick or untick the Chapter Finale checkbox
**When** the change handler fires
**Then** the cycle document's `is_chapter_finale` field is updated via `updateCycle` (PUT `/api/downtime_cycles/:id`).
**And** the in-memory `allCycles` cache is updated to match.

**Given** an existing downtime cycle predates this story (`is_chapter_finale` not present)
**When** the DT Prep panel loads it
**Then** the checkbox renders unchecked.
**And** no migration or backfill is required.

**Given** the cycle is **not** in `prep` status (e.g. `game`, `active`, `closed`, `complete`)
**Then** the Chapter Finale checkbox is **not editable** in the DT Prep panel (the panel itself only renders for `prep` cycles per existing logic in `renderPrepPanel`). The flag set during prep persists across all later statuses.

### General

**Given** the codebase
**When** any code needs to read a chapter label or finale flag
**Then** it reads from these fields directly (`session.chapter_label`, `cycle.is_chapter_finale`); no helper module is required at this stage. (CHM-2 and CHM-3 may extract a helper if they grow more than one read site each.)

---

## Implementation Notes

### Schema (server/schemas/game_session.schema.js)

Add inside the existing `properties` block, alongside `game_number`:

```js
chapter_number: { type: 'integer', minimum: 1 },
chapter_label:  { type: 'string' },
```

The schema already declares `additionalProperties: true`, so the additions are belt-and-braces — they make the field shape explicit and self-documenting. Do not add either to `required`; both must remain optional.

### Next Session panel (public/js/admin/next-session.js)

In `buildPanel()`, add two `<label class="dt-deadline-edit">` blocks inside the existing `display:grid` container, between Game Number and Downtime Deadline:

```html
<label class="dt-deadline-edit">
  <span>Chapter Number</span>
  <input type="number" id="ns-chapter-number" min="1" style="width:5rem;">
</label>
<label class="dt-deadline-edit">
  <span>Chapter Label</span>
  <input type="text" id="ns-chapter-label" placeholder="e.g. Ch 1, Game 3">
</label>
```

In `loadNext()`, add:
```js
document.getElementById('ns-chapter-number').value = session.chapter_number != null ? session.chapter_number : '';
document.getElementById('ns-chapter-label').value  = session.chapter_label || '';
```

In `saveNext()`, extend the body:
```js
const chapterNum = document.getElementById('ns-chapter-number').value;
const chapterLbl = document.getElementById('ns-chapter-label').value.trim();
const body = {
  // ...existing fields...
  chapter_number: chapterNum ? parseInt(chapterNum, 10) : undefined,
  chapter_label:  chapterLbl || undefined,
};
```

The `undefined` values are stripped server-side (or ignored by Mongo on PUT). Do not send `null` unless verifying the route accepts null without storing it.

### DT Prep panel (public/js/admin/downtime-views.js)

In `renderPrepPanel`, extend the existing `<div class="dt-prep-grid">` to include a third field:

```js
const finaleChecked = cycle.is_chapter_finale ? ' checked' : '';

// inside the dt-prep-grid:
`<div class="dt-prep-field">
  <label class="dt-lbl" style="display:flex;align-items:center;gap:.5rem;">
    <input type="checkbox" id="dt-chapter-finale-input"${finaleChecked}>
    <span>Chapter Finale</span>
  </label>
</div>`
```

Wire the change handler alongside the existing auto-open / deadline handlers:

```js
document.getElementById('dt-chapter-finale-input')?.addEventListener('change', async e => {
  const val = e.target.checked;
  await updateCycle(cycle._id, { is_chapter_finale: val });
  const idx = allCycles.findIndex(c => c._id === cycle._id);
  if (idx >= 0) allCycles[idx].is_chapter_finale = val;
  cycle.is_chapter_finale = val;
});
```

### No new tests required

This is a UI + schema additive change. The existing test suites should continue to pass; verifying that the new fields round-trip through the API on save/load is sufficient as manual smoke testing.

If a quick assertion is desired, extend an existing `server/tests/api-game-sessions.*` test (if one exists; check `server/tests/`) to assert that a POST containing `chapter_number` and `chapter_label` persists and re-reads correctly. Optional, not required.

### Strawman wording

- Chapter Number input label: **"Chapter Number"**
- Chapter Label input label: **"Chapter Label"**, placeholder `"e.g. Ch 1, Game 3"`
- DT Prep checkbox label: **"Chapter Finale"**

Final wording can be tuned at implementation; the principle is that all three fields read as ST-facing scaffolding rather than player-facing copy.

---

## Files Expected to Change

- `server/schemas/game_session.schema.js` — add `chapter_number` and `chapter_label` to `properties` (no change to `required`).
- `public/js/admin/next-session.js` — two new inputs in `buildPanel()`; load/save logic extended in `loadNext()` and `saveNext()`.
- `public/js/admin/downtime-views.js` — Chapter Finale checkbox added to `renderPrepPanel` grid; change handler wired through `updateCycle`.

No server route changes (existing `PUT /api/game_sessions/:id` and `PUT /api/downtime_cycles/:id` already accept arbitrary patch bodies).

---

## Definition of Done

- All AC verified.
- Manual smoke test:
  - Open Next Session panel, set Chapter Number = 1, Chapter Label = "Ch 1, Game 3", save, reload — values persist.
  - Open DT Prep panel for a prep-status cycle, tick Chapter Finale, refresh — checkbox stays ticked. Untick and refresh — checkbox stays unticked.
  - Open a pre-existing session in Next Session — chapter fields render empty, no errors.
  - Open a pre-existing prep cycle in DT Prep — Chapter Finale checkbox renders unchecked, no errors.
- Schema validation passes for game session writes both with and without the new fields.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `chm-1-chapter-finale-fields: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on CHM-0** in epic-sequence terms only (CHM-0 establishes the `MAINTENANCE_MERITS` constant the rest of the epic shares); CHM-1 itself does not import the constant.
- **Blocks CHM-2** (maintenance audit panel reads `is_chapter_finale` and `chapter_label`).
- **Blocks CHM-3** (player at-risk warning reads `is_chapter_finale` and the maintenance-merit ownership check).
- Independent of NPCP-1 / NPCP-2 / DTSR / DTFP / DTIL / JDT.
