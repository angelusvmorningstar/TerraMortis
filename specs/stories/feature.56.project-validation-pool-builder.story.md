# Story feature.56: Personal Projects Validation — Rote & Writeup

## Status: done

## Story

**As an** ST processing personal project submissions,
**I want** a rote toggle on each project pool builder and a per-project writeup field,
**so that** I can run the roll correctly and record the narrative outcome for the player.

## Background

The project pool builder already exists (`poolBuilderUI` + roll button + `st_note` textarea). What is missing:
- **Rote toggle** — the roll modal has a rote checkbox inside it, but there is no persistent toggle on the panel. The rote state should be tracked in `_proj_pending[i].rote` so it survives re-renders and is passed to `showRollModal`.
- **Player writeup** — there is an ST-only `st_note` textarea per project. Players have no per-project feedback field. A separate "Writeup (player-visible)" textarea saves to `projects_resolved[i].writeup`, which the ST can reference when composing the `mechanical_summary` for publication.

The roll itself (via `showRollModal`) already supports rote — the modal's internal toggle suffices. The panel-level toggle is a convenience: it pre-checks the rote toggle in the modal and ensures the roll result reflects rote in `params.rote`.

## Acceptance Criteria

1. Each project slot in `renderProjectsPanel` has a **Rote** checkbox (`dt-proj-rote`) positioned next to the roll button.
2. The rote checkbox state is read from `_proj_pending[i].rote` and, if no pending state, from `sub.projects_resolved[i].roll.params.rote`.
3. When the roll button is clicked, `showRollModal` receives `existingRoll` (if already resolved) or `undefined`, and the pool object includes `rote: pen.rote` so the modal pre-checks the rote toggle.
4. The rote checkbox change handler updates `_proj_pending[i].rote` in memory (no DB save needed — it is passed to the roll at roll time).
5. Each project slot has a **Writeup** textarea (`dt-proj-writeup`) below the ST note field.
   - Placeholder: `"Player-visible writeup for this project..."`
   - On `blur`, saves to `projects_resolved[i].writeup` via `updateSubmission(subId, { 'projects_resolved': updatedResolved })`
   - Reads initial value from `sub.projects_resolved[i]?.writeup || ''`
6. The writeup textarea is rendered regardless of whether the project is resolved (so the ST can pre-write it).

## Tasks / Subtasks

- [x] Task 1: Rote toggle (AC: 1–4)
  - [x] In `renderProjectsPanel`, add rote checkbox after the pool builder and before the roll button:
    ```html
    <label class="dt-proj-rote-lbl">
      <input type="checkbox" class="dt-proj-rote" data-sub-id="..." data-proj-idx="..."
        ${pen.rote ? 'checked' : ''}>Rote
    </label>
    ```
  - [x] Add `.dt-proj-rote` change handler in `renderSubmissions` event delegation:
    - Updates `_proj_pending[i].rote = cb.checked`
  - [x] Update project roll button click handler:
    - Read `pen.rote` from `_proj_pending[i]`
    - Pass `initialRote: pen.rote` to `showRollModal` pool object

- [x] Task 2: Writeup textarea (AC: 5–6)
  - [x] In `renderProjectsPanel`, add writeup textarea after `dt-proj-note`:
    ```html
    <textarea class="dt-proj-writeup" data-sub-id="..." data-proj-idx="..."
      placeholder="Player-visible writeup for this project...">...</textarea>
    ```
  - [x] Add `.dt-proj-writeup` blur handler in `renderSubmissions` event delegation:
    - Read value
    - Copy `sub.projects_resolved` array, set `[i].writeup = value`
    - Call `updateSubmission(subId, { projects_resolved: resolved })`
    - Update in-memory `sub.projects_resolved`

- [x] Task 3: CSS (minimal)
  - [x] `.dt-proj-rote-lbl` — inline-flex, align-items center, gap 4px, font-size 12px
  - [x] `.dt-proj-writeup` — same sizing as `.dt-proj-note` with a distinct left border colour (gold) to distinguish from ST-only note

## Dev Notes

### Rote toggle initial state fallback

```js
const rote = pen.rote ?? res?.roll?.params?.rote ?? false;
```

### `showRollModal` rote pre-check

The modal reads `pool.existingRoll.params.rote` to pre-check the rote toggle. To pre-check on first roll (no existingRoll), pass a synthetic existing roll or extend the pool object. Simplest: pass `pool.initialRote = pen.rote`:

```js
showRollModal({
  size: pool.total,
  expression: pool.expression,
  success: 8, exc: 5, again: 10,
  existingRoll: res?.roll || null,
  initialRote: pen.rote || false,
}, result => handleProjectRollSave(subId, idx, pool, result));
```

Then in `showRollModal`:
```js
const initialRote = pool.existingRoll?.params?.rote ?? pool.initialRote ?? false;
```

### Writeup persistence

`projects_resolved` is a sparse array — entries can be `null`. When saving writeup, if `resolved[i]` is `null` or missing, create a stub `{ writeup: value }`. The roll fields will be added when the roll is saved.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | Rote toggle + writeup in `renderProjectsPanel`; event handlers; `showRollModal` pool arg |
| `public/js/downtime/roller.js` | Accept `initialRote` in pool object for pre-checking modal toggle |
| `public/css/admin-layout.css` | `.dt-proj-rote-lbl`, `.dt-proj-writeup` styles |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-12 | 1.0 | Initial draft | Amelia (claude-sonnet-4-6) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- Rote toggle added to each project slot; state read from `_proj_pending[i].rote ?? projects_resolved[i].roll.params.rote`
- Roll button click handler passes `existingRoll` and `initialRote` to `showRollModal`
- `roller.js` updated: `initialRote = pool.existingRoll?.params?.rote ?? pool.initialRote ?? false`
- Writeup textarea added per project; blur handler saves to `projects_resolved[i].writeup` via `updateSubmission`
- `.dt-proj-rote-lbl` and `.dt-proj-writeup` CSS added (gold left border distinguishes from ST-only note)

### File List
- `public/js/admin/downtime-views.js`
- `public/js/downtime/roller.js`
- `public/css/admin-layout.css`
- `specs/stories/feature.56.project-validation-pool-builder.story.md`
