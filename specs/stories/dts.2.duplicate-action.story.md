# Story DTS-2: Duplicate Action

Status: ready-for-dev

## Story

As an ST processing a character with multiple rites in a single sorcery submission,
I want to duplicate the action to create separate per-rite panels,
so that I can roll and record each rite independently without re-entering all the details.

## Acceptance Criteria

1. A "Duplicate" button appears in the collapsed action row header for sorcery entries (both player-submitted and ST-created).
2. Clicking Duplicate creates a new ST-created sorcery action on the same character's submission, pre-populated with the source entry's tradition and rite name.
3. The notes/description from the source entry (`rev.sorc_notes || entry.description`) are copied to the new action's `description` field.
4. The new action appears in the sorcery phase with the full panel (DTS-1 prerequisite), immediately expanded.
5. The source entry is unchanged — the duplicate is an independent copy.
6. Duplicate is available on player-submitted sorcery entries as well as ST-created ones.
7. E2E: 3 tests:
   - Duplicate button is present on sorcery row header
   - Clicking duplicate creates a new ST sorcery entry in the phase
   - New entry is pre-populated with tradition from source

## Tasks / Subtasks

- [ ] Task 1: Add Duplicate button to sorcery action row headers (AC: 1, 6)
  - [ ] In the action row rendering block (~line 3348), find where the row label is rendered
  - [ ] For `isSorcery` rows (check `entry.source === 'sorcery' || entry.actionType === 'sorcery'`), add a small duplicate button after the row label:
    ```js
    const isRowSorcery = entry.source === 'sorcery' || (entry.source === 'st_created' && entry.actionType === 'sorcery');
    if (isRowSorcery) {
      h += `<button class="proc-duplicate-btn" data-proc-key="${esc(entry.key)}" title="Duplicate this action">⎘ Dup</button>`;
    }
    ```
  - [ ] Note: this button is inside `.proc-action-row` — wire `e.stopPropagation()` so it doesn't toggle the row expansion

- [ ] Task 2: Wire Duplicate button click handler in `renderProcessingMode` (AC: 2–5)
  - [ ] After travel button wiring, add:
    ```js
    container.querySelectorAll('.proc-duplicate-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const key   = btn.dataset.procKey;
        const entry = _getQueueEntry(key);
        if (!entry) return;
        const rev   = getEntryReview(entry) || {};
        // Resolve tradition and rite from the source entry
        const tradition = rev.sorc_tradition || entry.tradition || '';
        const riteName  = rev.sorc_rite_name || rev.rite_override || entry.riteName || '';
        const notes     = rev.sorc_notes     || entry.description || '';
        const label     = riteName || entry.label;
        await addStAction(entry.subId, {
          action_type: 'sorcery',
          label,
          description: notes,
          tradition,
          rite_name: riteName,
        });
        renderProcessingMode(container);
      });
    });
    ```

- [ ] Task 3: Auto-expand the new duplicate entry after creation (AC: 4)
  - [ ] After `addStAction` resolves, the new action is appended as the last item in `sub.st_actions`
  - [ ] Compute the key it will have: `${entry.subId}:st:${sub.st_actions.length - 1}` (after save, length updated)
  - [ ] Add to `procExpandedKeys` before calling `renderProcessingMode`:
    ```js
    const sub = submissions.find(s => s._id === entry.subId);
    const newIdx = (sub.st_actions || []).length - 1; // after addStAction mutates sub.st_actions
    const newKey = `${entry.subId}:st:${newIdx}`;
    procExpandedKeys.add(newKey);
    renderProcessingMode(container);
    ```

- [ ] Task 4: CSS for Duplicate button (AC: 1)
  - [ ] In `public/css/admin-layout.css`, after the `.proc-row-st-badge` style (search for it), add:
    ```css
    .proc-duplicate-btn {
      margin-left: 8px;
      padding: 2px 7px;
      font-size: 11px;
      background: transparent;
      border: 1px solid var(--bdr);
      border-radius: 3px;
      color: var(--txt3);
      cursor: pointer;
      font-family: var(--ft);
      vertical-align: middle;
    }
    .proc-duplicate-btn:hover {
      border-color: var(--gold2);
      color: var(--gold2);
    }
    ```

## Dev Notes

### Source entry unchanged

`addStAction` pushes to `sub.st_actions` — it does not modify the source entry's `st_actions` slot or `sorcery_review`. The duplicate is fully independent once created.

### Tradition / rite precedence

The duplicate inherits what the ST has set (via `rev.sorc_*` fields), not just what the player submitted. If the ST has already corrected the tradition or rite in the source entry, the duplicate inherits the corrected value.

### Key index after addStAction

`addStAction` mutates `sub.st_actions` locally (line 4786: `sub.st_actions = stActions`). After it resolves, `sub.st_actions.length - 1` is the new entry's index.

### Why the player-submitted sorcery entry can also be duplicated

The source entry reads `entry.subId` to find the submission. It doesn't matter whether the source is `source === 'sorcery'` or `source === 'st_created'` — `addStAction(entry.subId, ...)` always appends to `sub.st_actions`, creating a new ST action on the same submission.

### Split workflow (Keeper example)

1. Open Keeper's Rite action (which has all 4 rites in the notes blob)
2. Click Duplicate three times → creates 3 new ST sorcery panels, each with all 4 rites in notes
3. On each duplicate, click Edit → select the specific rite for that slot → Save
4. Original entry handles the 4th rite
5. Roll each independently

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
- `tests/downtime-processing-dt-fixes.spec.js`
- `specs/stories/dts.2.duplicate-action.story.md`
